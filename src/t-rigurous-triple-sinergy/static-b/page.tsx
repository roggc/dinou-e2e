import React from "react";
import { DinouCacheSlot } from "dinou/server";
import { readTsState } from "../ts-state";

export default async function TripleSynergyStaticBPage({
  staticBPageSeq,
}: {
  staticBPageSeq?: number;
}) {
  const effectiveSeq = staticBPageSeq ?? readTsState().staticBPageSeq;
  return (
    <div id="ts-static-b-page" className="p-4 rounded-lg bg-slate-900/80 border border-emerald-500/50 space-y-2">
      <h2 className="text-base font-bold text-emerald-300">
        Static Page B (Explicit ppr=false Opt-Out) — Seq:{" "}
        <strong id="ts-static-b-page-seq">{effectiveSeq}</strong>
      </h2>
      <DinouCacheSlot id="ts-static-b-slot" tag="ts-static-b-slot-tag" revalidate={3600}>
        {async () => {
          const st = readTsState();
          return (
            <div id="ts-static-b-slot-box" className="text-xs">
              Static B Slot Seq: <strong id="ts-static-b-slot-seq">{st.staticBSlotSeq}</strong>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

