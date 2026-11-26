# Dinou 3D Caching Cube — Phase 7 Final Edge Frontiers (Mid-ISR Non-200 Transitions & React 19 Metadata / CSS Modules Under 3D PPR)

This document specifies the **final 2 edge-case test stages** (`Checks #85–#86`) closing the last minor unverified frontiers of Dinou's 3D Caching Cube (Axis X: Hierarchical Segmentation × Axis Y: Bidirectional `<DinouCacheSlot>` × Axis Z: Per-Segment PPR).

> **Why a Focused Phase 7?**
> Phases 1–6 (`Checks #1–#84`, released and CI-verified in Dinou `v10.0.5`) exhaustively proved all 3 axes, all pairwise and triple synergies, all 6 revalidation primitives, all 4 trigger surfaces, and all multi-pod / edge runtimes (`Redis`, `Deno KV`, `Cloudflare KV + waitUntil`).
>
> A targeted post-`v10.0.5` audit of `dinou/core/cache-revalidate.js` (2,211 lines), `dinou/core/cache-slot.js` (1,639 lines), `dinou/core/server-css-modules-plugin.js`, and `dinou/core/client.jsx` identified **two remaining low-frequency but concrete 3D Cube edge frontiers** with verifiable code-level bug candidates:
> 1. **Mid-ISR Non-200 Outcome Transitions (`#85`):** When a previously cached `200` static or 3D PPR route transitions during ISR regeneration to `notFound()` (`404`), `res.status(410)` / `res.status(404)`, or imperative/declarative `redirect()` (`301`/`302`/`307`) — especially on Edge runtimes (`isEdgeRuntime() === true`) and multi-pod setups with `.dinou/dist2` fallback!
> 2. **React 19 Document Metadata Hoisting & CSS Modules Across 3D PPR + Slots (`#86`):** When `<title>`, `<meta>`, `<link>`, and scoped CSS Modules live across `L1`, `L2`, `Page` static PPR shells, `<DinouCacheSlot>`s, and PPR dynamic holes during SSR, soft navigation (`Back`/`Forward`), `refreshSlot()`, and `revalidateTag()` / `revalidatePage()`.

Both checks below are designed to be implemented and verified **incrementally (one stage at a time)**, tracking every `dinou/core/` fix in `y-changelog-cube-phase7.md`.

---

## Frontier Coverage Matrix (What Phase 7 Closes)

| Frontier | Tested in Phases 1–6 (Partial) | Untested / High-Risk Edge Cases Closed in Phase 7 |
|---|---|---|
| **Mid-ISR Non-200 Transitions (`200 → 404/410/3xx`)** | Mid-ISR dynamic bailout (`200 static → 200 dynamic` via `cookies()`/`headers()`, `#83`); initial `redirect()`/`notFound()` inside PPR holes (`#55`) | Cached `200` static/PPR page transitioning mid-ISR to: **(a) `notFound()` (`404`)**, **(b) `res.status(410)` / `res.status(404)` with custom body**, **(c) imperative `res.redirect()` / `redirect()` (`302`/`307`)**, and **(d) declarative `<ClientRedirect>`** — across Direct SSR, soft-nav RSC, causal `_old` in-flight hydration, and **Edge KV / multi-pod cold `.dinou/dist2` fallback** (**`#85`**) |
| **React 19 Head Hoisting & CSS Modules in 3D PPR + Slots** | Basic CSS & `<title>` on standard routes; DOM text assertions in 3D Cube tests | `<title>`, `<meta name="description">`, `<link rel="canonical">`, and `.module.css` scoped class names split across **`L1(S PPR)` → `L2(D)` → `L3(S PPR)` → `Page(S PPR)` + `<DinouCacheSlot>` + PPR dynamic holes**, verified across SSR, soft-nav `Route A ↔ Route B`, `Back`/`Forward`, `refreshSlot()`, `revalidateTag()`, and `revalidatePage()` across Esbuild, Rollup & Webpack (**`#86`**) |

---

## Master Checklist (Phase 7)

