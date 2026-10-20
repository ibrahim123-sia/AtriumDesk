// Layer 1 hard-rule matching unit tests (Rev 5 §13.2: "worth unit-testing —
// pure deterministic logic, no mocking required, and a silent break here
// corrupts everything downstream").
//
// Run with:  node --test server/test/matching.test.js
// (pure functions, no DB, no network — uses Node's built-in test runner)
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHardRules, MatchState, describeUnverified } from "../services/matching.js";

const NOW = new Date("2026-06-01T00:00:00Z");

test("eligible: every requirement comfortably met", () => {
  const result = evaluateHardRules(
    { cgpa: 3.8, ieltsScore: 7.0, degreeLevel: "bachelors", workModePreference: "remote" },
    { minCgpa: 3.0, minIelts: 6.5, degreeLevel: "bachelors", workMode: "remote" },
    NOW
  );
  assert.equal(result.state, MatchState.ELIGIBLE);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.gaps, []);
});

test("excluded: deadline has already passed", () => {
  const result = evaluateHardRules(
    { cgpa: 3.8 },
    { minCgpa: 3.0, deadline: "2026-01-01T00:00:00Z" },
    NOW
  );
  assert.equal(result.state, MatchState.EXCLUDED);
  assert.match(result.reasons[0], /deadline/i);
});

test("eligible: deadline is still in the future", () => {
  const result = evaluateHardRules({ cgpa: 3.8 }, { minCgpa: 3.0, deadline: "2026-12-31T00:00:00Z" }, NOW);
  assert.equal(result.state, MatchState.ELIGIBLE);
});

test("excluded: the student is already past the level the award funds", () => {
  const result = evaluateHardRules(
    { degreeLevel: "masters" },
    { degreeLevel: "bachelors" },
    NOW
  );
  assert.equal(result.state, MatchState.EXCLUDED);
  assert.match(result.reasons[0], /degree level/i);
});

test("eligible: a bachelor's student is the audience for a master's scholarship", () => {
  const result = evaluateHardRules({ degreeLevel: "bachelors" }, { degreeLevel: "masters" }, NOW);
  assert.equal(result.state, MatchState.ELIGIBLE);
});

test("excluded: work mode incompatible (onsite-only listing vs remote-only preference)", () => {
  const result = evaluateHardRules(
    { workModePreference: "remote" },
    { workMode: "onsite" },
    NOW
  );
  assert.equal(result.state, MatchState.EXCLUDED);
  assert.match(result.reasons[0], /work mode/i);
});

test("eligible: hybrid listing is compatible with a remote-only preference", () => {
  const result = evaluateHardRules({ workModePreference: "remote" }, { workMode: "hybrid" }, NOW);
  assert.equal(result.state, MatchState.ELIGIBLE);
});

test("eligible: hybrid preference is compatible with an onsite-only listing", () => {
  const result = evaluateHardRules({ workModePreference: "hybrid" }, { workMode: "onsite" }, NOW);
  assert.equal(result.state, MatchState.ELIGIBLE);
});

test("excluded: onsite listing in a city the student didn't select", () => {
  const result = evaluateHardRules(
    { preferredCity: "Karachi" },
    { workMode: "onsite", location: "Lahore" },
    NOW
  );
  assert.equal(result.state, MatchState.EXCLUDED);
  assert.match(result.reasons[0], /location/i);
});

test("near-miss: CGPA missed by within the configured margin", () => {
  const result = evaluateHardRules({ cgpa: 2.9 }, { minCgpa: 3.0 }, NOW);
  assert.equal(result.state, MatchState.NEAR_MISS);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].field, "cgpa");
  assert.equal(result.gaps[0].shortBy, 0.1);
});

test("excluded: CGPA missed by more than the configured margin", () => {
  const result = evaluateHardRules({ cgpa: 2.0 }, { minCgpa: 3.0 }, NOW);
  assert.equal(result.state, MatchState.EXCLUDED);
  assert.equal(result.gaps[0].shortBy, 1.0);
});

test("near-miss: IELTS missed by exactly the margin boundary (inclusive)", () => {
  const result = evaluateHardRules({ ieltsScore: 5.5 }, { minIelts: 6.5 }, NOW);
  assert.equal(result.state, MatchState.NEAR_MISS);
});

test("excluded: IELTS missed by just over the margin boundary", () => {
  const result = evaluateHardRules({ ieltsScore: 5.4 }, { minIelts: 6.5 }, NOW);
  assert.equal(result.state, MatchState.EXCLUDED);
});

test("gaps record every numeric shortfall, not just the first", () => {
  const result = evaluateHardRules(
    { cgpa: 2.9, ieltsScore: 6.0, toeflScore: 90 },
    { minCgpa: 3.0, minIelts: 6.5, minToefl: 100 },
    NOW
  );
  assert.equal(result.gaps.length, 3);
  const fields = result.gaps.map((g) => g.field).sort();
  assert.deepEqual(fields, ["cgpa", "ieltsScore", "toeflScore"]);
});

