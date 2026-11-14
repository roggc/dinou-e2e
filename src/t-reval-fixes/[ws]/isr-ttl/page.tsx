import { DinouCacheSlot } from "dinou/server";
import type { PageProps } from "./dinou";
import { RevalControls } from "../../lib/RevalControls";
import { nextRevalStamp } from "../../lib/revalStore";

export default async function RevalIsrTtlPage({ params }: PageProps) {
  const ws = params.ws;
  return (
    <main data-testid="ttl-page-wrapper">
      <h1 data-testid="ttl-page-stamp">{nextRevalStamp("TtlPage", ws)}</h1>
      <DinouCacheSlot
        id={`ttl-slot-${ws}`}
        tags={[`reval-ttl-slot-${ws}`]}
        revalidate={3600}
      >
        {async () => (
          <span data-testid="ttl-slot-stamp">
            {nextRevalStamp("TtlSlot", ws)}
          </span>
        )}
      </DinouCacheSlot>
      <RevalControls ws={ws} ttlMode />
    </main>
  );
}
