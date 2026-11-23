import type { ReactNode } from "react";
import { readCubeState } from "../shared/cube-state";
import { CubeControlBridge } from "../shared/cube-client";

export default function CubeHsImpL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="cube-hsimp-l1">
      <span id="hsimp-l1-seq">{st.hsImpL1Seq}</span>
      <CubeControlBridge />
      <div>{children}</div>
    </section>
  );
}
