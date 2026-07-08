// Server Component page — demonstrates server functions called from server component
import Suspense from "react-enhanced-suspense";
import DemoCard from "@/demo/components/demo-card";
import { serverTime } from "@/demo/server-functions/server-time";
import { systemInfo } from "@/demo/server-functions/system-info";
import { fetchPost, statsPanel } from "@/demo/server-functions/posts";
import { randomFact } from "@/demo/server-functions/random-fact";

export default function ServerComponentsPage() {
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold text-white mb-2">Server Components</h1>
        <p className="text-slate-400 mb-6">
          This entire page is a Server Component. Every call below is a server
          function called directly (not via fetch) — the result streams in via
          RSC Flight.
        </p>
      </section>

      {/* 1. Server function → server component with no args */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-indigo-300">
          1. Server function → Server Component (no args)
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <DemoCard title="serverTime()">
            <Suspense fallback={<Skeleton label="Loading time…" />}>
              {serverTime()}
            </Suspense>
          </DemoCard>
          <DemoCard title="systemInfo()">
            <Suspense fallback={<Skeleton label="Loading system info…" />}>
              {systemInfo()}
            </Suspense>
          </DemoCard>
        </div>
      </section>

      {/* 2. Server function → server component with args */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-indigo-300">
          2. Server function with args → Server Component
        </h2>
        <p className="text-slate-400 text-sm">
          Three calls to the same server function with different IDs — each
          streams independently.
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((id) => (
            <Suspense key={id} fallback={<Skeleton label={`Loading post ${id}…`} />}>
              {fetchPost(id)}
            </Suspense>
          ))}
        </div>
      </section>

      {/* 3. Server function → server component with parallel Promise.all */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-indigo-300">
          3. Server function using Promise.all internally
        </h2>
        <p className="text-slate-400 text-sm">
          statsPanel() runs three async fetches in parallel server-side, returns
          a composed server component.
        </p>
        <Suspense fallback={<Skeleton label="Loading stats…" />}>
          {statsPanel()}
        </Suspense>
      </section>

      {/* 4. Server function → CLIENT component */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-indigo-300">
          4. Server function → Client Component (from Server Component)
        </h2>
        <p className="text-slate-400 text-sm">
          randomFact() returns a {"<RandomFact />"} client component with local
          state (liked). The data is fetched server-side, the interactivity
          is client-side.
        </p>
        <Suspense fallback={<Skeleton label="Loading fact…" />}>
          {randomFact()}
        </Suspense>
      </section>
    </div>
  );
}

function Skeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-slate-500 text-sm">{label}</span>
    </div>
  );
}
