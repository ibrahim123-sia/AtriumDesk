// SLA breach-detection unit tests (Rev 5 §4.1) — pure predicate, no DB, no
// mocking, same "cheap and high-stakes" rationale as matching.test.js.
//
// Run with:  node --test server/test/scheduler.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { isSlaBreached, DEFAULT_SLA_HOURS } from "../services/scheduler.js";

const NOW = new Date("2026-06-03T00:00:00Z");

test("not breached: issue created well within the default 48h window", () => {
  const createdAt = new Date("2026-06-02T12:00:00Z"); // 12h old
  assert.equal(isSlaBreached(createdAt, null, NOW), false);
});

test("breached: issue older than the default 48h threshold", () => {
  const createdAt = new Date("2026-05-31T00:00:00Z"); // 72h old
  assert.equal(isSlaBreached(createdAt, null, NOW), true);
});

test("breached: exactly at the threshold boundary (inclusive)", () => {
  const createdAt = new Date(NOW.getTime() - DEFAULT_SLA_HOURS * 60 * 60 * 1000);
  assert.equal(isSlaBreached(createdAt, null, NOW), true);
});

test("not breached: one millisecond before the threshold boundary", () => {
  const createdAt = new Date(NOW.getTime() - DEFAULT_SLA_HOURS * 60 * 60 * 1000 + 1);
  assert.equal(isSlaBreached(createdAt, null, NOW), false);
});

test("per-department threshold overrides the default", () => {
  const createdAt = new Date("2026-06-02T18:00:00Z"); // 6h old
  assert.equal(isSlaBreached(createdAt, 4, NOW), true); // 6h > 4h threshold
  assert.equal(isSlaBreached(createdAt, 12, NOW), false); // 6h < 12h threshold
});

test("zero is falsy and falls back to the default (guards against a misconfigured 0)", () => {
  const createdAt = new Date("2026-06-02T12:00:00Z"); // 12h old
  assert.equal(isSlaBreached(createdAt, 0, NOW), false); // falls back to 48h default, not breached
});

test("is a pure function: identical inputs always produce identical output", () => {
  const createdAt = new Date("2026-05-31T00:00:00Z");
  assert.equal(isSlaBreached(createdAt, 24, NOW), isSlaBreached(createdAt, 24, NOW));
});

// runScheduledJobs() (the hourly external trigger used on Cloudflare) picks
// daily jobs by hour — each must run exactly once a day, at the same hour
// the in-process cron uses.
import { DAILY_JOB_HOURS, dailyJobsForHour } from "../services/scheduler.js";

test("every daily job is picked at exactly one hour of the day", () => {
  const seen = [];
  for (let hour = 0; hour < 24; hour += 1) seen.push(...dailyJobsForHour(hour));
  assert.deepEqual(seen.sort(), Object.keys(DAILY_JOB_HOURS).sort());
});

test("daily jobs fire at their configured hours, none in between", () => {
  assert.deepEqual(dailyJobsForHour(DAILY_JOB_HOURS.chromaBackup), ["chromaBackup"]);
  assert.deepEqual(dailyJobsForHour(DAILY_JOB_HOURS.digests), ["digests"]);
  assert.deepEqual(dailyJobsForHour(12), []);
});

test("deadline reminders run before the expiry check", () => {
  assert.ok(DAILY_JOB_HOURS.deadlineReminders < DAILY_JOB_HOURS.expiredListings);
});
