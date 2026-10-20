import React, { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { BellRing, Check, UserX, Megaphone } from "lucide-react";
import toast from "react-hot-toast";
import moment from "moment";
import axios from "../../utils/axios";
import { getPalette } from "../../administrator/utils/palette";

const POLL_MS = 10000;
const COUNTER_KEY = "queueCounter";

const readCounter = () => {
  try {
    return localStorage.getItem(COUNTER_KEY) || "";
  } catch {
    return "";
  }
};

// The department's walk-in queue: open/close it, call the next student
// (they're told it's their turn), and mark them served or a no-show.
const StaffQueue = () => {
  const token = useSelector((s) => s.auth.token);
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const [data, setData] = useState(null);
  const [counter, setCounter] = useState(readCounter);
  const [busy, setBusy] = useState(false);
  const headers = { headers: { Authorization: token } };

  const load = useCallback(async () => {
    try {
      const { data: res } = await axios.get("/api/queue/department", { headers: { Authorization: token } });
      setData(res);
    } catch (error) {
      setData((d) => d || { error: error.response?.data?.message || "Couldn't load the queue" });
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const post = async (url, body, ok) => {
    setBusy(true);
    try {
      const { data: res } = await axios.post(url, body, headers);
      if (ok) ok(res);
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const saveCounter = (value) => {
    setCounter(value);
    try {
      localStorage.setItem(COUNTER_KEY, value);
    } catch {
      /* per-device convenience only */
    }
  };

  if (!data) return <div className="p-8 text-sm" style={{ color: C.muted }}>Loading…</div>;
  if (data.error) return <div className="p-8 text-sm" style={{ color: C.red }}>{data.error}</div>;
  const { department, waiting, called, stats } = data;

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Walk-in queue</h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              {department.name} · {stats.served} served today
              {stats.avgWaitMinutes !== null ? ` · average wait ${stats.avgWaitMinutes} min` : ""}
              {stats.noShow ? ` · ${stats.noShow} no-show` : ""}
            </p>
          </div>
          {department.walkInEnabled && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                post("/api/queue/department/open", { open: !department.walkInOpen }, (r) =>
                  toast.success(r.walkInOpen ? "Queue open — students can join" : "Queue closed — no new students can join")
                )
              }
              className="px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-60"
              style={{ borderColor: department.walkInOpen ? C.border : C.green, color: department.walkInOpen ? C.text : C.green }}
            >
              {department.walkInOpen ? "Close the queue" : "Open the queue"}
            </button>
          )}
        </header>

        {!department.walkInEnabled ? (
          <p className="p-6 rounded-xl border text-sm" style={{ backgroundColor: C.surface, borderColor: C.border, color: C.muted }}>
            Your department doesn't take walk-ins through the app. An Administrator can turn it on in Departments.
          </p>
        ) : (
          <>
            <section className="p-5 rounded-xl border flex flex-wrap items-end gap-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
              <div>
                <label htmlFor="queue-counter" className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
                  Your counter (told to the student)
                </label>
                <input
                  id="queue-counter"
                  value={counter}
                  onChange={(e) => saveCounter(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. Counter 2"
                  className="px-3 py-2 rounded-lg border text-sm"
                  style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                />
              </div>
              <button
                type="button"
                disabled={busy || waiting.length === 0}
                onClick={() =>
                  post("/api/queue/department/call-next", { counter }, (r) =>
                    r.ticket ? toast.success(`Called ${r.ticket.label} — ${r.ticket.studentName}`) : toast("Nobody is waiting")
                  )
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: C.navy }}
              >
                <Megaphone className="w-4 h-4" /> Call next{waiting.length ? ` (${waiting[0].label})` : ""}
              </button>
              <span className="text-sm" style={{ color: C.muted }}>{waiting.length} waiting</span>
            </section>

            {called.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold uppercase" style={{ color: C.muted }}>Being served</h2>
                <ul className="space-y-2">
                  {called.map((t) => (
                    <li key={t._id} className="p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          <span className="font-mono mr-2" style={{ color: C.navy }}>{t.label}</span>
                          {t.studentName}
                        </p>
                        <p className="text-xs" style={{ color: C.muted }}>
                          {t.reason ? `${t.reason} · ` : ""}called {moment(t.calledAt).fromNow()}{t.counter ? ` to ${t.counter}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" disabled={busy} onClick={() => post(`/api/queue/department/tickets/${t._id}/served`, {})} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-xs font-medium" style={{ backgroundColor: C.green }}>
                          <Check className="w-3.5 h-3.5" /> Served
                        </button>
                        <button type="button" disabled={busy} onClick={() => post(`/api/queue/department/tickets/${t._id}/recall`, {}, () => toast.success("Told them again"))} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: C.border, color: C.text }}>
                          <BellRing className="w-3.5 h-3.5" /> Call again
                        </button>
                        <button type="button" disabled={busy} onClick={() => post(`/api/queue/department/tickets/${t._id}/no-show`, {})} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: C.border, color: C.muted }}>
                          <UserX className="w-3.5 h-3.5" /> No-show
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase" style={{ color: C.muted }}>Waiting</h2>
              {waiting.length === 0 ? (
                <p className="text-sm" style={{ color: C.muted }}>
                  {department.walkInOpen ? "Nobody is waiting." : "The queue is closed — open it to let students join."}
                </p>
              ) : (
                <ol className="divide-y rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                  {waiting.map((t) => (
                    <li key={t._id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-mono mr-2" style={{ color: C.navy }}>{t.label}</span>
                        {t.studentName}
                        {t.reason && <span style={{ color: C.muted }}> — {t.reason}</span>}
                      </span>
                      <span className="text-xs shrink-0" style={{ color: C.muted }}>joined {moment(t.createdAt).format("h:mm A")}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default StaffQueue;
