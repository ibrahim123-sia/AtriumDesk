import React, { useEffect, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { CheckCircle2, XCircle, RefreshCw, Database, Bot, HardDrive, MessageCircle, AlertTriangle } from "lucide-react";
import axios from "../../utils/axios";
import { getPalette } from "../utils/palette";

// Rev5 §13.2 — "System health / pre-demo check. One admin screen pinging
// every external dependency — LLM providers, Mongo, ChromaDB — with
// green/red status." Meant to be run right before a demo/exam, so it's a
// single manual refresh, not a poller.
const ROWS = [
  { key: "mongo", label: "MongoDB", icon: Database },
  { key: "chroma", label: "ChromaDB", icon: HardDrive },
  { key: "llm", label: "LLM Provider", icon: Bot },
];

const Health = () => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const token = useSelector((s) => s.auth.token);
  const C = getPalette(theme === "dark", tenantBranding);

  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/admin/health", { headers: { Authorization: token } });
      if (data.success) setHealth(data.health);
      setCheckedAt(new Date());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.text }}>System Health</h1>
          <p className="text-sm" style={{ color: C.muted }}>
            {checkedAt ? `Last checked ${checkedAt.toLocaleTimeString()}` : "Checking…"}
          </p>
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
          style={{ backgroundColor: C.navy }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Re-check
        </button>
      </div>

      <div className="rounded-xl border divide-y" style={{ backgroundColor: C.surface, borderColor: C.border }}>
        {ROWS.map(({ key, label, icon }) => {
          const Icon = icon;
          const row = health?.[key];
          const ok = row?.reachable === true;
          return (
            <div key={key} className="flex items-center justify-between p-4" style={{ borderColor: C.border }}>
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4" style={{ color: C.muted }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: C.text }}>{label}</p>
                  {row?.provider && (
                    <p className="text-xs" style={{ color: C.muted }}>{row.provider} · {row.model}</p>
                  )}
                  {row?.collection && (
                    <p className="text-xs" style={{ color: C.muted }}>{row.collection} · {row.chunkCount} chunks</p>
                  )}
                  {!ok && row?.error && (
                    <p className="text-xs" style={{ color: C.red }}>{row.error}</p>
                  )}
                </div>
              </div>
              {loading && !health ? (
                <span className="inline-block w-16 h-5 rounded animate-pulse" style={{ backgroundColor: C.surfaceAlt }} />
              ) : ok ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.green }}>
                  <CheckCircle2 className="w-4 h-4" /> Reachable
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.red }}>
                  <XCircle className="w-4 h-4" /> Unreachable
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Rev5 §19.6 — "guest chat included in the health-check page so
          quota exhaustion is visible before it becomes a support problem." */}
      <div className="rounded-xl border p-4 space-y-2" style={{ backgroundColor: C.surface, borderColor: C.border }}>
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4" style={{ color: C.muted }} />
          <p className="text-sm font-medium" style={{ color: C.text }}>Guest Chat</p>
        </div>
        {health?.guestChat ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold" style={{ color: C.text }}>{health.guestChat.activeSessions}</p>
              <p className="text-xs" style={{ color: C.muted }}>Active sessions</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: health.guestChat.rateLimitedCount > 0 ? C.amber : C.text }}>
                {health.guestChat.rateLimitedCount}
              </p>
              <p className="text-xs" style={{ color: C.muted }}>Rate-limited (since restart)</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: health.guestChat.sessionCapReachedCount > 0 ? C.amber : C.text }}>
                {health.guestChat.sessionCapReachedCount}
              </p>
              <p className="text-xs" style={{ color: C.muted }}>Session cap hit</p>
            </div>
          </div>
        ) : (
          <span className="inline-block w-full h-10 rounded animate-pulse" style={{ backgroundColor: C.surfaceAlt }} />
        )}
        {health?.guestChat?.rateLimitedCount > 20 && (
          <p className="text-xs inline-flex items-center gap-1.5 pt-1" style={{ color: C.amber }}>
            <AlertTriangle className="w-3.5 h-3.5" /> High rate-limit volume — check the LLM provider's quota before a demo.
          </p>
        )}
      </div>
    </div>
  );
};

export default Health;
