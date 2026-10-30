# Vertical Segmentation (`DinouCacheSlot` & `refreshSlot`) in Dinou — Architecture, v9.0.3 Fixes & Reference Guide

This document provides a complete technical overview of **Vertical Segmentation (Micro-ISR)** in Dinou via `<DinouCacheSlot>` and `refreshSlot`, the architectural fixes implemented in **v9.0.3**, how server-side slot caching and live client-side slot refreshing work under the hood, usage patterns for `dinou-docs`, and a detailed breakdown of the E2E test suites developed to verify all edge cases.

---

## 1. Overview: Horizontal vs. Vertical Segmentation in Dinou

Dinou supports two complementary axes of component segmentation in React Server Components (RSC):

1. **Horizontal Segmentation (Layouts vs. Pages)**:
   - Route segments (`layout.tsx` vs. `page.tsx`) are cached, revalidated (`revalidatePath`, `revalidateLayout`, `revalidatePage`), and fetched (`/____rsc_layout____`, `/____rsc_page____`) independently across client-side navigations.
2. **Vertical Segmentation (`<DinouCacheSlot>` & `refreshSlot` — Micro-ISR)**:
   - Any arbitrary Server Component subtree **inside** a page or layout can be wrapped in `<DinouCacheSlot>` with its own independent cache lifecycle (`id`, `tag` / `tags`, and `revalidate` TTL in seconds).
   - Even if the host page is **100% dynamic** (`revalidate: () => 0`), each `<DinouCacheSlot>` caches its resolved RSC element tree in Dinou's pluggable Storage Adapter (`FileSystemStorage` in `.dinou/dist2/slots/<slotId>/slot.json`, `CloudflareKVStorage`, `DenoKVStorage`, `RedisStorage`, or `MemoryStorage`).
   - Conversely, even if the host page is **100% static** (pre-rendered at build time) or uses **Partial Prerendering (PPR)**, individual slots inside it can be invalidated on demand via `revalidateTag(tag)` or refreshed live in the browser without a page reload via `refreshSlot(idOrTag, { fresh?: boolean })`.

---

## 2. How `<DinouCacheSlot>` and `refreshSlot` Work Under the Hood

### 2.1. Server-Side Rendering & Serialization (`dinou/core/cache-slot.js`)
When `<DinouCacheSlot id="my-slot" tags={["tag-a", "tag-b"]} revalidate={60}>` executes on the server:
1. **Canonical Slot Identity**:
   - Uses `id || tag || tags[0]` as `slotId` and stores artifacts under `slots/${slotId}/slot.json` (plus `slot.metadata.json` on filesystem storage).
2. **In-Memory Registry (`slotRegistry`)**:
   - Registers `{ render, discover, tags, revalidate }` in `globalThis[Symbol.for("dinou.slot.registry")]` so `/____rsc_slot____/:id` can re-evaluate the slot on demand.
3. **Host Page Slot-Tag Tracking**:
   - Records `allTags` onto the active request context (`reqContext._slotTags`) so static/ISG/PPR host pages record `slotTags: [...]` in their `metadata.json`.
4. **Cache Lookup & TTL / Stale-While-Revalidate (SWR)**:
   - **`revalidate === 0` (No-Cache)**: Bypasses storage cache completely and always renders fresh on both SSR and `/____rsc_slot____/:id`.
   - **Cache HIT (within TTL or infinite TTL)**: Deserializes `slot.json` back into a React 19 element tree via `deserializeJSX`, refreshes any invalidated nested `<DinouCacheSlot>` descendants via `refreshNestedSlotsInTree`, and wraps the subtree in `<DinouCacheSlotBoundary id={slotId} tags={allTags}>`.
   - **Cache EXPIRED (`revalidate > 0` and `now > generatedAt + revalidate * 1000`)**: Immediately returns the stale deserialized JSX tree (zero latency spike) and triggers a deduplicated background revalidation (`backgroundRevalidations` + `ctx.waitUntil`) that updates `slots/${slotId}/slot.json`.
   - **Cache MISS**: Deduplicates concurrent renders via `inflightSlotRenders` (preventing cache stampedes when multiple requests hit a cold slot simultaneously), evaluates `children` via `asyncRenderJSXToClientJSX`, serializes the result with `serializeJSX` (preserving Symbols, React 19 transitional elements, `"use client"` references, and `"use server"` Server Action references), persists to `storage`, and returns the wrapped boundary.

### 2.2. Live Client-Side Slot Refresh (`dinou/core/navigation.js` & `dinou/core/slot.js`)
1. Calling `refreshSlot(idOrTag, { fresh?: boolean })` (imported from `"dinou"` or via `useRouter().refreshSlot(...)`) dispatches a browser `CustomEvent("dinou:refresh-slot", { detail: { id: idOrTag, options } })`.
2. Every mounted `<DinouCacheSlotBoundary id={slotId} tags={allTags}>` listens for `"dinou:refresh-slot"` and matches if:
   - `e.detail.id === id` (exact slot ID match),
   - `e.detail.id === "*"` (wildcard refresh of all mounted slots on the page), or
   - `Array.isArray(tags) && tags.includes(e.detail.id)` (tag match).
3. Matching boundaries call `window.__DINOU_FETCH_SLOT__(id, options)`, which fetches `/____rsc_slot____/${encodeURIComponent(id)}?t=${Date.now()}-${slotSeq}${options?.fresh ? "&fresh=1" : ""}` with header `X-Dinou-Current-Path: window.location.pathname`.
4. Once the streamed Flight RSC payload promise resolves, `DinouCacheSlotBoundary` commits the resolved React tree inside `React.startTransition(() => setSlotContent(resolved))` and returns `slotContent !== null ? slotContent : children`. Because the Fiber tree depth remains identical before and after the refresh, React reconciles the subtree in place—preserving all page state, sibling state, and even local `useState` hooks inside Client Components mounted **inside** the refreshed slot itself.

