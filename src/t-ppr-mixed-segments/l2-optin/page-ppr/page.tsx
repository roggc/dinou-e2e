import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getMpprState } from "../../mppr-state";

async function FttPageDynamicHole() {
  await new Promise((r) => setTimeout(r, 12));
  const ctx = getContext();
  const pmode = ctx?.req?.query?.pmode || "default-ftt";
  const st = getMpprState();
  return (
    <div id="mppr-ftt-page-hole-resolved" className="text-xs font-mono">
      FTT Page Hole Seq: <strong id="mppr-ftt-page-hole-seq">{st.fttPageHoleSeq}</strong> | Query:{" "}
      <strong id="mppr-ftt-page-hole-query">{String(pmode)}</strong>
    </div>
  );
}

export default function MpprFttPage() {
  const st = getMpprState();
  return (
    <div id="mppr-ftt-page" className="p-3 rounded border border-cyan-600/70 space-y-2">
      <div className="text-xs font-mono">
        FTT Page (false -&gt; true -&gt; true) Shell Seq:{" "}
        <strong id="mppr-ftt-page-shell-seq">{st.fttPageShellSeq}</strong>
      </div>
      <Suspense fallback={<div id="mppr-ftt-page-fallback">Loading FTT Page Hole...</div>}>
        <FttPageDynamicHole />
      </Suspense>
    </div>
  );
}

