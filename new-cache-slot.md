# Smart Cache-Aware `<Suspense>` for `<DinouCacheSlot>` in Dynamic SSR Routes

## 1. Executive Summary

This document describes the design, implementation, before/after runtime behavior, and end-to-end verification of **Smart Cache-Aware `<Suspense>` Streaming** for `<DinouCacheSlot>` in Dinou.

When a developer wraps a `<DinouCacheSlot>` inside a `<Suspense fallback={...}>` boundary on a **Dynamic SSR route** (`revalidate = 0` or routes accessing request-time `cookies`, `headers`, or `query` with `ppr = false`):
- **On a Cold Cache Miss** (the very first request, after a `revalidateTag()` cache purge, or when `revalidate={0}`): Dinou **does not block TTFB**. It immediately flushes the surrounding dynamic page and the `<Suspense>` `fallback` skeleton to the browser, and streams the resolved `<DinouCacheSlot>` (`$RC(...)`) in the same HTTP response as soon as the slow server query finishes and persists to cache.
- **On Warm Cache Hits & Expired TTLs (Background SWR)** (2nd request onward): Dinou detects that the slot is already cached in storage, resolves it in ~1–2ms during `getJSX`, and embeds the final widget **directly into the initial HTML without ever emitting or flashing the `<Suspense>` `fallback`**.

---

## 2. Behavior Comparison: Before vs. After

### 2.1. Previous Behavior (Before Changes)

Previously, in production when `ppr = false` (`getPprStore() === null`), [`getJSX`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/get-jsx.js) pre-evaluated the page tree via [`asyncRenderJSXToClientJSX`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/render-jsx-to-client-jsx.js) with `shouldEagerlyResolveSuspense = true` (`process.env.NODE_ENV === "production"`), and [`DinouCacheSlot`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/cache-slot.js) always `await`ed its `renderPromise` before returning.

As a consequence, on a Dynamic SSR route (`revalidate = 0`, `ppr = false`), wrapping `<DinouCacheSlot>` in `<Suspense fallback={<AnalyticsSkeleton />}>` had **no streaming effect in production**:

| Lifecycle Phase (Dynamic SSR Route, `ppr = false`) | Previous Behavior (`<Suspense>` Wrapping `<DinouCacheSlot>`) |
| :--- | :--- |
| **1. Cold Cache Miss (1st Request)** | **Blocked TTFB.** `getJSX` waited for the slow `<DinouCacheSlot>` query to finish before starting `renderRSCStream` / `renderHtmlStream`. The user stared at a blank/loading browser tab until the slowest slot finished, and `<AnalyticsSkeleton />` (`fallback`) was **never** shown. |
| **2. Warm Cache Hit (2nd+ Request)** | Read from storage in ~1–2ms during `getJSX` and sent final HTML without `fallback`. |
| **3. Expired TTL (`revalidate` elapsed)** | Served stale slot in ~1–2ms without `fallback` and triggered Background SWR. |
| **4. After `revalidateTag()` Purge** | **Blocked TTFB again** while re-computing the purged slot synchronously inside `getJSX`. |
| **5. `<DinouCacheSlot revalidate={0}>` in `<Suspense>`** | **Blocked TTFB on every single request** despite being wrapped in `<Suspense>`. |

### 2.2. New Behavior (After Changes)

With **Smart Cache-Aware `<Suspense>` Streaming**, [`DinouCacheSlot`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/cache-slot.js) inspects its cache state and enclosing boundary context during `getJSX`:

