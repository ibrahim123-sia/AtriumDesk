import jwt from "jsonwebtoken";
import { getTenantConnection } from "../config/tenantDb.js";
import { getTenantModels } from "../models/registry.js";
import { resolveTenantBySlug } from "../services/tenantRegistry.js";

export const protect = async (req, res, next) => {
  let token = req.headers.authorization;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const tenantSlug = decoded.tenantSlug;

    if (!tenantSlug) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token missing tenant",
      });
    }

    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant || tenant.status !== "active") {
      return res.status(401).json({
        success: false,
        message: "Not authorized, tenant unavailable",
      });
    }

    const connection = getTenantConnection(tenant.dbName);
    const models = getTenantModels(connection);

    const user = await models.User.findById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, user not found",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact the administrator.",
        blocked: true,
      });
    }

    req.user = user;
    req.models = models;
    req.tenant = tenant;
    // Set only on an impersonation-issued JWT (platformController.js's
    // impersonateTenantAdmin) — lets any write-path attribute the action to
    // the real Super Admin behind an impersonated session, not just the
    // impersonated Administrator identity in req.user.
    if (decoded.impersonatedBy) {
      req.impersonatedBy = { id: decoded.impersonatedBy, email: decoded.impersonatedByEmail || null };
    }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Not authorized token failed" });
  }
};
