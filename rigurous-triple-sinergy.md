# Triple Synergy (`Horizontal Segmentation + Vertical Segmentation + PPR`) in Dinou — Empirical TDD Bug Report, Architecture Fixes & 12-Scenario E2E Reference

This document provides a complete technical record of the **Triple Synergy** investigation and implementation in Dinou v9.0.3: how **Horizontal Segmentation** (`layout.rsc` vs. `page.rsc`), **Vertical Segmentation** (`<DinouCacheSlot>` & `refreshSlot`), and **Partial Prerendering (PPR)** (`shell.html`, `shell.rsc`, `shell.page.json`, and streamed `<Suspense>` holes) interact at build time and runtime.

Following a strict **Test-Driven Development (TDD)** methodology in `test-9.0.2`:
1. **Phase 1**: We first built a demanding 12-scenario Triple Synergy stress suite (`src/triple-sinergy-test/` + `e2e/triple-sinergy.spec.ts`) **without modifying `dinou/`**, executing it in headless Chrome to empirically confirm the predicted failure modes (**`4/12 PASSED, 8/12 FAILED`**) and uncover additional architectural holes.
2. **Phase 2**: We engineered surgical fixes across `dinou/core/` to close all 7 confirmed architectural holes without sacrificing caching isolation or performance.
3. **Phase 3**: We verified that all **5 suites** in `test-9.0.2`—**`/ppr-test` (16/16)**, **`/cache-slot-test` (3/3)**, **`/ppr-cache-slot-test` (2/2)**, **`/horizontal-segmentation-test` (12/12)**, and **`/triple-sinergy-test` (12/12)**, plus **F5 hard reload after `revalidateLayout` on PPR routes** and **direct SSR of `no_layout` + PPR + `<DinouCacheSlot>`**—pass 100% in green with **`0` hydration errors**.

---

## 1. Overview: What Is the Triple Synergy?

In Dinou's React 19 Server Component architecture, a single route can simultaneously combine three orthogonal caching and streaming primitives:

| Axis | Primitive | Cached Artifacts | Granular Invalidation / Refresh |
| :--- | :--- | :--- | :--- |
| **1. Horizontal Segmentation** | `layout.tsx` (`layout_functions.ts`) vs. `page.tsx` (`page_functions.ts`) | `<layoutDir>/layout.rsc`, `<layoutDir>/layout.metadata.json`, `<routeDir>/page.rsc`, `<routeDir>/metadata.json` | `revalidateLayout(path)`, `revalidatePage(path)`, `revalidatePath(path)`, `revalidateTag(tag)`, `router.refresh()`, `router.refresh({ layout: true })` |
| **2. Vertical Segmentation (Micro-ISR)** | `<DinouCacheSlot id tag revalidate>` | `slots/<id>/slot.json`, `slots/<id>/slot.metadata.json` | `refreshSlot(idOrTag)`, `router.refreshSlot(idOrTag)`, `revalidateTag(slotTag)`, TTL expiration (`revalidate`) |
| **3. Partial Prerendering (PPR)** | `export const ppr = true` (or `ppr = false` child opt-out) + `<Suspense>` | `<routeDir>/shell.html`, `<routeDir>/index.html`, `<routeDir>/shell.rsc`, `<routeDir>/shell.page.json` | Static shell served at `0ms` TTFB; dynamic `<Suspense>` holes streamed live as `<template id="ppr-content-ppr-hole-N">` + inline replacement `<script>` |

When all three axes are active at once, a single route tree can contain:
- **Level-1 and Level-2 Nested Layouts** (`ppr = true`) with their own cached `<DinouCacheSlot>` components in the layout shell,
- **Sibling PPR Pages** (`ppr = true` inherited from the layout) and **Sibling Static Pages** (`export const ppr = false` explicit opt-out) sharing the same layout,
- **Page-Level Static Shell `<DinouCacheSlot>`s** rendered outside `<Suspense>` in a PPR page, and
- **Dynamic PPR `<Suspense>` Holes** reading live request data (`req.cookies`, `req.headers`, `req.query`) while hosting both single and **nested `<DinouCacheSlot>` (Outer → Inner)** subtrees with Client Components and `"use server"` actions inside the dynamic hole.

---

## 2. Phase 1 (Strict TDD): Empirical Confirmation of Bugs & Newly Uncovered Holes (`4/12 PASSED, 8/12 FAILED`)

Before touching any file in `dinou/`, we built `src/triple-sinergy-test/` and executed the 12-scenario suite against the unmodified engine. **8 of the 12 scenarios failed** (Scenarios 2, 6, 7, 8, 9, 10, 11, and 12), confirming the 3 initially predicted bugs and exposing **4 additional architectural holes**:

### Bug #1 (Predicted & Confirmed by Failing Scenarios 10 & 11): Lazy Layout HTML Re-Composition Skipped PPR Routes
- **Where**: `dinou/core/handler.js` (line 1865).
- **Root Cause**: The lazy HTML re-composition check (`leafLayout.generatedAt > pageGeneratedAt` and the multi-level ancestor layout cascade `maxAncestorGen > leafLayout.generatedAt`) was gated behind `if (!cachedItem?.metadata?.ppr && !isPprConfig)`.
- **Symptom**: After calling `revalidateLayout("/triple-sinergy-test")` or `revalidateTag("ts-layout-tag")` (or revalidating an L1 layout above an L2 nested layout), classic static children (`/static-a`, `/static-b`) lazily re-composed their `index.html` on the next `GET` / `F5`, but **PPR children (`/triple-sinergy-test`, `/triple-sinergy-test/ppr-b`, `/triple-sinergy-test/nested`) never re-composed their `shell.html` or `index.html`**, continuing to serve stale layout HTML (`layoutSeq = 100` instead of `105`/`106`/`107`).

### Bug #2 (Predicted & Confirmed by Failing Scenarios 7 & 9): Missing `slotTags` in `layout.metadata.json`, Cross-Segment Tag Pollution, and Destructive Metadata Deletion in `revalidateTag`
- **Where**: `dinou/core/generate-static.js` (lines 82–97), `dinou/core/cache-slot.js` (`recordSlotTagsOnContext`), and `dinou/core/cache-revalidate.js` (lines 576–725).
- **Root Cause**:
  1. Neither `generate-static.js` nor `revalidateLayout` persisted `slotTags` into `layout.metadata.json`.
  2. During full-route renders (`getJSX` without `segment: "page"`), `context._slotTags` mixed `<DinouCacheSlot>` tags from `layout.tsx` into the child page's `metadata.json`.
  3. When `revalidateTag(slotTag)` matched `slotTags` on a layout or page, instead of deleting `slots/<id>/slot.json` first and then calling `revalidateLayout` or `revalidatePage`, it **deleted `layout.rsc` + `layout.metadata.json` (or `index.html` + `metadata.json`)**.
- **Symptom**: Deleting `layout.metadata.json` reset `leafLayout.generatedAt` to `0`, so static and PPR child pages (`static-b`, `ppr-a`) never detected that their parent layout's slot had been invalidated and continued serving stale layout slot HTML on `GET` / `F5`. Deleting `metadata.json` on a PPR route also wiped out `ppr: true`, `holes`, `tags`, and `slotTags`.

### Bug #3 (Predicted & Confirmed by Failing Scenario 2): `/____rsc_layout____` Bypassed Cached `layout.rsc` When `layout_functions.ts` Exported `ppr = true`, and `/____rsc_page____` on PPR Routes Re-Executed the Static Page Shell
- **Where**: `dinou/core/handler.js` (lines 1412, 1419, and 1624).
- **Root Cause**:
  1. In `handler.js`, `isRoutePpr = isLayoutReq ? Boolean(layoutConfig?.ppr) : ...` treated `/____rsc_layout____` as having dynamic PPR holes whenever `layout_functions.ts` exported `ppr = true` (even when `layout.tsx` itself had zero dynamic `<Suspense>` holes), bypassing the cached `layout.rsc` on disk. In addition, `(!hasQueryParams || isStatic)` skipped `layout.rsc` whenever the URL had query parameters (`?mode=unreval`) on a PPR route (where `window.__DINOU_USE_STATIC__` is `false`).
  2. For `/____rsc_page____` on a PPR route, `handler.js` executed `getJSX(reqPath, queryObj, ..., { segment: "page" })` from scratch on every client refresh or soft navigation, re-executing `getProps()` in `page_functions.ts` and the outer static shell of `page.tsx` even when the page had **not** been revalidated.
- **Symptom**: Unrevalidated mutations to `layoutSeq` or `pprAPageSeq` leaked into `/____rsc_layout____` and `/____rsc_page____` during `router.refresh()` and soft navigation, causing state drift between SSR HTML (`100`) and RSC payloads (`101`).

