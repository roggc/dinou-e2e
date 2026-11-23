import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";

async function IsgL1Hole() {
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.isg_user || "anon");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="isg-l1-hole">
      <span id="isg-l1-hole-user">{user}</span>
      <span id="isg-l1-hole-seq">{st.isgL1HoleSeq}</span>
    </div>
  );
}

export default function IsgParamL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="isg-param-l1">
      <span id="isg-l1-shell-seq">{st.isgL1ShellSeq}</span>
      <CubeClientProbe id="isg-l1" />
      <DinouCacheSlot id="cube-isg-l1-slot" tag="cube-isg-l1-slot-tag" revalidate={3600}>
        {async () => {
          const s = readCubeState();
          return <span id="isg-l1-slot-seq">{s.isgL1SlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span>isg-l1-fb</span>}>
        <IsgL1Hole />
      </Suspense>
      {children}
    </section>
  );
}
