import mongoose from "mongoose";

export const chatSchema = new mongoose.Schema(
  {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    userName: { 
      type: String, 
      required: true 
    },
    name: { 
      type: String, 
      required: true,
      default: "New Chat" 
    },
    messages: [
      {
        type: {
          type: String,
          enum: ['text', 'email', 'voice'],
          default: 'text'
        },
        role: { 
          type: String, 
          required: true 
        },
        content: {
          type: String,
          required: true
        },
        // Rev 5 §4.2 — the tier the RAG pipeline reported for this answer
        // (assistant messages only). Drives the chatbot->issue handoff CTA.
        confidenceTier: {
          type: String,
          enum: ["high", "medium", "low", null],
          default: null,
        },
        emailData: {
          recipient: String,
          subject: String,
          isSent: { type: Boolean, default: false }
        },
        voiceNote: {
          audioUrl: String,
          duration: Number,
          fileSize: Number
        },
        timestamp: { 
          type: Number, 
          required: true 
        },
      },
    ],
  },
  { timestamps: true }
);

// No default export — see server/models/registry.js.
