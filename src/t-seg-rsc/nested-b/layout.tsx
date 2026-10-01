"use client";

import type { ReactNode } from "react";

export default function NestedLayoutB({ children }: { children: ReactNode }) {
  return (
    <div style={{ border: "2px solid green", padding: "15px", marginTop: "10px" }}>
      <h2 id="nested-b-title">Nested Layout Section B</h2>
      <div id="nested-b-slot">{children}</div>
    </div>
  );
}
