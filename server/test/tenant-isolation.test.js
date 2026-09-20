// Mandatory tenant-isolation test (Rev7 §5.2). Ships with Phase T0 itself,
// not deferred to a later "add tests" bucket — a bug in tenant resolution is
// a cross-tenant data leak, not a degraded feature.
//
// Run with:  node --test server/test/tenant-isolation.test.js
// (uses Node's built-in test runner — zero new dependencies)
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { getTenantConnection, getPlatformConnection } from "../config/tenantDb.js";
import { getTenantModels } from "../models/registry.js";
import { getTenantModel } from "../models/platform/Tenant.js";
import { resolveTenantByEmailDomain, invalidateTenantCache } from "../services/tenantRegistry.js";

const TENANT_A_DB = "test_tenant_isolation_a";
const TENANT_B_DB = "test_tenant_isolation_b";

// Deliberately similar-looking domains (not two obviously-distinct ones) so
// the exact-match lookup's disambiguation branch is actually exercised,
// rather than only ever seeing pairs that would trivially never collide.
const TENANT_A_DOMAIN = "alpha-uni.edu.pk";
const TENANT_B_DOMAIN = "alpha-uni-grad.edu.pk";

let tenantADoc, tenantBDoc;

test.before(async () => {
  await connectDB();
  const Tenant = getTenantModel();
  tenantADoc = await Tenant.create({
    slug: "test-tenant-a",
    name: "Test Tenant A",
    status: "active",
    dbName: TENANT_A_DB,
    chromaCollection: "chunks_test_tenant_a",
    emailDomains: [TENANT_A_DOMAIN],
  });
  tenantBDoc = await Tenant.create({
    slug: "test-tenant-b",
    name: "Test Tenant B",
    status: "active",
    dbName: TENANT_B_DB,
    chromaCollection: "chunks_test_tenant_b",
    emailDomains: [TENANT_B_DOMAIN],
  });
  invalidateTenantCache();
});

test.after(async () => {
  // Drop the two throwaway tenant databases and the PlatformDB Tenant rows.
  await getTenantConnection(TENANT_A_DB).dropDatabase();
  await getTenantConnection(TENANT_B_DB).dropDatabase();
  const Tenant = getTenantModel();
  await Tenant.deleteMany({ _id: { $in: [tenantADoc._id, tenantBDoc._id] } });
  await mongoose.disconnect();
});

test("a connection scoped to tenant A cannot read a user created in tenant B", async () => {
  const modelsA = getTenantModels(getTenantConnection(TENANT_A_DB));
  const modelsB = getTenantModels(getTenantConnection(TENANT_B_DB));

  await modelsB.User.create({
    name: "Tenant B Student",
    email: `student@${TENANT_B_DOMAIN}`,
    password: "hashed-not-real-but-min-6-chars",
    role: "student",
  });

  const seenFromA = await modelsA.User.findOne({ email: `student@${TENANT_B_DOMAIN}` });
  assert.equal(seenFromA, null, "tenant A's connection must not see tenant B's user");

  const seenFromB = await modelsB.User.findOne({ email: `student@${TENANT_B_DOMAIN}` });
  assert.notEqual(seenFromB, null, "tenant B's own connection must see its own user");
});

test("a connection scoped to tenant A cannot read an issue created in tenant B", async () => {
  const modelsA = getTenantModels(getTenantConnection(TENANT_A_DB));
  const modelsB = getTenantModels(getTenantConnection(TENANT_B_DB));

  const dept = await modelsB.Department.create({ code: "TST", name: "Test Dept" });
  const student = await modelsB.User.findOne({ role: "student" });
  const issue = await modelsB.Issue.create({
    studentId: student._id,
    studentName: student.name,
    studentEmail: student.email,
    department: dept._id,
    title: "Isolation test issue",
    description: "Should never be visible from tenant A",
  });

  const seenFromA = await modelsA.Issue.findById(issue._id);
  assert.equal(seenFromA, null, "tenant A's connection must not see tenant B's issue");
});

test("email-domain routing resolves similar-looking domains to distinct tenants", async () => {
  const resolvedA = await resolveTenantByEmailDomain(TENANT_A_DOMAIN);
  const resolvedB = await resolveTenantByEmailDomain(TENANT_B_DOMAIN);

  assert.ok(resolvedA, "domain A must resolve to a tenant");
  assert.ok(resolvedB, "domain B must resolve to a tenant");
  assert.equal(resolvedA.slug, "test-tenant-a");
  assert.equal(resolvedB.slug, "test-tenant-b");
  assert.notEqual(resolvedA.dbName, resolvedB.dbName, "the two domains must not resolve to the same database");
});

test("an unregistered domain resolves to no tenant", async () => {
  const resolved = await resolveTenantByEmailDomain("not-on-the-platform.example.com");
  assert.equal(resolved, null);
});
