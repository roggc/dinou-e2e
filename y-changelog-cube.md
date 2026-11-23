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

---

## Tracking Log by Stage

| # | Stage / Check | Bug Summary | Core Files Modified | Commit |
| :-: | --- | --- | --- | --- |
| 1 | Phase 3 — Stage 1 (`#62` Dynamic `[id]` On-Demand ISG + 3D Triple Synergy) | Cold on-demand ISG for parameterized `[id]` routes skipped Pass 1 for missing `[id]` layouts, failing to persist per-instance `shell.layout.own.json` / `shell.layout.json` / `layout.rsc` / `layout.metadata.json` and breaking surgical `revalidateLayout([id])` & `[id]` layout `<DinouCacheSlot>` persistence; added implicit dynamic bailout guard in `revalidateLayout` | `handler.js`, `cache-revalidate.js` | *(uncommitted)* |
