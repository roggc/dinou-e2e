import React, { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readTsState } from "./ts-state";
import { tsEchoAction } from "./ts-actions";
import { TsClientStateBox, TsHoleSlotClientWidget } from "./ts-client";

async function PprADynamicHole({ query }: { query?: Record<string, string> }) {
  await new Promise((r) => setTimeout(r, 15));
  const ctx = getContext();
  const holeUser = ctx?.req?.cookies?.ts_user || "anon-ts-user";
  const holeQuery = ctx?.req?.query?.mode || query?.mode || "default-mode";
  const st = readTsState();

  return (
    <div
      id="ts-ppr-a-hole-resolved"
      className="p-3 mt-2 rounded-lg bg-slate-900 border border-amber-500/70 space-y-2 text-xs"
    >
      <div className="flex flex-wrap gap-4 font-mono">
        <span>
          Hole Seq: <strong id="ts-ppr-a-hole-seq">{st.pprAHoleSeq}</strong>
        </span>
        <span>
          Hole User: <strong id="ts-ppr-a-hole-user">{holeUser}</strong>
        </span>
        <span>
          Hole Query: <strong id="ts-ppr-a-hole-query">{holeQuery}</strong>
        </span>
      </div>

      {/* Cached DinouCacheSlot inside the dynamic PPR hole with Client Widget + Server Action prop */}
      <DinouCacheSlot
        id="ts-ppr-a-hole-slot"
        tag="ts-ppr-a-hole-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const innerSt = readTsState();
          return (
            <div
              id="ts-ppr-a-hole-slot-box"
              className="p-2.5 rounded bg-slate-950 border border-fuchsia-500/50"
            >
              <div>
                Hole CacheSlot Seq:{" "}
                <strong id="ts-ppr-a-hole-slot-seq" className="text-fuchsia-300">
                  {innerSt.pprAHoleSlotSeq}
                </strong>
              </div>
              <TsHoleSlotClientWidget
                slotSeq={innerSt.pprAHoleSlotSeq}
                onServerEcho={tsEchoAction}
              />
            </div>
          );
        }}
      </DinouCacheSlot>

      {/* Nested DinouCacheSlots (Outer -> Inner) inside the dynamic PPR hole */}
      <DinouCacheSlot
        id="ts-hole-nested-outer"
        tag="ts-hole-nested-outer-tag"
        revalidate={3600}
      >
        {async () => {
          const outerSt = readTsState();
          return (
            <div
              id="ts-hole-nested-outer-box"
              className="p-2 rounded bg-slate-950 border border-pink-500/40 space-y-1"
            >
              <div>
                Hole Nested Outer Slot Seq:{" "}
                <strong id="ts-hole-nested-outer-seq">{outerSt.holeNestedOuterSeq}</strong>
              </div>
              <DinouCacheSlot
                id="ts-hole-nested-inner"
                tag="ts-hole-nested-inner-tag"
                revalidate={3600}
              >
                {async () => {
                  const innerSt = readTsState();
                  return (
                    <div id="ts-hole-nested-inner-box" className="pl-3 border-l border-pink-500">
                      Hole Nested Inner Slot Seq:{" "}
                      <strong id="ts-hole-nested-inner-seq">
                        {innerSt.holeNestedInnerSeq}
                      </strong>
                    </div>
                  );
                }}
              </DinouCacheSlot>
            </div>
          );
        }}
      </DinouCacheSlot>

      {/* Fast Clock-TTL DinouCacheSlot (revalidate=1s) inside the dynamic PPR hole */}
      <DinouCacheSlot
        id="ts-ppr-a-ttl-hole-slot"
        tag="ts-ppr-a-ttl-hole-slot-tag"
        revalidate={1}
      >
        {async () => {
          const ttlHoleSt = readTsState();
          return (
            <div
              id="ts-ppr-a-ttl-hole-slot-box"
              className="p-2 rounded bg-slate-950 border border-orange-500/50"
            >
              Hole Fast-TTL (1s) CacheSlot Seq:{" "}
              <strong id="ts-ppr-a-ttl-hole-slot-seq" className="text-orange-300">
                {ttlHoleSt.pprATtlHoleSlotSeq}
              </strong>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

export default async function TripleSynergyPprAPage({
  query,
  pprAPageSeq,
  pprAPageNote,
}: {
  query?: Record<string, string>;
  pprAPageSeq?: number;
  pprAPageNote?: string;
}) {
  const fallbackSt = pprAPageSeq === undefined ? readTsState() : null;
  const effectiveSeq = pprAPageSeq ?? fallbackSt?.pprAPageSeq ?? 100;
  const effectiveNote = pprAPageNote ?? fallbackSt?.pprAPageNote ?? "ppr-a-v0";

  return (
    <div
      id="ts-ppr-a-page"
      className="p-4 rounded-lg bg-slate-900/80 border border-cyan-500/50 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-cyan-200">
          PPR Page A (Inherits ppr=true from Layout)
        </h2>
        <div className="flex gap-4 text-xs font-mono">
          <span>
            PPR A Page Shell Seq:{" "}
            <strong id="ts-ppr-a-page-seq">{effectiveSeq}</strong>
          </span>
          <span>
            PPR A Page Note:{" "}
            <strong id="ts-ppr-a-page-note">{effectiveNote}</strong>
          </span>
        </div>
      </div>

      {/* Cached DinouCacheSlot in the PPR Page Static Shell */}
      <DinouCacheSlot
        id="ts-ppr-a-shell-slot"
        tag="ts-ppr-a-shell-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const st = readTsState();
          return (
            <div
              id="ts-ppr-a-shell-slot-box"
              className="p-2.5 rounded bg-slate-950 border border-indigo-500/60 text-xs"
            >
              <div>
                PPR A Static Shell CacheSlot Seq:{" "}
                <strong id="ts-ppr-a-shell-slot-seq" className="text-indigo-300">
                  {st.pprAShellSlotSeq}
                </strong>
              </div>
              <TsClientStateBox idPrefix="ts-ppr-a-shell-slot" />
            </div>
          );
        }}
      </DinouCacheSlot>

      {/* Fast Clock-TTL DinouCacheSlot (revalidate=1s) in the PPR Page Static Shell */}
      <DinouCacheSlot
        id="ts-ppr-a-ttl-shell-slot"
        tag="ts-ppr-a-ttl-shell-slot-tag"
        revalidate={1}
      >
        {async () => {
          const st = readTsState();
          return (
            <div
              id="ts-ppr-a-ttl-shell-slot-box"
              className="p-2.5 rounded bg-slate-950 border border-orange-500/60 text-xs"
            >
              PPR A Static Shell Fast-TTL (1s) CacheSlot Seq:{" "}
              <strong id="ts-ppr-a-ttl-shell-slot-seq" className="text-orange-300">
                {st.pprATtlShellSlotSeq}
              </strong>
            </div>
          );
        }}
      </DinouCacheSlot>

      {/* Dynamic PPR Hole */}
      <Suspense
        fallback={
          <div id="ts-ppr-a-hole-fallback" className="p-2 text-xs text-amber-300">
            [PPR A Hole Fallback] Streaming dynamic hole...
          </div>
        }
      >
        <PprADynamicHole query={query} />
      </Suspense>
    </div>
  );
}

