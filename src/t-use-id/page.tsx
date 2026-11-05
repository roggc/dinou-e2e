// src/t-use-id/page.tsx
import {
  Suspense,
  memo,
  forwardRef,
  use,
  useId,
  useMemo,
  useCallback,
  useDebugValue,
  type ForwardedRef,
} from "react";
import { noDynamic } from "dinou";
import { DinouCacheSlot } from "dinou/server";

// 2. Synchronous Server Components in Page Static Shell (also exercising useMemo, useCallback, useDebugValue)
function PageStaticSyncField({
  label,
  testId,
}: {
  label: string;
  testId: string;
}) {
  const fieldId = useId();
  const formattedLabel = useMemo(() => `${label} [${fieldId}]`, [label, fieldId]);
  const formatValue = useCallback(
    (prefix: string) => `${prefix}:${fieldId}`,
    [fieldId]
  );
  useDebugValue(fieldId);

  return (
    <div
      data-testid={testId}
      data-generated-id={fieldId}
      className="p-3 rounded-lg border bg-card text-xs space-y-1.5"
    >
      <div className="font-semibold text-blue-600 dark:text-blue-400">
        {formattedLabel}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={fieldId} className="font-mono">
          Page Static ID ({fieldId}):
        </label>
        <input
          id={fieldId}
          defaultValue={formatValue("page-static")}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

function PageStaticShellSyncSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <PageStaticSyncField
        testId="page-static-sync-1"
        label="2A. Page Static Sync Component #1 (useId + useMemo + useCallback)"
      />
      <PageStaticSyncField
        testId="page-static-sync-2"
        label="2B. Page Static Sync Component #2 (Sequential Counter)"
      />
    </div>
  );
}

