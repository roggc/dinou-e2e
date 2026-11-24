# Dinou 3D Caching Cube — Phase 5 Remaining Orthogonal Attack Angles & Runtime Parity Tests

This document specifies **6 remaining orthogonal attack angles** (`Checks #73–#78`) against Dinou's **3D Caching Engine** (`Axis X: Horizontal Segmentation` × `Axis Y: Vertical Segmentation / <DinouCacheSlot>` × `Axis Z: Partial Prerendering / PPR`) that remain unexplored after the 100% green completion of Phase 1 (`#37–#46`), Phase 2 (`#47–#61`), Phase 3 (`#62–#66`), and Phase 4 (`#67–#72`).

> **Scope Separation:** Exhaustive testing of Dinou's revalidation primitives (`revalidate` TTL, `revalidateTag`, `revalidatePath`, `revalidateLayout`, `revalidatePage`, `refreshSlot`) across all 3D Cube topologies is intentionally kept in its own dedicated companion plan: [`y-phase6-cube-tests.md`](./y-phase6-cube-tests.md) (`Checks #79–#84`).

All 6 checks below are designed to be implemented and verified **incrementally (one stage at a time)** following the same poisoning, idempotence, strict hydration/router-watcher, and cross-runtime rules established in Phases 1–4.

---

## Master Checklist (Phase 5)

- [x] **Stage 1 — Check `#73`:** Unbundled Classic Node Production Runtime (`isEdgeRuntime() === false`: `dinou build` + `dinou start`) & Legacy `revalidating.js` 3D Cube Parity
- [x] **Stage 2 — Check `#74`:** Static Site Export (`dinou export-static`) Under Full 3D Cube Topologies (`(group)` / `[[...slug]]` / Nested `<DinouCacheSlot>` / Zero-Hole PPR / `reset_layout` & `no_layout`)
- [x] **Stage 3 — Check `#75`:** Perimeter Guard Contracts (`validateParams`, `allowISG = false`, `getProps` `redirect()`, and `notFound()`/404 Fallback) Inside Asymmetric 3D PPR Chains
- [ ] **Stage 4 — Check `#76`:** React 19 `useId()` Collision & Scoped-ID Hydration Integrity Across Asymmetric 3D Composition, Nested `<DinouCacheSlot>`, and Staggered PPR Holes
- [ ] **Stage 5 — Check `#77`:** `error.tsx` & Client `ErrorBoundary` Fault Isolation, `reset()`, and Soft-Navigation Recovery Inside Asymmetric 3D PPR + `<DinouCacheSlot>`
- [ ] **Stage 6 — Check `#78`:** Standalone Compiled Single-File Binaries (`build:node:compile` × `build:bun:compile` × `build:deno:compile`) Under Full 3D Cube Topologies

---

## Global Verification Rules

1. **Poisoning Methodology:** Poison every static shell and cached slot that must **not** re-execute (`base + 899`) while mutating only targeted dynamic segments, holes, or error/guard inputs.
2. **Idempotence Across Browsers & Re-Runs:** Derive target values dynamically from the live DOM baseline (`base + 6xx`, `base + 899`) so sequential `chromium → firefox → webkit` runs never require clean rebuilds.
3. **Strict Guards:** Zero React hydration errors (`#418/#419/#422/#423/#425`), zero `"navigate called outside Router"` warnings, zero uncaught `pageerror`, and zero unhandled server rejections or Cloudflare `workerd` cross-request `IoContext` errors.
4. **Companion Changelog:** Track every `dinou/core/` bug fix uncovered during Phase 5 in `y-changelog-cube-phase5.md`.

---

## Stage 1 — Check `#73`: Unbundled Classic Node Runtime (`isEdgeRuntime() === false`) & Legacy `revalidating.js` 3D Cube Parity

### Why This Matters
Every compiled 3D Cube integration test in Phases 2–4 ran against `node-bundle` (`DINOU_RUNTIME="node-bundle"` → `isEdgeRuntime() === true`). However, classic Node deployments running `dinou build` + `dinou start` (`isEdgeRuntime() === false`) still take distinct code branches across `dinou/core/handler.js`, `dinou/core/revalidating.js`, and `dinou/core/cache-revalidate.js`!

