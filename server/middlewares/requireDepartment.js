// The same `if (!req.user.department) return 400 "Staff has no department
// assigned"` guard was copy-pasted across 5 controller functions in
// issueController.js (Rev5 §13.2). Extracted here as one shared middleware,
// mounted after requireRole("staff") on any department-scoped route.
export const requireDepartment = (req, res, next) => {
  if (!req.user.department) {
    return res.status(400).json({ success: false, message: "Staff has no department assigned" });
  }
  next();
};
