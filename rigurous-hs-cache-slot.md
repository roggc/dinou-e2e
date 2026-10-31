# Pure Horizontal Segmentation + Vertical Segmentation (`<DinouCacheSlot>`) Synergy in Dinou — Empirical TDD Bug Report, Client & RSC Fixes, and 11-Scenario E2E Reference

This document provides a complete technical record of the **Pure Horizontal Segmentation + Vertical Segmentation (`<DinouCacheSlot>`) Synergy (Non-PPR)** investigation and implementation in Dinou v9.0.3: how **Horizontal Segmentation** (`layout.rsc` vs. `page.rsc`, `@sidebar` parallel slots, multi-level nested layouts, client `pageCache` / `layoutCache`, and soft navigation) interacts with **Vertical Segmentation** (`<DinouCacheSlot>`, `refreshSlot`, `revalidateTag`, nested slots, and `revalidate={0}` dynamic bypass) on standard static/ISG and dynamic routes (`ppr = false`).

Following a strict **Test-Driven Development (TDD)** methodology in `test-9.0.2`:
1. **Phase 1**: We designed and implemented a dedicated 10-scenario pure Horizontal + Vertical Segmentation stress suite (`src/hs-cache-slot-test/` in `test-9.0.2`, mirrored to `src/t-rigurous-hs-cache-slot/` in `dinou-e2e`) and ran it against `dev:esbuild` and `start:node:esbuild` (`build:node:esbuild`).
2. **Phase 2**: While 8 of the 10 scenarios (all server-side surgical revalidation, cross-axis shared tags, `@sidebar` parallel slot caching, nested `<DinouCacheSlot>` Outer/Inner isolation, and `revalidate={0}` bypass) passed immediately thanks to the server-side foundations established in `rigurous-triple-sinergy.md`, **Scenarios 7 and 8 failed (`8/10 PASSED, 2/10 FAILED`)** and `dev:esbuild` surfaced a React 19 development key-validation warning inside `<DinouCacheSlotBoundary>`. We engineered surgical fixes across `dinou/core/slot.js`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`, `dinou/core/render-jsx-to-client-jsx.js`, and `dinou/core/cache-slot.js`.
3. **Phase 3**: We verified that `/hs-cache-slot-test` passes **10/10 in green with `0` warnings** across both `dev:esbuild` and `start:node:esbuild`, and then ran the entire **7-suite verification matrix** in `test-9.0.2` (`sf-test`, `ppr-test`, `cache-slot-test`, `ppr-cache-slot-test`, `horizontal-segmentation-test`, `triple-sinergy-test`, and `hs-cache-slot-test`), passing **100% in green with `0` hydration errors**.

---

## 1. Overview: Why Test Horizontal + Vertical Segmentation Without PPR?

While `/triple-sinergy-test` exercises Horizontal Segmentation + Vertical Segmentation + PPR together, **non-PPR routes (`ppr = false`, the default in Dinou)** follow distinct client-side and server-side code paths that PPR routes do not use:

| Dimension | PPR Routes (`ppr = true`) | Non-PPR Routes (`ppr = false` — Tested Here) |
| :--- | :--- | :--- |
| **Static Artifact Format** | `shell.html`, `shell.rsc`, `shell.page.json` + streamed `<template id="ppr-content-ppr-hole-N">` chunks | `index.html`, `page.rsc`, `shell.page.json`, `layout.rsc`, `shell.layout.json` |
| **Client Soft Navigation Caching (`pageCache`)** | `window.__DINOU_USE_STATIC__` is `false` on PPR pages; soft navigation fetches live `/____rsc_page____` unless cached | `pageCache` caches resolved `page.rsc` trees in memory on the client; round-trip soft navigation (`Page A -> Page B -> Page A`) resolves **synchronously from `pageCache` with `0` network requests** |
| **Parallel Layout Slots (`@sidebar`)** | Tested primarily with `<Suspense>` holes | Parallel route slots (`@sidebar/page.tsx`) rendered as props into `layout.tsx` hosting their own independent `<DinouCacheSlot>` boundaries |
| **Dynamic `<DinouCacheSlot revalidate={0}>`** | Wrapped in `<Suspense>` inside a PPR hole | Rendered directly inside a static `ppr = false` page without `<Suspense>`, bypassing `slots/<id>/slot.json` storage while the host page remains cached |
| **Cross-Route Client Slot Lifecycle** | Slots refreshed while mounted on active PPR route | Slots refreshed via `refreshSlot()` on `Page A`, followed by soft navigation to `Page B` and back to `Page A` (hitting `pageCache`), **or** refreshing a `Page A` slot *while viewing `Page B`* (unmounted `<DinouCacheSlotBoundary>`) and then soft-navigating back to `Page A` |

---

## 2. Phase 1 (Strict TDD): Empirical Bug Discovery (`8/10 PASSED, 2/10 FAILED`)

When we first executed the 10-scenario `/hs-cache-slot-test` suite against the unmodified engine, Scenarios 1, 2, 3, 4, 5, 6, 9, and 10 passed on the first run, while **Scenarios 7 and 8 failed** and `dev:esbuild` logged a React 19 `_store.validated` warning:

### Bug #1 (Confirmed by Failing Scenario 7): Client `<DinouCacheSlotBoundary>` Lost Refreshed `slotOverride` State Across Round-Trip Soft Navigation (`Page A -> Page B -> Page A`)
- **Where**: `dinou/core/slot.js` (`DinouCacheSlotBoundary`).
- **Root Cause**:
  - `DinouCacheSlotBoundary` stored its live-refreshed slot tree in local component state (`const [slotOverride, setSlotOverride] = useState(null)`).
  - When a user refreshed a page-level `<DinouCacheSlot>` on `Page A` via `refreshSlot("hscs-page-a-slot")` (updating its sequence from `201 -> 203`), and then soft-navigated to `Page B` (`/hs-cache-slot-test/page-b`), React unmounted `Page A`'s subtree—destroying `DinouCacheSlotBoundary`'s local `useState`.
  - When the user soft-navigated back to `Page A` (`/hs-cache-slot-test`), Dinou's client router served `Page A` from its in-memory `pageCache` (**`0` `/____rsc_page____` network requests**). Because `pageCache` still held the initial `Page A` RSC tree (whose `children` prop inside `<DinouCacheSlotBoundary id="hscs-page-a-slot">` had sequence `201`), the remounted `DinouCacheSlotBoundary` initialized with `slotOverride = null` and rendered the stale `201` content instead of the refreshed `203` content!
- **Symptom**: Scenario 7 failed with:
  ```text
  Expected 203 after round-trip soft-nav, got 201
  ```

### Bug #2 (Confirmed by Failing Scenario 8 + Concurrent T1→T2→T3 Remount Race): Calling `refreshSlot(idOrTag)` While a Slot Was Unmounted on a Sibling Route Was Ignored
- **Where**: `dinou/core/slot.js`, `dinou/core/client.jsx`, and `dinou/core/client-webpack.jsx`.
- **Root Cause**:
  1. **No Registry for Unmounted Client Slots**: `DinouCacheSlotBoundary` only registered its `"dinou:refresh-slot"` event listener inside `useEffect` while mounted. If the user was on `Page B` (`/hs-cache-slot-test/page-b`) and triggered a Server Action or mutation that called `refreshSlot("hscs-page-a-slot-tag")` (a slot belonging to `Page A`, which was previously visited and cached in `pageCache` but is currently **unmounted**), the `"dinou:refresh-slot"` custom event fired with zero listeners for `hscs-page-a-slot`. Returning to `Page A` via soft navigation hit `pageCache` and rendered the stale `Page A` slot (`203` instead of `204`).
  2. **Missing `currentPath` Origin for Unmounted Slot Fetches**: `window.__DINOU_REFRESH_SLOT__(id, fresh)` always passed `currentPath: window.location.pathname` (which is `/hs-cache-slot-test/page-b` while on `Page B`). For an unmounted slot belonging to `Page A` (`/hs-cache-slot-test`), the server needs `currentPath=/hs-cache-slot-test` so cold-start discovery and static-shell synchronization target `Page A`'s route rather than `Page B`.
  3. **Concurrent Remount Race (`T1 -> T2 -> T3`)**: When we added background fetching for unmounted slots in `knownClientSlots`, if `refreshSlot("hscs-page-a-slot-tag")` was triggered on `Page B` (non-blocking) and the user **immediately** clicked `<Link href="/hs-cache-slot-test">` to return to `Page A`:
     - At **`T1` (`DinouCacheSlotBoundary` render phase on `Page A`)**: `pendingPromise` was still in flight in `knownClientSlots`, so `slotOverrideCache.get(id)` did not yet have the new `204` tree.
     - At **`T2` (microtask between render and `useEffect`)**: `pendingPromise` resolved, populated `slotOverrideCache.set(id, { baseChildren, content: 204 })`, and cleared `entry.pendingPromise = null`.
     - At **`T3` (`useEffect` mount on `Page A`)**: `entry.pendingPromise` was already `null`, so checking only `if (entry.pendingPromise)` missed the resolved `204` update!

### Bug #3 (Confirmed During `dev:esbuild` Verification): React 19 Dev `_store.validated` Warning Inside `<DinouCacheSlotBoundary>`
- **Where**: `dinou/core/render-jsx-to-client-jsx.js` (`cloneWithDevProps`, line 25) and `dinou/core/cache-slot.js` (`deserializeJSX`, line 259).
- **Root Cause**:
  1. In `cloneWithDevProps` (`dinou/core/render-jsx-to-client-jsx.js`), React 19's `_store.validated` flag was copied using the nullish coalescing operator: `value: jsx._store.validated ?? 1`. In JavaScript, `0 ?? 1` evaluates to **`0`** because `0` is neither `null` nor `undefined`! Thus, elements created with `_store: { validated: 0 }` remained unvalidated (`0`) after cloning.
  2. In `deserializeJSX` (`dinou/core/cache-slot.js`), `elem._store` was only initialized if `!elem._store`, leaving existing `_store` objects with `validated: 0` when reconstructing cached `<DinouCacheSlot>` JSX trees from `slot.json`.
- **Symptom**: In `dev:esbuild`, React 19 logged `Each child in a list should have a unique "key" prop. Check the top-level render call using <DinouCacheSlotBoundary>`.

---

## 3. Phase 2: Architecture & Fixes Implemented in `dinou/core/`

### 3.1. Client-Side Slot Override Persistence (`slotOverrideCache`) & Unmounted Slot Refresh Registry (`knownClientSlots` + `mountedClientSlots`) in `dinou/core/slot.js`

```text
+---------------------------------------------------------------------------------------------------+
|                   Client Memory (dinou/core/slot.js Global Registries)                            |
|                                                                                                   |
|  1. slotOverrideCache: Map<slotId, { baseChildren: ReactNode, content: ReactNode }>               |
|     - Persists live-refreshed slot trees across component unmount/remount (e.g. Page A -> B -> A) |
|     - Automatically invalidated when router.refresh() or <Link fresh> supplies new baseChildren   |
|                                                                                                   |
|  2. knownClientSlots: Map<slotId, { tags, baseChildren, routePath, pendingPromise, notifyMounted }>|
|     - Tracks every <DinouCacheSlotBoundary> ever mounted in the session                           |
|                                                                                                   |
|  3. mountedClientSlots: Map<slotId, Set<symbol>>                                                  |
|     - Tracks which slot boundaries are currently mounted in the active DOM                        |
+---------------------------------------------------------------------------------------------------+

