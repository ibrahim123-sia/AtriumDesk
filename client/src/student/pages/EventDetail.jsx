import React, { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ArrowLeft, MapPin, Calendar, ExternalLink, Bell, BellRing, Ticket, Users } from "lucide-react";
import toast from "react-hot-toast";
import moment from "moment";
import { fetchEventById, clearSelectedEvent, fetchMyRsvp, rsvpToEvent, cancelEventRsvp } from "../../redux/slices/eventSlice";
import { fetchSaved, saveListing, unsaveListing } from "../../redux/slices/savedSlice";
import { getPalette } from "../../administrator/utils/palette";
import { DetailUnavailable, DetailLoading } from "../components/DetailStates";
import { AddToCalendar, WhatsAppShare } from "../components/ShareActions";

// RSVP for a place: going (with a check-in code for the door), on the
// waitlist (with position), or not yet — and the event's numbers.
const RsvpCard = ({ event, rsvp, isPast, C }) => {
  const dispatch = useDispatch();
  const [busy, setBusy] = React.useState(false);
  const full = rsvp.capacity && rsvp.going >= rsvp.capacity;

  const act = async (thunk, okMessage) => {
    setBusy(true);
    const result = await dispatch(thunk(event._id)).unwrap();
    setBusy(false);
    if (!result.success) return toast.error(result.message);
    dispatch(fetchSaved()); // going also turns the reminder on
    if (okMessage) toast.success(okMessage(result.rsvp));
  };

  return (
    <div className="p-6 rounded-xl border space-y-3" style={{ backgroundColor: C.surface, borderColor: C.border }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold inline-flex items-center gap-2">
          <Ticket className="w-4 h-4" style={{ color: C.navy }} /> RSVP
        </h2>
        <span className="text-xs inline-flex items-center gap-1" style={{ color: C.muted }}>
          <Users className="w-3.5 h-3.5" />
          {rsvp.capacity ? `${rsvp.going} / ${rsvp.capacity} places taken` : `${rsvp.going} going`}
          {rsvp.waitlist > 0 && ` · ${rsvp.waitlist} on the waitlist`}
        </span>
      </div>

      {rsvp.status === "going" ? (
        <>
          <p className="text-sm" style={{ color: C.text }}>
            {rsvp.checkedIn ? "You're checked in — enjoy the event." : "You have a place. Show this code at the door:"}
          </p>
          {!rsvp.checkedIn && (
            <p
              className="font-mono text-3xl font-bold tracking-[0.3em] px-4 py-3 rounded-lg inline-block"
              style={{ backgroundColor: `${C.navy}12`, color: C.navy }}
              aria-label={`Check-in code ${rsvp.code.split("").join(" ")}`}
            >
              {rsvp.code}
            </p>
          )}
        </>
      ) : rsvp.status === "waitlist" ? (
        <p className="text-sm" style={{ color: C.text }}>
          The event is full — you're <strong>#{rsvp.waitlistPosition}</strong> on the waitlist. If a place opens up you'll
          get it automatically and we'll let you know.
        </p>
      ) : (
        <p className="text-sm" style={{ color: C.muted }}>
          {isPast ? "This event has happened." : full ? "All places are taken — you can join the waitlist." : "Let the organisers know you're coming."}
        </p>
      )}

      {!isPast && (
        <div className="flex gap-2 flex-wrap">
          {!rsvp.status ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(rsvpToEvent, (r) => (r?.status === "waitlist" ? "You're on the waitlist" : "You're going — see you there"))}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: C.navy }}
            >
              {full ? "Join the waitlist" : "I'm going"}
            </button>
          ) : (
            !rsvp.checkedIn && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act(cancelEventRsvp, () => "Cancelled — your place goes to the next person")}
                className="px-4 py-2 rounded-lg border text-sm disabled:opacity-60"
                style={{ borderColor: C.border, color: C.text }}
              >
                {rsvp.status === "waitlist" ? "Leave the waitlist" : "I can't make it"}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};

const EventDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const event = useSelector((s) => s.event.selected);
  const detailError = useSelector((s) => s.event.detailError);
  const savedIds = useSelector((s) => s.saved.savedIds);
  const rsvp = useSelector((s) => s.event.rsvp);
  const theme = useSelector((s) => s.theme.theme);
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  const C = getPalette(isDark, tenantBranding);

  useEffect(() => {
    dispatch(fetchEventById(id));
    dispatch(fetchMyRsvp(id));
    dispatch(fetchSaved());
    return () => dispatch(clearSelectedEvent());
  }, [dispatch, id]);

  if (detailError) return <DetailUnavailable message={detailError} backTo="/events" backLabel="Back to events" C={C} />;
  if (!event) return <DetailLoading C={C} />;

  // An event is "past" once its day is over, not from the moment it starts.
  const isPast = moment(event.date).isBefore(moment().startOf("day"));
  const isSaved = savedIds.includes(event._id);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-5">
        <Link to="/events" className="inline-flex items-center gap-1.5 text-sm" style={{ color: C.muted }}>
          <ArrowLeft className="w-4 h-4" /> Back to events
        </Link>

        <div className="p-6 rounded-xl border space-y-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">{event.title}</h1>
              <p className="text-sm mt-1" style={{ color: C.muted }}>{event.organization}</p>
            </div>
            {isPast && (
              <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ backgroundColor: `${C.muted}1A`, color: C.muted }}>
                Past event
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5" style={{ color: C.navy }}>
              <Calendar className="w-4 h-4" /> {moment(event.date).format("dddd, MMM D, YYYY")}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5" style={{ color: C.muted }}>
                <MapPin className="w-4 h-4" /> {event.location}
              </span>
            )}
          </div>

          {event.description && (
            <p className="text-sm whitespace-pre-wrap pt-2 border-t" style={{ color: C.text, borderColor: C.border }}>
              {event.description}
            </p>
          )}

          <div className="pt-3 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: C.border }}>
            {!isPast && (
              <button
                type="button"
                onClick={() => dispatch(isSaved ? unsaveListing(event._id) : saveListing(event._id))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium"
                style={{ borderColor: C.border, color: isSaved ? C.navy : C.text }}
                aria-pressed={isSaved}
              >
                {isSaved ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                {isSaved ? "Reminder on" : "Remind me"}
              </button>
            )}
            {!isPast && <AddToCalendar event={event} C={C} />}
            <WhatsAppShare title={`${event.title} — ${moment(event.date).format("MMM D")}`} C={C} />
            {event.officialLink && (
              <a
                href={event.officialLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: C.navy }}
              >
                More details <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          {isSaved && !isPast && (
            <p className="text-xs" style={{ color: C.muted }}>We'll remind you the day before.</p>
          )}
        </div>

        {event.rsvpEnabled && rsvp && (
          <RsvpCard event={event} rsvp={rsvp} isPast={isPast} C={C} />
        )}
      </div>
    </div>
  );
};

export default EventDetail;
