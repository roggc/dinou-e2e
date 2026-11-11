import React, { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";
import { getMpprState } from "../mppr-state";
import { MpprClientBox } from "../mppr-client";

async function FtfPageStaticSuspense() {
  // Page has ppr = false inside L2 (ppr = true) inside L1 (ppr = false):
  // MUST resolve statically in shell.html & page.rsc WITHOUT noDynamic() and emit ZERO page holes!
  await new Promise((r) => setTimeout(r, 10));
  const st = getMpprState();
  return (
    <div id="mppr-ftf-page-suspense-resolved" className="text-xs font-mono">
      FTF Page Static Suspense: <strong id="mppr-ftf-page-suspense-seq">{st.ftfPageSuspenseSeq}</strong>
    </div>
  );
}

async function FtfPageSlotContent() {
  await new Promise((r) => setTimeout(r, 10));
  const st = getMpprState();
  return (
    <div id="mppr-ftf-page-slot-resolved" className="text-xs font-mono">
      FTF Page Slot Seq: <strong id="mppr-ftf-page-slot-seq">{st.ftfPageSlotSeq}</strong>
      <MpprClientBox idPrefix="mppr-ftf-page-slot" />
    </div>
  );
}

export default function MpprFtfPage() {
  const st = getMpprState();
  return (
    <div id="mppr-ftf-page" className="p-3 rounded border border-emerald-700/70 space-y-2">
      <div className="text-xs font-mono">
        FTF Page (false -&gt; true -&gt; false) Seq:{" "}
        <strong id="mppr-ftf-page-seq">{st.ftfPageSeq}</strong>
      </div>
      <MpprClientBox idPrefix="mppr-ftf-page" />
      <Suspense fallback={<div id="mppr-ftf-page-suspense-fallback">Loading FTF Page...</div>}>
        <FtfPageStaticSuspense />
      </Suspense>
      <DinouCacheSlot id="mppr-ftf-page-slot" tag="mppr-ftf-page-slot-tag" revalidate={3600}>
        <FtfPageSlotContent />
      </DinouCacheSlot>
    </div>
  );
}