Scenario 8 Flow: Refreshing Page A's Slot While Viewing Sibling Route Page B
============================================================================
[User is on Page B (/hs-cache-slot-test/page-b)]
   |
   +--> Calls refreshSlot("hscs-page-a-slot-tag")
          |
          +--> Global "dinou:refresh-slot" listener inspects knownClientSlots:
                 - Finds "hscs-page-a-slot" (tags: ["hscs-page-a-slot-tag"], routePath: "/hs-cache-slot-test")
                 - Checks isSlotCurrentlyMounted("hscs-page-a-slot") === false (unmounted!)
                 - Starts background fetch:
                     window.__DINOU_REFRESH_SLOT__("hscs-page-a-slot", true, {
                       currentPath: "/hs-cache-slot-test"
                     })
                 - Stores in-flight promise in entry.pendingPromise

[User immediately clicks <Link href="/hs-cache-slot-test"> (Soft-Nav Back to Page A)]
   |
   +--> Case A: entry.pendingPromise already resolved before Page A renders (T1)
   |      - DinouCacheSlotBoundary reads slotOverrideCache.get("hscs-page-a-slot")
   |      - Sees cached.baseChildren === children (from pageCache)
   |      - Immediately renders cached.content (seq = 204) on initial mount!
   |
   +--> Case B: entry.pendingPromise resolves between render (T1) and useEffect (T2 -> T3)
   |      - useEffect checks slotOverrideCache.get("hscs-page-a-slot")
   |      - Detects cached.content !== slotOverride.content and updates state to seq = 204!
   |
   +--> Case C: entry.pendingPromise is still in flight when useEffect runs (T3)
          - useEffect registers entry.notifyMounted = applyResolved
          - As soon as pendingPromise resolves, applyResolved transitions UI to seq = 204!
