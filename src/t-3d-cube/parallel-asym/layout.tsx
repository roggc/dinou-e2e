import { Suspense, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

async function PaL1Hole() {
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.pa_user || "anon");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="pa-l1-hole">
      <span id="pa-l1-hole-user">{user}</span>
      <span id="pa-l1-hole-seq">{st.paL1HoleSeq}</span>
    </div>
  );
}

export default function ParallelAsymL1Layout({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  const st = readCubeState();
  return (
    <section id="parallel-asym-l1">
      <h1>Phase 3 Stage 3: Parallel Routes in Asymmetric 3D Chains</h1>
      <span id="pa-l1-shell-seq">{st.paL1ShellSeq}</span>
      <CubeClientProbe id="pa-l1" />
      <CubeControlBridge />
      <DinouCacheSlot
        id="cube-pa-l1-slot"
        tag="cube-pa-l1-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="pa-l1-slot-seq">{s.paL1SlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span id="pa-l1-hole-fb">pa-l1-fb</span>}>
        <PaL1Hole />
      </Suspense>
      <nav style={{ display: "flex", gap: 8 }}>
        <Link id="link-pa-dyn" href="/t-3d-cube/parallel-asym/dyn-l2?p=nav-dyn">
          Dynamic L2 Branch
        </Link>
        <Link id="link-pa-alt" href="/t-3d-cube/parallel-asym/alt-l2?p=nav-alt">
          Static PPR Alt L2 Branch
        </Link>
      </nav>
      {sidebar}
      <main id="pa-main">{children}</main>
    </section>
  );
}
