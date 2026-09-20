import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Building2, Users, AlertCircle, Sparkles } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fetchDashboard } from "../../redux/slices/platformSlice";
import StatCard from "../../administrator/components/StatCard";
import { getPalette } from "../../administrator/utils/palette";

// Super Admin landing page (Rev7 user request) — cross-tenant totals +
// a per-tenant activity table, replacing "always land on the bare Tenants
// list with zero visibility into what's happening across the platform."
const Dashboard = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const C = getPalette(theme === "dark");
  const { dashboard, loading } = useSelector((s) => s.platform);

  useEffect(() => {
    dispatch(fetchDashboard());
  }, [dispatch]);

  const totals = dashboard?.totals || { users: 0, issues: 0, aiRequests: 0, aiTokens: 0 };
  const byStatus = dashboard?.tenantsByStatus || {};
  const tenants = dashboard?.tenants || [];
  const chartData = tenants.slice(0, 10).map((t) => ({ name: t.name, requests: t.aiRequests }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: C.text }}>Dashboard</h1>
        <p className="text-sm" style={{ color: C.muted }}>Platform-wide activity across every tenant</p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Tenants"
          value={tenants.length}
          hint={`${byStatus.active || 0} active · ${byStatus.suspended || 0} suspended · ${byStatus.provisioning || 0} provisioning`}
          accent={C.navy}
          loading={loading && !dashboard}
        />
        <StatCard icon={Users} label="Total Users" value={totals.users} accent={C.navy} loading={loading && !dashboard} />
        <StatCard icon={AlertCircle} label="Total Issues" value={totals.issues} accent={C.amber} loading={loading && !dashboard} />
        <StatCard
          icon={Sparkles}
          label="AI Requests (30d)"
          value={totals.aiRequests}
          hint={`${totals.aiTokens.toLocaleString()} tokens`}
          accent={C.green}
          loading={loading && !dashboard}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border p-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>Most active tenants — AI requests (30d)</h3>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 6, right: 12, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }}
                />
                <Bar dataKey="requests" fill={C.navy} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.surfaceAlt }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: C.muted }}>Tenant</th>
                <th className="text-right px-3 py-2 font-semibold" style={{ color: C.muted }}>Users</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.slug} className="border-t" style={{ borderColor: C.border }}>
                  <td className="px-3 py-2" style={{ color: C.text }}>{t.name}</td>
                  <td className="px-3 py-2 text-right" style={{ color: C.muted }}>{t.userCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
