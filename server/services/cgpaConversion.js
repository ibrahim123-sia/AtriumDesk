/**
 * ==========================================================
 * CGPACONVERSION.JS - CGPA -> German/percentage (Rev 5 §6.2)
 * ==========================================================
 *
 * "CGPA scale conversion... to German 1-5 and to percentage. This is a
 * genuine value-add — it is a real problem students cannot solve
 * themselves and get wrong constantly. It is also pure deterministic
 * logic, which makes it one of the four things worth unit-testing
 * (§13.2)."
 *
 * Not every tenant's students grade on a 4.0 scale (server/models/User.js's
 * `profile.core.cgpaScale`), so both functions take the student's own scale
 * as a second argument — default 4.0 to match the original Pakistani-scale
 * behavior these were written against, and to keep every existing call site
 * (including the tests) working unchanged.
 *
 * German conversion uses the "modified Bavarian formula", the standard
 * method German universities themselves use for foreign-grade conversion
 * (note: German grading is INVERTED — 1.0 is the best grade, 5.0 fails):
 *   german = 1 + 3 * (Nmax - Nd) / (Nmax - Nmin)
 * where Nmax = the student's scale max, Nmin = the conventional minimum
 * passing grade (kept at the same 50%-of-max ratio as the original
 * 2.0-of-4.0 Pakistani convention this was written against), Nd = the
 * student's actual CGPA.
 *
 * Percentage is the simple linear approximation universities themselves
 * commonly publish: percentage = (CGPA / scale) * 100. Both conversions are
 * approximations by nature — there is no single official cross-system
 * formula — so results are for guidance, not a guaranteed institutional
 * equivalence.
 */

const DEFAULT_CGPA_SCALE = 4.0;
// The minimum-passing-CGPA ratio the German conversion's Nmin is derived
// from — 2.0-of-4.0 in the original Pakistani-scale version this was
// written against.
const MIN_PASSING_RATIO = 0.5;

/**
 * @param {number} cgpa - 0.0-scale
 * @param {number} [scale] - the student's own CGPA scale max, default 4.0
 * @returns {number} German grade, 1.0 (best) - 5.0 (fail), clamped
 */
export function cgpaToGerman(cgpa, scale = DEFAULT_CGPA_SCALE) {
  const minPassing = scale * MIN_PASSING_RATIO;
  const raw = 1 + (3 * (scale - cgpa)) / (scale - minPassing);
  return Math.round(Math.min(5.0, Math.max(1.0, raw)) * 100) / 100;
}

/**
 * @param {number} cgpa - 0.0-scale
 * @param {number} [scale] - the student's own CGPA scale max, default 4.0
 * @returns {number} Percentage, 0-100, clamped
 */
export function cgpaToPercentage(cgpa, scale = DEFAULT_CGPA_SCALE) {
  const raw = (cgpa / scale) * 100;
  return Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100;
}
