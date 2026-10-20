import React, { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Ticket, Clock, MapPin, Users } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../utils/axios";
import { getPalette } from "../../administrator/utils/palette";

const POLL_MS = 15000;

const waitText = (minutes) => (minutes <= 0 ? "no wait" : minutes < 60 ? `about ${minutes} min` : `about ${Math.round(minutes / 60)} h`);

// Walk-in queues: join an office's line from the phone, see your place and
// a rough wait, and get told when it's your turn (in-app, email, push).
const Queue = () => {
  const token = useSelector((s) => s.auth.token);
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const [offices, setOffices] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [joining, setJoining] = useState(null); // department id with the reason box open
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const headers = { headers: { Authorization: token } };

  const load = useCallback(async () => {
    try {
      const auth = { headers: { Authorization: token } };
      const [d, m] = await Promise.all([axios.get("/api/queue/departments", auth), axios.get("/api/queue/mine", auth)]);
      setOffices(d.data.departments || []);
      setTickets(m.data.tickets || []);
    } catch {
      setOffices((o) => o || []);
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const active = tickets.find((t) => t.status === "waiting" || t.status === "called");

  const join = async (departmentId) => {
    setBusy(true);
    try {
      await axios.post("/api/queue/join", { departmentId, reason }, headers);
      toast.success("You're in the queue — we'll tell you when it's your turn");
      setJoining(null);
      setReason("");
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't join the queue");
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await axios.delete(`/api/queue/${active._id}`, headers);
      toast.success("You've left the queue");
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't leave the queue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Office queue</h1>
          <p className="text-sm mt-1" style={{ color: C.muted }}>
            Join an office's walk-in line from here instead of standing in it. We'll tell you when you're next and when
            it's your turn.
          </p>
        </div>

        {active && (
          <section
            className="p-6 rounded-xl border space-y-3"
            style={{ backgroundColor: C.surface, borderColor: active.status === "called" ? C.green : C.navy }}
            aria-live="polite"
          >
            <p className="text-xs font-semibold uppercase" style={{ color: C.muted }}>{active.department.name}</p>
            <p className="font-mono text-4xl font-bold tracking-wider" style={{ color: active.status === "called" ? C.green : C.navy }}>
              {active.label}
            </p>
            {active.status === "called" ? (
              <p className="text-lg font-semibold" style={{ color: C.text }}>
                It's your turn{active.counter ? ` — go to ${active.counter}` : " — please go to the counter"}.
              </p>
            ) : (
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-4 h-4" style={{ color: C.navy }} />
                  {active.ahead === 0 ? "You're next" : `${active.ahead} ahead of you`}
                </span>
                <span className="inline-flex items-center gap-1.5" style={{ color: C.muted }}>
                  <Clock className="w-4 h-4" /> {waitText(active.estimatedWaitMinutes)}
                </span>
              </div>
            )}
            {active.department.walkInNote && (
              <p className="text-sm flex items-center gap-1.5" style={{ color: C.muted }}>
                <MapPin className="w-4 h-4" /> {active.department.walkInNote}
              </p>
            )}
            <button
              type="button"
              onClick={leave}
              disabled={busy}
              className="px-4 py-2 rounded-lg border text-sm disabled:opacity-60"
              style={{ borderColor: C.border, color: C.text }}
            >
              Leave the queue
            </button>
          </section>
        )}

        {offices === null ? (
          <p className="text-sm" style={{ color: C.muted }}>Loading…</p>
        ) : offices.length === 0 ? (
          <div className="text-center py-12 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <Ticket className="w-10 h-10 mx-auto mb-2" style={{ color: C.muted }} />
            <p className="text-sm" style={{ color: C.muted }}>No office takes walk-ins through the app yet.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {offices.map((o) => (
              <li key={o._id} className="p-4 rounded-xl border space-y-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold">{o.name}</p>
                    {o.walkInNote && <p className="text-xs mt-0.5" style={{ color: C.muted }}>{o.walkInNote}</p>}
                  </div>
                  <span className="text-xs" style={{ color: o.open ? C.text : C.muted }}>
                    {o.open ? `${o.waiting} waiting · ${waitText(o.estimatedWaitMinutes)}` : "Closed right now"}
                  </span>
                </div>
                {o.open && !active && (
                  joining === o._id ? (
                    <div className="flex gap-2 flex-wrap">
                      <label htmlFor={`reason-${o._id}`} className="sr-only">What it's about (optional)</label>
                      <input
                        id={`reason-${o._id}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={200}
                        placeholder="What it's about (optional), e.g. fee challan"
                        className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-sm"
                        style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
                      />
                      <button
                        type="button"
                        onClick={() => join(o._id)}
                        disabled={busy}
                        className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                        style={{ backgroundColor: C.navy }}
                      >
                        Join the queue
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setJoining(o._id)}
                      className="px-4 py-2 rounded-lg border text-sm font-medium"
                      style={{ borderColor: C.navy, color: C.navy }}
                    >
                      Get in line
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Queue;
