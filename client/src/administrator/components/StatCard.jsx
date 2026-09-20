import React from "react";
import { useSelector } from "react-redux";
import { getPalette } from "../utils/palette";

const StatCard = ({ icon: Icon, label, value, accent, hint, loading }) => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  const accentColor = accent || C.navy;

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-2 transition-shadow hover:shadow-md"
      style={{ backgroundColor: C.surface, borderColor: C.border }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
          {label}
        </span>
        {Icon && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="text-2xl font-bold" style={{ color: C.text }}>
        {loading ? (
          <span className="inline-block w-14 h-6 rounded animate-pulse" style={{ backgroundColor: C.surfaceAlt }} />
        ) : (
          value
        )}
      </div>
      {hint && (
        <p className="text-xs" style={{ color: C.muted }}>
          {hint}
        </p>
      )}
    </div>
  );
};

export default StatCard;
