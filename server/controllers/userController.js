import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import fetch from "node-fetch";
import FormData from "form-data";
import { getModelsForTenant } from "../models/registry.js";
import { resolveTenantByEmailDomain, resolveTenantBySlug } from "../services/tenantRegistry.js";
import { getPlatformAuditLogModel } from "../models/platform/PlatformAuditLog.js";
import { peekGuestSessionMessages, deleteGuestSession } from "./guestChatController.js";
import { getMailerForTenant, verifyDefaultTransporter } from "../services/mailer.js";
import { MAX_MATCHED_INPUT_LENGTH } from "../services/regexSafety.js";

verifyDefaultTransporter();

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

// Resolves which tenant a login/registration email belongs to, purely by
// domain (routing) — kept separate from a tenant's own local-part validation
// (validateStudentEmailForTenant below), which runs only after a tenant is
// resolved.
const resolveTenantForEmail = async (email) => {
  const domain = String(email || "").split("@")[1];
  if (!domain) return null;
  return resolveTenantByEmailDomain(domain.toLowerCase().trim());
};


// Rev7 user request — the client needs to know which modules are enabled
// for this tenant (to hide nav items for disabled ones), so it rides along
// on the same tenantBranding payload every login/getUser response already
// sends rather than a separate round-trip.
const buildTenantBranding = (tenant) => {
  if (!tenant) return null;
  const branding = tenant.branding?.toObject ? tenant.branding.toObject() : tenant.branding;
  const enabledFeatures = tenant.enabledFeatures?.toObject ? tenant.enabledFeatures.toObject() : tenant.enabledFeatures;
  return { ...branding, enabledFeatures, slug: tenant.slug };
};

// Recorded when no tenant's emailDomains matches the attempted email — this
// case has no tenant database to write a LoginEvent into, so it would
// otherwise leave no audit trail at all.
const recordUnresolvedLogin = (req, email) => {
  const domain = String(email || "").split("@")[1] || "";
  getPlatformAuditLogModel()
    .create({
      action: "unresolved_login_attempt",
      payload: { domain },
      ip: req.ip || req.headers["x-forwarded-for"] || "",
    })
    .catch((err) => console.error("recordUnresolvedLogin failed:", err.message));
};

const recordLogin = (models, req, email, userId, success, reason = "") =>
  models.LoginEvent.create({
    userId: userId || null,
    email: (email || "").toLowerCase(),
    success,
    reason,
    ip: req.ip || req.headers["x-forwarded-for"] || "",
    userAgent: req.headers["user-agent"] || "",
  }).catch((err) => console.error("recordLogin failed:", err.message));

// Legacy MAJU program-code -> full-name lookup. Applied generically to ANY
// tenant whose studentEmailPattern captures a `program` group using these
// same 4 codes (harmless no-op for tenants that don't); a tenant using
// different codes just gets its raw captured text as the program name.
const PROGRAM_CODES = {
  'bscs': 'BS Computer Science',
  'bsai': 'BS Artificial Intelligence',
  'bsse': 'BS Software Engineering',
  'bsbc': 'BS Business Computing'
};

