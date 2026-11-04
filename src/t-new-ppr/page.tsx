// src/test-ppr/page.tsx
import { Suspense } from "react";
import { getContext, noDynamic } from "dinou";
import { DinouCacheSlot, noDynamic as noDynamicFromServer } from "dinou/server";
import { incrementRenderCount } from "./ppr-tracker";

// ============================================================================
// CASE 2: Default Dynamic Hole (<Suspense> + async Server Component, NO cookies/headers/query)
// ============================================================================
async function DefaultAsyncDynamicHole() {
  // Note: If this ran past the first await during build, "case2-post-await-executed" would increment at build time!
  await new Promise((r) => setTimeout(r, 25));
  const count = incrementRenderCount("case2-default-async-hole");
  return (
    <div data-testid="case2-resolved" data-render-count={String(count)} className="text-sm font-mono text-amber-700 dark:text-amber-300">
      Case 2 Resolved at Runtime! Render #{count} @ {new Date().toISOString()}
    </div>
  );
}

// ============================================================================
// CASE 3: Dynamic Hole reading getContext().req (cookies, headers, query)
// ============================================================================
async function RequestAwareDynamicHole() {
  await new Promise((r) => setTimeout(r, 15));
  const ctx = getContext();
  const sessionCookie = ctx?.req?.cookies?.session || "anon";
  const customHeader = ctx?.req?.headers?.["x-test-ppr"] || "none";
  const filterQuery = ctx?.req?.query?.filter || "all";
  const count = incrementRenderCount("case3-req-hole");
  return (
    <div
      data-testid="case3-resolved"
      data-render-count={String(count)}
      data-session={String(sessionCookie)}
      data-header={String(customHeader)}
      data-filter={String(filterQuery)}
      className="text-sm font-mono text-amber-700 dark:text-amber-300"
    >
      Case 3 Request Hole: session={String(sessionCookie)} | header={String(customHeader)} | filter={String(filterQuery)} | Render #{count}
    </div>
  );
}

// ============================================================================
// CASE 4: Static <Suspense> Opt-Out via noDynamic() from "dinou"
// ============================================================================
async function StaticMarkdownWithNoDynamic() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 20));
  const count = incrementRenderCount("case4-static-nodynamic");
  return (
    <div data-testid="case4-resolved" data-render-count={String(count)} className="text-sm font-mono text-emerald-700 dark:text-emerald-300">
      Case 4 Static Shell via noDynamic() ("dinou")! Render #{count}
    </div>
  );
}

// ============================================================================
// CASE 5: Static <Suspense> Opt-Out via noDynamic() from "dinou/server" + Async Child Inheritance
// ============================================================================
async function ChildAsyncInheritingNoDynamic() {
  // Does NOT call noDynamic() itself; inherits from ParentWithNoDynamic's <Suspense> store!
  await new Promise((r) => setTimeout(r, 15));
  const childCount = incrementRenderCount("case5-child-inherited-nodynamic");
  return (
    <span data-testid="case5-child-resolved" data-render-count={String(childCount)}>
      [Child Async Inherited noDynamic Render #{childCount}]
    </span>
  );
}

async function ParentWithNoDynamic() {
  noDynamicFromServer();
  await new Promise((r) => setTimeout(r, 15));
  const parentCount = incrementRenderCount("case5-parent-nodynamic");
  return (
    <div data-testid="case5-parent-resolved" data-render-count={String(parentCount)} className="text-sm font-mono text-emerald-700 dark:text-emerald-300">
      Case 5 Parent noDynamic() ("dinou/server") Render #{parentCount} &rarr; <ChildAsyncInheritingNoDynamic />
    </div>
  );
}

// ============================================================================
// CASE 6: noDynamic() + Dynamic Request Access (req.cookies) -> Dynamic Bailout Wins!
// ============================================================================
async function NoDynamicButReadsCookies() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 15));
  const theme = getContext()?.req?.cookies?.theme || "default-theme";
  const count = incrementRenderCount("case6-nodynamic-cookies-bailout");
  return (
    <div data-testid="case6-resolved" data-theme={String(theme)} data-render-count={String(count)} className="text-sm font-mono text-amber-700 dark:text-amber-300">
      Case 6 (noDynamic + cookies bailout) Theme={String(theme)} | Render #{count}
    </div>
  );
}

// ============================================================================
// CASE 7: noDynamic() Called AFTER First await -> Too Late, Becomes Dynamic Hole!
// ============================================================================
async function LateNoDynamicComponent() {
  await new Promise((r) => setTimeout(r, 15));
  // Calling noDynamic() after the first await has no effect on this component at build time
  noDynamic();
  const count = incrementRenderCount("case7-late-nodynamic");
  return (
    <div data-testid="case7-resolved" data-render-count={String(count)} className="text-sm font-mono text-amber-700 dark:text-amber-300">
      Case 7 (Late noDynamic after first await &rarr; Dynamic Hole) Render #{count}
    </div>
  );
}

