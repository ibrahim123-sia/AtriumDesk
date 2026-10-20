/**
 * Rev 5 §9.2/§9.3/§9.4 — sources live in the database; scraping crosses the
 * Node<->Python boundary. Node owns all state/business rules (frequency
 * interpretation, failure counting); Python is a stateless fetch+extract
 * executor. This file is the Node side of both the synchronous ("Scrape
 * Now", admin waiting on screen) and asynchronous (scheduler-driven,
 * server/controllers/internalController.js's sourcesDue/reportSourceRun)
 * paths — both end up calling `performScrape`.
 */

import fetch from "node-fetch";
import { isSafeUrl } from "../services/urlSafety.js";
import { notify } from "../services/notify.js";
import { resolveTenantBySlug } from "../services/tenantRegistry.js";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

const TYPE_MODEL_KEY = { scholarship: "Scholarship", job: "Job", event: "Event" };

// Auto-pause per §9.4: "Auto-pause after 3 consecutive failures and flag to the admin."
const AUTO_PAUSE_THRESHOLD = 3;

/**
 * Applies an already-obtained scrape result (data + hash from Python) to
 * Mongo: creates the pending Listing if the content changed since last run,
 * and updates the Source's health fields. Shared by both the synchronous
 * "Scrape Now" path (this file) and the async scheduler report-back path
 * (server/controllers/internalController.js's reportSourceRun) — the two
 * paths differ only in WHEN/HOW Python's result arrives, not in what Node
 * does with it once it has one.
 *
 * @returns {{ listing: object|null, changed: boolean, merged: boolean }}
 */
export async function applyScrapeResult(models, { type, hash, data, sourceId = null, tenantSlug = null, sourceUrl = null }) {
  // The listing this source already produced (not a revision, not one an
  // admin rejected) — a re-scrape updates that one, never a lookalike.
  const current = sourceId
    ? await models.Listing.findOne({ sourceId, listingType: type, revisionOf: null, status: { $ne: "rejected" } }).sort({
        createdAt: -1,
      })
    : null;

  if (sourceId) {
    const source = await models.Source.findById(sourceId);
    if (source && source.lastHash === hash && current?.status !== "delisted") {
      // Nothing changed since the last successful run — still a success,
      // just no new pending listing.
      source.lastRun = new Date();
      source.consecutiveFailures = 0;
      source.notFoundCount = 0;
      source.entriesPulledLastRun = 0;
      source.status = "active";
      await source.save();
      return { listing: null, changed: false, merged: false };
    }
  }

  let listing;
  let merged = false;
  if (current) {
    // §6.5: "a subsequent scrape that finds the listing again simply
    // restores it" — it's back, with its last reviewed details.
    if (current.status === "delisted") {
      current.status = "approved";
      await current.save();
      await embedListingAsync(tenantSlug, current);
    }
    if (current.contentHash === hash) {
      listing = current;
    } else if (current.status === "pending") {
      // Not reviewed yet: just refresh what the admin will see.
      Object.assign(current, data, { contentHash: hash, lastVerifiedAt: new Date() });
      await current.save();
      listing = current;
    } else {
      // Live (approved or expired): propose the change for review rather
      // than publish an unreviewed extraction (§7.3: "never push unvalidated
      // data live"). One open revision per listing — a newer scrape
      // replaces an unreviewed older one.
      await models.Listing.deleteMany({ revisionOf: current._id, status: "pending" });
      const Model = models[TYPE_MODEL_KEY[type]];
      listing = await Model.create({
        ...data,
        source: "scraped",
        sourceId,
        status: "pending",
        contentHash: hash,
        revisionOf: current._id,
      });
    }
  } else {
    // §8 Layer 2 ingestion-time dedup: "When a new scraped listing is about
    // to be stored, check its embedding against existing approved listings
    // of the same type. Above threshold, merge into the existing record's
    // source list rather than creating a duplicate."
    const duplicate = await findDuplicateListing(tenantSlug, type, data);
    if (duplicate) {
      const existing = await models.Listing.findById(duplicate.listingId);
      if (existing) {
        const entry = {
          sourceId: sourceId || null,
          url: sourceUrl || data.officialLink || "",
          similarityScore: duplicate.score,
          data,
        };
        // A recurring source merged here before: refresh its entry rather
        // than add another one on every change.
        const prior = sourceId ? existing.mergedFrom.find((m) => String(m.sourceId) === String(sourceId)) : null;
        if (prior) Object.assign(prior, entry, { mergedAt: new Date() });
        else existing.mergedFrom.push(entry);
        await existing.save();
        listing = existing;
        merged = true;
      }
    }
    if (!listing) {
      const Model = models[TYPE_MODEL_KEY[type]];
      listing = await Model.create({
        ...data,
        source: "scraped",
        sourceId: sourceId || null,
        status: "pending",
        contentHash: hash,
      });
    }
  }

  if (sourceId) {
    await models.Source.findByIdAndUpdate(sourceId, {
      lastRun: new Date(),
      lastHash: hash,
      consecutiveFailures: 0,
      notFoundCount: 0,
      entriesPulledLastRun: 1,
      status: "active",
    });
  }

  return { listing, changed: true, merged };
}

