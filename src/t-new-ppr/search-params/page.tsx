import { Suspense } from "react";
import { noDynamic, useSearchParams } from "dinou";
import { incrementRenderCount } from "../ppr-tracker";
import {
  ClientShellSearchWidget,
  ClientHoleSearchWidget,
} from "./client-search-widgets";

function SyncServerSearchWidget() {
  const searchParams = useSearchParams();
  const count = incrementRenderCount("sp-ppr:sync-rsc");
  const q = searchParams.get("q") || "none";
  const tab = searchParams.get("tab") || "none";

  return (
    <div data-testid="sp-sync-rsc-resolved" data-render-count={String(count)}>
      syncRsc:q={q}|tab={tab}|renderCount={count}
    </div>
  );
}

async function NoDynamicOverrideSearchWidget() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 10));
  const searchParams = useSearchParams();
  const count = incrementRenderCount("sp-ppr:nodynamic-rsc");
  const q = searchParams.get("q") || "none";

  return (
    <div data-testid="sp-nodynamic-rsc-resolved" data-render-count={String(count)}>
      noDynamicRsc:q={q}|renderCount={count}
    </div>
  );
}

async function AsyncHoleWithNestedClientWidget() {
  await new Promise((r) => setTimeout(r, 15));
  const searchParams = useSearchParams();
  const count = incrementRenderCount("sp-ppr:async-hole-rsc");
  const q = searchParams.get("q") || "none";

  return (
    <div data-testid="sp-async-hole-resolved" data-render-count={String(count)}>
      <span data-testid="sp-async-hole-rsc-q">asyncHoleRsc:q={q}</span>
      <ClientHoleSearchWidget />
    </div>
  );
}

export default function PprSearchParamsPage() {
  const rootCount = incrementRenderCount("sp-ppr:page-root");

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>PPR useSearchParams Matrix</title>
      </head>
      <body>
        <div data-testid="sp-ppr-page-root" data-render-count={String(rootCount)}>
          <h1>PPR useSearchParams Matrix (Root Render #{rootCount})</h1>

          {/* Boundary #1: Client Component in <Suspense> -> stays in Static Shell (NOT a hole) */}
          <Suspense fallback={<div data-testid="sp-client-shell-fallback">Loading client shell...</div>}>
            <ClientShellSearchWidget />
          </Suspense>

          {/* Boundary #2: Synchronous RSC calling useSearchParams() -> Dynamic PPR Hole (ppr-hole-2) */}
          <Suspense fallback={<div data-testid="sp-sync-rsc-fallback">Loading sync RSC search...</div>}>
            <SyncServerSearchWidget />
          </Suspense>

          {/* Boundary #3: Async RSC calling noDynamic() + useSearchParams() -> Dynamic PPR Hole (ppr-hole-3) */}
          <Suspense fallback={<div data-testid="sp-nodynamic-rsc-fallback">Loading noDynamic RSC search...</div>}>
            <NoDynamicOverrideSearchWidget />
          </Suspense>

          {/* Boundary #4: Async RSC calling useSearchParams() after await + nested Client Component -> Dynamic PPR Hole (ppr-hole-4) */}
          <Suspense fallback={<div data-testid="sp-async-hole-fallback">Loading async + client hole...</div>}>
            <AsyncHoleWithNestedClientWidget />
          </Suspense>
        </div>
      </body>
    </html>
  );
}

