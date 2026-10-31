import React from "react";
import { DinouCacheSlot } from "dinou/server";
import { getHsCsState } from "../hscs-state";
import { HsCsClientStateBox } from "../hscs-client";

export default function HsCacheSlotNestedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const st = getHsCsState();

  return (
    <div
      id="hscs-l2-layout"
      className="p-4 rounded-xl bg-slate-900 border-2 border-indigo-500 space-y-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-indigo-300">
          Nested L2 Layout (/t-rigurous-hs-cache-slot/nested)
        </h2>
        <div>
          L2 Layout Seq:{" "}
          <strong id="hscs-l2-layout-seq">{st.l2LayoutSeq}</strong>
        </div>
      </div>

      <HsCsClientStateBox idPrefix="hscs-l2" />

      <DinouCacheSlot
        id="hscs-l2-slot"
        tag="hscs-l2-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = getHsCsState();
          return (
            <div
              id="hscs-l2-slot-box"
              className="p-2.5 rounded-lg bg-slate-950 border border-indigo-400/60"
            >
              <div>
                L2 Layout Slot Seq:{" "}
                <strong id="hscs-l2-slot-seq" className="text-indigo-300">
                  {s.l2SlotSeq}
                </strong>
              </div>
              <HsCsClientStateBox idPrefix="hscs-l2-slot" />
            </div>
          );
        }}
      </DinouCacheSlot>

      <div id="hscs-l2-outlet">{children}</div>
    </div>
  );
}

