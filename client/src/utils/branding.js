// Letters for the logo square when a university hasn't uploaded a logo:
// first letters of the first two words ("Riphah International" -> "RI"),
// or the first letter of a single word ("MAJU" -> "M").
export const brandInitials = (name, fallback = "AD") => {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

// The address to put in an <img> for a university's logo, or null. Only
// http(s) URLs and paths are allowed. A logo uploaded in the Super Admin
// portal is stored as "/uploads/…", which the API server serves, not the web
// app (a different origin in development and on Cloudflare).
export const safeLogoUrl = (url) => {
  const value = String(url || "");
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/uploads/")) return `${SERVER_URL}${value}`;
  return value.startsWith("/") ? value : null;
};
