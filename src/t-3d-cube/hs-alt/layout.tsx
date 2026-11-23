import type { ReactNode } from "react";
import { Link } from "dinou";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

export default function CubeHsAltL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="cube-hsalt-l1">
      <span id="hsalt-l1-seq">{st.hsAltL1Seq}</span>
      <CubeClientProbe id="hsalt-l1" />
      <CubeControlBridge />
      <nav style={{ display: "flex", gap: 8 }}>
        <Link id="link-hsalt-s" href="/t-3d-cube/hs-alt/dyn-l2/static-l3">
          S-D-S-S
        </Link>
        <Link id="link-hsalt-d" href="/t-3d-cube/hs-alt/dyn-l2/static-l3/dyn-page">
          S-D-S-D
        </Link>
      </nav>
      <div>{children}</div>
    </section>
  );
}
