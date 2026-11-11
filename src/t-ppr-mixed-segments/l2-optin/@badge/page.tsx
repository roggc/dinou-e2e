import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getMpprState } from "../../mppr-state";

async function L2BadgeDynamicHole() {
  await new Promise((r) => setTimeout(r, 12));
  const ctx = getContext();
  const bmode = ctx?.req?.query?.bmode || "default-badge";
  const st = getMpprState();
  return (
    <div id="mppr-l2-badge-hole-resolved" className="text-xs font-mono">
      @badge Hole Seq: <strong id="mppr-l2-badge-hole-seq">{st.l2BadgeHoleSeq}</strong> | Query:{" "}
      <strong id="mppr-l2-badge-hole-query">{String(bmode)}</strong>
    </div>
  );
}

// Intentionally NO page_functions.ts: @badge inherits owning L2 layout's ppr = true (NOT L1's ppr = false!)
export default function MpprL2BadgeSlot() {
  const st = getMpprState();
  return (
    <aside id="mppr-l2-badge-slot" className="p-2 rounded bg-emerald-950/40 border border-emerald-700/60 space-y-1">
      <div className="text-xs font-mono">
        @badge Shell Seq: <strong id="mppr-l2-badge-shell-seq">{st.l2BadgeShellSeq}</strong>
      </div>
      <Suspense fallback={<div id="mppr-l2-badge-fallback">Loading @badge Hole...</div>}>
        <L2BadgeDynamicHole />
      </Suspense>
    </aside>
  );
}

