import React from "react";
import { CalendarPlus, Share2 } from "lucide-react";
import moment from "moment";

// WhatsApp is where students share opportunities (Pakistan's most-used
// app); a wa.me link needs no API key or phone number.
export const WhatsAppShare = ({ title, C }) => {
  const text = `${title}\n${window.location.href}`;
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium"
      style={{ borderColor: C.border, color: C.text }}
    >
      <Share2 className="w-4 h-4" /> Share on WhatsApp
    </a>
  );
};

const icsEscape = (value) => String(value || "").replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");

// Event dates are stored without a time, so calendar entries are all-day.
const dayStamp = (date) => moment(date).format("YYYYMMDD");

const downloadIcs = (event) => {
  const start = dayStamp(event.date);
  const end = moment(event.date).add(1, "day").format("YYYYMMDD");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AtriumDesk//Events//EN",
    "BEGIN:VEVENT",
    `UID:${event._id}@atriumdesk`,
    `DTSTAMP:${moment.utc().format("YYYYMMDDTHHmmss")}Z`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${icsEscape(event.title)}`,
    `DESCRIPTION:${icsEscape(`${event.description || ""}\n${window.location.href}`)}`,
    event.location ? `LOCATION:${icsEscape(event.location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/[^\w-]+/g, "_").slice(0, 60) || "event"}.ics`;
  a.click();
  URL.revokeObjectURL(url);
};

export const AddToCalendar = ({ event, C }) => {
  const google = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${dayStamp(event.date)}/${moment(event.date).add(1, "day").format("YYYYMMDD")}`,
    details: `${event.description || ""}\n${window.location.href}`,
    location: event.location || "",
  });
  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <a
        href={`https://calendar.google.com/calendar/render?${google.toString()}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium"
        style={{ borderColor: C.border, color: C.text }}
      >
        <CalendarPlus className="w-4 h-4" /> Google Calendar
      </a>
      <button
        type="button"
        onClick={() => downloadIcs(event)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium"
        style={{ borderColor: C.border, color: C.text }}
      >
        <CalendarPlus className="w-4 h-4" /> .ics file
      </button>
    </div>
  );
};
