import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Bookmark, Clock, FileCheck2, StickyNote } from "lucide-react";
import moment from "moment";
import toast from "react-hot-toast";
import { fetchSaved, updateSaved, unsaveListing } from "../../redux/slices/savedSlice";
import { statusLabels } from "../applicationStatus";
import { getPalette } from "../../administrator/utils/palette";

const TYPE_TABS = [
  { key: "all", label: "All" },
  { key: "scholarship", label: "Scholarships" },
  { key: "job", label: "Jobs" },
  { key: "event", label: "Events" },
];

const PATH_FOR_TYPE = { scholarship: "scholarships", job: "jobs", event: "events" };
const OPEN = ["saved", "preparing"];

const deadlineText = (listing) => {
  const when = listing.listingType === "event" ? listing.date : listing.deadline;
  if (!when) return null;
  const days = moment(when).startOf("day").diff(moment().startOf("day"), "days");
  if (listing.listingType === "event") {
    if (days < 0) return { text: `Was on ${moment(when).format("MMM D")}`, urgent: false };
    if (days === 0) return { text: "Today", urgent: true };
    return { text: days === 1 ? "Tomorrow" : `In ${days} days — ${moment(when).format("MMM D")}`, urgent: days <= 2 };
  }
  if (days < 0) return { text: `Closed ${moment(when).format("MMM D")}`, urgent: false };
  if (days === 0) return { text: "Closes today", urgent: true };
  return { text: `Closes in ${days} day${days === 1 ? "" : "s"} — ${moment(when).format("MMM D")}`, urgent: days <= 7 };
};

// Rev 5 §6.1 — saved items and the student's own application tracker in
// one list: where they are with each one, what's due soon, and items that
// have closed or been withdrawn by the source (§6.5 — kept, with a badge).
const Saved = () => {
  const dispatch = useDispatch();
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const { saved, loading } = useSelector((s) => s.saved);
  const enabled = tenantBranding?.enabledFeatures || {};
  const [type, setType] = useState("all");
  const C = getPalette(theme === "dark", tenantBranding);

  useEffect(() => {
    dispatch(fetchSaved());
  }, [dispatch]);

  const tabs = TYPE_TABS.filter((t) => t.key === "all" || enabled[PATH_FOR_TYPE[t.key]] !== false);
  const items = saved.filter((s) => type === "all" || s.listing.listingType === type);
  // Open items with a near deadline first, then everything else newest first.
  const sorted = [...items].sort((a, b) => {
    const da = a.listing.deadline || a.listing.date;
    const db = b.listing.deadline || b.listing.date;
    const aOpen = OPEN.includes(a.status) && a.listing.status === "approved" && da;
    const bOpen = OPEN.includes(b.status) && b.listing.status === "approved" && db;
    if (aOpen && bOpen) return new Date(da) - new Date(db);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const setStatus = async (item, status) => {
    const result = await dispatch(updateSaved({ listingId: item.listing._id, status })).unwrap();
    if (!result.success) toast.error(result.message || "Couldn't update");
  };

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: C.bg, color: C.text }}>
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Saved & applications</h1>
          <p className="text-sm mt-1" style={{ color: C.muted }}>
            Everything you saved, where you are with each application, and what's due soon.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className="px-3 py-1.5 rounded-full text-sm border"
              style={{
                borderColor: type === t.key ? C.navy : C.border,
                backgroundColor: type === t.key ? C.navy : "transparent",
                color: type === t.key ? "#fff" : C.text,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && !saved.length ? (
          <div className="text-center py-12 text-sm" style={{ color: C.muted }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 rounded-xl border" style={{ borderColor: C.border, backgroundColor: C.surface }}>
            <Bookmark className="w-10 h-10 mx-auto mb-3" style={{ color: C.muted }} />
            <p className="text-base font-medium">Nothing saved yet</p>
            <p className="text-sm mt-1" style={{ color: C.muted }}>
              Tap the bookmark on a scholarship, job or event to keep it here and get reminders.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {sorted.map((item) => {
              const { listing } = item;
              const labels = statusLabels(listing.listingType);
              const due = deadlineText(listing);
              const docs = listing.requiredDocuments || [];
              const closed = listing.status !== "approved";
              return (
                <li key={item.savedId} className="p-4 rounded-xl border" style={{ backgroundColor: C.surface, borderColor: C.border }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <Link
                        to={`/${PATH_FOR_TYPE[listing.listingType]}/${listing._id}`}
                        className="font-semibold hover:underline"
                        style={{ color: C.text }}
                      >
                        {listing.title}
                      </Link>
                      <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                        {listing.organization} · {listing.listingType}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {closed && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ backgroundColor: `${C.red}1A`, color: C.red }}>
                          {listing.status === "delisted" ? "Removed by source" : "Closed"}
                        </span>
                      )}
                      {listing.listingType !== "event" && (
                        <select
                          value={item.status}
                          onChange={(e) => setStatus(item, e.target.value)}
                          aria-label={`Application status for ${listing.title}`}
                          className="px-2 py-1 rounded-lg border text-xs"
                          style={{ backgroundColor: C.input || C.surface, borderColor: C.border, color: C.text }}
                        >
                          {Object.entries(labels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => dispatch(unsaveListing(listing._id))}
                        className="text-xs px-2 py-1 rounded-lg border"
                        style={{ borderColor: C.border, color: C.muted }}
                        aria-label={`Remove ${listing.title} from saved`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap mt-2 text-xs" style={{ color: C.muted }}>
                    {due && (
                      <span className="inline-flex items-center gap-1" style={due.urgent && !closed ? { color: C.amber, fontWeight: 600 } : undefined}>
                        <Clock className="w-3.5 h-3.5" /> {due.text}
                      </span>
                    )}
                    {docs.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <FileCheck2 className="w-3.5 h-3.5" /> Documents {(item.documentsReady || []).length}/{docs.length} ready
                      </span>
                    )}
                    {item.appliedAt && <span>Applied {moment(item.appliedAt).format("MMM D")}</span>}
                    {item.notes && (
                      <span className="inline-flex items-center gap-1 truncate max-w-xs">
                        <StickyNote className="w-3.5 h-3.5 shrink-0" /> {item.notes}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Saved;
