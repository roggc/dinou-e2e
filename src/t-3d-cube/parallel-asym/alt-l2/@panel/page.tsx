import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../../shared/cube-state";

async function PaAltPanelHole() {
  const ctx = getContext();
  const user = String(ctx?.req?.cookies?.pa_user || "anon");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="pa-alt-panel-hole">
      <span id="pa-alt-panel-hole-user">{user}</span>
      <span id="pa-alt-panel-hole-seq">{st.paAltPanelHoleSeq}</span>
    </div>
  );
}

export default function ParallelAsymAltPanel() {
  const st = readCubeState();
  return (
    <aside id="pa-alt-panel">
      <span id="pa-alt-panel-shell-seq">{st.paAltPanelShellSeq}</span>
      <DinouCacheSlot
        id="cube-pa-alt-panel-slot"
        tag="cube-pa-alt-panel-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return (
            <span id="pa-alt-panel-slot-seq">{s.paAltPanelSlotSeq}</span>
          );
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span id="pa-alt-panel-hole-fb">pa-ap-fb</span>}>
        <PaAltPanelHole />
      </Suspense>
    </aside>
  );
}
