import mongoose from "mongoose";

// Super Admin Usage tab / Dashboard KPI — one row per LLM completion actually
// made (not per /ask call; a cache hit or a failed-question served from the
// keyword cache makes no LLM call and logs nothing). Token counts come
// straight off the provider's own response (see python/rag.py's
// get_last_usage()) — nothing is estimated client-side.
export const aiUsageLogSchema = new mongoose.Schema(
  {
    userType: { type: String, enum: ["student", "staff", "admin", "guest"], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    endpoint: { type: String, enum: ["chat", "voice", "email", "guest_chat"], required: true },
    provider: { type: String, default: "" },
    model: { type: String, default: "" },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
  },
  { timestamps: true }
);

aiUsageLogSchema.index({ createdAt: -1 });
aiUsageLogSchema.index({ userType: 1, createdAt: -1 });

// No default export — see server/models/registry.js.
