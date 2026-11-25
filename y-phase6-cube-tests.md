# Dinou 3D Caching Cube — Phase 6 Exhaustive Revalidation Matrix (`revalidate` TTL × `revalidateTag` × `revalidatePath` × `revalidateLayout` × `revalidatePage` × `refreshSlot`)

This document specifies **6 comprehensive revalidation test stages** (`Checks #79–#84`) covering **every revalidation primitive in Dinou** across **every 3D Caching Cube topology, placement, error path, concurrency pattern, and runtime trigger surface**.

> **Why a Dedicated Phase 6?**
> Phases 1–4 verified core happy-path revalidation behaviors (e.g., single-level `revalidateTag`, single-level `revalidateLayout`, basic `revalidatePage`, basic `refreshSlot({ fresh: true })`, and simple `revalidate = 1` expiration), but a direct audit of `dinou/core/cache-revalidate.js` (1,843 lines) and `dinou/core/cache-slot.js` (1,561 lines) revealed **major untested combinations and concrete bug candidates** when all 6 revalidation primitives are crossed with every 3D Cube variant (route groups `(alpha)`/`(beta)`, optional catch-all `[[...slug]]`, asymmetric `L1(S) → L2(D) → L3(S) → Page(PPR)`, nested slots, shared multi-slot tags, concurrent stampedes, dynamic `revalidate(params)` functions, mid-ISR bailout, and Cloudflare/Deno/Redis distributed runtimes).

All 6 checks below are designed to be implemented and verified **incrementally (one stage at a time)**, tracking every `dinou/core/` fix in `y-changelog-cube-phase6.md`.

---

## Revalidation Coverage Matrix (What Phase 6 Closes)

| Primitive | Tested in Phases 1–4 (Partial) | Untested / High-Risk Matrix Closed in Phase 6 |
|---|---|---|
| **`revalidatePath()`** | Basic literal path on flat / simple layout | Sibling `(alpha)`/`(beta)` route groups, `[[...slug]]` (0/1/2 segs), dynamic `L2` ancestor, relative paths (`../sibling`), deprecated 2nd-arg warning, same-ms monotonic isolation (**`#79`**) |
| **`revalidateTag()`** | Single tag on page, layout, or single slot | Slot-by-raw-ID vs slot-by-tag across all 4 placements (L1 shell, Dynamic L2, Page shell, PPR hole), **1 shared tag spanning multiple slots + layouts + pages**, `(group)`/`[[...slug]]`/`[id]`, dynamic `L2` ancestor, error rollback (`slotBackups`), **Cloudflare Workers concurrent `Promise.all` ancestor ordering** (**`#80`**) |
| **`revalidateLayout()` & `revalidatePage()`** | Basic L1/L2/Page invalidation | Root `/`, `(alpha)` vs `(beta)` isolation, `[[...slug]]` 0-seg vs N-seg, static `L3` under dynamic `L2`, calling on dynamic layout (safe `false`) & non-existent paths (no-op), **concurrent stampede + causal `_old` hydration snapshots** (**`#81`**) |
| **`refreshSlot(idOrTag, { fresh })` & `refreshSlot("*")`** | Basic `{ fresh: true }` on single slot | Explicit `{ fresh: false }` vs `{ fresh: true }` (valid cache, TTL-expired, tag-invalidated), rapid `<500ms` sequential `{ fresh: true }` (`recentFreshSlotRenders`), early `inflightSlotRenders` vs `revalidate = 0`, **shared multi-slot tag**, nested `Outer → Inner` slots, `refreshSlot("*")`, cross-route shared slot (`Page A → Page B`) (**`#82`**) |
| **Clock-Based TTL (`revalidate = N`)** | Single-level `revalidate = 1` on page or single slot | **Simultaneous multi-level cascade** `L1(1s) → L2(1s) → L3(3600s) → Page(3600s)`, **all-3-axes 1s TTL** (`L1+Slot(1s) → L2(0) → L3+Slot(1s) → Page PPR+ShellSlot(1s)+HoleSlot(1s)`), **per-param dynamic `revalidate(params)` function** + `export default { revalidate, getCacheTags }`, **mid-ISR dynamic bailout** (`markRouteDynamicInMap`) (**`#83`**) |
| **Trigger Surfaces & Distributed Runtimes** | Mostly direct test-harness calls & single-pod | Invoking all 5 primitives from: **(a) `"use server"` Server Functions inside slots/holes**, **(b) plugin/API webhook outside React render**, **(c) standalone background worker**, and **(d) multi-pod `RedisStorage` + multi-isolate `DenoKVStorage` + `CloudflareKVStorage` (`ctx.waitUntil` SWR)** (**`#84`**) |

---

## Master Checklist (Phase 6)

