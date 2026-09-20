/**
 * Rev5 §19.2 — what a guest sees, browse-only (no matched feed — matching
 * needs a profile, a guest has none): MAJU's own (scope:"internal")
 * scholarships, plus campus events (already internal by nature). No jobs,
 * no external scholarships — those point a prospective applicant away from
 * MAJU, which works against an admissions-funnel landing page's purpose.
 *
 * Guests have no JWT, so there is no `req.models`/`req.tenant` the way
 * authenticated routes get them — resolved here the same way
 * guestChatController.js's logIfFailedQuestion does.
 */
import { getModelsForTenant } from "../models/registry.js";
import { resolveTenantBySlug, DEFAULT_TENANT_SLUG } from "../services/tenantRegistry.js";

export const getGuestListings = async (req, res) => {
  try {
    const tenant = await resolveTenantBySlug(req.query.tenant || DEFAULT_TENANT_SLUG);
    // Suspended tenants must not keep serving unauthenticated traffic —
    // same gate protect() applies for authenticated routes.
    if (!tenant || tenant.status !== "active") {
      return res.status(404).json({ success: false, message: "Unknown university" });
    }

    const models = getModelsForTenant(tenant);

    const [scholarships, events] = await Promise.all([
      models.Listing.find({ listingType: "scholarship", status: "approved", scope: "internal" })
        .sort({ deadline: 1 })
        .limit(25),
      models.Listing.find({ listingType: "event", status: "approved", date: { $gte: new Date() } })
        .sort({ date: 1 })
        .limit(25),
    ]);

    res.json({ success: true, scholarships, events });
  } catch (error) {
    console.error("getGuestListings error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load listings" });
  }
};
