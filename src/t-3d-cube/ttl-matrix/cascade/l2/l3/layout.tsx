import type { ReactNode } from "react";
import { readCubeState } from "../../../../shared/cube-state";

export default function TtlCascadeL3Layout({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <section id="ttl-cas-l3">
      <span id="ttl-cas-l3-seq">{s.ttlCasL3Seq}</span>
      {children}
    </section>
  );
}
