# Smart Cache-Aware `<Suspense>` for `<DinouCacheSlot>` in Dynamic SSR Routes

## 1. Executive Summary

This document describes the design, implementation, before/after runtime behavior, and end-to-end verification of **Smart Cache-Aware `<Suspense>` Streaming** for `<DinouCacheSlot>` and **Awaitable `refreshSlot(slotId, options): Promise<void>`** in Dinou.

When a developer wraps a `<DinouCacheSlot>` inside a `<Suspense fallback={...}>` boundary on a **Dynamic SSR route** (`revalidate = 0` or routes accessing request-time `cookies`, `headers`, or `query` with `ppr = false`):
- **On a Cold Cache Miss** (the very first request, after a `revalidateTag()` cache purge, or when `revalidate={0}`): Dinou **does not block TTFB**. It immediately flushes the surrounding dynamic page and the `<Suspense>` `fallback` skeleton to the browser, and streams the resolved `<DinouCacheSlot>` (`$RC(...)`) in the same HTTP response as soon as the slow server query finishes and persists to cache.
- **On Warm Cache Hits & Expired TTLs (Background SWR)** (2nd request onward): Dinou detects that the slot is already cached in storage, resolves it in ~1–2ms during `getJSX`, and embeds the final widget **directly into the initial HTML without ever emitting or flashing the `<Suspense>` `fallback`**.
- **On Live Client `refreshSlot(id, { fresh: true })`**: Updates the `<DinouCacheSlotBoundary>` **in-place** via `React.startTransition` without unmounting to the outer `<Suspense>` `fallback` (preserving sibling and child client state), returns a `Promise<void>` that resolves once the slot fetch and update settle (enabling `await refreshSlot(...)` inside `useTransition` for non-destructive loading indicators), and warms the server `slot.json` cache so subsequent SSR requests also hit a Warm Cache without emitting `fallback`.

---

## 2. Behavior Comparison: Before vs. After

### 2.1. Previous Behavior (Before Changes)

Previously, in production when `ppr = false` (`getPprStore() === null`), [`getJSX`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/get-jsx.js) pre-evaluated the page tree via [`asyncRenderJSXToClientJSX`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/render-jsx-to-client-jsx.js) with `shouldEagerlyResolveSuspense = true` (`process.env.NODE_ENV === "production"`), and [`DinouCacheSlot`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/cache-slot.js) always `await`ed its `renderPromise` before returning. Furthermore, [`refreshSlot`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/navigation.js) was fire-and-forget (`void`), giving callers no way to `await` completion.

As a consequence, on a Dynamic SSR route (`revalidate = 0`, `ppr = false`), wrapping `<DinouCacheSlot>` in `<Suspense fallback={<AnalyticsSkeleton />}>` had **no streaming effect in production**:

| Lifecycle Phase (Dynamic SSR Route, `ppr = false`) | Previous Behavior (`<Suspense>` Wrapping `<DinouCacheSlot>`) |
| :--- | :--- |
| **1. Cold Cache Miss (1st Request)** | **Blocked TTFB.** `getJSX` waited for the slow `<DinouCacheSlot>` query to finish before starting `renderRSCStream` / `renderHtmlStream`. The user stared at a blank/loading browser tab until the slowest slot finished, and `<AnalyticsSkeleton />` (`fallback`) was **never** shown. |
| **2. Warm Cache Hit (2nd+ Request)** | Read from storage in ~1–2ms during `getJSX` and sent final HTML without `fallback`. |
| **3. Expired TTL (`revalidate` elapsed)** | Served stale slot in ~1–2ms without `fallback` and triggered Background SWR. |
| **4. After `revalidateTag()` Purge** | **Blocked TTFB again** while re-computing the purged slot synchronously inside `getJSX`. |
| **5. `<DinouCacheSlot revalidate={0}>` in `<Suspense>`** | **Blocked TTFB on every single request** despite being wrapped in `<Suspense>`. |
| **6. Live `refreshSlot(id, { fresh: true })`** | Fire-and-forget (`void`); callers could not `await` when the slot finished refreshing. |

### 2.2. New Behavior (After Changes)

With **Smart Cache-Aware `<Suspense>` Streaming** and **Awaitable `refreshSlot`**, [`DinouCacheSlot`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/cache-slot.js) inspects its cache state and enclosing boundary context during `getJSX`:

| Lifecycle Phase (Dynamic SSR Route, `ppr = false`) | New Behavior (`<Suspense>` Wrapping `<DinouCacheSlot>`) | New Behavior (Unwrapped `<DinouCacheSlot>`) |
| :--- | :--- | :--- |
| **1. Cold Cache Miss (1st Request)** | **Non-blocking TTFB!** Immediately flushes the dynamic page shell + `<Suspense>` `fallback` (`<AnalyticsSkeleton />`), then streams the resolved widget + `$RC(...)` swap script in the same HTTP response as soon as the query completes and caches. | Waits for the query on the 1st request and embeds the widget directly in the initial HTML (0 `fallback`). |
| **2. Warm Cache Hit (2nd+ Request)** | **Zero fallback flash!** Resolves from cache in ~1–2ms during `getJSX` and embeds the final widget **directly in the initial HTML** (`fallback` is never emitted). | Serves from cache in ~1–2ms directly in the initial HTML. |
| **3. Expired TTL (`revalidate` elapsed)** | **Zero fallback flash + Background SWR!** Immediately serves the stale cached widget directly in the initial HTML (0 `fallback`) while refreshing `slot.json` asynchronously in the background. | Immediately serves the stale cached widget in the initial HTML while refreshing in the background via SWR. |
| **4. After `revalidateTag()` Purge** | Because `revalidateTag` deletes `slot.json`, the next request is a cold cache miss and **streams the `<Suspense>` `fallback` first** without blocking TTFB, then caches the fresh result for subsequent hits. | Waits once to compute the fresh slot and embeds it in the initial HTML. |
| **5. Live `refreshSlot(id, { fresh: true })`** | **Zero fallback flash + Awaitable `Promise<void>`!** Reconciles in-place via `React.startTransition` without unmounting to the `<Suspense>` `fallback`, resolves the returned `Promise` when settled, and warms `slot.json` on the server so the next SSR request is a Warm Cache Hit (0 `fallback`). | Updates in-place via `React.startTransition`, resolves the returned `Promise`, and warms `slot.json` on the server. |
| **6. `<DinouCacheSlot revalidate={0}>` in `<Suspense>`** | **Streams the `<Suspense>` `fallback` first on every request**, followed by the resolved live widget in the same stream. | Evaluates live on every request before flushing HTML. |
| **7. Static / ISR Routes (`ppr = false`) at Build Time** | Unchanged: resolves eagerly into static `index.html` during SSG and background ISR revalidation without leaving fallbacks in static files. | Unchanged: baked directly into static `index.html`. |
| **8. PPR Routes (`ppr = true`)** | Unchanged: postpones at build time into a **Cached Dynamic PPR Hole** (`data-ppr-hole`) and streams from cache in ~2ms at runtime. | Unchanged: baked into the 0ms PPR Static Shell (`shell.html`). |

---

## 3. Technical Implementation

### 3.1. Tracking Outer `<Suspense>` Boundaries Outside Slots ([`dinou/core/ppr-context.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/ppr-context.js#L43-L69))
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

