import express from "express";
import { protect } from "../middlewares/auth.js";
import { listSaved, saveListing, updateSaved, unsaveListing } from "../controllers/savedListingController.js";

const router = express.Router();

router.get("/", protect, listSaved);
router.post("/:listingId", protect, saveListing);
// Application tracker: status, notes, documents ready.
router.patch("/:listingId", protect, updateSaved);
router.delete("/:listingId", protect, unsaveListing);

export default router;
