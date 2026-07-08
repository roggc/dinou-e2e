"use client";

import { useState } from "react";
import Suspense from "react-enhanced-suspense";
import { randomFact } from "@/demo/server-functions/random-fact";
import { serverTime } from "@/demo/server-functions/server-time";
import { liveClock } from "@/demo/server-functions/misc";
import { leaderboard } from "@/demo/server-functions/misc";
import { quoteCard } from "@/server-functions/quote-card";

type FnName = "randomFact" | "serverTime" | "liveClock" | "leaderboard" | "quoteCard";

const options: { value: FnName; label: string; desc: string }[] = [
  { value: "randomFact", label: "randomFact()", desc: "→ Client Component (RandomFact with liked state)" },
  { value: "serverTime", label: "serverTime()", desc: "→ Server Component (plain JSX)" },
  { value: "liveClock", label: "liveClock()", desc: "→ Client Component (LiveClock with setInterval)" },
  { value: "leaderboard", label: "leaderboard()", desc: "→ Server Component (table)" },
  { value: "quoteCard", label: "quoteCard()", desc: "→ Client Component (QuoteCard)" },
];

function callFn(name: FnName) {
  if (name === "randomFact") return randomFact();
  if (name === "serverTime") return serverTime();
  if (name === "liveClock") return liveClock();
  if (name === "leaderboard") return leaderboard();
  if (name === "quoteCard") return quoteCard();
}

export default function ServerFunctionsTester() {
  const [selected, setSelected] = useState<FnName>("randomFact");
  const [callKey, setCallKey] = useState(0);

  return (
    <div className="rounded-2xl border border-emerald-800 bg-slate-900 p-5 space-y-4">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSelected(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              selected === opt.value
                ? "bg-emerald-700 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <p className="text-slate-400 text-xs">
        {options.find((o) => o.value === selected)?.desc}
      </p>

      <div className="min-h-24">
        <Suspense
          fallback={
            <div className="flex items-center gap-2 py-4">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-500 text-sm">Calling {selected}()…</span>
            </div>
          }
          resourceId={`tester-${selected}-${callKey}`}
        >
          {() => callFn(selected)}
        </Suspense>
      </div>

      <button
        onClick={() => setCallKey((k) => k + 1)}
        className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 active:scale-95 transition text-white text-sm font-medium cursor-pointer"
      >
        🔄 Call Again
      </button>
    </div>
  );
}
