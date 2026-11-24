import type { ReactNode } from "react";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

export default function StaggeredPprLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="stag-l1-layout" style={{ border: "1px solid #a855f7", padding: 8 }}>
      <h2>Staggered PPR L1 Layout</h2>
      <span id="stag-l1-shell-seq">{s.stagL1ShellSeq}</span>
      <CubeClientProbe id="stag-l1" />
      <div id="stag-l1-children">{children}</div>
      <CubeControlBridge />
    </section>
  );
}
