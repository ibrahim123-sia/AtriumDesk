import mongoose from "mongoose";

// A student's place at an event that takes RSVPs (Listing.rsvpEnabled).
// `code` is what they show at the door; staff check them in with it.
export const eventRsvpSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userName: { type: String, default: "" },
    userEmail: { type: String, default: "" },
    status: { type: String, enum: ["going", "waitlist", "cancelled"], default: "going", index: true },
    code: { type: String, required: true },
    checkedInAt: { type: Date, default: null },
  },
  { timestamps: true }
);

eventRsvpSchema.index({ eventId: 1, userId: 1 }, { unique: true });
eventRsvpSchema.index({ eventId: 1, code: 1 }, { unique: true });
