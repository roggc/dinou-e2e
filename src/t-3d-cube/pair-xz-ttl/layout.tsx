import { Suspense, type ReactNode } from "react";
import { readCubeState, cubeSleep } from "../shared/cube-state";

async function PairXzTtlL1Hole() {
  await cubeSleep(15);
  const st = readCubeState();
  return <span id="pxzttl-l1-hole-seq">{st.pairXzTtlL1HoleSeq}</span>;
}

export default function PairXzTtlL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="pair-xz-ttl-l1">
      <span id="pxzttl-l1-shell-seq">{st.pairXzTtlL1ShellSeq}</span>
      <Suspense fallback={<span>pxzttl-l1-fb</span>}>
        <PairXzTtlL1Hole />
      </Suspense>
      {children}
    </section>
  );
}
