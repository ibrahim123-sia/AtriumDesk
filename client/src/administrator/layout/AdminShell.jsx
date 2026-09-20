import React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { getPalette } from "../utils/palette";
import { logoutUser } from "../../redux/slices/authSlice";
import TopNavbar from "../../components/layouts/TopNavbar";
import ImpersonationBanner from "../../components/ImpersonationBanner";

const TITLES = {
  "/admin/dashboard": { title: "Dashboard", subtitle: "Overview of the entire portal" },
  "/admin/users": { title: "Students", subtitle: "Manage student accounts" },
  "/admin/staff": { title: "Staff", subtitle: "Create and manage department staff" },
  "/admin/departments": { title: "Departments", subtitle: "Manage university departments" },
  "/admin/query": { title: "Query", subtitle: "Cross-department issue analytics" },
  "/admin/data": { title: "Data", subtitle: "Manage chatbot knowledge base" },
  "/admin/failed-questions": { title: "Failed Questions", subtitle: "Chatbot answers that need better knowledge-base coverage" },
  "/admin/content": { title: "Content", subtitle: "Scholarships, jobs, events, and their sources" },
  "/admin/logs": { title: "Logs & Activity", subtitle: "Audit, login, and chat activity" },
  "/admin/health": { title: "System Health", subtitle: "Pre-demo check — Mongo, ChromaDB, and the LLM provider" },
  "/admin/settings": { title: "Settings", subtitle: "Self-service branding for your university" },
};

const NAV = [
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/users", label: "Students" },
  { to: "/admin/staff", label: "Staff" },
  { to: "/admin/departments", label: "Departments" },
  { to: "/admin/query", label: "Query" },
  { to: "/admin/content", label: "Content" },
  { to: "/admin/data", label: "Data" },
  { to: "/admin/failed-questions", label: "Failed Questions" },
  { to: "/admin/logs", label: "Logs" },
  { to: "/admin/health", label: "Health" },
  { to: "/admin/settings", label: "Settings" },
];

// Rev7 user request — Administrator moves from the shared left Sidebar to
// its own top navbar (matching uniassist-super-admin.html's chrome
// pattern), distinguishing it from the Student sidebar shell.
const AdminShell = () => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const user = useSelector((s) => s.auth.user);
  const C = getPalette(theme === "dark", tenantBranding);
  const location = useLocation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const matchKey = Object.keys(TITLES).find((k) => location.pathname.startsWith(k));
  const meta = (matchKey && TITLES[matchKey]) || { title: "Admin", subtitle: "" };
  const initials = (user?.name || "A").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate("/login");
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <ImpersonationBanner />
      <TopNavbar
        wordmark={tenantBranding?.universityShort || "AtriumDesk"}
        subLabel="Administrator"
        roleLabel="Administrator"
        navItems={NAV}
        maxVisibleTabs={6}
        avatarInitials={initials}
        userName={user?.name}
        userEmail={user?.email}
        menuItems={[
          { label: "Profile", to: "/admin/profile" },
          { label: "Sign out", danger: true, onClick: handleLogout },
        ]}
        C={C}
      />
      <header className="px-4 md:px-6 py-5 border-b" style={{ borderColor: C.border, backgroundColor: C.surface }}>
        <h1 className="text-xl font-bold" style={{ color: C.text }}>{meta.title}</h1>
        {meta.subtitle && <p className="text-sm" style={{ color: C.muted }}>{meta.subtitle}</p>}
      </header>
      <main className="p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminShell;
