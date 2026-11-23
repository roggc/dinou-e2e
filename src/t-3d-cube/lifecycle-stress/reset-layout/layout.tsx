import type { ReactNode } from "react";
import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../../shared/cube-client";

export default function LifecycleResetLayout({
  children,
}: {
  children: ReactNode;
}) {
  const st = readCubeState();
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Lifecycle Stress Reset-Layout</title>
      </head>
      <body>
        <section id="lc-rl-layout">
          <h1>Reset-Layout Isolated Branch</h1>
          <span id="lc-rl-shell-seq">{st.lcResetLayoutShellSeq}</span>
          <CubeClientProbe id="lc-rl-l1" />
          <CubeControlBridge />
          <DinouCacheSlot
            id="cube-lc-rl-l1-slot"
            tag="cube-lc-rl-l1-slot-tag"
            revalidate={3600}
          >
            {async () => (
              <span id="lc-rl-l1-slot-seq">
                {readCubeState().lcResetLayoutSlotSeq}
              </span>
            )}
          </DinouCacheSlot>
          <nav style={{ display: "flex", gap: 8 }}>
            <Link id="link-lc-from-rl-home" href="/t-3d-cube/lifecycle-stress">
              Back to Lifecycle Home
            </Link>
          </nav>
          <div id="lc-rl-outlet">{children}</div>
        </section>
      </body>
    </html>
  );
}
