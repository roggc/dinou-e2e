import React, { Suspense } from "react";
import { getMpprState } from "../../../mppr-state";

async function FtffStaticSuspense() {
  await new Promise((r) => setTimeout(r, 10));
  const st = getMpprState();
  return (
    <div id="mppr-ftff-page-suspense-resolved" className="text-xs font-mono">
      FTFF Static Suspense: <strong id="mppr-ftff-page-suspense-seq">{st.ftffPageSuspenseSeq}</strong>
    </div>
  );
}

export default function MpprFtffPage() {
  const st = getMpprState();
  return (
    <div id="mppr-ftff-page" className="p-3 rounded border border-amber-500/70 space-y-2">
      <div className="text-xs font-mono">
        FTFF Page (false -&gt; true -&gt; false -&gt; false) Seq:{" "}
        <strong id="mppr-ftff-page-seq">{st.ftffPageSeq}</strong>
      </div>
      <Suspense fallback={<div id="mppr-ftff-page-fallback">Loading FTFF Static...</div>}>
        <FtffStaticSuspense />
      </Suspense>
    </div>
  );
}

