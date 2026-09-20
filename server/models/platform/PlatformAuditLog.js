import mongoose from "mongoose";
import { getPlatformConnection } from "../../config/tenantDb.js";

// Mirrors the shape of the tenant-scoped AuditLog (server/models/AuditLog.js),
// but `actor` is optional here (unlike the tenant version) so unresolved
// login attempts — which by definition have no authenticated user, tenant,
// or SuperAdminUser to attribute to — can still be recorded for visibility
// instead of silently disappearing.
const platformAuditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "SuperAdminUser", default: null },
    actorEmail: { type: String, default: "" },
    action: { type: String, required: true, index: true },
    method: { type: String, default: "" },
    path: { type: String, default: "" },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "" },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    statusCode: { type: Number, default: 200 },
    ip: { type: String, default: "" },
  },
  { timestamps: true }
);

platformAuditLogSchema.index({ createdAt: -1 });

export const getPlatformAuditLogModel = () => {
  const connection = getPlatformConnection();
  return connection.models.PlatformAuditLog || connection.model("PlatformAuditLog", platformAuditLogSchema);
};
