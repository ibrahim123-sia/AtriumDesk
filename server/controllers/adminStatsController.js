export const getAdminStats = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [
      userTotals,
      usersByRole,
      blockedCount,
      flaggedCount,
      issueTotal,
      issuesByStatus,
      issuesLast7d,
      deptTotal,
      deptActive,
      chatTotal,
      recentSignups,
    ] = await Promise.all([
      req.models.User.countDocuments({}),
      req.models.User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      req.models.User.countDocuments({ isBlocked: true }),
      req.models.User.countDocuments({ "flags.0": { $exists: true } }),
      req.models.Issue.countDocuments({}),
      req.models.Issue.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      req.models.Issue.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      req.models.Department.countDocuments({}),
      req.models.Department.countDocuments({ isActive: true }),
      req.models.Chat.countDocuments({}),
      req.models.User.find({ role: "student" })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email createdAt isBlocked"),
    ]);

    const roleMap = usersByRole.reduce((acc, r) => ({ ...acc, [r._id || "student"]: r.count }), {});
    const statusMap = issuesByStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {});

    // Build a 7-day series (zero-fill missing days)
    const last7d = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = issuesLast7d.find((x) => x._id === key);
      last7d.push({ date: key, count: found ? found.count : 0 });
    }

    res.json({
      success: true,
      stats: {
        users: {
          total: userTotals,
          students: roleMap.student || 0,
          staff: roleMap.staff || 0,
          admins: roleMap.admin || 0,
          blocked: blockedCount,
          flagged: flaggedCount,
        },
        issues: {
          total: issueTotal,
          byStatus: {
            Pending: statusMap.Pending || 0,
            "In Progress": statusMap["In Progress"] || 0,
            Resolved: statusMap.Resolved || 0,
            Closed: statusMap.Closed || 0,
            Rejected: statusMap.Rejected || 0,
          },
          last7d,
        },
        departments: { total: deptTotal, active: deptActive },
        chats: { total: chatTotal },
        recentSignups,
      },
    });
  } catch (error) {
    console.error("getAdminStats error:", error);
    res.status(500).json({ success: false, message: "Failed to load stats" });
  }
};
