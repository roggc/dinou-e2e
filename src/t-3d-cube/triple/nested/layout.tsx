import { Suspense, useId, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

async function TsNestedLayoutSlotBody() {
  const st = readCubeState();
  return (
    <div id="ts-nested-layout-slot-box">
      <span id="ts-nested-layout-slot-seq">{st.tsNestedLayoutSlotSeq}</span>
    </div>
  );
}

async function TsL2DynamicHole() {
  const ctx = getContext();
  const ua = ctx?.req?.headers?.["user-agent"] ? "ok" : "anon";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <span id="ts-l2-hole-seq" data-ua={ua}>
      {st.tsL2HoleSeq}
    </span>
  );
}

export default function TripleNestedL2Layout({
  children,
}: {
  children: ReactNode;
}) {
  const st = readCubeState();
  const l2Uid = useId();
  return (
    <div id="ts-l2-layout" data-ts-l2-uid={l2Uid}>
      <span id="ts-l2-shell-seq">{st.tsL2ShellSeq}</span>
      <CubeClientProbe id="ts-l2" />

      <DinouCacheSlot
        id="cube-ts-nested-layout-slot"
        tags={["cube-ts-tag-nested-layout-slot"]}
        revalidate={3600}
      >
        <TsNestedLayoutSlotBody />
      </DinouCacheSlot>

      <Suspense fallback={<span id="ts-l2-hole-fb">loading-ts-l2</span>}>
        <TsL2DynamicHole />
      </Suspense>

      {children}
    </div>
  );
}
