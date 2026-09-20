import express from "express";
import { protect } from "../middlewares/auth.js";
import { requireFeature } from "../middlewares/requireFeature.js";
import { listScholarships, getScholarship, getMatchedScholarships } from "../controllers/scholarshipController.js";

const router = express.Router();

router.use(protect, requireFeature("scholarships"));

router.get("/", listScholarships);
router.get("/matched", getMatchedScholarships);
router.get("/:id", getScholarship);

export default router;
