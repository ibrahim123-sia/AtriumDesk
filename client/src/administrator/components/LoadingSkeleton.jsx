import React from "react";
import { useSelector } from "react-redux";
import { getPalette } from "../utils/palette";

export const SkeletonRow = ({ cols = 4 }) => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const C = getPalette(theme === "dark", tenantBranding);
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 rounded animate-pulse" style={{ backgroundColor: C.surfaceAlt }} />
        </td>
      ))}
    </tr>
  );
};

const LoadingSkeleton = ({ rows = 6, cols = 4 }) => (
  <tbody>
    {Array.from({ length: rows }).map((_, i) => (
      <SkeletonRow key={i} cols={cols} />
    ))}
  </tbody>
);

export default LoadingSkeleton;
