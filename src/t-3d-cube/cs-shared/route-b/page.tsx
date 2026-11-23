import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

export default function CubeCsSharedRouteBPage() {
  const st = readCubeState();
  return (
    <main id="cube-cs-shared-route-b">
      <CubeControlBridge />
      <span id="csshared-b-host-seq">{st.csSharedHostBSeq}</span>
      <Link id="link-csshared-to-a" href="/t-3d-cube/cs-shared/route-a">
        Go Route A
      </Link>
      <div id="csshared-b-slot-wrap">
        <DinouCacheSlot
          id="cube-shared-global-slot"
          tags={["cube-shared-global-tag"]}
          revalidate={3600}
        >
          {async () => {
            const slotSt = readCubeState();
            return <span className="csshared-slot-val" data-slot-val="global">{slotSt.csSharedSlotSeq}</span>;
          }}
        </DinouCacheSlot>
      </div>
    </main>
  );
}
