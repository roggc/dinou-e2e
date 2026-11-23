import { readCubeState } from "../../../shared/cube-state";

export default function CubeHsAltStaticPage() {
  const st = readCubeState();
  return (
    <main id="cube-hsalt-page-s">
      <span id="hsalt-page-s-seq">{st.hsAltStaticPageSeq}</span>
    </main>
  );
}
