import React, { Suspense } from "react";
import { getContext } from "dinou";

async function DynamicNestedChild() {
  const ctx = getContext();
  const userName = ctx?.req?.cookies?.username || ctx?.req?.query?.user || "NestedDefault";
  await new Promise((resolve) => setTimeout(resolve, 80));

  return (
    <div id="ppr-nested-dynamic" style={{ padding: 12, background: "#eef2ff" }}>
      Deep Nested User: <span id="ppr-nested-name">{userName}</span>
    </div>
  );
}

export default function PprNestedPage() {
  return (
    <div>
      <h2 id="ppr-nested-page-title">PPR Deep Nested Child Page</h2>
      <p id="ppr-nested-page-desc">Inherits PPR across two levels of layouts.</p>
      <Suspense fallback={<div id="ppr-nested-fallback">Loading nested dynamic user...</div>}>
        <DynamicNestedChild />
      </Suspense>
    </div>
  );
}
