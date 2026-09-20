// Trim noisy/sensitive fields out of the recorded payload. Matches by
// substring, not an exact key list — an exact list silently misses any
// differently-named field for the same kind of secret (e.g. `adminPassword`
// wasn't caught by a list containing only `password`/`newPassword`, found
// live when Rev7's tenant-creation wizard logged a plaintext admin password
// into the audit trail).
const REDACT_PATTERNS = [/password/i, /otp/i, /token/i, /secret/i];

const redactPayload = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const copy = { ...obj };
  for (const k of Object.keys(copy)) {
    if (REDACT_PATTERNS.some((re) => re.test(k))) copy[k] = "***";
  }
  return copy;
};

// Wraps res.json so we can capture the status code and the target id from the
// response without changing each controller. Only logs on 2xx.
// Uses req.models.AuditLog (attached by `protect`) rather than a static
// import, since AuditLog is compiled per-tenant, not on a single shared
// default connection.
export const auditAdminWrites = (req, res, next) => {
  // Staff can now reach a delegated subset of these routes too
  // (requireStaffPermission) — their writes must be audited exactly like an
  // Administrator's, since delegated access is precisely the situation
  // where "who did this" accountability matters most.
  if (!req.user || !["admin", "staff"].includes(req.user.role)) return next();
  if (req.method === "GET" || req.method === "HEAD") return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const targetIdFromBody =
        body?.user?._id ||
        body?.department?._id ||
        body?.issue?._id ||
        "";
      const targetId = req.params?.id || targetIdFromBody || "";
      const action = `${req.method} ${req.baseUrl}${req.route?.path || ""}`.trim();

      req.models.AuditLog.create({
        actor: req.user._id,
        actorEmail: req.user.email,
        action,
        method: req.method,
        path: req.originalUrl,
        targetType: req.baseUrl.split("/").pop() || "",
        targetId: String(targetId || ""),
        payload: redactPayload(req.body),
        statusCode: res.statusCode,
        ip: req.ip || req.headers["x-forwarded-for"] || "",
        impersonatedBySuperAdminId: req.impersonatedBy?.id || null,
        impersonatedBySuperAdminEmail: req.impersonatedBy?.email || null,
      }).catch((err) => console.error("auditAdminWrites: failed to log", err.message));
    }
    return originalJson(body);
  };
  next();
};
