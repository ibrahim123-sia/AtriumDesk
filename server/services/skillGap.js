/**
 * Rev 5 §6.3 — "The CV is already parsed, so comparing it against a JD is
 * nearly free: 'this role wants Docker and AWS, which aren't on your CV.'"
 *
 * Plain array diff, no LLM — informational only, never affects a job's
 * hard-rule match state (server/services/matching.js).
 */
// "Node.js", "nodejs" and "Node JS" are one skill; so are "React.js" and
// "React". Keeps + and # (C++, C#).
export const skillKey = (skill) =>
  String(skill || "")
    .trim()
    .toLowerCase()
    .replace(/[.\s-]*js$/, "")
    .replace(/[^a-z0-9+#]/g, "");

export function computeSkillGaps(profileSkills, requiredSkills) {
  if (!requiredSkills?.length) return [];
  const have = new Set((profileSkills || []).map(skillKey).filter(Boolean));
  return requiredSkills.filter((skill) => !have.has(skillKey(skill)));
}
