import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

export default function TtlCascadeL1Layout({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <section id="ttl-cas-l1">
      <span id="ttl-cas-l1-seq">{s.ttlCasL1Seq}</span>
      <CubeControlBridge />
      {children}
    </section>
  );
}
