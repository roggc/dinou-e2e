# PPR + `DinouCacheSlot` Synergy in Dinou — Architecture, v9.0.3 Fixes & Developer Guide

This document provides a complete technical and user-facing reference for combining **Partial Prerendering (PPR)** and **Vertical Segmentation (`<DinouCacheSlot>` & `refreshSlot` / Micro-ISR)** in Dinou. It covers how both engines interact under the hood, the architectural fixes implemented in **v9.0.3** to make their synergy seamless, and the composition patterns this unlocks for application developers.

---

## 1. Overview: Why Combine PPR and `<DinouCacheSlot>`?

On their own, **Partial Prerendering (PPR)** and **`<DinouCacheSlot>`** solve two different dimensions of web performance:

- **PPR (Streaming Boundary Segmentation)**: Splits a route horizontally in time into an **instant static shell** (`0ms TTFB`, served immediately from `shell.html`) and **parallel dynamic `<Suspense>` holes** (`ppr-hole-N`) that execute per request with live `cookies`, `headers`, and `query` parameters and stream over the same HTTP connection.
- **`<DinouCacheSlot>` (Vertical Component Caching & Live Micro-ISR)**: Wraps any arbitrary Server Component subtree in an isolated cache unit (`slots/<slotId>/slot.json`) with its own `id`, `tag` / `tags`, and `revalidate` TTL—allowing expensive subtrees to be cached across dynamic requests, invalidated surgically on the server via `revalidateTag(tag)`, or refreshed live in the browser via `refreshSlot(idOrTag)` without reloading the page or losing client React state.

When combined on the **same route**, Dinou unlocks a **3-Tier Hybrid Rendering Architecture**:

1. **Tier 1 — Instant Static Shell + Refreshable Shell Slots (`0ms TTFB`)**:
   - The layout and page shell are served instantaneously from disk/storage (`shell.html`).
   - Any `<DinouCacheSlot>` placed in the static shell (or inside a static `<Suspense>` boundary) is baked into `shell.html` for instant initial paint, **yet remains individually addressable** at runtime via `refreshSlot(idOrTag)` in the browser or `revalidateTag(tag)` on the server.
2. **Tier 2 — Per-Request Streamed Dynamic Holes (`<Suspense>`)**:
   - Subtrees that read `ctx.req.cookies`, `ctx.req.headers`, or `ctx.req.query` are automatically postponed during build-time Phase 1 (`[data-ppr-hole="ppr-hole-N"]`) and streamed on every request with fresh user/request context.
3. **Tier 3 — Micro-ISR `<DinouCacheSlot>` Inside Dynamic PPR Holes**:
   - Inside a per-request dynamic `<Suspense>` hole, developers often need to mix **user-specific request data** (e.g., user session, theme, region cookie, query filter) with **expensive shared or semi-static subtrees** (e.g., pricing tables, analytics aggregations, AI summaries, nested widgets).
   - By placing `<DinouCacheSlot>` **inside** a dynamic PPR `<Suspense>` hole, the outer hole streams per request with live `cookies`/`headers`/`query`, while the inner `<DinouCacheSlot>` is served from cache (`slot.json`) in sub-millisecond time without re-running its expensive async work on every request.

---

## 2. Architectural Fixes Implemented in Dinou (v9.0.3)

Combining build-time two-pass PPR shell extraction with per-component `<DinouCacheSlot>` serialization and live client-side `/____rsc_slot____` re-fetching exposed several subtle lifecycle interactions. The following 7 core fixes were implemented in Dinou:

