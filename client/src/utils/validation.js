const GENERIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Shape check only. Which addresses a university accepts — its domains and
// its student-email format (Tenant.studentEmailPattern, set by its
// Administrator) — is enforced by the server, so a new intake year or
// programme never needs a client release.
export const validateEmail = (email) => {
  const trimmedEmail = email?.trim().toLowerCase();

  if (!trimmedEmail) {
    return { isValid: false, error: "Email is required" };
  }

  if (!GENERIC_EMAIL_REGEX.test(trimmedEmail)) {
    return { isValid: false, error: "Invalid email format" };
  }

  return {
    isValid: true,
    email: trimmedEmail,
  };
};
