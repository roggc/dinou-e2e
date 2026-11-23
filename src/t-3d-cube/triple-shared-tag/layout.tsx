import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";

export default function TripleSharedTagLayout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="triple-shared-tag-l1">
      <span id="tst-l1-shell-seq">{st.tstL1ShellSeq}</span>
      <DinouCacheSlot
        id="cube-st-slot"
        tags={["cube-shared-all", "cube-st-slot-only"]}
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="tst-shared-slot-seq">{s.tstSharedSlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <DinouCacheSlot
        id="cube-st-unrelated-slot"
        tags={["cube-st-unrelated"]}
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="tst-unrelated-slot-seq">{s.tstUnrelatedSlotSeq}</span>;
        }}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