### 2.1. Transactional Deferred Side-Effects for `<DinouCacheSlot>` Inside `<Suspense>` During PPR Phase 1
- **Files Modified**: `dinou/core/ppr-context.js`, `dinou/core/render-jsx-to-client-jsx.js`, `dinou/core/cache-slot.js`
- **Problem**:
  - Consider a `<Suspense>` boundary containing a `<DinouCacheSlot id="slot-a">` followed by a sibling `<DynamicReader />` that reads `ctx.req.cookies`:
    ```tsx
    <Suspense fallback={<p>Loading hole...</p>}>
      <DinouCacheSlot id="slot-a" tag="tag-a" revalidate={3600}>
        <ExpensiveWidget />
      </DinouCacheSlot>
      <DynamicCookieReader /> {/* throws PprBailoutError! */}
    </Suspense>
    ```
  - During build-time PPR Phase 1, `asyncRenderJSXToClientJSX` evaluated `<DinouCacheSlot id="slot-a">` **before** `<DynamicCookieReader />` threw `PprBailoutError`.
  - As a result, `<DinouCacheSlot>` immediately wrote `slots/slot-a/slot.json` to disk with `inStaticShell: true` and added `"tag-a"` to the route's static `metadata.json` (`slotTags`), even though the enclosing `<Suspense>` boundary subsequently bailed out into a dynamic PPR hole!
- **Solution**:
  - Added a per-`<Suspense>` transactional effect frame stack in `dinou/core/ppr-context.js` (`pushPprSuspenseEffects()`, `popPprSuspenseEffects(commit)`, and `deferPprSuspenseEffect(fn)`).
  - When `isPprBuildActive() && isInsideSuspense()` is true, `<DinouCacheSlot>` does **not** immediately write to `storage` or push to `reqContext._slotTags`; instead, it registers those operations via `deferPprSuspenseEffect(...)`.
  - In `dinou/core/render-jsx-to-client-jsx.js`:
    - If the `<Suspense>` boundary finishes rendering all children **without** throwing a PPR postpone, `await popPprSuspenseEffects(true)` commits the deferred effects (or bubbles them to the parent `<Suspense>` frame if nested, only committing to storage/metadata once the outermost enclosing `<Suspense>` boundary is confirmed static).
    - If **any** child inside the `<Suspense>` boundary throws `dinou.ppr.postpone`, `await popPprSuspenseEffects(false)` discards the frame's pending effects cleanly.

### 2.2. Preventing Build-Time Cache Poisoning When Dynamic Request Data Is Read Directly Inside `<DinouCacheSlot>`
- **Files Modified**: `dinou/core/cache-slot.js`
- **Problem**:
  - When a Server Component **inside** `<DinouCacheSlot>` read `ctx.req.cookies`, `ctx.req.headers`, or `ctx.req.query` directly during build-time PPR Phase 1:
    ```tsx
    <Suspense fallback={<p>Loading...</p>}>
      <DinouCacheSlot id="direct-cookie-slot" tag="tag-direct" revalidate={3600}>
        {async () => {
          const theme = getContext()?.req?.cookies?.theme ?? "build-default";
          return <div>Theme: {theme}</div>;
        }}
      </DinouCacheSlot>
    </Suspense>
    ```
  - During Phase 1, accessing `req.cookies.theme` throws `PprBailoutError` (`$$typeof: Symbol.for("dinou.ppr.postpone")`). If `<DinouCacheSlot>` did not explicitly recognize PPR postpone signals, or if a cached `slot.json` from a prior run prevented the slot from executing during a PPR shell rebuild, the enclosing `<Suspense>` boundary would fail to register as a dynamic PPR hole or would cache `"build-default"` at build time.
- **Solution**:
  - Inside `DinouCacheSlot` (`dinou/core/cache-slot.js`), when `isPprBuildActive() && isInsideSuspense()` is true, any cached entry without `metadata?.inStaticShell` is bypassed during the PPR shell build (`cached = null`) so dynamic reads inside the slot are guaranteed to execute and trigger the PPR postpone.
  - Furthermore, the slot render promise explicitly detects `err.$$typeof === Symbol.for("dinou.ppr.postpone")` and `Symbol.for("react.postpone")`, evicts the in-flight key from `inflightSlotRenders`, skips `storage.set`, and rethrows the postpone error straight to the enclosing `<Suspense>` boundary.
  - Consequently, the `<Suspense>` boundary becomes a dynamic PPR hole at build time (`data-ppr-hole="ppr-hole-N"`), and `direct-cookie-slot` is only cached once a real runtime HTTP request evaluates the hole with live request cookies/headers.

