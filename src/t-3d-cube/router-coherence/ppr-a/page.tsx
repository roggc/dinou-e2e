import { Suspense } from "react";
import { getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

async function PprADynamicHole() {
  const reqTag = String(getContext()?.req?.headers?.["x-rc-hole"] || "live");
  const st = readCubeState();
  return (
    <div id="rc-ppr-a-hole" data-req-tag={reqTag}>
      <span id="rc-ppr-a-hole-seq">{st.rcPprAHoleSeq}</span>
    </div>
  );
}

export default function RouterCoherencePprAPage() {
  const st = readCubeState();
  return (
    <article id="rc-ppr-a-page">
      <h2>PPR Route A</h2>
      <span id="rc-ppr-a-shell-seq">{st.rcPprAShellSeq}</span>
      <Suspense fallback={<div id="rc-ppr-a-hole-fb">Loading Hole A...</div>}>
        <PprADynamicHole />
      </Suspense>
    </article>
  );
}
