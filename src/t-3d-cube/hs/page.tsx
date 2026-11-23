import { readCubeState } from "../shared/cube-state";

export default function CubeHsIndexPage() {
  const st = readCubeState();
  return (
    <main id="cube-hs-index-page">
      <span id="hs-index-seq">{st.hsIndexPageSeq}</span>
    </main>
  );
}