### 2.3. Preventing Double Traversal of `<DinouCacheSlot>` Subtrees & Preserving React 19 Dev Descriptors
- **Files Modified**: `dinou/core/cache-slot.js`, `dinou/core/render-jsx-to-client-jsx.js`
- **Problem**:
  1. `<DinouCacheSlot>` is an async Server Component that resolves its own children via `asyncRenderJSXToClientJSX` (or `deserializeJSX` on a cache hit) and returns `<DinouCacheSlotBoundary id={slotId} tags={allTags}>{resolvedChildren}</DinouCacheSlotBoundary>`.
  2. When `asyncRenderJSXToClientJSX` executed `DinouCacheSlot`, it then recursively called `asyncRenderJSXToClientJSX` on the returned `<DinouCacheSlotBoundary>` element's `props.children`.
  3. If `<DinouCacheSlot>` wrapped a static `<Suspense>` boundary (e.g., `<DinouCacheSlot><Suspense>...</Suspense></DinouCacheSlot>`), this second pass incremented the PPR `holeIndex` counter a second time during Phase 1 (`ppr-hole-N` drift!), causing all subsequent dynamic `<Suspense>` holes on the page to mismatch their runtime hole IDs.
  4. Additionally, in React 19 development mode (`NODE_ENV=development`), React attaches non-enumerable property descriptors (`_debugStack`, `_debugTask`, `_debugInfo`) to JSX elements. Cloning `<DinouCacheSlotBoundary>` via object spread (`{ ...elem, __clientJsxAlreadyRendered: true }`) stripped those non-enumerable properties.
- **Solution**:
  - `wrapWithBoundary` in `dinou/core/cache-slot.js` now marks the returned `<DinouCacheSlotBoundary>` element with `__clientJsxAlreadyRendered: true` using `Object.defineProperties(Object.create(Object.getPrototypeOf(elem)), { ...Object.getOwnPropertyDescriptors(elem), __clientJsxAlreadyRendered: { value: true, enumerable: false, configurable: true } })`, preserving all React 19 enumerable and non-enumerable descriptors across `dev` and `prod`.
  - In `dinou/core/render-jsx-to-client-jsx.js`, when `isClientComponent(Component)` is true and `jsx.__clientJsxAlreadyRendered` is set, `asyncRenderJSXToClientJSX` returns the boundary element directly without re-traversing its already-rendered `props.children`.

### 2.4. Surgical `revalidateTag` Differentiation & On-Demand PPR Static Shell Regeneration
- **Files Modified**: `dinou/core/cache-slot.js`, `dinou/core/cache-revalidate.js`, `dinou/core/handler.js`
- **Problem**:
  - On a PPR page, a `<DinouCacheSlot>` can live in two very different places:
    1. **Inside the PPR Static Shell** (baked into `shell.html` and `shell.rsc`).
    2. **Inside a Dynamic PPR `<Suspense>` Hole** (streamed at request time via `streamDynamicHoles`; **not** present in `shell.html`).
  - If `revalidateTag("tag-hole-slot")` wiped `shell.html`, invalidating a micro-slot inside a dynamic hole would unnecessarily destroy the static PPR shell. Conversely, if `revalidateTag("tag-shell-slot")` only deleted `slots/<slotId>/slot.json` without invalidating and regenerating `shell.html`, subsequent page loads would either serve the old `shell.html` or fall back to non-PPR rendering!
