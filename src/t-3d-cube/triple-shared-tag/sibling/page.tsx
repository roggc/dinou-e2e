import { readCubeState } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

export default function TripleSharedTagSiblingPage() {
  const st = readCubeState();
  return (
    <main id="triple-shared-tag-sibling">
      <CubeControlBridge />
      <span id="tst-sibling-page-seq">{st.tstSiblingPageSeq}</span>
    </main>
  );
}
