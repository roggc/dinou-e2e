import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function CubeHsAltDynL2Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="cube-hsalt-dyn-l2">
      <span id="hsalt-dyn-l2-seq">{st.hsAltDynL2Seq}</span>
      <CubeClientProbe id="hsalt-dyn-l2" />
      <div>{children}</div>
    </div>
  );
}
