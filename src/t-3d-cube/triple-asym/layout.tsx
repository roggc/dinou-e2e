import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";

async function TaL1Hole() {
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.ta_user || "anon");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="ta-l1-hole">
      <span id="ta-l1-hole-user">{user}</span>
      <span id="ta-l1-hole-seq">{st.taL1HoleSeq}</span>
    </div>
  );
}

export default function TripleAsymL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="triple-asym-l1">
      <span id="ta-l1-shell-seq">{st.taL1ShellSeq}</span>
      <CubeClientProbe id="ta-l1" />
      <DinouCacheSlot id="cube-ta-l1-slot" tag="cube-ta-l1-slot-tag" revalidate={3600}>
        {async () => {
          const s = readCubeState();
          return <span id="ta-l1-slot-seq">{s.taL1SlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span>ta-l1-fb</span>}>
        <TaL1Hole />
      </Suspense>
      {children}
    </section>
  );
}
