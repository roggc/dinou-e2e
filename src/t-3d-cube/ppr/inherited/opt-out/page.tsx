import { readCubeState } from "../../../shared/cube-state";

export default function CubePprInheritedOptOutPage() {
  const st = readCubeState();
  return (
    <main id="cube-ppr-inh-optout">
      <span id="ppr-inh-optout-seq">{st.pprInhOptOutSeq}</span>
    </main>
  );
}
