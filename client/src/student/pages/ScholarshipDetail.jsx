import React, { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ArrowLeft, Globe2, Calendar, ExternalLink, AlertTriangle, Bookmark, Link2 } from "lucide-react";
import moment from "moment";
import { fetchScholarshipById, clearSelectedScholarship } from "../../redux/slices/scholarshipSlice";
import { fetchSaved, saveListing, unsaveListing } from "../../redux/slices/savedSlice";
import { getPalette } from "../../administrator/utils/palette";

// Defined at module scope, not inside ScholarshipDetail — a component
// declared inside another component's body is a new function identity
// every render, forcing an unnecessary remount on every re-render (e.g.
// the toggleSave dispatch) instead of just updating it.
const Field = ({ label, value, C }) =>
  value ? (
    <div>
      <p className="text-xs font-semibold uppercase" style={{ color: C.muted }}>{label}</p>
      <p className="text-sm mt-0.5" style={{ color: C.text }}>{value}</p>
    </div>
  ) : null;

// Rev 5 §6.2 — displayed detail: program name, university, country, degree
// level, funding type, eligibility criteria, required documents, language
// requirements, deadline, official link, last-verified date (+ staleness
// badge past 30 days, per spec — makes the change-detection pipeline
// visible to the student rather than an invisible backend optimization).
const ScholarshipDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const scholarship = useSelector((s) => s.scholarship.selected);
  const savedIds = useSelector((s) => s.saved.savedIds);
  const theme = useSelector((s) => s.theme.theme);
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const isSaved = scholarship ? savedIds.includes(scholarship._id) : false;

  const C = getPalette(isDark, tenantBranding);

  useEffect(() => {
    dispatch(fetchScholarshipById(id));
    dispatch(fetchSaved());
    return () => dispatch(clearSelectedScholarship());
  }, [dispatch, id]);

  const toggleSave = () => {
    dispatch(isSaved ? unsaveListing(id) : saveListing(id));
  };

  if (!scholarship) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: C.bg, color: C.muted }}>
        Loading…
      </div>
    );
  }

  const isStale = moment().diff(moment(scholarship.lastVerifiedAt), "days") > 30;

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-5">
        <Link to="/scholarships" className="inline-flex items-center gap-1.5 text-sm" style={{ color: C.muted }}>
          <ArrowLeft className="w-4 h-4" /> Back to scholarships
        </Link>

        <div className="p-6 rounded-xl border space-y-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{scholarship.title}</h1>
                {scholarship.status !== "approved" && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold uppercase" style={{ backgroundColor: `${C.red}1A`, color: C.red }}>
                    {scholarship.status}
                  </span>
                )}
              </div>
              <button
                onClick={toggleSave}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium"
                style={{ borderColor: C.border, color: isSaved ? C.navy : C.muted }}
              >
                <Bookmark className="w-4 h-4" fill={isSaved ? C.navy : "none"} />
                {isSaved ? "Saved" : "Save for later"}
              </button>
            </div>
            <p className="text-sm mt-1 inline-flex items-center gap-1.5" style={{ color: C.muted }}>
              <Globe2 className="w-4 h-4" /> {scholarship.organization}
              {scholarship.country && <span>· {scholarship.country}</span>}
            </p>
            {scholarship.mergedFrom?.length > 0 && (
              <p className="text-xs mt-1 inline-flex items-center gap-1" style={{ color: C.muted }}>
                <Link2 className="w-3.5 h-3.5" /> Found on {scholarship.mergedFrom.length + 1} sources
              </p>
            )}
          </div>

          {isStale && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: `${C.amber}1A`, color: C.amber }}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Not verified in over 30 days — details may be outdated. Double-check on the official page.
            </div>
          )}

          {scholarship.description && (
            <p className="text-sm whitespace-pre-wrap" style={{ color: C.text }}>{scholarship.description}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t" style={{ borderColor: C.border }}>
            <Field C={C} label="Degree level" value={scholarship.degreeLevel} />
            <Field C={C} label="Funding type" value={scholarship.fundingType?.replace(/_/g, " ")} />
            <Field C={C} label="Language requirements" value={scholarship.languageRequirements} />
            <Field C={C}
              label="Deadline"
              value={scholarship.deadline ? moment(scholarship.deadline).format("MMM D, YYYY") : "Not stated"}
            />
            {scholarship.cgpaRequirement != null && <Field C={C} label="Minimum CGPA" value={scholarship.cgpaRequirement} />}
            {scholarship.ieltsRequirement != null && <Field C={C} label="Minimum IELTS" value={scholarship.ieltsRequirement} />}
            {scholarship.toeflRequirement != null && <Field C={C} label="Minimum TOEFL" value={scholarship.toeflRequirement} />}
          </div>

          {scholarship.eligibilityCriteria && (
            <div className="pt-2 border-t" style={{ borderColor: C.border }}>
              <Field C={C} label="Eligibility criteria" value={scholarship.eligibilityCriteria} />
            </div>
          )}

          {scholarship.requiredDocuments?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase mb-1.5" style={{ color: C.muted }}>Required documents</p>
              <ul className="list-disc list-inside text-sm space-y-0.5" style={{ color: C.text }}>
                {scholarship.requiredDocuments.map((d) => <li key={d}>{d}</li>)}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t flex-wrap gap-3" style={{ borderColor: C.border }}>
            <p className="text-xs inline-flex items-center gap-1.5" style={{ color: C.muted }}>
              <Calendar className="w-3.5 h-3.5" /> Last verified {moment(scholarship.lastVerifiedAt).fromNow()}
            </p>
            {scholarship.officialLink && (
              <a
                href={scholarship.officialLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: C.navy }}
              >
                Official page <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScholarshipDetail;
