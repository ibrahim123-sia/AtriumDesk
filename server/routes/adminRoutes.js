import express from "express";
import { protect } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  listUsers,
  updateUser,
  blockUser,
  createStaffUser,
  updateStaffUser,
  deleteStaffUser,
  getUserActivity,
  importStudents,
} from "../controllers/adminController.js";
import { csvUpload, handleUploadError } from "../middlewares/upload.js";
import { getAdminStats } from "../controllers/adminStatsController.js";
import { getAdminHealth } from "../controllers/adminHealthController.js";
import {
  listAllIssues,
  getIssueAnalytics,
  getAdminIssue,
} from "../controllers/adminIssueController.js";
import { verifyAdmin, flagUser, sourcesDue, reportSourceRun } from "../controllers/internalController.js";
import {
  listListings,
  getListing,
  createListing,
  updateListing,
  approveListing,
  rejectListing,
  deleteListing,
  unmergeListingHandler,
} from "../controllers/adminListingController.js";
import {
  listSources,
  createSource,
  runSourceNow,
  pauseSource,
  resumeSource,
  deleteSource,
} from "../controllers/adminSourceController.js";
import {
  listAuditLogs,
  listLoginEvents,
  listChatLogs,
  getChatLog,
} from "../controllers/adminLogController.js";
import { getTenantSettings, updateTenantSettings } from "../controllers/tenantSettingsController.js";
import { getStaffPerformanceList, getStaffPerformanceOne } from "../controllers/adminStaffStatsController.js";
import { listFailedQuestions, resolveFailedQuestionGroup } from "../controllers/adminFailedQuestionController.js";
import {
  getContentSourceStatus,
  triggerContentScrape,
  reportContentScrapeResult,
} from "../controllers/adminContentSourceController.js";
import { auditAdminWrites } from "../middlewares/audit.js";
import { requireStaffPermission } from "../middlewares/requireStaffPermission.js";

const router = express.Router();

// Internal Python<->Node bridge. flag-user uses INTERNAL_SECRET only (no JWT).
// verify-admin requires the JWT to be valid AND role=admin AND internal secret.
router.post("/internal/flag-user", flagUser);
router.get("/internal/verify-admin", protect, verifyAdmin);
router.get("/internal/sources-due", sourcesDue);
router.post("/internal/sources/:sourceId/report", reportSourceRun);
router.post("/internal/content-scrape/report", reportContentScrapeResult);

// User request — Administrator can delegate specific admin capabilities
// (Data/Content/Query/Failed Questions) to a staff member instead of the
// previous all-or-nothing admin-only gate. `staff` now passes this blanket
// role check too; requireStaffPermission(key) below re-checks per route
// group, and everything NOT in the delegable set gets requireRole("admin")
// explicitly so it stays admin-only even though staff clears the role gate.
router.use(protect, requireRole("admin", "staff"));
router.use(auditAdminWrites);

router.get("/stats", requireRole("admin"), getAdminStats);
router.get("/health", requireRole("admin"), getAdminHealth);

router.get("/issues", requireStaffPermission("query"), listAllIssues);
router.get("/issues/analytics", requireStaffPermission("query"), getIssueAnalytics);
router.get("/issues/:id", requireStaffPermission("query"), getAdminIssue);

router.get("/failed-questions", requireStaffPermission("failedQuestions"), listFailedQuestions);
router.patch("/failed-questions/resolve", requireStaffPermission("failedQuestions"), resolveFailedQuestionGroup);

router.get("/listings", requireStaffPermission("content"), listListings);
router.post("/listings", requireStaffPermission("content"), createListing);
router.get("/listings/:id", requireStaffPermission("content"), getListing);
router.patch("/listings/:id", requireStaffPermission("content"), updateListing);
router.patch("/listings/:id/approve", requireStaffPermission("content"), approveListing);
router.patch("/listings/:id/reject", requireStaffPermission("content"), rejectListing);
router.post("/listings/:id/unmerge/:mergeEntryId", requireStaffPermission("content"), unmergeListingHandler);
router.delete("/listings/:id", requireStaffPermission("content"), deleteListing);

router.get("/sources", requireStaffPermission("content"), listSources);
router.post("/sources", requireStaffPermission("content"), createSource);
router.post("/sources/:id/run-now", requireStaffPermission("content"), runSourceNow);
router.patch("/sources/:id/pause", requireStaffPermission("content"), pauseSource);
router.patch("/sources/:id/resume", requireStaffPermission("content"), resumeSource);
router.delete("/sources/:id", requireStaffPermission("content"), deleteSource);

router.get("/users", requireRole("admin"), listUsers);
router.post("/users/import", requireRole("admin"), csvUpload.single("file"), handleUploadError, importStudents);
router.get("/users/:id/activity", requireRole("admin"), getUserActivity);
router.patch("/users/:id", requireRole("admin"), updateUser);
router.patch("/users/:id/block", requireRole("admin"), blockUser);
router.post("/staff", requireRole("admin"), createStaffUser);
router.get("/staff/performance", requireRole("admin"), getStaffPerformanceList);
router.get("/staff/:id/performance", requireRole("admin"), getStaffPerformanceOne);
router.patch("/staff/:id", requireRole("admin"), updateStaffUser);
router.delete("/staff/:id", requireRole("admin"), deleteStaffUser);

router.get("/logs/audit", requireRole("admin"), listAuditLogs);
router.get("/logs/logins", requireRole("admin"), listLoginEvents);
router.get("/logs/chats", requireRole("admin"), listChatLogs);
router.get("/logs/chats/:id", requireRole("admin"), getChatLog);

// Self-service branding (Rev 5 §11 / T1) — editable by this tenant's own
// Administrator, scoped to req.tenant via `protect`.
router.get("/tenant", requireRole("admin"), getTenantSettings);
router.patch("/tenant", requireRole("admin"), updateTenantSettings);
// Self-service chatbot KB scraping is part of the "data" (knowledge base)
// capability, same as the Python-side /chunks endpoints gated by
// verifyAdmin below — kept consistent so "data" means the whole Data page.
router.get("/content-source", requireStaffPermission("data"), getContentSourceStatus);
router.post("/content-source/scrape", requireStaffPermission("data"), triggerContentScrape);

export default router;
