import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

export default function PairXyAsymPage() {
  const st = readCubeState();
  return (
    <main id="pair-xy-asym-page">
      <CubeControlBridge />
      <span id="pxy-page-host-seq">{st.pairXyPageHostSeq}</span>
      <DinouCacheSlot
        id="cube-xy-page-slot"
        tag="cube-xy-page-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="pxy-page-slot-seq">{s.pairXyPageSlotSeq}</span>;
        }}
      </DinouCacheSlot>
    </main>
  );
}
