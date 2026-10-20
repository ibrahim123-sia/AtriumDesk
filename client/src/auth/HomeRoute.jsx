import React from "react";
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import GuestChat from "../guest/GuestChat";
import { homeFor } from "./roleHome";

// "/" is the guest landing page — but it's also where the installed app
// opens, so a signed-in student, staff member or admin goes to their own
// home instead of the guest chat.
const HomeRoute = () => {
  const { user, token, loadingUser } = useSelector((s) => s.auth);
  if (token && loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-12 h-12 border-t-4 border-solid rounded-full animate-spin" style={{ borderTopColor: "#0D9488" }} />
      </div>
    );
  }
  if (user && !user.isBlocked) return <Navigate to={homeFor(user)} replace />;
  return <GuestChat />;
};

export default HomeRoute;