// Rev7 SaaS follow-up — student email LOCAL-PART format is now a per-tenant
// schema field (Tenant.studentEmailPattern, Administrator-editable in
// Settings) instead of a hardcoded MAJU-only regex gated by `tenant.slug ===
// "maju"`. MAJU's own tenant document is seeded with the equivalent
// pattern, so no tenant is special-cased in code anymore — this validator
// is genuinely generic.
//
// Pattern convention: a regex fragment matching the LOCAL PART only (no
// domain — routing already handles that via emailDomains), with optional
// named capture groups (?<session>...) (?<year>\d{2}) (?<program>...)
// (?<roll>...) that get auto-extracted into the student's profile when
// present. No pattern configured = any syntactically valid email is
// accepted, no extraction.
export const validateStudentEmailForTenant = (tenant, email) => {
  const trimmedEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { isValid: false, error: "Invalid email format" };
  }

  const pattern = tenant?.studentEmailPattern?.trim();
  if (!pattern) return { isValid: true, email: trimmedEmail };

  const localPart = trimmedEmail.slice(0, trimmedEmail.indexOf("@"));
  // Defense in depth against ReDoS in a tenant-authored pattern: even if
  // the save-time heuristic (regexSafety.js) misses an unsafe pattern, no
  // real student email local-part is anywhere near this long, so capping
  // the input bounds worst-case backtracking time to something tolerable
  // instead of attacker-growable.
  if (localPart.length > MAX_MATCHED_INPUT_LENGTH) {
    return { isValid: false, error: "This email does not match your university's required student email format." };
  }

  let regex;
  try {
    regex = new RegExp(`^${pattern}$`, "i");
  } catch {
    // A malformed admin-entered pattern shouldn't lock every student out —
    // fall back to accepting any syntactically valid email.
    console.error(`Tenant ${tenant.slug} has an invalid studentEmailPattern — ignoring it.`);
    return { isValid: true, email: trimmedEmail };
  }

  const match = localPart.match(regex);
  if (!match) {
    return { isValid: false, error: "This email does not match your university's required student email format." };
  }

  const groups = match.groups || {};
  const result = { isValid: true, email: trimmedEmail };
  if (groups.session) result.sessionType = groups.session.toLowerCase();
  if (groups.year) result.year = parseInt(groups.year, 10);
  if (groups.roll) result.rollNumber = groups.roll;
  if (groups.program) {
    const code = groups.program.toLowerCase();
    result.programCode = code;
    result.programName = PROGRAM_CODES[code] || groups.program.toUpperCase();
  }
  return result;
};

// Helper function to hash password
const hashPassword = async (password) => {
  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Keys by IP + the email's domain, not IP alone — a shared campus NAT
// serving two different tenants would otherwise let one university's users
// exhaust the shared IP's quota and lock out the other university's users.
const tenantAwareKey = (req) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  const domain = email.includes("@") ? email.split("@")[1] : "no-domain";
  return `${ipKeyGenerator(req.ip || "")}:${domain}`;
};

// OTP rate limiter
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: "Too many OTP requests, please try again later",
  skipSuccessfulRequests: true,
  keyGenerator: tenantAwareKey,
});

