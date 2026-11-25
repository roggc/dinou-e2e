# Changelog — Dinou `10.0.5` (Phase 6 — Exhaustive Revalidation Matrix Hardening)

All notable core bug fixes uncovered and resolved during Phase 6 (`y-phase6-cube-tests.md`, Checks `#79–#84`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [10.0.5] - Unreleased

### Fixed

#### `revalidatePath()` Route Groups, Optional Catch-All `[[...slug]]`, Relative Headers & Monotonic Timestamps (`Check #79`)
- **Fixed `revalidatePath()` and `revalidateLayout()` canonical layout resolution for `(group)` and 0-segment `[[...slug]]` / `[[param]]` segments, Web `Headers` relative path resolution, and monotonic `revalState.lastGenTime` tracking** (`dinou/core/cache-revalidate.js`):
  - `revalidatePath()` previously probed `${cleanPathKey}/layout.rsc` directly and fell back to `getFilePathAndDynamicParams(..., "layout", true, true)`, which silently resolved to the **parent** shared layout (`ca/layout.rsc`) instead of the co-located 0-segment `[[...slug]]` layout (`ca/[[...slug]]/layout.rsc`) when calling `revalidatePath("/ca")`, and missed co-located layouts inside route groups (`grp/(alpha)/sub/layout.rsc` or `grp-home/(index)/layout.rsc`) while risking phantom keys outside the group. Updated `revalidatePath()` to resolve the active page and `getActiveLayoutChain()` leaf layout, matching co-located layouts via directory equality or `stripVirtualLayoutSegments(cleanLayoutKey) === decodedCleanKey` (which strips both `[[...]]` and `(group)` virtual markers), and calling `revalidateLayout(leafLayout.layoutRoutePath)` directly — while supporting explicit layout-only route-group targets (e.g. `revalidatePath("/grp/(alpha)")`) and preserving standalone storage-only fallback.
  - Replaced `stripEmptyOptional()` in `revalidateLayout()` with `stripVirtualLayoutSegments()`, allowing `revalidateLayout("/grp/sub")` and `revalidateLayout("/grp-home")` to resolve cleanly to their canonical `(group)` storage keys (`grp/(alpha)/sub`, `grp-home/(index)`) instead of emitting phantom keys outside the group.
  - Updated `normalizeRevalidatePath()` to support Web Standard `Headers` instances (`.get(...)`) as well as capitalized `Referer` headers when resolving relative paths (`./`, `../sibling`).
  - Synchronized `revalState.lastGenTime = Math.max(revalState.lastGenTime, commitLayoutGenTime)` at layout commit time so rapid back-to-back same-millisecond `revalidatePath()` calls always advance layout and page `generatedAt` / `window.__DINOU_BUILD_ID__` strictly monotonically.

---

## Tracking Log by Stage

| # | Stage / Check | Bug Summary | Core Files Modified | Commit |
| :-: | --- | --- | --- | --- |
| 1 | Phase 6 — Stage 1 (`#79` `revalidatePath()` Complete Matrix) | `revalidatePath()` probed raw `${cleanPathKey}/layout.rsc` and missed 0-segment `[[...slug]]` and `(group)` co-located layouts (revalidating shared parent layouts or writing phantom keys instead); `revalidateLayout()` `stripEmptyOptional` did not strip `(group)` segments; `normalizeRevalidatePath()` lacked Web `Headers.get()` / `Referer` support; `commitLayoutGenTime` did not advance `revalState.lastGenTime` | `cache-revalidate.js` | *(uncommitted)* |
