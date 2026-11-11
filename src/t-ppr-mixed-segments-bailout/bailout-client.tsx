"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "dinou";

export function BailoutRefreshControls() {
  const router = useRouter();
  const [mountId, setMountId] = useState("ssr");
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    setMountId(Math.random().toString(36).slice(2, 8));
  }, []);

  return (
    <div className="flex items-center gap-3 text-xs font-mono">
      <span>
        Mount: <code id="mppr-bailout-mount-id">{mountId}</code>
      </span>
      <span>
        Clicks: <strong id="mppr-bailout-clicks">{clicks}</strong>
      </span>
      <button
        id="mppr-bailout-inc"
        type="button"
        onClick={() => setClicks((c) => c + 1)}
        className="px-2 py-0.5 rounded bg-slate-700 text-white cursor-pointer"
      >
        +1
      </button>
      <button
        id="mppr-bailout-refresh-layout"
        type="button"
        onClick={() => router.refresh({ layout: true })}
        className="px-2 py-0.5 rounded bg-rose-700 text-white cursor-pointer"
      >
        Refresh Layout+Page
      </button>
    </div>
  );
}

