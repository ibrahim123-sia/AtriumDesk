import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { GraduationCap, Landmark, Users, Search, ArrowRight, HelpCircle, FileText, Globe2, ExternalLink, Sparkles, Link2 } from "lucide-react";
import moment from "moment";
import { fetchScholarships, fetchMatchedScholarships } from "../../redux/slices/scholarshipSlice";
import { fetchSaved, saveListing, unsaveListing } from "../../redux/slices/savedSlice";
import MatchedListingCard from "../components/MatchedListingCard";
import { getPalette } from "../../administrator/utils/palette";

const SCHOLARSHIPS = [
  {
    id: "merit",
    title: "Merit-Based Scholarship",
    category: "Academic",
    icon: GraduationCap,
    eligibility: "Based on Board/University results and Admission Test score.",
    details: "Up to 50% or 100% tuition fee waiver for top academic performers during admission, and maintained based on CGPA (typically 3.50+).",
  },
  {
    id: "financial-aid",
    title: "Need-Based Financial Assistance",
    category: "Financial Aid",
    icon: Landmark,
    eligibility: "Students facing financial hardships with proven documentation.",
    details: "Provides partial tuition fee concessions. Requires submission of parents' income tax certificates, utility bills, and salary slips to the Student Financial Center (SFC).",
  },
  {
    id: "sibling",
    title: "Sibling Concession",
    category: "Concessions",
    icon: Users,
    eligibility: "For students whose brother or sister is currently enrolled at MAJU.",
    details: "25% concession on tuition fees for the second sibling currently studying at Muhammad Ali Jinnah University.",
  },
  {
    id: "kinship",
    title: "Kinship Concession",
    category: "Concessions",
    icon: Users,
    eligibility: "For children or siblings of MAJU alumni, faculty, or staff.",
    details: "25% tuition fee concession as a token of appreciation for families associated with the MAJU community.",
  },
  {
    id: "alumni-pg",
    title: "MAJU Alumni PG Scholarship",
    category: "Academic",
    icon: GraduationCap,
    eligibility: "MAJU graduates seeking admission in MS / Postgraduate programs.",
    details: "50% tuition fee waiver for all alumni of Muhammad Ali Jinnah University continuing their education in Master's programs.",
  },
  {
    id: "hec-external",
    title: "HEC & External Scholarships",
    category: "External",
    icon: Landmark,
    eligibility: "As per HEC, PEP, or specific external donor criteria.",
    details: "Administered in cooperation with government bodies and private organizations (e.g., HEC Need-Based Scholarships, Ehsaas Program).",
  },
];

