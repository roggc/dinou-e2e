import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { cubePingAction } from "../shared/cube-actions";
import { CubeClientProbe, CubeSlotWidget } from "../shared/cube-client";

async function TsPageShellSlotBody() {
  const st = readCubeState();
  return (
    <div id="ts-page-shell-slot-box">
      <span id="ts-page-shell-slot-seq">{st.tsPageShellSlotSeq}</span>
      <CubeSlotWidget id="ts-page-slot" slotSeq={st.tsPageShellSlotSeq} />
    </div>
  );
}

async function TsPprATtlShellSlotBody() {
  const st = readCubeState();
  return (
    <div id="ts-ppr-a-ttl-shell-slot-box">
      <span id="ts-ppr-a-ttl-shell-slot-seq">{st.tsPprATtlShellSlotSeq}</span>
    </div>
  );
}

async function TsHoleSlotBody() {
  const st = readCubeState();
  return (
    <div id="ts-hole-slot-box">
      <span id="ts-hole-slot-seq">{st.tsHoleSlotSeq}</span>
      <CubeSlotWidget
        id="ts-hole-slot"
        slotSeq={st.tsHoleSlotSeq}
        onPing={cubePingAction}
      />
    </div>
  );
}

async function TsHoleSlot2Body() {
  const st = readCubeState();
  return (
    <div id="ts-hole-slot-2-box">
      <span id="ts-hole-slot-2-seq">{st.tsHoleSlot2Seq}</span>
    </div>
  );
}

async function TsPprADynamicHole() {
  const ctx = getContext();
  const ua = ctx?.req?.headers?.["user-agent"] ? "ok" : "anon";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="ts-ppr-a-hole-wrap" data-ua={ua}>
      <span id="ts-ppr-a-hole-host-seq">{st.tsPprAHoleHostSeq}</span>
      <CubeClientProbe id="ts-hole-host" />
      <DinouCacheSlot
        id="cube-ts-hole-slot"
        tags={["cube-ts-tag-hole-slot"]}
        revalidate={3600}
      >
        <TsHoleSlotBody />
      </DinouCacheSlot>
      <DinouCacheSlot
        id="cube-ts-hole-slot-2"
        tags={["cube-ts-tag-hole-slot-2"]}
        revalidate={3600}
      >
        <TsHoleSlot2Body />
      </DinouCacheSlot>
    </div>
  );
}

export default function TriplePprAPage() {
  const st = readCubeState();
  return (
    <article id="ts-ppr-a-page">
      <span id="ts-ppr-a-shell-seq">{st.tsPprAShellSeq}</span>
      <CubeClientProbe id="ts-page-a" />

      <DinouCacheSlot
        id="cube-ts-page-shell-slot"
        tags={["cube-ts-tag-page-shell-slot"]}
        revalidate={3600}
      >
        <TsPageShellSlotBody />
      </DinouCacheSlot>

      <DinouCacheSlot
        id="cube-ts-ppr-a-ttl-shell-slot"
        tags={["cube-ts-tag-ttl-shell-slot"]}
        revalidate={1}
      >
        <TsPprATtlShellSlotBody />
      </DinouCacheSlot>

      <Suspense fallback={<span id="ts-ppr-a-hole-fb">loading-ts-hole</span>}>
        <TsPprADynamicHole />
      </Suspense>
    </article>
  );
}
