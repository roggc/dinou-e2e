import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export default function CubeHsCsNestedPage() {
  const st = readCubeState();
  return (
    <main id="cube-hscs-nested-page">
      <span id="hscs-nested-page-host">{st.hscsNestedPageHostSeq}</span>
      <DinouCacheSlot
        id="cube-hscs-nested-page-slot"
        tag="cube-hscs-nested-page-slot-tag"
        revalidate={3600}
      >
        {async () => (
          <span id="hscs-nested-page-slot-seq">
            {readCubeState().hscsNestedPageSlotSeq}
          </span>
        )}
      </DinouCacheSlot>
    </main>
  );
}
