// Verification suite for React 19 stateless Server Component hooks (useId, useMemo, useCallback, useDebugValue)
import React, { Suspense, useId, useMemo, useCallback } from "react";
import { DinouCacheSlot, noDynamic, getContext } from "dinou/server";
import { ClientUseIdVerifier } from "./client-verifier";

// 3. Synchronous Server Component directly in page.tsx Static Shell
function PageStaticShellSyncSection() {
  const firstId = useId();
  const secondId = useId();
  const summary = useMemo(
    () => `Page Static Shell Sync Component (2 useId calls: ${firstId}, ${secondId})`,
    [firstId, secondId]
  );
  const getTag = useCallback(() => `page-shell:${firstId}`, [firstId]);

  return (
    <div className="space-y-3">
      <div
        data-testid="page-static-sync-1"
        data-generated-id={firstId}
        className="p-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 text-xs space-y-1.5"
      >
        <div className="font-semibold text-indigo-600 dark:text-indigo-400">
          3A. {summary}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={firstId} className="font-mono">
            First Page ID ({firstId}):
          </label>
          <input
            id={firstId}
            defaultValue={getTag()}
            readOnly
            className="px-2 py-1 rounded border bg-background font-mono text-xs"
          />
        </div>
      </div>

      <div
        data-testid="page-static-sync-2"
        data-generated-id={secondId}
        className="p-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 text-xs space-y-1.5"
      >
        <div className="font-semibold text-indigo-600 dark:text-indigo-400">
          3B. Second useId() in Same Sync Server Component
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={secondId} className="font-mono">
            Second Page ID ({secondId}):
          </label>
          <input
            id={secondId}
            defaultValue={`second:${secondId}`}
            readOnly
            className="px-2 py-1 rounded border bg-background font-mono text-xs"
          />
        </div>
      </div>

      <ClientUseIdVerifier serverPassedId={firstId} />
    </div>
  );
}

// 4. Synchronous Server Components inside Nested <DinouCacheSlot> (Outer -> Inner)
function InnerSlotSyncBadge({ renderedAt }: { renderedAt: string }) {
  const innerId = useId();
  return (
    <div
      data-testid="nested-inner-slot-sync"
      data-generated-id={innerId}
      className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs space-y-1.5 mt-2"
    >
      <div className="font-semibold text-amber-700 dark:text-amber-300">
        4B. Inner Nested &lt;DinouCacheSlot&gt; Sync Server Component (rendered at {renderedAt})
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={innerId} className="font-mono">
          Inner Slot ID ({innerId}):
        </label>
        <input
          id={innerId}
          defaultValue={`inner:${innerId}`}
          readOnly
          className="px-2 py-1 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

function OuterSlotSyncContainer({ outerRenderedAt }: { outerRenderedAt: string }) {
  const outerId = useId();
  return (
    <div
      data-testid="nested-outer-slot-sync"
      data-generated-id={outerId}
      className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs space-y-2"
    >
      <div className="font-semibold text-emerald-700 dark:text-emerald-300">
        4A. Outer &lt;DinouCacheSlot&gt; Sync Server Component (rendered at {outerRenderedAt})
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={outerId} className="font-mono">
          Outer Slot ID ({outerId}):
        </label>
        <input
          id={outerId}
          defaultValue={`outer:${outerId}`}
          readOnly
          className="px-2 py-1 rounded border bg-background font-mono text-xs"
        />
      </div>

      <DinouCacheSlot id="useid-inner-slot" tag="useid-inner-tag" revalidate={60}>
        {async () => {
          const ts = new Date().toISOString().slice(11, 23);
          return <InnerSlotSyncBadge renderedAt={ts} />;
        }}
      </DinouCacheSlot>
    </div>
  );
}

// 5. Synchronous Server Component inside a <Suspense> + noDynamic() Static Boundary
function NoDynamicSyncChild({ loadedLabel }: { loadedLabel: string }) {
  const staticSuspId = useId();
  return (
    <div
      data-testid="nodynamic-suspense-sync"
      data-generated-id={staticSuspId}
      className="p-3 rounded-lg border border-sky-500/30 bg-sky-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-sky-600 dark:text-sky-400">
        5. Static &lt;Suspense&gt; + noDynamic() Sync Child ({loadedLabel})
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={staticSuspId} className="font-mono">
          noDynamic ID ({staticSuspId}):
        </label>
        <input
          id={staticSuspId}
          defaultValue={`nodynamic:${staticSuspId}`}
          readOnly
          className="px-2 py-1 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

async function StaticNoDynamicBoundary() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 5));
  return <NoDynamicSyncChild loadedLabel="baked into static shell" />;
}

// 6. Synchronous Server Component inside a Dynamic PPR <Suspense> Hole
function DynamicHoleSyncChild({ reqPath, streamedAt }: { reqPath: string; streamedAt: string }) {
  const holeInputId = useId();
  const memoText = useMemo(
    () => `Streamed PPR Hole on ${reqPath} at ${streamedAt}`,
    [reqPath, streamedAt]
  );

  return (
    <div
      data-testid="ppr-dynamic-hole-sync"
      data-generated-id={holeInputId}
      className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-purple-600 dark:text-purple-400">
        6. Dynamic PPR &lt;Suspense&gt; Hole Sync Child ({memoText})
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={holeInputId} className="font-mono">
          Dynamic Hole ID ({holeInputId}):
        </label>
        <input
          id={holeInputId}
          defaultValue={`hole:${holeInputId}`}
          readOnly
          className="px-2 py-1 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

async function DynamicPprHoleSection() {
  const ctx = getContext();
  const currentPath = ctx?.req?.path || "/test-useid";
  await new Promise((r) => setTimeout(r, 15));
  const streamedAt = new Date().toISOString().slice(11, 23);
  return <DynamicHoleSyncChild reqPath={currentPath} streamedAt={streamedAt} />;
}

export default function TestUseIdPage() {
  return (
    <div className="space-y-6">
      <PageStaticShellSyncSection />

      <DinouCacheSlot id="useid-outer-slot" tag="useid-outer-tag" revalidate={300}>
        {async () => {
          const outerTs = new Date().toISOString().slice(11, 23);
          return <OuterSlotSyncContainer outerRenderedAt={outerTs} />;
        }}
      </DinouCacheSlot>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense fallback={<div className="p-3 border rounded text-xs">Loading static boundary...</div>}>
          <StaticNoDynamicBoundary />
        </Suspense>

        <Suspense fallback={<div className="p-3 border rounded text-xs">Streaming PPR hole...</div>}>
          <DynamicPprHoleSection />
        </Suspense>
      </div>
    </div>
  );
}
