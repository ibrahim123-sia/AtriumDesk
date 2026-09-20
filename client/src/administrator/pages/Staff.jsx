import React, { useEffect, useState, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Plus, Search, Copy, Check, UserPlus, UserX, ShieldCheck, Trash2, Pencil, Trophy } from "lucide-react";
import toast from "react-hot-toast";
import moment from "moment";
import {
  fetchStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
  fetchStaffPerformance,
  fetchStaffPerformanceOne,
  clearSelectedPerformance,
} from "../../redux/slices/adminStaffSlice";
import { fetchDepartments } from "../../redux/slices/departmentSlice";
import AdminTable, { AdminTableRow, AdminTableCell } from "../components/AdminTable";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import AdminModal from "../components/AdminModal";
import ConfirmDialog from "../components/ConfirmDialog";
import StaffPerformanceModal from "../components/StaffPerformanceModal";
import { getPalette } from "../utils/palette";

const DEFAULT_PERMISSIONS = { data: false, content: false, query: false, failedQuestions: false };
const PERMISSION_OPTIONS = [
  { key: "data", label: "Data (knowledge base)" },
  { key: "content", label: "Content (scholarships/jobs/events)" },
  { key: "query", label: "Query (issue analytics)" },
  { key: "failedQuestions", label: "Failed Questions" },
];

