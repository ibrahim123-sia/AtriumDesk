// The "try asking" questions under the chat. A university sets its own in
// Admin -> Settings (branding.guestStarterQuestions / studentStarterQuestions);
// otherwise these defaults apply.
const DEFAULTS = (uni) => [
  "What is the fee structure for the Bachelor programs?",
  "What documents are required at the time of admission?",
  `Is ${uni} recognized by H.E.C?`,
  `In which areas does ${uni} offer degrees?`,
  `Does ${uni} offer any scholarships?`,
];

export const starterQuestionsFor = (branding, audience) => {
  const own = audience === "guest" ? branding?.guestStarterQuestions : branding?.studentStarterQuestions;
  if (Array.isArray(own) && own.length) return own;
  return DEFAULTS(branding?.universityShort || "your university");
};

export const defaultStarterQuestions = (branding) => DEFAULTS(branding?.universityShort || "your university");
