import jwt from "jsonwebtoken";
import { getSuperAdminUserModel } from "../models/platform/SuperAdminUser.js";

// Separate secret from tenant JWTs (falls back to JWT_SECRET only if unset,
// for local dev convenience) — a leaked tenant secret should not be enough
// to forge a Super Admin session.
const PLATFORM_JWT_SECRET = process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET;

// Checks a SuperAdminUser session against PlatformDB only. Never touches a
// tenant connection, never checks the tenant-scoped `requireRole("admin")` —
// Super Admin is a genuinely separate identity, not a stronger Administrator.
export const protectPlatform = async (req, res, next) => {
  let token = req.headers.authorization;

  try {
    const decoded = jwt.verify(token, PLATFORM_JWT_SECRET);
    if (!decoded.superAdmin) {
      return res.status(401).json({ success: false, message: "Not authorized" });
    }

    const SuperAdminUser = getSuperAdminUserModel();
    const admin = await SuperAdminUser.findById(decoded.id);

    if (!admin || !admin.isActive) {
      return res.status(401).json({ success: false, message: "Not authorized" });
    }

    req.superAdmin = admin;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Not authorized token failed" });
  }
};

export const generatePlatformToken = (id) => {
  return jwt.sign({ id: id.toString(), superAdmin: true }, PLATFORM_JWT_SECRET, {
    expiresIn: "12h",
  });
};