// /login has no rate limit of its own today — only the per-email LoginEvent
// lockout below, which doesn't stop a spray attack across many different
// emails from one IP. This catches that case; tenant-aware for the same NAT
// reason as otpLimiter above.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many login attempts, please try again later",
  skipSuccessfulRequests: true,
  keyGenerator: tenantAwareKey,
});

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const generateToken = (id, tenantSlug) => {
  const userId = id.toString ? id.toString() : id;
  return jwt.sign({ id: userId, tenantSlug }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// Email sending function — uses the sending tenant's own SMTP account when
// they've configured one (Rev7 SaaS follow-up: "administrator sets an email
// + app password used to send OTP"), otherwise the platform default.
const sendOtpEmail = async (toEmail, name, otp, subject = 'OTP Verification', tenant = null) => {
  try {
    const { transporter, fromAddress } = await getMailerForTenant(tenant?.slug);
    const brandName = tenant?.branding?.universityName || tenant?.branding?.universityShort || "AtriumDesk";
    const mailOptions = {
      from: fromAddress,
      to: toEmail,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <div style="background: #4a6fa5; color: white; padding: 15px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="margin: 0;">${brandName} Verification</h1>
          </div>
          <div style="padding: 25px;">
            <h2>Hello ${name},</h2>
            <p>Your verification code is:</p>
            <div style="background: #f8f9fa; padding: 25px; text-align: center; margin: 25px 0; border-radius: 8px; border-left: 4px solid #4a6fa5;">
              <div style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #2c3e50;">${otp}</div>
            </div>
            <p><strong>This code expires in 5 minutes.</strong></p>
            <div style="background: #fff3cd; padding: 12px; border-radius: 5px; margin: 20px 0; border: 1px solid #ffeaa7;">
              <p style="margin: 0; color: #856404;">
                ⚠️ <strong>For University Emails:</strong> Check your <strong>SPAM or JUNK</strong> folder.
              </p>
            </div>
            <p style="color: #666; font-size: 12px;">
              Sent via ${brandName}
            </p>
          </div>
        </div>
      `,
      text: `${brandName} OTP: ${otp}. Expires in 5 minutes. Check spam folder.`,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high'
      }
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to: ${toEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Email error:', error.message);
    return false;
  }
};

export const registerUser = async (req, res) => {
  const { name, email, password } = req.body;

  // Input validation
  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "All fields (name, email, password) are required"
    });
  }

  if (name.length < 2) {
    return res.status(400).json({
      success: false,
      message: "Name must be at least 2 characters long"
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long"
    });
  }

  const tenant = await resolveTenantForEmail(email);
  if (!tenant) {
    return res.status(400).json({
      success: false,
      message: "This email domain is not registered with any university on this platform",
    });
  }

  // Validate MAJU email format
  const emailValidation = validateStudentEmailForTenant(tenant, email);
  if (!emailValidation.isValid) {
    return res.status(400).json({
      success: false,
      message: emailValidation.error
    });
  }

  try {
    const models = getModelsForTenant(tenant);
    const userExists = await models.User.findOne({ email: emailValidation.email });

    // Check if user is already verified
    if (userExists?.isVerified) {
      return res.status(409).json({
        success: false,
        message: "User already exists and is verified. Please login",
        email: userExists.email
      });
    }

    // Check if user exists but not verified
    if (userExists && !userExists.isVerified) {
      // Check if OTP was recently sent (cooldown period)
      if (userExists.otpExpires && userExists.otpExpires > Date.now() - 60000) {
        return res.status(429).json({
          success: false,
          message: "OTP was recently sent. Please wait 1 minute before requesting a new one",
          retryAfter: Math.ceil((userExists.otpExpires - Date.now() + 60000) / 1000)
        });
      }
    }

    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    const hashedPassword = await hashPassword(password);

    if (userExists) {
      // Update existing unverified user
      userExists.name = name;
      userExists.password = hashedPassword;
      userExists.otp = otp;
      userExists.otpExpires = otpExpires;
      if (emailValidation.programName) {
        userExists.profile.core.degreeProgram = emailValidation.programName;
        userExists.profile.core.rollNumber = emailValidation.rollNumber;
        userExists.profile.core.session = emailValidation.sessionType;
        // A tenant's pattern can legitimately have a `program` group but no
        // `year` group — guarding only on programName here used to compute
        // 2000 + undefined = NaN and persist that into a Number field.
        if (emailValidation.year !== undefined) {
          userExists.profile.core.admissionYear = 2000 + emailValidation.year; // Convert 23 to 2023
        }
      }
      await userExists.save();
    } else {
      // Create new user
      await models.User.create({
        name,
        email: emailValidation.email,
        password: hashedPassword,
        otp,
        otpExpires,
        profile: {
          core: emailValidation.programName
            ? {
                degreeProgram: emailValidation.programName,
                rollNumber: emailValidation.rollNumber,
                session: emailValidation.sessionType,
                // See the matching guard above — a pattern can have
                // `program` without `year`, and 2000 + undefined is NaN.
                ...(emailValidation.year !== undefined
                  ? { admissionYear: 2000 + emailValidation.year } // Convert 23 to 2023
                  : {}),
              }
            : {},
        },
      });
    }

    // Send OTP via Gmail
    const emailSent = await sendOtpEmail(emailValidation.email, name, otp, 'Your OTP Verification Code', tenant);

    if (!emailSent) {
      // Cleanup if email failed and user was newly created
      if (!userExists) {
        await models.User.deleteOne({ email: emailValidation.email });
      }
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP. Please try again later.",
      });
    }

    res.status(200).json({
      success: true,
      message: "OTP sent! Check your inbox AND spam folder.",
      email: emailValidation.email,
      program: emailValidation.programName,
      session: emailValidation.sessionType ? emailValidation.sessionType.toUpperCase() : undefined,
      year: emailValidation.year ? `20${emailValidation.year}` : undefined,
      rollNumber: emailValidation.rollNumber
    });
  } catch (error) {
    console.error("Registration error:", error);

    let errorMessage = "Registration failed. Please try again.";
    let statusCode = 500;

    if (error.code === 11000) {
      errorMessage = "Email already exists";
      statusCode = 409;
    } else if (error.message.includes("password")) {
      errorMessage = error.message;
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      message: errorMessage,
    });
  }
};

export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      success: false,
      message: "Email and OTP are required"
    });
  }

  const tenant = await resolveTenantForEmail(email);
  if (!tenant) {
    return res.status(400).json({
      success: false,
      message: "This email domain is not registered with any university on this platform",
    });
  }

  // Validate MAJU email format
  const emailValidation = validateStudentEmailForTenant(tenant, email);
  if (!emailValidation.isValid) {
    return res.status(400).json({
      success: false,
      message: emailValidation.error
    });
  }

  const cleanOtp = otp.toString().replace(/\s/g, "");

  if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return res.status(400).json({
      success: false,
      message: "OTP must be a 6-digit number"
    });
  }

  try {
    const models = getModelsForTenant(tenant);
    const user = await models.User.findOne({ email: emailValidation.email }).select("+otp +otpExpires +otpAttempts");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please register first."
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Account already verified. Please login.",
        email: user.email
      });
    }

    if (!user.otp || user.otp !== cleanOtp) {
      // Increment failed attempts
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();

      if (user.otpAttempts >= 5) {
        return res.status(429).json({
          success: false,
          message: "Too many failed OTP attempts. Please request a new OTP.",
          requiresNewOtp: true
        });
      }

      return res.status(400).json({
        success: false,
        message: "Invalid OTP code",
        attemptsRemaining: 5 - user.otpAttempts
      });
    }

    if (user.otpExpires < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
        requiresNewOtp: true
      });
    }

    // Clear OTP attempts on successful verification
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    user.otpAttempts = 0;
    await user.save();

    // Rev5 §19.5 — carry the guest's pre-signup chat history into their new
    // account, if this same browser session talked to the guest chatbot
    // before registering. Best-effort: the account is already verified at
    // this point, so a failed migration must not fail the verification —
    // and the destructive session take happens only after Chat.create can
    // no longer lose the transcript.
    if (req.body.guestSessionId) {
      try {
        const guestMessages = peekGuestSessionMessages(req.body.guestSessionId);
        if (guestMessages.length > 0) {
          await models.Chat.create({
            userId: user._id,
            userName: user.name,
            name: "Before you signed up",
            messages: guestMessages,
          });
        }
        deleteGuestSession(req.body.guestSessionId);
      } catch (migrationError) {
        console.error("Guest chat history migration failed:", migrationError.message);
      }
    }

    const token = generateToken(user._id, tenant.slug);

    res.json({
      success: true,
      token,
      message: "Account verified successfully!",
      tenantBranding: buildTenantBranding(tenant),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        program: user.profile.core.degreeProgram,
        rollNumber: user.profile.core.rollNumber,
        session: user.profile.core.session,
        admissionYear: user.profile.core.admissionYear,
        isVerified: user.isVerified,
      }
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during OTP verification"
    });
  }
};

export const resentOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required"
    });
  }

  const tenant = await resolveTenantForEmail(email);
  if (!tenant) {
    return res.status(400).json({
      success: false,
      message: "This email domain is not registered with any university on this platform",
    });
  }

  // Validate MAJU email format
  const emailValidation = validateStudentEmailForTenant(tenant, email);
  if (!emailValidation.isValid) {
    return res.status(400).json({
      success: false,
      message: emailValidation.error
    });
  }

  try {
    const models = getModelsForTenant(tenant);
    const user = await models.User.findOne({ email: emailValidation.email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please register first."
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Account already verified. Please login."
      });
    }

    // Check cooldown period (1 minute)
    if (user.otpExpires && user.otpExpires > Date.now() - 60000) {
      const waitTime = Math.ceil((user.otpExpires - Date.now() + 60000) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitTime} seconds before requesting a new OTP`,
        retryAfter: waitTime
      });
    }

    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    user.otp = otp;
    user.otpExpires = otpExpires;
    user.otpAttempts = 0; // Reset attempts
    await user.save();

    // Resend via Gmail
    const emailSent = await sendOtpEmail(emailValidation.email, user.name, otp, 'Your New OTP Verification Code', tenant);

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to resend OTP. Please try again."
      });
    }

    res.status(200).json({
      success: true,
      message: "New OTP sent! Check inbox AND spam folder.",
      email: emailValidation.email
    });
  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while resending OTP"
    });
  }
};

