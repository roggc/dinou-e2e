import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

export default function TtlAsymL1Layout({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <section id="ttl-asym-l1">
      <span id="ttl-asym-l1-shell">{s.ttlAsymL1ShellSeq}</span>
      <DinouCacheSlot id="cube-ttl-asym-l1-slot" revalidate={1} tags={["cube-ttl-asym-l1-slot-tag"]}>
        {async () => <span id="ttl-asym-l1-slot">{readCubeState().ttlAsymL1SlotSeq}</span>}
      </DinouCacheSlot>
      <CubeControlBridge />
      {children}
    </section>
  );
}