// §4.5/§10 — "a saved scholarship or job whose details changed." Called when
// a live listing's details change: an approved revision from a re-scrape,
// or an admin edit. Compares only the fields a student would care about.
export const WATCHED_FIELDS = [
  "deadline", "cgpaRequirement", "ieltsRequirement", "toeflRequirement",
  "fundingType", "workMode", "location", "date",
];

export async function notifySavedItemChange(models, tenantSlug, listing, before) {
  const changes = WATCHED_FIELDS
    .filter((field) => field in listing.toObject())
    .map((field) => ({ field, from: before[field], to: listing[field] }))
    .filter(({ from, to }) => String(from ?? "") !== String(to ?? ""));
  if (!changes.length) return;

  const watchers = await models.SavedListing.find({ listingId: listing._id });
  if (!watchers.length) return;

  const tenant = tenantSlug ? await resolveTenantBySlug(tenantSlug) : null;
  const summary = changes.map((c) => `${c.field}: ${c.from ?? "—"} → ${c.to ?? "—"}`).join("; ");
  const path = listing.listingType === "job" ? "jobs" : listing.listingType === "event" ? "events" : "scholarships";

  // One batched user fetch, then concurrent notifies — a popular listing
  // with hundreds of savers must not turn an admin's scrape request into
  // hundreds of sequential Mongo + SMTP round-trips.
  const users = await models.User.find({ _id: { $in: watchers.map((w) => w.userId) } });
  await Promise.allSettled(
    users
      .filter((user) => !user.profile?.notifications?.unsubscribeAll)
      .map((user) =>
        notify(models.Notification, user, {
          type: "listing_saved_change",
          message: `A listing you saved changed: "${listing.title}" (${summary})`,
          link: `/${path}/${listing._id}`,
          emailSubject: `Update on a listing you saved: ${listing.title}`,
          emailHeading: `"${listing.title}" changed`,
          emailBody: `Here's what changed: ${summary}.`,
          branding: tenant?.branding,
          tenantSlug,
          includeUnsubscribeLink: true,
        })
      )
  );
}

/** Calls Python's /listings/check-duplicate. Never throws — a Python-side
 * hiccup here should degrade to "no duplicate found" (create as normal)
 * rather than fail the whole scrape ingestion. */
async function findDuplicateListing(tenantSlug, type, data) {
  if (!tenantSlug) return null;
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/listings/check-duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET || "" },
      body: JSON.stringify({ tenant_slug: tenantSlug, listing_type: type, data }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body.duplicate || null;
  } catch (error) {
    console.error("findDuplicateListing error:", error.message);
    return null;
  }
}

