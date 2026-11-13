import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import UniversityPicker from "./UniversityPicker";
import { guestTenantSlug } from "../utils/guestTenant";

// Guest pages belong to one university. Without one chosen, the website
// widget's frame shows the picker; the other guest pages go back to "/".
const GuestRoute = ({ embedded = false, children }) => {
  useLocation(); // re-render when ?u= changes
  if (guestTenantSlug()) return children;
  return embedded ? <UniversityPicker embedded /> : <Navigate to="/" replace />;
};

export default GuestRoute;
