import { Suspense, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";

async function CatchAllOuterHole() {
  const tag = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <span id="ca-outer-hole-seq">
      {`${tag}-${s.caOuterHoleSeq}`}
    </span>
  );
}

export default function CatchAllOuterLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="ca-outer-layout">
      <span id="ca-outer-shell-seq">{s.caOuterShellSeq}</span>
      <CubeClientProbe id="ca-outer" />
      <DinouCacheSlot
        id="cube-ca-outer-slot"
        revalidate={3600}
        tags={["cube-ca-outer-slot-tag"]}
      >
        {async () => (
          <span id="ca-outer-slot-seq">{readCubeState().caOuterSlotSeq}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span>loading-ca-outer</span>}>
        <CatchAllOuterHole />
      </Suspense>
      <nav id="ca-nav" style={{ display: "flex", gap: 8 }}>
        <Link id="link-ca-root" href="/t-3d-cube/catchall-isg">
          CatchAll Root (0)
        </Link>
        <Link id="link-ca-docs" href="/t-3d-cube/catchall-isg/docs">
          CatchAll Docs (1)
        </Link>
        <Link id="link-ca-docs-v2" href="/t-3d-cube/catchall-isg/docs/v2">
          CatchAll Docs v2 (2)
        </Link>
      </nav>
      {children}
    </section>
  );
}
