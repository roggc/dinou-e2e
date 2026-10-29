"use client";

import { useState, useEffect } from "react";

export default function HoleClientWidget({
  serverTier,
  serverPlan,
  requestStamp,
}: {
  serverTier: string;
  serverPlan: string;
  requestStamp: string;
}) {
  const [clicks, setClicks] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div
      data-testid="hole-client-widget"
      data-hydrated={hydrated ? "true" : "false"}
      className="mt-2 p-3 rounded-lg bg-indigo-950/60 border border-indigo-500/40 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-indigo-300">
          Interactive Client Widget inside Dynamic Hole
        </span>
        <span
          data-testid="hole-client-tier"
          className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 font-mono"
        >
          tier={serverTier} | plan={serverPlan}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-slate-400 font-mono">
          reqStamp: <strong data-testid="hole-client-stamp">{requestStamp}</strong>
        </span>
        <button
          type="button"
          data-testid="hole-client-btn"
          onClick={() => setClicks((c) => c + 1)}
          className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition cursor-pointer"
        >
          Hydrated Clicks: <span data-testid="hole-client-clicks">{clicks}</span>
        </button>
      </div>
    </div>
  );
}

