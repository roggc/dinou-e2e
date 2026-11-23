import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

async function PaDynPageHole() {
  const ctx = getContext();
  const pVal = String(ctx?.req?.query?.p || "p0");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="pa-dyn-page-hole">
      <span id="pa-dyn-page-hole-val">{pVal}</span>
      <span id="pa-dyn-page-hole-seq">{st.paDynPageHoleSeq}</span>
    </div>
  );
}

export default function ParallelAsymDynPage() {
  const st = readCubeState();
  return (
    <article id="pa-dyn-page">
      <span id="pa-dyn-page-shell-seq">{st.paDynPageShellSeq}</span>
      <CubeClientProbe id="pa-dyn-page" />
      <DinouCacheSlot
        id="cube-pa-dyn-page-slot"
        tag="cube-pa-dyn-page-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="pa-dyn-page-slot-seq">{s.paDynPageSlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span id="pa-dyn-page-hole-fb">pa-dp-fb</span>}>
        <PaDynPageHole />
      </Suspense>
    </article>
  );
}
