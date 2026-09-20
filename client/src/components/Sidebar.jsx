import React, { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import axios from "../utils/axios";
import {
  createNewChat,
  deleteChat,
  fetchUsersChats,
  setSelectedChat,
} from "../redux/slices/chatSlice";
import { setTheme } from "../redux/slices/themeSlice";
import { logoutUser } from "../redux/slices/authSlice";
import { Link } from "react-router-dom";
import {
  MessageSquare,
  Plus,
  Search,
  Trash2,
  LogOut,
  X,
  Moon,
  Sun,
  Briefcase,
  AlertCircle,
  Calendar,
  GraduationCap,
} from "lucide-react";
import toast from "react-hot-toast";
import moment from "moment";
import { useNavigate, useLocation } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import { getPalette } from "../administrator/utils/palette";
import ConfirmDialog from "../administrator/components/ConfirmDialog";

// Defined at module scope, not inside Sidebar — a component declared inside
// another component's body is a new function identity every render, which
// forces React to remount it (losing hover/transition state, extra DOM
// churn) on every Sidebar re-render instead of just updating it. Takes
// `pathname` as a prop rather than reading `location` from closure.
const NavItem = ({ to, icon, label, pathname }) => {
  const active = pathname === to || pathname.startsWith(to + "/");
  return (
    <Link
      to={to}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium"
      style={{
        color: active ? "#fff" : "rgba(255,255,255,.75)",
        backgroundColor: active ? "rgba(255,255,255,.16)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "rgba(255,255,255,.09)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
};

// Rev7 user request — student-only now (Administrator and Staff moved to
// their own top-navbar shells, see AdminShell.jsx/StaffShell.jsx). Restyled
// to the locked Majlis Ocean Teal palette: a dark primary->primary-dark
// gradient fill (matching uniassist-student-portal.html exactly), not the
// previous light MAJU-navy-on-white sidebar.
const Sidebar = ({ isMenuOpen, setIsMenuOpen }) => {
  const dispatch = useDispatch();
  const chats = useSelector((s) => s.chat.chats);
  const selectedChat = useSelector((s) => s.chat.selectedChat);
  const theme = useSelector((s) => s.theme.theme);
  const user = useSelector((s) => s.auth.user);
  const token = useSelector((s) => s.auth.token);
  const tenantBranding = useSelector((s) => s.tenant.branding);

  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const sidebarRef = useRef(null);
  const [loadingChatId, setLoadingChatId] = useState(null);
  // Holds the chatId pending deletion — drives ConfirmDialog instead of the
  // browser's native window.confirm(), which is unstyled, blocks all other
  // browser events while open, and is the only place left in the app not
  // using the app's own confirm modal (every admin page already does).
  const [chatToDelete, setChatToDelete] = useState(null);
  const [deletingChat, setDeletingChat] = useState(false);
  const isDark = theme === "dark";

  const C = getPalette(isDark, tenantBranding);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isMenuOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target) &&
        window.innerWidth < 768
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen, setIsMenuOpen]);

  useEffect(() => {
    if (isMenuOpen && window.innerWidth < 768) {
      setIsMenuOpen(false);
    }
  }, [location.pathname, isMenuOpen, setIsMenuOpen]);

  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === "Escape" && isMenuOpen && window.innerWidth < 768) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isMenuOpen, setIsMenuOpen]);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    toast.success("Logged out successfully");
    navigate("/login");
  };

  const handleChatClick = async (chat) => {
    try {
      setLoadingChatId(chat._id || chat.id);
      navigate("/chat");

      const { data } = await axios.get(`/api/chat/${chat._id || chat.id}`, {
        headers: { Authorization: token },
      });

      if (data.success) {
        dispatch(setSelectedChat(data.chat));
        toast.success("Chat loaded successfully");
      } else {
        toast.error("Failed to load chat messages");
        dispatch(setSelectedChat(chat));
      }
    } catch (error) {
      console.error("Error loading chat:", error);
      toast.error("Failed to load chat");
      dispatch(setSelectedChat(chat));
    } finally {
      setLoadingChatId(null);
      if (window.innerWidth < 768) {
        setIsMenuOpen(false);
      }
    }
  };

  const handleDeleteChat = (e, chatId) => {
    e.stopPropagation();
    setChatToDelete(chatId);
  };

  const confirmDeleteChat = async () => {
    const chatId = chatToDelete;
    if (!chatId) return;
    setDeletingChat(true);
    try {
      const result = await dispatch(deleteChat({ chatId })).unwrap();
      if (result.success) {
        toast.success("Chat deleted successfully");
        if (selectedChat && selectedChat._id === chatId) {
          dispatch(setSelectedChat(null));
        }
        await dispatch(fetchUsersChats());
        if (window.innerWidth < 768) {
          setIsMenuOpen(false);
        }
      } else {
        toast.error(result.message || "Failed to delete chat");
      }
    } catch (error) {
      toast.error(error.message || "Failed to delete chat");
    } finally {
      setDeletingChat(false);
      setChatToDelete(null);
    }
  };

  const handleNewChat = async () => {
    try {
      const result = await dispatch(createNewChat()).unwrap();
      if (result.success) {
        await dispatch(fetchUsersChats());
        navigate("/chat");
      } else {
        toast.error(result.message || "Failed to create new chat");
      }
    } catch {
      toast.error("Error creating new chat");
    }
  };

  const sidebarGradient = `linear-gradient(180deg, ${C.navy} 0%, ${C.navyHover} 100%)`;

  return (
    <>
      {/* Mobile Overlay */}
      {isMenuOpen && window.innerWidth < 768 && (
        <div
          className="fixed inset-0 z-40 transition-opacity duration-300"
          style={{ backgroundColor: "rgba(6,47,43,.5)" }}
          onClick={() => setIsMenuOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`flex flex-col h-screen w-64 z-50 transition-all duration-300 fixed md:relative md:sticky md:top-0
        ${isMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{ background: sidebarGradient, boxShadow: "2px 0 16px rgba(6,47,43,.2)" }}
      >
        {/* Close button for mobile */}
        <button
          onClick={() => setIsMenuOpen(false)}
          className="md:hidden absolute top-4 right-4 p-2 rounded-lg transition-colors"
          style={{ color: "rgba(255,255,255,.75)" }}
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo Section */}
        <Link to="/chat">
          <div className="p-4 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center font-extrabold"
              style={{ background: "#fff", color: C.navy, fontSize: 13 }}
            >
              UA
            </div>
            <div>
              <h1 className="text-base font-extrabold leading-tight text-white">
                {tenantBranding?.universityShort || "UniAssist"}
              </h1>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,.6)" }}>
                Student Portal
              </p>
            </div>
          </div>
        </Link>

        {/* User Profile + Bell */}
        <div className="px-3 pb-3 flex items-center gap-3">
          <Link
            to="/profile"
            className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-90 transition"
            title="Manage your profile"
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
              style={{ backgroundColor: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)" }}
            >
              {user?.profilePicture ? (
                <img
                  src={`${import.meta.env.VITE_SERVER_URL || "http://localhost:3000"}${user.profilePicture}`}
                  alt={user.name || "avatar"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white font-semibold text-sm">
                  {user?.name?.charAt(0)?.toUpperCase() || "U"}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-white">
                {user?.name || "User"}
              </p>
              <p className="text-xs truncate" style={{ color: "rgba(255,255,255,.6)" }}>
                {user?.email || "student@maju.edu.pk"}
              </p>
            </div>
          </Link>
          <NotificationBell />
        </div>

        {/* New Chat */}
        <div className="px-3 pb-3">
          <button
            onClick={handleNewChat}
            className="w-full font-medium py-2.5 rounded-full flex items-center justify-center gap-2 transition-all text-sm cursor-pointer"
            style={{ backgroundColor: "#fff", color: C.navy }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#E9F2F0")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fff")}
          >
            <Plus className="w-4 h-4" />
            New Conversation
          </button>
        </div>

        {/* Search Chats */}
        <div className="px-3 pb-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
              style={{ color: "rgba(255,255,255,.5)" }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none text-white placeholder:text-white/45"
              style={{ backgroundColor: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.18)" }}
            />
          </div>
        </div>

        {/* Recent Chats */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: "rgba(255,255,255,.5)" }}>
            Recent Conversations
          </h3>

          <div className="space-y-1">
            {chats
              .filter(
                (chat) =>
                  chat.messages?.[0]?.content
                    ?.toLowerCase()
                    .includes(search.toLowerCase()) ||
                  chat.name?.toLowerCase().includes(search.toLowerCase())
              )
              .map((chat) => {
                const isSelected = selectedChat?._id === chat._id;
                const isLoading = loadingChatId === chat._id;

                return (
                  <div
                    key={chat._id || chat.id}
                    onClick={() => handleChatClick(chat)}
                    className="group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all relative"
                    style={{
                      backgroundColor: isSelected ? "rgba(255,255,255,.12)" : "transparent",
                      borderLeft: isSelected ? `2px solid ${C.red}` : "2px solid transparent",
                      opacity: isLoading ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = "rgba(255,255,255,.06)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(255,255,255,.5)" }} />
                        <p className="text-sm font-medium truncate text-white">
                          {chat.messages?.[0]?.content?.slice(0, 30) ||
                            chat.name ||
                            "New Chat"}
                        </p>
                        {isLoading && (
                          <div
                            className="ml-2 w-3 h-3 border-2 rounded-full animate-spin shrink-0"
                            style={{ borderColor: "rgba(255,255,255,.3)", borderTopColor: "#fff" }}
                          ></div>
                        )}
                      </div>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,.5)" }}>
                        {chat.updatedAt
                          ? moment(chat.updatedAt).fromNow()
                          : "Just now"}
                      </p>
                    </div>

                    <button
                      onClick={(e) => handleDeleteChat(e, chat._id || chat.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
                      aria-label="Delete chat"
                      disabled={isLoading}
                      style={{ color: "rgba(255,255,255,.5)" }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

            {chats.length === 0 && (
              <div className="text-center py-6">
                <MessageSquare className="w-9 h-9 mx-auto mb-2" style={{ color: "rgba(255,255,255,.25)" }} />
                <p className="text-sm" style={{ color: "rgba(255,255,255,.6)" }}>
                  No conversations yet
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Nav — Rev7 user request: Super Admin can disable a module per
            tenant; hide the nav item rather than let a student land on a
            403 (server also enforces this independently, see
            requireFeature.js). */}
        <div className="p-1.5 border-t space-y-1" style={{ borderColor: "rgba(255,255,255,.15)" }}>
          <NavItem pathname={location.pathname} to="/issues" icon={<AlertCircle className="w-4 h-4" />} label="My Issues" />
          {tenantBranding?.enabledFeatures?.scholarships !== false && (
            <NavItem pathname={location.pathname} to="/scholarships" icon={<GraduationCap className="w-4 h-4" />} label="Scholarships" />
          )}
          {tenantBranding?.enabledFeatures?.jobs !== false && (
            <NavItem pathname={location.pathname} to="/jobs" icon={<Briefcase className="w-4 h-4" />} label="Jobs" />
          )}
          {tenantBranding?.enabledFeatures?.events !== false && (
            <NavItem pathname={location.pathname} to="/events" icon={<Calendar className="w-4 h-4" />} label="Events" />
          )}
        </div>

        {/* Footer: theme + logout */}
        <div className="p-1.5 border-t" style={{ borderColor: "rgba(255,255,255,.15)" }}>
          <div className="flex items-center justify-between rounded-lg px-3 py-2 mb-1">
            <div className="flex items-center gap-3">
              {isDark ? (
                <Moon className="w-4 h-4 text-white" />
              ) : (
                <Sun className="w-4 h-4 text-white" />
              )}
              <span className="text-sm font-medium text-white">Theme</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isDark}
                onChange={() => dispatch(setTheme(isDark ? "light" : "dark"))}
                className="sr-only peer"
              />
              <div
                className="w-10 h-5 rounded-full transition-colors"
                style={{ backgroundColor: isDark ? C.red : "rgba(255,255,255,.2)" }}
              ></div>
              <div
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: isDark ? "translateX(20px)" : "translateX(0)" }}
              ></div>
            </label>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-lg transition-all text-sm font-medium text-white"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,.09)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <ConfirmDialog
        open={!!chatToDelete}
        onClose={() => !deletingChat && setChatToDelete(null)}
        onConfirm={confirmDeleteChat}
        title="Delete chat?"
        message="Are you sure you want to delete this chat? This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deletingChat}
      />
    </>
  );
};

export default Sidebar;
