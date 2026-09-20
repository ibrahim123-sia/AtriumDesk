/**
 * ==========================================================
 * DEPARTMENTSUGGESTION.JS - §4.2 department suggestion via retrieval
 * ==========================================================
 *
 * "Department suggestion via retrieval, not keywords: store labeled example
 * question→department pairs. For a new question, retrieve the most similar
 * examples and let those guide the suggestion." (Rev 5 §4.2)
 *
 * No curated example set exists yet — every chatbot->issue handoff writes
 * one (server/models/DepartmentExample.js), so the label set grows from
 * real usage. Until enough examples exist, `suggestDepartment` simply
 * returns null and the student picks a department themselves; there is no
 * hardcoded keyword->department map to fall back on, since department
 * codes/names vary per tenant and a wrong guess is worse than no guess.
 *
 * The "retrieval" here is word-overlap scoring, not embeddings — cheap,
 * deterministic, and testable without a model load. If the example set
 * grows large enough that word overlap stops being discriminating enough,
 * swap in an embedding-similarity query without changing this module's
 * public shape.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "to", "of", "for", "in", "on",
  "and", "or", "my", "i", "do", "does", "what", "how", "can", "please", "me",
  "it", "this", "that", "with", "at", "be", "will", "would",
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Jaccard word overlap between two questions, 0-1. Pure function.
 */
export function scoreOverlap(questionA, questionB) {
  const a = new Set(tokenize(questionA));
  const b = new Set(tokenize(questionB));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Below this score, an example is too weakly related to suggest from.
export const MIN_SUGGESTION_SCORE = 0.2;

/**
 * @param {string} question
 * @param {Array<{question: string, departmentId: string}>} examples
 * @returns {{departmentId: string, score: number} | null}
 */
export function suggestDepartment(question, examples) {
  if (!examples || examples.length === 0) return null;
  let best = null;
  for (const example of examples) {
    const score = scoreOverlap(question, example.question);
    if (score >= MIN_SUGGESTION_SCORE && (!best || score > best.score)) {
      best = { departmentId: String(example.departmentId), score };
    }
  }
  return best;
}