- [x] **Stage 1 — Check `#79`:** `revalidatePath()` Complete Matrix (Route Groups `(alpha)`/`(beta)`, `[[...slug]]`, Dynamic `L2` Ancestor, Relative Paths & Monotonic Timestamps)
- [x] **Stage 2 — Check `#80`:** `revalidateTag()` Complete Matrix (Raw Slot ID vs Tag, Shared Multi-Slot Tags, All 4 Placements, `(group)`/`[[...slug]]`/`[id]`, Error Backup Rollback & Cloudflare Workers Ancestor Ordering)
- [x] **Stage 3 — Check `#81`:** `revalidateLayout()` & `revalidatePage()` Surgical Contracts, No-Op Guards & Causal `_old` Hydration Snapshots Under Stampede
- [x] **Stage 4 — Check `#82`:** `refreshSlot(idOrTag, { fresh: false | true })` & `refreshSlot("*")` Complete Matrix (Shared Tags, Nested Slots, `<500ms` Fresh Race, `revalidate = 0` Stampede & Cross-Route Propagation)
- [x] **Stage 5 — Check `#83`:** Clock-Based TTL (`revalidate = N`) Exhaustive Matrix (Multi-Level Simultaneous Expiration, All-3-Axes 1s Slots, Per-Param Dynamic `revalidate(params)` Function & Mid-ISR Dynamic Bailout)
- [ ] **Stage 6 — Check `#84`:** Revalidation Trigger Surfaces (Server Functions, Plugins/Webhooks, Standalone Workers) × Distributed Multi-Pod / Edge Runtimes (`Redis`, `Deno KV`, `Cloudflare KV + waitUntil`)

---

## Global Verification Rules

1. **Poisoning Methodology:** For every revalidation call, poison all untouched layers (`base + 899`) to prove mathematically that **only** the targeted layout/page/slot re-executed, and zero unintended recomputation occurred.
2. **Idempotence Across Browsers & Re-Runs:** Derive all target values dynamically from the live DOM / storage baseline so sequential `chromium → firefox → webkit` runs and repeated CI invocations are 100% deterministic.
3. **Strict Guards:** Zero React hydration errors (`#418/#419/#422/#423/#425`), zero `"navigate called outside Router"` warnings, zero uncaught `pageerror`, and zero unhandled server rejections or Cloudflare `workerd` cross-request `IoContext` errors.
4. **Companion Changelog:** Track every `dinou/core/` bug fix uncovered during Phase 6 in `y-changelog-cube-phase6.md`.

---

## Stage 1 — Check `#79`: `revalidatePath()` Complete Matrix

### Why This Matters
`revalidatePath(reqPath)` is the primary high-level revalidation API used by Dinou developers. Direct inspection of `dinou/core/cache-revalidate.js:950–989` exposes **high-probability bugs** when `revalidatePath()` targets modern 3D Cube routes:
- Lines `958–985` check `storage` for `${cleanPathKey}/layout.rsc` and `getFilePathAndDynamicParams(reqSegments, {}, srcFolder, "layout", true, true, undefined, 0)`.
- For a route inside a **sibling route group** (e.g., `/t-3d-cube/group-collision/promo` whose layout lives at `group-collision/(alpha)/layout.tsx`), `group-collision/promo/layout.rsc` does NOT exist! And for a 0-segment **optional catch-all** (`/t-3d-cube/catchall-isg` whose layout lives at `catchall-isg/[[...slug]]/layout.tsx`), its stored layout key is `t-3d-cube/catchall-isg/[[...slug]]/layout.rsc`, NOT `t-3d-cube/catchall-isg/layout.rsc`!
- In both cases, `revalidatePath()` may silently **skip** `revalidateLayout()` and only revalidate the page—leaving the route's own layout stale!

### Proposed Fixtures & Tests
- Reuse Phase 4's `src/t-3d-cube/group-collision/` (`(alpha)/promo`, `(beta)/settings`), `src/t-3d-cube/catchall-isg/[[...slug]]/` (0, 1, 2 segs), and Phase 2/3's asymmetric `L1(S) → L2(D) → L3(S) → Page(PPR)`.
- Add targeted relative-path / trailing-slash / URL-encoded / query-stripped cases (`revalidatePath("/t-3d-cube/ppr/?foo=bar#hash")`, `revalidatePath("../promo2")` from `/t-3d-cube/group-collision/promo` via `x-dinou-current-path` and `referer`).

### What to Verify
1. **Sibling Route Groups (`revalidatePath("/t-3d-cube/group-collision/promo")`):**
   - Refreshes `(alpha)/promo` page AND `(alpha)` layout (if targeting the segment or verify exact contract for leaf vs group layout) while leaving `(beta)` layout, `(beta)/settings` page, and outer shared layout 100% frozen (poisoned!).
