import fs from "fs";
import path from "path";
import { notify } from "../services/notify.js";
import { suggestDepartment } from "../services/departmentSuggestion.js";

const cleanupFiles = (files) => {
  if (!files) return;
  for (const f of files) {
    fs.unlink(f.path, () => {});
  }
};

const buildAttachmentRecords = (files) => {
  if (!files) return [];
  return files.map((f) => ({
    filename: f.filename,
    originalName: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
    url: `/uploads/issues/${f.filename}`,
  }));
};

export const createIssue = async (req, res) => {
  const { title, description, category, departmentId } = req.body;

  if (!title || !description || !departmentId) {
    cleanupFiles(req.files);
    return res.status(400).json({
      success: false,
      message: "title, description, and departmentId are required",
    });
  }

  try {
    const dept = await req.models.Department.findById(departmentId);
    if (!dept || !dept.isActive) {
      cleanupFiles(req.files);
      return res.status(400).json({ success: false, message: "Invalid department" });
    }

    const issue = await req.models.Issue.create({
      studentId: req.user._id,
      studentName: req.user.name,
      studentEmail: req.user.email,
      department: dept._id,
      title: title.trim(),
      description: description.trim(),
      category: (category || "other").trim().toLowerCase(),
      attachments: buildAttachmentRecords(req.files),
    });

    const staff = await req.models.User.find({
      role: "staff",
      department: dept._id,
      isBlocked: false,
    });
    for (const s of staff) {
      notify(req.models.Notification, s, {
        type: "issue_created",
        issueId: issue._id,
        message: `New issue in ${dept.code}: ${issue.title}`,
        link: `/staff/issues/${issue._id}`,
        emailSubject: `[${dept.code}] New issue submitted`,
        emailHeading: "New issue assigned to your department",
        emailBody: `<strong>${issue.title}</strong><br/><br/>From: ${issue.studentName} (${issue.studentEmail})<br/>Category: ${issue.category}<br/><br/>${issue.description}`,
        branding: req.tenant?.branding,
        tenantSlug: req.tenant?.slug,
      });
    }

    res.status(201).json({ success: true, issue });
  } catch (error) {
    console.error("createIssue error:", error);
    cleanupFiles(req.files);
    res.status(500).json({ success: false, message: "Failed to create issue" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/issue/department-suggestion?question=...
//   Rev 5 §4.2 — used to pre-select a department in the handoff confirm
//   form before the student submits. Never blocks the flow: no examples
//   yet, or nothing similar enough, just means no pre-selection.
// ---------------------------------------------------------------------------

export const getDepartmentSuggestion = async (req, res) => {
  const { question } = req.query;
  if (!question || !question.trim()) {
    return res.status(400).json({ success: false, message: "question is required" });
  }
  try {
    const examples = await req.models.DepartmentExample.find({}, "question departmentId").lean();
    const suggestion = suggestDepartment(question, examples);
    res.json({ success: true, suggestedDepartmentId: suggestion?.departmentId || null });
  } catch (error) {
    console.error("getDepartmentSuggestion error:", error);
    res.status(500).json({ success: false, message: "Failed to compute suggestion" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/issue/from-chat
//   Rev 5 §4.2 chatbot->issue handoff — one click creates the issue with the
//   chat transcript attached, no retyping. Also records the department
//   example (for future suggestions) and, when the student overrode the
//   suggestion, a confusion-matrix data point (§4.2's "log the
//   suggested-vs-corrected pair").
// ---------------------------------------------------------------------------

const buildTranscript = (messages) =>
  (messages || [])
    .map((m) => `${m.role === "assistant" ? "Assistant" : "Student"}: ${m.content}`)
    .join("\n");

export const createIssueFromChat = async (req, res) => {
  const { chatId, departmentId, suggestedDepartmentId, title, description } = req.body;
  if (!chatId || !departmentId) {
    return res.status(400).json({ success: false, message: "chatId and departmentId are required" });
  }
  try {
    const dept = await req.models.Department.findById(departmentId);
    if (!dept || !dept.isActive) {
      return res.status(400).json({ success: false, message: "Invalid department" });
    }
    const chat = await req.models.Chat.findOne({ _id: chatId, userId: req.user._id });
    if (!chat) return res.status(404).json({ success: false, message: "Chat not found" });

    const lastUserMessage = [...chat.messages].reverse().find((m) => m.role === "user");
    const derivedTitle =
      (title && title.trim()) ||
      (lastUserMessage
        ? lastUserMessage.content.split(" ").slice(0, 8).join(" ")
        : "Question from chat");
    const transcript = buildTranscript(chat.messages);
    const finalDescription = `${(description || "").trim() || "Filed from a chatbot conversation the assistant couldn't fully answer."}\n\n--- Chat transcript ---\n${transcript}`;

    const issue = await req.models.Issue.create({
      studentId: req.user._id,
      studentName: req.user.name,
      studentEmail: req.user.email,
      department: dept._id,
      title: derivedTitle.slice(0, 200),
      description: finalDescription,
      category: "chatbot_handoff",
    });

    // Grows the example set from real usage (§4.2) regardless of whether
    // the student accepted or overrode the suggestion — either way this
    // question really did belong to `dept._id`.
    await req.models.DepartmentExample.create({
      question: lastUserMessage?.content || derivedTitle,
      departmentId: dept._id,
      suggestedDepartmentId: suggestedDepartmentId || null,
    });

    const staff = await req.models.User.find({ role: "staff", department: dept._id, isBlocked: false });
    for (const s of staff) {
      notify(req.models.Notification, s, {
        type: "issue_created",
        issueId: issue._id,
        message: `New issue in ${dept.code} (from chatbot): ${issue.title}`,
        link: `/staff/issues/${issue._id}`,
        emailSubject: `[${dept.code}] New issue submitted`,
        emailHeading: "New issue assigned to your department",
        emailBody: `<strong>${issue.title}</strong><br/><br/>From: ${issue.studentName} (${issue.studentEmail})<br/>Filed from a chatbot conversation.<br/><br/>${finalDescription.replace(/\n/g, "<br/>")}`,
        branding: req.tenant?.branding,
        tenantSlug: req.tenant?.slug,
      });
    }

    res.status(201).json({ success: true, issue });
  } catch (error) {
    console.error("createIssueFromChat error:", error);
    res.status(500).json({ success: false, message: "Failed to file a query from this chat" });
  }
};

export const getMyIssues = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { studentId: req.user._id };
    if (status) filter.status = status;
    const issues = await req.models.Issue.find(filter)
      .populate("department", "code name")
      .sort({ updatedAt: -1 });
    res.json({ success: true, issues });
  } catch (error) {
    console.error("getMyIssues error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch issues" });
  }
};

export const getMyIssueById = async (req, res) => {
  try {
    const issue = await req.models.Issue.findById(req.params.id).populate(
      "department",
      "code name"
    );
    if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });
    if (issue.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    res.json({ success: true, issue });
  } catch (error) {
    console.error("getMyIssueById error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch issue" });
  }
};

export const addStudentReply = async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: "Reply message is required" });
  }
  try {
    const issue = await req.models.Issue.findById(req.params.id).populate("department", "code name");
    if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });
    if (issue.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    issue.replies.push({
      authorId: req.user._id,
      authorName: req.user.name,
      authorRole: "student",
      message: message.trim(),
    });
    await issue.save();

    const staff = await req.models.User.find({
      role: "staff",
      department: issue.department._id,
      isBlocked: false,
    });
    for (const s of staff) {
      notify(req.models.Notification, s, {
        type: "issue_replied",
        issueId: issue._id,
        message: `Student replied on: ${issue.title}`,
        link: `/staff/issues/${issue._id}`,
        emailSubject: `[${issue.department.code}] Student replied`,
        emailHeading: "Student added a reply",
        emailBody: `<strong>${issue.title}</strong><br/><br/>${issue.studentName}: ${message.trim()}`,
        branding: req.tenant?.branding,
        tenantSlug: req.tenant?.slug,
      });
    }

    res.json({ success: true, issue });
  } catch (error) {
    console.error("addStudentReply error:", error);
    res.status(500).json({ success: false, message: "Failed to add reply" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/issue/:id/feedback
//   Rev 5 §4.4: "was this helpful?" — student-only, only after Resolved.
//   thumbsUp is required; rating/comment are optional. Overwrites on
//   resubmission (no product reason to lock it after one submit).
// ---------------------------------------------------------------------------

export const submitIssueFeedback = async (req, res) => {
  const { thumbsUp, rating, comment } = req.body;
  if (typeof thumbsUp !== "boolean") {
    return res.status(400).json({ success: false, message: "thumbsUp (boolean) is required" });
  }
  if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
    return res.status(400).json({ success: false, message: "rating must be between 1 and 5" });
  }
  try {
    const issue = await req.models.Issue.findById(req.params.id);
    if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });
    if (issue.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (issue.status !== "Resolved") {
      return res.status(400).json({ success: false, message: "Feedback can only be left on a resolved issue" });
    }
    issue.feedback = {
      thumbsUp,
      rating: rating ?? null,
      comment: (comment || "").trim(),
      submittedAt: new Date(),
    };
    await issue.save();
    res.json({ success: true, issue });
  } catch (error) {
    console.error("submitIssueFeedback error:", error);
    res.status(500).json({ success: false, message: "Failed to submit feedback" });
  }
};

export const getDeptStats = async (req, res) => {
  try {
    const deptId = req.user.department;
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 6);
    startOfWeek.setHours(0, 0, 0, 0);

    // -6, not -7: the zero-filled `series` below covers exactly 7 buckets
    // (today-6..today). $gte at -7 matched an 8th day whose count then had
    // nowhere to land in `series` and was silently dropped from the chart.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const [byStatus, resolvedThisWeek, repliesGiven, responseStats, satisfactionStats, last7d, recent] = await Promise.all([
      req.models.Issue.aggregate([
        { $match: { department: deptId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      req.models.Issue.countDocuments({
        department: deptId,
        status: { $in: ["Resolved", "Closed"] },
        updatedAt: { $gte: startOfWeek },
      }),
      req.models.Issue.aggregate([
        { $match: { department: deptId } },
        { $unwind: "$replies" },
        { $match: { "replies.authorId": req.user._id } },
        { $count: "count" },
      ]),
      // Avg time-to-first-staff-reply across this dept's issues that have one
      req.models.Issue.aggregate([
        { $match: { department: deptId, "replies.0": { $exists: true } } },
        {
          $project: {
            createdAt: 1,
            firstStaffReply: {
              $arrayElemAt: [
                {
                  $filter: {
                    input: "$replies",
                    as: "r",
                    cond: { $eq: ["$$r.authorRole", "staff"] },
                  },
                },
                0,
              ],
            },
          },
        },
        { $match: { firstStaffReply: { $ne: null } } },
        {
          $project: {
            durationMs: { $subtract: ["$firstStaffReply.createdAt", "$createdAt"] },
          },
        },
        { $group: { _id: null, avgMs: { $avg: "$durationMs" }, count: { $sum: 1 } } },
      ]),
      // Rev 5 §4.4: satisfaction rate alongside resolution rate, not
      // buried in a separate view — same Promise.all batch as everything else.
      req.models.Issue.aggregate([
        { $match: { department: deptId, "feedback.submittedAt": { $ne: null } } },
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
        { $match: { department: deptId, createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      req.models.Issue.find({ department: deptId })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select("title status studentName updatedAt category"),
    ]);

    const statusMap = byStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {});
    const total = Object.values(statusMap).reduce((a, b) => a + b, 0);

    // Build 7-day series (zero-fill)
    const series = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = last7d.find((x) => x._id === key);
      series.push({ date: key, count: found ? found.count : 0 });
    }

    res.json({
      success: true,
      stats: {
        total,
        byStatus: {
          Pending: statusMap.Pending || 0,
          "In Progress": statusMap["In Progress"] || 0,
          Resolved: statusMap.Resolved || 0,
          Closed: statusMap.Closed || 0,
          Rejected: statusMap.Rejected || 0,
        },
        resolvedThisWeek,
        repliesGivenByMe: repliesGiven[0]?.count || 0,
        // != null, not truthy — an instant (same-millisecond) first reply
        // gives avgMs === 0, which a truthy check wrongly reported as "no
        // data" (null) instead of the real value.
        avgResponseHours: responseStats[0]?.avgMs != null
          ? +(responseStats[0].avgMs / 3600000).toFixed(1)
          : null,
        avgSatisfactionRating: satisfactionStats[0]?.avgRating != null
          ? +satisfactionStats[0].avgRating.toFixed(1)
          : null,
        satisfactionResponseCount: satisfactionStats[0]?.count || 0,
        thumbsUpRate: satisfactionStats[0]?.count
          ? +((satisfactionStats[0].thumbsUpCount / satisfactionStats[0].count) * 100).toFixed(0)
          : null,
        last7d: series,
        recent,
      },
    });
  } catch (error) {
    console.error("getDeptStats error:", error);
    res.status(500).json({ success: false, message: "Failed to load stats" });
  }
};

const STAFF_ISSUE_POPULATE = [
  { path: "department", select: "code name" },
  { path: "assignedTo", select: "name email staffTitle" },
  { path: "lastEvent.byUserId", select: "name staffTitle" },
];

const ALLOWED_STATUSES = ["Pending", "In Progress", "Resolved", "Closed", "Rejected"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sameDept = (issue, user) =>
  issue.department._id.toString() === user.department.toString();

// Concurrency check: client passes the `updatedAt` it last saw; if the issue
// has changed since then, reject with 409 so the UI can show "updated by X".
const versionConflict = (issue, expectedUpdatedAt) => {
  if (!expectedUpdatedAt) return false;
  return new Date(issue.updatedAt).toISOString() !== new Date(expectedUpdatedAt).toISOString();
};

const conflictResponse = async (models, res, issueId) => {
  const fresh = await models.Issue.findById(issueId).populate(STAFF_ISSUE_POPULATE);
  const ev = fresh?.lastEvent || {};
  const who = ev.byName ? `${ev.byName}${ev.byRole === "staff" ? " (staff)" : ""}` : "another staff member";
  return res.status(409).json({
    success: false,
    code: "VERSION_CONFLICT",
    message: `This issue was just updated by ${who}. Refresh to see the latest before retrying.`,
    issue: fresh,
  });
};

const recordEvent = (issue, user, type, note = "", impersonatedBy = null) => {
  issue.lastEvent = {
    type,
    byUserId: user._id,
    byName: user.name,
    byRole: user.role,
    at: new Date(),
    note,
    impersonatedBySuperAdminEmail: impersonatedBy?.email || null,
  };
};

const notifyDeptStaffOthers = async (models, issue, currentUserId, payload) => {
  const others = await models.User.find({
    role: "staff",
    department: issue.department._id,
    isBlocked: false,
    _id: { $ne: currentUserId },
  });
  for (const s of others) notify(models.Notification, s, payload).catch(() => {});
};

// ---------------------------------------------------------------------------
// GET /api/issue/department
// ---------------------------------------------------------------------------

export const getDeptIssues = async (req, res) => {
  try {
    const { status, escalated } = req.query;
    const filter = { department: req.user.department };
    if (status) filter.status = status;
    if (escalated !== undefined) filter.escalated = escalated === "true";
    const issues = await req.models.Issue.find(filter)
      .populate(STAFF_ISSUE_POPULATE)
      .sort({ updatedAt: -1 });
    res.json({ success: true, issues });
  } catch (error) {
    console.error("getDeptIssues error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch issues" });
  }
};

export const getDeptIssueById = async (req, res) => {
  try {
    const issue = await req.models.Issue.findById(req.params.id).populate(STAFF_ISSUE_POPULATE);
    if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });
    if (!sameDept(issue, req.user)) {
      return res.status(403).json({ success: false, message: "Issue belongs to another department" });
    }
    res.json({ success: true, issue });
  } catch (error) {
    console.error("getDeptIssueById error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch issue" });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/issue/department/:id/status
//   Status-only update. Accepts optional `reason` (required for Rejected) and
//   optional `expectedUpdatedAt` for concurrency safety.
// ---------------------------------------------------------------------------

export const updateIssueStatus = async (req, res) => {
  const { status, reason, expectedUpdatedAt } = req.body;
  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
    });
  }
  if (status === "Rejected" && (!reason || !reason.trim())) {
    return res.status(400).json({
      success: false,
      message: "A reason is required when rejecting an issue.",
    });
  }
  try {
    const issue = await req.models.Issue.findById(req.params.id).populate("department", "code name");
    if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });
    if (!sameDept(issue, req.user)) {
      return res.status(403).json({ success: false, message: "Issue belongs to another department" });
    }
    if (versionConflict(issue, expectedUpdatedAt)) return conflictResponse(req.models, res, issue._id);
    if (issue.status === status) {
      const populated = await req.models.Issue.findById(issue._id).populate(STAFF_ISSUE_POPULATE);
      return res.json({ success: true, issue: populated, message: "Status unchanged" });
    }

    const previous = issue.status;
    issue.status = status;
    if (status === "Rejected") issue.rejectionReason = reason.trim();
    if (!issue.assignedTo) issue.assignedTo = req.user._id;
    if (!issue.firstStaffReplyAt) issue.firstStaffReplyAt = new Date();
    if (status === "Resolved" && previous !== "Resolved") issue.resolvedAt = new Date();
    recordEvent(issue, req.user, "status", `${previous} → ${status}`, req.impersonatedBy);
    await issue.save();

    // Notify the student
    const student = await req.models.User.findById(issue.studentId);
    if (student) {
      const reasonLine =
        status === "Rejected" && issue.rejectionReason
          ? `<br/><br/><strong>Reason:</strong> ${issue.rejectionReason}`
          : "";
      notify(req.models.Notification, student, {
        type: "issue_status_changed",
        issueId: issue._id,
        message: `Your issue "${issue.title}" is now ${status}`,
        link: `/issues/${issue._id}`,
        emailSubject: `Issue update: ${status}`,
        emailHeading: "Your issue status has changed",
        emailBody: `<strong>${issue.title}</strong><br/><br/>Status: ${previous} → <strong>${status}</strong><br/>Department: ${issue.department.code}${reasonLine}`,
        branding: req.tenant?.branding,
        tenantSlug: req.tenant?.slug,
      });
    }

    // Notify other dept staff (so they don't waste effort on a resolved item)
    await notifyDeptStaffOthers(req.models, issue, req.user._id, {
      type: "issue_status_changed",
      issueId: issue._id,
      message: `${req.user.name} marked "${issue.title}" as ${status}`,
      link: `/staff/issues/${issue._id}`,
      branding: req.tenant?.branding,
      tenantSlug: req.tenant?.slug,
    });

    const populated = await req.models.Issue.findById(issue._id).populate(STAFF_ISSUE_POPULATE);
    res.json({ success: true, issue: populated });
  } catch (error) {
    console.error("updateIssueStatus error:", error);
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/issue/department/:id/sfo-reply
//   Combined reply + optional status change. Reply text is required; if
//   `status` is also provided, it's applied in the same save (one DB round
//   trip, one student notification).
// ---------------------------------------------------------------------------

export const addStaffReply = async (req, res) => {
  const { message, status, reason, expectedUpdatedAt } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: "Reply message is required" });
  }
  if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
    });
  }
  if (status === "Rejected" && (!reason || !reason.trim())) {
    return res.status(400).json({
      success: false,
      message: "A reason is required when rejecting an issue.",
    });
  }
  try {
    const issue = await req.models.Issue.findById(req.params.id).populate("department", "code name");
    if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });
    if (!sameDept(issue, req.user)) {
      return res.status(403).json({ success: false, message: "Issue belongs to another department" });
    }
    if (versionConflict(issue, expectedUpdatedAt)) return conflictResponse(req.models, res, issue._id);

    const statusChanged = status && status !== issue.status;
    const previous = issue.status;

    issue.replies.push({
      authorId: req.user._id,
      authorName: req.user.name,
      authorRole: "staff",
      message: message.trim(),
    });
    if (statusChanged) {
      issue.status = status;
      if (status === "Rejected") issue.rejectionReason = reason.trim();
      if (status === "Resolved" && previous !== "Resolved") issue.resolvedAt = new Date();
    }
    if (!issue.assignedTo) issue.assignedTo = req.user._id;
    if (!issue.firstStaffReplyAt) issue.firstStaffReplyAt = new Date();

    recordEvent(
      issue,
      req.user,
      statusChanged ? "status" : "reply",
      statusChanged ? `${previous} → ${status} + reply` : "replied",
      req.impersonatedBy
    );
    await issue.save();

    // ONE combined notification to the student
    const student = await req.models.User.findById(issue.studentId);
    if (student) {
      const titlePrefix = statusChanged
        ? `${req.user.staffTitle || "Staff"} marked your issue ${status}`
        : `${req.user.staffTitle || "Staff"} replied on: ${issue.title}`;
      const reasonLine =
        statusChanged && status === "Rejected" && issue.rejectionReason
          ? `<br/><br/><strong>Reason:</strong> ${issue.rejectionReason}`
          : "";
      const statusLine = statusChanged
        ? `<br/><br/><strong>Status:</strong> ${previous} → ${status}${reasonLine}`
        : "";
      notify(req.models.Notification, student, {
        type: statusChanged ? "issue_status_changed" : "issue_replied",
        issueId: issue._id,
        message: titlePrefix,
        link: `/issues/${issue._id}`,
        emailSubject: statusChanged ? `Issue update: ${status}` : "New reply on your issue",
        emailHeading: titlePrefix,
        emailBody: `<strong>${issue.title}</strong>${statusLine}<br/><br/><strong>${req.user.name} (${issue.department.code}):</strong> ${message.trim()}`,
        branding: req.tenant?.branding,
        tenantSlug: req.tenant?.slug,
      });
    }

    // If status changed, let other dept staff know so two people don't
    // both try to handle the same item.
    if (statusChanged) {
      await notifyDeptStaffOthers(req.models, issue, req.user._id, {
        type: "issue_status_changed",
        issueId: issue._id,
        message: `${req.user.name} marked "${issue.title}" as ${status}`,
        link: `/staff/issues/${issue._id}`,
        branding: req.tenant?.branding,
        tenantSlug: req.tenant?.slug,
      });
    }

    const populated = await req.models.Issue.findById(issue._id).populate(STAFF_ISSUE_POPULATE);
    res.json({ success: true, issue: populated });
  } catch (error) {
    console.error("addStaffReply error:", error);
    res.status(500).json({ success: false, message: "Failed to add reply" });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/issue/department/:id/assign
//   Body: { assigneeId: <userId> | null, expectedUpdatedAt? }
//   Assigns the issue to a staff member in the same department, or unassigns
//   with null. The newly-assigned staff member gets a notification.
// ---------------------------------------------------------------------------

export const assignIssue = async (req, res) => {
  const { assigneeId, expectedUpdatedAt } = req.body;
  try {
    const issue = await req.models.Issue.findById(req.params.id).populate("department", "code name");
    if (!issue) return res.status(404).json({ success: false, message: "Issue not found" });
    if (!sameDept(issue, req.user)) {
      return res.status(403).json({ success: false, message: "Issue belongs to another department" });
    }
    if (versionConflict(issue, expectedUpdatedAt)) return conflictResponse(req.models, res, issue._id);

    let assigneeUser = null;
    if (assigneeId) {
      assigneeUser = await req.models.User.findById(assigneeId);
      if (
        !assigneeUser ||
        assigneeUser.role !== "staff" ||
        !assigneeUser.department ||
        assigneeUser.department.toString() !== req.user.department.toString() ||
        assigneeUser.isBlocked
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Assignee must be an active staff member in this department" });
      }
    }

    const previousId = issue.assignedTo ? issue.assignedTo.toString() : null;
    issue.assignedTo = assigneeUser ? assigneeUser._id : null;
    const note = assigneeUser
      ? `assigned to ${assigneeUser.name}`
      : "unassigned";
    recordEvent(issue, req.user, "assign", note, req.impersonatedBy);
    await issue.save();

    // Notify the new assignee (unless it's themselves)
    if (assigneeUser && assigneeUser._id.toString() !== req.user._id.toString()) {
      notify(req.models.Notification, assigneeUser, {
        type: "issue_assigned",
        issueId: issue._id,
        message: `${req.user.name} assigned "${issue.title}" to you`,
        link: `/staff/issues/${issue._id}`,
        emailSubject: `[${issue.department.code}] Issue assigned to you`,
        emailHeading: "An issue was assigned to you",
        emailBody: `<strong>${issue.title}</strong><br/><br/>Assigned by: ${req.user.name}<br/>Department: ${issue.department.code}`,
        branding: req.tenant?.branding,
        tenantSlug: req.tenant?.slug,
      }).catch(() => {});
    }
    // Also tell the previous assignee (if any) it's been taken off their plate
    if (previousId && previousId !== req.user._id.toString() && previousId !== (assigneeUser?._id.toString() || "")) {
      const prev = await req.models.User.findById(previousId);
      if (prev) {
        notify(req.models.Notification, prev, {
          type: "issue_assigned",
          issueId: issue._id,
          message: `${req.user.name} reassigned "${issue.title}"`,
          link: `/staff/issues/${issue._id}`,
          branding: req.tenant?.branding,
          tenantSlug: req.tenant?.slug,
        }).catch(() => {});
      }
    }

    const populated = await req.models.Issue.findById(issue._id).populate(STAFF_ISSUE_POPULATE);
    res.json({ success: true, issue: populated });
  } catch (error) {
    console.error("assignIssue error:", error);
    res.status(500).json({ success: false, message: "Failed to assign issue" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/issue/department/staff
//   Returns the list of staffers in the current user's department, for the
//   reassign dropdown.
// ---------------------------------------------------------------------------

export const listDeptStaff = async (req, res) => {
  try {
    const staff = await req.models.User.find({
      role: "staff",
      department: req.user.department,
      isBlocked: false,
    })
      .select("name email staffTitle")
      .sort({ name: 1 });
    res.json({ success: true, staff });
  } catch (error) {
    console.error("listDeptStaff error:", error);
    res.status(500).json({ success: false, message: "Failed to load staff" });
  }
};
