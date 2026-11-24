import type { ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

export default function QueryPprAsymL2Layout({
  children,
}: {
  children: ReactNode;
}) {
  const q = getContext()?.req?.query || {};
  const tab = String(q.tab || "default");
  const sort = String(q.sort || "none");
  const s = readCubeState();
  return (
    <section id="qp-asym-l2-layout" style={{ border: "1px solid #f59e0b", padding: 8 }}>
      <h3>Query PPR Dynamic L2</h3>
      <span id="qp-asym-l2-host-seq">{`${tab}:${sort}-${s.qpAsymL2HostSeq}`}</span>
      <CubeClientProbe id="qp-asym-l2" />
      <DinouCacheSlot
        id="cube-qp-asym-l2-slot"
        revalidate={3600}
        tags={["cube-qp-asym-l2-slot-tag"]}
      >
        {async () => (
          <span id="qp-asym-l2-slot-seq">{readCubeState().qpAsymL2SlotSeq}</span>
        )}
      </DinouCacheSlot>
      <div id="qp-asym-l2-children">{children}</div>
    </section>
  );
}