- [x] **Stage 1 — Check `#85`:** Mid-ISR Non-200 Outcome Transitions (`200` Static/PPR → `notFound()` `404`, `res.status(410)`, Imperative & Declarative `redirect()`) Across Direct SSR, Soft-Nav RSC, Causal `_old` Hydration & Edge/Multi-Pod Storage
- [x] **Stage 2 — Check `#86`:** React 19 Document Metadata Hoisting (`<title>`, `<meta>`, `<link>`) & Scoped CSS Modules Across Asymmetric 3D PPR Chains, `<DinouCacheSlot>` Refreshes & Soft Navigation (`Back`/`Forward`)

---

## Global Verification Rules

1. **Poisoning Methodology:** For every revalidation or slot refresh, poison all untouched ancestor/sibling layers (`base + 899`) to prove mathematically that **only** the targeted segment/slot re-executed, and zero unintended recomputation occurred.
2. **Idempotence Across Browsers & Re-Runs:** Derive all target values dynamically from live DOM / storage baselines and restore toggleable fault/state flags in `finally` blocks so sequential `chromium → firefox → webkit` runs and repeated CI invocations are 100% deterministic.
3. **Strict Guards:** Zero React hydration errors (`#418/#419/#422/#423/#425`), zero `"navigate called outside Router"` warnings, zero uncaught `pageerror`, zero duplicate `<title>` / stale `<meta>` tags, and zero unhandled server rejections or Cloudflare `workerd` cross-request `IoContext` errors.
4. **Companion Changelog:** Track every `dinou/core/` bug fix uncovered during Phase 7 in `y-changelog-cube-phase7.md`.

---

## Stage 1 — Check `#85`: Mid-ISR Non-200 Outcome Transitions (`200` → `notFound()` / `res.status(410)` / `redirect()`)

### Why This Matters
Real production CMS/e-commerce pages frequently start life as cached `200` static or PPR routes (e.g., `/products/promo-2026` cached with `revalidate = 3600` or `revalidate = 1`), and later get **unpublished (`notFound()` / `404`)**, **permanently retired (`res.status(410)`)**, or **moved (`redirect("/products/new-slug")`)**.

Direct audit of `dinou/core/cache-revalidate.js` (in Dinou `v10.0.5`) exposes **four concrete bugs** on this path:
1. **Imperative `res.redirect()` Mid-ISR Silently Keeps Stale `200` Forever (`cache-revalidate.js:757–760, 1011–1013`):**
   - `revalContext.res.redirect()` sets `revalContext._hasRedirected = true` and calls `markRevalDynamic()`.
   - However, line `1011` executes `if (revalContext._hasRedirected) { return; }` **BEFORE** the `if (revalDynamicState.value)` eviction & `dynamic: true` metadata block at lines `1014–1055`!
   - Result: `markRouteDynamicInMap(..., true)` is **never called**, stale `index.html` / `shell.html` / `page.rsc` / `shell.page.json` are **never evicted**, and `metadata.json` stays `dynamic: false` — so the route continues serving stale `200` cached HTML/RSC indefinitely (both on warm Node pods and cold Edge/Redis pods)!
2. **`revalContext.res.status()` Is a No-Op (`cache-revalidate.js:747`):**
   - `res: { status() {}, ... }` ignores any non-200 status code (`410`, `404`, `403`, `451`) set by a page during ISR regeneration.
   - If a previously `200` static page calls `getContext().res.status(410)` and returns a `"Product Retired"` JSX body, `revalidatePage()` happily caches it as a `200 OK` static HTML file instead of honoring `410` (or marking dynamic/persisting status)!
3. **Thrown `dinou-internal-redirect` (`redirect()`) Swallowed at `cache-revalidate.js:1006–1010`:**
   - When a component throws `redirect("/target")` (rather than calling `res.redirect()`), `catch (e)` at line `1006` catches it generically and leaves `renderedRsc = null`.
   - On Node (`!isEdgeRuntime()`), line `1063` blindly deletes **all** keys including `oldHtmlKey` / `oldRscKey` (potentially breaking in-flight causal `_old` hydration with `#418`!).
   - On **Edge runtimes (`isEdgeRuntime() === true`: Cloudflare, Deno, Bun)**, line `1063`'s `!isEdgeRuntime()` guard skips eviction completely — leaving stale `200` KV/dist2 cache pinned forever!
