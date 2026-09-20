import jwt from "jsonwebtoken";
import { getMailerForTenant } from "./mailer.js";

const DEFAULT_BRAND_NAME = "AtriumDesk";
const DEFAULT_BRAND_COLOR = "#1E2E6E";

// `branding` is the caller's tenant branding (req.tenant?.branding) — falls
// back to the original hardcoded AtriumDesk/MAJU look when absent, so this
// stays backward-compatible for any call site that hasn't been threaded
// through yet.
const emailTemplate = ({ heading, body, link, branding, unsubscribeLink }) => {
  const brandName = branding?.universityName || branding?.universityShort || DEFAULT_BRAND_NAME;
  const brandColor = branding?.primaryColor || DEFAULT_BRAND_COLOR;
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
    <div style="background: ${brandColor}; color: white; padding: 15px; border-radius: 10px 10px 0 0; text-align: center;">
      <h1 style="margin: 0;">${brandName}</h1>
    </div>
    <div style="padding: 25px;">
      <h2 style="color: ${brandColor};">${heading}</h2>
      <p>${body}</p>
      ${
        link
          ? `<p style="margin-top: 24px;"><a href="${link}" style="background: ${brandColor}; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px;">View in ${brandName}</a></p>`
          : ""
      }
      <p style="color: #666; font-size: 12px; margin-top: 24px;">${brandName}${branding?.supportEmail ? ` | ${branding.supportEmail}` : ""}</p>
      ${
        unsubscribeLink
          ? `<p style="color: #999; font-size: 11px; margin-top: 8px;"><a href="${unsubscribeLink}" style="color: #999;">Unsubscribe from these emails</a> · change frequency in your profile settings</p>`
          : ""
      }
    </div>
  </div>
`;
};

// Rev 5 §10: "Unsubscribe link... on every email" — for digests/reminders
// specifically (discretionary, batched mail), not the generic notify()
// path used for issue-lifecycle events the student directly caused.
//
// Deliberately shaped so this token can NEVER double as a login session:
// `protect` (middlewares/auth.js) reads `decoded.id`/`decoded.tenantSlug`;
// this payload uses different claim names (`uid`/`tslug`) plus a `purpose`
// guard the unsubscribe endpoint itself checks. A leaked unsubscribe link
// can only unsubscribe — jwt.verify would succeed against `protect` too,
// but `decoded.id` would be undefined there, so it 401s as "token missing
// tenant" rather than granting a session.
export const signUnsubscribeToken = (userId, tenantSlug) =>
  jwt.sign({ uid: userId, tslug: tenantSlug, purpose: "unsubscribe" }, process.env.JWT_SECRET, { expiresIn: "60d" });

const buildUnsubscribeLink = (userId, tenantSlug) => {
  const clientBase = process.env.CLIENT_URL || "";
  const token = signUnsubscribeToken(userId, tenantSlug);
  return `${clientBase}/unsubscribe?token=${encodeURIComponent(token)}`;
};

// Send an email to an arbitrary address WITHOUT creating an in-app notification.
// Used for security alerts (e.g. "your sign-in email was just changed") that
// need to reach the OLD address, which is no longer attached to any user record.
export const sendDirectEmail = async ({ to, subject, heading, body, link, branding, tenantSlug }) => {
  if (!to) return;
  const brandName = branding?.universityName || branding?.universityShort || DEFAULT_BRAND_NAME;
  try {
    const clientBase = process.env.CLIENT_URL || "";
    const fullLink = clientBase && link ? `${clientBase}${link}` : null;
    const { transporter, fromEmail } = await getMailerForTenant(tenantSlug);
    await transporter.sendMail({
      from: `"${brandName}" <${fromEmail}>`,
      to,
      subject: subject || heading,
      html: emailTemplate({
        heading: heading || subject,
        body: body || "",
        link: fullLink,
        branding,
      }),
      text: `${heading || subject}${fullLink ? `\n\nOpen: ${fullLink}` : ""}`,
    });
  } catch (err) {
    console.error("sendDirectEmail failed:", err.message);
  }
};

// Rev 5 §10: "Digest, not instant... Digesting needs a new function, a new
// template, and a new enum value — not a drop-in reuse [of notify()]." One
// email batching every new strong match since the student's last digest,
// plus ONE Notification doc (not one per listing).
export const sendDigestEmail = async (NotificationModel, user, { items, branding, tenantSlug }) => {
  if (!items?.length) return;

  const clientBase = process.env.CLIENT_URL || "";
  const rows = items
    .map((item) => {
      const path = item.listingType === "job" ? "jobs" : "scholarships";
      const link = clientBase ? `${clientBase}/${path}/${item._id}` : `/${path}/${item._id}`;
      return `<li><a href="${link}">${item.title}</a> — ${item.organization}</li>`;
    })
    .join("");
  const message = `${items.length} new match${items.length === 1 ? "" : "es"} since your last digest`;

  try {
    await NotificationModel.create({
      userId: user._id,
      type: "listing_digest",
      message,
      link: "/scholarships",
    });
  } catch (err) {
    console.error("sendDigestEmail: failed to create notification doc", err.message);
  }

  if (!user.email) return;
  try {
    const brandName = branding?.universityName || branding?.universityShort || DEFAULT_BRAND_NAME;
    const { transporter, fromEmail } = await getMailerForTenant(tenantSlug);
    await transporter.sendMail({
      from: `"${brandName}" <${fromEmail}>`,
      to: user.email,
      subject: message,
      html: emailTemplate({
        heading: message,
        body: `<ul style="padding-left: 18px;">${rows}</ul>`,
        link: clientBase ? `${clientBase}/scholarships` : null,
        branding,
        unsubscribeLink: buildUnsubscribeLink(user._id, tenantSlug),
      }),
      text: `${message}\n\n${items.map((i) => `- ${i.title} (${i.organization})`).join("\n")}`,
    });
  } catch (err) {
    console.error("sendDigestEmail: email send failed", err.message);
  }
};

// `NotificationModel` is the caller's tenant-scoped Notification model
// (req.models.Notification) — Notification is compiled per-tenant via
// server/models/registry.js, not against a single shared default connection.
// `branding` (req.tenant?.branding) drives the email's look; omitted, it
// falls back to the original AtriumDesk defaults.
export const notify = async (
  NotificationModel,
  user,
  { type, issueId, message, link, emailSubject, emailHeading, emailBody, branding, tenantSlug, includeUnsubscribeLink }
) => {
  try {
    await NotificationModel.create({
      userId: user._id,
      type,
      issueId: issueId || null,
      message,
      link: link || "",
    });
  } catch (err) {
    console.error("notify: failed to create notification doc", err.message);
  }

  if (user.email) {
    try {
      const clientBase = process.env.CLIENT_URL || "";
      const fullLink = clientBase && link ? `${clientBase}${link}` : null;
      const brandName = branding?.universityName || branding?.universityShort || DEFAULT_BRAND_NAME;
      const { transporter, fromEmail } = await getMailerForTenant(tenantSlug);

      await transporter.sendMail({
        from: `"${brandName}" <${fromEmail}>`,
        to: user.email,
        subject: emailSubject || message,
        html: emailTemplate({
          heading: emailHeading || message,
          body: emailBody || message,
          link: fullLink,
          branding,
          unsubscribeLink: includeUnsubscribeLink ? buildUnsubscribeLink(user._id, tenantSlug) : null,
        }),
        text: `${message}${fullLink ? `\n\nOpen: ${fullLink}` : ""}`,
      });
    } catch (err) {
      console.error("notify: email send failed", err.message);
    }
  }
};
