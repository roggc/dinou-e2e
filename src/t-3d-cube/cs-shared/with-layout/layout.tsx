import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function CubeCsSharedLayout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="cube-cs-shared-layout">
      <span id="csshared-l1-host-seq">{st.csSharedL1HostSeq}</span>
      <CubeClientProbe id="csshared-l1" />
      <div id="csshared-lp-layout-wrap">
        <DinouCacheSlot
          id="cube-shared-lp-slot"
          tags={["cube-shared-lp-tag"]}
          revalidate={3600}
        >
          {async () => {
            const slotSt = readCubeState();
            return <span data-slot-val="lp">{slotSt.csSharedLpSlotSeq}</span>;
          }}
        </DinouCacheSlot>
      </div>
      {children}
    </section>
  );
}
