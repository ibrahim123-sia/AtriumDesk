import express from "express";
import { getTenantManifest } from "../controllers/manifestController.js";

const router = express.Router();

// Public — a PWA manifest must be fetchable before any login.
router.get("/:slug", getTenantManifest);

export default router;
