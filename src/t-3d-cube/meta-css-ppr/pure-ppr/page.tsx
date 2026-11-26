import { Suspense } from "react";
import { DinouCacheSlot, getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import slotStyles from "../slot.module.css";
import styles from "./pure-ppr.module.css";

async function PurePprDynamicHole() {
  const reqTag = String(getContext()?.req?.headers?.["x-mc-hole"] || "live");
  const s = readCubeState();
  return (
    <div
      id="mc-pure-hole"
      className={styles.holeBox}
      data-class-hash={styles.holeBox}
      data-req-tag={reqTag}
    >
      <meta
        name="x-cube-pure-hole"
        content={`pure-hole-v${s.mcPurePprHoleSeq}`}
      />
      <link
        rel="alternate"
        href={`https://example.test/pure-hole/${s.mcPurePprHoleSeq}`}
      />
      <span id="mc-pure-hole-seq">{s.mcPurePprHoleSeq}</span>
    </div>
  );
}

export default function MetaCssPurePprPage() {
  const st = readCubeState();
  return (
    <article id="mc-pure-ppr-page">
      <meta name="description" content={`Pure PPR Desc v${st.mcPurePprShellSeq}`} />
      <link rel="canonical" href="https://example.test/pure-ppr" />
      <div
        id="mc-pure-shell"
        className={styles.shellBox}
        data-class-hash={styles.shellBox}
      >
        <h4>Pure PPR Shell</h4>
        <span id="mc-pure-shell-seq">{st.mcPurePprShellSeq}</span>
      </div>

      <DinouCacheSlot
        id="cube-mc-title-slot"
        tags={["mc-title-slot"]}
        revalidate={3600}
      >
        {async () => {
          const ts = readCubeState();
          const cls = ts.mcTitleSlotOdd
            ? slotStyles.titleSlotOdd
            : slotStyles.titleSlotEven;
          const mode = ts.mcTitleSlotOdd ? "odd" : "even";
          return (
            <div
              id="mc-title-slot-box"
              className={cls}
              data-class-hash={cls}
              data-mode={mode}
            >
              <title>{`Cube Slot Title (${ts.mcTitleSlotSeq})`}</title>
              <meta
                name="x-cube-title-slot"
                content={`title-slot-${mode}-${ts.mcTitleSlotSeq}`}
              />
              <span id="mc-title-slot-seq">{ts.mcTitleSlotSeq}</span>
            </div>
          );
        }}
      </DinouCacheSlot>

      <Suspense fallback={<div id="mc-pure-hole-fb">Loading Pure Hole...</div>}>
        <PurePprDynamicHole />
      </Suspense>
    </article>
  );
}