| Lifecycle Phase (Dynamic SSR Route, `ppr = false`) | New Behavior (`<Suspense>` Wrapping `<DinouCacheSlot>`) | New Behavior (Unwrapped `<DinouCacheSlot>`) |
| :--- | :--- | :--- |
| **1. Cold Cache Miss (1st Request)** | **Non-blocking TTFB!** Immediately flushes the dynamic page shell + `<Suspense>` `fallback` (`<AnalyticsSkeleton />`), then streams the resolved widget + `$RC(...)` swap script in the same HTTP response as soon as the query completes and caches. | Waits for the query on the 1st request and embeds the widget directly in the initial HTML (0 `fallback`). |
| **2. Warm Cache Hit (2nd+ Request)** | **Zero fallback flash!** Resolves from cache in ~1–2ms during `getJSX` and embeds the final widget **directly in the initial HTML** (`fallback` is never emitted). | Serves from cache in ~1–2ms directly in the initial HTML. |
| **3. Expired TTL (`revalidate` elapsed)** | **Zero fallback flash + Background SWR!** Immediately serves the stale cached widget directly in the initial HTML (0 `fallback`) while refreshing `slot.json` asynchronously in the background. | Immediately serves the stale cached widget in the initial HTML while refreshing in the background via SWR. |
| **4. After `revalidateTag()` Purge** | Because `revalidateTag` deletes `slot.json`, the next request is a cold cache miss and **streams the `<Suspense>` `fallback` first** without blocking TTFB, then caches the fresh result for subsequent hits. | Waits once to compute the fresh slot and embeds it in the initial HTML. |
| **5. `<DinouCacheSlot revalidate={0}>` in `<Suspense>`** | **Streams the `<Suspense>` `fallback` first on every request**, followed by the resolved live widget in the same stream. | Evaluates live on every request before flushing HTML. |
| **6. Static / ISR Routes (`ppr = false`) at Build Time** | Unchanged: resolves eagerly into static `index.html` during SSG and background ISR revalidation without leaving fallbacks in static files. | Unchanged: baked directly into static `index.html`. |
| **7. PPR Routes (`ppr = true`)** | Unchanged: postpones at build time into a **Cached Dynamic PPR Hole** (`data-ppr-hole`) and streams from cache in ~2ms at runtime. | Unchanged: baked into the 0ms PPR Static Shell (`shell.html`). |

---

## 3. Technical Implementation

### 3.1. Tracking Outer `<Suspense>` Boundaries Outside Slots ([`dinou/core/ppr-context.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/ppr-context.js#L28-L55))
- Updated `runInRuntimeDynamicHole(callback, holeId)` to record `slotDepthAtSuspense` (preserving the outer `slotDepthAtSuspense` across nested `<Suspense>` boundaries or capturing `cachedSlotStorage.getStore()?.depth || 0`).
- Added and exported `isInsideRuntimeSuspenseOutsideSlot()`:
  ```js
  export function isInsideRuntimeSuspenseOutsideSlot() {
    const currentSlotDepth = cachedSlotStorage.getStore()?.depth || 0;
    if (currentSlotDepth > 0) return false;
    const holeStore = getActiveRuntimeDynamicHoleStore();
    if (holeStore && (holeStore.slotDepthAtSuspense || 0) === 0) {
      return true;
    }
    return isInsideOuterSuspenseOutsideSlot();
  }
  ```
  This returns `true` **only** when `<DinouCacheSlot>` is inside an outer `<Suspense>` boundary and is **not** nested inside another `<DinouCacheSlot>`.