// ============================================================================
// CASE 8A/8B/8C: <DinouCacheSlot revalidate={3600}>
// - 8A: Outside <Suspense> -> Static Shell
// - 8B: Inside <Suspense> (async default) -> Cached Dynamic Hole (fallback in shell, cached in runtime)
// - 8C: Inside <Suspense> + noDynamic() -> Static Shell
// ============================================================================
async function CachedSlotUnwrappedAsyncChild() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("case8a-slot-unwrapped-shell");
  return (
    <div data-testid="case8a-resolved" data-render-count={String(count)} className="text-sm font-mono text-emerald-700 dark:text-emerald-300">
      Case 8A (&lt;DinouCacheSlot revalidate=3600&gt; Outside &lt;Suspense&gt; &rarr; Static Shell) Render #{count}
    </div>
  );
}

async function CachedSlotAsyncChild() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("case8-slot-revalidate-60");
  return (
    <div data-testid="case8-resolved" data-render-count={String(count)} className="text-sm font-mono text-blue-700 dark:text-blue-300">
      Case 8B (&lt;Suspense&gt; + &lt;DinouCacheSlot revalidate=3600&gt; &rarr; Cached Dynamic Hole) Render #{count}
    </div>
  );
}

async function CachedSlotNoDynamicAsyncChild() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("case8c-slot-nodynamic-shell");
  return (
    <div data-testid="case8c-resolved" data-render-count={String(count)} className="text-sm font-mono text-emerald-700 dark:text-emerald-300">
      Case 8C (&lt;Suspense&gt; + &lt;DinouCacheSlot revalidate=3600&gt; + noDynamic() &rarr; Static Shell) Render #{count}
    </div>
  );
}

async function CachedSlotInnerSuspenseAsyncChild() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("case8d-slot-wrapping-suspense-shell");
  return (
    <div data-testid="case8d-resolved" data-render-count={String(count)} className="text-sm font-mono text-emerald-700 dark:text-emerald-300">
      Case 8D (&lt;DinouCacheSlot revalidate=3600&gt; Wrapping &lt;Suspense&gt; + Async Child &rarr; Static Shell) Render #{count}
    </div>
  );
}

// ============================================================================
// CASE 9A/9B: <DinouCacheSlot> (omitted revalidate)
// - 9A: Outside <Suspense> -> Static Shell Forever
// - 9B: Inside <Suspense> (async default) -> Cached Dynamic Hole Forever
// ============================================================================
async function ForeverSlotUnwrappedAsyncChild() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("case9a-slot-forever-unwrapped");
  return (
    <div data-testid="case9a-resolved" data-render-count={String(count)} className="text-sm font-mono text-emerald-700 dark:text-emerald-300">
      Case 9A (&lt;DinouCacheSlot&gt; omitted revalidate Outside &lt;Suspense&gt; &rarr; Static Shell) Render #{count}
    </div>
  );
}

async function ForeverSlotAsyncChild() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("case9-slot-forever");
  return (
    <div data-testid="case9-resolved" data-render-count={String(count)} className="text-sm font-mono text-blue-700 dark:text-blue-300">
      Case 9B (&lt;Suspense&gt; + &lt;DinouCacheSlot&gt; omitted revalidate &rarr; Cached Dynamic Hole) Render #{count}
    </div>
  );
}

// ============================================================================
// CASE 10: <DinouCacheSlot revalidate={0}> inside <Suspense> -> Dynamic PPR Hole!
// ============================================================================
async function NoCacheSlotAsyncChild() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("case10-slot-revalidate-0");
  return (
    <div data-testid="case10-resolved" data-render-count={String(count)} className="text-sm font-mono text-amber-700 dark:text-amber-300">
      Case 10 (&lt;DinouCacheSlot revalidate=0&gt; &rarr; Dynamic Hole) Render #{count}
    </div>
  );
}

// ============================================================================
// CASE 11: <DinouCacheSlot revalidate={60}> + noDynamic() reading req.cookies inside <Suspense> -> Dynamic Hole!
// ============================================================================
async function SlotReadingCookiesChild() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 15));
  const user = getContext()?.req?.cookies?.user || "guest";
  const count = incrementRenderCount("case11-slot-cookies");
  return (
    <div data-testid="case11-resolved" data-user={String(user)} data-render-count={String(count)} className="text-sm font-mono text-amber-700 dark:text-amber-300">
      Case 11 (&lt;DinouCacheSlot revalidate=60&gt; + noDynamic + cookies &rarr; Dynamic Hole) user={String(user)} | Render #{count}
    </div>
  );
}

