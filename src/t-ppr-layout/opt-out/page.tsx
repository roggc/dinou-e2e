import React from "react";

// Explicit opt-out from parent layout's PPR!
export const ppr = false;

export default function PprOptOutPage() {
  return (
    <div style={{ padding: 20 }}>
      <h1 id="ppr-optout-title">PPR Opted Out Page</h1>
      <p id="ppr-optout-desc">This page opted out of PPR.</p>
    </div>
  );
}