// §8 Layer 2: "computed once when it is approved." Called from
// adminListingController.js's approveListing and createListing (manual
// entries save directly as approved). Fire-and-forget from the caller's
// perspective is NOT used here — embedding failure shouldn't silently
// leave a listing un-embedded with no record of it, so this is awaited,
// but a failure here logs rather than blocking the approval itself.
export async function embedListingAsync(tenantSlug, listing) {
  if (!tenantSlug) return;
  try {
    await fetch(`${PYTHON_BACKEND_URL}/listings/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET || "" },
      body: JSON.stringify({
        tenant_slug: tenantSlug,
        listing_id: listing._id.toString(),
        listing_type: listing.listingType,
        data: listing.toObject(),
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error("embedListingAsync error:", error.message);
  }
}

export async function removeListingEmbedding(tenantSlug, listingId) {
  if (!tenantSlug) return;
  try {
    await fetch(
      `${PYTHON_BACKEND_URL}/listings/embed/${listingId}?tenant_slug=${encodeURIComponent(tenantSlug)}`,
      { method: "DELETE", headers: { "x-internal-secret": INTERNAL_SECRET || "" }, signal: AbortSignal.timeout(15000) }
    );
  } catch (error) {
    console.error("removeListingEmbedding error:", error.message);
  }
}

/**
 * §8 Layer 2 unmerge: "an unmerge action splits a record back into its
 * constituents." Reconstructs the merged-away listing as its own
 * standalone pending record from its snapshotted data, and removes the
 * merge entry from the surviving listing.
 */
export async function unmergeListing(models, listingId, mergeEntryId) {
  const listing = await models.Listing.findById(listingId);
  if (!listing) return { success: false, message: "Listing not found" };
  const entry = listing.mergedFrom.id(mergeEntryId);
  if (!entry) return { success: false, message: "Merge entry not found" };

  const Model = models[TYPE_MODEL_KEY[listing.listingType]];
  const restored = await Model.create({
    ...entry.data,
    source: "scraped",
    sourceId: entry.sourceId || null,
    status: "pending",
  });

  listing.mergedFrom.pull(mergeEntryId);
  await listing.save();

  return { success: true, restored, listing };
}

// §7.4 delisting detection — called only on a CONFIRMED "page gone" (HTTP
// 404/410) result, never a generic failure. Requires two consecutive
// confirmations before marking delisted, per the spec's own guard against
// false positives from transient rendering blips.
export async function recordListingGone(models, sourceId, tenantSlug = null) {
  // Atomic $inc, not read-then-write — this is called from a Python
  // webhook per scrape attempt, and two reports racing (retry, overlapping
  // cron tick) used to both read the same starting count and lose one
  // increment, delaying delisting detection past the intended 2-confirmation
  // threshold. lastRun records the attempt, so the source waits a full
  // cycle before the confirming check (and isn't due again every poll).
  const source = await models.Source.findByIdAndUpdate(
    sourceId,
    { $inc: { notFoundCount: 1 }, $set: { lastRun: new Date() } },
    { new: true }
  );
  if (!source) return;
  if (source.notFoundCount >= 2) {
    const gone = await models.Listing.find({ sourceId, status: { $in: ["approved", "pending"] } }).select("_id title listingType");
    if (!gone.length) return;
    await models.Listing.updateMany({ _id: { $in: gone.map((l) => l._id) } }, { $set: { status: "delisted" } });
    await Promise.all(gone.map((l) => removeListingEmbedding(tenantSlug, l._id)));
    await notifySaversListingClosed(models, tenantSlug, gone, "was removed from its source");
  }
}

// §6.5: "Saved item expires or is delisted -> one notification ('this
// closed'), the item stays in their saved list with a badge." In-app only,
// and only for savers who hadn't applied yet.
export async function notifySaversListingClosed(models, tenantSlug, listings, why) {
  if (!listings.length) return;
  const byId = new Map(listings.map((l) => [String(l._id), l]));
  const savers = await models.SavedListing.find({
    listingId: { $in: listings.map((l) => l._id) },
    status: { $in: [null, "saved", "preparing"] },
  });
  if (!savers.length) return;
  await models.Notification.insertMany(
    savers.map((s) => {
      const listing = byId.get(String(s.listingId));
      const path = listing.listingType === "job" ? "jobs" : listing.listingType === "event" ? "events" : "scholarships";
      return {
        userId: s.userId,
        type: "listing_saved_change",
        message: `"${listing.title}" ${why}`,
        link: `/${path}/${listing._id}`,
      };
    })
  ).catch((error) => console.error("notifySaversListingClosed failed:", error.message));
}

/**
 * Calls Python's /scrape endpoint synchronously and applies the result.
 * Used by the "Scrape Now" (admin waiting on screen) path only — the
 * scheduler-driven recurring path has Python call this same underlying
 * scrape logic itself and report the outcome back (see
 * internalController.js's reportSourceRun), rather than Node calling out.
 *
 * @returns {{ listing: object|null, changed: boolean, error: string|null }}
 */
export async function performScrape(models, { url, type, sourceId = null, tenantSlug = null }) {
  const safety = isSafeUrl(url);
  if (!safety.safe) {
    return { listing: null, changed: false, error: `Unsafe URL: ${safety.reason}` };
  }

  let scraped;
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET || "" },
      body: JSON.stringify({ url, type }),
      // A JS-rendered page can take a while to crawl.
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { listing: null, changed: false, error: `Scrape failed (${response.status}): ${detail.slice(0, 300)}` };
    }
    scraped = await response.json();
  } catch (error) {
    return { listing: null, changed: false, error: `Could not reach scraper: ${error.message}` };
  }

  const { listing, changed, merged } = await applyScrapeResult(models, {
    type, hash: scraped.hash, data: scraped.data, sourceId, tenantSlug, sourceUrl: url,
  });
  return { listing, changed, merged, error: null };
}

/** Records a failed scrape attempt against a Source, auto-pausing at the threshold. */
export async function recordScrapeFailure(models, sourceId) {
  // Atomic $inc, same reasoning as recordListingGone above — two racing
  // failure reports for the same source used to both read the same
  // starting count and lose one increment, delaying (or masking) the
  // auto-pause threshold.
  // lastRun records the attempt too: a failing source retries next cycle,
  // not at every poll (which also auto-paused it within the hour).
  const source = await models.Source.findByIdAndUpdate(
    sourceId,
    { $inc: { consecutiveFailures: 1 }, $set: { lastRun: new Date() } },
    { new: true }
  );
  if (!source) return;
  if (source.consecutiveFailures >= AUTO_PAUSE_THRESHOLD && source.status !== "failing") {
    await models.Source.updateOne({ _id: sourceId }, { $set: { status: "failing" } });
  }
}

export const listSources = async (req, res) => {
  try {
    const sources = await req.models.Source.find({}).sort({ createdAt: -1 });
    res.json({ success: true, sources });
  } catch (error) {
    console.error("listSources error:", error);
    res.status(500).json({ success: false, message: "Failed to load sources" });
  }
};

// Creates the Source row; one-time sources (frequency=null) also trigger an
// immediate synchronous scrape before responding (§9.4's "Scraping…" loading
// state); recurring sources just save — the scheduler picks them up.
export const createSource = async (req, res) => {
  const { url, type, name, frequency } = req.body;
  if (!url || !type || !name || !TYPE_MODEL_KEY[type]) {
    return res.status(400).json({ success: false, message: "url, type and name are required" });
  }
  const safety = isSafeUrl(url);
  if (!safety.safe) {
    return res.status(400).json({ success: false, message: `Unsafe URL: ${safety.reason}` });
  }
  try {
    const source = await req.models.Source.create({
      url, type, name,
      frequency: frequency || null,
    });

    if (!frequency) {
      const result = await performScrape(req.models, { url, type, sourceId: source._id, tenantSlug: req.tenant?.slug });
      if (result.error) {
        await recordScrapeFailure(req.models, source._id);
        const freshSource = await req.models.Source.findById(source._id);
        return res.status(502).json({ success: false, message: result.error, source: freshSource });
      }
      const freshSource = await req.models.Source.findById(source._id);
      return res.status(201).json({ success: true, source: freshSource, listing: result.listing });
    }

    res.status(201).json({ success: true, source });
  } catch (error) {
    console.error("createSource error:", error);
    res.status(500).json({ success: false, message: "Failed to create source" });
  }
};

export const runSourceNow = async (req, res) => {
  try {
    const source = await req.models.Source.findById(req.params.id);
    if (!source) return res.status(404).json({ success: false, message: "Source not found" });
    const result = await performScrape(req.models, { url: source.url, type: source.type, sourceId: source._id, tenantSlug: req.tenant?.slug });
    if (result.error) {
      await recordScrapeFailure(req.models, source._id);
      return res.status(502).json({ success: false, message: result.error });
    }
    res.json({ success: true, listing: result.listing, changed: result.changed });
  } catch (error) {
    console.error("runSourceNow error:", error);
    res.status(500).json({ success: false, message: "Failed to run source" });
  }
};

export const pauseSource = async (req, res) => {
  try {
    const source = await req.models.Source.findByIdAndUpdate(req.params.id, { status: "paused" }, { new: true });
    if (!source) return res.status(404).json({ success: false, message: "Source not found" });
    res.json({ success: true, source });
  } catch (error) {
    console.error("pauseSource error:", error);
    res.status(500).json({ success: false, message: "Failed to pause source" });
  }
};

export const resumeSource = async (req, res) => {
  try {
    const source = await req.models.Source.findByIdAndUpdate(
      req.params.id,
      { status: "active", consecutiveFailures: 0 },
      { new: true }
    );
    if (!source) return res.status(404).json({ success: false, message: "Source not found" });
    res.json({ success: true, source });
  } catch (error) {
    console.error("resumeSource error:", error);
    res.status(500).json({ success: false, message: "Failed to resume source" });
  }
};

export const deleteSource = async (req, res) => {
  try {
    const source = await req.models.Source.findByIdAndDelete(req.params.id);
    if (!source) return res.status(404).json({ success: false, message: "Source not found" });
    res.json({ success: true, message: "Source deleted" });
  } catch (error) {
    console.error("deleteSource error:", error);
    res.status(500).json({ success: false, message: "Failed to delete source" });
  }
};
