import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import GuestChat from "../guest/GuestChat";
import UniversityPicker from "../guest/UniversityPicker";
import { guestTenantSlug } from "../utils/guestTenant";
import { homeFor } from "./roleHome";

// "/" is the guest landing page — but it's also where the installed app
// opens, so a signed-in student, staff member or admin goes to their own
// home instead of the guest chat. A visitor who came without a university's
// link (/?u=<slug>) chooses the university first.
const HomeRoute = () => {
  // Re-render on every navigation: choosing a university changes only ?u=.
  useLocation();
  const { user, token, loadingUser } = useSelector((s) => s.auth);
  if (token && loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-12 h-12 border-t-4 border-solid rounded-full animate-spin" style={{ borderTopColor: "#0D9488" }} />
      </div>
    );
  }
  if (user && !user.isBlocked) return <Navigate to={homeFor(user)} replace />;
  const slug = guestTenantSlug();
  // Keyed, so switching university starts that university's page afresh.
  return slug ? <GuestChat key={slug} /> : <UniversityPicker />;
};

export default HomeRoute;
