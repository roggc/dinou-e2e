# Dinou v9.0.3 — Comprehensive On-Demand Revalidation & Clock-Based TTL Expiration Reference Matrix

This document provides the complete architectural and verification reference for **all revalidation and cache-expiration scenarios** implemented and tested end-to-end in **Dinou v9.0.3** across:

1. **Two Invalidation Triggers**:
   - **Clock-Based TTL Expiration (`revalidate = N` where `N >= 1`, and `revalidate = 0` no-store bypass)**
   - **On-Demand Surgical Revalidation (`revalidatePage`, `revalidateLayout`, `revalidatePath`, `revalidateTag`, and `refreshSlot`)**
2. **Three Orthogonal Caching Layers**:
   - **Horizontal Layer 1 — Layouts (`layout.tsx` / `layout_functions.ts`)**: Root/Level-1 layouts, multi-level nested layouts (`L2`), and parallel route slots (`@sidebar`, `@badge`).
   - **Horizontal Layer 2 — Pages (`page.tsx` / `page_functions.ts`)**: Static/ISG (`ppr = false`), Partial Prerendering (`ppr = true`), and Dynamic (`revalidate = 0` or unwrapped request-context bailout).
   - **Vertical Layer 3 — Subtree Micro-ISR (`<DinouCacheSlot>`)**: Layout-level slots, Static-page slots, PPR Static-Shell slots (`inStaticShell: true`), PPR Dynamic-Hole slots (`inStaticShell: false`), and nested slots (`Outer -> Inner`).
3. **Four Request Entry Points**:
   - Full HTML / SSR / PPR Resume (`GET /route`)
   - Client Soft Navigation & Page Refresh (`GET /____rsc_page____`)
   - Client Layout Segment Fetch & Refresh (`GET /____rsc_layout____`)
   - Client Live Subtree Slot Fetch & Refresh (`GET /____rsc_slot____/:id`)

---

## 1. Clock-Based TTL Expiration Matrix (`revalidate = N` & `revalidate = 0`)

Every layer in Dinou supports its own independent clock-based TTL (`revalidate = N` seconds) or dynamic cache bypass (`revalidate = 0`). When an individual layer's TTL expires, Dinou surgically regenerates **only** the expired layer and re-composes the response without re-executing long-lived parent, child, or sibling segments.

