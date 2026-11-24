import type { ReactNode } from "react";
import { readCubeState } from "../../../shared/cube-state";

export default function GuardsItemL2Layout({
  children,
  params,
}: {
  children: ReactNode;
  params?: { id?: string };
}) {
  return (
    <div id="guards-item-l2" data-item-id={params?.id || ""}>
      <span id="guards-item-l2-shell-seq">{readCubeState().guardsItemL2ShellSeq}</span>
      {children}
    </div>
  );
}
