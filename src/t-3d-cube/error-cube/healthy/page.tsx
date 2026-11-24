import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState } from "../../shared/cube-state";

async function HealthyHole() {
  void getContext()?.req?.headers?.["x-err-healthy"];
  await Promise.resolve();
  return <span id="err-healthy-hole-seq">{readCubeState().errHealthyHoleSeq}</span>;
}

export default function ErrorCubeHealthyPage() {
  const s = readCubeState();
  return (
    <article id="err-healthy-page">
      <h4>Healthy Page</h4>
      <span id="err-healthy-shell-seq">{s.errHealthyShellSeq}</span>
      <Suspense fallback={<span id="err-healthy-hole-fb">loading-healthy</span>}>
        <HealthyHole />
      </Suspense>
    </article>
  );
}
