import React from "react";
import { useSelector } from "react-redux";
import { getPalette } from "../utils/palette";

const EmptyState = ({ icon: Icon, title, description, action }) => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon className="w-12 h-12 mb-4" style={{ color: C.border }} />}
      <h3 className="text-base font-semibold mb-1" style={{ color: C.text }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm max-w-md" style={{ color: C.muted }}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
