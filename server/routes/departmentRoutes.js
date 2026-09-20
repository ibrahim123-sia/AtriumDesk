import express from "express";
import { protect } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController.js";

const router = express.Router();

router.get("/", protect, listDepartments);
router.post("/", protect, requireRole("admin"), createDepartment);
router.patch("/:id", protect, requireRole("admin"), updateDepartment);
router.delete("/:id", protect, requireRole("admin"), deleteDepartment);

export default router;
