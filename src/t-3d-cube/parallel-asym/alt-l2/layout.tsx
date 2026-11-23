import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function ParallelAsymAltL2Layout({
  children,
  panel,
}: {
  children: ReactNode;
  panel?: ReactNode;
}) {
  const st = readCubeState();
  return (
    <div id="pa-alt-l2">
      <span id="pa-alt-l2-shell-seq">{st.paAltL2ShellSeq}</span>
      <CubeClientProbe id="pa-alt-l2" />
      {panel}
      {children}
    </div>
  );
}
