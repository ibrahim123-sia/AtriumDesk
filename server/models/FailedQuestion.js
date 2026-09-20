import mongoose from "mongoose";

// Rev 5 §4.3 — "Log every low-confidence or unanswered question." Written
// whenever the RAG pipeline's confidence_tier comes back "low" (Rev 5 §4.2),
// from both authenticated and guest chat. Admin groups these to find gaps
// in the knowledge base — see adminFailedQuestionController.js.
export const failedQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    language: { type: String, default: "en" },
    userType: { type: String, enum: ["student", "guest"], required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Set once an admin has added content that should address this gap —
    // lets the admin view distinguish "still unresolved" from "handled".
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

failedQuestionSchema.index({ resolvedAt: 1, createdAt: -1 });

// No default export — see server/models/registry.js.
