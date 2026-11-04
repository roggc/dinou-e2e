# Partial Prerendering (PPR) Evolution in Dinou — Mental Model, `noDynamic()` API & Internal Architecture

This document records the architectural evolution of **Partial Prerendering (PPR)** in Dinou, detailing the updated `<Suspense>` mental model, the new `noDynamic()` opt-out primitive, the behavior of `<DinouCacheSlot>` (`revalidate >= 1` vs. `revalidate={0}`), and the internal engine changes implemented across `./dinou`.

---

## 1. Motivation: Why the PPR Mental Model Evolved

### 1.1. Previous Behavior (Request-Context Bailout Only)
Previously, when a route enabled Partial Prerendering (`export const ppr = true`), Dinou only turned a `<Suspense>` boundary into a **Dynamic PPR Hole (`ppr-hole-N`)** if a Server Component inside that `<Suspense>` boundary accessed request-specific properties on `getContext().req` (`req.cookies`, `req.headers`, or `req.query`) via Dinou's Bailout Proxy.

This created two significant developer-experience gaps:
1. **`async` Server Components Fetching Live Data Without Reading `req`**:
   If a developer wrote an `async` Server Component inside `<Suspense>` that performed `await fetch("https://api.example.com/stock")` or `await db.inventory.getLiveCount()`—without reading `req.cookies`, `req.headers`, or `req.query`—Dinou resolved that promise at build time and baked the result into `shell.html` instead of streaming it per request as a Dynamic Hole.
2. **Uncached `<DinouCacheSlot revalidate={0}>` Inside `<Suspense>`**:
   If a developer placed `<DinouCacheSlot id="live-ticker" revalidate={0}>` inside `<Suspense>` on a PPR page without reading `req.cookies`/`headers`/`query`, `revalidate={0}` bypassed the slot file cache (`slot.json`), but did not trigger a PPR postpone on the enclosing `<Suspense>` boundary during the static shell build, causing its initial output to be baked into `shell.html`.

### 1.2. The New PPR Mental Model
When `ppr = true` is active on a route, `<Suspense>` now acts as a true **temporal boundary** by default:

1. **Outside `<Suspense>` → Static Shell (`shell.html`)**:
   Synchronous and `async` Server Components outside `<Suspense>` execute at build time (or during background ISR shell revalidation) and are baked into the immutable Static Shell (`0ms TTFB`). *(If a component outside `<Suspense>` reads `req.cookies`, `req.headers`, or `req.query`, the route performs a full-route bailout to dynamic SSR as before).*
2. **`<Suspense>` Wrapping an `async` Server Component → Dynamic PPR Hole by Default (Zero Exceptions)**:
   Any `async` Server Component (returning a `Promise` / thenable) rendered inside `<Suspense>` on a `ppr = true` route automatically postpones at build time, bakes the `<Suspense fallback={...}>` into `shell.html` (`<div data-ppr-hole="ppr-hole-N">`), and streams dynamically at runtime—unless opted out via `noDynamic()` before the first `await`.
3. **`<DinouCacheSlot>` in `ppr = true` → Controlled by `<Suspense>`, `revalidate`, and `noDynamic()`**:
   - **Outside `<Suspense>` (`revalidate >= 1` or omitted)**: Resolved at build time into the **Static Shell (`shell.html`)** and persisted to `slots/<id>/slot.json` (`inStaticShell: true`).
   - **Inside `<Suspense>` (`revalidate >= 1` or omitted, `async` child by default)**: Creates a **Cached Dynamic PPR Hole**. `shell.html` bakes the `<Suspense fallback={...}>` (`0ms TTFB` forever, even when the slot TTL expires or after `revalidateTag()`), while at runtime the hole streams from `slots/<id>/slot.json` in ~1ms for $N$ seconds and only re-executes the `async` child inside the hole stream when the TTL expires.
   - **Inside `<Suspense>` (`revalidate >= 1` or omitted, with `noDynamic()` before first `await` or synchronous child)**: Opts out of the Dynamic Hole and bakes the resolved slot into the **Static Shell (`shell.html`)**.
   - **Uncached Slot (`revalidate={0}`)**: Inside `<Suspense>`, automatically triggers a PPR postpone (`slot-revalidate-0`) to become an **Uncached Dynamic PPR Hole** (streams fresh on every request). Outside `<Suspense>`, triggers a **Full-Page Dynamic Bailout**.
4. **`noDynamic()` Opt-Out → Static `<Suspense>` in the Static Shell**:
   When a developer intentionally uses `<Suspense>` around an `async` Server Component (or inside a `<DinouCacheSlot>` wrapped in `<Suspense>`) whose promise should resolve at build time and remain baked into `shell.html`, calling `noDynamic()` synchronously before the component's first `await` opts that `<Suspense>` boundary out of becoming a Dynamic Hole.

---

## 2. Decision Matrix (`ppr = true`)

| Pattern (when `ppr = true`) | Build-Time Result (`shell.html`) | Request-Time Behavior (`handlePprResume`) |
| :--- | :--- | :--- |
| **`<Suspense>` + `async` Server Component** (`await fetch(...)`, `await db.query(...)`, etc.) | **Dynamic Hole (`ppr-hole-N`)**: `fallback` baked into `shell.html`; hole registered in `metadata.holes` | Executed on every request and streamed via `<template id="ppr-content-ppr-hole-N">` + inline DOM swap `<script>` |
| **`<Suspense>` + Server Component reading `req.cookies`, `req.headers`, or `req.query`** | **Dynamic Hole (`ppr-hole-N`)**: `fallback` baked into `shell.html`; hole registered in `metadata.holes` | Executed on every request with live request context and streamed in parallel |
| **`<Suspense>` + `<DinouCacheSlot revalidate={0}>`** | **Dynamic Hole (`ppr-hole-N`)**: `fallback` baked into `shell.html`; hole registered in `metadata.holes` | Executed on every request (bypassing `slot.json`) and streamed in parallel; supports client `refreshSlot()` |
| **`<Suspense>` + `<DinouCacheSlot revalidate={N}>` (`N >= 1` or omitted) with `async` child** | **Cached Dynamic Hole (`ppr-hole-N`)**: `fallback` baked into `shell.html`; hole registered in `metadata.holes` | `shell.html` arrives at `0ms TTFB`; hole executes once on first request, caches `slots/<id>/slot.json` for $N$s, and streams from cache in ~1ms on subsequent requests |
| **`<DinouCacheSlot revalidate={N}>` (`N >= 1` or omitted) OUTSIDE `<Suspense>`** (or **inside `<Suspense>` + `noDynamic()`**) | **Static Shell**: `async` children resolve at build time into `shell.html` and `slots/<id>/slot.json` (`inStaticShell: true`) | Served immediately in `shellPrelude` (`0ms TTFB`, `0` runtime executions while valid); refreshes when TTL expires, via `revalidateTag()`, or `refreshSlot()` |
| **`<Suspense>` + `async` Server Component calling `noDynamic()`** (no `req` reads) | **Static Shell**: Promise resolves at build time and output is baked into `shell.html` (excluded from `metadata.holes`) | Served immediately in `shellPrelude` (`0ms TTFB`); **not** re-executed or re-streamed at request time |
| **Outer `<Suspense>` with `noDynamic()` wrapping an inner `<Suspense>`** | Outer boundary resolves into `shell.html`; inner `<Suspense>` becomes **Dynamic Hole (`ppr-hole-N`)** | Outer wrapper arrives at `0ms TTFB`; inner hole streams dynamically per request |

