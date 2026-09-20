/**
 * Rev 5 §8 Layer 1 — maps a student's unified profile (server/models/User.js's
 * `profile` sub-document) onto the plain shape services/matching.js's
 * evaluateHardRules expects. Kept separate from matching.js itself so that
 * module stays decoupled from the User schema (see its own header comment).
 *
 * `core.degreeProgram` is free text (e.g. "BSCS", "MS Computer Science") —
 * there is no explicit bachelors/masters/phd field on the profile, so degree
 * level is inferred from it here rather than in the matching engine.
 */

const inferDegreeLevel = (degreeProgram) => {
  if (!degreeProgram) return null;
  const p = degreeProgram.toLowerCase();
  if (p.includes("phd") || p.includes("doctor")) return "phd";
  if (p.includes("master") || p.includes("mba") || p.includes("mphil") || p.includes("m.phil") || /\bms\b/.test(p)) {
    return "masters";
  }
  return "bachelors";
};

export const buildStudentMatchProfile = (user) => {
  const profile = user.profile || {};
  const core = profile.core || {};
  const career = profile.career || {};
  const studyAbroad = profile.studyAbroad || {};
  return {
    cgpa: core.cgpa ?? null,
    ieltsScore: studyAbroad.ieltsScore ?? null,
    toeflScore: studyAbroad.toeflScore ?? null,
    degreeLevel: inferDegreeLevel(core.degreeProgram),
    workModePreference: career.workModePreference || null,
    preferredCity: career.preferredCity || null,
  };
};
