import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { getPalette } from "../../administrator/utils/palette";
import { logoutUser } from "../../redux/slices/authSlice";
import TopNavbar from "../../components/layouts/TopNavbar";

const BASE_NAV = [
  { to: "/staff/dashboard", label: "Dashboard" },
  { to: "/staff/issues", label: "Department Inbox" },
];

// User request — a staff member only sees the tabs for admin features an
// Administrator has actually granted them (User.staffPermissions), so the
// nav never advertises a page that would just 403 underneath.
const PERMISSION_NAV = [
  { key: "data", to: "/staff/data", label: "Data" },
  { key: "content", to: "/staff/content", label: "Content" },
  { key: "query", to: "/staff/query", label: "Query" },
  { key: "failedQuestions", to: "/staff/failed-questions", label: "Failed Questions" },
];

// Rev7 user request — Staff/Dept-Officer moves from the shared left Sidebar
// to its own top navbar, same shell pattern as Administrator. Unlike
// AdminShell, staff pages already render their own page title inline (only
// 2 pages exist, not worth centralizing) — no duplicate header here.
const StaffShell = () => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const user = useSelector((s) => s.auth.user);
  const C = getPalette(theme === "dark", tenantBranding);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const NAV = [
    ...BASE_NAV,
    ...PERMISSION_NAV.filter((item) => user?.staffPermissions?.[item.key]).map(({ to, label }) => ({ to, label })),
  ];

  const initials = (user?.name || "S").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate("/login");
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <TopNavbar
        wordmark={tenantBranding?.universityShort || "UniAssist"}
        subLabel={user?.staffTitle || "Staff Console"}
        roleLabel="Staff"
        navItems={NAV}
        avatarInitials={initials}
        userName={user?.name}
        userEmail={user?.email}
        menuItems={[
          { label: "Profile", to: "/staff/profile" },
          { label: "Sign out", danger: true, onClick: handleLogout },
        ]}
        C={C}
      />
      <main className="p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default StaffShell;
