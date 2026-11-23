import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

export default function CubeHsTtlAL1FastLayout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="cube-hsttl-a-l1">
      <span id="hsttl-a-l1-seq">{st.hsTtlAL1FastSeq}</span>
      <CubeControlBridge />
      <div>{children}</div>
    </section>
  );
}
