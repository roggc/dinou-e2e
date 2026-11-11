import React, { Suspense } from "react";
import { getContext } from "dinou";

async function BailoutChildPprSuspense() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const bquery = ctx?.req?.query?.bquery || "default-bquery";
  return (
    <div id="mppr-bailout-page-query-box" className="text-xs font-mono">
      Child Page (ppr=true) Query: <strong id="mppr-bailout-page-query">{String(bquery)}</strong>
    </div>
  );
}

export default function MpprInverseBailoutPage() {
  return (
    <div id="mppr-bailout-page" className="p-3 rounded border border-rose-700/70 space-y-2">
      <h2 id="mppr-bailout-page-title" className="text-xs font-mono">
        Child Page Opted Into PPR (ppr = true) Under Bailing-Out Layout (ppr = false)
      </h2>
      <Suspense fallback={<div id="mppr-bailout-page-fallback">Loading Child Query...</div>}>
        <BailoutChildPprSuspense />
      </Suspense>
    </div>
  );
}

