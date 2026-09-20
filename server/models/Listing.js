import mongoose from "mongoose";

/**
 * Rev 5 §9.1/§9.5 — one base schema shared by Scholarships/Jobs/Events via
 * Mongoose discriminators, not three near-identical schemas. "One admin
 * panel, three tabs, same shape" (spec's own words) maps directly onto one
 * base collection with a `listingType` discriminator key, so the generic
 * admin CRUD (server/controllers/adminListingController.js) can operate on
 * all three through one `Listing.find({...})` regardless of type, while
 * type-specific fields still get their own validated sub-schema.
 *
 * Lifecycle states (§6.5): pending/approved/rejected are the review-queue
 * states; expired/delisted are set later by the listing-lifecycle job
 * (Phase 7b) — included in the enum now so the schema doesn't need a
 * migration when that phase lands.
 */
const listingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    organization: { type: String, required: true, trim: true }, // university / company
    description: { type: String, trim: true, default: "" },
    officialLink: { type: String, trim: true, default: "" },
    // Application/event deadline — scholarships and jobs use this; events use `date` instead (see EventListing).
    deadline: { type: Date, default: null },
    lastVerifiedAt: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired", "delisted"],
      default: "pending",
      index: true,
    },
    // When the listing (last) became approved. The digest cron filters on
    // this, not createdAt — a listing can sit pending in review past a
    // student's last digest. Null for documents approved before the field
    // existed (digest falls back to createdAt for those).
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: "" },

    // §9.5: "source matters — it prevents a re-scrape from overwriting
    // manual entries, it makes debugging possible." Manual entries have
    // sourceId=null; scraped ones point back to the Source that created them.
    source: { type: String, enum: ["scraped", "manual"], required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, ref: "Source", default: null },
    // Hash of the extracted content at scrape time — lets a re-scrape of the
    // same source detect "nothing changed" without re-running extraction.
    contentHash: { type: String, default: null },
    // §8 Layer 2 dedup: "the same job appears on a careers page and a job
    // board with slightly different titles... appears once but with a
    // boosted combined score." Each entry snapshots the OTHER source's own
    // scraped fields (not just its URL) so an admin's unmerge action can
    // genuinely reconstruct that listing as its own standalone record,
    // rather than only removing the association.
    mergedFrom: {
      type: [
        {
          sourceId: { type: mongoose.Schema.Types.ObjectId, ref: "Source" },
          url: String,
          mergedAt: { type: Date, default: Date.now },
          similarityScore: Number,
          data: mongoose.Schema.Types.Mixed,
        },
      ],
      default: [],
    },
  },
  { timestamps: true, discriminatorKey: "listingType" }
);

export const getListingModel = (connection) => {
  if (connection.models.Listing) return connection.models.Listing;
  return connection.model("Listing", listingSchema);
};

// --- Scholarship (Rev 5 §6.2) ---
const scholarshipDiscriminatorSchema = new mongoose.Schema({
  // Rev5 §19.2 — guests see MAJU's own scholarships (a reason to apply)
  // but never external ones (they point a prospective applicant away from
  // MAJU). Defaults to "external" since every scholarship scraped so far
  // (Chevening/Commonwealth/Fulbright) genuinely is; MAJU's own awards get
  // tagged "internal" explicitly at ingestion.
  scope: { type: String, enum: ["internal", "external"], default: "external", index: true },
  country: { type: String, trim: true, default: "" },
  degreeLevel: { type: String, enum: ["bachelors", "masters", "phd", "other"], default: "other" },
  fundingType: { type: String, enum: ["fully_funded", "partial", "self_funded", "other"], default: "other" },
  eligibilityCriteria: { type: String, trim: true, default: "" },
  requiredDocuments: { type: [String], default: [] },
  languageRequirements: { type: String, trim: true, default: "" },
  // Numeric eligibility fields — feed the matching engine (§8 Layer 1) once it's wired to real listings.
  cgpaRequirement: { type: Number, default: null },
  ieltsRequirement: { type: Number, default: null },
  toeflRequirement: { type: Number, default: null },
});

// --- Job (Rev 5 §6.3) ---
const jobDiscriminatorSchema = new mongoose.Schema({
  workMode: { type: String, enum: ["remote", "onsite", "hybrid"], default: "onsite" },
  location: { type: String, trim: true, default: "" },
  locationRestriction: { type: String, trim: true, default: "" }, // e.g. "US-based only"
  experienceLevel: { type: String, trim: true, default: "" }, // free text, extracted from JD body per spec
  isFreshGradFriendly: { type: Boolean, default: false },
  skillsRequired: { type: [String], default: [] },
});

// --- Event (Rev 5 §6.4) ---
const eventDiscriminatorSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  location: { type: String, trim: true, default: "" },
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
});

export const getScholarshipModel = (connection) => {
  const Listing = getListingModel(connection);
  if (Listing.discriminators?.scholarship) return Listing.discriminators.scholarship;
  return Listing.discriminator("scholarship", scholarshipDiscriminatorSchema);
};

export const getJobModel = (connection) => {
  const Listing = getListingModel(connection);
  if (Listing.discriminators?.job) return Listing.discriminators.job;
  return Listing.discriminator("job", jobDiscriminatorSchema);
};

export const getEventModel = (connection) => {
  const Listing = getListingModel(connection);
  if (Listing.discriminators?.event) return Listing.discriminators.event;
  return Listing.discriminator("event", eventDiscriminatorSchema);
};