4. **Mid-ISR `notFound()` (`isNotFound.value === true`) Fails to Evict on Edge & Multi-Pod `.dinou/dist2` (`cache-revalidate.js:817, 853, 983, 1059–1083`):**
   - When `notFound()` triggers during revalidation, `didRenderFreshPage` is `false`. On Edge runtimes (`isEdgeRuntime()`), line `1063` skips eviction; and even when deleted from Redis/KV on Pod A, cold Pod B can fall back to bundled `.dinou/dist2/index.html` unless `metadata.json` explicitly records a tombstone (`dynamic: true` or `notFound: true`) that suppresses `.dinou/dist2` fallback!

### Proposed Fixtures & Tests (`src/t-3d-cube/mid-isr-status/`)
- Shared `layout.tsx` (`ppr = true`, `revalidate = 3600`, poisoned `L1` static shell + `<DinouCacheSlot id="cube-mis-l1-slot">` to verify ancestor layout stays frozen and healthy when child page transitions to non-200!).
- Four independent leaf routes under `src/t-3d-cube/mid-isr-status/` (each initially `200 OK` static/PPR with `revalidate = 1` and explicit `revalidatePage()` / `revalidateTag()` support):
  1. `to-not-found/page.tsx` (`ppr = true`, `revalidate = 3600`): returns `200` initially; when `cubeState.midIsrMode.notFound === true`, invokes `notFound()` (or returns `404` via `page_functions.ts` / component).
  2. `to-gone-410/page.tsx` (`ppr = true`, `revalidate = 3600`): returns `200` initially; when `cubeState.midIsrMode.gone410 === true`, calls `getContext().res.status(410)` and renders a custom `410 Gone` message.
  3. `to-redirect/page.tsx` (`ppr = true`, `revalidate = 3600`): returns `200` initially; supports toggling either imperative `redirect("/t-3d-cube/mid-isr-status/target")` (`dinou-internal-redirect`), `getContext().res.redirect("/t-3d-cube/mid-isr-status/target")`, or declarative `<ClientRedirect to="/t-3d-cube/mid-isr-status/target" />`.
  4. `target/page.tsx`: destination page verifying redirect landed cleanly with zero console/hydration errors.
- **Unit / Compiled Node AOT + Edge/Multi-Pod Storage Tests (`tests/unit/cache-3d-cube-phase7.test.mjs`)** AND **Browser E2E (`e2e/example.spec.ts`)** across Chromium, Firefox, and WebKit.

### What to Verify
1. **`200` Static/PPR → `notFound()` (`404`) Mid-ISR:**
   - Warm cache (`200 OK`, V1 served from cache). Poison `L1`.
   - Flip `notFound` flag and trigger `revalidatePage()` (and also test TTL expiration `revalidate = 1`).
   - Direct SSR request (`GET`) returns HTTP `404` with the route's `not-found.tsx` (NOT stale `200` V1!).
   - Soft navigation from sibling route renders `not-found.tsx` cleanly without corrupting `L1` (poisoned `L1` stays frozen!).
   - Flip flag back to `false` + `revalidatePage()` -> route cleanly recovers to `200 OK` V2!
2. **`200` Static/PPR → `res.status(410)` Mid-ISR:**
   - Warm cache (`200 OK`, V1). Flip `gone410 = true`, trigger `revalidatePage()`.
   - Direct SSR returns HTTP `410` with the `"Gone"` body (NEVER cached as `200 OK`!).
   - Flip flag back to `false` + `revalidatePage()` -> recovers to `200 OK` cached static/PPR.
3. **`200` Static/PPR → Imperative `redirect()` & `res.redirect()` Mid-ISR:**
   - Warm cache (`200 OK`, V1). Flip redirect flag, trigger `revalidatePage()`.
   - Direct SSR returns HTTP `302`/`307` with `Location: /t-3d-cube/mid-isr-status/target` (NOT stale `200` V1!).
   - Soft navigation (`<Link>`) triggers `x-rsc-redirect` and lands on `/target` with zero hydration errors or WebKit access-control errors.
   - Declarative `<ClientRedirect>` variant lands on `/target` cleanly on both Direct SSR and soft-nav.
