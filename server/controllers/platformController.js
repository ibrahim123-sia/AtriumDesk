import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getSuperAdminUserModel } from "../models/platform/SuperAdminUser.js";
import { getTenantModel } from "../models/platform/Tenant.js";
import { getTenantConnection } from "../config/tenantDb.js";
import { getTenantModels } from "../models/registry.js";
import { generatePlatformToken } from "../middlewares/platformAuth.js";
import { getPlatformAuditLogModel } from "../models/platform/PlatformAuditLog.js";
import { invalidateTenantCache } from "../services/tenantRegistry.js";
import { findRedosRisk } from "../services/regexSafety.js";
import jwt from "jsonwebtoken";

const DAY_MS = 24 * 60 * 60 * 1000;

// Unlike tenant loginUser, /platform/auth/login had NO throttling at all —
// the single highest-privilege credential on the platform (full cross-tenant
// access + impersonation) could be brute-forced with unlimited guesses.
// IP-based since there's no tenant concept to key on here.
export const superAdminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKeyGenerator(req.ip || ""),
});

// Per-email lockout on top of the IP limiter (catches a spray from many
// IPs against one known Super Admin email) — mirrors userController.js's
// LOGIN_LOCKOUT pattern, reading from PlatformAuditLog instead of a
// SuperAdminUser field so a counter can never be silently dropped the way
// Rev 6 finding #1 found for the old user.loginAttempts field.
const SUPERADMIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const SUPERADMIN_LOCKOUT_THRESHOLD = 5;

const recordSuperAdminLogin = (req, email, success) =>
  getPlatformAuditLogModel()
    .create({
      action: success ? "superadmin_login_success" : "superadmin_login_failed",
      actorEmail: email,
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    })
    .catch((err) => console.error("recordSuperAdminLogin failed:", err.message));

export const loginSuperAdmin = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }
  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const PlatformAuditLog = getPlatformAuditLogModel();

    const windowStart = new Date(Date.now() - SUPERADMIN_LOCKOUT_WINDOW_MS);
    const lastSuccess = await PlatformAuditLog.findOne({
      actorEmail: normalizedEmail,
      action: "superadmin_login_success",
    }).sort({ createdAt: -1 }).select("createdAt");
    const failuresSince = lastSuccess && lastSuccess.createdAt > windowStart
      ? lastSuccess.createdAt
      : windowStart;
    const recentFailures = await PlatformAuditLog.countDocuments({
      actorEmail: normalizedEmail,
      action: "superadmin_login_failed",
      createdAt: { $gte: failuresSince },
    });
    if (recentFailures >= SUPERADMIN_LOCKOUT_THRESHOLD) {
      return res.status(429).json({
        success: false,
        message: "Account temporarily locked due to too many failed attempts. Try again in 15 minutes.",
      });
    }

    const SuperAdminUser = getSuperAdminUserModel();
    const admin = await SuperAdminUser.findOne({ email: normalizedEmail }).select("+password");
    if (!admin || !admin.isActive) {
      recordSuperAdminLogin(req, normalizedEmail, false);
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      recordSuperAdminLogin(req, normalizedEmail, false);
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    recordSuperAdminLogin(req, normalizedEmail, true);
    const token = generatePlatformToken(admin._id);
    return res.json({
      success: true,
      token,
      superAdmin: { _id: admin._id, name: admin.name, email: admin.email },
    });
  } catch (error) {
    console.error("loginSuperAdmin error:", error);
    return res.status(500).json({ success: false, message: "Server error during login" });
  }
};

export const listTenants = async (req, res) => {
  try {
    const Tenant = getTenantModel();
    const tenants = await Tenant.find({}).sort({ createdAt: -1 });
    res.json({ success: true, tenants });
  } catch (error) {
    console.error("listTenants error:", error);
    res.status(500).json({ success: false, message: "Failed to list tenants" });
  }
};

