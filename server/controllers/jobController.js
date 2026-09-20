/**
 * Rev 5 §6.1/§6.3 — student-facing Jobs browse/detail. Public to any
 * authenticated user; only ever serves status="approved" listings.
 */

import { evaluateHardRules, MatchState } from "../services/matching.js";
import { buildStudentMatchProfile } from "../services/studentMatchProfile.js";
import { getOrCreateExplanation } from "../services/matchExplanations.js";
import { computeSkillGaps } from "../services/skillGap.js";
import { escapeRegex } from "../services/escapeRegex.js";

const EXPLAIN_TOP_N = 10;

export const getMatchedJobs = async (req, res) => {
  try {
    const profile = buildStudentMatchProfile(req.user);
    const profileSkills = req.user.profile?.career?.skills || [];
    const listings = await req.models.Listing.find({
      listingType: "job",
      status: "approved",
    }).sort({ deadline: 1 });

    const matched = listings
      .map((listing) => {
        const requirements = {
          deadline: listing.deadline,
          workMode: listing.workMode,
          location: listing.location || null,
        };
        return {
          listing,
          ...evaluateHardRules(profile, requirements),
          skillGaps: computeSkillGaps(profileSkills, listing.skillsRequired),
        };
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
    console.error("getMatchedJobs error:", error);
    res.status(500).json({ success: false, message: "Failed to load matched jobs" });
  }
};

export const listJobs = async (req, res) => {
  try {
    const { workMode, location, experienceLevel, isFreshGradFriendly, search, limit = 25, offset = 0 } = req.query;
    const filter = { listingType: "job", status: "approved" };
    if (workMode) filter.workMode = workMode;
    if (location) filter.location = { $regex: escapeRegex(location), $options: "i" };
    if (experienceLevel) filter.experienceLevel = { $regex: escapeRegex(experienceLevel), $options: "i" };
    if (isFreshGradFriendly !== undefined) filter.isFreshGradFriendly = isFreshGradFriendly === "true";
    if (search) {
      filter.$or = [
        { title: { $regex: escapeRegex(search), $options: "i" } },
        { organization: { $regex: escapeRegex(search), $options: "i" } },
        { description: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    const [jobs, total] = await Promise.all([
      req.models.Listing.find(filter)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Math.min(Number(limit), 100)),
      req.models.Listing.countDocuments(filter),
    ]);
    res.json({ success: true, jobs, total });
  } catch (error) {
    console.error("listJobs error:", error);
    res.status(500).json({ success: false, message: "Failed to load jobs" });
  }
};

export const getJob = async (req, res) => {
  try {
    // §6.5: an expired/delisted listing is still directly reachable by a
    // student who saved it (with a badge) — only pending/rejected are
    // truly hidden. The list endpoint above stays approved-only.
    const job = await req.models.Listing.findOne({
      _id: req.params.id,
      listingType: "job",
      status: { $in: ["approved", "expired", "delisted"] },
    });
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });
    const profileSkills = req.user.profile?.career?.skills || [];
    const skillGaps = computeSkillGaps(profileSkills, job.skillsRequired);
    res.json({ success: true, job, skillGaps });
  } catch (error) {
    console.error("getJob error:", error);
    res.status(500).json({ success: false, message: "Failed to load job" });
  }
};
