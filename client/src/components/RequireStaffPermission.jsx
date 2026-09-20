import React from "react";
import { useSelector } from "react-redux";
import { getPalette } from "../administrator/utils/palette";

// User request — a staff member reaches these routes once StaffShell's nav
// shows the tab (which itself only shows granted permissions), but a staff
// member could still type the URL directly. This is the client-side half of
// the check server/middlewares/requireStaffPermission.js already enforces —
// the API calls these pages make would 403 anyway, but this avoids a
// staff member seeing a half-broken Administrator page full of failed
// requests instead of a clear "not granted" message.
const RequireStaffPermission = ({ permission, children }) => {
  const user = useSelector((s) => s.auth.user);
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);

  const allowed = user?.role === "admin" || !!user?.staffPermissions?.[permission];
  if (!allowed) {
    return (
      <div className="p-8 text-center text-sm" style={{ color: C.muted }}>
        You don't have access to this feature. Ask your administrator to grant it.
      </div>
    );
  }
  return children;
};

export default RequireStaffPermission;
