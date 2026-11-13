import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { GraduationCap, Search, Sun, Moon, ArrowRight, RefreshCw } from "lucide-react";
import axios from "../utils/axios";
import { brandInitials, safeLogoUrl } from "../utils/branding";
import { chooseGuestTenant } from "../utils/guestTenant";
import { clearGuestSession } from "../redux/slices/guestSlice";
import { toggleTheme } from "../redux/slices/themeSlice";

// "/" for a visitor who arrived without a university's own link (/?u=<slug>
// or the website widget): choose the university, then its assistant opens.
// With a single active university there is nothing to choose, so it opens
// straight away — unless the visitor came here to change university.
const SEARCH_FROM = 7; // show the search box once the list stops fitting at a glance

// The university's logo, or its initials on its colour when there is none or
// the file can't be loaded.
const UniversityMark = ({ university }) => {
  const [failed, setFailed] = useState(false);
  const logo = safeLogoUrl(university.logoUrl);
  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt=""
        onError={() => setFailed(true)}
        className="w-12 h-12 rounded-lg object-contain bg-white border border-[#D9E7E4] shrink-0"
      />
    );
  }
  return (
    <span
      className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold shrink-0"
      style={{ background: university.primaryColor || "#0D9488" }}
      aria-hidden="true"
    >
      {brandInitials(university.shortName || university.name, "U")}
    </span>
  );
};

const UniversityPicker = ({ embedded = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const [state, setState] = useState({ status: "loading", universities: [] });
  const [query, setQuery] = useState("");
  const unavailable = location.state?.unavailable;
  const changing = location.state?.choose;

  const load = () => {
    setState({ status: "loading", universities: [] });
    axios
      .get("/api/guest/universities")
      .then(({ data }) => setState({ status: "ready", universities: data.universities || [] }))
      .catch(() => setState({ status: "error", universities: [] }));
  };

  useEffect(load, []);

  const open = (slug) => {
    chooseGuestTenant(slug);
    dispatch(clearGuestSession());
    navigate(`${embedded ? "/embed" : "/"}?u=${encodeURIComponent(slug)}`, { replace: true });
  };

  const only = state.status === "ready" && state.universities.length === 1 ? state.universities[0] : null;
  useEffect(() => {
    if (only && !changing && !unavailable) open(only.slug);
    // open() only depends on values that are stable for this render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [only, changing, unavailable]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.universities;
    return state.universities.filter((u) => `${u.name} ${u.shortName}`.toLowerCase().includes(q));
  }, [query, state.universities]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F6FAF9] dark:bg-[#0A1614] text-[#0F2E2A] dark:text-[#E8F5F2]">
      {!embedded && (
        <header className="w-full border-b border-[#D9E7E4] dark:border-[#1E3A35] bg-white/90 dark:bg-[#0F2320]/90 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#0D9488] flex items-center justify-center shrink-0">
                <GraduationCap className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              <span className="text-lg font-bold truncate">AtriumDesk</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => dispatch(toggleTheme())}
                className="p-2 rounded-lg hover:bg-[#EEF6F5] dark:hover:bg-[#152E2A]"
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              >
                {theme === "dark" ? <Sun className="w-5 h-5" aria-hidden="true" /> : <Moon className="w-5 h-5" aria-hidden="true" />}
              </button>
              <Link to="/login" className="px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap hover:bg-[#EEF6F5] dark:hover:bg-[#152E2A]">
                Log in
              </Link>
              <Link to="/register" className="px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap bg-[#0D9488] hover:bg-[#0B7A70] text-white">
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Create account</span>
              </Link>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Ask your university anything</h1>
          <p className="mt-3 text-base sm:text-lg text-[#53716C] dark:text-[#8FB0AA]">
            Admissions, fees, programmes, scholarships and campus life — answered by your university's own assistant.
            Choose your university to start.
          </p>
        </div>

        {unavailable && (
          <p role="status" className="mt-6 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            That university isn't available right now. Choose another one below.
          </p>
        )}

        {state.status === "ready" && state.universities.length >= SEARCH_FROM && (
          <label className="mt-8 flex items-center gap-2 max-w-md rounded-lg border border-[#D9E7E4] dark:border-[#1E3A35] bg-white dark:bg-[#0F2320] px-3 py-2.5">
            <Search className="w-4 h-4 text-[#53716C] dark:text-[#8FB0AA]" aria-hidden="true" />
            <span className="sr-only">Search universities</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search universities"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </label>
        )}

        <section className="mt-8" aria-live="polite">
          {state.status === "loading" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 rounded-xl bg-white dark:bg-[#0F2320] border border-[#D9E7E4] dark:border-[#1E3A35] animate-pulse" />
              ))}
            </div>
          )}

          {state.status === "error" && (
            <div className="rounded-xl border border-[#D9E7E4] dark:border-[#1E3A35] bg-white dark:bg-[#0F2320] p-6">
              <p className="font-medium">Couldn't load the universities.</p>
              <p className="mt-1 text-sm text-[#53716C] dark:text-[#8FB0AA]">Check your connection and try again.</p>
              <button
                type="button"
                onClick={load}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0D9488] hover:bg-[#0B7A70] text-white text-sm font-medium"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" /> Try again
              </button>
            </div>
          )}

          {state.status === "ready" && state.universities.length === 0 && (
            <div className="rounded-xl border border-[#D9E7E4] dark:border-[#1E3A35] bg-white dark:bg-[#0F2320] p-6">
              <p className="font-medium">No university is open to visitors yet.</p>
              <p className="mt-1 text-sm text-[#53716C] dark:text-[#8FB0AA]">
                Students and staff can still <Link to="/login" className="text-[#0D9488] dark:text-[#5EC8BC] underline">log in</Link>.
              </p>
            </div>
          )}

          {state.status === "ready" && state.universities.length > 0 && (
            <>
              {shown.length === 0 ? (
                <p className="text-sm text-[#53716C] dark:text-[#8FB0AA]">No university matches “{query}”.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map((u) => (
                    <li key={u.slug}>
                      <button
                        type="button"
                        onClick={() => open(u.slug)}
                        className="group w-full h-full text-left flex items-center gap-3 rounded-xl border border-[#D9E7E4] dark:border-[#1E3A35] bg-white dark:bg-[#0F2320] p-4 hover:border-[#0D9488] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[#0D9488] transition"
                      >
                        <UniversityMark university={u} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold leading-snug">{u.name}</span>
                          {u.shortName && u.shortName !== u.name && (
                            <span className="block text-sm text-[#53716C] dark:text-[#8FB0AA]">{u.shortName}</span>
                          )}
                        </span>
                        <ArrowRight className="w-4 h-4 text-[#53716C] group-hover:text-[#0D9488] shrink-0" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </main>

      {!embedded && (
        <footer className="w-full border-t border-[#D9E7E4] dark:border-[#1E3A35] py-5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2 text-sm text-[#53716C] dark:text-[#8FB0AA]">
            <span>AtriumDesk — AI student assistant & help desk for universities</span>
            <span className="flex gap-4">
              <Link to="/privacy" className="hover:underline">Privacy</Link>
              <Link to="/terms" className="hover:underline">Terms</Link>
            </span>
          </div>
        </footer>
      )}
    </div>
  );
};

export default UniversityPicker;
