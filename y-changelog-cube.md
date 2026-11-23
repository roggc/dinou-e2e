# Changelog — Dinou `10.0.4` (Phase 3 — Final 3D Caching Cube Hardening)

All notable core bug fixes uncovered and resolved during Phase 3 (`y-final-cube-tests.md`, Checks `#62–#66`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [10.0.4] - Unreleased

### Fixed

#### Horizontal Segmentation & On-Demand ISG (`[param]` Layouts)
- **Populated missing parameterized layout artifacts (`shell.layout.own.json`, `shell.layout.json`, `layout.rsc`, `layout.metadata.json`) during cold on-demand ISG** (`dinou/core/handler.js`, `dinou/core/cache-revalidate.js`):
  - When a dynamic-param route (`/items/[id]`) with `allowISG = true` and a parameterized `[id]/layout.tsx` was visited for the first time at runtime (not pre-rendered during SSG), section `2b` in `handler.js` previously invoked only Pass 2 (`GET <reqPath>` with `isSSG: true`) without running Pass 1 for missing ancestor/leaf parameterized layouts — causing Pass 2 to fall back to full `getJSX`, re-execute already-cached ancestor layouts, and omit per-instance `shell.layout.own.json` / `layout.metadata.json` / `layout.rsc`.
  - Pre-populated missing static/PPR parameterized layout levels ancestor-first via `revalidateLayout(entry.layoutRoutePath)` before Pass 2 on cold PPR ISG (automatically cleaning up newly created layout keys if Pass 2 returns a non-200 status such as `404` or redirect), and after successful cold non-PPR ISG page generation.
  - Guarded `revalidateLayout` in `cache-revalidate.js` against caching layouts that trigger an implicit dynamic bailout (`revalDynamicState.value === true`), marking `layout.metadata.json` with `dynamic: true` when uncached instead of freezing stale build-time values.

#### Distributed Storage (`CloudflareKVStorage` & Multi-Isolate Edge Consistency)
- **Added distributed tombstones, cross-isolate tag invalidations, 1024-byte metadata overflow fallback, and non-empty root-key safety to `CloudflareKVStorage`** (`dinou/core/storage-adapter.js`):
  - `CloudflareKVStorage` previously relied on `StorageAdapter`'s isolate-local RAM maps (`_deletedKeys` / `_invalidatedTags`), causing a cold Cloudflare Worker isolate (`Isolate B`) to miss deletions and `revalidateTag` invalidations written by `Isolate A` and resurrect stale build-time pages/slots from `env.ASSETS` (`/__dinou_dist2/...`). Added distributed KV tombstones (`__tombstone__:<key>`) and tag invalidation timestamps (`__tag_inv__:<tag>`) across `markTagInvalidated`, `markTagInvalidatedAsync`, `getTagInvalidatedAtAsync`, `isKeyDeleted`, `delete()`, and `set()` (clearing stale tombstones on write), while filtering internal keys out of `keys()`.
  - Guarded `CloudflareKVStorage.set()` against Cloudflare KV's strict 1024-byte per-key metadata limit via `_safeKvPut()`, spilling oversized metadata cleanly into the companion `*metadata.json` key and restoring it losslessly in `get()` (for both file and folder keys) without failing with HTTP `413`.
  - Eliminated invalid empty-string (`""`) KV key calls on root route (`"/"` / `"index.html"`) `get()`, `set()`, `has()`, and `delete()` operations, which real Cloudflare Workers KV rejects with `TypeError: Key name cannot be empty`.

#### Parallel Routes (`@sidebar` / `@panel`) & Asymmetric `S → D → S` Chains
- **Decoupled Page-level SSG staticness from dynamic ancestor layouts and their `@slots`** (`dinou/core/build-static-pages.js`, `dinou/core/generate-static.js`):
  - `buildStaticPages()` previously shared a single `isStatic` bailout flag across the Page and all ancestor layouts; whenever a dynamic ancestor layout (`revalidate = 0` or implicit bailout) or its parallel `@slot` accessed `req.cookies` / `req.headers` / `req.query`, `buildStaticPages()` dropped the entire route from `staticRoutes`, preventing SSG from pre-rendering the isolated static/PPR Page (`page.rsc`, `shell.page.json`, `shell.rsc`, `metadata.json`).
  - Probed the Page segment independently before evaluating ancestor layouts, marking routes with a static/PPR Page underneath a dynamic ancestor layout with `hasDynamicLayout: true` so `generateStatic()` skips freezing full `index.html` / `shell.html` while still pre-rendering the isolated Page segment (`page.rsc` / `shell.page.json` / `shell.rsc` / `metadata.json`) and pre-warming `<DinouCacheSlot>`s hosted inside dynamic layouts/slots.
- **Added per-level layout TTL / slot-freshness parity to asymmetric `/____rsc_layout____` and deleted-slot freshness detection** (`dinou/core/handler.js`, `dinou/core/cache-slot.js`):
  - Asymmetric `/____rsc_layout____` composition previously skipped per-level `ownGeneratedAt + revalidate` TTL expiry and `inspectSlotsFreshness` checks that SSR GET performed, risking stale layout/parallel-slot content on soft `<Link>` navigation after `revalidateTag` or slot TTL expiry.
  - Aligned `/____rsc_layout____` with SSR GET's per-level TTL + `inspectSlotsFreshness` checks, and updated `inspectSlotsFreshness` to treat explicitly deleted slots (`storage.isKeyDeleted(storageKey)`) as stale (`hasNewer = true`).
- **Isolated throwing parallel `@slots` via `@slot/error.tsx` during PPR hole splicing** (`dinou/core/layout-composition.js`):
  - `spliceSingleLayoutOwnHoles()` previously passed raw `@slot` components into `spliceDynamicHolesIntoShell()` without error isolation; if a parallel `@sidebar` threw before a sibling PPR `<Suspense>` hole in a static PPR layout inside an asymmetric chain, splicing logged an unhandled component error instead of falling back to `@slot/error.tsx`. Wrapped parallel `@slot` components in an error-isolating boundary matching `renderSingleLayoutLevel()`.

#### Client Slot Lifecycle & Browser History (`refreshSlot` × `no_layout` / `reset_layout` × `Back` / `Forward`)
- **Prevented mid-transition `pushState` `routePath` corruption and unmounted-slot leaks on wildcard `refreshSlot("*")` in `DinouCacheSlotBoundary`** (`dinou/core/slot.js`):
  - `ensureKnownSlotEntry()` previously overwrote `entry.routePath = window.location.pathname` during render; when a soft navigation called `window.history.pushState()` synchronously before `startTransition()` committed and a component consuming `useNavigationLoading()` re-rendered an ancestor of a `<DinouCacheSlot>` mid-transition, the soon-to-unmount slot inherited the destination pathname and was erroneously re-fetched by wildcard `refreshSlot("*")` on the destination `no_layout` / `reset_layout` route (and conditionally unmounted slots on the same pathname were also re-fetched).
  - Moved `entry.routePath` updates to `useEffect` mount commit, tracked `entry.unmounted = true` in `useEffect` cleanup when `entry.subscribers.size === 0`, and guarded wildcard `refreshSlot("*")` against dispatching to explicitly unmounted entries while preserving original `routePath` for explicit-ID refreshes.

---

## Tracking Log by Stage

| # | Stage / Check | Bug Summary | Core Files Modified | Commit |
| :-: | --- | --- | --- | --- |
| 1 | Phase 3 — Stage 1 (`#62` Dynamic `[id]` On-Demand ISG + 3D Triple Synergy) | Cold on-demand ISG for parameterized `[id]` routes skipped Pass 1 for missing `[id]` layouts, failing to persist per-instance `shell.layout.own.json` / `shell.layout.json` / `layout.rsc` / `layout.metadata.json` and breaking surgical `revalidateLayout([id])` & `[id]` layout `<DinouCacheSlot>` persistence; added implicit dynamic bailout guard in `revalidateLayout` | `handler.js`, `cache-revalidate.js` | *(uncommitted)* |
| 2 | Phase 3 — Stage 2 (`#63` Distributed Storage: `CloudflareKVStorage` & Multi-Pod `RedisStorage`) | `CloudflareKVStorage` lacked distributed KV tombstones and tag invalidation keys (allowing cold isolates to resurrect stale `env.ASSETS` artifacts), crashed with `413` on >1024-byte metadata payloads, and issued empty-string `""` KV key operations on root `"/"` / `"index.html"` | `storage-adapter.js` | *(uncommitted)* |
| 3 | Phase 3 — Stage 3 (`#64` Parallel Routes `@sidebar`/`@panel` in Asymmetric `S → D → S` Chains) | `buildStaticPages` dropped static/PPR pages from SSG whenever a dynamic ancestor layout or its `@slot` read cookies/headers/query; asymmetric `/____rsc_layout____` skipped per-level TTL & slot freshness checks; `spliceSingleLayoutOwnHoles` lacked `@slot/error.tsx` isolation | `build-static-pages.js`, `generate-static.js`, `handler.js`, `cache-slot.js`, `layout-composition.js` | *(uncommitted)* |
| 4 | Phase 3 — Stage 4 (`#65` Client Lifecycle Stress: `refreshSlot` → `no_layout`/`reset_layout` → `Back`/`Forward`) | `ensureKnownSlotEntry()` overwrote `entry.routePath` during render (corrupting it during `pushState` + `useNavigationLoading()` transitions) and wildcard `refreshSlot("*")` lacked an explicit `entry.unmounted` guard | `slot.js` | *(uncommitted)* |