4. **Causal `_old` Hydration Protection During Transition:**
   - Tab A receives `200` HTML at `buildId = T1`, pauses its hydration `/____rsc_page____?____build_id____=T1`, server transitions the route to `notFound()` or `redirect()`, Tab A resumes -> Tab A hydrates V1 cleanly from `page._old.rsc` / `shell.page._old.json` with **zero React `#418`**, while Tab B receives `404` / `302` immediately!
5. **Edge Runtime & Multi-Pod Cold `.dinou/dist2` Tombstone Safety:**
   - Simulate `isEdgeRuntime() === true` (Cloudflare KV / Deno KV) + multi-pod Redis with stale `.dinou/dist2` bundled on Pod B:
   - After Pod A transitions a previously static `200` route to `notFound()` / `410` / `redirect()`, cold Pod B MUST NOT resurrect stale `200` HTML from `.dinou/dist2` — it must immediately serve `404` / `410` / `302`!

### Potential Dinou Core Risk Areas
- `dinou/core/cache-revalidate.js:746–760` — `revalContext.res.status() {}` is a no-op; non-200 status codes (`404`, `410`, etc.) must trigger dynamic bailout (or persist explicit status metadata) rather than silently caching `200 OK`.
- `dinou/core/cache-revalidate.js:1006–1014` — `if (revalContext._hasRedirected) return;` returns before the `revalDynamicState.value` cleanup/tombstone block (`lines 1014–1055`), and `catch (e)` swallows thrown `dinou-internal-redirect` without marking dynamic!
- `dinou/core/cache-revalidate.js:1063–1083` — `!isEdgeRuntime()` skips eviction on Edge KV when `isNotFound.value === true` (or redirect thrown), AND on Node it deletes `oldHtmlKey` / `oldRscKey` / `shellPageOldKey` (breaking causal `_old` hydration for in-flight tabs) instead of writing a `dynamic: true` / `notFound: true` tombstone into `metadata.json` while preserving `_old` snapshots!
- `dinou/core/handler.js` — Step 2 / Step 2b cache-read paths and `/____rsc_page____` must consistently honor `metadata.json` `dynamic: true` tombstones over bundled `.dinou/dist2` fallbacks across all runtimes.

---

## Stage 2 — Check `#86`: React 19 Document Metadata Hoisting & Scoped CSS Modules Under Asymmetric 3D PPR, `<DinouCacheSlot>` & Soft Navigation

### Why This Matters
React 19 introduced native document metadata hoisting (`<title>`, `<meta>`, `<link>`) from anywhere inside Server or Client Components directly into `<head>`. Simultaneously, Dinou compiles `.module.css` files via `dinou/core/server-css-modules-plugin.js` (`createScopedName`) for Server Components and via Esbuild/Rollup/Webpack CSS pipelines for Client bundles.

When these two features operate inside **Asymmetric 3D Caching Cube** topologies (`L1 Static PPR → L2 Dynamic → L3 Static PPR → Page Static PPR + <DinouCacheSlot> + PPR Dynamic Holes`), four non-trivial failure modes emerge that Phases 1–6 never asserted:
1. **`serializeJSX` / `deserializeJSX` Metadata Fidelity (`dinou/core/cache-slot.js`):**
   - Static PPR shells (`shell.layout.own.json`, `shell.page.json`) and cached slots (`slot.json`) serialize resolved JSX trees to JSON and deserialize them later on cold requests or slot splices.
   - If `<title>`, `<meta name="description" content="...">`, or `<link rel="canonical" href="...">` live inside a cached shell or `<DinouCacheSlot>`, verify that their serialized tags, keys, and props survive round-trip deserialization and still hoist into `<head>` cleanly during SSR streaming (`renderHtmlStream`) AND during RSC client hydration!
2. **Soft Navigation Head Reconciliation (`Route A ↔ Route B` + `Back`/`Forward`):**
   - Navigating from `Route A` (`<title>Alpha v1</title>`, `<meta name="description" content="Alpha desc">`, `alpha.module.css`) to `Route B` (`<title>Beta v1</title>`, `<meta name="description" content="Beta desc">`, `beta.module.css`) under a shared cached `L1` layout (`<meta name="cube-layout" content="L1-shared">`, `layout.module.css`) must:
     - Replace `<title>` cleanly (exact `document.title`, never leaving two `<title>` nodes in `<head>`).
     - Update `<meta name="description">` and `<link rel="canonical">` without duplicating or leaking `Route A`'s tags onto `Route B`, while keeping `L1`'s shared `<meta>` intact!
     - Restore `Route A`'s exact `<title>`, `<meta>`, and computed CSS Module styles on browser `Back` (and `Route B` on `Forward`).
