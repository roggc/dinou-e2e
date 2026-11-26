import type { ReactNode } from "react";
import { Link } from "dinou";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";
import { RouterCoherenceBridge } from "./rc-controls";

export default function RouterCoherenceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const st = readCubeState();

  return (
    <section id="rc-l1-shell">
      <h1>Router Coherence 3D Cube L1</h1>
      <span id="rc-l1-shell-seq">{st.rcL1ShellSeq}</span>
      <CubeClientProbe id="rc-l1" />
      <CubeControlBridge />
      <RouterCoherenceBridge />
      <nav style={{ display: "flex", gap: 8, margin: "8px 0" }}>
        <Link id="link-rc-ppr-a" href="/t-3d-cube/router-coherence/ppr-a">
          PPR A
        </Link>
        <Link id="link-rc-static-b" href="/t-3d-cube/router-coherence/static-b">
          Static B
        </Link>
        <Link id="link-rc-dyn-c" href="/t-3d-cube/router-coherence/dyn-c">
          Dynamic C
        </Link>
        <Link
          id="link-rc-sub-layout"
          href="/t-3d-cube/router-coherence/sub-layout"
        >
          Sub Layout
        </Link>
      </nav>
      <div id="rc-l1-outlet">{children}</div>
    </section>
  );
}
