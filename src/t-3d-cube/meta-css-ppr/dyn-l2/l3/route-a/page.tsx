import { Suspense } from "react";
import { DinouCacheSlot, getContext } from "dinou/server";
import { readCubeState } from "../../../../shared/cube-state";
import slotStyles from "../../../slot.module.css";
import styles from "./route-a.module.css";

async function RouteADynamicHole() {
  const reqTag = String(getContext()?.req?.headers?.["x-mc-hole"] || "live");
  const s = readCubeState();
  return (
    <div
      id="mc-route-a-hole"
      className={styles.holeBox}
      data-class-hash={styles.holeBox}
      data-req-tag={reqTag}
    >
      <meta name="x-cube-hole" content={`hole-a-v${s.mcRouteAHoleSeq}`} />
      <span id="mc-route-a-hole-seq">{s.mcRouteAHoleSeq}</span>
      <DinouCacheSlot
        id="cube-mc-page-slot"
        tags={["mc-page-slot"]}
        revalidate={3600}
      >
        {async () => {
          const ps = readCubeState();
          const cls = ps.mcPageSlotOdd
            ? slotStyles.pageSlotOdd
            : slotStyles.pageSlotEven;
          const mode = ps.mcPageSlotOdd ? "odd" : "even";
          return (
            <div
              id="mc-page-slot-box"
              className={cls}
              data-class-hash={cls}
              data-mode={mode}
            >
              <meta
                name="x-cube-page-slot"
                content={`page-slot-${mode}-${ps.mcPageSlotSeq}`}
              />
              <span id="mc-page-slot-seq">{ps.mcPageSlotSeq}</span>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

export default function MetaCssRouteAPage() {
  const st = readCubeState();
  return (
    <article id="mc-route-a-page">
      <title>{`Cube Route A v${st.mcRouteAShellSeq}`}</title>
      <meta name="description" content={`Desc A v${st.mcRouteAShellSeq}`} />
      <link rel="canonical" href="https://example.test/route-a" />
      <div
        id="mc-route-a-shell"
        className={styles.shellBox}
        data-class-hash={styles.shellBox}
      >
        <h4>Route A Shell</h4>
        <span id="mc-route-a-shell-seq">{st.mcRouteAShellSeq}</span>
      </div>
      <Suspense fallback={<div id="mc-route-a-hole-fb">Loading Hole A...</div>}>
        <RouteADynamicHole />
      </Suspense>
    </article>
  );
}
