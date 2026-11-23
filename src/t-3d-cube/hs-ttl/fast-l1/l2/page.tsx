import { readCubeState } from "../../../shared/cube-state";

export default function CubeHsTtlAPageSlow() {
  const st = readCubeState();
  return (
    <main id="cube-hsttl-a-page">
      <span id="hsttl-a-page-seq">{st.hsTtlAPageSlowSeq}</span>
    </main>
  );
}
