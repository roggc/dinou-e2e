import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../shared/cube-state";

async function HsPprNestedHole() {
  const ctx = getContext();
  const ua = ctx?.req?.headers?.["user-agent"] ? "ok" : "anon";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <span id="hsppr-nested-hole" data-ua={ua}>
      {st.hspprNestedHoleSeq}
    </span>
  );
}

export default function HsPprNestedPage() {
  const st = readCubeState();
  return (
    <article id="hsppr-nested-page">
      <span id="hsppr-nested-shell">{st.hspprNestedShellSeq}</span>
      <Suspense fallback={<span id="hsppr-nested-hole-fb">loading-nested</span>}>
        <HsPprNestedHole />
      </Suspense>
    </article>
  );
}
