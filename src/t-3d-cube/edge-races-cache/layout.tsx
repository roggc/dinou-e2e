import type { ReactNode } from "react";
import { Link } from "dinou";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

export default function EdgeRacesCacheLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <div id="er-l1-root">
      <CubeControlBridge />
      <CubeClientProbe id="er-l1" />
      <span id="er-l1-shell-seq">{s.erL1ShellSeq}</span>
      <nav>
        <Link id="link-er-multi" href="/t-3d-cube/edge-races-cache/multi-slot">
          Multi Slot
        </Link>
        <Link id="link-er-sub1" href="/t-3d-cube/edge-races-cache/sub1-slots">
          Sub1 Slots
        </Link>
        <Link id="link-er-rc-ppr" href="/t-3d-cube/edge-races-cache/react-cache-ppr">
          React Cache PPR
        </Link>
        <Link id="link-er-rc-asym" href="/t-3d-cube/edge-races-cache/react-cache-asym">
          React Cache Asym
        </Link>
      </nav>
      <main id="er-l1-main">{children}</main>
    </div>
  );
}