const Staff = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const { staff, total, loading, submitting, performance, performanceLoading } = useSelector((s) => s.adminStaff);
  const departments = useSelector((s) => s.department.departments);

  const [view, setView] = useState("list"); // "list" | "performance"
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", departmentId: "", staffTitle: "", staffPermissions: DEFAULT_PERMISSIONS });
  const [credentials, setCredentials] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", departmentId: "", staffTitle: "", staffPermissions: DEFAULT_PERMISSIONS });
  const [savingEdit, setSavingEdit] = useState(false);
  const [performanceStaffId, setPerformanceStaffId] = useState(null);

  const query = useMemo(
    () => ({ departmentId: deptFilter || undefined, search }),
    [deptFilter, search]
  );

  useEffect(() => {
    dispatch(fetchStaff(query));
  }, [dispatch, query]);

  useEffect(() => {
    if (!departments || departments.length === 0) dispatch(fetchDepartments());
  }, [dispatch, departments]);

  useEffect(() => {
    if (view === "performance") dispatch(fetchStaffPerformance());
  }, [view, dispatch]);

  const openPerformance = (id) => {
    setPerformanceStaffId(id);
    dispatch(fetchStaffPerformanceOne(id));
  };

  const closePerformance = () => {
    setPerformanceStaffId(null);
    dispatch(clearSelectedPerformance());
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.departmentId) {
      toast.error("Name and department are required");
      return;
    }
    const result = await dispatch(createStaff(form)).unwrap();
    if (result.success) {
      toast.success("Staff account created");
      setCredentials(result.credentials);
      setForm({ name: "", departmentId: "", staffTitle: "", staffPermissions: DEFAULT_PERMISSIONS });
      setCreateOpen(false);
      dispatch(fetchStaff(query));
    } else {
      toast.error(result.message || "Failed to create staff");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const result = await dispatch(deactivateStaff(confirmDelete._id)).unwrap();
    if (result.success) {
      toast.success("Staff deactivated");
      setConfirmDelete(null);
    } else {
      toast.error(result.message || "Failed to deactivate");
    }
  };

  const openEdit = (staffer) => {
    setEditTarget(staffer);
    setEditForm({
      name: staffer.name || "",
      email: staffer.email || "",
      departmentId: staffer.department?._id || staffer.department || "",
      staffTitle: staffer.staffTitle || "",
      staffPermissions: { ...DEFAULT_PERMISSIONS, ...(staffer.staffPermissions || {}) },
    });
  };

  const closeEdit = () => {
    setEditTarget(null);
    setSavingEdit(false);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    const trimmedName = editForm.name.trim();
    const trimmedEmail = editForm.email.trim().toLowerCase();
    if (trimmedName.length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    if (!/^[\w-.]+@([\w-]+\.)+[\w-]{2,8}$/.test(trimmedEmail)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSavingEdit(true);
    const result = await dispatch(
      updateStaff({
        id: editTarget._id,
        name: trimmedName,
        email: trimmedEmail,
        departmentId: editForm.departmentId || undefined,
        staffTitle: editForm.staffTitle,
        staffPermissions: editForm.staffPermissions,
      })
    ).unwrap();
    setSavingEdit(false);
    if (result.success) {
      toast.success("Staff updated");
      closeEdit();
    } else {
      toast.error(result.message || "Failed to update staff");
    }
  };

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border p-1" style={{ borderColor: C.border }}>
        {[{ key: "list", label: "Staff List" }, { key: "performance", label: "Performance" }].map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
            style={view === t.key ? { backgroundColor: C.navy, color: "#fff" } : { color: C.muted }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "list" && (
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff..."
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
            <option key={d._id} value={d._id}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2.5 text-sm rounded-lg font-medium text-white flex items-center gap-2"
          style={{ backgroundColor: C.navy }}
        >
          <Plus className="w-4 h-4" />
          Add Staff
        </button>
      </div>
      )}

      {view === "list" && (
      <AdminTable
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "department", label: "Department" },
          { key: "title", label: "Title" },
          { key: "joined", label: "Joined" },
          { key: "status", label: "Status" },
          { key: "actions", label: "" },
        ]}
      >
        {loading ? (
          <LoadingSkeleton cols={7} />
        ) : staff.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={UserPlus}
                  title="No staff yet"
                  description="Click 'Add Staff' to create one. The system generates an email and password automatically."
                />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody>
            {staff.map((s) => (
              <AdminTableRow key={s._id} onClick={() => openPerformance(s._id)}>
                <AdminTableCell>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                      style={{ backgroundColor: C.red }}
                    >
                      {s.name?.charAt(0)?.toUpperCase() || "S"}
                    </div>
                    <span className="font-medium" style={{ color: C.text }}>
                      {s.name}
                    </span>
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <span style={{ color: C.muted }}>{s.email}</span>
                </AdminTableCell>
                <AdminTableCell>
                  <span style={{ color: C.muted }}>{s.department?.code || "—"}</span>
                </AdminTableCell>
                <AdminTableCell>
                  <span style={{ color: C.muted }}>{s.staffTitle || "—"}</span>
                </AdminTableCell>
                <AdminTableCell>
                  <span style={{ color: C.muted }}>{moment(s.createdAt).format("MMM D, YYYY")}</span>
                </AdminTableCell>
                <AdminTableCell>
                  {s.isBlocked ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium"
                      style={{ backgroundColor: `${C.red}1A`, color: C.red }}
                    >
                      <UserX className="w-3 h-3" /> Deactivated
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium"
                      style={{ backgroundColor: `${C.green}1A`, color: C.green }}
                    >
                      <ShieldCheck className="w-3 h-3" /> Active
                    </span>
                  )}
                </AdminTableCell>
                <AdminTableCell>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: C.muted }}
                      aria-label="Edit"
                      onMouseEnter={(e) => (e.currentTarget.style.color = C.navy)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {!s.isBlocked && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(s); }}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: C.muted }}
                        aria-label="Deactivate"
                        onMouseEnter={(e) => (e.currentTarget.style.color = C.red)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        )}
      </AdminTable>
      )}

      {view === "list" && (
      <p className="text-xs" style={{ color: C.muted }}>
        Total: {total} staff
      </p>
      )}

      {view === "performance" && (
        <AdminTable
          columns={[
            { key: "name", label: "Name" },
            { key: "department", label: "Department" },
            { key: "solved", label: "Solved" },
            { key: "response", label: "Avg response" },
            { key: "satisfaction", label: "Satisfaction" },
          ]}
        >
          {performanceLoading ? (
            <LoadingSkeleton cols={5} />
          ) : performance.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={5}>
                  <EmptyState icon={Trophy} title="No staff yet" description="Performance shows up once staff have assigned issues." />
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {performance.map((p) => (
                <AdminTableRow key={p._id} onClick={() => openPerformance(p._id)}>
                  <AdminTableCell>
                    <span className="font-medium" style={{ color: C.text }}>{p.name}</span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span style={{ color: C.muted }}>{p.department?.code || "—"}</span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span style={{ color: C.text }}>{p.issuesSolved}</span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span style={{ color: C.muted }}>{p.avgResponseHours != null ? `${p.avgResponseHours}h` : "—"}</span>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span style={{ color: C.muted }}>
                      {p.thumbsUpRate != null ? `${p.thumbsUpRate}%` : "—"}
                      {p.avgSatisfactionRating ? ` · ${p.avgSatisfactionRating}/5` : ""}
                    </span>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </tbody>
          )}
        </AdminTable>
      )}

      <StaffPerformanceModal open={!!performanceStaffId} onClose={closePerformance} />

      <AdminModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Staff Member"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-3 py-2 text-sm rounded-lg border"
              style={{ borderColor: C.border, color: C.text }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-staff-form"
              disabled={submitting}
              className="px-3 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: C.navy }}
            >
              {submitting ? "Creating..." : "Create staff"}
            </button>
          </>
        }
      >
        <form id="create-staff-form" onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Full name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Ali Asad"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              Email and password will be generated automatically.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Department
            </label>
            <select
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              required
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            >
              <option value="">Select department...</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Staff title (optional)
            </label>
            <input
              type="text"
              value={form.staffTitle}
              onChange={(e) => setForm({ ...form, staffTitle: e.target.value })}
              placeholder="e.g. SFO, IT Staff, HOD"
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: C.muted }}>
              Feature access (optional — grants access to these admin pages)
            </label>
            <div className="space-y-1.5">
              {PERMISSION_OPTIONS.map((opt) => (
                <label key={opt.key} className="flex items-center gap-2 text-sm" style={{ color: C.text }}>
                  <input
                    type="checkbox"
                    checked={form.staffPermissions[opt.key]}
                    onChange={(e) => setForm({ ...form, staffPermissions: { ...form.staffPermissions, [opt.key]: e.target.checked } })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </form>
      </AdminModal>

      <AdminModal
        open={!!credentials}
        onClose={() => setCredentials(null)}
        title="Staff credentials"
        size="md"
        footer={
          <button
            type="button"
            onClick={() => setCredentials(null)}
            className="px-3 py-2 text-sm rounded-lg font-medium text-white"
            style={{ backgroundColor: C.navy }}
          >
            Done
          </button>
        }
      >
        <p className="text-sm mb-4" style={{ color: C.text }}>
          The credentials below have also been emailed to the staff member. Make sure they
          change the password after first login.
        </p>
        <div
          className="rounded-lg border p-4 space-y-3 font-mono text-sm"
          style={{ borderColor: C.border, backgroundColor: C.surfaceAlt }}
        >
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: C.muted }}>email</span>
            <span className="truncate" style={{ color: C.text }}>
              {credentials?.email}
            </span>
            <button
              onClick={() => copyToClipboard(credentials?.email)}
              className="p-1 rounded"
              style={{ color: C.navy }}
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: C.muted }}>password</span>
            <span style={{ color: C.text }}>{credentials?.password}</span>
            <button
              onClick={() => copyToClipboard(credentials?.password)}
              className="p-1 rounded"
              style={{ color: C.navy }}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        open={!!editTarget}
        onClose={closeEdit}
        title="Edit staff member"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={closeEdit}
              className="px-3 py-2 text-sm rounded-lg border"
              style={{ borderColor: C.border, color: C.text }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-staff-form"
              disabled={savingEdit}
              className="px-3 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: C.navy }}
            >
              {savingEdit ? "Saving..." : "Save changes"}
            </button>
          </>
        }
      >
        <form id="edit-staff-form" onSubmit={handleEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Full name
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Email
            </label>
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              required
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
            <p className="text-xs mt-1" style={{ color: C.muted }}>
              The staff member will sign in with this email. Tell them after changing it.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Department
            </label>
            <select
              value={editForm.departmentId}
              onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            >
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Staff title
            </label>
            <input
              type="text"
              value={editForm.staffTitle}
              onChange={(e) => setEditForm({ ...editForm, staffTitle: e.target.value })}
              placeholder="e.g. SFO, IT Staff, HOD"
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: C.muted }}>
              Feature access
            </label>
            <div className="space-y-1.5">
              {PERMISSION_OPTIONS.map((opt) => (
                <label key={opt.key} className="flex items-center gap-2 text-sm" style={{ color: C.text }}>
                  <input
                    type="checkbox"
                    checked={editForm.staffPermissions[opt.key]}
                    onChange={(e) => setEditForm({ ...editForm, staffPermissions: { ...editForm.staffPermissions, [opt.key]: e.target.checked } })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </form>
      </AdminModal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        destructive
        title="Deactivate staff?"
        message={`${confirmDelete?.name} will lose access to the portal. Their assigned issues will remain in history.`}
        confirmLabel="Deactivate"
      />
    </div>
  );
};

export default Staff;