| # | Expiring Layer & Configuration | Host / Route Context | Architectural Behavior in the Framework | E2E Suite & Scenario Verifying It |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Layout Clock TTL (`revalidate = N` in `layout_functions.ts`)** | Static Child Page (`ppr = false`) with long TTL (`3600s`) | `getActiveLayoutChain` (`dinou/core/layout-functions.js` & `dinou/core/handler.js`) detects `Date.now() > entry.generatedAt + entry.revalidate * 1000`, regenerates **only** `layout.rsc` (without re-executing child `page.tsx`), and on `GET /route` performs $O(1)$ **lazy re-composition** of `index.html` by streaming the fresh `layout.rsc` together with the cached child `page.rsc` (`renderHtmlStream(layoutRsc, { pageRscStream })`). | `/t-rigurous-hs` (Scenario 13a: `/ttl-isr`) |
| **2** | **Layout Clock TTL (`revalidate = N` in `layout_functions.ts`)** | PPR Child Page (`ppr = true`) with long TTL (`3600s`) | Upon layout clock expiration, regenerates `layout.rsc` and `shell.layout.json`, and lazily re-composes the child's `shell.html` before `handlePprResume` streams dynamic `<Suspense>` holes—keeping the child page's `shell.rsc` and `shell.page.json` 100% frozen without re-executing `page.tsx` or `page_functions.ts`. | `/t-rigurous-hs-ppr` (Scenario 11: `/ttl-ppr`) |
| **3** | **Dynamic Layout (`revalidate = 0` in `layout_functions.ts`)** | Any Child Page (Static `ppr = false` or PPR `ppr = true`) | Evaluated fresh on every `GET /route` and `/____rsc_layout____` request while composing seamlessly with the child page's cached `page.rsc` or `shell.rsc` without invalidating or overwriting child static artifacts. | `/t-spa-router/refresh-layout` & `/t-rigurous-hs/refresh-lab` |
| **4** | **Static Page Clock TTL (`revalidate = N` in `page_functions.ts`)** | Parent Layout with long TTL (`3600s`) | `metadata.json` persists `pageRevalidate` and `pageGeneratedAt` separately from `combinedRevalidate`. When `Date.now() > pageGeneratedAt + pageRevalidate * 1000` (`isExpired`), `handler.js` triggers background ISR via `revalidatePage(reqPath)`, which regenerates `page.rsc` and re-composes `index.html` using the parent's cached `layout.rsc` **without re-executing `layout.tsx` or `layout_functions.ts`**. | `/t-rigurous-hs` (Scenario 13b: `/ttl-page-only`) |
| **5** | **PPR Page Clock TTL (`revalidate = N` in `page_functions.ts`)** | Standalone PPR route or inside a Parent Layout with long TTL (`3600s`) | When the PPR page's clock TTL expires, background ISR invokes `regeneratePprShell(..., { skipLayoutPersistence: true })`, regenerating `shell.page.json`, `shell.rsc`, and `shell.html` while reusing the parent's cached `layout.rsc` (`skipLayoutPersistence: true`) and preserving live `<Suspense>` hole streaming. | `/t-ppr-rigorous` (Check 17: `/ttl-shell`) & `/t-rigurous-hs-ppr` (Scenario 12: `/page-ttl-ppr`) |
| **6** | **Dynamic Page (`revalidate = 0` in `page_functions.ts`)** | Parent Layout with long TTL (`3600s`) | `isZeroRevalidatePage` in `handler.js` reuses the cached ancestor `layout.rsc` chain and evaluates only the page segment (`onlyPage: true`) per request. | `/t-rigurous-hs` & `/t-rigurous-hs-ppr` |
| **7** | **`<DinouCacheSlot revalidate={N}>` (tagged or tagless) in a Page** | Inside a Dynamic Page or Static Page (`ppr = false`) | Every rendered slot records `[slotId, ...allTags]` in `metadata.json` (`slotTags`). `hasExpiredSlots(slotTags)` (`dinou/core/cache-slot.js`) inspects slot TTLs before serving `index.html`, `/____rsc_page____`, or `/____rsc_slot____/:id`. When expired, only the expired slot regenerates and triggers surgical host re-composition (`revalidatePage(..., { onlyRefreshSlots: true })`) while preserving the host page (`page.tsx`) and long-lived sibling slots (`3600s`). | `/t-rigorous-cache-slot` (Block 2.4) & `/t-rigurous-hs-cache-slot` (Scenario 11) |
| **8** | **`<DinouCacheSlot revalidate={N}>` in a Layout** | Inside a Static Layout (`L1` / `@sidebar`) or PPR Layout | `layout.metadata.json` records `_layoutSlotTags`. `hasExpiredSlots` in `layout-functions.js` and `handler.js` detects the expired layout slot on `GET /route`, `/____rsc_layout____`, or `refreshSlot(slotId)` (without `{ fresh: true }`), regenerates only the expired slot, updates `layout.rsc` via `revalidateLayout(..., { onlyRefreshSlots: true })`, and lazily re-composes child `index.html` / `shell.html` without re-executing `layout.tsx` or `page.tsx`. | `/t-rigurous-hs-cache-slot` (Scenario 11) & `/t-rigurous-triple-sinergy` (Scenario 13) |
| **9** | **`<DinouCacheSlot revalidate={N}>` in a PPR Route** | **9a.** Inside the **PPR Static Shell** (`inStaticShell: true`)<br>**9b.** Inside a **Dynamic `<Suspense>` Hole** (`inStaticShell: false`) | - **Static-Shell Slot (`9a`)**: `hasExpiredSlots` detects TTL expiration, regenerates the slot, and updates `shell.html` + `shell.rsc` in place via `revalidatePage(..., { onlyRefreshSlots: true })` while keeping the host PPR shell and layout frozen.<br>- **Dynamic-Hole Slot (`9b`)**: Expires by clock during `handlePprResume` / `/____rsc_page____` hole streaming and regenerates on the fly without touching `shell.html` (`0ms TTFB` preserved). | `/t-rigorous-sinergy` (Block 3.3) & `/t-rigurous-triple-sinergy` (Scenario 13) |
| **10** | **`<DinouCacheSlot revalidate={0}>` (Dynamic Cache Bypass)** | Inside a Static Page (`ppr = false`), Dynamic Page, or PPR Route | Strictly bypasses reading or writing `slots/<id>/slot.json` (`0 = no-cache`), evaluating fresh on every render while the enclosing static page or layout remains cached. | `/t-rigorous-cache-slot` (Block 2.2), `/t-rigorous-sinergy` (Block 3.1), & `/t-rigurous-hs-cache-slot` (Scenario 6) |

