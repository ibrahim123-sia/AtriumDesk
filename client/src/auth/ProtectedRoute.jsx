import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '../redux/slices/authSlice';
import toast from 'react-hot-toast';

const ProtectedRoute = ({ children, roles }) => {
  const { user, loadingUser } = useSelector((s) => s.auth);
  const location = useLocation();
  const dispatch = useDispatch();

  useEffect(() => {
    if (user?.isBlocked) {
      toast.error("Your account has been blocked.");
      dispatch(logoutUser());
    }
  }, [user, dispatch]);

  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-12 h-12 border-t-4 border-blue-600 border-solid rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.isBlocked) {
    return <Navigate to="/login" replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    if (user.role === "staff") return <Navigate to="/staff/dashboard" replace />;
    if (user.role === "admin") return <Navigate to="/admin/dashboard" replace />;
    return <Navigate to="/chat" replace />;
  }

  return children;
};

export default ProtectedRoute;
