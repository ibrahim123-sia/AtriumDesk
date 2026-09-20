import React, { useEffect, Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useDispatch, useSelector } from "react-redux";
import MainLayout from "./components/layouts/MainLayout";
import Login from "./auth/Login";
import Register from "./auth/Register";
import Unsubscribe from "./Unsubscribe";
import ProtectedPlatformRoute from "./platform/ProtectedPlatformRoute";
import ProtectedRoute from "./auth/ProtectedRoute";
import ChatPage from "./student/pages/ChatPage";
import GuestChat from "./guest/GuestChat";
import RequireStaffPermission from "./components/RequireStaffPermission";

// Rev7 user request — "optimizations, industry standard practices."
// Super Admin/Administrator/Staff are role-gated sections most users never
// load at all (a student never hits /admin, /staff, or /platform) and
// Dashboard.jsx/Query.jsx/StaffDashboard.jsx pull in recharts (the single
// heaviest dependency in the app) — route-level code-splitting keeps all of
// that out of the bundle every guest/student downloads by default.
const PlatformLogin = lazy(() => import("./platform/PlatformLogin"));
const PlatformShell = lazy(() => import("./platform/layout/PlatformShell"));
const PlatformDashboard = lazy(() => import("./platform/pages/Dashboard"));
const PlatformTenants = lazy(() => import("./platform/pages/Tenants"));
const PlatformCreateTenant = lazy(() => import("./platform/pages/CreateTenant"));
const PlatformTenantDetail = lazy(() => import("./platform/pages/TenantDetail"));
const PlatformUsage = lazy(() => import("./platform/pages/Usage"));
const PlatformHealth = lazy(() => import("./platform/pages/Health"));
const PlatformAuditLog = lazy(() => import("./platform/pages/AuditLog"));

const Jobs = lazy(() => import("./student/pages/Jobs"));
const JobDetail = lazy(() => import("./student/pages/JobDetail"));
const Events = lazy(() => import("./student/pages/Events"));
const EventDetail = lazy(() => import("./student/pages/EventDetail"));
const Issues = lazy(() => import("./student/pages/Issues"));
const CreateIssue = lazy(() => import("./student/pages/CreateIssue"));
const IssueDetail = lazy(() => import("./student/pages/IssueDetail"));
const Scholarship = lazy(() => import("./student/pages/Scholarship"));
const ScholarshipDetail = lazy(() => import("./student/pages/ScholarshipDetail"));
const Profile = lazy(() => import("./profile/Profile"));

const StaffShell = lazy(() => import("./staff/layout/StaffShell"));
const StaffIssues = lazy(() => import("./staff/pages/StaffIssues"));
const StaffIssueDetail = lazy(() => import("./staff/pages/StaffIssueDetail"));
const StaffDashboard = lazy(() => import("./staff/pages/StaffDashboard"));

const AdminShell = lazy(() => import("./administrator/layout/AdminShell"));
const AdminDashboard = lazy(() => import("./administrator/pages/Dashboard"));
const AdminUsers = lazy(() => import("./administrator/pages/Users"));
const AdminStaff = lazy(() => import("./administrator/pages/Staff"));
const AdminDepartments = lazy(() => import("./administrator/pages/Departments"));
const AdminQuery = lazy(() => import("./administrator/pages/Query"));
const AdminData = lazy(() => import("./administrator/pages/Data"));
const AdminLogs = lazy(() => import("./administrator/pages/Logs"));
const AdminHealth = lazy(() => import("./administrator/pages/Health"));
const AdminSettings = lazy(() => import("./administrator/pages/Settings"));
const AdminFailedQuestions = lazy(() => import("./administrator/pages/FailedQuestions"));
const AdminContent = lazy(() => import("./administrator/pages/Content"));

const RouteFallback = () => (
  <div className="h-screen flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#0D9488", borderTopColor: "transparent" }} />
  </div>
);

import { fetchUser, setLoadingUser } from "./redux/slices/authSlice";
import { fetchUsersChats } from "./redux/slices/chatSlice";
import { fetchGuestChatHistory } from "./redux/slices/guestSlice";
import { fetchDepartments } from "./redux/slices/departmentSlice";