---

## 3. Architectural Fixes Implemented in Dinou (v9.0.3)

During rigorous auditing (`src/cache-slot-test` in `test-9.0.2` and `src/t-rigorous-cache-slot` / `src/t-rigorous-sinergy` in `dinou-e2e`), the following core fixes were implemented:

### 3.1. Cold-Start Route, Layout & Nested Slot Pre-Evaluation in `getSlotJSX`
- **Files Modified**: `dinou/core/cache-slot.js`
- **Problem**:
  - When a server process booted in production and served a pre-rendered static page (`index.html` or `shell.html`), no Server Components had executed yet in memory (`slotRegistry` was empty).
  - If a client called `refreshSlot("my-slot", { fresh: true })` (or after `revalidateTag` deleted `slot.json`), `getSlotJSX` called `await getJSX(options.currentPath, ..., { segment: "page" })` without calling `asyncRenderJSXToClientJSX()`. Because `getJSX` only returns an uninvoked `React.createElement(Page, props)`, `DinouCacheSlot` never ran, `slotRegistry` remained empty, and `/____rsc_slot____/:id` returned `404`.
  - Furthermore, `{ segment: "page" }` skipped `layout.tsx`, so slots defined inside layouts also returned `404` on cold start.
- **Solution**:
  - `getSlotJSX` now evaluates `await asyncRenderJSXToClientJSX(pageJsx)` inside `runWithPprContext({ isPpr: true })` when pre-evaluating `options.currentPath` (so any `<Suspense>` boundaries that read dynamic request data catch their PPR postpone cleanly without aborting traversal of sibling slots).
  - Concurrent cold-start requests to the same `options.currentPath` share a single in-flight pre-evaluation promise in `preEvaluatingRoutes` (`Map<route, Promise>`).
  - Discovery passes (`entry.discover()` and `preEvaluatingRoutes`) run inside an `AsyncLocalStorage` scope (`slotDiscoveryStorage`) so concurrent requests on other routes or workers are never affected by a discovery pass in progress.
  - If the slot is still not in `slotRegistry`, `getSlotJSX` evaluates the full route including layouts (`await getJSX(options.currentPath, {}, isNotFound, false, false)` + `await asyncRenderJSXToClientJSX(fullJsx)`).
  - If still not found (e.g., a nested slot inside an outer slot that hit its disk cache during route pre-evaluation), `getSlotJSX` invokes `await entry.discover()` on registered outer slots (`discoverFromRegisteredSlots`) to discover and register nested slots.

### 3.2. Strict `revalidate={0}` (No-Cache) Support
- **Files Modified**: `dinou/core/cache-slot.js`
- **Problem**:
  - Although `<DinouCacheSlot>`'s JSDoc specified `revalidate: 0 = no-cache, >0 = ISR`, both `DinouCacheSlot` and `getSlotJSX` checked `revalidateSeconds > 0` for expiration. Setting `revalidate={0}` caused `isExpired` to evaluate to `false` forever, freezing the slot in cache indefinitely.
- **Solution**:
  - Both `DinouCacheSlot` and `getSlotJSX` now treat `revalidate === 0` (`revalidateSeconds === 0`) as `isNoCache = true`, bypassing storage reads/writes and rendering fresh on every request.

### 3.3. Tag-Based `refreshSlot(tag)` Support on Client and Server
- **Files Modified**: `dinou/core/slot.js`, `dinou/core/cache-slot.js`
- **Problem**:
  - `refreshSlot(slotId)` documented `@param {string} slotId The ID or tag of the slot to refresh`. However, when a slot defined both `id="slot-alpha"` and `tag="tag-alpha"`, calling `refreshSlot("tag-alpha")` failed because `DinouCacheSlotBoundary` only received `id` (not `tags`) and `getSlotJSX` only looked up `slotId` by ID.
- **Solution**:
  - `DinouCacheSlot` now passes `tags: allTags` to `DinouCacheSlotBoundary`, which matches `e.detail.id === id || e.detail.id === "*" || (Array.isArray(tags) && tags.includes(e.detail.id))` and fetches using the boundary's canonical `id`.
  - On the server, `getSlotJSX` uses `resolveCanonicalSlotId(slotIdOrTag, storage)` to resolve tag names against `slotRegistry` entries and `slots/*/slot.metadata.json`.

### 3.4. Preserving `"use server"` Server Action References Inside Cached Slots
- **Files Modified**: `dinou/core/cache-slot.js`
- **Problem**:
  - `serializeJSX` handled Client Component references (`Symbol.for("react.client.reference")`) but ignored Server Function references (`Symbol.for("react.server.reference")`). Because Server Functions have `typeof value === "function"`, `JSON.stringify` stripped any Server Action passed as a prop to a Client Component inside `<DinouCacheSlot>` (turning `onPingProp={myServerAction}` into `undefined` on every cache hit).
- **Solution**:
  - `serializeJSX` now serializes `Symbol.for("react.server.reference")` as `{ __dinou_server_ref__: true, id: value.$$id, bound: value.$$bound || null }`.
  - `deserializeJSX` reconstructs the Server Function reference and registers it via `registerServerReference` (restoring bound arguments via `.bind` if present).

### 3.5. Nested `<DinouCacheSlot>` Isolation & Rehydration (`refreshNestedSlotsInTree`)
- **Files Modified**: `dinou/core/cache-slot.js`
- **Problem**:
  - When an outer `<DinouCacheSlot id="outer" tag="tag-outer">` wrapped an inner `<DinouCacheSlot id="inner" tag="tag-inner">`, the outer slot serialized the inner slot's resolved HTML/JSX inside `slots/outer/slot.json`.
  - Calling `revalidateTag("tag-inner")` deleted `slots/inner/slot.json`, but on subsequent page reloads `outer` hit `slots/outer/slot.json` and returned the stale inner slot content without checking `inner`.
