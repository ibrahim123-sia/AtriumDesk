// Replaces seedAdmin.js. Creates the MAJU Tenant registry entry pointing at
// the EXISTING database (zero data migration — MAJU's live User/Issue/Chat
// data stays exactly where it is), seeds one Administrator inside that
// tenant's own database, and optionally seeds one SuperAdminUser in
// PlatformDB. Safe to re-run — every step is find-or-create/promote.
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { getTenantConnection } from "../config/tenantDb.js";
import { getTenantModels } from "../models/registry.js";
import { getTenantModel } from "../models/platform/Tenant.js";
import { getSuperAdminUserModel } from "../models/platform/SuperAdminUser.js";

const run = async () => {
  const tenantSlug = (process.env.TENANT_SLUG || "maju").toLowerCase().trim();
  const tenantName = process.env.TENANT_NAME || "Muhammad Ali Jinnah University";
  const chromaCollection = process.env.TENANT_CHROMA_COLLECTION || "university_chunks";
  const emailDomains = (process.env.TENANT_EMAIL_DOMAINS || "maju.edu.pk")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const staffEmailDomainPattern = process.env.TENANT_STAFF_EMAIL_PATTERN || "maju.{dept}.edu";

  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || "AtriumDesk Admin";

  if (!adminEmail || !adminPassword) {
    console.error("❌ ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
    process.exit(1);
  }
  if (adminPassword.length < 6) {
    console.error("❌ ADMIN_PASSWORD must be at least 6 characters");
    process.exit(1);
  }

  await connectDB();

  // Existing MongoDB database name MAJU's data already lives in — read from
  // the current MONGODB_URI's path (only available after connectDB()
  // resolves) so we don't hardcode/guess it.
  const tenantDbName = process.env.TENANT_DB_NAME || mongoose.connection.name;

  // 1. Upsert the Tenant registry entry.
  const Tenant = getTenantModel();
  let tenant = await Tenant.findOne({ slug: tenantSlug });
  if (!tenant) {
    tenant = await Tenant.create({
      slug: tenantSlug,
      name: tenantName,
      status: "active",
      dbName: tenantDbName,
      chromaCollection,
      emailDomains,
      staffEmailDomainPattern,
      branding: {
        universityName: tenantName,
        universityShort: tenantSlug.toUpperCase(),
      },
    });
    console.log(`✅ Created Tenant "${tenantSlug}" -> db "${tenantDbName}"`);
  } else {
    console.log(`ℹ️  Tenant "${tenantSlug}" already exists — no changes to the registry row`);
  }

  // 2. Seed/promote the Administrator inside THIS tenant's own database.
  const connection = getTenantConnection(tenant.dbName);
  const models = getTenantModels(connection);

  let admin = await models.User.findOne({ email: adminEmail });
  if (admin) {
    if (admin.role !== "admin") {
      admin.role = "admin";
      admin.isVerified = true;
      admin.isBlocked = false;
      await admin.save();
      console.log(`✅ Promoted existing user ${adminEmail} to admin in tenant "${tenantSlug}"`);
    } else {
      console.log(`ℹ️  Admin ${adminEmail} already exists in tenant "${tenantSlug}" — no changes`);
    }
  } else {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(adminPassword, salt);
    admin = await models.User.create({
      name: adminName,
      email: adminEmail,
      password: hashed,
      role: "admin",
      isVerified: true,
    });
    console.log(`✅ Created admin user ${adminEmail} in tenant "${tenantSlug}"`);
  }

  if (!tenant.provisionedAdministrator) {
    tenant.provisionedAdministrator = admin._id;
    await tenant.save();
  }

  // 3. Optional: seed one SuperAdminUser in PlatformDB.
  const superAdminEmail = (process.env.SUPERADMIN_EMAIL || "").toLowerCase().trim();
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD;
  if (superAdminEmail && superAdminPassword) {
    const SuperAdminUser = getSuperAdminUserModel();
    const existing = await SuperAdminUser.findOne({ email: superAdminEmail });
    if (!existing) {
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(superAdminPassword, salt);
      await SuperAdminUser.create({
        name: process.env.SUPERADMIN_NAME || "Platform Super Admin",
        email: superAdminEmail,
        password: hashed,
      });
      console.log(`✅ Created SuperAdminUser ${superAdminEmail}`);
    } else {
      console.log(`ℹ️  SuperAdminUser ${superAdminEmail} already exists — no changes`);
    }
  } else {
    console.log("ℹ️  SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD not set — skipping Super Admin seed");
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