// Rev7 §6/T2 — "full tenant-creation wizard (replaces manual seedAdmin.js +
// .env editing)." Same two steps seedTenant.js does as a one-shot CLI
// script, exposed as a real HTTP endpoint: create the Tenant registry row
// on a FRESH database name (never the caller's own default connection —
// that would collide with whichever tenant happens to be seeded there),
// then seed its first Administrator inside that new tenant's own database.
export const createTenant = async (req, res) => {
  const { slug, name, emailDomains, staffEmailDomainPattern, adminEmail, adminPassword, adminName } = req.body || {};
  if (!slug || !name || !adminEmail || !adminPassword || !adminName) {
    return res.status(400).json({ success: false, message: "slug, name, adminEmail, adminPassword and adminName are required" });
  }
  // multipart/form-data (needed for the optional logo file) arrives with
  // nested objects JSON-stringified by the client; a plain JSON request
  // (no file) sends them as real objects already — accept both.
  const parseMaybeJson = (value, fallback) => {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch { return fallback; }
  };
  const branding = parseMaybeJson(req.body.branding, {});
  const enabledFeatures = parseMaybeJson(req.body.enabledFeatures, {});
  const normalizedSlug = String(slug).toLowerCase().trim();
  if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
    return res.status(400).json({ success: false, message: "slug must be lowercase letters, numbers, and hyphens only" });
  }
  if (String(adminPassword).length < 6) {
    return res.status(400).json({ success: false, message: "adminPassword must be at least 6 characters" });
  }

  try {
    const Tenant = getTenantModel();
    const existing = await Tenant.findOne({ slug: normalizedSlug });
    if (existing) return res.status(409).json({ success: false, message: `Tenant "${normalizedSlug}" already exists` });

    const dbName = `uniassist_${normalizedSlug}`;
    const chromaCollection = `chunks_${normalizedSlug}`;
    const domains = Array.isArray(emailDomains)
      ? emailDomains.map((d) => d.toLowerCase().trim()).filter(Boolean)
      : String(emailDomains || "").split(",").map((d) => d.toLowerCase().trim()).filter(Boolean);

    // Login resolves which tenant an email belongs to purely by domain
    // (resolveTenantForEmail in userController.js) — without this check, a
    // typo'd or mismatched adminEmail silently creates an Administrator who
    // can never log in, since their own email doesn't resolve to the
    // tenant that was just provisioned for them.
    const adminDomain = String(adminEmail).split("@")[1]?.toLowerCase().trim();
    if (domains.length > 0 && !domains.includes(adminDomain)) {
      return res.status(400).json({
        success: false,
        message: `adminEmail's domain ("${adminDomain}") must be one of the tenant's own emailDomains (${domains.join(", ")}), or the Administrator will never be able to log in.`,
      });
    }

    const tenant = await Tenant.create({
      slug: normalizedSlug,
      name,
      status: "provisioning",
      dbName,
      chromaCollection,
      emailDomains: domains,
      staffEmailDomainPattern: staffEmailDomainPattern || "",
      branding: {
        universityName: branding?.universityName || name,
        universityShort: branding?.universityShort || normalizedSlug.toUpperCase(),
        logoUrl: req.file ? `/uploads/tenant-logos/${req.file.filename}` : (branding?.logoUrl || ""),
        primaryColor: branding?.primaryColor || "",
        supportEmail: branding?.supportEmail || "",
      },
      enabledFeatures: {
        scholarships: enabledFeatures.scholarships !== false,
        jobs: enabledFeatures.jobs !== false,
        events: enabledFeatures.events !== false,
        chatbot: enabledFeatures.chatbot !== false,
      },
    });

    const connection = getTenantConnection(dbName);
    const models = getTenantModels(connection);
    const hashed = await bcrypt.hash(adminPassword, await bcrypt.genSalt(10));
    const admin = await models.User.create({
      name: adminName,
      email: String(adminEmail).toLowerCase().trim(),
      password: hashed,
      role: "admin",
      isVerified: true,
    });

    tenant.provisionedAdministrator = admin._id;
    tenant.status = "active";
    await tenant.save();
    invalidateTenantCache();

    res.status(201).json({ success: true, tenant });
  } catch (error) {
    console.error("createTenant error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create tenant" });
  }
};

