import express from "express";
import { protect } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/requireFeature.js";
import { listEvents, getEvent, getMatchedEvents } from "../controllers/eventController.js";

const router = express.Router();

router.use(protect, requireFeature("events"));

router.get("/", listEvents);
router.get("/matched", getMatchedEvents);
router.get("/:id", getEvent);

export default router;
