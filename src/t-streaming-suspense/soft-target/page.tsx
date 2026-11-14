import { Suspense } from "react";
import { ServerUidBadge, sleep } from "../lib/streamStore";

async function getDelayedSoftReport() {
  await sleep(650);
  return (
    <div data-testid="soft-streamed-report">
      <ServerUidBadge testId="soft-report-uid" label="SoftReport:Ready" />
    </div>
  );
}

export default function SoftStreamedTargetPage() {
  return (
    <main data-testid="soft-target-page">
      <h1 data-testid="soft-instant-header">Soft Streamed Target</h1>
      <Suspense
        fallback={
          <div data-testid="soft-skeleton">Loading soft report...</div>
        }
      >
        {getDelayedSoftReport()}
      </Suspense>
    </main>
  );
}