---

## 2. On-Demand Surgical Revalidation Matrix (`revalidate*` & `refreshSlot`)

Dinou provides five on-demand invalidation primitives—four server-side (`revalidatePage`, `revalidateLayout`, `revalidatePath`, `revalidateTag`) and one client-side (`refreshSlot` / `useRouter().refreshSlot`)—all coordinated through an `AsyncLocalStorage`-backed reentrant serialization queue (`enqueueRevalidation` in `dinou/core/cache-revalidate.js`) with a shared monotonic timestamp generator (`nextMonotonicGenTime`).

| # | Revalidation Primitive | Target Scope | What Is Regenerated vs. What Is Surgically Preserved | E2E Suite & Scenario Verifying It |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **`revalidatePage(path)`** | Single Route's Page Segment (`page.tsx` + `page_functions.ts`) | - **Regenerates**: `page.rsc`, `shell.page.json` (on PPR routes), and re-composes `index.html` / `shell.html`.<br>- **Preserves**: Reuses the parent's cached `layout.rsc` and `shell.layout.json` (`skipLayoutPersistence: true`, **0 `layout.tsx` executions**), and reuses all cached `<DinouCacheSlot>` entries (`slots/<id>/slot.json`) whose tags were not invalidated. | `/t-rigurous-hs` (Scenario 12), `/t-rigurous-hs-cache-slot` (Scenario 10), `/t-rigurous-hs-ppr` (Scenario 3), & `/t-rigurous-triple-sinergy` (Scenario 8) |
| **2** | **`revalidateLayout(path)`** | Layout Segment at `path` (`layout.tsx` + `layout_functions.ts`) | - **Regenerates**: `layout.rsc` and `shell.layout.json` at `path` (reusing cached layout-level `<DinouCacheSlot>` entries).<br>- **Preserves**: Never re-executes any child `page.tsx` or `page_functions.ts`. On the next `GET` to any descendant route (static, PPR, or nested `L2` layout), `getActiveLayoutChain` detects `maxAncestorGen > page.generatedAt`, cascades ancestor updates to nested `L2` `layout.rsc`, and lazily re-composes `index.html` / `shell.html` in $O(1)$. | `/t-rigurous-hs` (Scenario 12), `/t-rigurous-hs-cache-slot` (Scenario 10), `/t-rigurous-hs-ppr` (Scenarios 4 & 7), & `/t-rigurous-triple-sinergy` (Scenarios 10 & 11) |
| **3** | **`revalidatePath(path)`** | Full Route Hierarchy at `path` (Active Layout Chain + Page) | - **Regenerates**: Both the active layout chain (`revalidateLayout`) and the page segment (`revalidatePage`) at `path`.<br>- **Preserves**: Client-side `useState` and `mountId` across both layout and page Client Components when paired with `router.refresh({ layout: true })`. | `/t-rigurous-hs-ppr` (Scenario 8) |
| **4** | **`revalidateTag(tag)` — Layout Tag** | Routes whose `layout_functions.ts` `getCacheTags()` returned `tag` | - **Regenerates**: Calls `revalidateLayout(routePath)` for each matching `layout.metadata.json`.<br>- **Preserves**: All child `page.rsc` / `shell.page.json` payloads and all `<DinouCacheSlot>` entries not carrying `tag`; child `index.html` / `shell.html` files lazily re-compose on next visit. | `/t-rigurous-hs` (Scenario 12), `/t-rigurous-hs-ppr` (Scenarios 4 & 6), & `/t-rigurous-triple-sinergy` (Scenario 10) |
| **5** | **`revalidateTag(tag)` — Page Tag** | Routes whose `page_functions.ts` `getCacheTags()` returned `tag` | - **Regenerates**: Calls `revalidatePage(routePath)` for each matching `metadata.json`.<br>- **Preserves**: All ancestor `layout.rsc` / `shell.layout.json` payloads and all `<DinouCacheSlot>` entries not carrying `tag`. | `/t-rigurous-hs-ppr` (Scenario 3) & `/t-rigurous-triple-sinergy` (Scenario 8) |
| **6** | **`revalidateTag(tag)` — `<DinouCacheSlot>` Tag (Static Page or Layout Slot)** | Any `<DinouCacheSlot tags={[tag]}>` in a Layout (`_layoutSlotTags`) or Static Page (`_pageSlotTags`) | 1. Evicts matching `slots/<id>` storage entries and records `markTagInvalidated(tag)`.<br>2. For matching `layout.metadata.json` `slotTags`: runs `revalidateLayout(path, { onlyRefreshSlots: true })`, refreshing the slot inside `shell.layout.json` / `layout.rsc` **without re-executing `layout.tsx` or `layout_functions.ts`**.<br>3. For matching `metadata.json` `slotTags`: runs `revalidatePage(path, { onlyRefreshSlots: true })`, refreshing the slot inside `shell.page.json` / `page.rsc` / `index.html` **without re-executing `page.tsx` or `page_functions.ts`**.<br>4. Supports cross-axis shared tags (simultaneously updating a layout slot and a page slot in a single call) and nested slots (`Outer` vs. `Inner` via `refreshNestedSlotsInTree`). | `/t-rigurous-hs-cache-slot` (Scenarios 2, 3, 4, & 5) & `/t-rigurous-triple-sinergy` (Scenario 9) |
| **7** | **`revalidateTag(tag)` — `<DinouCacheSlot>` Tag in a PPR Route (`inStaticShell` vs. Dynamic Hole)** | `<DinouCacheSlot tags={[tag]}>` in PPR Static Shell (`inStaticShell: true`) vs. inside a `<Suspense>` Hole (`inStaticShell: false`) | - **If `inStaticShell: true` (Static Shell Slot)**: Evicts `slots/<id>` and runs `revalidatePage(path, { onlyRefreshSlots: true })`, updating `shell.page.json`, `shell.rsc`, and `shell.html` in place without re-executing `page.tsx` or `layout.tsx`.<br>- **If `inStaticShell: false` (Dynamic Hole Slot)**: Evicts **only** `slots/<id>` and skips `revalidatePage`, preserving `shell.html` untouched (`0ms TTFB`) so the slot regenerates on the next streamed hole execution. | `/t-rigorous-sinergy` (Block 3.2) & `/t-rigurous-triple-sinergy` (Scenarios 5, 6, & 7) |
| **8** | **`refreshSlot(idOrTag, { fresh })` (Client Live Refresh)** | Mounted or Unmounted `<DinouCacheSlotBoundary>` by `id`, `tag`, or `"*"` | - Fetches `/____rsc_slot____/:id` and reconciles the subtree in place via `React.startTransition` without unmounting or losing `useState` in surrounding or inner Client Components.<br>- Persists refreshed trees in `slotOverrideCache` across round-trip soft navigations (`Page A -> Page B -> Page A` via `pageCache` with `0` network requests).<br>- Refreshes unmounted slots on sibling routes in the background via `knownClientSlots` (`options.currentPath`).<br>- Enforces deterministic **Last-Write-Wins (LWW)** race protection on both client (`latestReqId` / `pendingPromise` tracking in `dinou/core/slot.js`) and server (`options.fresh ? stampedeKey : storageKey` in `inflightSlotRenders` + `slotRenderGenerations` in `dinou/core/cache-slot.js`) when slow and fast `refreshSlot()` requests resolve out of order. | `/t-rigurous-hs-cache-slot` (Scenarios 2, 3, 4, 5, 7, 8, 9, & 12) & `/t-rigurous-triple-sinergy` (Scenario 4) |

