import { getContext } from "dinou";
import { readCubeState } from "../../../shared/cube-state";

export default function CubeHsSdpDynBailoutPage() {
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.hssdp_user || "anon");
  const st = readCubeState();
  return (
    <main id="cube-hssdp-dyn-bail">
      <span id="hssdp-dyn-bail-seq">{st.hsSdpDynBailoutSeq}</span>
      <span id="hssdp-dyn-bail-user">{user}</span>
    </main>
  );
}
