import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";
import { QueryPprClientPanel } from "../qp-client";

async function QpAsymPageHole() {
  const q = getContext()?.req?.query || {};
  const tab = String(q.tab || "default");
  const sort = String(q.sort || "none");
  const hasInternalV = Object.prototype.hasOwnProperty.call(q, "____v____");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <span id="qp-asym-page-hole-seq" data-has-v={hasInternalV ? "true" : "false"}>
      {`${tab}:${sort}-${s.qpAsymPageHoleSeq}`}
    </span>
  );
}

export default function QueryPprAsymPage() {
  const s = readCubeState();
  return (
    <article id="qp-asym-page">
      <h4>Query PPR Asymmetric Page</h4>
      <span id="qp-asym-page-shell-seq">{s.qpAsymPageShellSeq}</span>
      <CubeClientProbe id="qp-asym-page" />
      <QueryPprClientPanel scope="asym" />
      <DinouCacheSlot
        id="cube-qp-asym-page-slot"
        revalidate={3600}
        tags={["cube-qp-asym-page-slot-tag"]}
      >
        {async () => (
          <span id="qp-asym-page-slot-seq">{readCubeState().qpAsymPageSlotSeq}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span id="qp-asym-page-hole-fb">loading-qp-asym-page</span>}>
        <QpAsymPageHole />
      </Suspense>
    </article>
  );
}
