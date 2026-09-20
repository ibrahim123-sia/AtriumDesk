import React from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { MessageCircle, GraduationCap, Sun, Moon, X, Users, Trash2 } from "lucide-react";

// Shared guest-area nav shell — extracted from GuestChat.jsx so Chat,
// Scholarships, and any admin-defined Activity tabs all render inside the
// same persistent sidebar/chrome instead of each page reinventing it.
// `extraNavItems` (optional): [{ slug, label, icon }] — admin-created
// Activity tabs get appended here once that feature exists.
const GuestSidebar = ({
  activeTab,
  isMenuOpen,
  setIsMenuOpen,
  theme,
  toggleTheme,
  guestSessionId,
  onClearChat,
  extraNavItems = [],
}) => {
  const navigate = useNavigate();
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const universityShort = tenantBranding?.universityShort || "your university";

  const baseNavItems = [
    { slug: "chat", label: "Chat", icon: MessageCircle, onClick: () => navigate("/") },
    { slug: "scholarships", label: "Scholarships", icon: GraduationCap, onClick: () => navigate("/guest/scholarships") },
  ];
  const navItems = [...baseNavItems, ...extraNavItems];

  return (
    <>
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        ></div>
      )}

      <div
        className={`flex flex-col h-screen w-64 ${
          theme === "dark"
            ? "bg-[#0F2320]/95 border-[#1E3A35] backdrop-blur-lg"
            : "bg-white/95 border-[#D9E7E4] backdrop-blur-lg"
        } border-r transition-transform duration-300 fixed md:relative z-40
      ${isMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <button
          onClick={() => setIsMenuOpen(false)}
          className="md:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-[#F3F8F7] dark:hover:bg-[#152E2A]"
        >
          <X className="w-5 h-5 text-[#53716C] dark:text-[#8FB0AA]" />
        </button>

        <div className="p-6 border-b border-[#D9E7E4] dark:border-[#1E3A35]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center relative bg-[#0D9488]">
              <span className="text-white font-bold text-lg leading-none">{universityShort.charAt(0).toUpperCase()}</span>
              <span className="absolute bottom-1 left-2 right-2 h-0.5 rounded-full bg-[#4E9128]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#0F2E2A] dark:text-[#E8F5F2] leading-tight">
                AtriumDesk
              </h1>
              <p className="text-[11px] text-[#53716C] dark:text-[#8FB0AA]">
                {universityShort} Student Assistant
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-[#D9E7E4] dark:border-[#1E3A35]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-linear-to-r from-[#0D9488] to-[#4E9128] flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#0F2E2A] dark:text-[#E8F5F2]">Guest User</p>
              <p className="text-xs text-[#53716C] dark:text-[#8FB0AA]">Text Chat Only</p>
            </div>
            {activeTab === "chat" && guestSessionId && (
              <button
                onClick={onClearChat}
                className="p-1.5 rounded-md hover:bg-[#F3F8F7] dark:hover:bg-[#152E2A]"
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4 text-[#53716C] dark:text-[#8FB0AA]" />
              </button>
            )}
          </div>
        </div>

        <div className="p-4">
          <button
            onClick={() => navigate("/register")}
            className="w-full bg-linear-to-r from-[#0D9488] to-[#0D9488] hover:from-[#0B7A70] hover:to-[#0B7A70]
            text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all text-sm"
          >
            <GraduationCap className="w-4 h-4" />
            Register for Full Access
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.slug;
            return (
              <button
                key={item.slug}
                onClick={() => {
                  item.onClick();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 text-sm font-medium transition-colors"
                style={
                  active
                    ? { backgroundColor: "#0D948820", color: "#0D9488" }
                    : theme === "dark"
                    ? { color: "#8FB0AA" }
                    : { color: "#53716C" }
                }
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#D9E7E4] dark:border-[#1E3A35] space-y-2">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F3F8F7] dark:bg-[#152E2A]">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="w-4 h-4 text-[#4E9128]" />
              ) : (
                <Sun className="w-4 h-4 text-[#4E9128]" />
              )}
              <span className="text-sm font-medium text-[#0F2E2A] dark:text-[#E8F5F2]">Theme</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={theme === "dark"}
                onChange={toggleTheme}
                className="sr-only peer"
              />
              <div
                className={`w-10 h-5 rounded-full peer ${
                  theme === "dark" ? "bg-[#4E9128]" : "bg-[#D9E7E4]"
                }`}
              ></div>
              <div
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  theme === "dark" ? "translate-x-5" : ""
                }`}
              ></div>
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => navigate("/login")}
              className="flex-1 px-3 py-2 text-sm bg-[#F3F8F7] dark:bg-[#152E2A] text-[#0F2E2A] dark:text-[#E8F5F2] rounded-lg hover:bg-[#D9F2EE] dark:hover:bg-[#0F2320]"
            >
              Login
            </button>
            <button
              onClick={() => navigate("/register")}
              className="flex-1 px-3 py-2 text-sm bg-linear-to-r from-[#0D9488] to-[#0D9488] text-white rounded-lg hover:from-[#0B7A70] hover:to-[#0B7A70]"
            >
              Register
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default GuestSidebar;