### Bug #4 (Newly Uncovered by Failing Scenarios 2, 6, 7 & 8): `revalidatePage` on a PPR Route Destroyed the PPR Static Shell and `[data-ppr-hole]` Placeholders
- **Where**: `dinou/core/cache-revalidate.js` (lines 107–268).
- **Root Cause**:
  1. Line 110 (`if (!currentMeta.ppr)`) skipped loading `activeLayoutRscText` (`layout.rsc`) for PPR routes, forcing `revalidatePage` to fall back to `getJSX(reqPathWithSlash)` (re-executing `layout.tsx`!).
  2. `revalidatePage` did not wrap `revalContext.req` (`cookies`, `headers`, `query`) in `createBailoutProxy` and did not evaluate `getJSX` + `asyncRenderJSXToClientJSX` inside `runWithPprContext({ isPpr: true })`.
- **Symptom**: Calling `revalidatePage("/triple-sinergy-test")` rendered the dynamic `<Suspense>` hole synchronously into `index.html`, wiping out `[data-ppr-hole="ppr-hole-1"]`, failing to update `shell.html` and `shell.rsc`, and breaking all subsequent PPR `<template>` streaming on that route.

### Bug #5 (Newly Uncovered in `handler.js`): `shouldCacheISG` Wrote the Full `Layout + Page` Stream Into `shell.rsc` Instead of the Isolated Page Shell Stream
- **Where**: `dinou/core/handler.js` (line 2490).
- **Root Cause**: When `shouldCacheISG` cached a PPR route, it wrote `rscPayload` (the full `Layout + Page` RSC stream) into `shell.rsc` instead of the isolated page RSC stream (`page.rsc`).
- **Symptom**: Whenever `shell.rsc` was combined with `layout.rsc` during lazy HTML re-composition, the layout was rendered twice unless `shell.rsc` contained the isolated page shell RSC payload.

### Bug #6 (Newly Uncovered Between Scenarios 4 & 6, Plus Cross-Suite Regression Verification on `/ppr-cache-slot-test`): `getSlotJSX` Destructive Shell Deletion & `inflightSlotRenders` Self-Await Deadlock on `refreshSlot(..., { fresh: true })`
- **Where**: `dinou/core/cache-slot.js` (lines 883–980).
- **Root Cause**:
  1. **Destructive Static-Shell Deletion**: When `/____rsc_slot____/:id?fresh=1` (`options.fresh === true`) refreshed a slot with `inStaticShell: true`, `getSlotJSX` previously deleted `index.html`, `shell.html`, `metadata.json`, `shell.rsc`, and `rsc.rsc` for `options.currentPath`. After `refreshSlot("ts-ppr-a-shell-slot")` ran in Scenario 4, `/triple-sinergy-test/metadata.json` and `shell.html` were wiped from storage, causing the next `GET /triple-sinergy-test` in Scenario 6 to trigger a full cold SSG rebuild (`isSSG: true`) that leaked unrevalidated state (`999`), and causing `revalidateTag("ts-ppr-a-shell-slot-tag")` in Scenario 7 to miss `"ts-ppr-a-shell-slot-tag"` in `metadata.json`.
  2. **Self-Await Promise Cycle Deadlock (`inflightSlotRenders`)**: When replacing that destructive deletion with a surgical call to `await revalidatePage("/" + cleanRouteKey, { onlyRefreshSlots: true })` (or `await revalidateLayout(...)`), invoking `revalidatePage` **inside** `renderPromise` while `inflightSlotRenders.set(storageKey, renderPromise)` was still active caused a promise cycle deadlock whenever `revalidatePage(..., { onlyRefreshSlots: true })` ran `refreshNestedSlotsInTree(deserialized, "__ppr_shell__")`: `refreshNestedSlotsInTree` called `getSlotJSX(targetId)` for the static-shell slot (`e.g. ppr-syn-shell-slot`), which hit `if (inflightSlotRenders.has(storageKey)) return await inflightSlotRenders.get(storageKey)` and awaited the very `renderPromise` that was waiting for `revalidatePage` to finish.
- **Symptom**: Destructive deletion broke Scenarios 6 & 7 by wiping `metadata.json` and re-executing `layout.tsx`/`page.tsx` on cold SSG rebuild; calling `revalidatePage(..., { onlyRefreshSlots: true })` inside `renderPromise` deadlocked `refreshSlot("ppr-syn-shell-slot", { fresh: true })` on `/ppr-cache-slot-test`.

