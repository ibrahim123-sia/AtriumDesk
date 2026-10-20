import test from "node:test";
import assert from "node:assert/strict";
import { businessHoursBetween, isValidTimeZone } from "../services/businessHours.js";
import { isSlaBreached } from "../services/scheduler.js";

const PK = { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, timezone: "Asia/Karachi" };
// Karachi is UTC+5 all year.
const pkt = (iso) => new Date(`${iso}+05:00`);

test("counts only working hours on working days", () => {
  // Monday 10:00 → Monday 15:30
  assert.equal(businessHoursBetween(pkt("2026-10-19T10:00:00"), pkt("2026-10-19T15:30:00"), PK), 5.5);
  // Before opening and after closing don't count
  assert.equal(businessHoursBetween(pkt("2026-10-19T06:00:00"), pkt("2026-10-19T20:00:00"), PK), 8);
});

test("a Friday-afternoon issue doesn't breach over the weekend", () => {
  const filed = pkt("2026-10-23T16:00:00"); // Friday 4pm
  assert.equal(businessHoursBetween(filed, pkt("2026-10-25T23:00:00"), PK), 1); // Sunday night: still 1 hour
  assert.equal(businessHoursBetween(filed, pkt("2026-10-26T10:00:00"), PK), 2); // Monday 10am
  const sla = { ...PK, enabled: true };
  assert.equal(isSlaBreached(filed, 2, pkt("2026-10-25T23:00:00"), sla), false);
  assert.equal(isSlaBreached(filed, 2, pkt("2026-10-26T10:00:00"), sla), true);
});

test("spans weeks and respects other time zones and working weeks", () => {
  // Two full working weeks = 80 hours
  assert.equal(businessHoursBetween(pkt("2026-10-19T00:00:00"), pkt("2026-11-02T00:00:00"), PK), 80);
  // A Saturday–Thursday week (Friday off), 8am–2pm in Dubai (UTC+4)
  const gulf = { days: [6, 0, 1, 2, 3, 4], startHour: 8, endHour: 14, timezone: "Asia/Dubai" };
  const fri = new Date("2026-10-23T08:00:00+04:00");
  assert.equal(businessHoursBetween(fri, new Date("2026-10-23T14:00:00+04:00"), gulf), 0);
  assert.equal(businessHoursBetween(fri, new Date("2026-10-24T09:30:00+04:00"), gulf), 1.5);
});

test("plain clock hours when working hours are off; bad input is safe", () => {
  const created = new Date("2026-10-23T11:00:00Z");
  assert.equal(isSlaBreached(created, 48, new Date("2026-10-25T11:00:00Z")), true);
  assert.equal(isSlaBreached(created, 48, new Date("2026-10-25T11:00:00Z"), { ...PK, enabled: false }), true);
  assert.equal(businessHoursBetween(pkt("2026-10-20T10:00:00"), pkt("2026-10-19T10:00:00"), PK), 0);
  assert.equal(businessHoursBetween(pkt("2026-10-19T10:00:00"), pkt("2026-10-20T10:00:00"), { ...PK, days: [] }), 0);
  assert.equal(isValidTimeZone("Asia/Karachi"), true);
  assert.equal(isValidTimeZone("Mars/Olympus"), false);
});
