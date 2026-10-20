import express from "express";
import { protect } from "../middlewares/auth.js";
import { getPushConfig, subscribePush, unsubscribePush, sendTestPush, pushWriteLimiter } from "../controllers/pushController.js";

const router = express.Router();

router.get("/config", getPushConfig);
router.post("/subscribe", protect, pushWriteLimiter, subscribePush);
router.post("/unsubscribe", protect, unsubscribePush);
router.post("/test", protect, pushWriteLimiter, sendTestPush);

export default router;
