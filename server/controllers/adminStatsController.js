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

// GET /api/admin/stats/assistant?days=30 — how the chatbot is doing: the
// figures a university weighs the assistant on (questions handled without a
// ticket, how often students found answers helpful, where the knowledge
// base has gaps).
export const getAssistantInsights = async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const [byTier, guestAnswers, feedback, handoffs, openGaps, topGaps, answeredBeforeTicket] = await Promise.all([
      // Student answers by retrieval confidence (chat messages are embedded).
      req.models.Chat.aggregate([
        { $match: { updatedAt: { $gte: since } } },
        { $unwind: "$messages" },
        { $match: { "messages.role": "assistant", "messages.timestamp": { $gte: since.getTime() } } },
        { $group: { _id: "$messages.confidenceTier", count: { $sum: 1 } } },
      ]),
      // Guest sessions live in memory, so the usage log is the record of
      // their answers (cached repeats are logged with provider "cache").
      req.models.AiUsageLog.countDocuments({ endpoint: "guest_chat", createdAt: { $gte: since } }),
      req.models.AnswerFeedback.aggregate([
        { $match: { createdAt: { $gte: since }, context: { $ne: "issue_form" } } },
        { $group: { _id: { userType: "$userType", helpful: "$helpful" }, count: { $sum: 1 } } },
      ]),
      req.models.Issue.countDocuments({ category: "chatbot_handoff", createdAt: { $gte: since } }),
      req.models.FailedQuestion.countDocuments({ resolvedAt: null }),
      req.models.FailedQuestion.aggregate([
        { $match: { resolvedAt: null, createdAt: { $gte: since } } },
        { $group: { _id: { $trim: { input: { $toLower: "$question" } } }, question: { $first: "$question" }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      // The new-issue form showed an answer and the student said it was what
      // they needed — a ticket that didn't have to be filed.
      req.models.AnswerFeedback.countDocuments({ context: "issue_form", helpful: true, createdAt: { $gte: since } }),
    ]);

    const tiers = { high: 0, medium: 0, low: 0, unknown: 0 };
    for (const row of byTier) tiers[row._id || "unknown"] = (tiers[row._id || "unknown"] || 0) + row.count;
    const studentAnswers = tiers.high + tiers.medium + tiers.low + tiers.unknown;

    const votes = { helpful: 0, unhelpful: 0, guestHelpful: 0, guestUnhelpful: 0 };
    for (const row of feedback) {
      const guest = row._id.userType === "guest";
      const key = row._id.helpful ? (guest ? "guestHelpful" : "helpful") : guest ? "guestUnhelpful" : "unhelpful";
      votes[key] += row.count;
    }
    const totalVotes = votes.helpful + votes.unhelpful + votes.guestHelpful + votes.guestUnhelpful;

    res.json({
      success: true,
      days,
      studentAnswers,
      guestAnswers,
      confidence: tiers,
      // Chats a student turned into a ticket to a department.
      handoffs,
      answeredBeforeTicket,
      feedback: {
        ...votes,
        total: totalVotes,
        helpfulRate: totalVotes ? (votes.helpful + votes.guestHelpful) / totalVotes : null,
      },
      openGaps,
      topGaps: topGaps.map((g) => ({ question: g.question, count: g.count })),
    });
  } catch (error) {
    console.error("getAssistantInsights error:", error);
    res.status(500).json({ success: false, message: "Failed to load assistant insights" });
  }
};
