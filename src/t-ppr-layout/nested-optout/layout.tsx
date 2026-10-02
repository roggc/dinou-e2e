import React from "react";

// Explicit opt-out using function declaration syntax is configured in layout_functions.ts

export default function PprNestedOptOutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: 16, padding: 16, border: "2px solid #ef4444", borderRadius: 8 }}>
      <header id="ppr-nested-optout-header">PPR Nested Opt-Out Layout Header</header>
      <div>{children}</div>
    </div>
  );
}