A direct audit of `dinou/core/` reveals concrete divergence risks on the unbundled Node path:
- `dinou/core/revalidating.js:13–101` only inspects root `metadata.json`'s `revalidate` (ignoring `pageRevalidate`, per-level `layout.metadata.json` `ownGeneratedAt`, and `slotTags`) and regenerates via legacy `buildStaticPage` → `generateStaticRSC` → `generateStaticPage`, bypassing `shell.layout.own.json` / `shell.page.json` / PPR slot preservation!
- `dinou/core/cache-revalidate.js:826–845`, `1473–1480`, and `1772–1830` fall back to deleting cached files on disk instead of recomposing when `!didRenderFreshLayout && !isEdgeRuntime()`.

### Proposed Tests (`tests/unit/cache-3d-cube.test.mjs` — Test `24.` + dedicated classic Node build/start harness)
1. **Unbundled Node Production Build (`dinou build` + `dinou start`, `DINOU_RUNTIME` unset → `isEdgeRuntime() === false`):**
   - Boot a real classic Node production server against the existing 3D Cube fixture suite (`/t-3d-cube/ppr`, `/t-3d-cube/asym`, `/t-3d-cube/group-collision/promo`, `/t-3d-cube/catchall-isg/docs/v2`, `/t-3d-cube/sf-in-cube`).
2. **Verify All 3 Axes + Parity with `node-bundle`:**
   - Direct SSR + soft-nav (`/____rsc_layout____`, `/____rsc_page____`, `/____rsc_slot____`) preserve frozen poisoned `L1` / `Page` shells and cached `<DinouCacheSlot>`s while streaming live PPR holes and Dynamic `L2`.
   - Trigger clock-based ISR expiration (`revalidate = 1`) on both a 3D PPR page and a 3D multi-level layout (`L1` vs `L2`) under classic Node: verify `shell.page.json`, `shell.layout.own.json`, `slot.json`, and PPR hole placeholders are NOT wiped or downgraded to non-PPR HTML by legacy `revalidating.js`!
   - Trigger `revalidateTag`, `revalidateLayout`, `revalidatePage`, and `refreshSlot(..., { fresh: true })` under classic Node: verify zero accidental disk-deletion races or missing `shell.layout.own.json` / `shell.page.json` artifacts on subsequent requests.

### Potential Dinou Core Risk Areas
- `dinou/core/revalidating.js:13–101` — legacy `buildStaticPage` / `generateStaticRSC` / `generateStaticPage` pipeline vs modern 3D PPR & segmented layout composition.
- `dinou/core/cache-revalidate.js:826–845, 1473–1480, 1772–1830` — `!isEdgeRuntime()` branches deleting `page.rsc`/`layout.rsc` instead of preserving atomic causal `_old` snapshots and `shell.*.json`.
- `dinou/core/handler.js` — any remaining `if (isEdgeRuntime())` branch guarding 3D PPR hole splicing or slot freshness checks.

---

## Stage 2 — Check `#74`: Static Site Export (`dinou export-static`) Under Full 3D Cube Topologies

### Why This Matters
Phase 4 Stage 1 (`#67`) introduced `~<layoutFolderRel>` template specs in `discover-layouts.js` and `getLayoutKey()` (`client.jsx` / `client-webpack.jsx`) so sibling route groups `(alpha)` / `(beta)` and optional catch-all `[[...slug]]` routes store isolated layouts under `.dinou/dist2/<prefix>/(alpha)/layout.rsc` and `.dinou/dist2/<prefix>/[[...slug]]/layout.rsc`.

However, `dinou export-static` (`dinou/core/export-static.js` + `static-assets.js` + `buildStaticExportRscUrl` in `client.jsx:512–514`) has **never been verified** against these Phase 2–4 3D Cube topologies! On a pure static file server (Surge, GitHub Pages, Cloudflare Pages static), there is NO Dinou server to rewrite URLs or intercept `/____rsc_*____` endpoints.

