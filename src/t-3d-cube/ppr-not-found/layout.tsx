import { Suspense, type ReactNode } from "react";
import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

async function PprNfL1Hole() {
  await cubeSleep(15);
  return <span id="ppr-nf-l1-hole-seq">{readCubeState().pprNfL1HoleSeq}</span>;
}

export default function PprNotFoundL1Layout({
  children,
}: {
  children: ReactNode;
}) {
  const st = readCubeState();
  return (
    <section id="ppr-nf-l1-layout">
      <h1>Phase 3 Stage 5: PPR Dynamic Hole 404 &amp; not_found.tsx Isolation</h1>
      <span id="ppr-nf-l1-shell-seq">{st.pprNfL1ShellSeq}</span>
      <CubeClientProbe id="ppr-nf-l1" />
      <CubeControlBridge />
      <DinouCacheSlot
        id="cube-ppr-nf-l1-slot"
        tag="cube-ppr-nf-l1-slot-tag"
        revalidate={3600}
      >
        {async () => (
          <span id="ppr-nf-l1-slot-seq">{readCubeState().pprNfL1SlotSeq}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span>nf-l1-fb</span>}>
        <PprNfL1Hole />
      </Suspense>
      <nav style={{ display: "flex", gap: 8 }}>
        <Link id="link-ppr-nf-healthy" href="/t-3d-cube/ppr-not-found?ok=healthy">
          Healthy PPR
        </Link>
        <Link
          id="link-ppr-nf-hole-404"
          href="/t-3d-cube/ppr-not-found?missing=1&ok=soft404"
        >
          Hole 404
        </Link>
        <Link
          id="link-ppr-nf-missing-route"
          href="/t-3d-cube/ppr-not-found/does-not-exist?reason=soft-missing"
        >
          Missing Route 404
        </Link>
      </nav>
      <main id="ppr-nf-main">{children}</main>
    </section>
  );
}
