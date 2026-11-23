import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../shared/cube-state";

async function PaAltPageHole() {
  const ctx = getContext();
  const pVal = String(ctx?.req?.query?.p || "p0");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="pa-alt-page-hole">
      <span id="pa-alt-page-hole-val">{pVal}</span>
      <span id="pa-alt-page-hole-seq">{st.paAltPageHoleSeq}</span>
    </div>
  );
}

export default function ParallelAsymAltPage() {
  const st = readCubeState();
  return (
    <article id="pa-alt-page">
      <span id="pa-alt-page-shell-seq">{st.paAltPageShellSeq}</span>
      <Suspense fallback={<span id="pa-alt-page-hole-fb">pa-alt-p-fb</span>}>
        <PaAltPageHole />
      </Suspense>
    </article>
  );
}