- **Solution**:
  - Each `DinouCacheSlotBoundary` element is tagged with `__dinou_slot__: slotId`.
  - Whenever an outer slot hits its cache in `DinouCacheSlot` or `getSlotJSX`, `refreshNestedSlotsInTree(restored, slotId)` walks the deserialized element tree and replaces any descendant `<DinouCacheSlotBoundary __dinou_slot__={nestedSlotId}>`'s children with `await getSlotJSX(nestedSlotId)`.
  - As a result, invalidating `"tag-inner"` updates the inner slot while keeping the outer slot cached!

### 3.6. Static & PPR Host Page `slotTags` Invalidation, Fast Metadata Scanning & `slots/` Key Disambiguation
- **Files Modified**: `dinou/core/handler.js`, `dinou/core/cache-revalidate.js`, `dinou/core/storage-adapter.js`, `dinou/node/dev.js`
- **Problem**:
  1. When a static or PPR page embedded `<DinouCacheSlot tag="my-slot-tag">` in its static shell, calling `revalidateTag("my-slot-tag")` deleted `slots/my-slot/slot.json`, but the page's `index.html` / `shell.html` in `.dinou/dist2` had no record that it contained `"my-slot-tag"`, continuing to serve stale HTML on page reload.
  2. `FileSystemStorage` (`dinou/core/storage-adapter.js`) and `revalidateTag` (`dinou/core/cache-revalidate.js`) checked `key.includes("slot")` to detect slot storage keys. Any page route whose URL path contained the substring `"slot"` (such as `/t-cache-slot` or `/cache-slot-test`) was misclassified as a slot artifact!
  3. On `FileSystemStorage`, `revalidateTag` scanned all keys in `.dinou/dist2` and called `storage.get(key)` on large `index.html`, `shell.html`, and `layout.rsc` files unnecessarily.
- **Solution**:
  - `DinouCacheSlot` records rendered static-shell slot tags on `reqContext._slotTags`, and `handler.js` persists `genMeta.slotTags = Array.from(context._slotTags)` in the page's `metadata.json`.
  - In `revalidateTag(tag)` (`dinou/core/cache-revalidate.js`), matching `slots/<id>/slot.json` keys are deleted **first**, and any static or PPR host page whose `meta.slotTags` includes `tag` has its cached `index.html` / `shell.html` / `shell.rsc` / `metadata.json` / `page.rsc` / `rsc.rsc` evicted so the next request regenerates the static shell with the fresh slot (while all other slots on that page still hit their `slots/<other>/slot.json` cache).
  - Optimized `revalidateTag` on `FileSystemStorage` to read only `*metadata.json` files (`slot.metadata.json`, `layout.metadata.json`, `metadata.json`), reducing tag invalidation latency to a few milliseconds.
  - Updated `dinou/node/dev.js` to clear `.dinou/dist2/slots` on dev server startup so stale slot artifacts from previous builds do not trigger SWR on the first dev request.

### 3.7. Preserving React 19 Development Properties (`_debugStack`, `_debugTask`, `_debugInfo`) in `asyncRenderJSXToClientJSX`
- **Files Modified**: `dinou/core/render-jsx-to-client-jsx.js`, `dinou/core/cache-slot.js`
- **Problem**:
  - When `<DinouCacheSlot revalidate={0}>` bypassed `serializeJSX`/`deserializeJSX` (which reconstructs elements via `React.createElement`) and returned `await asyncRenderJSXToClientJSX(childElement)` directly, `asyncRenderJSXToClientJSX` cloned elements using object spread (`{ ...jsx, props: ..., key: ... }`).
  - Because React 19 defines `_debugStack`, `_debugTask`, `_debugInfo`, `ref`, and `_store.validated` as non-enumerable properties in development mode (`NODE_ENV !== "production"`), object spread stripped them.
  - When `react-server-dom-webpack/server.edge` serialized those cloned elements in `dev` mode (`dev:esbuild`, `dev:rollup`, `dev:webpack`), it logged `"Attempted to render <div> without development properties"` and crashed inside `parseStackTrace(task.debugStack, 1)` with `TypeError: Cannot read properties of undefined (reading 'stack')`, aborting the SSR stream.
- **Solution**:
  - Added `cloneWithDevProps(jsx, renderedProps, resolvedKey)` in `dinou/core/render-jsx-to-client-jsx.js` and descriptor-preserving cloning in `wrapWithBoundary` (`dinou/core/cache-slot.js`), copying the non-enumerable property descriptors (`_owner`, `_store`, `ref`, `_debugInfo`, `_debugStack`, `_debugTask`) from the original React element onto the cloned element.