---

## 3. Summary of Architectural Guarantees Across All Runtimes

1. **Zero Unnecessary Re-Execution**: Expiring or invalidating a child page never re-executes its ancestor layouts; expiring or invalidating a layout never re-executes its child pages; expiring or invalidating a `<DinouCacheSlot>` (`{ onlyRefreshSlots: true }`) never re-executes its host `layout.tsx` or `page.tsx`.
2. **Zero Hydration Mismatch on Hard Reload (`F5`)**: Lazy `index.html` and `shell.html` re-composition ensures that full-document SSR HTML, `layout.rsc`, and `page.rsc` / `shell.rsc` are always aligned prior to browser hydration.
3. **Deterministic Concurrency (No Race Conditions)**: Concurrent host re-compositions are serialized through `enqueueRevalidation` with monotonic timestamps (`nextMonotonicGenTime`), and out-of-order concurrent `refreshSlot()` calls are guarded by client-side `pendingPromise` verification and server-side `slotRenderGenerations`.
4. **Full Cross-Runtime Parity**: Verified across **Node.js** (`FileSystemStorage`), **Bun** (`FileSystemStorage`), **Deno** (`DenoKVStorage` with atomic chunking and build-time KV seeding), and **Cloudflare Workers** (`CloudflareKVStorage` / `MemoryStorage` + `env.ASSETS` fallback).