```

1. **`slotOverrideCache` (`dinou/core/slot.js`)**:
   - `DinouCacheSlotBoundary` initializes its state from `slotOverrideCache.get(id)` whenever `cached.baseChildren === children`.
   - When the user soft-navigates from `Page A -> Page B -> Page A`, `pageCache` returns the exact same `children` element reference (`cached.baseChildren === children`), so `DinouCacheSlotBoundary` immediately renders the refreshed `cached.content` (`203`) with **`0` network requests**.
   - Conversely, when `router.refresh()`, `router.refresh({ layout: true })`, or `<Link fresh>` fetches a new RSC payload from the server, `children` is a new element reference (`cached.baseChildren !== children`), so `DinouCacheSlotBoundary` automatically discards the stale client override and renders the fresh server `children`.
2. **Global Unmounted Slot Listener & `options.currentPath` (`dinou/core/slot.js`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`)**:
   - Updated `fetchSlotRSC(slotId, fresh = false, options = {})` in both `dinou/core/client.jsx` and `dinou/core/client-webpack.jsx` to accept `options.currentPath`, falling back to `window.location.pathname` when omitted.
   - Installed a singleton global `"dinou:refresh-slot"` listener in `dinou/core/slot.js` that iterates over `knownClientSlots`. For any matching slot (`slotId === target` or `entry.tags.includes(target)`) that is **not** currently mounted (`!isSlotCurrentlyMounted(slotId)`), it invokes `window.__DINOU_REFRESH_SLOT__(slotId, fresh, { currentPath: entry.routePath })`, writes the resolved JSX tree into `slotOverrideCache.set(slotId, { baseChildren: entry.baseChildren, content: resolved })`, and invokes `entry.notifyMounted(resolved)` if the boundary remounted while the fetch was in flight.

