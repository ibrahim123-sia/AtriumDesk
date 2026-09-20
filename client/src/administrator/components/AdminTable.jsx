import React from "react";
import { useSelector } from "react-redux";
import { getPalette } from "../utils/palette";

const AdminTable = ({ columns, children, dense = false }) => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: C.border, backgroundColor: C.surface }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.surfaceAlt }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left font-semibold ${dense ? "px-3 py-2" : "px-4 py-3"} text-xs uppercase tracking-wide`}
                  style={{ color: C.muted, width: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          {children}
        </table>
      </div>
    </div>
  );
};

export const AdminTableRow = ({ children, onClick, highlight }) => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  return (
    <tr
      onClick={onClick}
      className={`border-t transition-colors ${onClick ? "cursor-pointer" : ""}`}
      style={{ borderColor: C.border, backgroundColor: highlight ? `${C.red}10` : "transparent" }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.backgroundColor = C.surfaceAlt)}
      onMouseLeave={(e) =>
        onClick && (e.currentTarget.style.backgroundColor = highlight ? `${C.red}10` : "transparent")
      }
    >
      {children}
    </tr>
  );
};

export const AdminTableCell = ({ children, dense = false, className = "", style }) => (
  <td className={`${dense ? "px-3 py-2" : "px-4 py-3"} ${className}`} style={style}>
    {children}
  </td>
);

export default AdminTable;
