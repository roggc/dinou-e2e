import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../shared/cube-state";

async function TsNestedPprHole() {
  const ctx = getContext();
  const ua = ctx?.req?.headers?.["user-agent"] ? "ok" : "anon";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <span id="ts-nested-ppr-hole-host-seq" data-ua={ua}>
      {st.tsNestedPprHoleHostSeq}
    </span>
  );
}

export default function TripleNestedPprPage() {
  const st = readCubeState();
  return (
    <article id="ts-nested-ppr-page">
      <span id="ts-nested-ppr-shell-seq">{st.tsNestedPprShellSeq}</span>
      <Suspense fallback={<span id="ts-nested-ppr-hole-fb">loading-ts-nested</span>}>
        <TsNestedPprHole />
      </Suspense>
    </article>
  );
}
