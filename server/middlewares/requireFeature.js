/**
 * Rev7 user request — Super Admin controls which modules a tenant gets
 * (server/models/platform/Tenant.js's enabledFeatures). Applied at the
 * route level so every list/detail/matched endpoint for a disabled module
 * is blocked in one place, not re-checked inside each controller function.
 * Must run after `protect` (needs req.tenant).
 */
export const requireFeature = (featureName) => (req, res, next) => {
  if (req.tenant?.enabledFeatures?.[featureName] === false) {
    return res.status(403).json({
      success: false,
      message: `This feature is not enabled for ${req.tenant.name || "your university"}.`,
    });
  }
  next();
};