- **Solution**:
  - `DinouCacheSlot` tracks whether a slot was committed as part of the static shell (`inStaticShell: true`) and only records `slotTags` into the route's `metadata.json` (`reqContext._slotTags`) for slots in the static shell.
  - When `revalidateTag("tag-hole-slot")` is called for a slot inside a dynamic PPR hole:
    - Only `.dinou/dist2/slots/<slotId>` is removed.
    - The route's `shell.html` and `metadata.json` are **untouched**, preserving instant `0ms TTFB` while the next request's `streamDynamicHoles` re-renders only that invalidated slot inside its hole.
  - When `revalidateTag("tag-shell-slot")` is called—or when `getSlotJSX` handles `/____rsc_slot____/:id?fresh=1` for a slot with `inStaticShell: true` (`options.currentPath`)—for a slot in the PPR static shell:
    - `.dinou/dist2/slots/<slotId>` is updated/removed **and** the route's cached `shell.html`, `shell.rsc`, `index.html`, `rsc.rsc`, and `metadata.json` are invalidated (`dinou/core/cache-revalidate.js` & `dinou/core/cache-slot.js`).
    - On the next request (or in `dev` mode when `shell.html` does not exist yet), `dinou/core/handler.js` regenerates `shell.html`, `shell.rsc`, and `metadata.json` inside `runWithPprContext({ isPpr: true })` with the fresh static-shell slot (reusing any other still-valid static-shell slots from `.dinou/dist2/slots/`) and serves the route via `handlePprResume`.

