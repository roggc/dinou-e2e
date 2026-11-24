import { Suspense, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

async function ErrL1Hole() {
  void getContext()?.req?.headers?.["x-err-l1-hole"];
  await Promise.resolve();
  return <span id="err-l1-hole-seq">{readCubeState().errL1HoleSeq}</span>;
}

export default function ErrorCubeL1Layout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="err-l1-layout" style={{ border: "1px solid #ef4444", padding: 8 }}>
      <h2>Error Cube L1 Layout</h2>
      <CubeClientProbe id="err-l1" />
      <span id="err-l1-shell-seq">{s.errL1ShellSeq}</span>
      <DinouCacheSlot
        id="cube-err-l1-slot"
        revalidate={3600}
        tags={["cube-err-l1-slot-tag"]}
      >
        {async () => {
          const st = readCubeState();
          if (st.errThrowL1Slot) {
            throw new Error("Transient L1 CacheSlot Fault");
          }
          return <span id="err-l1-slot-seq">{st.errL1SlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span id="err-l1-hole-fb">loading-err-l1</span>}>
        <ErrL1Hole />
      </Suspense>
      <nav id="err-l1-nav" style={{ display: "flex", gap: 8, margin: "6px 0" }}>
        <Link id="link-err-healthy" href="/t-3d-cube/error-cube/healthy" prefetch={false}>
          Healthy
        </Link>
        <Link id="link-err-throw-page" href="/t-3d-cube/error-cube/throw-page" prefetch={false}>
          ThrowPage
        </Link>
        <Link id="link-err-throw-hole" href="/t-3d-cube/error-cube/throw-hole" prefetch={false}>
          ThrowHole
        </Link>
        <Link id="link-err-throw-l2" href="/t-3d-cube/error-cube/throw-l2/sub" prefetch={false}>
          ThrowL2
        </Link>
      </nav>
      {children}
      <CubeControlBridge />
    </section>
  );
}
