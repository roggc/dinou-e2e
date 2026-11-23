import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeControlBridge } from "../shared/cube-client";

export default function CubeCacheSlotBidirectionalPage() {
  return (
    <main id="cube-cache-slot-page">
      <CubeControlBridge />

      <DinouCacheSlot
        id="cube-cs-nested-outer"
        tag="cube-cs-tag-nested-outer"
        revalidate={3600}
      >
        {async () => {
          const st = readCubeState();
          return (
            <div id="cs-nested-outer-box">
              <span id="cs-nested-outer-seq">{st.csNestedOuterSeq}</span>
              <DinouCacheSlot
                id="cube-cs-nested-inner"
                tag="cube-cs-tag-nested-inner"
                revalidate={3600}
              >
                {async () => {
                  const inner = readCubeState();
                  return (
                    <div id="cs-nested-inner-box">
                      <span id="cs-nested-inner-seq">{inner.csNestedInnerSeq}</span>
                    </div>
                  );
                }}
              </DinouCacheSlot>
            </div>
          );
        }}
      </DinouCacheSlot>

      <DinouCacheSlot
        id="cube-cs-fast"
        tag="cube-cs-tag-fast"
        revalidate={1}
      >
        {async () => {
          const st = readCubeState();
          return <span id="cs-fast-seq">{st.csFastSeq}</span>;
        }}
      </DinouCacheSlot>

      <DinouCacheSlot
        id="cube-cs-alpha"
        tag="cube-cs-tag-alpha"
        revalidate={3600}
      >
        {async () => {
          const st = readCubeState();
          return <span id="cs-alpha-seq">{st.csAlphaSeq}</span>;
        }}
      </DinouCacheSlot>
    </main>
  );
}
