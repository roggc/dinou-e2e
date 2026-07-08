"use client";

import { useState } from "react";
import Suspense from "react-enhanced-suspense";
import Counter from "@/demo/components/counter";
import { randomFact } from "@/demo/server-functions/random-fact";
import { serverTime } from "@/demo/server-functions/server-time";
import { quoteCard } from "@/server-functions/quote-card";

export default function ClientComponentsPage() {
  const [factKey, setFactKey] = useState(0);
  const [timeKey, setTimeKey] = useState(0);
  const [quoteKey, setQuoteKey] = useState(0);




  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold text-white mb-2">Client Components</h1>
        <p className="text-slate-400 mb-6">
          This page is a Client Component ("use client"). It calls server
          functions from client context using the{" "}
          <code className="text-indigo-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">
            resourceId
          </code>{" "}
          pattern from react-enhanced-suspense.
        </p>
      </section>

      {/* Pure client interactivity */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-sky-300">
          1. Pure Client State (no server involved)
        </h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          <Counter label="Counter A" initialValue={0} />
          <Counter label="Counter B" initialValue={10} />
          <Counter label="Counter C" initialValue={-5} />
        </div>
      </section>

      {/* Server function → Client Component, called from client */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-sky-300">
          2. Server function → Client Component, called from Client
        </h2>
        <p className="text-slate-400 text-sm">
          randomFact() returns a client component with local state. Called from
          a client component using the <code className="text-indigo-400">resourceId</code> pattern.
        </p>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <Suspense
            fallback={<Spinner label="Loading fact…" />}
            resourceId={`fact-${factKey}`}
          >
            {() => randomFact()}
          </Suspense>
          <button
            onClick={() => setFactKey((k) => k + 1)}
            className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 active:scale-95 transition text-white text-sm font-medium cursor-pointer"
          >
            🔄 Refresh Fact
          </button>
        </div>
      </section>

      {/* Server function → Server Component, called from client */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-sky-300">
          3. Server function → Server Component, called from Client
        </h2>
        <p className="text-slate-400 text-sm">
          serverTime() returns plain server JSX (no "use client"). Called from
          this client component — the result is streamed in as RSC payload.
        </p>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <Suspense
            fallback={<Spinner label="Fetching server time…" />}
            resourceId={`time-${timeKey}`}
          >
            {() => serverTime()}
          </Suspense>
          <button
            onClick={() => setTimeKey((k) => k + 1)}
            className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 active:scale-95 transition text-white text-sm font-medium cursor-pointer"
          >
            🔄 Refresh Time
          </button>
        </div>
      </section>

      {/* Server function → Client Component (QuoteCard) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-sky-300">
          4. Server function → Client Component (existing QuoteCard)
        </h2>
        <p className="text-slate-400 text-sm">
          The original quoteCard() from the app root, reused here from a client
          component context.
        </p>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4">
          <Suspense
            fallback={<Spinner label="Fetching quote…" />}
            resourceId={`quote-${quoteKey}`}
          >
            {() => quoteCard()}
          </Suspense>
          <button
            onClick={() => setQuoteKey((k) => k + 1)}
            className="px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 active:scale-95 transition text-white text-sm font-medium cursor-pointer"
          >
            🔄 New Quote
          </button>
        </div>
      </section>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-slate-500 text-sm">{label}</span>
    </div>
  );
}
