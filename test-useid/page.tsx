// Verification suite for React 19 stateless Server Component hooks (useId, use, useMemo, useCallback, useDebugValue)
import React, {
  Suspense,
  use,
  useId,
  useMemo,
  useCallback,
  useDebugValue,
  memo,
  forwardRef,
} from "react";
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
  useDebugValue(summary);

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
        4B. Inner Nested &lt;DinouCacheSlot&gt; Sync Server Component{" "}
        <span suppressHydrationWarning className="opacity-75">
          (rendered at {renderedAt})
        </span>
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
        4A. Outer &lt;DinouCacheSlot&gt; Sync Server Component{" "}
        <span suppressHydrationWarning className="opacity-75">
          (rendered at {outerRenderedAt})
        </span>
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
  await Promise.resolve();
  return <NoDynamicSyncChild loadedLabel="baked into static shell" />;
}

// 6. Synchronous Server Component inside a Dynamic PPR <Suspense> Hole
function DynamicHoleSyncChild({ reqPath, streamedAt }: { reqPath: string; streamedAt: string }) {
  const holeInputId = useId();
  const memoText = useMemo(
    () => `Streamed PPR Hole on ${reqPath}`,
    [reqPath]
  );

  return (
    <div
      data-testid="ppr-dynamic-hole-sync"
      data-generated-id={holeInputId}
      className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-purple-600 dark:text-purple-400">
        6. Dynamic PPR &lt;Suspense&gt; Hole Sync Child ({memoText}){" "}
        <span suppressHydrationWarning className="opacity-75">
          at {streamedAt}
        </span>
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

function DynamicHoleSlotSyncWidget({ renderedAt }: { renderedAt: string }) {
  const holeSlotId = useId();
  return (
    <div
      data-testid="dynamic-hole-slot-sync"
      data-generated-id={holeSlotId}
      className="p-2.5 rounded border border-purple-500/40 bg-purple-500/10 text-xs space-y-1 mt-2"
    >
      <div className="font-semibold text-purple-700 dark:text-purple-300">
        6B. &lt;DinouCacheSlot&gt; Inside Dynamic PPR &lt;Suspense&gt; Hole{" "}
        <span suppressHydrationWarning className="opacity-75">
          (at {renderedAt})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={holeSlotId} className="font-mono">
          Hole Slot ID ({holeSlotId}):
        </label>
        <input
          id={holeSlotId}
          defaultValue={`hole-slot:${holeSlotId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

async function DynamicPprHoleSection() {
  const ctx = getContext();
  const rawPath = (ctx?.req?.path || "/test-useid").replace(
    /^\/____rsc_[a-z_]+____/,
    ""
  );
  const currentPath = rawPath.replace(/\/+$/, "") || "/test-useid";
  await new Promise((r) => setTimeout(r, 15));
  const streamedAt = new Date().toISOString().slice(11, 23);
  return (
    <div className="space-y-2">
      <DynamicHoleSyncChild reqPath={currentPath} streamedAt={streamedAt} />
      <DinouCacheSlot
        id="useid-dynamic-hole-slot"
        tag="useid-dynamic-hole-slot-tag"
        revalidate={180}
      >
        {() => {
          const slotTs = new Date().toISOString().slice(11, 23);
          return <DynamicHoleSlotSyncWidget renderedAt={slotTs} />;
        }}
      </DinouCacheSlot>
    </div>
  );
}

// 7. React.memo, React.forwardRef, and nested React.memo(React.forwardRef) Sync Server Components
const MemoSyncServerWidget = memo(function MemoSyncServerWidget({ title }: { title: string }) {
  const memoId = useId();
  return (
    <div
      data-testid="memo-sync-widget"
      data-generated-id={memoId}
      className="p-3 rounded-lg border border-pink-500/30 bg-pink-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-pink-600 dark:text-pink-400">
        7A. React.memo() Sync Server Component ({title})
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={memoId} className="font-mono">
          Memo ID ({memoId}):
        </label>
        <input
          id={memoId}
          defaultValue={`memo:${memoId}`}
          readOnly
          className="px-2 py-1 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
});

const ForwardRefSyncServerWidget = forwardRef<HTMLInputElement, { title: string }>(
  function ForwardRefSyncServerWidget({ title }, _ref) {
    const fRefId = useId();
    return (
      <div
        data-testid="forwardref-sync-widget"
        data-generated-id={fRefId}
        className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 text-xs space-y-1.5"
      >
        <div className="font-semibold text-rose-600 dark:text-rose-400">
          7B. React.forwardRef() Sync Server Component ({title})
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={fRefId} className="font-mono">
            ForwardRef ID ({fRefId}):
          </label>
          <input
            id={fRefId}
            defaultValue={`forwardRef:${fRefId}`}
            readOnly
            className="px-2 py-1 rounded border bg-background font-mono text-xs"
          />
        </div>
      </div>
    );
  }
);

const MemoForwardRefSyncServerWidget = memo(
  forwardRef<HTMLInputElement, { title: string }>(function MemoForwardRefInner({ title }, _ref) {
    const mfId = useId();
    return (
      <div
        data-testid="memo-forwardref-sync-widget"
        data-generated-id={mfId}
        className="p-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 text-xs space-y-1.5"
      >
        <div className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">
          7C. Nested React.memo(React.forwardRef()) Sync Component ({title})
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={mfId} className="font-mono">
            Memo+ForwardRef ID ({mfId}):
          </label>
          <input
            id={mfId}
            defaultValue={`memo-fref:${mfId}`}
            readOnly
            className="px-2 py-1 rounded border bg-background font-mono text-xs"
          />
        </div>
      </div>
    );
  })
);

// 8. Synchronous Server Component calling React.use(promise) + useId() BEFORE and AFTER use()
function SyncUsePromiseWidget({
  dataPromise,
  testIdPrefix,
  badgeTitle,
}: {
  dataPromise: Promise<string>;
  testIdPrefix: string;
  badgeTitle: string;
}) {
  const idBeforeUse = useId();
  const resolvedValue = use(dataPromise);
  const idAfterUse = useId();

  return (
    <div className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-xs space-y-2">
      <div className="font-semibold text-cyan-600 dark:text-cyan-400">
        {badgeTitle} — <code>use(promise)</code> =&gt; &quot;{resolvedValue}&quot;
      </div>
      <div
        data-testid={`${testIdPrefix}-before`}
        data-generated-id={idBeforeUse}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor={idBeforeUse} className="font-mono">
          useId() BEFORE use(promise) ({idBeforeUse}):
        </label>
        <input
          id={idBeforeUse}
          defaultValue={`before-use:${idBeforeUse}:${resolvedValue}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
      <div
        data-testid={`${testIdPrefix}-after`}
        data-generated-id={idAfterUse}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor={idAfterUse} className="font-mono">
          useId() AFTER use(promise) ({idAfterUse}):
        </label>
        <input
          id={idAfterUse}
          defaultValue={`after-use:${idAfterUse}:${resolvedValue}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

function StaticUsePromiseSection() {
  noDynamic();
  const delayedPromise = new Promise<string>((resolve) =>
    setTimeout(() => resolve("resolved-in-sync-server-comp"), 8)
  );
  return (
    <SyncUsePromiseWidget
      dataPromise={delayedPromise}
      testIdPrefix="use-promise-sync"
      badgeTitle="8A. Sync Server Component with React.use(pendingPromise) + useId()"
    />
  );
}

// 9. Sync -> Async -> Sync Server Component Sandwich + .map() List + revalidate={0} Slot
function SandwichInnerSync({ stepLabel }: { stepLabel: string }) {
  const innerSandwichId = useId();
  return (
    <div
      data-testid="sandwich-inner-sync"
      data-generated-id={innerSandwichId}
      className="p-2.5 rounded border border-violet-500/30 bg-violet-500/10 text-xs space-y-1 mt-2"
    >
      <div className="font-semibold text-violet-600 dark:text-violet-400">
        9B. Inner Sync Child after Async Middle ({stepLabel})
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={innerSandwichId} className="font-mono">
          Inner Sandwich ID ({innerSandwichId}):
        </label>
        <input
          id={innerSandwichId}
          defaultValue={`sandwich-inner:${innerSandwichId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

async function SandwichAsyncMiddle() {
  noDynamic();
  await Promise.resolve();
  return <SandwichInnerSync stepLabel="post-await context preserved" />;
}

function SandwichOuterSync() {
  const outerSandwichId = useId();
  return (
    <div
      data-testid="sandwich-outer-sync"
      data-generated-id={outerSandwichId}
      className="p-3 rounded-lg border border-violet-500/30 bg-violet-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-violet-600 dark:text-violet-400">
        9A. Sync -&gt; Async -&gt; Sync Server Component Sandwich
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={outerSandwichId} className="font-mono">
          Outer Sandwich ID ({outerSandwichId}):
        </label>
        <input
          id={outerSandwichId}
          defaultValue={`sandwich-outer:${outerSandwichId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
      <SandwichAsyncMiddle />
    </div>
  );
}

function ListItemSyncComponent({ index, itemName }: { index: number; itemName: string }) {
  const itemId = useId();
  return (
    <div
      data-testid={`list-item-sync-${index}`}
      data-generated-id={itemId}
      className="p-2.5 rounded-lg border border-orange-500/30 bg-orange-500/5 text-xs space-y-1"
    >
      <div className="font-semibold text-orange-600 dark:text-orange-400">
        10. Array .map() Item #{index + 1} ({itemName})
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={itemId} className="font-mono">
          Item ID ({itemId}):
        </label>
        <input
          id={itemId}
          defaultValue={`item-${index}:${itemId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

function NoCacheSlotSyncWidget({ ts }: { ts: string }) {
  const noCacheSlotId = useId();
  return (
    <div
      data-testid="nocache-slot-sync"
      data-generated-id={noCacheSlotId}
      className="p-3 rounded-lg border border-lime-500/30 bg-lime-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-lime-600 dark:text-lime-400">
        11. Uncached &lt;DinouCacheSlot revalidate=&#123;0&#125;&gt; Sync Component{" "}
        <span suppressHydrationWarning className="opacity-75">
          (at {ts})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={noCacheSlotId} className="font-mono">
          No-Cache Slot ID ({noCacheSlotId}):
        </label>
        <input
          id={noCacheSlotId}
          defaultValue={`nocache-slot:${noCacheSlotId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

function SuspenseWrappedSlotSyncWidget({ ts }: { ts: string }) {
  const suspSlotId = useId();
  return (
    <div
      data-testid="suspense-slot-sync"
      data-generated-id={suspSlotId}
      className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-emerald-600 dark:text-emerald-400">
        12. &lt;Suspense&gt; Wrapping &lt;DinouCacheSlot&gt; Sync Server Component{" "}
        <span suppressHydrationWarning className="opacity-75">
          (at {ts})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={suspSlotId} className="font-mono">
          Suspense-&gt;Slot ID ({suspSlotId}):
        </label>
        <input
          id={suspSlotId}
          defaultValue={`suspense-slot:${suspSlotId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

export default function TestUseIdPage() {
  const listItems = ["Alpha", "Beta"];

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MemoSyncServerWidget title="memoized" />
        <ForwardRefSyncServerWidget title="forwarded" />
        <MemoForwardRefSyncServerWidget title="memo+forwardRef" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense fallback={<div className="p-3 border rounded text-xs">Resolving use(promise)...</div>}>
          <StaticUsePromiseSection />
        </Suspense>

        <DinouCacheSlot id="useid-use-hook-slot" tag="useid-use-hook-tag" revalidate={120}>
          {() => {
            const slotPromise = new Promise<string>((resolve) =>
              setTimeout(() => resolve("slot-use-resolved"), 6)
            );
            return (
              <SyncUsePromiseWidget
                dataPromise={slotPromise}
                testIdPrefix="slot-use-promise-sync"
                badgeTitle="8B. <DinouCacheSlot> Sync Component with React.use(promise)"
              />
            );
          }}
        </DinouCacheSlot>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense fallback={<div className="p-3 border rounded text-xs">Loading sandwich...</div>}>
          <SandwichOuterSync />
        </Suspense>

        <DinouCacheSlot id="useid-nocache-slot" revalidate={0}>
          {() => {
            const ts = new Date().toISOString().slice(11, 23);
            return <NoCacheSlotSyncWidget ts={ts} />;
          }}
        </DinouCacheSlot>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {listItems.map((name, idx) => (
          <ListItemSyncComponent key={name} index={idx} itemName={name} />
        ))}
      </div>

      <Suspense
        fallback={
          <div className="p-3 border rounded text-xs">
            Loading Suspense-wrapped DinouCacheSlot...
          </div>
        }
      >
        <DinouCacheSlot
          id="useid-suspense-slot"
          tag="useid-suspense-slot-tag"
          revalidate={180}
        >
          {async () => {
            const ts = new Date().toISOString().slice(11, 23);
            return <SuspenseWrappedSlotSyncWidget ts={ts} />;
          }}
        </DinouCacheSlot>
      </Suspense>
    </div>
  );
}
