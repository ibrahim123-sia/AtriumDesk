import React from "react";
import { Copy, Globe2 } from "lucide-react";
import toast from "react-hot-toast";

// The two ways prospective students reach this university's own guest
// assistant: a direct link, and a chat button on the university's website.
const ShareAssistant = ({ slug, C }) => {
  if (!slug) return null;
  const origin = window.location.origin;
  const link = `${origin}/?u=${encodeURIComponent(slug)}`;
  const snippet = `<script src="${origin}/widget.js" data-university="${slug}" async></script>`;

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy — select the text and copy it instead");
    }
  };

  const row = (label, hint, value, what) => (
    <div>
      <p className="text-xs font-medium mb-1" style={{ color: C.muted }}>{label}</p>
      <div className="flex gap-2">
        <code
          className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border overflow-x-auto whitespace-nowrap"
          style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => copy(value, what)}
          aria-label={`Copy ${what.toLowerCase()}`}
          className="px-3 py-2 rounded-lg border text-xs inline-flex items-center gap-1 shrink-0"
          style={{ borderColor: C.border, color: C.text }}
        >
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
      </div>
      <p className="text-xs mt-1" style={{ color: C.muted }}>{hint}</p>
    </div>
  );

  return (
    <section className="rounded-xl border p-4 space-y-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
      <h2 className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: C.text }}>
        <Globe2 className="w-4 h-4" style={{ color: C.navy }} /> Share your assistant with applicants
      </h2>
      {row(
        "Guest link",
        "Opens your university's own assistant, scholarships and events — use it on social media or in admission emails.",
        link,
        "Link"
      )}
      {row(
        "Website chat button",
        "Paste into your website's HTML (before </body>) to add an \"Ask us\" button that opens the assistant.",
        snippet,
        "Snippet"
      )}
    </section>
  );
};

export default ShareAssistant;
