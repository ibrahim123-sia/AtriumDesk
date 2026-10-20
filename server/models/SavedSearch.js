import mongoose from "mongoose";

// "Tell me when something new matches this": a student's saved browse
// filters for scholarships or jobs, checked daily (services/scheduler.js).
export const savedSearchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listingType: { type: String, enum: ["scholarship", "job"], required: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    label: { type: String, default: "" },
    // Listings approved after this are "new" for the next alert.
    lastCheckedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
