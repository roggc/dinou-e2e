import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../../shared/cube-state";

export default function RevalTagMatrixL3({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <div id="tm-l3">
      <span id="tm-l3-shell-seq">{s.tmL3ShellSeq}</span>
      <DinouCacheSlot
        id="cube-tm-l3-slot"
        revalidate={3600}
        tags={["cube-tm-shared-matrix", "cube-tm-l3-only"]}
      >
        {async () => (
          <span id="tm-l3-slot-seq">{readCubeState().tmL3SlotSeq}</span>
        )}
      </DinouCacheSlot>
      {children}
    </div>
  );
}