export const forgetPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required"
    });
  }

  const tenant = await resolveTenantForEmail(email);
  if (!tenant) {
    // Same generic "always success" response as the user-not-found case
    // below — a domain not on the platform shouldn't be distinguishable
    // from a domain that is, but the specific email doesn't exist.
    return res.json({
      success: true,
      message: "If an account exists with this email, a reset OTP has been sent."
    });
  }

  // Validate MAJU email format
  const emailValidation = validateStudentEmailForTenant(tenant, email);
  if (!emailValidation.isValid) {
    return res.status(400).json({
      success: false,
      message: emailValidation.error
    });
  }

  try {
    const models = getModelsForTenant(tenant);
    const user = await models.User.findOne({ email: emailValidation.email });

    // Always return success for security (don't reveal if user exists)
    if (!user) {
      return res.json({
        success: true,
        message: "If an account exists with this email, a reset OTP has been sent."
      });
    }

    // Check if password reset was recently requested
    if (user.resetPasswordExpires && user.resetPasswordExpires > Date.now() - 60000) {
      return res.status(429).json({
        success: false,
        message: "Reset OTP was recently sent. Please wait 1 minute before requesting a new one."
      });
    }

    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    user.resetPasswordOtp = otp;
    user.resetPasswordExpires = otpExpires;
    await user.save();

    // Send password reset via Gmail
    const emailSent = await sendOtpEmail(
      emailValidation.email,
      user.name,
      otp,
      'Password Reset OTP',
      tenant
    );

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to send reset email. Please try again."
      });
    }

    res.json({
      success: true,
      message: "Reset OTP sent! Check inbox AND spam folder."
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error processing password reset"
    });
  }
};

