import { Suspense, useId } from "react";
import { DinouCacheSlot, getContext } from "dinou/server";
import { NewCacheSlotControls } from "./controls";

const TRACKER_KEY = Symbol.for("dinou.test.cacheSlot.tracker");

function getTracker() {
  const g = globalThis as any;
  if (!g[TRACKER_KEY]) {
    g[TRACKER_KEY] = {
      counts: {
        suspenseSlot: 0,
        unwrappedSlot: 0,
        noCacheSlot: 0,
      },
    };
  }
  return g[TRACKER_KEY];
}

function recordExec(name: "suspenseSlot" | "unwrappedSlot" | "noCacheSlot") {
  const tracker = getTracker();
  const reqPath = String(getContext()?.req?.path || "");
  const isOwnRouteOrSlot =
    (reqPath.startsWith("/t-new-cache-slot") &&
      !reqPath.includes("____rsc_page")) ||
    reqPath.startsWith("/____rsc_slot____/test-dyn-");
  if (isOwnRouteOrSlot) {
    tracker.counts[name] = (tracker.counts[name] || 0) + 1;
  }
  return tracker.counts[name] || 1;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function SyncIdProbe({ testId, label }: { testId: string; label: string }) {
  const id = useId();
  return (
    <div data-testid={testId} data-generated-id={id}>
      <label htmlFor={id}>{label}: {id}</label>
      <input id={id} defaultValue={label} readOnly />
    </div>
  );
}

async function SlowAnalyticsSlotWidget() {
  await delay(80);
  const execCount = recordExec("suspenseSlot");
  return (
    <div data-testid="slot-suspense-resolved" data-exec-count={execCount}>
      <span>Suspense Cached Slot (exec #{execCount})</span>
      <SyncIdProbe testId="slot-suspense-sync-id" label="SuspenseSlotSync" />
    </div>
  );
}

async function UnwrappedSlotWidget() {
  await delay(30);
  const execCount = recordExec("unwrappedSlot");
  return (
    <div data-testid="slot-unwrapped-resolved" data-exec-count={execCount}>
      <span>Unwrapped Cached Slot (exec #{execCount})</span>
      <SyncIdProbe testId="slot-unwrapped-sync-id" label="UnwrappedSlotSync" />
    </div>
  );
}

async function NoCacheSlotWidget() {
  await delay(40);
  const execCount = recordExec("noCacheSlot");
  return (
    <div data-testid="slot-nocache-resolved" data-exec-count={execCount}>
      <span>No-Cache Slot (exec #{execCount})</span>
      <SyncIdProbe testId="slot-nocache-sync-id" label="NoCacheSlotSync" />
    </div>
  );
}

export default function TestCacheSlotPage() {
  const ctx = getContext();
  const user = ctx?.req?.cookies?.["user"] ?? "anonymous";

  return (
    <main className="p-6 space-y-6" data-testid="test-cache-slot-root">
      <header data-testid="dynamic-page-header" data-user={user}>
        <h1>Dynamic SSR Page (User: {user})</h1>
        <SyncIdProbe testId="page-header-sync-id" label="PageHeaderSync" />
        <NewCacheSlotControls />
      </header>

      {/* 1. <Suspense> wrapping <DinouCacheSlot revalidate={2}> */}
      <section>
        <h2>1. Suspense Wrapping Cached Slot</h2>
        <Suspense
          fallback={
            <div data-testid="slot-suspense-fallback">
              Loading slow analytics slot...
            </div>
          }
        >
          <DinouCacheSlot
            id="test-dyn-suspense-slot"
            tag="test-dyn-suspense-tag"
            revalidate={2}
          >
            <SlowAnalyticsSlotWidget />
          </DinouCacheSlot>
        </Suspense>
      </section>

      {/* 2. Unwrapped <DinouCacheSlot revalidate={2}> */}
      <section>
        <h2>2. Unwrapped Cached Slot</h2>
        <DinouCacheSlot
          id="test-dyn-unwrapped-slot"
          tag="test-dyn-unwrapped-tag"
          revalidate={2}
        >
          <UnwrappedSlotWidget />
        </DinouCacheSlot>
      </section>

      {/* 3. <Suspense> wrapping <DinouCacheSlot revalidate={0}> */}
      <section>
        <h2>3. Suspense Wrapping No-Cache Slot (revalidate=0)</h2>
        <Suspense
          fallback={
            <div data-testid="slot-nocache-fallback">
              Loading live nocache slot...
            </div>
          }
        >
          <DinouCacheSlot id="test-dyn-nocache-slot" revalidate={0}>
            <NoCacheSlotWidget />
          </DinouCacheSlot>
        </Suspense>
      </section>

      <footer>
        <SyncIdProbe testId="page-footer-sync-id" label="PageFooterSync" />
      </footer>
    </main>
  );
}

