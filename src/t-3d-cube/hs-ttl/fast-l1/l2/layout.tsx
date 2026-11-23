import type { ReactNode } from "react";
import { readCubeState } from "../../../shared/cube-state";

export default function CubeHsTtlAL2SlowLayout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="cube-hsttl-a-l2">
      <span id="hsttl-a-l2-seq">{st.hsTtlAL2SlowSeq}</span>
      <div>{children}</div>
    </div>
  );
}
