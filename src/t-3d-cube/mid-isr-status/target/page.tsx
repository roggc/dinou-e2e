import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function MidIsrTargetPage() {
  const s = readCubeState();
  return (
    <article id="mis-target-page" data-landed="true">
      <h2>Mid-ISR Redirect Target</h2>
      <span id="mis-target-seq">{s.misTargetPageSeq}</span>
      <CubeClientProbe id="mis-target" />
    </article>
  );
}
