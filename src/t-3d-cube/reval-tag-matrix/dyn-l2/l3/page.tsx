import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../../shared/cube-state";
import { CubeControlBridge } from "../../../shared/cube-client";

async function RevalTagMatrixHole() {
  const q = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <div id="tm-hole">
      <span id="tm-hole-host-seq">{`${q}-${s.tmHoleHostSeq}`}</span>
      <DinouCacheSlot
        id="cube-tm-hole-slot"
        revalidate={3600}
        tags={["cube-tm-shared-matrix", "cube-tm-hole-only"]}
      >
        {async () => (
          <span id="tm-hole-slot-seq">{readCubeState().tmHoleSlotSeq}</span>
        )}
      </DinouCacheSlot>
    </div>
  );
}

export default function RevalTagMatrixPage() {
  const s = readCubeState();
  return (
    <article id="tm-page">
      <span id="tm-page-shell-seq">{s.tmPageShellSeq}</span>
      <DinouCacheSlot
        id="cube-tm-page-slot"
        revalidate={3600}
        tags={["cube-tm-shared-matrix", "cube-tm-page-only"]}
      >
        {async () => (
          <span id="tm-page-slot-seq">{readCubeState().tmPageSlotSeq}</span>
        )}
      </DinouCacheSlot>
      <DinouCacheSlot
        id="cube-tm-outer-slot"
        revalidate={3600}
        tags={["cube-tm-outer-tag"]}
      >
        {async () => (
          <div id="tm-outer-wrap">
            <span id="tm-outer-slot-seq">{readCubeState().tmOuterSlotSeq}</span>
            <DinouCacheSlot
              id="cube-tm-inner-slot"
              revalidate={3600}
              tags={["cube-tm-inner-tag"]}
            >
              {async () => (
                <span id="tm-inner-slot-seq">{readCubeState().tmInnerSlotSeq}</span>
              )}
            </DinouCacheSlot>
          </div>
        )}
      </DinouCacheSlot>
      <DinouCacheSlot
        id="cube-tm-pf-a"
        revalidate={3600}
        tags={["cube-tm-partial-fail", "cube-tm-pf-a-only"]}
      >
        {async () => (
          <span id="tm-pf-a-seq">{readCubeState().tmPfASeq}</span>
        )}
      </DinouCacheSlot>
      <DinouCacheSlot
        id="cube-tm-pf-b"
        revalidate={3600}
        tags={["cube-tm-partial-fail", "cube-tm-pf-b-only"]}
      >
        {async () => {
          const st = readCubeState();
          if (st.tmThrowSlotB) {
            throw new Error("Transient E2E Slot B Boom");
          }
          return <span id="tm-pf-b-seq">{st.tmPfBSeq}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span id="tm-hole-fb">loading-tm-hole</span>}>
        <RevalTagMatrixHole />
      </Suspense>
      <CubeControlBridge />
    </article>
  );
}
