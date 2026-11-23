import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../shared/cube-state";

async function HsPprBHole() {
  const ctx = getContext();
  const ua = ctx?.req?.headers?.["user-agent"] ? "ok" : "anon";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <span id="hsppr-b-hole" data-ua={ua}>
      {st.hspprBHoleSeq}
    </span>
  );
}

export default function HsPprBPage() {
  const st = readCubeState();
  return (
    <article id="hsppr-b-page">
      <span id="hsppr-b-shell">{st.hspprBShellSeq}</span>
      <Suspense fallback={<span id="hsppr-b-hole-fb">loading-b-hole</span>}>
        <HsPprBHole />
      </Suspense>
    </article>
  );
}
