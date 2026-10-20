import mongoose from "mongoose";

/**
 * Rev 5 §4.5/§10 — "a saved scholarship or job" and "a saved item with an
 * approaching deadline" are the trigger conditions for the two most
 * valuable alerts in the spec. Also the student's own application tracker
 * (Rev 5 §6.1: "self-marked, not automatic... a personal notebook, not an
 * integration") — where they are with each one, notes, and which of the
 * listing's required documents they have ready.
 */
export const APPLICATION_STATUSES = ["saved", "preparing", "applied", "interviewing", "offer", "rejected", "withdrawn"];

// Still working towards applying: deadline reminders and "this closed"
// notices are only for these.
export const OPEN_APPLICATION_STATUSES = ["saved", "preparing"];

export const savedListingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    listingType: { type: String, enum: ["scholarship", "job", "event"], required: true },
    deadlineReminderSentAt: { type: Date, default: null },
    status: { type: String, enum: APPLICATION_STATUSES, default: "saved" },
    statusUpdatedAt: { type: Date, default: null },
    appliedAt: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    // Entries from the listing's requiredDocuments the student has ready.
    documentsReady: { type: [String], default: [] },
  },
  { timestamps: true }
);

savedListingSchema.index({ userId: 1, listingId: 1 }, { unique: true });
