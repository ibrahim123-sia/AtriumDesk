/**
 * ==========================================================
 * CGPACONVERSION.JS - Pakistani 4.0 CGPA -> German/percentage (Rev 5 §6.2)
 * ==========================================================
 *
 * "CGPA scale conversion. Pakistani 4.0 scale to German 1-5 and to
 * percentage. This is a genuine value-add — it is a real problem students
 * cannot solve themselves and get wrong constantly. It is also pure
 * deterministic logic, which makes it one of the four things worth
 * unit-testing (§13.2)."
 *
 * German conversion uses the "modified Bavarian formula", the standard
 * method German universities themselves use for foreign-grade conversion
 * (note: German grading is INVERTED — 1.0 is the best grade, 5.0 fails):
 *   german = 1 + 3 * (Nmax - Nd) / (Nmax - Nmin)
 * where Nmax = 4.0 (max CGPA), Nmin = 2.0 (the conventional minimum
 * passing CGPA at Pakistani universities — matches this codebase's own
 * probation threshold, see server/models/User.js's academic profile),
 * Nd = the student's actual CGPA.
 *
 * Percentage uses the simple linear approximation Pakistani universities
 * themselves commonly publish: percentage = CGPA * 25 (so 4.0 -> 100%,
 * 2.0 -> 50%). Both conversions are approximations by nature — there is no
 * single official cross-system formula — so results are for guidance, not
 * a guaranteed institutional equivalence.
 */

const CGPA_MAX = 4.0;
const CGPA_MIN_PASSING = 2.0;

/**
 * @param {number} cgpa - 0.0-4.0
 * @returns {number} German grade, 1.0 (best) - 5.0 (fail), clamped
 */
export function cgpaToGerman(cgpa) {
  const raw = 1 + (3 * (CGPA_MAX - cgpa)) / (CGPA_MAX - CGPA_MIN_PASSING);
  return Math.round(Math.min(5.0, Math.max(1.0, raw)) * 100) / 100;
}

/**
 * @param {number} cgpa - 0.0-4.0
 * @returns {number} Percentage, 0-100, clamped
 */
export function cgpaToPercentage(cgpa) {
  const raw = cgpa * 25;
  return Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100;
}
