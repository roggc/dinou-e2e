import type { ReactNode } from "react";
import { readCubeState } from "../../../shared/cube-state";

export default function TtlAsymDynL2Layout({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <section id="ttl-asym-l2">
      <span id="ttl-asym-l2-host">{s.ttlAsymL2HostSeq}</span>
      {children}
    </section>
  );
}
