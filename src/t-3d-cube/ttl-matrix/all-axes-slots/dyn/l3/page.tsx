import { Suspense } from "react";
import { DinouCacheSlot, getContext } from "dinou/server";
import { readCubeState } from "../../../../shared/cube-state";

async function DynamicHoleWithTtlSlot() {
  const ctx = getContext();
  const qProbe = String(ctx?.req?.query?.probe || "base");
  return (
    <div id="ttl-asym-hole">
      <span id="ttl-asym-hole-probe">{qProbe}</span>
      <DinouCacheSlot id="cube-ttl-asym-page-hole-slot" revalidate={1} tags={["cube-ttl-asym-page-hole-slot-tag"]}>
        {async () => <span id="ttl-asym-page-hole-slot">{readCubeState().ttlAsymPageHoleSlotSeq}</span>}
      </DinouCacheSlot>
    </div>
  );
}

export default function TtlAsymPage() {
  const s = readCubeState();
  return (
    <article id="ttl-asym-page">
      <span id="ttl-asym-page-shell">{s.ttlAsymPageShellSeq}</span>
      <DinouCacheSlot id="cube-ttl-asym-page-shell-slot" revalidate={1} tags={["cube-ttl-asym-page-shell-slot-tag"]}>
        {async () => <span id="ttl-asym-page-shell-slot">{readCubeState().ttlAsymPageShellSlotSeq}</span>}
      </DinouCacheSlot>
      <Suspense fallback={<span id="ttl-asym-hole-fb">loading-hole</span>}>
        <DynamicHoleWithTtlSlot />
      </Suspense>
    </article>
  );
}
