import { getTenantModel } from "../models/platform/Tenant.js";

// Single home for the guest-path default-tenant policy (guest requests
// carry no JWT, so with no subdomain routing they fall back to the one
// real tenant unless the client sends an explicit `tenant`). Both guest
// controllers import this rather than re-declaring their own copy.
export const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || "maju";

// Small in-memory cache so a hot path (every login, every authenticated
// request) doesn't hit PlatformDB on every single call — the Tenant registry
// is small and rarely changes. 60s TTL: cheap, and a branding/status change
// in the Super Admin portal is visible within a minute, not instantly.
const CACHE_TTL_MS = 60 * 1000;
const bySlug = new Map(); // slug -> { value, expiresAt }
const byDomain = new Map(); // domain -> { value, expiresAt }

const now = () => Date.now();

const getCached = (map, key) => {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < now()) {
    map.delete(key);
    return undefined;
  }
  return hit.value;
};

const setCached = (map, key, value) => {
  map.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
};

export const resolveTenantBySlug = async (slug) => {
  if (!slug) return null;
  const normalized = String(slug).toLowerCase().trim();
  const cached = getCached(bySlug, normalized);
  if (cached !== undefined) return cached;

  const Tenant = getTenantModel();
  const tenant = await Tenant.findOne({ slug: normalized });
  setCached(bySlug, normalized, tenant || null);
  return tenant || null;
};

// A tenant's staffEmailDomainPattern (e.g. "maju.{dept}.edu") produces
// department-scoped domains like "maju.cs.edu" that are never literal
// entries in that same tenant's emailDomains — adminController.js's
// createStaffUser generates exactly these emails. Without matching against
// the pattern too, a staff account can be created but can never resolve a
// tenant to log back in with. `{dept}` becomes a wildcard; everything else
// in the pattern is matched literally.
const staffPatternMatchesDomain = (pattern, domain) => {
  if (!pattern) return false;
  const parts = pattern.split("{dept}").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join("[a-z0-9]+")}$`, "i").test(domain);
};

// Routing only: given the domain part of an email (after "@"), find which
// tenant it belongs to. Indexed, O(1)-ish lookup for the common case — not a
// scan-and-match across every tenant's full validation pattern — with a
// scan-based fallback for the staff-domain-pattern case above, since that
// one can't be indexed (it's a template, not a literal domain).
export const resolveTenantByEmailDomain = async (domain) => {
  if (!domain) return null;
  const normalized = String(domain).toLowerCase().trim();
  const cached = getCached(byDomain, normalized);
  if (cached !== undefined) return cached;

  const Tenant = getTenantModel();
  let tenant = await Tenant.findOne({ emailDomains: normalized });

  if (!tenant) {
    const candidates = await Tenant.find({ staffEmailDomainPattern: { $nin: [null, ""] } });
    tenant = candidates.find((t) => staffPatternMatchesDomain(t.staffEmailDomainPattern, normalized)) || null;
  }

  setCached(byDomain, normalized, tenant || null);
  return tenant || null;
};

// Call after any write to a Tenant document (branding change, status change,
// slug/domain edit) so the next lookup reflects it immediately rather than
// waiting out the TTL.
export const invalidateTenantCache = () => {
  bySlug.clear();
  byDomain.clear();
};
