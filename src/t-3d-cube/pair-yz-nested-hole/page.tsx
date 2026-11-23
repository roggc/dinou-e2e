import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

async function PairYzDynamicHoleWithNestedSlots() {
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.pyz_user || "anon");
  await cubeSleep(15);
  const holeSt = readCubeState();
  return (
    <div id="pyz-dynamic-hole">
      <span id="pyz-hole-user">{user}</span>
      <span id="pyz-hole-host-seq">{holeSt.pairYzHoleHostSeq}</span>
      <DinouCacheSlot
        id="cube-yz-hole-outer"
        tag="cube-yz-hole-outer-tag"
        revalidate={3600}
      >
        {async () => {
          const oSt = readCubeState();
          return (
            <div id="pyz-hole-outer-box">
              <span id="pyz-hole-outer-seq">{oSt.pairYzHoleOuterSeq}</span>
              <CubeClientProbe id="pyz-outer" />
              <DinouCacheSlot
                id="cube-yz-hole-inner"
                tag="cube-yz-hole-inner-tag"
                revalidate={3600}
              >
                {async () => {
                  const iSt = readCubeState();
                  return (
                    <div id="pyz-hole-inner-box">
                      <span id="pyz-hole-inner-seq">{iSt.pairYzHoleInnerSeq}</span>
                      <CubeClientProbe id="pyz-inner" />
                    </div>
                  );
                }}
              </DinouCacheSlot>
              <DinouCacheSlot
                id="cube-yz-hole-inner-ttl"
                tag="cube-yz-hole-inner-ttl-tag"
                revalidate={1}
              >
                {async () => {
                  const tSt = readCubeState();
                  return <span id="pyz-hole-inner-ttl-seq">{tSt.pairYzHoleInnerTtlSeq}</span>;
                }}
              </DinouCacheSlot>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

export default function PairYzNestedHolePage() {
  const st = readCubeState();
  return (
    <main id="pair-yz-nested-hole-page">
      <CubeControlBridge />
      <span id="pyz-shell-seq">{st.pairYzShellSeq}</span>
      <CubeClientProbe id="pyz-shell" />
      <Suspense fallback={<span>pyz-hole-fb</span>}>
        <PairYzDynamicHoleWithNestedSlots />
      </Suspense>
    </main>
  );
}
