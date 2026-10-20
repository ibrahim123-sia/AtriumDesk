import express from "express";
import { protect } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/requireFeature.js";
import { listEvents, getEvent, getMatchedEvents } from "../controllers/eventController.js";
import { getMyRsvp, rsvpToEvent, cancelRsvp } from "../controllers/eventRsvpController.js";

const router = express.Router();

router.use(protect, requireFeature("events"));

router.get("/", listEvents);
router.get("/matched", getMatchedEvents);
router.get("/:id", getEvent);
router.get("/:id/rsvp", getMyRsvp);
router.post("/:id/rsvp", rsvpToEvent);
router.delete("/:id/rsvp", cancelRsvp);

export default router;
