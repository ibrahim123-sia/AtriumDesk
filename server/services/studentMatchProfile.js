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

// Every admin-entered `cgpaRequirement` on a Listing (and every
// `requirements.minCgpa` matching.js compares against) is entered assuming
// a 4.0 scale — that's the only scale that existed before per-student
// scales were added. Rather than touch every admin form and stored
// listing, the student's own score is normalized onto that same 4.0
// reference scale here, once, at the matching boundary.
const MATCH_REFERENCE_SCALE = 4;

const normalizeCgpa = (cgpa, cgpaScale) => {
  if (cgpa == null) return null;
  const scale = cgpaScale || MATCH_REFERENCE_SCALE;
  return (cgpa / scale) * MATCH_REFERENCE_SCALE;
};

export const buildStudentMatchProfile = (user) => {
  const profile = user.profile || {};
  const core = profile.core || {};
  const career = profile.career || {};
  const studyAbroad = profile.studyAbroad || {};
  return {
    cgpa: normalizeCgpa(core.cgpa, core.cgpaScale),
    ieltsScore: studyAbroad.ieltsScore ?? null,
    toeflScore: studyAbroad.toeflScore ?? null,
    degreeLevel: inferDegreeLevel(core.degreeProgram),
    workModePreference: career.workModePreference || null,
    preferredCity: career.preferredCity || null,
  };
};