export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "All fields (email, OTP, new password) are required"
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long"
    });
  }

  const tenant = await resolveTenantForEmail(email);
  if (!tenant) {
    return res.status(400).json({
      success: false,
      message: "This email domain is not registered with any university on this platform",
    });
  }

  // Validate MAJU email format
  const emailValidation = validateStudentEmailForTenant(tenant, email);
  if (!emailValidation.isValid) {
    return res.status(400).json({
      success: false,
      message: emailValidation.error
    });
  }

  const cleanOtp = otp.toString().replace(/\s/g, "");

  try {
    const models = getModelsForTenant(tenant);
    const user = await models.User.findOne({ email: emailValidation.email }).select(
      "+resetPasswordOtp +resetPasswordExpires +resetPasswordAttempts"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.resetPasswordOtp !== cleanOtp) {
      // Increment failed attempts
      user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
      await user.save();

      if (user.resetPasswordAttempts >= 5) {
        return res.status(429).json({
          success: false,
          message: "Too many failed attempts. Please request a new reset OTP."
        });
      }

      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
        attemptsRemaining: 5 - user.resetPasswordAttempts
      });
    }

    if (user.resetPasswordExpires < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one."
      });
    }

    const hashedPassword = await hashPassword(newPassword);

    user.password = hashedPassword;
    user.resetPasswordOtp = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordAttempts = 0;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully. You can now login with your new password."
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Server error resetting password"
    });
  }
};

// How many recent failed logins (per email, across LoginEvent) count as a
// lockout. Replaces the old user.loginAttempts/accountLockedUntil fields,
// which were never declared on the User schema and so never actually
// persisted (Rev 6 finding #1) — this reads from LoginEvent instead, which
// already records every attempt, so no schema change is needed.
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_THRESHOLD = 5;