### 3.2. Exposing Live Request Dynamic State ([`dinou/core/handler.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/handler.js#L120-L126))
- In `createRequestContext(simReq, resBridge, platformContext, dynamicState)` ([`dinou/core/handler.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/handler.js#L886-L891)), attached `_dynamicState: dynamicState` to the request context object and excluded `"_dynamicState"` from being overwritten in `copyCustomContextProperties`.
- This allows `DinouCacheSlot` to know whether the active route is executing as a dynamic route (`revalidate = 0` or after accessing `req.cookies`, `req.headers`, or `req.query`).

### 3.3. Preserving Deferred Slot Stream Elements in `asyncRenderJSXToClientJSX` ([`dinou/core/render-jsx-to-client-jsx.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/render-jsx-to-client-jsx.js#L674-L694))
- In `asyncRenderJSXToClientJSXInner`, when `typeof jsx.type === "function"`:
  1. First checks `if (isClientComponent(Component))` (critical so React Client Reference proxies are never dotted into with custom property lookups on the server).
  2. Next checks `else if (Component.$$dinouDeferredSuspenseStream) { return jsx; }`.
- When `DinouCacheSlot` returns a `<DinouDeferredSlotStream promise={...} />` element on a cold cache miss, `asyncRenderJSXToClientJSX` leaves that element untouched so `getJSX` finishes immediately without awaiting the slow slot promise.

### 3.4. Smart Cache-Aware Branching in `DinouCacheSlot` ([`dinou/core/cache-slot.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/cache-slot.js#L507-L855))
- Defined `DinouDeferredSlotStream`:
  ```js
  async function DinouDeferredSlotStream({ promise }) {
    const [res] = await Promise.all([
      promise,
      new Promise((r) => setTimeout(r, 0)),
    ]);
    return res;
  }
  DinouDeferredSlotStream.$$dinouDeferredSuspenseStream = true;
  ```
  - Running `promise` concurrently with a `0ms` macrotask yield (`setTimeout(r, 0)`) starts the database query immediately during `getJSX` (zero added latency) while guaranteeing that `react-server-dom-webpack` flushes the initial Flight chunk with the `<Suspense>` fallback to `edge-ssr` (`renderToReadableStream`) before `DinouDeferredSlotStream` settles.
- Computed `shouldStreamSlotInSuspense` inside `DinouCacheSlot`:
  ```js
  const reqCtxInitial = getContext();
  const shouldStreamSlotInSuspense =
    isInsideRuntimeSuspenseOutsideSlot() &&
    !isPprBuildActive() &&
    !reqCtxInitial?.platformContext?.isSSG &&
    !isRevalidationActive() &&
    !isSlotDiscoveryActive() &&
    !reqCtxInitial?._isPprRuntimeResume &&
    (Boolean(reqCtxInitial?._dynamicState?.value) ||
      isNoCache ||
      Object.keys(reqCtxInitial?.req?.query || {}).length > 0 ||
      process.env.DINOU_DEV === "true" ||
      process.env.NODE_ENV !== "production");
  ```
- **On a Cache Hit or Expired TTL with Background SWR (`!isExpired || serveStaleWhileRevalidate`)**:
  - `DinouCacheSlot` deserializes `cached.content` and returns `wrapWithBoundary(withRefreshedNested, false)` **directly** (no `DinouDeferredSlotStream`).
  - `asyncRenderJSXToClientJSX` resolves the boundary in place during `getJSX`, so `renderToReadableStream` sees 100% resolved JSX inside `<Suspense>` and **never emits the `<Suspense>` fallback**.
- **On a Cold Cache Miss (or `isNoCache` / `revalidate={0}`) when `shouldStreamSlotInSuspense` is `true`**:
  - `DinouCacheSlot` launches `renderPromise` (and registers it in `inflightSlotRenders` for stampede protection), commits slot tags, and returns `<DinouDeferredSlotStream promise={streamPromise} />` where `streamPromise` awaits `renderPromise` and resolves `asyncRenderJSXToClientJSX(wrapWithBoundary(fresh, true))`.
- **100% `useId()` Hydration Parity**:
  - Because `renderPromise` executes inside `runInCachedSlot(..., { cached: true, slotId })` (or `runSlotScope` for `revalidate={0}`), all synchronous Server Components calling `useId()` inside the slot receive deterministic `_slot_<slotId>_dS_<N>_` IDs, while sibling components in the page shell receive `_page_dS_<N>_`—producing identical IDs whether the slot streams on a cache miss or inlines on a cache hit.

---

## 4. End-to-End Verification Suite

### 4.1. New Test Route: [`src/test-cache-slot/`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/src/test-cache-slot)
Created [`src/test-cache-slot/page_functions.ts`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/src/test-cache-slot/page_functions.ts) (`export const revalidate = 0;`) and [`src/test-cache-slot/page.tsx`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/src/test-cache-slot/page.tsx), which renders:
1. **Dynamic Page Header** reading `getContext()?.req?.cookies?.["user"]` and rendering a sync `useId()` probe (`data-testid="page-header-sync-id"` → `_page_dS_1_`).
2. **Scenario 1 (`<Suspense>` wrapping `<DinouCacheSlot id="test-dyn-suspense-slot" revalidate={2}>`)**:
   - Fallback: `data-testid="slot-suspense-fallback"`
   - Child: `SlowAnalyticsSlotWidget` (`80ms` async delay + execution counter + sync `useId()` probe `data-testid="slot-suspense-sync-id"` → `_slot_test-dyn-suspense-slot_dS_1_`).
3. **Scenario 2 (Unwrapped `<DinouCacheSlot id="test-dyn-unwrapped-slot" revalidate={2}>`)**:
   - Child: `UnwrappedSlotWidget` (`30ms` async delay + execution counter + sync `useId()` probe `data-testid="slot-unwrapped-sync-id"` → `_slot_test-dyn-unwrapped-slot_dS_1_`).
4. **Scenario 3 (`<Suspense>` wrapping `<DinouCacheSlot id="test-dyn-nocache-slot" revalidate={0}>`)**:
   - Fallback: `data-testid="slot-nocache-fallback"`
   - Child: `NoCacheSlotWidget` (`40ms` async delay + execution counter + sync `useId()` probe `data-testid="slot-nocache-sync-id"` → `_slot_test-dyn-nocache-slot_dS_1_`).
5. **Page Footer Sync Probe** after all `<Suspense>` boundaries (`data-testid="page-footer-sync-id"` → `_page_dS_2_`).

### 4.2. Automated Verification Script: [`verify-cache-slot-suspense.mjs`](file:///C:/Users/roggc/.gemini/antigravity/brain/0e7461e7-228b-4a19-9d9d-5ed5834044a0/scratch/verify-cache-slot-suspense.mjs)
Verified all 5 lifecycle stages end-to-end against the compiled production bundle (`.dinou/node/server.mjs`):
1. **Stage 1 — Request #1 (Cold Cache Miss, `cookie: "user=alice"`)**:
   - Verified `html1` contains **both** `data-testid="slot-suspense-fallback"` (flushed first in the initial shell) **and** `data-testid="slot-suspense-resolved"` (streamed via `$RC` once the `80ms` query finished).
   - Verified `data-testid="slot-nocache-fallback"` and `data-testid="slot-nocache-resolved"` both streamed.
   - Verified all 5 `useId()` probes (`_page_dS_1_`, `_page_dS_2_`, `_slot_test-dyn-suspense-slot_dS_1_`, `_slot_test-dyn-unwrapped-slot_dS_1_`, `_slot_test-dyn-nocache-slot_dS_1_`).
2. **Stage 2 — Request #2 (Warm Cache Hit, `cookie: "user=bob"`)**:
   - Verified `data-user="bob"` updated live while `suspenseSlot` and `unwrappedSlot` execution counts remained `1` (0 DB re-executions).
   - Verified `html2` contains `data-testid="slot-suspense-resolved"` and **does NOT contain `data-testid="slot-suspense-fallback"`** (zero fallback flash on cache hit).
   - Verified `test-dyn-nocache-slot` (`revalidate={0}`) continued to stream its fallback and re-execute (`noCacheSlot === 2`).
   - Verified 100% `useId()` parity between Request #1 (streamed cache miss) and Request #2 (inlined cache hit).
3. **Stage 3 — Segmented RSC & Standalone Slot Endpoint Parity**:
   - Verified `GET /____rsc_page____/test-cache-slot` and `GET /____rsc_slot____/test-dyn-suspense-slot` produce 100% matching `useId()` IDs.
4. **Stage 4 — Request #3 & #4 (TTL Expiry after `2.2s` → Non-Blocking Background SWR)**:
   - Verified Request #3 (`cookie: "user=charlie"`) immediately served stale `data-exec-count="1"` **without showing `data-testid="slot-suspense-fallback"`**, while triggering background SWR.
   - Verified that after background SWR completed, Request #4 (`cookie: "user=dave"`) served the fresh `data-exec-count="2"` from cache **still without showing `data-testid="slot-suspense-fallback"`**.
5. **Stage 5 — Request #5 & #6 (Cache Purge Simulation)**:
   - Removed `slots/test-dyn-suspense-slot` (simulating `revalidateTag`), verified Request #5 streamed `data-testid="slot-suspense-fallback"` + `data-exec-count="3"`, and verified Request #6 returned to inlining `data-exec-count="3"` with **zero fallback**.

### 4.3. Regression Verification Across Existing Suites
- **[`verify-useid.mjs`](file:///C:/Users/roggc/.gemini/antigravity/brain/0e7461e7-228b-4a19-9d9d-5ed5834044a0/scratch/verify-useid.mjs) (`/test-useid`)**: **26/26 checks passed** in green.
- **[`verify-test-ppr-e2e.mjs`](file:///C:/Users/roggc/.gemini/antigravity/brain/0e7461e7-228b-4a19-9d9d-5ed5834044a0/scratch/verify-test-ppr-e2e.mjs) (`/test-ppr`)**: **100% of build-time and runtime PPR assertions passed** in green.

