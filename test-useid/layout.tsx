import React, { useId, useMemo, useCallback, useDebugValue } from "react";
import { DinouCacheSlot } from "dinou/server";

function LayoutSyncAccessibilityBar() {
  const searchInputId = useId();
  const computedLabel = useMemo(() => "Layout Sync Server Component (useId + useMemo)", []);
  const formatHint = useCallback((prefix: string) => `${prefix}:${searchInputId}`, [searchInputId]);
  useDebugValue(searchInputId);

  return (
    <div
      data-testid="layout-sync-bar"
      data-generated-id={searchInputId}
      className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-blue-600 dark:text-blue-400">
        1. {computedLabel}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={searchInputId} data-testid="layout-label" className="font-mono">
          Label (htmlFor=&quot;{searchInputId}&quot;):
        </label>
        <input
          id={searchInputId}
          data-testid="layout-input"
          defaultValue={formatHint("ok")}
          readOnly
          className="px-2 py-1 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

function LayoutSlotSyncWidget() {
  const slotInputId = useId();
  const slotTitle = useMemo(() => "Layout <DinouCacheSlot> Sync Server Component", []);

  return (
    <div
      data-testid="layout-slot-sync"
      data-generated-id={slotInputId}
      className="p-3 rounded-lg border border-teal-500/30 bg-teal-500/5 text-xs space-y-1.5"
    >
      <div className="font-semibold text-teal-600 dark:text-teal-400">
        2. {slotTitle}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={slotInputId} data-testid="layout-slot-label" className="font-mono">
          Slot Label (htmlFor=&quot;{slotInputId}&quot;):
        </label>
        <input
          id={slotInputId}
          data-testid="layout-slot-input"
          defaultValue={`slot-id:${slotInputId}`}
          readOnly
          className="px-2 py-1 rounded border bg-background font-mono text-xs"
        />
      </div>
    </div>
  );
}

export default function TestUseIdLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="space-y-3 border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          React 19 Server Component <code>useId()</code> Verification Suite
        </h1>
        <p className="text-sm text-muted-foreground">
          Verifies synchronous Server Components calling <code>useId()</code>, <code>useMemo()</code>,{" "}
          <code>useCallback()</code>, and <code>useDebugValue()</code> across Layouts, Pages,{" "}
          <code>&lt;DinouCacheSlot&gt;</code> (including nested slots), <code>noDynamic()</code>, and PPR{" "}
          <code>&lt;Suspense&gt;</code> holes.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <LayoutSyncAccessibilityBar />
          <DinouCacheSlot id="useid-layout-slot" tag="useid-layout-tag" revalidate={300}>
            <LayoutSlotSyncWidget />
          </DinouCacheSlot>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

