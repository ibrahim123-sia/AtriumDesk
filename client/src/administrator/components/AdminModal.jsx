import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { X } from "lucide-react";
import { getPalette } from "../utils/palette";

const AdminModal = ({ open, onClose, title, children, footer, size = "md" }) => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl", xl: "max-w-4xl" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(15, 22, 38, 0.6)" }}
      onClick={onClose}
    >
      <div
        className={`w-full ${widths[size] || widths.md} rounded-xl border shadow-2xl flex flex-col max-h-[90vh]`}
        style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.border }}>
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: C.muted }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: C.border }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminModal;
