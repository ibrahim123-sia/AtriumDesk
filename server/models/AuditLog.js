import mongoose from "mongoose";

export const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true, index: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "" },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    statusCode: { type: Number, default: 200 },
    ip: { type: String, default: "" },
    // User request — every write made during a Super Admin impersonation
    // session must be traceable back to the REAL actor, not just the
    // impersonated Administrator identity in `actor`/`actorEmail` above.
    // Populated from the impersonation JWT's own claims (see
    // platformController.js#impersonateTenantAdmin), not re-derived from
    // PlatformDB here — this tenant's own AuditLog must never need a
    // cross-database lookup just to render a row.
    impersonatedBySuperAdminId: { type: String, default: null },
    impersonatedBySuperAdminEmail: { type: String, default: null },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

// No default export — see server/models/registry.js.
