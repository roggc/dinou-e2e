# Dinou 3D Caching Cube — Phase 3 Final Hardening & Edge-Case Tests

This document specifies the **5 remaining fine-grained edge-case angles** (`Checks #62–#66`) for Dinou's **3D Caching Engine** (`Axis X: Horizontal Segmentation` × `Axis Y: Vertical Segmentation / <DinouCacheSlot>` × `Axis Z: Partial Prerendering / PPR`), following the 100% green completion of Phase 1 (`#37–#46`), Phase 2 (`#47–#61`, `x-3d-completion.md`), and the 24 core fixes shipped in Dinou `10.0.3` (`x-changelog-cube.md`).

All 5 checks below are designed to be implemented and verified **incrementally (one stage at a time)** following the exact same poisoning, idempotence, strict hydration/router-watcher, and cross-runtime rules established in `x-3d-completion.md`.

---

## Master Checklist (Phase 3)

- [x] **Stage 1 — Check `#62`:** Dynamic Route Params (`[id]` / `[...slug]`) + On-Demand ISG (`allowISG = true`) under 3D Triple Synergy *(PASS across Chromium/Firefox/WebKit + Test 15 Node AOT; fixed missing per-instance `shell.layout.own.json` / `layout.metadata.json` / `layout.rsc` population on cold on-demand ISG in `handler.js` + implicit dynamic bailout guard in `cache-revalidate.js`)*
- [ ] **Stage 2 — Check `#63`:** Distributed Storage Verification (`CloudflareKVStorage` Per-Request Bindings & Multi-Instance `RedisStorage`)
- [ ] **Stage 3 — Check `#64`:** Parallel Routes (`@sidebar` / `@modal`) Inside Asymmetric Chains (`S → D → S`) with PPR & `<DinouCacheSlot>`
- [ ] **Stage 4 — Check `#65`:** Client Lifecycle Stress (`refreshSlot` → `reset_layout` / `no_layout` → Browser `Back` / `Forward`)
- [ ] **Stage 5 — Check `#66`:** `notFound()` Inside a PPR Dynamic Hole (Streaming Behavior, Error/404 Isolation & Shell Integrity)

---

## Global Verification Rules

1. **Poisoning Methodology:** Always poison every segment/slot/shell that must **not** re-execute (`base + 899`) while mutating only targeted dynamic segments/holes/slots.
2. **Idempotence Across Browsers & Re-Runs:** Derive target values dynamically from the live DOM baseline (`base + 6xx`, `base + 899`) so sequential `chromium → firefox → webkit` runs never require clean rebuilds.
3. **Strict Guards:** Zero React hydration errors (`#418/#419/#422/#423/#425`), zero `"navigate called outside Router"` warnings, zero uncaught `pageerror`, and zero Cloudflare `workerd` cross-request `IoContext` errors.
4. **Cross-Runtime Compatibility:** Works identically across Node (dev/AOT/unvendorized), Bun, Bun Pure, Deno, and Cloudflare Workers × Esbuild, Rollup, and Webpack.

---

## Stage 1 — Check `#62`: Dynamic Route Params (`[id]` / `[...slug]`) + On-Demand ISG Under 3D Triple Synergy

### Why This Matters
All Phase 1 & Phase 2 `/t-3d-cube/*` fixtures use literal segments pre-rendered during SSG. Real production apps heavily rely on parameterized routes (`/products/[id]`, `/docs/[...slug]`) generated lazily via **on-demand ISG** (`allowISG = true`, not pre-enumerated in `getStaticPaths`).

