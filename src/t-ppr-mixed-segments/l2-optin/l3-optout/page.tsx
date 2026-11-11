import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getMpprState } from "../../mppr-state";
import { MpprClientBox } from "../../mppr-client";

async function FtftPageDynamicHole() {
  await new Promise((r) => setTimeout(r, 15));
  const ctx = getContext();
  const ftftmode = ctx?.req?.query?.ftftmode || "default-ftft";
  const st = getMpprState();
  return (
    <div id="mppr-ftft-page-hole-resolved" className="text-xs font-mono">
      FTFT Page Hole Seq: <strong id="mppr-ftft-page-hole-seq">{st.ftftPageHoleSeq}</strong> | Query:{" "}
      <strong id="mppr-ftft-page-hole-query">{String(ftftmode)}</strong>
    </div>
  );
}

export default function MpprFtftPage() {
  const st = getMpprState();
  return (
    <div id="mppr-ftft-page" className="p-3 rounded border border-purple-400/70 space-y-2">
      <div className="text-xs font-mono">
        FTFT Page (false -&gt; true -&gt; false -&gt; true) Shell Seq:{" "}
        <strong id="mppr-ftft-page-shell-seq">{st.ftftPageShellSeq}</strong>
      </div>
      <MpprClientBox idPrefix="mppr-ftft-page" />
      <Suspense fallback={<div id="mppr-ftft-page-fallback">Loading FTFT Page Hole...</div>}>
        <FtftPageDynamicHole />
      </Suspense>
    </div>
  );
}