// Rev7 §6/T2 — tenant suspend/reactivate. Suspension is a status flip only
// (never a delete). Enforcement lives in two places: `protect` (every
// authenticated request) already checked tenant.status, and login itself
// was found — via live T2/T3 testing — to be missing the same check
// (userController.js's loginUser, fixed alongside this endpoint). Also must
// invalidate tenantRegistry's 60s cache immediately, or a freshly-suspended
// tenant keeps resolving as active until the cache expires.
export const suspendTenant = async (req, res) => {
  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOneAndUpdate(
      { slug: req.params.slug },
      { status: "suspended" },
      { new: true }
    );
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });
    invalidateTenantCache();
    res.json({ success: true, tenant });
  } catch (error) {
    console.error("suspendTenant error:", error);
    res.status(500).json({ success: false, message: "Failed to suspend tenant" });
  }
};

export const reactivateTenant = async (req, res) => {
  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOneAndUpdate(
      { slug: req.params.slug },
      { status: "active" },
      { new: true }
    );
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });
    invalidateTenantCache();
    res.json({ success: true, tenant });
  } catch (error) {
    console.error("reactivateTenant error:", error);
    res.status(500).json({ success: false, message: "Failed to reactivate tenant" });
  }
};

// Rev7 user request — Super Admin toggles which modules a tenant gets,
// and can replace its logo, after creation (not just at wizard time).
export const updateTenantFeatures = async (req, res) => {
  const parseMaybeJson = (value, fallback) => {
    if (value === undefined) return fallback;
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch { return fallback; }
  };
  const enabledFeatures = parseMaybeJson(req.body.enabledFeatures, {});
  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    for (const key of ["scholarships", "jobs", "events", "chatbot"]) {
      if (enabledFeatures[key] !== undefined) {
        tenant.enabledFeatures[key] = !!enabledFeatures[key];
      }
    }
    if (req.body.primaryColor !== undefined) {
      tenant.branding.primaryColor = req.body.primaryColor;
    }
    if (req.file) {
      tenant.branding.logoUrl = `/uploads/tenant-logos/${req.file.filename}`;
    }
    await tenant.save();
    invalidateTenantCache();
    res.json({ success: true, tenant });
  } catch (error) {
    console.error("updateTenantFeatures error:", error);
    res.status(500).json({ success: false, message: "Failed to update tenant features" });
  }
};

// Rev7 §6/T3 — billing schema fields, no payment integration. Super Admin
// edits these directly; nothing here charges a card or enforces a plan.
export const updateTenantBilling = async (req, res) => {
  const { plan, billingEmail, maxUsers, trialEndsAt } = req.body || {};
  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    if (plan !== undefined) tenant.billing.plan = plan;
    if (billingEmail !== undefined) tenant.billing.billingEmail = billingEmail;
    if (maxUsers !== undefined) tenant.billing.maxUsers = maxUsers;
    if (trialEndsAt !== undefined) tenant.billing.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
    await tenant.save();

    res.json({ success: true, tenant });
  } catch (error) {
    console.error("updateTenantBilling error:", error);
    res.status(500).json({ success: false, message: "Failed to update billing" });
  }
};

