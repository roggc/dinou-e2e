import { readCubeState } from "../../shared/cube-state";

export default function CubeHsSdpStaticPage() {
  const st = readCubeState();
  return (
    <main id="cube-hssdp-page-s">
      <span id="hssdp-page-s-seq">{st.hsSdpStaticPageSeq}</span>
    </main>
  );
}
