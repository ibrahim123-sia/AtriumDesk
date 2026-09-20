import express from "express";
import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import connectDB from "./config/db.js";
import userRouter from "./routes/userRoutes.js";
import chatRouter from "./routes/chatRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import guestChatRoutes from "./routes/guestChatRoutes.js";
import issueRouter from "./routes/issueRoutes.js";
import departmentRouter from "./routes/departmentRoutes.js";
import notificationRouter from "./routes/notificationRoutes.js";
import adminRouter from "./routes/adminRoutes.js";
import platformRouter from "./routes/platformRoutes.js";
import scholarshipRouter from "./routes/scholarshipRoutes.js";
import jobRouter from "./routes/jobRoutes.js";
import eventRouter from "./routes/eventRoutes.js";
import savedRouter from "./routes/savedRoutes.js";
import manifestRouter from "./routes/manifestRoutes.js";
import { startScheduler } from "./services/scheduler.js";

const app = express();
await connectDB();
startScheduler();

const UPLOAD_ROOT = "uploads";
const UPLOAD_ISSUES = path.join(UPLOAD_ROOT, "issues");
if (!fs.existsSync(UPLOAD_ISSUES)) fs.mkdirSync(UPLOAD_ISSUES, { recursive: true });

// Middleware
// crossOriginResourcePolicy: helmet's default `same-origin` would make the
// browser block every /uploads image (avatars, logos, attachments) rendered
// by the client on its separate origin (e.g. localhost:5173 → :3000).
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
// Single-origin allow-list (Rev 6 finding #3 — cors() previously had no
// restriction at all). JWT-claim tenant routing keeps one frontend origin
// even across multiple tenants, so this does not need to become a
// tenant-aware allow-list (Rev7 §5.6).
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
// Increase payload limit for voice messages
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use("/uploads", express.static(UPLOAD_ROOT));

// Routes
app.get("/", (req, res) => res.send("AtriumDesk Server is Live"));
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);
app.use("/api/message", messageRouter);
app.use("/api/guest", guestChatRoutes);
app.use("/api/issue", issueRouter);
app.use("/api/department", departmentRouter);
app.use("/api/scholarships", scholarshipRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/events", eventRouter);
app.use("/api/saved", savedRouter);
app.use("/api/manifest", manifestRouter);
app.use("/api/notification", notificationRouter);
app.use("/api/admin", adminRouter);
// Separate top-level namespace for Super Admin — never mounted under
// /api/admin, never gated by the tenant-scoped requireRole("admin") (Rev7 §5.9).
app.use("/api/platform", platformRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`AtriumDesk Server is running on port ${PORT}`);
});