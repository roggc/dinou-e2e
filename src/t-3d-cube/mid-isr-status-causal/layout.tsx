import type { ReactNode } from "react";
import { readCubeState } from "../shared/cube-state";
import { CubeControlBridge } from "../shared/cube-client";

export default function MidIsrCausalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="mis-causal-layout">
      <span id="mis-causal-l1-seq">{s.misL1ShellSeq}</span>
      {children}
      <CubeControlBridge />
    </section>
  );
}