2. **Optional Catch-All `[[...slug]]` (`revalidatePath("/t-3d-cube/catchall-isg")` vs `"/t-3d-cube/catchall-isg/docs/v2"`):**
   - 0-segment `revalidatePath("/t-3d-cube/catchall-isg")` refreshes BOTH `[[...slug]]` 0-seg layout AND 0-seg page without touching `/docs` or `/docs/v2`!
   - 2-segment `revalidatePath("/t-3d-cube/catchall-isg/docs/v2")` refreshes BOTH its layout and page without touching 0-seg or `/docs`.
3. **Asymmetric Chain (`L1(S) → L2(D) → L3(S) → Page(PPR)`):**
   - `revalidatePath` on the leaf refreshes `L3` (if co-located) and `Page` PPR shell while keeping `L1` frozen, never attempting to cache Dynamic `L2`, and preserving PPR dynamic holes.
4. **Relative Path Resolution & Input Normalization:**
   - `revalidatePath("./promo2")` and `revalidatePath("../promo2")` resolve accurately against `x-dinou-current-path` / `referer` inside Server Functions and request contexts.
   - Calling `revalidatePath(path, { legacy: true })` emits the deprecation warning once and still revalidates cleanly.
   - Back-to-back same-millisecond `revalidatePath` calls advance `generatedAt` monotonically (`nextMonotonicGenTime`) so client `____build_id____` checks never miss the latest snapshot.

### Potential Dinou Core Risk Areas
- `dinou/core/cache-revalidate.js:950–989` — `revalidatePath()` layout lookup misses `[[...slug]]` 0-seg layouts and `(group)`-scoped `cleanLayoutKey` layouts!
- `dinou/core/cache-revalidate.js:1023–1037` — `stripEmptyOptional` inside `revalidateLayout()` only strips `[[...]]` but does not disambiguate `(alpha)` vs `(beta)` when invoked from a leaf URL unless resolved via `getActiveLayoutChain`.

---

## Stage 2 — Check `#80`: `revalidateTag()` Complete Matrix

### Why This Matters
`revalidateTag(tag)` is Dinou's most complex cross-cutting invalidator (`dinou/core/cache-revalidate.js:1580–1835`), fanning out across slots, layouts, and pages simultaneously. Direct audit reveals **multiple subtle, untested risk areas**:
1. **Cloudflare Workers Concurrent Layout Race (`dinou/core/cache-revalidate.js:90, 1736–1741`):**
   - `enqueueRevalidation` intentionally bypasses the global serial queue on Cloudflare Workers (`isCloudflareWorkersRuntime()`), yet line `1739` runs `await Promise.all(sortedTargetLayouts.map(...))`!
   - On Node, `enqueueRevalidation` accidentally serializes `L1` before `L2` despite `Promise.all`; **on Cloudflare Workers, `L1` and `L2` execute concurrently in parallel**, breaking the ancestor-first guarantee!
2. **Shared Multi-Slot Tag Across All 4 Placements:**
   - A single tag (e.g., `"global-pricing"`) shared simultaneously by: (a) a slot in `L1` static PPR shell, (b) a slot in Dynamic `L2`, (c) a slot in `Page` static PPR shell, AND (d) a slot inside a `Page` PPR dynamic hole — plus a separate layout/page tagged with the same tag!
3. **Raw Slot ID vs Declared Tag (`revalidateTag("my-slot-id")` vs `revalidateTag("my-tag")`):**
   - Must behave identically across static shells, dynamic hosts, and PPR holes without re-executing poisoned static host shells (`onlyRefreshSlots: true`).
4. **Error Rollback via `slotBackups` (`lines 1715–1758`):**
   - When a slot's render throws during `revalidateTag`, Dinou snapshots `slotBackups` and restores last-known-good `slot.json` — this rollback path has **never** been tested across 3D PPR shells, nested slots (`Outer → Inner`), or multi-slot tags where Slot A succeeds and Slot B throws!

### Proposed Fixtures (`src/t-3d-cube/reval-tag-matrix/`)
- Asymmetric 3D PPR route (`L1 Static PPR` → `L2 Dynamic` → `L3 Static PPR` → `Page Static PPR`) featuring:
  - 4 `<DinouCacheSlot>`s across all 4 placements (`L1` shell, `L2` dynamic host, `L3` shell, `Page` shell, and `Page` PPR hole) sharing `"shared-matrix-tag"` alongside unique per-slot tags.
  - A nested slot pair (`Outer` tagged `"outer-tag"`, `Inner` tagged `"inner-tag"`) inside `L1` and `Page`.
  - A toggleable fault flag `cubeState.revalTagSlotThrow` for testing partial-failure `slotBackups` restoration.
  - Cross-route reuse of `(alpha)`/`(beta)` and `[[...slug]]` parameterized `getCacheTags(params)` tags.

