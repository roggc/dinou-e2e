import { Suspense } from "react";
import { Link } from "./dinou";
import {
  ClientFlightInner,
  ClientFlightInteractiveShell,
} from "./ClientFlightConsumer";
import { nextStreamStamp, ServerUidBadge, sleep } from "../lib/streamStore";

async function getDelayedMetrics() {
  await sleep(750);
  return (
    <div data-testid="streamed-metrics">
      <span>Live Revenue: $128,400</span>
      <ServerUidBadge testId="streamed-metrics-uid" label="MetricsReady" />
    </div>
  );
}

async function getServerChildInsideClientProps() {
  await sleep(20);
  return (
    <span data-testid="client-prop-server-child">
      ServerChildInsideClientOK
    </span>
  );
}

export default function StreamingSsrPage() {
  const flightPromise = sleep(450).then(() => ({
    plan: "Enterprise",
    seats: 50,
  }));

  return (
    <main data-testid="streaming-ssr-page">
      <h1 data-testid="instant-header">Executive Dashboard</h1>
      <p data-testid="dynamic-ssr-stamp">{nextStreamStamp("DynSsr", "exec")}</p>

      <Link data-testid="link-to-soft-target" to="../soft-target">
        Navigate to Soft Streamed Target
      </Link>

      <Suspense
        fallback={<div data-testid="metrics-skeleton">Loading metrics...</div>}
      >
        {getDelayedMetrics()}
      </Suspense>

      <Suspense
        fallback={
          <div data-testid="client-flight-fallback">Loading flight prop...</div>
        }
      >
        <ClientFlightInner
          flightPromise={flightPromise}
          testId="client-flight-resolved"
        />
      </Suspense>

      <ClientFlightInteractiveShell>
        <div>{getServerChildInsideClientProps()}</div>
      </ClientFlightInteractiveShell>
    </main>
  );
}

