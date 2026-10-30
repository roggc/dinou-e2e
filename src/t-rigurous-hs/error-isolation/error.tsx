import React from "react";

export default function HsErrorIsolationBoundary({
  error,
}: {
  error?: { message?: string };
}) {
  return (
    <div id="hs-page-error-boundary" className="p-4 bg-rose-950 border border-rose-500 rounded">
      <h3 id="hs-page-error-heading">Isolated Page Error Boundary</h3>
      <p id="hs-page-error-msg">{error?.message || "Captured Page Error"}</p>
    </div>
  );
}

