import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";

async function LcPageHole() {
  await cubeSleep(15);
  return <span id="lc-page-hole-seq">{readCubeState().lcPageHoleSeq}</span>;
}

export default function LifecycleStressPage() {
  const st = readCubeState();
  return (
    <article id="lc-page">
      <span id="lc-page-shell-seq">{st.lcPageShellSeq}</span>
      <CubeClientProbe id="lc-page" />
      <DinouCacheSlot
        id="cube-lc-page-slot"
        tag="cube-lc-page-slot-tag"
        revalidate={3600}
      >
        {async () => (
          <span id="lc-page-slot-seq">{readCubeState().lcPageSlotSeq}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span>lc-p-fb</span>}>
        <LcPageHole />
      </Suspense>
    </article>
  );
}
