// Rev7 SaaS follow-up — the PWA manifest (name/icon/theme_color) was a
// single static file shared by every tenant, always showing MAJU's name
// and icon regardless of which university's branding the installing user
// actually belongs to. Public (no auth — a manifest must be fetchable by
// the browser's install-prompt machinery before any login), served per
// tenant slug so each university's installed PWA reflects its own branding.
import { getTenantModel } from "../models/platform/Tenant.js";

const DEFAULT_MANIFEST = {
  name: "AtriumDesk",
  short_name: "AtriumDesk",
  description: "AI-powered assistant for university students — chatbot, issues, scholarships, jobs, and events.",
  background_color: "#F3F8F7",
  theme_color: "#0D9488",
};

const toAbsoluteUrl = (req, maybeRelativeUrl) => {
  if (!maybeRelativeUrl) return null;
  if (/^https?:\/\//i.test(maybeRelativeUrl)) return maybeRelativeUrl;
  return `${req.protocol}://${req.get("host")}${maybeRelativeUrl}`;
};

export const getTenantManifest = async (req, res) => {
  const { slug } = req.params;
  let branding = DEFAULT_MANIFEST;

  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOne({ slug, status: "active" });
    if (tenant?.branding) {
      const name = tenant.branding.universityName || tenant.branding.universityShort || DEFAULT_MANIFEST.name;
      branding = {
        name: `AtriumDesk — ${name}`,
        short_name: tenant.branding.universityShort || DEFAULT_MANIFEST.short_name,
        description: `AI-powered assistant for ${name} students — chatbot, issues, scholarships, jobs, and events.`,
        background_color: DEFAULT_MANIFEST.background_color,
        theme_color: tenant.branding.primaryColor || DEFAULT_MANIFEST.theme_color,
        logoUrl: toAbsoluteUrl(req, tenant.branding.logoUrl),
      };
    }
  } catch (error) {
    console.error("getTenantManifest error:", error.message);
    // Fall through to the default manifest rather than failing the
    // install prompt entirely over a transient DB hiccup.
  }

  const icons = branding.logoUrl
    ? [
        { src: branding.logoUrl, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: branding.logoUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/graduation.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/graduation.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: "/logo-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      ];

  res.set("Content-Type", "application/manifest+json");
  res.json({
    name: branding.name,
    short_name: branding.short_name,
    description: branding.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: branding.background_color,
    theme_color: branding.theme_color,
    icons,
  });
};
