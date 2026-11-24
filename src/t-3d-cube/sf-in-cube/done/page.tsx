import { Suspense } from "react";
import { Link, getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeControlBridge } from "../../shared/cube-client";

async function DoneHole() {
  const from = String(getContext()?.req?.query?.from || "none");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <div id="sf-done-hole">
      <span id="sf-done-from">{from}</span>
      <span id="sf-done-redirect-note">{s.sfRedirectNote}</span>
    </div>
  );
}

export default function SfDonePage() {
  return (
    <article id="sf-done-page">
      <h3>SF Redirect Destination</h3>
      <Suspense fallback={<span>loading-done</span>}>
        <DoneHole />
      </Suspense>
      <Link id="link-sf-back" href="/t-3d-cube/sf-in-cube">
        Back to SF Cube
      </Link>
      <CubeControlBridge />
    </article>
  );
}
