import express from "express";
import { protect } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { requireDepartment } from "../middlewares/requireDepartment.js";
import {
  listQueueDepartments,
  myQueueTickets,
  joinQueue,
  leaveQueue,
  getDepartmentQueue,
  setQueueOpen,
  callNextInQueue,
  markQueueServed,
  markQueueNoShow,
  recallQueueTicket,
} from "../controllers/queueController.js";

const router = express.Router();
const staff = [protect, requireRole("staff"), requireDepartment];
const student = [protect, requireRole("student")];

router.get("/department", ...staff, getDepartmentQueue);
router.post("/department/open", ...staff, setQueueOpen);
router.post("/department/call-next", ...staff, callNextInQueue);
router.post("/department/tickets/:id/served", ...staff, markQueueServed);
router.post("/department/tickets/:id/no-show", ...staff, markQueueNoShow);
router.post("/department/tickets/:id/recall", ...staff, recallQueueTicket);

router.get("/departments", ...student, listQueueDepartments);
router.get("/mine", ...student, myQueueTickets);
router.post("/join", ...student, joinQueue);
router.delete("/:id", ...student, leaveQueue);

export default router;
