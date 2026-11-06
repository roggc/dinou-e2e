"use client";

import { useState, useTransition } from "react";
import { refreshSlot } from "dinou";
import {
  revalidateSuspenseSlotTagAction,
  resetNewCacheSlotSuiteAction,
} from "./actions";

export function NewCacheSlotControls() {
  const [status, setStatus] = useState("idle");
  const [clientClicks, setClientClicks] = useState(0);
  const [isSlotPending, startSlotTransition] = useTransition();
  const [refreshDiagnostics, setRefreshDiagnostics] = useState("");

  return (
    <div
      data-testid="new-cache-slot-controls"
      data-status={status}
      data-slot-pending={isSlotPending ? "true" : "false"}
      data-refresh-diagnostics={refreshDiagnostics}
      className="flex gap-2 items-center"
    >
      <button
        type="button"
        data-testid="btn-inc-client-state"
        onClick={() => setClientClicks((c) => c + 1)}
      >
        Clicks: <span data-testid="client-clicks-count">{clientClicks}</span>
      </button>
      <button
        type="button"
        data-testid="btn-revalidate-suspense-tag"
        onClick={async () => {
          setStatus("revalidating-tag");
          await revalidateSuspenseSlotTagAction();
          setStatus("tag-revalidated");
        }}
      >
        Revalidate Suspense Slot Tag
      </button>
      <button
        type="button"
        data-testid="btn-refresh-suspense-slot-fresh"
        onClick={() => {
          setStatus("refreshing-slot");
          startSlotTransition(async () => {
            const p = refreshSlot("test-dyn-suspense-slot", { fresh: true });
            const isThenable = Boolean(p && typeof p.then === "function");
            const execBeforeAwait =
              document
                .querySelector('[data-testid="slot-suspense-resolved"]')
                ?.getAttribute("data-exec-count") || "missing";
            const fallbackDuringRefresh = Boolean(
              document.querySelector('[data-testid="slot-suspense-fallback"]')
            );
            await p;
            setRefreshDiagnostics(
              `thenable=${isThenable};before=${execBeforeAwait};fallback=${fallbackDuringRefresh}`
            );
            setStatus("slot-refreshed");
          });
        }}
      >
        {isSlotPending
          ? "Refreshing Slot..."
          : "Refresh Suspense Slot (fresh: true)"}
      </button>
      {isSlotPending && (
        <span data-testid="slot-refresh-pending-indicator">
          Updating slot in background...
        </span>
      )}
      <button
        type="button"
        data-testid="btn-reset-suite"
        onClick={async () => {
          setStatus("resetting");
          await resetNewCacheSlotSuiteAction();
          setStatus("suite-reset");
        }}
      >
        Reset Suite
      </button>
    </div>
  );
}
