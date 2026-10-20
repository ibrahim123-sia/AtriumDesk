// Rev7 SaaS follow-up — replaces two independent hardcoded Gmail
// transporters (notify.js and userController.js each had their own copy of
// the exact same config, both reading the platform operator's own
// EMAIL_USER/EMAIL_PASS). One factory now: falls back to the platform
// default when a tenant hasn't configured its own SMTP account, otherwise
// builds (and caches) a transport using that tenant's own credentials —
// so OTP/notification email comes from the university's own address once
// they set one up, per explicit request.
import nodemailer from "nodemailer";
import { getTenantModel } from "../models/platform/Tenant.js";
import { decryptField } from "./fieldCrypto.js";

// The platform-default sender. Gmail (EMAIL_USER/EMAIL_PASS, an app
// password) unless SMTP_* points somewhere else — any provider with an SMTP
// relay works without a code change, e.g. Brevo (smtp-relay.brevo.com:587)
// or Resend (smtp.resend.com:465, SMTP_SECURE=true). An empty SMTP_USER
// means no authentication (a local relay or test sink).
//
// rejectUnauthorized:false disabled TLS certificate validation on the
// STARTTLS connection (MITM risk on the OTP/reset codes this carries), and
// pinning ciphers:SSLv3 forced a legacy, weak cipher suite — neither is
// needed for a normal connection.
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_USER = process.env.SMTP_USER ?? process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS ?? process.env.EMAIL_PASS;
const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM || SMTP_USER || process.env.EMAIL_USER;

const defaultTransporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

let verifiedDefault = false;
export function verifyDefaultTransporter() {
  if (verifiedDefault) return;
  verifiedDefault = true;
  defaultTransporter.verify((error) => {
    if (error) {
      console.log(`❌ SMTP error (${SMTP_HOST}):`, error.message);
      if (SMTP_HOST === "smtp.gmail.com") {
        console.log("Fix: 1) Remove spaces from App Password 2) Enable 2FA on Google — or set SMTP_* for another provider");
      }
    } else {
      console.log(`✅ SMTP connected (${SMTP_HOST})`);
    }
  });
}

const tenantTransportCache = new Map(); // tenantSlug -> { transporter, fromEmail, fromName }

export function invalidateMailerCache(tenantSlug) {
  tenantTransportCache.delete(tenantSlug);
}

/**
 * Returns { transporter, fromAddress } for the given tenant slug. Falls back
 * to the platform-default transporter/from-address when the tenant has no
 * SMTP account of its own configured (the common case, and always the case
 * until an admin sets one up in Settings).
 */
export async function getMailerForTenant(tenantSlug) {
  const fallback = {
    transporter: defaultTransporter,
    fromEmail: DEFAULT_FROM_EMAIL,
    fromAddress: `"AtriumDesk" <${DEFAULT_FROM_EMAIL}>`,
  };
  if (!tenantSlug) return fallback;

  const cached = tenantTransportCache.get(tenantSlug);
  if (cached) return cached;

  try {
    const Tenant = getTenantModel();
    const tenant = await Tenant.findOne({ slug: tenantSlug }).select("+smtp.appPasswordEncrypted");
    if (!tenant?.smtp?.fromEmail || !tenant.smtp.appPasswordEncrypted) return fallback;

    const appPassword = decryptField(tenant.smtp.appPasswordEncrypted);
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: tenant.smtp.fromEmail, pass: appPassword },
    });

    const displayName = tenant.smtp.fromName || tenant.branding?.universityName || "AtriumDesk";
    const result = {
      transporter,
      fromEmail: tenant.smtp.fromEmail,
      fromAddress: `"${displayName}" <${tenant.smtp.fromEmail}>`,
    };
    tenantTransportCache.set(tenantSlug, result);
    return result;
  } catch (error) {
    console.error(`getMailerForTenant(${tenantSlug}) failed, using platform default:`, error.message);
    return fallback;
  }
}