// 3. Nested <DinouCacheSlot> Hierarchy (Outer Slot -> Inner Slot)
function InnerSlotSyncLeaf({ innerRenderedAt }: { innerRenderedAt: string }) {
  const innerId = useId();
  return (
    <div
      data-testid="nested-inner-slot-sync"
      data-generated-id={innerId}
      className="p-3 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-xs space-y-1.5"
    >
      <div className="font-semibold text-indigo-600 dark:text-indigo-300">
        3B. Nested Inner &lt;DinouCacheSlot&gt; Sync Server Component{" "}
        <span suppressHydrationWarning className="opacity-75">
          (at {innerRenderedAt})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={innerId} className="font-mono">
          Inner Slot ID ({innerId}):
        </label>
        <input
          id={innerId}
          defaultValue={`inner-slot:${innerId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

function OuterSlotSyncContainer({
  outerRenderedAt,
}: {
  outerRenderedAt: string;
}) {
  const outerId = useId();
  return (
    <div
      data-testid="nested-outer-slot-sync"
      data-generated-id={outerId}
      className="p-4 rounded-xl border border-purple-500/40 bg-purple-500/5 space-y-3 text-xs"
    >
      <div className="font-semibold text-purple-600 dark:text-purple-400">
        3A. Outer &lt;DinouCacheSlot&gt; Sync Server Component{" "}
        <span suppressHydrationWarning className="opacity-75">
          (at {outerRenderedAt})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={outerId} className="font-mono">
          Outer Slot ID ({outerId}):
        </label>
        <input
          id={outerId}
          defaultValue={`outer-slot:${outerId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>

      <DinouCacheSlot
        id="useid-inner-slot"
        tag="useid-inner-tag"
        revalidate={180}
      >
        {async () => {
          const innerTs = new Date().toISOString().slice(11, 23);
          return <InnerSlotSyncLeaf innerRenderedAt={innerTs} />;
        }}
      </DinouCacheSlot>
    </div>
  );
}

// 4. <Suspense> Opted Out of PPR via noDynamic() (Static Shell Boundary)
function StaticSuspenseSyncLeaf({ resolvedData }: { resolvedData: string }) {
  const noDynamicId = useId();
  return (
    <div
      data-testid="nodynamic-suspense-sync"
      data-generated-id={noDynamicId}
      className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-amber-600 dark:text-amber-400">
        4. &lt;Suspense&gt; + noDynamic() Sync Server Component ({resolvedData})
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={noDynamicId} className="font-mono">
          noDynamic Hole ID ({noDynamicId}):
        </label>
        <input
          id={noDynamicId}
          defaultValue={`nodynamic:${noDynamicId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

async function StaticNoDynamicBoundary() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 10));
  return <StaticSuspenseSyncLeaf resolvedData="prerendered-in-shell" />;
}

// 5 & 6. Genuine PPR Dynamic <Suspense> Hole + <DinouCacheSlot> Inside Dynamic Hole
function DynamicHoleSlotSyncBadge({ slotTime }: { slotTime: string }) {
  const holeSlotId = useId();
  return (
    <div
      data-testid="dynamic-hole-slot-sync"
      data-generated-id={holeSlotId}
      className="p-2.5 rounded border border-pink-500/30 bg-pink-500/10 text-xs space-y-1"
    >
      <div className="font-semibold text-pink-600 dark:text-pink-300">
        6. &lt;DinouCacheSlot&gt; Inside Dynamic PPR Hole{" "}
        <span suppressHydrationWarning className="opacity-75">
          (at {slotTime})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={holeSlotId} className="font-mono">
          Hole-&gt;Slot ID ({holeSlotId}):
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

function DynamicPprHoleSyncCard({ streamedAt }: { streamedAt: string }) {
  const holeId = useId();
  return (
    <div
      data-testid="ppr-dynamic-hole-sync"
      data-generated-id={holeId}
      className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/5 text-xs space-y-2.5"
    >
      <div className="font-semibold text-rose-600 dark:text-rose-400">
        5. Streamed PPR Dynamic &lt;Suspense&gt; Hole Sync Component{" "}
        <span suppressHydrationWarning className="opacity-75">
          (streamed at {streamedAt})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={holeId} className="font-mono">
          PPR Hole ID ({holeId}):
        </label>
        <input
          id={holeId}
          defaultValue={`ppr-hole:${holeId}`}
          readOnly
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>

      <DinouCacheSlot
        id="useid-dynamic-hole-slot"
        tag="useid-dynamic-hole-tag"
        revalidate={120}
      >
        {async () => {
          const ts = new Date().toISOString().slice(11, 23);
          return <DynamicHoleSlotSyncBadge slotTime={ts} />;
        }}
      </DinouCacheSlot>
    </div>
  );
}

async function DynamicPprHoleSection() {
  await new Promise((r) => setTimeout(r, 25));
  const streamedAt = new Date().toISOString().slice(11, 23);
  return <DynamicPprHoleSyncCard streamedAt={streamedAt} />;
}

// 7. React.memo & React.forwardRef Sync Server Components Calling useId()
const MemoSyncServerWidget = memo(function MemoSyncServerWidget({
  title,
}: {
  title: string;
}) {
  const memoId = useId();
  return (
    <div
      data-testid="memo-sync-widget"
      data-generated-id={memoId}
      className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-cyan-600 dark:text-cyan-400">
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
          className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
});

const ForwardRefSyncServerWidget = forwardRef(
  function ForwardRefSyncServerWidget(
    { title }: { title: string },
    ref: ForwardedRef<HTMLDivElement>
  ) {
    const forwardId = useId();
    return (
      <div
        ref={ref}
        data-testid="forwardref-sync-widget"
        data-generated-id={forwardId}
        className="p-3 rounded-lg border border-sky-500/30 bg-sky-500/5 text-xs space-y-1.5"
      >
        <div className="font-semibold text-sky-600 dark:text-sky-400">
          7B. React.forwardRef() Sync Server Component ({title})
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={forwardId} className="font-mono">
            ForwardRef ID ({forwardId}):
          </label>
          <input
            id={forwardId}
            defaultValue={`forwardref:${forwardId}`}
            readOnly
            className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
          />
        </div>
      </div>
    );
  }
);

const MemoForwardRefSyncServerWidget = memo(
  forwardRef(function MemoForwardRefSyncServerWidget(
    { title }: { title: string },
    ref: ForwardedRef<HTMLDivElement>
  ) {
    const bothId = useId();
    return (
      <div
        ref={ref}
        data-testid="memo-forwardref-sync-widget"
        data-generated-id={bothId}
        className="p-3 rounded-lg border border-teal-500/30 bg-teal-500/5 text-xs space-y-1.5"
      >
        <div className="font-semibold text-teal-600 dark:text-teal-400">
          7C. memo(forwardRef()) Sync Server Component ({title})
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={bothId} className="font-mono">
            Memo+ForwardRef ID ({bothId}):
          </label>
          <input
            id={bothId}
            defaultValue={`memo-forwardref:${bothId}`}
            readOnly
            className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
          />
        </div>
      </div>
    );
  })
);

// 8. Sync Server Component using React.use(promise) + useId() Before & After Suspension
function SyncUsePromiseWidget({
  dataPromise,
  testIdPrefix,
  badgeTitle,
}: {
  dataPromise: Promise<string>;
  testIdPrefix: string;
  badgeTitle: string;
}) {
  // Called BEFORE React.use(promise) suspends and replayed on resume!
  const idBeforeUse = useId();
  const resolvedValue = use(dataPromise);
  // Called AFTER React.use(promise) resolves!
  const idAfterUse = useId();

  return (
    <div className="p-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 text-xs space-y-2">
      <div className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">
        {badgeTitle} (resolved: <code>{resolvedValue}</code>)
      </div>

      <div
        data-testid={`${testIdPrefix}-before`}
        data-generated-id={idBeforeUse}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor={idBeforeUse} className="font-mono">
          Before use() ID ({idBeforeUse}):
        </label>
        <input
          id={idBeforeUse}
          defaultValue={`before-use:${idBeforeUse}`}
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
          After use() ID ({idAfterUse}):
        </label>
        <input
          id={idAfterUse}
          defaultValue={`after-use:${idAfterUse}`}
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

function ListItemSyncComponent({
  index,
  itemName,
}: {
  index: number;
  itemName: string;
}) {
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
        11. Uncached &lt;DinouCacheSlot revalidate=&#123;0&#125;&gt; Sync
        Component{" "}
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
        12. &lt;Suspense&gt; Wrapping &lt;DinouCacheSlot&gt; Sync Server
        Component{" "}
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

      <DinouCacheSlot
        id="useid-outer-slot"
        tag="useid-outer-tag"
        revalidate={300}
      >
        {async () => {
          const outerTs = new Date().toISOString().slice(11, 23);
          return <OuterSlotSyncContainer outerRenderedAt={outerTs} />;
        }}
      </DinouCacheSlot>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense
          fallback={
            <div className="p-3 border rounded text-xs">
              Loading static boundary...
            </div>
          }
        >
          <StaticNoDynamicBoundary />
        </Suspense>

        <Suspense
          fallback={
            <div className="p-3 border rounded text-xs">
              Streaming PPR hole...
            </div>
          }
        >
          <DynamicPprHoleSection />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MemoSyncServerWidget title="memoized" />
        <ForwardRefSyncServerWidget title="forwarded" />
        <MemoForwardRefSyncServerWidget title="memo+forwardRef" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Suspense
          fallback={
            <div className="p-3 border rounded text-xs">
              Resolving use(promise)...
            </div>
          }
        >
          <StaticUsePromiseSection />
        </Suspense>

        <DinouCacheSlot
          id="useid-use-hook-slot"
          tag="useid-use-hook-tag"
          revalidate={120}
        >
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
        <Suspense
          fallback={
            <div className="p-3 border rounded text-xs">
              Loading sandwich...
            </div>
          }
        >
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

