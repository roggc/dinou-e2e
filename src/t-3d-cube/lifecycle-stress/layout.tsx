import { Suspense, type ReactNode } from "react";
import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge, CubePendingShell } from "../shared/cube-client";

async function LcL1Hole() {
  await cubeSleep(15);
  return <span id="lc-l1-hole-seq">{readCubeState().lcL1HoleSeq}</span>;
}

export default function LifecycleStressL1Layout({
  children,
}: {
  children: ReactNode;
}) {
  const st = readCubeState();
  return (
    <section id="lc-l1-layout">
      <h1>Phase 3 Stage 4: Client Slot & History Lifecycle Stress</h1>
      <span id="lc-l1-shell-seq">{st.lcL1ShellSeq}</span>
      <CubeClientProbe id="lc-l1" />
      <CubeControlBridge />
      <CubePendingShell id="lc-l1">
        <DinouCacheSlot
          id="cube-lc-l1-slot"
          tag="cube-lc-l1-slot-tag"
          revalidate={3600}
        >
          {async () => (
            <span id="lc-l1-slot-seq">{readCubeState().lcL1SlotSeq}</span>
          )}
        </DinouCacheSlot>
      </CubePendingShell>
      <Suspense fallback={<span>lc-l1-fb</span>}>
        <LcL1Hole />
      </Suspense>
      <nav style={{ display: "flex", gap: 8 }}>
        <Link id="link-lc-no-layout" href="/t-3d-cube/lifecycle-stress/no-layout">
          Go No-Layout
        </Link>
        <Link id="link-lc-reset-layout" href="/t-3d-cube/lifecycle-stress/reset-layout">
          Go Reset-Layout
        </Link>
      </nav>
      <main id="lc-main">{children}</main>
    </section>
  );
}
