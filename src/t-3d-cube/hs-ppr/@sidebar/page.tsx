import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../shared/cube-state";

async function HsPprSidebarHole() {
  const ctx = getContext();
  const ua = ctx?.req?.headers?.["user-agent"] ? "ok" : "anon";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <span id="hsppr-sidebar-hole" data-ua={ua}>
      {st.hspprSidebarHoleSeq}
    </span>
  );
}

export default function HsPprSidebar() {
  const st = readCubeState();
  return (
    <aside id="hsppr-sidebar-box">
      <span id="hsppr-sidebar-shell">{st.hspprSidebarShellSeq}</span>
      <Suspense fallback={<span id="hsppr-sidebar-hole-fb">loading-sb</span>}>
        <HsPprSidebarHole />
      </Suspense>
    </aside>
  );
}
