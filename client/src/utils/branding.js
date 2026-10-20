// Letters for the logo square when a university hasn't uploaded a logo:
// first letters of the first two words ("Riphah International" -> "RI"),
// or the first letter of a single word ("MAJU" -> "M").
export const brandInitials = (name, fallback = "AD") => {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
};

// Only http(s) or same-origin paths are rendered as an <img>.
export const safeLogoUrl = (url) => (/^(https?:\/\/|\/)/i.test(String(url || "")) ? url : null);
