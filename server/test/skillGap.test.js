// Skill-gap comparison is a plain set difference; these cover the spellings
// students and job posts actually use for the same skill.
//
// Run with:  node --test server/test/skillGap.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { computeSkillGaps, skillKey } from "../services/skillGap.js";

test("framework spellings are the same skill", () => {
  assert.equal(skillKey("Node.js"), skillKey("nodejs"));
  assert.equal(skillKey("Node JS"), skillKey("node"));
  assert.equal(skillKey("React.js"), skillKey("React"));
});

test("C++ and C# stay distinct from C", () => {
  assert.notEqual(skillKey("C++"), skillKey("C"));
  assert.notEqual(skillKey("C#"), skillKey("C"));
});

test("javascript is not mistaken for a .js suffix", () => {
  assert.equal(skillKey("JavaScript"), "javascript");
});

test("only skills the profile lacks are reported, in the job's own words", () => {
  const gaps = computeSkillGaps(["python", "React", "node.js"], ["Python", "ReactJS", "Node", "Docker"]);
  assert.deepEqual(gaps, ["Docker"]);
});

test("no required skills -> no gaps", () => {
  assert.deepEqual(computeSkillGaps(["python"], []), []);
  assert.deepEqual(computeSkillGaps([], undefined), []);
});
