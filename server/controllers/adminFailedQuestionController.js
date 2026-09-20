/**
 * Rev 5 §4.3 — admin view of the failed-question log. Grouped by normalized
 * text (case/whitespace-insensitive exact match) so near-literal repeats
 * ("what is the fee for bscs" asked 14 times) collapse into one row with a
 * count, per the spec's own worked example. Topic-similarity clustering via
 * the existing sentence-transformer embeddings is a natural next step once
 * this simpler grouping proves useful — same "start simple, measure" call
 * made elsewhere in this codebase (§13.2's golden set, §8.8.2's synonym map).
 *
 * §19.7 — guest and student gaps are grouped SEPARATELY, not merged into one
 * row keyed on text alone. They're a different signal: a student gap is
 * missing operational content the university already has; a guest gap is
 * missing admissions content the university may not know applicants want.
 * Merging them (as this used to) hid which signal a given row actually was.
 */

export const listFailedQuestions = async (req, res) => {
  try {
    const { resolved, userType } = req.query;
    const match = {};
    if (resolved === "true") match.resolvedAt = { $ne: null };
    if (resolved === "false") match.resolvedAt = null;
    if (userType === "guest" || userType === "student") match.userType = userType;

    const rows = await req.models.FailedQuestion.aggregate([
      { $match: match },
      {
        $addFields: {
          normalized: {
            $trim: { input: { $toLower: "$question" } },
          },
        },
      },
      {
        $group: {
          _id: { normalized: "$normalized", userType: "$userType" },
          exampleQuestion: { $first: "$question" },
          count: { $sum: 1 },
          lastAskedAt: { $max: "$createdAt" },
          firstAskedAt: { $min: "$createdAt" },
          resolvedCount: { $sum: { $cond: [{ $ne: ["$resolvedAt", null] }, 1, 0] } },
          ids: { $push: "$_id" },
        },
      },
      { $sort: { count: -1, lastAskedAt: -1 } },
      { $limit: 100 },
    ]);

    res.json({
      success: true,
      groups: rows.map((r) => ({
        question: r.exampleQuestion,
        userType: r._id.userType,
        count: r.count,
        lastAskedAt: r.lastAskedAt,
        firstAskedAt: r.firstAskedAt,
        isResolved: r.resolvedCount === r.count,
        ids: r.ids,
      })),
    });
  } catch (error) {
    console.error("listFailedQuestions error:", error);
    res.status(500).json({ success: false, message: "Failed to load failed-question log" });
  }
};

// Marks every row in a normalized-text group as resolved — the admin has
// added content to the knowledge base that should now answer it.
export const resolveFailedQuestionGroup = async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: "ids (array) is required" });
  }
  try {
    await req.models.FailedQuestion.updateMany(
      { _id: { $in: ids } },
      { $set: { resolvedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error("resolveFailedQuestionGroup error:", error);
    res.status(500).json({ success: false, message: "Failed to mark as resolved" });
  }
};
