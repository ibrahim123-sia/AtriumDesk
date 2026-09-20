import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const replySchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorName: { type: String, required: true },
    authorRole: {
      type: String,
      enum: ["student", "staff"],
      required: true,
    },
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

export const issueSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentName: { type: String, required: true },
    studentEmail: { type: String, required: true },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: "other",
    },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Resolved", "Closed", "Rejected"],
      default: "Pending",
      index: true,
    },
    // Mandatory when status=Rejected, optional otherwise. Shown to the student.
    rejectionReason: { type: String, trim: true, default: "" },
    attachments: { type: [attachmentSchema], default: [] },
    replies: { type: [replySchema], default: [] },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Last write metadata — used by the staff UI to show "Sara just resolved this"
    // banners and for concurrency-conflict messages.
    lastEvent: {
      type: { type: String, enum: ["created", "reply", "status", "assign", "escalate"], default: "created" },
      byUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      byName: { type: String, default: "" },
      byRole: { type: String, default: "" },
      at: { type: Date, default: Date.now },
      note: { type: String, default: "" }, // e.g. previous->new status
      // User request — if this action happened during a Super Admin
      // impersonation session, say so here (not just in the backend audit
      // log) since lastEvent is the thread's own user-visible "who did
      // this" — an impersonated action must never look identical to the
      // tenant Administrator personally acting.
      impersonatedBySuperAdminEmail: { type: String, default: null },
    },
    // Rev 5 §4.1 SLA escalation — stamped once, first staff reply/status-change
    // clears the SLA clock even if the issue later reopens.
    firstStaffReplyAt: { type: Date, default: null },
    escalated: { type: Boolean, default: false, index: true },
    escalatedAt: { type: Date, default: null },
    // Rev 5 §4.1: stamped the first time status transitions into "Resolved".
    // Distinct from updatedAt, which changes on every reply/assign/etc.
    resolvedAt: { type: Date, default: null },
    // Rev 5 §4.4 issue feedback/satisfaction — set once by the student after
    // resolution; never written by staff/admin.
    feedback: {
      thumbsUp: { type: Boolean, default: null },
      rating: { type: Number, min: 1, max: 5, default: null },
      comment: { type: String, trim: true, default: "" },
      submittedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// No default export — see server/models/registry.js.
