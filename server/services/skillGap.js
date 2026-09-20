/**
 * Rev 5 §6.3 — "The CV is already parsed, so comparing it against a JD is
 * nearly free: 'this role wants Docker and AWS, which aren't on your CV.'"
 *
 * Plain array diff, no LLM — informational only, never affects a job's
 * hard-rule match state (server/services/matching.js).
 */
export function computeSkillGaps(profileSkills, requiredSkills) {
  if (!requiredSkills?.length) return [];
  const have = new Set((profileSkills || []).map((s) => s.trim().toLowerCase()));
  return requiredSkills.filter((skill) => !have.has(skill.trim().toLowerCase()));
}
