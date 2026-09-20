import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  Search,
  HelpCircle,
  Clock,
  TrendingUp,
  Layers,
  X,
  AlertTriangle,
  ThumbsUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import moment from "moment";
import {
  fetchAdminIssues,
  fetchAnalytics,
  fetchAdminIssueById,
  clearSelected,
} from "../../redux/slices/adminQuerySlice";
import { fetchDepartments } from "../../redux/slices/departmentSlice";
import AdminTable, { AdminTableRow, AdminTableCell } from "../components/AdminTable";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import StatCard from "../components/StatCard";
import { getPalette } from "../utils/palette";

const PAGE_SIZE = 25;
const STATUSES = ["Pending", "In Progress", "Resolved", "Closed"];

const statusColor = (status, C) => {
  if (status === "Pending") return C.amber;
  if (status === "In Progress") return C.navy;
  if (status === "Resolved") return C.green;
  return C.muted;
};

const Query = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const departments = useSelector((s) => s.department.departments);
  const { issues, total, analytics, selected, loading, detailLoading } = useSelector(
    (s) => s.adminQuery
  );

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const listQuery = useMemo(
    () => ({
      departmentId: deptFilter || undefined,
      status: statusFilter || undefined,
      escalatedOnly,
      search,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    [deptFilter, statusFilter, escalatedOnly, search, page]
  );

  useEffect(() => {
    dispatch(fetchAdminIssues(listQuery));
  }, [dispatch, listQuery]);

  useEffect(() => {
    dispatch(fetchAnalytics());
    if (!departments?.length) dispatch(fetchDepartments());
  }, [dispatch, departments?.length]);

  useEffect(() => {
    setPage(1);
  }, [search, deptFilter, statusFilter, escalatedOnly]);

  const openDetail = (id) => {
    setDrawerOpen(true);
    dispatch(fetchAdminIssueById(id));
  };
  const closeDetail = () => {
    setDrawerOpen(false);
    dispatch(clearSelected());
  };

  const topCategory = analytics?.byCategory?.[0];
  const totalIssues = (analytics?.byStatus &&
    Object.values(analytics.byStatus).reduce((a, b) => a + b, 0)) || 0;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={HelpCircle} label="Total queries" value={totalIssues} accent={C.navy} />
        <StatCard
          icon={TrendingUp}
          label="Most asked"
          value={topCategory ? topCategory.category : "—"}
          hint={topCategory ? `${topCategory.count} times` : ""}
          accent={C.red}
        />
        <StatCard
          icon={Clock}
          label="Avg resolution"
          value={analytics?.avgResolutionHours != null ? `${analytics.avgResolutionHours}h` : "—"}
          hint={analytics?.resolvedCount ? `${analytics.resolvedCount} resolved` : ""}
          accent={C.green}
        />
        <StatCard
          icon={Layers}
          label="Departments handling"
          value={analytics?.byDepartment?.length || 0}
          accent={C.amber}
        />
        <StatCard
          icon={ThumbsUp}
          label="Satisfaction"
          value={analytics?.thumbsUpRate != null ? `${analytics.thumbsUpRate}%` : "—"}
          hint={
            analytics?.feedbackResponseCount
              ? `${analytics.feedbackResponseCount} response(s)${analytics.avgSatisfactionRating ? `, avg ${analytics.avgSatisfactionRating}/5` : ""}`
              : "No feedback yet"
          }
          accent={C.green}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>
            Top categories
          </h3>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={analytics?.byCategory || []} margin={{ top: 6, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="category" tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
                <Bar dataKey="count" fill={C.navy} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>
            By department
          </h3>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={analytics?.byDepartment || []} margin={{ top: 6, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="code" tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} stroke={C.border} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
                <Bar dataKey="count" fill={C.red} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {analytics?.satisfactionByDepartment?.length > 0 && (
        <section className="rounded-xl border p-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>
            Satisfaction by department
          </h3>
          <p className="text-xs mb-3" style={{ color: C.muted }}>
            A department that resolves quickly but scores low here is closing tickets without helping.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: C.muted }}>
                  <th className="text-left font-medium pb-2">Department</th>
                  <th className="text-left font-medium pb-2">Responses</th>
                  <th className="text-left font-medium pb-2">Thumbs-up rate</th>
                  <th className="text-left font-medium pb-2">Avg rating</th>
                </tr>
              </thead>
              <tbody>
                {analytics.satisfactionByDepartment.map((d) => (
                  <tr key={d.code} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="py-2" style={{ color: C.text }}>{d.code} — {d.name}</td>
                    <td className="py-2" style={{ color: C.muted }}>{d.count}</td>
                    <td className="py-2" style={{ color: C.text }}>{d.thumbsUpRate}%</td>
                    <td className="py-2" style={{ color: C.text }}>{d.avgRating || "—"}/5</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {analytics?.topIssues?.length > 0 && (
        <section className="rounded-xl border p-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: C.text }}>Top issues</h3>
          <p className="text-xs mb-3" style={{ color: C.muted }}>
            Which exact questions/titles come up most often — a repeat here is a candidate for an FAQ or a knowledge-base entry.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: C.muted }}>
                  <th className="text-left font-medium pb-2">Title</th>
                  <th className="text-left font-medium pb-2">Times asked</th>
                  <th className="text-left font-medium pb-2">Last asked</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topIssues.map((t, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="py-2" style={{ color: C.text }}>{t.title}</td>
                    <td className="py-2" style={{ color: C.muted }}>{t.count}</td>
                    <td className="py-2" style={{ color: C.muted }}>{moment(t.lastAskedAt).fromNow()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, student..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2.5 text-sm rounded-lg border focus:outline-none"
          style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>{d.code} — {d.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 text-sm rounded-lg border focus:outline-none"
          style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          onClick={() => setEscalatedOnly((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm border transition-all"
          style={{
            borderColor: escalatedOnly ? C.red : C.border,
            backgroundColor: escalatedOnly ? C.red : C.input,
            color: escalatedOnly ? "#fff" : C.text,
          }}
        >
          <AlertTriangle className="w-4 h-4" /> Escalated only
        </button>
      </section>

      <AdminTable
        columns={[
          { key: "title", label: "Title" },
          { key: "student", label: "Student" },
          { key: "department", label: "Department" },
          { key: "category", label: "Category" },
          { key: "status", label: "Status" },
          { key: "created", label: "Created" },
        ]}
      >
        {loading ? (
          <LoadingSkeleton cols={6} />
        ) : issues.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={6}>
                <EmptyState
                  icon={HelpCircle}
                  title="No queries found"
                  description="Adjust filters or wait for students to submit issues."
                />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody>
            {issues.map((iss) => (
              <AdminTableRow key={iss._id} onClick={() => openDetail(iss._id)}>
                <AdminTableCell>
                  <span className="font-medium" style={{ color: C.text }}>{iss.title}</span>
                </AdminTableCell>
                <AdminTableCell>
                  <div className="text-sm" style={{ color: C.muted }}>
                    <div style={{ color: C.text }}>{iss.studentName}</div>
                    <div className="text-xs">{iss.studentEmail}</div>
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <span style={{ color: C.muted }}>{iss.department?.code || "—"}</span>
                </AdminTableCell>
                <AdminTableCell>
                  <span
                    className="px-2 py-0.5 text-xs rounded-full font-medium"
                    style={{ backgroundColor: C.surfaceAlt, color: C.text }}
                  >
                    {iss.category || "other"}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  <span
                    className="px-2 py-0.5 text-xs rounded-full font-medium"
                    style={{
                      backgroundColor: `${statusColor(iss.status, C)}1A`,
                      color: statusColor(iss.status, C),
                    }}
                  >
                    {iss.status}
                  </span>
                  {iss.escalated && (
                    <span
                      className="ml-1.5 px-2 py-0.5 text-xs rounded-full font-medium inline-flex items-center gap-1"
                      style={{ backgroundColor: `${C.red}1A`, color: C.red }}
                    >
                      <AlertTriangle className="w-3 h-3" /> Escalated
                    </span>
                  )}
                </AdminTableCell>
                <AdminTableCell>
                  <span style={{ color: C.muted }}>{moment(iss.createdAt).fromNow()}</span>
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        )}
      </AdminTable>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex" onClick={closeDetail}>
          <div className="flex-1" style={{ backgroundColor: "rgba(15, 22, 38, 0.5)" }} />
          <aside
            className="w-full sm:w-[520px] h-full overflow-y-auto border-l"
            style={{ backgroundColor: C.surface, borderColor: C.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <header
              className="px-5 py-4 border-b flex items-center justify-between sticky top-0 z-10"
              style={{ borderColor: C.border, backgroundColor: C.surface }}
            >
              <h2 className="text-base font-semibold" style={{ color: C.text }}>Issue detail</h2>
              <button onClick={closeDetail} className="p-1 rounded" style={{ color: C.muted }}>
                <X className="w-5 h-5" />
              </button>
            </header>
            <div className="p-5 space-y-4">
              {detailLoading && <p className="text-sm" style={{ color: C.muted }}>Loading...</p>}
              {selected && (
                <>
                  <div>
                    <h3 className="text-lg font-bold mb-1" style={{ color: C.text }}>{selected.title}</h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: C.surfaceAlt, color: C.text }}>
                        {selected.category}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: `${statusColor(selected.status, C)}1A`, color: statusColor(selected.status, C) }}
                      >
                        {selected.status}
                      </span>
                      <span style={{ color: C.muted }}>{selected.department?.code}</span>
                    </div>
                  </div>
                  <div className="text-sm rounded-lg p-3 border" style={{ borderColor: C.border, backgroundColor: C.surfaceAlt, color: C.text }}>
                    {selected.description}
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold mb-1" style={{ color: C.text }}>Student</p>
                    <p style={{ color: C.muted }}>{selected.studentName} · {selected.studentEmail}</p>
                  </div>
                  {selected.assignedTo && (
                    <div className="text-sm">
                      <p className="font-semibold mb-1" style={{ color: C.text }}>Assigned staff</p>
                      <p style={{ color: C.muted }}>
                        {selected.assignedTo.name} ({selected.assignedTo.staffTitle || "staff"})
                      </p>
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
                      Conversation ({selected.replies?.length || 0})
                    </h4>
                    <ul className="space-y-2">
                      {(selected.replies || []).map((r) => (
                        <li
                          key={r._id}
                          className="text-sm p-3 rounded-lg border"
                          style={{ borderColor: C.border, backgroundColor: r.authorRole === "staff" ? `${C.navy}10` : C.surfaceAlt }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-xs" style={{ color: C.text }}>
                              {r.authorName} <span style={{ color: C.muted }}>· {r.authorRole}</span>
                            </span>
                            <span className="text-xs" style={{ color: C.muted }}>
                              {moment(r.createdAt).fromNow()}
                            </span>
                          </div>
                          <p style={{ color: C.text }}>{r.message}</p>
                        </li>
                      ))}
                      {(!selected.replies || selected.replies.length === 0) && (
                        <li className="text-sm" style={{ color: C.muted }}>No replies yet.</li>
                      )}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default Query;
