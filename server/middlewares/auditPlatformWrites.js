import { getPlatformAuditLogModel } from "../models/platform/PlatformAuditLog.js";

// Substring match, not an exact key list — see server/middlewares/audit.js's
// comment for why (found live: `adminPassword` wasn't caught by an exact
// `password`/`newPassword` list, so a tenant-creation request logged a
// plaintext admin password into PlatformAuditLog).
const REDACT_PATTERNS = [/password/i, /otp/i, /token/i, /secret/i];

const redactPayload = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const copy = { ...obj };
  for (const k of Object.keys(copy)) {
    if (REDACT_PATTERNS.some((re) => re.test(k))) copy[k] = "***";
  }
  return copy;
};

// Same shape/redaction discipline as server/middlewares/audit.js
// (auditAdminWrites), but targets PlatformAuditLog via a distinct connection
// (PlatformDB) — it cannot reuse auditAdminWrites directly since that
// middleware writes through a tenant connection.
export const auditPlatformWrites = (req, res, next) => {
  if (!req.superAdmin) return next();
  if (req.method === "GET" || req.method === "HEAD") return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const targetId = req.params?.slug || req.params?.id || "";
      const action = `${req.method} ${req.baseUrl}${req.route?.path || ""}`.trim();

      getPlatformAuditLogModel().create({
        actor: req.superAdmin._id,
        actorEmail: req.superAdmin.email,
        action,
        method: req.method,
        path: req.originalUrl,
        targetType: req.baseUrl.split("/").pop() || "",
        targetId: String(targetId || ""),
        payload: redactPayload(req.body),
        statusCode: res.statusCode,
        ip: req.ip || req.headers["x-forwarded-for"] || "",
      }).catch((err) => console.error("auditPlatformWrites: failed to log", err.message));
    }
    return originalJson(body);
  };
  next();
};
