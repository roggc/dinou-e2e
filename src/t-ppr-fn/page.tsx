import React, { Suspense } from "react";
import { getContext } from "dinou";

// PPR is configured in page_functions.ts via async function ppr()

async function DynamicFnUser() {
  const ctx = getContext();
  const userName = ctx?.req?.cookies?.username || ctx?.req?.query?.user || "DefaultFnUser";
  await new Promise((resolve) => setTimeout(resolve, 80));

  return (
    <div id="ppr-fn-dynamic" style={{ padding: 12, background: "#fdf4ff", border: "1px solid #f0abfc", borderRadius: 8 }}>
      Async Function PPR User: <span id="ppr-fn-name">{userName}</span>
    </div>
  );
}

export default function PprFnTestPage() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 id="ppr-fn-static-title">PPR via page_functions.ts</h1>
      <p id="ppr-fn-static-desc">PPR activated dynamically using an async function export in page_functions.</p>

      <Suspense fallback={<div id="ppr-fn-fallback">Loading async fn user data...</div>}>
        <DynamicFnUser />
      </Suspense>
    </div>
  );
}
