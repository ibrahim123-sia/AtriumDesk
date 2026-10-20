import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import { ClipboardCheck, CheckCircle2 } from "lucide-react";
import { updateSaved, fetchSaved } from "../../redux/slices/savedSlice";
import { statusLabels, takeApplyPending } from "../applicationStatus";

/**
 * Tracker for one listing on its detail page. `listing` needs _id,
 * listingType, title and (for the checklist) requiredDocuments.
 */
const ApplicationTracker = ({ listing, C }) => {
  const dispatch = useDispatch();
  const item = useSelector((s) => s.saved.saved.find((x) => x.listing?._id === listing._id));
  const [notes, setNotes] = useState(item?.notes || "");
  const [askApplied, setAskApplied] = useState(false);
  const labels = statusLabels(listing.listingType);
  const status = item?.status || null;
  const documents = listing.requiredDocuments || [];
  const ready = new Set(item?.documentsReady || []);

  useEffect(() => {
    setNotes(item?.notes || "");
  }, [item?.notes]);

  // Back from the official site: "Did you apply?"
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === "visible" && takeApplyPending(listing._id)) setAskApplied(true);
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [listing._id]);

  const save = async (changes, successMessage) => {
    const result = await dispatch(updateSaved({ listingId: listing._id, ...changes })).unwrap();
    if (!result.success) {
      toast.error(result.message || "Couldn't save");
      return false;
    }
    if (!item) dispatch(fetchSaved());
    if (successMessage) toast.success(successMessage);
    return true;
  };

  const toggleDocument = (doc) => {
    const next = new Set(ready);
    if (next.has(doc)) next.delete(doc);
    else next.add(doc);
    save({ documentsReady: [...next] });
  };

  return (
    <div className="p-5 rounded-xl border space-y-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
      {askApplied && (
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg"
          style={{ backgroundColor: `${C.navy}10` }}
        >
          <p className="text-sm font-medium" style={{ color: C.text }}>Did you apply to {listing.title}?</p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (await save({ status: "applied" }, "Marked as applied")) setAskApplied(false);
              }}
              className="px-3 py-1.5 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: C.navy }}
            >
              Yes, I applied
            </button>
            <button onClick={() => setAskApplied(false)} className="px-3 py-1.5 rounded-lg border text-sm" style={{ borderColor: C.border, color: C.muted }}>
              Not yet
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: C.text }}>
          <ClipboardCheck className="w-4 h-4" style={{ color: C.navy }} /> Your application
        </h2>
        <label className="text-sm inline-flex items-center gap-2" style={{ color: C.muted }}>
          Status
          <select
            value={status || ""}
            onChange={(e) => e.target.value && save({ status: e.target.value })}
            className="px-2.5 py-1.5 rounded-lg border text-sm"
            style={{ backgroundColor: C.input || C.surface, borderColor: C.border, color: C.text }}
          >
            {!status && <option value="">Not tracking</option>}
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      {item?.appliedAt && (
        <p className="text-xs" style={{ color: C.muted }}>Applied on {new Date(item.appliedAt).toLocaleDateString()}</p>
      )}

      {documents.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.muted }}>
            Documents ready ({documents.filter((d) => ready.has(d)).length}/{documents.length})
          </p>
          <ul className="space-y-1.5">
            {documents.map((doc) => (
              <li key={doc}>
                <label className="inline-flex items-start gap-2 text-sm cursor-pointer" style={{ color: C.text }}>
                  <input type="checkbox" checked={ready.has(doc)} onChange={() => toggleDocument(doc)} className="mt-0.5" />
                  <span style={ready.has(doc) ? { textDecoration: "line-through", color: C.muted } : undefined}>{doc}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label htmlFor={`notes-${listing._id}`} className="text-xs font-semibold uppercase block mb-1.5" style={{ color: C.muted }}>
          Notes (only you can see these)
        </label>
        <textarea
          id={`notes-${listing._id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Contacts, recommendation letters requested, interview dates…"
          className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
          style={{ backgroundColor: C.input || C.surface, borderColor: C.border, color: C.text }}
        />
        {notes !== (item?.notes || "") && (
          <button
            onClick={() => save({ notes }, "Notes saved")}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: C.navy }}
          >
            <CheckCircle2 className="w-4 h-4" /> Save notes
          </button>
        )}
      </div>
    </div>
  );
};

export default ApplicationTracker;
