import React from "react";

export default function PprNestedOptOutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div id="ppr-nested-optout-layout-header">Nested Opt-Out Layout</div>
      {children}
    </div>
  );
}
