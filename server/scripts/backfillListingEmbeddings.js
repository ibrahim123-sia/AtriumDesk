// §8 Layer 2/4 — Phase 8 wired embed-on-approve into adminListingController.js
// and adminSourceController.js, but that only covers listings approved AFTER
// that code shipped. Real listings approved earlier (Commonwealth/Fulbright/
// Chevening scholarships, GitLab/Figma jobs from Phases 5/6) have no Chroma
// embedding yet, so Phase 9's RAG-over-new-content layer and Layer 2 dedup
// would have nothing real to retrieve/compare against for them. Re-embedding
// is an upsert (listing_matching.embed_listing), so this is safe to re-run
// any time — every tenant, every currently-approved listing, unconditionally.
//
// It also removes embeddings whose listing is no longer approved or no
// longer exists (deleted straight from the database, or from before
// delete/expiry removed embeddings): the chatbot kept answering students
// from such listings. Run it after changing what an embedding stores, too.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { getTenantConnection } from "../config/tenantDb.js";
import { getTenantModels } from "../models/registry.js";
import { getTenantModel as getPlatformTenantModel } from "../models/platform/Tenant.js";
import { embedListingAsync, removeListingEmbedding } from "../controllers/adminSourceController.js";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

const embeddedIds = async (tenantSlug) => {
  const response = await fetch(`${PYTHON_BACKEND_URL}/listings/embedded-ids?tenant_slug=${encodeURIComponent(tenantSlug)}`, {
    headers: { "x-internal-secret": process.env.INTERNAL_SECRET || "" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`AI service answered ${response.status} listing embeddings`);
  return (await response.json()).ids || [];
};

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
    const approved = new Set(listings.map((l) => String(l._id)));
    const stale = (await embeddedIds(tenant.slug)).filter((id) => !approved.has(id));
    for (const id of stale) await removeListingEmbedding(tenant.slug, id);
    console.log(`✅ Backfilled ${listings.length} approved listing(s) for tenant "${tenant.slug}", removed ${stale.length} stale embedding(s)`);
  }

  console.log(`Done — ${total} listing(s) embedded across ${tenants.length} tenant(s).`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
