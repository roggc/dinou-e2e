import React from "react";
import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readTsState } from "./ts-state";
import {
  TsClientStateBox,
  TsManualControls,
  TsAutomatedSuiteRunner,
} from "./ts-client";

export default function TripleSynergyLayout({
  children,
  layoutSeq = 100,
  layoutNote = "ts-layout-v0",
}: {
  children: React.ReactNode;
  layoutSeq?: number;
  layoutNote?: string;
}) {
  return (
    <section
      id="ts-section-layout"
      className="p-5 m-4 rounded-xl border-2 border-cyan-500 bg-slate-950 text-slate-100"
    >
      <header className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 id="ts-layout-title" className="text-lg font-bold text-cyan-300">
            Triple Synergy Section Layout (Horizontal + Vertical + PPR)
          </h1>
          <div className="flex gap-4 text-xs font-mono">
            <span>
              Layout Seq: <strong id="ts-layout-seq">{layoutSeq}</strong>
            </span>
            <span>
              Layout Note: <strong id="ts-layout-note">{layoutNote}</strong>
            </span>
          </div>
        </div>

        <TsClientStateBox idPrefix="ts-layout" />

        <DinouCacheSlot
          id="ts-layout-shell-slot"
          tag="ts-layout-shell-slot-tag"
          revalidate={3600}
        >
          {async () => {
            const st = readTsState();
            return (
              <div
                id="ts-layout-slot-box"
                className="p-2.5 rounded-lg bg-slate-900 border border-purple-500/60 text-xs"
              >
                <div>
                  Layout CacheSlot Seq:{" "}
                  <strong id="ts-layout-slot-seq" className="text-purple-300">
                    {st.layoutSlotSeq}
                  </strong>
                </div>
                <TsClientStateBox idPrefix="ts-layout-slot" />
              </div>
            );
          }}
        </DinouCacheSlot>

        <nav className="flex flex-wrap gap-3 pt-1 text-xs">
          <Link id="ts-link-ppr-a" href="/t-rigurous-triple-sinergy" className="underline text-cyan-300">
            PPR Page A (Index)
          </Link>
          <Link
            id="ts-link-ppr-a-query"
            href="/t-rigurous-triple-sinergy?mode=live-query"
            className="underline text-amber-300"
          >
            PPR Page A (?mode=live-query)
          </Link>
          <Link id="ts-link-ppr-b" href="/t-rigurous-triple-sinergy/ppr-b" className="underline text-cyan-300">
            PPR Page B
          </Link>
          <Link id="ts-link-static-a" href="/t-rigurous-triple-sinergy/static-a" className="underline text-emerald-300">
            Static Page A (ppr=false)
          </Link>
          <Link id="ts-link-static-b" href="/t-rigurous-triple-sinergy/static-b" className="underline text-emerald-300">
            Static Page B (ppr=false)
          </Link>
          <Link id="ts-link-nested-ppr" href="/t-rigurous-triple-sinergy/nested" className="underline text-indigo-300">
            Nested PPR Page
          </Link>
          <Link
            id="ts-link-nested-static"
            href="/t-rigurous-triple-sinergy/nested/static-child"
            className="underline text-indigo-300"
          >
            Nested Static Child (ppr=false)
          </Link>
          <Link
            id="ts-link-no-layout-ppr"
            href="/t-rigurous-triple-sinergy/no-layout-ppr"
            className="underline text-rose-300"
          >
            No-Layout PPR Page
          </Link>
        </nav>

        <TsManualControls />
        <TsAutomatedSuiteRunner />
      </header>

      <div id="ts-page-outlet">{children}</div>
    </section>
  );
}

