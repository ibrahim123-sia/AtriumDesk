// A chat message that suggests the person may be thinking about harming
// themselves gets a fixed, human-written reply with the university's own
// support contacts — never a model's improvised answer, never cached, and
// never logged as a "failed question".
//
// Deliberately phrase-based (English, Roman Urdu, Urdu script): it should
// catch the common ways people say this, and stay quiet on ordinary
// questions ("deadline", "kill the process").
const PATTERNS = [
  /\bsuicid(e|al)\b/i,
  /\b(kill|killing|hurt|hurting|harm|harming|cut|cutting)\s+my\s*self\b/i,
  /\bself[\s-]?harm(ing)?\b/i,
  /\b(end|ending|take|taking)\s+my\s+(own\s+)?life\b/i,
  /\b(want|wanted|wanna)\s+to\s+die\b/i,
  /\bdon'?t\s+want\s+to\s+(live|be\s+alive)\b/i,
  /\b(no|nothing)\s+(reason|point)\s+(to|in)\s+(live|living)\b/i,
  /\bbetter\s+off\s+dead\b/i,
  // Roman Urdu
  /\bkhud\s*-?\s*k(h)?ushi\b/i,
  /\b(mar|marr)\s*(jana|jaana|na)\s+chaht[aie]\b/i,
  /\bjee?na\s+nahi\s+chaht[aie]\b/i,
  /\bzindagi\s+khatam\s+kar/i,
  /\bapni\s+jaan\s+(le|lena|de|dena)\b/i,
  // Urdu script
  /خود\s*کشی/,
  /مرنا\s*چاہت/,
  /زندگی\s*ختم\s*کر/,
  /جینا\s*نہیں\s*چاہت/,
];

export const mentionsSelfHarm = (text) => {
  const value = String(text || "");
  return PATTERNS.some((pattern) => pattern.test(value));
};

const GENERIC_SUPPORT =
  "Please reach out to your university's counselling or student-affairs office, or someone you trust — today. " +
  "If you're in immediate danger, call your local emergency number now.";

// `branding.wellbeingMessage` is set by the university's administrator
// (counselling office, hours, phone, helplines they trust).
export const wellbeingReply = (branding) => {
  // Each line the administrator wrote stays its own line (markdown hard breaks).
  const own = String(branding?.wellbeingMessage || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("  \n");
  const support = own || GENERIC_SUPPORT;
  return [
    "I'm really sorry you're going through this. You don't have to carry it alone, and talking to someone can help.",
    support,
    "If you'd like, tell me a little about what's happening and I'll help you find the right person on campus.",
  ].join("\n\n");
};
