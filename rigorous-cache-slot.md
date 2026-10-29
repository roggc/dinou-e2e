# Vertical Segmentation (`DinouCacheSlot` & `refreshSlot`) in Dinou — Architecture, v9.0.3 Fixes & Reference Guide

This document provides a complete technical overview of **Vertical Segmentation (Micro-ISR)** in Dinou via `<DinouCacheSlot>` and `refreshSlot`, the architectural fixes implemented in **v9.0.3**, how server-side slot caching and live client-side slot refreshing work under the hood, and usage patterns for `dinou-docs`.

---

## 1. Overview: Horizontal vs. Vertical Segmentation in Dinou

Dinou supports two complementary axes of component segmentation in React Server Components (RSC):

1. **Horizontal Segmentation (Layouts vs. Pages)**:
   - Route segments (`layout.tsx` vs. `page.tsx`) are cached, revalidated (`revalidatePath`, `revalidateLayout`, `revalidatePage`), and fetched (`/____rsc_layout____`, `/____rsc_page____`) independently across client-side navigations.
2. **Vertical Segmentation (`<DinouCacheSlot>` & `refreshSlot` — Micro-ISR)**:
   - Any arbitrary Server Component subtree **inside** a page or layout can be wrapped in `<DinouCacheSlot>` with its own independent cache lifecycle (`id`, `tag` / `tags`, and `revalidate` TTL in seconds).
   - Even if the host page is **100% dynamic** (`revalidate: () => 0`), each `<DinouCacheSlot>` caches its resolved RSC element tree in Dinou's pluggable Storage Adapter (`FileSystemStorage` in `.dinou/dist2/slots/<slotId>/slot.json`, `CloudflareKVStorage`, `DenoKVStorage`, `RedisStorage`, or `MemoryStorage`).
   - Conversely, even if the host page is **100% static** (pre-rendered at build time), individual slots inside it can be invalidated on demand via `revalidateTag(tag)` or refreshed live in the browser without a page reload via `refreshSlot(idOrTag, { fresh?: boolean })`.

---

## 2. How `<DinouCacheSlot>` and `refreshSlot` Work Under the Hood

### 2.1. Server-Side Rendering & Serialization (`dinou/core/cache-slot.js`)
When `<DinouCacheSlot id="my-slot" tags={["tag-a", "tag-b"]} revalidate={60}>` executes on the server:
1. **Canonical Slot Identity**:
   - Uses `id || tag || tags[0]` as `slotId` and stores artifacts under `slots/${slotId}/slot.json` (plus `slot.metadata.json` on filesystem storage).
2. **In-Memory Registry (`slotRegistry`)**:
   - Registers `{ render, discover, tags, revalidate }` in `globalThis[Symbol.for("dinou.slot.registry")]` so `/____rsc_slot____/:id` can re-evaluate the slot on demand.
3. **Host Page Slot-Tag Tracking**:
   - Records `allTags` onto the active request context (`reqContext._slotTags`) so static/ISG host pages record `slotTags: [...]` in their `metadata.json`.
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
3. Matching boundaries call `window.__DINOU_FETCH_SLOT__(id, options)`, which fetches `/____rsc_slot____/${encodeURIComponent(id)}?t=${Date.now()}${options?.fresh ? "&fresh=1" : ""}` with header `X-Dinou-Current-Path: window.location.pathname`.
4. The streamed Flight RSC payload is decoded via `createFromFetch` and applied inside `React.startTransition` + `<Suspense fallback={children}>`, updating **only** that slot's DOM subtree while preserving all page and sibling React client state.

---

## 3. Architectural Fixes Implemented in Dinou (v9.0.3)

During rigorous auditing (`src/cache-slot-test` in `test-9.0.2` and `src/t-rigorous-cache-slot` in `dinou-e2e`), 8 bugs were discovered and fixed:

### 3.1. Cold-Start Route, Layout & Nested Slot Pre-Evaluation in `getSlotJSX`
- **Files Modified**: `dinou/core/cache-slot.js`
- **Problem**:
  - When a server process booted in production and served a pre-rendered static page (`index.html`), no Server Components had executed yet in memory (`slotRegistry` was empty).
  - If a client called `refreshSlot("my-slot", { fresh: true })` (or after `revalidateTag` deleted `slot.json`), `getSlotJSX` called `await getJSX(options.currentPath, ..., { segment: "page" })` without calling `asyncRenderJSXToClientJSX()`. Because `getJSX` only returns an uninvoked `React.createElement(Page, props)`, `DinouCacheSlot` never ran, `slotRegistry` remained empty, and `/____rsc_slot____/:id` returned `404`.
  - Furthermore, `{ segment: "page" }` skipped `layout.tsx`, so slots defined inside layouts also returned `404` on cold start.
