import type { ReactNode } from "react";
import { Link } from "dinou";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

export default function HttpHeadHeadersLayout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <div id="hh-l1-root">
      <CubeControlBridge />
      <CubeClientProbe id="hh-l1" />
      <span id="hh-l1-shell-seq">{s.hhL1ShellSeq}</span>
      <nav>
        <Link id="link-hh-static" href="/t-3d-cube/http-head-headers/static-page">
          Static
        </Link>
        <Link id="link-hh-ppr" href="/t-3d-cube/http-head-headers/pure-ppr">
          Pure PPR
        </Link>
        <Link id="link-hh-asym" href="/t-3d-cube/http-head-headers/asym-l2">
          Asym L2
        </Link>
        <Link id="link-hh-dyn" href="/t-3d-cube/http-head-headers/dyn-page">
          Dyn
        </Link>
        <Link id="link-hh-tomb" href="/t-3d-cube/http-head-headers/tombstone">
          Tombstone
        </Link>
      </nav>
      <main id="hh-l1-main">{children}</main>
    </div>
  );
}
