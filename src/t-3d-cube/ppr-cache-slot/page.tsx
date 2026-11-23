import { Suspense } from "react";
import { noDynamic } from "dinou";
import { DinouCacheSlot, getContext } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { cubePingAction } from "../shared/cube-actions";
import {
  CubeClientProbe,
  CubeSlotWidget,
  CubeControlBridge,
} from "../shared/cube-client";

async function SynStaticSuspenseBoundary() {
  noDynamic();
  await cubeSleep(5);
  const st = readCubeState();
  return (
    <div id="syn-static-suspense-box">
      <span id="syn-static-suspense-host">{st.synStaticSuspenseHostSeq}</span>
      <DinouCacheSlot
        id="cube-syn-static-suspense-slot"
        tag="cube-syn-static-suspense-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return (
            <span id="syn-static-suspense-slot-seq">
              {s.synStaticSuspenseSlotSeq}
            </span>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

async function SynDynamicHole1() {
  await cubeSleep(15);
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.syn_user || "anon");
  return (
    <div id="syn-hole1-box">
      <span id="syn-hole1-user">{user}</span>
      <DinouCacheSlot
        id="cube-syn-hole-nocache-slot"
        tag="cube-syn-hole-nocache-slot-tag"
        revalidate={0}
      >
        {async () => (
          <span id="syn-hole-nocache-slot-seq">
            {readCubeState().synHoleNoCacheSlotSeq}
          </span>
        )}
      </DinouCacheSlot>
      <DinouCacheSlot
        id="cube-syn-hole-slot-a"
        tag="cube-syn-hole-slot-a-tag"
        revalidate={3600}
      >
        {async () => (
          <span id="syn-hole-slot-a-seq">{readCubeState().synHoleSlotASeq}</span>
        )}
      </DinouCacheSlot>
      <DinouCacheSlot
        id="cube-syn-hole-ttl-slot"
        tag="cube-syn-hole-ttl-slot-tag"
        revalidate={1}
      >
        {async () => (
          <span id="syn-hole-ttl-slot-seq">
            {readCubeState().synHoleTtlSlotSeq}
          </span>
        )}
      </DinouCacheSlot>
    </div>
  );
}

async function SynDynamicHole2() {
  await cubeSleep(15);
  const ctx = getContext();
  const session = String(ctx?.req?.cookies?.syn_session || "none");
  const st = readCubeState();
  return (
    <div id="syn-hole2-box">
      <span id="syn-hole2-session">{session}</span>
      <span id="syn-hole3-host-seq">{st.synHole3HostSeq}</span>
      <DinouCacheSlot
        id="cube-syn-client-slot"
        tag="cube-syn-client-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const inner = readCubeState();
          return (
            <div id="syn-client-slot-box">
              <span id="syn-client-slot-seq">{inner.synClientSlotSeq}</span>
              <CubeSlotWidget
                id="syn-hole"
                slotSeq={inner.synClientSlotSeq}
                onPing={cubePingAction}
              />
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

export default function CubePprCacheSlotDeepPage() {
  const st = readCubeState();
  return (
    <main id="cube-ppr-cache-slot-page">
      <span id="syn-shell-seq">{st.synShellSeq}</span>
      <CubeClientProbe id="syn-shell" />
      <CubeControlBridge />

      <DinouCacheSlot
        id="cube-syn-shell-slot"
        tag="cube-syn-shell-slot-tag"
        revalidate={3600}
      >
        {async () => (
          <span id="syn-shell-slot-seq">{readCubeState().synShellSlotSeq}</span>
        )}
      </DinouCacheSlot>

      <DinouCacheSlot
        id="cube-syn-shell-ttl-slot"
        tag="cube-syn-shell-ttl-slot-tag"
        revalidate={1}
      >
        {async () => (
          <span id="syn-shell-ttl-slot-seq">
            {readCubeState().synShellTtlSlotSeq}
          </span>
        )}
      </DinouCacheSlot>

      <Suspense fallback={<span>syn-static-susp-fb</span>}>
        <SynStaticSuspenseBoundary />
      </Suspense>

      <Suspense fallback={<span>syn-hole1-fb</span>}>
        <SynDynamicHole1 />
      </Suspense>

      <Suspense fallback={<span>syn-hole2-fb</span>}>
        <SynDynamicHole2 />
      </Suspense>
    </main>
  );
}
