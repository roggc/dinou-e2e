# Dinou Request-Path & 3D Caching Cube Performance Optimizations (`y-optimizations.md`)

This document specifies **7 concrete, code-verified request-path latency optimizations** (`OPT-1` through `OPT-7`) uncovered during a full hot-path audit of `dinou/core/` following the completion of Phases 1–8 of the **3D Caching Cube + Revalidation** suite.

> **Audit Scope & Baseline**
> Prior latency regressions introduced in Phase 8 Stage 4 (`#90`) — namely `O(tags × totalSlots)` slot scans in `resolveAllCanonicalSlotIds`, sequential tag-invalidation loops in `cache-revalidate.js`, per-request `readdirSync` and full-index invalidation on `delete()` in `FileSystemStorage` — have already been fixed (`45d4741`, `5709bdd`, and pending `storage-adapter.js` / `cache-slot.js` hardening).
>
> This roadmap targets the **remaining pre-existing per-request bottlenecks** across **all runtimes** (Node.js AOT & Classic, Bun, Bun Pure, Deno, Cloudflare Workers) and **all storage adapters** (`FileSystemStorage`, `MemoryStorage`, `CloudflareKVStorage`, `RedisStorage`, `DenoKVStorage`).

All optimizations below are designed to be implemented **one stage at a time**, keeping 100% functional parity across all 3D Cube invariants, dev-mode HMR, multi-bundler parity (`Esbuild`, `Rollup`, `Webpack`), and distributed storage consistency — recording every applied optimization and measured gain in `y-optimizations-changelog.md`.

---

## Optimization Impact & Priority Matrix

| ID | Tier | Target Area | Primary Core Files | Affected Runtimes | Expected Latency Impact | Risk |
| :-: | :-: | --- | --- | --- | --- | :-: |
| **`OPT-1`** | **Tier 1** | Production VFS Authoritative Negative Lookups & `getLayoutFunctionsPath()` Cache | `dinou/core/vfs.js`, `dinou/core/layout-functions.js` | Node, Bun, Bun Pure, Deno (huge on Windows/NTFS) | **High** — eliminates dozens of sync `fs.existsSync()` syscalls per request | Low |
| **`OPT-2`** | **Tier 1** | Production `layoutFunctionsConfigCache` & Single-Pass Layout Chain / Metadata Reuse | `dinou/core/layout-functions.js`, `dinou/core/handler.js` | **All runtimes** (HTML, `/____rsc_page____`, `/____rsc_layout____`) | **High** — stops per-request `getStaticPaths()` re-execution, cuts 3× layout tree traversals to 1× and 2× metadata reads to 1× | Low–Med |
| **`OPT-3`** | **Tier 1** | Parallel Multi-Layout & Multi-Slot I/O + Metadata-Only `inspectSlotsFreshness()` | `dinou/core/cache-slot.js`, `dinou/core/handler.js`, `dinou/core/layout-composition.js`, `dinou/core/storage-adapter.js` | **All runtimes** (massive on KV / Redis / DenoKV & multi-slot 3D Cube pages) | **High** — collapses `N + M` sequential roundtrips into 1–2 parallel batches; avoids reading full `slot.json` bodies on freshness checks | Medium |
| **`OPT-4`** | **Tier 2** | `FileSystemStorage.get()` Syscall Reduction (6 → 1–2) & Duplicate Cache-Miss Cleanup | `dinou/core/storage-adapter.js`, `dinou/core/handler.js` | Node, Bun, Bun Pure, Netlify, Docker | **Medium–High** — cuts 3–4 redundant syscalls per disk read and removes duplicate `index.html` / folder misses on PPR routes | Low |
| **`OPT-5`** | **Tier 2** | Permanent Production Caching & Pre-Serialization for `getDiscoveredLayouts()` | `dinou/core/handler.js` | Node, Bun, Bun Pure, Edge (when `__DINOU_LAYOUTS__` not injected) | **Medium** — eliminates full `src/` / VFS tree walk every 1000 ms and repeated `JSON.stringify` on streaming/recomposed HTML | Very Low |
| **`OPT-6`** | **Tier 3** | Zero-Hole Layout RSC Fast-Path in Pure PPR Streaming Resume | `dinou/core/ppr-runtime.js` | **All runtimes** (Pure PPR routes with static layouts) | **Medium** — skips `deserializeJSX` + `renderRSCStream` for static layouts on every PPR resume request | Medium |
| **`OPT-7`** | **Tier 3** | Memoized `_DinouPageSlot` Client Ref & Bounded Production Route-Match LRU Cache | `dinou/core/get-jsx.js`, `dinou/core/get-file-path-and-dynamic-params.js`, `dinou/core/layout-functions.js` | **All runtimes** | **Low–Medium** — `O(1)` cached route/layout resolution for hot URLs and zero manifest scans per `createDinouPageSlotElement()` | Low |

