import { Suspense } from "react";
import { readCubeState, cubeSleep } from "../../shared/cube-state";

async function InheritedHole() {
  await cubeSleep(15);
  const st = readCubeState();
  return <span id="ppr-inh-hole-seq">{st.pprInhHoleSeq}</span>;
}

export default function CubePprInheritedPage() {
  const st = readCubeState();
  return (
    <main id="cube-ppr-inh-page">
      <span id="ppr-inh-shell-seq">{st.pprInhShellSeq}</span>
      <Suspense fallback={<span>inh-hole-fb</span>}>
        <InheritedHole />
      </Suspense>
    </main>
  );
}
