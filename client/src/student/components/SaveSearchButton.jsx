import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Bell, BellRing } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../utils/axios";

// "Alert me": saves the current browse filters; a daily check emails the
// student when new listings match them. Alerts are managed in the profile.
const SaveSearchButton = ({ listingType, filters, C }) => {
  const token = useSelector((s) => s.auth.token);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(filters);
  const empty = !Object.values(filters).some((v) => v !== undefined && v !== "" && v !== false);

  useEffect(() => {
    setSaved(false);
  }, [key]);

  const save = async () => {
    if (saved) return;
    setBusy(true);
    try {
      const { data } = await axios.post("/api/saved-searches", { listingType, filters }, { headers: { Authorization: token } });
      setSaved(true);
      toast.success(data.already ? "You already have this alert" : "Alert saved — we'll email you when something new matches");
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't save the alert");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={save}
      disabled={busy || empty}
      aria-pressed={saved}
      title={empty ? "Search or pick a filter first" : undefined}
      className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-lg border disabled:opacity-60"
      style={{ borderColor: C.border, color: saved ? C.navy : C.text, backgroundColor: C.surface }}
    >
      {saved ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      {saved ? "Alert on" : "Alert me about new matches"}
    </button>
  );
};

export default SaveSearchButton;
