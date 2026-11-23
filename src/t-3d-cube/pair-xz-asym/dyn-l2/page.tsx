import { Suspense } from "react";
import { getContext, noDynamic } from "dinou";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

async function PairXzCollapsedStaticSuspense() {
  noDynamic();
  await cubeSleep(5);
  const st = readCubeState();
  return <span id="pxz-page-static-susp-seq">{st.pairXzPageStaticSuspSeq}</span>;
}

async function PairXzPageDynamicHole() {
  const ctx = getContext();
  const mode = String(ctx?.req?.query?.mode || "std");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="pxz-page-hole">
      <span id="pxz-page-hole-mode">{mode}</span>
      <span id="pxz-page-hole-seq">{st.pairXzPageHoleSeq}</span>
    </div>
  );
}

export default function PairXzAsymPage() {
  const st = readCubeState();
  return (
    <main id="pair-xz-asym-page">
      <CubeControlBridge />
      <span id="pxz-page-shell-seq">{st.pairXzPageShellSeq}</span>
      <Suspense fallback={<span>pxz-static-fb</span>}>
        <PairXzCollapsedStaticSuspense />
      </Suspense>
      <Suspense fallback={<span>pxz-page-fb</span>}>
        <PairXzPageDynamicHole />
      </Suspense>
    </main>
  );
}
