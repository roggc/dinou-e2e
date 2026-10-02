import React from "react";

// ⚠️ ANTI-TEST / NO-FEATURE:
// In Next.js, route segment configs are exported from page.tsx or layout.tsx.
// In Dinou, route configurations MUST be placed in layout_functions.ts or page_functions.ts.
// Exporting `const ppr = true` in layout.tsx has NO EFFECT in Dinou.
export const ppr = true;

export default function AntiPprLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div id="anti-ppr-layout-header">Anti-PPR Layout Component</div>
      {children}
    </div>
  );
}
