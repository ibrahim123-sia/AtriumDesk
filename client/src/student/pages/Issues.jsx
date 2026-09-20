import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Plus, FileText, Clock, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import moment from "moment";
import { fetchMyIssues } from "../../redux/slices/issueSlice";
import { getPalette } from "../../administrator/utils/palette";

const STATUSES = ["All", "Pending", "In Progress", "Resolved", "Closed"];

const statusStyle = (status, isDark) => {
  const palette = {
    Pending: { bg: isDark ? "#3a2f15" : "#FFF4E0", text: isDark ? "#FFC774" : "#9A6B00" },
    "In Progress": { bg: isDark ? "#13314f" : "#E0F0FF", text: isDark ? "#7BB6F5" : "#1463B0" },
    Resolved: { bg: isDark ? "#163320" : "#E0F8E5", text: isDark ? "#7BD594" : "#1B7A33" },
    Closed: { bg: isDark ? "#2a2a2a" : "#EDEDED", text: isDark ? "#B5B5B5" : "#666666" },
  };
  return palette[status] || palette.Closed;
};

const Issues = () => {
  const dispatch = useDispatch();
  const issues = useSelector((s) => s.issue.myIssues);
  const loading = useSelector((s) => s.issue.loading);
  const theme = useSelector((s) => s.theme.theme);
  const [filter, setFilter] = useState("All");
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  const C = getPalette(isDark, tenantBranding);

  useEffect(() => {
    dispatch(fetchMyIssues(filter === "All" ? undefined : filter));
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        dispatch(fetchMyIssues(filter === "All" ? undefined : filter));
      }
    }, 20000);
    return () => clearInterval(id);
  }, [dispatch, filter]);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: C.text }}>My Issues</h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              Track support requests and replies from departments
            </p>
          </div>
          <Link
            to="/issues/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium text-sm"
            style={{ backgroundColor: C.navy }}
          >
            <Plus className="w-4 h-4" /> New Issue
          </Link>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className="px-2.5 py-1 rounded-full text-sm border transition-all"
              style={{
                borderColor: filter === s ? C.navy : C.border,
                backgroundColor: filter === s ? C.navy : "transparent",
                color: filter === s ? "#fff" : C.text,
              }}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => dispatch(fetchMyIssues(filter === "All" ? undefined : filter))}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border"
            style={{ borderColor: C.border, color: C.muted }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {loading && issues.length === 0 ? (
          <div className="text-center py-12" style={{ color: C.muted }}>Loading…</div>
        ) : issues.length === 0 ? (
          <div
            className="text-center py-16 rounded-xl border"
            style={{ borderColor: C.border, backgroundColor: C.surface }}
          >
            <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: C.muted }} />
            <p className="text-base font-medium" style={{ color: C.text }}>No issues yet</p>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              Submit your first support request to get help from a department.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => {
              const sStyle = statusStyle(issue.status, isDark);
              return (
                <Link
                  key={issue._id}
                  to={`/issues/${issue._id}`}
                  className="block p-4 rounded-xl border transition-all hover:shadow-md"
                  style={{ backgroundColor: C.surface, borderColor: C.border }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate" style={{ color: C.text }}>
                          {issue.title}
                        </h3>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full uppercase font-semibold"
                          style={{ backgroundColor: sStyle.bg, color: sStyle.text }}
                        >
                          {issue.status}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2" style={{ color: C.muted }}>
                        {issue.description}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: C.muted }}>
                        <span className="inline-flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {issue.department?.code || "—"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {moment(issue.updatedAt).fromNow()}
                        </span>
                        {issue.replies?.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {issue.replies.length} repl{issue.replies.length === 1 ? "y" : "ies"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Issues;
