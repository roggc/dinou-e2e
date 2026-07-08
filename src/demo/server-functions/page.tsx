// Server Component — demonstrates all server function patterns
import Suspense from "react-enhanced-suspense";
import DemoCard from "@/demo/components/demo-card";
import { liveClock } from "@/demo/server-functions/misc";
import { leaderboard } from "@/demo/server-functions/misc";
import { randomFact } from "@/demo/server-functions/random-fact";
import { fetchPost } from "@/demo/server-functions/posts";
import { statsPanel } from "@/demo/server-functions/posts";
import ServerFunctionsTester from "@/demo/components/server-functions-tester";

export default function ServerFunctionsPage() {
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold text-white mb-2">Server Functions</h1>
        <p className="text-slate-400 mb-6">
          Demonstrating all server function return types and calling contexts.
          Server functions can return plain JSX (server components) or client
          components with interactive state.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-emerald-300">
          1. SF → Client Component (with setInterval)
        </h2>
        <p className="text-slate-400 text-sm">
          liveClock() returns a LiveClock client component. The server function
          runs server-side, returns the component reference, React hydrates it
          with a running clock interval.
        </p>
        <Suspense fallback={<Skel />}>{liveClock()}</Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-emerald-300">
          2. SF → Server Component (leaderboard table)
        </h2>
        <p className="text-slate-400 text-sm">
          leaderboard() returns a table built entirely server-side. No JS is
          sent to the client for this component.
        </p>
        <DemoCard title="leaderboard()">
          <Suspense fallback={<Skel />}>{leaderboard()}</Suspense>
        </DemoCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-emerald-300">
          3. SF → Client Component with local state (RandomFact)
        </h2>
        <Suspense fallback={<Skel />}>{randomFact()}</Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-emerald-300">
          4. Multiple parallel SF calls (Promise.all internally)
        </h2>
        <Suspense fallback={<Skel />}>{statsPanel()}</Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-emerald-300">
          5. SF called from a Client Component (interactive tester)
        </h2>
        <p className="text-slate-400 text-sm">
          ServerFunctionsTester is a client component that lets you pick which
          server function to call and displays the result dynamically.
        </p>
        <ServerFunctionsTester />
      </section>
    </div>
  );
}

function Skel() {
  return (
    <div className="flex items-center gap-2 py-3">
      <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-slate-500 text-sm">Loading…</span>
    </div>
  );
}