- **Solution**:
  - `getSlotJSX` now evaluates `await asyncRenderJSXToClientJSX(pageJsx)` when pre-evaluating `options.currentPath`.
  - If the slot is still not in `slotRegistry`, `getSlotJSX` evaluates the full route including layouts (`await getJSX(options.currentPath, {}, isNotFound, false, false)` + `await asyncRenderJSXToClientJSX(fullJsx)`).
  - If still not found (e.g., a nested slot inside an outer slot that hit its disk cache during route pre-evaluation), `getSlotJSX` invokes `await entry.discover()` on registered outer slots to discover and register nested slots.

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

### 3.6. Static Host Page `slotTags` Invalidation & `slots/` Key Disambiguation
- **Files Modified**: `dinou/core/handler.js`, `dinou/core/cache-revalidate.js`, `dinou/core/storage-adapter.js`
- **Problem**:
  1. When a static page (without `revalidate: 0`) embedded `<DinouCacheSlot tag="my-slot-tag">`, calling `revalidateTag("my-slot-tag")` deleted `slots/my-slot/slot.json`, but the static page's `index.html` in `.dinou/dist2` had no record that it contained `"my-slot-tag"`, continuing to serve stale HTML on page reload.
  2. `FileSystemStorage` (`dinou/core/storage-adapter.js`) and `revalidateTag` (`dinou/core/cache-revalidate.js`) checked `key.includes("slot")` to detect slot storage keys. Any page route whose URL path contained the substring `"slot"` (such as `/t-cache-slot` or `/cache-slot-test`) was misclassified as a slot artifact!
- **Solution**:
  - `DinouCacheSlot` records rendered slot tags on `reqContext._slotTags`, and `handler.js` persists `genMeta.slotTags = Array.from(context._slotTags)` in the page's `metadata.json`.
  - In `revalidateTag(tag)` (`dinou/core/cache-revalidate.js`), matching `slots/<id>/slot.json` keys are deleted **first**, and any non-PPR static host page whose `meta.slotTags` includes `tag` has its cached `index.html` / `metadata.json` / `page.rsc` / `rsc.rsc` evicted so the next request re-renders the page with the fresh slot (while all other slots on that page still hit their `slots/<other>/slot.json` cache).
  - Updated `FileSystemStorage` and `revalidateTag` to detect slot keys strictly via `normSlotKey.startsWith("slots/") || normSlotKey.endsWith("/slot.json") || normSlotKey.endsWith("/slot.metadata.json")`.

### 3.7. Preserving React 19 Development Properties (`_debugStack`, `_debugTask`, `_debugInfo`) in `asyncRenderJSXToClientJSX`
- **Files Modified**: `dinou/core/render-jsx-to-client-jsx.js`
- **Problem**:
  - When `<DinouCacheSlot revalidate={0}>` bypassed `serializeJSX`/`deserializeJSX` (which reconstructs elements via `React.createElement`) and returned `await asyncRenderJSXToClientJSX(childElement)` directly, `asyncRenderJSXToClientJSX` cloned elements using object spread (`{ ...jsx, props: ..., key: ... }`).
  - Because React 19 defines `_debugStack`, `_debugTask`, `_debugInfo`, `ref`, and `_store.validated` as non-enumerable properties in development mode (`NODE_ENV !== "production"`), object spread stripped them.
  - When `react-server-dom-webpack/server.edge` serialized those cloned elements in `dev` mode (`dev:esbuild`, `dev:rollup`, `dev:webpack`), it logged `"Attempted to render <div> without development properties"` and crashed inside `parseStackTrace(task.debugStack, 1)` with `TypeError: Cannot read properties of undefined (reading 'stack')`, aborting the SSR stream.
- **Solution**:
  - Added `cloneWithDevProps(jsx, renderedProps, resolvedKey)` in `dinou/core/render-jsx-to-client-jsx.js`, which copies the non-enumerable property descriptors (`_owner`, `_store`, `ref`, `_debugInfo`, `_debugStack`, `_debugTask`) from the original React element onto the cloned element.

### 3.8. Edge/Deno KV & Cloudflare Assets Parity for `page.rsc` and `slotTags` Invalidation
- **Files Modified**: `dinou/core/handler.js`, `dinou/core/storage-adapter.js`, `dinou/core/cache-revalidate.js`, `dinou/deno/seed-kv.js`, `dinou/deno/build.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`
- **Problem**:
  1. In `dinou/core/handler.js` (Segmented RSC Payload Endpoint `/____rsc_page_static____/*`), `if (isEdgeRuntime(platformContext))` was followed by `if (existsSync(payloadPath))` instead of `else if (existsSync(payloadPath))`. On Deno (`start:deno`), when `revalidateTag` deleted a static host page from `DenoKVStorage` (`.dinou/kv.db`) and Edge ISG regenerated `index.html`, Edge ISG did not write `page.rsc` to `DenoKVStorage`. When the browser hydrated the reloaded page and requested `/____rsc_page_static____/...`, `storage.get(".../page.rsc")` returned `null` and fell through to `if (existsSync(payloadPath))`, serving the stale build-time `.dinou/dist2/.../page.rsc` from disk and overwriting the fresh DOM with the build-time slot token!
  2. `DenoKVStorage.keys(prefix)` passed `["dinou_cache", prefix]` to `kv.list()`, which in Deno KV treats `prefix` as an exact key segment rather than a string prefix, and `dinou/deno/seed-kv.js` did not seed `slots/*/slot.json` and `slot.metadata.json` into `.dinou/kv.db`.
  3. `dinou/deno/build.js`, `dinou/cloudflare/build.js`, and `dinou/bun/build.js` lacked the `candidateSlotPaths` / `slotChunkId` client manifest fallback mappings present in `dinou/node/bundle-dual-engine.js`.
