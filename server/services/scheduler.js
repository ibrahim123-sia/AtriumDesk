/**
 * ==========================================================
 * SCHEDULER.JS - Cron infrastructure (Rev 5 §4.1)
 * ==========================================================
 *
 * No cron/background-job infrastructure existed anywhere in the codebase
 * before this. This is the one place `node-cron` is scheduled — every
 * background job (SLA escalation today; recurring scrapes and digest
 * emails in later phases, per §9/§10) registers itself here so there is
 * one process to reason about, not several ad-hoc timers.
 *
 * Runs across every ACTIVE tenant, not just one — this is the one part of
 * the codebase that legitimately needs its own connection per tenant
 * rather than reusing a single request's `req.models` (there is no
 * request; cron has no caller).
 */

import cron from "node-cron";
import fetch from "node-fetch";
import { getTenantConnection } from "../config/tenantDb.js";
import { getTenantModels } from "../models/registry.js";
import { getTenantModel as getPlatformTenantModel } from "../models/platform/Tenant.js";
import { notify, sendDigestEmail } from "./notify.js";
import { evaluateHardRules, MatchState } from "./matching.js";
import { buildStudentMatchProfile } from "./studentMatchProfile.js";

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

// Rev 5 §4.1: "Configurable SLA threshold, default 48 hours from creation
// to first staff reply." Per-department override lives on Department.slaThresholdHours.
export const DEFAULT_SLA_HOURS = 48;

/**
 * Pure predicate, extracted for unit testing (§13.2's "cheapest to test, no
 * mocking" principle) — given an issue's createdAt and its department's
 * threshold (or null to use the default), has its SLA been breached as of
 * `now`? Callers are still responsible for the escalated/firstStaffReplyAt/
 * status filtering; this only answers the age-vs-threshold question.
 */
export function isSlaBreached(createdAt, thresholdHours, now = new Date()) {
  const hours = thresholdHours || DEFAULT_SLA_HOURS;
  const ageMs = now.getTime() - createdAt.getTime();
  return ageMs >= hours * 60 * 60 * 1000;
}

async function forEachActiveTenant(fn) {
  const Tenant = getPlatformTenantModel();
  const tenants = await Tenant.find({ status: "active" });
  for (const tenant of tenants) {
    try {
      const connection = getTenantConnection(tenant.dbName);
      const models = getTenantModels(connection);
      await fn(tenant, models);
    } catch (error) {
      console.error(`Scheduler job failed for tenant "${tenant.slug}":`, error);
    }
  }
}

/**
 * Finds open issues (Pending/In Progress) with no first staff reply yet,
 * older than their department's SLA threshold (or the global default), and
 * not already escalated. Marks them escalated and notifies the department
 * head (falling back to all department staff if no head is set) plus every
 * administrator in the tenant.
 */
export async function runSlaEscalationCheck() {
  await forEachActiveTenant(async (tenant, models) => {
    const departments = await models.Department.find({ isActive: true });
    const deptById = new Map(departments.map((d) => [d._id.toString(), d]));

    const candidates = await models.Issue.find({
      escalated: false,
      firstStaffReplyAt: null,
      status: { $in: ["Pending", "In Progress"] },
    }).populate("department", "code name headUserId");

    const breached = candidates.filter((issue) => {
      const dept = deptById.get(issue.department._id.toString());
      return isSlaBreached(issue.createdAt, dept?.slaThresholdHours);
    });

    // Tenant-wide, issue-independent — fetched once, not per breached issue.
    const admins = breached.length
      ? await models.User.find({ role: "admin", isBlocked: false })
      : [];

    for (const issue of breached) {
      issue.escalated = true;
      issue.escalatedAt = new Date();
      issue.lastEvent = {
        type: "escalate",
        byUserId: null,
        byName: "System",
        byRole: "system",
        at: issue.escalatedAt,
        note: "SLA breached — no first staff reply",
      };
      await issue.save();

      const dept = issue.department;
      const notifyPayload = {
        type: "issue_escalated",
        issueId: issue._id,
        message: `Escalated: "${issue.title}" has had no reply since ${issue.createdAt.toDateString()}`,
        link: `/staff/issues/${issue._id}`,
        emailSubject: `[${dept.code}] SLA breach — issue escalated`,
        emailHeading: "An issue in your department has breached its SLA",
        emailBody: `<strong>${issue.title}</strong><br/><br/>Created: ${issue.createdAt.toLocaleString()}<br/>Department: ${dept.code}<br/>No staff reply yet.`,
        branding: tenant.branding,
        tenantSlug: tenant.slug,
      };

      if (dept.headUserId) {
        const head = await models.User.findById(dept.headUserId);
        if (head) await notify(models.Notification, head, notifyPayload);
      } else {
        const deptStaff = await models.User.find({
          role: "staff",
          department: dept._id,
          isBlocked: false,
        });
        for (const staffMember of deptStaff) {
          await notify(models.Notification, staffMember, notifyPayload);
        }
      }

      for (const admin of admins) {
        await notify(models.Notification, admin, {
          ...notifyPayload,
          // Admin issue detail lives under /admin/query/:id (App.jsx has no
          // /admin/issues route — that link would dead-end on the catch-all).
          link: `/admin/query/${issue._id}`,
        });
      }
    }

    if (breached.length > 0) {
      console.log(`SLA escalation: ${breached.length} issue(s) escalated for tenant "${tenant.slug}"`);
    }
  });
}

