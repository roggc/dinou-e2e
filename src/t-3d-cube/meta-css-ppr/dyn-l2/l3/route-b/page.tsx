import { Suspense } from "react";
import { getContext } from "dinou/server";
import { readCubeState } from "../../../../shared/cube-state";
import styles from "./route-b.module.css";

async function RouteBDynamicHole() {
  const reqTag = String(getContext()?.req?.headers?.["x-mc-hole"] || "live");
  const s = readCubeState();
  return (
    <div
      id="mc-route-b-hole"
      className={styles.holeBox}
      data-class-hash={styles.holeBox}
      data-req-tag={reqTag}
    >
      <meta name="x-cube-hole" content={`hole-b-v${s.mcRouteBHoleSeq}`} />
      <span id="mc-route-b-hole-seq">{s.mcRouteBHoleSeq}</span>
    </div>
  );
}

export default function MetaCssRouteBPage() {
  const st = readCubeState();
  return (
    <article id="mc-route-b-page">
      <title>{`Cube Route B v${st.mcRouteBShellSeq}`}</title>
      <meta name="description" content={`Desc B v${st.mcRouteBShellSeq}`} />
      <link rel="canonical" href="https://example.test/route-b" />
      <div
        id="mc-route-b-shell"
        className={styles.shellBox}
        data-class-hash={styles.shellBox}
      >
        <h4>Route B Shell</h4>
        <span id="mc-route-b-shell-seq">{st.mcRouteBShellSeq}</span>
      </div>
      <Suspense fallback={<div id="mc-route-b-hole-fb">Loading Hole B...</div>}>
        <RouteBDynamicHole />
      </Suspense>
    </article>
  );
}
