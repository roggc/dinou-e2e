import type { ReactNode } from "react";
import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

export default function RefreshSlotMatrixLayout({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <section id="rsm-l1">
      <span id="rsm-l1-shell-seq">{s.rsmL1ShellSeq}</span>
      <CubeClientProbe id="rsm-l1" />
      <DinouCacheSlot
        id="cube-rsm-l1-shared-tag"
        revalidate={3600}
        tags={["rsm-shared", "rsm-l1-shared-only"]}
      >
        {async () => (
          <span id="rsm-l1-shared-seq">{readCubeState().rsmL1SharedTagSeq}</span>
        )}
      </DinouCacheSlot>
      <DinouCacheSlot
        id="cube-rsm-ttl1"
        revalidate={1}
        tags={["cube-rsm-ttl1-tag"]}
      >
        {async () => (
          <span id="rsm-ttl1-seq">{readCubeState().rsmTtl1Seq}</span>
        )}
      </DinouCacheSlot>
      <nav style={{ display: "flex", gap: 8 }}>
        <Link id="link-rsm-page-a" href="/t-3d-cube/refresh-slot-matrix/page-a">
          Page A
        </Link>
        <Link id="link-rsm-page-b" href="/t-3d-cube/refresh-slot-matrix/page-b">
          Page B
        </Link>
      </nav>
      <CubeControlBridge />
      {children}
    </section>
  );
}
