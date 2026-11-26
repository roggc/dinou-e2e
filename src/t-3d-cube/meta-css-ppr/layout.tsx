import type { ReactNode } from "react";
import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";
import layoutStyles from "./layout.module.css";
import slotStyles from "./slot.module.css";

export default function MetaCssPprL1Layout({
  children,
}: {
  children: ReactNode;
}) {
  const st = readCubeState();

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="/styles.css" rel="stylesheet" />
      </head>
      <body>
        <section
          id="mc-l1-shell"
          className={layoutStyles.l1Shell}
          data-class-hash={layoutStyles.l1Shell}
        >
          <meta name="x-cube-l1" content={`l1-meta-v${st.mcL1ShellSeq}`} />
          <h1>Meta &amp; CSS Modules 3D PPR L1</h1>
          <span id="mc-l1-shell-seq">{st.mcL1ShellSeq}</span>
          <CubeClientProbe id="mc-l1" />
          <CubeControlBridge />

          <DinouCacheSlot
            id="cube-mc-l1-slot"
            tags={["mc-l1-slot"]}
            revalidate={3600}
          >
            {async () => {
              const s = readCubeState();
              const cls = s.mcL1SlotOdd
                ? slotStyles.slotOdd
                : slotStyles.slotEven;
              const mode = s.mcL1SlotOdd ? "odd" : "even";
              return (
                <div
                  id="mc-l1-slot-box"
                  className={cls}
                  data-class-hash={cls}
                  data-mode={mode}
                >
                  <meta
                    name="x-cube-slot"
                    content={`slot-${mode}-${s.mcL1SlotSeq}`}
                  />
                  <span id="mc-l1-slot-seq">{s.mcL1SlotSeq}</span>
                </div>
              );
            }}
          </DinouCacheSlot>

          <nav style={{ display: "flex", gap: 8, margin: "8px 0" }}>
            <Link
              id="link-mc-route-a"
              href="/t-3d-cube/meta-css-ppr/dyn-l2/l3/route-a"
            >
              Route A
            </Link>
            <Link
              id="link-mc-route-b"
              href="/t-3d-cube/meta-css-ppr/dyn-l2/l3/route-b"
            >
              Route B
            </Link>
            <Link
              id="link-mc-pure-ppr"
              href="/t-3d-cube/meta-css-ppr/pure-ppr"
            >
              Pure PPR
            </Link>
          </nav>

          <div id="mc-l1-outlet">{children}</div>
        </section>
      </body>
    </html>
  );
}