// ============================================================================
// CASE 12: Nested <Suspense> (Outer Static <Suspense> + Inner Dynamic <Suspense> Hole)
// ============================================================================
async function InnerDynamicNestedHole() {
  await new Promise((r) => setTimeout(r, 20));
  const count = incrementRenderCount("case12-inner-dynamic");
  return (
    <div data-testid="case12-inner-resolved" data-render-count={String(count)} className="text-sm font-mono text-amber-700 dark:text-amber-300 mt-1">
      Case 12 Inner Dynamic Hole Resolved! Render #{count}
    </div>
  );
}

async function OuterStaticWrapperWithNestedDynamicHole() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 10));
  const outerCount = incrementRenderCount("case12-outer-static");
  return (
    <div data-testid="case12-outer-resolved" data-render-count={String(outerCount)} className="text-sm font-mono text-emerald-700 dark:text-emerald-300">
      <div>Case 12 Outer Static &lt;Suspense&gt; (async + noDynamic) Baked in Shell (Render #{outerCount})</div>
      <Suspense fallback={<div data-testid="case12-inner-fallback">Loading Case 12 Inner Dynamic Hole...</div>}>
        <InnerDynamicNestedHole />
      </Suspense>
    </div>
  );
}

async function UnwrappedAsyncChildOutsideSuspense() {
  await new Promise((r) => setTimeout(r, 10));
  const count = incrementRenderCount("case1b-unwrapped-async-child");
  return (
    <p data-testid="case1b-unwrapped-child-shell" data-render-count={String(count)} className="text-sm font-mono text-emerald-700 dark:text-emerald-300 mt-1">
      Case 1B Unwrapped Async Child (Outside &lt;Suspense&gt;) Baked in Shell! Render #{count}
    </p>
  );
}

