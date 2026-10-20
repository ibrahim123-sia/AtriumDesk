/**
 * Rev 5 §9.1 — "one admin panel, three tabs, same shape... Build one
 * generic component and one generic slice parameterized by type, rather
 * than three near-identical copies... A single generic GET
 * /api/admin/listings?type=... route mirrors this server-side."
 *
 * All handlers here operate on req.models.Listing (the base discriminator
 * model) for reads/updates/deletes — Mongoose returns the correctly-typed
 * sub-document based on each row's own `listingType` regardless of which
 * model queried it. Only CREATE needs the type-specific model, since that's
 * what applies the scholarship/job/event field validation.
 */

import {
  embedListingAsync,
  removeListingEmbedding,
  unmergeListing,
  notifySavedItemChange,
} from "./adminSourceController.js";
import { startOfToday } from "../services/dates.js";

const TYPE_MODEL_KEY = { scholarship: "Scholarship", job: "Job", event: "Event" };

const modelForType = (models, type) => models[TYPE_MODEL_KEY[type]];

// Only approved listings are embedded (matching, dedup and the chatbot's
// listing answers all read the embeddings), so every status change keeps
// the embedding in step.
const syncEmbedding = (tenantSlug, listing) =>
  listing.status === "approved" ? embedListingAsync(tenantSlug, listing) : removeListingEmbedding(tenantSlug, listing._id);

// Fields a revision never copies onto the live listing.
const NON_CONTENT_FIELDS = new Set([
  "_id", "__v", "id", "status", "approvedAt", "rejectionReason", "source", "sourceId",
  "revisionOf", "mergedFrom", "createdAt", "updatedAt", "listingType",
]);

export const listListings = async (req, res) => {
  const { type, status } = req.query;
  if (!type || !TYPE_MODEL_KEY[type]) {
    return res.status(400).json({ success: false, message: `type must be one of: ${Object.keys(TYPE_MODEL_KEY).join(", ")}` });
  }
  try {
    const filter = { listingType: type };
    if (status) filter.status = status;
    const listings = await req.models.Listing.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, listings });
  } catch (error) {
    console.error("listListings error:", error);
    res.status(500).json({ success: false, message: "Failed to load listings" });
  }
};

export const getListing = async (req, res) => {
  try {
    const listing = await req.models.Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });
    // A revision comes with the live listing it would update, so the
    // review drawer can show what changes.
    const original = listing.revisionOf ? await req.models.Listing.findById(listing.revisionOf) : null;
    res.json({ success: true, listing, original });
  } catch (error) {
    console.error("getListing error:", error);
    res.status(500).json({ success: false, message: "Failed to load listing" });
  }
};

// "Add Manually" — §9.1: "saving directly as status=approved".
export const createListing = async (req, res) => {
  const { type, ...fields } = req.body;
  if (!type || !TYPE_MODEL_KEY[type]) {
    return res.status(400).json({ success: false, message: `type must be one of: ${Object.keys(TYPE_MODEL_KEY).join(", ")}` });
  }
  const Model = modelForType(req.models, type);
  try {
    const listing = await Model.create({ ...fields, source: "manual", status: "approved", approvedAt: new Date() });
    await embedListingAsync(req.tenant?.slug, listing);
    res.status(201).json({ success: true, listing });
  } catch (error) {
    console.error("createListing error:", error);
    res.status(400).json({ success: false, message: error.message || "Failed to create listing" });
  }
};

export const updateListing = async (req, res) => {
  try {
    const listing = await req.models.Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });
    const { status, rejectionReason, ...fields } = req.body;
    const before = listing.toObject();
    Object.assign(listing, fields);
    if (status !== undefined) {
      if (status === "approved" && listing.status !== "approved") listing.approvedAt = new Date();
      listing.status = status;
    }
    if (rejectionReason !== undefined) listing.rejectionReason = rejectionReason;
    await listing.save();
    await syncEmbedding(req.tenant?.slug, listing);
    // An admin correcting a live listing (say, a deadline) is a change its
    // savers should hear about too.
    if (listing.status === "approved" && before.status === "approved") {
      await notifySavedItemChange(req.models, req.tenant?.slug, listing, before);
    }
    res.json({ success: true, listing });
  } catch (error) {
    console.error("updateListing error:", error);
    res.status(400).json({ success: false, message: error.message || "Failed to update listing" });
  }
};

