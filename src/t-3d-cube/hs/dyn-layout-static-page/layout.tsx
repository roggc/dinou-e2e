import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function CubeHsAsymDynLayout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="cube-hs-asym-dyn-layout">
      <span id="hs-asym-dyn-layout-seq">{st.hsAsymDynLayoutSeq}</span>
      <CubeClientProbe id="hs-asym-dyn-layout" />
      <div>{children}</div>
    </div>
  );
}
