import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../../shared/cube-state";
import { CubeControlBridge } from "../../../shared/cube-client";

async function SettingsHole() {
  const tag = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <span id="grp-settings-hole-seq">
      {`${tag}-${s.grpBetaSettingsHoleSeq}`}
    </span>
  );
}

export default function GroupBetaSettingsPage() {
  const s = readCubeState();
  return (
    <article id="grp-settings-page">
      <h3>Beta Settings</h3>
      <span id="grp-settings-shell-seq">{s.grpBetaSettingsShellSeq}</span>
      <Suspense fallback={<span>loading-settings</span>}>
        <SettingsHole />
      </Suspense>
      <CubeControlBridge />
    </article>
  );
}