/**
 * Rev 5 §6.5 listing lifecycle — "Expired: deadline date has passed. Status
 * -> expired. Removed from matched feed and default browse view. Still
 * reachable, and still visible to any student who saved it." Scholarships
 * and jobs have a `deadline`; events don't participate (they use the
 * upcoming/past query split instead — see eventController.js).
 */
export async function runExpiredListingsCheck() {
  await forEachActiveTenant(async (tenant, models) => {
    const result = await models.Listing.updateMany(
      {
        listingType: { $in: ["scholarship", "job"] },
        status: "approved",
        deadline: { $ne: null, $lt: new Date() },
      },
      { $set: { status: "expired" } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Expired ${result.modifiedCount} listing(s) for tenant "${tenant.slug}"`);
    }
  });
}

/**
 * Rev 5 §10: "Deadline reminders are separate and immediate. 'The
 * scholarship you saved closes in 7 days' is the single most valuable
 * email this system can send." Fires once per saved item — not on an
 * exact-day match (cron timing drift could skip it), but the first time
 * the deadline is found within the student's own lead-day window; the
 * SavedListing.deadlineReminderSentAt flag then suppresses every later run.
 */
export async function runDeadlineReminderCheck() {
  await forEachActiveTenant(async (tenant, models) => {
    const now = new Date();
    const pending = await models.SavedListing.find({ deadlineReminderSentAt: null });
    let sent = 0;

    for (const saved of pending) {
      const listing = await models.Listing.findOne({ _id: saved.listingId, status: "approved" });
      if (!listing || !listing.deadline) continue;

      const user = await models.User.findById(saved.userId);
      if (!user || !user.email) continue;
      const prefs = user.profile?.notifications || {};
      if (prefs.unsubscribeAll) continue;

      const leadDays = prefs.deadlineReminderLeadDays ?? 7;
      const msUntilDeadline = listing.deadline.getTime() - now.getTime();
      const withinWindow = msUntilDeadline > 0 && msUntilDeadline <= leadDays * 24 * 60 * 60 * 1000;
      if (!withinWindow) continue;

      const daysLeft = Math.ceil(msUntilDeadline / (24 * 60 * 60 * 1000));
      await notify(models.Notification, user, {
        type: "listing_deadline_reminder",
        message: `"${listing.title}" closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        link: `/${listing.listingType === "job" ? "jobs" : "scholarships"}/${listing._id}`,
        emailSubject: `Deadline approaching: ${listing.title}`,
        emailHeading: `"${listing.title}" closes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        emailBody: `You saved this ${listing.listingType} — its deadline is ${listing.deadline.toDateString()}. Don't miss it.`,
        branding: tenant.branding,
        tenantSlug: tenant.slug,
        includeUnsubscribeLink: true,
      });

      saved.deadlineReminderSentAt = now;
      await saved.save();
      sent += 1;
    }

    if (sent > 0) {
      console.log(`Deadline reminders: ${sent} sent for tenant "${tenant.slug}"`);
    }
  });
}

/**
 * Rev 5 §10: "Digest, not instant... Strong matches only... Send 'you're
 * eligible' items, not 'maybe' items." One batched email per student per
 * cadence, listing only newly-approved listings (since their last digest)
 * that Layer 1 scores as eligible for their own profile — never near-miss,
 * never a re-send of something already included in an earlier digest.
 */
function buildListingFilter(listingType, since) {
  const filter = { listingType, status: "approved" };
  if (since) {
    // Gate on when the listing became approved, not created — a scraped
    // listing can sit pending in the review queue past a student's last
    // digest and would otherwise never appear in any digest. approvedAt is
    // null for pre-existing documents, so fall back to createdAt for those.
    filter.$or = [
      { approvedAt: { $gt: since } },
      { approvedAt: null, createdAt: { $gt: since } },
    ];
  }
  return filter;
}

