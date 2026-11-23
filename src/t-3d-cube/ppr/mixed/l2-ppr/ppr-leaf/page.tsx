import { Suspense } from "react";
import { getContext } from "dinou/server";
import { readCubeState, cubeSleep } from "../../../../shared/cube-state";

async function PprMixedLeafDynamicHole() {
  await cubeSleep(20);
  const ctx = getContext();
  const mode = String(ctx?.req?.query?.mode || "std");
  const st = readCubeState();
  return (
    <div id="ppr-mixed-leaf-hole">
      <span id="ppr-mixed-leaf-hole-seq">{st.pprMixedLeafHoleSeq}</span>
      <span id="ppr-mixed-leaf-hole-mode">{mode}</span>
    </div>
  );
}

export default function CubePprMixedPprLeafPage() {
  const st = readCubeState();
  return (
    <main id="cube-ppr-mixed-ppr-leaf">
      <span id="ppr-mixed-leaf-shell-seq">{st.pprMixedLeafShellSeq}</span>
      <Suspense fallback={<span>mixed-leaf-hole-fb</span>}>
        <PprMixedLeafDynamicHole />
      </Suspense>
    </main>
  );
}
