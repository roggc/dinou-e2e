import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../../shared/cube-state";

export default function ParallelAsymDynPanel() {
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.pa_user || "anon");
  const st = readCubeState();
  return (
    <aside id="pa-dyn-panel">
      <span id="pa-dyn-panel-host-seq">{st.paDynPanelHostSeq}</span>
      <span id="pa-dyn-panel-user">{user}</span>
      <DinouCacheSlot
        id="cube-pa-dyn-panel-slot"
        tag="cube-pa-dyn-panel-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return (
            <span id="pa-dyn-panel-slot-seq">{s.paDynPanelSlotSeq}</span>
          );
        }}
      </DinouCacheSlot>
    </aside>
  );
}
