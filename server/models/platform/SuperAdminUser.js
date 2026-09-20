import mongoose from "mongoose";
import { getPlatformConnection } from "../../config/tenantDb.js";

// Deliberately separate from the tenant-scoped User model (server/models/User.js)
// and not a 4th value in its role enum — a Super Admin account must keep
// existing and working even if a tenant's database is suspended or deleted,
// so it cannot live inside any tenant's own database.
const superAdminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "name is required"], trim: true },
    email: {
      type: String,
      required: [true, "email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const getSuperAdminUserModel = () => {
  const connection = getPlatformConnection();
  return connection.models.SuperAdminUser || connection.model("SuperAdminUser", superAdminUserSchema);
};
