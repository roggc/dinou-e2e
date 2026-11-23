import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function ParallelAsymDynL2Layout({
  children,
  panel,
}: {
  children: ReactNode;
  panel?: ReactNode;
}) {
  const st = readCubeState();
  return (
    <div id="pa-dyn-l2">
      <span id="pa-dyn-l2-host-seq">{st.paDynL2HostSeq}</span>
      <CubeClientProbe id="pa-dyn-l2" />
      {panel}
      {children}
    </div>
  );
}
