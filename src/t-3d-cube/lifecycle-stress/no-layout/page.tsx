import { Suspense } from "react";
import { Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../../shared/cube-client";

async function LcNoLayoutHole() {
  await cubeSleep(15);
  return <span id="lc-nl-hole-seq">{readCubeState().lcNoLayoutHoleSeq}</span>;
}

export default function LifecycleNoLayoutPage() {
  const st = readCubeState();
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Lifecycle Stress No-Layout</title>
      </head>
      <body>
        <main id="lc-nl-page">
          <h1>No-Layout Standalone Route</h1>
          <span id="lc-nl-shell-seq">{st.lcNoLayoutShellSeq}</span>
          <CubeClientProbe id="lc-nl" />
          <CubeControlBridge />
          <DinouCacheSlot
            id="cube-lc-nl-slot"
            tag="cube-lc-nl-slot-tag"
            revalidate={3600}
          >
            {async () => (
              <span id="lc-nl-slot-seq">{readCubeState().lcNoLayoutSlotSeq}</span>
            )}
          </DinouCacheSlot>
          <Suspense fallback={<span>lc-nl-fb</span>}>
            <LcNoLayoutHole />
          </Suspense>
          <nav style={{ display: "flex", gap: 8 }}>
            <Link id="link-lc-from-nl-home" href="/t-3d-cube/lifecycle-stress">
              Back to Lifecycle Home
            </Link>
            <Link id="link-lc-from-nl-reset" href="/t-3d-cube/lifecycle-stress/reset-layout">
              Go Reset-Layout
            </Link>
          </nav>
        </main>
      </body>
    </html>
  );
}
