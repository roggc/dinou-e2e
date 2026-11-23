import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function CubeHsSdpL2Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="cube-hssdp-l2">
      <span id="hssdp-l2-seq">{st.hsSdpL2Seq}</span>
      <CubeClientProbe id="hssdp-l2" />
      <div>{children}</div>
    </div>
  );
}
