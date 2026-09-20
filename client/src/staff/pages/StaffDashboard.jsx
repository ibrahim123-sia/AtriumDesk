import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  MessageCircle,
  TrendingUp,
  Building2,
  ArrowRight,
  ThumbsUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import moment from "moment";
import { fetchDeptStats } from "../../redux/slices/issueSlice";
import { getPalette } from "../../administrator/utils/palette";

const POLL_MS = 20000;

const statusBadge = (status, isDark) => {
  const palette = {
    Pending: { bg: isDark ? "#3a2f15" : "#FFF4E0", text: isDark ? "#FFC774" : "#9A6B00" },
    "In Progress": { bg: isDark ? "#13314f" : "#E0F0FF", text: isDark ? "#7BB6F5" : "#1463B0" },
    Resolved: { bg: isDark ? "#163320" : "#E0F8E5", text: isDark ? "#7BD594" : "#1B7A33" },
    Closed: { bg: isDark ? "#2a2a2a" : "#EDEDED", text: isDark ? "#B5B5B5" : "#666666" },
    Rejected: { bg: isDark ? "#3a1818" : "#FCE6E6", text: isDark ? "#F08D7B" : "#A8261B" },
  };
  return palette[status] || palette.Closed;
};

// Defined at module scope, not inside StaffDashboard — a component declared
// inside another component's body is a new function identity every render,
// forcing every stat card (including its loading skeleton) to fully
// remount on each POLL_MS tick instead of just updating its text.
const Card = ({ icon: Icon, label, value, hint, accent, C, loading }) => (
  <div
    className="rounded-xl border p-4 flex flex-col gap-2"
    style={{ backgroundColor: C.surface, borderColor: C.border }}
  >
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
        {label}
      </span>
      {Icon && (
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accent || C.navy}1A`, color: accent || C.navy }}
        >
          <Icon className="w-4 h-4" />
        </div>
      )}
    </div>
    <div className="text-2xl font-bold" style={{ color: C.text }}>
      {loading ? (
        <span
          className="inline-block w-14 h-6 rounded animate-pulse"
          style={{ backgroundColor: C.surfaceAlt }}
        />
      ) : (
        value
      )}
    </div>
    {hint && (
      <p className="text-xs" style={{ color: C.muted }}>
        {hint}
      </p>
    )}
  </div>
);

const StaffDashboard = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const user = useSelector((s) => s.auth.user);
  const { deptStats, deptStatsLoading } = useSelector((s) => s.issue);
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  const C = getPalette(isDark, tenantBranding);

  useEffect(() => {
    dispatch(fetchDeptStats());
    const id = setInterval(() => {
      if (document.visibilityState === "visible") dispatch(fetchDeptStats());
    }, POLL_MS);
    return () => clearInterval(id);
  }, [dispatch]);

  const s = deptStats || {};
  const byStatus = s.byStatus || {};
  const open = (byStatus.Pending || 0) + (byStatus["In Progress"] || 0);

  const cardLoading = deptStatsLoading && !deptStats;

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user?.name?.split(" ")[0] || "staff"}</h1>
            <p
              className="text-sm mt-1 inline-flex items-center gap-1.5"
              style={{ color: C.muted }}
            >
              <Building2 className="w-4 h-4" />
              {user?.staffTitle || "Staff"} · viewing your department's overview
            </p>
          </div>
          <Link
            to="/staff/issues"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: C.navy }}
          >
            Go to inbox <ArrowRight className="w-4 h-4" />
          </Link>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card C={C} loading={cardLoading} icon={AlertCircle} label="Open issues" value={open} hint="Pending + In Progress" accent={C.red} />
          <Card C={C} loading={cardLoading} icon={Clock} label="In Progress" value={byStatus["In Progress"] || 0} accent={C.navy} />
          <Card C={C} loading={cardLoading}
            icon={CheckCircle2}
            label="Resolved this week"
            value={s.resolvedThisWeek ?? 0}
            accent={C.green}
          />
          <Card C={C} loading={cardLoading}
            icon={TrendingUp}
            label="Avg response"
            value={s.avgResponseHours != null ? `${s.avgResponseHours}h` : "—"}
            hint="time to first staff reply"
            accent={C.amber}
          />
          <Card C={C} loading={cardLoading}
            icon={ThumbsUp}
            label="Satisfaction"
            value={s.thumbsUpRate != null ? `${s.thumbsUpRate}%` : "—"}
            hint={
              s.satisfactionResponseCount
                ? `${s.satisfactionResponseCount} response(s)${s.avgSatisfactionRating ? `, avg ${s.avgSatisfactionRating}/5` : ""}`
                : "No feedback yet"
            }
            accent={C.green}
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div
            className="lg:col-span-2 rounded-xl border p-4"
            style={{ backgroundColor: C.surface, borderColor: C.border }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: C.text }}>
                New issues — last 7 days
              </h3>
              <span className="text-xs" style={{ color: C.muted }}>
                Total this week: {s.last7d?.reduce((a, b) => a + b.count, 0) ?? 0}
              </span>
            </div>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer>
                <AreaChart
                  data={s.last7d || []}
                  margin={{ top: 6, right: 12, bottom: 0, left: -10 }}
                >
                  <defs>
                    <linearGradient id="staffArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.navy} stopOpacity={0.5} />
                      <stop offset="95%" stopColor={C.navy} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: C.muted, fontSize: 11 }}
                    tickFormatter={(v) => moment(v).format("MMM D")}
                    stroke={C.border}
                  />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      color: C.text,
                    }}
                    labelFormatter={(v) => moment(v).format("ddd, MMM D")}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={C.navy}
                    fill="url(#staffArea)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: C.text }}>Your activity</h3>
            </div>
            <div className="space-y-3">
              <div
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{ backgroundColor: C.surfaceAlt }}
              >
                <MessageCircle className="w-5 h-5 shrink-0" style={{ color: C.navy }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: C.text }}>
                    {s.repliesGivenByMe ?? 0} replies
                  </p>
                  <p className="text-xs" style={{ color: C.muted }}>
                    posted by you on this dept's issues
                  </p>
                </div>
              </div>

              {["Pending", "In Progress", "Resolved", "Closed", "Rejected"].map((k) => {
                const sb = statusBadge(k, isDark);
                return (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs uppercase font-semibold"
                      style={{ backgroundColor: sb.bg, color: sb.text }}
                    >
                      {k}
                    </span>
                    <span style={{ color: C.text }}>{byStatus[k] ?? 0}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section
          className="rounded-xl border p-4"
          style={{ backgroundColor: C.surface, borderColor: C.border }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: C.text }}>
              Recent issues
            </h3>
            <Link to="/staff/issues" className="text-xs" style={{ color: C.navy }}>
              View all →
            </Link>
          </div>
          <ul className="divide-y" style={{ borderColor: C.border }}>
            {(s.recent || []).map((iss) => {
              const sb = statusBadge(iss.status, isDark);
              return (
                <li key={iss._id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    to={`/staff/issues/${iss._id}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: C.text }}>
                        {iss.title}
                      </p>
                      <p className="text-xs" style={{ color: C.muted }}>
                        {iss.studentName} · {iss.category} · {moment(iss.updatedAt).fromNow()}
                      </p>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full uppercase font-semibold shrink-0"
                      style={{ backgroundColor: sb.bg, color: sb.text }}
                    >
                      {iss.status}
                    </span>
                  </Link>
                </li>
              );
            })}
            {(!s.recent || s.recent.length === 0) && (
              <li className="py-3 text-sm" style={{ color: C.muted }}>
                No issues yet. Once students submit issues to your department they'll appear here.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default StaffDashboard;
