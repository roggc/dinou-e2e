import { readCubeState } from "../../../../shared/cube-state";

export default function CubeHsAltDynPage() {
  const st = readCubeState();
  return (
    <main id="cube-hsalt-page-d">
      <span id="hsalt-page-d-seq">{st.hsAltDynPageSeq}</span>
    </main>
  );
}
