// Where the student is with an application — self-reported (Rev 5 §6.1:
// "a personal notebook, not an integration"). Same states for both types,
// worded for each.
export const statusLabels = (listingType) => ({
  saved: "Saved",
  preparing: "Preparing",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: listingType === "scholarship" ? "Awarded" : "Offer",
  rejected: listingType === "scholarship" ? "Not selected" : "Rejected",
  withdrawn: "Withdrawn",
});

const APPLY_PENDING_KEY = "applyPending";

// Called when the student follows the official link: when they come back to
// this tab, ask whether they applied.
export const markApplyPending = (listingId) => {
  try {
    sessionStorage.setItem(APPLY_PENDING_KEY, listingId);
  } catch { /* storage unavailable */ }
};

export const takeApplyPending = (listingId) => {
  try {
    if (sessionStorage.getItem(APPLY_PENDING_KEY) !== listingId) return false;
    sessionStorage.removeItem(APPLY_PENDING_KEY);
    return true;
  } catch {
    return false;
  }
};