### What to Verify
1. **Shared Multi-Slot Tag Fan-Out (`revalidateTag("shared-matrix-tag")`):**
   - All 5 slots across `L1` shell, Dynamic `L2`, `L3` shell, `Page` shell, and `Page` PPR hole refresh atomically while **every** poisoned static host shell (`L1`, `L3`, `Page`) stays 100% frozen (`onlyRefreshSlots: true`, `ownGeneratedAt` unchanged)!
2. **Raw Slot ID (`revalidateTag("cube-tm-l1-slot")`) vs Declared Tag (`revalidateTag("tm-l1-only")`):**
   - Surgical single-slot invalidation leaves all sibling slots and all host shells frozen.
3. **Combined Layout + Page + Slot Tag (`revalidateTag("cascade-all")`):**
   - Revalidates strictly ancestor-first (`L1` → `L3` → `Page`), even when simulated under **Cloudflare Workers mode** (`isCloudflareWorkersRuntime() === true`, i.e., `Promise.all` replaced with sequential `for ... of` over `sortedTargetLayouts`!).
4. **Parameterized `getCacheTags(params)` on `(alpha)` / `(beta)` / `[[...slug]]` / `[id]`:**
   - Tagging `alpha-only` or `slug-docs-v2` invalidates only the exact matching route group or catch-all instance.
5. **Partial-Failure Rollback (`slotBackups`):**
   - Mutate both Slot A and Slot B (sharing `"partial-fail-tag"`), force Slot B to throw during `revalidateTag("partial-fail-tag")` -> Slot A commits its fresh value, Slot B restores its last-known-good cached `slot.json` (never wiped to missing/broken!), and clearing the fault + re-running `revalidateTag` updates Slot B cleanly.

### Potential Dinou Core Risk Areas
- `dinou/core/cache-revalidate.js:1735–1741` — `Promise.all(sortedTargetLayouts.map(...))` breaks ancestor-first ordering on Cloudflare Workers where `enqueueRevalidation` does not serialize!
- `dinou/core/cache-revalidate.js:1630–1705` — verify `targetLayoutPaths` preserves `(group)` and `[[...slug]]` layout keys when scanning `layout.metadata.json` keys from storage.
- `dinou/core/cache-revalidate.js:1748–1758` — verify `failedSlotSet` / `slotBackups` restoration also cleans up any partially updated host `shell.page.json` / `shell.layout.own.json` or keeps last-known-good content consistent.

---

## Stage 3 — Check `#81`: `revalidateLayout()` & `revalidatePage()` Surgical Contracts, No-Op Guards & Causal `_old` Hydration Snapshots Under Stampede

### Why This Matters
Developers call `revalidateLayout(path)` and `revalidatePage(path)` directly for surgical invalidation. Several edge contracts remain untested:
1. **Surgical Targeting Edge Cases:**
   - `revalidateLayout("/")` (root layout) cascading `recomposeOnly` into nested 3D PPR pages without re-executing poisoned child layouts or pages.
   - `revalidateLayout` targeting `(alpha)` vs `(beta)` vs `[[...slug]]` (0-seg vs 2-seg) vs static `L3` underneath Dynamic `L2` (`hasDynamicAncestor`).
   - Calling `revalidateLayout` on a **Dynamic** (`revalidate = 0`) layout (must safely return `false` and never write stale layout cache).
   - Calling `revalidateLayout` or `revalidatePage` on a **non-existent** route or invalid param (must no-op safely without creating phantom keys in `.dinou/dist2` / KV).
2. **Causal `_old` Hydration Snapshots Under Concurrent Stampede (`____build_id____`):**
   - Suppose Browser A receives SSR HTML at `buildId = T1` (version V1), and **before** Browser A fetches its initial hydration `/____rsc_layout____?____build_id____=T1` and `/____rsc_page____?____build_id____=T1`, a concurrent stampede fires `revalidateLayout` + `revalidatePage` + `revalidateTag` advancing the server to `T2` (V2).
   - Browser A MUST hydrate cleanly using the causal `_old` snapshots (`layout._old.rsc`, `page._old.rsc`, `shell.layout._old.json`, `shell.page._old.json`) with **zero React `#418` hydration mismatch**, while Browser B (arriving at `T2`) receives V2 immediately!

### Proposed Tests (`tests/unit/cache-3d-cube.test.mjs` + Playwright browser test in `e2e/example.spec.ts`)
1. **Unit / Compiled Node AOT Matrix:**
   - Direct `revalidateLayout("/")`, `revalidateLayout("/t-3d-cube/group-collision/(alpha)")`, `revalidateLayout("/t-3d-cube/catchall-isg")`, `revalidateLayout("/t-3d-cube/catchall-isg/docs/v2")`, `revalidateLayout("/t-3d-cube/asym/l2")` (Dynamic `L2` → returns `false`), `revalidateLayout("/t-3d-cube/asym/l2/l3")` (Static `L3` under Dynamic `L2` → refreshes `L3` while `L1` and `Page` stay frozen), and `revalidateLayout("/does-not-exist")` / `revalidatePage("/does-not-exist")` (strict no-op).
   - Concurrent stampede: `Promise.all([revalidateLayout(p), revalidateLayout(p), revalidatePage(p), revalidateTag(slotTag)])` — verify deduplication (`inflightLayoutRevalidations` / `inflightPageRevalidations`), strictly monotonic `generatedAt`, and zero corrupted/torn JSON on disk or KV.
