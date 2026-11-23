import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../../shared/cube-state";
import { CubeClientProbe } from "../../../shared/cube-client";

async function TaL3Hole() {
  const ctx = getContext();
  const l3Val = String(ctx?.req?.query?.l3 || "std");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="ta-l3-hole">
      <span id="ta-l3-hole-val">{l3Val}</span>
      <span id="ta-l3-hole-seq">{st.taL3HoleSeq}</span>
    </div>
  );
}

export default function TripleAsymL3Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="triple-asym-l3">
      <span id="ta-l3-shell-seq">{st.taL3ShellSeq}</span>
      <CubeClientProbe id="ta-l3" />
      <DinouCacheSlot id="cube-ta-l3-slot" tag="cube-ta-l3-slot-tag" revalidate={3600}>
        {async () => {
          const s = readCubeState();
          return <span id="ta-l3-slot-seq">{s.taL3SlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span>ta-l3-fb</span>}>
        <TaL3Hole />
      </Suspense>
      {children}
    </div>
  );
}
