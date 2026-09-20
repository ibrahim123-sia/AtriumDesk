import React from "react";
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

const ProtectedPlatformRoute = ({ children }) => {
  const token = useSelector((s) => s.platformAuth.token);
  if (!token) return <Navigate to="/platform/login" replace />;
  return children;
};

export default ProtectedPlatformRoute;
