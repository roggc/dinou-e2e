import type { ReactNode } from "react";
import { readCubeState } from "../../../shared/cube-state";

export default function CubeHsTtlBL2FastLayout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="cube-hsttl-b-l2">
      <span id="hsttl-b-l2-seq">{st.hsTtlBL2FastSeq}</span>
      <div>{children}</div>
    </div>
  );
}
