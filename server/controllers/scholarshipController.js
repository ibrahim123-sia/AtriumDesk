/**
 * Rev 5 §6.1/§6.2 — student-facing Scholarships browse/detail. Public to
 * any authenticated user (no admin role needed); only ever serves
 * status="approved" listings — pending/rejected/expired/delisted never
 * reach a student directly here.
 */

import { evaluateHardRules, MatchState } from "../services/matching.js";
import { buildStudentMatchProfile } from "../services/studentMatchProfile.js";
import { getOrCreateExplanation } from "../services/matchExplanations.js";
import { escapeRegex } from "../services/escapeRegex.js";

// §8 Layer 3: "computed lazily, only for the top ~10 results a student
// actually sees" — bounds LLM cost regardless of how many listings pass
// Layer 1's hard-rule filter.
const EXPLAIN_TOP_N = 10;

// §6.1: "the matched feed is the primary view, plain browse is secondary."
// Excluded listings are dropped entirely — eligible sorts before near_miss.
export const getMatchedScholarships = async (req, res) => {
  try {
    const profile = buildStudentMatchProfile(req.user);
    const listings = await req.models.Listing.find({
      listingType: "scholarship",
      status: "approved",
    }).sort({ deadline: 1 });

    const matched = listings
      .map((listing) => {
        const requirements = {
          deadline: listing.deadline,
          minCgpa: listing.cgpaRequirement,
          minIelts: listing.ieltsRequirement,
          minToefl: listing.toeflRequirement,
          degreeLevel: listing.degreeLevel === "other" ? null : listing.degreeLevel,
        };
        return { listing, ...evaluateHardRules(profile, requirements) };
      })
      .filter((m) => m.state !== MatchState.EXCLUDED)
      .sort((a, b) => (a.state === b.state ? 0 : a.state === MatchState.ELIGIBLE ? -1 : 1));

    await Promise.all(
      matched.slice(0, EXPLAIN_TOP_N).map(async (m) => {
        m.explanation = await getOrCreateExplanation(req.models, profile, m.listing, m.state, m.gaps);
      })
    );

    res.json({ success: true, matched });
  } catch (error) {
    console.error("getMatchedScholarships error:", error);
    res.status(500).json({ success: false, message: "Failed to load matched scholarships" });
  }
};

export const listScholarships = async (req, res) => {
  try {
    const { country, fundingType, degreeLevel, search, limit = 25, offset = 0 } = req.query;
    const filter = { listingType: "scholarship", status: "approved" };
    if (country) filter.country = country;
    if (fundingType) filter.fundingType = fundingType;
    if (degreeLevel) filter.degreeLevel = degreeLevel;
    if (search) {
      filter.$or = [
        { title: { $regex: escapeRegex(search), $options: "i" } },
        { organization: { $regex: escapeRegex(search), $options: "i" } },
        { description: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    const [scholarships, total] = await Promise.all([
      req.models.Listing.find(filter)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Math.min(Number(limit), 100)),
      req.models.Listing.countDocuments(filter),
    ]);
    res.json({ success: true, scholarships, total });
  } catch (error) {
    console.error("listScholarships error:", error);
    res.status(500).json({ success: false, message: "Failed to load scholarships" });
  }
};

export const getScholarship = async (req, res) => {
  try {
    // §6.5: an expired/delisted listing is still directly reachable by a
    // student who saved it (with a badge) — only pending/rejected are
    // truly hidden. The list endpoint above stays approved-only.
    const scholarship = await req.models.Listing.findOne({
      _id: req.params.id,
      listingType: "scholarship",
      status: { $in: ["approved", "expired", "delisted"] },
    });
    if (!scholarship) return res.status(404).json({ success: false, message: "Scholarship not found" });
    res.json({ success: true, scholarship });
  } catch (error) {
    console.error("getScholarship error:", error);
    res.status(500).json({ success: false, message: "Failed to load scholarship" });
  }
};