### Proposed Fixtures & Tests
- Add a pure-SSG 3D Export fixture tree `src/t-3d-cube/static-export/` (or verify alongside existing static 3D routes):
  - Shared outer static layout with `<DinouCacheSlot>` + `<CubeClientProbe>`
  - Sibling route groups `(alpha)/a/page.tsx` and `(beta)/b/page.tsx` (each with its own layout + nested `<DinouCacheSlot>` + zero-hole `ppr = true` page)
  - Optional catch-all `[[...slug]]/` pre-rendered via `getStaticPaths: () => [[], ["guide"], ["guide", "intro"]]`
  - Sibling `reset_layout` and `no_layout` pages inside the static export tree
- Run `dinou build` + `dinou export-static`, serve `out/` with a dumb zero-logic static HTTP server (returning raw files + 404 on misses), and run both Node assertions and Playwright (Chromium/Firefox/WebKit).

### What to Verify
1. **Artifact Completeness & Hygiene in `out/`:**
   - Every pre-rendered `index.html`, `page.rsc`, and `(alpha)/layout.rsc`, `(beta)/layout.rsc`, `[[...slug]]/layout.rsc` is exported into `out/`.
   - Internal server-only artifacts (`metadata.json`, `layout.metadata.json`, `shell.*.json`, `slots/*/slot.json`, `*.map` / server chunks) are **never** leaked into `out/`.
2. **Client Soft-Navigation on Pure Static Hosting:**
   - Direct load + soft `<Link>` navigation between `(alpha)/a` ↔ `(beta)/b` ↔ `[[...slug]]` (0, 1, 2 segments) ↔ `reset_layout` ↔ `no_layout` fetches the exact static `layout.rsc` and `page.rsc` URLs with HTTP `200` (zero `404` fallbacks to full `window.location.replace`, zero `#418`, zero `pageerror`).
   - Shared outer layout `<CubeClientProbe>` survives soft transitions between `(alpha)` and `(beta)` without remounting!
   - Pre-baked `<DinouCacheSlot>` content renders identically on SSR and soft-nav (and `refreshSlot` fails/degrades safely without crashing when `window.__DINOU_STATIC_EXPORT__ === true`).

### Potential Dinou Core Risk Areas
- `dinou/core/client.jsx:512–514` & `client-webpack.jsx` — `buildStaticExportRscUrl((cleanKey || "/") + searchPart, "layout.rsc")` when `layoutKey` contains route-group segments `(alpha)` or optional catch-all `[[...slug]]` (URL encoding of `[` `]` and `(` `)` on static file servers!).
- `dinou/core/static-assets.js:83–88` (`shouldExportDist2File`) — verify whether `(alpha)/layout.rsc` and `[[...slug]]/layout.rsc` are included while `slots/` and `shell.*.json` stay excluded.
- `dinou/core/export-static.js:74–86` — verify zero-hole `ppr = true` routes emit clean, self-contained `index.html` (no dangling `$RB` suspense scripts waiting for a server resume).

---

## Stage 3 — Check `#75`: Perimeter Guard Contracts (`validateParams`, `allowISG = false`, `getProps` `redirect()`, and 404 Fallback) Inside Asymmetric 3D PPR Chains

### Why This Matters
Real multi-tenant and SaaS apps protect parameterized `[id]` and `[[...slug]]` segments beneath a cached static PPR outer layout (`L1`) using Dinou's route-level guard hooks (`validateParams`, `allowISG = false`, `getProps` returning `redirect(...)`, or throwing / returning `notFound()`).

When `L1` is cached (`ppr = true`, `revalidate = 3600`) with a `<DinouCacheSlot>`, and a child route rejects or redirects inside `L2` or `Page`, Dinou must **never**:
- poison or invalidate the cached `L1` shell/slot,
- persist a `404` or `302/307` redirect payload into `.dinou/dist2` / KV as if it were a valid `200` page or layout shell, or
- fail to propagate `x-rsc-redirect` / `404` cleanly during soft `<Link>` navigation (`/____rsc_layout____` & `/____rsc_page____`).

