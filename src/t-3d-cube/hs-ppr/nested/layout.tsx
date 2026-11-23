import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

async function HsPprL2Hole() {
  const ctx = getContext();
  const ua = ctx?.req?.headers?.["user-agent"] ? "ok" : "anon";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <span id="hsppr-l2-hole" data-ua={ua}>
      {st.hspprL2HoleSeq}
    </span>
  );
}

export default function HsPprL2Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="hsppr-l2-layout">
      <span id="hsppr-l2-shell">{st.hspprL2ShellSeq}</span>
      <CubeClientProbe id="hsppr-l2" />
      <Suspense fallback={<span id="hsppr-l2-hole-fb">loading-l2</span>}>
        <HsPprL2Hole />
      </Suspense>
      {children}
    </div>
  );
}
