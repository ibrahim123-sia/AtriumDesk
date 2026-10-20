/**
 * ==========================================================
 * MATCHING.JS - Layer 1 hard-rule matching (Rev 5 §8)
 * ==========================================================
 *
 * Cheap, deterministic, no LLM — filters a listing pool down before the
 * embedding and LLM-explanation layers ever run. Decoupled from the Listing
 * schema: it only knows the plain `profile`/`requirements` shapes below, so
 * it can be unit-tested with literal objects.
 *
 * Four states:
 *   excluded   — deadline passed, the student is already past the level the
 *                award funds, work mode/location is incompatible, or a
 *                numeric requirement is missed by more than its margin.
 *                Never shown in the matched feed.
 *   near_miss  — a numeric requirement (CGPA, English test) is missed by
 *                within its configurable margin.
 *   unverified — nothing rules the student out, but a stated requirement
 *                can't be checked because the profile doesn't have that
 *                value yet (no CGPA, no degree, no English test score).
 *                Shown with what to add — never as "eligible".
 *   eligible   — every stated requirement was checked and met.
 *
 * A requirement the listing doesn't state is not checked at all, and work
 * mode/city are preferences rather than requirements — a student without a
 * preference is compatible with every listing.
 */

import { startOfToday } from "./dates.js";

export const MatchState = {
  EXCLUDED: "excluded",
  ELIGIBLE: "eligible",
  NEAR_MISS: "near_miss",
  UNVERIFIED: "unverified",
};

// Near-miss margins per §8 Layer 1's examples ("≤1.0 IELTS or ≤0.3 CGPA").
// TOEFL has no margin stated in the spec; 13 points keeps the same
// proportion as the IELTS margin (1.0 of a 0–9 band ≈ 13 of a 0–120 scale).
// Exported so a future tuning pass can override without touching the logic.
export const NEAR_MISS_MARGINS = {
  cgpa: 0.3,
  ielts: 1.0,
  toefl: 13,
};

// The level an award funds vs the student's current level. A bachelor's
// student is the intended audience for a master's scholarship (Rev 5 §6.2:
// MS-abroad awards for final-year students); only a student already past
// the funded level is ruled out.
const DEGREE_RANK = { bachelors: 1, masters: 2, phd: 3 };

const normalize = (value) => (typeof value === "string" ? value.trim().toLowerCase() : value);

// "Karachi, Pakistan" and "karachi" are the same place for matching.
const cityOf = (value) => normalize(String(value || "").split(",")[0]);
const sameCity = (a, b) => {
  const x = cityOf(a);
  const y = cityOf(b);
  return Boolean(x && y) && (x === y || x.includes(y) || y.includes(x));
};

// Numeric check on a value the student has: null (met) or a gap record.
function checkNumeric(field, actual, required, margin) {
  if (actual >= required) return null;
  const shortBy = Number((required - actual).toFixed(2));
  return { field, required, actual, shortBy, excluded: shortBy > margin };
}

const toGap = ({ field, required, actual, shortBy }) => ({ field, required, actual, shortBy });

/**
 * @param {object} profile
 * @param {number|null} [profile.cgpa] - 0–4.0 scale
 * @param {number|null} [profile.ieltsScore] - 0–9 band
 * @param {number|null} [profile.toeflScore] - 0–120
 * @param {string|null} [profile.degreeLevel] - current level: "bachelors" | "masters" | "phd"
 * @param {string|null} [profile.workModePreference] - "remote" | "onsite" | "hybrid"
 * @param {string|null} [profile.preferredCity]
 *
 * @param {object} requirements
 * @param {string|Date|null} [requirements.deadline]
 * @param {number|null} [requirements.minCgpa]
 * @param {number|null} [requirements.minIelts] - IELTS and TOEFL are alternatives:
 * @param {number|null} [requirements.minToefl]   meeting either one is enough
 * @param {string|null} [requirements.degreeLevel] - level the award funds; null = any
 * @param {string|null} [requirements.workMode] - "remote" | "onsite" | "hybrid"; null = any
 * @param {string|null} [requirements.location] - required city; null = anywhere
 *
 * @param {Date} [now] - injected instead of read internally, so tests never
 *                        need to mock the clock (still a pure function).
 *
 * @returns {{ state: string, reasons: string[], gaps: Array, unverified: Array }}
 *   gaps: { field, required, actual, shortBy } for each requirement missed;
 *   unverified: { field, required } for each stated requirement the profile
 *   can't answer yet — field "englishTest" has required { ielts?, toefl? }.
 */
