import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

export default function CubeHsCsL1Layout({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  const st = readCubeState();
  return (
    <section id="cube-hscs-l1-layout">
      <span id="hscs-l1-host">{st.hscsL1HostSeq}</span>
      <CubeClientProbe id="hscs-l1" />
      <CubeControlBridge />

      <DinouCacheSlot
        id="cube-hscs-l1-outer"
        tag="cube-hscs-l1-outer-tag"
        revalidate={3600}
      >
        {async () => {
          const outer = readCubeState();
          return (
            <div id="hscs-l1-outer-box">
              <span id="hscs-l1-outer-seq">{outer.hscsL1OuterSlotSeq}</span>
              <DinouCacheSlot
                id="cube-hscs-l1-inner"
                tag="cube-hscs-l1-inner-tag"
                revalidate={3600}
              >
                {async () => (
                  <span id="hscs-l1-inner-seq">
                    {readCubeState().hscsL1InnerSlotSeq}
                  </span>
                )}
              </DinouCacheSlot>
            </div>
          );
        }}
      </DinouCacheSlot>

      <div>{sidebar}</div>
      <div>{children}</div>
    </section>
  );
}
