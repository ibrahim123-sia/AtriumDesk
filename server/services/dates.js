// Deadlines and event dates entered without a time are stored as midnight
// UTC. "Has it passed?" compares against the start of today in the server's
// time zone (TZ — Asia/Karachi on Cloudflare), so an event or a deadline
// stays current for the whole of its day instead of lapsing at 05:00
// Pakistan time.
export const startOfToday = (now = new Date()) => {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
};

// The calendar date (YYYY-MM-DD) in the university's time zone — e.g. which
// day a walk-in queue ticket belongs to. An unknown zone falls back to the
// server's own.
export const localDayKey = (date = new Date(), timeZone) => {
  const format = (zone) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  try {
    return format(timeZone || undefined);
  } catch {
    return format(undefined);
  }
};
