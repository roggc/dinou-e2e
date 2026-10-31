import React from "react";
import { DinouCacheSlot } from "dinou/server";
import { getHsCsState } from "../hscs-state";

export default function HsCacheSlotNestedPage() {
  const st = getHsCsState();

  return (
    <div
      id="hscs-nested-page"
      className="p-3 rounded-lg bg-slate-950 border border-indigo-400/40 space-y-2 text-xs"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-indigo-200">
          Nested Page Content (/t-rigurous-hs-cache-slot/nested)
        </span>
        <span>
          Nested Page Seq:{" "}
          <strong id="hscs-nested-page-seq">{st.nestedPageSeq}</strong>
        </span>
      </div>

      <DinouCacheSlot
        id="hscs-nested-page-slot"
        tag="hscs-nested-page-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = getHsCsState();
          return (
            <div
              id="hscs-nested-page-slot-box"
              className="p-2 rounded bg-slate-900 border border-emerald-400/60"
            >
              Nested Page Slot Seq:{" "}
              <strong
                id="hscs-nested-page-slot-seq"
                className="text-emerald-300"
              >
                {s.nestedPageSlotSeq}
              </strong>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