### 2.5. Cold-Start Nested Slot Discovery (`discoverFromRegisteredSlots`), Cloudflare `env.ASSETS` Slot Hydration & `/____rsc_slot____` Concurrency Deduplication
- **Files Modified**: `dinou/core/cache-slot.js`, `dinou/core/storage-adapter.js`, `dinou/core/cache-revalidate.js`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`
- **Problem**:
  - Suppose a dynamic PPR hole contains nested slots (`<DinouCacheSlot id="outer"><DinouCacheSlot id="inner">...</DinouCacheSlot></DinouCacheSlot>`).
  - After a cold server start, `slotRegistry` in memory is empty. When a request streams the PPR hole (or when `revalidateTag("tag-inner")` invalidates only the inner slot), `outer` hits its disk cache (`slots/outer/slot.json`) and calls `refreshNestedSlotsInTree` to re-render `inner`.
  - Because `outer` hit its disk cache, `outer`'s render function never executed in this process, so `inner` was not yet in `slotRegistry`!
  - Furthermore, while page-level slot rendering deduplicated concurrent cache misses via `inflightSlotRenders`, direct requests to `/____rsc_slot____/:id?fresh=1` (`getSlotJSX`) did not share an in-flight promise when hit concurrently.
- **Solution**:
  - `getSlotJSX` pre-evaluates the route and layout inside `runWithPprContext({ isPpr: true })`, and both `refreshNestedSlotsInTree` and `getSlotJSX` invoke `await discoverFromRegisteredSlots()`, which runs `entry.discover()` on registered outer slots to populate `slotRegistry` for nested inner slots even when outer slots were served from disk cache.
  - Added `getSlotFromStorage(storage, storageKey)` in `dinou/core/cache-slot.js` (paired with `markTagInvalidated` / `getTagInvalidatedAt` in `dinou/core/storage-adapter.js` and `slotRegistry` tag scanning in `dinou/core/cache-revalidate.js`) to transparently hydrate build-time `slots/<id>/slot.json` and `slot.metadata.json` from `platformContext.env.ASSETS` into KV/Memory storage when not yet present and not deleted or tag-invalidated since `generatedAt`.
  - `getSlotJSX` wraps `entry.render()` in `inflightSlotRenders` deduplication plus a `1000ms` query-keyed burst window (`recentFreshSlotRenders`, keyed by `${storageKey}::${queryKey}` and cleared on `revalidateTag`), while `fetchSlotRSC` (`dinou/core/client.jsx` and `dinou/core/client-webpack.jsx`) attaches a monotonic sequence counter (`?t=${Date.now()}-${slotSeq}`) so intentional consecutive client `refreshSlot(..., { fresh: true })` calls always receive a distinct query key while identical concurrent stampedes to `/____rsc_slot____/:id?fresh=1` execute the slot only once and share the resulting payload.

### 2.6. In-Place Client Fiber Reconciliation on Live `refreshSlot` (`dinou/core/slot.js`)
- **Files Modified**: `dinou/core/slot.js`
- **Problem**:
  - Previously, `DinouCacheSlotBoundary` returned `children` initially, and when `refreshSlot` was triggered, switched its return tree to `<SlotErrorBoundary><Suspense><SlotConsumer slotPromise={slotPromise} /></Suspense></SlotErrorBoundary>`.
  - Changing the wrapper element hierarchy on the first refresh caused React to unmount and remount any Client Component rendered **inside** the `<DinouCacheSlot>`, resetting its local `useState` hooks.
- **Solution**:
  - `DinouCacheSlotBoundary` now resolves the `window.__DINOU_FETCH_SLOT__` promise and updates `slotContent` inside `React.startTransition(() => setSlotContent(resolved))`, returning `slotContent !== null ? slotContent : children`. Because the Fiber tree depth remains identical before and after `refreshSlot`, Client Components inside the slot update their props (`slotToken`) in place while preserving all local `useState` state.

### 2.7. Clock-Based `<DinouCacheSlot revalidate={1}>` TTL Expiration in PPR Static Shells, Streamed Dynamic Holes & Standalone Static Host Pages
- **Files Modified**: `dinou/core/handler.js`, `dinou/core/cache-slot.js`, `dinou/core/cache-revalidate.js`
- **Problem**:
  - When a `<DinouCacheSlot revalidate={1}>` was placed inside the **PPR Static Shell** (`inStaticShell: true`), its clock expiration needed to lazily update `shell.html`, `shell.rsc`, and `shell.page.json` via `revalidatePage(..., { onlyRefreshSlots: true })` without re-executing the outer PPR page shell (`getProps` / `page.tsx`) or `3600s` sibling shell slots.
  - Conversely, when a `<DinouCacheSlot revalidate={1}>` was placed inside a **Dynamic PPR `<Suspense>` Hole** (`inStaticShell: false`), its clock expiration needed to regenerate `slots/<id>/slot.json` via SWR during `streamDynamicHoles` without touching `shell.html`.
- **Solution**:
  - `handler.js` inspects `slot.metadata.json` for static-shell `slotTags` on PPR routes as well as classic static routes: when a static-shell slot's TTL expires by clock, it triggers background `revalidatePage(reqPathWithSlash, { onlyRefreshSlots: true })`, updating the slot inside `shell.html` and `shell.page.json` while keeping the outer PPR shell and `3600s` sibling slots frozen.
  - Inside streamed dynamic holes, `DinouCacheSlot` detects `now > generatedAt + revalidate * 1000` during `streamDynamicHoles` and triggers background slot revalidation while keeping `shell.html` 100% untouched.

---

## 3. Developer Guide: What Possibilities Does This Synergy Unlock?

From a user/developer standpoint, PPR and `<DinouCacheSlot>` compose naturally without any special configuration flags beyond `export const ppr = true` in `page_functions.ts` (or `layout_functions.ts` / `dinou.config.js`). Below are the 6 major architectural patterns you can build.

### Pattern 1: Micro-ISR Inside a Per-Request Dynamic PPR Hole
You have a personalized section that reads `cookies` / `headers` / `query` (so it must be a dynamic PPR `<Suspense>` hole), but inside that personalized section there is an expensive computation or database/API query that only needs to refresh every N seconds or when a tag is invalidated.

```tsx
// src/dashboard/page_functions.ts
export const ppr = true;
```

```tsx
// src/dashboard/page.tsx
import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";

