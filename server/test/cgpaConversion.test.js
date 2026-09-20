// CGPA conversion unit tests (Rev 5 §6.2/§13.2) — pure function, no mocking.
//
// Run with:  node --test server/test/cgpaConversion.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { cgpaToGerman, cgpaToPercentage } from "../services/cgpaConversion.js";

test("cgpaToGerman: 4.0 CGPA converts to the best German grade (1.0)", () => {
  assert.equal(cgpaToGerman(4.0), 1.0);
});

test("cgpaToGerman: 2.0 CGPA (minimum passing) converts to the worst passing German grade (4.0)", () => {
  assert.equal(cgpaToGerman(2.0), 4.0);
});

test("cgpaToGerman: 3.0 CGPA converts to the midpoint (2.5)", () => {
  assert.equal(cgpaToGerman(3.0), 2.5);
});

test("cgpaToGerman: below the minimum passing CGPA clamps to 5.0 (fail), not an out-of-range value", () => {
  assert.equal(cgpaToGerman(1.0), 5.0);
  assert.equal(cgpaToGerman(0.0), 5.0);
});

test("cgpaToGerman: never returns a value outside the valid German 1.0-5.0 range", () => {
  for (let cgpa = 0; cgpa <= 4; cgpa += 0.25) {
    const german = cgpaToGerman(cgpa);
    assert.ok(german >= 1.0 && german <= 5.0, `cgpaToGerman(${cgpa}) = ${german} out of range`);
  }
});

test("cgpaToGerman: higher CGPA always yields a numerically better (lower) German grade", () => {
  assert.ok(cgpaToGerman(3.5) < cgpaToGerman(3.0));
  assert.ok(cgpaToGerman(3.0) < cgpaToGerman(2.5));
});

test("cgpaToPercentage: 4.0 CGPA converts to 100%", () => {
  assert.equal(cgpaToPercentage(4.0), 100);
});

test("cgpaToPercentage: 2.0 CGPA converts to 50%", () => {
  assert.equal(cgpaToPercentage(2.0), 50);
});

test("cgpaToPercentage: 0.0 CGPA converts to 0%", () => {
  assert.equal(cgpaToPercentage(0.0), 0);
});

test("cgpaToPercentage: never returns a value outside 0-100", () => {
  for (let cgpa = 0; cgpa <= 4; cgpa += 0.25) {
    const pct = cgpaToPercentage(cgpa);
    assert.ok(pct >= 0 && pct <= 100, `cgpaToPercentage(${cgpa}) = ${pct} out of range`);
  }
});

test("both conversions are pure functions: identical input always produces identical output", () => {
  assert.equal(cgpaToGerman(3.4), cgpaToGerman(3.4));
  assert.equal(cgpaToPercentage(3.4), cgpaToPercentage(3.4));
});

// Not every tenant's students grade on a 4.0 scale (server/models/User.js's
// profile.core.cgpaScale) — these cover the explicit-scale argument.
test("cgpaToPercentage: scores on a 10.0 scale convert proportionally, not as if they were 4.0-scale", () => {
  assert.equal(cgpaToPercentage(10.0, 10), 100);
  assert.equal(cgpaToPercentage(5.0, 10), 50);
  assert.equal(cgpaToPercentage(7.5, 10), 75);
});

test("cgpaToGerman: a 10.0-scale score converts using that scale's own min-passing ratio, not the 4.0 default", () => {
  assert.equal(cgpaToGerman(10, 10), 1.0);
  assert.equal(cgpaToGerman(5, 10), 4.0); // 5-of-10 is the same 50% ratio as 2-of-4
});

test("an equivalent percentage score produces the same German grade regardless of scale", () => {
  assert.equal(cgpaToGerman(3.0, 4), cgpaToGerman(7.5, 10));
  assert.equal(cgpaToPercentage(3.0, 4), cgpaToPercentage(7.5, 10));
});
