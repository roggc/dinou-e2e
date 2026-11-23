import { Suspense, useId, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe, CubeSlotWidget, CubeControlBridge } from "../shared/cube-client";

async function TsLayoutShellSlotBody() {
  const st = readCubeState();
  return (
    <div id="ts-layout-shell-slot-box">
      <span id="ts-layout-shell-slot-seq">{st.tsLayoutShellSlotSeq}</span>
      <CubeSlotWidget id="ts-l1-slot" slotSeq={st.tsLayoutShellSlotSeq} />
    </div>
  );
}

async function TsL1DynamicHole() {
  const ctx = getContext();
  const user = ctx?.req?.cookies?.ts_user || "anon";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="ts-l1-hole-wrap">
      <span id="ts-l1-hole-seq">{st.tsL1HoleSeq}</span>
      <span id="ts-l1-hole-user">{user}</span>
    </div>
  );
}

export default function TripleL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  const l1Uid = useId();
  return (
    <section id="ts-l1-layout" data-ts-l1-uid={l1Uid}>
      <h1>Cube X+Y+Z: Triple Synergy Deep</h1>
      <span id="ts-l1-shell-seq">{st.tsL1ShellSeq}</span>
      <CubeClientProbe id="ts-l1" />
      <CubeControlBridge />

      <DinouCacheSlot
        id="cube-ts-layout-shell-slot"
        tags={["cube-ts-tag-layout-shell-slot"]}
        revalidate={3600}
      >
        <TsLayoutShellSlotBody />
      </DinouCacheSlot>

      <Suspense fallback={<span id="ts-l1-hole-fb">loading-ts-l1</span>}>
        <TsL1DynamicHole />
      </Suspense>

      <nav style={{ display: "flex", gap: 8 }}>
        <Link id="link-ts-ppr-a" href="/t-3d-cube/triple">
          PPR A
        </Link>
        <Link id="link-ts-ppr-b" href="/t-3d-cube/triple/ppr-b">
          PPR B
        </Link>
        <Link id="link-ts-static-a" href="/t-3d-cube/triple/static-a">
          Static A
        </Link>
        <Link id="link-ts-nested" href="/t-3d-cube/triple/nested">
          Nested L2 PPR
        </Link>
        <Link id="link-ts-nested-static" href="/t-3d-cube/triple/nested/static-child">
          Nested Static Child
        </Link>
      </nav>

      <main id="ts-main">{children}</main>
    </section>
  );
}
