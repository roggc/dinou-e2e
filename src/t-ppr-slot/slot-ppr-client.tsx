"use client";

import { useState } from "react";
import { useRouter } from "dinou";

export function SlotPprClientCounter() {
  const [count, setCount] = useState(0);
  return (
    <div className="flex items-center gap-2 text-xs font-mono" data-testid="sidebar-client-widget">
      <span data-testid="sidebar-client-count">{count}</span>
      <button
        type="button"
        data-testid="sidebar-client-inc"
        onClick={() => setCount((c) => c + 1)}
        className="px-2 py-0.5 rounded bg-teal-700 text-white"
      >
        +1
      </button>
    </div>
  );
}

export function SlotPprRefreshControls() {
  const router = useRouter();
  return (
    <button
      type="button"
      data-testid="slot-ppr-refresh-layout"
      onClick={() => router.refresh({ layout: true })}
      className="px-2.5 py-1 rounded bg-amber-600 text-white text-xs font-mono"
    >
      Refresh Layout + @sidebar
    </button>
  );
}