---

### 3.2. React 19 Dev `_store.validated` Preservation (`dinou/core/render-jsx-to-client-jsx.js` & `dinou/core/cache-slot.js`)

1. **`dinou/core/render-jsx-to-client-jsx.js` (`cloneWithDevProps`)**:
   - Changed `value: jsx._store.validated ?? 1` to `value: jsx._store.validated || 1` so that any element cloned during server-side JSX traversal whose `_store.validated` was `0` is marked as validated (`1`), preventing false-positive key warnings when serialized across Flight or `<DinouCacheSlotBoundary>`.
2. **`dinou/core/cache-slot.js` (`deserializeJSX`)**:
   - Ensured that after reconstructing a React element from `slot.json` in `deserializeJSX`, if `elem._store && typeof elem._store === "object"`, `elem._store.validated = 1` is always set (using `Object.defineProperty` if non-writable).

---

## 4. Phase 3: The 11-Scenario Pure Horizontal + Vertical Segmentation Test Suite (`dinou-e2e/src/t-rigurous-hs-cache-slot/` & `test-9.0.2/src/hs-cache-slot-test/`)

### 4.1. Route Hierarchy Created in `dinou-e2e/src/t-rigurous-hs-cache-slot/` (and `test-9.0.2/src/hs-cache-slot-test/`)

