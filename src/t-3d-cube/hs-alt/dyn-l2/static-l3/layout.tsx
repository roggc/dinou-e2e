import type { ReactNode } from "react";
import { readCubeState } from "../../../shared/cube-state";
import { CubeClientProbe } from "../../../shared/cube-client";

export default function CubeHsAltStaticL3Layout({ children }: { children: ReactNode }) {
  const st = readCubeState();
  return (
    <div id="cube-hsalt-static-l3">
      <span id="hsalt-static-l3-seq">{st.hsAltStaticL3Seq}</span>
      <CubeClientProbe id="hsalt-l3" />
      <div>{children}</div>
    </div>
  );
}
