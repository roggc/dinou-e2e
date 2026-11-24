import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { ClientUseIdProbe } from "../components/use-id-probe";
import { ServerUseIdProbe } from "../components/server-use-id-probe";

export default function UseIdAsymL2Layout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="uid-l2-layout" style={{ border: "1px solid #f59e0b", padding: 6 }}>
      <h3>Dynamic L2 Layout</h3>
      <ClientUseIdProbe owner="l2-dyn" seq={s.uidL2DynSeq} />
      <ServerUseIdProbe owner="l2-dyn" seq={s.uidL2DynSeq} />
      <DinouCacheSlot
        id="cube-uid-l2-slot"
        revalidate={3600}
        tags={["cube-uid-l2-slot-tag"]}
      >
        {async () => {
          const st = readCubeState();
          return (
            <div id="uid-l2-slot-box">
              <ClientUseIdProbe owner="l2-slot" seq={st.uidL2SlotSeq} />
              <ServerUseIdProbe owner="l2-slot" seq={st.uidL2SlotSeq} />
            </div>
          );
        }}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
