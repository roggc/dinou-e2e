import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";

export default function ErrorCubeThrowL2Layout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  if (s.errThrowL2) {
    throw new Error("Transient Dynamic L2 Fault");
  }
  return (
    <section id="err-throw-l2-ok" style={{ border: "1px solid #f59e0b", padding: 6 }}>
      <h4>Dynamic L2 Healthy</h4>
      <span id="err-throw-l2-seq">{s.errThrowL2Seq}</span>
      {children}
    </section>
  );
}
