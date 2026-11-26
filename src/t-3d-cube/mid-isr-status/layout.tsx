import { Suspense, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

async function MisL1Hole() {
  void getContext()?.req?.headers?.["x-mis-hole"];
  await Promise.resolve();
  return <span id="mis-l1-hole-seq">{readCubeState().misL1HoleSeq}</span>;
}

export default function MidIsrStatusL1Layout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="mis-l1-layout">
      <h1>Phase 7 Stage 1: Mid-ISR Non-200 Outcome Transitions</h1>
      <CubeClientProbe id="mis-l1" />
      <span id="mis-l1-shell-seq">{s.misL1ShellSeq}</span>
      <DinouCacheSlot
        id="cube-mis-l1-slot"
        revalidate={3600}
        tags={["cube-mis-l1-slot-tag"]}
      >
        {async () => (
          <span id="mis-l1-slot-seq">{readCubeState().misL1SlotSeq}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span id="mis-l1-hole-fb">loading-mis-l1</span>}>
        <MisL1Hole />
      </Suspense>
      <nav id="mis-l1-nav" style={{ display: "flex", gap: 8, margin: "6px 0" }}>
        <Link
          id="link-mis-not-found"
          href="/t-3d-cube/mid-isr-status/to-not-found/promo"
          prefetch={false}
          fresh
        >
          To NotFound
        </Link>
        <Link
          id="link-mis-gone-410"
          href="/t-3d-cube/mid-isr-status/to-gone-410"
          prefetch={false}
          fresh
        >
          To Gone 410
        </Link>
        <Link
          id="link-mis-redirect"
          href="/t-3d-cube/mid-isr-status/to-redirect"
          prefetch={false}
          fresh
        >
          To Redirect
        </Link>
        <Link
          id="link-mis-target"
          href="/t-3d-cube/mid-isr-status/target"
          prefetch={false}
          fresh
        >
          Target
        </Link>
      </nav>
      <main id="mis-main">{children}</main>
      <CubeControlBridge />
    </section>
  );
}
