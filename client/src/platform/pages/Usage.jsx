import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchUsage } from "../../redux/slices/platformSlice";
import { getPalette } from "../../administrator/utils/palette";

const RANGE_OPTIONS = [7, 30, 90];

// Cross-tenant AI request/token comparison — real usage from AiUsageLog
// (one row per LLM completion actually made), not a message-count proxy.
const Usage = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const C = getPalette(theme === "dark");
  const { usage, usageLoading, usageError } = useSelector((s) => s.platform);
  const [days, setDays] = useState(30);

  useEffect(() => {
    dispatch(fetchUsage(days));
  }, [dispatch, days]);

  const tenants = usage?.tenants || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.text }}>AI Usage</h1>
          <p className="text-sm" style={{ color: C.muted }}>LLM requests and tokens per tenant</p>
        </div>
        <div className="inline-flex rounded-lg border p-1 self-start" style={{ borderColor: C.border }}>
          {RANGE_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={days === d ? { backgroundColor: C.navy, color: "#fff" } : { color: C.muted }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.surfaceAlt }}>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Tenant</th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Requests</th>
              <th className="text-right px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Tokens</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>By provider</th>
            </tr>
          </thead>
          <tbody>
            {usageLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center" style={{ color: C.muted }}>
                  Loading usage…
                </td>
              </tr>
            )}
            {!usageLoading && usageError && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center" style={{ color: C.red }}>
                  {usageError}
                </td>
              </tr>
            )}
            {!usageLoading && !usageError && tenants.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center" style={{ color: C.muted }}>
                  No AI usage recorded yet in this window.
                </td>
              </tr>
            )}
            {!usageLoading && !usageError && tenants.map((t) => (
              <tr key={t.slug} className="border-t" style={{ borderColor: C.border }}>
                <td className="px-4 py-3 font-medium" style={{ color: C.text }}>{t.name}</td>
                <td className="px-4 py-3 text-right" style={{ color: C.text }}>{t.totalRequests}</td>
                <td className="px-4 py-3 text-right" style={{ color: C.text }}>{t.totalTokens.toLocaleString()}</td>
                <td className="px-4 py-3" style={{ color: C.muted }}>
                  {t.byProvider.length === 0
                    ? "—"
                    : t.byProvider.map((p) => `${p._id || "unknown"}: ${p.requests}`).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Usage;
