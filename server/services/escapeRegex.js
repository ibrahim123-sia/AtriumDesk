// Escapes regex metacharacters in user-supplied strings before they are
// embedded in a Mongo $regex — a search of "(" must match a literal "("
// instead of crashing the query with an invalid-regex 500, and unescaped
// input invites ReDoS patterns against title/description scans.
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
