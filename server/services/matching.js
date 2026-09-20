/**
 * ==========================================================
 * MATCHING.JS - Layer 1 hard-rule matching (Rev 5 §8)
 * ==========================================================
 *
 * Cheap, deterministic, no LLM — filters a listing pool down before the
 * (unbuilt-yet) embedding and LLM-explanation layers ever run. Deliberately
 * decoupled from the Scholarship/Job Mongoose schemas, which don't exist yet
 * (Rev 5 §6.2/§6.3 build those pipelines in a later phase) — this module
 * only knows about the plain `profile`/`requirements` shapes below, so it
 * can be unit-tested with literal objects and reused unchanged once those
 * schemas land.
 *
 * Three-state output (§8 Layer 1's table):
 *   excluded  — deadline passed, degree level doesn't match, or work
 *               mode/location is incompatible. Never becomes eligible.
 *   near_miss — every categorical check passed, but a numeric requirement
 *               (CGPA/IELTS/TOEFL) was missed by within its configurable
 *               margin.
 *   eligible  — every requirement met.
 *
 * A missing profile value (student hasn't filled in that section yet) is
 * treated as "cannot verify" — it neither excludes nor near-misses, since
 * hiding every listing from an incomplete profile would defeat the point of
 * the matched feed. Only present-but-insufficient values count against a
 * candidate.
 */

export const MatchState = {
  EXCLUDED: "excluded",
  ELIGIBLE: "eligible",
  NEAR_MISS: "near_miss",
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

const normalize = (value) => (typeof value === "string" ? value.trim().toLowerCase() : value);

// Numeric check: returns null (met/unknown, no gap) or a gap record.
function checkNumeric(field, actual, required, margin) {
  if (required == null || actual == null) return null;
  if (actual >= required) return null;
  const shortBy = Number((required - actual).toFixed(2));
  const withinMargin = shortBy <= margin;
  return {
    field,
    required,
    actual,
    shortBy,
    excluded: !withinMargin,
  };
}

/**
 * @param {object} profile
 * @param {number|null} [profile.cgpa] - 0–4.0 scale
 * @param {number|null} [profile.ieltsScore] - 0–9 band
 * @param {number|null} [profile.toeflScore] - 0–120
 * @param {string|null} [profile.degreeLevel] - e.g. "bachelors" | "masters" | "phd"
 * @param {string|null} [profile.workModePreference] - "remote" | "onsite" | "hybrid"
 * @param {string|null} [profile.preferredCity]
 *
 * @param {object} requirements
 * @param {string|Date|null} [requirements.deadline]
 * @param {number|null} [requirements.minCgpa]
 * @param {number|null} [requirements.minIelts]
 * @param {number|null} [requirements.minToefl]
 * @param {string|null} [requirements.degreeLevel] - required level; null/undefined = any
 * @param {string|null} [requirements.workMode] - "remote" | "onsite" | "hybrid"; null = any
 * @param {string|null} [requirements.location] - required city; null = anywhere
 *
 * @param {Date} [now] - injected instead of read internally, so tests never
 *                        need to mock the clock (still a pure function).
 *
 * @returns {{ state: string, reasons: string[], gaps: Array<{field:string, required:number, actual:number, shortBy:number}> }}
 */
export function evaluateHardRules(profile, requirements, now = new Date()) {
  const reasons = [];

  // --- Categorical checks: incompatible => hard-excluded, no near-miss. ---
  if (requirements.deadline != null) {
    const deadline = new Date(requirements.deadline);
    if (deadline < now) {
      reasons.push("Deadline has passed");
    }
  }

  if (requirements.degreeLevel != null && profile.degreeLevel != null) {
    if (normalize(requirements.degreeLevel) !== normalize(profile.degreeLevel)) {
      reasons.push(
        `Degree level mismatch: requires ${requirements.degreeLevel}, profile is ${profile.degreeLevel}`
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
    normalize(requirements.location) !== normalize(profile.preferredCity)
  ) {
    reasons.push(
      `Location mismatch: listing is in ${requirements.location}, preferred city is ${profile.preferredCity}`
    );
  }

  // --- Numeric checks: met / near-miss / excluded-by-margin. ---
  const numericChecks = [
    checkNumeric("cgpa", profile.cgpa, requirements.minCgpa, NEAR_MISS_MARGINS.cgpa),
    checkNumeric("ieltsScore", profile.ieltsScore, requirements.minIelts, NEAR_MISS_MARGINS.ielts),
    checkNumeric("toeflScore", profile.toeflScore, requirements.minToefl, NEAR_MISS_MARGINS.toefl),
  ].filter(Boolean);

  const gaps = numericChecks.map(({ field, required, actual, shortBy }) => ({
    field,
    required,
    actual,
    shortBy,
  }));

  const numericExcluded = numericChecks.some((c) => c.excluded);
  const numericNearMiss = numericChecks.some((c) => !c.excluded);

  if (reasons.length > 0 || numericExcluded) {
    return { state: MatchState.EXCLUDED, reasons, gaps };
  }
  if (numericNearMiss) {
    return { state: MatchState.NEAR_MISS, reasons, gaps };
  }
  return { state: MatchState.ELIGIBLE, reasons, gaps };
}