const App = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const token = useSelector((s) => s.auth.token);
  const user = useSelector((s) => s.auth.user);
  const guestSessionId = useSelector((s) => s.guest.guestSessionId);
  const tenantBranding = useSelector((s) => s.tenant.branding);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Self-service branding (Rev 5 §11 / T1) — the page title reflects
  // whichever university's tenant the logged-in user belongs to. Falls
  // back to the default when logged out or branding hasn't loaded yet.
  useEffect(() => {
    const name = tenantBranding?.universityShort || tenantBranding?.universityName;
    document.title = name ? `${name} — AtriumDesk` : "AtriumDesk";
  }, [tenantBranding]);

  // Rev7 SaaS follow-up — PWA manifest was one static file shared by every
  // tenant, always showing MAJU's name/icon regardless of who's actually
  // logged in. Swap the <link rel="manifest"> to a per-tenant one (and the
  // theme-color meta tags to match) once a tenant is known; a guest/logged-
  // out visitor keeps the static default manifest.json.
  useEffect(() => {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) return;
    if (tenantBranding?.slug) {
      manifestLink.setAttribute("href", `${import.meta.env.VITE_SERVER_URL || "http://localhost:3000"}/api/manifest/${tenantBranding.slug}`);
      const color = tenantBranding.primaryColor;
      if (color) {
        document.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.setAttribute("content", color));
      }
    } else {
      manifestLink.setAttribute("href", "/manifest.json");
    }
  }, [tenantBranding]);

  useEffect(() => {
    if (token) {
      dispatch(fetchUser());
    } else {
      dispatch(setLoadingUser(false));
    }
  }, [token, dispatch]);

  useEffect(() => {
    if (user && token) {
      if (user.role === "student" || !user.role) {
        dispatch(fetchUsersChats());
      }
      dispatch(fetchDepartments());
    }
  }, [user, token, dispatch]);

  useEffect(() => {
    if (guestSessionId && !user) {
      dispatch(fetchGuestChatHistory());
    }
  }, [guestSessionId, user, dispatch]);

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: "#152E2A",
            color: "#E8F5F2",
            border: "1px solid #1E3A35",
          },
          success: {
            duration: 3000,
            style: {
              background: "#0D9488",
              color: "#fff",
            },
            iconTheme: { primary: "#4ADE80", secondary: "#fff" },
          },
          error: {
            duration: 4000,
            style: {
              background: "#A6362B",
              color: "#fff",
            },
            iconTheme: { primary: "#fff", secondary: "#A6362B" },
          },
        }}
      />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<GuestChat />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/platform/login" element={<PlatformLogin />} />

        {/* Super Admin — deliberately its own tree, never nested inside the
            tenant-scoped MainLayout/ProtectedRoute (Rev7 §5.9). */}
        <Route path="/platform" element={
          <ProtectedPlatformRoute>
            <PlatformShell />
          </ProtectedPlatformRoute>
        }>
          <Route index element={<Navigate to="/platform/dashboard" replace />} />
          <Route path="dashboard" element={<PlatformDashboard />} />
          <Route path="tenants" element={<PlatformTenants />} />
          <Route path="tenants/new" element={<PlatformCreateTenant />} />
          <Route path="tenants/:slug" element={<PlatformTenantDetail />} />
          <Route path="usage" element={<PlatformUsage />} />
          <Route path="health" element={<PlatformHealth />} />
          <Route path="audit-log" element={<PlatformAuditLog />} />
        </Route>

        {/* Protected routes - Use MainLayout as parent */}
        <Route path="/" element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route path="chat" element={
            <ProtectedRoute roles={["student", "admin"]}>
              <ChatPage />
            </ProtectedRoute>
          } />
          <Route path="jobs" element={
            <ProtectedRoute roles={["student"]}>
              <Jobs />
            </ProtectedRoute>
          } />
          <Route path="jobs/:id" element={
            <ProtectedRoute roles={["student"]}>
              <JobDetail />
            </ProtectedRoute>
          } />
          <Route path="events" element={
            <ProtectedRoute roles={["student"]}>
              <Events />
            </ProtectedRoute>
          } />
          <Route path="events/:id" element={
            <ProtectedRoute roles={["student"]}>
              <EventDetail />
            </ProtectedRoute>
          } />
          <Route path="scholarships" element={
            <ProtectedRoute roles={["student"]}>
              <Scholarship />
            </ProtectedRoute>
          } />
          <Route path="scholarships/:id" element={
            <ProtectedRoute roles={["student"]}>
              <ScholarshipDetail />
            </ProtectedRoute>
          } />
          <Route path="issues" element={
            <ProtectedRoute roles={["student"]}>
              <Issues />
            </ProtectedRoute>
          } />
          <Route path="issues/new" element={
            <ProtectedRoute roles={["student"]}>
              <CreateIssue />
            </ProtectedRoute>
          } />
          <Route path="issues/:id" element={
            <ProtectedRoute roles={["student"]}>
              <IssueDetail />
            </ProtectedRoute>
          } />
          {/* Universal — every authenticated role manages their own profile */}
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Staff/Dept-Officer — own top-navbar shell, not MainLayout/Sidebar. */}
        <Route path="staff" element={
          <ProtectedRoute roles={["staff"]}>
            <StaffShell />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/staff/dashboard" replace />} />
          <Route path="dashboard" element={<StaffDashboard />} />
          <Route path="issues" element={<StaffIssues />} />
          <Route path="issues/:id" element={<StaffIssueDetail />} />
          <Route path="profile" element={<Profile />} />
          {/* User request — delegated admin capabilities (User.staffPermissions).
              Reuses the exact same page components AdminShell mounts under
              /admin/*; RequireStaffPermission is the client-side half of the
              server's requireStaffPermission middleware. */}
          <Route path="data" element={<RequireStaffPermission permission="data"><AdminData /></RequireStaffPermission>} />
          <Route path="content" element={<RequireStaffPermission permission="content"><AdminContent /></RequireStaffPermission>} />
          <Route path="query" element={<RequireStaffPermission permission="query"><AdminQuery /></RequireStaffPermission>} />
          <Route path="query/:id" element={<RequireStaffPermission permission="query"><AdminQuery /></RequireStaffPermission>} />
          <Route path="failed-questions" element={<RequireStaffPermission permission="failedQuestions"><AdminFailedQuestions /></RequireStaffPermission>} />
        </Route>

        {/* Administrator — own top-navbar shell, not MainLayout/Sidebar. */}
        <Route path="admin" element={
          <ProtectedRoute roles={["admin"]}>
            <AdminShell />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminUsers />} />
          <Route path="staff" element={<AdminStaff />} />
          <Route path="departments" element={<AdminDepartments />} />
          <Route path="query" element={<AdminQuery />} />
          <Route path="query/:id" element={<AdminQuery />} />
          <Route path="data" element={<AdminData />} />
          <Route path="failed-questions" element={<AdminFailedQuestions />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="health" element={<AdminHealth />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
};

export default App;
