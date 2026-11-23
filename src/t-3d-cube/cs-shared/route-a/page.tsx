import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

export default function CubeCsSharedRouteAPage() {
  const st = readCubeState();
  return (
    <main id="cube-cs-shared-route-a">
      <CubeControlBridge />
      <span id="csshared-a-host-seq">{st.csSharedHostASeq}</span>
      <Link id="link-csshared-to-b" href="/t-3d-cube/cs-shared/route-b">
        Go Route B
      </Link>
      <div id="csshared-a-slot-wrap">
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
