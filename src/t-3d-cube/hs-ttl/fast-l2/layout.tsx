import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

export default function CubeHsTtlBL1SlowLayout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="cube-hsttl-b-l1">
      <span id="hsttl-b-l1-seq">{st.hsTtlBL1SlowSeq}</span>
      <CubeControlBridge />
      <div>{children}</div>
    </section>
  );
}
