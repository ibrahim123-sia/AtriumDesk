import express from "express";
import {
  guestTextChatController,
  getGuestChatHistory,
  clearGuestSession,
  getGuestBranding,
  guestChatLimiter,
  guestSessionLimiter,
  guestAnswerFeedback,
} from "../controllers/guestChatController.js";
import { getGuestListings } from "../controllers/guestListingController.js";
import { listGuestActivityTabs, getGuestActivityTab } from "../controllers/guestActivityController.js";

const router = express.Router();

// Guest chat route (no authentication required)
router.get("/branding", guestSessionLimiter, getGuestBranding); // Tenant branding for the landing page
router.post("/chat", guestChatLimiter, guestTextChatController); // Send message
router.get("/history", guestSessionLimiter, getGuestChatHistory); // Get chat history
router.post("/clear", guestSessionLimiter, clearGuestSession); // Clear session
router.post("/feedback", guestSessionLimiter, guestAnswerFeedback); // Thumbs up/down on an answer

// Rev5 §19.2 — MAJU's own scholarships + upcoming campus events, for the
// guest landing page's admissions-funnel sections below the chatbot.
router.get("/listings", guestSessionLimiter, getGuestListings);

// Admin-managed Activity tabs (Sports, Societies, etc.) — published only.
router.get("/activity-tabs", guestSessionLimiter, listGuestActivityTabs);
router.get("/activity-tabs/:slug", guestSessionLimiter, getGuestActivityTab);

export default router;