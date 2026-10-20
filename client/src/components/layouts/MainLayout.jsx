import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Sidebar from '../Sidebar';
import MobileMenuButton from '../MobileMenuButton';
import ImpersonationBanner from '../ImpersonationBanner';

const MainLayout = () => {
  const user = useSelector((s) => s.auth.user);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // If user is not logged in, redirect to guest chat
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Logged-in user layout - with sidebar
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ImpersonationBanner />
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile Menu Button */}
        <MobileMenuButton
          isMenuOpen={isMenuOpen}
          setIsMenuOpen={setIsMenuOpen}
        />

        {/* Sidebar for logged-in users */}
        <Sidebar
          isMenuOpen={isMenuOpen}
          setIsMenuOpen={setIsMenuOpen}
        />

        {/* Main Content Area — on phones, room for the fixed menu button
            so it doesn't sit on top of page titles */}
        <div className="flex-1 overflow-hidden md:ml-0 max-md:pt-14">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default MainLayout;