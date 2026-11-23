import { Suspense } from "react";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

async function PairXzTtlPageHole() {
  await cubeSleep(15);
  const st = readCubeState();
  return <span id="pxzttl-page-hole-seq">{st.pairXzTtlPageHoleSeq}</span>;
}

export default function PairXzTtlPage() {
  const st = readCubeState();
  return (
    <main id="pair-xz-ttl-page">
      <CubeControlBridge />
      <span id="pxzttl-page-shell-seq">{st.pairXzTtlPageShellSeq}</span>
      <Suspense fallback={<span>pxzttl-page-fb</span>}>
        <PairXzTtlPageHole />
      </Suspense>
    </main>
  );
}
