import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";
import { QueryPprClientPanel } from "./qp-client";

async function QpPageHole() {
  const q = getContext()?.req?.query || {};
  const tab = String(q.tab || "default");
  const sort = String(q.sort || "none");
  const hasInternalV = Object.prototype.hasOwnProperty.call(q, "____v____");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <span id="qp-page-hole-seq" data-has-v={hasInternalV ? "true" : "false"}>
      {`${tab}:${sort}-${s.qpPageHoleSeq}`}
    </span>
  );
}

export default function QueryPprPage() {
  const s = readCubeState();
  return (
    <article id="qp-pure-page">
      <h3>Query PPR Pure Page</h3>
      <span id="qp-page-shell-seq">{s.qpPageShellSeq}</span>
      <CubeClientProbe id="qp-page" />
      <QueryPprClientPanel scope="pure" />
      <DinouCacheSlot
        id="cube-qp-page-slot"
        revalidate={3600}
        tags={["cube-qp-page-slot-tag"]}
      >
        {async () => (
          <span id="qp-page-slot-seq">{readCubeState().qpPageSlotSeq}</span>
        )}
      </DinouCacheSlot>
      <Suspense fallback={<span id="qp-page-hole-fb">loading-qp-page</span>}>
        <QpPageHole />
      </Suspense>
    </article>
  );
}
