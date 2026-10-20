import { getModelsForTenant } from "../models/registry.js";
import { getTenantModel as getPlatformTenantModel } from "../models/platform/Tenant.js";

// Hours between recurring runs — matches Source.frequency's two allowed values.
export const FREQUENCY_HOURS = { daily: 24, weekly: 24 * 7 };

// Rev 5 §9.3 — "what counts as due" lives in Node, next to the Source
// schema. Used by Python's poll (GET /api/admin/internal/sources-due) and by
// the scheduler, which only wakes Python when something is actually due.
// Loops every active tenant so Python never needs platform/DB access.
export async function findDueSources(now = Date.now()) {
  const Tenant = getPlatformTenantModel();
  const tenants = await Tenant.find({ status: "active" });
  const due = [];

  for (const tenant of tenants) {
    const models = getModelsForTenant(tenant);
    const sources = await models.Source.find({ status: "active", frequency: { $ne: null } });
    for (const source of sources) {
      const hours = FREQUENCY_HOURS[source.frequency];
      const isDue = !source.lastRun || now - source.lastRun.getTime() >= hours * 60 * 60 * 1000;
      if (isDue) {
        due.push({ tenantSlug: tenant.slug, sourceId: source._id.toString(), url: source.url, type: source.type });
      }
    }
  }

  return due;
}
