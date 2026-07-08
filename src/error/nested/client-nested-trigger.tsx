"use client";

import { useState } from "react";

export default function ClientNestedTrigger() {
  const [nestedClientCrash, setNestedClientCrash] = useState(false);

  if (nestedClientCrash) {
    throw new Error("💥 Nested Client Component crashed during render pass!");
  }

  return (
    <div className="space-y-3 pt-2 border-t border-slate-800/60">
      <div className="flex flex-col sm:flex-row gap-2">
        <a
          href="/error/nested?nested_crash=true"
          className="flex-1 text-center px-4 py-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border border-rose-900/50 hover:border-rose-700/60 transition-all font-medium text-xs cursor-pointer text-decoration-none"
        >
          Trigger Nested Server Crash
        </a>
        <button
          onClick={() => setNestedClientCrash(true)}
          className="flex-1 px-4 py-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border border-rose-900/50 hover:border-rose-700/60 transition-all font-medium text-xs cursor-pointer"
        >
          Trigger Nested Client Crash
        </button>
      </div>
      <div className="flex justify-between items-center pt-2">
        <a
          href="/error"
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          ← Back to Parent Error Lab
        </a>
      </div>
    </div>
  );
}
