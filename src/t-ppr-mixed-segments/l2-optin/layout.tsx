import React, { Suspense } from "react";
import { getContext, noDynamic } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { getMpprState } from "../mppr-state";
import { MpprClientBox } from "../mppr-client";

async function L2NoDynamicBanner() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 10));
  const st = getMpprState();
  return (
    <div id="mppr-l2-nodynamic-resolved" className="text-xs font-mono">
      L2 noDynamic Seq: <strong id="mppr-l2-nodynamic-seq">{st.l2NoDynamicSeq}</strong>
    </div>
  );
}

async function L2HoleSlotContent() {
  await new Promise((r) => setTimeout(r, 10));
  const st = getMpprState();
  return (
    <div id="mppr-l2-hole-slot-resolved" className="text-xs font-mono">
      L2 Hole Slot Seq: <strong id="mppr-l2-hole-slot-seq">{st.l2HoleSlotSeq}</strong>
      <MpprClientBox idPrefix="mppr-l2-hole-slot" />
    </div>
  );
}

async function L2DynamicHole() {
  await new Promise((r) => setTimeout(r, 15));
  const ctx = getContext();
  const l2mode = ctx?.req?.query?.l2mode || "default-l2";
  const user = ctx?.req?.cookies?.mppr_user || "anon-mppr";
  const st = getMpprState();
  return (
    <div id="mppr-l2-hole-resolved" className="p-2 rounded bg-slate-900 border border-emerald-500/60 text-xs font-mono space-y-1">
      <div className="flex flex-wrap gap-3">
        <span>
          L2 Hole Seq: <strong id="mppr-l2-hole-seq">{st.l2HoleSeq}</strong>
        </span>
        <span>
          L2 Hole Query: <strong id="mppr-l2-hole-query">{String(l2mode)}</strong>
        </span>
        <span>
          L2 Hole User: <strong id="mppr-l2-hole-user">{String(user)}</strong>
        </span>
      </div>
      <DinouCacheSlot id="mppr-l2-hole-slot" tag="mppr-l2-hole-slot-tag" revalidate={3600}>
        <L2HoleSlotContent />
      </DinouCacheSlot>
    </div>
  );
}

export default function MpprL2OptInLayout({
  children,
  badge,
}: {
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const st = getMpprState();
  return (
    <div id="mppr-l2-layout" className="p-3 rounded-lg border-2 border-emerald-500/70 space-y-2">
      <div className="flex flex-wrap items-center justify-between text-xs font-mono">
        <span className="font-bold text-emerald-300">
          L2 Nested Layout (export const ppr = true inside L1 ppr = false)
        </span>
        <span>
          L2 Shell Seq: <strong id="mppr-l2-shell-seq">{st.l2ShellSeq}</strong>
        </span>
      </div>

      <MpprClientBox idPrefix="mppr-l2" />

      {/* Boundary #1 in PPR space: static <Suspense> via noDynamic() -> resolves in shell.html */}
      <Suspense fallback={<div id="mppr-l2-nodynamic-fallback">Loading L2 noDynamic...</div>}>
        <L2NoDynamicBanner />
      </Suspense>

      {/* Boundary #2 in PPR space: dynamic hole ppr-hole-2 */}
      <Suspense fallback={<div id="mppr-l2-hole-fallback">Loading L2 Dynamic Hole...</div>}>
        <L2DynamicHole />
      </Suspense>

      {/* Parallel slot @badge (inherits L2's ppr = true -> dynamic hole ppr-hole-3) */}
      <div id="mppr-l2-badge-container">{badge}</div>

      <div id="mppr-l2-outlet">{children}</div>
    </div>
  );
}