2. **Live Browser Causal `_old` Hydration Test (Chromium/Firefox/WebKit):**
   - Intercept/delay `/____rsc_page____` and `/____rsc_layout____` during initial page load (`buildId = T1`), trigger `revalidateLayout` + `revalidatePage` on the server while the RSC fetch is paused (advancing server to `T2`), then release the paused browser fetch -> assert **zero `#418` hydration error**, exact V1 hydration for Tab A, and V2 on subsequent fresh Tab B load!

### Potential Dinou Core Risk Areas
- `dinou/core/cache-revalidate.js:750–805, 1340–1395` — verify `_old` snapshot preservation (`shell.page._old.json`, `shell.layout._old.json`, `page._old.rsc`, `layout._old.rsc`) is NOT overwritten if two rapid revalidations fire back-to-back or if `onlyRefreshSlots` runs right after full revalidation.
- `dinou/core/cache-revalidate.js:1030–1107` — verify `revalidateLayout("/nonexistent")` exits cleanly without writing an empty `layout.metadata.json` into storage.

---

## Stage 4 — Check `#82`: `refreshSlot(idOrTag, { fresh: false | true })` & `refreshSlot("*")` Complete Matrix

### Why This Matters
`refreshSlot` (backed by `/____rsc_slot____` and `getSlotJSX` in `dinou/core/cache-slot.js`) is the live Axis Y primitive, yet **four real code-level edge cases** were uncovered during our audit of `dinou/core/cache-slot.js`:
1. **Early Stampede / 500ms `recentFreshSlotRenders` Bypass Before `isNoCache` (`dinou/core/cache-slot.js:1137–1152`):**
   - Phase 4 Stage 4 fixed lines `1346–1359` so `revalidate = 0` (`isNoCache`) slots don't share `inflightSlotRenders` / `recentFreshSlotRenders`, **but lines `1137–1152` run BEFORE `slotRegistry` / `isNoCache` is even checked!**
   - Furthermore, two rapid `<500ms` sequential server-side `getSlotJSX(id, { fresh: true })` calls (without distinct `?t=...` query params) hit `recentFreshSlotRenders` at line `1144` and return **stale V2 even after mutating state to V3**!
2. **Explicit `{ fresh: false }` vs `{ fresh: true }` Contract:**
   - `{ fresh: false }` on a valid cached slot MUST return cached V1 (even if backing data mutated to V2!), MUST NOT re-execute the slot component, and MUST only re-render if the slot's TTL (`revalidate = 1`) has expired or its tag was invalidated via `revalidateTag`!
   - `{ fresh: true }` MUST always force fresh execution, persist the new `slot.json` (for cacheable slots), and lazily update host artifacts on subsequent visits.
3. **Shared Tag Across Two Distinct `<DinouCacheSlot>`s (`refreshSlot("shared-tag", { fresh: true })`):**
   - On the client (`dinou/core/slot.js`), `refreshSlot("shared-tag", { fresh: true })` matches ALL mounted `<DinouCacheSlot>` instances carrying `"shared-tag"` (e.g., `slot-a` in `L1` AND `slot-b` in `Page`/hole) and triggers concurrent `/____rsc_slot____` fetches + host persistence.
   - Directly calling `getSlotJSX("shared-tag")` on the server calls `resolveCanonicalSlotId` which returns only the FIRST registered slot! Verify exact behavior and ensure client multi-slot refresh works cleanly without racing host `shell.*.json` persistence.
4. **`refreshSlot("*")` + Nested `Outer → Inner` Slots + Cross-Route Shared Slot (`Page A` → `Page B`):**
   - `refreshSlot("*")` (with `{ fresh: false }` and `{ fresh: true }`) refreshes every mounted slot across `L1`, `L2`, `Page`, and PPR holes without touching poisoned static shells.
   - Refreshing `Outer` vs `Inner` in a nested `<DinouCacheSlot id="outer"><DinouCacheSlot id="inner" /></DinouCacheSlot>` preserves inner/outer isolation accurately.
   - Refreshing a shared slot (`id="cross-route-cart"`) on `Page A` causes `Page B` (which also embeds `"cross-route-cart"`) to serve the updated value on its very next load via `inspectSlotsFreshness().hasNewer` while `Page B`'s own poisoned static shell stays frozen!

