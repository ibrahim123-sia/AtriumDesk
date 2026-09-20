import mongoose from "mongoose";

// Rev 5 §9.2 — "Sources live in the database, not in code." Seed sources and
// admin-added sources are the same row shape; there is no code-level
// distinction after creation (§9.2's explicit point).
export const sourceSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    type: { type: String, enum: ["scholarship", "job", "event"], required: true },
    name: { type: String, required: true, trim: true },
    // null = one-time (never picked up by the recurring scheduler again).
    frequency: { type: String, enum: ["daily", "weekly", null], default: null },
    lastRun: { type: Date, default: null },
    lastHash: { type: String, default: null },
    status: {
      type: String,
      enum: ["active", "paused", "failing"],
      default: "active",
      index: true,
    },
    consecutiveFailures: { type: Number, default: 0 },
    entriesPulledLastRun: { type: Number, default: 0 },
    // §7.4 delisting detection (adapted for this codebase's one-listing-
    // per-source model — see server/services/scheduler.js's delisting
    // section for why). Distinct from consecutiveFailures: this only
    // increments on a CONFIRMED "page gone" (HTTP 404/410) fetch result,
    // never on a generic timeout/extraction failure, and resets to 0 on
    // any successful run.
    notFoundCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// No default export — see server/models/registry.js.