async function PersonalizedFeedHole() {
  const ctx = getContext();
  const user = ctx?.req?.cookies?.session_user ?? "guest";
  const filter = ctx?.req?.query?.filter ?? "all";

  return (
    <section>
      {/* Renders fresh on EVERY request (streamed via PPR hole) */}
      <h2>Welcome back, {user} (Filter: {filter})</h2>

      {/* Cached across requests for 1 hour (or until revalidateTag("global-stats")) */}
      <DinouCacheSlot id="dashboard-global-stats" tag="global-stats" revalidate={3600}>
        {async () => {
          const stats = await computeHeavyGlobalStats();
          return <StatsGrid data={stats} />;
        }}
      </DinouCacheSlot>
    </section>
  );
}

export default function DashboardPage() {
  return (
    <main>
      <h1>Instant Static Shell Header (0ms TTFB)</h1>
      <Suspense fallback={<div>Streaming personalized feed...</div>}>
        <PersonalizedFeedHole />
      </Suspense>
    </main>
  );
}
```
**What happens:**
1. `<h1>Instant Static Shell Header</h1>` and `<div>Streaming personalized feed...</div>` arrive at `0ms TTFB` from `shell.html`.
2. `PersonalizedFeedHole` runs on the server with the live request's `session_user` cookie and `filter` query param.
3. Inside `PersonalizedFeedHole`, `<DinouCacheSlot id="dashboard-global-stats">` does **not** re-run `computeHeavyGlobalStats()` on every request—it reads `slots/dashboard-global-stats/slot.json` and streams the complete hole immediately.

---

### Pattern 2: Live-Refreshable `<DinouCacheSlot>` Inside the PPR Static Shell (Layout or Page)
You can place `<DinouCacheSlot>` directly in the **static shell** of a PPR layout or page. At build time, it is baked into `shell.html` for instant initial load, but unlike plain static HTML:
- Calling `refreshSlot("ppr-shell-slot", { fresh: true })` from any Client Component updates just that widget in place in the browser without reloading the page.
- Calling `revalidateTag("tag-shell-slot")` in a Server Action invalidates both the slot cache and `shell.html`, regenerating the static PPR shell with the updated slot while keeping all other static-shell slots cached.

```tsx
<header>
  <DinouCacheSlot id="ppr-shell-slot" tag="tag-shell-slot" revalidate={3600}>
    <LiveAnnouncementBanner />
  </DinouCacheSlot>
</header>
```

---

### Pattern 3: Nested `<DinouCacheSlot>` Hierarchy Inside a Streamed PPR Hole
You can nest `<DinouCacheSlot>` boundaries inside a dynamic PPR hole (`Outer Slot -> Inner Slot`) with independent TTLs and tags:

```tsx
<Suspense fallback={<div>Streaming analytics hole...</div>}>
  <DynamicDepartmentHeader /> {/* reads req.cookies.dept */}
  <DinouCacheSlot id="dept-outer-slot" tag="tag-dept-outer" revalidate={3600}>
    <div className="outer-panel">
      <QuarterlySummary />
      <DinouCacheSlot id="dept-inner-slot" tag="tag-dept-inner" revalidate={60}>
        <LiveTickerMetrics />
      </DinouCacheSlot>
    </div>
  </DinouCacheSlot>
</Suspense>
```
- Calling `revalidateTag("tag-dept-inner")` or `router.refreshSlot("dept-inner-slot", { fresh: true })` re-renders **only** `dept-inner-slot` (`<LiveTickerMetrics />`) while `dept-outer-slot` (`<QuarterlySummary />`) remains cached!
- Calling `refreshSlot("*", { fresh: true })` refreshes both outer and inner slots simultaneously.

---

### Pattern 4: Mixing Cached (`revalidate > 0`) and Real-Time No-Cache (`revalidate={0}`) Slots Inside a PPR Hole
Inside the same `<Suspense>` PPR hole, you can combine a cached slot (`revalidate={3600}`) with an always-fresh slot (`revalidate={0}`):
- The `revalidate={0}` slot bypasses disk storage on every request (and on every `refreshSlot` call), while still giving you a `<DinouCacheSlotBoundary>` in the DOM that you can re-fetch on demand from the client via `refreshSlot("realtime-slot-id")` without re-streaming the rest of the PPR hole.

---

### Pattern 5: Interactive `"use client"` Widgets & `"use server"` Actions Inside a Slot Streamed by a PPR Hole
A `<DinouCacheSlot>` inside a dynamic PPR hole can render `"use client"` components and pass `"use server"` Server Actions either via direct import or as function props:

```tsx
<Suspense fallback={<div>Streaming interactive hole...</div>}>
  <DinouCacheSlot id="ppr-client-slot" tags={["tag-client", "tag-shared"]} revalidate={3600}>
    {async () => {
      const token = await generateSlotToken();
      return (
        <ClientInteractiveWidget
          slotToken={token}
          onActionProp={myServerAction} // "use server" function passed as prop!
        />
      );
    }}
  </DinouCacheSlot>
  <DynamicSiblingCookieReader />
