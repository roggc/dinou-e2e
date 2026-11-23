import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

export default function CubePprInheritedLayout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="cube-ppr-inh-layout">
      <span id="ppr-inh-layout-seq">{st.pprInhLayoutSeq}</span>
      <CubeControlBridge />
      <div>{children}</div>
    </section>
  );
}
