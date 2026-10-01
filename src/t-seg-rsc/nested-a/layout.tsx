"use client";

import { useState, type ReactNode } from "react";

export default function NestedLayoutA({ children }: { children: ReactNode }) {
  const [nestedCount, setNestedCount] = useState(0);

  return (
    <div style={{ border: "2px solid blue", padding: "15px", marginTop: "10px" }}>
      <h2 id="nested-a-title">Nested Layout Section A</h2>
      <div style={{ margin: "10px 0", display: "flex", gap: "10px", alignItems: "center" }}>
        <button id="btn-nested-a-inc" onClick={() => setNestedCount((c) => c + 1)}>
          Inc Nested A
        </button>
        <span id="val-nested-a-count">{nestedCount}</span>
      </div>
      <div id="nested-a-slot">{children}</div>
    </div>
  );
}