### Proposed Fixtures (`src/t-3d-cube/guards/`)
- `src/t-3d-cube/guards/layout.tsx` + `layout_functions.ts` (`ppr = true`, `revalidate = 3600`, renders poisoned `L1` shell + `<CubeClientProbe id="guards-l1">` + `<DinouCacheSlot id="cube-guards-l1-slot">` + `L1` PPR hole)
- `src/t-3d-cube/guards/item/[id]/layout.tsx` + `layout_functions.ts`:
  - `validateParams: ({ id }) => /^[a-z0-9-]+$/.test(id) && id !== "forbidden"`
  - `ppr = true`, `revalidate = 3600`
- `src/t-3d-cube/guards/item/[id]/page.tsx` + `page_functions.ts`:
  - `getStaticPaths: () => ["allowed-1"]`
  - `allowISG: false` on a sibling route `src/t-3d-cube/guards/strict/[id]/page.tsx` (only `["known"]` pre-built)
  - `getProps` returning `redirect("/t-3d-cube/guards/landed")` when `id === "bounce"`
  - `src/t-3d-cube/guards/landed/page.tsx` (`ppr = true`, `revalidate = 3600`)

### What to Verify
1. **`validateParams() === false` (`/guards/item/forbidden` & `/guards/item/bad$char`):**
   - Direct SSR returns HTTP `404` (renders `not_found.tsx` cleanly); soft `<Link>` navigation from `/guards/item/allowed-1` transitions to 404 without crashing or corrupting `L1`.
   - Zero cache artifacts written under `.dinou/dist2/t-3d-cube/guards/item/forbidden/`.
   - Poisoned `L1` shell and `cube-guards-l1-slot` stay 100% frozen.
2. **`allowISG = false` cold miss (`/guards/strict/unknown-id` vs pre-built `/guards/strict/known`):**
   - `/guards/strict/known` serves frozen PPR cache + live hole; `/guards/strict/unknown-id` returns `404` on both SSR and soft `<Link>` without triggering cold ISG materialization or polluting storage.
3. **`getProps` returning `redirect()` (`/guards/item/bounce` → `/guards/landed`):**
   - Direct SSR responds with HTTP `307`/`302` (`Location: /t-3d-cube/guards/landed`), never writes `shell.page.json` / `index.html` for `bounce`, and never re-executes poisoned `L1` shell.
   - Soft `<Link>` from `/guards/item/allowed-1` → `/guards/item/bounce` follows `x-rsc-redirect` to `/guards/landed` while preserving `L1` `<CubeClientProbe>` `mountId` & counter, with zero `#418` and zero router warnings!

### Potential Dinou Core Risk Areas
- `dinou/core/handler.js` — `allowISG = false` check order vs PPR shell resume and asymmetric layout composition; `x-rsc-redirect` handling when `layout_functions.getProps` vs `page_functions.getProps` returns a redirect.
- `dinou/core/cache-revalidate.js` — calling `revalidatePage("/t-3d-cube/guards/item/forbidden")` or `revalidateLayout` on a rejected param must bail cleanly without writing empty artifacts.
- `dinou/core/client.jsx:435–445, 534–544` — `executeRscRedirect` race when BOTH `/____rsc_layout____` and `/____rsc_page____` return `x-rsc-redirect` simultaneously.

---

## Stage 4 — Check `#76`: React 19 `useId()` Collision & Scoped-ID Hydration Integrity Across Asymmetric 3D Composition, Nested `<DinouCacheSlot>`, and Staggered PPR Holes

### Why This Matters
In Dinou's 3D composition engine (`dinou/core/layout-composition.js:230–235, 708–713`), each cached layout level (`L1`, `L2`, `L3`) and `<DinouCacheSlot>` is rendered in an **independent** React Flight pass with its own `identifierPrefix` / `scopePrefix` (`sanitizeLayoutScope(key)`), then spliced into a single composed tree and hydrated by ONE client React root!

In React 19, `useId()` is used everywhere in accessible UI libraries (`<label htmlFor={id}>`, `aria-controls`, `aria-labelledby`, Radix/Aria portals). If two independently serialized segments (`L1` static shell, `L1` `<DinouCacheSlot>`, `L1` PPR hole, Dynamic `L2`, `Page` static shell, `Page` `<DinouCacheSlot>`, and `Page` PPR hole) generate **colliding** `useId()` values—or generate a different `useId()` during client hydration than during SSR/PPR splicing—React immediately throws hydration mismatch `#418`/`#425` or silently wires `<label htmlFor>` to the **wrong** `<input>`!