| Route / File | Role in Pure Horizontal + `<DinouCacheSlot>` Suite |
| :--- | :--- |
| `src/t-rigurous-hs-cache-slot/hscs-state.ts` | Cross-runtime deterministic state store (`globalThis[Symbol.for("dinou.hs_cache_slot.state")]` + `.dinou/dist2/hscs-test-state.json` on Node/Bun) with independent sequence counters (`100` / `200` / `300` / `400` / `500` baselines) for L1 layout, L1 layout slot, L1 shared-tag slot, L1 nested outer/inner slots, `@sidebar` host, `@sidebar` slot, Page A host, Page A slot, Page A shared-tag slot, Page A nested outer/inner slots, Page A dynamic `revalidate={0}` slot, Page B host, Page B slot, L2 nested layout host, L2 nested layout slot, and Nested Page host/slot. |
| `src/t-rigurous-hs-cache-slot/hscs-actions.ts` | `"use server"` actions: `hscsGetState`, `hscsBumpCounters`, `hscsResetAllAndRevalidate`, `hscsRevalidateTag`, `hscsRevalidatePage`, `hscsRevalidateLayout`, `hscsRevalidatePath`, and `hscsSlotServerAction` (passed as a prop into `<DinouCacheSlot>` Client Components). |
| `src/t-rigurous-hs-cache-slot/hscs-client.tsx` | Client state trackers (`HscsClientStateTracker`), interactive slot widget (`HscsSlotWidget` testing local `useState` preservation and prop-passed `"use server"` action invocation across live `refreshSlot` updates), manual toolbar (`HscsManualControls`), and the 10-scenario automated runner (`HscsAutomatedRunner`). |
| `src/t-rigurous-hs-cache-slot/layout.tsx` & `layout_functions.ts` | **Level-1 Layout** (`revalidate = 3600`, `getCacheTags() -> ["hscs-l1-layout-tag"]`, no PPR) rendering: L1 client state tracker, `<DinouCacheSlot id="hscs-l1-slot">`, cross-axis `<DinouCacheSlot id="hscs-l1-shared-slot" tags={["hscs-shared-tag", "hscs-l1-shared-only"]}>`, nested `<DinouCacheSlot id="hscs-l1-outer-slot">` → `<DinouCacheSlot id="hscs-l1-inner-slot">`, the `@sidebar` parallel route slot, and `<DinouPageSlot />`. |
| `src/t-rigurous-hs-cache-slot/@sidebar/page.tsx` | **Parallel Route `@sidebar`** rendered inside L1 layout, hosting its own client state tracker and `<DinouCacheSlot id="hscs-sidebar-slot" tags={["hscs-sidebar-slot-tag"]}>` with a prop-passed `"use server"` action (`hscsSlotServerAction`). |
| `src/t-rigurous-hs-cache-slot/page.tsx` & `page_functions.ts` | **Page A (`/hs-cache-slot-test`)** (`revalidate = 3600`, `getCacheTags() -> ["hscs-page-a-tag"]`, no PPR) hosting: Page A client state tracker, `<DinouCacheSlot id="hscs-page-a-slot">`, cross-axis `<DinouCacheSlot id="hscs-page-a-shared-slot" tags={["hscs-shared-tag", "hscs-page-a-shared-only"]}>`, nested `<DinouCacheSlot id="hscs-page-a-outer-slot">` → `<DinouCacheSlot id="hscs-page-a-inner-slot">`, and a dynamic `<DinouCacheSlot id="hscs-page-a-dyn-slot" revalidate={0}>` (without `<Suspense>`). |
| `src/t-rigurous-hs-cache-slot/page-b/page.tsx` & `page_functions.ts` | **Sibling Page B (`/hs-cache-slot-test/page-b`)** sharing the L1 layout and `@sidebar`, hosting its own client state tracker and `<DinouCacheSlot id="hscs-page-b-slot" tags={["hscs-page-b-slot-tag"]}>`. |
| `src/t-rigurous-hs-cache-slot/nested/layout.tsx`, `layout_functions.ts`, `page.tsx` & `page_functions.ts` | **Level-2 Nested Layout & Page (`/hs-cache-slot-test/nested`)** with `<DinouCacheSlot id="hscs-l2-slot">` in the L2 layout and `<DinouCacheSlot id="hscs-nested-page-slot">` in the nested page. |
| `e2e/example.spec.ts` | Playwright E2E test block (`Dinou Core: Rigorous Horizontal Segmentation + <DinouCacheSlot> Synergy (/t-rigurous-hs-cache-slot)`) verifying all 11 scenarios + F5 hard reload with zero hydration/console errors. |

