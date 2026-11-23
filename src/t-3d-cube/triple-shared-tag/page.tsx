import { Suspense } from "react";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeControlBridge } from "../shared/cube-client";

async function TstPageHole() {
  await cubeSleep(15);
  const st = readCubeState();
  return <span id="tst-page-hole-seq">{st.tstPageHoleSeq}</span>;
}

export default function TripleSharedTagPage() {
  const st = readCubeState();
  return (
    <main id="triple-shared-tag-page">
      <CubeControlBridge />
      <span id="tst-page-shell-seq">{st.tstPageShellSeq}</span>
      <Suspense fallback={<span>tst-page-fb</span>}>
        <TstPageHole />
      </Suspense>
    </main>
  );
}
