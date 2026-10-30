import React from "react";
import { DinouCacheSlot } from "dinou/server";
import { readTsState } from "../ts-state";

export default async function TripleSynergyStaticAPage({
  staticAPageSeq,
}: {
  staticAPageSeq?: number;
}) {
  const effectiveSeq = staticAPageSeq ?? readTsState().staticAPageSeq;
  return (
    <div id="ts-static-a-page" className="p-4 rounded-lg bg-slate-900/80 border border-emerald-500/50 space-y-2">
      <h2 className="text-base font-bold text-emerald-300">
        Static Page A (Explicit ppr=false Opt-Out) — Seq:{" "}
        <strong id="ts-static-a-page-seq">{effectiveSeq}</strong>
      </h2>
      <DinouCacheSlot id="ts-static-a-slot" tag="ts-static-a-slot-tag" revalidate={3600}>
        {async () => {
          const st = readTsState();
          return (
            <div id="ts-static-a-slot-box" className="text-xs">
              Static A Slot Seq: <strong id="ts-static-a-slot-seq">{st.staticASlotSeq}</strong>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

