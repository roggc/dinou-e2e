# Supporting `useId` (and Stateless Server Hooks) in Synchronous Server Components in Dinou

This document details the technical architecture, edge cases, hydration-mismatch hazards, and complete implementation of React 19 stateless Server Component hooks (`useId`, `use`, `useMemo`, `useCallback`, `useDebugValue`, and the React Compiler's `useMemoCache`) across Dinou's 3D rendering engine (Layouts, Parallel `@slots`, Pages, `<DinouCacheSlot>`, and Partial Prerendering `<Suspense>` holes).

---

## 1. Executive Summary

In React 19, **stateful and lifecycle hooks** (`useState`, `useReducer`, `useEffect`, `useContext`, `useRef`, etc.) are strictly forbidden in Server Components, and **all hooks** are forbidden inside `async` Server Components.

However, according to the **React 19 RSC specification** (`react/react-server` and `react-server-dom-webpack`), a specific set of **stateless synchronous hooks** **is** officially supported inside **synchronous Server Components**:

1. `useId()`
2. `use(usable)` (for reading Promises in synchronous Server Components)
3. `useMemo(fn, deps)`
4. `useCallback(fn, deps)`
5. `useDebugValue(value)`
6. `useMemoCache(size)` (injected automatically by `babel-plugin-react-compiler` / React 19 Compiler)

### Why Dinou Needed a Dedicated Server Hooks & Scoped ID Engine

In a naive React Flight setup where a single `renderToReadableStream` call renders the entire document once, `react-server-dom-webpack` simply increments a single flat per-request counter (`currentRequest.identifierCount++`) to produce `_S_1_`, `_S_2_`, etc.

In **Dinou**, however, a page is segmented across **3 dimensions** and rendered/hydrated via independent streams and pre-evaluation passes:
- **Initial SSR (`GET /path`)** renders `Layout + Parallel @slots + Page` together.
- **Client Hydration & Soft Navigation** fetches segmented RSC streams independently:
  - `GET /____rsc_layout____/path` (only `Layout` + `@slots`, with `<DinouPageSlot />` in place of `Page`)
  - `GET /____rsc_page____/path` (only `Page`, without `Layout`)
  - `GET /____rsc_slot____/:slotId` (only a specific `<DinouCacheSlot>` via `refreshSlot()`)
- **Pre-evaluation via `asyncRenderJSXToClientJSX`** evaluates Server Components in memory before `react-server-dom-webpack` runs (for `<DinouCacheSlot>` serialization, `Layout` error-isolation probing, and PPR static shell generation).
- **Partial Prerendering (`ppr = true`)** bakes static shells (`shell.html`, `shell.page.json`) at build time (`isSSG: true`) and streams/splices dynamic `<Suspense>` holes at runtime (`streamDynamicHoles` and `spliceDynamicHolesIntoShell`).

If Server Components shared a single flat counter or relied on `react-server-dom-webpack`'s default `_S_<N>_` counter, IDs generated during `GET /path` would not match IDs generated during `GET /____rsc_page____/path`, `GET /____rsc_layout____/path`, or `GET /____rsc_slot____/:id`, causing **React hydration mismatches**.

---

## 2. FAQ: Should `useId()` Be Used as the `id` of `<DinouCacheSlot>`?

Note that React 19's `useId()` in Server Components produces `_S_<N>_` (using underscores `_` rather than colons `:`, which makes it safe for CSS selectors and filenames). Even so, **`useId()` should NOT be used as the cache key (`id`) of `<DinouCacheSlot>`**, for three architectural reasons:

1. **`DinouCacheSlot` is itself a component**: Any `useId()` call inside a child Server Component executes *inside* `DinouCacheSlot` after `DinouCacheSlot` already needs its `slotId` to look up `slots/<slotId>/slot.json` in storage.
2. **Invalidation and Refresh APIs require a semantic, deterministic key**: `revalidateTag("pricing")`, `refreshSlot("pricing")`, and `/____rsc_slot____/pricing` require a human-known identifier. An auto-generated sequential ID like `_page_dS_3_` is opaque and shifts to `_page_dS_4_` if a sibling component is conditionally rendered above it, causing cache poisoning across conditional branches.
3. **Where `useId()` *does* belong**: `useId()` is designed for **HTML accessibility and form attributes inside the components rendered by the slot** (`<label htmlFor={id}>`, `<input id={id} />`, `aria-describedby={id}`, or passing `serverId` props to Client Components).

---

## 3. The 6 Hydration & Concurrency Hazards Solved in Dinou

### 3.1. Hazard 1 — Dual Dispatcher Override & Layout/Page Counter Mixing
- **Problem**: `react-server-dom-webpack` (`renderRSCStream`) sets `ReactSharedInternals.H = HooksDispatcher` inside `performWork()`. In `GET /path`, `Layout` and `Page` were sharing `react-server-dom-webpack`'s `currentRequest.identifierCount`, so `Layout` took `_S_1_` and `Page` started at `_S_2_`. In `GET /____rsc_page____/path` (which only renders `Page`), `Page` started at `_S_1_`, causing an immediate hydration mismatch (`_S_1_` vs `_S_2_`).
- **Solution ([`dinou/core/render-jsx-to-client-jsx.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/render-jsx-to-client-jsx.js))**:
  - Installed a property setter trap (`patchInternalsDispatcherSetter` / `patchDispatcherObject`) on `React.__SERVER_INTERNALS...H` and `React.__CLIENT_INTERNALS...H` across all loaded React entrypoints (`react`, `react/index.js`, `react/react.react-server.js`).
  - Whenever `react-server-dom-webpack` assigns its internal `HooksDispatcher` to `internals.H`, Dinou patches `dispatcher.useId` and `dispatcher.use` in-place so **all** `useId()` calls—whether pre-evaluated by `asyncRenderJSXToClientJSX` or executed live by `react-server-dom-webpack`—route through Dinou's context-aware `useServerId()`.

### 3.2. Hazard 2 — 5-Tier Hierarchical Scope Priority in `useServerId()`
- **Solution ([`dinou/core/render-jsx-to-client-jsx.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/render-jsx-to-client-jsx.js#L52-L85))**:
  `useServerId()` resolves the active `AsyncLocalStorage` scope in strict priority order (from most specific to least specific):
  1. **Slot Discovery Pass (`isSlotDiscoveryActive()`)**: Returns `"_discovery_dS_"` without mutating any counters during cold-start slot discovery.
  2. **`<DinouCacheSlot>` Scope (`getActiveCachedSlotStore()`)**: Increments `slotStore.idCount` and returns `"_slot_${safeSlotId}_dS_${idCount.toString(32)}_"`.
     - *Crucial rule*: `slotStore` has **higher priority** than `<Suspense>` / PPR Hole scope (`holeStore`). Thus, even when a `<DinouCacheSlot>` is wrapped inside a `<Suspense>` boundary or inside a Dynamic PPR `<Suspense>` hole, its children receive `_slot_<slotId>_dS_<N>_`. When `refreshSlot(slotId)` later re-renders that slot standalone via `/____rsc_slot____/:id` (outside `<Suspense>`), it produces the **exact same ID**.
  3. **`<Suspense>` / PPR Hole Scope (`getActiveRuntimeDynamicHoleStore()`)**: Increments `holeStore.idCount` and returns `"_hole_${safeHoleId}_dS_${idCount.toString(32)}_"`.
  4. **Page Segment Scope (`getActivePageSegmentStore()`)**: Increments `pageStore.idCount` and returns `"_page_dS_${idCount.toString(32)}_"`.
  5. **Layout & Parallel `@slot` Segment Scope (`getActiveLayoutSegmentStore()`)**: Increments `layoutStore.idCount` and returns `"_layout_dS_${idCount.toString(32)}_"`.

### 3.3. Hazard 3 — Single-Pass Layout & `@slot` Evaluation with Error-Isolation Rollback in `getJSX`
- **Problem**: Previously, [`getJSX`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/get-jsx.js) probed each `Layout` by calling `asyncRenderJSXToClientJSX(<Layout>{null}</Layout>)` to check if the layout threw an error, discarded that result, and returned an unevaluated `<Layout>{jsx}</Layout>` element. That meant every `Layout` executed **twice** per request, and its second execution ran outside `runInLayoutSegment` during `renderRSCStream`.
- **Solution ([`dinou/core/get-jsx.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/get-jsx.js) & [`dinou/core/ppr-context.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/ppr-context.js))**:
  - Added `createLayoutChildrenPlaceholder()` and `replaceLayoutChildrenPlaceholder()`.
  - `getJSX` now evaluates each `Layout` **only once** inside `runInLayoutSegment(..., layoutSegmentStore)` using the placeholder for `children`, and then splices the resolved `Page` (`jsx`) into the placeholder's position.
  - **Resilience to failing nested layouts & parallel `@slots`**: Before evaluating each parallel `@slot` or `Layout`, `getJSX` snapshots `layoutSegmentStore.idCount` and `layoutSegmentStore.holeCount`. If a `@slot` or nested `Layout` throws an error and falls back to `error.tsx` (`getErrorJSX`), `getJSX` rolls back `idCount` and `holeCount` so outer layouts keep identical IDs.
  - Parallel `@slots` (`@sidebar`, `@team`, etc.) are also evaluated inside `runInLayoutSegment` both in `getJSX` and in `GET /____rsc_slot____/*` ([`dinou/core/handler.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/handler.js#L1391-L1395)).

### 3.4. Hazard 4 — Sibling `<Suspense>` Concurrency (`Promise.all`), `MAX_ROW_SIZE` (`3200` bytes) Task Deferral, and `ppr = false` Static `<Suspense>` Resolution
- **Problem A (Sibling `<Suspense>` Race Condition & `MAX_ROW_SIZE` Deferral)**:
  - Previously, `asyncRenderJSXToClientJSXInner` evaluated JSX arrays and object props using `Promise.all(jsx.map(...))`, and only wrapped `<Suspense>` children in `runInSuspense` + `runInRuntimeDynamicHole` when `Boolean(getPprStore()) || Boolean(getActiveRuntimeDynamicHoleStore())` was true.
  - When `getPprStore()` was `undefined` (such as in `dinou dev` or non-PPR renders), sibling `<Suspense>` boundaries (e.g., `DynamicPprHoleSection` with `15ms` and `StaticUsePromiseSection` with `8ms`) were not isolated inside `runInRuntimeDynamicHole` and instead shared the flat `pageStore.idCount` (`_page_dS_<N>_`) while executing concurrently across `await` boundaries.
  - Furthermore, if `<Suspense>` evaluation was deferred to `react-server-dom-webpack` (`renderRSCStream`), in `GET /test-useid` (`Layout + Page` together) the serialized Flight buffer exceeded `MAX_ROW_SIZE` (`3200` bytes), triggering `deferTask()` and flushing the first chunk to `edge-ssr` (which blocked the main thread for ~`12ms` before starting the second boundary's `8ms` timer, finishing at `20ms` *after* the `15ms` timer), whereas in `GET /____rsc_page____/test-useid` (`Page` alone) `serializedSize` stayed under `3200` bytes so `8ms` finished *before* `15ms`—causing a hydration mismatch (`_page_dS_b_` vs `_page_dS_d_`).
- **Problem B (`ppr = false` Static SSG Regression if `<Suspense>` Children Are Deferred via an Async Wrapper Component)**:
  - An initial attempt to isolate `<Suspense>` boundaries when `getPprStore()` was `undefined` wrapped `<Suspense>` children in a deferred async Server Component (`DinouSuspenseHoleBoundary`) instead of awaiting `asyncRenderJSXToClientJSX(jsx.props?.children)` directly inside `asyncRenderJSXToClientJSXInner`.
  - However, `getPprStore()` is also `undefined` when pre-rendering static routes with `ppr = false` during SSG (such as `/test-ppr/opt-out-route` in `handler.js`). Wrapping `<Suspense>` children in `DinouSuspenseHoleBoundary` postponed their evaluation until the Flight/SSR stream (`renderRSCStream` -> `renderHtmlStream`), causing React SSR to emit the `<Suspense>` fallback (`data-testid="opt-out-async-fallback"` and `<template id="B:2">`) plus out-of-order streaming scripts (`$RC("B:2","S:2")`) into the static `index.html` of `ppr = false` routes instead of baking the resolved HTML directly into `index.html`.
- **Solution ([`dinou/core/ppr-context.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/ppr-context.js) & [`dinou/core/render-jsx-to-client-jsx.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/render-jsx-to-client-jsx.js))**:
  - `getJSX` pre-evaluates the `Page` shell inside `runInPageSegment(() => asyncRenderJSXToClientJSX(jsx))`.
  - `asyncRenderJSXToClientJSXInner` traverses arrays and object props using deterministic sequential `for...of` loops (never `Promise.all`).
  - Whenever `asyncRenderJSXToClientJSXInner` encounters a `<Suspense>` boundary outside a cached slot (and outside `isPprBuildActive()`), `runInSuspense(async (holeId) => ...)` assigns a deterministic tree-order `holeId` (`layout-hole-1`, `ppr-hole-1`, `ppr-hole-2`, and `${parentHoleId}-${childHoleCount}` for nested `<Suspense>` boundaries):
    - When `shouldEagerlyResolveSuspense` (`Boolean(getPprStore()) || Boolean(getActiveRuntimeDynamicHoleStore()) || Boolean(getContext()?.platformContext?.isSSG) || process.env.NODE_ENV === "production"`) is true, it eagerly awaits `runInRuntimeDynamicHole(() => asyncRenderJSXToClientJSX(jsx.props?.children), holeId)` so `ppr = false` static routes (`/test-ppr/opt-out-route`) fully resolve `<Suspense>` children into static `index.html` at build time without leaving `<Suspense>` fallbacks or `$RC(...)` scripts in the static output.
    - In development streaming SSR (`process.env.NODE_ENV !== "production"` outside SSG/PPR build), it wraps `<Suspense>` children in `<DinouSuspenseHoleBoundary holeId={holeId}>` (which executes `runInRuntimeDynamicHole(() => asyncRenderJSXToClientJSX(children), holeId)` when streamed by `renderRSCStream`), preserving immediate progressive `<Suspense>` fallback streaming in dev while keeping each boundary's `useId()` counter (`_hole_<holeId>_dS_<N>_`) 100% isolated from timer jitter and `MAX_ROW_SIZE` deferrals.

### 3.5. Hazard 5 — `React.use(pendingPromise)` Suspension & Replay Counter Rollback
- **Problem**: In React 19, a synchronous Server Component can call `useId()` *before* and *after* `React.use(pendingPromise)`:
  ```tsx
  function SyncUsePromiseWidget({ dataPromise }) {
    const idBefore = useId();
    const data = use(dataPromise); // Throws pendingPromise on first pass!
    const idAfter = useId();
    return ...;
  }
  ```
  On the first pass, `idBefore` increments `idCount` (to `1`), and then `use(dataPromise)` throws `dataPromise`. When `dataPromise` resolves, the component is re-invoked from the top. Without counter rollback, the second pass would assign `2` to `idBefore` and `3` to `idAfter` (wasting `1` and shifting IDs if `dataPromise` was already resolved in another pass).
- **Solution ([`dinou/core/render-jsx-to-client-jsx.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/render-jsx-to-client-jsx.js#L87-L116))**:
  - Added `snapshotActiveIdCounts()` and `restoreActiveIdCounts(snap)`.
  - In `invokeServerComponentInPpr`, if a synchronous Server Component throws a thenable (`isThenable(thrown)`), Dinou restores `idSnap` (`restoreActiveIdCounts(idSnap)`), awaits the thrown thenable (unless PPR build postponement applies), and loops (`while (true)`) to replay the component with the exact initial counter state.
  - Similarly, `dinouPatchedUse` in `patchDispatcherObject` snapshots and restores active ID counts whenever `origUse` throws a pending thenable inside `react-server-dom-webpack`.

### 3.6. Hazard 6 — Higher-Order Server Component Wrappers (`React.memo` & `React.forwardRef`)
- **Solution ([`dinou/core/render-jsx-to-client-jsx.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/render-jsx-to-client-jsx.js#L691-L742) & [`dinou/core/ppr-runtime.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/ppr-runtime.js))**:
  - Both `asyncRenderJSXToClientJSXInner` and PPR's `streamDynamicHoles` / `spliceDynamicHolesIntoShell` unwrap `Symbol.for("react.forward_ref")`, `Symbol.for("react.memo")`, and nested `React.memo(React.forwardRef(...))` Server Components through `invokeServerComponentInPpr` / `invokeWithServerHooksDispatcher`, ensuring stateless hooks work identically inside wrapped components.

---

## 4. Summary of Modified Files in `dinou/core/`

| File | Key Changes |
| :--- | :--- |
| [`dinou/core/render-jsx-to-client-jsx.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/render-jsx-to-client-jsx.js) | Implemented `DinouServerHooksDispatcher`, `useServerId()`, `useServerUsable()`, `patchInternalsDispatcherSetter()`, `snapshotActiveIdCounts()` / `restoreActiveIdCounts()`, unconditional `runInSuspense` + `runInRuntimeDynamicHole` `<Suspense>` evaluation across all non-slot modes, `while (true)` thenable replay in `invokeServerComponentInPpr()`, `React.memo(React.forwardRef)` unwrapping, and sequential `for...of` traversal. |
| [`dinou/core/ppr-context.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/ppr-context.js) | Added `idCount` and `holeCount` / `childHoleCount` tracking to `runInPageSegment`, `runInLayoutSegment`, `runInCachedSlot`, and `runInRuntimeDynamicHole`; updated `runInSuspense` to allocate deterministic tree-order `holeId`s (`layout-hole-N`, `ppr-hole-N`, `ppr-hole-N-M`) in all modes; added `createLayoutChildrenPlaceholder()` and `runInSlotDiscovery()`. |
| [`dinou/core/get-jsx.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/get-jsx.js) | Pre-evaluates `Page` shell via `runInPageSegment(() => asyncRenderJSXToClientJSX(jsx))`; evaluates each `Layout` and parallel `@slot` once inside `runInLayoutSegment` using `createLayoutChildrenPlaceholder()` + `replaceLayoutChildrenPlaceholder()`, with full `idCount` / `holeCount` rollback on layout or `@slot` errors. |
| [`dinou/core/ppr-runtime.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/ppr-runtime.js) | Wrapped Server Component evaluations during `streamDynamicHoles` and `spliceDynamicHolesIntoShell` with `invokeWithServerHooksDispatcher()`; added `PprDynamicHoleBoundary` and `React.memo` / `React.forwardRef` support. |
| [`dinou/core/cache-slot.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/cache-slot.js) | Passed `{ cached, slotId }` into `runInCachedSlot` so each `<DinouCacheSlot>` gets an isolated `_slot_${slotId}_dS_${N}_` counter; wrapped cold-start discovery in `runInSlotDiscovery()`. |
| [`dinou/core/handler.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/dinou/core/handler.js) | Wrapped standalone parallel `@slot` RSC requests (`/____rsc_slot____/*`) in `runInLayoutSegment`. |

---

## 5. Comprehensive Verification Suite (`/test-useid`)

The verification route at [`src/test-useid/`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/src/test-useid) ([`layout.tsx`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/src/test-useid/layout.tsx), [`page.tsx`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/src/test-useid/page.tsx), [`page_functions.ts`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/src/test-useid/page_functions.ts) with `ppr = true`, and [`client-verifier.tsx`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-docs/src/test-useid/client-verifier.tsx)) tests **12 distinct component architectures** producing **24 `[data-generated-id]` DOM nodes** (23 Server Component nodes + 1 Client Component node) and **26 automated verification checks**:

| # | Test Case (`data-testid`) | Component Architecture Tested | Generated `useId()` |
| :--- | :--- | :--- | :--- |
| **1** | `layout-sync-bar` | Sync Server Component in `layout.tsx` (before `{children}`) calling `useId()`, `useMemo()`, `useCallback()`, `useDebugValue()` | `_layout_dS_1_` |
| **2A** | `layout-slot-sync` | Sync Server Component inside `<DinouCacheSlot id="useid-layout-slot">` in `layout.tsx` | `_slot_useid-layout-slot_dS_1_` |
| **2B** | `layout-footer-sync` | Sync Server Component in `layout.tsx` **after** `{children}` (verifies `Page` does not contaminate `Layout` counter) | `_layout_dS_2_` |
| **3A** | `page-static-sync-1` | 1st `useId()` call in sync Server Component in `page.tsx` Static Shell | `_page_dS_1_` |
| **3B** | `page-static-sync-2` | 2nd `useId()` call in the **same** sync Server Component in `page.tsx` | `_page_dS_2_` |
| **4A** | `nested-outer-slot-sync` | Sync Server Component inside outer `<DinouCacheSlot id="useid-outer-slot">` | `_slot_useid-outer-slot_dS_1_` |
| **4B** | `nested-inner-slot-sync` | Sync Server Component inside nested inner `<DinouCacheSlot id="useid-inner-slot">` | `_slot_useid-inner-slot_dS_1_` |
| **5** | `nodynamic-suspense-sync` | Sync Server Component inside `<Suspense>` + `noDynamic()` static boundary (`ppr-hole-1`) | `_hole_ppr-hole-1_dS_1_` |
| **6A** | `ppr-dynamic-hole-sync` | Sync Server Component inside streamed Dynamic PPR `<Suspense>` Hole (`ppr-hole-2`, `15ms` delay) | `_hole_ppr-hole-2_dS_1_` |
| **6B** | `dynamic-hole-slot-sync` | Sync Server Component inside `<DinouCacheSlot id="useid-dynamic-hole-slot">` **inside** Dynamic PPR `<Suspense>` Hole (`ppr-hole-2`) | `_slot_useid-dynamic-hole-slot_dS_1_` |
| **7A** | `memo-sync-widget` | `React.memo()` Sync Server Component | `_page_dS_3_` |
| **7B** | `forwardref-sync-widget` | `React.forwardRef()` Sync Server Component | `_page_dS_4_` |
| **7C** | `memo-forwardref-sync-widget` | Nested `React.memo(React.forwardRef())` Sync Server Component | `_page_dS_5_` |
| **8A-1** | `use-promise-sync-before` | `useId()` **before** `React.use(pendingPromise)` (`8ms` delay) inside `<Suspense>` (`ppr-hole-3`) | `_hole_ppr-hole-3_dS_1_` |
| **8A-2** | `use-promise-sync-after` | `useId()` **after** `React.use(pendingPromise)` in the same component (`ppr-hole-3`) | `_hole_ppr-hole-3_dS_2_` |
| **8B-1** | `slot-use-promise-sync-before` | `useId()` **before** `React.use(pendingPromise)` inside `<DinouCacheSlot id="useid-use-hook-slot">` | `_slot_useid-use-hook-slot_dS_1_` |
| **8B-2** | `slot-use-promise-sync-after` | `useId()` **after** `React.use(pendingPromise)` inside `<DinouCacheSlot id="useid-use-hook-slot">` | `_slot_useid-use-hook-slot_dS_2_` |
| **9A** | `sandwich-outer-sync` | Outer Sync Server Component in `Sync -> Async -> Sync` sandwich inside `<Suspense>` (`ppr-hole-4`) | `_hole_ppr-hole-4_dS_1_` |
| **9B** | `sandwich-inner-sync` | Inner Sync Server Component rendered by `async` middle component in `ppr-hole-4` | `_hole_ppr-hole-4_dS_2_` |
| **10A** | `list-item-sync-0` | Sync Server Component rendered inside `.map()` array iteration (`index = 0`) | `_page_dS_6_` |
| **10B** | `list-item-sync-1` | Sync Server Component rendered inside `.map()` array iteration (`index = 1`) | `_page_dS_7_` |
| **11** | `nocache-slot-sync` | Sync Server Component inside uncached `<DinouCacheSlot id="useid-nocache-slot" revalidate={0}>` | `_slot_useid-nocache-slot_dS_1_` |
| **12** | `suspense-slot-sync` | Sync Server Component inside `<Suspense>` wrapping `<DinouCacheSlot id="useid-suspense-slot" revalidate={180}>` (`ppr = true`) | `_slot_useid-suspense-slot_dS_1_` |
| **Client** | `client-own-probe` | `"use client"` component (`ClientUseIdVerifier`) receiving `serverPassedId` prop and calling client `useId()` | React Client Fiber ID (`_R_...`) |

### End-to-End & Parity Checks Verified (`26/26 PASS`)
1. **100% SSR HTML <-> Segmented RSC Parity**: Every `data-generated-id` in `GET /test-useid` matches `GET /____rsc_layout____/test-useid` (for layout nodes) and `GET /____rsc_page____/test-useid` (for page, slot, and `<Suspense>` hole nodes) with zero hydration mismatches in the browser.
2. **100% Uniqueness & `<label htmlFor>` <-> `<input id>` Binding**: All 24 DOM nodes have globally unique IDs and matching `<label>`/`<input>` pairs verified on the client by `ClientUseIdVerifier`.
3. **Standalone `refreshSlot(..., { fresh: true })` Parity**: Calling `GET /____rsc_slot____/<slotId>?fresh=1` on `useid-layout-slot`, `useid-outer-slot`, `useid-inner-slot`, `useid-use-hook-slot`, `useid-suspense-slot`, and `useid-dynamic-hole-slot` produces the exact same `_slot_<slotId>_dS_<N>_` IDs as the initial page render.
4. **PPR Static Shell Pre-Render (`isSSG: true`, `ppr = true`)**: Verified that `<Suspense>` wrapping `<DinouCacheSlot id="useid-suspense-slot">` is baked into the static PPR shell (`shell.html` and `shell.page.json`) with `_slot_useid-suspense-slot_dS_1_`, while `DynamicPprHoleSection` (`ppr-hole-2`) is postponed (`data-ppr-hole="ppr-hole-2"`) and streams dynamically with `_hole_ppr-hole-2_dS_1_` and `_slot_useid-dynamic-hole-slot_dS_1_`.
