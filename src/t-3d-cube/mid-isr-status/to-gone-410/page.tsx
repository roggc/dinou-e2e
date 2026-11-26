import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState } from "../../shared/cube-state";

async function MisGone410Hole() {
  void getContext()?.req?.headers?.["x-mis-hole"];
  await Promise.resolve();
  return <span id="mis-410-hole-seq">{readCubeState().misGone410HoleSeq}</span>;
}

export default function MidIsrToGone410Page() {
  const s = readCubeState();
  if (s.misGone410Flag) {
    getContext()?.res?.status?.(410);
    return (
      <article id="mis-410-retired" data-status="410">
        <span id="mis-410-msg">Product Retired (410 Gone)</span>
        <span id="mis-410-seq">{s.misGone410PageSeq}</span>
      </article>
    );
  }
  return (
    <article id="mis-410-active" data-status="200">
      <span id="mis-410-seq">{s.misGone410PageSeq}</span>
      <Suspense fallback={<span id="mis-410-hole-fb">loading-410-hole</span>}>
        <MisGone410Hole />
      </Suspense>
    </article>
  );
}
