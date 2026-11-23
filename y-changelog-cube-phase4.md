# Changelog — Dinou `10.0.4` (Phase 4 — Orthogonal 3D Caching Cube Hardening)

All notable core bug fixes uncovered and resolved during Phase 4 (`y-phase4-cube-tests.md`, Checks `#67–#72`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [10.0.4] - Unreleased

### Fixed

#### Sibling Route Groups `(groupA)` / `(groupB)` & Optional Catch-All (`[[...slug]]` / `[[param]]`) Layouts
- **Eliminated storage, SSG, client-router, and revalidation collisions across sibling Route Group layouts and 0-segment optional dynamic layouts** (`dinou/core/layout-functions.js`, `dinou/core/get-file-path-and-dynamic-params.js`, `dinou/core/discover-layouts.js`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`, `dinou/core/build-static-pages.js`, `dinou/core/handler.js`, `dinou/core/get-jsx.js`, `dinou/core/cache-revalidate.js`, `dinou/core/cache-slot.js`):
  - `getActiveLayoutChain()` (`layout-functions.js`) and `buildStaticPages()` (`build-static-pages.js`) previously stripped `(group)` segments and collapsed empty `[[...slug]]` / `[[param]]` segments when deriving `cleanLayoutKey` and `layoutRoutePath`. As a result, sibling route-group layouts (e.g., `(alpha)/layout.tsx` and `(beta)/layout.tsx` under a shared prefix) and a 0-segment optional catch-all layout (`[[...slug]]/layout.tsx` under a parent `layout.tsx`) computed identical storage keys and overwrote each other's `shell.layout.own.json`, `shell.layout.json`, `layout.rsc`, and `layout.metadata.json`.
  - Added `computeLayoutKeyFromFolder()` in `layout-functions.js` (reused by `build-static-pages.js`) to preserve `(group)` segments and empty optional markers (`[[...slug]]` / `[[param]]`) in `cleanLayoutKey` and `layoutRoutePath`, and registered all active static layouts from `getActiveLayoutChain()` for every discovered static/PPR page in `build-static-pages.js` (skipping unresolved `dynamicStructure.length > 0` templates) so 0-segment optional catch-all layouts and dynamic-group layouts are never omitted from SSG.
  - Added `getLayoutsForLayoutKey()` in `get-file-path-and-dynamic-params.js` and wired `exactLayoutKey: true` across internal `/____rsc_layout____` (`handler.js`, with segment `decodeURIComponent` decoding for browsers such as WebKit that percent-encode `[` / `]`), `getJSX(..., { segment: "layout" })` (`get-jsx.js`), and `revalidateLayout()` (`cache-revalidate.js`) so internal layout endpoints target the exact group or optional catch-all layout without leaking sibling groups, while keeping public URLs containing literal `(group)` segments strictly returning `404`.
  - Updated `discoverLayoutsFromFileRelPaths()` (`discover-layouts.js`) to emit template-preserving specs (`~<layoutFolderRel>`) whenever a page's nearest layout folder contains `(group)` or `[[...]]` segments, and updated `matchRoutePattern()` + `getLayoutKey()` in both `client.jsx` and `client-webpack.jsx` to expand captured URL segments into the canonical layout key — preserving client state on same-group soft `<Link>` navigation while swapping sibling route-group layouts cleanly on cross-group navigation.
  - Updated `getSlotJSX()` host-layout persistence in `cache-slot.js` to resolve candidate host layout keys via `getActiveLayoutChain()` instead of naive URL-prefix splitting, ensuring live `refreshSlot()` on `<DinouCacheSlot>`s inside `(group)` or `[[...slug]]` layouts persists into the exact host `shell.layout.own.json` and `layout.rsc`.

---

## Tracking Log by Stage

| # | Stage / Check | Bug Summary | Core Files Modified | Commit |
| :-: | --- | --- | --- | --- |
| 1 | Phase 4 — Stage 1 (`#67` Sibling Route Groups `(alpha)`/`(beta)` & Optional Catch-All `[[...slug]]` ISG Under 3D Triple Synergy) | Sibling route-group layouts `(alpha)`/`(beta)` and 0-segment `[[...slug]]` layouts under parent layouts collided on `cleanLayoutKey`, `staticLayouts`, client `getLayoutKey`, `/____rsc_layout____`, `revalidateLayout`, and `cache-slot.js` host-layout persistence; `buildStaticPages` also missed registering active `[[...slug]]` layouts when `getStaticPaths` returned `[]` | `layout-functions.js`, `get-file-path-and-dynamic-params.js`, `discover-layouts.js`, `client.jsx`, `client-webpack.jsx`, `build-static-pages.js`, `handler.js`, `get-jsx.js`, `cache-revalidate.js`, `cache-slot.js` | *(uncommitted)* |
