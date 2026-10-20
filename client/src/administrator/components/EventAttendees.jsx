import React, { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { CheckCircle2, UserCheck } from "lucide-react";
import toast from "react-hot-toast";
import moment from "moment";
import axios from "../../utils/axios";

// The attendee list of an event that takes RSVPs, with check-in at the
// door by the student's code (or a click).
const EventAttendees = ({ eventId, C }) => {
  const token = useSelector((s) => s.auth.token);
  const [data, setData] = useState(null);
  const [code, setCode] = useState("");
  const headers = { headers: { Authorization: token } };

  const load = useCallback(async () => {
    try {
      const { data: res } = await axios.get(`/api/admin/listings/${eventId}/rsvps`, { headers: { Authorization: token } });
      if (res.success) setData(res);
    } catch {
      toast.error("Couldn't load attendees");
    }
  }, [eventId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const checkIn = async (body) => {
    try {
      const { data: res } = await axios.post(`/api/admin/listings/${eventId}/rsvps/check-in`, body, headers);
      toast.success(res.already ? `${res.attendee.userName} was already checked in` : `${res.attendee.userName} checked in`);
      setCode("");
      load();
    } catch (error) {
      toast.error(error.response?.data?.message || "Check-in failed");
    }
  };

  if (!data) return <p className="text-xs" style={{ color: C.muted }}>Loading attendees…</p>;
  return (
    <section className="space-y-3 pt-3 border-t" style={{ borderColor: C.border }}>
      <p className="text-xs font-semibold uppercase" style={{ color: C.muted }}>
        Attendees — {data.going}{data.capacity ? ` / ${data.capacity}` : ""} going · {data.checkedIn} checked in
        {data.waitlist ? ` · ${data.waitlist} waitlisted` : ""}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) checkIn({ code: code.trim() });
        }}
        className="flex gap-2"
      >
        <label htmlFor="checkin-code" className="sr-only">Check-in code</label>
        <input
          id="checkin-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="Code from the student's screen"
          className="flex-1 px-3 py-2 rounded-lg border text-sm font-mono tracking-widest"
          style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
        />
        <button type="submit" className="px-3 py-2 rounded-lg text-white text-sm font-medium inline-flex items-center gap-1" style={{ backgroundColor: C.navy }}>
          <UserCheck className="w-4 h-4" /> Check in
        </button>
      </form>
      {data.rsvps.length === 0 ? (
        <p className="text-xs" style={{ color: C.muted }}>No RSVPs yet.</p>
      ) : (
        <ul className="divide-y text-sm" style={{ borderColor: C.border }}>
          {data.rsvps.map((r) => (
            <li key={r._id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate" style={{ color: C.text }}>{r.userName}</p>
                <p className="text-xs truncate" style={{ color: C.muted }}>
                  {r.userEmail} · {r.status === "waitlist" ? "waitlist" : r.code} · {moment(r.createdAt).fromNow()}
                </p>
              </div>
              {r.status === "going" &&
                (r.checkedInAt ? (
                  <span className="text-xs inline-flex items-center gap-1 shrink-0" style={{ color: C.green }}>
                    <CheckCircle2 className="w-4 h-4" /> {moment(r.checkedInAt).format("h:mm A")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => checkIn({ rsvpId: r._id })}
                    className="text-xs px-2.5 py-1 rounded-full border shrink-0"
                    style={{ borderColor: C.border, color: C.text }}
                  >
                    Check in
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default EventAttendees;
