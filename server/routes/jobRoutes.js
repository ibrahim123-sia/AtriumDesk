import express from "express";
import { protect } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/requireFeature.js";
import { listJobs, getJob, getMatchedJobs } from "../controllers/jobController.js";

const router = express.Router();

router.use(protect, requireFeature("jobs"));

router.get("/", listJobs);
router.get("/matched", getMatchedJobs);
router.get("/:id", getJob);

export default router;