### Proposed Fixtures
- `src/t-3d-cube/isg-param/layout.tsx` + `layout_functions.ts` (`L1`: static `ppr = true`, `revalidate = 3600`, static shell + L1 `<DinouCacheSlot>` + L1 dynamic hole)
- `src/t-3d-cube/isg-param/[id]/layout.tsx` + `layout_functions.ts` (`L2`: parameterized `ppr = true`, `revalidate = 3600`, reads `params.id`, renders `<DinouCacheSlot id={`cube-isg-l2-slot-${id}`} revalidate={3600}>` + L2 dynamic hole reading query `?v=...`)
- `src/t-3d-cube/isg-param/[id]/page.tsx` + `page_functions.ts` (`Page`: `ppr = true`, `revalidate = 3600`, `allowISG = true`, `getStaticPaths: () => []`, reads `params.id`, renders page shell + `<DinouCacheSlot id={`cube-isg-page-slot-${id}`} revalidate={3600}>` + page dynamic hole)

### What to Verify
1. **Cold on-demand ISG creation for two distinct param instances (`/alpha` and `/beta`):**
   - First visit to `/t-3d-cube/isg-param/alpha?v=1` generates and persists `isg-param/alpha/shell.layout.own.json`, `isg-param/alpha/shell.page.json`, `metadata.json`, and parameterized slots without colliding with `/beta`.
   - First visit to `/t-3d-cube/isg-param/beta?v=2` generates its own isolated fragments.
2. **Per-instance isolation & poisoning:**
   - Poison `L1`, `/alpha` shells & slots, and `/beta` shells & slots; bump only dynamic holes. Reload both `/alpha?v=3` and `/beta?v=4` → shells & slots stay frozen with their own `id`-scoped values while dynamic holes stream live (zero cross-instance leakage).
3. **Surgical per-instance revalidation & live `refreshSlot`:**
   - `refreshSlot("cube-isg-page-slot-alpha", { fresh: true })` updates ONLY `/alpha`'s slot and persists across reload while `/beta`'s slot stays untouched.
   - `revalidateLayout("/t-3d-cube/isg-param/alpha")` updates ONLY `/alpha`'s `L2` shell while preserving `L1`, `/alpha`'s `Page` shell, and all of `/beta`.
4. **Soft `<Link>` navigation `/alpha` ↔ `/beta`:**
   - `L1` client probe `mountId` & counter survive navigation; `/alpha` ↔ `/beta` parameterized layouts & pages swap cleanly with zero `#418` hydration errors.

### Potential Dinou Core Risk Areas
- Verify `handler.js` on-demand ISG path persists `shell.layout.own.json`, `layout.metadata.json`, `shell.page.json`, and `metadata.json` for parameterized `[id]` layouts on first miss (when SSG did not pre-render that `[id]`).
- Verify `cache-slot.js` `getSlotJSX` host persistence and `normalizeSlotRouteKey` resolve parameterized routes accurately on live `refreshSlot`.

---

## Stage 2 — Check `#63`: Distributed Storage (`CloudflareKVStorage` Per-Request Bindings & Multi-Instance `RedisStorage`)

### Why This Matters
In CI, Cloudflare tests run against `MemoryStorage` (no `DINOU_CACHE` KV binding in test `wrangler.toml`), and `RedisStorage` is verified only on single-instance mocks. Real multi-pod Node/Bun clusters (Redis) and multi-request Cloudflare Workers with KV bindings exercise tombstone propagation, `slot.metadata.json`, `shell.layout.own.json`, and per-request `env.DINOU_CACHE` resolution.