// Rev7 §6/T3 — support-access/impersonation, "wanted at all?" resolved yes
// per explicit instruction to complete T3. Deliberately conservative: a
// SHORT-LIVED (1h) real tenant JWT for the tenant's own provisioned
// Administrator — never a new privilege, never a standing credential — and
// explicitly audit-logged with actor+target beyond auditPlatformWrites'
// generic request log, since "who did we let view as whom" must be
// independently reconstructable from the audit trail alone.
export const impersonateTenantAdmin = async (req, res) => {
  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });
    if (!tenant.provisionedAdministrator) {
      return res.status(400).json({ success: false, message: "Tenant has no provisioned Administrator to impersonate" });
    }

    const connection = getTenantConnection(tenant.dbName);
    const models = getTenantModels(connection);
    const admin = await models.User.findById(tenant.provisionedAdministrator);
    if (!admin) return res.status(404).json({ success: false, message: "Provisioned Administrator not found" });

    // impersonatedBy/impersonatedByEmail — user request: every write made
    // during this session must be traceable back to the real Super Admin,
    // not just the impersonated Administrator identity. `protect` reads
    // these claims and attaches them to req.impersonatedBy; auditAdminWrites
    // and issueController.js's recordEvent both surface them.
    const token = jwt.sign(
      {
        id: admin._id.toString(),
        tenantSlug: tenant.slug,
        impersonatedBy: req.superAdmin._id.toString(),
        impersonatedByEmail: req.superAdmin.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    try {
      const PlatformAuditLog = getPlatformAuditLogModel();
      await PlatformAuditLog.create({
        actor: req.superAdmin._id,
        actorEmail: req.superAdmin.email,
        action: "impersonate_tenant_admin",
        method: req.method,
        path: req.originalUrl,
        targetType: "Tenant",
        targetId: tenant.slug,
        payload: { impersonatedAdminId: admin._id.toString(), impersonatedAdminEmail: admin.email },
        statusCode: 200,
        ip: req.ip,
      });
    } catch (auditError) {
      console.error("impersonateTenantAdmin: audit log write failed", auditError.message);
    }

    res.json({
      success: true,
      token,
      admin: { _id: admin._id, name: admin.name, email: admin.email, role: admin.role, department: admin.department, staffTitle: admin.staffTitle },
      tenant: { slug: tenant.slug, name: tenant.name, branding: tenant.branding },
    });
  } catch (error) {
    console.error("impersonateTenantAdmin error:", error);
    res.status(500).json({ success: false, message: "Failed to start impersonation" });
  }
};

// Rev7 §5.8 — the audit log this whole layer writes to was write-only until
// now; a Super Admin needs to actually read it back.
export const listAuditLogs = async (req, res) => {
  try {
    const PlatformAuditLog = getPlatformAuditLogModel();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await PlatformAuditLog.find({}).sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, logs });
  } catch (error) {
    console.error("listAuditLogs error:", error);
    res.status(500).json({ success: false, message: "Failed to load audit logs" });
  }
};

// Rev7 §5/T2+T3 — "cross-tenant health dashboard aggregating Rev 5 §9.4's
// per-source health one level up." Iterates every tenant (not just one, per
// getTenantHealth below), pings each database, and rolls up its Source
// collection's own health fields (already tracked per-source since Phase 4)
// into one summary row per tenant.
export const getPlatformHealth = async (req, res) => {
  try {
    const Tenant = getTenantModel();
    const tenants = await Tenant.find({});

    const results = await Promise.all(
      tenants.map(async (tenant) => {
        let dbReachable = false;
        let dbError = null;
        let sources = { total: 0, active: 0, failing: 0, paused: 0 };
        try {
          const connection = getTenantConnection(tenant.dbName);
          await connection.asPromise?.();
          await connection.db.command({ ping: 1 });
          dbReachable = true;

          const models = getTenantModels(connection);
          const rows = await models.Source.find({}).select("status");
          sources.total = rows.length;
          for (const row of rows) {
            if (row.status === "active") sources.active += 1;
            else if (row.status === "failing") sources.failing += 1;
            else if (row.status === "paused") sources.paused += 1;
          }
        } catch (err) {
          dbError = err.message;
        }

        return {
          slug: tenant.slug,
          name: tenant.name,
          status: tenant.status,
          dbReachable,
          dbError,
          sources,
        };
      })
    );

    res.json({ success: true, tenants: results });
  } catch (error) {
    console.error("getPlatformHealth error:", error);
    res.status(500).json({ success: false, message: "Failed to load platform health" });
  }
};

// T0 scope: DB reachability is checked for real. ChromaDB collection
// existence is reported as declared, not yet verified — a Node<->Python
// health bridge for that is later work (Rev7 §5, cross-tenant health
// dashboard, T2/T3), not required for T0's own verification.
export const getTenantHealth = async (req, res) => {
  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    let dbReachable = false;
    let dbError = null;
    try {
      const connection = getTenantConnection(tenant.dbName);
      await connection.asPromise?.();
      await connection.db.command({ ping: 1 });
      dbReachable = true;
    } catch (err) {
      dbError = err.message;
    }

    res.json({
      success: true,
      health: {
        slug: tenant.slug,
        status: tenant.status,
        dbName: tenant.dbName,
        dbReachable,
        dbError,
        chromaCollection: tenant.chromaCollection,
        chromaVerified: false,
      },
    });
  } catch (error) {
    console.error("getTenantHealth error:", error);
    res.status(500).json({ success: false, message: "Failed to check tenant health" });
  }
};