export default async function TestPprMatrixPage() {
  await new Promise((r) => setTimeout(r, 10));
  const shellCount = incrementRenderCount("case1-page-static-shell");

  return (
    <div className="space-y-6" data-testid="test-ppr-matrix-page">
      {/* CASE 1: Top-level & Child Async Server Components outside <Suspense> */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 1: Top-Level &amp; Child Async Server Components (Outside &lt;Suspense&gt;)</h3>
        <p data-testid="case1-static-shell" data-render-count={String(shellCount)} className="text-sm font-mono text-emerald-700 dark:text-emerald-300">
          Case 1A Static Shell Baked at Build! Render #{shellCount}
        </p>
        <UnwrappedAsyncChildOutsideSuspense />
      </section>

      {/* CASE 2: Default Dynamic Hole (<Suspense> + async Server Component) */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 2: Default Dynamic Hole (&lt;Suspense&gt; + async Component, no cookies/headers)</h3>
        <Suspense fallback={<div data-testid="case2-fallback">Loading Case 2 Default Async Dynamic Hole...</div>}>
          <DefaultAsyncDynamicHole />
        </Suspense>
      </section>

      {/* CASE 3: Dynamic Hole reading req.cookies, req.headers, req.query */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 3: Request-Aware Dynamic Hole (cookies, headers, query)</h3>
        <Suspense fallback={<div data-testid="case3-fallback">Loading Case 3 Request Hole...</div>}>
          <RequestAwareDynamicHole />
        </Suspense>
      </section>

      {/* CASE 4: Static <Suspense> via noDynamic() from "dinou" */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 4: Static &lt;Suspense&gt; Opt-Out via noDynamic() (&quot;dinou&quot;)</h3>
        <Suspense fallback={<div data-testid="case4-fallback">Loading Case 4 Static noDynamic...</div>}>
          <StaticMarkdownWithNoDynamic />
        </Suspense>
      </section>

      {/* CASE 5: Static <Suspense> via noDynamic() from "dinou/server" + Async Child Inheritance */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 5: Parent noDynamic() (&quot;dinou/server&quot;) + Nested Async Child Inheritance</h3>
        <Suspense fallback={<div data-testid="case5-fallback">Loading Case 5 Parent + Child...</div>}>
          <ParentWithNoDynamic />
        </Suspense>
      </section>

      {/* CASE 6: noDynamic() + req.cookies -> Dynamic Bailout Overrides noDynamic() */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 6: noDynamic() + req.cookies (Dynamic Bailout Override)</h3>
        <Suspense fallback={<div data-testid="case6-fallback">Loading Case 6 Cookie Bailout...</div>}>
          <NoDynamicButReadsCookies />
        </Suspense>
      </section>

      {/* CASE 7: noDynamic() Called AFTER First await -> Dynamic Hole */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 7: noDynamic() Called After First await (Timing Rule Verification)</h3>
        <Suspense fallback={<div data-testid="case7-fallback">Loading Case 7 Late noDynamic...</div>}>
          <LateNoDynamicComponent />
        </Suspense>
      </section>

      {/* CASE 8A/8B/8C: <DinouCacheSlot revalidate={3600}> (Unwrapped vs <Suspense> vs <Suspense> + noDynamic) */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 8: &lt;DinouCacheSlot revalidate=3600&gt; (8A Unwrapped Shell, 8B Suspense Hole, 8C Suspense + noDynamic Shell)</h3>
        <DinouCacheSlot id="test-ppr-slot-unwrapped" tag="tag-ppr-unwrapped" revalidate={3600}>
          <CachedSlotUnwrappedAsyncChild />
        </DinouCacheSlot>
        <Suspense fallback={<div data-testid="case8-fallback">Loading Case 8B Cached Slot Hole...</div>}>
          <DinouCacheSlot id="test-ppr-slot-cached" tag="tag-ppr-cached" revalidate={3600}>
            <CachedSlotAsyncChild />
          </DinouCacheSlot>
        </Suspense>
        <Suspense fallback={<div data-testid="case8c-fallback">Loading Case 8C NoDynamic Slot...</div>}>
          <DinouCacheSlot id="test-ppr-slot-nodynamic" tag="tag-ppr-nodynamic" revalidate={3600}>
            <CachedSlotNoDynamicAsyncChild />
          </DinouCacheSlot>
        </Suspense>
        <DinouCacheSlot id="test-ppr-slot-outer-wrapping-suspense" tag="tag-ppr-outer-wrapping-suspense" revalidate={3600}>
          <Suspense fallback={<div data-testid="case8d-fallback">Loading Case 8D Inner Suspense inside Slot...</div>}>
            <CachedSlotInnerSuspenseAsyncChild />
          </Suspense>
        </DinouCacheSlot>
      </section>

      {/* CASE 9A/9B: <DinouCacheSlot> (omitted revalidate) */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 9: &lt;DinouCacheSlot&gt; (Omitted revalidate: 9A Unwrapped Shell, 9B Suspense Hole)</h3>
        <DinouCacheSlot id="test-ppr-slot-forever-unwrapped" tag="tag-ppr-forever-unwrapped">
          <ForeverSlotUnwrappedAsyncChild />
        </DinouCacheSlot>
        <Suspense fallback={<div data-testid="case9-fallback">Loading Case 9B Forever Slot Hole...</div>}>
          <DinouCacheSlot id="test-ppr-slot-forever" tag="tag-ppr-forever">
            <ForeverSlotAsyncChild />
          </DinouCacheSlot>
        </Suspense>
      </section>

      {/* CASE 10: <DinouCacheSlot revalidate={0}> inside <Suspense> */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 10: &lt;DinouCacheSlot revalidate=0&gt; inside &lt;Suspense&gt; (Dynamic Hole)</h3>
        <Suspense fallback={<div data-testid="case10-fallback">Loading Case 10 No-Cache Slot Hole...</div>}>
          <DinouCacheSlot id="test-ppr-slot-nocache" revalidate={0}>
            <NoCacheSlotAsyncChild />
          </DinouCacheSlot>
        </Suspense>
      </section>

      {/* CASE 11: <DinouCacheSlot revalidate={60}> reading req.cookies inside <Suspense> */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 11: &lt;DinouCacheSlot revalidate=60&gt; Reading Cookies inside &lt;Suspense&gt; (Dynamic Hole)</h3>
        <Suspense fallback={<div data-testid="case11-fallback">Loading Case 11 Cookie Slot Hole...</div>}>
          <DinouCacheSlot id="test-ppr-slot-cookies" tag="tag-slot-cookies" revalidate={3600}>
            <SlotReadingCookiesChild />
          </DinouCacheSlot>
        </Suspense>
      </section>

      {/* CASE 12: Nested <Suspense> (Static Outer + Dynamic Inner Hole) */}
      <section className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <h3 className="font-semibold text-slate-900 dark:text-white">Case 12: Nested &lt;Suspense&gt; (Static Outer + Dynamic Inner Hole)</h3>
        <Suspense fallback={<div data-testid="case12-outer-fallback">Loading Case 12 Outer...</div>}>
          <OuterStaticWrapperWithNestedDynamicHole />
        </Suspense>
      </section>
    </div>
  );
}

