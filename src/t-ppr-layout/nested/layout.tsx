import React from "react";

// Unconfigured nested layout defaults to non-PPR (no inheritance from parent layout)
export default function PprNestedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: 16, padding: 16, border: "2px dashed #6366f1", borderRadius: 8 }}>
      <header id="ppr-nested-layout-header">PPR 2nd-Level Nested Layout Header</header>
      <div>{children}</div>
    </div>
  );
}
