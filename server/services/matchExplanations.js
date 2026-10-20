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
import { MatchState, describeUnverified } from "./matching.js";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

// Only the fields evaluateHardRules actually reads — anything else on the
// profile changing (e.g. skills, unrelated notification prefs) shouldn't
// invalidate a cached explanation.
function relevantProfileFields(profile) {
  const { cgpa, ieltsScore, toeflScore, degreeLevel, workModePreference, preferredCity } = profile;
  return { cgpa, ieltsScore, toeflScore, degreeLevel, workModePreference, preferredCity };
}

// v2: the model also gets what couldn't be checked (unverified) and, for
// jobs, the student's skills and skill gaps — older cached text was written
// without them and could claim requirements the profile never showed.
function computeCacheKey(profile, listing, matchState, gaps, extra) {
  const listingFingerprint = listing.contentHash || `${listing._id}:${listing.updatedAt?.getTime()}`;
  const raw = JSON.stringify({
    v: 2,
    profile: relevantProfileFields(profile),
    listingFingerprint,
    matchState,
    gaps,
    unverified: extra.unverified || [],
    skills: extra.skills ? [...extra.skills].map((s) => String(s).toLowerCase()).sort() : null,
    skillGaps: extra.skillGaps || null,
  });
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function callPythonExplain(profile, listing, matchState, gaps, extra) {
  const response = await fetch(`${PYTHON_BACKEND_URL}/listings/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET || "" },
    body: JSON.stringify({
      profile: relevantProfileFields(profile),
      listing: listing.toObject ? listing.toObject() : listing,
      match_state: matchState,
      gaps,
      unverified: extra.unverified || [],
      skills: extra.skills ?? null,
      skill_gaps: extra.skillGaps ?? null,
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
// Nothing rules the student out, but the profile can't answer a stated
// requirement yet: say exactly what to add, without an LLM (nothing to
// explain, and nothing for a model to embellish).
export const unverifiedExplanation = (unverified) =>
  `We can't confirm you're eligible yet. Add ${describeUnverified(unverified)} to your profile to check.`;

/**
 * `extra`: { unverified } from evaluateHardRules, plus { skills, skillGaps }
 * for jobs.
 */
export async function getOrCreateExplanation(models, profile, listing, matchState, gaps, extra = {}) {
  if (matchState === MatchState.UNVERIFIED) return unverifiedExplanation(extra.unverified);
  const cacheKey = computeCacheKey(profile, listing, matchState, gaps, extra);
  try {
    const cached = await models.MatchExplanation.findOne({ cacheKey });
    if (cached) return cached.explanation;

    const explanation = await callPythonExplain(profile, listing, matchState, gaps, extra);
    // A reply cut off mid-sentence (token limit) is shown once but never
    // cached, so the next view gets a fresh one.
    if (!/[.!?…]["')\]]?\s*$/.test(explanation || "")) return explanation;
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