---

## 4. Minimal Reproduction Recipes & Code Snippets (Benchmarking Guide for Dinou v9.0.3)

This section provides the **minimal, self-contained code recipes** needed in a Dinou v9.0.3 application to reproduce and benchmark every Clock-Based TTL Expiration scenario (Table 1: `1.1–1.10`) and every On-Demand Revalidation scenario (Table 2: `2.1–2.8`).

---

### 4.0. Shared Deterministic State Helper (`src/bench-state.ts`)

Use a lightweight in-memory counter store so each benchmark scenario can independently mutate layout, page, and slot counters and assert which segment re-executed vs. remained cached:

```ts
// src/bench-state.ts
const KEY = Symbol.for("dinou.bench.state");
export const state: Record<string, number> = ((globalThis as any)[KEY] ??= {
  layoutSeq: 1,
  pageSeq: 1,
  slotSeq: 1,
  innerSlotSeq: 1,
  delayMs: 0,
});
```

---

### 4.1. Reproducing Clock-Based TTL Expiration Scenarios (Table 1)

#### Scenario 1.1 — Layout Clock TTL (`revalidate = 1s`) + Static Child Page (`revalidate = 3600s`)
```ts
// src/bench-ttl-layout/layout_functions.ts
export function revalidate() {
  return 1; // Layout expires after 1 second
}
```
```tsx
// src/bench-ttl-layout/layout.tsx
import { DinouPageSlot } from "dinou";
import { state } from "../bench-state";

export default async function Layout() {
  return (
    <div>
      <span id="layout-seq">{state.layoutSeq}</span>
      <DinouPageSlot />
    </div>
  );
}
```
```ts
// src/bench-ttl-layout/page_functions.ts
export function revalidate() {
  return 3600; // Child page stays cached for 1 hour
}
```
```tsx
// src/bench-ttl-layout/page.tsx
import { state } from "../bench-state";

export default async function Page() {
  return <span id="page-seq">{state.pageSeq}</span>;
}
```
- **How to reproduce**:
  1. `GET /bench-ttl-layout` → `#layout-seq = 1`, `#page-seq = 1`.
  2. Mutate `state.layoutSeq = 2` and `state.pageSeq = 999` (without calling any `revalidate*` API).
  3. Wait `1.2s` and `GET /bench-ttl-layout` (or fetch `/____rsc_layout____/bench-ttl-layout`).
  4. **Expected**: `#layout-seq` updates to `2` (and `index.html` lazily re-composes), while `#page-seq` remains `1` (never `999`).

---

