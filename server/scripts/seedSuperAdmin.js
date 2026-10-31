// Seeds only the platform's Super Admin (PlatformDB) from SUPERADMIN_EMAIL /
// SUPERADMIN_PASSWORD / SUPERADMIN_NAME — for a fresh platform where the
// Super Admin then creates every university from the portal. seedTenant.js
// does the same plus a tenant and its Administrator. Safe to re-run.
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { getSuperAdminUserModel } from "../models/platform/SuperAdminUser.js";

const run = async () => {
  const email = (process.env.SUPERADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    console.error("❌ SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in .env");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("❌ SUPERADMIN_PASSWORD must be at least 6 characters");
    process.exit(1);
  }

  await connectDB();
  const SuperAdminUser = getSuperAdminUserModel();
  if (await SuperAdminUser.exists({ email })) {
    console.log(`ℹ️  SuperAdminUser ${email} already exists — no changes`);
  } else {
    await SuperAdminUser.create({
      name: process.env.SUPERADMIN_NAME || "Platform Super Admin",
      email,
      password: await bcrypt.hash(password, await bcrypt.genSalt(10)),
    });
    console.log(`✅ Created SuperAdminUser ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
