import React from "react";
import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { getHsCsState } from "./hscs-state";
import {
  HsCsClientStateBox,
  HsCsAutomatedSuiteRunner,
} from "./hscs-client";

export default function HsCacheSlotLayout({
  children,
  sidebar,
  l1LayoutPropsSeq = 100,
}: {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  l1LayoutPropsSeq?: number;
}) {
  const st = getHsCsState();

  return (
    <section
      id="hscs-l1-layout"
      className="p-5 m-4 rounded-xl border-2 border-teal-500 bg-slate-950 text-slate-100 space-y-3"
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 id="hscs-layout-title" className="text-lg font-bold text-teal-300">
            HS + &lt;DinouCacheSlot&gt; Synergy Layout (L1, Non-PPR)
          </h1>
          <div className="flex gap-4 text-xs font-mono">
            <span>
              L1 Layout Seq:{" "}
              <strong id="hscs-l1-layout-seq">{st.l1LayoutSeq}</strong>
            </span>
            <span>
              L1 Props Seq:{" "}
              <strong id="hscs-l1-props-seq">{l1LayoutPropsSeq}</strong>
            </span>
          </div>
        </div>

        <HsCsClientStateBox idPrefix="hscs-l1" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          {/* 1. Isolated L1 Layout CacheSlot */}
          <DinouCacheSlot
            id="hscs-l1-slot"
            tag="hscs-l1-slot-tag"
            revalidate={3600}
          >
            {async () => {
              const s = getHsCsState();
              return (
                <div
                  id="hscs-l1-slot-box"
                  className="p-2.5 rounded-lg bg-slate-900 border border-purple-500/60"
                >
                  <div>
                    L1 Slot Seq:{" "}
                    <strong id="hscs-l1-slot-seq" className="text-purple-300">
                      {s.l1SlotSeq}
                    </strong>
                  </div>
                  <HsCsClientStateBox idPrefix="hscs-l1-slot" />
                </div>
              );
            }}
          </DinouCacheSlot>

          {/* 2. Cross-Axis Shared Tag CacheSlot in L1 Layout */}
          <DinouCacheSlot
            id="hscs-l1-shared-slot"
            tag="hscs-shared-tag"
            revalidate={3600}
          >
            {async () => {
              const s = getHsCsState();
              return (
                <div
                  id="hscs-l1-shared-slot-box"
                  className="p-2.5 rounded-lg bg-slate-900 border border-amber-500/60"
                >
                  <div>
                    L1 Shared-Tag Slot Seq:{" "}
                    <strong
                      id="hscs-l1-shared-slot-seq"
                      className="text-amber-300"
                    >
                      {s.l1SharedSlotSeq}
                    </strong>
                  </div>
                </div>
              );
            }}
          </DinouCacheSlot>

          {/* 3. Nested Outer + Inner CacheSlots inside L1 Layout */}
          <DinouCacheSlot
            id="hscs-l1-outer-slot"
            tag="hscs-l1-outer-tag"
            revalidate={3600}
          >
            {async () => {
              const s = getHsCsState();
              return (
                <div
                  id="hscs-l1-outer-slot-box"
                  className="p-2.5 rounded-lg bg-slate-900 border border-cyan-500/60 space-y-1"
                >
                  <div>
                    L1 Outer Slot Seq:{" "}
                    <strong
                      id="hscs-l1-outer-slot-seq"
                      className="text-cyan-300"
                    >
                      {s.l1OuterSlotSeq}
                    </strong>
                  </div>
                  <DinouCacheSlot
                    id="hscs-l1-inner-slot"
                    tag="hscs-l1-inner-tag"
                    revalidate={3600}
                  >
                    {async () => {
                      const innerS = getHsCsState();
                      return (
                        <div
                          id="hscs-l1-inner-slot-box"
                          className="p-1.5 rounded bg-slate-950 border border-emerald-500/60"
                        >
                          L1 Inner Slot Seq:{" "}
                          <strong
                            id="hscs-l1-inner-slot-seq"
                            className="text-emerald-300"
                          >
                            {innerS.l1InnerSlotSeq}
                          </strong>
                        </div>
                      );
                    }}
                  </DinouCacheSlot>
                </div>
              );
            }}
          </DinouCacheSlot>
        </div>

        {/* Parallel Route @sidebar */}
        <div id="hscs-sidebar-region">{sidebar}</div>

        <nav className="flex flex-wrap gap-3 pt-1 text-xs">
          <Link
            id="hscs-link-page-a"
            href="/t-rigurous-hs-cache-slot"
            className="underline text-teal-300"
          >
            Page A (Index)
          </Link>
          <Link
            id="hscs-link-page-a-fresh"
            href="/t-rigurous-hs-cache-slot"
            fresh
            className="underline text-amber-300"
          >
            Page A (Fresh)
          </Link>
          <Link
            id="hscs-link-page-b"
            href="/t-rigurous-hs-cache-slot/page-b"
            className="underline text-cyan-300"
          >
            Page B (Sibling)
          </Link>
          <Link
            id="hscs-link-nested"
            href="/t-rigurous-hs-cache-slot/nested"
            className="underline text-indigo-300"
          >
            Nested L2 Route
          </Link>
        </nav>

        <HsCsAutomatedSuiteRunner />
      </header>

      <div id="hscs-page-outlet">{children}</div>
    </section>
  );
}

