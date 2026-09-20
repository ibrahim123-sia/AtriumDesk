import React, { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";

/**
 * Shared top-navbar shell — Super Admin, Administrator, and Staff/Dept-
 * Officer all use this (Student keeps the left Sidebar). Structure and
 * styling match uniassist-super-admin.html's locked Majlis Ocean Teal
 * design exactly (gradient primary->primary-dark, 58px sticky bar,
 * translucent-white active-tab overlay, avatar dropdown) — see
 * project_t2_t3_saas_implemented.md / the rebrand memory for the source.
 *
 * Unlike the static mockup (which has no real mobile nav, just horizontal-
 * scrolling tabs), this includes a real hamburger + slide-down menu below
 * the `md` breakpoint, per explicit ask for "industry standard" responsive
 * navigation.
 */
const TopNavbar = ({ logoLabel = "UA", wordmark = "UniAssist", subLabel, roleLabel, navItems, maxVisibleTabs, avatarInitials, userName, userEmail, menuItems, C }) => {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const avatarRef = useRef(null);
  const moreRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onClick = (e) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const overflowAt = maxVisibleTabs && navItems.length > maxVisibleTabs ? maxVisibleTabs : navItems.length;
  const visibleItems = navItems.slice(0, overflowAt);
  const overflowItems = navItems.slice(overflowAt);
  const isOverflowActive = overflowItems.some((item) => location.pathname.startsWith(item.to));

  const gradient = `linear-gradient(180deg, ${C.navy} 0%, ${C.navyHover} 100%)`;

  const tabStyle = ({ isActive }) => ({
    padding: "7px 12px",
    borderRadius: 8,
    fontSize: 12.8,
    fontWeight: 600,
    color: isActive ? "#fff" : "rgba(255,255,255,.68)",
    backgroundColor: isActive ? "rgba(255,255,255,.16)" : "transparent",
    whiteSpace: "nowrap",
    transition: "background-color .14s, color .14s",
  });

  return (
    <header
      className="sticky top-0 z-40"
      style={{ background: gradient, boxShadow: "0 2px 16px rgba(6,47,43,.25)" }}
    >
      <div className="max-w-[1360px] mx-auto flex items-center gap-3 px-3 md:px-[22px]" style={{ height: 58 }}>
        <a href="#" onClick={(e) => { e.preventDefault(); navigate(navItems[0]?.to || "/"); }} className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center font-extrabold"
            style={{ background: "#fff", color: C.navy, fontSize: 14 }}
          >
            {logoLabel}
          </div>
          <span className="hidden sm:flex flex-col leading-tight text-white font-extrabold" style={{ fontSize: 15.5 }}>
            {wordmark}
            {subLabel && (
              <small className="font-semibold uppercase tracking-[.08em]" style={{ fontSize: 9, color: "rgba(255,255,255,.55)" }}>
                {subLabel}
              </small>
            )}
          </span>
        </a>

        {/* Desktop nav — the "More" dropdown deliberately lives OUTSIDE the
            overflow-x-auto <nav> below, as a sibling, not a child. Setting
            overflow-x to auto forces the browser to compute overflow-y as
            auto too (CSS overflow spec — one axis can't stay "visible" once
            the other is scrollable), which clips any absolutely-positioned
            dropdown that would otherwise extend below a child of that nav. */}
        <div className="hidden md:flex items-center gap-1 flex-1 min-w-0">
          <nav className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {visibleItems.map((item) => (
              <NavLink key={item.to} to={item.to} style={tabStyle}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          {overflowItems.length > 0 && (
            <div ref={moreRef} className="relative shrink-0">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                style={tabStyle({ isActive: isOverflowActive })}
                className="inline-flex items-center gap-1"
              >
                More
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {moreOpen && (
                <div
                  className="absolute left-0 mt-2 rounded-xl border overflow-hidden py-1"
                  style={{ minWidth: 180, background: C.surface, borderColor: C.border, boxShadow: "0 16px 48px -12px rgba(6,47,43,.38)" }}
                >
                  {overflowItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className="block px-3 py-2 text-sm"
                      style={({ isActive }) => ({
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? C.navy : C.text,
                        backgroundColor: isActive ? C.surfaceAlt : "transparent",
                      })}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 md:hidden" />

        <div className="hidden md:flex items-center gap-2.5 shrink-0">
          {roleLabel && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full font-extrabold px-2.5 py-1"
              style={{ background: "rgba(255,255,255,.94)", color: C.navyHover, fontSize: 10.5 }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.red }} />
              {roleLabel}
            </span>
          )}
          <div ref={avatarRef} className="relative">
            <button
              onClick={() => setAvatarOpen((v) => !v)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs"
              style={{ background: "rgba(255,255,255,.16)", border: "1px solid rgba(255,255,255,.28)" }}
            >
              {avatarInitials}
            </button>
            {avatarOpen && (
              <div
                className="absolute right-0 mt-2 rounded-xl border overflow-hidden"
                style={{ minWidth: 236, background: C.surface, borderColor: C.border, boxShadow: "0 16px 48px -12px rgba(6,47,43,.38)" }}
              >
                <div className="px-3 py-2.5 border-b" style={{ borderColor: C.border }}>
                  <div className="text-sm font-semibold" style={{ color: C.text }}>{userName}</div>
                  <div className="text-xs truncate" style={{ color: C.muted }}>{userEmail}</div>
                </div>
                {menuItems.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => { setAvatarOpen(false); item.onClick ? item.onClick() : navigate(item.to); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: item.danger ? "#A6362B" : C.text }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden text-white p-1.5" onClick={() => setMobileOpen((v) => !v)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile slide-down menu */}
      {mobileOpen && (
        <div className="md:hidden border-t px-3 py-3 space-y-1" style={{ borderColor: "rgba(255,255,255,.15)" }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              style={({ isActive }) => ({
                display: "block",
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                color: isActive ? "#fff" : "rgba(255,255,255,.75)",
                backgroundColor: isActive ? "rgba(255,255,255,.16)" : "transparent",
              })}
            >
              {item.label}
            </NavLink>
          ))}
          <div className="border-t my-2" style={{ borderColor: "rgba(255,255,255,.15)" }} />
          <div className="px-3 py-1.5 text-xs" style={{ color: "rgba(255,255,255,.65)" }}>{userName} · {userEmail}</div>
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={() => { setMobileOpen(false); item.onClick ? item.onClick() : navigate(item.to); }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium"
              style={{ color: item.danger ? "#FCA5A1" : "rgba(255,255,255,.9)" }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};

export default TopNavbar;
