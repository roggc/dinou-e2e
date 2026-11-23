import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function TripleAsymDynL2Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="triple-asym-dyn-l2">
      <span id="ta-l2-host-seq">{st.taDynL2HostSeq}</span>
      <CubeClientProbe id="ta-l2" />
      <DinouCacheSlot id="cube-ta-l2-slot" tag="cube-ta-l2-slot-tag" revalidate={3600}>
        {async () => {
          const s = readCubeState();
          return <span id="ta-l2-slot-seq">{s.taDynL2SlotSeq}</span>;
        }}
      </DinouCacheSlot>
      {children}
    </div>
  );
}