export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required"
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const genericEmailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
  if (!genericEmailRegex.test(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email format"
    });
  }

  const tenant = await resolveTenantForEmail(normalizedEmail);
  if (!tenant) {
    recordUnresolvedLogin(req, normalizedEmail);
    return res.status(401).json({
      success: false,
      message: "Invalid email or password"
    });
  }
  // Found live via T2/T3 testing: `protect` already blocks a suspended
  // tenant's requests, but login itself issued a token anyway — the admin
  // saw "Login successful" and then failed on their very next call. Reject
  // it here instead, with a message that actually explains what happened.
  if (tenant.status !== "active") {
    return res.status(403).json({
      success: false,
      message: "This university's account is currently suspended. Contact the platform administrator.",
    });
  }

  try {
    const models = getModelsForTenant(tenant);

    // A successful login resets the streak — only failures since the last
    // success count, otherwise 4 old typos + 1 new one would lock a user
    // who logged in fine in between.
    const windowStart = new Date(Date.now() - LOGIN_LOCKOUT_WINDOW_MS);
    const lastSuccess = await models.LoginEvent.findOne({
      email: normalizedEmail,
      success: true,
    }).sort({ createdAt: -1 }).select("createdAt");
    const failuresSince = lastSuccess && lastSuccess.createdAt > windowStart
      ? lastSuccess.createdAt
      : windowStart;
    const recentFailures = await models.LoginEvent.countDocuments({
      email: normalizedEmail,
      success: false,
      createdAt: { $gte: failuresSince },
    });
    if (recentFailures >= LOGIN_LOCKOUT_THRESHOLD) {
      return res.status(429).json({
        success: false,
        message: "Account temporarily locked due to too many failed attempts. Try again in 15 minutes."
      });
    }

    const user = await models.User.findOne({ email: normalizedEmail }).select("+password");

    if (!user) {
      recordLogin(models, req, normalizedEmail, null, false, "user_not_found");
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      recordLogin(models, req, normalizedEmail, user._id, false, "bad_password");
      const failuresIncludingThis = recentFailures + 1;

      if (failuresIncludingThis >= LOGIN_LOCKOUT_THRESHOLD) {
        return res.status(429).json({
          success: false,
          message: "Account temporarily locked due to too many failed attempts. Try again in 15 minutes."
        });
      }

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
        attemptsRemaining: LOGIN_LOCKOUT_THRESHOLD - failuresIncludingThis
      });
    }

    // Successful password check + stamp last login
    user.lastLoginAt = new Date();
    await user.save();
    recordLogin(models, req, normalizedEmail, user._id, true);

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Account not verified. Please verify your email first.",
        needsVerification: true,
        email: user.email
      });
    }

    const token = generateToken(user._id, tenant.slug);

    return res.json({
      success: true,
      token: token,
      message: "Login successful",
      tenantBranding: buildTenantBranding(tenant),
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during login"
    });
  }
};

const serializeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  // Kept for backward compatibility with any client code still reading these
  // top-level fields directly — the full `profile` object below is now the
  // source of truth (Rev 5 §5.1's four sections).
  program: user.profile?.core?.degreeProgram,
  rollNumber: user.profile?.core?.rollNumber,
  session: user.profile?.core?.session,
  admissionYear: user.profile?.core?.admissionYear,
  profile: user.profile,
  isVerified: user.isVerified,
  role: user.role,
  department: user.department,
  staffTitle: user.staffTitle,
  isBlocked: user.isBlocked,
  profilePicture: user.profilePicture || "",
});

export const getUser = async (req, res) => {
  try {
    const user = await req.models.User.findById(req.user._id).populate("department", "code name");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, user: serializeUser(user), tenantBranding: buildTenantBranding(req.tenant) });
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching user data",
    });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/user/profile
//   Multipart form: optional `avatar` file, optional `name` field.
//   Used by everyone (student / staff / admin) to manage their own profile.
//   Email + role are NOT editable here — admins handle role changes via the
//   admin panel; email changes need re-verification and aren't supported yet.
// ---------------------------------------------------------------------------

