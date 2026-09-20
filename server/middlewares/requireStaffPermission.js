// User request — lets an Administrator delegate one specific admin
// capability (Data/Content/Query/Failed Questions) to a staff member,
// instead of the previous all-or-nothing admin-only gate. Admin always
// passes; staff only passes for the exact permission checked here — a
// staff member granted "query" still can't touch "/admin/staff", etc.
// Mounted on top of requireRole("admin", "staff") in adminRoutes.js, which
// already rejects students/guests before this ever runs.
export const requireStaffPermission = (key) => (req, res, next) => {
  if (req.user.role === "admin") return next();
  if (req.user.role === "staff" && req.user.staffPermissions?.[key]) return next();
  return res.status(403).json({
    success: false,
    message: "You don't have access to this feature. Ask your administrator to grant it.",
  });
};