---

### 4.2. Summary of the 11 Automated Verification Scenarios (`11/11 PASSED`)

| # | Scenario Name | What It Verifies & Asserts | Status |
| :--- | :--- | :--- | :--- |
| **1** | **Baseline Segmented Render (`L1 Layout + @sidebar + Page A`) & Multi-Level Client State Init** | Resets and revalidates all segments (`100` / `200` baselines). Increments client `useState` counters inside L1 Layout, L1 Layout Slot, `@sidebar` Host, `@sidebar` Slot, Page A Host, and Page A Slot, recording their initial `mountId` values to assert zero remounts across all subsequent operations. | **PASSED** |
| **2** | **Surgical Page A Slot Revalidation (`revalidateTag` + `refreshSlot`) & Server Action Prop in Slot** | Bumps `l1LayoutSeq`, `pageASeq`, and `pageASlotSeq` (`200 -> 201`), then calls `revalidateTag("hscs-page-a-slot-tag")` + `refreshSlot("hscs-page-a-slot-tag")`. Verifies `pageASlotSeq` updates in place to `201` while `l1LayoutSeq` (`100`) and `pageASeq` (`200`) are **not** re-rendered, Page A Slot's internal Client Component `useState` (`1`) and `mountId` are preserved, and the reconstructed `"use server"` prop (`hscsSlotServerAction`) executes via RPC (`ok:page-a-slot:ping-from-page-a-slot`). Also verifies direct `refreshSlot("hscs-page-a-slot", true)` (`201 -> 202`). | **PASSED** |
| **3** | **Surgical L1 Layout Slot & `@sidebar` Parallel Slot Revalidation (Preserving Host Layout & Page)** | Bumps `l1SlotSeq` (`100 -> 101`) and `sidebarSlotSeq` (`100 -> 101`), then invalidates and refreshes `"hscs-l1-slot-tag"` and `"hscs-sidebar-slot-tag"`. Verifies both layout-level slots update to `101`, their internal Client Component `useState` counters and `mountId`s remain intact, `@sidebar`'s prop-passed `"use server"` action succeeds (`ok:sidebar-slot:ping-from-sidebar-slot`), and neither L1 Layout host (`100`) nor Page A host (`200`) re-executes. | **PASSED** |
| **4** | **Cross-Axis Shared Tag (`hscs-shared-tag`) Simultaneous Layout Slot + Page Slot Update** | Bumps `l1SharedSlotSeq` (`100 -> 101`) and `pageASharedSlotSeq` (`200 -> 201`), then calls `revalidateTag("hscs-shared-tag")` + `refreshSlot("hscs-shared-tag")` once. Verifies a single tag invalidation and client refresh simultaneously updates **both** the L1 layout slot (`101`) and the Page A slot (`201`) without re-executing `layout.tsx` (`100`) or `page.tsx` (`200`). | **PASSED** |
| **5** | **Nested `<DinouCacheSlot>` (`Outer + Inner`) Surgical Inner vs. Outer Refresh in Layout & Page** | First bumps both outer and inner counters (`+1`) in L1 Layout and Page A, but invalidates **only** the inner tags (`"hscs-l1-inner-tag"` and `"hscs-page-a-inner-tag"`). Verifies `refreshNestedSlotsInTree` updates both inner slots (`101` and `201`) while keeping both outer slots cached at their baseline (`100` and `200`). Then bumps both again and invalidates the outer tags, verifying the outer slots update (`102` and `202`) along with the inner slots (`103` and `203`). | **PASSED** |
| **6** | **Dynamic `<DinouCacheSlot revalidate={0}>` Storage Bypass Inside Static Non-PPR Page** | Bumps `pageADynSlotSeq` (`200 -> 201`) and `pageASeq` (unrevalidated) without calling `revalidateTag` or `revalidatePage`. Calls `router.refresh()` and verifies `hscs-page-a-dyn-slot` (`revalidate={0}`) bypasses disk caching and renders `201`, while the host static Page A remains cached at `200`. | **PASSED** |
| **7** | **Round-Trip Soft Navigation (`Page A -> Page B -> Page A`): `0` Network Hits + Refreshed Slot Persistence** | Refreshes `hscs-page-a-slot` to `203` on Page A, soft-navigates to `/hs-cache-slot-test/page-b` (`0` `/____rsc_layout____` fetches, L1 Layout & `@sidebar` client state and `mountId` preserved), and soft-navigates back to `/hs-cache-slot-test`. Asserts **`0` `/____rsc_page____` and `0` `/____rsc_layout____` network requests** (served 100% from `pageCache`), **and** verifies `slotOverrideCache` preserves the refreshed `hscs-page-a-slot` value (`203`) instead of reverting to the pre-refresh `pageCache` tree. | **PASSED** |
| **8** | **Unmounted Slot Refresh on Sibling Route (`Refresh Page A Slot While on Page B -> Return to Page A`)** | Navigates to `/hs-cache-slot-test/page-b` (unmounting Page A). While on Page B, bumps `pageASlotSeq` to `204`, calls `revalidateTag("hscs-page-a-slot-tag")`, and calls `refreshSlot("hscs-page-a-slot-tag")` while `hscs-page-a-slot` is **unmounted**, then immediately soft-navigates back to Page A. Verifies `knownClientSlots` + `slotOverrideCache` refreshes the unmounted slot in the background and renders `204` on Page A. | **PASSED** |
| **9** | **Multi-Level Nested Layout (`/nested`) Slot Refresh & Round-Trip (`/nested -> /page-b -> /nested`)** | Soft-navigates to `/hs-cache-slot-test/nested` (`0` L1 layout fetches), increments L2 Layout and L2 Slot client `useState`, surgically refreshes L2 Layout Slot (`400 -> 401`) and Nested Page Slot (`500 -> 501`) while preserving L2 Layout host (`400`) and Nested Page host (`500`), and performs a round-trip soft navigation (`/nested -> /page-b -> /nested`) verifying `slotOverrideCache` preserves both `401` and `501` with `0` `/____rsc_page____` fetches. | **PASSED** |
| **10** | **Host Segment Revalidation (`revalidatePage` & `revalidateLayout`) Coexistence with Cached Slots** | Bumps `pageASeq` (`200 -> 205`) and `l1LayoutSeq` (`100 -> 105`) while bumping `pageASlotSeq` and `l1SlotSeq` to `299`/`199` **without** invalidating the slot tags. Calls `revalidatePage("/hs-cache-slot-test")` + `router.refresh()`, then `revalidateLayout("/hs-cache-slot-test")` + `router.refresh({ layout: true })`. Verifies the host Page A (`205`) and host L1 Layout (`105`) update while reusing their cached `<DinouCacheSlot>` entries (`204` and `101`) from `slots/<id>/slot.json` and preserving L1 Layout & `@sidebar` client `mountId`s. | **PASSED** |
| **11** | **Clock-Based `<DinouCacheSlot revalidate={1}>` TTL Expiration in Static L1 Layout & Static Page A** | Bumps 1s-TTL slots in L1 Layout (`hscs-l1-ttl-slot`) and Page A (`hscs-page-a-ttl-slot`) to `501` while poisoning L1 Layout host, Page A host, and `3600s` sibling slots to `999` **without** calling `revalidateTag`. Waits `1.25s` for the 1s clock TTL to expire, calls `refreshSlot("hscs-l1-ttl-slot")` and `refreshSlot("hscs-page-a-ttl-slot")` without `{ fresh: true }`, and verifies that the live DOM, raw SSR `index.html`, and `/____rsc_layout____` all update to `501` while L1 Layout host (`105`), Page A host (`205`), and `3600s` slots (`101`, `204`) remain 100% preserved. | **PASSED** |