#### Scenario 1.2 — Layout Clock TTL (`revalidate = 1s`) + PPR Child Page (`ppr = true`, `revalidate = 3600s`)
```ts
// src/bench-ttl-layout-ppr/layout_functions.ts
export const ppr = true;
export function revalidate() {
  return 1; // PPR Layout shell expires after 1 second
}
```
```ts
// src/bench-ttl-layout-ppr/page_functions.ts
export const ppr = true;
export function revalidate() {
  return 3600; // PPR Child page shell stays cached for 1 hour
}
```
```tsx
// src/bench-ttl-layout-ppr/page.tsx
import { Suspense } from "react";
import { getContext } from "dinou";
import { state } from "../bench-state";

async function DynamicHole() {
  const ctx = getContext();
  return <span id="hole-query">{String(ctx?.req?.query?.q ?? "none")}</span>;
}

export default async function Page() {
  return (
    <div>
      <span id="ppr-page-shell-seq">{state.pageSeq}</span>
      <Suspense fallback={<span>Loading...</span>}>
        <DynamicHole />
      </Suspense>
    </div>
  );
}
```
- **How to reproduce**: Mutate `state.layoutSeq = 2` and `state.pageSeq = 999`, wait `1.2s`, and `GET /bench-ttl-layout-ppr?q=live`. `#layout-seq` updates to `2` in `shell.html`, `#ppr-page-shell-seq` stays frozen at `1`, and `#hole-query` streams `"live"`.

---

#### Scenario 1.3 — Dynamic Layout (`revalidate = 0`) + Cached Child Page (`revalidate = 3600s`)
```ts
// src/bench-dyn-layout/layout_functions.ts
export function revalidate() {
  return 0; // Always dynamic on every GET and /____rsc_layout____
}
```
```ts
// src/bench-dyn-layout/page_functions.ts
export function revalidate() {
  return 3600; // Child page remains statically cached
}
```
- **How to reproduce**: Increment `state.layoutSeq = 2` and `state.pageSeq = 999`. Every `GET /bench-dyn-layout` or `router.refresh({ layout: true })` renders `#layout-seq = 2` while reusing cached `#page-seq = 1`.

---

#### Scenario 1.4 — Static Page Clock TTL (`revalidate = 1s`) + Long-Lived Parent Layout (`revalidate = 3600s`)
```ts
// src/bench-ttl-page/layout_functions.ts
export function revalidate() {
  return 3600; // Parent layout cached for 1 hour
}
```
```ts
// src/bench-ttl-page/page_functions.ts
export function revalidate() {
  return 1; // Child page expires after 1 second
}
```
- **How to reproduce**:
  1. `GET /bench-ttl-page` → `#layout-seq = 1`, `#page-seq = 1`.
  2. Mutate `state.pageSeq = 2` and `state.layoutSeq = 999`.
  3. Wait `1.2s`, trigger `GET /bench-ttl-page` (background ISR delegates to `revalidatePage`), then `GET /bench-ttl-page` again.
  4. **Expected**: `#page-seq` updates to `2` while `#layout-seq` remains `1` (parent `layout.tsx` is not re-executed).

---

#### Scenario 1.5 — PPR Page Clock TTL (`revalidate = 1s`) + Long-Lived Parent Layout (`revalidate = 3600s`)
```ts
// src/bench-ttl-ppr-page/layout_functions.ts
export const ppr = true;
export function revalidate() {
  return 3600;
}
```
```ts
// src/bench-ttl-ppr-page/page_functions.ts
export const ppr = true;
export function revalidate() {
  return 1; // PPR Page static shell expires after 1 second
}
```
- **How to reproduce**: Mutate `state.pageSeq = 2` and `state.layoutSeq = 999`, wait `1.2s`, trigger `GET /bench-ttl-ppr-page` (`regeneratePprShell(..., { skipLayoutPersistence: true })`), and fetch again: `#ppr-page-shell-seq` updates to `2` in `shell.html` while `#layout-seq` stays `1` and `<Suspense>` holes continue streaming per request.

---

#### Scenario 1.6 — Dynamic Page (`revalidate = 0`) + Long-Lived Parent Layout (`revalidate = 3600s`)
```ts
// src/bench-dyn-page/layout_functions.ts
export function revalidate() {
  return 3600;
}
```
```ts
// src/bench-dyn-page/page_functions.ts
export function revalidate() {
  return 0; // Page evaluates per request; parent layout stays cached
}
```

---

