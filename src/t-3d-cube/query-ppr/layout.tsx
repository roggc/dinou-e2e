import { Suspense, type ReactNode } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

async function QpL1Hole() {
  const q = getContext()?.req?.query || {};
  const tab = String(q.tab || "default");
  const hasInternalV = Object.prototype.hasOwnProperty.call(q, "____v____");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <span id="qp-l1-hole-seq" data-has-v={hasInternalV ? "true" : "false"}>
      {`${tab}-${s.qpL1HoleSeq}`}
    </span>
  );
}

export default function QueryPprL1Layout({
  children,
}: {
  children: ReactNode;
}) {
  const s = readCubeState();
  return (
    <section id="qp-l1-layout" style={{ border: "1px solid #38bdf8", padding: 8 }}>
      <h2 id="qp-l1-title">Query PPR L1 Layout</h2>
      <span id="qp-l1-shell-seq">{s.qpL1ShellSeq}</span>
      <CubeClientProbe id="qp-l1" />
      <DinouCacheSlot
        id="cube-qp-l1-slot"
        revalidate={3600}
        tags={["cube-qp-l1-slot-tag"]}
      >
        {async () => (
          <span id="qp-l1-slot-seq">{readCubeState().qpL1SlotSeq}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span id="qp-l1-hole-fb">loading-qp-l1</span>}>
        <QpL1Hole />
      </Suspense>
      <nav id="qp-l1-nav" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0" }}>
        <Link id="link-qp-overview" href="/t-3d-cube/query-ppr?tab=overview&sort=asc">
          Overview (asc)
        </Link>
        <Link id="link-qp-metrics" href="/t-3d-cube/query-ppr?tab=metrics&sort=desc">
          Metrics (desc)
        </Link>
        <Link id="link-qp-clean" href="/t-3d-cube/query-ppr">
          Clean (no query)
        </Link>
        <Link id="link-qp-asym-overview" href="/t-3d-cube/query-ppr/asym?tab=overview&sort=asc">
          Asym Overview (asc)
        </Link>
        <Link id="link-qp-asym-metrics" href="/t-3d-cube/query-ppr/asym?tab=metrics&sort=desc">
          Asym Metrics (desc)
        </Link>
        <Link id="link-qp-asym-clean" href="/t-3d-cube/query-ppr/asym">
          Asym Clean (no query)
        </Link>
      </nav>
      <div id="qp-l1-children">{children}</div>
      <CubeControlBridge />
    </section>
  );
}