### Proposed Fixtures (`src/t-3d-cube/use-id-cube/`)
- Asymmetric 3D PPR chain (`L1 Static PPR` → `L2 Dynamic` → `Page Static PPR`) where **every single layer** renders a Client Component calling `React.useId()` (binding `<label htmlFor={id}>` + `<input id={id} data-owner="...">` + displaying the exact ID text):
  1. `L1` static shell Client Component (`useId()`)
  2. `L1` `<DinouCacheSlot id="cube-uid-l1-slot">` Client Component (`useId()`) + nested inner `<DinouCacheSlot id="cube-uid-l1-inner">` (`useId()`)
  3. `L1` PPR dynamic hole Client Component (`useId()`)
  4. Dynamic `L2` Client Component (`useId()`) + `L2` `<DinouCacheSlot id="cube-uid-l2-slot">` (`useId()`)
  5. `Page` static shell Client Component (`useId()`)
  6. `Page` `<DinouCacheSlot id="cube-uid-page-slot">` Client Component (`useId()`)
  7. `Page` staggered PPR dynamic hole Client Component (`useId()`)

### What to Verify
1. **Strict Global Uniqueness Across All 8 Regions:** Every rendered `useId()` value in the DOM is **100% unique** (`new Set(ids).size === 8` — zero duplicate `id="..."` attributes anywhere in `document.querySelectorAll("[id]")`!).
2. **Zero Hydration Mismatch (`#418/#425`) on Cold SSR, Warm Cache Hit, F5 Reload, and Soft `<Link>` Navigation:**
   - The SSR-rendered `id` attribute matches the hydrated React client `useId()` text verbatim across Chromium, Firefox, and WebKit.
3. **Post-Mutation Stability:**
   - After `refreshSlot("cube-uid-l1-slot", { fresh: true })`, `refreshSlot("cube-uid-page-slot", { fresh: true })`, and `revalidateLayout` / `revalidatePage` + F5 reload, all 8 `useId()` values remain globally unique and collision-free, and clicking every `<label>` focuses its exact paired `<input>`!

### Potential Dinou Core Risk Areas
- `dinou/core/layout-composition.js:230–235, 708–713` — `identifierPrefix` propagation into `renderToReadableStream` / `renderToPipeableStream` vs client `hydrateRoot(..., { identifierPrefix })`.
- `dinou/core/cache-slot.js` — `renderToReadableStream` / `serializeJSX` when rendering `<DinouCacheSlot>` independently vs hydrating inside a parent layout tree whose React tree position differs from the standalone slot render!
- `dinou/core/ppr-runtime.js` — `useId()` inside dynamically resumed PPR holes streamed via `$RB` boundaries.

---

## Stage 5 — Check `#77`: `error.tsx` & Client `ErrorBoundary` Fault Isolation, `reset()`, and Soft-Navigation Recovery Inside Asymmetric 3D PPR + `<DinouCacheSlot>`

### Why This Matters
Production apps throw transient runtime errors inside a `Page`, a Dynamic `L2` layout, a PPR dynamic hole, or a `<DinouCacheSlot>` (e.g., upstream DB timeout). Dinou's `error.tsx` and client `ErrorBoundary` must contain the blast radius cleanly:
- Cached `L1` static shell, `L1` `<CubeClientProbe>`, and `L1` `<DinouCacheSlot>` must **survive untouched**;
- The error state must **never** be persisted into `.dinou/dist2` / KV as a cached shell or cached slot;
- Clicking `reset()` (after clearing the transient fault) or soft-navigating `<Link>` to a healthy sibling page must recover with zero `#418`, zero stuck `ErrorBoundary` state, and zero poisoned client `pageCache`/`layoutCache` entries!

