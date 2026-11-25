import type { ReactNode } from "react";
import { readCubeState } from "../../../shared/cube-state";

export default function TtlCascadeL2Layout({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <section id="ttl-cas-l2">
      <span id="ttl-cas-l2-seq">{s.ttlCasL2Seq}</span>
      {children}
    </section>
  );
}
