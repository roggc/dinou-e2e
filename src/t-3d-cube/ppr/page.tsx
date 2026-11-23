import { Suspense, memo } from "react";
import { noDynamic } from "dinou";
import { getContext } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

async function StaticSuspenseComponent() {
  noDynamic();
  await cubeSleep(5);
  const st = readCubeState();
  return <div id="ppr-rig-static-suspense-seq">{st.pprRigStaticSuspenseSeq}</div>;
}

async function HoleCookie() {
  await cubeSleep(15);
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.rig_user || "anon");
  const st = readCubeState();
  return (
    <div id="ppr-hole-cookie">
      <span id="ppr-hole-cookie-user">{user}</span>
      <span id="ppr-hole-cookie-seq">{st.pprHoleCookieSeq}</span>
    </div>
  );
}

async function HoleQuery() {
  await cubeSleep(10);
  const ctx = getContext();
  const theme = String(ctx?.req?.query?.theme || "default");
  const st = readCubeState();
  return (
    <div id="ppr-hole-query">
      <span id="ppr-hole-query-theme">{theme}</span>
      <span id="ppr-hole-query-seq">{st.pprHoleQuerySeq}</span>
    </div>
  );
}

async function HoleClientWidget() {
  await cubeSleep(12);
  const st = readCubeState();
  return (
    <div id="ppr-hole-client-box">
      <span id="ppr-hole-client-label">{`ppr-client-${st.pprHoleClientSeq}`}</span>
      <CubeClientProbe id="ppr-hole-client-widget" />
    </div>
  );
}

async function InnerDynamicInsideStatic() {
  await cubeSleep(10);
  const st = readCubeState();
  return <span id="ppr-hole-inner-in-static">{st.pprHoleInnerInStaticSeq}</span>;
}

async function OuterStaticWrapper() {
  noDynamic();
  await cubeSleep(5);
  const st = readCubeState();
  return (
    <div id="ppr-outer-static-box">
      <span id="ppr-outer-static-val">{st.pprOuterStaticVal}</span>
      <Suspense fallback={<span>inner-fb</span>}>
        <InnerDynamicInsideStatic />
      </Suspense>
    </div>
  );
}

async function DeepInnerDynamic() {
  await cubeSleep(10);
  const st = readCubeState();
  return <span id="ppr-hole-deep-inner">{st.pprHoleDeepInnerSeq}</span>;
}

async function OuterDynamicWrapper() {
  await cubeSleep(10);
  const st = readCubeState();
  return (
    <div id="ppr-outer-dyn-box">
      <span id="ppr-hole-outer-dyn">{st.pprHoleOuterDynSeq}</span>
      <Suspense fallback={<span>deep-fb</span>}>
        <DeepInnerDynamic />
      </Suspense>
    </div>
  );
}

const MemoDynamicHole = memo(async function MemoDynamicHoleInner() {
  await cubeSleep(10);
  const st = readCubeState();
  return <span id="ppr-hole-memo">{st.pprHoleMemoSeq}</span>;
});

export default function CubePprDeepPage() {
  const st = readCubeState();
  return (
    <main id="cube-ppr-deep-page">
      <div id="ppr-rig-shell-seq">{st.pprRigShellSeq}</div>
      <CubeControlBridge />

      <Suspense fallback={<span>static-susp-fb</span>}>
        <StaticSuspenseComponent />
      </Suspense>
      <Suspense fallback={<span>outer-static-fb</span>}>
        <OuterStaticWrapper />
      </Suspense>
      <Suspense fallback={<span>cookie-fb</span>}>
        <HoleCookie />
      </Suspense>
      <Suspense fallback={<span>query-fb</span>}>
        <HoleQuery />
      </Suspense>
      <Suspense fallback={<span>client-fb</span>}>
        <HoleClientWidget />
      </Suspense>
      <Suspense fallback={<span>outer-dyn-fb</span>}>
        <OuterDynamicWrapper />
      </Suspense>
      <Suspense fallback={<span>memo-fb</span>}>
        <MemoDynamicHole />
      </Suspense>
    </main>
  );
}