### 3.8. Edge/Deno KV, Cloudflare `env.ASSETS` Slot Hydration & Burst Coalescing Parity
- **Files Modified**: `dinou/core/handler.js`, `dinou/core/cache-slot.js`, `dinou/core/storage-adapter.js`, `dinou/core/cache-revalidate.js`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`, `dinou/deno/seed-kv.js`, `dinou/deno/build.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`
- **Problem**:
  1. In `dinou/core/handler.js` (Segmented RSC Payload Endpoint `/____rsc_page_static____/*`), `if (isEdgeRuntime(platformContext))` was followed by `if (existsSync(payloadPath))` instead of `else if (existsSync(payloadPath))`. On Deno (`start:deno`), when `revalidateTag` deleted a static host page from `DenoKVStorage` (`.dinou/kv.db`) and Edge ISG regenerated `index.html`, Edge ISG did not write `page.rsc` to `DenoKVStorage`. When the browser hydrated the reloaded page and requested `/____rsc_page_static____/...`, `storage.get(".../page.rsc")` returned `null` and fell through to `if (existsSync(payloadPath))`, serving the stale build-time `.dinou/dist2/.../page.rsc` from disk and overwriting the fresh DOM with the build-time slot token!
  2. `DenoKVStorage.keys(prefix)` passed `["dinou_cache", prefix]` to `kv.list()`, which in Deno KV treats `prefix` as an exact key segment rather than a string prefix, and `dinou/deno/seed-kv.js` did not seed `slots/*/slot.json` and `slot.metadata.json` into `.dinou/kv.db`.
  3. `dinou/deno/build.js`, `dinou/cloudflare/build.js`, and `dinou/bun/build.js` lacked the `candidateSlotPaths` / `slotChunkId` client manifest fallback mappings present in `dinou/node/bundle-dual-engine.js`.
- **Solution**:
  - Changed `if (existsSync(payloadPath))` to `else if (existsSync(payloadPath))` in `dinou/core/handler.js`, and updated Edge ISG (`shouldCacheISG`) to also render and store `page.rsc` (`segment: "page"`) in `storage` alongside `rsc.rsc`, `index.html`, and `metadata.json` (preserving `tags` and `slotTags` across Edge ISR/ISG).
  - Guarded `platformContext.env.ASSETS` fallback in `dinou/core/handler.js` with `storage.isDeleted(...)` (`_deletedKeys` in `storage-adapter.js`) so invalidated static routes/RSC payloads are never resurrected from immutable Cloudflare `env.ASSETS`.
  - Fixed `DenoKVStorage.keys(prefix)` to list `["dinou_cache"]` and filter `entry.key[1].startsWith(prefix)`, updated `dinou/deno/seed-kv.js` to seed `slot.json` and `slot.metadata.json`, and added `candidateSlotPaths` / `slotChunkId` mappings to `dinou/deno/build.js`, `dinou/cloudflare/build.js`, and `dinou/bun/build.js`.
  - Added `getSlotFromStorage(storage, storageKey)` in `dinou/core/cache-slot.js` (paired with `markTagInvalidated` / `getTagInvalidatedAt` in `dinou/core/storage-adapter.js` and `slotRegistry` tag scanning in `dinou/core/cache-revalidate.js`) to hydrate build-time `slots/<id>/slot.json` and `slot.metadata.json` from `platformContext.env.ASSETS` into runtime KV/Memory storage when not yet present and not deleted or tag-invalidated since `generatedAt`.
  - When `getSlotJSX` refreshes a static-shell slot (`inStaticShell: true`) with `{ fresh: true }` and `options.currentPath`, it also invalidates the host route's `index.html`, `shell.html`, `metadata.json`, `shell.rsc`, and `rsc.rsc` so subsequent full-page requests stay synchronized with `slots/<id>/slot.json`.
  - Checked `inflightSlotRenders` and sliding-window `recentFreshSlotRenders` (`500ms` sliding burst window keyed by `${storageKey}::${queryKey}`, updated both before and after `storage.set`) at the top of `getSlotJSX` before issuing KV/SQLite storage reads, paired with monotonic `?t=${Date.now()}-${slotSeq}` in `dinou/core/client.jsx` and `dinou/core/client-webpack.jsx` so queued waves of identical concurrent `?fresh=1` requests coalesce cleanly across `wrangler dev`, Deno, and Node.

---

## 4. Complete API Reference & Usage Patterns for `dinou-docs`

From a developer's perspective, `<DinouCacheSlot>`, `refreshSlot`, and `revalidateTag` offer a much richer set of capabilities than basic component caching. Below is the complete API reference and the **10 usage patterns** you can leverage in an application.

---

### 4.1. Complete API Reference

#### `<DinouCacheSlot>` (Server Component)
```tsx
import { DinouCacheSlot } from "dinou"; // or "dinou/server"
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` (optional) | `tag \|\| tags[0] \|\| "anonymous-slot"` | Unique identifier for the slot cache entry (`slots/<id>/slot.json`). Can be omitted if `tag` or `tags` is provided. |
| `tag` | `string` (optional) | `undefined` | Single cache tag for surgical invalidation via `revalidateTag(tag)` or live client refresh via `refreshSlot(tag)`. |
| `tags` | `string[]` (optional) | `[]` | Array of cache tags (merged and deduplicated with `tag`). Ideal for grouping multiple slots under a shared invalidation tag alongside individual tags. |
| `revalidate` | `number` (optional) | `undefined` (infinite until invalidated) | TTL in seconds:<ul><li>**`undefined`**: Cached indefinitely until `revalidateTag` or `refreshSlot(..., { fresh: true })`.</li><li>**`> 0`**: Micro-ISR TTL in seconds. Serves cached slot and triggers Stale-While-Revalidate (SWR) in the background once expired.</li><li>**`0`**: **Strict No-Cache**. Bypasses disk/KV cache on every render, while still mounting a `<DinouCacheSlotBoundary>` in the DOM so it can be live-refreshed from the client on demand.</li></ul> |
| `children` | `ReactNode \| (() => ReactNode \| Promise<ReactNode>)` | Required | Either standard JSX (`<MyAsyncServerComponent />`) or an **inline async/sync function** (`{async () => { ... }}`) so you can write inline async data fetching without extracting a separate component. |

#### `refreshSlot` & `useRouter().refreshSlot` (Client APIs)
```tsx
import { refreshSlot, useRouter } from "dinou";
```
- **`refreshSlot(idOrTag: string, options?: { fresh?: boolean }): void`**
- **`useRouter().refreshSlot(idOrTag: string, options?: { fresh?: boolean }): void`**
  - **`idOrTag`**: Can be a slot's `id`, any of its `tag` / `tags`, or **`"*"`** (wildcard to refresh all mounted slots in the current layout + page). If multiple mounted slots share a tag, calling `refreshSlot("shared-tag")` refreshes all of them simultaneously.
  - **`options.fresh`**:
    - `false` (default): Fetches `/____rsc_slot____/:id` allowing a server cache hit (ideal right after calling a Server Action that already ran `revalidateTag(tag)`).
    - `true`: Forces `/____rsc_slot____/:id?fresh=1` to bypass the slot cache, re-execute the Server Component on the server, overwrite `slots/<id>/slot.json` (and invalidate any static/PPR host shell), and reconcile the new UI in place.

#### `revalidateTag` (Server API)
```tsx
import { revalidateTag } from "dinou";
```
- **`await revalidateTag(tag: string): Promise<void>`**
  - Deletes all `slots/<id>/slot.json` entries whose `tags` (or `id`) match `tag`, records the tag invalidation timestamp for Edge/Cloudflare KV consistency, and evicts any static (`index.html`) or PPR (`shell.html`) host pages whose `metadata.json` (`slotTags`) includes `tag`.

---

### 4.2. The 10 Developer Usage Patterns

#### Pattern 1: Standard JSX Children vs. Inline Async Function Children
You can pass either a Server Component element or an inline `async () => ...` function (which avoids having to create a separate component just to `await` data inside a slot):
```tsx
import { DinouCacheSlot } from "dinou";