</Suspense>
```
- Even when `<DinouCacheSlot>` is served from `slot.json` inside a streamed PPR `<template>` chunk, Dinou preserves both `"use client"` references and `"use server"` Server Action references (`Symbol.for("react.server.reference")`).
- Calling `refreshSlot("tag-client", { fresh: true })` updates `slotToken` inside `<ClientInteractiveWidget>` **without resetting its local `useState` hooks** and while keeping `onActionProp` fully bound and callable!

---

### Pattern 6: Direct Request Cookie/Header Read Inside a `<DinouCacheSlot>` Wrapped in `<Suspense>`
If a `<DinouCacheSlot>` itself reads `getContext().req.cookies` or `headers` inside a `<Suspense>` boundary on a PPR page:
- At build time (Phase 1), Dinou detects the dynamic read inside the slot, aborts caching the build-time fallback, and turns the enclosing `<Suspense>` into a dynamic PPR hole.
- On the first real runtime request, the slot executes with the live request context and caches the resulting JSX for its configured `revalidate` window (or until `revalidateTag` / `refreshSlot(..., { fresh: true })` is called).

---

## 4. Lifecycle Summary Matrix

| Component Location on a PPR Page | Build Time (`shell.html`) | Normal Runtime Request | `revalidateTag(slotTag)` on Server | `refreshSlot(idOrTag, { fresh: true })` in Browser |
| :--- | :--- | :--- | :--- | :--- |
| **Static Shell `<DinouCacheSlot>`** (outside `<Suspense>` or in static `<Suspense>`) | Rendered & baked into `shell.html` + saved in `slots/<id>/slot.json` (`inStaticShell: true`) | Served instantly (`0ms TTFB`) inside `shell.html` | Deletes `slots/<id>` **and** invalidates `shell.html` so next request rebuilds shell with fresh slot | Updates slot DOM in place via `/____rsc_slot____/:id?fresh=1` (while preserving all client state) **and** invalidates host `shell.html` so subsequent full-page loads stay in sync |
| **Uncached Dynamic `<Suspense>` Hole** (reads `cookies`/`headers`/`query`) | Replaced with `<div data-ppr-hole="ppr-hole-N">` fallback in `shell.html` | Executed per request in `streamDynamicHoles` and streamed as `<template>` + inline swap `<script>` | N/A (always executes per request) | N/A |
| **Cached `<DinouCacheSlot>` Inside Dynamic `<Suspense>` Hole** | Postponed with its enclosing hole (not written to disk at build time) | Enclosing hole runs per request, but the slot inside it hits `slots/<id>/slot.json` (Micro-ISR) | Deletes **only** `slots/<id>` (`shell.html` remains intact!) | Updates **only** that slot inside the already-streamed hole without re-streaming the hole or losing hole client state |
| **Nested `<DinouCacheSlot>` (`Outer -> Inner`) Inside Dynamic Hole** | Postponed with enclosing hole | Both `outer` and `inner` hit cache; if `inner` is invalidated, `refreshNestedSlotsInTree` re-renders only `inner` inside cached `outer` | Invalidating `inner` tag leaves `outer` and `shell.html` cached | `refreshSlot("inner")` updates only `inner` DOM while `outer` and sibling states remain untouched |

---

## 5. E2E Verification Suite (`src/t-rigorous-sinergy`)

The complete PPR + `<DinouCacheSlot>` synergy is continuously verified in GitHub Actions across **Esbuild, Rollup, and Webpack** (in both **Dev** and **Prod** modes and across **Chromium, Firefox, and WebKit**) via:
- **Route**: `src/t-rigorous-sinergy/` (`page.tsx`, `layout.tsx`, `page_functions.ts`, `layout_functions.ts`, `synergy-client.tsx`, `actions.ts`)
- **Playwright Spec**: `e2e/example.spec.ts` → `PPR + DinouCacheSlot Synergy: Rigorous Casuistics (/t-rigorous-sinergy)`:
  1. **Raw Wire Streaming Protocol**: Verifies `shellPart` vs `streamPart` separation, all 5 dynamic hole markers (`data-ppr-hole="ppr-hole-1"`, `"ppr-hole-4"`, `"ppr-hole-5"`, `"ppr-hole-6"`, `"ppr-hole-7"` across layout and page), static `<Suspense>` + `<DinouCacheSlot>` resolution inside `shellPart` without hole ID drift, per-request dynamic hole updates alongside cached inner slots, `revalidate={0}` per-request slot regeneration, and build-time cache-poisoning prevention for direct cookie reads inside `<DinouCacheSlot>`.
  2. **Surgical `revalidateTag` on Dynamic-Hole Slots vs. Static-Shell Slots**: Verifies that invalidating inner hole slots (`tag-syn-hole-slot-a`, `tag-syn-nested-inner`) updates only those slots on the next request while keeping `ppr-syn-nested-outer` and `shell.html` intact, and that invalidating `tag-syn-shell-slot` regenerates `shell.html` with a fresh shell slot token.
  3. **Live `refreshSlot` Across All 3 Hierarchy Levels**: Verifies live client-side slot refreshes by ID, by tag, via `useRouter().refreshSlot` on a nested inner slot, on a static-shell slot, and via wildcard `refreshSlot("*", { fresh: true })`, while preserving React client state in the static shell (`#syn-shell-client-counter`), inside PPR Hole #1 (`#syn-hole-outer-counter`), and inside the slot's own Client Component (`#syn-slot-widget-clicks`), as well as verifying direct and prop-passed `"use server"` actions before and after live slot refresh.
  4. **Direct `/____rsc_slot____` Endpoint & Concurrency Stampede Deduplication**: Verifies that 6 simultaneous `?fresh=1` requests to a slot inside a PPR route are deduplicated via `inflightSlotRenders` and return identical RSC Flight payloads.
  5. **Clock-Based `<DinouCacheSlot revalidate={1}>` TTL Expiration in PPR Static Shell & Dynamic Hole (`/t-rigorous-sinergy`)**: Verifies that after waiting `1250ms` without calling `revalidateTag`, both the 1s-TTL slot in the PPR static shell (`syn-ttl-shell-slot-token`) and the 1s-TTL slot inside a streamed dynamic PPR hole (`syn-ttl-hole-slot-token`) regenerate automatically by clock while `3600s` sibling slots (`syn-shell-slot-token`, `syn-hole-slot-a-token`) remain cached.
  6. **Standalone Non-PPR Static Host Page + `<DinouCacheSlot>` Clock-Based TTL Expiration (`/t-rigorous-sinergy/static-host`)**: Verifies on a non-PPR static host page (`export const ppr = false`, `export const revalidate = 1`) that the 1s-TTL host page (`syn-static-host-page-token`) and 1s-TTL slot (`syn-static-host-fast-slot-token`) regenerate after `1250ms` while the `3600s` cached slot (`syn-static-host-cached-slot-token`) stays preserved across page ISR rebuilds.
