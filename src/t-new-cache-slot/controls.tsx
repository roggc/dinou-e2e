"use client";

import { useState } from "react";
import { refreshSlot } from "dinou";
import {
  revalidateSuspenseSlotTagAction,
  resetNewCacheSlotSuiteAction,
} from "./actions";

export function NewCacheSlotControls() {
  const [status, setStatus] = useState("idle");
  const [clientClicks, setClientClicks] = useState(0);

  return (
    <div
      data-testid="new-cache-slot-controls"
      data-status={status}
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
        onClick={async () => {
          setStatus("refreshing-slot");
          await refreshSlot("test-dyn-suspense-slot", { fresh: true });
          setStatus("slot-refreshed");
        }}
      >
        Refresh Suspense Slot (fresh: true)
      </button>
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

