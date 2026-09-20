import { getTenantModel } from "../models/platform/Tenant.js";
import { invalidateTenantCache } from "../services/tenantRegistry.js";
import { encryptField } from "../services/fieldCrypto.js";
import { invalidateMailerCache } from "../services/mailer.js";
import { findRedosRisk } from "../services/regexSafety.js";

// The Rev 5 §11 branding fields self-service editing was always meant to
// unlock — university name/short, logo, primary color, support email.
// Structural fields (slug, status, dbName, chromaCollection,
// provisionedAdministrator) stay out of Administrator's reach; those are
// Super Admin / provisioning concerns, not branding.
const EDITABLE_BRANDING_FIELDS = ["universityName", "universityShort", "logoUrl", "primaryColor", "supportEmail"];

// Similarity-score thresholds live on 0-1; topK is a positive chunk count.
// Same admin-self-service tier as branding — not a Super Admin concern —
// since it only affects this tenant's own chatbot answer quality, never
// another tenant's.
const RAG_SCORE_FIELDS = ["confidenceHigh", "confidenceLow", "listingRelevance", "listingConfident"];

const serializeTenant = (tenant) => ({
  slug: tenant.slug,
  name: tenant.name,
  branding: tenant.branding,
  emailDomains: tenant.emailDomains,
  staffEmailDomainPattern: tenant.staffEmailDomainPattern,
  studentEmailPattern: tenant.studentEmailPattern,
  ragConfig: tenant.ragConfig,
  feeConfig: tenant.feeConfig,
  // Never serialize the encrypted app password itself — only whether one
  // is configured, so the client can show "configured" vs. an empty field
  // without ever round-tripping the secret.
  smtp: {
    fromEmail: tenant.smtp?.fromEmail || "",
    fromName: tenant.smtp?.fromName || "",
    appPasswordConfigured: !!tenant.smtp?.appPasswordEncrypted,
  },
});

export const getTenantSettings = async (req, res) => {
  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findById(req.tenant._id).select("+smtp.appPasswordEncrypted");
    if (!tenant) return res.status(404).json({ success: false, message: "Tenant not found" });
    res.json({ success: true, tenant: serializeTenant(tenant) });
  } catch (error) {
    console.error("getTenantSettings error:", error);
    res.status(500).json({ success: false, message: "Failed to load tenant settings" });
  }
};

export const updateTenantSettings = async (req, res) => {
  const { name, branding, emailDomains, staffEmailDomainPattern, studentEmailPattern, smtp, ragConfig, feeConfig } = req.body || {};
  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findById(req.tenant._id).select("+smtp.appPasswordEncrypted");
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
      // A domain can only belong to one tenant — without this check, an
      // Administrator could accidentally (or deliberately) start resolving
      // another university's students' logins into their own database.
      const claimed = await Tenant.findOne({
        _id: { $ne: tenant._id },
        emailDomains: { $in: normalized },
      });
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

    if (ragConfig && typeof ragConfig === "object") {
      for (const key of RAG_SCORE_FIELDS) {
        if (ragConfig[key] === undefined) continue;
        if (ragConfig[key] === null || ragConfig[key] === "") {
          tenant.ragConfig[key] = null; // explicit reset to the platform default
          continue;
        }
        const num = Number(ragConfig[key]);
        if (!Number.isFinite(num) || num < 0 || num > 1) {
          return res.status(400).json({ success: false, message: `${key} must be a number between 0 and 1` });
        }
        tenant.ragConfig[key] = num;
      }
      if (ragConfig.topK !== undefined) {
        if (ragConfig.topK === null || ragConfig.topK === "") {
          tenant.ragConfig.topK = null;
        } else {
          const topK = Number(ragConfig.topK);
          if (!Number.isInteger(topK) || topK < 1 || topK > 50) {
            return res.status(400).json({ success: false, message: "topK must be a whole number between 1 and 50" });
          }
          tenant.ragConfig.topK = topK;
        }
      }
    }

    if (feeConfig && typeof feeConfig === "object" && feeConfig.feePerCreditHour !== undefined) {
      if (feeConfig.feePerCreditHour === null || feeConfig.feePerCreditHour === "") {
        tenant.feeConfig.feePerCreditHour = null;
      } else {
        const rate = Number(feeConfig.feePerCreditHour);
        if (!Number.isFinite(rate) || rate < 0) {
          return res.status(400).json({ success: false, message: "feePerCreditHour must be a non-negative number" });
        }
        tenant.feeConfig.feePerCreditHour = rate;
      }
    }

    if (smtp && typeof smtp === "object") {
      if (smtp.fromEmail !== undefined) tenant.smtp.fromEmail = String(smtp.fromEmail).trim().toLowerCase();
      if (smtp.fromName !== undefined) tenant.smtp.fromName = String(smtp.fromName).trim();
      if (smtp.appPassword) {
        // Google app passwords are shown with spaces for readability but
        // must be used without them.
        tenant.smtp.appPasswordEncrypted = encryptField(String(smtp.appPassword).replace(/\s+/g, ""));
      }
      invalidateMailerCache(tenant.slug);
    }

    await tenant.save();
    // Without this, the change is invisible for up to 60s (tenantRegistry's
    // TTL cache) — self-service editing should take effect immediately.
    invalidateTenantCache();

    res.json({ success: true, tenant: serializeTenant(tenant) });
  } catch (error) {
    console.error("updateTenantSettings error:", error);
    res.status(500).json({ success: false, message: "Failed to update tenant settings" });
  }
};
