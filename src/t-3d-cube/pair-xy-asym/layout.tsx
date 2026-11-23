import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";

export default function PairXyAsymL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="pair-xy-l1">
      <span id="pxy-l1-host-seq">{st.pairXyL1HostSeq}</span>
      <CubeClientProbe id="pxy-l1" />
      <DinouCacheSlot
        id="cube-xy-l1-slot"
        tag="cube-xy-l1-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="pxy-l1-slot-seq">{s.pairXyL1SlotSeq}</span>;
        }}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
