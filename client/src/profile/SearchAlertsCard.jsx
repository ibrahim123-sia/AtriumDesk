import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { BellRing, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import moment from "moment";
import axios from "../utils/axios";

// The student's saved-search alerts (made with "Alert me" on the Jobs and
// Scholarships pages), with a way to remove them.
const SearchAlertsCard = ({ C }) => {
  const token = useSelector((s) => s.auth.token);
  const [searches, setSearches] = useState(null);

  useEffect(() => {
    axios
      .get("/api/saved-searches", { headers: { Authorization: token } })
      .then(({ data }) => setSearches(data.searches || []))
      .catch(() => setSearches([]));
  }, [token]);

  const remove = async (id) => {
    try {
      await axios.delete(`/api/saved-searches/${id}`, { headers: { Authorization: token } });
      setSearches((list) => list.filter((s) => s._id !== id));
      toast.success("Alert removed");
    } catch {
      toast.error("Couldn't remove the alert");
    }
  };

  return (
    <section className="p-6 rounded-xl border space-y-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
      <div className="flex items-center gap-2">
        <BellRing className="w-4 h-4" style={{ color: C.navy }} />
        <h2 className="text-base font-semibold">Search alerts</h2>
      </div>
      <p className="text-xs" style={{ color: C.muted }}>
        Use “Alert me about new matches” on the Jobs or Scholarships page; we check every morning and email you when
        something new matches.
      </p>
      {searches === null ? (
        <p className="text-xs" style={{ color: C.muted }}>Loading…</p>
      ) : searches.length === 0 ? (
        <p className="text-sm" style={{ color: C.muted }}>No alerts yet.</p>
      ) : (
        <ul className="divide-y text-sm" style={{ borderColor: C.border }}>
          {searches.map((s) => (
            <li key={s._id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate" style={{ color: C.text }}>{s.label}</p>
                <p className="text-xs" style={{ color: C.muted }}>Saved {moment(s.createdAt).fromNow()}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(s._id)}
                aria-label={`Remove alert ${s.label}`}
                className="p-1.5 rounded-lg border shrink-0"
                style={{ borderColor: C.border, color: C.muted }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default SearchAlertsCard;
