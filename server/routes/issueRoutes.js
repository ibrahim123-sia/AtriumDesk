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
} from "../controllers/issueController.js";

const router = express.Router();

router.get("/department/stats", protect, requireRole("staff"), requireDepartment, getDeptStats);
router.get("/department/staff", protect, requireRole("staff"), requireDepartment, listDeptStaff);
router.get("/department", protect, requireRole("staff"), requireDepartment, getDeptIssues);
router.get("/department/:id", protect, requireRole("staff"), requireDepartment, getDeptIssueById);
router.patch("/department/:id/status", protect, requireRole("staff"), requireDepartment, updateIssueStatus);
router.patch("/department/:id/assign", protect, requireRole("staff"), requireDepartment, assignIssue);
router.post("/department/:id/sfo-reply", protect, requireRole("staff"), requireDepartment, addStaffReply);

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
router.post("/from-chat", protect, createIssueFromChat);
router.get("/:id", protect, getMyIssueById);
router.post("/:id/reply", protect, addStudentReply);
router.post("/:id/feedback", protect, submitIssueFeedback);

export default router;
