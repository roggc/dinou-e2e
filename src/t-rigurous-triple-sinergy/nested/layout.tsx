import React from "react";
import { DinouCacheSlot } from "dinou/server";
import { readTsState } from "../ts-state";
import { TsClientStateBox } from "../ts-client";

export default function TripleSynergyNestedLayout({
  children,
  nestedLayoutSeq = 100,
}: {
  children: React.ReactNode;
  nestedLayoutSeq?: number;
}) {
  return (
    <div
      id="ts-nested-layout"
      className="p-4 rounded-xl border border-indigo-500/70 bg-slate-900/60 space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between text-xs font-mono">
        <span className="font-bold text-indigo-300">L2 Nested Layout</span>
        <span>
          Nested Layout Seq: <strong id="ts-nested-layout-seq">{nestedLayoutSeq}</strong>
        </span>
      </div>
      <TsClientStateBox idPrefix="ts-nested-layout" />
      <DinouCacheSlot
        id="ts-nested-layout-slot"
        tag="ts-nested-layout-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const st = readTsState();
          return (
            <div id="ts-nested-layout-slot-box" className="text-xs">
              Nested Layout Slot Seq:{" "}
              <strong id="ts-nested-layout-slot-seq">{st.nestedLayoutSlotSeq}</strong>
            </div>
          );
        }}
      </DinouCacheSlot>
      <div id="ts-nested-outlet">{children}</div>
    </div>
  );
}

