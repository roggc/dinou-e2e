import React, { type ReactNode } from "react";
import { Link } from "dinou";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../../shared/cube-client";

export default function CubePprMixedL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  const uid = React.useId();
  return (
    <section id="cube-ppr-mixed-l1" data-l1-uid={uid}>
      <span id="ppr-mixed-l1-seq">{st.pprMixedL1Seq}</span>
      <CubeClientProbe id="ppr-mixed-l1" />
      <CubeControlBridge />
      <nav>
        <Link id="mixed-link-l2-static" href="/t-3d-cube/ppr/mixed/l2-ppr">
          L2 Static Leaf
        </Link>
        <Link id="mixed-link-l2-ppr" href="/t-3d-cube/ppr/mixed/l2-ppr/ppr-leaf?mode=hyper">
          L2 PPR Leaf
        </Link>
      </nav>
      <div>{children}</div>
    </section>
  );
}
