import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../../../shared/cube-state";

export default function TtlAsymL3Layout({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <section id="ttl-asym-l3">
      <span id="ttl-asym-l3-shell">{s.ttlAsymL3ShellSeq}</span>
      <DinouCacheSlot id="cube-ttl-asym-l3-slot" revalidate={1} tags={["cube-ttl-asym-l3-slot-tag"]}>
        {async () => <span id="ttl-asym-l3-slot">{readCubeState().ttlAsymL3SlotSeq}</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
