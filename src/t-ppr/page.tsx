import React, { Suspense } from "react";
import { getContext } from "dinou";

export const ppr = true;

async function DynamicUser() {
  const ctx = getContext();
  const userName = ctx?.req?.cookies?.username || ctx?.req?.query?.user || "Alice";
  // Simulate asynchronous database or API call
  await new Promise((resolve) => setTimeout(resolve, 80));

  return (
    <div
      id="ppr-dynamic"
      style={{
        padding: 12,
        background: "#ecfdf5",
        border: "1px solid #a7f3d0",
        borderRadius: 8,
        color: "#065f46",
      }}
    >
      <strong>Dynamic User Component:</strong> Welcome, <span id="ppr-user-name">{userName}</span>!
    </div>
  );
}

export default function PprTestPage() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 id="ppr-static-title">Dinou Partial Prerendering (PPR)</h1>
      <p id="ppr-static-desc">
        This static shell was pre-rendered at build time with 0ms TTFB.
      </p>
      <div id="ppr-static-timestamp" style={{ marginBottom: 16, color: "#6b7280" }}>
        Static Build Shell Loaded
      </div>

      <Suspense
        fallback={
          <div
            id="ppr-fallback"
            style={{
              padding: 12,
              background: "#f3f4f6",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              color: "#4b5563",
            }}
          >
            Loading dynamic user data...
          </div>
        }
      >
        <DynamicUser />
      </Suspense>
    </div>
  );
}
