import React from "react";
import { DinouCacheSlot } from "dinou/server";
import { getHsCsState } from "./hscs-state";
import { hscsSlotServerAction } from "./hscs-actions";
import {
  HsCsClientStateBox,
  HsCsSlotActionButton,
} from "./hscs-client";

export default function HsCacheSlotPageA({
  pageAPropsSeq = 100,
}: {
  pageAPropsSeq?: number;
}) {
  const st = getHsCsState();

  return (
    <div
      id="hscs-page-a"
      className="p-4 rounded-xl bg-slate-900 border border-teal-500/50 space-y-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-teal-200">
          Page A (Index — Static Non-PPR Host with 4 Vertical CacheSlot Topologies)
        </h2>
        <div className="flex gap-4 font-mono">
          <span>
            Page A Seq: <strong id="hscs-page-a-seq">{st.pageASeq}</strong>
          </span>
          <span>
            Page A Props Seq:{" "}
            <strong id="hscs-page-a-props-seq">{pageAPropsSeq}</strong>
          </span>
        </div>
      </div>

      <HsCsClientStateBox idPrefix="hscs-page-a" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 1. Isolated Page A CacheSlot with Client State + Server Action Prop */}
        <DinouCacheSlot
          id="hscs-page-a-slot"
          tag="hscs-page-a-slot-tag"
          revalidate={3600}
        >
          {async () => {
            const s = getHsCsState();
            return (
              <div
                id="hscs-page-a-slot-box"
                className="p-3 rounded-lg bg-slate-950 border border-purple-500/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span>
                    Page A Slot Seq:{" "}
                    <strong
                      id="hscs-page-a-slot-seq"
                      className="text-purple-300"
                    >
                      {s.pageASlotSeq}
                    </strong>
                  </span>
                  <HsCsSlotActionButton actionFn={hscsSlotServerAction} />
                </div>
                <HsCsClientStateBox idPrefix="hscs-page-a-slot" />
              </div>
            );
          }}
        </DinouCacheSlot>

        {/* 2. Cross-Axis Shared Tag CacheSlot in Page A (shares tag="hscs-shared-tag" with L1 Layout) */}
        <DinouCacheSlot
          id="hscs-page-a-shared-slot"
          tag="hscs-shared-tag"
          revalidate={3600}
        >
          {async () => {
            const s = getHsCsState();
            return (
              <div
                id="hscs-page-a-shared-slot-box"
                className="p-3 rounded-lg bg-slate-950 border border-amber-500/60 space-y-2"
              >
                <div>
                  Page A Shared-Tag Slot Seq:{" "}
                  <strong
                    id="hscs-page-a-shared-slot-seq"
                    className="text-amber-300"
                  >
                    {s.pageASharedSlotSeq}
                  </strong>
                </div>
              </div>
            );
          }}
        </DinouCacheSlot>

        {/* 3. Nested Outer + Inner CacheSlots inside Page A */}
        <DinouCacheSlot
          id="hscs-page-a-outer-slot"
          tag="hscs-page-a-outer-tag"
          revalidate={3600}
        >
          {async () => {
            const s = getHsCsState();
            return (
              <div
                id="hscs-page-a-outer-slot-box"
                className="p-3 rounded-lg bg-slate-950 border border-cyan-500/60 space-y-2"
              >
                <div>
                  Page A Outer Slot Seq:{" "}
                  <strong
                    id="hscs-page-a-outer-slot-seq"
                    className="text-cyan-300"
                  >
                    {s.pageAOuterSlotSeq}
                  </strong>
                </div>
                <DinouCacheSlot
                  id="hscs-page-a-inner-slot"
                  tag="hscs-page-a-inner-tag"
                  revalidate={3600}
                >
                  {async () => {
                    const innerS = getHsCsState();
                    return (
                      <div
                        id="hscs-page-a-inner-slot-box"
                        className="p-2 rounded bg-slate-900 border border-emerald-500/60"
                      >
                        Page A Inner Slot Seq:{" "}
                        <strong
                          id="hscs-page-a-inner-slot-seq"
                          className="text-emerald-300"
                        >
                          {innerS.pageAInnerSlotSeq}
                        </strong>
                      </div>
                    );
                  }}
                </DinouCacheSlot>
              </div>
            );
          }}
        </DinouCacheSlot>

        {/* 4. Dynamic revalidate={0} Bypass Slot inside Static Page A */}
        <DinouCacheSlot id="hscs-page-a-nocache-slot" revalidate={0}>
          {async () => {
            const s = getHsCsState();
            return (
              <div
                id="hscs-page-a-nocache-slot-box"
                className="p-3 rounded-lg bg-slate-950 border border-rose-500/60 space-y-2"
              >
                <div>
                  Page A <code>revalidate=&#123;0&#125;</code> Slot Seq:{" "}
                  <strong
                    id="hscs-page-a-nocache-slot-seq"
                    className="text-rose-300"
                  >
                    {s.pageANoCacheSlotSeq}
                  </strong>
                </div>
              </div>
            );
          }}
        </DinouCacheSlot>

        {/* 5. Fast Clock-TTL revalidate={1} Slot inside Static Page A */}
        <DinouCacheSlot
          id="hscs-page-a-ttl-slot"
          tag="hscs-page-a-ttl-slot-tag"
          revalidate={1}
        >
          {async () => {
            const s = getHsCsState();
            return (
              <div
                id="hscs-page-a-ttl-slot-box"
                className="p-3 rounded-lg bg-slate-950 border border-orange-500/60 space-y-2"
              >
                <div>
                  Page A Fast-TTL (1s) Slot Seq:{" "}
                  <strong
                    id="hscs-page-a-ttl-slot-seq"
                    className="text-orange-300"
                  >
                    {s.pageATtlSlotSeq}
                  </strong>
                </div>
              </div>
            );
          }}
        </DinouCacheSlot>
      </div>
    </div>
  );
}