#### Scenarios 1.7, 1.8, 1.9 & 1.10 — `<DinouCacheSlot>` Clock TTL (`revalidate={1}`) & Cache Bypass (`revalidate={0}`) Across Layout, Static Page & PPR (Shell vs. Dynamic Hole)
```tsx
// Inside layout.tsx, static page.tsx, or PPR page.tsx
import { Suspense } from "react";
import { DinouCacheSlot, getContext } from "dinou";
import { state } from "../bench-state";

export default async function Page() {
  return (
    <div>
      <span id="host-page-seq">{state.pageSeq}</span>

      {/* Scenario 1.7 / 1.8 / 1.9a: 1-second Clock-TTL Slot in Static Page, Layout, or PPR Shell */}
      <DinouCacheSlot id="bench-ttl-slot" revalidate={1}>
        <span id="ttl-slot-seq">{state.slotSeq}</span>
      </DinouCacheSlot>

      {/* Scenario 1.10: Dynamic Bypass Slot (0 = never cached on disk/KV) */}
      <DinouCacheSlot id="bench-nocache-slot" revalidate={0}>
        <span id="nocache-slot-seq">{state.slotSeq}</span>
      </DinouCacheSlot>

      {/* Scenario 1.9b (PPR routes only): 1-second Clock-TTL Slot inside a Dynamic <Suspense> Hole */}
      <Suspense fallback={<span>Loading hole...</span>}>
        <DynamicHoleWithSlot />
      </Suspense>
    </div>
  );
}

async function DynamicHoleWithSlot() {
  const ctx = getContext();
  void ctx?.req?.cookies?.session; // Marks enclosing <Suspense> as a dynamic PPR hole
  return (
    <DinouCacheSlot id="bench-hole-ttl-slot" revalidate={1}>
      <span id="hole-ttl-slot-seq">{state.slotSeq}</span>
    </DinouCacheSlot>
  );
}
```
- **How to reproduce**:
  - Mutate `state.slotSeq = 2` and `state.pageSeq = 999` (without calling `revalidateTag`).
  - Immediately (`< 1s`): `#nocache-slot-seq` is already `2` on refresh, while `#ttl-slot-seq` and `#hole-ttl-slot-seq` remain `1`.
  - After waiting `1.2s`: calling `refreshSlot("bench-ttl-slot")` (without `{ fresh: true }`) or `GET`ting the route updates `#ttl-slot-seq` and `#hole-ttl-slot-seq` to `2` and surgically re-composes `index.html` / `shell.html` (`{ onlyRefreshSlots: true }`) while `#host-page-seq` stays `1` (never `999`).

---

### 4.2. Reproducing On-Demand Surgical Revalidation Scenarios (Table 2)

#### Shared Metadata Tags Setup (`layout_functions.ts` & `page_functions.ts`)
```ts
// src/bench-ondemand/layout_functions.ts
export function revalidate() {
  return 3600;
}
export function getCacheTags() {
  return ["bench-layout-tag"];
}
```
```ts
// src/bench-ondemand/page_functions.ts
export function revalidate() {
  return 3600;
}
export function getCacheTags() {
  return ["bench-page-tag"];
}
```

#### Shared Server Actions for All On-Demand Scenarios (`src/bench-actions.ts`)
```ts
"use server";
import {
  revalidatePage,
  revalidateLayout,
  revalidatePath,
  revalidateTag,
} from "dinou";

// Scenario 2.1: Surgical Page-Only Revalidation
export async function triggerRevalidatePage() {
  await revalidatePage("/bench-ondemand");
}

// Scenario 2.2: Surgical Layout-Only Revalidation (+ Lazy Child HTML Re-Composition)
export async function triggerRevalidateLayout() {
  await revalidateLayout("/bench-ondemand");
}

// Scenario 2.3: Full-Hierarchy Path Revalidation (Layout + Page)
export async function triggerRevalidatePath() {
  await revalidatePath("/bench-ondemand");
}

// Scenarios 2.4, 2.5, 2.6 & 2.7: Tag-Based Surgical Revalidation
// - tag = "bench-layout-tag"      -> Scenario 2.4 (Layout Tag)
// - tag = "bench-page-tag"        -> Scenario 2.5 (Page Tag)
// - tag = "bench-slot-tag"        -> Scenario 2.6 / 2.7a (Static/Layout/PPR-Shell Slot Tag: { onlyRefreshSlots: true })
// - tag = "bench-hole-slot-tag"   -> Scenario 2.7b (PPR Dynamic-Hole Slot Tag: evicts slots/<id> only, 0ms TTFB kept)
// - tag = "bench-shared-tag"      -> Cross-Axis Tag (updates Layout Slot + Page Slot simultaneously)
// - tag = "bench-inner-slot-tag"  -> Nested Inner Slot Tag (updates Inner Slot while keeping Outer Slot cached)
export async function triggerRevalidateTag(tag: string) {
  await revalidateTag(tag);
}
```