export default async function DashboardPage() {
  return (
    <main>
      {/* 1A. Standard JSX Server Component child */}
      <DinouCacheSlot id="analytics-slot" tag="analytics" revalidate={60}>
        <ExpensiveAnalyticsWidget />
      </DinouCacheSlot>

      {/* 1B. Inline async function child (no extra component needed) */}
      <DinouCacheSlot id="inventory-slot" tag="inventory" revalidate={300}>
        {async () => {
          const items = await fetchInventoryFromDB();
          return <InventoryTable items={items} />;
        }}
      </DinouCacheSlot>
    </main>
  );
}
```

#### Pattern 2: Tag-Only Shorthand (Omitting `id`)
When a slot has a primary `tag`, you do not need to pass `id`—Dinou automatically derives the canonical `slotId` from `tag` (or `tags[0]`):
```tsx
<DinouCacheSlot tag="featured-promo" revalidate={120}>
  <FeaturedPromoBanner />
</DinouCacheSlot>
```
You can then invalidate it on the server with `await revalidateTag("featured-promo")` and refresh it on the client with `refreshSlot("featured-promo")`.

#### Pattern 3: Multi-Tag Hierarchical / Group Invalidation (`tags={[...]}`)
Assign both a specific tag and a group tag to related slots so you can invalidate/refresh either a single widget or an entire dashboard section at once:
```tsx
<DinouCacheSlot id="sales-chart" tags={["sales", "billing-group"]} revalidate={600}>
  <SalesChart />
</DinouCacheSlot>

<DinouCacheSlot id="invoices-list" tags={["invoices", "billing-group"]} revalidate={600}>
  <RecentInvoices />
</DinouCacheSlot>
```
- `await revalidateTag("sales")` (or `refreshSlot("sales", { fresh: true })`) updates **only** `<SalesChart />`.
- `await revalidateTag("billing-group")` (or `refreshSlot("billing-group", { fresh: true })`) updates **both** `<SalesChart />` and `<RecentInvoices />` simultaneously!

#### Pattern 4: Always-Fresh Live Refreshable Slot (`revalidate={0}`)
Setting `revalidate={0}` disables storage caching so the slot runs fresh on every page request, **but still wraps the subtree in a `<DinouCacheSlotBoundary>`**. This lets you re-run and refresh just that Server Component from the client at any time (e.g., a live polling ticker or manual "Refresh" button) without reloading the page or re-rendering sibling components:
```tsx
<DinouCacheSlot id="live-stock-ticker" revalidate={0}>
  <LiveStockTicker />
</DinouCacheSlot>
```

#### Pattern 5: Nested `<DinouCacheSlot>` Composition (`Outer Slot -> Inner Slot`)
You can nest a fast-changing `<DinouCacheSlot>` inside a slow-changing outer `<DinouCacheSlot>`:
```tsx
<DinouCacheSlot id="catalog-outer" tag="tag-outer" revalidate={3600}>
  <div className="catalog-container">
    <HeavyCategoryTree />
    {/* Inner slot with a short 30s TTL or independent tag */}
    <DinouCacheSlot id="flash-deals-inner" tag="tag-inner" revalidate={30}>
      <FlashDealsBanner />
    </DinouCacheSlot>
  </div>
