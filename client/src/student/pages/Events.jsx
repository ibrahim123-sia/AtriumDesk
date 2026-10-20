import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Calendar, Search, MapPin, Sparkles, UserCog } from "lucide-react";
import moment from "moment";
import { fetchEvents, fetchMatchedEvents } from "../../redux/slices/eventSlice";
import { getPalette } from "../../administrator/utils/palette";

const EventCard = ({ event, reasons, C }) => (
  <Link
    to={`/events/${event._id}`}
    className="p-5 rounded-xl border flex flex-col gap-2 transition-all hover:shadow-md"
    style={{ backgroundColor: C.surface, borderColor: C.border }}
  >
    <h3 className="font-semibold text-base" style={{ color: C.text }}>{event.title}</h3>
    <p className="text-xs" style={{ color: C.muted }}>{event.organization}</p>
    <p className="text-xs inline-flex items-center gap-1.5" style={{ color: C.navy }}>
      <Calendar className="w-3.5 h-3.5" /> {moment(event.date).format("MMM D, YYYY")}
    </p>
    {event.location && (
      <p className="text-xs inline-flex items-center gap-1.5" style={{ color: C.muted }}>
        <MapPin className="w-3.5 h-3.5" /> {event.location}
      </p>
    )}
    {event.description && <p className="text-sm line-clamp-2" style={{ color: C.text }}>{event.description}</p>}
    {reasons?.length > 0 && (
      <div className="flex flex-wrap gap-1.5 pt-1">
        {reasons.map((r) => (
          <span key={r} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${C.green}22`, color: C.green }}>
            {r}
          </span>
        ))}
      </div>
    )}
  </Link>
);

// Rev 5 §6.1/§6.4 — replaces the retired Apify LinkedIn-caption Events.jsx.
// Manual-entry only (no viable scrape source for MAJU's own events — see
// [[project_phase7_complete]] memory for the reality check that confirmed
// this). "Past events stay, in a separate tab" (§6.5) — the `when` toggle
// below drives that split server-side rather than a stored isPast flag.
const Events = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const { events, loading, matched, matchedLoading, matchedHasSignals } = useSelector((s) => s.event);
  const [search, setSearch] = useState("");
  const [when, setWhen] = useState("upcoming");
  const [view, setView] = useState("matched"); // "matched" | "browse" — §6.1: matched feed is primary
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  const C = getPalette(isDark, tenantBranding);
  const noMatches = view === "matched" && !matchedLoading && matched.length === 0;

  useEffect(() => {
    if (view !== "browse") return;
    // Debounced — only the settled search query should hit the server.
    const t = setTimeout(() => dispatch(fetchEvents({ when, search: search || undefined })), 300);
    return () => clearTimeout(t);
  }, [dispatch, when, search, view]);

  useEffect(() => {
    if (view === "matched") dispatch(fetchMatchedEvents());
  }, [dispatch, view]);

  // Nothing picked for this student: show what's coming up anyway rather
  // than an empty feed (Rev 5 §5.4 — show the value, then ask).
  useEffect(() => {
    if (noMatches) dispatch(fetchEvents({ when: "upcoming" }));
  }, [dispatch, noMatches]);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: C.text }}>Campus Events</h1>
            <p className="text-sm mt-1" style={{ color: C.muted }}>Seminars, workshops, and society activities</p>
          </div>
          <div className="inline-flex rounded-lg border p-1 self-start" style={{ borderColor: C.border }}>
            <button
              onClick={() => setView("matched")}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5"
              style={view === "matched" ? { backgroundColor: C.navy, color: "#fff" } : { color: C.muted }}
            >
              <Sparkles className="w-3.5 h-3.5" /> Matched for you
            </button>
            <button
              onClick={() => setView("browse")}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={view === "browse" ? { backgroundColor: C.navy, color: "#fff" } : { color: C.muted }}
            >
              Browse all
            </button>
          </div>
        </div>

        {view === "matched" ? (
          matchedLoading ? (
            <div className="text-center py-12 text-sm" style={{ color: C.muted }}>Finding events for you…</div>
          ) : matched.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {matched.map((m) => (
                <EventCard key={m.listing._id} event={m.listing} reasons={m.reasons} C={C} />
              ))}
            </div>
          ) : (
            <>
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border"
                style={{ borderColor: `${C.navy}55`, backgroundColor: `${C.navy}0D` }}
              >
                <p className="text-sm" style={{ color: C.text }}>
                  {matchedHasSignals
                    ? "Nothing coming up matches your interests yet — here's everything on the calendar."
                    : "Add your interests and societies to your profile and we'll pick events for you. Meanwhile, here's what's coming up."}
                </p>
                {!matchedHasSignals && (
                  <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium shrink-0" style={{ color: C.navy }}>
                    <UserCog className="w-4 h-4" /> Add interests
                  </Link>
                )}
              </div>
              {loading ? (
                <div className="text-center py-12 text-sm" style={{ color: C.muted }}>Loading…</div>
              ) : events.length === 0 ? (
                <div className="text-center py-16 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
                  <Calendar className="w-12 h-12 mx-auto mb-3" style={{ color: C.muted }} />
                  <p className="text-base font-medium" style={{ color: C.text }}>No upcoming events</p>
                  <p className="text-sm mt-1" style={{ color: C.muted }}>Check back soon, or ask your department rep.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {events.map((ev) => (
                    <EventCard key={ev._id} event={ev} C={C} />
                  ))}
                </div>
              )}
            </>
          )
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <div className="flex gap-2">
                {["upcoming", "past"].map((w) => (
                  <button
                    key={w}
                    onClick={() => setWhen(w)}
                    className="px-3 py-1.5 rounded-full text-sm border capitalize"
                    style={{
                      borderColor: when === w ? C.navy : C.border,
                      backgroundColor: when === w ? C.navy : "transparent",
                      color: when === w ? "#fff" : C.text,
                    }}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: C.muted }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search events..."
                  aria-label="Search events"
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none"
                  style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
                />
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12 text-sm" style={{ color: C.muted }}>Loading…</div>
            ) : events.length === 0 ? (
              <div className="text-center py-16 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
                <Calendar className="w-12 h-12 mx-auto mb-3" style={{ color: C.muted }} />
                <p className="text-base font-medium" style={{ color: C.text }}>No {when} events</p>
                <p className="text-sm mt-1" style={{ color: C.muted }}>Check back soon, or ask your department rep.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {events.map((ev) => (
                  <EventCard key={ev._id} event={ev} C={C} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Events;
