import { readCubeState } from "../../../shared/cube-state";

export default function CubeHsTtlBPageSlow() {
  const st = readCubeState();
  return (
    <main id="cube-hsttl-b-page">
      <span id="hsttl-b-page-seq">{st.hsTtlBPageSlowSeq}</span>
    </main>
  );
}
