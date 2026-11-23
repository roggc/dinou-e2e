import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";

async function GrpOuterHole() {
  const tag = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <span id="grp-outer-hole-seq">
      {`${tag}-${s.grpOuterHoleSeq}`}
    </span>
  );
}

export default function GroupCollisionOuterLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="grp-outer-layout" data-layout="outer">
      <div id="grp-outer-shell">
        <span id="grp-outer-shell-seq">{s.grpOuterShellSeq}</span>
        <CubeClientProbe id="grp-outer" />
        <DinouCacheSlot
          id="cube-grp-outer-slot"
          revalidate={3600}
          tags={["cube-grp-outer-slot-tag"]}
        >
          {async () => (
            <span id="grp-outer-slot-seq">{readCubeState().grpOuterSlotSeq}</span>
          )}
        </DinouCacheSlot>
        <Suspense fallback={<span id="grp-outer-hole-fb">loading-outer</span>}>
          <GrpOuterHole />
        </Suspense>
      </div>
      {children}
    </section>
  );
}