---

## 3. Developer Usage Examples

### 3.1. Default Dynamic Hole (`<Suspense>` + `async` Server Component)
No `getContext().req` access is required to create a dynamic hole. Any `async` Server Component wrapped in `<Suspense>` on a PPR route streams at request time by default:

```tsx
// src/products/[slug]/page_functions.ts
export const ppr = true;
```

```tsx
// src/products/[slug]/page.tsx
import { Suspense } from "react";

async function LiveStockBadge({ slug }: { slug: string }) {
  // Automatically becomes a Dynamic PPR Hole because it is an async
  // Server Component inside <Suspense> on a ppr = true route:
  const res = await fetch(`https://api.example.com/stock/${slug}`);
  const { stock } = await res.json();
  return <span className="badge">{stock} units available</span>;
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  return (
    <main>
      <h1>Product: {params.slug}</h1>
      <Suspense fallback={<span>Checking live stock...</span>}>
        <LiveStockBadge slug={params.slug} />
      </Suspense>
    </main>
  );
}
```

### 3.2. Opting Out into a Static `<Suspense>` Boundary with `noDynamic()`
Import `noDynamic` from `"dinou"` (or `"dinou/server"`) and call it **synchronously at the top of the `async` Server Component (before its first `await`)**:

```tsx
import { Suspense } from "react";
import { noDynamic } from "dinou";

async function BuildTimeDocsSidebar() {
  noDynamic(); // 👈 Opts this <Suspense> boundary into the Static Shell
  const tree = await loadDocsNavigationFromDisk();
  return <nav>{tree.map((item) => <a key={item.href} href={item.href}>{item.title}</a>)}</nav>;
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <Suspense fallback={<div className="sidebar-skeleton" />}>
        <BuildTimeDocsSidebar />
      </Suspense>
      <main>{children}</main>
    </div>
  );
}
```

#### Scoping Rules for `noDynamic()`
1. **Must be called before the first `await`**:
   Because Dinou short-circuits default `async` Server Components inside `<Suspense>` as soon as they return a `Promise` at their first `await`, `noDynamic()` must be called synchronously before the first `await` statement.
2. **Covers helper `async` sub-components within the same `<Suspense>` boundary**:
   Calling `noDynamic()` marks the enclosing `<Suspense>` boundary's store (`store.noDynamic = true`). Any child `async` Server Components rendered inside that **same** `<Suspense>` boundary also resolve statically at build time without needing to call `noDynamic()` again.
3. **Resets automatically on nested `<Suspense>` boundaries**:
   If a component that called `noDynamic()` renders a **nested** `<Suspense>` boundary inside its returned JSX, the nested `<Suspense>` boundary receives a fresh store with `noDynamic: false` and therefore becomes a Dynamic PPR Hole by default.
4. **Never overrides request-specific dynamic bailouts**:
   If a component (or child) inside a `<Suspense>` boundary with `noDynamic()` reads `req.cookies`, `req.headers`, or `req.query`, Dinou's Bailout Proxy still postpones that `<Suspense>` boundary into a Dynamic Hole so request data can never poison `shell.html`.

### 3.3. `<DinouCacheSlot>` with `ppr = true` (Static Shell vs. Cached Dynamic Hole vs. Uncached Hole)

```tsx
import { Suspense } from "react";
import { noDynamic } from "dinou";
import { DinouCacheSlot } from "dinou/server";

