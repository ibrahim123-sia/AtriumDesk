import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Users,
  GraduationCap,
  Shield,
  Building2,
  AlertCircle,
  CheckCircle2,
  MessageSquare,
  Flag,
  UserX,
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
import { fetchAdminStats } from "../../redux/slices/adminStatsSlice";
import StatCard from "../components/StatCard";
import { getPalette } from "../utils/palette";

const POLL_MS = 20000;

const Dashboard = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const { stats, loading } = useSelector((s) => s.adminStats);
  const C = getPalette(theme === "dark", tenantBranding);

  useEffect(() => {
    dispatch(fetchAdminStats());
    const id = setInterval(() => {
      if (document.visibilityState === "visible") dispatch(fetchAdminStats());
    }, POLL_MS);
    return () => clearInterval(id);
  }, [dispatch]);

  const u = stats?.users || {};
  const i = stats?.issues || { byStatus: {}, last7d: [] };
  const d = stats?.departments || {};
  const ch = stats?.chats || {};
  const open = (i.byStatus?.Pending || 0) + (i.byStatus?.["In Progress"] || 0);
  const resolved = (i.byStatus?.Resolved || 0) + (i.byStatus?.Closed || 0);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={GraduationCap} label="Students" value={u.students ?? 0} accent={C.navy} loading={loading && !stats} />
        <StatCard icon={Users} label="Staff" value={u.staff ?? 0} accent={C.red} loading={loading && !stats} />
        <StatCard icon={Shield} label="Admins" value={u.admins ?? 0} accent={C.amber} loading={loading && !stats} />
        <StatCard icon={Building2} label="Departments" value={`${d.active ?? 0} / ${d.total ?? 0}`} hint="active / total" accent={C.navy} loading={loading && !stats} />
        <StatCard icon={AlertCircle} label="Open Issues" value={open} accent={C.red} loading={loading && !stats} />
        <StatCard icon={CheckCircle2} label="Resolved Issues" value={resolved} accent={C.green} loading={loading && !stats} />
        <StatCard icon={MessageSquare} label="Total Chats" value={ch.total ?? 0} accent={C.navy} loading={loading && !stats} />
        <StatCard icon={Flag} label="Flagged Students" value={u.flagged ?? 0} hint={u.blocked ? `${u.blocked} blocked` : null} accent={C.red} loading={loading && !stats} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          className="lg:col-span-2 rounded-xl border p-4"
          style={{ backgroundColor: C.surface, borderColor: C.border }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: C.text }}>
              Issues — last 7 days
            </h3>
            <span className="text-xs" style={{ color: C.muted }}>
              Total this week: {i.last7d?.reduce((a, b) => a + b.count, 0) ?? 0}
            </span>
          </div>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <AreaChart data={i.last7d || []} margin={{ top: 6, right: 12, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="issueArea" x1="0" y1="0" x2="0" y2="1">
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
                  contentStyle={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }}
                  labelFormatter={(v) => moment(v).format("ddd, MMM D")}
                />
                <Area type="monotone" dataKey="count" stroke={C.navy} fill="url(#issueArea)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: C.surface, borderColor: C.border }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>
            Recent student signups
          </h3>
          <ul className="space-y-2">
            {(stats?.recentSignups || []).map((s) => (
              <li key={s._id} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                  style={{ backgroundColor: C.navy }}
                >
                  {s.name?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: C.text }}>
                    {s.name}
                    {s.isBlocked && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs" style={{ color: C.red }}>
                        <UserX className="w-3 h-3" /> blocked
                      </span>
                    )}
                  </p>
                  <p className="text-xs truncate" style={{ color: C.muted }}>
                    {s.email} · {moment(s.createdAt).fromNow()}
                  </p>
                </div>
              </li>
            ))}
            {(!stats?.recentSignups || stats.recentSignups.length === 0) && (
              <li className="text-sm" style={{ color: C.muted }}>
                No signups yet.
              </li>
            )}
          </ul>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {["Pending", "In Progress", "Resolved", "Closed"].map((k) => (
          <div
            key={k}
            className="rounded-lg border px-4 py-3"
            style={{ backgroundColor: C.surface, borderColor: C.border }}
          >
            <p className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>
              {k}
            </p>
            <p className="text-lg font-bold" style={{ color: C.text }}>
              {i.byStatus?.[k] ?? 0}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
};

export default Dashboard;
