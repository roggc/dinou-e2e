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

---

## Tracking Log

| ID | Tier | Summary | Core Files Modified | Measured Gain | Verification |
| :-: | :-: | --- | --- | --- | --- |
| **`OPT-1`** | Tier 1 | Authoritative production VFS negative lookups & `getLayoutFunctionsPath()` cache | `dinou/core/vfs.js`, `dinou/core/layout-functions.js` | `35.2 → 0` `fs.existsSync`/req; `2.15 ms → 0.21 ms`/req (**~10.5× faster**) | `optimizations-hot-path`, `cache-3d-distributed-storage`, `test:3d-reval`, `test:3d-cube`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8` |
| **`OPT-2`** | Tier 1 | Production `layoutFunctionsConfigCache` & single-pass layout chain / `lMeta` reuse | `dinou/core/layout-functions.js`, `dinou/core/layout-composition.js`, `dinou/core/handler.js` | `getStaticPaths` `300 → 0` (**~5.8× faster**); `layout.metadata.json` reads **`6 → 3`/req** (-50%); HTML cache hit **-34.3%** | `optimizations-hot-path`, `cache-3d-distributed-storage`, `test:3d-reval`, `test:3d-cube`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8` |