const Scholarship = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const { scholarships, loading: externalLoading, matched, matchedLoading } = useSelector((s) => s.scholarship);
  const savedIds = useSelector((s) => s.saved.savedIds);
  const [search, setSearch] = useState("");
  const [externalSearch, setExternalSearch] = useState("");
  const [externalView, setExternalView] = useState("matched"); // "matched" | "browse" — §6.1: matched feed is primary
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  // Rev 5 §6.2 — external scholarships (MS-abroad opportunities), scraped
  // from real portals via the Phase 4 pipeline. Kept separate from the
  // static MAJU-internal concessions grid below — different data source,
  // different purpose (external opportunities vs this university's own aid).
  useEffect(() => {
    if (externalView !== "browse") return;
    // Debounced — only the settled search query should hit the server.
    const t = setTimeout(() => {
      dispatch(fetchScholarships(externalSearch ? { search: externalSearch } : {}));
    }, 300);
    return () => clearTimeout(t);
  }, [dispatch, externalSearch, externalView]);

  useEffect(() => {
    if (externalView === "matched") dispatch(fetchMatchedScholarships());
  }, [dispatch, externalView]);

  useEffect(() => {
    dispatch(fetchSaved());
  }, [dispatch]);

  const toggleSave = (listingId) => {
    dispatch(savedIds.includes(listingId) ? unsaveListing(listingId) : saveListing(listingId));
  };

  const C = getPalette(isDark, tenantBranding);

  const filtered = SCHOLARSHIPS.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.details.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: C.text }}>Scholarships & Financial Aid</h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              Explore financial support opportunities and academic awards at MAJU
            </p>
          </div>
          <Link
            to="/issues/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium text-sm self-start md:self-auto hover:opacity-90 transition-opacity"
            style={{ backgroundColor: C.navy }}
          >
            <HelpCircle className="w-4 h-4" /> Ask SFC / Apply
          </Link>
        </div>

        {/* External scholarships (Rev 5 §6.2) — MS-abroad opportunities scraped from real portals */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: C.text }}>Study-abroad scholarships</h2>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>Sourced from Chevening, Commonwealth, Fulbright and other portals</p>
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

          {externalView === "matched" ? (
            matchedLoading ? (
              <div className="text-center py-8 text-sm" style={{ color: C.muted }}>Finding your matches…</div>
            ) : matched.length === 0 ? (
              <div className="text-center py-10 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
                <Sparkles className="w-10 h-10 mx-auto mb-2" style={{ color: C.muted }} />
                <p className="text-sm" style={{ color: C.muted }}>
                  No matches yet — complete your profile (CGPA, IELTS/TOEFL, program) for better matches, or check back soon.
                </p>
              </div>
            ) : (
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
                    tag={m.listing.fundingType && m.listing.fundingType !== "other" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider w-fit" style={{ backgroundColor: `${C.navy}15`, color: C.navy }}>
                        {m.listing.fundingType.replace(/_/g, " ")}
                      </span>
                    )}
                  />
                ))}
              </div>
            )
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
                <input
                  type="text"
                  value={externalSearch}
                  onChange={(e) => setExternalSearch(e.target.value)}
                  placeholder="Search by country, university, or program..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
                />
              </div>
              {externalLoading ? (
                <div className="text-center py-8 text-sm" style={{ color: C.muted }}>Loading…</div>
              ) : scholarships.length === 0 ? (
                <div className="text-center py-10 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
                  <Globe2 className="w-10 h-10 mx-auto mb-2" style={{ color: C.muted }} />
                  <p className="text-sm" style={{ color: C.muted }}>No external scholarships match yet — check back soon.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {scholarships.map((sch) => (
                    <Link
                      key={sch._id}
                      to={`/scholarships/${sch._id}`}
                      className="p-5 rounded-xl border flex flex-col gap-2 transition-all hover:shadow-md"
                      style={{ backgroundColor: C.surface, borderColor: C.border }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-base" style={{ color: C.text }}>{sch.title}</h3>
                        {sch.fundingType && sch.fundingType !== "other" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0" style={{ backgroundColor: `${C.navy}15`, color: C.navy }}>
                            {sch.fundingType.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <p className="text-xs inline-flex items-center gap-1.5" style={{ color: C.muted }}>
                        <Globe2 className="w-3.5 h-3.5" /> {sch.organization}{sch.country ? ` · ${sch.country}` : ""}
                      </p>
                      {sch.description && (
                        <p className="text-sm line-clamp-2" style={{ color: C.text }}>{sch.description}</p>
                      )}
                      {sch.deadline && (
                        <p className="text-xs" style={{ color: C.muted }}>Deadline: {moment(sch.deadline).format("MMM D, YYYY")}</p>
                      )}
                      {sch.mergedFrom?.length > 0 && (
                        <p className="text-xs inline-flex items-center gap-1" style={{ color: C.muted }}>
                          <Link2 className="w-3 h-3" /> Found on {sch.mergedFrom.length + 1} sources
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t pt-2" style={{ borderColor: C.border }}>
          <h2 className="text-lg font-semibold" style={{ color: C.text }}>MAJU financial aid & concessions</h2>
          <p className="text-xs mt-0.5 mb-3" style={{ color: C.muted }}>University-specific scholarships and fee concessions</p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scholarships (e.g. merit, sibling, financial aid)..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none"
            style={{
              backgroundColor: C.surface,
              borderColor: C.border,
              color: C.text,
            }}
          />
        </div>

        {/* Scholarship Cards Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: C.muted }} />
            <p className="text-base font-medium" style={{ color: C.text }}>No matching scholarships found</p>
            <p className="text-sm mt-1" style={{ color: C.muted }}>Try refining your search keyword.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.id}
                  className="p-5 rounded-xl border flex flex-col justify-between transition-all hover:shadow-md"
                  style={{ backgroundColor: C.surface, borderColor: C.border }}
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: `${C.navy}15`, color: C.navy }}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-base" style={{ color: C.text }}>{s.title}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ backgroundColor: C.bg, color: C.muted }}>
                          {s.category}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm" style={{ color: C.text }}>{s.details}</p>
                    <div className="pt-2 text-xs">
                      <span className="font-medium" style={{ color: C.muted }}>Eligibility: </span>
                      <span style={{ color: C.text }}>{s.eligibility}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* SFC Section */}
        <div className="p-6 rounded-xl border flex flex-col sm:flex-row items-center gap-5 justify-between" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="font-semibold text-lg" style={{ color: C.text }}>Need help or want to submit an application?</h3>
            <p className="text-sm" style={{ color: C.muted }}>
              Create an official request. Our Student Financial Center (SFC) team will get back to you with the application details.
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
