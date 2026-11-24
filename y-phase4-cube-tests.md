# Dinou 3D Caching Cube — Phase 4 Orthogonal Hardening & Edge-Case Tests

This document specifies **6 remaining orthogonal stress-test angles** (`Checks #67–#72`) for Dinou's **3D Caching Engine** (`Axis X: Horizontal Segmentation` × `Axis Y: Vertical Segmentation / <DinouCacheSlot>` × `Axis Z: Partial Prerendering / PPR`), building on the 100% green completion of Phase 1 (`#37–#46`), Phase 2 (`#47–#61`, `x-3d-completion.md`), and Phase 3 (`#62–#66`, `y-final-cube-tests.md`, targeting Dinou `10.0.4`).

All 6 checks below are designed to be implemented and verified **incrementally (one stage at a time)** following the same poisoning, idempotence, strict hydration/router-watcher, and cross-runtime rules established in Phases 1–3.

---

## Master Checklist (Phase 4)

- [x] **Stage 1 — Check `#67`:** Sibling Route Groups `(groupA)` / `(groupB)` & Catch-All (`[...slug]` / `[[...slug]]`) Layouts Under 3D Triple Synergy
- [x] **Stage 2 — Check `#68`:** Distributed `DenoKVStorage` Consistency (Cross-Isolate Tombstones, Tag Invalidations, Chunked >16KB Payloads & 3D Layout Composition)
- [x] **Stage 3 — Check `#69`:** Server Functions (`"use server"`, `<form action>`, `useActionState`, Bound Inline Closures) Hosted Inside `<DinouCacheSlot>` & PPR Shells/Holes
- [ ] **Stage 4 — Check `#70`:** Custom Middleware & Plugin Context Propagation (`copyCustomContextProperties`) Across Every 3D Cube Execution Path
- [ ] **Stage 5 — Check `#71`:** Same-Pathname Query Transitions (`?tab=a` ↔ `?tab=b` → `Back`) + `router.refresh()` / `router.refresh({ layout: true })` Under Asymmetric 3D PPR
- [ ] **Stage 6 — Check `#72`:** Staggered Slow/Fast PPR Streaming Holes + Mid-Flight Navigation Abort & Concurrent `refreshSlot` Resilience

---

## Global Verification Rules

1. **Poisoning Methodology:** Poison every static shell and cached slot that must **not** re-execute (`base + 899`) while mutating only targeted dynamic segments, holes, or invalidated slots.
2. **Idempotence Across Browsers & Re-Runs:** Derive target values dynamically from the live DOM baseline (`base + 6xx`, `base + 899`) so sequential `chromium → firefox → webkit` runs never require clean rebuilds.
3. **Strict Guards:** Zero React hydration errors (`#418/#419/#422/#423/#425`), zero `"navigate called outside Router"` warnings, zero uncaught `pageerror`, and zero unhandled server rejections or Cloudflare `workerd` cross-request `IoContext` errors.
4. **Cross-Runtime Compatibility:** Works identically across Node (dev/AOT/unvendorized), Bun, Bun Pure, Deno, and Cloudflare Workers × Esbuild, Rollup, and Webpack.

---

## Stage 1 — Check `#67`: Sibling Route Groups `(groupA)` / `(groupB)` & Catch-All (`[...slug]` / `[[...slug]]`) Layouts Under 3D Triple Synergy

### Why This Matters
Phase 3 (`#62`) covered single-segment dynamic parameters (`[id]`), but real applications also rely heavily on:
1. **Sibling zero-segment Route Groups** under a shared URL prefix — e.g. `src/app/(marketing)/layout.tsx` (serving `/app/promo`) alongside `src/app/(dashboard)/layout.tsx` (serving `/app/settings`).
2. **Catch-all `[...slug]` and optional catch-all `[[...slug]]`** routes (0, 1, and N segments) with parameterized layouts and on-demand ISG.