### 3.2. Exposing Live Request Dynamic State ([`dinou/core/handler.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js#L120-L126))
- In `createRequestContext(simReq, resBridge, platformContext, dynamicState)` ([`dinou/core/handler.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js#L886-L891)), attached `_dynamicState: dynamicState` to the request context object and excluded `"_dynamicState"` from being overwritten in `copyCustomContextProperties`.
- This allows `DinouCacheSlot` to know whether the active route is executing as a dynamic route (`revalidate = 0` or after accessing `req.cookies`, `req.headers`, or `req.query`).

### 3.3. Preserving Deferred Slot Stream Elements & `dev`/`prod` Parity in `asyncRenderJSXToClientJSX` ([`dinou/core/render-jsx-to-client-jsx.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/render-jsx-to-client-jsx.js#L366-L376))
- **100% `dev` / `prod` Parity (`containsCacheSlot`)**:
  - Added `containsCacheSlot(node)` and included `containsCacheSlot(jsx.props?.children)` in `shouldEagerlyResolveSuspense` ([lines 635–641](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/render-jsx-to-client-jsx.js#L635-L641)).
  - Without `containsCacheSlot`, in development (`NODE_ENV !== "production"`) a `<Suspense>` boundary wrapping `<DinouCacheSlot>` would wrap its children in the async `<DinouSuspenseHoleBoundary>` component evaluated lazily during `renderRSCStream`, causing React SSR to see a pending Promise and emit the `<Suspense>` fallback even on a Warm Cache Hit.
  - With `containsCacheSlot(jsx.props?.children)`, `<Suspense>` boundaries wrapping `<DinouCacheSlot>` evaluate `DinouCacheSlot` during `getJSX` inside `runInRuntimeDynamicHole(..., holeId)` in **both** `dev` and `prod`—inlining Warm Cache Hits with zero fallback and returning `<DinouDeferredSlotStream>` on Cold Cache Misses across both modes.
- **Preserving `<DinouDeferredSlotStream>` ([lines 699–718](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/render-jsx-to-client-jsx.js#L699-L718))**:
  - In `asyncRenderJSXToClientJSXInner`, when `typeof jsx.type === "function"`:
    1. First checks `if (isClientComponent(Component))` (critical so React Client Reference proxies are never dotted into with custom property lookups on the server).
    2. Next checks `else if (Component.$$dinouDeferredSuspenseStream) { return jsx; }`.
  - When `DinouCacheSlot` returns a `<DinouDeferredSlotStream promise={...} />` element on a cold cache miss, `asyncRenderJSXToClientJSX` leaves that element untouched so `getJSX` finishes immediately without awaiting the slow slot promise.

### 3.4. Smart Cache-Aware Branching in `DinouCacheSlot` ([`dinou/core/cache-slot.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/cache-slot.js#L565-L872))
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

### 3.5. Awaitable `refreshSlot(slotId, options): Promise<void>` for Non-Destructive Client Refresh Indicators
- **Files updated**:
  - [`dinou/core/client.jsx`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/client.jsx#L314-L324)
  - [`dinou/core/client-webpack.jsx`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/client-webpack.jsx#L314-L324)
  - [`dinou/core/navigation.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/navigation.js#L102-L117)
  - [`dinou/core/slot.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/slot.js#L316-L343) (`DinouCacheSlotBoundary` at [lines 462–488](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/slot.js#L462-L488))
  - [`dinou/index.d.ts`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/index.d.ts#L591-L601)
- **How it works**:
  - `refreshSlot(slotId, options)` initializes `const promises = []`, passes it inside the event payload (`new CustomEvent("dinou:refresh-slot", { detail: { id: slotId, options, promises } })`), and returns `Promise.all(promises).then(() => undefined)`.
  - Both mounted [`DinouCacheSlotBoundary`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/slot.js#L462-L488) instances and the unmounted slot listener ([`slot.js#L316-L343`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/slot.js#L316-L343)) push their `settledPromise` (which resolves after `/____rsc_slot____/<id>` finishes and `applyResolved` commits via `React.startTransition`) into `e.detail.promises`.
- **Why in-place reconciliation + `await refreshSlot(...)` is optimal**:
  - Because `DinouCacheSlotBoundary` waits for the Flight stream to resolve before calling `setOverride` inside `React.startTransition`, an already-mounted `<DinouCacheSlot>` inside `<Suspense>` **never unmounts to the `<Suspense>` `fallback`** during a live refresh—preventing layout flicker, scroll jumps, and loss of state/focus in child or sibling Client Components.
  - At the same time, returning `Promise<void>` lets developers wrap `await refreshSlot(id, { fresh: true })` inside `useTransition` (or `useState`) to display a non-destructive loading state (spinner, button label, opacity) for the exact duration of the slot refresh:
    ```tsx
    const [isPending, startTransition] = useTransition();

    const handleRefresh = () => {
      startTransition(async () => {
        await refreshSlot("my-analytics-slot", { fresh: true });
      });
    };
    ```

---

## 4. End-to-End Verification Suite

### 4.1. Test Route: [`src/t-new-cache-slot/`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/src/t-new-cache-slot)
Created [`src/t-new-cache-slot/page_functions.ts`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/src/t-new-cache-slot/page_functions.ts) (`export const revalidate = 0;`), [`src/t-new-cache-slot/page.tsx`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/src/t-new-cache-slot/page.tsx), [`src/t-new-cache-slot/controls.tsx`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/src/t-new-cache-slot/controls.tsx), [`src/t-new-cache-slot/actions.ts`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/src/t-new-cache-slot/actions.ts), and [`src/t-new-cache-slot/ctl/page.tsx`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/src/t-new-cache-slot/ctl/page.tsx), which render:
1. **Dynamic Page Header** reading `getContext()?.req?.cookies?.["user"]`, rendering a sync `useId()` probe (`data-testid="page-header-sync-id"` → `_page_dS_1_`), and mounting `<NewCacheSlotControls />`.
2. **Scenario 1 (`<Suspense>` wrapping `<DinouCacheSlot id="test-dyn-suspense-slot" tag="test-dyn-suspense-tag" revalidate={2}>`)**:
   - Fallback: `data-testid="slot-suspense-fallback"`
   - Child: `SlowAnalyticsSlotWidget` (`80ms` async delay + execution counter + sync `useId()` probe `data-testid="slot-suspense-sync-id"` → `_slot_test-dyn-suspense-slot_dS_1_`).
3. **Scenario 2 (Unwrapped `<DinouCacheSlot id="test-dyn-unwrapped-slot" tag="test-dyn-unwrapped-tag" revalidate={2}>`)**:
   - Child: `UnwrappedSlotWidget` (`30ms` async delay + execution counter + sync `useId()` probe `data-testid="slot-unwrapped-sync-id"` → `_slot_test-dyn-unwrapped-slot_dS_1_`).
4. **Scenario 3 (`<Suspense>` wrapping `<DinouCacheSlot id="test-dyn-nocache-slot" revalidate={0}>`)**:
   - Fallback: `data-testid="slot-nocache-fallback"`
   - Child: `NoCacheSlotWidget` (`40ms` async delay + execution counter + sync `useId()` probe `data-testid="slot-nocache-sync-id"` → `_slot_test-dyn-nocache-slot_dS_1_`).
5. **Page Footer Sync Probe** after all `<Suspense>` boundaries (`data-testid="page-footer-sync-id"` → `_page_dS_2_`).

### 4.2. Playwright E2E Suite: [`e2e/example.spec.ts`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/e2e/example.spec.ts#L7732-L8019)
Added `test.describe("Smart Cache-Aware <Suspense> for <DinouCacheSlot> in Dynamic SSR Routes (/t-new-cache-slot)", ...)` with two comprehensive end-to-end tests:
1. **Test 1 — `Raw SSR Wire Lifecycle: Cold Cache Miss Streaming Fallback, Warm Cache Hit Zero Fallback, Background SWR on Expired TTL & revalidateTag Purge` ([`example.spec.ts#L7757-L7905`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/e2e/example.spec.ts#L7757-L7905))**:
   - **Request #1 (Cold Cache Miss, `user=alice`)**: Verifies `html1` contains **both** `data-testid="slot-suspense-fallback"` and `data-testid="slot-suspense-resolved"` (`$RC(...)`), plus all 5 deterministic `useId()` probes.
   - **Request #2 (Warm Cache Hit, `user=bob`)**: Verifies `data-user="bob"` updates dynamically while `slot-suspense-resolved` and `slot-unwrapped-resolved` remain at `data-exec-count="1"` and `html2` **does NOT contain `data-testid="slot-suspense-fallback"`** (while `test-dyn-nocache-slot` with `revalidate={0}` still streams its `slot-nocache-fallback` and increments to `data-exec-count="2"`).
   - **Segmented RSC & Standalone Slot Parity**: Verifies `/____rsc_page____/t-new-cache-slot` and `/____rsc_slot____/test-dyn-suspense-slot` emit identical `useId()` IDs.
   - **Request #3 & #4 (TTL Expiry after `2.3s` → Background SWR)**: Verifies Request #3 serves stale `data-exec-count="1"` immediately **with zero `fallback`** while triggering background SWR, and Request #4 serves the refreshed `data-exec-count="2"` from cache **still with zero `fallback`**.
   - **Request #5 & #6 (`revalidateTag("test-dyn-suspense-tag")` Purge)**: Verifies Request #5 after `revalidateTag` is a Cold Cache Miss that **emits `data-testid="slot-suspense-fallback"`** + `data-exec-count="3"`, and Request #6 returns to a Warm Cache Hit with **zero `fallback`**.
2. **Test 2 — `Browser Hydration, Interactive revalidateTag Server Action vs. Live refreshSlot(id, { fresh: true }) Behavior` ([`example.spec.ts#L7907-L8018`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/e2e/example.spec.ts#L7907-L8018))**:
   - Verifies browser hydration from a Cold Cache Miss stream produces **zero hydration warnings** (`hydrationErrors === []`) and 100% matching `useId()` attributes.
   - Verifies clicking `btn-refresh-suspense-slot-fresh` (`startSlotTransition(async () => await refreshSlot("test-dyn-suspense-slot", { fresh: true }))`) returns a real `Promise<void>` (`thenable=true;before=1;fallback=false`), updates `slot-suspense-resolved` in-place to `data-exec-count="2"` without showing `slot-suspense-fallback` or losing client state (`client-clicks-count === "2"`), and warms the server cache so the next SSR request also has **zero `fallback`**.
   - Verifies clicking `btn-revalidate-suspense-tag` (`revalidateTag("test-dyn-suspense-tag")`) purges the server slot cache so the next SSR request **does emit `data-testid="slot-suspense-fallback"`** and advances to `data-exec-count="3"`.
