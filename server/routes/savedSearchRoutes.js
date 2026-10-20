import express from "express";
import { protect } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { listSavedSearches, createSavedSearch, deleteSavedSearch } from "../controllers/savedSearchController.js";

const router = express.Router();

router.use(protect, requireRole("student"));
router.get("/", listSavedSearches);
router.post("/", createSavedSearch);
router.delete("/:id", deleteSavedSearch);

export default router;