</DinouCacheSlot>
```
- When `revalidateTag("tag-inner")` or `refreshSlot("flash-deals-inner", { fresh: true })` is called, Dinou's `refreshNestedSlotsInTree` re-renders **only** `<FlashDealsBanner />` while `<HeavyCategoryTree />` in `catalog-outer` stays cached!

#### Pattern 6: Layout-Level `<DinouCacheSlot>` (Persistent Header / Sidebar Widgets)
You can place `<DinouCacheSlot>` inside any `layout.tsx` (e.g., a global announcement bar, system status badge, or catalog counter):
```tsx
// src/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <header>
          <DinouCacheSlot id="global-status-banner" tag="status-banner" revalidate={120}>
            <SystemStatusBanner />
          </DinouCacheSlot>
        </header>
        {children}
      </body>
    </html>
  );
}
```
Any Client Component anywhere in the app can call `refreshSlot("global-status-banner", { fresh: true })` to update the header banner live without unmounting the layout or resetting the active page!

#### Pattern 7: Parameterized Slots in Dynamic Routes (`[slug]` / `[id]`)
In dynamic routes like `src/products/[slug]/page.tsx`, interpolate the route param into `id` and `tags` to give each parameter its own isolated Micro-ISR cache while retaining a shared tag for bulk eviction:
```tsx
export default async function ProductPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  return (
    <DinouCacheSlot
      id={`product-reviews-${slug}`}
      tags={[`reviews-${slug}`, "all-product-reviews"]}
      revalidate={300}
    >
      <ProductReviews slug={slug} />
    </DinouCacheSlot>
  );
}
```
- Visiting `/products/alpha` and `/products/beta` caches `slots/product-reviews-alpha/slot.json` and `slots/product-reviews-beta/slot.json` independently.
- Calling `refreshSlot(\`product-reviews-\${slug}\`, { fresh: true })` forwards `x-dinou-current-path` so `/____rsc_slot____` resolves `params.slug` automatically even on a cold server start.

#### Pattern 8: Interactive `"use client"` Components & `"use server"` Actions Inside a Cached Slot (In-Place State Preservation)
A cached `<DinouCacheSlot>` can render `"use client"` components and pass `"use server"` Server Actions as props (or import them directly):
```tsx
// Server Component inside <DinouCacheSlot>
import { submitQuickVote } from "./actions"; // "use server"
import { InteractivePollWidget } from "./poll-widget"; // "use client"

<DinouCacheSlot id="poll-slot" tag="poll" revalidate={120}>
  {async () => {
    const pollStats = await getPollStats();
    return (
      <InteractivePollWidget
        serverStats={pollStats}
        onVoteAction={submitQuickVote} // Survives slot.json serialization!
      />
    );
  }}
</DinouCacheSlot>
```
- **In-Place Fiber Reconciliation**: When `refreshSlot("poll", { fresh: true })` is triggered, `<InteractivePollWidget />` receives the newly fetched `serverStats` prop **without unmounting or losing its local `useState` state** (such as open dropdowns, input text, or local counters), and `onVoteAction` remains bound and callable.

#### Pattern 9: Mutation Workflow vs. Direct Force-Fresh Workflow in Client Components
```tsx
"use client";

import { refreshSlot, useRouter } from "dinou";
import { mutateAnalyticsAndRevalidate } from "./actions"; // calls revalidateTag("analytics")

export function SlotControls() {
  const router = useRouter();

  return (
    <div>
      {/* Workflow A: Server Action mutation + revalidateTag() + client refreshSlot() */}
      <button
        onClick={async () => {
          await mutateAnalyticsAndRevalidate(); // invalidates server cache for all users
          refreshSlot("analytics"); // pulls the newly regenerated slot into the DOM
        }}
      >
        Save & Refresh Analytics
      </button>

      {/* Workflow B: Direct client force-fresh ({ fresh: true }) by ID or Tag */}
      <button onClick={() => router.refreshSlot("analytics", { fresh: true })}>
        Force Fresh Analytics Now
      </button>

      {/* Workflow C: Wildcard refresh of ALL mounted slots (layout + page) */}
      <button onClick={() => refreshSlot("*", { fresh: true })}>
        Refresh Entire Dashboard (All Slots)
      </button>
    </div>
  );
}
```

#### Pattern 10: Combining `<DinouCacheSlot>` Across Static (SSG/ISG), Dynamic (SSR), and PPR Host Pages
- **Inside a Dynamic SSR Page (`revalidate: () => 0`)**: The host page runs per request (e.g., reading session cookies), while expensive subtrees inside `<DinouCacheSlot revalidate={3600}>` are served from cache in sub-millisecond time.
- **Inside a Static SSG / ISG Page**: The slot is baked into `index.html` at build time and its tags are recorded in `metadata.json` (`slotTags`). Calling `revalidateTag(tag)` automatically evicts the host page's `index.html` and `page.rsc` so the next reload regenerates the static page with the updated slot (while sibling slots on the same page remain cached), and `refreshSlot(id, { fresh: true })` updates the slot live in the browser without a page reload.
- **Inside a Partial Prerendering (PPR) Page (`export const ppr = true`)**: Slots can be placed both in the **static shell** (`0ms TTFB`, `inStaticShell: true`) and inside **streamed dynamic `<Suspense>` holes** (`inStaticShell: false`). See [`rigurous-sinergy.md`](./rigurous-sinergy.md) for the full 3-tier hybrid architecture.

---

## 5. Comprehensive E2E Test Suite Reference

Vertical Segmentation (`<DinouCacheSlot>` & `refreshSlot`) is verified across two dedicated E2E test suites in `e2e/example.spec.ts` (plus the hybrid PPR + Micro-ISR synergy suite documented in `rigorous-sinergy.md`).

### 5.1. Foundational Vertical Segmentation Suite (`/t-cache-slot`)
- **Source Directory**: `src/t-cache-slot/`
- **Playwright Spec**: `e2e/example.spec.ts` → `test.describe.serial("DinouCacheSlot: Vertical Segmentation & Micro-ISR", ...)`
- **Tests Implemented**:
  1. **Independent Slot Caching, Granular `revalidateTag`, and Time-Based TTL / SWR Expiration**:
     - Loads `/t-cache-slot` (a dynamic page with `revalidate: () => 0` containing `#slot-alpha`, `#slot-beta`, and `#slot-fast` with `revalidate={5}`).
     - Reloads the page within the 5-second TTL and verifies that `#page-time` updates on every request while `#slot-alpha-time`, `#slot-beta-time`, and `#slot-fast-time` remain cached.
     - Triggers a Server Action calling `revalidateTag("tag-alpha")` and verifies that on reload **only** `#slot-alpha-time` regenerates while `#slot-beta-time` stays cached.
     - Waits for the 5-second TTL of `#slot-fast` to expire (`5500ms`) and verifies that Stale-While-Revalidate (SWR) regenerates `#slot-fast-time` in the background.
  2. **Live Client-Side Slot Refresh Without Page Reload (Level 2)**:
     - Invalidates `"tag-alpha"` via Server Action and triggers `refreshSlot("slot-alpha")` in the browser.
     - Asserts that `#slot-alpha-time` updates live in the DOM while `#page-time` and `#slot-beta-time` remain untouched (0 page reload, 0 sibling re-render).
     - Invalidates `"tag-beta"` and triggers `useRouter().refreshSlot("slot-beta")`, verifying `#slot-beta-time` updates live in the DOM while `#page-time` and `#slot-alpha-time` remain intact.

---

### 5.2. Rigorous Vertical Segmentation & Micro-ISR Stress Suite (`/t-rigorous-cache-slot`)
- **Source Directory**: `src/t-rigorous-cache-slot/`
  - `src/t-rigorous-cache-slot/layout.tsx` (contains layout-level `<DinouCacheSlot id="rig-slot-layout-banner" tag="rig-tag-layout-banner">`)
  - `src/t-rigorous-cache-slot/page.tsx` & `page_functions.ts` (`revalidate: () => 0` dynamic host page with 8 distinct slot configurations)
  - `src/t-rigorous-cache-slot/actions.ts` (`"use server"` actions for tag invalidation, stampede reset, and Server Action prop callbacks)
  - `src/t-rigorous-cache-slot/slot-client-widgets.tsx` (`"use client"` interactive counters and live slot refresh control panel)
  - `src/t-rigorous-cache-slot/static-host/page.tsx` & `static-host-client.tsx` (100% static SSG host page embedding `<DinouCacheSlot id="rig-slot-static-host" tag="rig-tag-static-host-slot">`)
  - `src/t-rigorous-cache-slot/ppr-host/page.tsx` & `page_functions.ts` (PPR host page with `ppr = true` embedding `<DinouCacheSlot>` inside a dynamic `<Suspense>` hole)
  - `src/t-rigorous-cache-slot/dynamic-route/[slug]/page.tsx` & `page_functions.ts` (dynamic `[slug]` route with parameterized slot IDs `id={`rig-slot-param-${slug}`}`)
- **Playwright Spec**: `e2e/example.spec.ts` → `test.describe.serial("DinouCacheSlot: Rigorous Vertical Segmentation & Micro-ISR Casuistics", ...)`

#### Test 1: Static Host Page & Cold-Start Slot Endpoints (`/t-rigorous-cache-slot/static-host`)
- **1a. Cold-Start `/____rsc_slot____` Pre-Evaluation (Page Slot & Layout Slot)**:
  - Before any browser navigation to `/t-rigorous-cache-slot/static-host` has occurred at runtime, sends direct HTTP GET requests to:
    - `/____rsc_slot____/rig-slot-static-host?fresh=1` (with header `x-dinou-current-path: /t-rigorous-cache-slot/static-host`)
    - `/____rsc_slot____/rig-slot-layout-banner?fresh=1` (with header `x-dinou-current-path: /t-rigorous-cache-slot/static-host`)
  - Verifies both return HTTP `200` with valid Flight RSC payloads (`"static-slot-..."` and `"layout-banner-..."`), proving `getSlotJSX` pre-evaluates both the page and its ancestor layouts on cold start.
- **1b. `revalidateTag` Evicts Static Host Page (`slotTags` Tracking)**:
  - Loads `/t-rigorous-cache-slot/static-host` (pre-rendered at build time) and records `#slot-static-host-token` (`token1`).
  - Clicks `#btn-static-host-inv-only` (`revalidateTag("rig-tag-static-host-slot")`) and reloads the page (`F5`).
  - Asserts that `#slot-static-host-token` updates to a new `token2` (`!= token1`) and survives client RSC hydration without reverting to the build-time `page.rsc` payload.
- **1c. Live `refreshSlot({ fresh: true })` on Static Host Page**:
  - Clicks `#btn-static-host-fresh-only` (`refreshSlot("rig-slot-static-host", { fresh: true })`) and verifies `#slot-static-host-token` updates live in the DOM (`!= token2`) while `#static-page-time` remains unchanged.

#### Test 2: Vertical Cache Isolation, `revalidate={0}` No-Cache, Function Child, Tag-Only Slot & Multi-Tag Shared Invalidation (`/t-rigorous-cache-slot`)
- Loads `/t-rigorous-cache-slot` and records initial tokens across 6 regions:
  - `#page-token` (dynamic host page with `revalidate: () => 0`)
  - `#slot-alpha-token` (`id="rig-slot-alpha"`, `tag="rig-tag-alpha"`, `revalidate={3600}`)
  - `#slot-beta-token` (`id="rig-slot-beta"`, `tags={["rig-tag-beta", "rig-tag-shared"]}`, `revalidate={3600}`)
  - `#slot-gamma-token` (async function child `{async () => ...}` with `id="rig-slot-gamma"`, `tags={["rig-tag-gamma", "rig-tag-shared"]}`)
  - `#slot-nocache-token` (`id="rig-slot-nocache"`, `revalidate={0}` strict no-cache)
  - `#slot-tag-only-token` (`tag="rig-tag-only"` without an explicit `id` prop, testing canonical fallback `slotId = id || tag || tags[0]`)
- Reloads the page and verifies:
  - `#page-token` and `#slot-nocache-token` **change** on reload.
  - `#slot-alpha-token`, `#slot-beta-token`, `#slot-gamma-token`, and `#slot-tag-only-token` **remain identical** (served from `slots/*/slot.json`).
- **Multi-Tag Shared Invalidation**:
  - Clicks `#btn-inv-shared` (`revalidateTag("rig-tag-shared")`) and reloads the page.
  - Verifies that both `#slot-beta-token` and `#slot-gamma-token` (which share `"rig-tag-shared"`) regenerate with new tokens, while `#slot-alpha-token` remains untouched.

#### Test 3: Live Client-Side `refreshSlot` (By ID, By Tag, via `useRouter().refreshSlot`, Layout Slot & Wildcard `'*'`) While Preserving Client State & Server Action Props
- Increments the page-level client counter `#btn-inc-page-counter` twice (`100 -> 102`).
- **Server Action Prop Serialization Inside Cached Slot**:
  - Verifies that `<SlotInteractiveCounter onPingProp={pingFromInsideSlot} />` mounted inside a cached `<DinouCacheSlot>` has `#slot-client-prop-action-status === "fn-present"` even on cache hits (proving `Symbol.for("react.server.reference")` survived `serializeJSX` / `deserializeJSX`).
  - Clicks `#btn-slot-client-prop-ping` and `#btn-slot-client-ping`, verifying both the prop-passed Server Action and directly imported Server Action execute on the server and return `"ok:pong:..."` / `"pong:..."`.
- **Live Refresh by Tag (`refreshSlot("rig-tag-alpha", { fresh: true })`)**:
  - Clicks `#btn-refresh-by-tag-alpha` and verifies `#slot-alpha-token` updates live while `#slot-beta-token` and `#page-client-counter` (`102`) are preserved.
- **Live Refresh via `useRouter().refreshSlot("rig-slot-beta", { fresh: true })`**:
  - Clicks `#btn-refresh-beta-fresh` and verifies `#slot-beta-token` updates live while `#page-client-counter` (`102`) is preserved.
- **Live Refresh of Layout-Level Slot (`refreshSlot("rig-slot-layout-banner", { fresh: true })`)**:
  - Clicks `#btn-refresh-layout-banner-fresh` and verifies `#slot-layout-banner-id` inside `layout.tsx` updates live without unmounting the page or losing `#page-client-counter` (`102`).
- **Wildcard Live Refresh (`refreshSlot("*", { fresh: true })`)**:
  - Clicks `#btn-refresh-wildcard-fresh` and verifies `#slot-alpha-token`, `#slot-beta-token`, and `#slot-gamma-token` all update simultaneously while `#page-client-counter` remains `102`.

#### Test 4: Nested `<DinouCacheSlot>` Isolation (`refreshNestedSlotsInTree`)
- Tests an outer cached slot (`id="rig-slot-nested-outer"`, `tag="rig-tag-outer"`) wrapping an inner cached slot (`id="rig-slot-nested-inner"`, `tag="rig-tag-inner"`).
- **4a. Server-Side Inner Tag Invalidation (`revalidateTag("rig-tag-inner")`)**:
  - Clicks `#btn-inv-inner` (`revalidateTag("rig-tag-inner")`) and reloads the page.
  - Verifies that `#slot-nested-outer-token` **remains identical** (outer slot served from cache), while `#slot-nested-inner-token` **updates** to a new token via `refreshNestedSlotsInTree`.
- **4b. Live Client-Side Inner Slot Refresh (`refreshSlot("rig-slot-nested-inner", { fresh: true })`)**:
  - Clicks `#btn-refresh-nested-inner-fresh` and verifies `#slot-nested-inner-token` updates live in the DOM while `#slot-nested-outer-token` stays unchanged.

#### Test 5: Concurrency Stampede Protection, Hybrid PPR + `DinouCacheSlot`, Dynamic Route Param Slots & Endpoint Security
- **5a. Concurrency Stampede Protection (`inflightSlotRenders`)**:
  - Resets `#slot-stampede-token` (`revalidateTag("rig-tag-stampede")`, which wraps a `120ms` slow async component) so the slot is in a cold cache-MISS state.
  - Fires 5 simultaneous HTTP GET requests (`Promise.all`) to `/t-rigorous-cache-slot?stampede_probe=0..4`.
  - Extracts `#slot-stampede-token` from all 5 HTML responses and asserts `uniqueTokens.size === 1` (the slow slot executed only once and all 5 concurrent requests shared the same in-flight render promise).
- **5b. Hybrid PPR + `<DinouCacheSlot>` (`/t-rigorous-cache-slot/ppr-host`)**:
  - Requests `/t-rigorous-cache-slot/ppr-host` twice with different cookies (`Cookie: slot_user=Alice` vs. `Cookie: slot_user=Bob`).
  - Verifies that the outer dynamic `<Suspense>` PPR hole streams personalized user data (`#ppr-hole-user` is `"Alice"` vs. `"Bob"`), while the `<DinouCacheSlot>` nested **inside** that dynamic PPR hole (`#slot-inside-ppr-hole-token`) serves the exact same cached token across both users, and the static PPR shell (`#ppr-shell-time`) remains static in production.
- **5c. Dynamic Route Parameter Slots (`/t-rigorous-cache-slot/dynamic-route/[slug]`)**:
  - Requests `/t-rigorous-cache-slot/dynamic-route/alpha` twice and `/t-rigorous-cache-slot/dynamic-route/beta` once.
  - Verifies that `alpha` hits its per-slug slot cache on the second request (`tokenAlpha1 === tokenAlpha2`), `beta` has its own isolated slot cache (`tokenAlpha1 !== tokenBeta1`), and `/____rsc_slot____/rig-slot-param-alpha?fresh=1` with `x-dinou-current-path: /t-rigorous-cache-slot/dynamic-route/alpha` resolves dynamic route `params` (`slug = "alpha"`) and returns HTTP `200` with `"param-alpha-..."`.
- **5d. `/____rsc_slot____` Endpoint Security**:
  - Verifies that path traversal attempts (`/____rsc_slot____/..%2F..%2Fpackage.json`) are rejected with HTTP `400`/`404` (`[/\\]|\.\.` guard in `handler.js`), and non-existent slot IDs (`/____rsc_slot____/non-existent-rig-slot-999`) return HTTP `404`.
