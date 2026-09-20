import mongoose from "mongoose";

export const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    required: [true, 'Name is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  otp: {
    type: String,
    select: false
  },
  otpExpires: {
    type: Date,
    select: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  resetPasswordOtp: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  // userController.js's verifyOtp/resetPassword read+increment these to
  // lock out repeated bad-code guesses, the same LOGIN_LOCKOUT idea as
  // loginUser but keyed to the OTP/reset code itself rather than the
  // password. Undeclared until now, so every write was silently dropped by
  // Mongoose's strict mode — the exact same dead-field bug class as the
  // already-fixed login-lockout counter (Rev 6 finding #1) — meaning these
  // two brute-force guards never actually persisted or fired.
  otpAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  resetPasswordAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  role: {
    type: String,
    enum: ["student", "staff", "admin"],
    default: "student",
    index: true,
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Department",
    default: null,
    index: true,
  },
  staffTitle: {
    type: String,
    default: null,
  },
  // User request — lets an Administrator delegate specific admin
  // capabilities to a trusted staff member instead of all-or-nothing role
  // access. Meaningless for role !== "staff" (admins already have every
  // capability; students never reach these routes at all).
  staffPermissions: {
    data: { type: Boolean, default: false },
    content: { type: Boolean, default: false },
    query: { type: Boolean, default: false },
    failedQuestions: { type: Boolean, default: false },
  },
  profilePicture: {
    // Relative URL under /uploads/avatars/ — client prepends VITE_SERVER_URL.
    // Empty string = fall back to initial-letter avatar.
    type: String,
    default: "",
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
  flags: {
    type: [
      new mongoose.Schema(
        {
          type: { type: String, default: "inappropriate_language" },
          message: { type: String, default: "" },
          matches: { type: [String], default: [] },
          chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", default: null },
          timestamp: { type: Date, default: Date.now },
        },
        { _id: true }
      ),
    ],
    default: [],
  },
  // Unified student profile (Rev 5 §5.1) — one profile in four sections, feeding
  // Scholarships/Jobs/Events matching. `core.degreeProgram`/session/admissionYear/
  // rollNumber were previously read and written by userController.js
  // as top-level fields that were never declared on this schema, so Mongoose
  // silently dropped every write (same dead-field bug class as Rev 6 finding #1,
  // but for profile data instead of login lockout) — declaring them here as
  // part of building this section fixes that alongside adding what Rev 5 asks for.
  profile: {
    core: {
      degreeProgram: { type: String, default: "" },
      session: { type: String, default: "" },
      admissionYear: { type: Number, default: null },
      rollNumber: { type: String, default: "" },
      // `cgpa` is on whatever scale `cgpaScale` says (validated against
      // cgpaScale in userController.js's update handler, since Mongoose
      // can't cross-reference a sibling field's value in `max`). Not every
      // tenant's students grade on a 4.0 scale, so the scale is captured
      // alongside the score rather than assumed — see cgpaConversion.js.
      cgpa: { type: Number, min: 0, default: null },
      cgpaScale: { type: Number, min: 1, default: 4 },
      currentSemester: { type: Number, min: 1, max: 12, default: null },
      expectedGraduationDate: { type: Date, default: null },
    },
    career: {
      skills: { type: [String], default: [] },
      workModePreference: { type: String, enum: ["remote", "onsite", "hybrid", ""], default: "" },
      preferredCity: { type: String, default: "" },
      experienceLevel: { type: String, enum: ["fresh_grad", "0-1", "1-3", "3-5", "5+", ""], default: "" },
    },
    studyAbroad: {
      ieltsScore: { type: Number, min: 0, max: 9, default: null },
      toeflScore: { type: Number, min: 0, max: 120, default: null },
      targetCountries: { type: [String], default: [] },
      fundingPreference: { type: String, enum: ["fully_funded", "partial", "self_funded", ""], default: "" },
      intendedFieldOfStudy: { type: String, default: "" },
    },
    events: {
      interests: { type: [String], default: [] },
      societyMemberships: { type: [String], default: [] },
    },
    notifications: {
      digestFrequency: { type: String, enum: ["daily", "weekly", "off"], default: "off" },
      modules: { type: [String], default: [] },
      deadlineReminderLeadDays: { type: Number, default: 7 },
      unsubscribeAll: { type: Boolean, default: false },
      // §10 digest — "new strong matches since last digest." Stamped after
      // each successful send so the next run only includes what's new.
      lastDigestSentAt: { type: Date, default: null },
    },
    // Stamped when a CV is parsed — the raw file itself is never stored past
    // parsing (Rev 5 §5.3): "Delete the raw CV file after parsing."
    cvLastParsedAt: { type: Date, default: null },
  },
}, {
  timestamps: true
});

// No default export — this schema is compiled into a Model per-tenant via
// server/models/registry.js (getTenantModels), never against a single
// process-wide default connection. See server/config/tenantDb.js.
