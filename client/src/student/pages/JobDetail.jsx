import React, { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ArrowLeft, MapPin, Calendar, ExternalLink, AlertTriangle, Bookmark, Link2 } from "lucide-react";
import moment from "moment";
import { fetchJobById, clearSelectedJob } from "../../redux/slices/jobSlice";
import { fetchSaved, saveListing, unsaveListing } from "../../redux/slices/savedSlice";
import { getPalette } from "../../administrator/utils/palette";

// Defined at module scope, not inside JobDetail — a component declared
// inside another component's body is a new function identity every render,
// forcing an unnecessary remount on every re-render (e.g. the toggleSave
// dispatch) instead of just updating it.
const Field = ({ label, value, C }) =>
  value ? (
    <div>
      <p className="text-xs font-semibold uppercase" style={{ color: C.muted }}>{label}</p>
      <p className="text-sm mt-0.5" style={{ color: C.text }}>{value}</p>
    </div>
  ) : null;

const JobDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const job = useSelector((s) => s.job.selected);
  const skillGaps = useSelector((s) => s.job.selectedSkillGaps);
  const savedIds = useSelector((s) => s.saved.savedIds);
  const theme = useSelector((s) => s.theme.theme);
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const isSaved = job ? savedIds.includes(job._id) : false;

  const C = getPalette(isDark, tenantBranding);

  useEffect(() => {
    dispatch(fetchJobById(id));
    dispatch(fetchSaved());
    return () => dispatch(clearSelectedJob());
  }, [dispatch, id]);

  const toggleSave = () => {
    dispatch(isSaved ? unsaveListing(id) : saveListing(id));
  };

  if (!job) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: C.bg, color: C.muted }}>
        Loading…
      </div>
    );
  }

  const isStale = moment().diff(moment(job.lastVerifiedAt), "days") > 30;

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-5">
        <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm" style={{ color: C.muted }}>
          <ArrowLeft className="w-4 h-4" /> Back to jobs
        </Link>

        <div className="p-6 rounded-xl border space-y-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{job.title}</h1>
                {job.status !== "approved" && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold uppercase" style={{ backgroundColor: `${C.navy}1A`, color: C.navy }}>
                    {job.status}
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
            <p className="text-sm mt-1" style={{ color: C.muted }}>{job.organization}</p>
            {job.location && (
              <p className="text-xs mt-1 inline-flex items-center gap-1.5" style={{ color: C.muted }}>
                <MapPin className="w-3.5 h-3.5" /> {job.location}
              </p>
            )}
            {job.mergedFrom?.length > 0 && (
              <p className="text-xs mt-1 inline-flex items-center gap-1" style={{ color: C.muted }}>
                <Link2 className="w-3.5 h-3.5" /> Found on {job.mergedFrom.length + 1} sources
              </p>
            )}
          </div>

          {isStale && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: `${C.amber}1A`, color: C.amber }}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Not verified in over 30 days — this posting may no longer be open.
            </div>
          )}

          {job.description && (
            <p className="text-sm whitespace-pre-wrap" style={{ color: C.text }}>{job.description}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t" style={{ borderColor: C.border }}>
            <Field C={C} label="Work mode" value={job.workMode} />
            <Field C={C} label="Experience level" value={job.experienceLevel} />
            <Field C={C} label="Location restriction" value={job.locationRestriction} />
            <Field C={C} label="Fresh-grad friendly" value={job.isFreshGradFriendly ? "Yes" : null} />
          </div>

          {job.skillsRequired?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase mb-1.5" style={{ color: C.muted }}>Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.skillsRequired.map((s) => {
                  const missing = skillGaps.includes(s);
                  return (
                    <span
                      key={s}
                      className="text-xs px-2 py-1 rounded-full"
                      style={missing ? { backgroundColor: `${C.amber}1A`, color: C.amber } : { backgroundColor: `${C.navy}15`, color: C.navy }}
                    >
                      {s}
                    </span>
                  );
                })}
              </div>
              {/* Rev 5 §6.3 — skill gap analysis: the CV is already parsed, so
                  comparing it against a JD is nearly free. */}
              {skillGaps.length > 0 && (
                <p className="text-xs mt-2" style={{ color: C.amber }}>
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                  This role wants {skillGaps.join(", ")}, which {skillGaps.length === 1 ? "isn't" : "aren't"} on your profile.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t flex-wrap gap-3" style={{ borderColor: C.border }}>
            <p className="text-xs inline-flex items-center gap-1.5" style={{ color: C.muted }}>
              <Calendar className="w-3.5 h-3.5" /> Last verified {moment(job.lastVerifiedAt).fromNow()}
            </p>
            {job.officialLink && (
              <a
                href={job.officialLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: C.navy }}
              >
                Apply <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobDetail;
