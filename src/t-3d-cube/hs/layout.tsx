import type { ReactNode } from "react";
import { Link } from "dinou";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

export default function CubeHsL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="cube-hs-l1-layout">
      <div id="hs-l1-seq">{st.hsL1LayoutSeq}</div>
      <CubeClientProbe id="hs-l1" />
      <CubeControlBridge />
      <nav>
        <Link id="cube-hs-link-index" href="/t-3d-cube/hs">
          HS Index
        </Link>
        <Link id="cube-hs-link-asym" href="/t-3d-cube/hs/dyn-layout-static-page">
          Asym Dyn Layout
        </Link>
      </nav>
      <div>{children}</div>
    </section>
  );
}