### Bug #7 (Newly Uncovered in Scenarios 4, 7 & 9): `DinouCacheSlotBoundary` Locked `slotContent` After `refreshSlot()`, Shadowing Newer `children` From `router.refresh()`
- **Where**: `dinou/core/slot.js` (`DinouCacheSlotBoundary`, lines 272–323).
- **Root Cause**: `DinouCacheSlotBoundary` stored live-refreshed slot trees in `const [slotContent, setSlotContent] = useState(null)` and unconditionally returned `if (slotContent !== null) return slotContent;`.
- **Symptom**: Once a slot was refreshed via `refreshSlot()` in Scenario 4 (`slotContent` set to seq `101`), subsequent server-side `revalidateTag` + `router.refresh()` / `router.refresh({ layout: true })` calls in Scenarios 7 and 9 passed updated `children` (seq `102`) from the parent Page/Layout RSC payload, but `DinouCacheSlotBoundary` ignored the new `children` prop and kept rendering the stale `slotContent` (`101`).

---

## 3. Phase 2: Architecture & Fixes Implemented in `dinou/core/`

### 3.1. Segment-Scoped Slot Tag Tracking & Page Client-JSX Capture (`ppr-context.js`, `get-jsx.js`, `render-jsx-to-client-jsx.js`, `cache-slot.js`)

To ensure layout `<DinouCacheSlot>` tags and page `<DinouCacheSlot>` tags never pollute each other's metadata files, and to capture the resolved page client-JSX tree in a single pass:

1. **`dinou/core/ppr-context.js`**:
   - Added `runInPageSegment(fn)` / `isInsidePageSegment()` and `runInLayoutSegment(fn)` / `isInsideLayoutSegment()` using dedicated `AsyncLocalStorage` instances.
   - Added `markPageRootElement(el)` / `isPageRootElement(el)` backed by a `WeakSet` (avoiding mutation of React 19 frozen elements in dev/prod).
   - Updated `resetPprHoles(startIndex = 0)` to accept a starting hole offset (`leafLayout.suspenseCount`) and added `getPprHoleCounter()` so isolated page renders assign the exact same `ppr-hole-N` IDs as full `Layout + Page` renders.
2. **`dinou/core/get-jsx.js` & `dinou/core/render-jsx-to-client-jsx.js`**:
   - `getJSX` marks the root `<Page>` element via `markPageRootElement(React.createElement(Page, props))` and wraps layout evaluations in `runInLayoutSegment`.
   - When `asyncRenderJSXToClientJSX` encounters `isPageRootElement(jsx)`, it evaluates the subtree inside `runInPageSegment` and stores the resolved client-JSX tree on the request context as `ctx._resolvedPageClientJsx`.
3. **`dinou/core/cache-slot.js`**:
   - `recordSlotTagsOnContext` records slot tags into `reqContext._layoutSlotTags` when `isInsideLayoutSegment()` is active and into `reqContext._pageSlotTags` when `isInsidePageSegment()` is active.
   - `layout.metadata.json` stores `slotTags` from `_layoutSlotTags`, while route `metadata.json` stores `slotTags` exclusively from `_pageSlotTags`.

---

### 3.2. Immutable Static Shell + Live Dynamic Hole Splicing on `/____rsc_page____` (`ppr-runtime.js`, `handler.js`)

When a PPR route is pre-rendered at build time (`generate-static.js`), during ISG (`shouldCacheISG` in `handler.js`), or during `revalidatePage` (`cache-revalidate.js`), Dinou now persists:
- `shell.rsc`: The isolated page Flight payload with dynamic `<Suspense>` holes replaced by `<div data-ppr-hole="ppr-hole-N">` fallbacks.
- `shell.page.json`: The serialized client-JSX tree of the page's static shell (`serializeJSX(resolvedPageClientJsx)`).

When the browser requests `/____rsc_page____` on a PPR route (e.g. during `router.refresh()` or client-side soft navigation):

```text
+-------------------+      GET /____rsc_page____/triple-sinergy-test?mode=live-query
|      Browser      | -------------------------------------------------------------------> +-------------------------+
| (router.refresh / |                                                                      |      Dinou Handler      |
|   <Link> nav)     |                                                                      |  (dinou/core/handler.js)|
+-------------------+                                                                      +-------------------------+
          ^                                                                                             |
          |                                            1. Read shell.page.json (Cached Page Shell)      v
          |                                           +-------------------------------------------------+
          |                                           |
          |                                           v
          |                                 +-------------------------------------------------------------------+
          |                                 | Storage (.dinou/dist2 or KV):                                     |
          |                                 |   - deserializeJSX(shellPageJson) -> cachedShellTree              |
          |                                 |   - refreshNestedSlotsInTree(cachedShellTree)                     |
          |                                 |     (static-shell <DinouCacheSlot>s hit slots/<id>/slot.json)     |
          |                                 +-------------------------------------------------------------------+
          |                                           |
          |                                           | 2. Splices live <Suspense> holes into cachedShellTree
          |                                           v
          |                                 +-------------------------------------------------------------------+
          |                                 | spliceDynamicHolesIntoShell(cachedShellTree, getLivePageJsx, idx) |
          |                                 |   - Keeps outer page shell (pageSeq = 100) 100% frozen            |
          |                                 |   - Replaces ONLY [data-ppr-hole="ppr-hole-N"] placeholders       |
          |                                 |     with live <Suspense> subtrees evaluated with ?mode=live-query |
          |                                 +-------------------------------------------------------------------+
          |                                           |
          |     3. Stream Hybrid RSC Payload (pipeRSC)|
          +-------------------------------------------+
```