export default function DashboardPage() {
  return (
    <main>
      {/* 1. Static Shell Slot (outside <Suspense>, revalidate >= 1):
          Resolved at build time into shell.html and cached in slots/global-kpis/slot.json.
          Refreshes every 300s (or via revalidateTag("kpis") / refreshSlot("global-kpis")). */}
      <DinouCacheSlot id="global-kpis" tag="kpis" revalidate={300}>
        <AsyncKpiSummary />
      </DinouCacheSlot>

      {/* 2. Cached Dynamic Hole (inside <Suspense>, revalidate >= 1, async child):
          Postponed at build time so shell.html sends <GraphSkeleton /> immediately (0ms TTFB).
          In runtime, the hole streams from slots/telemetry/slot.json in ~1ms for 60s
          (executing the DB query only once every 60s without ever blocking shell TTFB). */}
      <Suspense fallback={<GraphSkeleton />}>
        <DinouCacheSlot id="telemetry" tag="telemetry" revalidate={60}>
          <AsyncHeavyTelemetryGraph />
        </DinouCacheSlot>
      </Suspense>

      {/* 3. Static Shell Slot inside <Suspense> via noDynamic():
          When <Suspense> is kept in the JSX tree but the slot should resolve into shell.html,
          call noDynamic() before the first await inside the child component. */}
      <Suspense fallback={<div>Loading static slot...</div>}>
        <DinouCacheSlot id="static-suspense-slot" revalidate={300}>
          <AsyncChildCallingNoDynamic />
        </DinouCacheSlot>
      </Suspense>

      {/* 4. Uncached Dynamic Hole (inside <Suspense>, revalidate={0}):
          Postponed at build time into a Dynamic PPR Hole.
          Streams fresh on every HTTP request and can also be re-fetched live via refreshSlot("live-feed"). */}
      <Suspense fallback={<div>Streaming live feed...</div>}>
        <DinouCacheSlot id="live-feed" revalidate={0}>
          <AsyncLiveFeed />
        </DinouCacheSlot>
      </Suspense>
    </main>
  );
}
```

---

## 4. Internal Architecture & Code Changes in `./dinou`

### 4.1. Browser-Safe & Server-Safe `noDynamic()` Hook (`dinou/core/no-dynamic.js`)
- **File Created**: [`dinou/core/no-dynamic.js`](./dinou/core/no-dynamic.js)
- **Exported From**:
  - [`dinou/index.js`](./dinou/index.js) & [`dinou/index.d.ts`](./dinou/index.d.ts) (`import { noDynamic } from "dinou"`)
  - [`dinou/server.js`](./dinou/server.js) & [`dinou/server.d.ts`](./dinou/server.d.ts) (`import { noDynamic } from "dinou/server"`)
- **Design**:
  Because `dinou/index.js` is also imported by Client Components (`"use client"`) for `Link`, `useRouter`, etc., `dinou/core/no-dynamic.js` contains **zero `node:*` imports** (`node:async_hooks` is never pulled into client bundles across Esbuild, Rollup, or Webpack). On the server, it invokes `globalThis[Symbol.for("dinou.ppr.noDynamic.hook")]` registered by `dinou/core/ppr-context.js`.

### 4.2. PPR Context State Tracking (`dinou/core/ppr-context.js`)
- **File Modified**: [`dinou/core/ppr-context.js`](./dinou/core/ppr-context.js)
- **Key Additions**:
  1. **`noDynamic()` & Per-Component / Per-`<Suspense>` Opt-Out Tracking**:
     - `noDynamic()` sets a synchronous per-invocation flag (`currentComponentNoDynamic = true`) and, if inside an active `<Suspense>` boundary (`store.suspenseDepth > 0`), sets `store.noDynamic = true` on that `<Suspense>` boundary's `childStore`.
     - When `runInSuspense` enters any `<Suspense>` boundary (including a nested `<Suspense>` inside an outer `noDynamic()` boundary), it initializes the new `childStore` with `noDynamic: false` and `settled: false`.
  2. **Slot Discovery Scope (`runInSlotDiscovery` / `isSlotDiscoveryActive`)**:
     - Unified `slotDiscoveryStorage` in `ppr-context.js` so cold-start `getSlotJSX` discovery passes can traverse into `async` Server Components inside `<Suspense>` to register nested `<DinouCacheSlot>`s without prematurely postponing at the outer `async` component.
  3. **Settled `<Suspense>` Guard (`store.settled`)**:
     - Once a `<Suspense>` boundary finishes or postpones during a PPR build, `suspenseStore.settled = true` prevents any background continuation of an already-postponed promise from pushing late side effects into `pendingEffects`.

### 4.3. Zero-Latency First-`await` Postponement (`dinou/core/render-jsx-to-client-jsx.js`)
- **File Modified**: [`dinou/core/render-jsx-to-client-jsx.js`](./dinou/core/render-jsx-to-client-jsx.js)
- **Mechanism (`invokeServerComponentInPpr`)**:
  ```js
  async function invokeServerComponentInPpr(fn, callFn) {
    resetComponentNoDynamicFlag();
    const rawResult = callFn();
    const optedOut = consumeComponentNoDynamicFlag();
    if (
      isThenable(rawResult) &&
      !isCacheSlotComponent(fn) &&
      isPprBuildActive() &&
      isInsideOuterSuspenseOutsideSlot() &&
      !isSlotDiscoveryActive() &&
      !optedOut &&
      !isNoDynamicActive()
    ) {
      try {
        rawResult.then(null, () => {});
      } catch (_) {}
      markDynamicAccess("async-suspense");
    }
    return await rawResult;
  }
  ```
- **Why Short-Circuiting at `callFn()` (Before `await rawResult`) Matters**:
  1. **Instant Build Performance**: When `callFn()` invokes an `async` Server Component, JavaScript runs its synchronous prologue up to its first `await` and immediately returns a `Promise` (`rawResult`). If `noDynamic()` was not called, Dinou throws `markDynamicAccess("async-suspense")` right away without waiting for slow network fetches or database queries during `npm run build`.
  2. **Background Rejection Safety**: Because `callFn()` already started the component up to its first `await`, if the component's promise later resolves a timer and accesses `req.cookies` in the background (or rejects because a runtime-only DB is unavailable at build time), `rawResult.then(null, () => {})` swallows the late rejection so Node.js / Bun / Deno never crashes with `UnhandledPromiseRejection`.
  3. **Full Unwrapping Coverage**: `invokeServerComponentInPpr` is applied across standard function Server Components, `React.forwardRef` Server Components, and `React.memo` Server Components.
  4. **Deterministic `<Suspense>` Counting on Non-PPR Routes**: When `isPprBuildActive()` is `false`, `<Suspense>` boundaries still execute inside `runInSuspense` so `getPprHoleCounter()` (`X-Dinou-Suspense-Count`) remains accurate for child PPR pages inheriting a non-PPR parent layout.

### 4.4. `<DinouCacheSlot>` Integration (`dinou/core/cache-slot.js` & `dinou/server.js`)
- **Files Modified**: [`dinou/core/cache-slot.js`](./dinou/core/cache-slot.js), [`dinou/server.js`](./dinou/server.js)
- **Key Changes**:
  1. Both `DinouCacheSlot` in `dinou/core/cache-slot.js` and the re-export wrapper in `dinou/server.js` are tagged with `DinouCacheSlot.$$dinouCacheSlot = true` so `invokeServerComponentInPpr` does not postpone at `DinouCacheSlot`'s own internal storage read, delegating postponement to the slot's configuration and children.
  2. **When `revalidate === 0` (or `< 1`, `isNoCache === true`)**:
     After registering the slot in `slotRegistry`, if `isPprBuildActive() && isInsideSuspense() && !isSlotDiscoveryActive()`, `DinouCacheSlot` calls `markDynamicAccess("slot-revalidate-0")`, turning the enclosing `<Suspense>` into an uncached Dynamic PPR Hole. If `isInsideSuspense()` is `false`, it calls `getContext()?._markDynamic?.()` to trigger a Full-Page Dynamic Bailout.
  3. **When `revalidate >= 1` or `undefined` (`isNoCache === false`)**:
     - **Outside `<Suspense>`** (or **inside `<Suspense>` with `noDynamic()` / synchronous child**): `DinouCacheSlot` resolves at build time, persists `slots/<id>/slot.json` (`inStaticShell: true`, `inStaticSuspense: Boolean(inPprSuspense)`), commits `slotTags` to the page/layout metadata, and bakes its HTML into `shell.html`.
     - **Inside `<Suspense>` with an `async` child (without `noDynamic()`)**: The child's first `await` triggers `markDynamicAccess("async-suspense")`, postponing the `<Suspense>` boundary into a **Cached Dynamic PPR Hole** (`fallback` in `shell.html`). At runtime, `streamDynamicHoles` evaluates `DinouCacheSlot`, which caches the resolved payload in `slots/<id>/slot.json` for `revalidate` seconds (`inStaticShell: false`) so subsequent visitors receive the streamed hole from cache in ~1ms without re-executing the child component.

### 4.5. Route/Layout `isPpr` Isolation (`dinou/core/handler.js` & `dinou/core/cache-revalidate.js`)
- **Files Modified**: [`dinou/core/handler.js`](./dinou/core/handler.js), [`dinou/core/cache-revalidate.js`](./dinou/core/cache-revalidate.js)
- **Key Changes**:
  - Updated SSG `____rsc_page____` / `____rsc_layout____` rendering in `handler.js` and `revalidateLayout` in `cache-revalidate.js` to pass `{ isPpr: Boolean(isRoutePpr) }` / `{ isPpr: isLayoutPpr }` into `runWithPprContext` instead of hardcoded `{ isPpr: true }`, ensuring `<Suspense>` boundaries on non-PPR routes (`ppr = false`) always resolve their `async` children into the static payload while still counting `<Suspense>` boundaries via `getPprHoleCounter()`.

### 4.6. Runtime Zero-Execution Optimization for Static `<Suspense>` Boundaries (`dinou/core/ppr-runtime.js`, `dinou/core/ppr-context.js`, `dinou/core/get-jsx.js`)
- **Files Modified**: [`dinou/core/ppr-runtime.js`](./dinou/core/ppr-runtime.js), [`dinou/core/ppr-context.js`](./dinou/core/ppr-context.js), [`dinou/core/get-jsx.js`](./dinou/core/get-jsx.js)
- **Key Changes**:
  1. **Zero-Hole Fast Path**: In `handlePprResume` and `streamDynamicHoles` (`dinou/core/ppr-runtime.js`), if `holes` is an empty array (`holes.length === 0`, e.g., a PPR route where all `<Suspense>` boundaries opted into the Static Shell via `noDynamic()`), Dinou flushes `shellPrelude` + `shellPostlude` immediately without invoking `getJSX` or traversing any components at runtime.
  2. **`runInRuntimeStaticSuspense` & `SKIP_STATIC_SUSPENSE_SYMBOL`**: When a PPR route has both Static `<Suspense>` boundaries and Dynamic `<Suspense>` Holes, `streamDynamicHoles` and `spliceDynamicHolesIntoShell` wrap the traversal of non-streamed (`!shouldStream`) `<Suspense>` boundaries inside `runInRuntimeStaticSuspense(...)`. When `noDynamic()` is called inside `runInRuntimeStaticSuspense(...)` at runtime (`!isPprBuildActive()`), it immediately throws `{ $$typeof: Symbol.for("dinou.ppr.skipStatic") }`, which `ppr-runtime.js` catches silently—preventing the `noDynamic()` component's async work from executing on runtime requests while still allowing synchronous wrappers with nested Dynamic `<Suspense>` holes to be traversed.
  3. **Early Stop Once All Dynamic Holes Are Found**: Both `streamDynamicHoles` (`holePromises.length >= knownHoleIds.size`) and `spliceDynamicHolesIntoShell` (`liveHolesMap.size >= knownHoleIds.size`) halt tree traversal immediately once all registered dynamic holes have been matched.
  4. **`skipLayoutProbe` in `handlePprResume`**: `handlePprResume` passes `{ skipLayoutProbe: true }` to `getJSX` so `dinou/core/get-jsx.js` does not perform a redundant pre-render probe of the layout tree when resuming dynamic holes.

---

## 5. Comprehensive Verification Matrix (`src/test-ppr`)

The folder [`src/test-ppr`](./src/test-ppr) exercises all combinations of the new PPR mental model end-to-end:

- **[`src/test-ppr/layout.tsx`](./src/test-ppr/layout.tsx) & [`src/test-ppr/layout_functions.ts`](./src/test-ppr/layout_functions.ts)** (`ppr = true`):
  - Layout Boundary 1 (`ppr-hole-1`): Static `<Suspense>` via `noDynamic()` &rarr; baked into `shell.html`, `0` runtime executions.
  - Layout Unwrapped Slot: `<DinouCacheSlot id="test-ppr-layout-slot" revalidate={3600}>` (outside `<Suspense>`) &rarr; baked into `shell.html` (`inStaticShell: true`), `0` runtime executions.
  - Layout Boundary 2 (`ppr-hole-2`): Default `async` `<Suspense>` (`LayoutLiveClock`) &rarr; registered in `layout.metadata.json` (`holes: ["ppr-hole-2"]`) and streamed on every request.
- **[`src/test-ppr/page.tsx`](./src/test-ppr/page.tsx) & [`src/test-ppr/page_functions.ts`](./src/test-ppr/page_functions.ts)** (`ppr = true`, 12 Cases):
  - **Case 1 (`1A` & `1B`)**: Top-level `async` Page (`1A`) and unwrapped child `async` Server Component (`1B`, `UnwrappedAsyncChildOutsideSuspense`) outside `<Suspense>` &rarr; both baked into `shell.html` without requiring `noDynamic()`.
  - **Case 2 (`ppr-hole-3`)**: Default `<Suspense>` + `async` Server Component (pure `await`, no cookies/headers/query) &rarr; Dynamic PPR Hole (`case2-fallback` in `shell.html`, `case2-resolved` streamed live on every request).
  - **Case 3 (`ppr-hole-4`)**: `<Suspense>` + `async` Server Component reading `req.cookies`, `req.headers`, and `req.query` &rarr; Dynamic PPR Hole.
  - **Case 4 (`ppr-hole-5`)**: `<Suspense>` + `async` Server Component calling `noDynamic()` from `"dinou"` &rarr; Static `<Suspense>` (`case4-resolved` baked into `shell.html`, `0` runtime executions).
  - **Case 5 (`ppr-hole-6`)**: `<Suspense>` + parent `async` Server Component calling `noDynamic()` from `"dinou/server"` + nested `async` child inheriting `noDynamic` from the `<Suspense>` store &rarr; both baked into `shell.html`, `0` runtime executions.
  - **Case 6 (`ppr-hole-7`)**: `<Suspense>` + `async` Server Component calling `noDynamic()` **and** reading `req.cookies.theme` &rarr; Dynamic bailout overrides `noDynamic()`, becoming a Dynamic PPR Hole (`ppr-hole-7`).
  - **Case 7 (`ppr-hole-8`)**: `<Suspense>` + `async` Server Component calling `noDynamic()` **after** its first `await` &rarr; intercepted at the first `await`, becoming a Dynamic PPR Hole (`ppr-hole-8`).
  - **Case 8 (`8A`, `8B`, `8C`)**: `<DinouCacheSlot revalidate={3600}>`:
    - **Case 8A (Outside `<Suspense>`)**: Baked into `shell.html` (`inStaticShell: true`), `0` runtime executions until `/____rsc_slot____/test-ppr-slot-unwrapped?fresh=1`.
    - **Case 8B (`ppr-hole-9`, Inside `<Suspense>` with `async` child)**: Postponed at build time into a **Cached Dynamic PPR Hole** (`case8-fallback` in `shell.html`); executes once on Runtime Request #1 (`inStaticShell: false`) and streams from `slots/test-ppr-slot-cached/slot.json` on Runtime Request #2 (`0` re-executions).
    - **Case 8C (`ppr-hole-10`, Inside `<Suspense>` + `noDynamic()`)**: Baked into `shell.html` (`inStaticShell: true`, `inStaticSuspense: true`), `0` runtime executions.
  - **Case 9 (`9A` & `9B`)**: `<DinouCacheSlot>` (omitted `revalidate`):
    - **Case 9A (Outside `<Suspense>`)**: Baked into `shell.html` forever (`0` runtime executions).
    - **Case 9B (`ppr-hole-11`, Inside `<Suspense>` with `async` child)**: Postponed at build time into a **Cached Dynamic PPR Hole** (`case9-fallback` in `shell.html`); executes once on Runtime Request #1 and streams from `slots/test-ppr-slot-forever/slot.json` forever on subsequent requests.
  - **Case 10 (`ppr-hole-12`)**: `<Suspense>` + `<DinouCacheSlot revalidate={0}>` &rarr; Uncached Dynamic PPR Hole (`ppr-hole-12`), re-evaluated on every request and never written to disk.
  - **Case 11 (`ppr-hole-13`)**: `<Suspense>` + `<DinouCacheSlot revalidate={3600}>` + `noDynamic()` reading `req.cookies.user` &rarr; Dynamic request access overrides `noDynamic()`, postponing at build time into Dynamic PPR Hole (`ppr-hole-13`), caching on first runtime request, and refreshing via `/____rsc_slot____/test-ppr-slot-cookies?fresh=1`.
  - **Case 12 (`ppr-hole-14` & `ppr-hole-15`)**: Nested `<Suspense>` where the outer Static `<Suspense>` (`ppr-hole-14`) is baked into `shell.html` while the inner Dynamic `<Suspense>` (`ppr-hole-15`) is postponed and streamed at runtime.
- **[`src/test-ppr/all-static/page.tsx`](./src/test-ppr/all-static/page.tsx)**: PPR route (`ppr = true`) with Static `<Suspense>` (`noDynamic()`), unwrapped `<DinouCacheSlot revalidate={3600}>`, and `<Suspense>` + `<DinouCacheSlot revalidate={3600}>` + `noDynamic()` (`holes: []`), verifying zero runtime Server Component executions.
- **[`src/test-ppr/opt-out-route/page.tsx`](./src/test-ppr/opt-out-route/page.tsx)**: Child route (`ppr = false`) inside the `ppr = true` layout, verifying that direct page `await`, unwrapped child `async` components, and `<Suspense>` + `async` child components on `ppr = false` routes all resolve statically into `index.html` without requiring `noDynamic()` and execute `0` times at runtime.
- **[`src/test-ppr/bailout-cookies/page.tsx`](./src/test-ppr/bailout-cookies/page.tsx)**: PPR route (`ppr = true`) that reads `getContext().req.cookies` **outside** `<Suspense>`, verifying a **Full-Page Dynamic Bailout** (no `shell.html`, `index.html`, or `metadata.json` written to `.dinou/dist2`; full-page SSR on every request).
- **[`src/test-ppr/bailout-slot-0/page.tsx`](./src/test-ppr/bailout-slot-0/page.tsx)**: PPR route (`ppr = true`) that renders `<DinouCacheSlot revalidate={0}>` **outside** `<Suspense>`, verifying a **Full-Page Dynamic Bailout** (no `shell.html`, `index.html`, or `metadata.json` written to `.dinou/dist2`; full-page SSR on every request).
- **[`src/test-ppr/no-ppr-bailout/page.tsx`](./src/test-ppr/no-ppr-bailout/page.tsx)**: Non-PPR route (`ppr = false`) where a child `async` component **inside `<Suspense>`** reads `getContext().req.cookies`, verifying that when `ppr = false`, `<Suspense>` does **not** isolate dynamic request access into a hole and instead triggers a **Full-Page Dynamic Bailout**.

---

## 6. Taxonomy of Full-Page Dynamic Bailouts (`ppr = true`)

While dynamic operations **wrapped in `<Suspense>`** isolate dynamism into a **Dynamic PPR Hole** (preserving the Static Shell `shell.html`), dynamic operations performed **outside `<Suspense>`** (or via route segment configuration) force the **entire page** to bail out of static shell generation (`isDynamic = true`), skipping `.dinou/dist2/<route>/shell.html` and rendering 100% dynamically on every request:

| # | Full-Page Dynamic Bailout Trigger (when `ppr = true`) | Mechanism |
|---|---|---|
| **1** | **Reading dynamic request data outside `<Suspense>`**: `getContext().req.cookies`, `getContext().req.headers`, `getContext().req.query`, or calling `useSearchParams()` in a Server Component outside `<Suspense>` | `createBailoutProxy` invokes `markAsDynamic()` at build time (`dinou/core/build-static-pages.js`) and `markDynamic()` at runtime (`dinou/core/handler.js`) because `isInsideSuspense()` is `false`. |
| **2** | **Rendering `<DinouCacheSlot revalidate={0}>` (or `< 1`) outside `<Suspense>`** (or a `<DinouCacheSlot>` outside `<Suspense>` whose children read `req.cookies`/`headers`/`query`) | `DinouCacheSlot` checks `isNoCache` (`revalidate < 1`). When `isInsideSuspense()` is `false`, it calls `getContext()?._markDynamic?.()`, aborting static shell persistence for the entire page. |
| **3** | **Mutating response state outside `<Suspense>`**: `getContext().res.cookie()`, `res.clearCookie()`, `res.setHeader()`, `res.status()`, `res.redirect()` / `redirect()` | `safeResCall` invokes `markDynamic()` in `dinou/core/handler.js`, preventing the response from being cached to disk. |
| **4** | **Explicit route/layout configuration**: `export const revalidate = 0` in `page_functions.ts` or `layout_functions.ts` | `isDynamicRoute(revalidate)` evaluates to `true`, skipping build-time pre-rendering and forcing per-request dynamic SSR. |

---

## 7. Theoretical Analysis: `await` in `Page` vs. Child Server Components (`ppr = false` vs. `ppr = true`)

To understand how Dinou evaluates `async` Server Components in every possible structure, two orthogonal questions govern the behavior:
1. **Is the `await` executed outside `<Suspense>` or inside `<Suspense>`?**
2. **Is the `await` pure (e.g., `fetch`, DB query, file read, timer) or does it access per-request dynamic state (`cookies`, `headers`, `query`, or `revalidate = 0`)?**

### 7.1. Scenario 1: Route Without PPR (`ppr = false`, Default)

#### 1A. `await` Directly in `Page` vs. `await` in a Child `<ChildAsync />` (Both Outside `<Suspense>`)
```tsx
// Option A: Direct await in Page
export default async function Page() {
  const data = await fetchData();
  return <div>{data}</div>;
}

