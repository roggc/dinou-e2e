import React from "react";

// Inherits PPR from parent layout (/t-ppr-layout/layout.tsx)
export default function PprNestedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: 16, padding: 16, border: "2px dashed #6366f1", borderRadius: 8 }}>
      <header id="ppr-nested-layout-header">PPR 2nd-Level Nested Layout Header</header>
      <div>{children}</div>
    </div>
  );
}
