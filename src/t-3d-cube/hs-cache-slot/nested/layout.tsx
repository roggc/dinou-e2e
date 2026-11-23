import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function CubeHsCsL2Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="cube-hscs-l2-layout">
      <span id="hscs-l2-host">{st.hscsL2HostSeq}</span>
      <CubeClientProbe id="hscs-l2" />
      <DinouCacheSlot
        id="cube-hscs-l2-slot"
        tag="cube-hscs-l2-slot-tag"
        revalidate={3600}
      >
        {async () => (
          <span id="hscs-l2-slot-seq">{readCubeState().hscsL2SlotSeq}</span>
        )}
      </DinouCacheSlot>
      <div>{children}</div>
    </div>
  );
}
