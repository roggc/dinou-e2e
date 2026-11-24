import { Suspense, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

async function GuardsL1Hole() {
  void getContext()?.req?.headers?.["x-guards-hole"];
  await Promise.resolve();
  return <span id="guards-l1-hole-seq">{readCubeState().guardsL1HoleSeq}</span>;
}

export default function GuardsL1Layout({ children }: { children: ReactNode }) {
  const s = readCubeState();
  return (
    <section id="guards-l1-layout">
      <CubeClientProbe id="guards-l1" />
      <span id="guards-l1-shell-seq">{s.guardsL1ShellSeq}</span>
      <DinouCacheSlot
        id="cube-guards-l1-slot"
        revalidate={3600}
        tags={["cube-guards-l1-slot-tag"]}
      >
        {async () => (
          <span id="guards-l1-slot-seq">{readCubeState().guardsL1SlotSeq}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span id="guards-l1-hole-fb">loading-l1</span>}>
        <GuardsL1Hole />
      </Suspense>
      <nav id="guards-l1-nav" style={{ display: "flex", gap: 8, margin: "6px 0" }}>
        <Link id="link-guards-allowed" href="/t-3d-cube/guards/item/allowed-1" prefetch={false}>
          Allowed
        </Link>
        <Link id="link-guards-forbidden" href="/t-3d-cube/guards/item/forbidden" prefetch={false}>
          Forbidden
        </Link>
        <Link id="link-guards-badchar" href="/t-3d-cube/guards/item/bad$char" prefetch={false}>
          BadChar
        </Link>
        <Link id="link-guards-bounce" href="/t-3d-cube/guards/item/bounce" prefetch={false}>
          Bounce
        </Link>
        <Link id="link-guards-strict-known" href="/t-3d-cube/guards/strict/known" prefetch={false}>
          StrictKnown
        </Link>
        <Link id="link-guards-strict-unknown" href="/t-3d-cube/guards/strict/unknown-id" prefetch={false}>
          StrictUnknown
        </Link>
        <Link id="link-guards-landed" href="/t-3d-cube/guards/landed" prefetch={false}>
          Landed
        </Link>
      </nav>
      {children}
      <CubeControlBridge />
    </section>
  );
}
