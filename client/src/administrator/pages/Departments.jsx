import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Plus, Edit2, Building2, Save, X, Power } from "lucide-react";
import toast from "react-hot-toast";
import moment from "moment";
import {
  fetchDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
} from "../../redux/slices/departmentSlice";
import AdminTable, { AdminTableRow, AdminTableCell } from "../components/AdminTable";
import AdminModal from "../components/AdminModal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import { getPalette } from "../utils/palette";

const Departments = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const { departments, loading, submitting } = useSelector((s) => s.department);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);

  useEffect(() => {
    dispatch(fetchDepartments());
  }, [dispatch]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    const result = await dispatch(createDepartment(form)).unwrap();
    if (result.success) {
      toast.success(`Department ${result.department.code} created`);
      setForm({ code: "", name: "", description: "" });
      setCreateOpen(false);
    } else {
      toast.error(result.message || "Failed to create department");
    }
  };

  const startEdit = (d) => {
    setEditingId(d._id);
    setEditForm({ name: d.name, description: d.description || "" });
  };

  const saveEdit = async (id) => {
    const result = await dispatch(updateDepartment({ id, ...editForm })).unwrap();
    if (result.success) {
      toast.success("Department updated");
      setEditingId(null);
    } else {
      toast.error(result.message || "Failed to update");
    }
  };

  const reactivate = async (d) => {
    const result = await dispatch(updateDepartment({ id: d._id, isActive: true })).unwrap();
    if (result.success) toast.success("Department reactivated");
    else toast.error(result.message || "Failed");
  };

  const doDeactivate = async () => {
    if (!confirmDeactivate) return;
    const result = await dispatch(deactivateDepartment(confirmDeactivate._id)).unwrap();
    if (result.success) {
      toast.success("Department deactivated");
      setConfirmDeactivate(null);
    } else {
      toast.error(result.message || "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 text-sm rounded-lg font-medium text-white flex items-center gap-2"
          style={{ backgroundColor: C.navy }}
        >
          <Plus className="w-4 h-4" />
          New Department
        </button>
      </div>

      <AdminTable
        columns={[
          { key: "code", label: "Code", width: 120 },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "created", label: "Created" },
          { key: "status", label: "Status" },
          { key: "actions", label: "" },
        ]}
      >
        {departments.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={6}>
                <EmptyState
                  icon={Building2}
                  title={loading ? "Loading..." : "No departments yet"}
                  description={!loading && "Create your first department to start routing issues."}
                />
              </td>
            </tr>
          </tbody>
        ) : (
          <tbody>
            {departments.map((d) => (
              <AdminTableRow key={d._id}>
                <AdminTableCell>
                  <span className="font-mono font-semibold" style={{ color: C.text }}>
                    {d.code}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  {editingId === d._id ? (
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-2 py-1 text-sm rounded border"
                      style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                    />
                  ) : (
                    <span style={{ color: C.text }}>{d.name}</span>
                  )}
                </AdminTableCell>
                <AdminTableCell>
                  {editingId === d._id ? (
                    <input
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full px-2 py-1 text-sm rounded border"
                      style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                    />
                  ) : (
                    <span style={{ color: C.muted }}>{d.description || "—"}</span>
                  )}
                </AdminTableCell>
                <AdminTableCell>
                  <span style={{ color: C.muted }}>{moment(d.createdAt).format("MMM D, YYYY")}</span>
                </AdminTableCell>
                <AdminTableCell>
                  {d.isActive ? (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium"
                      style={{ backgroundColor: `${C.green}1A`, color: C.green }}
                    >
                      Active
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium"
                      style={{ backgroundColor: `${C.red}1A`, color: C.red }}
                    >
                      Inactive
                    </span>
                  )}
                </AdminTableCell>
                <AdminTableCell>
                  <div className="flex items-center gap-1 justify-end">
                    {editingId === d._id ? (
                      <>
                        <button onClick={() => saveEdit(d._id)} className="p-1.5 rounded" style={{ color: C.green }}>
                          <Save className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded" style={{ color: C.muted }}>
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(d)}
                          className="p-1.5 rounded transition-colors"
                          style={{ color: C.muted }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = C.navy)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {d.isActive ? (
                          <button
                            onClick={() => setConfirmDeactivate(d)}
                            className="p-1.5 rounded transition-colors"
                            style={{ color: C.muted }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = C.red)}
                            onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => reactivate(d)}
                            className="p-1.5 rounded text-xs px-2"
                            style={{ color: C.green }}
                          >
                            Reactivate
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </tbody>
        )}
      </AdminTable>

      <AdminModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Department"
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
              form="create-dept-form"
              disabled={submitting}
              className="px-3 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: C.navy }}
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </>
        }
      >
        <form id="create-dept-form" onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Code (uppercase, unique)
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="SFC"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none font-mono"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Student Facilitation Center"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
              Description (optional)
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
              style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
            />
          </div>
        </form>
      </AdminModal>

      <ConfirmDialog
        open={!!confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
        onConfirm={doDeactivate}
        destructive
        title="Deactivate department?"
        message={`${confirmDeactivate?.code} (${confirmDeactivate?.name}) will be hidden from students. Existing issues are preserved.`}
        confirmLabel="Deactivate"
      />
    </div>
  );
};

export default Departments;