// Option B: Page delegates await to <ChildAsync /> (without <Suspense>)
export default function Page() {
  return (
    <div>
      <h1>Title</h1>
      <ChildAsync /> {/* ChildAsync awaits fetchData() */}
    </div>
  );
}
```
- **Pure `await` (no `cookies`/`headers`/`query`, `revalidate !== 0`)**:
  - **Build Time (SSG)**: Option A and Option B behave **identically**. Dinou awaits the entire Server Component tree top-to-bottom—whether the `await` is in `Page` or in `<ChildAsync />`—and writes the complete HTML to `.dinou/dist2/<route>/index.html`.
  - **Runtime**: Served instantaneously from static cache (`0` Server Component executions), or regenerated in the background via ISR when `revalidate >= 1` expires.
- **Reads `cookies`/`headers`/`query` (or `revalidate = 0`)**:
  - **Build Time**: Both Option A and Option B trigger a **Full-Page Dynamic Bailout** (`index.html` is not generated).
  - **Runtime (SSR)**: On every request, Dinou executes `Page` and `<ChildAsync />`, awaits all promises, and returns the dynamically rendered HTML.

#### 1B. `await` in `<ChildAsync />` Wrapped in `<Suspense>` when `ppr = false`
```tsx
export default function Page() {
  return (
    <div>
      <h1>Title</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <ChildAsync />
      </Suspense>
    </div>
  );
}
```
- **Pure `await` (static route)**:
  - **Build Time (SSG)**: Because `ppr` is `false`, Dinou does **not** create PPR holes. It awaits `<ChildAsync />` during the build and bakes its resolved content directly into `index.html` (the `<Suspense>` fallback is never persisted into the static HTML).
  - **Runtime**: Served from static `index.html` with `0` Server Component executions (verified in [`src/test-ppr/opt-out-route/page.tsx`](./src/test-ppr/opt-out-route/page.tsx)).
- **Reads `cookies`/`headers`/`query` (or `revalidate = 0`) inside `<Suspense>` when `ppr = false`**:
  - **Build Time**: Because `ppr` is `false`, `<Suspense>` does **not** isolate the dynamic access into a PPR hole—the **entire page** bails out of static generation (verified in [`src/test-ppr/no-ppr-bailout/page.tsx`](./src/test-ppr/no-ppr-bailout/page.tsx)).
  - **Runtime (Streaming SSR)**: The entire page renders dynamically on each request, and React's native SSR streaming can flush `<h1>Title</h1>` + `<p>Loading...</p>` first and stream `<ChildAsync />` in the same HTTP response once its `await` resolves.

---

### 7.2. Scenario 2: Route With PPR (`ppr = true`)

When `ppr = true`, **`<Suspense>` is the explicit boundary** separating the **Static Shell (build time)** from **Dynamic Holes (runtime)**.

#### 2A. `await` Directly in `Page` vs. `await` in `<ChildAsync />` **Outside `<Suspense>`** (`ppr = true`)
```tsx
// Option A: Direct await in Page (outside <Suspense>)
export default async function Page() {
  const data = await fetchStaticHeader();
  return <header>{data}</header>;
}