3. **Live `<DinouCacheSlot>` Refresh & Revalidation Updating `<title>` / `<meta>` + CSS Classes:**
   - A `<DinouCacheSlot id="cube-meta-slot">` rendering `<title>Cart (N)</title>` + `<meta name="cart-count" content={String(N)}>` + a CSS Module class (`styles.badgeActive` vs `styles.badgeEmpty`):
   - Calling `refreshSlot("cube-meta-slot", { fresh: true })` or `revalidateTag("meta-slot-tag")` must dynamically update `document.title`, the `<meta>` tag content, AND the computed `background-color` / style from the CSS Module on screen — while poisoned `L1` and `Page` static shells stay 100% frozen!
4. **Scoped CSS Module Class Parity Across 3 Bundlers × 3 Axes × Windows/Linux:**
   - `server-css-modules-plugin.js` computes scoped names (`createScopedName(name, filename)`) for Server Components (inside `L1` static shell, Dynamic `L2`, `Page` static shell, `<DinouCacheSlot>`, and PPR dynamic holes), while Esbuild/Rollup/Webpack emit the actual CSS rules into the client stylesheet.
   - Any hash/path-casing drift between build-time SSG (`shell.*.json`), live SSR (`L2`/PPR holes), on-demand `/____rsc_slot____`, and the emitted CSS bundle causes silently unstyled components (`getComputedStyle(el)` mismatches!) or `#418` className hydration mismatches!

### Proposed Fixtures & Tests (`src/t-3d-cube/meta-css-ppr/`)
- `layout.module.css`, `route-a/route-a.module.css`, `route-b/route-b.module.css`, `slot.module.css` (distinct verifiable computed styles, e.g., `rgb(10, 20, 30)`, `rgb(40, 50, 60)`, `rgb(70, 80, 90)`, `border-radius`, `data-class-hash`).
- `layout.tsx` (`ppr = true`, `revalidate = 3600`):
  - Renders shared `<meta name="x-cube-l1" content="l1-meta-v{seq}" />`, styled with `layout.module.css` (`styles.l1Shell`), plus a `<DinouCacheSlot id="cube-mc-l1-slot" tags={["mc-l1-slot"]}>` rendering `<meta name="x-cube-slot" content="slot-{n}" />` + conditional CSS Module class (`styles.slotEven` / `styles.slotOdd`).
- `dyn-l2/layout.tsx` (`revalidate = 0`, Dynamic `L2`):
  - Emits per-request dynamic `<meta name="x-cube-l2-dyn" content="dyn-{seq}" />` + `layout.module.css` (`styles.l2Dyn`).
- `dyn-l2/route-a/page.tsx` & `dyn-l2/route-b/page.tsx` (both `ppr = true`, `revalidate = 3600`):
  - Static PPR shell emits `<title>Cube Route A v{seq}</title>` (or `Route B`), `<meta name="description" content="Desc A v{seq}" />`, `<link rel="canonical" href="https://example.test/route-a" />`, and styled shell block (`route-a.module.css`).
  - Dynamic PPR hole (`<Suspense>`) emits a dynamic hole-scoped `<meta name="x-cube-hole" content="hole-{seq}" />` + a styled hole block (`route-a.module.css` `styles.holeBox`), plus `<DinouCacheSlot id="cube-mc-page-slot">` driving a dynamic `<title>` override or `<meta name="x-cube-page-slot">` + CSS Module class toggle.
  - Links between `Route A` ↔ `Route B` and controls for `refreshSlot`, `revalidateTag`, and `revalidatePage`.

