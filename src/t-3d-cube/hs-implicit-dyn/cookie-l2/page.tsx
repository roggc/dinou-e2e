import { readCubeState } from "../../shared/cube-state";

export default function CubeHsImpStaticPage() {
  const st = readCubeState();
  return (
    <main id="cube-hsimp-page">
      <span id="hsimp-page-seq">{st.hsImpPageSeq}</span>
    </main>
  );
}
