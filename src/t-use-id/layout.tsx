// src/t-use-id/layout.tsx
import { useId, type ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { ClientUseIdVerifier } from "./client-verifier";

function LayoutSyncHeaderBar() {
  const headerSearchId = useId();
  return (
    <div
      data-testid="layout-sync-bar"
      data-generated-id={headerSearchId}
      className="p-3 rounded-lg border bg-card text-xs space-y-1.5"
    >
      <div className="font-semibold text-teal-600 dark:text-teal-400">
        1A. Layout Sync Server Component (Top)
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={headerSearchId} className="font-mono">
          Layout Header ID ({headerSearchId}):
        </label>
        <input
          id={headerSearchId}
          defaultValue={`layout-sync:${headerSearchId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

function LayoutSlotSyncBadge({ renderedAt }: { renderedAt: string }) {
  const layoutSlotId = useId();
  return (
    <div
      data-testid="layout-slot-sync"
      data-generated-id={layoutSlotId}
      className="p-3 rounded-lg border border-teal-500/30 bg-teal-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-teal-600 dark:text-teal-400">
        1B. Layout &lt;DinouCacheSlot&gt; Sync Server Component{" "}
        <span suppressHydrationWarning className="opacity-75">
          (at {renderedAt})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={layoutSlotId} className="font-mono">
          Layout Slot ID ({layoutSlotId}):
        </label>
        <input
          id={layoutSlotId}
          defaultValue={`layout-slot:${layoutSlotId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

function LayoutSyncFooterBar() {
  // Executed AFTER the <DinouCacheSlot> above — tests that Layout's renderStore.idCount
  // resumes cleanly (_layout_dS_2_) without being clobbered by the slot's isolated counter.
  const footerId = useId();
  return (
    <div
      data-testid="layout-footer-sync"
      data-generated-id={footerId}
      className="p-3 rounded-lg border bg-card text-xs space-y-1.5"
    >
      <div className="font-semibold text-teal-600 dark:text-teal-400">
        1C. Layout Sync Server Component (After Slot — Counter Continuity)
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={footerId} className="font-mono">
          Layout Footer ID ({footerId}):
        </label>
        <input
          id={footerId}
          defaultValue={`layout-footer:${footerId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

export default async function TestUseIdLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="space-y-3 border-b pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">
            React 19 Server Component <code>useId()</code> &amp; Hooks Suite (
            <code>/t-use-id</code>)
          </h1>
          <span className="px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-500 font-mono text-xs">
            PPR + DinouCacheSlot + Sync RSC Hooks
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <LayoutSyncHeaderBar />

          <DinouCacheSlot
            id="useid-layout-slot"
            tag="useid-layout-tag"
            revalidate={300}
          >
            {async () => {
              const now = new Date().toISOString().slice(11, 23);
              return <LayoutSlotSyncBadge renderedAt={now} />;
            }}
          </DinouCacheSlot>

          <LayoutSyncFooterBar />
        </div>
      </header>

      <ClientUseIdVerifier />

      <main>{children}</main>
    </div>
  );
}