// Approving a revision publishes it onto the live listing it updates (same
// id, savers and merges kept; savers told what changed) and removes the
// revision document.
async function applyRevision(req, revision) {
  const original = await req.models.Listing.findById(revision.revisionOf);
  if (!original) return null;
  const before = original.toObject();
  for (const [key, value] of Object.entries(revision.toObject())) {
    if (!NON_CONTENT_FIELDS.has(key)) original.set(key, value);
  }
  // A new cycle (deadline moved into the future) brings an expired
  // listing back; a deadline already past keeps it expired.
  const lapsed = original.deadline && original.deadline < startOfToday();
  original.status = lapsed && original.listingType !== "event" ? "expired" : "approved";
  original.approvedAt = new Date();
  original.lastVerifiedAt = new Date();
  await original.save();
  await revision.deleteOne();
  await syncEmbedding(req.tenant?.slug, original);
  await notifySavedItemChange(req.models, req.tenant?.slug, original, before);
  return original;
}

export const approveListing = async (req, res) => {
  try {
    const pending = await req.models.Listing.findById(req.params.id);
    if (!pending) return res.status(404).json({ success: false, message: "Listing not found" });
    if (pending.revisionOf) {
      const updated = await applyRevision(req, pending);
      if (updated) return res.json({ success: true, listing: updated, appliedRevision: true });
      // The listing it revised is gone — publish it as a listing of its own.
      pending.revisionOf = null;
    }
    pending.status = "approved";
    pending.rejectionReason = "";
    pending.approvedAt = new Date();
    await pending.save();
    const listing = pending;
    await embedListingAsync(req.tenant?.slug, listing);
    res.json({ success: true, listing });
  } catch (error) {
    console.error("approveListing error:", error);
    res.status(500).json({ success: false, message: "Failed to approve listing" });
  }
};

export const rejectListing = async (req, res) => {
  const { reason } = req.body;
  try {
    const listing = await req.models.Listing.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", rejectionReason: reason || "" },
      { new: true }
    );
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });
    await removeListingEmbedding(req.tenant?.slug, listing._id);
    res.json({ success: true, listing });
  } catch (error) {
    console.error("rejectListing error:", error);
    res.status(500).json({ success: false, message: "Failed to reject listing" });
  }
};

export const deleteListing = async (req, res) => {
  try {
    const listing = await req.models.Listing.findByIdAndDelete(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found" });
    await removeListingEmbedding(req.tenant?.slug, req.params.id);
    if (listing.listingType === "event") {
      // Anyone holding a place for an upcoming event is told it's off.
      const holders = await req.models.EventRsvp.find({ eventId: listing._id, status: { $in: ["going", "waitlist"] } }).select("userId");
      if (holders.length && listing.date >= startOfToday()) {
        await req.models.Notification.insertMany(
          holders.map((h) => ({ userId: h.userId, type: "listing_saved_change", message: `"${listing.title}" has been cancelled`, link: "/events" }))
        ).catch((error) => console.error("deleteListing: RSVP notice failed:", error.message));
      }
      await req.models.EventRsvp.deleteMany({ eventId: listing._id });
    }
    res.json({ success: true, message: "Listing deleted" });
  } catch (error) {
    console.error("deleteListing error:", error);
    res.status(500).json({ success: false, message: "Failed to delete listing" });
  }
};

// §8 Layer 2 unmerge — reconstructs a mergedFrom snapshot as its own
// standalone pending listing, for when an admin decides two scraped
// listings were wrongly merged as duplicates.
export const unmergeListingHandler = async (req, res) => {
  try {
    const result = await unmergeListing(req.models, req.params.id, req.params.mergeEntryId);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (error) {
    console.error("unmergeListing error:", error);
    res.status(400).json({ success: false, message: error.message || "Failed to unmerge listing" });
  }
};