### What to Verify
1. **Direct SSR & Hydration (`Route A`):**
   - Raw SSR HTML contains hoisted `<title>Cube Route A v...</title>`, `<meta name="x-cube-l1">`, `<meta name="x-cube-l2-dyn">`, `<meta name="description">`, `<link rel="canonical">`, and `<meta name="x-cube-hole">` in `<head>`.
   - After hydration: exact `document.title`, single `<title>` node (`document.querySelectorAll("title").length === 1`), zero duplicate `<meta name="description">`, zero React `#418` hydration mismatches.
   - `getComputedStyle()` confirms **all 5 layers** (`L1` static shell, `L1` `<DinouCacheSlot>`, Dynamic `L2`, `Page` static PPR shell, and `Page` PPR dynamic hole) match their exact expected RGB colors from `.module.css`!
2. **Soft Navigation (`Route A → Route B → Back → Forward`):**
   - Soft-nav to `Route B`: `document.title` updates to `Cube Route B v...`, `<meta name="description">` and `<link rel="canonical">` update cleanly with zero stale `Route A` tags, `L1`'s `<meta name="x-cube-l1">` stays intact, and `Route B`'s `.module.css` computed styles apply immediately (with `L1` poisoned & frozen!).
   - Browser `Back` restores `Route A`'s exact `<title>`, `<meta>`, `<link>`, and computed styles; `Forward` restores `Route B`.
3. **Live `<DinouCacheSlot>` Refresh (`refreshSlot` & `revalidateTag`):**
   - Mutate slot state (flipping even/odd class & slot metadata value) + poison `L1` and `Page` shells.
   - Trigger `refreshSlot("cube-mc-l1-slot", { fresh: true })` and `revalidateTag("mc-page-slot")`:
   - `<meta name="x-cube-slot">` / `<meta name="x-cube-page-slot">` updates live in `<head>`, computed CSS Module style switches (`slotEven` → `slotOdd`) immediately, poisoned static shells stay 100% frozen, and hard F5 reload persists the exact same updated metadata and computed styles!
4. **Surgical `revalidatePage()` & `revalidateLayout()` Metadata Update:**
   - Update `Route A`'s version, call `revalidatePage("/t-3d-cube/meta-css-ppr/dyn-l2/route-a")` -> `document.title` and `<meta name="description">` reflect V2 on both SSR and soft-nav while poisoned `L1` `<meta name="x-cube-l1">` stays at V1!
5. **Cross-Bundler & Cross-OS Parity:**
   - Passes identically on Esbuild, Rollup, and Webpack (both Windows & Ubuntu, Chromium/Firefox/WebKit) with zero CSS hash mismatch.

### Potential Dinou Core Risk Areas
- `dinou/core/cache-slot.js` (`serializeJSX` / `deserializeJSX`) — verify `<title>`, `<meta>`, `<link>` elements inside serialized static shells (`shell.*.json`) and `slot.json` preserve exact React element shape so React 19 hoists and deduplicates them identically on SSR and client RSC replay.
- `dinou/core/server-css-modules-plugin.js:16–150` & `dinou/core/createScopedName.js` — verify scoped class hash stability between SSG/PPR build, live server render, `/____rsc_slot____`, and client CSS bundle across Esbuild, Rollup, and Webpack (especially Windows path normalization `normalizePathCase`).
- `dinou/core/client.jsx` & `dinou/core/client-webpack.jsx` — verify soft navigation does not leave orphaned React 19 hoisted `<title>`/`<meta>` nodes when swapping `DinouPageSlot` promises or reconciling `slotOverrideCache`.
- `dinou/core/edge-ssr.js` / `ppr-runtime.js` — verify `<meta>` / `<link>` emitted inside a resumed PPR dynamic hole stream cleanly into `<head>` without breaking `$RS`/`$RC` streaming markers or triggering `#418`.

---

## Recommended Execution Order

When ready to execute Phase 7 (one stage at a time, with `y-changelog-cube-phase7.md` maintained in parallel):
1. **Stage 1 (`#85` — Mid-ISR Non-200 Outcome Transitions)** — highest concrete bug density (`cache-revalidate.js:747` no-op `res.status()`, `lines 1011–1013` early return skipping eviction on `_hasRedirected`, `line 1063` `!isEdgeRuntime()` guard skipping eviction on Edge KV and deleting `_old` snapshots on Node).
2. **Stage 2 (`#86` — React 19 Document Metadata Hoisting & CSS Modules Under 3D PPR + Slots)** — closes the final visual/head-reconciliation gap across all 3 axes, soft navigation, slot refreshes, and all 3 bundlers.
