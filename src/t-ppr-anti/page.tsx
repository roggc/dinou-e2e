import React from "react";

// ⚠️ ANTI-TEST / NO-FEATURE:
// Exporting `const ppr = true` directly in page.tsx has NO EFFECT in Dinou.
// Route configuration must reside exclusively in page_functions.ts or layout_functions.ts.
export const ppr = true;

export default function AntiPprPage() {
  return (
    <div>
      <h1 id="anti-ppr-title">Anti-Test: No PPR from Component</h1>
      <p id="anti-ppr-desc">
        Exporting const ppr = true in page.tsx or layout.tsx has no effect in Dinou.
      </p>
    </div>
  );
}
