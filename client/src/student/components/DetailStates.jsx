import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Link2, SearchX } from "lucide-react";

// A detail page whose item can't be shown (deleted, unpublished, not
// yours, or the request failed) — instead of "Loading…" forever.
export const DetailUnavailable = ({ message, backTo, backLabel, C }) => (
  <div className="h-full flex items-center justify-center p-6" style={{ backgroundColor: C.bg }}>
    <div className="text-center max-w-sm space-y-3">
      <SearchX className="w-10 h-10 mx-auto" style={{ color: C.muted }} />
      <p className="text-base font-medium" style={{ color: C.text }}>{message || "This isn't available anymore"}</p>
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: C.navy }}>
        <ArrowLeft className="w-4 h-4" /> {backLabel}
      </Link>
    </div>
  </div>
);

export const DetailLoading = ({ C }) => (
  <div className="h-full flex items-center justify-center" style={{ backgroundColor: C.bg, color: C.muted }}>
    Loading…
  </div>
);

// "Found on N sources" with the links, so a student can check the posting
// they trust (Rev 5 §8 Layer 2).
export const SourcesList = ({ listing, C }) => {
  const urls = [listing.officialLink, ...(listing.mergedFrom || []).map((m) => m.url)]
    .filter((u) => /^https?:\/\//i.test(u || ""))
    .filter((u, i, all) => all.indexOf(u) === i);
  if (urls.length < 2) return null;
  return (
    <div className="text-xs mt-1 space-y-1" style={{ color: C.muted }}>
      <p className="inline-flex items-center gap-1">
        <Link2 className="w-3.5 h-3.5" /> Found on {urls.length} sources:
      </p>
      <ul className="pl-5 list-disc space-y-0.5">
        {urls.map((url) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer" className="underline break-all" style={{ color: C.navy }}>
              {new URL(url).hostname.replace(/^www\./, "")}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};
