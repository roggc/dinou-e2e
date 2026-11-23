import { Suspense } from "react";
import { getContext } from "dinou";
import {
  readCubeState,
  cubeSleep,
  incrementStampedeShellExecs,
} from "../shared/cube-state";
import { CubeControlBridge } from "../shared/cube-client";

async function PprStampedeDynamicHole() {
  await cubeSleep(30);
  const st = readCubeState();
  return <span id="ppr-stampede-hole-seq">{st.pprStampedeHoleSeq}</span>;
}

export default async function CubePprStampedePage() {
  const ctx = getContext() as any;
  const isShellBuild =
    Boolean(ctx?._isStaticHtmlRender || ctx?.platformContext?.isSSG) &&
    !ctx?._isPprRuntimeResume;
  if (isShellBuild) {
    incrementStampedeShellExecs();
    await cubeSleep(40);
  }
  const st = readCubeState();
  return (
    <main id="cube-ppr-stampede-page">
      <CubeControlBridge />
      <span id="ppr-stampede-shell-seq">{st.pprStampedeShellSeq}</span>
      <Suspense fallback={<span>stampede-hole-fb</span>}>
        <PprStampedeDynamicHole />
      </Suspense>
    </main>
  );
}
