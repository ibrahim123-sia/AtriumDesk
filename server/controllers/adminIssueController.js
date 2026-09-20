import mongoose from "mongoose";
import { escapeRegex } from "../services/escapeRegex.js";

export const listAllIssues = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const { departmentId, status, category, search, dateFrom, dateTo, escalated } = req.query;
    const filter = {};
    if (departmentId) filter.department = departmentId;
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (escalated !== undefined) filter.escalated = escalated === "true";
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    if (search) {
      filter.$or = [
        { title: { $regex: escapeRegex(search), $options: "i" } },
        { description: { $regex: escapeRegex(search), $options: "i" } },
        { studentName: { $regex: escapeRegex(search), $options: "i" } },
        { studentEmail: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }

    const [issues, total] = await Promise.all([
      req.models.Issue.find(filter)
        .populate("department", "code name")
        .populate("assignedTo", "name email staffTitle")
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit),
      req.models.Issue.countDocuments(filter),
    ]);

    res.json({ success: true, issues, total });
  } catch (error) {
    console.error("listAllIssues error:", error);
    res.status(500).json({ success: false, message: "Failed to load issues" });
  }
};

export const getIssueAnalytics = async (req, res) => {
  try {
    // -29, not -30: the zero-filled `series` below covers exactly 30
    // buckets (today-29..today). $gte at -30 matched a 31st day whose
    // count then had nowhere to land in `series` and was silently dropped
    // from the chart.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const [byCategory, byDepartment, byStatus, resolved, satisfaction, satisfactionByDept, volume30d, topIssues] = await Promise.all([
      req.models.Issue.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      req.models.Issue.aggregate([
        { $group: { _id: "$department", count: { $sum: 1 } } },
        { $lookup: { from: "departments", localField: "_id", foreignField: "_id", as: "dept" } },
        { $unwind: "$dept" },
        { $project: { _id: 0, code: "$dept.code", name: "$dept.name", count: 1 } },
        { $sort: { count: -1 } },
      ]),
      req.models.Issue.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      req.models.Issue.aggregate([
        // resolvedAt is only stamped since the field was added — legacy
        // Resolved/Closed issues must still count, with updatedAt as their
        // best-available resolution time (the old metric's behavior).
        {
          $match: {
            $or: [
              { resolvedAt: { $ne: null } },
              { status: { $in: ["Resolved", "Closed"] } },
            ],
          },
        },
        {
          $project: {
            durationMs: { $subtract: [{ $ifNull: ["$resolvedAt", "$updatedAt"] }, "$createdAt"] },
          },
        },
        { $group: { _id: null, avgMs: { $avg: "$durationMs" }, count: { $sum: 1 } } },
      ]),
      // Rev 5 §4.4: "Admin sees per-department satisfaction, not just
      // per-department volume" — platform-wide rollup first, then per-dept below.
      req.models.Issue.aggregate([
        { $match: { "feedback.submittedAt": { $ne: null } } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$feedback.rating" },
            thumbsUpCount: { $sum: { $cond: ["$feedback.thumbsUp", 1, 0] } },
            count: { $sum: 1 },
          },
        },
      ]),
      req.models.Issue.aggregate([
        { $match: { "feedback.submittedAt": { $ne: null } } },
        {
          $group: {
            _id: "$department",
            avgRating: { $avg: "$feedback.rating" },
            thumbsUpCount: { $sum: { $cond: ["$feedback.thumbsUp", 1, 0] } },
            count: { $sum: 1 },
          },
        },
        { $lookup: { from: "departments", localField: "_id", foreignField: "_id", as: "dept" } },
        { $unwind: "$dept" },
        {
          $project: {
            _id: 0,
            code: "$dept.code",
            name: "$dept.name",
            avgRating: { $round: [{ $ifNull: ["$avgRating", 0] }, 1] },
            thumbsUpRate: { $round: [{ $multiply: [{ $divide: ["$thumbsUpCount", "$count"] }, 100] }, 0] },
            count: 1,
          },
        },
        { $sort: { count: -1 } },
      ]),
      req.models.Issue.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // User request — "which questions get asked most often." Grouped by
      // normalized title (case/whitespace-insensitive), same collapsing
      // approach as adminFailedQuestionController.js's near-literal-repeat
      // grouping — a different signal from byCategory above (category is
      // whatever free-text bucket the issue was filed under; this is the
      // actual recurring question/title text).
      req.models.Issue.aggregate([
        { $addFields: { normalizedTitle: { $trim: { input: { $toLower: "$title" } } } } },
        {
          $group: {
            _id: "$normalizedTitle",
            exampleTitle: { $first: "$title" },
            count: { $sum: 1 },
            lastAskedAt: { $max: "$createdAt" },
          },
        },
        { $sort: { count: -1, lastAskedAt: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = volume30d.find((x) => x._id === key);
      series.push({ date: key, count: found ? found.count : 0 });
    }

    res.json({
      success: true,
      analytics: {
        byCategory: byCategory.map((c) => ({ category: c._id || "other", count: c.count })),
        byDepartment,
        byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        // != null, not truthy — avgMs === 0 (an instant resolution) is a
        // real value, not "no data."
        avgResolutionHours: resolved[0]?.avgMs != null ? +(resolved[0].avgMs / 3600000).toFixed(1) : null,
        resolvedCount: resolved[0]?.count || 0,
        avgSatisfactionRating: satisfaction[0]?.avgRating != null ? +satisfaction[0].avgRating.toFixed(1) : null,
        thumbsUpRate: satisfaction[0]?.count
          ? +((satisfaction[0].thumbsUpCount / satisfaction[0].count) * 100).toFixed(0)
          : null,
        feedbackResponseCount: satisfaction[0]?.count || 0,
        satisfactionByDepartment: satisfactionByDept,
        volume30d: series,
        topIssues: topIssues.map((t) => ({ title: t.exampleTitle, count: t.count, lastAskedAt: t.lastAskedAt })),
      },
    });
  } catch (error) {
    console.error("getIssueAnalytics error:", error);
    res.status(500).json({ success: false, message: "Failed to load analytics" });
  }
};

export const getAdminIssue = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }
    const issue = await req.models.Issue.findById(req.params.id)
      .populate("department", "code name")
      .populate("assignedTo", "name email staffTitle");
    if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });
    res.json({ success: true, issue });
  } catch (error) {
    console.error("getAdminIssue error:", error);
    res.status(500).json({ success: false, message: "Failed to load issue" });
  }
};