---

### 3.3. PPR-Aware `revalidatePage`, Surgical `{ onlyRefreshSlots: true }`, and Lazy Layout Re-Composition Across PPR & Static Routes (`cache-revalidate.js`, `handler.js`)

```text
[Server Action: revalidateTag("ts-layout-shell-slot-tag")]
   |
   +--> 1. Delete invalidated slot cache first:
   |       storage.delete("slots/ts-layout-shell-slot/slot.json" & "slot.metadata.json")
   |
   +--> 2. Match "ts-layout-shell-slot-tag" in layout.metadata.json (slotTags):
           revalidateLayout("/triple-sinergy-test")
             - Re-renders layout.rsc with fresh layout slot (seq = 102)
             - Updates layout.metadata.json (generatedAt = T2)
             - Child pages (ppr-a, ppr-b, static-a, static-b) are NOT re-executed!

[Next Browser Request: GET /triple-sinergy-test (PPR Child Route)]
   |
   +--> 3. Handler checks activeLayoutChain timestamps:
   |       Detects leafLayout.generatedAt (T2) > page metadata.generatedAt (T1)
   |
   +--> 4. Lazy HTML Re-Composition (no page.tsx execution!):
   |       Reads fresh layout.rsc (T2) + existing cached shell.rsc (T1)
   |       renderHtmlStream(layout.rsc [T2], { pageRscStream: shell.rsc [T1] })
   |       Persists updated shell.html, index.html & metadata.json (generatedAt = T2)
   |
   +--> 5. PPR Streaming Resume (handlePprResume):
           Immediately flushes updated shellPrelude (layoutSlot = 102, pageShell = 103)
           Streams live dynamic hole: <template id="ppr-content-ppr-hole-1"> + <script>
```

1. **Lazy Layout Re-Composition & Dynamic Parallel `@slot` Bailout Preservation (`dinou/core/handler.js` & `dinou/core/generate-static.js`)**:
   - Removed the `!cachedItem?.metadata?.ppr && !isPprConfig` restriction so whenever `leafLayout.generatedAt > pageGeneratedAt` (including after cascading an ancestor L1 layout update to an L2 nested layout), Dinou re-composes `index.html` (and `shell.html` for PPR routes) from the fresh `layout.rsc` + the existing `shell.rsc` (or `page.rsc`), preserving `window.__DINOU_PPR__ = true` and all `[data-ppr-hole]` placeholders without re-executing `page.tsx`.
   - Allowed static cached `layout.rsc` (`isLayoutReq`) to be served on URLs with query parameters (`?mode=...`) on PPR routes while preserving per-request dynamic rendering for layouts (or parallel `@slots`) that access `req.query` / `req.cookies` / `req.headers` outside `<Suspense>` via `X-Dinou-Dynamic: true` during SSG and `dynamic: true` in `layout.metadata.json`.
2. **PPR-Aware `revalidatePage` & `{ onlyRefreshSlots: true }` (`dinou/core/cache-revalidate.js`)**:
   - `revalidatePage` now loads `activeLayoutRscText` (`layout.rsc`) and `leafSuspenseCount` for both Static and PPR routes, wraps `revalContext.req` in `createBailoutProxy`, and evaluates PPR pages inside `runWithPprContext({ isPpr: true })` + `resetPprHoles(leafSuspenseCount)` + `asyncRenderJSXToClientJSX`.
   - It updates `page.rsc`, `shell.rsc`, `shell.page.json`, `index.html`, `shell.html`, and `metadata.json` (`ppr: true`, `holes`, `slotTags`) while composing HTML with the cached `layout.rsc` so `layout.tsx` is never re-executed.
   - When `revalidateTag` invalidates **only** a `<DinouCacheSlot>` tag inside a page (`onlyRefreshSlots: true`), `revalidatePage` deserializes `shell.page.json`, refreshes only the invalidated slot via `refreshNestedSlotsInTree`, and re-composes `page.rsc` / `shell.rsc` / `shell.html` / `index.html` without re-executing `page_functions.ts` (`getProps`) or `page.tsx`.