export function evaluateHardRules(profile, requirements, now = new Date()) {
  const reasons = [];
  const unverified = [];

  // --- Categorical checks: incompatible => hard-excluded, no near-miss. ---
  // The deadline day itself still counts (services/dates.js).
  if (requirements.deadline != null) {
    const deadline = new Date(requirements.deadline);
    if (deadline < startOfToday(now)) {
      reasons.push("Deadline has passed");
    }
  }

  const requiredLevel = normalize(requirements.degreeLevel);
  if (requiredLevel != null && DEGREE_RANK[requiredLevel]) {
    const currentLevel = normalize(profile.degreeLevel);
    if (currentLevel == null || !DEGREE_RANK[currentLevel]) {
      unverified.push({ field: "degreeLevel", required: requirements.degreeLevel });
    } else if (DEGREE_RANK[currentLevel] > DEGREE_RANK[requiredLevel]) {
      reasons.push(
        `Degree level mismatch: this funds ${requirements.degreeLevel} study, you are at ${profile.degreeLevel} level`
      );
    }
  }

  if (
    requirements.workMode != null &&
    normalize(requirements.workMode) !== "hybrid" &&
    profile.workModePreference != null &&
    normalize(profile.workModePreference) !== "hybrid" &&
    normalize(requirements.workMode) !== normalize(profile.workModePreference)
  ) {
    reasons.push(
      `Work mode mismatch: listing is ${requirements.workMode}, preference is ${profile.workModePreference}`
    );
  }

  if (
    requirements.location != null &&
    normalize(requirements.workMode) === "onsite" &&
    profile.preferredCity != null &&
    !sameCity(requirements.location, profile.preferredCity)
  ) {
    reasons.push(
      `Location mismatch: listing is in ${requirements.location}, preferred city is ${profile.preferredCity}`
    );
  }

  // --- Numeric checks: met / near-miss / excluded-by-margin. ---
  const shortfalls = [];

  if (requirements.minCgpa != null) {
    if (profile.cgpa == null) unverified.push({ field: "cgpa", required: requirements.minCgpa });
    else {
      const check = checkNumeric("cgpa", profile.cgpa, requirements.minCgpa, NEAR_MISS_MARGINS.cgpa);
      if (check) shortfalls.push({ ...check, group: "cgpa" });
    }
  }

  // English: IELTS and TOEFL are alternatives. Met if any test the student
  // has meets its minimum; a near-miss if the closest one is within its
  // margin; unverified if they have none of the listed tests.
  const englishTests = [
    requirements.minIelts != null && { field: "ieltsScore", key: "ielts", required: requirements.minIelts, actual: profile.ieltsScore, margin: NEAR_MISS_MARGINS.ielts },
    requirements.minToefl != null && { field: "toeflScore", key: "toefl", required: requirements.minToefl, actual: profile.toeflScore, margin: NEAR_MISS_MARGINS.toefl },
  ].filter(Boolean);
  if (englishTests.length) {
    const taken = englishTests.filter((t) => t.actual != null);
    if (!taken.length) {
      unverified.push({
        field: "englishTest",
        required: Object.fromEntries(englishTests.map((t) => [t.key, t.required])),
      });
    } else {
      const checks = taken.map((t) => checkNumeric(t.field, t.actual, t.required, t.margin));
      if (!checks.includes(null)) {
        const excluded = checks.every((c) => c.excluded);
        // Every listed test was missed; it's only as bad as the closest one.
        for (const c of checks) shortfalls.push({ ...c, group: "english", excluded });
      }
    }
  }

  const gaps = shortfalls.map(toGap);
  const numericExcluded = shortfalls.some((s) => s.excluded);

  if (reasons.length > 0 || numericExcluded) {
    return { state: MatchState.EXCLUDED, reasons, gaps, unverified };
  }
  if (shortfalls.length > 0) {
    return { state: MatchState.NEAR_MISS, reasons, gaps, unverified };
  }
  if (unverified.length > 0) {
    return { state: MatchState.UNVERIFIED, reasons, gaps, unverified };
  }
  return { state: MatchState.ELIGIBLE, reasons, gaps, unverified };
}

// Human-readable list of what to add to the profile, e.g.
// "your CGPA (needs 3.0) and an English test score (IELTS 6.5 or TOEFL 90)".
export function describeUnverified(unverified = []) {
  const parts = unverified.map((u) => {
    if (u.field === "cgpa") return `your CGPA (needs ${u.required})`;
    if (u.field === "degreeLevel") return `your degree programme (this funds ${u.required} study)`;
    if (u.field === "englishTest") {
      const options = [
        u.required.ielts != null && `IELTS ${u.required.ielts}`,
        u.required.toefl != null && `TOEFL ${u.required.toefl}`,
      ].filter(Boolean);
      return `an English test score (${options.join(" or ")})`;
    }
    return u.field;
  });
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