### Proposed Fixtures (`src/t-3d-cube/refresh-slot-matrix/`)
- `layout.tsx` (`ppr = true`, `revalidate = 3600`, hosts `cube-rsm-shared-cart` + `cube-rsm-l1-shared-tag` + `cube-rsm-ttl1` (`revalidate={1}`))
- `page-a/page.tsx` (`ppr = true`, `revalidate = 3600`, hosts `cube-rsm-page-shared-tag` (same tag `"rsm-shared"` as L1 slot!), nested `cube-rsm-outer` → `cube-rsm-inner`, and `cube-rsm-nocache` (`revalidate={0}`) inside a PPR hole, plus client buttons for `{ fresh: false }`, `{ fresh: true }`, shared-tag refresh, and `refreshSlot("*")`)
- `page-b/page.tsx` (`ppr = true`, `revalidate = 3600`, also embeds `cube-rsm-shared-cart` with its own poisoned static shell)

### What to Verify
1. `{ fresh: false }` returns frozen cached V1 when mutated (cache hit), BUT fetches V2 immediately after either `revalidateTag` OR `revalidate={1}` TTL expiration!
2. `{ fresh: true }` immediately returns V2, AND a second rapid `<500ms` mutation to V3 + `{ fresh: true }` returns V3 (zero stale `recentFreshSlotRenders` leak!).
3. Concurrent `revalidate={0}` slot refreshes under two distinct request contexts (`tenant-A` vs `tenant-B`) never coalesce at `cache-slot.js:1137`!
4. `refreshSlot("rsm-shared", { fresh: true })` updates BOTH `cube-rsm-l1-shared-tag` and `cube-rsm-page-shared-tag` simultaneously with zero host persistence race and zero `#418`.
5. `refreshSlot("cube-rsm-inner", { fresh: true })` updates ONLY `Inner` while `Outer` stays frozen; `refreshSlot("cube-rsm-outer", { fresh: true })` updates `Outer` cleanly without breaking `Inner`.
6. `refreshSlot("*")` refreshes all mounted slots across `L1` + `Page` + PPR hole while all poisoned shells stay frozen.
7. Refreshing `cube-rsm-shared-cart` on `Page A` causes `Page B` (direct SSR & soft-nav) to show the fresh cart while `Page B`'s poisoned static shell stays untouched!

### Potential Dinou Core Risk Areas
- `dinou/core/cache-slot.js:1137–1152` — early `inflightSlotRenders` / `recentFreshSlotRenders` checks execute **before** `isNoCache` check and cache non-query-busted `{ fresh: true }` calls for 500ms!
- `dinou/core/cache-slot.js:1072–1121` — `resolveCanonicalSlotId` behavior when multiple slots share a tag.
- `dinou/core/slot.js` — `refreshSlot("*")` and multi-slot tag matching when nested slots re-render concurrently.

---

## Stage 5 — Check `#83`: Clock-Based TTL (`revalidate = N`) Exhaustive Matrix

### Why This Matters
Time-based ISR (`revalidate = N`) is the most subtle axis to combine with 3D segmentation because every layer (`L1`, `L2`, `L3`, `Page`, and every `<DinouCacheSlot>`) owns an **independent clock** (`ownGeneratedAt`, `pageGeneratedAt`, `slot.metadata.json.generatedAt`). Four major TTL scenarios have not been tested yet:
1. **Multi-Level Simultaneous Cascade (`L1(1s) → L2(1s) → L3(3600s) → Page(3600s)`):**
   - After 1.2s, BOTH `L1` and `L2` expire simultaneously on the exact same incoming request.
   - `L1` must regenerate first, then `L2` must regenerate with fresh `L1`, and `L3` + `Page` MUST remain 100% frozen (poisoned!) via `recomposeOnly`, preserving `L3.ownGeneratedAt` and `Page.pageGeneratedAt`!
2. **All-3-Axes Simultaneous 1s Slot Expiration Under Asymmetric PPR:**
   - `L1(3600s) + Slot(1s) → L2(Dynamic 0) → L3(3600s) + Slot(1s) → Page PPR(3600s) + ShellSlot(1s) + HoleSlot(1s)`
   - After 1.2s, all 4 slots expire simultaneously while `L1`, `L3`, and `Page` static shells stay 100% frozen!
3. **Per-Param Dynamic `revalidate(params)` Function & `export default { revalidate, getCacheTags }` Object Export:**
   - `export async function revalidate(params)` returning `1` for `id === "fast"`, `3600` for `id === "slow"`, and `0` (dynamic) for `id === "live"` — on BOTH `layout_functions.ts` and `page_functions.ts` (including the default-export object syntax!).
