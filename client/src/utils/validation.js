// Format: sp/fa + (20-26) + (bscs|bsai|bsse|bsbc) + (0000-9999) + @maju.edu.pk
const MAJU_EMAIL_REGEX =
  /^(sp|fa)(2[0-6])(bscs|bsai|bsse|bsbc)([0-9]{4})@maju\.edu\.pk$/i;

const GENERIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// MAJU's roll-number convention only applies to @maju.edu.pk addresses —
// any other tenant's students pass with a plain email-shape check here and
// the server's tenant-aware validator is the real authority.
export const validateMajuEmail = (email) => {
  const trimmedEmail = email?.trim().toLowerCase();

  if (!trimmedEmail) {
    return { isValid: false, error: "Email is required" };
  }

  if (!GENERIC_EMAIL_REGEX.test(trimmedEmail)) {
    return { isValid: false, error: "Invalid email format" };
  }

  if (trimmedEmail.endsWith("@maju.edu.pk") && !MAJU_EMAIL_REGEX.test(trimmedEmail)) {
    return {
      isValid: false,
      error: "Use format: sp23bscs0178@maju.edu.pk",
    };
  }

  return {
    isValid: true,
    email: trimmedEmail,
  };
};
