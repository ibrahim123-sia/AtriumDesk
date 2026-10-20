import mongoose from "mongoose";

export const departmentSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Department code is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Department name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Rev 5 §4.1: SLA escalation notifies the department head specifically,
    // not every staff member. Null = no head assigned yet — escalation then
    // falls back to notifying all staff in the department.
    headUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Hours from issue creation to first staff reply before it escalates.
    // Null = use the global default (see services/scheduler.js).
    slaThresholdHours: {
      type: Number,
      default: null,
    },
    // Walk-in queue (controllers/queueController.js): the Administrator
    // decides whether this office uses it; staff open and close it day to
    // day. The note tells students where to go.
    walkInEnabled: { type: Boolean, default: false },
    walkInOpen: { type: Boolean, default: false },
    walkInNote: { type: String, trim: true, maxlength: 200, default: "" },
  },
  { timestamps: true }
);

// No default export — see server/models/registry.js.
