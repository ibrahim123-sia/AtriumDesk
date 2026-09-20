import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import { getPalette } from "../../administrator/utils/palette";
import { logoutSuperAdmin } from "../../redux/slices/platformAuthSlice";
import { endImpersonation } from "../../redux/slices/authSlice";
import TopNavbar from "../../components/layouts/TopNavbar";

const NAV = [
  { to: "/platform/dashboard", label: "Dashboard" },
  { to: "/platform/tenants", label: "Tenants" },
  { to: "/platform/usage", label: "Usage" },
  { to: "/platform/health", label: "Health" },
  { to: "/platform/audit-log", label: "Audit Log" },
];

// Rev7 §5.9 — its own shell, deliberately not MainLayout/Sidebar (those are
// built around a tenant Administrator's own branding and nav; Super Admin
// operates above all tenants, not inside one). Matches
// uniassist-super-admin.html's top-navbar chrome (Majlis Ocean Teal).
const PlatformShell = () => {
  const theme = useSelector((s) => s.theme.theme);
  const superAdmin = useSelector((s) => s.platformAuth.superAdmin);
  const impersonating = useSelector((s) => s.auth.impersonating);
  const C = getPalette(theme === "dark");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // Landing on ANY /platform/* route while a tenant-impersonation session is
  // still "active" in auth state is always a bug, not a valid state — the
  // ONLY intended way here is ImpersonationBanner's button, which already
  // clears it before navigating. This closes the gap where browser Back (or
  // a typed URL) can strand `impersonating: true` with no banner visible
  // (PlatformShell never renders one) and a stale tenant JWT sitting in
  // localStorage["token"].
  useEffect(() => {
    if (impersonating) dispatch(endImpersonation());
  }, [impersonating, location.pathname, dispatch]);

  const initials = (superAdmin?.name || "SA")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <TopNavbar
        wordmark="AtriumDesk"
        subLabel="Super Admin Console"
        roleLabel="Super Admin"
        navItems={NAV}
        maxVisibleTabs={6}
        avatarInitials={initials}
        userName={superAdmin?.name}
        userEmail={superAdmin?.email}
        menuItems={[
          { label: "Sign out", danger: true, onClick: () => { dispatch(logoutSuperAdmin()); navigate("/platform/login", { replace: true }); } },
        ]}
        C={C}
      />
      <main className="max-w-[1360px] mx-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default PlatformShell;
