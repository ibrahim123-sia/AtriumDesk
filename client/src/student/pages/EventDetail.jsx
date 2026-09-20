import React, { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ArrowLeft, MapPin, Calendar, ExternalLink } from "lucide-react";
import moment from "moment";
import { fetchEventById, clearSelectedEvent } from "../../redux/slices/eventSlice";
import { getPalette } from "../../administrator/utils/palette";

const EventDetail = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const event = useSelector((s) => s.event.selected);
  const theme = useSelector((s) => s.theme.theme);
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  const C = getPalette(isDark, tenantBranding);

  useEffect(() => {
    dispatch(fetchEventById(id));
    return () => dispatch(clearSelectedEvent());
  }, [dispatch, id]);

  if (!event) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: C.bg, color: C.muted }}>
        Loading…
      </div>
    );
  }

  const isPast = moment(event.date).isBefore(moment());

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

          {event.officialLink && (
            <div className="pt-3 border-t" style={{ borderColor: C.border }}>
              <a
                href={event.officialLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: C.navy }}
              >
                More details <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventDetail;
