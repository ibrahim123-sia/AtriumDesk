/**
 * Rev 5 §6.1/§6.4 — student-facing Events browse/detail. No scraper feeds
 * this (§6.4's reality check found MAJU has no structured events source —
 * its blog is marketing content, its "Societies & Clubs" page has no dated
 * events) — every event here is manually entered by admin/staff via the
 * generic Content.jsx pipeline already built in Phase 4.
 *
 * "Past events stay, in a separate tab. They are excluded from the matched
 * feed and from alerts, but remain browsable" — `when` param splits the
 * query rather than storing a separate isPast flag that would go stale.
 */

import { escapeRegex } from "../services/escapeRegex.js";
import { startOfToday } from "../services/dates.js";

// Rev 5 §6.1/§6.4 — "all three modules share the same shape... matched feed
// is primary." Unlike Jobs/Scholarships there's no numeric eligibility here
// (no CGPA/IELTS/deadline concept for an event), so this ranks by
// department + interest overlap rather than hard-excluded/eligible/near-miss
// — plain deterministic code, no LLM, same "cheap checks first" principle.
export const getMatchedEvents = async (req, res) => {
  try {
    const now = new Date();
    const events = await req.models.Listing.find({
      listingType: "event",
      status: "approved",
      date: { $gte: startOfToday(now) },
    }).sort({ date: 1 });

    const studentDept = req.user.department ? String(req.user.department) : null;
    const interests = (req.user.profile?.events?.interests || [])
      .map((i) => String(i).trim().toLowerCase())
      .filter(Boolean);
    const societies = (req.user.profile?.events?.societyMemberships || [])
      .map((s) => String(s).trim().toLowerCase())
      .filter((s) => s.length >= 3);
    // "BS Computer Science" -> "computer science": students have no
    // department of their own, but their programme names the field.
    const programme = String(req.user.profile?.core?.degreeProgram || "")
      .toLowerCase()
      .replace(/^(bs|bsc|ba|bba|bcom|ms|msc|mphil|mba|phd|ma|be|me)\b\.?\s*(in\s+)?/, "")
      .trim();

    const matched = events
      .map((event) => {
        const reasons = [];
        let score = 0;

        if (studentDept && event.department && String(event.department) === studentDept) {
          score += 2;
          reasons.push("In your department");
        }

        const haystack = `${event.title} ${event.description}`.toLowerCase();
        const matchedInterests = interests.filter((interest) => haystack.includes(interest));
        if (matchedInterests.length > 0) {
          score += matchedInterests.length;
          reasons.push(`Matches your interest in ${matchedInterests.join(", ")}`);
        }

        const matchedSocieties = societies.filter((society) => haystack.includes(society));
        if (matchedSocieties.length > 0) {
          score += 2;
          reasons.push(`From a society you're in`);
        }

        if (programme.length >= 3 && haystack.includes(programme)) {
          score += 1;
          reasons.push(`Related to your programme`);
        }

        return { listing: event, score, reasons };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score || new Date(a.listing.date) - new Date(b.listing.date));

    // Nothing in the profile to rank by: the client shows the upcoming list
    // with a prompt to add interests instead of an empty feed.
    const hasSignals = Boolean(studentDept || interests.length || societies.length || programme.length >= 3);
    res.json({ success: true, matched, hasSignals });
  } catch (error) {
    console.error("getMatchedEvents error:", error);
    res.status(500).json({ success: false, message: "Failed to load matched events" });
  }
};

export const listEvents = async (req, res) => {
  try {
    const { when = "upcoming", department, search, limit = 25, offset = 0 } = req.query;
    const filter = { listingType: "event", status: "approved" };
    const now = new Date();
    filter.date = when === "past" ? { $lt: startOfToday(now) } : { $gte: startOfToday(now) };
    if (department) filter.department = department;
    if (search) {
      filter.$or = [
        { title: { $regex: escapeRegex(search), $options: "i" } },
        { organization: { $regex: escapeRegex(search), $options: "i" } },
        { description: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }
    const [events, total] = await Promise.all([
      req.models.Listing.find(filter)
        .sort({ date: when === "past" ? -1 : 1 })
        .skip(Number(offset))
        .limit(Math.min(Number(limit), 100)),
      req.models.Listing.countDocuments(filter),
    ]);
    res.json({ success: true, events, total });
  } catch (error) {
    console.error("listEvents error:", error);
    res.status(500).json({ success: false, message: "Failed to load events" });
  }
};

export const getEvent = async (req, res) => {
  try {
    const event = await req.models.Listing.findOne({
      _id: req.params.id,
      listingType: "event",
      status: "approved",
    });
    if (!event) return res.status(404).json({ success: false, message: "Event not found" });
    res.json({ success: true, event });
  } catch (error) {
    console.error("getEvent error:", error);
    res.status(500).json({ success: false, message: "Failed to load event" });
  }
};