#### Layout & Page Hosting Tagged, Cross-Axis, and Nested `<DinouCacheSlot>` Boundaries
```tsx
// src/bench-ondemand/layout.tsx
import { DinouPageSlot, DinouCacheSlot } from "dinou";
import { state } from "../bench-state";

export default async function Layout() {
  return (
    <div>
      <span id="layout-host-seq">{state.layoutSeq}</span>
      <DinouCacheSlot id="layout-shared-slot" tags={["bench-shared-tag"]}>
        <span id="layout-slot-seq">{state.slotSeq}</span>
      </DinouCacheSlot>
      <DinouPageSlot />
    </div>
  );
}
```
```tsx
// src/bench-ondemand/page.tsx
import { DinouCacheSlot } from "dinou";
import { state } from "../bench-state";

export default async function Page() {
  return (
    <div>
      <span id="page-host-seq">{state.pageSeq}</span>

      {/* Standalone Page Slot + Cross-Axis Shared Tag */}
      <DinouCacheSlot
        id="page-slot"
        tags={["bench-slot-tag", "bench-shared-tag"]}
      >
        {async () => {
          const captured = state.slotSeq;
          if (state.delayMs > 0) {
            await new Promise((r) => setTimeout(r, state.delayMs));
          }
          return <span id="page-slot-seq">{captured}</span>;
        }}
      </DinouCacheSlot>

      {/* Nested Slots: Outer -> Inner */}
      <DinouCacheSlot id="outer-slot" tags={["bench-outer-slot-tag"]}>
        <div>
          <span id="outer-slot-seq">{state.slotSeq}</span>
          <DinouCacheSlot id="inner-slot" tags={["bench-inner-slot-tag"]}>
            <span id="inner-slot-seq">{state.innerSlotSeq}</span>
          </DinouCacheSlot>
        </div>
      </DinouCacheSlot>
    </div>
  );
}
```

#### Scenario 2.8 — Client Live `refreshSlot` (In-Place Update, Round-Trip `pageCache` Persistence, Unmounted Sibling Refresh & Out-of-Order LWW Race Protection)
```tsx
// src/bench-ondemand/bench-client.tsx
"use client";
import { useRouter, refreshSlot } from "dinou";

export function BenchClientControls() {
  const router = useRouter();

  return (
    <div>
      {/* 1. Refresh only page.rsc vs. layout.rsc + page.rsc */}
      <button onClick={() => router.refresh()}>Refresh Page Segment</button>
      <button onClick={() => router.refresh({ layout: true })}>
        Refresh Layout + Page
      </button>

      {/* 2. Live refreshSlot by ID or Tag (preserves client useState & survives Page A -> B -> A soft nav) */}
      <button onClick={() => refreshSlot("page-slot", { fresh: true })}>
        Force Refresh Slot by ID
      </button>
      <button onClick={() => refreshSlot("bench-shared-tag")}>
        Refresh Layout + Page Slots by Shared Tag
      </button>

      {/* 3. Out-of-Order Concurrent refreshSlot() Race Benchmark (Last-Write-Wins)
          - Request #1: state.slotSeq = 401, state.delayMs = 350 -> refreshSlot("page-slot", { fresh: true })
          - Request #2 (40ms later): state.slotSeq = 402, state.delayMs = 0 -> refreshSlot("page-slot", { fresh: true })
          - Expected after 450ms: #page-slot-seq === "402" (both when mounted on /bench-ondemand and when unmounted on /bench-ondemand/sibling)
      */}
    </div>
  );
}
```
