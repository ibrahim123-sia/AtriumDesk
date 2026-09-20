import React from "react";
import { flushSync } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { endImpersonation } from "../redux/slices/authSlice";

// Rev7 §6/T3 — an impersonated session must never be visually
// indistinguishable from the real tenant Administrator logging in
// themselves. Always visible while impersonating; ends the session
// client-side (the underlying tenant JWT is already short-lived, 1h) and
// returns to the Super Admin's own still-live platform session.
const ImpersonationBanner = () => {
  const { impersonating, impersonatedTenantName } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  if (!impersonating) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-white" style={{ backgroundColor: "#B8860B" }}>
      <span className="inline-flex items-center gap-2">
        <ShieldAlert className="w-4 h-4" />
        Impersonating {impersonatedTenantName} as Super Admin
      </span>
      <button
        onClick={() => {
          // A setTimeout(0) here previously tried to let the route
          // transition "commit first" before clearing auth state — but
          // that's a race, not a guarantee: if /platform/tenants' lazy
          // chunk takes longer than one tick to load, endImpersonation()
          // still fires while the OLD tenant-side ProtectedRoute (which
          // reads auth.user) is mounted, and it redirects to /login instead
          // of the Super Admin dashboard. flushSync forces the navigation
          // to fully commit — unmounting that old ProtectedRoute — before
          // this function returns, so clearing auth.user afterwards can no
          // longer race it.
          flushSync(() => {
            navigate("/platform/tenants", { replace: true });
          });
          dispatch(endImpersonation());
        }}
        className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30"
      >
        End impersonation
      </button>
    </div>
  );
};

export default ImpersonationBanner;
