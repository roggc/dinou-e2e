import type { ReactNode } from "react";
import { readCubeState } from "../../../shared/cube-state";
import { CubeControlBridge } from "../../../shared/cube-client";

export default function TtlDynFnLayout({
  children,
  params,
}: {
  children: ReactNode;
  params?: { id?: string };
}) {
  const s = readCubeState();
  const id = params?.id || "unknown";
  const seq =
    id === "fast"
      ? s.ttlDynFnFastLSeq
      : id === "slow"
      ? s.ttlDynFnSlowLSeq
      : s.ttlDynFnLiveLSeq;
  return (
    <section id="ttl-dynfn-l" data-id={id}>
      <span id="ttl-dynfn-l-seq">{seq}</span>
      <CubeControlBridge />
      {children}
    </section>
  );
}
