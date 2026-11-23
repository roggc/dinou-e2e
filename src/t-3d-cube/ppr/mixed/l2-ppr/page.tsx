import { readCubeState } from "../../../shared/cube-state";

export default function CubePprMixedStaticPage() {
  const st = readCubeState();
  return (
    <main id="cube-ppr-mixed-static-page">
      <span id="ppr-mixed-static-page-seq">{st.pprMixedStaticPageSeq}</span>
    </main>
  );
}
