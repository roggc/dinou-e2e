// Server Component — no "use client"
import Suspense from "react-enhanced-suspense";
import { serverTime } from "@/demo/server-functions/server-time";
import { systemInfo } from "@/demo/server-functions/system-info";
import DemoCard from "@/demo/components/demo-card";
import Badge from "@/demo/components/badge";

export default function DemoIndexPage() {
  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-4xl font-bold text-white mb-2">
          Dinou RSC Feature Demo
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl">
          A comprehensive showcase of React Server Components, Server Functions,
          Client Components and all the patterns Dinou supports.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-indigo-300 mb-4">
          Server Component: Direct Server Data
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          This page itself is a Server Component. No "use client" — rendered on
          the server, streamed as RSC Flight payload.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DemoCard title="Server Time (from server function, called in Server Component)">
            <Suspense fallback={<Skeleton />}>{serverTime()}</Suspense>
          </DemoCard>

          <DemoCard title="System Info (server function → server component)">
            <Suspense fallback={<Skeleton />}>{systemInfo()}</Suspense>
          </DemoCard>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-indigo-300 mb-4">
          All Demo Sections
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <RouteCard
            href="/demo/server-components"
            title="Server Components"
            description="Pure server components, async data fetching, streaming with Suspense."
            badge="RSC"
          />
          <RouteCard
            href="/demo/client-components"
            title="Client Components"
            description="useState, useEffect, client interactivity, calling server functions from client."
            badge="Client"
          />
          <RouteCard
            href="/demo/server-functions"
            title="Server Functions"
            description="Server functions returning JSX (client or server components)."
            badge="use server"
          />
          <RouteCard
            href="/demo/mixed"
            title="Mixed Patterns"
            description="Server functions called from server components AND client components on the same page."
            badge="Mixed"
          />
          <RouteCard
            href="/demo/dynamic/react"
            title="Dynamic Route /demo/dynamic/:slug"
            description="File-system dynamic routing with [slug] param."
            badge="[slug]"
          />
          <RouteCard
            href="/demo/form"
            title="Form + Server Action"
            description="Server function called with FormData, returns JSX result."
            badge="FormData"
          />
        </div>
      </section>
    </div>
  );
}

function RouteCard({
  href,
  title,
  description,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <a
      href={href}
      className="block rounded-2xl border border-slate-800 bg-slate-900 p-5 hover:border-indigo-600 hover:bg-slate-800 transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
          {title}
        </h3>
        <Badge>{badge}</Badge>
      </div>
      <p className="text-slate-400 text-sm">{description}</p>
    </a>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse h-10 bg-slate-800 rounded-lg w-full" />
  );
}
