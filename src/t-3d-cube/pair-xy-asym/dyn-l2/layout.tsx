import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function PairXyAsymDynL2Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="pair-xy-dyn-l2">
      <span id="pxy-dyn-l2-host-seq">{st.pairXyDynL2HostSeq}</span>
      <CubeClientProbe id="pxy-l2" />
      <DinouCacheSlot
        id="cube-xy-dyn-l2-slot"
        tag="cube-xy-dyn-l2-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="pxy-dyn-l2-slot-seq">{s.pairXyDynL2SlotSeq}</span>;
        }}
      </DinouCacheSlot>
      {children}
    </div>
  );
}
