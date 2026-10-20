// The SLA clock in working hours: how many hours between two instants fall
// on the university's working days, between its opening and closing hours,
// in its own time zone. Without libraries — Intl gives the zone's offset.

const DAY_MS = 24 * 60 * 60 * 1000;

const localParts = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
};

// The zone's UTC offset at `date`, in milliseconds.
const offsetMs = (date, timeZone) => {
  const p = localParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
};

// The instant at which the wall clock in `timeZone` shows y-m-d hh:00
// (hour 24 = the next midnight).
const zonedInstant = (year, month, day, hour, timeZone) => {
  const guess = Date.UTC(year, month - 1, day, hour);
  const first = guess - offsetMs(new Date(guess), timeZone);
  // A second pass settles days whose offset differs from the guess (DST).
  return guess - offsetMs(new Date(first), timeZone);
};

export const isValidTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

/**
 * Working hours between `from` and `to` (Dates). `config`: { days (0 = Sunday
 * … 6 = Saturday), startHour, endHour, timezone }.
 */
export function businessHoursBetween(from, to, config) {
  const { days = [1, 2, 3, 4, 5], startHour = 9, endHour = 17, timezone = "UTC" } = config || {};
  if (!(to > from) || !days.length || endHour <= startHour) return 0;
  const start = localParts(from, timezone);
  let cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  let total = 0;
  // An SLA is at most a few weeks; cap the walk at roughly two years.
  for (let i = 0; i < 800; i += 1) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    if (days.includes(cursor.getUTCDay())) {
      const open = zonedInstant(y, m, d, startHour, timezone);
      const close = zonedInstant(y, m, d, endHour, timezone);
      const s = Math.max(open, from.getTime());
      const e = Math.min(close, to.getTime());
      if (e > s) total += e - s;
    }
    if (zonedInstant(y, m, d, 24, timezone) >= to.getTime()) break;
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return total / (60 * 60 * 1000);
}
