"use client";

import { useState } from "react";

export default function HmrCounter() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: "10px", border: "1px solid #444", borderRadius: "8px", margin: "10px 0" }}>
      <h2 id="hmr-client-title">Client Counter Component</h2>
      <p id="hmr-count-display">Count: {count}</p>
      <button
        id="hmr-increment-btn"
        onClick={() => setCount((c) => c + 1)}
        style={{ padding: "8px 16px", cursor: "pointer", borderRadius: "4px" }}
      >
        Increment
      </button>
    </div>
  );
}
