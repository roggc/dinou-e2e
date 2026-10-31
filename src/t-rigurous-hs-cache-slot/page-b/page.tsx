import React from "react";
import { DinouCacheSlot } from "dinou/server";
import { getHsCsState } from "../hscs-state";
import { HsCsClientStateBox } from "../hscs-client";

export default function HsCacheSlotPageB() {
  const st = getHsCsState();

  return (
    <div
      id="hscs-page-b"
      className="p-4 rounded-xl bg-slate-900 border border-cyan-500/50 space-y-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-cyan-200">
          Page B (Sibling Route under Shared L1 Layout)
        </h2>
        <div>
          Page B Seq: <strong id="hscs-page-b-seq">{st.pageBSeq}</strong>
        </div>
      </div>

      <HsCsClientStateBox idPrefix="hscs-page-b" />

      <DinouCacheSlot
        id="hscs-page-b-slot"
        tag="hscs-page-b-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = getHsCsState();
          return (
            <div
              id="hscs-page-b-slot-box"
              className="p-3 rounded-lg bg-slate-950 border border-cyan-400/60"
            >
              Page B Slot Seq:{" "}
              <strong id="hscs-page-b-slot-seq" className="text-cyan-300">
                {s.pageBSlotSeq}
              </strong>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