### Proposed Fixtures
- **Sibling Route Groups (`src/t-3d-cube/group-collision/`):**
  - `src/t-3d-cube/group-collision/(alpha)/layout.tsx` + `layout_functions.ts` (`ppr = true`, `revalidate = 3600`, renders distinct `alpha` wrapper + `<DinouCacheSlot id="cube-grp-alpha-slot">` + PPR hole)
  - `src/t-3d-cube/group-collision/(alpha)/promo/page.tsx` + `page_functions.ts` (`ppr = true`, `revalidate = 3600`)
  - `src/t-3d-cube/group-collision/(beta)/layout.tsx` + `layout_functions.ts` (`ppr = true`, `revalidate = 3600`, renders distinct `beta` wrapper + `<DinouCacheSlot id="cube-grp-beta-slot">` + PPR hole)
  - `src/t-3d-cube/group-collision/(beta)/settings/page.tsx` + `page_functions.ts` (`ppr = true`, `revalidate = 3600`)
- **Optional Catch-All ISG (`src/t-3d-cube/catchall-isg/[[...slug]]/`):**
  - `layout.tsx` + `layout_functions.ts` (`ppr = true`, `revalidate = 3600`, reads `params.slug`, renders slug-scoped `<DinouCacheSlot>` + PPR hole)
  - `page.tsx` + `page_functions.ts` (`ppr = true`, `revalidate = 3600`, `allowISG = true`, `getStaticPaths: () => []`)

### What to Verify
1. **Zero storage collision between sibling `(alpha)` and `(beta)` layouts:**
   - Visiting `/t-3d-cube/group-collision/promo` and `/t-3d-cube/group-collision/settings` (both SSR and soft `<Link>` navigation between them!) renders each group's own layout shell, own `<DinouCacheSlot>`, and own PPR hole without overwriting each other's `shell.layout.own.json` / `layout.rsc` / `layout.metadata.json`.
   - Poisoning both shells & slots and calling `revalidateLayout` or `refreshSlot` on `(alpha)` leaves `(beta)` 100% untouched.
2. **Optional catch-all `[[...slug]]` cold on-demand ISG for 0, 1, and 2 segments (`/catchall-isg`, `/catchall-isg/docs`, `/catchall-isg/docs/v2`):**
   - Each depth materializes isolated layout/page shell artifacts, preserves frozen shells on poison + reload, supports live `refreshSlot` and surgical `revalidateLayout`, and soft-navigates cleanly with zero `#418`.

### Potential Dinou Core Risk Areas
- **High probability bug in `dinou/core/layout-functions.js:260-278`:** `getActiveLayoutChain` currently skips `(group)` directories when building `cleanLayoutKey = reqSegments.slice(0, urlSegCount).join("/")`. Two sibling `(alpha)/layout.tsx` and `(beta)/layout.tsx` under `t-3d-cube/group-collision` both compute `cleanLayoutKey = "t-3d-cube/group-collision"` and collide on `shell.layout.own.json`, `layout.rsc`, and `layout.metadata.json`!
- Verify client `getLayoutKey` (`dinou/core/client.jsx` / `client-webpack.jsx`) and `discover-layouts.js` distinguish sibling route-group layouts during soft `<Link>` transitions between `/promo` and `/settings`.
- Verify `[[...slug]]` root (0 segments) vs multi-segment `cleanLayoutKey` normalization in `handler.js` and `cache-revalidate.js`.

> **Verified (Stage 1 Complete):**
> - Fixtures: `src/t-3d-cube/group-collision/` (shared outer layout + sibling `(alpha)/{promo,promo2}` & `(beta)/settings`) and `src/t-3d-cube/catchall-isg/` (shared outer layout + `[[...slug]]/` for 0, 1, and 2 segments).
> - Unit / Compiled Node AOT: Test `19.` in `tests/unit/cache-3d-cube.test.mjs` (**19/19 PASS**), `tests/type-safe-contextual.test.mjs` (**5/5 PASS**, 127 strict TS files), `scripts/verify-revalidation-fixes-ci.mjs`, and `scripts/verify-bailout-ci.mjs` (**PASS**).
> - Browser E2E: Test `32.` in `e2e/example.spec.ts` + `Dinou groups`, `Dinou Static Crawler`, and `API Reference Batch 4` (**19 passed / 0 failed** across Chromium, Firefox, and WebKit with zero `#418`, router warnings, or `pageerror`).
> - Core fixes documented in `y-changelog-cube-phase4.md`.

