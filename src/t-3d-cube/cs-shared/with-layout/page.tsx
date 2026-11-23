import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

export default function CubeCsSharedLayoutPage() {
  const st = readCubeState();
  return (
    <main id="cube-cs-shared-lp-page">
      <CubeControlBridge />
      <span id="csshared-lp-page-host-seq">{st.csSharedLpPageHostSeq}</span>
      <div id="csshared-lp-page-wrap">
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
    </main>
  );
}
