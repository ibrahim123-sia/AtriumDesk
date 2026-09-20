import express from "express";
import { protectPlatform } from "../middlewares/platformAuth.js";
import { auditPlatformWrites } from "../middlewares/auditPlatformWrites.js";
import { tenantLogoUpload, handleUploadError } from "../middlewares/upload.js";
import {
  loginSuperAdmin,
  superAdminLoginLimiter,
  listTenants,
  getTenantHealth,
  createTenant,
  suspendTenant,
  reactivateTenant,
  updateTenantBilling,
  updateTenantFeatures,
  updateTenant,
  impersonateTenantAdmin,
  listAuditLogs,
  getPlatformHealth,
  getTenantAnalytics,
  getDashboard,
  getUsage,
} from "../controllers/platformController.js";

const router = express.Router();

// Deliberately its own top-level namespace, never mounted under /api/admin —
// Super Admin's routes must never be reachable via the tenant-scoped
// requireRole("admin") check, and vice versa (Rev7 §5.9).
router.post("/auth/login", superAdminLoginLimiter, loginSuperAdmin);

router.use(protectPlatform);
router.use(auditPlatformWrites);

router.get("/dashboard", getDashboard);
router.get("/usage", getUsage);
router.get("/tenants", listTenants);
router.post("/tenants", tenantLogoUpload.single("logo"), handleUploadError, createTenant);
router.get("/tenants/:slug/health", getTenantHealth);
router.get("/tenants/:slug/analytics", getTenantAnalytics);
router.patch("/tenants/:slug", updateTenant);
router.patch("/tenants/:slug/suspend", suspendTenant);
router.patch("/tenants/:slug/reactivate", reactivateTenant);
router.patch("/tenants/:slug/billing", updateTenantBilling);
router.patch("/tenants/:slug/features", tenantLogoUpload.single("logo"), handleUploadError, updateTenantFeatures);
router.post("/tenants/:slug/impersonate", impersonateTenantAdmin);
router.get("/health", getPlatformHealth);
router.get("/audit-logs", listAuditLogs);

export default router;