### Proposed Fixtures (`src/t-3d-cube/error-cube/`)
- `src/t-3d-cube/error-cube/layout.tsx` + `layout_functions.ts` (`ppr = true`, `revalidate = 3600`, renders `L1` shell + `<CubeClientProbe id="err-l1">` + `<DinouCacheSlot id="cube-err-l1-slot">` + `<Link>` nav to `/healthy`, `/throw-page`, `/throw-hole`, `/throw-l2/sub`)
- `src/t-3d-cube/error-cube/error.tsx` (Client error boundary rendering `#cube-err-msg`, `#btn-err-reset`, and a recovery `<Link href="/t-3d-cube/error-cube/healthy">`)
- `src/t-3d-cube/error-cube/healthy/page.tsx` (`ppr = true`, `revalidate = 3600`)
- `src/t-3d-cube/error-cube/throw-page/page.tsx` (dynamic page throwing deterministically when `cubeState.errThrowPage === true`)
- `src/t-3d-cube/error-cube/throw-hole/page.tsx` (`ppr = true`, `revalidate = 3600` — static shell succeeds and stays frozen, while its PPR dynamic hole throws when `cubeState.errThrowHole === true`!)
- `src/t-3d-cube/error-cube/throw-l2/layout.tsx` (`revalidate = 0` dynamic `L2` throwing when `cubeState.errThrowL2 === true`) + `sub/page.tsx` (`ppr = true`)

### What to Verify
1. **Direct SSR & Soft `<Link>` to `/throw-page`:**
   - Soft-navigating from `/healthy` → `/throw-page` catches the error in `error.tsx` (via `/____rsc_payload_error____` or `ErrorBoundary`), keeps `L1` shell + `L1` `<CubeClientProbe>` + `cube-err-l1-slot` alive & frozen!
   - Flipping `errThrowPage = false` and clicking `#btn-err-reset` recovers the real page cleanly without full browser reload.
   - Navigating back to `/healthy` while `errThrowPage = true` cleanly resets the `ErrorBoundary` (no stuck error screen!).
2. **Throwing Inside a PPR Dynamic Hole (`/throw-hole`):**
   - `Page`'s static shell stays valid in `.dinou/dist2` (never overwritten by the error!); the hole's error bubbles cleanly to `error.tsx` (or local boundary), and clearing the fault + reload / `router.refresh()` renders the healthy hole with frozen shell!
3. **Throwing Inside Dynamic `L2` (`/throw-l2/sub`):**
   - `L1` stays frozen; `sub`'s cached static `shell.page.json` is never corrupted; clearing `errThrowL2 = false` immediately restores the full asymmetric chain.

### Potential Dinou Core Risk Areas
- `dinou/core/ppr-runtime.js` — error propagation when a PPR dynamic hole throws inside `handlePprResume` (must emit an RSC error chunk cleanly instead of hanging the stream or swallowing the error silently).
- `dinou/core/client.jsx` & `client-webpack.jsx` — `ErrorBoundary` key/reset behavior when soft-navigating away from an errored route or clicking `reset()` after `/____rsc_layout____` / `/____rsc_page____` returned a `500` RSC error payload.
- `dinou/core/cache-slot.js` — verify throwing inside a `<DinouCacheSlot>` during live `refreshSlot` preserves last-known-good `slot.json` and does not poison `inflightSlotRenders` or `recentFreshSlotRenders`.

---

## Stage 6 — Check `#78`: Standalone Compiled Single-File Binaries (`build:node:compile` × `build:bun:compile` × `build:deno:compile`) Under Full 3D Cube Topologies

