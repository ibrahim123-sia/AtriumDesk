import mongoose from "mongoose";
import { getPlatformConnection } from "../../config/tenantDb.js";

const tenantSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: [true, "slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: [true, "name is required"], trim: true },
    status: {
      type: String,
      enum: ["provisioning", "active", "suspended", "offboarded"],
      default: "provisioning",
      index: true,
    },
    // This tenant's database name on the one shared MongoDB cluster —
    // resolved via server/config/tenantDb.js's useDb(), never a separate host.
    dbName: { type: String, required: [true, "dbName is required"] },
    // This tenant's ChromaDB collection name in the one shared persistent store.
    chromaCollection: { type: String, required: [true, "chromaCollection is required"] },
    // Routing only — the domain part of a login/registration email, used to
    // resolve which tenant a request belongs to. Kept separate from any
    // tenant's fuller local-part validation pattern (a T1 concern).
    emailDomains: {
      type: [String],
      default: [],
      index: true,
    },
    // Template for auto-generated staff emails, e.g. "{dept}.maju.edu" —
    // replaces the hardcoded `maju.${deptCode}.edu` literal.
    staffEmailDomainPattern: { type: String, default: "" },
    // Rev7 SaaS follow-up — student email LOCAL-PART format, admin-settable
    // per tenant (was hardcoded to MAJU's own roll-number convention and
    // applied to every tenant via a slug=="maju" special case). Raw regex
    // source, no domain part (routing already handles the domain via
    // emailDomains above) and no leading/trailing slashes. Optional named
    // capture groups — (?<session>sp|fa), (?<year>\d{2}), (?<program>...),
    // (?<roll>\d{4}) — get auto-extracted into the student's profile on
    // registration if present; if the tenant leaves this empty, any
    // syntactically valid email is accepted with no extraction.
    studentEmailPattern: { type: String, default: "" },
    // Rev7 SaaS follow-up — "administrator sets an email + app password
    // used to send OTP" (explicit ask). A tenant's own outbound mail
    // account, so OTP/notification email comes from their own address, not
    // the platform operator's personal Gmail shared across every tenant.
    // appPasswordEncrypted is AES-256-GCM ciphertext (services/fieldCrypto.js)
    // — select:false so it never appears in a normal Tenant fetch/response.
    smtp: {
      fromEmail: { type: String, default: "" },
      fromName: { type: String, default: "" },
      appPasswordEncrypted: { type: String, default: "", select: false },
    },
    branding: {
      universityName: { type: String, default: "" },
      universityShort: { type: String, default: "" },
      logoUrl: { type: String, default: "" },
      primaryColor: { type: String, default: "" },
      supportEmail: { type: String, default: "" },
    },
    provisionedAdministrator: {
      // No cross-database `ref` — this id lives in the tenant's own database,
      // not PlatformDB, so Mongoose populate cannot resolve it here anyway.
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Rev7 §6/T3 — "billing schema fields (even without payment integration
    // wired up)". Schema only: no Stripe/payment provider is wired to these;
    // Super Admin edits them directly for now (§6 explicitly defers
    // self-serve billing/payment enforcement past FYP-2).
    billing: {
      plan: { type: String, enum: ["free", "pro", "enterprise"], default: "free" },
      billingEmail: { type: String, default: "" },
      maxUsers: { type: Number, default: null },
      trialEndsAt: { type: Date, default: null },
    },
    // Rev7 user request — Super Admin controls which modules a tenant gets,
    // set at creation time and editable after. Enforced server-side in the
    // relevant controllers (scholarshipController.js/jobController.js/
    // eventController.js check req.tenant.enabledFeatures directly; the
    // chatbot's /ask flow checks it in messageController.js/
    // guestChatController.js) — this is not just a client-side nav hide.
    enabledFeatures: {
      scholarships: { type: Boolean, default: true },
      jobs: { type: Boolean, default: true },
      events: { type: Boolean, default: true },
      chatbot: { type: Boolean, default: true },
    },
    // Rev7 SaaS follow-up — self-service chatbot knowledge-base ingestion.
    // Was a hardcoded single-website list a developer edited by hand
    // (python/config.py's WEBSITES); a new tenant's Administrator now
    // triggers their own university's site scrape from Settings. Node owns
    // this status (the job itself runs in Python, which reports back via
    // the same internal-secret webhook pattern used for listing scrapes).
    contentSource: {
      sitemapUrl: { type: String, default: "" },
      allowedDomain: { type: String, default: "" },
      baseUrl: { type: String, default: "" },
      status: { type: String, enum: ["idle", "running", "done", "failed"], default: "idle" },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      pagesScraped: { type: Number, default: 0 },
      chunksCreated: { type: Number, default: 0 },
      error: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

export const getTenantModel = () => {
  const connection = getPlatformConnection();
  return connection.models.Tenant || connection.model("Tenant", tenantSchema);
};
