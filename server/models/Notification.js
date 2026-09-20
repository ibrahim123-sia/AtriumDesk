import mongoose from "mongoose";

export const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "issue_status_changed",
        "issue_replied",
        "issue_created",
        "user_flagged",
        "account_email_changed",
        "issue_assigned",
        "issue_escalated",
        "listing_deadline_reminder",
        "listing_digest",
        "listing_saved_change",
      ],
      required: true,
    },
    issueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Issue",
      default: null,
    },
    message: { type: String, required: true },
    link: { type: String, default: "" },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// No default export — see server/models/registry.js.
