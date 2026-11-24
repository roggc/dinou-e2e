import { Suspense, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";
import {
  ClientUseIdProbe,
  ClientUseIdAncestorWrapper,
} from "./components/use-id-probe";
import { ServerUseIdProbe } from "./components/server-use-id-probe";

async function UidL1Hole() {
  void getContext()?.req?.headers?.["x-uid-hole"];
  await Promise.resolve();
  const s = readCubeState();
  return (
    <div id="uid-l1-hole">
      <ClientUseIdProbe owner="l1-hole" seq={s.uidL1HoleSeq} />
      <ServerUseIdProbe owner="l1-hole" seq={s.uidL1HoleSeq} />
    </div>
  );
}

export default function UseIdCubeL1Layout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="uid-l1-layout" style={{ border: "1px solid #0ea5e9", padding: 8 }}>
      <h2>useId 3D Cube L1 Layout</h2>
      <CubeClientProbe id="uid-l1" />
      <ClientUseIdProbe owner="l1-shell" seq={s.uidL1ShellSeq} />
      <ServerUseIdProbe owner="l1-shell" seq={s.uidL1ShellSeq} />
      <DinouCacheSlot
        id="cube-uid-l1-slot"
        revalidate={3600}
        tags={["cube-uid-l1-slot-tag"]}
      >
        {async () => {
          const st = readCubeState();
          return (
            <div id="uid-l1-slot-box">
              <ClientUseIdProbe owner="l1-slot" seq={st.uidL1SlotSeq} />
              <ServerUseIdProbe owner="l1-slot" seq={st.uidL1SlotSeq} />
              <DinouCacheSlot
                id="cube-uid-l1-inner"
                revalidate={3600}
                tags={["cube-uid-l1-inner-tag"]}
              >
                {async () => {
                  const innerSt = readCubeState();
                  return (
                    <div id="uid-l1-inner-box">
                      <ClientUseIdProbe owner="l1-inner" seq={innerSt.uidL1InnerSeq} />
                      <ServerUseIdProbe owner="l1-inner" seq={innerSt.uidL1InnerSeq} />
                    </div>
                  );
                }}
              </DinouCacheSlot>
            </div>
          );
        }}
      </DinouCacheSlot>
      <ClientUseIdAncestorWrapper owner="l1-wrap">
        <Suspense fallback={<span id="uid-l1-hole-fb">loading-l1-hole</span>}>
          <UidL1Hole />
        </Suspense>
      </ClientUseIdAncestorWrapper>
      <nav id="uid-l1-nav" style={{ display: "flex", gap: 8, margin: "6px 0" }}>
        <Link id="link-uid-asym" href="/t-3d-cube/use-id-cube/asym" prefetch={false}>
          Asym 3D
        </Link>
        <Link id="link-uid-resume" href="/t-3d-cube/use-id-cube/ppr-resume" prefetch={false}>
          PPR Resume
        </Link>
      </nav>
      {children}
      <CubeControlBridge />
    </section>
  );
}
