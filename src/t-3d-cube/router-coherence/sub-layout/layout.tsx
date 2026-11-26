import type { ReactNode } from "react";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function RouterCoherenceSubLayout({
  children,
}: {
  children: ReactNode;
}) {
  const st = readCubeState();
  return (
    <section id="rc-sub-l2-shell">
      <h3>Sub Layout L2</h3>
      <span id="rc-sub-l2-seq">{st.rcSubL2Seq}</span>
      <CubeClientProbe id="rc-sub-l2" />
      <div id="rc-sub-l2-outlet">{children}</div>
    </section>
  );
}
