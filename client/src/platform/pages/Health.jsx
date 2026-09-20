import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CheckCircle2, XCircle } from "lucide-react";
import { getPalette } from "../../administrator/utils/palette";
import { fetchPlatformHealth } from "../../redux/slices/platformSlice";

// Rev7 §5/T2+T3 — cross-tenant health dashboard, aggregating each tenant's
// own per-source health (Rev 5 §9.4) one level up.
const Health = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const C = getPalette(theme === "dark");
  const health = useSelector((s) => s.platform.health);

  useEffect(() => {
    dispatch(fetchPlatformHealth());
  }, [dispatch]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: C.text }}>Platform Health</h1>
        <p className="text-sm" style={{ color: C.muted }}>Database reachability and source health across every tenant</p>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.surfaceAlt }}>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Tenant</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Status</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Database</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Sources</th>
            </tr>
          </thead>
          <tbody>
            {health.map((row) => (
              <tr key={row.slug} className="border-t" style={{ borderColor: C.border }}>
                <td className="px-4 py-3 font-medium" style={{ color: C.text }}>{row.name}</td>
                <td className="px-4 py-3" style={{ color: C.muted }}>{row.status}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5" style={{ color: row.dbReachable ? C.green : C.red }}>
                    {row.dbReachable ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {row.dbReachable ? "reachable" : row.dbError}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: C.muted }}>
                  {row.sources.total} total
                  {row.sources.failing > 0 && (
                    <span className="ml-2" style={{ color: C.amber }}>· {row.sources.failing} failing</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Health;
