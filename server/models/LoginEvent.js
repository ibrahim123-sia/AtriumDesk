import mongoose from "mongoose";

export const loginEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    email: { type: String, required: true, index: true },
    success: { type: Boolean, required: true, index: true },
    reason: { type: String, default: "" },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true }
);

loginEventSchema.index({ createdAt: -1 });

// No default export — see server/models/registry.js.
