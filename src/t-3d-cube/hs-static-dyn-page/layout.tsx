import type { ReactNode } from "react";
import { Link } from "dinou";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

export default function CubeHsSdpL1Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <section id="cube-hssdp-l1">
      <span id="hssdp-l1-seq">{st.hsSdpL1Seq}</span>
      <CubeClientProbe id="hssdp-l1" />
      <CubeControlBridge />
      <nav style={{ display: "flex", gap: 8 }}>
        <Link id="link-hssdp-static" href="/t-3d-cube/hs-static-dyn-page/l2">
          Static Page
        </Link>
        <Link id="link-hssdp-dyn-exp" href="/t-3d-cube/hs-static-dyn-page/l2/dyn-explicit">
          Dynamic Explicit
        </Link>
        <Link id="link-hssdp-dyn-bail" href="/t-3d-cube/hs-static-dyn-page/l2/dyn-bailout">
          Dynamic Bailout
        </Link>
      </nav>
      <div>{children}</div>
    </section>
  );
}
