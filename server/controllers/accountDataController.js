// Rev 5 §13.3 — "Download my data" and "Delete my account", covering the
// whole profile. Completes the privacy story §5.3 starts for CVs.
import bcrypt from "bcryptjs";
import { fillFreedPlaces } from "./eventRsvpController.js";
import rateLimit from "express-rate-limit";
import { deleteUpload } from "../services/fileStore.js";

const DELETED_NAME = "Deleted student";
const DELETED_EMAIL = "deleted-account";

// GET /api/user/me/export — everything the system holds about the signed-in
// user, as one JSON download. Secrets (password hash, codes) and staff-only
// notes are never included: they're select:false on their schemas.
export const exportMyData = async (req, res) => {
  try {
    const userId = req.user._id;
    const [account, chats, issues, saved, notifications, answerRatings, eventRsvps, searchAlerts] = await Promise.all([
      req.models.User.findById(userId).populate("department", "code name").lean(),
      req.models.Chat.find({ userId }).sort({ createdAt: 1 }).lean(),
      req.models.Issue.find({ studentId: userId }).populate("department", "code name").sort({ createdAt: 1 }).lean(),
      req.models.SavedListing.find({ userId })
        .populate("listingId", "listingType title organization officialLink deadline status")
        .lean(),
      req.models.Notification.find({ userId }).sort({ createdAt: -1 }).limit(2000).lean(),
      req.models.AnswerFeedback.find({ userId }).lean(),
      req.models.EventRsvp.find({ userId }).populate("eventId", "title date location").lean(),
      req.models.SavedSearch.find({ userId }).lean(),
    ]);
    if (!account) return res.status(404).json({ success: false, message: "Account not found" });
    delete account.__v;
    delete account.staffPermissions;

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="my-data-${date}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      university: req.tenant?.branding?.universityName || req.tenant?.name || "",
      account,
      chats,
      issues,
      savedAndApplications: saved,
      notifications,
      answerRatings,
      eventRsvps,
      searchAlerts,
    });
  } catch (error) {
    console.error("exportMyData error:", error);
    res.status(500).json({ success: false, message: "Failed to export your data" });
  }
};

export const deleteAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.tenant?.slug || "?"}:${req.user?._id}`,
  message: { success: false, message: "Too many attempts — try again in a few minutes." },
});

// POST /api/user/me/delete { password } — a student deletes their own
// account. Their chats, saved items, notifications and ratings are deleted;
// issues stay with the departments that handled them (they're the
// university's record), with the student's name and email removed.
export const deleteMyAccount = async (req, res) => {
  if (req.user.role !== "student") {
    return res.status(403).json({
      success: false,
      message: "Staff and administrator accounts are removed by your university's administrator.",
    });
  }
  if (req.impersonatedBy) {
    return res.status(403).json({ success: false, message: "An account can't be deleted during support access." });
  }
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ success: false, message: "Enter your password to confirm" });
  try {
    const user = await req.models.User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "Account not found" });
    if (!(await bcrypt.compare(String(password), user.password))) {
      return res.status(401).json({ success: false, message: "Password is incorrect" });
    }
    const userId = user._id;
    // Their event places go to whoever is next on each waitlist.
    const heldPlaces = await req.models.EventRsvp.find({ userId, status: "going" }).select("eventId");
    await Promise.all([
      req.models.Chat.deleteMany({ userId }),
      req.models.SavedListing.deleteMany({ userId }),
      req.models.Notification.deleteMany({ userId }),
      req.models.AnswerFeedback.deleteMany({ userId }),
      req.models.EventRsvp.deleteMany({ userId }),
      req.models.SavedSearch.deleteMany({ userId }),
      req.models.PushSubscription.deleteMany({ userId }),
      req.models.FailedQuestion.updateMany({ userId }, { $set: { userId: null } }),
      req.models.AiUsageLog.updateMany({ userId }, { $set: { userId: null } }),
      req.models.LoginEvent.updateMany({ userId }, { $set: { email: DELETED_EMAIL } }),
      req.models.Issue.updateMany({ studentId: userId }, { $set: { studentName: DELETED_NAME, studentEmail: DELETED_EMAIL } }),
      req.models.Issue.updateMany(
        { "replies.authorId": userId },
        { $set: { "replies.$[r].authorName": DELETED_NAME } },
        { arrayFilters: [{ "r.authorId": userId }] }
      ),
    ]);
    if (user.profilePicture) deleteUpload(user.profilePicture);
    await req.models.User.deleteOne({ _id: userId });
    for (const { eventId } of heldPlaces) {
      const event = await req.models.Listing.findOne({ _id: eventId, listingType: "event" });
      if (event) await fillFreedPlaces(req.models, event, req.tenant).catch(() => {});
    }
    console.log(`Account deleted by its owner (tenant ${req.tenant?.slug})`);
    res.json({ success: true, message: "Your account has been deleted." });
  } catch (error) {
    console.error("deleteMyAccount error:", error);
    res.status(500).json({ success: false, message: "Failed to delete your account" });
  }
};
