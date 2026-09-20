// Department-suggestion unit tests (Rev 5 §4.2) — pure word-overlap scoring,
// no DB, no mocking.
//
// Run with:  node --test server/test/departmentSuggestion.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { scoreOverlap, suggestDepartment, MIN_SUGGESTION_SCORE } from "../services/departmentSuggestion.js";

test("scoreOverlap: identical questions score 1", () => {
  assert.equal(scoreOverlap("what is the fee for BSCS", "what is the fee for BSCS"), 1);
});

test("scoreOverlap: completely unrelated questions score 0", () => {
  assert.equal(scoreOverlap("what is the fee for BSCS", "how do I reset my password"), 0);
});

test("scoreOverlap: partial overlap is between 0 and 1", () => {
  const score = scoreOverlap("what is the fee for BSCS", "what is the fee for BBA");
  assert.ok(score > 0 && score < 1);
});

test("scoreOverlap: stopwords don't inflate the score", () => {
  // Shares only stopwords ("what", "is", "the", "for") — no real overlap.
  const score = scoreOverlap("what is the fee for BSCS", "what is the deadline for admission");
  assert.ok(score < MIN_SUGGESTION_SCORE);
});

test("suggestDepartment: no examples returns null", () => {
  assert.equal(suggestDepartment("what is my fee", []), null);
});

test("suggestDepartment: picks the best-matching example's department", () => {
  const examples = [
    { question: "how do I reset my portal password", departmentId: "dept-it" },
    { question: "what is the fee challan amount", departmentId: "dept-finance" },
  ];
  const result = suggestDepartment("my fee challan is wrong", examples);
  assert.equal(result.departmentId, "dept-finance");
});

test("suggestDepartment: returns null when nothing clears the minimum score", () => {
  const examples = [{ question: "how do I reset my portal password", departmentId: "dept-it" }];
  const result = suggestDepartment("completely unrelated question about scholarships abroad", examples);
  assert.equal(result, null);
});

test("suggestDepartment: is a pure function", () => {
  const examples = [{ question: "fee challan issue", departmentId: "dept-finance" }];
  const a = suggestDepartment("my fee challan", examples);
  const b = suggestDepartment("my fee challan", examples);
  assert.deepEqual(a, b);
});