---

## Master Checklist

### Tier 1 — Highest Per-Request Impact (All Production Requests & 3D Cube Hot Paths)
- [x] **`OPT-1`** — Authoritative Production VFS Negative Lookups (`vfs.js`) & `getLayoutFunctionsPath()` Caching (`layout-functions.js`)
- [x] **`OPT-2`** — Production `layoutFunctionsConfigCache` (`layout-functions.js`) & Single-Pass Layout Chain / Metadata Reuse (`handler.js`)
- [x] **`OPT-3`** — Parallel Multi-Layout / Multi-Slot Prefetch & Metadata-Only, Per-Request Deduplicated `inspectSlotsFreshness()` (`cache-slot.js`, `handler.js`, `layout-composition.js`, `storage-adapter.js`)

### Tier 2 — Clean, High-Value Low-Risk Wins
- [x] **`OPT-4`** — `FileSystemStorage.get()` Syscall Reduction (`6 → 1–2` syscalls) & Redundant Cache-Miss Elimination (`storage-adapter.js`, `handler.js`)
- [x] **`OPT-5`** — Permanent Production Caching & Pre-Serialized JSON for `getDiscoveredLayouts()` (`handler.js`)

### Tier 3 — PPR & Micro-Level CPU Optimizations
- [x] **`OPT-6`** — Zero-Hole Static Layout (and 0-Hole Page) Pre-Rendered RSC Reuse in `handlePprResume()` (`ppr-runtime.js`)
- [ ] **`OPT-7`** — Cached `_DinouPageSlot` Client Reference (`get-jsx.js`) & Bounded Production Route-Match LRU Cache (`get-file-path-and-dynamic-params.js`, `layout-functions.js`)

---

## Global Execution & Verification Rules

