import mongoose from "mongoose";

/**
 * Rev 5 §4.5/§10 — "a saved scholarship or job" and "a saved item with an
 * approaching deadline" are the trigger conditions for the two most
 * valuable alerts in the spec, but no saved-item concept existed yet. A
 * plain bookmark — no status/tracker fields, which belong to the
 * deferred "application tracker" nice-to-have (§14).
 */
export const savedListingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    listingType: { type: String, enum: ["scholarship", "job", "event"], required: true },
    // Set once a deadline-reminder email has fired for this saved item, so
    // the daily cron never re-sends it. Null until sent.
    deadlineReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

savedListingSchema.index({ userId: 1, listingId: 1 }, { unique: true });
