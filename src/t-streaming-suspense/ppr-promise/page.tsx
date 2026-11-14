import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";
import { ClientFlightInner } from "../dynamic-ssr/ClientFlightConsumer";
import { nextStreamStamp, ServerUidBadge, sleep } from "../lib/streamStore";

async function getCachedWarehouseSlot() {
  await sleep(35);
  return (
    <div data-testid="ppr-slot-badge">
      <span data-testid="ppr-slot-stamp">
        {nextStreamStamp("PprPromiseSlot", "warehouse")}
      </span>
      <ServerUidBadge testId="ppr-slot-uid" label="WarehouseSlot:Cached" />
    </div>
  );
}

async function getStaticPromiseBanner() {
  await sleep(15);
  return <p data-testid="ppr-static-promise-banner">StaticPromiseBanner:OK</p>;
}

async function fetchLiveOrderStatus() {
  await sleep(600);
  return (
    <div data-testid="ppr-promise-resolved">
      <span>Order #9042: Shipped</span>
      <span data-testid="ppr-live-hole-stamp">
        {nextStreamStamp("PprHoleLive", "order")}
      </span>
      <ServerUidBadge testId="ppr-hole-uid" label="OrderHoleReady" />
    </div>
  );
}

export default function PprDirectPromisePage() {
  const carrierQuotePromise = sleep(350).then(() => ({
    plan: "Express",
    seats: 19,
  }));

  return (
    <main data-testid="ppr-promise-page">
      <h1 data-testid="ppr-shell-heading">Order Tracker</h1>
      <p data-testid="ppr-shell-stamp">
        {nextStreamStamp("PprShell", "tracker")}
      </p>

      <DinouCacheSlot id="ppr-direct-promise-slot" revalidate={3600}>
        {getCachedWarehouseSlot()}
      </DinouCacheSlot>

      {getStaticPromiseBanner()}

      <Suspense
        fallback={
          <p data-testid="ppr-promise-fallback">Fetching live status...</p>
        }
      >
        {fetchLiveOrderStatus()}
      </Suspense>

      <Suspense
        fallback={
          <p data-testid="ppr-client-promise-fallback">
            Fetching carrier quote...
          </p>
        }
      >
        <ClientFlightInner
          flightPromise={carrierQuotePromise}
          testId="ppr-client-quote-resolved"
        />
      </Suspense>
    </main>
  );
}