3. **Non-Destructive `revalidateTag` (`dinou/core/cache-revalidate.js`)**:
   - Deletes matching `slots/<id>/slot.json` and `slots/<id>/slot.metadata.json` **first**, then awaits `revalidateLayout` for layouts whose `tags` or `slotTags` match, and finally awaits `revalidatePage` for pages whose `tags` or `slotTags` match—never deleting `layout.metadata.json` or `metadata.json`.
4. **`DinouCacheSlotBoundary` State Reconciliation (`dinou/core/slot.js`)**:
   - `DinouCacheSlotBoundary` now pairs its live-refreshed state with the server `children` prop reference (`{ baseChildren: children, content: resolved }`) and renders `override.content` only while `override.baseChildren === children`. As soon as `router.refresh()` or `router.refresh({ layout: true })` delivers a new `children` tree from the server, `DinouCacheSlotBoundary` renders the new server `children` while keeping nested Client Components mounted in place.
5. **Non-Destructive, Deadlock-Free Static-Shell Synchronization in `getSlotJSX` (`dinou/core/cache-slot.js`)**:
   - When `getSlotJSX(slotId, { fresh: true, currentPath })` refreshes a slot with `inStaticShell: true`, instead of deleting `index.html`, `shell.html`, and `metadata.json` (which previously erased `slotTags` and forced a cold SSG rebuild), it persists the new `slots/<id>/slot.json` inside `renderPromise`, releases `inflightSlotRenders.delete(storageKey)` in `finally`, and **only after releasing the in-flight lock** calls `await revalidatePage("/" + cleanRouteKey, { onlyRefreshSlots: true })` (if the slot belongs to the page) or `await revalidateLayout(...)` (if the slot belongs to an active layout).
   - Executing the shell update **after** `inflightSlotRenders.delete(storageKey)` prevents a self-await promise cycle deadlock where `revalidatePage(..., { onlyRefreshSlots: true })` → `refreshNestedSlotsInTree` → `getSlotJSX(targetId)` would otherwise `await inflightSlotRenders.get(storageKey)` on the outer `renderPromise` while immediately reusing the freshly persisted `slot.json` from storage without re-executing `entry.render()`.

---

## 4. Phase 3: The 12-Scenario Triple Synergy Test Suite (`dinou-e2e/src/t-rigurous-triple-sinergy/` & `test-9.0.2/src/triple-sinergy-test/`)

### 4.1. Route Hierarchy Created in `dinou-e2e/src/t-rigurous-triple-sinergy/` (and `test-9.0.2/src/triple-sinergy-test/`)

