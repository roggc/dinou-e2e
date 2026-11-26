import { getContext, redirect } from "dinou";
import { readCubeState } from "../shared/cube-state";

export default function MidIsrCausalStaticPage() {
  const s = readCubeState();
  if (s.misCausalMode === "gone410") {
    getContext()?.res?.status?.(410);
    return (
      <article id="mis-causal-410" data-status="410">
        <span id="mis-causal-seq">{s.misCausalSeq}</span>
        <span>Causal Gone 410</span>
      </article>
    );
  }
  if (s.misCausalMode === "redirect") {
    return redirect("/t-3d-cube/mid-isr-status/target");
  }
  return (
    <article id="mis-causal-active" data-status="200">
      <span id="mis-causal-seq">{s.misCausalSeq}</span>
    </article>
  );
}