// Option B: await in <ChildAsync /> rendered OUTSIDE <Suspense>
export default function Page() {
  return (
    <main>
      <ChildAsync /> {/* NOT wrapped in <Suspense> */}
    </main>
  );
}
```
- Internally, [`invokeServerComponentInPpr`](./dinou/core/render-jsx-to-client-jsx.js) checks `isPprBuildActive() && isInsideSuspense()`.
- Because neither `Page` (Option A) nor `<ChildAsync />` (Option B) is inside a `<Suspense>` boundary (`isInsideSuspense() === false`), **both belong to the Static Shell** and behave **identically**:
  1. **Pure `await` (no `cookies`/`headers`/`query`, no `DinouCacheSlot revalidate={0}`)**:
     - **Build Time**: Dinou awaits both `Page` and `<ChildAsync />` and bakes their resolved HTML into `shell.html` (no `noDynamic()` call is required outside `<Suspense>`; verified in Case 1A & Case 1B of [`src/test-ppr/page.tsx`](./src/test-ppr/page.tsx)).
     - **Runtime Performance Note**: If the PPR route has `0` Dynamic Holes (`holes: []`, e.g., [`src/test-ppr/all-static/page.tsx`](./src/test-ppr/all-static/page.tsx)), Dinou serves `shell.html` immediately without invoking `Page` or `<ChildAsync />` (`0` runtime executions). If the route *does* have Dynamic Holes (`holes.length > 0`), `shell.html` is still flushed at 0ms TTFB, and the server then invokes `Page` (and any unwrapped parent/sibling component rendered before the last Dynamic Hole) to reach the `<Suspense>` holes in the JSX tree—whereas static `async` components wrapped in `<Suspense>` with `noDynamic()` or `<DinouCacheSlot revalidate={N}>` are skipped (`0` runtime executions).
  2. **Reads `cookies`/`headers`/`query` or renders `<DinouCacheSlot revalidate={0}>` outside `<Suspense>`**:
     - **Build Time & Runtime**: Because there is no enclosing `<Suspense>` boundary to hold a fallback placeholder, Dinou cannot create a Dynamic Hole and triggers a **Full-Page Dynamic Bailout** (`shell.html` is discarded and the entire page renders via per-request SSR; verified in [`src/test-ppr/bailout-cookies/page.tsx`](./src/test-ppr/bailout-cookies/page.tsx) and [`src/test-ppr/bailout-slot-0/page.tsx`](./src/test-ppr/bailout-slot-0/page.tsx)).

#### 2B. `await` in `<ChildAsync />` **Inside `<Suspense>`** (`ppr = true`)
```tsx
export default async function Page() {
  const shellData = await fetchShellData(); // Resolved at build -> baked into shell.html
  return (
    <main>
      <h1>{shellData}</h1>
      <Suspense fallback={<Spinner />}>
        <ChildAsync /> {/* Wrapped in <Suspense> */}
      </Suspense>
    </main>
  );
}
```
Here `Page` (and any unwrapped `<ChildAsync />` outside `<Suspense>`) is baked into `shell.html`, while `<ChildAsync />` inside `<Suspense>` (`isInsideSuspense() === true`) follows one unified rule without exceptions:
1. **Default (no `noDynamic()` before the first `await`)**:
   - Intercepted at its first `await` during the build &rarr; `<Spinner />` is baked into `shell.html` as a **Dynamic PPR Hole**:
     - If **not** wrapped in `<DinouCacheSlot revalidate={N}>` (or wrapped in `<DinouCacheSlot revalidate={0}>`), `<ChildAsync />` is executed and streamed live on every request (Cases 2, 3, and 10 of [`src/test-ppr/page.tsx`](./src/test-ppr/page.tsx)).
     - If wrapped in **`<DinouCacheSlot revalidate={N}>`** ($N \ge 1$ or omitted), it becomes a **Cached Dynamic PPR Hole**: `shell.html` sends `<Spinner />` at 0ms TTFB, the first runtime request executes `<ChildAsync />` and caches `slots/<id>/slot.json` for $N$ seconds, and subsequent requests stream the hole from `slot.json` in ~1ms without re-executing `<ChildAsync />` (Cases 8B and 9B of [`src/test-ppr/page.tsx`](./src/test-ppr/page.tsx)).
2. **With `noDynamic()` (called before the first `await`)**:
   - If it does not access `cookies`/`headers`/`query`, Dinou awaits `<ChildAsync />` at build time, bakes its resolved HTML into `shell.html`, and skips executing `<ChildAsync />` at runtime (`0` runtime executions; Cases 4, 5, and 8C of [`src/test-ppr/page.tsx`](./src/test-ppr/page.tsx)).

---

### 7.3. Core Takeaway: The Only Difference Between `ppr = false` and `ppr = true` Is Inside `<Suspense>`

#### 1. Everything **NOT** Wrapped in `<Suspense>` Behaves Identically in `ppr = false` and `ppr = true`
Outside `<Suspense>`, Dinou is **Static by Default** in both modes:
- **If it performs a pure `await` (or uses `<DinouCacheSlot revalidate={N}>` with $N \ge 1$)**:
  - It is awaited during the build and its resolved HTML goes directly into the pre-rendered file (`index.html` in `ppr = false`, `shell.html` in `ppr = true`).
- **If it reads `cookies`, `headers`, `query`, or uses `<DinouCacheSlot revalidate={0}>` outside `<Suspense>`**:
  - It triggers a **Full-Page Dynamic Bailout** of the entire route in both `ppr = false` and `ppr = true`.

In fact, if you declare `ppr = true` on a page that has **no `<Suspense>` boundaries at all** (or where every `<Suspense>` uses `noDynamic()`), the final build output is identical to a static `ppr = false` page (`holes: []`, promoted to `index.html`, with `0` runtime executions).

#### 2. The Only Difference Between `ppr = false` and `ppr = true` Is Inside `<Suspense>`

| What is inside `<Suspense>` | With `ppr = false` | With `ppr = true` |
| :--- | :--- | :--- |
| **`async` component (with a pure `await`)** | Awaited at build time and baked resolved into `index.html` (ignores `fallback` in the static HTML). | **Opens a Dynamic Hole** (`fallback` in `shell.html` + streamed on every request), unless [`noDynamic()`](./dinou/core/no-dynamic.js) is called before the first `await`. |
| **`<DinouCacheSlot revalidate={N}>` ($N \ge 1$) with `await`** | Awaited at build time and baked resolved into `index.html`. | **Opens a Cached Dynamic Hole** (`fallback` in `shell.html` + hole served from `slot.json` in ~1ms for $N$ seconds), unless [`noDynamic()`](./dinou/core/no-dynamic.js) is called. |
| **Reads `cookies` / `headers` / `query` or `<DinouCacheSlot revalidate={0}>`** | **Taints the entire page** $\rightarrow$ Full-Page Dynamic Bailout (everything falls back to per-request SSR). | **Isolates the dynamism into a Dynamic Hole** $\rightarrow$ the rest of the page stays static in `shell.html` (0ms TTFB) and only that `<Suspense>` executes per request. |

---

### 7.4. Complete Comparative Summary Matrix

| Where is the `await`? | Wrapped in `<Suspense>`? | Reads `cookies` / `headers` / `query` (or `revalidate = 0`)? | Behavior when `ppr = false` | Behavior when `ppr = true` | Verified in `src/test-ppr` |
|---|---|---|---|---|---|
| In `Page` or `<ChildAsync />` (including `<DinouCacheSlot revalidate={N}>`) | **No** | **No** | Resolved at build (`index.html`), `0` runtime executions | Resolved at build into Static Shell (`shell.html`) | `page.tsx` (Cases 1A, 1B, 8A, 9A), `opt-out-route/page.tsx` |
| In `Page` or `<ChildAsync />` | **No** | **Yes** | **Full-Page Dynamic Bailout** (per-request SSR) | **Full-Page Dynamic Bailout** (no `<Suspense>` to isolate hole; per-request SSR) | `bailout-cookies/page.tsx`, `bailout-slot-0/page.tsx` |
| In `<ChildAsync />` | **Yes** | **No** | Resolved at build (`index.html`), `0` runtime executions | **Dynamic PPR Hole by default** (`fallback` in `shell.html` + runtime stream; cached for $N$s if inside `<DinouCacheSlot revalidate={N}>`), **unless** opted out via `noDynamic()` | `page.tsx` (Cases 2, 4, 5, 8B, 8C, 9B), `opt-out-route/page.tsx` |
| In `<ChildAsync />` | **Yes** | **Yes** | **Full-Page Dynamic Bailout** (per-request streaming SSR) | **Dynamic PPR Hole** (rest of page keeps static `shell.html`; only this `<Suspense>` streams at runtime) | `page.tsx` (Cases 3, 6, 10, 11), `no-ppr-bailout/page.tsx` |

---

### 7.5. Destination Classification when `ppr = true`: Static Shell vs. Dynamic Hole vs. Full-Page Bailout

When `ppr = true`, every component in the route tree falls into one of three destinations:

#### A. Baked into the Static Shell (`.dinou/dist2/<route>/shell.html` at Build Time)
1. **Any component (synchronous or `async`, including `<DinouCacheSlot revalidate={N}>` with $N \ge 1$ or omitted `revalidate`) rendered OUTSIDE `<Suspense>`**, provided it does not read `cookies`/`headers`/`query`, does not render `<DinouCacheSlot revalidate={0}>`, and does not mutate `res`.
2. **`<Suspense>` wrapping only synchronous components** that do not read `cookies`/`headers`/`query`.
3. **`<Suspense>` wrapping an `async` Server Component (or `<DinouCacheSlot revalidate={N}>`) that calls `noDynamic()` before its first `await`**, provided its subtree does not read `cookies`/`headers`/`query` or render `<DinouCacheSlot revalidate={0}>`.

#### B. Postponed into a Dynamic PPR Hole (`data-ppr-hole` Fallback in `shell.html` + Streamed at Runtime)
*(All cases require being **wrapped inside `<Suspense>`**)*:
1. **`<Suspense>` wrapping an `async` Server Component by default** (without `noDynamic()` before its first `await`), even if it only performs a pure `await` without reading `cookies`/`headers`/`query`:
   - **Uncached Dynamic Hole**: Normal `async` component or `<DinouCacheSlot revalidate={0}>` (executes on every request).
   - **Cached Dynamic Hole**: `<DinouCacheSlot revalidate={N}>` ($N \ge 1$ or omitted `revalidate`) wrapping an `async` child without `noDynamic()` (`fallback` in `shell.html`, hole payload cached in `slots/<id>/slot.json` for $N$ seconds at runtime).
2. **`<Suspense>` whose subtree reads `getContext().req.cookies`, `req.headers`, `req.query`, or `useSearchParams()`** (even if it called `noDynamic()` or is inside `<DinouCacheSlot revalidate={N}>`).
3. **`<Suspense>` wrapping `<DinouCacheSlot revalidate={0}>`**.

#### C. Full-Page Dynamic Bailout (No `shell.html`; 100% Per-Request Dynamic SSR)
- Occurs whenever any dynamic operation (`cookies`, `headers`, `query`, `<DinouCacheSlot revalidate={0}>`, `res` mutations, or `export const revalidate = 0` in `page_functions.ts` / `layout_functions.ts`) happens **outside any `<Suspense>` boundary**.

---

### 7.6. `<DinouCacheSlot revalidate={N}>` ($N \ge 1$) Lifecycle & TTL Expiration Transition

When a `<DinouCacheSlot id="..." revalidate={N}>` ($N \ge 1$) does not read `cookies`/`headers`/`query`, wrapping it in `<Suspense>` (when `ppr = true`) vs. keeping it in the Static Shell gives the developer two complementary UX patterns with **zero TTFB blocking**:

| Aspect | **1. Static Shell Slot** (`ppr = false`, or `ppr = true` **Outside `<Suspense>`** / **Inside `<Suspense>` + `noDynamic()`**) | **2. Cached Dynamic PPR Hole** (`ppr = true` **Inside `<Suspense>`** with `async` Child) |
|---|---|---|
| **Role** | **Static Shell Slot (`inStaticShell: true`)** | **Cached Dynamic PPR Hole (`inStaticShell: false`)** |
| **What goes into `index.html` / `shell.html`?** | The **final resolved HTML** of the slot | The **`<Suspense fallback={...}>`** (`<div data-ppr-hole="ppr-hole-X">`) |
| **Runtime while cache is valid ($t \le \text{generatedAt} + N$)** | Served inside `index.html` / `shell.html` at **0ms TTFB** (`0` runtime executions of the child component) | `shell.html` (with `fallback`) arrives at **0ms TTFB**; hole streams from `slots/<id>/slot.json` in ~1ms (`0` re-executions of the child component after initial cache population) |
| **Runtime transition when TTL expires ($t > \text{generatedAt} + N$)** | **Stale-While-Revalidate (Background ISR, 0ms TTFB)**: The server immediately serves the existing `index.html` / `shell.html` (and skips re-executing the slot during `streamDynamicHoles`), while `revalidatePage(reqPath, { onlyRefreshSlots: true })` runs **in the background** to re-execute only the expired slot and update `slot.json` and `index.html` / `shell.html` for subsequent requests | **Fresh Stream with Fallback (0ms TTFB)**: `shell.html` (with `fallback`) is flushed immediately at 0ms TTFB; while the user sees the `<Suspense fallback>`, `streamDynamicHoles` re-executes the child once, updates `slots/<id>/slot.json` for the next $N$s, and streams the **fresh** hole chunk in that same response |
| **Explicit on-demand invalidation (`await revalidateTag()` or `refreshSlot()`)** | Synchronous update during the `revalidateTag()` / `refreshSlot()` call (`Read-Your-Own-Writes`) | `revalidateTag()` deletes `slot.json` in ~1ms; next visit streams fresh hole behind `fallback` |

---

### 7.7. Performance Best Practice in `ppr = true` Routes with Dynamic Holes: Unwrapped `async` vs. `<Suspense>` + `noDynamic()` vs. `<DinouCacheSlot id="...">`

When a `ppr = true` route has **zero Dynamic Holes** (`holes.length === 0`, e.g., `/test-ppr/all-static`), Dinou promotes `shell.html` directly to a pure static `index.html`. At runtime, `serveStatic` delivers the file at 0ms TTFB and **never invokes `Page()` or traverses the component tree**. In that pure-static scenario, all static-shell forms behave identically at runtime.

However, when a `ppr = true` route **does have at least one Dynamic Hole** (`holes.length > 0`), the runtime lifecycle on every HTTP request (`handlePprResume` in `dinou/core/server-core.js` + `streamDynamicHoles` in `dinou/core/ppr-runtime.js`) works in two phases:
1. **Phase 1 (0ms TTFB)**: The server reads `.dinou/dist2/<route>/shell.html` from disk and flushes it immediately to the browser (`res.write(shellPrefix)`). The user sees the Static Shell (including any static `async` content already baked into `shell.html`) and the `fallback` placeholders of the Dynamic Holes right away.
2. **Phase 2 (Runtime Tree Traversal to Resolve Dynamic Holes)**: Keeping the HTTP stream open, the server calls `getJSX()` and `streamDynamicHoles()` to walk the component tree from the root (`Layout` -> `Page`) in order to find and execute the `<Suspense>` boundaries that correspond to the Dynamic Holes (`holes` in `metadata.json`).

#### Why Unwrapped `async` Components Delay Downstream Dynamic Holes
Suppose a `ppr = true` route renders a heavy static `async` component (e.g., `<HeavyMarkdown />` taking `300ms` to parse Markdown) alongside a genuine Dynamic Hole (`<UserCart />` taking `50ms` to read cookies):

```tsx
export default async function Page() {
  return (
    <main>
      {/* 1. Static Shell content (takes 300ms when executed) */}
      <HeavyMarkdown />

      {/* 2. Genuine Dynamic Hole (reads cookies, takes 50ms) */}
      <Suspense fallback={<CartSkeleton />}>
        <UserCart />
      </Suspense>
    </main>
  );
}
```

During **Phase 2 (`streamDynamicHoles`)**, as Dinou traverses `<main>`'s children:
- If `<HeavyMarkdown />` is rendered **unwrapped** (or awaited directly inside `export default async function Page()`), Dinou does not know ahead of time whether `<HeavyMarkdown />` might return a nested `<Suspense>` hole inside its JSX. Therefore, `streamDynamicHoles` **must execute and `await <HeavyMarkdown />` (`300ms`)**, discard its output (since its HTML was already sent in `shell.html`), and only **then** reach `<Suspense><UserCart /></Suspense>` (`50ms`). As a result, `<UserCart />` streams to the browser at **$300\text{ms} + 50\text{ms} = 350\text{ms}$** instead of $50\text{ms}$!

#### The Two Zero-Overhead Ways to Put `async` Content in the Static Shell
To prevent static-shell `async` work from ever re-executing during Phase 2 (`streamDynamicHoles`), Dinou provides two short-circuit mechanisms:

1. **`<Suspense>` + `noDynamic()` (`0.00ms` Memory Skip)**:
   ```tsx
   async function HeavyMarkdown() {
     noDynamic(); // 👈 Static opt-out before first await
     const html = await parseHeavyMarkdown(); // 300ms at build time ONLY
     return <article dangerouslySetInnerHTML={{ __html: html }} />;
   }

   // In Page:
   <Suspense fallback={null}>
     <HeavyMarkdown />
   </Suspense>
   ```
   - **At Build Time**: `noDynamic()` disables the PPR hole for this `<Suspense>`, so `<HeavyMarkdown />` resolves into `shell.html` and is **not** added to `metadata.holes`.
   - **At Runtime (`streamDynamicHoles`)**: As soon as `streamDynamicHoles` encounters a `<Suspense>` boundary whose ID is not in `metadata.holes` (or when `noDynamic()` throws `SKIP_STATIC_SUSPENSE_SYMBOL` on line 1 during runtime resume), it **aborts that entire subtree in `0.00ms` in memory**, without executing `await parseHeavyMarkdown()` and without reading disk. `<UserCart />` starts immediately and resolves in **$50\text{ms}$**.

2. **`<DinouCacheSlot id="...">` Outside `<Suspense>` (or Inside `<Suspense>` + `noDynamic()`) (`~1ms` Disk Cache Skip + Micro-ISR)**:
   ```tsx
   <DinouCacheSlot id="heavy-markdown">
     <HeavyMarkdown />
   </DinouCacheSlot>
   ```
   - **At Build Time**: Because it is outside `<Suspense>`, it resolves into `shell.html` and saves its serialized payload to `.dinou/dist2/<route>/slots/heavy-markdown/slot.json` (`inStaticShell: true`).
   - **At Runtime (`streamDynamicHoles`)**: When `streamDynamicHoles` visits `<DinouCacheSlot id="heavy-markdown">`, `DinouCacheSlot` reads `slot.json` in `~1ms` and **never invokes `<HeavyMarkdown />`**. Plus, it unlocks independent slot revalidation (`revalidate={N}`, `revalidateTag()`, or the client `refreshSlot()` button).

#### 3-Way Comparison for Static-Shell `async` Components in `ppr = true` Routes with Dynamic Holes

| Approach for a Static-Shell `async` Component ($300\text{ms}$) | Baked into `shell.html` at Build? (`0\text{ms}` TTFB) | Re-executes the $300\text{ms}$ `await` at Runtime during `streamDynamicHoles`? | Extra Delay Added to Downstream Dynamic Holes (`<UserCart />`) | Supports Independent Micro-ISR (`revalidate={N}`, `revalidateTag`, `refreshSlot`)? |
|---|---|---|---|---|
| **1. Unwrapped `<HeavyMarkdown />` (or `await` directly inside `Page()`)** | ✅ Yes | ❌ **Yes** (re-runs on every request to inspect its JSX subtree for nested holes) | **$+300\text{ms}$** (delays downstream holes) | ❌ No |
| **2. `<Suspense><HeavyMarkdownWithNoDynamic /></Suspense>`** | ✅ Yes | ✅ **No (`0.00ms`)** (`SKIP_STATIC_SUSPENSE_SYMBOL` aborts on line 1 in memory) | **$0\text{ms}$** | ❌ No (invalidated only via full-page ISR) |
| **3. `<DinouCacheSlot id="..."><HeavyMarkdown /></DinouCacheSlot>`** *(unwrapped, or inside `<Suspense>` + `noDynamic()`)* | ✅ Yes | ✅ **No (`~1ms`)** (short-circuits from `slots/<id>/slot.json` without running `<HeavyMarkdown />`) | **$\approx 1\text{ms}$** | ✅ **Yes** |

#### Golden Rule for `ppr = true` Routes
Whenever a `ppr = true` route contains at least one Dynamic Hole, **avoid leaving heavy `async` static-shell work unwrapped in `Page()`**. Instead:
- Wrap it in **`<Suspense>` + `noDynamic()`** if it is pure static build-time work ($0.00\text{ms}$ runtime skip in memory).
- Wrap it in **`<DinouCacheSlot id="...">`** if you also want independent caching, `revalidate={N}`, `revalidateTag()`, or interactive `refreshSlot()` ($\approx 1\text{ms}$ runtime skip from disk).