1. **One Stage at a Time:** Implement and verify optimizations sequentially (`OPT-1 → OPT-7`), keeping each diff surgical and easy to review or bisect.
2. **Zero Behavioral Regressions:** Every optimization must preserve 100% of existing semantics:
   - Dev mode (`DINOU_DEV === "true"` / `NODE_ENV !== "production"`) hot-reloading and filesystem mutations remain uncached / live.
   - Dynamic perimeter hooks (`validateParams(params)`), dynamic TTL functions (`revalidate(params)`), and dynamic tag functions (`getCacheTags(params)`) MUST continue executing per-request when exported as functions (never frozen to a single param's return value).
   - Multi-process external disk updates (e.g., child worker `Check #84`), distributed tombstones & tag invalidations (`RedisStorage`, `DenoKVStorage`, `CloudflareKVStorage` + `env.ASSETS`), causal `_old` snapshots (`Check #81`, `#85`), RFC 9110 `HEAD` semantics (`Check #89`), `React.cache()` isolation (`Check #90`), and React 19 `useId()` PPR skeleton fidelity (`Check #76`) MUST remain intact.
3. **Mandatory Verification Per Stage:**
   - Syntax check (`node --check`) on all touched files.
   - Targeted regression suites:
     - `node --test tests/unit/cache-3d-distributed-storage.test.mjs`
     - `npm run test:3d-reval` (`tests/unit/cache-3d-revalidation-matrix.test.mjs`)
     - `npm run test:3d-cube` (`tests/unit/cache-3d-cube.test.mjs`)
     - `node --test tests/unit/cache-3d-cube-phase7.test.mjs`
     - `node --test tests/unit/cache-3d-cube-phase8.test.mjs`
   - Micro-benchmark (before vs. after latency / syscall count on representative Static, 3D Multi-Layout + Multi-Slot, and Pure PPR routes) whenever applicable.
4. **Companion Changelog (`y-optimizations-changelog.md`):** Document every completed optimization in English in `y-optimizations-changelog.md` at the project root (Keep-a-Changelog format + Tracking Log table with measured results).

---

## Tier 1 — High-Impact Per-Request Bottlenecks

### `OPT-1` — Authoritative Production VFS Negative Lookups & `getLayoutFunctionsPath()` Caching

#### Code Locations & Root Cause
- **`dinou/core/vfs.js` (`L67–L117`):**
  In production (`!isDevelopment`), `vfs.js` builds a complete in-memory snapshot of `src/` via `buildVfs(srcDir, srcDir)` (or uses the build-time injected `globalThis.__DINOU_VFS__`). However, `existsSync(filePath)` only short-circuits on **hits**:
  ```js
  export function existsSync(filePath) {
    const vfs = getVfs();
    if (lookupVfs(vfs, filePath) !== null) {
      return true;
    }
    try {
      if (typeof fs.existsSync === "function" && fs.existsSync(filePath)) {
        return true;
      }
    } catch (e) {}
    return false;
  }
  ```
  Roughly **85–95% of router probes are negative lookups** (`no_layout`, `reset_layout`, `page_functions.{tsx,ts,jsx,js,mjs}`, `layout_functions.{tsx,ts,jsx,js,mjs}`, `layout.functions.{tsx,ts,jsx,js,mjs}`, non-matching `page.*` / `layout.*` / `not_found.*` / `error.*` extensions). Every single negative lookup falls through to a real OS `fs.existsSync()` syscall!
- **`dinou/core/layout-functions.js` (`L19–L41`):**
  `getLayoutFunctionsPath(layoutFolderPath)` loops over `2 names × 5 extensions` and calls `existsSync(candidate)` **and** `existsSync(slashCandidate)` — up to **20 uncached syscalls** per layout folder that has no `layout_functions` file, executed on every request.

#### Why It Hurts Request Latency
- On a 4-level nested route (`/a/b/c/d`), router + layout resolution triggers **60–120+ synchronous OS `stat`/`existsSync` syscalls per request** in production even though `src/` is completely static and already indexed in memory.
- On Windows (NTFS + Defender realtime scanning), synchronous negative `fs.existsSync()` calls are an order of magnitude slower than on Linux, amplifying latency across Node, Bun, and Bun Pure.

#### Proposed Optimization Design
1. **Track VFS coverage root in `dinou/core/vfs.js`:**
   - Record whether the active VFS snapshot is authoritative for `src/` in production (`!isDevelopment`):
     - When `globalThis.__DINOU_VFS__` is injected (AOT/Edge/Cloudflare bundles), any path under `src/` (normalized `src/...`, `/src/...`, or `.../src/...`) whose `lookupVfs(vfs, filePath)` returns `null` is guaranteed absent → `return false` immediately with **zero `fs.existsSync` calls**.
     - When `buildVfs(srcDir, srcDir)` populates `localVfs` on startup, record the normalized `builtSrcRoot` (`normalizeKey(srcDir)`). If `!isDevelopment` and `filePath` resolves inside `builtSrcRoot` (or `src/...` relative to the same `cwd`), a `lookupVfs()` miss returns `false` directly without touching disk.
     - Paths *outside* `builtSrcRoot` (e.g., `.dinou/dist2/...` or temporary test directories created under a different `cwd` in unit tests) still safely fall back to `fs.existsSync(filePath)`.
   - Also check `readdirSync()` (`L119–L141`): if `!isDevelopment` and `dirPath` is inside the authoritative VFS root and `lookupVfs()` returns `null`, return `[]` immediately without calling `fs.readdirSync()`.
2. **Cache `getLayoutFunctionsPath(layoutFolderPath)` in `dinou/core/layout-functions.js`:**
   - Maintain a production-only `Map<string, string | null>` (`layoutFunctionsPathCache`) keyed by normalized `layoutFolderPath` (bypassed when `isDevelopment` is true).
   - Remove the redundant `slashCandidate` second `existsSync()` call when `slashCandidate === candidate` (POSIX) or after VFS already normalizes slashes internally.

#### Safety Invariants & Verification
- Unit tests that dynamically generate temporary project directories under `.dinou/tmp-*` must not get false negatives from a parent process's `localVfs` (enforced by matching `builtSrcRoot` to `normalizeKey(path.resolve(process.cwd(), "src"))` and verifying `filePath` is strictly contained within `builtSrcRoot`).
- Verify with `test:3d-cube`, `test:3d-reval`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8`, and measure syscall count & request latency before/after.

---

### `OPT-2` — Production `layoutFunctionsConfigCache` & Single-Pass Layout Chain / Metadata Reuse

#### Code Locations & Root Cause
1. **Uncached `resolveLayoutFunctionsConfig()` (`dinou/core/layout-functions.js:80–199`):**
   - Unlike `resolvePageFunctionsConfig()` (`handler.js:583`, which caches static module metadata in `pageFunctionsConfigCache`), `resolveLayoutFunctionsConfig()` has **zero caching**.
   - On **every single HTTP request** (HTML, `/____rsc_page____`, `/____rsc_layout____`) and for **every layout in the chain**:
     - Calls `getDinouConfig()`
     - Calls `getLayoutFunctionsPath()` (20 probes)
     - Calls `await importModule(layoutFunctionsPath)`
     - Calls `await resolveModulePpr(mod)`
     - Calls `await rawAllowISG()`
     - **Re-executes `await getStaticPaths()`** and rebuilds `new Set(paths.map(...JSON.stringify...))` on every single request!
2. **Triple Layout-Chain Traversal & Double Sequential `layout.metadata.json` Reads per Request (`dinou/core/handler.js`):**
   - **HTML path (`GET /*`):**
     - `L3685`: `getFilePathAndDynamicParams(reqSegments, ..., "layout", ...)` (traversal #1 — note `layouts` is used later for error/rendering branches).
     - `L3713`: `const activeLayoutsForRoute = getActiveLayoutChain(reqSegments, queryObj, srcFolder)` (traversal #2).
     - `L3716–L3787`: iterates `activeLayoutsForRoute`, calling `resolveLayoutFunctionsConfig()` and `await readMetaFromStorage(storage, lMetaKey, lRscKey)` sequentially — **and throws away `lMeta`** after only checking `lMeta?.dynamic`!
     - `L4079`: **`const activeLayoutChain = getActiveLayoutChain(reqSegments, queryObj, srcFolder)`** (traversal #3 of the exact same `reqSegments` in the exact same request!).
     - `L4087–L4113`: calls `await readMetaFromStorage(storage, lMetaKey, lRscKey)` **a second time for every single layout**!
   - **RSC path (`/____rsc_page____` & `/____rsc_layout____`):**
     - `L2146`: `getLayoutsForLayoutKey(...)`
     - `L2167`: `perimeterLayoutChain = getActiveLayoutChain(...)` (traversal #2)
     - `L2425`: `activeChain = getActiveLayoutChain(...)` (traversal #3 — identical arguments to `L2167`!)
   - **Cold `resolvePageFunctionsConfig()` (`L604–L607`):**
     - Calls `resolvePprForRoute(...)` **twice back-to-back** (first for combined route PPR, second for `{ segment: "page" }`), running `resolveLayoutChainPpr()` twice for the exact same route.

#### Why It Hurts Request Latency
- Any layout exporting `getStaticPaths()` (e.g., querying a database, reading disk, or returning hundreds of params) currently runs `getStaticPaths()` on **every single incoming user request**.
- Every HTML request on a 3-layout route performs **3 full route-tree traversals** and **6–8 `layout.metadata.json` reads** (half of them completely redundant).

#### Proposed Optimization Design
1. **Add `layoutFunctionsConfigCache` in `dinou/core/layout-functions.js` (production only):**
   - Mirror `pageFunctionsConfigCache` in `handler.js`, keyed by normalized `layoutPath` (or `layoutFolder`).
   - Cache static/structural properties once in production (`!isDevelopment`):
     - `layoutFunctionsPath` (or `null`), `allowISG` (resolved once unless function? Note: `pageFunctionsConfigCache` resolves `rawAllowISG()` once in prod; keep identical semantics), `staticPathsSet`, `validateParams` fn ref, `revalidateFn` vs `staticRevalidate`, `getCacheTagsFn` vs `staticTags`, `getProps` fn ref, `ppr`.
   - On every call, still invoke dynamic per-request functions (`revalidateFn(dParams)`, `getCacheTagsFn(dParams)`) cleanly — and return `validateParams` / `getProps` references so perimeter guards execute dynamically per request!
   - Also expose a `clearLayoutFunctionsConfigCache()` helper (and ensure `isDevelopment` bypasses the cache).
2. **Eliminate duplicate `getActiveLayoutChain()` calls & attach `lMeta` onto chain entries in `dinou/core/handler.js`:**
   - In the HTML path (`L3713` → `L4079` → `L5081`): reuse `activeLayoutsForRoute` directly instead of calling `getActiveLayoutChain()` again at `L4079`. Store `entry._prefetchedMeta` (when read at `L3757`) and reuse it at `L4087` and `L5089` (unless a `revalidateLayout()` occurred in between, in which case `entry._prefetchedMeta` is updated/invalidated).
   - In the RSC path (`L2167` → `L2425`): reuse `perimeterLayoutChain` directly instead of calling `getActiveLayoutChain()` again at `L2425`.
   - In `resolvePageFunctionsConfig()` (`L604–L607`): compute `{ ppr, pagePpr }` in a **single** call to `resolvePprForRoute()` (e.g. `{ returnDetails: true }` returning `{ routePpr, pagePpr, anyLayoutPpr }`) instead of calling `resolvePprForRoute()` twice.

#### Safety Invariants & Verification
- Crucial: if `revalidateLayout()` runs mid-request (e.g., lazy sync or TTL expiry), always refresh/overwrite `entry._prefetchedMeta` (never serve stale prefetched metadata after a revalidation).
- Crucial: `validateParams(dParams)` MUST still run per-request on dynamic params (never cached per `layoutPath`), as must `revalidate(dParams)` and `getCacheTags(dParams)` when exported as functions.
- Verify with `test:3d-cube`, `test:3d-reval`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8` (specifically `Check #75` perimeter guards, `Check #83` per-param `revalidate(params)`, `Check #85` mid-ISR `validateParams` transitions).

---

### `OPT-3` — Parallel Multi-Layout & Multi-Slot I/O + Metadata-Only `inspectSlotsFreshness()`

#### Code Locations & Root Cause
1. **Full-Payload Sequential Reads in `inspectSlotsFreshness()` (`dinou/core/cache-slot.js:1770–1837`):**
   ```js
   for (const rawTagOrId of slotTags) {
     ...
     for (const targetId of targetIds) {
       ...
       const storageKey = `slots/${targetId}/slot.json`;
       const cached = await getSlotFromStorage(storage, storageKey, [targetId, rawTagOrId]);
   ```
   - `inspectSlotsFreshness()` runs **sequentially** (`for ... await`) for every slot ID.
   - Worse, it calls `getSlotFromStorage(storage, "slots/<id>/slot.json", ...)`, which reads the **entire serialized JSX body of `slot.json`** (potentially tens or hundreds of KB) **plus** `slot.metadata.json`, even though `inspectSlotsFreshness()` **never parses or uses `cached.content`** — it only checks that the slot exists and reads `meta.generatedAt` and `meta.revalidate`!
   - Worse still, on a 3D Cube page where a shared slot tag appears in L1 `slotTags`, L2 `slotTags`, and Page `slotTags`, `inspectSlotsFreshness()` is called separately for each host and **re-reads the exact same slot 3 times** within the same HTTP request!
2. **Sequential Multi-Layout Metadata & Own-Fragment Reads:**
   - `dinou/core/handler.js` `L2430–L2446` (RSC endpoint): `for (const entry of activeChain) { const lMeta = await readMetaFromStorage(...); }` — sequential across all layouts.
   - `dinou/core/handler.js` `L3757` & `L4087–L4113` (HTML cache hit): sequential `await readMetaFromStorage(...)` across all layouts.
   - `dinou/core/handler.js` `L5081–L5100` (Asymmetric 3D composition): sequential `await readMetaFromStorage(...)` across all layouts.
   - `dinou/core/layout-composition.js` `L424–L459` (`composeLayoutChainFromOwnFragments`): reads `[ownItem, lMeta]` sequentially **level by level** (`L0` → wait → `L1` → wait → `L2` → wait → `L3`) instead of prefetching all non-override levels in one `Promise.all()`.

#### Why It Hurts Request Latency
- On distributed/Edge storages (`CloudflareKVStorage`, `RedisStorage`, `DenoKVStorage`), every sequential `await` adds a full network/IPC roundtrip (`5–40 ms` each): a 3-layout + 4-slot 3D Cube route currently pays **7–12 sequential roundtrips** on every single cache hit instead of **2 parallel batches**.
- On local disk (`FileSystemStorage`), reading and allocating strings for full `slot.json` payloads on every cache hit wastes disk I/O and GC pressure.

#### Proposed Optimization Design
1. **Add metadata-only slot inspection helper (`getSlotMetaFromStorage` / `storage.getSlotMeta`):**
   - On `FileSystemStorage`: read **only** `slots/<id>/slot.metadata.json` and check `fs.existsSync(slots/<id>/slot.json)` (or `statSync`) — **zero `readFileSync` of `slot.json` payload**!
   - On `MemoryStorage`: return `{ exists: true, metadata }` directly from the in-memory `Map` without copying content.
   - On `CloudflareKVStorage`: prefer `kv.getWithMetadata("slots/<id>/slot.json", "text")` or `slots/<id>/slot.metadata.json` when available, preserving exact tombstone & tag-invalidation checks (including `env.ASSETS` fallback on cold isolate miss).
   - On `RedisStorage` / `DenoKVStorage`: read `slots/<id>/slot.metadata.json` first (checking tombstones/tag invalidations) and fall back to `getSlotFromStorage` only if `slot.metadata.json` is missing.
2. **Parallelize & Per-Request Deduplicate `inspectSlotsFreshness()` (`dinou/core/cache-slot.js`):**
   - Collect all unique `(targetId, rawTagOrId)` pairs first after `resolveAllCanonicalSlotIdsBatch()`, then inspect them concurrently via `Promise.all()`.
   - Cache slot inspection results (`{ exists, isDeleted, isTagInvalidated, generatedAt, revalidate }`) on a request-scoped `Map` (`reqCtx._slotMetaCheckCache`) inside `requestStorage.getStore()` so L1, L2, L3, and Page never re-read the same slot twice in the same request (automatically invalidated whenever `storage.set()` / `storage.delete()` / `revalidateTag()` runs in that request!).
3. **Parallelize Multi-Layout Prefetches (`handler.js` & `layout-composition.js`):**
   - In `handler.js` (`L2430`, `L3716`, `L4087`, `L5081`): prefetch `layout.metadata.json` for all layouts in `activeChain` in parallel via `Promise.all()` before running the sequential ancestor-to-descendant freshness/revalidation decision loop.
   - In `layout-composition.js` (`composeLayoutChainFromOwnFragments`): prefetch `[ownItem, lMeta]` for all non-override levels in a single `Promise.all()` upfront, then run the deterministic sequential hole-offset shifting & composition loop over the prefetched results.

#### Safety Invariants & Verification
- **Order-dependent revalidations stay sequential:** Only read-only metadata/artifact fetches are parallelized; ancestor-first `revalidateLayout()` execution and `shiftPprHoleIdsInTree()` hole-offset accumulation MUST remain strictly sequential (`root → leaf`).
- **Mid-request mutation invalidation:** Any `revalidateLayout()`, `revalidatePage()`, `revalidateTag()`, or `getSlotJSX({ fresh: true })` within the request MUST clear `reqCtx._slotMetaCheckCache` so subsequent checks see freshly written slot timestamps (crucial for `Check #90` Cloudflare post-commit race checks and Server Function + SSR flows).
- Verify with `cache-3d-distributed-storage.test.mjs`, `test:3d-reval` (`Check #80–#84`), `cache-3d-cube-phase8.test.mjs` (`Check #90`), and `test:3d-cube`.

---

## Tier 2 — Clean, High-Value Low-Risk Wins

### `OPT-4` — `FileSystemStorage.get()` Syscall Reduction & Redundant Cache-Miss Cleanup

#### Code Locations & Root Cause
1. **`dinou/core/storage-adapter.js` (`L250–L293` — `FileSystemStorage.get`):**
   Currently executes up to **6 synchronous syscalls** per `get()`:
   1. `fs.existsSync(targetPath)`
   2. `fs.statSync(targetPath).isDirectory()`
   3. `fs.existsSync(targetPath)` *(exact duplicate of #1!)*
   4. `fs.readFileSync(targetPath, "utf8")`
   5. `fs.existsSync(metaPath)`
   6. `fs.readFileSync(metaPath, "utf8")`
2. **`dinou/core/handler.js` (`L3846–L3853` — HTML cache lookup):**
   ```js
   cachedItem = await storage.get(htmlKey);      // "foo/index.html"
   if (!cachedItem) {
     cachedItem = await storage.get(cleanPath);  // "foo" -> resolves to "foo/index.html" AGAIN on FileSystemStorage!
   }
   if (!cachedItem && isPprConfig) {
     cachedItem = await storage.get(shellHtmlKey);
   }
   ```
   On PPR routes (whose artifact is `shell.html`, not `index.html`), `storage.get(cleanPath)` repeats the exact same missing path lookup on `FileSystemStorage` (and also duplicates misses on `MemoryStorage` and `CloudflareKVStorage` when `htmlKey` already missed).
3. **`dinou/core/handler.js` (`L2703–L2725` — RSC endpoint):**
   Performs up to 3 direct disk `existsSync(payloadPath)` calls *before* calling `storage.get(rscKey)` — redundant when `FileSystemStorage` is active and unnecessary overhead on non-FS storages.

#### Proposed Optimization Design
1. Rewrite `FileSystemStorage.get()` to read directly via `try { fs.readFileSync(targetPath, "utf8"); } catch (e)` handling `EISDIR` (append `index.html` and retry once) and `ENOENT` (`return null`), and read companion `metaPath` directly via `try { JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch (e) {}`.
   - Reduces `metadata.json` reads from **4 syscalls → 1 syscall**.
   - Reduces HTML / RSC / Slot reads from **6 syscalls → 2 syscalls**.
   - Reduces cache misses from **2 syscalls → 1 syscall**.
2. In `handler.js:3846–3853`:
   - For `isPprConfig` routes where `shell.html` is expected, check `htmlKey` and skip redundant `storage.get(cleanPath)` when `storage.baseDir` is set (since `FileSystemStorage._resolve(cleanPath)` always equals `FileSystemStorage._resolve(htmlKey)`!). Even better, when `isPprConfig` is true and `storage.baseDir` is set, avoid the duplicate miss cleanly.
3. In `handler.js:2703–2729`:
   - Keep the path-confinement security check (`!payloadPath.startsWith(distDir)`), and only run disk fallback `existsSync` checks if actually needed (never duplicating `storage.get()`'s own fallback chain).

#### Safety Invariants & Verification
- Preserve directory confinement (`403 Forbidden`) and legacy `rsc.rsc` / `._old.rsc` fallback ordering.
- Verify on Windows (`EISDIR` vs `EPERM` on directories in Node/Bun on Windows: note that `fs.readFileSync(dirPath)` throws `EISDIR` on Linux/macOS/Node 24 Windows, and can occasionally throw `EPERM` on some Windows/Bun versions — handle both `e.code === "EISDIR" || e.code === "EPERM"` safely!).

---

### `OPT-5` — Permanent Production Caching & Pre-Serialization for `getDiscoveredLayouts()`

#### Code Locations & Root Cause
- **`dinou/core/handler.js` (`L860–L917`, `L4278–L4279`, and `ppr-runtime.js:1036–1039`):**
  ```js
  let discoveredLayoutsCache = null;
  let lastLayoutsDiscoveryTime = 0;

  function getDiscoveredLayouts() {
    if (typeof globalThis !== "undefined" && Array.isArray(globalThis.__DINOU_LAYOUTS__) && globalThis.__DINOU_LAYOUTS__.length > 0) {
      return globalThis.__DINOU_LAYOUTS__;
    }
    const now = Date.now();
    if (discoveredLayoutsCache && now - lastLayoutsDiscoveryTime < 1000) {
      return discoveredLayoutsCache;
    }
  ```
  Even in production (`!isDevelopment`), whenever `globalThis.__DINOU_LAYOUTS__` is not pre-populated, `discoveredLayoutsCache` expires **every 1000 ms**, triggering a full recursive walk of `src/` (or scanning every key of `globalThis.__DINOU_VFS__`), sorting all paths, and recomputing every route rule. Additionally, callers re-run `JSON.stringify(knownLayouts)` on every streaming / lazy-recomposed HTML response.

#### Proposed Optimization Design
- In `getDiscoveredLayouts()`: when `!isDevelopment` and `discoveredLayoutsCache !== null`, return it immediately without checking `now - lastLayoutsDiscoveryTime < 1000` (keep the 1000 ms TTL only in dev mode).
- Cache a companion `getDiscoveredLayoutsJson()` (invalidated whenever `discoveredLayoutsCache` refreshes in dev or `__DINOU_LAYOUTS__` changes) so streaming HTML & lazy recomposition embed the pre-serialized string in `O(1)`.

#### Safety Invariants & Verification
- Keep the 1000 ms refresh (or live discovery) strictly intact when `isDevelopment === true`.
- Verify `__DINOU_LAYOUTS__` bootstrap script output matches byte-for-byte in Node Classic, Node AOT, Bun Pure, and Cloudflare Workers.

---

## Tier 3 — PPR & Micro-Level CPU Optimizations

### `OPT-6` — Zero-Hole Static Layout (and 0-Hole Page) Pre-Rendered RSC Reuse in `handlePprResume()`

#### Code Locations & Root Cause
- **`dinou/core/ppr-runtime.js` (`L1235–L1278`):**
  At the end of every Pure PPR streaming resume (`handlePprResume`), Dinou embeds inline RSC payloads (`__DINOU_RSC_L__` and `__DINOU_RSC_P__`) so client hydration avoids extra `/____rsc_layout____` and `/____rsc_page____` fetches:
  ```js
  if (hasActiveLayout && layoutShellJson) {
    const cachedLayoutTree = cachedLayoutTreeForResume || deserializeJSX(layoutShellJson);
    const splicedLayoutTree = replaceHolesWithMap(cachedLayoutTree, resolvedHolesMap);
    const layoutRscStream = renderRSCStream(splicedLayoutTree, clientManifest, { runtime: "edge" });
    layoutRscPromise = new Response(layoutRscStream).text();
  }
  ```
  In the most common real-world PPR topology (**static layout with 0 dynamic holes + PPR page with dynamic holes**), `replaceHolesWithMap()` does **not modify a single node** of `cachedLayoutTree`, yet Dinou still runs `deserializeJSX` + full tree walk + full `renderRSCStream()` (React Flight serialization) + `new Response().text()` on the layout for **every single HTTP request**!
  The same happens for 0-hole PPR pages (`holes.length === 0`), where pre-rendered `page.rsc` / `shell.rsc` already exists in storage.

#### Proposed Optimization Design
1. Make `replaceHolesWithMap()` return the **exact same object reference** (`cachedTree`) when zero holes were replaced (currently `Array.isArray(node)` always allocates a new array via `.map()`, losing referential equality!).
2. In `handlePprResume()`:
   - When `hasActiveLayout` and `splicedLayoutTree === cachedLayoutTree` (zero layout holes replaced — or before even walking when `resolvedHolesMap.size === 0` or `layoutMeta` has zero holes): read pre-rendered cached `layout.rsc` directly from storage (`readRscFromStorage`) instead of running `renderRSCStream(splicedLayoutTree)`! Fall back to `renderRSCStream()` only if cached `layout.rsc` is unavailable.
   - Similarly, if `resolvedHolesMap.size === 0` (0-hole PPR route) and pre-rendered `shell.rsc` / `page.rsc` is cached, emit it directly without re-running `renderRSCStream()` on the page tree either.
   - Bonus: when layout has 0 holes and `buildPprHoleSkeleton` is only needed for page holes (or layout has holes), we still keep `cachedLayoutTreeForResume` available for `buildPprHoleSkeleton` so React 19 `useId()` TreeId parity (`Check #76`) is 100% preserved!

#### Safety Invariants & Verification
- **Strict React 19 `useId()` & Hydration Parity (`Check #76`):** `shellContextForHoles` MUST still receive `cachedLayoutTreeForResume` when `pageTree` has holes so `buildPprHoleSkeleton()` computes the exact TreeId. Only the *inline RSC emission* (`layoutRscText`) skips `renderRSCStream()` when no layout holes were spliced!
- **Stale layout guard:** Verify that after `revalidateLayout()` (including `onlyRefreshSlots` or `recomposeOnly`), `layout.rsc` in storage is always updated in lockstep with `shell.layout.json`, so reading `layout.rsc` serves the exact same fresh layout with zero `#418` hydration mismatch.
- Verify with `test:3d-cube` (`Check #76` `useId()`, `Check #70` nested slots, `Check #73` zero-hole PPR), `test:3d-reval`, and `cache-3d-cube-phase7` (`Check #86` metadata hoisting).

---

### `OPT-7` — Memoized `_DinouPageSlot` Client Reference & Bounded Production Route-Match LRU Cache

#### Code Locations & Root Cause
1. **`dinou/core/get-jsx.js` (`L37–L97` — `createDinouPageSlotElement`):**
   Unlike `getCacheSlotBoundary()` in `dinou/core/cache-slot.js:248–293` (which caches `_DinouCacheSlotBoundary` once), `createDinouPageSlotElement()` re-scans all `Object.keys(globalThis.__DINOU_CLIENT_MANIFEST__)` and re-invokes `registerClientReference(...)` on every single call.
2. **`dinou/core/get-file-path-and-dynamic-params.js` & `dinou/core/layout-functions.js`:**
   Even after `OPT-1` eliminates disk syscalls via VFS, every request still executes recursive `matchRouteTree()`, `collectGroupChains()`, `sortDirEntries()`, and `getSlots()` (allocating intermediate arrays/objects) for the same popular URL paths over and over.

#### Proposed Optimization Design
1. **Memoize `_DinouPageSlot` in `dinou/core/get-jsx.js`:**
   - Cache the registered client reference once at module scope (exact same pattern as `_DinouCacheSlotBoundary` in `cache-slot.js`), invalidating only if `globalThis.__DINOU_CLIENT_MANIFEST__` reference changes.
2. **Bounded Production Route-Match LRU Cache (`MAX_ENTRIES = 1000`):**
   - In production (`!isDevelopment`), cache the structural result of `getFilePathAndDynamicParams` (for standard `page` / `layout` / `no_layout` lookups where `query` does not affect file matching) and `getActiveLayoutChain` keyed by `cwd + "\0" + reqSegments.join("/") + "\0" + flags`.
   - Evict oldest entry when `cache.size > 1000` so unbounded dynamic URLs (`/items/1`, `/items/2`, ...) can **never** leak memory (OOM-safe!).
   - Return shallow-cloned entries (`{ ...entry, dParams: { ...entry.dParams } }`) from `getActiveLayoutChain` so per-request mutations (`entry.hasMeta`, `entry.generatedAt`, `entry.isDynamicConfig`, `entry.effectivePpr`, etc.) **never bleed across concurrent requests**!

#### Safety Invariants & Verification
- **Zero cross-request mutation leak:** Because `handler.js` mutates properties directly onto objects inside `activeChain` (`entry.hasMeta = ...`, `entry.generatedAt = ...`, `entry.isDynamicConfig = ...`), cached chain entries MUST be cloned per call before returning.
- **Zero unbounded memory growth:** Hard cap at `1000` entries with `Map` insertion-order LRU eviction.
- **Multi-cwd safety:** Include normalized `srcFolder` in the cache key so compiled/in-process unit tests running against temporary fixtures never collide.
- Verify with full unit & E2E suites (`test:3d-cube`, `test:3d-reval`, `cache-3d-cube-phase7`, `cache-3d-cube-phase8`).