export const updateProfile = async (req, res) => {
  try {
    const user = await req.models.User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const { name } = req.body || {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (trimmed.length < 2) {
        return res.status(400).json({ success: false, message: "Name must be at least 2 characters" });
      }
      user.name = trimmed;
    }

    if (req.file) {
      // Delete the old avatar file if it was stored locally. Resolve against
      // process.cwd() so this works regardless of how the server was started.
      if (user.profilePicture && user.profilePicture.startsWith("/uploads/avatars/")) {
        const oldPath = path.join(process.cwd(), user.profilePicture.replace(/^\//, ""));
        fs.unlink(oldPath, () => {}); // best-effort; ignore ENOENT
      }
      user.profilePicture = `/uploads/avatars/${req.file.filename}`;
    }

    await user.save();
    const populated = await req.models.User.findById(user._id).populate("department", "code name");
    return res.json({ success: true, user: serializeUser(populated) });
  } catch (error) {
    console.error("updateProfile error:", error);
    return res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/user/profile/details
//   JSON body: { core?, career?, studyAbroad?, events?, notifications? } —
//   any subset of Rev 5 §5.1's four profile sections (plus Notifications).
//   Separate from PATCH /api/user/profile above (which is multipart, for
//   name/avatar only) since mixing a deeply nested JSON object into a
//   multipart form is awkward — this is the manual-entry path (Rev 5 §5.2
//   "Path B"), the CV-upload path (§5.2 "Path A") writes through the same
//   fields once the student confirms the extracted data.
// ---------------------------------------------------------------------------

const CORE_NUMERIC_FIELDS = ["cgpa", "currentSemester"];
const STUDY_ABROAD_NUMERIC_FIELDS = ["ieltsScore", "toeflScore"];

export const updateProfileDetails = async (req, res) => {
  const { core, career, studyAbroad, events, notifications } = req.body || {};
  try {
    const user = await req.models.User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (core && typeof core === "object") {
      if (core.degreeProgram !== undefined) user.profile.core.degreeProgram = String(core.degreeProgram).trim();
      for (const field of CORE_NUMERIC_FIELDS) {
        if (core[field] !== undefined) {
          user.profile.core[field] = core[field] === null || core[field] === "" ? null : Number(core[field]);
        }
      }
      if (core.expectedGraduationDate !== undefined) {
        user.profile.core.expectedGraduationDate = core.expectedGraduationDate
          ? new Date(core.expectedGraduationDate)
          : null;
      }
    }

    if (career && typeof career === "object") {
      if (career.skills !== undefined) {
        user.profile.career.skills = Array.isArray(career.skills) ? career.skills.map(String) : [];
      }
      if (career.workModePreference !== undefined) user.profile.career.workModePreference = career.workModePreference;
      if (career.preferredCity !== undefined) user.profile.career.preferredCity = String(career.preferredCity).trim();
      if (career.experienceLevel !== undefined) user.profile.career.experienceLevel = career.experienceLevel;
    }

    if (studyAbroad && typeof studyAbroad === "object") {
      for (const field of STUDY_ABROAD_NUMERIC_FIELDS) {
        if (studyAbroad[field] !== undefined) {
          user.profile.studyAbroad[field] =
            studyAbroad[field] === null || studyAbroad[field] === "" ? null : Number(studyAbroad[field]);
        }
      }
      if (studyAbroad.targetCountries !== undefined) {
        user.profile.studyAbroad.targetCountries = Array.isArray(studyAbroad.targetCountries)
          ? studyAbroad.targetCountries.map(String)
          : [];
      }
      if (studyAbroad.fundingPreference !== undefined) {
        user.profile.studyAbroad.fundingPreference = studyAbroad.fundingPreference;
      }
      if (studyAbroad.intendedFieldOfStudy !== undefined) {
        user.profile.studyAbroad.intendedFieldOfStudy = String(studyAbroad.intendedFieldOfStudy).trim();
      }
    }

    if (events && typeof events === "object") {
      if (events.interests !== undefined) {
        user.profile.events.interests = Array.isArray(events.interests) ? events.interests.map(String) : [];
      }
      if (events.societyMemberships !== undefined) {
        user.profile.events.societyMemberships = Array.isArray(events.societyMemberships)
          ? events.societyMemberships.map(String)
          : [];
      }
    }

    if (notifications && typeof notifications === "object") {
      if (notifications.digestFrequency !== undefined) {
        user.profile.notifications.digestFrequency = notifications.digestFrequency;
      }
      if (notifications.modules !== undefined) {
        user.profile.notifications.modules = Array.isArray(notifications.modules)
          ? notifications.modules.map(String)
          : [];
      }
      if (notifications.deadlineReminderLeadDays !== undefined) {
        user.profile.notifications.deadlineReminderLeadDays = Number(notifications.deadlineReminderLeadDays);
      }
      if (notifications.unsubscribeAll !== undefined) {
        user.profile.notifications.unsubscribeAll = !!notifications.unsubscribeAll;
      }
    }

    await user.save();
    const populated = await req.models.User.findById(user._id).populate("department", "code name");
    return res.json({ success: true, user: serializeUser(populated) });
  } catch (error) {
    console.error("updateProfileDetails error:", error);
    return res.status(500).json({ success: false, message: "Failed to update profile details" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/user/cv/parse
//   Multipart: `cv` file (PDF/DOCX, memory storage — see middlewares/upload.js).
//   Forwards the file to Python for text extraction + PII stripping + LLM
//   structured extraction (Rev 5 §5.2/§5.3). Returns a PREVIEW only — nothing
//   is saved to the profile here. The client shows an editable pre-filled
//   form; the student confirms via PATCH /api/user/profile/details (never
//   silent-saved, per Rev 5 §5.2). The raw CV bytes are never written to
//   disk on the Node side (memoryStorage) and are not persisted on the
//   Python side either — nothing to clean up after this request returns.
// ---------------------------------------------------------------------------

export const parseCv = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "CV file is required" });
  }
  try {
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const response = await fetch(`${PYTHON_BACKEND_URL}/cv/parse`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
      timeout: 60000,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return res.status(502).json({
        success: false,
        message: `CV parsing failed (${response.status}): ${detail.slice(0, 200)}`,
      });
    }

    const parsed = await response.json();
    return res.json({ success: true, cv: parsed });
  } catch (error) {
    console.error("parseCv error:", error);
    return res.status(500).json({ success: false, message: "Failed to parse CV" });
  }
};

// ---------------------------------------------------------------------------
// POST /api/user/change-password
//   Body: { currentPassword, newPassword }
//   Verifies current password against the hash, then sets a new bcrypt hash.
//   Min 6 chars (matches User.password model rule).
// ---------------------------------------------------------------------------

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Current password and new password are both required",
    });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({
      success: false,
      message: "New password must be at least 6 characters",
    });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({
      success: false,
      message: "New password must be different from the current one",
    });
  }
  try {
    // `password` is `select: false` on the schema, so we have to ask for it explicitly.
    const user = await req.models.User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    return res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("changePassword error:", error);
    return res.status(500).json({ success: false, message: "Failed to change password" });
  }
};

// Rev 5 §10 — one-click unsubscribe from a digest/reminder email footer.
// Public (no `protect`): the token itself IS the auth, shaped so it can
// never double as a login session (see notify.js's signUnsubscribeToken
// for why — different claim names, checked `purpose` guard).
export const unsubscribeFromDigest = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ success: false, message: "Missing token" });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ success: false, message: "Invalid or expired unsubscribe link" });
  }
  if (decoded.purpose !== "unsubscribe" || !decoded.uid || !decoded.tslug) {
    return res.status(400).json({ success: false, message: "Invalid unsubscribe link" });
  }

  try {
    const tenant = await resolveTenantBySlug(decoded.tslug);
    if (!tenant || tenant.status !== "active") {
      return res.status(400).json({ success: false, message: "Unknown or inactive tenant" });
    }
    const models = getModelsForTenant(tenant);
    const user = await models.User.findById(decoded.uid);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.profile.notifications.unsubscribeAll = true;
    await user.save();
    res.json({ success: true, message: "You've been unsubscribed from digest and reminder emails." });
  } catch (error) {
    console.error("unsubscribeFromDigest error:", error);
    res.status(500).json({ success: false, message: "Failed to unsubscribe" });
  }
};
