import crypto from "crypto";

// Plain === short-circuits on the first differing byte, a timing
// side-channel on the one secret gating every Python<->Node internal
// webhook. crypto.timingSafeEqual runs in constant time regardless — the
// length check ahead of it is unavoidable (timingSafeEqual throws on a
// buffer-length mismatch) and leaks only length, not content, which is the
// standard accepted tradeoff for this kind of comparison.
export const isValidInternalSecret = (provided) => {
  const expected = process.env.INTERNAL_SECRET;
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};
