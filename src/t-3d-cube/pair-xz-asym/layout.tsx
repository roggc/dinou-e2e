import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";

async function PairXzL1DynamicHole() {
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.pxz_user || "anon");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="pxz-l1-hole">
      <span id="pxz-l1-hole-user">{user}</span>
      <span id="pxz-l1-hole-seq">{st.pairXzL1HoleSeq}</span>
    </div>
  );
}

export default function PairXzAsymL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="pair-xz-l1">
      <span id="pxz-l1-shell-seq">{st.pairXzL1ShellSeq}</span>
      <CubeClientProbe id="pxz-l1" />
      <Suspense fallback={<span>pxz-l1-fb</span>}>
        <PairXzL1DynamicHole />
      </Suspense>
      {children}
    </section>
  );
}