### Why This Matters
While GitHub Actions' 36-job `e2e` matrix already validates Esbuild, Rollup, and Webpack across Node/Bun/Deno/Cloudflare, **standalone compiled single-file executables** (`build:node:compile` Node SEA, `build:bun:compile`, and `build:deno:compile`) run through a completely different asset-loading and filesystem boundary:
- `.dinou/dist2` pre-rendered 3D artifacts (`shell.layout.own.json`, `shell.page.json`, `slots/*/slot.json`, `(alpha)/layout.rsc`, `[[...slug]]/layout.rsc`, `layout.metadata.json`, `metadata.json`) are **embedded/bundled inside the compiled binary's asset store**, NOT read as loose files from a standard project tree!
- Meanwhile, live PPR hole resumption, `/____rsc_slot____` refreshes, on-demand ISG materialization (`/t-3d-cube/catchall-isg/docs/v2`), and runtime revalidation must seamlessly bridge embedded read-only assets with writable runtime storage.
- Currently, `tests/compile-and-export-smoke.mjs` (executed by CI's `compile-and-export-smoke` job) checks **zero** `/t-3d-cube/*` routes!

### Proposed Tests (`tests/compile-and-export-smoke.mjs`)
Reuse existing Phase 2–4 3D Cube fixtures (zero new app routes required!) inside `probeBinary()` for **all three compiled binaries** (Node SEA, Bun compiled, Deno compiled) as well as the `export-static` section:
1. **Asymmetric 3D Triple Synergy (`/t-3d-cube/triple-asym/dyn-l2/l3`):**
   - Direct SSR + `/____rsc_layout____` + `/____rsc_page____`: verify static `L1` & `L3` shells + embedded `<DinouCacheSlot>`s load cleanly from the compiled binary's embedded `.dinou/dist2` while Dynamic `L2` and PPR holes execute live per request.
2. **Sibling Route Groups (`/t-3d-cube/group-collision/promo` & `/t-3d-cube/group-collision/settings`):**
   - Verify embedded `(alpha)/layout.rsc` and `(beta)/layout.rsc` + `shell.layout.own.json` resolve without collision or path/VFS encoding failures inside SEA / Bun / Deno compiled binaries.
3. **Optional Catch-All Cold On-Demand ISG (`/t-3d-cube/catchall-isg` & `/t-3d-cube/catchall-isg/docs/v2`):**
   - Verify 0-segment and cold 2-segment ISG routes render live + materialize cleanly without failing on read-only binary asset paths.
4. **Live `<DinouCacheSlot>` Endpoint (`/____rsc_slot____/<id>?fresh=true`) & Embedded Server Function Route (`/t-3d-cube/sf-in-cube`):**
   - Verify `/____rsc_slot____` discovers/renders embedded slots cleanly and `/t-3d-cube/sf-in-cube` serves `200 OK` with intact SSR markers and zero missing-manifest errors.

### Potential Dinou Core Risk Areas
- `dinou/core/storage-adapter.js` (`readDist2Fallback` / embedded asset maps in Node SEA, Bun `--compile`, and Deno `compile`) — path normalization for nested `(group)` / `[[...slug]]` directories and `slots/<id>/slot.json` keys inside bundled asset manifests.
- `dinou/core/ppr-runtime.js` (`readShellJsonFromStorage`) — reading `shell.layout.own.json` and `shell.page.json` when only embedded binary assets exist on cold start.
- `dinou/core/build-node.js` / `build-bun.js` / `build-deno.js` — verifying `compile` asset packers include `shell.layout.own.json`, `shell.page.json`, `layout.metadata.json`, and `slots/*/slot.json` (not only `index.html` and `*.rsc`).

---

## Recommended Execution Order

When ready to execute Phase 5 (one stage at a time, with `y-changelog-cube-phase5.md` maintained in parallel):
1. **Stage 1 (`#73` — Unbundled Classic Node Runtime & `revalidating.js`)** — highest probability of uncovering real production gaps on classic `dinou build` + `dinou start` deployments.
2. **Stage 2 (`#74` — `dinou export-static` Under Full 3D Cube Topologies)** — directly validates Phase 4 Stage 1's `(group)` & `[[...slug]]` layout paths on static hosts.
3. **Stage 3 (`#75` — Perimeter Guards: `validateParams`, `allowISG = false`, `getProps` `redirect()`)** — prevents cache poisoning and redirect leaks in asymmetric 3D PPR trees.
4. **Stage 4 (`#76` — React 19 `useId()` Collision & Hydration Integrity)** — closes a subtle accessibility & hydration hazard unique to multi-pass 3D composition.
5. **Stage 5 (`#77` — `error.tsx` & `ErrorBoundary` Fault Isolation & Recovery)** — guarantees production fault resilience without corrupting `.dinou/dist2` or client caches.
6. **Stage 6 (`#78` — Standalone Compiled Binaries `node/bun/deno:compile`)** — embeds permanent 3D Cube regression coverage into CI's `compile-and-export-smoke` job across all 3 compiled executables.