// User request — Super Admin previously could only toggle enabledFeatures/
// primaryColor/logo (updateTenantFeatures above); everything else (name,
// email domains, staff/student email patterns, remaining branding fields)
// required impersonating that tenant's own Administrator and using THEIR
// Settings page. Same field list and validation as the Administrator-facing
// tenantSettingsController.js#updateTenantSettings — just authorized as
// Super Admin instead of req.tenant, and deliberately WITHOUT smtp (a
// tenant's own email credentials stay the Administrator's own concern).
const EDITABLE_BRANDING_FIELDS = ["universityName", "universityShort", "logoUrl", "primaryColor", "supportEmail"];

export const updateTenant = async (req, res) => {
  const { name, branding, emailDomains, staffEmailDomainPattern, studentEmailPattern } = req.body || {};
  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ success: false, message: "name cannot be empty" });
      tenant.name = trimmed;
    }

    if (branding && typeof branding === "object") {
      for (const key of EDITABLE_BRANDING_FIELDS) {
        if (branding[key] !== undefined) tenant.branding[key] = String(branding[key]).trim();
      }
    }

    if (emailDomains !== undefined) {
      if (!Array.isArray(emailDomains)) {
        return res.status(400).json({ success: false, message: "emailDomains must be an array" });
      }
      const normalized = [...new Set(emailDomains.map((d) => String(d).trim().toLowerCase()).filter(Boolean))];
      if (normalized.length === 0) {
        return res.status(400).json({ success: false, message: "At least one email domain is required" });
      }
      const claimed = await Tenant.findOne({ _id: { $ne: tenant._id }, emailDomains: { $in: normalized } });
      if (claimed) {
        return res.status(409).json({
          success: false,
          message: "One or more of these domains is already registered to another university on this platform",
        });
      }
      tenant.emailDomains = normalized;
    }

    if (staffEmailDomainPattern !== undefined) {
      tenant.staffEmailDomainPattern = String(staffEmailDomainPattern).trim();
    }

    if (studentEmailPattern !== undefined) {
      const trimmed = String(studentEmailPattern).trim();
      if (trimmed) {
        try {
          new RegExp(`^${trimmed}$`);
        } catch (e) {
          return res.status(400).json({ success: false, message: `Invalid regular expression: ${e.message}` });
        }
        const redosRisk = findRedosRisk(trimmed);
        if (redosRisk) {
          return res.status(400).json({ success: false, message: redosRisk });
        }
      }
      tenant.studentEmailPattern = trimmed;
    }

    await tenant.save();
    invalidateTenantCache();
    res.json({ success: true, tenant });
  } catch (error) {
    console.error("updateTenant error:", error);
    res.status(500).json({ success: false, message: "Failed to update tenant" });
  }
};

// Per-tenant Analytics tab (TenantDetail.jsx) — one tenant's own numbers:
// users by role, issues by status, conversation volume, listing counts, and
// its own AI usage trend. Same open-connection-and-query shape as
// getTenantHealth above, just pulling real collections instead of a ping.
export const getTenantAnalytics = async (req, res) => {
  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOne({ slug: req.params.slug });
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });

    const connection = getTenantConnection(tenant.dbName);
    const models = getTenantModels(connection);
    const since = new Date(Date.now() - 30 * DAY_MS);

    const [usersByRole, issuesByStatus, chatCount, listingCounts, usageByDay] = await Promise.all([
      models.User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
      models.Issue.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      models.Chat.countDocuments({}),
      models.Listing.aggregate([{ $group: { _id: "$listingType", count: { $sum: 1 } } }]),
      models.AiUsageLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            requests: { $sum: 1 },
            tokens: { $sum: "$totalTokens" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      analytics: { usersByRole, issuesByStatus, chatCount, listingCounts, usageByDay },
    });
  } catch (error) {
    console.error("getTenantAnalytics error:", error);
    res.status(500).json({ success: false, message: "Failed to load tenant analytics" });
  }
};