### Proposed Tests (`tests/unit/cache-3d-distributed-storage.test.mjs`)
1. **`CloudflareKVStorage` per-request binding isolation:**
   - Simulate two distinct Cloudflare requests with strict request-scoped KV proxies (throwing `Cannot perform I/O on behalf of a different request` if Request 2 calls Request 1's KV binding!).
   - Instantiate `new CloudflareKVStorage(req1Kv)` once (mirroring `worker.js` singleton initialization), then execute `get` / `set` / `has` / `delete` / `keys` inside `requestStorage.run(req2Ctx, ...)` where `req2Ctx.env.DINOU_CACHE = req2Kv` → assert Request 2 strictly invokes `req2Kv` and **never** touches `req1Kv`.
2. **Multi-pod `RedisStorage` 3D Cube consistency:**
   - Attach two independent `RedisStorage` instances (`podA` and `podB`, separate in-memory `_deletedKeys` and `_invalidatedTags` maps) backed by a shared in-memory Redis store.
   - Populate `L1/shell.layout.own.json`, `L2/shell.layout.own.json`, `Page/shell.page.json`, and `slots/shared-slot/slot.json` via `podA`.
   - Call `revalidateTag` / `delete` on `podA` → verify `podB` respects remote tombstones (`isKeyDeleted`), remote tag invalidation timestamps (`getTagInvalidatedAtAsync`), and `inspectSlotsFreshness` (`hasNewer`) without serving stale disk/memory fallbacks.

### Potential Dinou Core Risk Areas
- Verify `CloudflareKVStorage` writes and reads companion metadata (`layout.metadata.json`, `slot.metadata.json`, `metadata.json`) identically to `FileSystemStorage` and `MemoryStorage` during `revalidateLayout`, `revalidatePage`, and `revalidateTag`.
- Verify `RedisStorage` `getSlotFromStorage` checks `getTagInvalidatedAtAsync` and `isKeyDeleted` across pods before falling back to local `.dinou/dist2`.

---

## Stage 3 — Check `#64`: Parallel Routes (`@sidebar` / `@modal`) Inside Asymmetric Chains (`S → D → S`) with PPR & `<DinouCacheSlot>`

### Why This Matters
Phase 1 verifies `@sidebar` under symmetric all-static layouts (`#42`, `#43`). Production dashboards often combine parallel `@slot` segments with asymmetric dynamic layouts (`L1 Static + @sidebar → L2 Dynamic → L3 Static/PPR`) or dynamic/PPR `@slots` whose content varies by child subroute.

### Proposed Fixtures
- `src/t-3d-cube/parallel-asym/layout.tsx` + `layout_functions.ts` (`L1`: static `ppr = true`, `revalidate = 3600`, renders `{sidebar}` + `{children}`)
- `src/t-3d-cube/parallel-asym/@sidebar/page.tsx` (default sidebar with `<DinouCacheSlot id="cube-pa-sidebar-slot" revalidate={3600}>` + dynamic PPR hole)
- `src/t-3d-cube/parallel-asym/dyn-l2/layout.tsx` + `layout_functions.ts` (`L2`: dynamic `revalidate = 0`)
- `src/t-3d-cube/parallel-asym/dyn-l2/@sidebar/page.tsx` (subroute-specific sidebar override, or dynamic `@panel` slot on `L2`)
- `src/t-3d-cube/parallel-asym/dyn-l2/page.tsx` + `page_functions.ts` (`Page`: static `ppr = true`, `revalidate = 3600`)

### What to Verify
1. Direct SSR & reload: `L1` shell and `@sidebar` static slot stay frozen while `L2` executes live and `@sidebar`'s PPR hole streams live (zero `#418`).
2. Live `refreshSlot("cube-pa-sidebar-slot", { fresh: true })` updates `@sidebar` slot without re-executing `L1` or `Page` shells and persists across F5.
3. Soft `<Link>` navigation between sibling routes with different `@slot` content updates the parallel slot cleanly without losing outer `L1` client state or triggering hydration/router warnings.

### Potential Dinou Core Risk Areas
- Verify `renderSingleLayoutLevel` (`layout-composition.js:240–325`) preserves parallel `@slot` error/redirect isolation, `useId()` scope parity, and PPR hole offset alignment when a layout level has both a PPR `@sidebar` and a dynamic descendant `L2`.

---

## Stage 4 — Check `#65`: Client Lifecycle Stress (`refreshSlot` → `reset_layout` / `no_layout` → Browser `Back` / `Forward`)

### Why This Matters
Client-side `<DinouCacheSlotBoundary>` keeps module-level registries (`knownClientSlots`, `mountedClientSlots`, `slotOverrideCache` in `dinou/core/slot.js`). Navigating across full layout-tree resets (`reset_layout` / `no_layout`) and returning via browser history (`history.back()` / `history.forward()`) tests unmounting, re-mounting, and override cache validity across hard boundary transitions.

### Proposed Fixtures
- Reuse `/t-3d-cube/triple-asym/dyn-l2/l3` (or dedicated route with links to a `no_layout` route and a `reset_layout` route, each with its own `<DinouCacheSlot>`).

### What to Verify
1. Load 3D asymmetric route → increment client probe counters → trigger live `refreshSlot` on both a layout slot (`cube-ta-l1-slot`) and a page slot (`cube-ta-page-shell-slot`) → verify updated values `V2`.
2. Soft-navigate via `<Link>` to a `no_layout` route (unmounting all outer layouts & slots) and verify `mountedClientSlots` has zero leaked subscribers from the previous tree; trigger wildcard `refreshSlot("*", { fresh: true })` on the `no_layout` route and confirm it does **not** fetch unmounted slots from the previous route.
3. Navigate `page.goBack()` back to the 3D route:
   - Verify the page displays the fresh `V2` values (never reverting to stale `V1`!) with zero `#418` errors and zero duplicate `/____rsc_slot____` requests when triggering a subsequent `refreshSlot` (`V2 → V3`).
4. Repeat the cycle through a `reset_layout` route + `page.goBack()` + `page.goForward()`.

### Potential Dinou Core Risk Areas
- Verify `slotOverrideCache` `baseChildren` / `baseChildrenSet` matching in `dinou/core/slot.js` does not show stale cached overrides or drop newly fetched overrides when a route unmounts completely (`no_layout`/`reset_layout`) and remounts via `popstate`.

---

## Stage 5 — Check `#66`: `notFound()` Inside a PPR Dynamic Hole

### Why This Matters
Check `#55` uncovered 3 real core bugs (`#14`, `#15`, `#24`) when testing `throw Error` and `redirect()` inside a PPR dynamic hole. Calling `notFound()` inside an async PPR dynamic hole (after HTTP 200 shell headers have already been flushed to the client!) is the remaining control-flow primitive to verify end-to-end.

### Proposed Fixtures
- Extend `src/t-3d-cube/ppr-hole-edge/page.tsx` (or add a dedicated `/t-3d-cube/ppr-not-found` fixture with `not_found.tsx` / `error.tsx`) where a dynamic `<Suspense>` hole calls `notFound()` when `?missing=1` alongside a healthy sibling hole.

### What to Verify
1. Verify deterministic behavior when a PPR dynamic hole triggers `notFound()` after shell prelude flush:
   - Stream terminates cleanly without hanging or leaking unhandled rejections.
   - Client renders the expected `not_found` boundary / fallback UI (or isolates cleanly) with zero `#418` hydration errors and zero uncaught `pageerror`s across Chromium, Firefox, and WebKit.
2. Verify subsequent healthy requests (`?missing=0`) still serve the intact cached static shell (disk/storage shell was not poisoned or evicted).

### Potential Dinou Core Risk Areas
- Check how `ppr-runtime.js` (`streamDynamicHoles`) distinguishes `$$type: "dinou-internal-not-found"` (or `isNotFound.value = true`) from generic errors and `$$type: "dinou-internal-redirect"` once the PPR shell prelude has already flushed.

---

## Recommended Execution Order

When ready to start Phase 3 (e.g., targeting Dinou `10.0.4`):
1. **Stage 1 (`#62` — Dynamic `[id]` ISG + 3D Triple Synergy)** — highest real-world production leverage.
2. **Stage 5 (`#66` — `notFound()` inside a PPR dynamic hole)** — high likelihood of uncovering a small control-flow gap like `#55` did.
3. **Stage 2 (`#63` — `CloudflareKVStorage` & Multi-Pod `RedisStorage`)** — fast pure unit/integration test locking down distributed edge/cluster safety.
4. **Stage 3 (`#64` — Parallel `@slots` in asymmetric chains)** — completes Horizontal Segmentation coverage.
5. **Stage 4 (`#65` — Client `refreshSlot` + `reset_layout`/`no_layout` + `Back`/`Forward`)** — locks down client memory & history lifecycle.
