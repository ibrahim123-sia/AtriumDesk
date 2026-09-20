import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-hot-toast";
import { Plus, UserCog, PauseCircle, PlayCircle, Pencil } from "lucide-react";
import { getPalette } from "../../administrator/utils/palette";
import { fetchTenants, suspendTenant, reactivateTenant, impersonateTenant } from "../../redux/slices/platformSlice";
import { startImpersonation } from "../../redux/slices/authSlice";

const STATUS_COLOR = {
  active: { bg: "#1E8E5A22", fg: "#1E8E5A" },
  provisioning: { bg: "#3B82F622", fg: "#3B82F6" },
  suspended: { bg: "#D9A73A22", fg: "#B8860B" },
  offboarded: { bg: "#53716C22", fg: "#53716C" },
};

const Tenants = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const theme = useSelector((s) => s.theme.theme);
  const C = getPalette(theme === "dark");
  const { tenants, loading } = useSelector((s) => s.platform);

  useEffect(() => {
    dispatch(fetchTenants());
  }, [dispatch]);

  const handleToggleStatus = async (tenant) => {
    const action = tenant.status === "suspended" ? reactivateTenant : suspendTenant;
    const result = await dispatch(action(tenant.slug)).unwrap();
    if (!result.success) toast.error(result.message);
  };

  const handleImpersonate = async (tenant) => {
    const result = await dispatch(impersonateTenant(tenant.slug)).unwrap();
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    dispatch(startImpersonation({ token: result.token, user: result.admin, tenantName: result.tenant.name }));
    toast.success(`Impersonating ${tenant.name}`);
    navigate("/admin/dashboard", { replace: true });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.text }}>Tenants</h1>
          <p className="text-sm" style={{ color: C.muted }}>Every university on this platform</p>
        </div>
        <Link
          to="/platform/tenants/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: C.navy }}
        >
          <Plus className="w-4 h-4" /> New Tenant
        </Link>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: C.muted }}>Loading…</p>
      ) : tenants.length === 0 ? (
        <p className="text-sm" style={{ color: C.muted }}>No tenants yet.</p>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.surfaceAlt }}>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Name</th>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Slug</th>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Status</th>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Plan</th>
                <th className="text-right px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const statusStyle = STATUS_COLOR[tenant.status] || STATUS_COLOR.provisioning;
                return (
                  <tr key={tenant._id} className="border-t" style={{ borderColor: C.border }}>
                    <td className="px-4 py-3">
                      <Link to={`/platform/tenants/${tenant.slug}`} className="font-medium" style={{ color: C.text }}>
                        {tenant.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3" style={{ color: C.muted }}>{tenant.slug}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg }}>
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize" style={{ color: C.muted }}>{tenant.billing?.plan || "free"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/platform/tenants/${tenant.slug}`}
                          title="Edit this tenant"
                          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          <Pencil className="w-4 h-4" style={{ color: C.navy }} />
                        </Link>
                        <button
                          onClick={() => handleImpersonate(tenant)}
                          title="Impersonate this tenant's Administrator"
                          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                          disabled={tenant.status !== "active"}
                        >
                          <UserCog className="w-4 h-4" style={{ color: tenant.status === "active" ? C.navy : C.muted, opacity: tenant.status === "active" ? 1 : 0.4 }} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(tenant)}
                          title={tenant.status === "suspended" ? "Reactivate" : "Suspend"}
                          className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {tenant.status === "suspended" ? (
                            <PlayCircle className="w-4 h-4" style={{ color: C.green }} />
                          ) : (
                            <PauseCircle className="w-4 h-4" style={{ color: C.amber }} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Tenants;
