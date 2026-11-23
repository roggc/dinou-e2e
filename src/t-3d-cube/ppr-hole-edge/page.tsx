import { Suspense } from "react";
import { getContext, redirect } from "dinou";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

async function HealthySiblingHoleA() {
  const ctx = getContext();
  const okParam = String(ctx?.req?.query?.ok || "default-ok");
  await cubeSleep(20);
  const st = readCubeState();
  return (
    <div id="ppr-edge-hole-a">
      <span id="ppr-edge-hole-a-val">{okParam}</span>
      <span id="ppr-edge-hole-a-seq">{st.pprEdgeHoleASeq}</span>
    </div>
  );
}

async function EdgeCaseHoleB() {
  const ctx = getContext();
  const failHole = String(ctx?.req?.query?.failHole || "");
  const redirHole = String(ctx?.req?.query?.redirHole || "");
  const imperativeRedir = String(ctx?.req?.query?.imperativeRedir || "");
  await cubeSleep(20);

  if (failHole === "1") {
    throw new Error("Simulated PPR dynamic hole failure");
  }
  if (redirHole === "1") {
    return redirect("/t-3d-cube/ppr");
  }
  if (imperativeRedir === "1") {
    ctx?.res?.redirect?.("/t-3d-cube/ppr");
    return null;
  }

  const st = readCubeState();
  return (
    <div id="ppr-edge-hole-b">
      <span id="ppr-edge-hole-b-val">healthy-b-{st.pprEdgeHoleBSeq}</span>
    </div>
  );
}

export default function CubePprHoleEdgePage() {
  const st = readCubeState();
  return (
    <main id="cube-ppr-hole-edge-page">
      <CubeControlBridge />
      <span id="ppr-edge-shell-seq">{st.pprEdgeShellSeq}</span>
      <CubeClientProbe id="ppr-edge-shell" />

      <section id="ppr-edge-section-a">
        <Suspense fallback={<span id="ppr-edge-hole-a-fb">hole-a-fb</span>}>
          <HealthySiblingHoleA />
        </Suspense>
      </section>

      <section id="ppr-edge-section-b">
        <Suspense fallback={<span id="ppr-edge-hole-b-fb">hole-b-fb</span>}>
          <EdgeCaseHoleB />
        </Suspense>
      </section>
    </main>
  );
}
