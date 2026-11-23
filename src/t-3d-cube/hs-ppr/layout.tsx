import { Suspense, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

async function HsPprL1Hole() {
  const ctx = getContext();
  const user = ctx?.req?.cookies?.hsppr_user || "guest";
  await cubeSleep(15);
  const st = readCubeState();
  return (
    <div id="hsppr-l1-hole-wrap">
      <span id="hsppr-l1-hole-seq">{st.hspprL1HoleSeq}</span>
      <span id="hsppr-l1-hole-user">{user}</span>
    </div>
  );
}

export default function HsPprL1Layout({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  const st = readCubeState();
  return (
    <section id="hsppr-l1-layout">
      <h1>Cube X+Z: HS + PPR Deep</h1>
      <span id="hsppr-l1-shell">{st.hspprL1ShellSeq}</span>
      <CubeClientProbe id="hsppr-l1" />
      <CubeControlBridge />
      <Suspense fallback={<span id="hsppr-l1-hole-fb">loading-l1</span>}>
        <HsPprL1Hole />
      </Suspense>
      <nav style={{ display: "flex", gap: 8 }}>
        <Link id="link-hsppr-a" href="/t-3d-cube/hs-ppr">
          PPR A
        </Link>
        <Link id="link-hsppr-b" href="/t-3d-cube/hs-ppr/ppr-b">
          PPR B
        </Link>
        <Link id="link-hsppr-optout" href="/t-3d-cube/hs-ppr/static-optout">
          Static Opt-Out
        </Link>
        <Link id="link-hsppr-nested" href="/t-3d-cube/hs-ppr/nested">
          Nested L2 PPR
        </Link>
      </nav>
      {sidebar}
      <main id="hsppr-main">{children}</main>
    </section>
  );
}
