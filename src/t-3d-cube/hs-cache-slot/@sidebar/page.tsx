import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export default function CubeHsCsSidebarSlot() {
  const st = readCubeState();
  return (
    <aside id="hscs-sidebar">
      <span id="hscs-sidebar-host">{st.hscsSidebarHostSeq}</span>
      <DinouCacheSlot
        id="cube-hscs-sidebar-slot"
        tag="cube-hscs-sidebar-slot-tag"
        revalidate={3600}
      >
        {async () => (
          <span id="hscs-sidebar-slot-seq">
            {readCubeState().hscsSidebarSlotSeq}
          </span>
        )}
      </DinouCacheSlot>
    </aside>
  );
}
