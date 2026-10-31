# Pure Horizontal Segmentation + Partial Prerendering (PPR) Synergy in Dinou — Empirical TDD Bug Report, Core Handler Fixes, User Guide, and 10-Scenario E2E Reference

This document provides a complete technical record and developer guide for the **Pure Horizontal Segmentation + Partial Prerendering (PPR) Synergy (without `<DinouCacheSlot>`)** in Dinou v9.0.3: how **Horizontal Segmentation** (`layout.rsc` / `shell.layout.json` vs. `shell.rsc` / `shell.page.json`, `@sidebar` parallel slots, multi-level nested layouts, `reset_layout` / `no_layout` boundaries, and surgical `revalidatePage` / `revalidateLayout` / `revalidateTag` invalidation) interacts with **Partial Prerendering (`ppr = true`)** (`shell.html`, pre-order `ppr-hole-N` indexing across layouts and pages, static vs. dynamic `<Suspense>` resolution, and `spliceDynamicHolesIntoShell` during soft navigation and `router.refresh`).

With the addition of this suite (`src/hs-ppr-test/` in `test-9.0.2`, mirrored to `src/t-rigurous-hs-ppr/` in `dinou-e2e`), Dinou's verification matrix now covers **all 7 non-empty combinations ($2^3 - 1 = 7$)** of its three core rendering and caching technologies:
1. **Horizontal Segmentation (HS) alone**: `/horizontal-segmentation-test` (`/t-rigurous-hs`)
2. **Vertical Segmentation (`<DinouCacheSlot>`) alone**: `/cache-slot-test`
3. **Partial Prerendering (PPR) alone**: `/ppr-test`
4. **PPR + `<DinouCacheSlot>` (Pairwise #1)**: `/ppr-cache-slot-test` (`/t-rigorous-sinergy`)
5. **HS + `<DinouCacheSlot>` (Pairwise #2)**: `/hs-cache-slot-test` (`/t-rigurous-hs-cache-slot`)
6. **HS + PPR (Pairwise #3 — Documented Here)**: `/hs-ppr-test` (`/t-rigurous-hs-ppr`)
7. **HS + `<DinouCacheSlot>` + PPR (Triple Synergy)**: `/triple-sinergy-test` (`/t-rigurous-triple-sinergy`)

Following a strict **Test-Driven Development (TDD)** methodology in `test-9.0.2`:
1. **Phase 1 (Test Suite Creation & Empirical Failure Confirmation)**: We designed and implemented the 10-scenario **Horizontal Segmentation + PPR (No-CacheSlot)** stress suite in `src/hs-ppr-test/` and executed it against the unmodified engine (`build:node:esbuild` + `start:node:esbuild`). On the first run, **7 of 10 scenarios passed (`7/10 PASSED, 3/10 FAILED`)**, exposing a critical architectural gap in `/____rsc_layout____` handling on PPR routes.
2. **Phase 2 (Surgical Core Fix in `dinou/core/handler.js`)**: We traced why `router.refresh({ layout: true })` leaked unrevalidated layout state on PPR routes and why PPR TTL expiration bypassed segmented layout caching, and implemented surgical fixes in `dinou/core/handler.js`.
3. **Phase 3 (Full Verification & Port to `dinou-e2e`)**: After rebuilding, `/hs-ppr-test` passed **10/10 in green (`0` failed, `0` hydration mismatches)**, all **8 rigorous suites** in `test-9.0.2` passed 100%, and the suite was ported to `dinou-e2e/src/t-rigurous-hs-ppr/` alongside its Playwright E2E specification in `dinou-e2e/e2e/example.spec.ts`.

---

## 1. Why Test Horizontal Segmentation + PPR Without `<DinouCacheSlot>`?

When `<DinouCacheSlot>` is absent, every dynamic region in layouts, parallel routes (`@sidebar`), and pages is expressed purely through **standard React `<Suspense>` boundaries** under **Partial Prerendering (`ppr = true`)**, while static outer shells are governed by **Horizontal Segmentation** (`layout.rsc` / `shell.layout.json` and `shell.rsc` / `shell.page.json`).

Testing HS + PPR as a pure pair isolates critical mechanisms that were either masked by `<DinouCacheSlot>` or untested in single-axis suites:

| Architectural Mechanism | Why Pure HS + PPR Exercises It Uniquely |
| :--- | :--- |
| **Dual Static Shell Trees (`shell.layout.json` + `shell.page.json`) vs. Live `<Suspense>` Holes** | On a PPR route without `<DinouCacheSlot>`, the static shell of the Layout (`layout.tsx` + `layout_functions.ts` `getProps` + `@sidebar` static shell) and the static shell of the Page (`page.tsx` + `page_functions.ts` `getProps` + static `<Suspense>` boundaries) must **both** remain frozen until explicitly revalidated—even while `router.refresh()` and `router.refresh({ layout: true })` re-execute their dynamic `<Suspense>` holes on every call. |
| **Pre-Order Hole Indexing Across `L1 Layout -> @sidebar -> L2 Layout -> Page -> Static <Suspense> -> Nested <Suspense>`** | When `ppr-hole-N` IDs are assigned across multiple layout levels and parallel slots without `<DinouCacheSlot>` wrappers, static `<Suspense>` boundaries (which resolve synchronously inside `shell.html`) and nested `<Suspense>` boundaries inside an already-dynamic hole must not shift or desynchronize `layoutHoleOffset` between `shell.html` and `/____rsc_page____`. |
| **Cross-Mode Horizontal Soft Navigation (`ppr = true` ↔ `ppr = false` Opt-Out)** | A parent layout can have PPR holes (`layout_functions.ts`), while one child page uses `ppr = true` and a sibling child page explicitly opts out with `export const ppr = false` (`static-optout/page_functions.ts`). Soft navigation between them must preserve the shared parent layout's client state with `0` layout network fetches. |
| **Standalone Layout Isolation (`reset_layout` & `no_layout`) + PPR Streaming** | Routes using `reset_layout` or `no_layout` alongside `ppr = true` must reset `ppr-hole-N` indexing to `1` (ignoring ancestor layout holes) and stream their own `<template id="ppr-content-ppr-hole-1">` chunks cleanly. |
| **Dynamic Layout Parameter Validation (`validateParams` + `getStaticPaths` + `allowISG = false`) on PPR Routes** | Dynamic layout segments (`team/[team]`) with `ppr = true` must enforce `validateParams` and `allowISG = false` on both HTML (`shell.html`) and RSC (`/____rsc_layout____`) endpoints, returning `404` for unlisted or invalid parameters. |

---

## 2. Phase 1 (Strict TDD): Empirical Bug Discovery (`7/10 PASSED, 3/10 FAILED`)

When we ran `/hs-ppr-test` before modifying `dinou/core/`, the automated runner reported:

```text
HS + PPR SUITE SUMMARY: DONE: 7/10 PASSED, 3 FAILED
  [PASSED] Test 1: shell.html holds L1 + @sidebar + Page A + Static <Suspense>; ppr-hole-1..4 streamed in tail; static-optout verified
  [FAILED] Test 2: router.refresh({ layout: true }) leaked unrevalidated L1 Layout static shell! Got l1Shell=101, l1Props=101, sidebarShell=101 (expected 100)
  [FAILED] Test 3: revalidateTag('hsppr-page-a-tag') should compose with cached layout.rsc (100), but got l1=101
  [FAILED] Test 4: Timeout waiting for DOM updated to L1=103 and Page A=102
  [PASSED] Test 5: Soft navigation across PPR A -> PPR B -> Static Opt-Out -> PPR A (?mode=nav-query) preserved L1 Layout state
  [PASSED] Test 6: 4 PPR holes (L1, @sidebar, L2, Nested Page) indexed 1..4; L2 surgical revalidation preserved frozen Nested Page shell (100)
  [PASSED] Test 7: revalidateLayout('/hs-ppr-test') propagated 301 to /hs-ppr-test/nested layout.rsc & shell.html while keeping Nested Page frozen at 100
  [PASSED] Test 8: revalidatePath('/hs-ppr-test/nested') updated both L2 Layout shell & Nested Page shell to 401 while preserving client state
  [PASSED] Test 9: Both reset_layout and no_layout PPR routes isolated from L1 Layout with intact shell + streamed ppr-hole-1
  [PASSED] Test 10: /team/alpha streamed 200 PPR shell+hole; /team/beta (allowISG=false) & /team/gamma (validateParams=false) returned 404 on HTML & RSC
```

### Root Cause of Bug #1: `/____rsc_layout____` (`isLayoutReq`) Bypassed `shell.layout.json` on PPR Routes and Re-Executed the Entire Layout From Scratch

- **Where**: `dinou/core/handler.js` (lines 1694–1739).
- **What Happened**:
  1. In Test 2, the test mutated all in-memory server sequence counters from `100` to `101` **without** calling any `revalidate*` function.
  2. When Test 2 called `router.refresh()` (page-only refresh), the client requested `/____rsc_page____/hs-ppr-test`. In `dinou/core/handler.js`, the handler matched:
     ```js
     if (isPageReq && isRoutePpr && !isDev && !isFresh) {
     ```
     It loaded `shell.page.json` (whose static shell was frozen at `100`), deserialized it via `deserializeJSX`, and called `spliceDynamicHolesIntoShell(pageShellTree, reqPath, query, layoutHoleOffset)`. As a result, Page A's static shell remained frozen at `100` while Page A's dynamic `<Suspense>` holes updated live to `101`.
  3. Next, Test 2 called `router.refresh({ layout: true })`, which fetches **both** `/____rsc_layout____/hs-ppr-test` (`isLayoutReq = true`) and `/____rsc_page____/hs-ppr-test` (`isPageReq = true`).
  4. For `/____rsc_layout____/hs-ppr-test`, `handler.js` skipped the static `layout.rsc` cache file because `isRoutePpr` was `true` (since the layout has dynamic `<Suspense>` holes that must be evaluated per-request). However, the `shell.*.json` + `spliceDynamicHolesIntoShell` block at line 1694 only checked `if (isPageReq && isRoutePpr && !isDev && !isFresh)`—it **did not include `isLayoutReq`**!
  5. Consequently, `/____rsc_layout____/hs-ppr-test` fell all the way through to the dynamic fallback `getJSX(reqPath, query, { segment: "layout" })`, which re-executed `layout.tsx`, `layout_functions.ts` (`getProps`), and `@sidebar/page.tsx` from scratch, leaking the unrevalidated `101` state into the DOM (and overwriting the client's L1 layout state, which cascaded into Test 3 and Test 4).

### Root Cause of Bug #2: PPR Route TTL Expiration (`isExpired`) Bypassed Segmented Layout Caching

- **Where**: `dinou/core/handler.js` (lines 1456–1466).
- **What Happened**:
  - When a PPR route's `metadata.json` had a finite `revalidate` TTL that expired (`isExpired === true`), the `shell.html` branch in `handler.js` simply skipped serving `shell.html` and fell through to a full dynamic render (`getJSX` for the entire route)—re-executing both the layout and the page even if the layout's own `layout.metadata.json` TTL was still valid.

---

## 3. Phase 2: Architecture & Surgical Fixes Implemented in `dinou/core/handler.js`

### 3.1. Unified `shell.layout.json` & `shell.page.json` Splicing on `/____rsc_layout____` and `/____rsc_page____`

```text
+---------------------------------------------------------------------------------------------------+
|             PPR + Horizontal Segmentation RSC Endpoint Pipeline (dinou/core/handler.js)           |
+---------------------------------------------------------------------------------------------------+

1. Client calls router.refresh() (or soft-navigates to a PPR route) -> GET /____rsc_page____/<route>
   |
   +--> Loads frozen `shell.page.json` (from Cloudflare KV / Deno KV / Node-Bun Disk)
   +--> Deserializes static page JSX tree (`deserializeJSX`)
   +--> Calls `spliceDynamicHolesIntoShell(shellTree, reqPath, query, layoutHoleOffset)`
   |      - Static Page shell + Page getProps() + Static <Suspense> stay FROZEN at last revalidation
   |      - Only Dynamic <Suspense> holes in the Page execute live (indexed from layoutHoleOffset + 1)
   +--> Streams Flight RSC payload to browser

2. Client calls router.refresh({ layout: true }) -> GET /____rsc_layout____/<route>
   |
   +--> Loads frozen `shell.layout.json` (from Cloudflare KV / Deno KV / Node-Bun Disk)
   +--> Deserializes static layout JSX tree (`deserializeJSX`)
   +--> Calls `spliceDynamicHolesIntoShell(shellTree, reqPath, query, 0)`
   |      - Static Layout shell (L1 + @sidebar + nested L2) + Layout getProps() stay FROZEN
   |      - Only Dynamic <Suspense> holes in Layout & @sidebar execute live (indexed from 1)
   +--> Streams Flight RSC payload to browser
```

In `dinou/core/handler.js` (lines 1694–1739), we extended the PPR shell-splicing branch from `if (isPageReq && isRoutePpr && !isDev && !isFresh)` to `if ((isPageReq || isLayoutReq) && isRoutePpr && !isDev && !isFresh)`:
- **Artifact Selection**: Reads `shell.layout.json` when `isLayoutReq` is `true`, and `shell.page.json` when `isPageReq` is `true` (supporting Cloudflare KV `__DINOU_KV__`, Deno KV `globalThis.__DINOU_DENO_KV__`, and the local `.dinou/static` filesystem).
- **Hole Offset Calculation**: Uses `holeOffset = 0` for `isLayoutReq` (since layout `<Suspense>` holes always start at `ppr-hole-1`) and `holeOffset = routeMeta?.layoutPprHoles?.length ?? 0` for `isPageReq`.
- **Result**: Calling `router.refresh({ layout: true })` on a PPR route now refreshes all dynamic `<Suspense>` holes inside the layout and `@sidebar` with live request context (cookies, headers, query params) while strictly preserving the layout's frozen static shell until `revalidateLayout`, `revalidateTag`, or `revalidatePath` is invoked (or `<Link fresh>` is used).

### 3.2. Surgical Page Revalidation on PPR TTL Expiration

In `dinou/core/handler.js` (lines 1456–1466), when `isExpired` is detected on a PPR route's `metadata.json`:
- Instead of falling through to an unsegmented full-route render, `handler.js` now invokes `await revalidatePage(reqPath)` and reloads `shell.html` and `metadata.json` from the newly regenerated static cache.
- Because `revalidatePage(reqPath)` composes the freshly rendered page shell with the existing cached `layout.rsc` (unless the layout itself is expired), the layout's static shell is never unnecessarily re-executed when only the page's TTL expires.

---

## 4. User-Facing Guide: How to Use Horizontal Segmentation + PPR in Dinou

From a developer's perspective, combining **Horizontal Segmentation** and **Partial Prerendering (PPR)** gives you the best of both worlds without writing any custom caching or streaming glue code:
- **Instant Static Shells (`shell.html`, `shell.layout.json`, `shell.page.json`)**: Your layouts, parallel slots (`@sidebar`), and pages pre-render their static UI and `getProps()` data at build time (or revalidation time).
- **Live Per-Request Streaming (`<Suspense>`)**: Any component wrapped in a React `<Suspense>` boundary that awaits asynchronous data or reads request context (`getContext()`, cookies, headers, query parameters) automatically becomes a streamed PPR hole (`ppr-hole-N`).
- **Independent Layout vs. Page Revalidation**: You can invalidate and regenerate a page's static shell without touching its parent layout, or invalidate a parent layout's static shell without re-executing child pages.

### Mode 1: Enabling PPR With Segmented Layouts, Parallel Routes (`@sidebar`), and Pages

To enable PPR on a route or layout subtree, export `ppr = true` from `page_functions.ts` or `layout_functions.ts`, alongside independent `revalidate` TTLs and `getCacheTags()`:

```tsx
// src/dashboard/layout_functions.ts
export const ppr = true;
export const revalidate = 3600; // Layout static shell cached for 1 hour

export function getCacheTags() {
  return ["dashboard-layout-tag"];
}

export async function getProps() {
  // Runs ONLY at build time or when "dashboard-layout-tag" / revalidateLayout("/dashboard") is triggered
  return { orgName: "Acme Corp" };
}
```

```tsx
// src/dashboard/layout.tsx
import React, { Suspense } from "react";
import { getContext } from "dinou";

async function LiveUserBadge() {
  // Runs on EVERY request (SSR stream & router.refresh({ layout: true }))
  const ctx = getContext();
  const userCookie = ctx?.req?.cookies?.session_user ?? "guest";
  return <span>User: {userCookie}</span>;
}

export default function DashboardLayout({ children, sidebar, orgName }) {
  return (
    <html>
      <body>
        <header>
          <h1>{orgName}</h1>
          <Suspense fallback={<span>Loading user...</span>}>
            <LiveUserBadge />
          </Suspense>
        </header>
        <aside>{sidebar}</aside>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

```tsx
// src/dashboard/page_functions.ts
export const ppr = true;
export const revalidate = 300; // Page static shell cached independently for 5 minutes

export function getCacheTags() {
  return ["dashboard-home-tag"];
}
```

> **Static vs. Dynamic `<Suspense>` Boundaries**:
> If a `<Suspense>` boundary wraps a synchronous component (or a component that resolves synchronously without async I/O or dynamic `getContext()` reads), Dinou automatically resolves it **inside `shell.html`** at build time instead of turning it into a deferred `ppr-hole-N`. If a dynamic `<Suspense>` hole contains nested `<Suspense>` boundaries inside it, Dinou deduplicates them so the outer hole streams as a single unit without shifting hole indices.

---

### Mode 2: Surgical Server-Side Revalidation (`revalidateTag`, `revalidatePage`, `revalidateLayout`, `revalidatePath`)

Because Horizontal Segmentation separates the layout shell (`layout.rsc` / `shell.layout.json`) from the page shell (`shell.rsc` / `shell.page.json`), you have four granular revalidation primitives inside `"use server"` actions:

| Server Function Primitive | Effect on a PPR Route (`ppr = true`) |
| :--- | :--- |
| **`revalidatePage("/dashboard")`** (or `revalidateTag("dashboard-home-tag")`) | Re-executes `dashboard/page.tsx` + `page_functions.ts` (`getProps`) to produce a new `shell.page.json` and `shell.rsc`, and immediately composes them with the **already-cached `layout.rsc`** to write a fresh `shell.html`. **`dashboard/layout.tsx` is NOT re-executed.** |
| **`revalidateLayout("/dashboard")`** (or `revalidateTag("dashboard-layout-tag")`) | Re-executes `dashboard/layout.tsx` + `layout_functions.ts` (`getProps`) + `@sidebar/page.tsx` to produce a new `layout.rsc` and `shell.layout.json`. Child pages (`/dashboard`, `/dashboard/nested`) are **not** re-executed; on the next request to any child PPR route, Dinou detects `layout.metadata.json.generatedAt > metadata.json.generatedAt` and **lazily recomposes `shell.html`** by combining the new `layout.rsc` with the child page's frozen `shell.rsc`! |
| **Ancestor Layout Propagation (`revalidateLayout("/dashboard")` when visiting `/dashboard/nested`)** | If `/dashboard` (L1) is revalidated and a user requests `/dashboard/nested` (which has its own L2 layout), Dinou automatically detects that ancestor L1 is newer than leaf L2, regenerates `/dashboard/nested`'s leaf `layout.rsc` (incorporating the fresh L1 shell + L2 shell), and recomposes `/dashboard/nested`'s `shell.html` **without** re-executing `/dashboard/nested/page.tsx`. |
| **`revalidatePath("/dashboard/nested")`** | Simultaneously regenerates **both** the layout shell (`layout.rsc` / `shell.layout.json`) and the page shell (`shell.rsc` / `shell.page.json` / `shell.html`) for that route path. |

---

### Mode 3: Client-Side Refresh Semantics (`router.refresh()` vs. `router.refresh({ layout: true })`)

From a `"use client"` component (via `const router = useRouter()`), you can refresh dynamic PPR holes and revalidated shells without losing client state (`useState`, refs, DOM focus):

1. **`router.refresh()` (Page-Only Refresh)**:
   - Fetches `/____rsc_page____/<route>`.
   - Re-evaluates all dynamic `<Suspense>` holes in the **page** with current cookies, headers, and query parameters.
   - Serves the page's static shell from `shell.page.json` (reflecting the latest `revalidatePage` / `revalidateTag` state, or staying frozen if unrevalidated).
   - **Zero `/____rsc_layout____` network requests**—the layout is untouched.
2. **`router.refresh({ layout: true })` (Full Segmented Refresh: Layout + Page)**:
   - Fetches both `/____rsc_layout____/<route>` and `/____rsc_page____/<route>`.
   - Re-evaluates all dynamic `<Suspense>` holes in **both the layout (including `@sidebar` and nested layouts) and the page**.
   - Serves the layout's static shell from `shell.layout.json` and the page's static shell from `shell.page.json`—staying frozen if unrevalidated, or updating in place if `revalidateLayout` / `revalidatePage` was called, while **preserving all mounted Client Component state**.

---

### Mode 4: Mixing PPR Routes and Static Opt-Out Routes (`ppr = false`) Under a Shared Layout

When a parent layout has `ppr = true`, child pages inherit PPR by default, or can explicitly opt out:
- **PPR Child Page (`export const ppr = true`)**: Pre-renders `shell.html` + streams `<Suspense>` holes.
- **Static Opt-Out Child Page (`export const ppr = false`)**: Pre-renders a complete static `index.html` and `page.rsc` with zero PPR streaming.
- **Seamless Horizontal Soft Navigation**: Clicking `<Link>` between a PPR page (`/dashboard`), another PPR page (`/dashboard/ppr-b`), a static opt-out page (`/dashboard/static-optout`), and a nested PPR layout (`/dashboard/nested`) only fetches `/____rsc_page____` (and the child L2 layout when entering `/nested`), keeping the shared L1 layout mounted with **`0` L1 layout network requests**.

---

### Mode 5: Standalone Layout Isolation (`reset_layout` & `no_layout`) and Dynamic Parameter Guardrails (`validateParams` & `allowISG`)

1. **`reset_layout` + PPR (`/reset-ppr`)**: Adding an empty `reset_layout` marker file in a route directory detaches the route from all ancestor layouts and starts a brand-new root `layout.tsx` (`<html><body>...</body></html>`) with its own `shell.layout.json`, `shell.page.json`, and `ppr-hole-1..N` sequence.
2. **`no_layout` + PPR (`/no-layout-ppr`)**: Adding an empty `no_layout` marker file renders `page.tsx` as a standalone root document without any layout wrapper while still supporting `export const ppr = true` (`shell.html` + streamed `ppr-hole-1`).
3. **Dynamic Layout Guardrails (`team/[team]/layout_functions.ts`)**: Exporting `getStaticPaths()`, `validateParams(params)`, and `allowISG = false` on a dynamic PPR layout pre-renders `shell.html` + `shell.layout.json` for allowed static paths (e.g., `/team/alpha`) and automatically returns `404` on both HTML and `/____rsc_layout____` requests for unlisted (`allowISG = false`, e.g., `/team/beta`) or invalid (`validateParams() === false`, e.g., `/team/gamma`) parameters.

---

## 5. Phase 3: The 10-Scenario Pure Horizontal Segmentation + PPR Test Suite (`dinou-e2e/src/t-rigurous-hs-ppr/` & `test-9.0.2/src/hs-ppr-test/`)

### 5.1. Route Hierarchy Created in `dinou-e2e/src/t-rigurous-hs-ppr/` (and `test-9.0.2/src/hs-ppr-test/`)

| Route / File | Role in Pure Horizontal Segmentation + PPR Suite |
| :--- | :--- |
| `src/t-rigurous-hs-ppr/hsppr-state.ts` | Cross-runtime deterministic state store (`globalThis[Symbol.for("dinou.hsppr.state.v1")]` + `.dinou/hsppr-state.json` persistence on Node/Bun) with independent sequence counters (`100` baseline) for L1 layout shell, L1 `getProps`, L1 dynamic hole, `@sidebar` shell, `@sidebar` dynamic hole, Page A shell, Page A `getProps`, Page A static `<Suspense>`, Page A Hole 1, Page A Hole 2 + nested inner `<Suspense>`, Page B shell & hole, Static Opt-Out page, L2 nested layout shell / `getProps` / hole, Nested Page shell / `getProps` / hole, `reset_layout` shell & page shell / hole, `no_layout` shell / hole, and `team/[team]` layout shell / hole. |
| `src/t-rigurous-hs-ppr/hsppr-actions.ts` | `"use server"` actions: `hspprGetState`, `hspprResetAll`, `hspprMutateState` (mutates in-memory/disk counters *without* calling `revalidate*` to test frozen static shells), `hspprRunRevalidateTag`, `hspprRunRevalidatePage`, `hspprRunRevalidateLayout`, and `hspprRunRevalidatePath`. |
| `src/t-rigurous-hs-ppr/hsppr-client.tsx` | Client state trackers (`HsPprClientStateBox` tracking `mountId` and interactive `count` state across L1, L2, Page A, Page B, Nested Page, and Reset Layout), manual refresh controls (`HsPprManualControls`), raw wire HTML parser (`splitPprWire` splitting `shell.html` from streamed `<template id="ppr-content-...">` chunks), and the 10-scenario automated E2E runner (`HsPprAutomatedSuiteRunner`). |
| `src/t-rigurous-hs-ppr/layout.tsx` & `layout_functions.ts` | **Level-1 PPR Layout** (`ppr = true`, `revalidate = 3600`, `getCacheTags() -> ["hsppr-l1-layout-tag"]`) rendering L1 static shell, `HsPprClientStateBox`, **PPR Hole #1** (`L1LayoutDynamicHole` reading `cookies.hsppr_user` and `query.lmode`), the `@sidebar` parallel route slot, and `{children}`. |
| `src/t-rigurous-hs-ppr/@sidebar/page.tsx` | **Parallel Route `@sidebar`** rendered inside L1 layout, containing its own static shell (`sidebarShellSeq`) and **PPR Hole #2** (`SidebarDynamicHole` reading `cookies.hsppr_role`). |
| `src/t-rigurous-hs-ppr/page.tsx` & `page_functions.ts` | **PPR Page A (`/t-rigurous-hs-ppr`)** (`ppr = true`, `revalidate = 3600`, `getCacheTags() -> ["hsppr-page-a-tag"]`) containing: Page A static shell, **Static `<Suspense>` boundary** (`PageAStaticSuspenseInner`, synchronous—resolved inside `shell.html` without registering `ppr-hole-3`), **PPR Hole #4** (`PageADynamicHole1` reading `query.mode`), and **PPR Hole #5** (`PageADynamicHole2Outer` containing a nested `<Suspense>` `PageADynamicHole2Inner` to verify nested `<Suspense>` deduplication). |
| `src/t-rigurous-hs-ppr/ppr-b/page.tsx` & `page_functions.ts` | **Sibling PPR Page B (`/t-rigurous-hs-ppr/ppr-b`)** (`ppr = true`, `getCacheTags() -> ["hsppr-page-b-tag"]`) sharing L1 Layout and `@sidebar`, with its own static shell and dynamic `<Suspense>` hole. |
| `src/t-rigurous-hs-ppr/static-optout/page.tsx` & `page_functions.ts` | **Static Opt-Out Child Page (`/t-rigurous-hs-ppr/static-optout`)** exporting `ppr = false` under the PPR L1 Layout to test cross-mode static opt-out and soft navigation. |
| `src/t-rigurous-hs-ppr/nested/layout.tsx`, `layout_functions.ts`, `page.tsx` & `page_functions.ts` | **Level-2 Nested PPR Layout & Page (`/t-rigurous-hs-ppr/nested`)** (`ppr = true`, tags `["hsppr-l2-layout-tag"]` and `["hsppr-nested-page-tag"]`) creating a 4-hole multi-level PPR hierarchy: **Hole #1** (L1 Layout) → **Hole #2** (`@sidebar`) → **Hole #3** (L2 Layout) → **Hole #4** (Nested Page). |
| `src/t-rigurous-hs-ppr/reset-ppr/reset_layout`, `layout.tsx`, `layout_functions.ts`, `page.tsx` & `page_functions.ts` | **Isolated `reset_layout` + PPR Route (`/t-rigurous-hs-ppr/reset-ppr`)** detaching from L1 Layout and streaming its own standalone `ppr-hole-1`. |
| `src/t-rigurous-hs-ppr/no-layout-ppr/no_layout`, `page.tsx` & `page_functions.ts` | **Standalone `no_layout` + PPR Route (`/t-rigurous-hs-ppr/no-layout-ppr`)** rendering with zero layouts and streaming `ppr-hole-1`. |
| `src/t-rigurous-hs-ppr/team/[team]/layout.tsx`, `layout_functions.ts`, `page.tsx` & `not_found.tsx` | **Dynamic Parameter Guarded PPR Layout (`/t-rigurous-hs-ppr/team/[team]`)** with `ppr = true`, `getStaticPaths() -> [{ team: "alpha" }]`, `validateParams` (`alpha` or `beta`), and `allowISG = false`. |
| `e2e/example.spec.ts` | Playwright E2E test suite (`Dinou Core: Rigorous HS + PPR Synergy (/t-rigurous-hs-ppr)`) verifying direct SSR on `no-layout-ppr` and `reset-ppr`, all 10 automated scenarios, and hard-reload (`F5`) lazy `shell.html` re-composition with zero hydration errors. |

---

### 5.2. Summary of the 10 Automated Verification Scenarios (`10/10 PASSED`)

| # | Scenario Name | What It Verifies & Asserts | Status |
| :--- | :--- | :--- | :--- |
| **1** | **Raw Wire PPR Stream Split Across Segmented Layout + `@sidebar` + Page A (`shell.html` vs. `<template>`) & Static `<Suspense>` + Opt-Out** | Fetches raw HTML from `/t-rigurous-hs-ppr?mode=wire-check&lmode=l-wire` and splits it at `<template id="ppr-content-`. Verifies `shell.html` contains the static L1 shell (`100`), `@sidebar` shell (`100`), Page A shell (`100`), and the resolved synchronous Static `<Suspense>` (`100`), plus `data-ppr-hole` placeholders for `ppr-hole-1`, `ppr-hole-2`, `ppr-hole-4`, and `ppr-hole-5`. Verifies boundary #3 (Static `<Suspense>`) does **not** emit `ppr-hole-3`, nested `<Suspense>` inside Hole 2 does **not** emit `ppr-hole-6`, streamed `<template>` chunks carry live query params (`l-wire`, `wire-check`), and `/t-rigurous-hs-ppr/static-optout` (`ppr = false`) emits zero PPR scripts/templates. | **PASSED** |
| **2** | **Unrevalidated Mutation: Frozen Layout & Page Static Shells (`shell.layout.json` & `shell.page.json`) vs. Live Dynamic Holes on `router.refresh()` & `router.refresh({ layout: true })`** | Increments client `useState` counters in L1 Layout and Page A (`count = 1`), then mutates all server counters to `101` **without** revalidating. Verifies raw wire `shell.html` stays frozen at `100` while streamed holes emit `101`. Calls `router.refresh()` and asserts Page A's static shell stays `100` (`shell.page.json`) while Page A's dynamic holes update to `101`. Calls `router.refresh({ layout: true })` and asserts L1 Layout & `@sidebar` static shells stay frozen at `100` (`shell.layout.json`) while L1 & `@sidebar` dynamic holes update to `101`, with `0` client remounts. | **PASSED** |
| **3** | **Surgical Page Revalidation (`revalidateTag('hsppr-page-a-tag')`) Composing With Cached `layout.rsc` Without Re-Executing L1 Layout** | Mutates Page A counters to `102` (while L1 Layout in-memory counter is still `101` unrevalidated) and calls `revalidateTag("hsppr-page-a-tag")`. Verifies that `revalidatePage` regenerates Page A (`102`) and composes `shell.html` with the cached `layout.rsc` (`100`, **not** `101`!), and `router.refresh()` updates Page A's DOM shell to `102` while L1 Layout stays at `100`. | **PASSED** |
| **4** | **Surgical Layout Revalidation (`revalidateTag('hsppr-l1-layout-tag')`) + Lazy `shell.html` Re-Composition Preserving Frozen Page A Shell** | Bumps L1 Layout counters to `103` and deliberately poisons Page A's in-memory shell counter to `999` (without revalidating Page A), then calls `revalidateTag("hsppr-l1-layout-tag")`. Requests `/t-rigurous-hs-ppr` HTML and verifies lazy `shell.html` re-composition combines the fresh `layout.rsc` (`103`) with Page A's frozen `shell.rsc` (`102`, **not** `999`!), followed by `router.refresh({ layout: true })` updating L1 DOM shell to `103`. | **PASSED** |
| **5** | **Cross-Mode Horizontal Soft Navigation (`PPR Page A -> PPR Page B -> Static Opt-Out -> PPR Page A ?mode=nav-query`: `0` Layout Remounts)** | Soft-navigates from `/t-rigurous-hs-ppr` to `/t-rigurous-hs-ppr/ppr-b` (`ppr = true`), then to `/t-rigurous-hs-ppr/static-optout` (`ppr = false`), and back to `/t-rigurous-hs-ppr?mode=nav-query`. Verifies that across all three transitions, L1 Layout's `mountId` and client `count` (`1`) are preserved without remounting and query parameters flow into Page A's dynamic holes. | **PASSED** |
| **6** | **Multi-Level Nested PPR Hierarchy (`/nested`: L1 Hole #1 + `@sidebar` Hole #2 + L2 Hole #3 + Nested Page Hole #4) & Surgical L2 Revalidation** | Verifies raw wire on `/t-rigurous-hs-ppr/nested?nmode=nested-wire` contains `ppr-hole-1..4` in `shell.html` and streams all 4 `<template>` chunks in order. Soft-navigates to `/nested` (preserving L1 `mountId`), increments L2 client state, poisons Nested Page in-memory shell to `888`, and calls `revalidateTag("hsppr-l2-layout-tag")` (`201`). Verifies lazy `shell.html` re-composition on `/nested` updates L2 Layout shell to `201` while keeping Nested Page frozen at `100` (not `888`). | **PASSED** |
| **7** | **Ancestor Layout Revalidation Propagation (`revalidateLayout('/t-rigurous-hs-ppr')` -> Lazy Leaf `layout.rsc` & `shell.html` Re-Composition on `/nested`)** | Bumps ancestor L1 Layout to `301`, poisons Nested Page in-memory shell to `777`, and calls `revalidateLayout("/t-rigurous-hs-ppr")` (ancestor only). Requests `/t-rigurous-hs-ppr/nested` and verifies `handler.js` detects `maxAncestorGen > leafLayout.generatedAt`, regenerates `/nested`'s leaf `layout.rsc` (L1=`301`, L2=`201`), and recomposes `/nested`'s `shell.html` while keeping Nested Page frozen at `100` (not `777`). | **PASSED** |
| **8** | **Full-Segment `revalidatePath('/t-rigurous-hs-ppr/nested')` Simultaneous Layout Shell + Page Shell Regeneration Preserving Client State** | Bumps both L2 Layout and Nested Page counters to `401`, calls `revalidatePath("/t-rigurous-hs-ppr/nested")`, and triggers `router.refresh({ layout: true })`. Verifies both L2 Layout shell (`401`), Nested Page shell (`401`), and their dynamic holes (`401`) update in the DOM while preserving both L1 and L2 client `mountId`s and `useState` counters. | **PASSED** |
| **9** | **Standalone PPR Boundaries: `reset_layout` (`/reset-ppr`) & `no_layout` (`/no-layout-ppr`) Wire Split & Hydration** | Fetches `/t-rigurous-hs-ppr/reset-ppr?rmode=reset-wire` and `/t-rigurous-hs-ppr/no-layout-ppr?nlmode=nl-wire`. Verifies neither route includes the ancestor `#hsppr-l1-layout`, both pre-render their own isolated static shells (`100`) in `shell.html`, and both stream their own `ppr-hole-1` with live query parameters (`reset-wire` and `nl-wire`). | **PASSED** |
| **10** | **Dynamic Layout Parameter Validation (`validateParams` + `getStaticPaths` + `allowISG = false`) on PPR Routes (`/team/[team]`)** | Verifies pre-rendered `/t-rigurous-hs-ppr/team/alpha?tmode=alpha-wire` returns `200` with `Team Shell: alpha` in `shell.html` and `alpha-wire` in the streamed `<template>` chunk, while `/team/beta` (`allowISG = false`) and `/team/gamma` (`validateParams() === false`) return `404` on both HTML and `/____rsc_layout____` endpoints. | **PASSED** |

---

## 6. Complete 8-Suite Verification Matrix in `test-9.0.2`

With `/hs-ppr-test` completed, all **8 rigorous test suites** in `test-9.0.2` (covering Server Functions and all 7 non-empty combinations of Horizontal Segmentation, `<DinouCacheSlot>`, and PPR) pass **100% in green with `0` hydration errors**:

| # | Suite Route (`test-9.0.2` / `dinou-e2e`) | Architectural Combination Tested | Scenarios / Checks | Result |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `/sf-test` | Server Functions (`"use server"` RPC & Manifest Tree-Shaking) | 13 Automated Scenarios | **13 / 13 PASSED** |
| **2** | `/ppr-test` | **PPR Only** | 16 Automated Checks | **16 / 16 PASSED** |
| **3** | `/cache-slot-test` | **Vertical Segmentation (`<DinouCacheSlot>`) Only** | 3 Automated Blocks | **3 / 3 PASSED** |
| **4** | `/horizontal-segmentation-test` (`/t-rigurous-hs`) | **Horizontal Segmentation (HS) Only** | 12 Automated Scenarios | **12 / 12 PASSED** |
| **5** | `/ppr-cache-slot-test` (`/t-rigorous-sinergy`) | **Pairwise #1: PPR + `<DinouCacheSlot>`** | 2 Automated Blocks | **2 / 2 PASSED** |
| **6** | `/hs-cache-slot-test` (`/t-rigurous-hs-cache-slot`) | **Pairwise #2: HS + `<DinouCacheSlot>` (Non-PPR)** | 10 Automated Scenarios | **10 / 10 PASSED** |
| **7** | `/hs-ppr-test` (`/t-rigurous-hs-ppr`) | **Pairwise #3: HS + PPR (No-CacheSlot)** | 10 Automated Scenarios | **10 / 10 PASSED** |
| **8** | `/triple-sinergy-test` (`/t-rigurous-triple-sinergy`) | **Triple Synergy: HS + `<DinouCacheSlot>` + PPR** | 12 Automated Scenarios | **12 / 12 PASSED** |
