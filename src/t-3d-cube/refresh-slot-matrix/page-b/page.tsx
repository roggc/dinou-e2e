import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export default function RefreshSlotMatrixPageB() {
  const s = readCubeState();
  return (
    <article id="rsm-page-b">
      <span id="rsm-page-b-shell-seq">{s.rsmPageBShellSeq}</span>
      <DinouCacheSlot
        id="cube-rsm-shared-cart"
        revalidate={3600}
        tags={["cube-rsm-shared-cart-tag"]}
      >
        {async () => (
          <span id="rsm-cart-seq">{readCubeState().rsmSharedCartSeq}</span>
        )}
      </DinouCacheSlot>
    </article>
  );
}
