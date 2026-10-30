import React, { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readTsState } from "../ts-state";

async function PprBDynamicHole({ query }: { query?: Record<string, string> }) {
  await new Promise((r) => setTimeout(r, 15));
  const ctx = getContext();
  const mode = ctx?.req?.query?.mode || query?.mode || "b-default";
  const st = readTsState();
  return (
    <div id="ts-ppr-b-hole-resolved" className="p-2.5 rounded bg-slate-900 border border-amber-500/60 text-xs">
      <div>
        PPR B Hole Seq: <strong id="ts-ppr-b-hole-seq">{st.pprBHoleSeq}</strong> | Mode:{" "}
        <strong id="ts-ppr-b-hole-query">{mode}</strong>
      </div>
      <DinouCacheSlot id="ts-ppr-b-hole-slot" tag="ts-ppr-b-hole-slot-tag" revalidate={3600}>
        {async () => {
          const inner = readTsState();
          return (
            <div id="ts-ppr-b-hole-slot-box">
              PPR B Hole Slot Seq: <strong id="ts-ppr-b-hole-slot-seq">{inner.pprBHoleSlotSeq}</strong>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

export default async function TripleSynergyPprBPage({
  query,
  pprBPageSeq,
}: {
  query?: Record<string, string>;
  pprBPageSeq?: number;
}) {
  const effectiveSeq = pprBPageSeq ?? readTsState().pprBPageSeq;
  return (
    <div id="ts-ppr-b-page" className="p-4 rounded-lg bg-slate-900/80 border border-cyan-500/50 space-y-2">
      <h2 className="text-base font-bold text-cyan-200">
        PPR Page B (Sibling PPR Page) — Shell Seq:{" "}
        <strong id="ts-ppr-b-page-seq">{effectiveSeq}</strong>
      </h2>
      <DinouCacheSlot id="ts-ppr-b-shell-slot" tag="ts-ppr-b-shell-slot-tag" revalidate={3600}>
        {async () => {
          const st = readTsState();
          return (
            <div id="ts-ppr-b-shell-slot-box" className="text-xs">
              PPR B Shell Slot Seq: <strong id="ts-ppr-b-shell-slot-seq">{st.pprBShellSlotSeq}</strong>
            </div>
          );
        }}
      </DinouCacheSlot>
      <Suspense fallback={<div id="ts-ppr-b-hole-fallback">Loading PPR B Hole...</div>}>
        <PprBDynamicHole query={query} />
      </Suspense>
    </div>
  );
}

