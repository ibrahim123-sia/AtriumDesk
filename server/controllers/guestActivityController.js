// Guest-facing read side of admin-managed Activity tabs (Sports, Societies,
// etc.) — same no-req.models/req.tenant situation as guestListingController.js,
// resolved the same way.
import { getModelsForTenant } from "../models/registry.js";
import { resolveTenantBySlug, DEFAULT_TENANT_SLUG } from "../services/tenantRegistry.js";

const resolveActiveTenant = async (req) => {
  const tenant = await resolveTenantBySlug(req.query.tenant || DEFAULT_TENANT_SLUG);
  if (!tenant || tenant.status !== "active") return null;
  return tenant;
};

// Minimal fields only — this powers the sidebar nav list, not the page itself.
export const listGuestActivityTabs = async (req, res) => {
  try {
    const tenant = await resolveActiveTenant(req);
    if (!tenant) return res.status(404).json({ success: false, message: "Unknown university" });

    const models = getModelsForTenant(tenant);
    const tabs = await models.ActivityTab.find({ isPublished: true })
      .select("title slug icon order")
      .sort({ order: 1, createdAt: 1 });
    res.json({ success: true, tabs });
  } catch (error) {
    console.error("listGuestActivityTabs error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load activity tabs" });
  }
};

export const getGuestActivityTab = async (req, res) => {
  try {
    const tenant = await resolveActiveTenant(req);
    if (!tenant) return res.status(404).json({ success: false, message: "Unknown university" });

    const models = getModelsForTenant(tenant);
    const tab = await models.ActivityTab.findOne({ slug: req.params.slug, isPublished: true });
    if (!tab) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, tab });
  } catch (error) {
    console.error("getGuestActivityTab error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load activity tab" });
  }
};
