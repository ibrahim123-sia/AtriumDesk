/**
 * Centralized colour tokens — used by every role's UI (Super Admin,
 * Administrator, Staff, Student), not just the admin section this file
 * historically lived under. Kept at this path rather than moved, since ~24
 * files already import from here and a path-only rename has zero visual
 * benefit for a much bigger diff.
 *
 * Default palette is "Majlis Ocean Teal" (locked 2026-09-05 — see
 * uniassist-super-admin.html / uniassist-student-portal.html, the source of
 * truth; values below are copied from their :root block, not approximated).
 * A tenant that has set its own `branding.primaryColor` (Rev5 §11 /
 * Rev7 T1 self-service branding) overrides the `navy`/`navyHover` slots —
 * this is what makes per-tenant branding actually visible in the UI, not
 * just stored data (T1 shipped the data model; this is the UI side of it).
 *
 * NOTE on names: `navy`/`red` are legacy key names from the pre-rebrand MAJU
 * palette — kept as-is rather than renamed to `primary`/`accent`, since ~39
 * consuming files read `C.navy`/`C.red` and a rename would touch all of them
 * for zero visual difference. Only the VALUES changed.
 */
const DEFAULT_PRIMARY_LIGHT = "#0D9488"; // Ocean Teal
const DEFAULT_PRIMARY_HOVER_LIGHT = "#0B7A70";
const DEFAULT_PRIMARY_DARK_MODE = "#14B8A6"; // brightened so it still pops on a dark surface
const DEFAULT_PRIMARY_HOVER_DARK_MODE = "#0D9488";

export const getPalette = (isDark, tenantBranding) => {
  const customPrimary = tenantBranding?.primaryColor || null;

  return {
    // Surfaces
    bg: isDark ? "#0A1614" : "#F3F8F7",
    surface: isDark ? "#0F2320" : "#FFFFFF",
    surfaceAlt: isDark ? "#152E2A" : "#E9F2F0",
    input: isDark ? "#081210" : "#F3F8F7",
    border: isDark ? "#1E3A35" : "#D9E7E4",

    // Type
    text: isDark ? "#E8F5F2" : "#0F2E2A",
    muted: isDark ? "#8FB0AA" : "#53716C",

    // Brand primary — a tenant's own primaryColor wins when set; otherwise
    // Ocean Teal (brightened in dark mode for contrast, same as every other
    // token pair here).
    navy: customPrimary || (isDark ? DEFAULT_PRIMARY_DARK_MODE : DEFAULT_PRIMARY_LIGHT),
    navyHover: customPrimary || (isDark ? DEFAULT_PRIMARY_HOVER_DARK_MODE : DEFAULT_PRIMARY_HOVER_LIGHT),

    // Secondary accent — the olive-green from the locked mockups, brightened in dark mode
    red: isDark ? "#84CC16" : "#4E9128",

    // Status colors
    green: isDark ? "#4ADE80" : "#2C7A4C",
    amber: isDark ? "#FBBF24" : "#9C5A12",
  };
};

export const usePalette = () => {
  // Lightweight hook-style helper for components that already import from React-Redux
  // Callers do: const C = usePalette(); — where they have access to theme via useSelector.
  // Kept as a getter so consumers control re-render via their own useSelector.
  return getPalette;
};