test("unverified: stated requirements the profile can't answer are never called eligible", () => {
  const result = evaluateHardRules(
    { cgpa: null, degreeLevel: null, workModePreference: null },
    { minCgpa: 3.5, degreeLevel: "masters", workMode: "onsite", minIelts: 7.0 },
    NOW
  );
  assert.equal(result.state, MatchState.UNVERIFIED);
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(
    result.unverified.map((u) => u.field).sort(),
    ["cgpa", "degreeLevel", "englishTest"]
  );
});

test("eligible: an empty profile against a listing with no stated requirements", () => {
  const result = evaluateHardRules({}, { deadline: "2026-12-31T00:00:00Z" }, NOW);
  assert.equal(result.state, MatchState.ELIGIBLE);
  assert.deepEqual(result.unverified, []);
});

test("excluded beats unverified: a passed deadline rules out an incomplete profile", () => {
  const result = evaluateHardRules({}, { minCgpa: 3.0, deadline: "2026-01-01T00:00:00Z" }, NOW);
  assert.equal(result.state, MatchState.EXCLUDED);
});

test("near-miss beats unverified, and still lists what's missing", () => {
  const result = evaluateHardRules({ cgpa: 2.9 }, { minCgpa: 3.0, minIelts: 6.5 }, NOW);
  assert.equal(result.state, MatchState.NEAR_MISS);
  assert.equal(result.unverified[0].field, "englishTest");
});

test("English tests are alternatives: IELTS met, no TOEFL -> eligible", () => {
  const result = evaluateHardRules({ ieltsScore: 7.0 }, { minIelts: 6.5, minToefl: 90 }, NOW);
  assert.equal(result.state, MatchState.ELIGIBLE);
  assert.deepEqual(result.gaps, []);
});

test("English tests are alternatives: TOEFL met makes a low IELTS irrelevant", () => {
  const result = evaluateHardRules({ ieltsScore: 5.0, toeflScore: 95 }, { minIelts: 6.5, minToefl: 90 }, NOW);
  assert.equal(result.state, MatchState.ELIGIBLE);
});

test("English: excluded only when every test taken is beyond its margin", () => {
  const near = evaluateHardRules({ ieltsScore: 6.0, toeflScore: 50 }, { minIelts: 6.5, minToefl: 90 }, NOW);
  assert.equal(near.state, MatchState.NEAR_MISS);
  const far = evaluateHardRules({ ieltsScore: 4.0, toeflScore: 50 }, { minIelts: 6.5, minToefl: 90 }, NOW);
  assert.equal(far.state, MatchState.EXCLUDED);
});

test("city matching ignores the country suffix and case", () => {
  const result = evaluateHardRules(
    { preferredCity: "karachi" },
    { workMode: "onsite", location: "Karachi, Pakistan" },
    NOW
  );
  assert.equal(result.state, MatchState.ELIGIBLE);
});

test("describeUnverified lists what to add in plain words", () => {
  const text = describeUnverified([
    { field: "cgpa", required: 3 },
    { field: "englishTest", required: { ielts: 6.5, toefl: 90 } },
  ]);
  assert.equal(text, "your CGPA (needs 3) and an English test score (IELTS 6.5 or TOEFL 90)");
});

test("missing requirement value means no check is applied for that field", () => {
  const result = evaluateHardRules({ cgpa: 1.5 }, { minCgpa: null }, NOW);
  assert.equal(result.state, MatchState.ELIGIBLE);
});

test("excluded state takes priority over a simultaneous near-miss", () => {
  const result = evaluateHardRules(
    { cgpa: 2.9, degreeLevel: "masters" },
    { minCgpa: 3.0, degreeLevel: "bachelors" },
    NOW
  );
  assert.equal(result.state, MatchState.EXCLUDED);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].field, "cgpa");
});

test("is a pure function: identical inputs always produce identical output", () => {
  const profile = { cgpa: 3.2, ieltsScore: 6.0 };
  const requirements = { minCgpa: 3.0, minIelts: 6.5 };
  const a = evaluateHardRules(profile, requirements, NOW);
  const b = evaluateHardRules(profile, requirements, NOW);
  assert.deepEqual(a, b);
});

test("a deadline is still open for the whole of its day", () => {
  const deadlineDay = new Date(2026, 5, 10); // local midnight, as a date-only input would be read
  const lateThatDay = new Date(2026, 5, 10, 22, 0);
  const nextDay = new Date(2026, 5, 11, 0, 30);
  assert.equal(evaluateHardRules({}, { deadline: deadlineDay }, lateThatDay).state, MatchState.ELIGIBLE);
  assert.equal(evaluateHardRules({}, { deadline: deadlineDay }, nextDay).state, MatchState.EXCLUDED);
});
