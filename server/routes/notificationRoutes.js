import express from "express";
import { protect } from "../middlewares/auth.js";
import {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", protect, listNotifications);
router.get("/unread-count", protect, getUnreadCount);
router.patch("/read-all", protect, markAllRead);
router.patch("/:id/read", protect, markRead);

export default router;
