import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Search, ArrowRight, HelpCircle, FileText, Globe2, Sparkles, Link2, Landmark, UserCog } from "lucide-react";
import moment from "moment";
import {
  fetchScholarships,
  fetchMatchedScholarships,
  fetchInternalScholarships,
} from "../../redux/slices/scholarshipSlice";
import { fetchSaved, saveListing, unsaveListing } from "../../redux/slices/savedSlice";
import MatchedListingCard from "../components/MatchedListingCard";
import SaveSearchButton from "../components/SaveSearchButton";
import { getPalette } from "../../administrator/utils/palette";

// What scholarship matching reads from the profile, and what's missing.
// Rev 5 §5.4: say exactly what to add, not just "complete your profile".
const missingForScholarships = (profile) => {
  const missing = [];
  if (profile?.core?.cgpa == null) missing.push("your CGPA");
  if (!profile?.core?.degreeProgram) missing.push("your degree programme");
  if (profile?.studyAbroad?.ieltsScore == null && profile?.studyAbroad?.toeflScore == null) {
    missing.push("an IELTS or TOEFL score");
  }
  return missing;
};

const joinWords = (parts) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

const FundingTag = ({ fundingType, C }) =>
  fundingType && fundingType !== "other" ? (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider w-fit shrink-0"
      style={{ backgroundColor: `${C.navy}15`, color: C.navy }}
    >
      {fundingType.replace(/_/g, " ")}
    </span>
  ) : null;

const ListingCard = ({ listing, C, icon }) => {
  const Icon = icon || Globe2;
  return (
  <Link
    to={`/scholarships/${listing._id}`}
    className="p-5 rounded-xl border flex flex-col gap-2 transition-all hover:shadow-md"
    style={{ backgroundColor: C.surface, borderColor: C.border }}
  >
    <div className="flex items-start justify-between gap-2">
      <h3 className="font-semibold text-base" style={{ color: C.text }}>{listing.title}</h3>
      <FundingTag fundingType={listing.fundingType} C={C} />
    </div>
    <p className="text-xs inline-flex items-center gap-1.5" style={{ color: C.muted }}>
      <Icon className="w-3.5 h-3.5" /> {listing.organization}
      {listing.country ? ` · ${listing.country}` : ""}
    </p>
    {listing.description && <p className="text-sm line-clamp-2" style={{ color: C.text }}>{listing.description}</p>}
    {listing.deadline && (
      <p className="text-xs" style={{ color: C.muted }}>Deadline: {moment(listing.deadline).format("MMM D, YYYY")}</p>
    )}
    {listing.mergedFrom?.length > 0 && (
      <p className="text-xs inline-flex items-center gap-1" style={{ color: C.muted }}>
        <Link2 className="w-3 h-3" /> Found on {listing.mergedFrom.length + 1} sources
      </p>
    )}
  </Link>
  );
};