// Super Admin landing page — cross-tenant totals + a per-tenant activity
// table. Follows getPlatformHealth's exact loop-every-tenant shape, just
// counting real collections instead of pinging + reading Source status.
export const getDashboard = async (req, res) => {
  try {
    const Tenant = getTenantModel();
    const tenants = await Tenant.find({});
    const since = new Date(Date.now() - 30 * DAY_MS);

    const perTenant = await Promise.all(
      tenants.map(async (tenant) => {
        try {
          const connection = getTenantConnection(tenant.dbName);
          const models = getTenantModels(connection);
          const [userCount, issueCount, usageAgg] = await Promise.all([
            models.User.countDocuments({}),
            models.Issue.countDocuments({}),
            models.AiUsageLog.aggregate([
              { $match: { createdAt: { $gte: since } } },
              { $group: { _id: null, requests: { $sum: 1 }, tokens: { $sum: "$totalTokens" } } },
            ]),
          ]);
          const usage = usageAgg[0] || { requests: 0, tokens: 0 };
          return {
            slug: tenant.slug, name: tenant.name, status: tenant.status,
            userCount, issueCount, aiRequests: usage.requests, aiTokens: usage.tokens,
          };
        } catch (err) {
          return {
            slug: tenant.slug, name: tenant.name, status: tenant.status,
            userCount: 0, issueCount: 0, aiRequests: 0, aiTokens: 0, error: err.message,
          };
        }
      })
    );

    const totals = perTenant.reduce(
      (acc, t) => ({
        users: acc.users + t.userCount,
        issues: acc.issues + t.issueCount,
        aiRequests: acc.aiRequests + t.aiRequests,
        aiTokens: acc.aiTokens + t.aiTokens,
      }),
      { users: 0, issues: 0, aiRequests: 0, aiTokens: 0 }
    );
    const tenantsByStatus = tenants.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      totals,
      tenantsByStatus,
      tenants: perTenant.sort((a, b) => b.aiRequests - a.aiRequests),
    });
  } catch (error) {
    console.error("getDashboard error:", error);
    res.status(500).json({ success: false, message: "Failed to load dashboard" });
  }
};

// Cross-tenant Usage comparison table — same tenant loop, only AiUsageLog,
// with a per-provider breakdown and a daily trend series per tenant.
export const getUsage = async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  const since = new Date(Date.now() - days * DAY_MS);
  try {
    const Tenant = getTenantModel();
    const tenants = await Tenant.find({});

    const perTenant = await Promise.all(
      tenants.map(async (tenant) => {
        try {
          const connection = getTenantConnection(tenant.dbName);
          const models = getTenantModels(connection);
          const [byProvider, daily] = await Promise.all([
            models.AiUsageLog.aggregate([
              { $match: { createdAt: { $gte: since } } },
              { $group: { _id: "$provider", requests: { $sum: 1 }, tokens: { $sum: "$totalTokens" } } },
            ]),
            models.AiUsageLog.aggregate([
              { $match: { createdAt: { $gte: since } } },
              {
                $group: {
                  _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                  requests: { $sum: 1 },
                  tokens: { $sum: "$totalTokens" },
                },
              },
              { $sort: { _id: 1 } },
            ]),
          ]);
          const totalRequests = byProvider.reduce((s, p) => s + p.requests, 0);
          const totalTokens = byProvider.reduce((s, p) => s + p.tokens, 0);
          return { slug: tenant.slug, name: tenant.name, totalRequests, totalTokens, byProvider, daily };
        } catch (err) {
          return {
            slug: tenant.slug, name: tenant.name,
            totalRequests: 0, totalTokens: 0, byProvider: [], daily: [], error: err.message,
          };
        }
      })
    );

    res.json({ success: true, days, tenants: perTenant.sort((a, b) => b.totalRequests - a.totalRequests) });
  } catch (error) {
    console.error("getUsage error:", error);
    res.status(500).json({ success: false, message: "Failed to load usage" });
  }
};
