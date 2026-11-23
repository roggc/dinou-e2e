import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";

async function PaSidebarHole() {
  const ctx = getContext();
  const sbVal = String(ctx?.req?.cookies?.pa_sb || "sb0");
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="pa-sidebar-hole">
      <span id="pa-sidebar-hole-val">{sbVal}</span>
      <span id="pa-sidebar-hole-seq">{st.paSidebarHoleSeq}</span>
    </div>
  );
}

export default function ParallelAsymSidebar() {
  const st = readCubeState();
  return (
    <aside id="pa-sidebar">
      <span id="pa-sidebar-shell-seq">{st.paSidebarShellSeq}</span>
      <DinouCacheSlot
        id="cube-pa-sidebar-slot"
        tag="cube-pa-sidebar-slot-tag"
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="pa-sidebar-slot-seq">{s.paSidebarSlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span id="pa-sidebar-hole-fb">pa-sb-fb</span>}>
        <PaSidebarHole />
      </Suspense>
    </aside>
  );
}
