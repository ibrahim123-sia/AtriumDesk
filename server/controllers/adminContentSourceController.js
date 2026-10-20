// Rev7 SaaS follow-up — self-service chatbot knowledge-base scraping. A
// new tenant's chatbot has zero real content until someone scrapes their
// university's own website; this used to require a developer hand-editing
// python/config.py's WEBSITES list. Now the Administrator triggers it
// themselves from the Data page (client/src/administrator/pages/Data.jsx).
//
// The actual crawl (sitemap -> every page -> chunks -> embeddings) can take
// many minutes for a real university site, so this endpoint only validates
// input, marks the job "running", and fires the Python call WITHOUT
// awaiting it — Python reports back via the same internal-secret webhook
// pattern already used for listing-source scrapes (see
// internalController.js's reportSourceRun).
import fetch from "node-fetch";
import { isSafeUrl } from "../services/urlSafety.js";
import { getTenantModel } from "../models/platform/Tenant.js";
import { invalidateTenantCache } from "../services/tenantRegistry.js";
import { isValidInternalSecret } from "../services/verifyInternalSecret.js";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

// A crawl that never reports back (the AI service restarted, or was put to
// sleep, mid-run) would otherwise leave the status "running" for good and
// block every later scrape with "already running".
const STALE_SCRAPE_MS = 6 * 60 * 60 * 1000;
const isStaleRun = (contentSource) =>
  contentSource?.status === "running" &&
  contentSource.startedAt &&
  Date.now() - new Date(contentSource.startedAt).getTime() > STALE_SCRAPE_MS;

const markScrapeFailed = async (tenantId, message) => {
  try {
    await getTenantModel().updateOne(
      { _id: tenantId, "contentSource.status": "running" },
      { $set: { "contentSource.status": "failed", "contentSource.completedAt": new Date(), "contentSource.error": message } }
    );
    invalidateTenantCache();
  } catch (error) {
    console.error("markScrapeFailed error:", error.message);
  }
};

export const getContentSourceStatus = async (req, res) => {
  const contentSource = req.tenant.contentSource;
  if (isStaleRun(contentSource)) {
    const error = "No result came back from the AI service — the scrape was interrupted. Start it again.";
    await markScrapeFailed(req.tenant._id, error);
    const current = typeof contentSource.toObject === "function" ? contentSource.toObject() : contentSource;
    return res.json({ success: true, contentSource: { ...current, status: "failed", completedAt: new Date(), error } });
  }
  res.json({ success: true, contentSource });
};

// Marks the run "running" and hands the crawl to the AI service. Shared by
// the admin's "Scrape now" and the scheduled refresh (services/scheduler.js).
export async function startContentScrape(tenant, { sitemapUrl, allowedDomain, baseUrl }) {
  tenant.contentSource = {
    sitemapUrl,
    allowedDomain: String(allowedDomain).toLowerCase().trim(),
    baseUrl,
    status: "running",
    startedAt: new Date(),
    completedAt: null,
    pagesScraped: 0,
    chunksCreated: 0,
    error: "",
    refreshDays: tenant.contentSource?.refreshDays || 0,
  };
  await tenant.save();
  invalidateTenantCache();

  // Deliberately not awaited — Python's own /internal/scrape-site endpoint
  // responds 202 immediately and does the real work as a background task,
  // reporting back later. If Python is down or refuses the job, the run is
  // marked failed right away instead of showing "running" forever.
  fetch(`${PYTHON_BACKEND_URL}/internal/scrape-site`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET || "" },
    body: JSON.stringify({
      tenant_slug: tenant.slug,
      sitemap_url: sitemapUrl,
      allowed_domain: tenant.contentSource.allowedDomain,
      base_url: baseUrl,
    }),
    signal: AbortSignal.timeout(60000),
  })
    .then((response) => {
      if (!response.ok) markScrapeFailed(tenant._id, `The AI service refused the scrape (HTTP ${response.status}).`);
    })
    .catch((error) => {
      console.error("startContentScrape: failed to reach Python:", error.message);
      markScrapeFailed(tenant._id, "Couldn't reach the AI service to start the scrape.");
    });
  return tenant.contentSource;
}

export const isScrapeRunning = (contentSource) => contentSource?.status === "running" && !isStaleRun(contentSource);

export const triggerContentScrape = async (req, res) => {
  const { sitemapUrl, allowedDomain, baseUrl } = req.body || {};
  if (!sitemapUrl || !allowedDomain || !baseUrl) {
    return res.status(400).json({ success: false, message: "sitemapUrl, allowedDomain and baseUrl are required" });
  }

  for (const url of [sitemapUrl, baseUrl]) {
    const check = isSafeUrl(url);
    if (!check.safe) return res.status(400).json({ success: false, message: `Unsafe URL: ${check.reason}` });
  }

  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findById(req.tenant._id);
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    if (isScrapeRunning(tenant.contentSource)) {
      return res.status(409).json({ success: false, message: "A scrape is already running for this university" });
    }

    const contentSource = await startContentScrape(tenant, { sitemapUrl, allowedDomain, baseUrl });
    res.status(202).json({ success: true, contentSource });
  } catch (error) {
    console.error("triggerContentScrape error:", error);
    res.status(500).json({ success: false, message: "Failed to start scrape" });
  }
};

// PATCH /api/admin/content-source/schedule { refreshDays: 0 | 7 | 14 | 30 }
export const setContentRefreshSchedule = async (req, res) => {
  const refreshDays = Number(req.body?.refreshDays);
  if (![0, 7, 14, 30].includes(refreshDays)) {
    return res.status(400).json({ success: false, message: "refreshDays must be 0, 7, 14 or 30" });
  }
  try {
    const tenant = await getTenantModel().findById(req.tenant._id);
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });
    if (refreshDays && !tenant.contentSource?.sitemapUrl) {
      return res.status(400).json({ success: false, message: "Run a scrape once first, so the schedule knows which site to refresh" });
    }
    tenant.contentSource.refreshDays = refreshDays;
    await tenant.save();
    invalidateTenantCache();
    res.json({ success: true, contentSource: tenant.contentSource });
  } catch (error) {
    console.error("setContentRefreshSchedule error:", error);
    res.status(500).json({ success: false, message: "Failed to save the schedule" });
  }
};

// Python calls this once the background scrape finishes (success or
// failure) — same internal-secret webhook pattern as reportSourceRun.
export const reportContentScrapeResult = async (req, res) => {
  if (!isValidInternalSecret(req.headers["x-internal-secret"])) {
    return res.status(403).json({ success: false, message: "Internal secret missing or invalid" });
  }

  const { tenant_slug, success, pages_scraped, chunks_created, error } = req.body || {};
  if (!tenant_slug) return res.status(400).json({ success: false, message: "tenant_slug is required" });

  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOne({ slug: tenant_slug });
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    tenant.contentSource.status = success ? "done" : "failed";
    tenant.contentSource.completedAt = new Date();
    tenant.contentSource.pagesScraped = pages_scraped || 0;
    tenant.contentSource.chunksCreated = chunks_created || 0;
    tenant.contentSource.error = success ? "" : String(error || "Unknown error").slice(0, 500);
    await tenant.save();
    invalidateTenantCache();

    res.json({ success: true });
  } catch (error) {
    console.error("reportContentScrapeResult error:", error);
    res.status(500).json({ success: false, message: "Failed to record scrape result" });
  }
};
