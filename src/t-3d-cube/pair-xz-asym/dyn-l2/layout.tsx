import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function PairXzAsymDynL2Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="pair-xz-dyn-l2">
      <span id="pxz-dyn-l2-seq">{st.pairXzDynL2Seq}</span>
      <CubeClientProbe id="pxz-l2" />
      {children}
    </div>
  );
}
