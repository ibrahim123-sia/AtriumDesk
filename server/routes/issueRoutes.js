import express from "express";
import { protect } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { requireDepartment } from "../middlewares/requireDepartment.js";
import { issueUpload, handleUploadError } from "../middlewares/upload.js";
import {
  createIssue,
  getMyIssues,
  getMyIssueById,
  addStudentReply,
  getDeptIssues,
  getDeptIssueById,
  updateIssueStatus,
  addStaffReply,
  getDeptStats,
  assignIssue,
  listDeptStaff,
  submitIssueFeedback,
  getDepartmentSuggestion,
  createIssueFromChat,
  addInternalNote,
  transferIssue,
  listTransferTargets,
  listSavedReplies,
  createSavedReply,
  updateSavedReply,
  deleteSavedReply,
  answerSuggestionLimiter,
  getAnswerSuggestion,
  recordAnswerSuggestionHelped,
  draftReplyLimiter,
  draftStaffReply,
} from "../controllers/issueController.js";

const router = express.Router();

router.get("/department/stats", protect, requireRole("staff"), requireDepartment, getDeptStats);
router.get("/department/staff", protect, requireRole("staff"), requireDepartment, listDeptStaff);
router.get("/department/targets", protect, requireRole("staff"), requireDepartment, listTransferTargets);
router.get("/department/saved-replies", protect, requireRole("staff"), requireDepartment, listSavedReplies);
router.post("/department/saved-replies", protect, requireRole("staff"), requireDepartment, createSavedReply);
router.put("/department/saved-replies/:replyId", protect, requireRole("staff"), requireDepartment, updateSavedReply);
router.delete("/department/saved-replies/:replyId", protect, requireRole("staff"), requireDepartment, deleteSavedReply);
router.get("/department", protect, requireRole("staff"), requireDepartment, getDeptIssues);
router.get("/department/:id", protect, requireRole("staff"), requireDepartment, getDeptIssueById);
router.patch("/department/:id/status", protect, requireRole("staff"), requireDepartment, updateIssueStatus);
router.patch("/department/:id/assign", protect, requireRole("staff"), requireDepartment, assignIssue);
router.post("/department/:id/sfo-reply", protect, requireRole("staff"), requireDepartment, addStaffReply);
router.post("/department/:id/notes", protect, requireRole("staff"), requireDepartment, addInternalNote);
router.patch("/department/:id/transfer", protect, requireRole("staff"), requireDepartment, transferIssue);
router.post("/department/:id/draft-reply", protect, requireRole("staff"), requireDepartment, draftReplyLimiter, draftStaffReply);

router.post(
  "/",
  protect,
  requireRole("student", "staff", "admin"),
  issueUpload.array("attachments", 3),
  handleUploadError,
  createIssue
);
router.get("/my", protect, getMyIssues);
router.get("/department-suggestion", protect, getDepartmentSuggestion);
router.get("/answer-suggestion", protect, requireRole("student"), answerSuggestionLimiter, getAnswerSuggestion);
router.post("/answer-suggestion/feedback", protect, requireRole("student"), recordAnswerSuggestionHelped);
router.post("/from-chat", protect, createIssueFromChat);
router.get("/:id", protect, getMyIssueById);
router.post("/:id/reply", protect, addStudentReply);
router.post("/:id/feedback", protect, submitIssueFeedback);

export default router;