const Scholarship = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const profile = useSelector((s) => s.auth.user?.profile);
  const {
    scholarships,
    total,
    loading: externalLoading,
    matched,
    matchedLoading,
    internal,
    internalLoading,
  } = useSelector((s) => s.scholarship);
  const savedIds = useSelector((s) => s.saved.savedIds);
  const [internalSearch, setInternalSearch] = useState("");
  const [externalSearch, setExternalSearch] = useState("");
  const [externalView, setExternalView] = useState("matched"); // "matched" | "browse" — §6.1: matched feed is primary
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  useEffect(() => {
    if (externalView !== "browse") return;
    // Debounced — only the settled search query should hit the server.
    const t = setTimeout(() => {
      dispatch(fetchScholarships({ scope: "external", search: externalSearch || undefined }));
    }, 300);
    return () => clearTimeout(t);
  }, [dispatch, externalSearch, externalView]);

  useEffect(() => {
    if (externalView === "matched") dispatch(fetchMatchedScholarships());
  }, [dispatch, externalView]);

  useEffect(() => {
    dispatch(fetchSaved());
    dispatch(fetchInternalScholarships());
  }, [dispatch]);

  const toggleSave = (listingId) => {
    dispatch(savedIds.includes(listingId) ? unsaveListing(listingId) : saveListing(listingId));
  };

  const loadMore = () => {
    dispatch(fetchScholarships({ scope: "external", search: externalSearch || undefined, offset: scholarships.length }));
  };

  const C = getPalette(isDark, tenantBranding);
  const uniShort = tenantBranding?.universityShort || "your university";
  const missing = missingForScholarships(profile);
  const counts = matched.reduce((acc, m) => ({ ...acc, [m.state]: (acc[m.state] || 0) + 1 }), {});

  const query = internalSearch.trim().toLowerCase();
  const internalFiltered = (internal || []).filter(
    (s) =>
      !query ||
      s.title.toLowerCase().includes(query) ||
      (s.description || "").toLowerCase().includes(query) ||
      (s.eligibilityCriteria || "").toLowerCase().includes(query)
  );

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: C.text }}>Scholarships & Financial Aid</h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              Awards from {uniShort} and study-abroad scholarships matched to your profile
            </p>
          </div>
          <Link
            to="/issues/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium text-sm self-start md:self-auto hover:opacity-90 transition-opacity"
            style={{ backgroundColor: C.navy }}
          >
            <HelpCircle className="w-4 h-4" /> Ask the financial aid office
          </Link>
        </div>

        {/* External scholarships (Rev 5 §6.2) — MS-abroad opportunities scraped from real portals */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: C.text }}>Study-abroad scholarships</h2>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                From the scholarship portals {uniShort} follows, checked against your profile
              </p>
            </div>
            <div className="inline-flex rounded-lg border p-1 self-start" style={{ borderColor: C.border }}>
              <button
                onClick={() => setExternalView("matched")}
                className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5"
                style={externalView === "matched" ? { backgroundColor: C.navy, color: "#fff" } : { color: C.muted }}
              >
                <Sparkles className="w-3.5 h-3.5" /> Matched for you
              </button>
              <button
                onClick={() => setExternalView("browse")}
                className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
                style={externalView === "browse" ? { backgroundColor: C.navy, color: "#fff" } : { color: C.muted }}
              >
                Browse all
              </button>
            </div>
          </div>

          {externalView === "matched" && missing.length > 0 && (
            <div
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border"
              style={{ borderColor: `${C.navy}55`, backgroundColor: `${C.navy}0D` }}
            >
              <p className="text-sm" style={{ color: C.text }}>
                Add {joinWords(missing)} to your profile and we'll show which scholarships you're actually eligible for.
              </p>
              <Link
                to="/profile"
                className="inline-flex items-center gap-1.5 text-sm font-medium shrink-0"
                style={{ color: C.navy }}
              >
                <UserCog className="w-4 h-4" /> Complete profile
              </Link>
            </div>
          )}

          {externalView === "matched" ? (
            matchedLoading ? (
              <div className="text-center py-8 text-sm" style={{ color: C.muted }}>Finding your matches…</div>
            ) : matched.length === 0 ? (
              <div className="text-center py-10 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
                <Sparkles className="w-10 h-10 mx-auto mb-2" style={{ color: C.muted }} />
                <p className="text-sm" style={{ color: C.muted }}>
                  Nothing open matches your profile right now — check Browse all, or come back soon.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs" style={{ color: C.muted }}>
                  {counts.eligible || 0} eligible · {counts.near_miss || 0} close · {counts.unverified || 0} need more profile details
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {matched.map((m) => (
                    <MatchedListingCard
                      key={m.listing._id}
                      to={`/scholarships/${m.listing._id}`}
                      title={m.listing.title}
                      subtitle={`${m.listing.organization}${m.listing.country ? ` · ${m.listing.country}` : ""}`}
                      description={m.listing.description}
                      deadline={m.listing.deadline}
                      state={m.state}
                      gaps={m.gaps}
                      explanation={m.explanation}
                      C={C}
                      isSaved={savedIds.includes(m.listing._id)}
                      onToggleSave={() => toggleSave(m.listing._id)}
                      sourceCount={(m.listing.mergedFrom?.length || 0) + 1}
                      tag={<FundingTag fundingType={m.listing.fundingType} C={C} />}
                    />
                  ))}
                </div>
              </>
            )
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
                  <input
                    type="text"
                    value={externalSearch}
                    onChange={(e) => setExternalSearch(e.target.value)}
                    placeholder="Search by country, university, or program..."
                    aria-label="Search study-abroad scholarships"
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none"
                    style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
                  />
                </div>
                <SaveSearchButton
                  listingType="scholarship"
                  filters={{ search: externalSearch.trim() || undefined, scope: "external" }}
                  C={C}
                />
              </div>
              {externalLoading && scholarships.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: C.muted }}>Loading…</div>
              ) : scholarships.length === 0 ? (
                <div className="text-center py-10 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
                  <Globe2 className="w-10 h-10 mx-auto mb-2" style={{ color: C.muted }} />
                  <p className="text-sm" style={{ color: C.muted }}>No study-abroad scholarships match yet — check back soon.</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {scholarships.map((sch) => (
                      <ListingCard key={sch._id} listing={sch} C={C} />
                    ))}
                  </div>
                  {scholarships.length < total && (
                    <div className="text-center">
                      <button
                        onClick={loadMore}
                        disabled={externalLoading}
                        className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-60"
                        style={{ borderColor: C.border, color: C.text }}
                      >
                        {externalLoading ? "Loading…" : `Load more (${total - scholarships.length} more)`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* The university's own awards — published by its admin as internal scholarships */}
        <div className="border-t pt-2 space-y-3" style={{ borderColor: C.border }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: C.text }}>{uniShort} financial aid & concessions</h2>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>Scholarships and fee concessions offered by {uniShort} itself</p>
          </div>

          {(internal || []).length > 4 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
              <input
                type="text"
                value={internalSearch}
                onChange={(e) => setInternalSearch(e.target.value)}
                placeholder="Search (e.g. merit, need-based, sibling)..."
                aria-label={`Search ${uniShort} scholarships`}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none"
                style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
              />
            </div>
          )}

          {internalLoading && !(internal || []).length ? (
            <div className="text-center py-8 text-sm" style={{ color: C.muted }}>Loading…</div>
          ) : internalFiltered.length === 0 ? (
            <div className="text-center py-12 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
              <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: C.muted }} />
              <p className="text-sm font-medium" style={{ color: C.text }}>
                {(internal || []).length ? "No matching awards" : `${uniShort} hasn't listed its own awards here yet`}
              </p>
              <p className="text-sm mt-1" style={{ color: C.muted }}>
                {(internal || []).length ? "Try a different keyword." : "Ask the financial aid office about merit and need-based support."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {internalFiltered.map((s) => (
                <ListingCard key={s._id} listing={s} C={C} icon={Landmark} />
              ))}
            </div>
          )}
        </div>

        {/* Financial aid office */}
        <div className="p-6 rounded-xl border flex flex-col sm:flex-row items-center gap-5 justify-between" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="font-semibold text-lg" style={{ color: C.text }}>Need help or want to submit an application?</h3>
            <p className="text-sm" style={{ color: C.muted }}>
              Send an official request to the financial aid office — they'll reply with the application details.
            </p>
          </div>
          <Link
            to="/issues/new"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border font-medium text-sm hover:bg-gray-100 dark:hover:bg-slate-800 transition"
            style={{ borderColor: C.border, color: C.text }}
          >
            Submit Application Request <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Scholarship;
