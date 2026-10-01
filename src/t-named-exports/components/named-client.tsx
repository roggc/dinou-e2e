"use client";

import { useState } from "react";

export function HeaderWithNamedCounter() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ border: "2px solid #6366f1", padding: "10px", margin: "10px 0" }}>
      <h3 id="named-header-title">Named Header Component</h3>
      <button id="btn-named-header-inc" onClick={() => setCount((c) => c + 1)}>
        Header Count ({count})
      </button>
      <span id="val-named-header-count">{count}</span>
    </div>
  );
}

export function NamedClientCard({ title }: { title: string }) {
  return (
    <div id="named-client-card" style={{ border: "1px solid #10b981", padding: "10px", margin: "10px 0" }}>
      Card: {title}
    </div>
  );
}

export const NamedClientBadge = ({ text }: { text: string }) => {
  return (
    <span
      id="named-client-badge"
      style={{
        background: "#3b82f6",
        color: "white",
        padding: "4px 8px",
        borderRadius: "4px",
        fontWeight: "bold",
        display: "inline-block",
        margin: "5px 0",
      }}
    >
      {text}
    </span>
  );
};

export function MultiplierCounter({ initial }: { initial: number }) {
  const [multiplier, setMultiplier] = useState(initial);

  return (
    <div style={{ margin: "10px 0" }}>
      <button id="btn-named-multiplier" onClick={() => setMultiplier((m) => m * 2)}>
        Double ({multiplier})
      </button>
      <span id="val-named-multiplier">{multiplier}</span>
    </div>
  );
}
