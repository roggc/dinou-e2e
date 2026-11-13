import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";

let liveZeroRenders = 0;

async function LivePayload({ count }: { count: number }) {
  return <p data-testid="live-zero-slot">{`LivePayload:${count}`}</p>;
}

export default function SlotLiveZeroPage() {
  liveZeroRenders++;
  return (
    <section>
      <h1 data-testid="live-zero-count">{`LiveZero:${liveZeroRenders}`}</h1>
      <Suspense
        fallback={<p data-testid="live-zero-fallback">Loading live...</p>}
      >
        <DinouCacheSlot id="e2e-zero-slot" revalidate={0}>
          <LivePayload count={liveZeroRenders} />
        </DinouCacheSlot>
      </Suspense>
    </section>
  );
}