4. **Mid-ISR Dynamic Bailout (`revalidate = 1` → Starts Reading Cookies/Headers on Regeneration):**
   - A static `revalidate = 1` page initially builds and caches as Static PPR. After 1.2s, a feature flag causes the component to call `getContext().req.headers` / `cookies()` during background ISR regeneration -> Dinou must detect the dynamic bailout (`markRouteDynamicInMap(..., true)`), switch the route cleanly to dynamic SSR without serving corrupted or partial cache, and work cleanly across subsequent requests!

### Proposed Fixtures (`src/t-3d-cube/ttl-matrix/`)
- `cascade/` (`L1(1s) → L2(1s) → L3(3600s) → Page(3600s)`)
- `all-axes-slots/` (`L1(3600s)+Slot(1s) → L2(0) → L3(3600s)+Slot(1s) → Page PPR(3600s)+ShellSlot(1s)+HoleSlot(1s)`)
- `dynamic-fn/[id]/` (`layout_functions.ts` & `page_functions.ts` exporting dynamic `async function revalidate(params)` + `export default` object form on sibling route)
- `mid-isr-bailout/` (`revalidate = 1` static page that conditionally calls `getContext().req.headers` when `cubeState.ttlTriggerBailout === true`)

### What to Verify
1. **Multi-Level Simultaneous Cascade:**
   - First request after 1.2s serves stale-while-revalidate (or fresh if awaited), triggers `L1` + `L2` regeneration strictly ancestor-first, and subsequent request shows fresh `L1` + fresh `L2` while poisoned `L3` and `Page` stayed 100% frozen!
2. **All-3-Axes Simultaneous 1s Slots:**
   - All 4 `1s` slots regenerate cleanly after 1.2s while `L1`, `L3`, and `Page` static shells remain frozen and Dynamic `L2` + PPR hole stay live on every request.
3. **Per-Param Dynamic `revalidate(params)`:**
   - `/dynamic-fn/fast` expires after 1.2s and refreshes; `/dynamic-fn/slow` stays frozen (poisoned!) after 1.2s; `/dynamic-fn/live` executes dynamically on every request without caching.
4. **Mid-ISR Dynamic Bailout:**
   - Before flip: cached static HTML/RSC serves frozen V1.
   - Flip `ttlTriggerBailout = true`, wait 1.2s, trigger ISR -> bailout detected cleanly (`markRouteDynamicInMap`), subsequent requests render live per-request header values instead of stale V1 or 500 errors!

