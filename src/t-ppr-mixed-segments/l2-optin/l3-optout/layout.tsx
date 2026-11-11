import React, { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";
import { getMpprState } from "../../mppr-state";
import { MpprClientBox } from "../../mppr-client";

async function L3StaticSuspense() {
  // L3 has ppr = false between L2 (ppr = true) and Page (ppr = true):
  // MUST resolve statically WITHOUT noDynamic() and MUST NOT shift Page's ppr-hole-4!
  await new Promise((r) => setTimeout(r, 10));
  const st = getMpprState();
  return (
    <div id="mppr-l3-static-suspense-resolved" className="text-xs font-mono">
      L3 Static Suspense (ppr=false):{" "}
      <strong id="mppr-l3-static-suspense-seq">{st.l3SuspenseSeq}</strong>
    </div>
  );
}

async function L3SlotContent() {
  await new Promise((r) => setTimeout(r, 10));
  const st = getMpprState();
  return (
    <div id="mppr-l3-slot-resolved" className="text-xs font-mono">
      L3 Slot Seq: <strong id="mppr-l3-slot-seq">{st.l3SlotSeq}</strong>
      <MpprClientBox idPrefix="mppr-l3-slot" />
    </div>
  );
}

export default function MpprL3OptOutLayout({ children }: { children: React.ReactNode }) {
  const st = getMpprState();
  return (
    <div id="mppr-l3-layout" className="p-3 rounded-lg border-2 border-purple-500/70 space-y-2">
      <div className="flex flex-wrap items-center justify-between text-xs font-mono">
        <span className="font-bold text-purple-300">
          L3 Inner Layout (export const ppr = false inside L2 ppr = true)
        </span>
        <span>
          L3 Shell Seq: <strong id="mppr-l3-seq">{st.l3Seq}</strong>
        </span>
      </div>
      <MpprClientBox idPrefix="mppr-l3" />
      <Suspense fallback={<div id="mppr-l3-suspense-fallback">Loading L3 Static Suspense...</div>}>
        <L3StaticSuspense />
      </Suspense>
      <DinouCacheSlot id="mppr-l3-slot" tag="mppr-l3-slot-tag" revalidate={3600}>
        <L3SlotContent />
      </DinouCacheSlot>
      <div id="mppr-l3-outlet">{children}</div>
    </div>
  );
}

