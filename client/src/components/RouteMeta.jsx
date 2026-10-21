import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { DEFAULT_DESCRIPTION, INDEXABLE, SITE_NAME, publicPageMeta } from "../utils/seo";

// The web client's public address (set at build time); the current origin
// otherwise, e.g. in development.
const SITE_URL = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/+$/, "");

const headTag = (selector, tag, attrs) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(tag);
    Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, value));
    document.head.appendChild(el);
  }
  return el;
};

// Title, description and search-engine hints for the page being shown.
// Public pages get their own wording and a canonical link; pages behind a
// login, /embed and /unsubscribe are marked noindex. The page title also
// carries the signed-in user's university.
const RouteMeta = () => {
  const { pathname, search } = useLocation();
  const branding = useSelector((s) => s.tenant.branding);
  const university = branding?.universityShort || branding?.universityName;

  useEffect(() => {
    const page = publicPageMeta(pathname, search, university);
    document.title = page?.title || (university ? `${university} — ${SITE_NAME}` : SITE_NAME);
    headTag('meta[name="description"]', "meta", { name: "description" }).setAttribute(
      "content",
      page?.description || DEFAULT_DESCRIPTION,
    );
    headTag('meta[name="robots"]', "meta", { name: "robots" }).setAttribute("content", page ? INDEXABLE : "noindex");
    if (page) {
      headTag('link[rel="canonical"]', "link", { rel: "canonical" }).setAttribute("href", `${SITE_URL}${page.canonicalPath}`);
    } else {
      document.head.querySelector('link[rel="canonical"]')?.remove();
    }
  }, [pathname, search, university]);

  return null;
};

export default RouteMeta;
