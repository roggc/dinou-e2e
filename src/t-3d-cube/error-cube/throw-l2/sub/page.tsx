import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState } from "../../../shared/cube-state";

async function SubHole() {
  void getContext()?.req?.headers?.["x-err-sub"];
  await Promise.resolve();
  return <span id="err-sub-hole-seq">{readCubeState().errSubHoleSeq}</span>;
}

export default function ErrorCubeSubPage() {
  const s = readCubeState();
  return (
    <article id="err-sub-page">
      <h5>Sub PPR Page</h5>
      <span id="err-sub-shell-seq">{s.errSubShellSeq}</span>
      <Suspense fallback={<span id="err-sub-hole-fb">loading-sub</span>}>
        <SubHole />
      </Suspense>
    </article>
  );
}
