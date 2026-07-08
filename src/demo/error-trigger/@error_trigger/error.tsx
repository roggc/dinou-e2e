"use client";

import { useState, useEffect } from "react";

interface SerializedError {
  message: string;
  name: string;
  stack?: string;
}

export default function LocalErrorPage({
  error,
  params,
}: {
  error: SerializedError;
  params: Record<string, string>;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="rounded-xl border border-rose-850 bg-rose-950/20 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🚨</span>
        <div>
          <h2 className="text-lg font-semibold text-rose-400">Localized Slot Crash Caught</h2>
          <p className="text-xs text-rose-500 font-mono">Dinou Error Boundary (error.tsx)</p>
        </div>
      </div>

      <div className="p-4 bg-slate-950/80 rounded-lg border border-rose-900/40 space-y-2">
        <p className="text-sm font-semibold text-rose-300 font-mono">{error.name}: {error.message}</p>
        {error.stack && mounted && (
          <pre className="text-[10px] text-slate-500 font-mono max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap">
            {error.stack}
          </pre>
        )}
      </div>


      <div className="flex items-center gap-3">
        <a
          href="/demo/error-trigger"
          className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700 cursor-pointer font-medium"
        >
          🔄 Reload Slot Safely
        </a>
      </div>
    </div>
  );
}
