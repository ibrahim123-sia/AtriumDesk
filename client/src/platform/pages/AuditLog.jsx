import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import moment from "moment";
import { getPalette } from "../../administrator/utils/palette";
import { fetchAuditLogs } from "../../redux/slices/platformSlice";

const AuditLog = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const C = getPalette(theme === "dark");
  const logs = useSelector((s) => s.platform.auditLogs);

  useEffect(() => {
    dispatch(fetchAuditLogs());
  }, [dispatch]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: C.text }}>Platform Audit Log</h1>
        <p className="text-sm" style={{ color: C.muted }}>Every Super Admin write action (Rev7 §5.8)</p>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.surfaceAlt }}>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>When</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Actor</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Action</th>
              <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Target</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log._id} className="border-t" style={{ borderColor: C.border }}>
                <td className="px-4 py-3" style={{ color: C.muted }}>{moment(log.createdAt).format("MMM D, HH:mm")}</td>
                <td className="px-4 py-3" style={{ color: C.text }}>{log.actorEmail}</td>
                <td className="px-4 py-3" style={{ color: C.text }}>{log.action}</td>
                <td className="px-4 py-3" style={{ color: C.muted }}>{log.targetType} {log.targetId}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: C.muted }}>No audit entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditLog;
