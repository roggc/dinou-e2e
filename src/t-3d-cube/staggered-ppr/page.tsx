import { Suspense } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";

function clampMs(raw: unknown, fallback: number, max = 4000): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

async function FastHoleA() {
  const q = getContext()?.req?.query || {};
  const fastMs = clampMs(q.fastMs, 15, 500);
  const tag = String(q.tag || "base");
  await cubeSleep(fastMs);
  const s = readCubeState();
  return <span id="stag-hole-a">{`fast:${tag}-${s.stagHoleASeq}`}</span>;
}

async function SlowHoleB() {
  const q = getContext()?.req?.query || {};
  const slowMs = clampMs(q.slowMs, 350, 4000);
  const tag = String(q.tag || "base");
  await cubeSleep(slowMs);
  const s = readCubeState();
  return (
    <div id="stag-hole-b-wrap">
      <span id="stag-hole-b">{`slow:${tag}-${s.stagHoleBSeq}`}</span>
      <DinouCacheSlot
        id="cube-stag-slow-slot"
        revalidate={3600}
        tags={["cube-stag-slow-slot-tag"]}
      >
        {async () => (
          <span id="stag-slow-slot-seq">{readCubeState().stagSlowSlotSeq}</span>
        )}
      </DinouCacheSlot>
    </div>
  );
}

export default function StaggeredPprPage() {
  const s = readCubeState();
  return (
    <article id="stag-page">
      <h3>Staggered PPR Streaming Page</h3>
      <span id="stag-shell-seq">{s.stagShellSeq}</span>
      <DinouCacheSlot
        id="cube-stag-shell-slot"
        revalidate={3600}
        tags={["cube-stag-shell-slot-tag"]}
      >
        {async () => (
          <span id="stag-shell-slot-seq">{readCubeState().stagShellSlotSeq}</span>
        )}
      </DinouCacheSlot>
      <nav style={{ display: "flex", gap: 8, margin: "6px 0" }}>
        <Link id="link-stag-away" href="/t-3d-cube/staggered-ppr/hub" prefetch={false}>
          Abort to Hub
        </Link>
        <Link id="link-stag-away-ppr" href="/t-3d-cube/ppr" prefetch={false}>
          Abort to PPR
        </Link>
      </nav>
      <div id="stag-fast-region">
        <Suspense fallback={<span id="stag-hole-a-fb">loading-fast-a</span>}>
          <FastHoleA />
        </Suspense>
      </div>
      <div id="stag-slow-region">
        <Suspense fallback={<span id="stag-hole-b-fb">loading-slow-b</span>}>
          <SlowHoleB />
        </Suspense>
      </div>
    </article>
  );
}
