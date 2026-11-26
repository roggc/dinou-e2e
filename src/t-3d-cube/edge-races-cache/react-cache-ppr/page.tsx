import { Suspense } from "react";
import { DinouCacheSlot, getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";
import { getRequestScopedViewer } from "../react-cache-helper";

async function PprViewerHoleA() {
  void getContext()?.req?.headers?.["x-tenant"];
  const v = await getRequestScopedViewer("viewer");
  return (
    <div id="er-ppr-hole-a">
      <span id="er-ppr-hole-a-tenant">{v.tenant}</span>
      <span id="er-ppr-hole-a-token">{v.token}</span>
    </div>
  );
}

async function PprViewerHoleB() {
  void getContext()?.req?.headers?.["x-tenant"];
  await new Promise((r) => setTimeout(r, 5));
  const v = await getRequestScopedViewer("viewer");
  return (
    <div id="er-ppr-hole-b">
      <span id="er-ppr-hole-b-tenant">{v.tenant}</span>
      <span id="er-ppr-hole-b-token">{v.token}</span>
    </div>
  );
}

export default function ReactCachePprPage() {
  const s = readCubeState();
  return (
    <section id="er-rc-ppr-page">
      <span id="er-rc-ppr-shell-seq">{s.erPurePprShellSeq}</span>
      <DinouCacheSlot id="er-rc-slot" tags={["er-rc-slot-tag"]} revalidate={3600}>
        {async () => {
          const live = readCubeState();
          return <span id="er-rc-slot-seq">{live.erRcSlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span>loading-a</span>}>
        <PprViewerHoleA />
      </Suspense>
      <Suspense fallback={<span>loading-b</span>}>
        <PprViewerHoleB />
      </Suspense>
    </section>
  );
}
