import mongoose from "mongoose";

// A student's or guest's thumbs up/down on a chatbot answer. The analytics
// record behind the admin dashboard's helpfulness figures; a thumbs-down
// also adds the question to the failed-question log (reason "unhelpful").
export const answerFeedbackSchema = new mongoose.Schema(
  {
    userType: { type: String, enum: ["student", "guest"], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", default: null },
    messageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    helpful: { type: Boolean, required: true },
    question: { type: String, trim: true, default: "" },
    confidenceTier: { type: String, default: null },
  },
  { timestamps: true }
);

answerFeedbackSchema.index({ createdAt: -1 });
answerFeedbackSchema.index({ chatId: 1, messageId: 1 });
