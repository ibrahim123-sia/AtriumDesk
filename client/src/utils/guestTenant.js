// Which university a guest (no login, so no JWT tenant claim) is talking to.
// A university's own link — https://<app>/?u=<slug>, or the website widget's
// /embed?u=<slug> — picks it; it's remembered so later visits stay on it.
// Without one, the server uses the platform's default university.
const KEY = "guestTenant";
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

const read = () => {
  try {
    return localStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
};

// Reads ?u= from the address once, at startup. Switching universities also
// drops the previous guest session (it belongs to the other one).
export const captureGuestTenant = () => {
  let slug;
  try {
    slug = new URLSearchParams(window.location.search).get("u")?.trim().toLowerCase();
  } catch {
    return;
  }
  if (!slug || !SLUG.test(slug) || slug === read()) return;
  try {
    localStorage.setItem(KEY, slug);
    localStorage.removeItem("guestSessionId");
  } catch {
    /* storage blocked (e.g. a third-party frame) — the default applies */
  }
};

export const guestTenantSlug = read;

// Spread into a guest request's query params or JSON body.
export const guestTenantParams = () => {
  const slug = read();
  return slug ? { tenant: slug } : {};
};