| Route / File | Role in Triple Synergy Suite |
| :--- | :--- |
| `src/t-rigurous-triple-sinergy/ts-state.ts` | Cross-runtime state store (`globalThis[Symbol.for("dinou.e2e.rigorous.ts.state")]` + `.dinou/dist2/ts-test-state.json` on Node/Bun) with independent sequence counters for L1 layout, L1 layout slot, L2 nested layout, L2 nested layout slot, PPR Page A (shell, shell slot, dynamic hole, hole slot, nested outer/inner hole slots), PPR Page B, Static Page A, Static Page B, and nested pages. |
| `src/t-rigurous-triple-sinergy/ts-actions.ts` | `"use server"` actions: `tsGetState`, `tsMutateOnly`, `tsBumpKeys`, `tsResetAllAndRevalidate`, `tsRunRevalidateTag`, `tsRunRevalidatePage`, `tsRunRevalidateLayout`, `tsRunRevalidatePath`, `tsEchoAction`. |
| `src/t-rigurous-triple-sinergy/ts-client.tsx` | Client state trackers (`TsClientStateBox`), slot widget (`TsHoleSlotClientWidget` testing both direct and prop-passed `"use server"` functions inside a cached slot inside a PPR hole), manual controls (`TsManualControls`), and the 12-scenario automated runner (`TsAutomatedSuiteRunner`). |
| `src/t-rigurous-triple-sinergy/layout.tsx` & `layout_functions.ts` | Level-1 section layout with `export const ppr = true`, `getCacheTags() -> ["ts-layout-tag"]`, client state box, and `<DinouCacheSlot id="ts-layout-shell-slot" tag="ts-layout-shell-slot-tag">`. |
| `src/t-rigurous-triple-sinergy/page.tsx` & `page_functions.ts` | **PPR Page A** (inherits `ppr = true` from L1 layout, `getCacheTags() -> ["ts-ppr-a-page-tag"]`): static shell `<DinouCacheSlot id="ts-ppr-a-shell-slot">` + dynamic `<Suspense>` hole reading `req.cookies` & `req.query.mode`, containing `<DinouCacheSlot id="ts-ppr-a-hole-slot">` and nested `<DinouCacheSlot id="ts-hole-nested-outer">` → `<DinouCacheSlot id="ts-hole-nested-inner">`. |
| `src/t-rigurous-triple-sinergy/ppr-b/page.tsx` & `page_functions.ts` | **PPR Page B** (sibling PPR route sharing L1 layout): static shell + `<DinouCacheSlot id="ts-ppr-b-shell-slot">` + dynamic `<Suspense>` hole with `<DinouCacheSlot id="ts-ppr-b-hole-slot">`. |
| `src/t-rigurous-triple-sinergy/static-a/page.tsx` & `page_functions.ts` | **Static Page A** (`export const ppr = false` explicit opt-out under the `ppr = true` L1 layout) with `<DinouCacheSlot id="ts-static-a-slot">`. |
| `src/t-rigurous-triple-sinergy/static-b/page.tsx` & `page_functions.ts` | **Static Page B** (`export const ppr = false` explicit opt-out) with `<DinouCacheSlot id="ts-static-b-slot">`. |
| `src/t-rigurous-triple-sinergy/nested/layout.tsx`, `page.tsx` & `static-child/page.tsx` | **Level-2 Nested Layout** (`ts-nested-layout-tag` + `<DinouCacheSlot id="ts-nested-layout-slot">`) wrapping a nested PPR page (`/nested`) and a nested static opt-out child (`/nested/static-child` with `export const ppr = false`). |
| `src/t-rigurous-triple-sinergy/no-layout-ppr/page.tsx`, `page_functions.ts` & `no_layout` | Standalone `no_layout` + `export const ppr = true` + `<DinouCacheSlot>` + dynamic `<Suspense>` hole route. |
| `e2e/example.spec.ts` | Playwright E2E test suite (`Dinou Core: Rigorous Triple Synergy — Horizontal + Vertical + PPR (/t-rigurous-triple-sinergy)`) running across GitHub Actions (`esbuild`, `rollup`, `webpack` × `node`, `bun`, `deno`, `cloudflare`). |

### 4.2. Summary of the 12 Automated Verification Scenarios (`12/12 PASSED`)

