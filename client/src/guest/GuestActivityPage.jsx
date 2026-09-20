import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import axios from "../utils/axios";
import { fetchGuestBranding } from "../redux/slices/guestSlice";
import { toggleTheme as toggleThemeAction } from "../redux/slices/themeSlice";
import GuestSidebar from "./GuestSidebar";
import { getPalette } from "../administrator/utils/palette";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

// Renders one admin-authored Activity tab (Sports, Societies, etc.). The
// TEMPLATE below — how a heading/paragraph/image looks and is spaced — is
// fixed and identical for every tab; only the `sections` content differs
// per tab, which is the whole point (admin controls WHAT, not the layout).
const Section = ({ section, C }) => {
  if (section.type === "heading") {
    return (
      <h2 className="text-lg font-bold mt-6 first:mt-0" style={{ color: C.text }}>
        {section.content}
      </h2>
    );
  }
  if (section.type === "paragraph") {
    return (
      <p className="text-sm leading-relaxed mt-3" style={{ color: C.muted }}>
        {section.content}
      </p>
    );
  }
  if (section.type === "image") {
    return (
      <figure className="mt-4">
        <img
          src={`${SERVER_URL}${section.content}`}
          alt={section.caption || ""}
          className="w-full rounded-xl border object-cover max-h-96"
          style={{ borderColor: C.border }}
        />
        {section.caption && (
          <figcaption className="text-xs text-center mt-2" style={{ color: C.muted }}>
            {section.caption}
          </figcaption>
        )}
      </figure>
    );
  }
  return null;
};

const GuestActivityPage = () => {
  const { slug } = useParams();
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const guestSessionId = useSelector((s) => s.guest.guestSessionId);
  const C = getPalette(theme === "dark", tenantBranding);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [tab, setTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    dispatch(fetchGuestBranding());
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    axios
      .get(`/api/guest/activity-tabs/${slug}`)
      .then(({ data }) => {
        if (cancelled) return;
        if (data.success) setTab(data.tab);
        else setNotFound(true);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const toggleTheme = () => dispatch(toggleThemeAction());

  return (
    <div
      className={`flex h-screen ${
        theme === "dark" ? "bg-[#0A1614]" : "bg-linear-to-b from-[#D9F2EE] via-white to-[#F3F8F7]"
      }`}
    >
      <GuestSidebar
        activeTab={slug}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        theme={theme}
        toggleTheme={toggleTheme}
        guestSessionId={guestSessionId}
      />

      <div className="flex-1 overflow-y-auto">
        <header
          className={`md:hidden sticky top-0 z-10 border-b p-4 ${
            theme === "dark" ? "bg-[#0F2320]/95 border-[#1E3A35]" : "bg-white/95 border-[#D9E7E4]"
          }`}
        >
          <button onClick={() => setIsMenuOpen(true)} className="p-2 rounded-lg hover:bg-[#F3F8F7] dark:hover:bg-[#152E2A]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: C.text }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        <div className="max-w-3xl mx-auto p-4 md:p-8">
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-6 w-1/3 rounded" style={{ backgroundColor: C.border }} />
              <div className="h-4 w-full rounded" style={{ backgroundColor: C.border }} />
              <div className="h-4 w-5/6 rounded" style={{ backgroundColor: C.border }} />
            </div>
          ) : notFound || !tab ? (
            <div className={`text-center py-16 rounded-xl border ${theme === "dark" ? "border-[#1E3A35]" : "border-[#D9E7E4]"}`}>
              <p className="text-sm" style={{ color: C.muted }}>This page isn't available.</p>
            </div>
          ) : (
            <article>
              <h1 className="text-2xl font-bold" style={{ color: C.text }}>{tab.title}</h1>
              {tab.sections.map((s, i) => (
                <Section key={i} section={s} C={C} />
              ))}
            </article>
          )}
        </div>
      </div>
    </div>
  );
};

export default GuestActivityPage;
