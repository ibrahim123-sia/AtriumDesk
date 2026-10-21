// What search engines may show, in one place. Used in the browser by
// components/RouteMeta.jsx (each page's title, description and robots tag)
// and at build time by vite-plugin-seo.js (robots.txt, sitemap.xml) — so it
// must stay plain JavaScript with no browser or Vite-only APIs.

export const SITE_NAME = "AtriumDesk";

export const DEFAULT_TITLE = "AtriumDesk — AI Student Assistant & Help Desk for Universities";

export const DEFAULT_DESCRIPTION =
  "An AI assistant that answers admissions, fee and programme questions from a university's own website, plus a student help desk, scholarships, jobs and events.";

// The robots tag on a public page; anything else gets "noindex".
export const INDEXABLE = "index, follow, max-image-preview:large";

const at = (university) => (university ? ` at ${university}` : "");

// Pages anyone can open, by path. Each gets the university's short name when
// one is known (signed-in users), and is listed in sitemap.xml.
export const PUBLIC_PAGES = {
  "/": (university) =>
    university
      ? {
          title: `${university} Admissions Assistant | ${SITE_NAME}`,
          description: `Ask ${university}'s AI assistant about admissions, programmes, fees and scholarships, and see what's on around campus.`,
        }
      : { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  "/guest/scholarships": (university) => ({
    title: `Scholarships${at(university)} | ${SITE_NAME}`,
    description: `The university's own scholarships${at(university)}: merit, need-based and other awards, who can apply and how much they cover.`,
  }),
  "/register": () => ({
    title: `Create a Student Account | ${SITE_NAME}`,
    description:
      "Sign up with your university email to chat with the assistant, raise issues with departments and get matched to scholarships, jobs and events.",
  }),
  "/login": () => ({
    title: `Log In | ${SITE_NAME}`,
    description: "Log in to your AtriumDesk student, staff or administrator account.",
  }),
  "/privacy": () => ({
    title: `Privacy Policy | ${SITE_NAME}`,
    description: "What AtriumDesk collects, how it is used, who can see it, and how to download or delete your data.",
  }),
  "/terms": () => ({
    title: `Terms of Service | ${SITE_NAME}`,
    description: "The rules for using AtriumDesk: eligibility, acceptable use, the AI assistant's accuracy and account suspension.",
  }),
};

// /guest/activities/:slug — public too, but one per university tab, so not in the sitemap.
const activityPage = (university) => ({
  title: `Campus Life${at(university)} | ${SITE_NAME}`,
  description: `Sports, societies and student life${at(university)}.`,
});

// Public pages whose content depends on the university picked with ?u=<slug>.
const PER_UNIVERSITY = ["/", "/guest/scholarships"];

const normalise = (pathname) => (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname);

// { title, description, canonicalPath } for a public page, or null for a page
// that needs a login (or shouldn't be indexed, like /embed).
export const publicPageMeta = (pathname, search, university) => {
  const path = normalise(pathname);
  const isActivity = path.startsWith("/guest/activities/");
  const page = PUBLIC_PAGES[path] || (isActivity && activityPage);
  if (!page) return null;
  const slug = new URLSearchParams(search).get("u");
  const keepSlug = slug && (isActivity || PER_UNIVERSITY.includes(path));
  return { ...page(university), canonicalPath: keepSlug ? `${path}?u=${encodeURIComponent(slug)}` : path };
};

// Signed-in areas. They only redirect to /login for a crawler, so robots.txt
// keeps crawlers out of them. Paths match by prefix, so "/scholarships" does
// not cover "/guest/scholarships".
export const CRAWL_BLOCKED = [
  "/admin",
  "/staff",
  "/platform",
  "/chat",
  "/jobs",
  "/events",
  "/scholarships",
  "/issues",
  "/saved",
  "/queue",
  "/profile",
];
