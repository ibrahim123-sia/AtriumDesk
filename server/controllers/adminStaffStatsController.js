// User request — per-staff query count/performance: how many issues has
// each staff member actually solved, and how good was the outcome (response
// time, satisfaction) — not just resolution volume. Same aggregation shapes
// as issueController.js's getDeptStats (repliesGiven/responseStats/
// satisfactionStats), just matched on `assignedTo` across ALL staff instead
// of one department/self.

const buildResponseMap = async (Issue, match) => {
  const rows = await Issue.aggregate([
    { $match: { ...match, "replies.0": { $exists: true } } },
    {
      $project: {
        assignedTo: 1,
        createdAt: 1,
        firstStaffReply: {
          $arrayElemAt: [
            { $filter: { input: "$replies", as: "r", cond: { $eq: ["$$r.authorRole", "staff"] } } },
            0,
          ],
        },
      },
    },
    { $match: { firstStaffReply: { $ne: null } } },
    {
      $group: {
        _id: "$assignedTo",
        avgMs: { $avg: { $subtract: ["$firstStaffReply.createdAt", "$createdAt"] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.avgMs]));
};

export const getStaffPerformanceList = async (req, res) => {
  try {
    const staff = await req.models.User.find({ role: "staff" })
      .populate("department", "code name")
      .select("name email department staffTitle");
    const staffIds = staff.map((s) => s._id);

    const [solvedAgg, satisfactionAgg, responseMap] = await Promise.all([
      req.models.Issue.aggregate([
        { $match: { assignedTo: { $in: staffIds }, status: { $in: ["Resolved", "Closed"] } } },
        { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
      ]),
      req.models.Issue.aggregate([
        { $match: { assignedTo: { $in: staffIds }, "feedback.submittedAt": { $ne: null } } },
        {
          $group: {
            _id: "$assignedTo",
            avgRating: { $avg: "$feedback.rating" },
            thumbsUpCount: { $sum: { $cond: ["$feedback.thumbsUp", 1, 0] } },
            count: { $sum: 1 },
          },
        },
      ]),
      buildResponseMap(req.models.Issue, { assignedTo: { $in: staffIds } }),
    ]);

    const solvedMap = new Map(solvedAgg.map((x) => [String(x._id), x.count]));
    const satisfactionMap = new Map(satisfactionAgg.map((x) => [String(x._id), x]));

    const performance = staff
      .map((s) => {
        const sat = satisfactionMap.get(String(s._id));
        const avgMs = responseMap.get(String(s._id));
        return {
          _id: s._id,
          name: s.name,
          email: s.email,
          staffTitle: s.staffTitle,
          department: s.department ? { code: s.department.code, name: s.department.name } : null,
          issuesSolved: solvedMap.get(String(s._id)) || 0,
          avgResponseHours: avgMs != null ? +(avgMs / 3600000).toFixed(1) : null,
          avgSatisfactionRating: sat?.avgRating != null ? +sat.avgRating.toFixed(1) : null,
          thumbsUpRate: sat?.count ? +((sat.thumbsUpCount / sat.count) * 100).toFixed(0) : null,
          satisfactionResponseCount: sat?.count || 0,
        };
      })
      .sort((a, b) => b.issuesSolved - a.issuesSolved);

    res.json({ success: true, performance });
  } catch (error) {
    console.error("getStaffPerformanceList error:", error);
    res.status(500).json({ success: false, message: "Failed to load staff performance" });
  }
};

export const getStaffPerformanceOne = async (req, res) => {
  try {
    const staffMember = await req.models.User.findOne({ _id: req.params.id, role: "staff" }).populate("department", "code name");
    if (!staffMember) return res.status(404).json({ success: false, message: "Staff not found" });

    const objId = staffMember._id;
    const [issuesSolved, satisfactionAgg, responseMap, recentIssues] = await Promise.all([
      req.models.Issue.countDocuments({ assignedTo: objId, status: { $in: ["Resolved", "Closed"] } }),
      req.models.Issue.aggregate([
        { $match: { assignedTo: objId, "feedback.submittedAt": { $ne: null } } },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$feedback.rating" },
            thumbsUpCount: { $sum: { $cond: ["$feedback.thumbsUp", 1, 0] } },
            count: { $sum: 1 },
          },
        },
      ]),
      buildResponseMap(req.models.Issue, { assignedTo: objId }),
      req.models.Issue.find({ assignedTo: objId })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select("title status updatedAt category feedback"),
    ]);

    const sat = satisfactionAgg[0];
    const avgMs = responseMap.get(String(objId));

    res.json({
      success: true,
      performance: {
        staff: {
          _id: staffMember._id,
          name: staffMember.name,
          email: staffMember.email,
          staffTitle: staffMember.staffTitle,
          department: staffMember.department ? { code: staffMember.department.code, name: staffMember.department.name } : null,
        },
        issuesSolved,
        avgResponseHours: avgMs != null ? +(avgMs / 3600000).toFixed(1) : null,
        avgSatisfactionRating: sat?.avgRating != null ? +sat.avgRating.toFixed(1) : null,
        thumbsUpRate: sat?.count ? +((sat.thumbsUpCount / sat.count) * 100).toFixed(0) : null,
        satisfactionResponseCount: sat?.count || 0,
        recentIssues,
      },
    });
  } catch (error) {
    console.error("getStaffPerformanceOne error:", error);
    res.status(500).json({ success: false, message: "Failed to load staff performance" });
  }
};
