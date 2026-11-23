import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../../../shared/cube-client";

async function TaPageHole() {
  const ctx = getContext();
  const pmVal = String(ctx?.req?.query?.pm || "base");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="ta-page-hole">
      <span id="ta-page-hole-val">{pmVal}</span>
      <span id="ta-page-hole-host-seq">{st.taPageHoleHostSeq}</span>
      <DinouCacheSlot id="cube-ta-hole-slot" tag="cube-ta-hole-slot-tag" revalidate={3600}>
        {async () => {
          const s = readCubeState();
          return <span id="ta-hole-slot-seq">{s.taHoleSlotSeq}</span>;
        }}
      </DinouCacheSlot>
    </div>
  );
}

export default function TripleAsymPage() {
  const st = readCubeState();
  return (
    <main id="triple-asym-page">
      <CubeControlBridge />
      <span id="ta-page-shell-seq">{st.taPageShellSeq}</span>
      <CubeClientProbe id="ta-page" />
      <DinouCacheSlot
        id="cube-ta-page-shell-slot"
        tag="cube-ta-page-shell-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="ta-page-shell-slot-seq">{s.taPageShellSlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span>ta-page-fb</span>}>
        <TaPageHole />
      </Suspense>
    </main>
  );
}