### Potential Dinou Core Risk Areas
- `dinou/core/handler.js` & `dinou/core/cache-revalidate.js` — when BOTH `L1` and `L2` are expired on the same request, verify background SWR schedules `L1` BEFORE `L2` (not racing concurrently and recomposing `L2` with stale `L1`!).
- `dinou/core/cache-revalidate.js:765–780, 1159–1168` — mid-ISR `revalDynamicState.value === true` cleanup (must purge stale `index.html`/`shell.html`/`page.rsc` so future requests don't keep serving the pre-bailout static file!).
- `dinou/core/page-functions.js` & `dinou/core/layout-functions.js` — `revalidate(params)` async function returning `0` vs `false` vs `1` vs `3600` in both named and `export default` forms.

---

## Stage 6 — Check `#84`: Revalidation Trigger Surfaces × Cross-Runtime / Multi-Isolate Consistency

### Why This Matters
Even if `revalidateTag` / `revalidatePath` / `revalidateLayout` / `revalidatePage` / `refreshSlot` work when invoked directly inside a Node test harness, production applications trigger them from **four completely different execution surfaces** and across **distributed multi-pod / edge storage backends**:
1. **Surface A — `"use server"` Server Functions** (invoked from `<form action>`, `useActionState`, or direct RPC inside a `<DinouCacheSlot>` or PPR hole — including calling `revalidateTag` + `revalidateLayout` + `revalidatePage` + `revalidatePath` inside a single Server Function!).
2. **Surface B — Custom Plugin / API Webhook Handler (`onRequest` in `dinou.config.mjs` or Express/Hono route outside React render):**
   - E.g. Stripe/CMS webhook calling `POST /api/webhook/revalidate` -> invokes `revalidateTag` / `revalidatePath` / `revalidateLayout` / `revalidatePage` where NO React render or RSC AsyncLocalStorage is active!
3. **Surface C — Standalone Out-of-Band Background Worker / Cron Script:**
   - External script importing `dinou/revalidation` (`revalidateTag`, `revalidatePath`, `revalidateLayout`, `revalidatePage`) in a fresh process with shared `RedisStorage` / filesystem `.dinou/dist2`.
4. **Surface D — Distributed Multi-Pod & Edge Runtimes (`RedisStorage` Pod A → Pod B, `DenoKVStorage` Isolate A → Isolate B, `CloudflareKVStorage` + `ctx.waitUntil` SWR):**
   - Pod A runs `revalidatePath` / `revalidateTag` / `revalidateLayout` / `revalidatePage` / `refreshSlot({ fresh: true })` (including clock-based SWR scheduled inside `ctx.waitUntil` on Cloudflare Workers!).
   - Cold Pod B / Isolate B (which still has stale `.dinou/dist2` bundled on disk!) immediately serves fresh revalidated layouts, pages, and slots across all 3 axes without ever resurrecting stale `.dinou/dist2`!

### Proposed Tests (`tests/unit/cache-3d-reval-surfaces.test.mjs` + live Playwright E2E for Surface A/B)
1. **Surface A (Browser E2E + Compiled Node AOT):**
   - Server Function hosted inside a `<DinouCacheSlot>` / PPR hole executes: (1) `revalidateTag` → live UI update + F5 persistence, (2) `revalidatePath` + `router.refresh()`, (3) `revalidateLayout` + `router.refresh({ layout: true })`, (4) `revalidatePage` + `router.refresh()`, and (5) `revalidateTag` + `redirect()` — all with poisoned untouched layers staying frozen and zero `#418`.
2. **Surface B (Plugin / API Webhook):**
   - Register `/api/cube-webhook` in `dinou.config.mjs` `onRequest` (outside React render), POST JSON payloads triggering each of `revalidateTag`, `revalidatePath`, `revalidateLayout`, and `revalidatePage` -> verify exact storage updates and immediate browser/HTTP visibility.
3. **Surface C (Standalone Worker Process):**
   - Spawn an independent child Node process importing Dinou's revalidation API against the running server's storage -> verify invalidation propagates cleanly without corrupting active locks or manifests.
4. **Surface D (Distributed `RedisStorage` + `DenoKVStorage` + `CloudflareKVStorage` + `ctx.waitUntil`):**
   - Pod A executes all 5 primitives + clock-based TTL SWR inside a mocked `ctx.waitUntil` collector (`await Promise.all(waitUntilPromises)`).
   - Cold Pod B (with stale `.dinou/dist2` fallback present!) reads SSR HTML, `/____rsc_layout____`, `/____rsc_page____`, and `/____rsc_slot____`: 100% fresh on invalidated targets, 100% frozen on untouched layers, zero `.dinou/dist2` resurrection, zero Cloudflare cross-request `IoContext` leaks!

### Potential Dinou Core Risk Areas
- `dinou/core/cache-revalidate.js` — `ctx.waitUntil` registration when clock-based SWR triggers BOTH layout AND page (or slot) revalidation on Cloudflare Workers (`runInBackground` must attach EVERY async step to `ctx.waitUntil` so `workerd` doesn't terminate mid-revalidation!).
- `dinou/core/request-context.js` / `cache-revalidate.js` — calling `revalidatePath("./relative")` or `revalidateTag` from a Surface B webhook or Surface C standalone script where `getContext()` is `undefined` (must never throw `TypeError` on missing AsyncLocalStorage context!).
- `dinou/core/storage-adapter.js` — `CloudflareKVStorage`, `DenoKVStorage`, and `RedisStorage` parity for `markTagInvalidatedAsync` + `_old` snapshot keys + `shell.layout.own.json` updates across isolates.

---

## Recommended Execution Order

When ready to execute Phase 6 (one stage at a time, with `y-changelog-cube-phase6.md` maintained in parallel):
1. **Stage 1 (`#79` — `revalidatePath()` Matrix)** — highest immediate bug probability (`cache-revalidate.js:950–989` missing `(group)` & `[[...slug]]` layouts).
2. **Stage 2 (`#80` — `revalidateTag()` Matrix)** — closes the Cloudflare Workers `Promise.all` ancestor-ordering race (`cache-revalidate.js:1739`), shared multi-slot tags, and `slotBackups` error rollback.
3. **Stage 3 (`#81` — `revalidateLayout()` & `revalidatePage()` + Causal `_old` Snapshots)** — hardens surgical contracts, no-op guards, and zero-`#418` hydration under concurrent stampedes.
4. **Stage 4 (`#82` — `refreshSlot({ fresh: false | true })` & `refreshSlot("*")`)** — fixes the `cache-slot.js:1137–1152` early `recentFreshSlotRenders`/`inflightSlotRenders` bug and hardens shared-tag / nested / cross-route slot refreshes.
5. **Stage 5 (`#83` — Clock-Based TTL `revalidate` Matrix)** — validates simultaneous multi-level & all-3-axes 1s cascades, per-param `revalidate(params)` functions, and mid-ISR dynamic bailout.
6. **Stage 6 (`#84` — All Trigger Surfaces × Distributed Runtimes)** — proves every revalidation primitive holds end-to-end from Server Functions, webhooks, standalone workers, and multi-pod/edge KV with `ctx.waitUntil`.
