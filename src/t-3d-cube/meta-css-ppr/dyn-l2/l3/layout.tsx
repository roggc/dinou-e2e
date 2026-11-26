import type { ReactNode } from "react";
import { readCubeState } from "../../../shared/cube-state";
import { CubeClientProbe } from "../../../shared/cube-client";
import l3Styles from "./l3.module.css";

export default function MetaCssL3Layout({
  children,
}: {
  children: ReactNode;
}) {
  const st = readCubeState();

  return (
    <section
      id="mc-l3-shell"
      className={l3Styles.l3Shell}
      data-class-hash={l3Styles.l3Shell}
    >
      <meta name="x-cube-l3" content={`l3-meta-v${st.mcL3ShellSeq}`} />
      <h3>Static PPR L3</h3>
      <span id="mc-l3-shell-seq">{st.mcL3ShellSeq}</span>
      <CubeClientProbe id="mc-l3" />
      <div id="mc-l3-outlet">{children}</div>
    </section>
  );
}
