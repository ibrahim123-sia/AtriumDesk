import mongoose from "mongoose";

// A student's place in a department's walk-in queue for one day
// (controllers/queueController.js). `number` restarts every day; the
// ticket label is the department code plus the number, e.g. FIN-007.
export const queueTicketSchema = new mongoose.Schema(
  {
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    studentName: { type: String, default: "" },
    studentEmail: { type: String, default: "" },
    reason: { type: String, trim: true, maxlength: 200, default: "" },
    // The university's local date, YYYY-MM-DD.
    day: { type: String, required: true },
    number: { type: Number, required: true },
    status: { type: String, enum: ["waiting", "called", "served", "no_show", "cancelled"], default: "waiting" },
    counter: { type: String, trim: true, maxlength: 40, default: "" },
    calledAt: { type: Date, default: null },
    calledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    servedAt: { type: Date, default: null },
    // When they were told they're next in line.
    nextNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

queueTicketSchema.index({ department: 1, day: 1, number: 1 }, { unique: true });
queueTicketSchema.index({ department: 1, day: 1, status: 1 });
