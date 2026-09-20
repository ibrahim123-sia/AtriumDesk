import mongoose from "mongoose";

// Rev 5 §4.2 — "store labeled example question→department pairs. For a new
// question, retrieve the most similar examples and let those guide the
// suggestion." Every chatbot->issue handoff writes one row here (whichever
// department the student ultimately submitted to), so the label set grows
// automatically from real usage instead of needing a hand-curated seed set.
// `suggestedDepartmentId` (null if no suggestion was made) lets the same
// collection answer §4.2's confusion-matrix requirement: group by
// (suggestedDepartmentId, departmentId) where they differ.
export const departmentExampleSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    suggestedDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
  },
  { timestamps: true }
);

// No default export — see server/models/registry.js.
