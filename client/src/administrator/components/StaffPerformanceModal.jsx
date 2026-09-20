import React from "react";
import { useSelector } from "react-redux";
import moment from "moment";
import AdminModal from "./AdminModal";
import { getPalette } from "../utils/palette";

// User request — click a staff row (list OR the Performance leaderboard) to
// see that person's own numbers: issues solved, response time, satisfaction,
// and their most recently touched issues. Thin wrapper around AdminModal,
// same convention Staff.jsx's own create/edit/credentials modals already use.
const StaffPerformanceModal = ({ open, onClose }) => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const { selectedPerformance: p, selectedPerformanceLoading: loading } = useSelector((s) => s.adminStaff);

  return (
    <AdminModal open={open} onClose={onClose} title={p?.staff?.name || "Staff performance"} size="lg">
      {loading || !p ? (
        <p className="text-sm" style={{ color: C.muted }}>Loading…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: C.muted }}>
            {p.staff.email} · {p.staff.department ? `${p.staff.department.code} — ${p.staff.department.name}` : "No department"}
            {p.staff.staffTitle ? ` · ${p.staff.staffTitle}` : ""}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border" style={{ backgroundColor: C.surfaceAlt, borderColor: C.border }}>
              <p className="text-xs uppercase" style={{ color: C.muted }}>Solved</p>
              <p className="text-lg font-bold" style={{ color: C.text }}>{p.issuesSolved}</p>
            </div>
            <div className="p-3 rounded-xl border" style={{ backgroundColor: C.surfaceAlt, borderColor: C.border }}>
              <p className="text-xs uppercase" style={{ color: C.muted }}>Avg response</p>
              <p className="text-lg font-bold" style={{ color: C.text }}>{p.avgResponseHours != null ? `${p.avgResponseHours}h` : "—"}</p>
            </div>
            <div className="p-3 rounded-xl border" style={{ backgroundColor: C.surfaceAlt, borderColor: C.border }}>
              <p className="text-xs uppercase" style={{ color: C.muted }}>Satisfaction</p>
              <p className="text-lg font-bold" style={{ color: C.text }}>{p.thumbsUpRate != null ? `${p.thumbsUpRate}%` : "—"}</p>
            </div>
            <div className="p-3 rounded-xl border" style={{ backgroundColor: C.surfaceAlt, borderColor: C.border }}>
              <p className="text-xs uppercase" style={{ color: C.muted }}>Avg rating</p>
              <p className="text-lg font-bold" style={{ color: C.text }}>{p.avgSatisfactionRating ? `${p.avgSatisfactionRating}/5` : "—"}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.muted }}>Recent issues</p>
            {p.recentIssues.length === 0 ? (
              <p className="text-sm" style={{ color: C.muted }}>No assigned issues yet.</p>
            ) : (
              <div className="space-y-1.5">
                {p.recentIssues.map((issue) => (
                  <div key={issue._id} className="flex items-center justify-between text-sm gap-3 py-1.5 border-t" style={{ borderColor: C.border }}>
                    <span className="truncate" style={{ color: C.text }}>{issue.title}</span>
                    <span className="shrink-0 text-xs" style={{ color: C.muted }}>{issue.status} · {moment(issue.updatedAt).fromNow()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AdminModal>
  );
};

export default StaffPerformanceModal;
