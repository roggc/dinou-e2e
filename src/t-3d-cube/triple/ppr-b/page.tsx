import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../shared/cube-state";

async function TsPprBHole() {
  const ctx = getContext();
  const ua = ctx?.req?.headers?.["user-agent"] ? "ok" : "anon";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <span id="ts-ppr-b-hole-seq" data-ua={ua}>
      {st.tsPprBHoleSeq}
    </span>
  );
}

export default function TriplePprBPage() {
  const st = readCubeState();
  return (
    <article id="ts-ppr-b-page">
      <span id="ts-ppr-b-shell-seq">{st.tsPprBShellSeq}</span>
      <Suspense fallback={<span id="ts-ppr-b-hole-fb">loading-ts-b</span>}>
        <TsPprBHole />
      </Suspense>
    </article>
  );
}
