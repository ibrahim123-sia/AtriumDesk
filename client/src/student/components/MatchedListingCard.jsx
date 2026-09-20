import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, AlertTriangle, Bookmark, Link2 } from "lucide-react";
import moment from "moment";

/**
 * Rev 5 §8 — one card shape shared by the Scholarships and Jobs matched
 * feeds: eligible/near-miss badge, gap details for a near-miss, and the
 * Layer 3 LLM explanation when the server computed one (top ~10 only).
 */
const MatchedListingCard = ({ to, title, subtitle, description, deadline, tag, state, gaps, skillGaps, explanation, C, isSaved, onToggleSave, sourceCount }) => {
  const isNearMiss = state === "near_miss";
  return (
    <Link
      to={to}
      className="p-5 rounded-xl border flex flex-col gap-2 transition-all hover:shadow-md relative"
      style={{ backgroundColor: C.surface, borderColor: isNearMiss ? `${C.amber}66` : C.border }}
    >
      {onToggleSave && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSave(); }}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
          title={isSaved ? "Unsave" : "Save for later"}
        >
          <Bookmark className="w-4 h-4" style={{ color: isSaved ? C.navy : C.muted }} fill={isSaved ? C.navy : "none"} />
        </button>
      )}
      <div className="flex items-start justify-between gap-2 pr-7">
        <h3 className="font-semibold text-base" style={{ color: C.text }}>{title}</h3>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 inline-flex items-center gap-1"
          style={isNearMiss ? { backgroundColor: `${C.amber}22`, color: C.amber } : { backgroundColor: `${C.green}22`, color: C.green }}
        >
          {isNearMiss ? <AlertTriangle className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
          {isNearMiss ? "Near miss" : "Eligible"}
        </span>
      </div>
      <p className="text-xs" style={{ color: C.muted }}>{subtitle}</p>
      {description && <p className="text-sm line-clamp-2" style={{ color: C.text }}>{description}</p>}
      {deadline && <p className="text-xs" style={{ color: C.muted }}>Deadline: {moment(deadline).format("MMM D, YYYY")}</p>}
      {sourceCount > 1 && (
        <p className="text-xs inline-flex items-center gap-1" style={{ color: C.muted }}>
          <Link2 className="w-3 h-3" /> Found on {sourceCount} sources
        </p>
      )}
      {tag}

      {isNearMiss && gaps?.length > 0 && (
        <div className="text-xs rounded-lg px-2.5 py-1.5" style={{ backgroundColor: `${C.amber}15`, color: C.amber }}>
          {gaps.map((g) => (
            <div key={g.field}>
              {g.field}: {g.actual} (needs {g.required}, short by {g.shortBy})
            </div>
          ))}
        </div>
      )}

      {/* Rev 5 §6.3 — skill gap analysis, informational only (never affects state) */}
      {skillGaps?.length > 0 && (
        <div className="text-xs rounded-lg px-2.5 py-1.5" style={{ backgroundColor: `${C.amber}15`, color: C.amber }}>
          Missing skills: {skillGaps.join(", ")}
        </div>
      )}

      {explanation && (
        <p className="text-xs italic pt-1 border-t" style={{ color: C.muted, borderColor: C.border }}>
          {explanation}
        </p>
      )}
    </Link>
  );
};

export default MatchedListingCard;
