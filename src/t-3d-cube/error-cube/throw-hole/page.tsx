import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState } from "../../shared/cube-state";

async function FragilePprHole() {
  void getContext()?.req?.headers?.["x-err-hole"];
  await Promise.resolve();
  const s = readCubeState();
  if (s.errThrowHole) {
    throw new Error("Transient PPR Hole Fault");
  }
  return (
    <div id="err-throw-hole-ok">
      <span id="err-throw-hole-seq">{s.errThrowHoleSeq}</span>
    </div>
  );
}

export default function ErrorCubeThrowHolePage() {
  const s = readCubeState();
  return (
    <article id="err-throw-hole-page">
      <h4>ThrowHole PPR Page</h4>
      <span id="err-throw-hole-shell-seq">{s.errThrowHoleShellSeq}</span>
      <div id="err-throw-hole-slot">
        <Suspense fallback={<span id="err-throw-hole-fb">loading-hole</span>}>
          <FragilePprHole />
        </Suspense>
      </div>
    </article>
  );
}
