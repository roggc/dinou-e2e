import React from "react";
import { DinouCacheSlot } from "dinou/server";
import { getHsCsState } from "../hscs-state";
import { HsCsClientStateBox } from "../hscs-client";

export default function HsCsSidebarSlot() {
  const st = getHsCsState();

  return (
    <aside
      id="hscs-sidebar-parallel"
      className="p-2.5 rounded-lg bg-slate-900/90 border border-pink-500/50 text-xs flex flex-wrap items-center justify-between gap-3"
    >
      <div>
        Parallel <code>@sidebar</code> Outer Seq:{" "}
        <strong id="hscs-sidebar-outer-seq" className="text-pink-300">
          {st.sidebarOuterSeq}
        </strong>
      </div>
      <DinouCacheSlot
        id="hscs-sidebar-slot"
        tag="hscs-sidebar-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = getHsCsState();
          return (
            <div
              id="hscs-sidebar-slot-box"
              className="flex flex-wrap items-center gap-3 p-1.5 rounded bg-slate-950 border border-pink-400/50"
            >
              <span>
                @sidebar CacheSlot Seq:{" "}
                <strong id="hscs-sidebar-slot-seq" className="text-pink-200">
                  {s.sidebarSlotSeq}
                </strong>
              </span>
              <HsCsClientStateBox idPrefix="hscs-sidebar-slot" />
            </div>
          );
        }}
      </DinouCacheSlot>
    </aside>
  );
}

