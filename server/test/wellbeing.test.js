import test from "node:test";
import assert from "node:assert/strict";
import { mentionsSelfHarm, wellbeingReply } from "../services/wellbeing.js";

test("recognises self-harm language in English, Roman Urdu and Urdu", () => {
  for (const text of [
    "I keep thinking about suicide",
    "i want to kill myself",
    "I've been self-harming again",
    "sometimes I want to end my life",
    "I just want to die",
    "I don't want to live anymore",
    "everyone would be better off dead without me",
    "mujhe khudkushi ka khayal aata hai",
    "main mar jana chahta hoon",
    "ab jeena nahi chahti",
    "میں خودکشی کے بارے میں سوچتا ہوں",
  ]) {
    assert.equal(mentionsSelfHarm(text), true, text);
  }
});

test("stays quiet on ordinary questions", () => {
  for (const text of [
    "What is the deadline for the fee challan?",
    "How do I kill a process on the lab computers?",
    "Is there a die-hard fan club?",
    "Can I drop a course after the midterm?",
    "what is the hostel fee",
    "",
  ]) {
    assert.equal(mentionsSelfHarm(text), false, text);
  }
});

test("the reply uses the university's own support text when set", () => {
  const own = wellbeingReply({ wellbeingMessage: "Counselling Centre, Room 12 · counselling@uni.edu" });
  assert.match(own, /Counselling Centre, Room 12/);
  const generic = wellbeingReply({});
  assert.match(generic, /counselling or student-affairs office/);
  assert.doesNotMatch(generic, /\d{3,}/, "no hardcoded phone numbers");
});
