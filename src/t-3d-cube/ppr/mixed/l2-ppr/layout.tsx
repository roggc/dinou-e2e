import React, { Suspense, type ReactNode } from "react";
import { getContext } from "dinou/server";
import { readCubeState, cubeSleep } from "../../../shared/cube-state";

async function PprMixedL2DynamicHole() {
  await cubeSleep(20);
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.mixed_user || "anon");
  const st = readCubeState();
  return (
    <div id="ppr-mixed-l2-hole">
      <span id="ppr-mixed-l2-hole-seq">{st.pprMixedL2HoleSeq}</span>
      <span id="ppr-mixed-l2-hole-user">{user}</span>
    </div>
  );
}

export default function CubePprMixedL2Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  const uid = React.useId();
  return (
    <div id="cube-ppr-mixed-l2" data-l2-uid={uid}>
      <span id="ppr-mixed-l2-shell-seq">{st.pprMixedL2ShellSeq}</span>
      <Suspense fallback={<span>mixed-l2-hole-fb</span>}>
        <PprMixedL2DynamicHole />
      </Suspense>
      <div>{children}</div>
    </div>
  );
}
