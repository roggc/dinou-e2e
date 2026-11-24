import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState } from "../../shared/cube-state";

async function GuardsLandedHole() {
  void getContext()?.req?.headers?.["x-guards-hole"];
  await Promise.resolve();
  return <span id="guards-landed-hole-seq">{readCubeState().guardsLandedHoleSeq}</span>;
}

export default function GuardsLandedPage() {
  return (
    <article id="guards-landed-page">
      <h3>Guards Landed Target</h3>
      <span id="guards-landed-shell-seq">{readCubeState().guardsLandedShellSeq}</span>
      <Suspense fallback={<span id="guards-landed-hole-fb">loading-landed</span>}>
        <GuardsLandedHole />
      </Suspense>
    </article>
  );
}