---

## Stage 2 — Check `#68`: Distributed `DenoKVStorage` Consistency

### Why This Matters
Phase 3 Stage 2 (`#63`) hardened `CloudflareKVStorage` and multi-pod `RedisStorage` against cross-isolate / cross-pod stale `.dinou/dist2` resurrection. Auditing `dinou/core/storage-adapter.js:882-1030` shows that **`DenoKVStorage` still lacks distributed tombstones (`__tombstone__:`) and distributed tag invalidation keys (`__tag_inv__:`)**, leaving multi-isolate Deno Deploy clusters vulnerable to the exact same stale resurrection bug!

### Proposed Tests (`tests/unit/cache-3d-distributed-storage.test.mjs`)
1. **Cross-isolate `DenoKVStorage` tombstones & tag invalidations (`Isolate A → Isolate B`):**
   - Attach two independent `DenoKVStorage` instances backed by a shared Deno KV mock (supporting `get`, `set`, `delete`, `atomic`, `list`).
   - Populate `.dinou/dist2` fallback files + KV entries; have `Isolate A` call `markTagInvalidatedAsync(tag)` and `delete(slotKey)`.
   - Verify cold `Isolate B` observes `isKeyDeleted(slotKey) === true` and `getTagInvalidatedAtAsync(tag) > 0`, refuses to resurrect stale `.dinou/dist2` fallback via `readDist2Fallback` / `getSlotJSX`, and hides internal tombstone/tag-invalidation keys from `keys()`.
   - Have `Isolate A` write a fresh replacement -> verify `Isolate B` clears the tombstone and sees `inspectSlotsFreshness().hasNewer === true`.
