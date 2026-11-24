# Changelog — Dinou `10.0.5` (Phase 5 — Remaining Orthogonal 3D Caching Cube & Runtime Parity Hardening)

All notable core bug fixes uncovered and resolved during Phase 5 (`y-phase5-cube-tests.md`, Checks `#73–#78`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [10.0.5] - Unreleased

### Fixed

#### Unbundled Classic Node Runtime (`isEdgeRuntime() === false`) & `revalidating.js` 3D Cube Parity
- **Brought unbundled / classic Node execution (`DINOU_RUNTIME` unset) and `revalidating.js` to full 3D Caching Cube parity** (`dinou/core/revalidating.js`, `dinou/core/handler.js`, `dinou/core/rsc-renderer.js`, `dinou/core/cache-revalidate.js`, `dinou/core/generate-static-page.js`, `dinou/node/bundle-dual-engine.js`):
  - `dinou/core/revalidating.js` previously inspected only root `metadata.json` (`revalidate` / `generatedAt`) — ignoring `pageRevalidate`, `pageGeneratedAt`, per-level `layout.metadata.json` (`ownGeneratedAt` + `revalidate`), and `<DinouCacheSlot>` `slotTags` — and regenerated via legacy `buildStaticPage()` → `generateStaticRSC()` → `generateStaticPage()`, which bypassed `runWithPprContext`, omitted `shell.page.json` / `shell.layout.own.json` preservation, and could downgrade PPR routes to non-PPR HTML. Rewrote `revalidating()` to inspect both active ancestor layout chains (`layout.metadata.json` TTL + slot freshness) and page `metadata.json` via `getStorageAdapter()`, delegating expired layouts/pages/slots to `revalidateLayout()` (ancestor-first with `recomposeOnly` for non-expired child layouts) and `revalidatePage()` while preserving all 3D PPR shells, `_old` causal snapshots, and `isDynamicFromServer` bailout state.
  - Removed obsolete `isEdgeRuntime(platformContext)` gates in `dinou/core/handler.js` that caused classic Node (`DINOU_RUNTIME` unset) requests to skip per-level layout TTL/slot freshness checks, skip `StorageAdapter` RSC delivery (falling back to raw `readFileSync` with `application/octet-stream`), skip PPR shell hole splicing (`spliceDynamicHolesIntoShell`), skip asymmetric `S → D` layout composition on `/____rsc_layout____`, and fall through to `HTTP 500: No renderer available` on dynamic/asymmetric/ISG SSR routes whenever `renderHtmlStream` was available; added `shell.html` fallback on the pure-disk SSR branch as well.
  - Updated `renderRSCStream()` and `pipeRSC()` (`dinou/core/rsc-renderer.js`) to honor an active Dual-Bundle renderer (`globalThis.__DINOU_EDGE_RENDERER__`) even when `isEdgeRuntime()` is `false`, preventing `@roggc/react-server-dom-esm/server` crashes on webpack-style client references while keeping `isEdgeRuntime()` strictly `false` for standalone worker detection.
  - Updated `dinou/core/generate-static-page.js` to pass `isSSG: true` when generating `shell.rsc` so live PPR dynamic hole data is never baked into `shell.rsc`.
  - Updated `dinou/core/cache-revalidate.js` to recognize a loaded route engine (`globalThis.__DINOU_ROUTE_MAP__`) when checking missing leaf layouts and to include `shell.page._old.json` in standalone worker eviction lists, and exported `revalidatePath`, `revalidatePage`, `revalidateLayout`, `revalidateTag`, `revalidating`, and `regenerating` from `rsc-entry.mjs` (`dinou/node/bundle-dual-engine.js`).

---

## Tracking Log by Stage

| # | Stage / Check | Bug Summary | Core Files Modified | Commit |
| :-: | --- | --- | --- | --- |
| 1 | Phase 5 — Stage 1 (`#73` Unbundled Classic Node Runtime `isEdgeRuntime() === false` & `revalidating.js` 3D Cube Parity) | `revalidating.js` ignored `pageRevalidate`, ancestor `layout.metadata.json` TTL, and `slotTags` and ran legacy `generateStaticRSC`/`generateStaticPage` (corrupting PPR shells); `handler.js` gated 3D RSC/PPR/asymmetric SSR paths on `isEdgeRuntime()`; `rsc-renderer.js` ignored loaded `__DINOU_EDGE_RENDERER__` when `DINOU_RUNTIME` was unset; `generate-static-page.js` omitted `isSSG: true` for `shell.rsc`; `cache-revalidate.js` missed `shell.page._old.json` in standalone eviction & `__DINOU_ROUTE_MAP__` on leaf layout checks | `revalidating.js`, `handler.js`, `rsc-renderer.js`, `cache-revalidate.js`, `generate-static-page.js`, `bundle-dual-engine.js` | *(uncommitted)* |
