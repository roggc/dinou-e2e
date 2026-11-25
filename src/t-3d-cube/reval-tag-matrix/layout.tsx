import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";

export default function RevalTagMatrixL1({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <section id="tm-l1">
      <span id="tm-l1-shell-seq">{s.tmL1ShellSeq}</span>
      <CubeClientProbe id="tm-l1" />
      <DinouCacheSlot
        id="cube-tm-l1-slot"
        revalidate={3600}
        tags={["cube-tm-shared-matrix", "cube-tm-l1-only"]}
      >
        {async () => (
          <span id="tm-l1-slot-seq">{readCubeState().tmL1SlotSeq}</span>
        )}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