---

## 5. Complete 8-Suite Verification Matrix in `test-9.0.2`

All **8 rigorous test suites** in `test-9.0.2` (and `dinou-e2e`) pass end-to-end against production builds with `0` hydration errors:

| # | Suite Route (`test-9.0.2`) | Companion Route (`dinou-e2e`) | Scenarios / Checks | Result |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `/sf-test` | `/t-sf-body` | 13 Automated Server Function RPC Scenarios | **13 / 13 PASSED** |
| **2** | `/ppr-test` | `/t-ppr-rigorous` | 17 Automated Partial Prerendering Checks (incl. Clock TTL) | **17 / 17 PASSED** |
| **3** | `/cache-slot-test` | `/t-rigorous-cache-slot` | 4 Automated Vertical Segmentation (`<DinouCacheSlot>`) Blocks (incl. Clock TTL) | **4 / 4 PASSED** |
| **4** | `/ppr-cache-slot-test` | `/t-rigorous-sinergy` | 3 Automated PPR + `<DinouCacheSlot>` Synergy Blocks (incl. Clock TTL) | **3 / 3 PASSED** |
| **5** | `/horizontal-segmentation-test` | `/t-rigurous-hs` | 13 Automated Horizontal Segmentation Scenarios (incl. Clock TTL) | **13 / 13 PASSED** |
| **6** | `/triple-sinergy-test` | `/t-rigurous-triple-sinergy` | 13 Automated Triple Synergy (Horizontal + Vertical + PPR) Scenarios | **13 / 13 PASSED** |
| **7** | `/hs-cache-slot-test` | `/t-rigurous-hs-cache-slot` | 11 Automated Pure Horizontal + `<DinouCacheSlot>` (Non-PPR) Scenarios | **11 / 11 PASSED** |
| **8** | `/hs-ppr-test` | `/t-rigurous-hs-ppr` | 12 Automated Pure Horizontal + PPR (No `<DinouCacheSlot>`) Scenarios | **12 / 12 PASSED** |