2. **Chunked payload (>16KB `KV_CHUNK_SIZE`) lifecycle & cleanup:**
   - Write >20KB `shell.layout.own.json` / `index.html` via `Isolate A`, read losslessly via `Isolate B`, overwrite with a smaller (<16KB) payload (ensuring orphaned chunks don't corrupt reads), and delete cleanly (removing both header and chunks + writing tombstone).
3. **End-to-end compiled Node AOT 3D Cube over multi-isolate `DenoKVStorage`:**
   - Mirror Test 4 of `#63` (Pod A revalidates slot tag + `L1` layout, cold Pod B serves fresh `L1` + fresh slot while keeping `L2`/`Page` frozen and never resurrecting `.dinou/dist2`).

### Potential Dinou Core Risk Areas
- `DenoKVStorage` (`dinou/core/storage-adapter.js:882-1030`) currently inherits isolate-RAM-only `isDeleted` / `getTagInvalidatedAt` from `StorageAdapter` and does not implement `isKeyDeleted`, `markTagInvalidated`, `markTagInvalidatedAsync`, or `getTagInvalidatedAtAsync`.
- Verify `DenoKVStorage.delete()` removes chunk keys (`["dinou_cache_chunk", targetKey, i]`) as well as companion keys (`index.html` / folder / `slot.metadata.json`).

> **Verified (Stage 2 Complete):**
> - Tests `5.`, `6.`, and `7.` added to `tests/unit/cache-3d-distributed-storage.test.mjs` (automatically executed by `npm run test:unit` across CI).
> - Verified: `tests/unit/cache-3d-distributed-storage.test.mjs` (**7/7 PASS**), `tests/unit/cache-3d-cube.test.mjs` (**19/19 PASS**), and `scripts/verify-revalidation-fixes-ci.mjs` (**PASS**).
> - Core fixes documented in `y-changelog-cube-phase4.md`.

---

## Stage 3 — Check `#69`: Server Functions (`"use server"`, `<form action>`, `useActionState`, Bound Inline Closures) Inside `<DinouCacheSlot>` & PPR Shells/Holes

### Why This Matters
Real-world interactive apps embed `<form action={...}>` and `useActionState` components inside cached `<DinouCacheSlot>` widgets, PPR static shells, and PPR dynamic holes — including inline `"use server"` closures (`.bind()`). Every one of those Server Function references (`Symbol.for("react.server.reference")`) must survive `serializeJSX` / `deserializeJSX` across `shell.layout.own.json`, `shell.page.json`, and `slots/<id>/slot.json` as well as across `refreshSlot`, `revalidateTag`, and F5 reloads.

### Proposed Fixtures
- `src/t-3d-cube/sf-in-cube/layout.tsx` + `layout_functions.ts` (`ppr = true`, `revalidate = 3600`, hosts a `<DinouCacheSlot>` containing a Client Component receiving BOTH an imported `"use server"` action AND a bound inline `"use server"` closure!)
- `src/t-3d-cube/sf-in-cube/page.tsx` + `page_functions.ts` (`ppr = true`, `revalidate = 3600`, contains:
  1. Static shell `<form action={mutateAndRevalidateSlot}>` using `useActionState`
  2. `<DinouCacheSlot>` with bound inline `"use server"` closure capturing a build-time item label
  3. PPR dynamic hole containing a `<form action={mutateAndRedirect}>` that mutates state, calls `revalidateTag`, and triggers `redirect()`)

### What to Verify
1. On initial load AND after full F5 reload (serving deserialized `shell.layout.own.json`, `shell.page.json`, and `slots/*/slot.json`), invoking both the imported Server Function and the bound inline `"use server"` closure succeeds via RPC and preserves bound arguments.
2. Submitting the `useActionState` form mutates state + calls `revalidateTag` -> live `refreshSlot` updates the slot cleanly without re-executing poisoned shells, and the bound action inside the refreshed slot STILL works afterwards.
3. Submitting the Server Function inside the PPR dynamic hole that mutates + `revalidateTag` + `redirect()` redirects cleanly with zero `#418`, zero router warnings, and zero `pageerror`.

### Potential Dinou Core Risk Areas
- Verify `serializeJSX` / `deserializeJSX` in `dinou/core/cache-slot.js` preserves `$$bound` arguments on bound `react.server.reference` proxies (`fn.bind(null, ...)`) inside `shell.page.json`, `shell.layout.own.json`, and `slots/*/slot.json`!
- Verify `registerServerReference` works identically across Esbuild, Rollup, and Webpack bundles when deserializing cached slots after a cold server restart.

> **Verified (Stage 3 Complete):**
> - Fixtures: `src/t-3d-cube/sf-in-cube/` (`actions.ts`, `sf-client.tsx`, `layout.tsx`, `page.tsx`, `done/page.tsx`) and `src/t-3d-cube/shared/cube-state.ts`.
> - Unit / Compiled Node AOT: Test `20.` in `tests/unit/cache-3d-cube.test.mjs` (**20/20 PASS**), `scripts/verify-sf-fixes-ci.mjs` (**PASS**), `scripts/verify-ssr-server-references-ci.mjs` (**PASS**), and `tests/type-safe-contextual.test.mjs` (**5/5 PASS**, 127 strict TS files).
> - Browser E2E: Test `33.` in `e2e/example.spec.ts` (**3 passed / 0 failed** across Chromium, Firefox, and WebKit — initial load, F5 deserialized reload, imported + bound inline `"use server"` closures + bound `<form action>`, `useActionState` + `revalidateTag` + live `refreshSlot`, and PPR hole `redirect()` with zero `#418`, router warnings, or `pageerror`).
> - Core fix documented in `y-changelog-cube-phase4.md`.

---

## Stage 4 — Check `#70`: Custom Middleware & Plugin Context Propagation (`copyCustomContextProperties`) Across Every 3D Cube Path

### Why This Matters
Dinou plugins and Node/Edge middlewares attach custom properties (e.g., `ctx.tenant`, `ctx.pluginAuth`, `ctx.traceId`) to `rootContext`. If any 3D caching code path creates a derived `RequestContext` without calling `copyCustomContextProperties(rootContext, context)`, auth/tenant context silently becomes `undefined` in production!

### Proposed Fixtures & Tests
- Reuse or extend the existing `src/_plugins/plugin-setup.ts` / `user-setup.ts` (or a dedicated compiled Node AOT integration test in `tests/unit/cache-3d-cube.test.mjs`) that attaches a deterministic header-driven `ctx.cubePluginTenant` on every request (`x-cube-tenant` header / cookie).
- Exercise a 3D Asymmetric route (`L1 Static PPR + Slot + Hole → L2 Dynamic + Slot → Page Static PPR + Hole + Slot`) where `L1` hole, `L2` host, `Page` hole, and a `revalidate = 0` `<DinouCacheSlot>` all read `getContext().cubePluginTenant`.

### What to Verify
1. Direct SSR (`handlePprResume` and asymmetric `spliceSingleLayoutOwnHoles` + `renderSingleLayoutLevel`): `L1` hole, `L2` host, and `Page` hole all receive the exact per-request `cubePluginTenant` (never `undefined`, never leaking Request A's tenant into Request B!).
2. Soft `<Link>` navigation (`/____rsc_layout____` and `/____rsc_page____`): `cubePluginTenant` propagates into both endpoints.
3. Live `refreshSlot` (`/____rsc_slot____`): dynamic slot receives the live request's `cubePluginTenant`.
4. `revalidateLayout` / `revalidatePage` / SSG: background/build contexts stay clean and never leak a user's `cubePluginTenant` into cached static shells.

### Potential Dinou Core Risk Areas
- Check `createDiscoveryContext` (`dinou/core/cache-slot.js:126-175`), `/____rsc_slot____` handler (`dinou/core/handler.js`), `handlePprResume` (`dinou/core/ppr-runtime.js`), and asymmetric `renderSingleLayoutLevel` / `spliceSingleLayoutOwnHoles` for complete `copyCustomContextProperties` coverage.

---

## Stage 5 — Check `#71`: Same-Pathname Query Transitions (`?tab=a` ↔ `?tab=b` → `Back`) + `router.refresh()` / `router.refresh({ layout: true })`

### Why This Matters
In `dinou/core/client.jsx:458`, `layoutCache` keys entries by `${layoutKey}${searchPart}`, and `pageCache` keys entries by `${pathname}${search}`. Navigating between URLs with the **same pathname and different query strings** on an asymmetric 3D PPR route where BOTH `L1`'s PPR hole AND `Page`'s PPR hole (plus client `useSearchParams()`) depend on the query string exercises cache keying, `L1` client-state preservation, `router.refresh()`, and `router.refresh({ layout: true })`.

### Proposed Fixtures
- `src/t-3d-cube/query-ppr/layout.tsx` + `layout_functions.ts` (`ppr = true`, `revalidate = 3600`, renders `L1` shell + `<CubeClientProbe id="qp-l1">` + `<DinouCacheSlot>` + `L1` PPR hole reading `?tab=...`)
- `src/t-3d-cube/query-ppr/page.tsx` + `page_functions.ts` (`ppr = true`, `revalidate = 3600`, renders `Page` shell + `<CubeClientProbe id="qp-page">` + client `useSearchParams()` reader + `Page` PPR hole reading `?tab=...` and `?sort=...`)

### What to Verify
1. Load `/t-3d-cube/query-ppr?tab=overview&sort=asc`, increment `L1` and `Page` client probes, poison shells & slots.
2. Soft-navigate `<Link>` to `/t-3d-cube/query-ppr?tab=metrics&sort=desc`:
   - `L1` client probe `mountId` & counter survive!
   - Both `L1` PPR hole (`tab=metrics`) and `Page` PPR hole (`tab=metrics`, `sort=desc`) + client `useSearchParams()` update live while shells & slots stay frozen!
3. Browser `Back` -> returns cleanly to `tab=overview&sort=asc` (zero `#418`).
4. Mutate dynamic hole counters (keep shells poisoned!) and call `router.refresh()` -> `Page` hole updates fresh while `L1` shell/slot stay frozen; then call `router.refresh({ layout: true })` -> `L1` hole ALSO updates fresh while `L1` shell stays frozen!

### Potential Dinou Core Risk Areas
- Verify `router.refresh({ layout: true })` (`dinou/core/client.jsx:855-880` and `client-webpack.jsx`) evicts `${layoutKey}${searchPart}` accurately and does not leave stale query-keyed `layoutCache` entries behind when switching back via `popstate`.

---

## Stage 6 — Check `#72`: Staggered Slow/Fast PPR Streaming Holes + Mid-Flight Navigation Abort & Concurrent `refreshSlot` Resilience

### Why This Matters
Real network latency makes PPR holes resolve at wildly different speeds (e.g., 15ms cached Redis lookup vs 350ms external API call). Users frequently click a `<Link>` or trigger a `refreshSlot` **before** slow PPR holes finish streaming.

### Proposed Fixtures
- `src/t-3d-cube/staggered-ppr/page.tsx` + `page_functions.ts` (`ppr = true`, `revalidate = 3600`, renders:
  - Static shell + `<DinouCacheSlot id="cube-stag-shell-slot">` + `<Link id="link-stag-away" href="/t-3d-cube/ppr">`
  - Fast Hole A (`15ms` delay)
  - Slow Hole B (`350ms` delay, hosting an inner `<DinouCacheSlot id="cube-stag-slow-slot">`))

### What to Verify
1. **Staggered arrival integrity:** Fast Hole A replaces its fallback long before Slow Hole B resolves; once Slow Hole B resolves, both holes + inner slot hydrate cleanly with zero `#418` / `#425` across Chromium, Firefox, and WebKit.
2. **Mid-stream `<Link>` abort:** Navigate to `/t-3d-cube/staggered-ppr`, wait until Fast Hole A is visible while Slow Hole B is still showing its fallback (`#stag-hole-b-fb`), and immediately click `#link-stag-away` -> destination route renders cleanly with zero `#418`, zero uncaught `pageerror`, zero orphaned `window.$RB` leaks, and zero unhandled stream-writer rejections on the server!
3. **Mid-stream `refreshSlot`:** Trigger `refreshSlot("cube-stag-shell-slot", { fresh: true })` while Slow Hole B is still streaming -> shell slot updates cleanly AND Slow Hole B still completes without colliding or throwing.

### Potential Dinou Core Risk Areas
- Verify `handlePprResume` (`dinou/core/ppr-runtime.js`) handles `writer.write(...)` gracefully when the client closes/aborts the HTTP connection mid-stream (especially on Cloudflare Workers `workerd` and Node HTTP/1.1 keep-alive!).
- Verify `flushPendingSsrStreams()` / `pruneOrphanedSsrStreams()` (`dinou/core/slot.js`) cleans up partially-streamed `$RB` boundaries cleanly on mid-stream navigation.

---

## Recommended Execution Order

When ready to begin Phase 4 (e.g., targeting Dinou `10.0.5` after `10.0.4` CI is green):
1. **Stage 1 (`#67` — Sibling Route Groups `(groupA)`/`(groupB)` & `[[...slug]]` Catch-All)** — highest probability of uncovering a real storage-key collision bug (`cleanLayoutKey` in `layout-functions.js`).
2. **Stage 2 (`#68` — Distributed `DenoKVStorage`)** — known multi-isolate parity gap matching `#63`'s `CloudflareKVStorage` fix.
3. **Stage 3 (`#69` — Server Functions & Bound Inline Closures inside `<DinouCacheSlot>` & PPR)** — high-value serialization safety check across all 3 bundlers.
4. **Stage 4 (`#70` — Plugin & Middleware Custom Context Propagation)** — real-world auth/multi-tenant safety across every 3D path.
5. **Stage 5 (`#71` — Same-Pathname Query Transitions + `router.refresh({ layout: true })`)** — client router & `layoutCache` key integrity.
6. **Stage 6 (`#72` — Staggered PPR Streaming & Mid-Flight Abort)** — streaming resilience under real latency and user interrupts.
