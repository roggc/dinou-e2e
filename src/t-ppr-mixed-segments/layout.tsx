import React, { Suspense } from "react";
import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { getMpprState } from "./mppr-state";
import { MpprClientBox, MpprSuiteRunner } from "./mppr-client";

async function L1StaticSuspenseChild() {
  // L1 has ppr = false: this async <Suspense> MUST resolve statically WITHOUT noDynamic() and MUST NOT emit any ppr-hole-N!
  await new Promise((r) => setTimeout(r, 10));
  const st = getMpprState();
  return (
    <div id="mppr-l1-static-suspense-resolved" className="text-xs font-mono">
      L1 Static Suspense (ppr=false):{" "}
      <strong id="mppr-l1-static-suspense-seq">{st.l1SuspenseSeq}</strong>
    </div>
  );
}

async function L1SlotContent() {
  await new Promise((r) => setTimeout(r, 10));
  const st = getMpprState();
  return (
    <div id="mppr-l1-slot-resolved" className="text-xs font-mono">
      L1 Slot Seq: <strong id="mppr-l1-slot-seq">{st.l1SlotSeq}</strong>
      <MpprClientBox idPrefix="mppr-l1-slot" />
    </div>
  );
}

export default function MpprL1Layout({ children }: { children: React.ReactNode }) {
  const st = getMpprState();
  return (
    <section
      id="mppr-l1-layout"
      className="p-4 m-3 rounded-xl border-2 border-slate-500 bg-slate-950 text-slate-100 space-y-2"
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between text-xs font-mono">
          <span className="font-bold text-slate-300">
            L1 Outer Layout (export const ppr = false)
          </span>
          <span>
            L1 Shell Seq: <strong id="mppr-l1-seq">{st.l1Seq}</strong>
          </span>
        </div>

        <MpprClientBox idPrefix="mppr-l1" />

        <Suspense fallback={<div id="mppr-l1-suspense-fallback">Loading L1 Static Suspense...</div>}>
          <L1StaticSuspenseChild />
        </Suspense>

        <DinouCacheSlot id="mppr-l1-slot" tag="mppr-l1-slot-tag" revalidate={3600}>
          <L1SlotContent />
        </DinouCacheSlot>

        <nav className="flex flex-wrap gap-3 text-xs pt-1">
          <Link id="mppr-link-index" href="/t-ppr-mixed-segments" className="underline text-slate-300">
            Index (F-&gt;F)
          </Link>
          <Link id="mppr-link-ftf" href="/t-ppr-mixed-segments/l2-optin" className="underline text-emerald-300">
            L2 Opt-In + Static Page (F-&gt;T-&gt;F)
          </Link>
          <Link id="mppr-link-ftt" href="/t-ppr-mixed-segments/l2-optin/page-ppr" className="underline text-cyan-300">
            L2 Opt-In + PPR Page (F-&gt;T-&gt;T)
          </Link>
          <Link id="mppr-link-ftft" href="/t-ppr-mixed-segments/l2-optin/l3-optout" className="underline text-purple-300">
            4-Level Alternating (F-&gt;T-&gt;F-&gt;T)
          </Link>
          <Link
            id="mppr-link-ftff"
            href="/t-ppr-mixed-segments/l2-optin/l3-optout/static-leaf"
            className="underline text-amber-300"
          >
            4-Level Static Leaf (F-&gt;T-&gt;F-&gt;F)
          </Link>
        </nav>

        <MpprSuiteRunner />
      </header>

      <div id="mppr-l1-outlet">{children}</div>
    </section>
  );
}

