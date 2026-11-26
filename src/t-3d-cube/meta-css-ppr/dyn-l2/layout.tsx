import type { ReactNode } from "react";
import { getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import l2Styles from "./l2.module.css";

export default function MetaCssDynL2Layout({
  children,
}: {
  children: ReactNode;
}) {
  const reqTag = String(getContext()?.req?.headers?.["x-mc-l2"] || "live");
  const st = readCubeState();

  return (
    <section
      id="mc-l2-dyn"
      className={l2Styles.l2Dyn}
      data-class-hash={l2Styles.l2Dyn}
      data-req-tag={reqTag}
    >
      <meta name="x-cube-l2-dyn" content={`dyn-v${st.mcL2DynSeq}`} />
      <h2>Dynamic L2</h2>
      <span id="mc-l2-dyn-seq">{st.mcL2DynSeq}</span>
      <div id="mc-l2-outlet">{children}</div>
    </section>
  );
}
