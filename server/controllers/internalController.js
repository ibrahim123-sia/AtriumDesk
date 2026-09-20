import { getModelsForTenant } from "../models/registry.js";
import { resolveTenantBySlug } from "../services/tenantRegistry.js";
import { getTenantModel as getPlatformTenantModel } from "../models/platform/Tenant.js";
import { applyScrapeResult, recordScrapeFailure, recordListingGone } from "./adminSourceController.js";
import { isValidInternalSecret } from "../services/verifyInternalSecret.js";

// Hours between recurring runs — matches Source.frequency's two allowed values.
const FREQUENCY_HOURS = { daily: 24, weekly: 24 * 7 };

const requireInternal = (req) => isValidInternalSecret(req.headers["x-internal-secret"]);

export const verifyAdmin = async (req, res) => {
  // Header check first — Python supplies it, raw clients won't.
  if (!requireInternal(req)) {
    return res.status(403).json({ success: false, message: "Internal secret missing or invalid" });
  }
  // Auth header carries the JWT, which `protect` already validated upstream.
  // Gates every /chunks (knowledge-base) endpoint in python/api.py — staff
  // granted the "data" permission get the same access an Administrator has
  // here, per the delegation model in adminRoutes.js.
  const isAuthorized = req.user && (req.user.role === "admin" || (req.user.role === "staff" && req.user.staffPermissions?.data));
  if (!isAuthorized) {
    return res.status(403).json({ success: false, message: "Not authorized for the knowledge base" });
  }
  res.json({
    success: true,
    user: { id: req.user._id, email: req.user.email, role: req.user.role },
  });
};

// Unlike verifyAdmin, this route never runs `protect` — Python's moderation
// check calls it with the internal-secret header only, no user JWT. So it
// resolves its own tenant from an explicit `tenant_slug` field in the body
// (threaded from Python's /ask flow, see python/rag.py's tenant-scoped
// moderation path) rather than relying on req.models being already attached.
export const flagUser = async (req, res) => {
  if (!requireInternal(req)) {
    return res.status(403).json({ success: false, message: "Internal secret missing or invalid" });
  }
  const { userId, message, matches, chatId, tenant_slug } = req.body || {};
  if (!userId || !message || !tenant_slug) {
    return res.status(400).json({ success: false, message: "userId, message and tenant_slug are required" });
  }
  try {
    const tenant = await resolveTenantBySlug(tenant_slug);
    if (!tenant || tenant.status !== "active") {
      return res.status(400).json({ success: false, message: "Unknown or inactive tenant" });
    }
    const models = getModelsForTenant(tenant);

    const user = await models.User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.flags = user.flags || [];
    user.flags.push({
      type: "inappropriate_language",
      message: String(message).slice(0, 500),
      matches: Array.isArray(matches) ? matches.slice(0, 20) : [],
      chatId: chatId || null,
      timestamp: new Date(),
    });
    await user.save();

    // Notify all admins (in this tenant only)
    const admins = await models.User.find({ role: "admin" }).select("_id email");
    if (admins.length) {
      const docs = admins.map((a) => ({
        userId: a._id,
        type: "user_flagged",
        message: `${user.name} flagged for inappropriate language`,
        link: `/admin/users`,
        issueId: null,
      }));
      await models.Notification.insertMany(docs);
    }

    res.json({ success: true, flagCount: user.flags.length });
  } catch (error) {
    console.error("flagUser error:", error);
    res.status(500).json({ success: false, message: "Failed to flag user" });
  }
};

// ---------------------------------------------------------------------------
// Rev 5 §9.3 — recurring-source scheduling. Python's own scheduler wakes on
// an interval and asks Node "what's due" (frequency interpretation stays in
// Node, next to the schema); Node loops every active tenant itself so
// Python's scheduler doesn't need direct DB/platform access.
// ---------------------------------------------------------------------------

export const sourcesDue = async (req, res) => {
  if (!requireInternal(req)) {
    return res.status(403).json({ success: false, message: "Internal secret missing or invalid" });
  }
  try {
    const Tenant = getPlatformTenantModel();
    const tenants = await Tenant.find({ status: "active" });
    const due = [];

    for (const tenant of tenants) {
      const models = getModelsForTenant(tenant);
      const sources = await models.Source.find({ status: "active", frequency: { $ne: null } });
      const now = Date.now();
      for (const source of sources) {
        const hours = FREQUENCY_HOURS[source.frequency];
        const isDue = !source.lastRun || now - source.lastRun.getTime() >= hours * 60 * 60 * 1000;
        if (isDue) {
          due.push({ tenantSlug: tenant.slug, sourceId: source._id.toString(), url: source.url, type: source.type });
        }
      }
    }

    res.json({ success: true, due });
  } catch (error) {
    console.error("sourcesDue error:", error);
    res.status(500).json({ success: false, message: "Failed to compute due sources" });
  }
};

// Python calls this once per source after attempting a scrape — success or
// failure. Webhook-style POST, same internal-secret pattern as flagUser.
export const reportSourceRun = async (req, res) => {
  if (!requireInternal(req)) {
    return res.status(403).json({ success: false, message: "Internal secret missing or invalid" });
  }
  const { tenant_slug, success, hash, data, type, reason, error: scrapeError } = req.body || {};
  const { sourceId } = req.params;
  if (!tenant_slug || !sourceId) {
    return res.status(400).json({ success: false, message: "tenant_slug and sourceId are required" });
  }
  try {
    const tenant = await resolveTenantBySlug(tenant_slug);
    if (!tenant || tenant.status !== "active") {
      return res.status(400).json({ success: false, message: "Unknown or inactive tenant" });
    }
    const models = getModelsForTenant(tenant);

    if (!success) {
      if (reason === "not_found") {
        // §7.4 delisting signal — tracked separately from a generic
        // failure; recordListingGone requires 2 consecutive confirmations.
        await recordListingGone(models, sourceId);
        return res.json({ success: true, applied: "not_found" });
      }
      await recordScrapeFailure(models, sourceId);
      return res.json({ success: true, applied: "failure" });
    }

    const result = await applyScrapeResult(models, { type, hash, data, sourceId, tenantSlug: tenant_slug });
    res.json({ success: true, applied: "result", changed: result.changed });
  } catch (error) {
    console.error("reportSourceRun error:", error);
    res.status(500).json({ success: false, message: "Failed to record source run" });
  }
};
