import React from "react";
import { useSelector } from "react-redux";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPalette } from "../utils/palette";

const Pagination = ({ page, pageSize, total, onChange }) => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-1 py-3 text-sm">
      <span style={{ color: C.muted }}>
        Showing <span style={{ color: C.text }}>{from}-{to}</span> of <span style={{ color: C.text }}>{total}</span>
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => canPrev && onChange(page - 1)}
          disabled={!canPrev}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40"
          style={{ borderColor: C.border, color: C.text, backgroundColor: C.surface }}
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>
        <span style={{ color: C.muted }}>
          Page <span style={{ color: C.text }}>{page}</span> / {totalPages}
        </span>
        <button
          onClick={() => canNext && onChange(page + 1)}
          disabled={!canNext}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm disabled:opacity-40"
          style={{ borderColor: C.border, color: C.text, backgroundColor: C.surface }}
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
