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

export const getContentSourceStatus = async (req, res) => {
  res.json({ success: true, contentSource: req.tenant.contentSource });
};

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

    if (tenant.contentSource?.status === "running") {
      return res.status(409).json({ success: false, message: "A scrape is already running for this university" });
    }

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
    };
    await tenant.save();
    invalidateTenantCache();

    // Deliberately not awaited — Python's own /internal/scrape-site endpoint
    // responds 202 immediately and does the real work as a background task,
    // reporting back later. A network error firing the request itself
    // (rare — Python being down) is still caught so it doesn't crash Node.
    fetch(`${PYTHON_BACKEND_URL}/internal/scrape-site`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET || "" },
      body: JSON.stringify({
        tenant_slug: tenant.slug,
        sitemap_url: sitemapUrl,
        allowed_domain: tenant.contentSource.allowedDomain,
        base_url: baseUrl,
      }),
    }).catch((error) => console.error("triggerContentScrape: failed to reach Python:", error.message));

    res.status(202).json({ success: true, contentSource: tenant.contentSource });
  } catch (error) {
    console.error("triggerContentScrape error:", error);
    res.status(500).json({ success: false, message: "Failed to start scrape" });
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
