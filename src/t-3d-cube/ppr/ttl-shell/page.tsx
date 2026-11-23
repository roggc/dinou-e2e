import { Suspense } from "react";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

async function PprTtlDynamicHole() {
  await cubeSleep(20);
  const st = readCubeState();
  return <span id="ppr-ttl-hole-seq">{st.pprTtlHoleSeq}</span>;
}

export default function CubePprTtlShellPage() {
  const st = readCubeState();
  return (
    <main id="cube-ppr-ttl-shell-page">
      <span id="ppr-ttl-shell-seq">{st.pprTtlShellSeq}</span>
      <CubeControlBridge />
      <Suspense fallback={<span>ttl-hole-fb</span>}>
        <PprTtlDynamicHole />
      </Suspense>
    </main>
  );
}
