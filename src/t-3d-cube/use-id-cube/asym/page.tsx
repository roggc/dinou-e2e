import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { ClientUseIdProbe } from "../components/use-id-probe";
import { ServerUseIdProbe } from "../components/server-use-id-probe";

async function AsymHoleA() {
  void getContext()?.req?.headers?.["x-uid-hole-a"];
  await cubeSleep(15);
  const s = readCubeState();
  return (
    <div id="uid-page-hole-a">
      <ClientUseIdProbe owner="page-hole-a" seq={s.uidPageHoleASeq} />
      <ServerUseIdProbe owner="page-hole-a" seq={s.uidPageHoleASeq} />
    </div>
  );
}

async function AsymHoleB() {
  void getContext()?.req?.headers?.["x-uid-hole-b"];
  await cubeSleep(80);
  const s = readCubeState();
  return (
    <div id="uid-page-hole-b">
      <ClientUseIdProbe owner="page-hole-b" seq={s.uidPageHoleBSeq} />
      <ServerUseIdProbe owner="page-hole-b" seq={s.uidPageHoleBSeq} />
    </div>
  );
}

export default function UseIdAsymPage() {
  const s = readCubeState();
  return (
    <article id="uid-asym-page">
      <h4>Asymmetric 3D PPR Page</h4>
      <ClientUseIdProbe owner="page-shell" seq={s.uidPageShellSeq} />
      <ServerUseIdProbe owner="page-shell" seq={s.uidPageShellSeq} />
      <DinouCacheSlot
        id="cube-uid-page-slot"
        revalidate={3600}
        tags={["cube-uid-page-slot-tag"]}
      >
        {async () => {
          const st = readCubeState();
          return (
            <div id="uid-page-slot-box">
              <ClientUseIdProbe owner="page-slot" seq={st.uidPageSlotSeq} />
              <ServerUseIdProbe owner="page-slot" seq={st.uidPageSlotSeq} />
            </div>
          );
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span id="uid-page-hole-a-fb">loading-a</span>}>
        <AsymHoleA />
      </Suspense>
      <Suspense fallback={<span id="uid-page-hole-b-fb">loading-b</span>}>
        <AsymHoleB />
      </Suspense>
    </article>
  );
}
