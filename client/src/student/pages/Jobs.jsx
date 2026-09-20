import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Briefcase, Search, MapPin, GraduationCap, Sparkles, Link2 } from "lucide-react";
import { fetchJobs, fetchMatchedJobs } from "../../redux/slices/jobSlice";
import { fetchSaved, saveListing, unsaveListing } from "../../redux/slices/savedSlice";
import MatchedListingCard from "../components/MatchedListingCard";
import { getPalette } from "../../administrator/utils/palette";

// Rev 5 §6.1/§6.3 — replaces the retired Apify-dependent Job.jsx. Sourced
// from real company career pages via the Phase 4/5 scraping pipeline.
const WORK_MODES = ["", "remote", "onsite", "hybrid"];

const Jobs = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const { jobs, loading, matched, matchedLoading } = useSelector((s) => s.job);
  const savedIds = useSelector((s) => s.saved.savedIds);
  const [search, setSearch] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [freshGradOnly, setFreshGradOnly] = useState(false);
  const [view, setView] = useState("matched"); // "matched" | "browse" — §6.1: matched feed is primary
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  const C = getPalette(isDark, tenantBranding);

  useEffect(() => {
    if (view !== "browse") return;
    // Debounced — `search` changes on every keystroke; only the settled
    // query should hit the server.
    const t = setTimeout(() => {
      dispatch(fetchJobs({
        search: search || undefined,
        workMode: workMode || undefined,
        isFreshGradFriendly: freshGradOnly ? true : undefined,
      }));
    }, 300);
    return () => clearTimeout(t);
  }, [dispatch, search, workMode, freshGradOnly, view]);

  useEffect(() => {
    if (view === "matched") dispatch(fetchMatchedJobs());
  }, [dispatch, view]);

  useEffect(() => {
    dispatch(fetchSaved());
  }, [dispatch]);

  const toggleSave = (listingId) => {
    dispatch(savedIds.includes(listingId) ? unsaveListing(listingId) : saveListing(listingId));
  };

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: C.text }}>Jobs</h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              Remote and onsite roles, sourced from real company career pages
            </p>
          </div>
          <div className="inline-flex rounded-lg border p-1 self-start" style={{ borderColor: C.border }}>
            <button
              onClick={() => setView("matched")}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5"
              style={view === "matched" ? { backgroundColor: C.navy, color: "#fff" } : { color: C.muted }}
            >
              <Sparkles className="w-3.5 h-3.5" /> Matched for you
            </button>
            <button
              onClick={() => setView("browse")}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={view === "browse" ? { backgroundColor: C.navy, color: "#fff" } : { color: C.muted }}
            >
              Browse all
            </button>
          </div>
        </div>

        {view === "matched" ? (
          matchedLoading ? (
            <div className="text-center py-12 text-sm" style={{ color: C.muted }}>Finding your matches…</div>
          ) : matched.length === 0 ? (
            <div className="text-center py-16 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
              <Sparkles className="w-12 h-12 mx-auto mb-3" style={{ color: C.muted }} />
              <p className="text-base font-medium" style={{ color: C.text }}>No matches yet</p>
              <p className="text-sm mt-1" style={{ color: C.muted }}>Complete your profile (skills, work mode, city) for better matches, or check back soon.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {matched.map((m) => (
                <MatchedListingCard
                  key={m.listing._id}
                  to={`/jobs/${m.listing._id}`}
                  title={m.listing.title}
                  subtitle={m.listing.organization}
                  description={m.listing.description}
                  deadline={m.listing.deadline}
                  state={m.state}
                  gaps={m.gaps}
                  skillGaps={m.skillGaps}
                  explanation={m.explanation}
                  C={C}
                  isSaved={savedIds.includes(m.listing._id)}
                  onToggleSave={() => toggleSave(m.listing._id)}
                  sourceCount={(m.listing.mergedFrom?.length || 0) + 1}
                  tag={
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ backgroundColor: `${C.navy}15`, color: C.navy }}>
                        {m.listing.workMode}
                      </span>
                      {m.listing.location && (
                        <span className="text-xs inline-flex items-center gap-1" style={{ color: C.muted }}>
                          <MapPin className="w-3.5 h-3.5" /> {m.listing.location}
                        </span>
                      )}
                      {m.listing.isFreshGradFriendly && (
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: C.navy }}>
                          <GraduationCap className="w-3.5 h-3.5" /> Fresh-grad friendly
                        </span>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          )
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title, company, or skill..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
                />
              </div>
              <select
                value={workMode}
                onChange={(e) => setWorkMode(e.target.value)}
                className="px-3 py-2.5 text-sm rounded-lg border focus:outline-none"
                style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
              >
                <option value="">Any work mode</option>
                <option value="remote">Remote</option>
                <option value="onsite">Onsite</option>
                <option value="hybrid">Hybrid</option>
              </select>
              <label className="inline-flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg border" style={{ borderColor: C.border, color: C.text }}>
                <input type="checkbox" checked={freshGradOnly} onChange={(e) => setFreshGradOnly(e.target.checked)} />
                Fresh-grad friendly only
              </label>
            </div>

            {loading ? (
              <div className="text-center py-12 text-sm" style={{ color: C.muted }}>Loading…</div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-16 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
                <Briefcase className="w-12 h-12 mx-auto mb-3" style={{ color: C.muted }} />
                <p className="text-base font-medium" style={{ color: C.text }}>No jobs match yet</p>
                <p className="text-sm mt-1" style={{ color: C.muted }}>Try a different search or check back soon.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {jobs.map((job) => (
                  <Link
                    key={job._id}
                    to={`/jobs/${job._id}`}
                    className="p-5 rounded-xl border flex flex-col gap-2 transition-all hover:shadow-md"
                    style={{ backgroundColor: C.surface, borderColor: C.border }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-base" style={{ color: C.text }}>{job.title}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0" style={{ backgroundColor: `${C.navy}15`, color: C.navy }}>
                        {job.workMode}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: C.muted }}>{job.organization}</p>
                    {job.location && (
                      <p className="text-xs inline-flex items-center gap-1.5" style={{ color: C.muted }}>
                        <MapPin className="w-3.5 h-3.5" /> {job.location}
                      </p>
                    )}
                    {job.description && (
                      <p className="text-sm line-clamp-2" style={{ color: C.text }}>{job.description}</p>
                    )}
                    {job.isFreshGradFriendly && (
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: C.navy }}>
                        <GraduationCap className="w-3.5 h-3.5" /> Fresh-grad friendly
                      </span>
                    )}
                    {job.mergedFrom?.length > 0 && (
                      <p className="text-xs inline-flex items-center gap-1" style={{ color: C.muted }}>
                        <Link2 className="w-3 h-3" /> Found on {job.mergedFrom.length + 1} sources
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Jobs;
