import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

export default function CubeCsErrorPage() {
  const hostSt = readCubeState();
  return (
    <main id="cube-cs-error-page">
      <CubeControlBridge />
      <span id="cserr-host-seq">{hostSt.csErrHostSeq}</span>
      <CubeClientProbe id="cserr-host" />

      <div id="cserr-fragile-wrap">
        <DinouCacheSlot
          id="cube-cs-fragile"
          tag="cube-cs-tag-fragile"
          revalidate={3600}
        >
          {async () => {
            const st = readCubeState();
            if (st.csFragileShouldThrow) {
              throw new Error("Simulated fragile DinouCacheSlot explosion");
            }
            return <span id="cserr-fragile-seq">{st.csFragileSeq}</span>;
          }}
        </DinouCacheSlot>
      </div>

      <div id="cserr-healthy-wrap">
        <DinouCacheSlot
          id="cube-cs-healthy"
          tag="cube-cs-tag-healthy"
          revalidate={3600}
        >
          {async () => {
            const st = readCubeState();
            return <span id="cserr-healthy-seq">{st.csHealthySeq}</span>;
          }}
        </DinouCacheSlot>
      </div>
    </main>
  );
}