| # | Scenario Name | What It Verifies & Asserts | Status |
| :--- | :--- | :--- | :--- |
| **1** | **Raw PPR Stream Split & Static Opt-Out** | Fetches raw HTTP response of `/triple-sinergy-test?mode=stream-check` and splits at `<template id="ppr-content-`: verifies `layoutSeq`, `layoutSlotSeq`, `pprAPageSeq`, `pprAShellSlotSeq`, and fallback are in the initial static shell, while `pprAHoleSeq`, `mode=stream-check`, and `pprAHoleSlotSeq` arrive inside the streamed `<template>` chunk. Also verifies `/triple-sinergy-test/static-a` (`ppr = false`) has zero `<template id="ppr-content-` chunks. | **PASSED** |
| **2** | **PPR Static Shell Immutability vs. Live Dynamic Hole on Unrevalidated Mutation** | Mutates `layoutSeq`, `pprAPageSeq`, and `pprAHoleSeq` to `101` **without** revalidating. Verifies across both raw HTML `GET` and `/____rsc_layout____` + `/____rsc_page____` (`router.refresh()`) that the static shell remains frozen at `100`, the cached `<DinouCacheSlot>` inside the hole remains `100`, and only `pprAHoleSeq` updates live to `101`. | **PASSED** |
| **3** | **Cross-Mode Horizontal Soft Navigation (`PPR A → PPR B → Static A → Static B → PPR B → PPR A`)** | Navigates across 5 transitions mixing PPR and Static (`ppr = false`) sibling routes under the shared L1 layout. Asserts **0 `/____rsc_layout____` network requests** and 100% preservation of L1 layout and L1 layout `<DinouCacheSlot>` client `mountId` and `useState` counters. | **PASSED** |
| **4** | **Live Vertical `refreshSlot` Across Layout Slot, PPR Shell Slot & PPR Hole Slot** | Tests direct and prop-passed `"use server"` actions inside the PPR hole slot, bumps slot counters, and calls `refreshSlot` by tag and ID on the hole slot, shell slot, and layout slot (`router.refreshSlot`). Verifies all 3 slots update in place (`100 → 101`) while preserving their internal Client Component `useState` counters and working `"use server"` prop references. | **PASSED** |
| **5** | **Nested `<DinouCacheSlot>` (Outer → Inner) Inside Dynamic PPR Hole** | Bumps both `holeNestedOuterSeq` and `holeNestedInnerSeq`, then calls `revalidateTag("ts-hole-nested-inner-tag")` (inner slot only). Verifies `refreshNestedSlotsInTree` updates the inner slot (`100 → 101`) while the outer slot remains cached at `100`. | **PASSED** |
| **6** | **Surgical `revalidateTag("ts-ppr-a-hole-slot-tag")`** | Sets `layoutSeq = 999` and `pprAPageSeq = 999` (unrevalidated), bumps `pprAHoleSlotSeq = 102`, and invalidates only `"ts-ppr-a-hole-slot-tag"`. Verifies the hole slot updates to `102` while the PPR static shell (`100`) and layout (`100`) are untouched. | **PASSED** |
| **7** | **Surgical `revalidateTag("ts-ppr-a-shell-slot-tag")`** | Sets `layoutSeq = 999` and `pprAPageSeq = 999` (unrevalidated), bumps `pprAShellSlotSeq = 102`, and invalidates `"ts-ppr-a-shell-slot-tag"`. Verifies `revalidatePage(..., { onlyRefreshSlots: true })` updates the PPR shell slot to `102`, preserves `<template>` hole streaming (`?mode=after-shell-slot`), and does **not** re-execute `layout.tsx` (`layoutSeq = 100`) or `page_functions.ts` (`pprAPageSeq = 100`). | **PASSED** |
| **8** | **Surgical `revalidatePage("/triple-sinergy-test")` & `revalidateTag("ts-ppr-a-page-tag")` on PPR Route** | Sets `layoutSeq = 999` and `pprAShellSlotSeq = 999` (unrevalidated) while bumping `pprAPageSeq` (`100 → 102 → 103`). Verifies `revalidatePage` and `revalidateTag("ts-ppr-a-page-tag")` update the PPR static shell while preserving `[data-ppr-hole]` streaming, cached `layout.rsc` (`100`), and cached `ts-ppr-a-shell-slot` (`102`). | **PASSED** |
| **9** | **Surgical `revalidateTag("ts-layout-shell-slot-tag")` Across Static & PPR Children** | Invalidates only the L1 layout's `<DinouCacheSlot>` tag (`102`) while child page counters are set to `999` (unrevalidated). Verifies `revalidateLayout` updates `layout.rsc` and lazily re-composes both Static child `/static-b` (`pageSeq = 101`) and PPR child `/triple-sinergy-test` (`pageSeq = 103`) to show `layoutSlotSeq = 102` without re-executing either child `page.tsx`. | **PASSED** |
| **10** | **`revalidateLayout("/triple-sinergy-test")` & `revalidateTag("ts-layout-tag")` Across All PPR & Static Children** | Bumps `layoutSeq` (`100 → 105 → 106`) with all child page counters set to `999` (unrevalidated). Verifies PPR A, PPR B, Static A, and Static B all lazily re-compose their HTML with `layoutSeq = 105/106` while keeping their cached page shells (`103, 100, 100, 101`) and PPR hole streaming intact. | **PASSED** |
| **11** | **Multi-Level Nested Layout (`L1 + L2`) Soft Navigation & Ancestor `revalidateLayout` Cascade** | Navigates to `/triple-sinergy-test/nested` (PPR) and `/triple-sinergy-test/nested/static-child` (`ppr = false`) with 0 layout fetches and preserved L1 + L2 client state; then revalidates ancestor L1 layout (`layoutSeq = 107`) and verifies automatic cascade to L2 `layout.rsc` and lazy HTML re-composition on both nested PPR and nested Static children. | **PASSED** |
| **12** | **`router.refresh()` vs. `router.refresh({ layout: true })` with Query Params (`?mode=live-query`) + `no_layout` PPR Boundary** | Navigates to `/triple-sinergy-test?mode=live-query`, verifies `router.refresh()` makes 0 `/____rsc_layout____` requests while forwarding `?mode=live-query` to the dynamic PPR hole, verifies `router.refresh({ layout: true })` fetches both layout and page while preserving layout client state, and soft-navigates to `/triple-sinergy-test/no-layout-ppr` and back. | **PASSED** |
| **+F5 & Direct SSR** | **Post-Suite Hard Reload (`F5`) on PPR Route & Direct SSR of `no_layout` PPR Route** | Reloads `/triple-sinergy-test` after layout revalidation and directly loads `/triple-sinergy-test/no-layout-ppr?mode=direct-ssr`, asserting exact state parity and **`0` React hydration errors**. | **PASSED** |

