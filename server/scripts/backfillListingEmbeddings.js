// §8 Layer 2/4 — Phase 8 wired embed-on-approve into adminListingController.js
// and adminSourceController.js, but that only covers listings approved AFTER
// that code shipped. Real listings approved earlier (Commonwealth/Fulbright/
// Chevening scholarships, GitLab/Figma jobs from Phases 5/6) have no Chroma
// embedding yet, so Phase 9's RAG-over-new-content layer and Layer 2 dedup
// would have nothing real to retrieve/compare against for them. Re-embedding
// is an upsert (listing_matching.embed_listing), so this is safe to re-run
// any time — every tenant, every currently-approved listing, unconditionally.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { getTenantConnection } from "../config/tenantDb.js";
import { getTenantModels } from "../models/registry.js";
import { getTenantModel as getPlatformTenantModel } from "../models/platform/Tenant.js";
import { embedListingAsync } from "../controllers/adminSourceController.js";

const run = async () => {
  await connectDB();

  const Tenant = getPlatformTenantModel();
  const tenants = await Tenant.find({ status: "active" });
  if (!tenants.length) {
    console.log("No active tenants found — nothing to backfill.");
  }

  let total = 0;
  for (const tenant of tenants) {
    const connection = getTenantConnection(tenant.dbName);
    const models = getTenantModels(connection);
    const listings = await models.Listing.find({ status: "approved" });
    for (const listing of listings) {
      await embedListingAsync(tenant.slug, listing);
      total += 1;
    }
    console.log(`✅ Backfilled ${listings.length} approved listing(s) for tenant "${tenant.slug}"`);
  }

  console.log(`Done — ${total} listing(s) embedded across ${tenants.length} tenant(s).`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
