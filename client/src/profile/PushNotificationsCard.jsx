import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { BellRing } from "lucide-react";
import toast from "react-hot-toast";
import { pushState, enablePush, disablePush, sendTestPush } from "../utils/push";

const NOTES = {
  unsupported: "This browser can't show notifications from websites.",
  unavailable: "Browser notifications work in the installed app (or the site in a normal browser tab) once your university has them set up.",
  denied: "Notifications are blocked for this site — allow them in your browser's site settings, then come back here.",
};

// Browser notifications on this device: replies, reminders and alerts show
// up even when the app is closed.
const PushNotificationsCard = ({ C }) => {
  const token = useSelector((s) => s.auth.token);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState(token).then(setState).catch(() => setState("unavailable"));
  }, [token]);

  const toggle = async () => {
    setBusy(true);
    try {
      if (state === "on") {
        await disablePush(token);
        setState("off");
        toast.success("Notifications off on this device");
      } else {
        await enablePush(token);
        setState("on");
        toast.success("Notifications on for this device");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Couldn't change notifications");
      pushState(token).then(setState).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      const { data } = await sendTestPush(token);
      toast.success(data.reached ? "Sent — it should appear in a moment" : "No device reached — try turning notifications off and on");
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't send a test");
    }
  };

  return (
    <section className="p-6 rounded-xl border space-y-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
      <div className="flex items-center gap-2">
        <BellRing className="w-4 h-4" style={{ color: C.navy }} />
        <h2 className="text-base font-semibold">Browser notifications</h2>
      </div>
      <p className="text-xs" style={{ color: C.muted }}>
        Get replies, reminders and alerts on this device even when the app is closed. Turn it on separately on each
        phone or computer you use.
      </p>
      {state === null ? (
        <p className="text-xs" style={{ color: C.muted }}>Checking…</p>
      ) : NOTES[state] ? (
        <p className="text-sm" style={{ color: C.muted }}>{NOTES[state]}</p>
      ) : (
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            aria-pressed={state === "on"}
            className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
            style={state === "on" ? { border: `1px solid ${C.border}`, color: C.text } : { backgroundColor: C.navy, color: "#fff" }}
          >
            {state === "on" ? "Turn off on this device" : "Turn on for this device"}
          </button>
          {state === "on" && (
            <button type="button" onClick={test} className="px-4 py-2 rounded-lg border text-sm" style={{ borderColor: C.border, color: C.text }}>
              Send a test
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default PushNotificationsCard;
