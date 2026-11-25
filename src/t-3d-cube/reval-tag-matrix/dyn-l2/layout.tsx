import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export default function RevalTagMatrixL2Dyn({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <div id="tm-l2">
      <span id="tm-l2-host-seq">{s.tmL2HostSeq}</span>
      <DinouCacheSlot
        id="cube-tm-l2-slot"
        revalidate={3600}
        tags={["cube-tm-shared-matrix", "cube-tm-l2-only"]}
      >
        {async () => (
          <span id="tm-l2-slot-seq">{readCubeState().tmL2SlotSeq}</span>
        )}
      </DinouCacheSlot>
      {children}
    </div>
  );
}
