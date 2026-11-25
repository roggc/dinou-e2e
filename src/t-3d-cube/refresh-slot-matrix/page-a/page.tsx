import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";

async function RsmNoCacheHole() {
  void getContext()?.req?.headers?.["user-agent"];
  await cubeSleep(10);
  return (
    <div id="rsm-hole">
      <DinouCacheSlot
        id="cube-rsm-nocache"
        revalidate={0}
        tags={["cube-rsm-nocache-tag"]}
      >
        {async () => (
          <span id="rsm-nocache-seq">{readCubeState().rsmNoCacheSeq}</span>
        )}
      </DinouCacheSlot>
    </div>
  );
}

export default function RefreshSlotMatrixPageA() {
  const s = readCubeState();
  return (
    <article id="rsm-page-a">
      <span id="rsm-page-a-shell-seq">{s.rsmPageAShellSeq}</span>
      <DinouCacheSlot
        id="cube-rsm-shared-cart"
        revalidate={3600}
        tags={["cube-rsm-shared-cart-tag"]}
      >
        {async () => (
          <span id="rsm-cart-seq">{readCubeState().rsmSharedCartSeq}</span>
        )}
      </DinouCacheSlot>
      <DinouCacheSlot
        id="cube-rsm-page-shared-tag"
        revalidate={3600}
        tags={["rsm-shared", "rsm-page-shared-only"]}
      >
        {async () => (
          <span id="rsm-page-shared-seq">{readCubeState().rsmPageASharedTagSeq}</span>
        )}
      </DinouCacheSlot>
      <DinouCacheSlot
        id="cube-rsm-outer"
        revalidate={3600}
        tags={["cube-rsm-outer-tag"]}
      >
        {async () => (
          <div id="rsm-outer-wrap">
            <span id="rsm-outer-seq">{readCubeState().rsmOuterSeq}</span>
            <DinouCacheSlot
              id="cube-rsm-inner"
              revalidate={3600}
              tags={["cube-rsm-inner-tag"]}
            >
              {async () => (
                <span id="rsm-inner-seq">{readCubeState().rsmInnerSeq}</span>
              )}
            </DinouCacheSlot>
          </div>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span id="rsm-hole-fb">loading-rsm-hole</span>}>
        <RsmNoCacheHole />
      </Suspense>
    </article>
  );
}
