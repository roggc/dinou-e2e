# Performance Optimizations Changelog — Dinou (`y-optimizations-changelog.md`)

All core request-path & 3D Caching Cube performance optimizations implemented from `y-optimizations.md` (`OPT-1` through `OPT-7`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Changed / Optimized

#### `OPT-1` (Tier 1) — Authoritative Production VFS Negative Lookups & `getLayoutFunctionsPath()` Caching
- **Eliminated per-request negative `fs.existsSync()` / `fs.readdirSync()` syscalls under production `src/` and cached `getLayoutFunctionsPath()` lookups** (`dinou/core/vfs.js`, `dinou/core/layout-functions.js`):
  - **Authoritative production VFS negative lookups (`dinou/core/vfs.js`)**:
    - Previously, even when `localVfs` (`buildVfs(srcDir, srcDir)`) or build-time `globalThis.__DINOU_VFS__` held the full in-memory snapshot of `src/`, every negative `lookupVfs()` probe (~85–95% of router lookups: `no_layout`, `reset_layout`, `page_functions.*`, `layout_functions.*`, non-matching extensions) still fell through to real OS `fs.existsSync()` / `fs.readdirSync()` syscalls.
    - Added dynamic `isDevMode()`, `localVfsSrcRoot` tracking on root `buildVfs()`, and `isAuthoritativeVfsPath(vfs, filePath)` so production VFS misses for paths inside the active `src/` root return `false` / `[]` immediately with **zero** disk syscalls, while DEV mode (`DINOU_DEV === "true"`, `__DINOU_DEV__`, or `NODE_ENV !== "production"`) and paths outside the project `src/` root (e.g., `.dinou/dist2/...` or temp test fixtures under `.dinou/tmp-*`) continue falling back safely to real filesystem checks.
    - Added a `lastIndexOf("/src")` fallback inside `lookupVfs()` for workspaces whose ancestor path also contains a `/src` directory segment.
  - **Production `getLayoutFunctionsPath()` caching & duplicate-probe removal (`dinou/core/layout-functions.js`)**:
    - Added production-only `layoutFunctionsPathCache` (`Map<string, string | null>`) plus `clearLayoutFunctionsPathCache()`, bypassing the cache automatically in DEV mode so live HMR file additions/deletions remain immediate.
    - Removed the redundant second `existsSync(slashCandidate)` probe inside `getLayoutFunctionsPath()` (`vfs.existsSync()` already normalizes `\` to `/` inside `lookupVfs()`, and Node/libuv treats `/` and `\` identically on Windows), halving cold/DEV probes from up to 20 to 10.
  - **Measured Impact** (1,000 route + active-layout-chain + `getLayoutFunctionsPath` lookups across 10 real multi-level `src/t-3d-cube/*` routes on Windows Node 24, production mode):
    - Real `fs.existsSync()` syscalls: **`35,200` (`35.2` / req) → `0` (`0.0` / req)** (**100% eliminated**).
    - Wall-clock latency: **`2,152.21 ms` (`2.152 ms` / req) → `205.23 ms` (`0.205 ms` / req)** (**~10.5× faster**).

#### `OPT-2` (Tier 1) — Production `layoutFunctionsConfigCache` & Single-Pass Layout Chain / Metadata Reuse
- **Added production `layoutFunctionsConfigCache` and eliminated redundant layout-tree traversals and duplicate `layout.metadata.json` reads across HTML and RSC endpoints** (`dinou/core/layout-functions.js`, `dinou/core/layout-composition.js`, `dinou/core/handler.js`):
  - **Production `layoutFunctionsConfigCache` (`dinou/core/layout-functions.js`)**:
    - Previously, `resolveLayoutFunctionsConfig()` had no cache (unlike `pageFunctionsConfigCache`), re-importing `layout_functions`, re-resolving `ppr` / `allowISG`, and **re-executing `getStaticPaths()` + rebuilding `staticPathsSet`** on every single HTTP request for every layout in the chain.
    - Added production-only `layoutFunctionsConfigCache` + `clearLayoutFunctionsConfigCache()` caching static module exports (`allowISG`, `staticPathsSet`, `validateParams`, `revalidateFn`/`staticRevalidate`, `getCacheTagsFn`/`staticTags`, `getProps`, `ppr`), while still executing per-request dynamic `revalidate(dParams)` and `getCacheTags(dParams)` functions on every call and bypassing the cache completely in DEV mode.
    - Updated `getLayoutProps()` to reuse the cached `getProps` function reference in production without repeating `importModule()`.
    - Updated `resolveLayoutChainPpr()` and `hydrateActiveChainPpr()` (`dinou/core/layout-composition.js`) to reuse precomputed `activeChain` and `entry._layoutConfig` instead of re-traversing the layout tree.
  - **Single-pass layout chain & `layout.metadata.json` reuse (`dinou/core/handler.js`)**:
    - Updated `resolvePprForRoute()` to support `{ activeChain, returnDetails: true }` so `resolvePageFunctionsConfig()` resolves `{ routePpr, pagePpr }` in **1 pass** instead of calling `resolvePprForRoute()` twice back-to-back.
    - Removed the dead unconditional `getFilePathAndDynamicParams(..., "layout")` traversal at HTML entry (`handler.js:3685`, whose result was only checked as `layouts.length > 0` during SSG/ISG static writes, now derived directly from `activeLayoutsForRoute.length > 0`).
    - Computed `perimeterLayoutChain` once at RSC endpoint entry (deriving `layoutPath`/`layoutParams` from `perimeterLayoutChain[0]` instead of calling `getLayoutsForLayoutKey()` separately) and reused it across cache-hit freshness checks, SSG per-level layout rendering, and dynamic/PPR layout composition.
    - Cached prefetched `entry._prefetchedMeta` / `entry._hasPrefetchedMeta` during HTML & RSC perimeter checks and reused it across warm cache-hit sync, asymmetric 3D composition, and precomputed layout RSC checks — while explicitly invalidating `_hasPrefetchedMeta` after cold PPR shell regeneration and refreshing it after every `revalidateLayout()` call.
  - **Measured Impact** (Windows Node 24, production mode):
    - `resolveLayoutFunctionsConfig()` with 100-item `getStaticPaths()` (300 requests after warmup): `getStaticPaths()` calls **`300 → 0`**; wall-clock **`19.40 ms → 3.35 ms`** (**~5.8× faster**).
    - Warm HTML cache-hit `handleRequest()` on a 3-layout route (`/t-3d-cube/router-coherence/sub-layout`, 200 requests, `MemoryStorage`): `layout.metadata.json` reads/req **`6 → 3`** (**50% reduction**), total `storage.get()`/req **`11 → 8`**, latency **`0.815 ms → 0.536 ms` / req** (**34.3% faster** in-memory; even larger savings on disk/KV/Redis).

#### `OPT-3` (Tier 1) — Parallel Multi-Layout / Multi-Slot I/O & Metadata-Only, Request-Deduplicated `inspectSlotsFreshness()`
- **Eliminated sequential multi-layout and multi-slot I/O waterfalls, avoided reading full `slot.json` payloads during freshness checks, and added mutation-safe per-request slot-freshness deduplication** (`dinou/core/storage-adapter.js`, `dinou/core/cache-slot.js`, `dinou/core/cache-revalidate.js`, `dinou/core/layout-composition.js`, `dinou/core/handler.js`):
  - **Metadata-only slot inspection & `_mutationEpoch` tracking (`dinou/core/storage-adapter.js`)**:
    - Added `StorageAdapter._mutationEpoch` (incremented on every `_markDeleted()`, `_unmarkDeleted()`, and `markTagInvalidated()` across all 5 adapters) so request-scoped caches auto-invalidate immediately whenever a mutation occurs mid-request.
    - Added `getSlotMetadata(slotId)` on `FileSystemStorage` (checks `existsSync(slot.json)` + reads only `slot.metadata.json`, skipping full `slot.json` body reads), `MemoryStorage` (returns `{ exists, metadata }` directly), and `DenoKVStorage` (reads only the manifest entry, skipping all `>16KB` chunk reads).
  - **Parallel, metadata-only & per-request deduplicated `inspectSlotsFreshness()` (`dinou/core/cache-slot.js`, `dinou/core/cache-revalidate.js`)**:
    - Updated `inspectSlotsFreshness(slotTags, hostGeneratedAt, options)` to inspect all unique canonical target slot IDs concurrently via `Promise.all()`, prefer `getSlotMetaFromStorage()` before falling back to full `getSlotFromStorage()`, parallelize tag-invalidation lookups on missing slots and `env.ASSETS` hydration, and memoize per-slot metadata on `requestStorage.getStore()._dinouSlotMetaCache` (keyed by `(storage, _mutationEpoch)`, automatically bypassed during active revalidations and via `{ bypassRequestCache: true }` in Cloudflare cross-isolate race checks `checkCloudflarePageRace()` / `checkCloudflareLayoutRace()`).
  - **Parallel multi-layout & union-slot prefetching (`dinou/core/handler.js`, `dinou/core/layout-composition.js`)**:
    - Parallelized `readMetaFromStorage()` across all active layout levels via `Promise.all()` in the RSC endpoint, HTML perimeter validation (after root-to-child blocking checks), HTML warm cache-hit sync, and asymmetric 3D composition.
    - Added union `slotTags` pre-warming (1 parallel `inspectSlotsFreshness()` batch across all non-expired layouts + page) before sequential ancestor-to-descendant revalidation decisions on warm HTML & RSC hits so overlapping shared slots across L1/L2/L3/Page are fetched once in parallel.
    - Parallelized `[readStorageArtifact(ownKey), readLayoutMeta(key)]` prefetching across all non-override layout levels upfront in `composeLayoutChainFromOwnFragments()` before sequential hole-offset shifting & composition.
  - **Measured Impact** (Windows Node 24, production mode):
    - `FileSystemStorage` multi-layer slot freshness check (6 × 40 KB slots shared across L1/L2/L3/Page, 50 requests): full `slot.json` payload reads **`600` (`12`/req) → `0` (`0`/req)** (**100% eliminated**); latency **`416.46 ms` (`8.33 ms`/req) → `91.37 ms` (`1.83 ms`/req)** (**~4.5× faster**).
    - Simulated 10 ms remote KV/Redis warm HTML cache hit on a 3-layout + 4-slot 3D Cube route: latency **`297.8 ms → 99.0 ms`/req** (**~3.0× faster**), remote `get()` calls **`17 → 12`/req** (**-29.4%**).

#### `OPT-4` (Tier 2) — `FileSystemStorage.get()` / `has()` Syscall Reduction & Redundant Cache-Miss Cleanup
- **Reduced `FileSystemStorage` syscalls by 67% per read and eliminated redundant cache-miss disk probes in `handler.js`** (`dinou/core/storage-adapter.js`, `dinou/core/handler.js`):
  - **Direct `readFileSync` + `EISDIR`/`EPERM` handling in `FileSystemStorage.get()` & single-`statSync` `has()` (`dinou/core/storage-adapter.js`)**:
    - Previously, `FileSystemStorage.get()` executed up to 6 synchronous OS syscalls (`existsSync` → `statSync` → duplicate `existsSync` → `readFileSync` → `existsSync(metaPath)` → `readFileSync(metaPath)`).
    - Replaced with direct `fs.readFileSync()` catching `EISDIR`/`EPERM` (retrying with `index.html` for dotted directory keys) and `ENOENT` (`return null`), plus direct `try { JSON.parse(fs.readFileSync(metaPath, "utf8")) }` without a preceding `existsSync`: **1 syscall** for `metadata.json` and cache misses, **2 syscalls** for HTML/RSC/Slot + companion metadata.
    - Simplified `FileSystemStorage.has()` from 3 syscalls to 1 `statSync` for regular files and misses.
  - **Eliminated duplicate cache-miss lookups & pre-storage disk probes (`dinou/core/handler.js`)**:
    - Skipped the duplicate `storage.get(cleanPath)` fallback on `FileSystemStorage` (`!storage.baseDir`) when `storage.get(htmlKey)` already missed (both resolve to identical `<cleanPath>/index.html` on disk, avoiding double misses on PPR `shell.html` routes).
    - Moved pre-storage `existsSync(payloadPath)` / `currentFallbackPath` / `legacyPath` disk probes on `/____rsc_page____` & `/____rsc_layout____` into the `!storage` fallback branch while keeping the pure-string `distDir` path-confinement `403` guard upfront, and passed `activeChain: perimeterLayoutChain` into `resolvePprForRoute()`.
  - **Measured Impact** (2,000 `FileSystemStorage.get()` calls across HTML, RSC, `layout.metadata.json`, and misses on Windows Node 24):
    - Total OS syscalls: **`9,000` (`4.50`/get) → `3,000` (`1.50`/get)** (**-66.7%**, `existsSync: 5,000 → 0`, `statSync: 1,500 → 0`).
    - Wall-clock latency: **`837.02 ms` (`418.5 µs`/get) → `271.56 ms` (`135.8 µs`/get)** (**~3.1× faster**).

#### `OPT-5` (Tier 2) — Permanent Production Caching & Pre-Serialization for `getDiscoveredLayouts()`
- **Eliminated periodic 1000 ms `src/` / VFS layout rediscovery in production and cached pre-serialized `__DINOU_LAYOUTS__` JSON in `O(1)` across streaming, recomposition, PPR resume, and revalidation paths** (`dinou/core/handler.js`, `dinou/core/ppr-runtime.js`, `dinou/core/cache-revalidate.js`):
  - **Permanent production layout discovery cache (`dinou/core/handler.js`)**:
    - Previously, whenever `globalThis.__DINOU_LAYOUTS__` was not pre-populated (e.g., Node Classic), `discoveredLayoutsCache` expired every `1000 ms` even in production, triggering a full recursive `fs.readdirSync` walk of `src/` (717 directory scans in `dinou-e2e`) or full `Object.keys(__DINOU_VFS__)` scan plus sorting on every expiry window.
    - Updated `getDiscoveredLayouts()` to cache permanently in production (`!isLiveDevMode()`) keyed by `(vfsRef, routeModulesRef, cwd)` while preserving the exact `1000 ms` TTL refresh in DEV mode, and exported `getDiscoveredLayouts`, `getDiscoveredLayoutsJson`, and `clearDiscoveredLayoutsCache`.
  - **Pre-serialized `O(1)` JSON cache (`dinou/core/handler.js`, `dinou/core/ppr-runtime.js`, `dinou/core/cache-revalidate.js`)**:
    - Added `getDiscoveredLayoutsJson()` memoized by source array reference (`discoveredLayoutsJsonSource === layouts`) so every streaming HTML render, lazy HTML recomposition, cached HTML injection, error page, and legacy fallback embeds the pre-serialized JSON string in `O(1)` without repeating `JSON.stringify()` on all 664 layout entries (~24 KB).
    - Passed `getDiscoveredLayoutsJson` into `handlePprResume()` (`dinou/core/ppr-runtime.js`, retaining backwards-compatible fallback to `getDiscoveredLayouts`) and memoized `JSON.stringify(globalThis.__DINOU_LAYOUTS__)` in `dinou/core/cache-revalidate.js` (`getRevalLayoutsJson()`).
  - **Measured Impact** (Windows Node 24, production mode, real `dinou-e2e` `src/` with 664 layout entries / 24,056 bytes JSON):
    - Node Classic steady production traffic (200 requests over 20s): `fs.readdirSync` **`14,340 → 0`** (**100% eliminated**), `JSON.stringify` **`200 → 0`**, wall-clock **`2,645.84 ms` (`13.229 ms`/req) → `0.38 ms` (`0.002 ms`/req)**.
    - AOT / Bun / Deno / Cloudflare Workers bootstrap builds (`globalThis.__DINOU_LAYOUTS__` pre-populated, 10,000 calls): `JSON.stringify` **`10,000 → 0`**, wall-clock **`221.38 ms` (`22.14 µs`/req) → `5.68 ms` (`0.57 µs`/req)** (**~39× faster**).

---

## Tracking Log

| ID | Tier | Summary | Core Files Modified | Measured Gain | Verification |
| :-: | :-: | --- | --- | --- | --- |
| **`OPT-1`** | Tier 1 | Authoritative production VFS negative lookups & `getLayoutFunctionsPath()` cache | `dinou/core/vfs.js`, `dinou/core/layout-functions.js` | `35.2 → 0` `fs.existsSync`/req; `2.15 ms → 0.21 ms`/req (**~10.5× faster**) | `optimizations-hot-path`, `cache-3d-distributed-storage`, `test:3d-reval`, `test:3d-cube`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8` |
| **`OPT-2`** | Tier 1 | Production `layoutFunctionsConfigCache` & single-pass layout chain / `lMeta` reuse | `dinou/core/layout-functions.js`, `dinou/core/layout-composition.js`, `dinou/core/handler.js` | `getStaticPaths` `300 → 0` (**~5.8× faster**); `layout.metadata.json` reads **`6 → 3`/req** (-50%); HTML cache hit **-34.3%** | `optimizations-hot-path`, `cache-3d-distributed-storage`, `test:3d-reval`, `test:3d-cube`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8` |
| **`OPT-3`** | Tier 1 | Parallel multi-layout / multi-slot I/O & metadata-only deduplicated `inspectSlotsFreshness()` | `dinou/core/storage-adapter.js`, `dinou/core/cache-slot.js`, `dinou/core/cache-revalidate.js`, `dinou/core/layout-composition.js`, `dinou/core/handler.js` | `slot.json` body reads **`12 → 0`/req** (**~4.5× faster** FS); simulated 10ms KV/Redis 3D hit **`298 ms → 99 ms`/req** (**~3.0× faster**, `-29%` remote reads) | `optimizations-hot-path`, `cache-3d-distributed-storage`, `test:3d-reval`, `test:3d-cube`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8` |
| **`OPT-4`** | Tier 2 | `FileSystemStorage.get()`/`has()` syscall reduction & duplicate miss cleanup | `dinou/core/storage-adapter.js`, `dinou/core/handler.js` | OS syscalls **`4.50 → 1.50`/get** (**-66.7%**); `418.5 µs → 135.8 µs`/get (**~3.1× faster**) | `optimizations-hot-path`, `cache-3d-distributed-storage`, `test:3d-reval`, `test:3d-cube`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8` |
| **`OPT-5`** | Tier 2 | Permanent production `getDiscoveredLayouts()` cache & `O(1)` pre-serialized JSON | `dinou/core/handler.js`, `dinou/core/ppr-runtime.js`, `dinou/core/cache-revalidate.js` | Node Classic 20s prod: `readdirSync` **`14,340 → 0`**, `2,645.8 ms → 0.38 ms`; AOT/Edge JSON stringify **`10,000 → 0`** (`22.14 µs → 0.57 µs`/req, **~39× faster**) | `optimizations-hot-path`, `cache-3d-distributed-storage`, `test:3d-reval`, `test:3d-cube`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8` |
