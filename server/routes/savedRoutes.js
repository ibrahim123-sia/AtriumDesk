import express from "express";
import { protect } from "../middlewares/auth.js";
import { listSaved, saveListing, unsaveListing } from "../controllers/savedListingController.js";

const router = express.Router();

router.get("/", protect, listSaved);
router.post("/:listingId", protect, saveListing);
router.delete("/:listingId", protect, unsaveListing);

export default router;
