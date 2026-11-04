// src/test-ppr/layout.tsx
import { Suspense, type ReactNode } from "react";
import { noDynamic, Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { incrementRenderCount } from "./ppr-tracker";

async function LayoutStaticBanner() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("layout-static-nodynamic");
  return (
    <div
      data-testid="layout-nodynamic-resolved"
      data-render-count={String(count)}
      className="px-3 py-1.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 text-xs font-mono"
    >
      [Layout Static &lt;Suspense&gt; via noDynamic()] Render #{count}
    </div>
  );
}

async function LayoutCachedSlotContent() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("layout-slot-cached");
  return (
    <div
      data-testid="layout-slot-cached-resolved"
      data-render-count={String(count)}
      className="px-3 py-1.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 text-xs font-mono"
    >
      [Layout &lt;DinouCacheSlot revalidate=120&gt;] Render #{count}
    </div>
  );
}

async function LayoutLiveClock() {
  await new Promise((r) => setTimeout(r, 20));
  const count = incrementRenderCount("layout-dynamic-hole");
  return (
    <div
      data-testid="layout-dynamic-resolved"
      data-render-count={String(count)}
      className="px-3 py-1.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 text-xs font-mono"
    >
      [Layout Dynamic Hole &lt;Suspense&gt; async] Render #{count} @ {new Date().toISOString()}
    </div>
  );
}

export default async function TestPprLayout({ children }: { children: ReactNode }) {
  const layoutShellCount = incrementRenderCount("layout-shell");
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6" data-testid="test-ppr-layout">
      <div className="p-4 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/70 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white" data-testid="layout-static-shell">
            PPR Test Suite Layout Shell (Render #{layoutShellCount})
          </h2>
          <nav className="flex gap-3 text-sm font-medium">
            <Link href="/test-ppr" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              Matrix (/test-ppr)
            </Link>
            <Link href="/test-ppr/all-static" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              All Static (/test-ppr/all-static)
            </Link>
            <Link href="/test-ppr/opt-out-route" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              Opt-Out ppr=false (/test-ppr/opt-out-route)
            </Link>
          </nav>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {/* Layout Boundary 1: Static <Suspense> via noDynamic() */}
          <Suspense
            fallback={
              <div data-testid="layout-nodynamic-fallback" className="text-xs font-mono text-slate-500">
                Loading Layout Static Banner...
              </div>
            }
          >
            <LayoutStaticBanner />
          </Suspense>

          {/* Layout Item 2: <DinouCacheSlot revalidate={3600}> outside <Suspense> -> Static Shell */}
          <DinouCacheSlot id="test-ppr-layout-slot" tag="tag-layout-slot" revalidate={3600}>
            <LayoutCachedSlotContent />
          </DinouCacheSlot>

          {/* Layout Boundary 3: Dynamic PPR Hole (<Suspense> + async without noDynamic) */}
          <Suspense
            fallback={
              <div data-testid="layout-dynamic-fallback" className="text-xs font-mono text-amber-600">
                Loading Layout Live Clock...
              </div>
            }
          >
            <LayoutLiveClock />
          </Suspense>
        </div>
      </div>

      <main>{children}</main>
    </div>
  );
}

