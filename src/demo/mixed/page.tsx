// Server Component — both a server component AND a client component
// call the same server functions side by side
import Suspense from "react-enhanced-suspense";
import { randomFact } from "@/demo/server-functions/random-fact";
import { serverTime } from "@/demo/server-functions/server-time";
import { statsPanel } from "@/demo/server-functions/posts";
import { liveClock } from "@/demo/server-functions/misc";
import MixedClientSection from "@/demo/components/mixed-client-section";

export default function MixedPage() {
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold text-white mb-2">Mixed Patterns</h1>
        <p className="text-slate-400 mb-6">
          The same server functions are called from two different contexts on
          this page: from this Server Component (top section) and from a Client
          Component (bottom section). Observe how the RSC streaming works in
          both cases.
        </p>
      </section>

      {/* Server Component side */}
      <section className="rounded-2xl border border-indigo-800 bg-slate-900 p-6 space-y-6">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-indigo-900 text-indigo-300 text-xs font-mono border border-indigo-700">
            Server Component context
          </span>
          <p className="text-slate-400 text-sm">
            Server functions called directly in JSX
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-mono">serverTime()</p>
            <Suspense fallback={<Skel color="indigo" />}>{serverTime()}</Suspense>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-mono">randomFact()</p>
            <Suspense fallback={<Skel color="indigo" />}>{randomFact()}</Suspense>
          </div>
          <div className="space-y-2 md:col-span-2">
            <p className="text-xs text-slate-500 font-mono">statsPanel()</p>
            <Suspense fallback={<Skel color="indigo" />}>{statsPanel()}</Suspense>
          </div>
        </div>
      </section>

      {/* Client Component side — calls same functions with resourceId */}
      <section className="rounded-2xl border border-sky-800 bg-slate-900 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-sky-900 text-sky-300 text-xs font-mono border border-sky-700">
            Client Component context
          </span>
          <p className="text-slate-400 text-sm">
            Same functions, called with resourceId pattern, refreshable
          </p>
        </div>
        <MixedClientSection />
      </section>
    </div>
  );
}

function Skel({ color = "indigo" }: { color?: string }) {
  const cls: Record<string, string> = {
    indigo: "border-indigo-400",
    sky: "border-sky-400",
  };
  return (
    <div className="flex items-center gap-2 py-2">
      <div className={`w-4 h-4 border-2 ${cls[color] ?? "border-indigo-400"} border-t-transparent rounded-full animate-spin`} />
      <span className="text-slate-500 text-sm">Loading…</span>
    </div>
  );
}
