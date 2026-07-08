"use client";

import { useState } from "react";
import Suspense from "react-enhanced-suspense";
import { randomFact } from "@/demo/server-functions/random-fact";
import { serverTime } from "@/demo/server-functions/server-time";
import { liveClock } from "@/demo/server-functions/misc";

export default function MixedClientSection() {
  const [factKey, setFactKey] = useState(0);
  const [timeKey, setTimeKey] = useState(0);
  const [clockKey, setClockKey] = useState(0);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-4">
        {/* randomFact from client */}
        <div className="space-y-2">
          <p className="text-xs text-slate-500 font-mono">randomFact() from client</p>
          <Suspense
            fallback={<Skel />}
            resourceId={`mixed-fact-${factKey}`}
          >
            {() => randomFact()}
          </Suspense>
          <button
            onClick={() => setFactKey((k) => k + 1)}
            className="text-xs px-3 py-1.5 rounded-lg bg-sky-800 hover:bg-sky-700 transition text-sky-200 cursor-pointer"
          >
            🔄 Refresh
          </button>
        </div>

        {/* serverTime from client */}
        <div className="space-y-2">
          <p className="text-xs text-slate-500 font-mono">serverTime() from client</p>
          <Suspense
            fallback={<Skel />}
            resourceId={`mixed-time-${timeKey}`}
          >
            {() => serverTime()}
          </Suspense>
          <button
            onClick={() => setTimeKey((k) => k + 1)}
            className="text-xs px-3 py-1.5 rounded-lg bg-sky-800 hover:bg-sky-700 transition text-sky-200 cursor-pointer"
          >
            🔄 Refresh
          </button>
        </div>

        {/* liveClock from client */}
        <div className="space-y-2">
          <p className="text-xs text-slate-500 font-mono">liveClock() from client</p>
          <Suspense
            fallback={<Skel />}
            resourceId={`mixed-clock-${clockKey}`}
          >
            {() => liveClock()}
          </Suspense>
          <button
            onClick={() => setClockKey((k) => k + 1)}
            className="text-xs px-3 py-1.5 rounded-lg bg-sky-800 hover:bg-sky-700 transition text-sky-200 cursor-pointer"
          >
            🔄 Remount
          </button>
        </div>
      </div>
    </div>
  );
}

function Skel() {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-slate-500 text-sm">Loading…</span>
    </div>
  );
}
