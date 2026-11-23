import { readCubeState } from "../../../shared/cube-state";

export default function CubeHsSdpDynExplicitPage() {
  const st = readCubeState();
  return (
    <main id="cube-hssdp-dyn-exp">
      <span id="hssdp-dyn-exp-seq">{st.hsSdpDynExplicitSeq}</span>
    </main>
  );
}
