import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function LifecycleResetPage() {
  const st = readCubeState();
  return (
    <article id="lc-rl-page">
      <span id="lc-rl-page-shell-seq">{st.lcResetPageShellSeq}</span>
      <CubeClientProbe id="lc-rl-page" />
      <DinouCacheSlot
        id="cube-lc-rl-page-slot"
        tag="cube-lc-rl-page-slot-tag"
        revalidate={3600}
      >
        {async () => (
          <span id="lc-rl-page-slot-seq">
            {readCubeState().lcResetPageSlotSeq}
          </span>
        )}
      </DinouCacheSlot>
    </article>
  );
}