function requirementsForListing(listing) {
  if (listing.listingType === "job") {
    return { deadline: listing.deadline, workMode: listing.workMode, location: listing.location || null };
  }
  return {
    deadline: listing.deadline,
    minCgpa: listing.cgpaRequirement,
    minIelts: listing.ieltsRequirement,
    minToefl: listing.toeflRequirement,
    degreeLevel: listing.degreeLevel === "other" ? null : listing.degreeLevel,
  };
}

export async function runDigestCheck(now = new Date()) {
  const isWeeklyDay = now.getDay() === 1; // Monday — weekly students only get one run per week.

  await forEachActiveTenant(async (tenant, models) => {
    const students = await models.User.find({
      role: "student",
      isBlocked: false,
      "profile.notifications.digestFrequency": { $in: ["daily", "weekly"] },
      "profile.notifications.unsubscribeAll": { $ne: true },
    });

    let sentCount = 0;
    for (const student of students) {
      const prefs = student.profile.notifications;
      if (prefs.digestFrequency === "weekly" && !isWeeklyDay) continue;

      const since = prefs.lastDigestSentAt;
      const [scholarships, jobs] = await Promise.all([
        models.Listing.find(buildListingFilter("scholarship", since)),
        models.Listing.find(buildListingFilter("job", since)),
      ]);
      const profile = buildStudentMatchProfile(student);
      const eligible = [...scholarships, ...jobs].filter(
        (listing) => evaluateHardRules(profile, requirementsForListing(listing)).state === MatchState.ELIGIBLE
      );
      if (!eligible.length) continue;

      await sendDigestEmail(models.Notification, student, { items: eligible, branding: tenant.branding, tenantSlug: tenant.slug });
      student.profile.notifications.lastDigestSentAt = now;
      await student.save();
      sentCount += 1;
    }

    if (sentCount > 0) {
      console.log(`Digest emails: ${sentCount} sent for tenant "${tenant.slug}"`);
    }
  });
}

/**
 * Rev5 §13.1 — no ChromaDB backup/export existed at all. Python owns the
 * on-disk vector store, so Node (the cron owner) triggers it over the same
 * internal-secret bridge every other Node->Python call uses.
 */
export async function runChromaBackupCheck() {
  const response = await fetch(`${PYTHON_BACKEND_URL}/internal/backup-chroma`, {
    method: "POST",
    headers: { "x-internal-secret": INTERNAL_SECRET || "" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.detail || data.error || `Chroma backup failed with status ${response.status}`);
  }
  console.log(`Chroma backup created: ${data.path} (${data.sizeBytes} bytes, pruned ${data.prunedCount})`);
}

let started = false;

/**
 * Registers all cron jobs. Idempotent — calling twice (e.g. hot reload in
 * dev) does not double-schedule.
 */
export function startScheduler() {
  if (started) return;
  started = true;

  // Every 30 minutes, per §4.1's "every 30-60 minutes" guidance.
  cron.schedule("*/30 * * * *", () => {
    runSlaEscalationCheck().catch((error) => {
      console.error("runSlaEscalationCheck failed:", error);
    });
  });

  // Once a day — a listing's deadline doesn't need minute-level freshness.
  cron.schedule("0 3 * * *", () => {
    runExpiredListingsCheck().catch((error) => {
      console.error("runExpiredListingsCheck failed:", error);
    });
  });

  // Runs before the expiry check (2am vs 3am) so a reminder can still fire
  // for a listing that's about to expire today.
  cron.schedule("0 2 * * *", () => {
    runDeadlineReminderCheck().catch((error) => {
      console.error("runDeadlineReminderCheck failed:", error);
    });
  });

  // Once a day; internally splits daily-vs-weekly students by cadence
  // (weekly only fires on the Monday run) rather than needing two crons.
  cron.schedule("0 6 * * *", () => {
    runDigestCheck().catch((error) => {
      console.error("runDigestCheck failed:", error);
    });
  });

  // Once a day, off-peak — before the 2am/3am/6am jobs above so a corrupt
  // backup source is caught early rather than after a day of other writes.
  cron.schedule("0 1 * * *", () => {
    runChromaBackupCheck().catch((error) => {
      console.error("runChromaBackupCheck failed:", error);
    });
  });

  console.log("Scheduler started (SLA escalation: every 30 minutes; listing expiry/reminders/digests/chroma backup: daily)");
}
