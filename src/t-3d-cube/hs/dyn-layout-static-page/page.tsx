import { readCubeState } from "../../shared/cube-state";

export default function CubeHsAsymStaticPage() {
  const st = readCubeState();
  return (
    <main id="cube-hs-asym-static-page">
      <span id="hs-asym-static-page-seq">{st.hsAsymStaticPageSeq}</span>
    </main>
  );
}
