// Lightweight static ReDoS heuristic for admin-supplied regex patterns
// (studentEmailPattern). Not a full NFA analysis (that's what the
// `safe-regex` npm package does) — just catches the classic "nested
// unbounded quantifier" shape (e.g. "(a+)+", "(a*)*", "(a+){2,}") that
// causes catastrophic backtracking, which is the shape a hand-written
// pattern is actually likely to hit by accident or malice. A tenant's own
// Administrator can set this field, and it runs synchronously on every
// login/register/OTP call for that tenant with no timeout — an unsafe
// pattern here can freeze Node's single event loop for every tenant, not
// just the one that set it.
const NESTED_QUANTIFIER_RE = /\([^()]*[+*][^()]*\)[+*]|\([^()]*\{\d*,\}[^()]*\)[+*{]/;

const MAX_PATTERN_LENGTH = 200;

// Returns a user-facing error string if the pattern looks unsafe, or null
// if it looks fine. Only a heuristic — paired with MAX_MATCHED_INPUT_LENGTH
// below as defense in depth for whatever this heuristic misses.
export function findRedosRisk(pattern) {
  if (typeof pattern !== "string" || !pattern) return null;
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `Pattern is too long (max ${MAX_PATTERN_LENGTH} characters).`;
  }
  if (NESTED_QUANTIFIER_RE.test(pattern)) {
    return 'Pattern contains a nested repeated group (e.g. "(a+)+") — this shape can hang the server on certain input. Simplify it.';
  }
  return null;
}

// Even if the heuristic above misses an unsafe pattern, capping how much
// text is ever tested against it bounds the worst case to a small, fixed
// input rather than one an attacker can grow arbitrarily — no real student
// email local-part is anywhere near this long.
export const MAX_MATCHED_INPUT_LENGTH = 80;
