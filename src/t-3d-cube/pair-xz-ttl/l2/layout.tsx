import { Suspense, type ReactNode } from "react";
import { readCubeState, cubeSleep } from "../../shared/cube-state";

async function PairXzTtlL2Hole() {
  await cubeSleep(15);
  const st = readCubeState();
  return <span id="pxzttl-l2-hole-seq">{st.pairXzTtlL2HoleSeq}</span>;
}

export default function PairXzTtlL2Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="pair-xz-ttl-l2">
      <span id="pxzttl-l2-shell-seq">{st.pairXzTtlL2ShellSeq}</span>
      <Suspense fallback={<span>pxzttl-l2-fb</span>}>
        <PairXzTtlL2Hole />
      </Suspense>
      {children}
    </div>
  );
}
