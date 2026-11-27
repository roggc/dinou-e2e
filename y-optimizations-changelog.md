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

---

## Tracking Log

| ID | Tier | Summary | Core Files Modified | Measured Gain | Verification |
| :-: | :-: | --- | --- | --- | --- |
| **`OPT-1`** | Tier 1 | Authoritative production VFS negative lookups & `getLayoutFunctionsPath()` cache | `dinou/core/vfs.js`, `dinou/core/layout-functions.js` | `35.2 → 0` `fs.existsSync`/req; `2.15 ms → 0.21 ms`/req (**~10.5× faster**) | `optimizations-hot-path`, `cache-3d-distributed-storage`, `test:3d-reval`, `test:3d-cube`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8` |
