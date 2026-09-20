import React from "react";
import { useSelector } from "react-redux";
import { AlertTriangle } from "lucide-react";
import AdminModal from "./AdminModal";
import { getPalette } from "../utils/palette";

const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
}) => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3 py-2 text-sm rounded-lg border disabled:opacity-50"
            style={{ borderColor: C.border, color: C.text, backgroundColor: "transparent" }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-3 py-2 text-sm rounded-lg font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: destructive ? C.red : C.navy }}
          >
            {loading ? "Please wait..." : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${destructive ? C.red : C.amber}1A`, color: destructive ? C.red : C.amber }}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm" style={{ color: C.text }}>
          {message}
        </p>
      </div>
    </AdminModal>
  );
};

export default ConfirmDialog;
