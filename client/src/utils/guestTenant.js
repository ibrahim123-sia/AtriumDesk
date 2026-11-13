// Which university a guest (no login, so no JWT tenant claim) is talking to.
// A university's own link — https://<app>/?u=<slug>, or the website widget's
// /embed?u=<slug> — picks it; it's remembered so later visits stay on it.
// Without one, "/" asks the visitor to choose (guest/UniversityPicker.jsx).
const KEY = "guestTenant";
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

const fromAddress = () => {
  try {
    const slug = new URLSearchParams(window.location.search).get("u")?.trim().toLowerCase();
    return slug && SLUG.test(slug) ? slug : undefined;
  } catch {
    return undefined;
  }
};

const stored = () => {
  try {
    return localStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
};

// Storage can be blocked (private mode, a third-party frame); the ?u= in the
// address still says which university this page is for.
const read = () => stored() || fromAddress();

// Reads ?u= from the address once, at startup. Switching universities also
// drops the previous guest session (it belongs to the other one).
export const captureGuestTenant = () => {
  let slug;
  try {
    slug = new URLSearchParams(window.location.search).get("u")?.trim().toLowerCase();
  } catch {
    return;
  }
  if (!slug || !SLUG.test(slug) || slug === stored()) return;
  try {
    localStorage.setItem(KEY, slug);
    localStorage.removeItem("guestSessionId");
  } catch {
    /* storage blocked (e.g. a third-party frame) — the default applies */
  }
};

export const guestTenantSlug = read;

// A visitor picked a university on the landing page.
export const chooseGuestTenant = (slug) => {
  if (!SLUG.test(slug || "") || slug === stored()) return;
  try {
    localStorage.setItem(KEY, slug);
    localStorage.removeItem("guestSessionId");
  } catch {
    /* storage blocked — the choice still holds for this page via ?u= */
  }
};

// Back to the university picker ("Change university", or a link to a
// university that isn't available).
export const forgetGuestTenant = () => {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("guestSessionId");
  } catch {
    /* nothing stored */
  }
};

// Spread into a guest request's query params or JSON body.
export const guestTenantParams = () => {
  const slug = read();
  return slug ? { tenant: slug } : {};
};