- **Solution**:
  - Changed `if (existsSync(payloadPath))` to `else if (existsSync(payloadPath))` in `dinou/core/handler.js`, and updated Edge ISG (`shouldCacheISG`) to also render and store `page.rsc` (`segment: "page"`) in `storage` alongside `rsc.rsc`, `index.html`, and `metadata.json` (preserving `tags` and `slotTags` across Edge ISR/ISG).
  - Guarded `platformContext.env.ASSETS` fallback in `dinou/core/handler.js` with `storage.isDeleted(...)` (`_deletedKeys` in `storage-adapter.js`) so invalidated static routes/RSC payloads are never resurrected from immutable Cloudflare `env.ASSETS`.
  - Fixed `DenoKVStorage.keys(prefix)` to list `["dinou_cache"]` and filter `entry.key[1].startsWith(prefix)`, updated `dinou/deno/seed-kv.js` to seed `slot.json` and `slot.metadata.json`, and added `candidateSlotPaths` / `slotChunkId` mappings to `dinou/deno/build.js`, `dinou/cloudflare/build.js`, and `dinou/bun/build.js`.

---

## 4. API Reference & Usage Patterns for `dinou-docs`

### 4.1. Server Component: `<DinouCacheSlot>`
```tsx
import { DinouCacheSlot } from "dinou/server";

export default async function DashboardPage() {
  return (
    <main>
      {/* 1. Standard JSX child with tag & 60s ISR TTL */}
      <DinouCacheSlot id="analytics-slot" tag="analytics" revalidate={60}>
        <ExpensiveAnalyticsWidget />
      </DinouCacheSlot>

      {/* 2. Function child with multiple tags (shared invalidation) */}
      <DinouCacheSlot
        id="inventory-slot"
        tags={["inventory", "global-catalog"]}
        revalidate={300}
      >
        {async () => {
          const items = await fetchInventory();
          return <InventoryTable items={items} />;
        }}
      </DinouCacheSlot>

      {/* 3. Always-fresh slot (0 = no-cache) */}
      <DinouCacheSlot id="live-ticker" revalidate={0}>
        <LiveStockTicker />
      </DinouCacheSlot>
    </main>
  );
}
```

### 4.2. Client Component: `refreshSlot` & `useRouter().refreshSlot`
```tsx
"use client";

import { refreshSlot, useRouter } from "dinou";
import { invalidateAnalyticsTag } from "./actions";

export function SlotControls() {
  const router = useRouter();

  return (
    <div>
      {/* 1. Invalidate via Server Action + refresh live in DOM */}
      <button
        onClick={async () => {
          await invalidateAnalyticsTag();
          refreshSlot("analytics-slot");
        }}
      >
        Revalidate & Refresh Analytics
      </button>

      {/* 2. Force bypass cache directly from client ({ fresh: true }) */}
      <button onClick={() => refreshSlot("analytics-slot", { fresh: true })}>
        Force Fresh Analytics (By ID)
      </button>

      {/* 3. Refresh by Tag */}
      <button onClick={() => router.refreshSlot("analytics", { fresh: true })}>
        Force Fresh Analytics (By Tag)
      </button>

      {/* 4. Refresh ALL mounted slots on the current page */}
      <button onClick={() => refreshSlot("*", { fresh: true })}>
        Refresh All Slots
      </button>
    </div>
  );
}
```

---

## 5. E2E Test Suite Reference (`src/t-rigorous-cache-slot`)

The rigorous E2E test suite in `dinou-e2e` is located at:
- **Source files**: `src/t-rigorous-cache-slot/` (`page.tsx`, `page_functions.ts`, `layout.tsx`, `actions.ts`, `slot-client-widgets.tsx`, `static-host/page.tsx`, `static-host/static-host-client.tsx`, `ppr-host/page.tsx`, `ppr-host/page_functions.ts`, `dynamic-route/[slug]/page.tsx`, `dynamic-route/[slug]/page_functions.ts`)
- **Playwright Spec**: `e2e/example.spec.ts` → `test.describe.serial("DinouCacheSlot: Rigorous Vertical Segmentation & Micro-ISR Casuistics", ...)`

