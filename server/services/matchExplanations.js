/**
 * Rev 5 §8 Layer 3 — LLM match explanations, cached. "Computed lazily, only
 * for the top ~10 results a student actually sees, cached by a hash of the
 * profile fields the matching engine used plus the listing's content, so a
 * repeat request never re-calls the LLM for the same pair."
 *
 * Node owns the cache (server/models/MatchExplanation.js); Python's
 * /listings/explain is a stateless generator called only on a miss.
 */

import crypto from "crypto";
import fetch from "node-fetch";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

// Only the fields evaluateHardRules actually reads — anything else on the
// profile changing (e.g. skills, unrelated notification prefs) shouldn't
// invalidate a cached explanation.
function relevantProfileFields(profile) {
  const { cgpa, ieltsScore, toeflScore, degreeLevel, workModePreference, preferredCity } = profile;
  return { cgpa, ieltsScore, toeflScore, degreeLevel, workModePreference, preferredCity };
}

function computeCacheKey(profile, listing, matchState, gaps) {
  const listingFingerprint = listing.contentHash || `${listing._id}:${listing.updatedAt?.getTime()}`;
  const raw = JSON.stringify({
    profile: relevantProfileFields(profile),
    listingFingerprint,
    matchState,
    gaps,
  });
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function callPythonExplain(profile, listing, matchState, gaps) {
  const response = await fetch(`${PYTHON_BACKEND_URL}/listings/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET || "" },
    body: JSON.stringify({
      profile: relevantProfileFields(profile),
      listing: listing.toObject ? listing.toObject() : listing,
      match_state: matchState,
      gaps,
    }),
    timeout: 30000,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Explanation call failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const body = await response.json();
  return body.explanation;
}

/**
 * Returns the cached explanation, or generates + caches one on a miss.
 * Never throws — a failure here should drop the explanation, not break the
 * matched feed; callers get `null` back instead.
 */
export async function getOrCreateExplanation(models, profile, listing, matchState, gaps) {
  const cacheKey = computeCacheKey(profile, listing, matchState, gaps);
  try {
    const cached = await models.MatchExplanation.findOne({ cacheKey });
    if (cached) return cached.explanation;

    const explanation = await callPythonExplain(profile, listing, matchState, gaps);
    try {
      await models.MatchExplanation.create({ cacheKey, listingId: listing._id, matchState, explanation });
    } catch (writeError) {
      // Duplicate key = another concurrent request already cached the same
      // pair — not an error, just a race we lost. Any other write failure
      // still returns the freshly-generated explanation to the caller.
      if (writeError.code !== 11000) console.error("MatchExplanation cache write error:", writeError.message);
    }
    return explanation;
  } catch (error) {
    console.error("getOrCreateExplanation error:", error.message);
    return null;
  }
}
