// components/MobileMenuButton.jsx
import React from 'react';
import { Menu } from 'lucide-react';

const MobileMenuButton = ({ isMenuOpen, setIsMenuOpen }) => {
  return (
    <button
      onClick={() => setIsMenuOpen(true)}
      className={`md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white dark:bg-[#0F2320] shadow-lg transition-all ${
        isMenuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="Open menu"
    >
      <Menu className="w-5 h-5 text-[#0F2E2A] dark:text-[#E8F5F2]" />
    </button>
  );
};

export default MobileMenuButton;