import React, { Suspense } from "react";
import { getContext } from "dinou";

// Note: No "export const ppr = true" here! It inherits from parent layout.tsx

async function DynamicChild() {
  const ctx = getContext();
  const userName = ctx?.req?.cookies?.username || ctx?.req?.query?.user || "DefaultChild";
  await new Promise((resolve) => setTimeout(resolve, 80));

  return (
    <div id="ppr-inherited-dynamic" style={{ padding: 12, background: "#ecfdf5" }}>
      Inherited Dynamic User: <span id="ppr-inherited-name">{userName}</span>
    </div>
  );
}

export default function PprInheritedPage() {
  return (
    <div>
      <h1 id="ppr-inherited-title">PPR Inherited Page Title</h1>
      <p id="ppr-inherited-desc">This page inherited PPR from its layout.</p>
      <Suspense fallback={<div id="ppr-inherited-fallback">Loading inherited child...</div>}>
        <DynamicChild />
      </Suspense>
    </div>
  );
}
