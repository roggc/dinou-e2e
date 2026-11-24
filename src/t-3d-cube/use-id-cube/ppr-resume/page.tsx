import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import {
  ClientUseIdProbe,
  ClientUseIdAncestorWrapper,
} from "../components/use-id-probe";
import { ServerUseIdProbe } from "../components/server-use-id-probe";

async function ResumeHoleA() {
  void getContext()?.req?.headers?.["x-uid-resume-a"];
  await cubeSleep(15);
  const s = readCubeState();
  return (
    <div id="uid-resume-hole-a">
      <ClientUseIdProbe owner="resume-hole-a" seq={s.uidResumeHoleASeq} />
      <ServerUseIdProbe owner="resume-hole-a" seq={s.uidResumeHoleASeq} />
    </div>
  );
}

async function ResumeHoleB() {
  void getContext()?.req?.headers?.["x-uid-resume-b"];
  await cubeSleep(80);
  const s = readCubeState();
  return (
    <div id="uid-resume-hole-b">
      <ClientUseIdProbe owner="resume-hole-b" seq={s.uidResumeHoleBSeq} />
      <ServerUseIdProbe owner="resume-hole-b" seq={s.uidResumeHoleBSeq} />
    </div>
  );
}

export default function UseIdPprResumePage() {
  const s = readCubeState();
  return (
    <article id="uid-resume-page">
      <h4>Warm PPR Resume Page</h4>
      <ClientUseIdProbe owner="resume-shell" seq={s.uidResumeShellSeq} />
      <ServerUseIdProbe owner="resume-shell" seq={s.uidResumeShellSeq} />
      <DinouCacheSlot
        id="cube-uid-resume-slot"
        revalidate={3600}
        tags={["cube-uid-resume-slot-tag"]}
      >
        {async () => {
          const st = readCubeState();
          return (
            <div id="uid-resume-slot-box">
              <ClientUseIdProbe owner="resume-slot" seq={st.uidResumeSlotSeq} />
              <ServerUseIdProbe owner="resume-slot" seq={st.uidResumeSlotSeq} />
            </div>
          );
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span id="uid-resume-hole-a-fb">loading-ra</span>}>
        <ResumeHoleA />
      </Suspense>
      <ClientUseIdAncestorWrapper owner="resume-wrap">
        <Suspense fallback={<span id="uid-resume-hole-b-fb">loading-rb</span>}>
          <ResumeHoleB />
        </Suspense>
      </ClientUseIdAncestorWrapper>
    </article>
  );
}
