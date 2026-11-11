import React, { Suspense } from "react";
import { getMpprState } from "./mppr-state";

async function IndexStaticSuspense() {
  await new Promise((r) => setTimeout(r, 10));
  const st = getMpprState();
  return (
    <div id="mppr-index-suspense-resolved" className="text-xs font-mono">
      Index Static Suspense: <strong id="mppr-index-suspense-seq">{st.indexSuspenseSeq}</strong>
    </div>
  );
}

export default function MpprIndexPage() {
  const st = getMpprState();
  return (
    <div id="mppr-index-page" className="p-3 rounded border border-slate-700 space-y-2">
      <div className="text-xs font-mono">
        Index Page (ppr=false under L1 ppr=false):{" "}
        <strong id="mppr-index-seq">{st.indexSeq}</strong>
      </div>
      <Suspense fallback={<div id="mppr-index-suspense-fallback">Loading Index...</div>}>
        <IndexStaticSuspense />
      </Suspense>
    </div>
  );
}

