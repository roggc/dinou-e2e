# Dinou 3D Caching Cube — Phase 2 Completion & Exhaustive Edge-Case Plan

This document serves as the master specification and tracking checklist for completing **100% edge-case coverage** of Dinou's **3D Caching Engine** (`Axis X: Horizontal Segmentation` × `Axis Y: Vertical Segmentation / <DinouCacheSlot>` × `Axis Z: Partial Prerendering / PPR`).

Phase 1 (Checks `#37–#46`, strict `#22`, Section 6.4 regressions, and the 2 core bugs discovered & fixed in `dinou/core/cache-slot.js`, `ppr-context.js`, `render-jsx-to-client-jsx.js`, `get-jsx.js`, and `layout-composition.js`) is already implemented and passing in `dinou-e2e` (**305/305 Chromium tests green, 9/9 unit/AOT integration tests green**).

Phase 2 is organized into **5 incremental stages**, to be implemented and verified **one stage at a time** (fixing any core bugs uncovered in `dinou/` along the way):

- **Stage 1:** Axis X — Pure Horizontal Segmentation (Deep Asymmetry, Alternation, Implicit Bailout & Per-Level Layout TTL)
- **Stage 2:** Axis Y — Pure Vertical Segmentation (`<DinouCacheSlot>` 3-Level Nesting, Shared Cross-Route Slots & Error Resilience)
- **Stage 3:** Axis Z — Pure Partial Prerendering (Concurrent 1s PPR Shell TTL Stampede, Error & `redirect()` Isolation Inside Dynamic Holes)
- **Stage 4:** Pairwise Combinations (`X + Y`, `X + Z`, `Y + Z` Asymmetric & Deep Edge Cases)
- **Stage 5:** Triple Synergy (`X + Y + Z` Deep Asymmetric Chain & Multi-Layer Shared Tag Ordering)

---

## Global Testing Rules (Apply to All Stages)

1. **Poisoning Methodology:** Before every isolation assertion, mutate every segment/slot/shell that **must NOT re-execute** to a distinct poison value (`base + 899`) while mutating only the target segment(s) to distinct expected values. Any accidental re-execution immediately exposes the poison value in the DOM or wire payload.
2. **Idempotence Across Re-Runs & Multi-Browser Runs:** Never hardcode `"100"` as the only valid baseline on re-runs; read the live baseline from the DOM and derive strictly distinct target/poison values (`base + 5xx`, `base + 899`), or cleanly restore baselines so repeated runs and sequential `chromium → firefox → webkit` executions stay 100% deterministic without rebuilding.
3. **Strict Hydration & Router Guards:** Every Playwright test MUST assert:
   - Zero React hydration errors/warnings (`/hydrat|didn't match|418|419|422|423|425/i` on both `console` and `pageerror`).
   - Zero `"navigate called outside Router"` warnings (`RouterContext` singleton invariant).
   - Zero uncaught `pageerror` exceptions (except when explicitly testing error boundary isolation).
4. **Unejected & Cross-Runtime Compatibility:**
   - All state helpers must remain cross-runtime (Node/Bun/Deno/Cloudflare Workers via `src/t-3d-cube/shared/cube-state.ts`).
   - All unit/integration tests must dynamically resolve `DINOU_ROOT` (`./dinou` → `node_modules/dinou/dinou` → `node_modules/dinou`).
   - All new static/ISR/TTL assertions in `e2e/example.spec.ts` must respect `isProd` vs `isDev` (`test.skip(!isProd, ...)` where caching is disabled in dev).
5. **Verification Gate Per Stage:** After each stage:
   - Unit/integration tests pass (`node --test tests/unit/cache-3d-cube.test.mjs`).
   - Contextual typecheck passes (`node tests/type-safe-contextual.test.mjs`).
   - Production build succeeds cleanly (`npm run build:node:esbuild`).
   - New stage Playwright tests pass on Chromium (`$env:TEST_CMD="npm run start:node:esbuild"; npx playwright test -g "..." --project=chromium --workers=1`).
   - Any core bug discovered in `dinou/` is fixed, covered by a unit regression test, and verified with zero regressions.

---

## Master Progress Checklist

- [ ] **Stage 1 — Axis X (HS):** Checks `#47`, `#48`, `#49`, `#50`
- [ ] **Stage 2 — Axis Y (VS / `<DinouCacheSlot>`):** Checks `#51`, `#52`, `#53`
- [ ] **Stage 3 — Axis Z (PPR):** Checks `#54`, `#55`
- [ ] **Stage 4 — Pairwise (`X+Y`, `X+Z`, `Y+Z`):** Checks `#56`, `#57`, `#58`, `#59`
- [ ] **Stage 5 — Triple Synergy (`X+Y+Z`):** Checks `#60`, `#61`
- [ ] **Final Full Regression Sweep:** Full Chromium suite (`npm run start:node:esbuild`) + all standalone `test:*` suites green

---

## Stage 1 — Axis X: Horizontal Segmentation (HS) Deep Edge Cases

### Why These Cases Matter
Currently, Phase 1 covers `L1→L2→L3` all-static cascades (`recomposeOnly`), `reset_layout`/`no_layout`, `@sidebar`, and 2-level `L1(S) → L2(D, revalidate=0) → Page(S)`. The following real production topologies and core code paths in `dinou/core/handler.js`, `layout-composition.js`, and `cache-revalidate.js` are not yet battle-tested end-to-end.

### Check `#47` — Multi-Level Alternating Static/Dynamic Layout Chains (`S → D → S → S` and `S → D → S → D`)
- **Proposed Fixtures:**
  - `src/t-3d-cube/hs-alt/layout.tsx` + `layout_functions.ts` (`L1`: static `revalidate = 3600`, `tags = ["cube-hsalt-l1"]`)
  - `src/t-3d-cube/hs-alt/dyn-l2/layout.tsx` + `layout_functions.ts` (`L2`: dynamic `revalidate = 0`)
  - `src/t-3d-cube/hs-alt/dyn-l2/static-l3/layout.tsx` + `layout_functions.ts` (`L3`: static `revalidate = 3600`, `tags = ["cube-hsalt-l3"]`)
  - `src/t-3d-cube/hs-alt/dyn-l2/static-l3/page.tsx` + `page_functions.ts` (`Page S`: static `revalidate = 3600`) → Chain **`S → D → S → S`**
  - `src/t-3d-cube/hs-alt/dyn-l2/static-l3/dyn-page/page.tsx` + `page_functions.ts` (`Page D`: dynamic `revalidate = 0`) → Chain **`S → D → S → D`**
- **What to Verify:**
  1. **Direct SSR on `S → D → S → S`:** Poison `L1`, `L3`, `Page S`; mutate `L2`. Hard reload → **only `L2` updates**; `L1`, **`L3` (underneath dynamic `L2`!)**, and `Page S` MUST all remain frozen from their cached fragments (`shell.layout.own.json` & `shell.page.json`).
  2. **Surgical `revalidateLayout(L3)` under dynamic `L2`:** Poison `L1` and `Page S`; mutate `L2` and `L3`; call `revalidateLayout("/t-3d-cube/hs-alt/dyn-l2/static-l3")`. Reload → `L3` updates, `L2` executes live, **`L1` and `Page S` stay frozen**.
  3. **Surgical `revalidateLayout(L1)` above dynamic `L2`:** Poison `L3` and `Page S`; mutate `L1` and `L2`; call `revalidateLayout("/t-3d-cube/hs-alt")`. Reload → `L1` updates, `L2` executes live, **`L3` and `Page S` stay frozen** (and `L2` never creates cached `layout.rsc` / `shell.layout.own.json`).
  4. **Direct SSR on `S → D → S → D`:** Poison `L1` and `L3`; mutate `L2` and `Page D`. Hard reload → `L2` and `Page D` both execute fresh, while **both `L1` AND `L3` stay frozen**!
  5. **Soft `<Link>` navigation `S → D → S → S` ↔ `S → D → S → D`:** Verify `L1` and `L3` client `mountId` & counters survive transitions cleanly (or verify expected layout remount boundary semantics), zero `#418` and zero router warnings.
  6. **Direct `/____rsc_layout____` wire check** for `/t-3d-cube/hs-alt/dyn-l2/static-l3`: returns live `L2` composed between cached `L1` and cached `L3`.
- **Potential Dinou Core Risk Area:**
  - Verify `generate-static.js` Pass 1 actually pre-renders `L3/shell.layout.own.json` even though its ancestor `L2` is `revalidate = 0`!
  - Verify `handler.js:3964` (`composeLayoutChainFromOwnFragments`) composes `L1 (cached own) → L2 (live override) → L3 (cached own)` cleanly on BOTH `Page S` and `Page D`!

### Check `#48` — Static Layout Chain + Dynamic Page (`S → S → D`) with Poisoning & Soft-Nav Transitions
- **Proposed Fixtures:**
  - `src/t-3d-cube/hs-static-dyn-page/layout.tsx` + `layout_functions.ts` (`L1`: static `revalidate = 3600`, client probe + `<Link>`s)
  - `src/t-3d-cube/hs-static-dyn-page/l2/layout.tsx` + `layout_functions.ts` (`L2`: static `revalidate = 3600`, client probe)
  - `src/t-3d-cube/hs-static-dyn-page/l2/page.tsx` + `page_functions.ts` (`Page S`: static `revalidate = 3600`)
  - `src/t-3d-cube/hs-static-dyn-page/l2/dyn-explicit/page.tsx` + `page_functions.ts` (`Page D1`: `revalidate = 0`)
  - `src/t-3d-cube/hs-static-dyn-page/l2/dyn-bailout/page.tsx` (`Page D2`: no `revalidate = 0`, reads `getContext().req.cookies` / `headers` directly for implicit bailout)
- **What to Verify:**
  1. On both `dyn-explicit` and `dyn-bailout`, poison `L1` and `L2` (`999`), mutate dynamic page counters across 2 consecutive hard reloads → `Page D1`/`Page D2` increment live on every request while **`L1` AND `L2` stay strictly frozen** (never re-executed!).
  2. Soft `<Link>` navigation `Page S → Page D1 → Page D2 → Page S` preserves both `L1` and `L2` `mountId` + client counts, fetches live dynamic page RSC payloads without re-executing `L1`/`L2`, and emits zero `#418` errors.
  3. `revalidateLayout(L2)` updates ONLY `L2` while `L1` stays frozen and `Page D1`/`D2` remain live.
  4. Verify `dyn-explicit` and `dyn-bailout` never write stale `index.html`/`page.rsc` into `.dinou/dist2`.
- **Potential Dinou Core Risk Area:**
  - Check whether `handler.js` reuses cached `L1`+`L2` (`shell.layout.json` / `composeLayoutChainFromOwnFragments`) on direct SSR of a dynamic page (`revalidate = 0` or implicit bailout) instead of falling back to full `getJSX` that re-executes `L1` and `L2`! *(High chance of discovering an optimization or subtle re-execution leak!)*

### Check `#49` — Implicit Dynamic Bailout Layout (Cookie/Header Read without `revalidate = 0`) + Static Page
- **Proposed Fixtures:**
  - `src/t-3d-cube/hs-implicit-dyn/layout.tsx` + `layout_functions.ts` (`L1`: static `revalidate = 3600`)
  - `src/t-3d-cube/hs-implicit-dyn/cookie-l2/layout.tsx` (`L2`: no `revalidate = 0`, reads `getContext().req.cookies.hs_imp_user` + `hsImplicitL2Seq`)
  - `src/t-3d-cube/hs-implicit-dyn/cookie-l2/page.tsx` + `page_functions.ts` (`Page S`: static `revalidate = 3600`)
- **What to Verify:**
  1. During SSG build, `cookie-l2` detects implicit dynamic access and marks `dynamic: true` (does NOT freeze a stale build-time cookie value into `layout.rsc`).
  2. At runtime with cookie `hs_imp_user=nova` then `hs_imp_user=orion` (with `L1` and `Page S` poisoned `999`), hard reloads render live `nova`/`orion` + fresh `L2` counter while **`L1` and `Page S` stay frozen**!
  3. Calling `revalidatePage("/t-3d-cube/hs-implicit-dyn/cookie-l2")` updates `Page S` without caching `L2` or re-executing `L1`.
- **Potential Dinou Core Risk Area:**
  - Verify `handler.js` checks `lMeta?.dynamic` (not only `lCfg.isDynamic` from `revalidate = 0`!) when deciding whether to use asymmetric dynamic-layout composition on `GET` requests!

### Check `#50` — Asymmetric Per-Level Layout ISR TTLs (`L1: 1s → L2: 3600s → Page: 3600s` & `L1: 3600s → L2: 1s → Page: 3600s`)
- **Proposed Fixtures:**
  - Branch A (`src/t-3d-cube/hs-ttl/fast-l1/`): `L1 (revalidate = 1) → L2 (revalidate = 3600) → Page (revalidate = 3600)`
  - Branch B (`src/t-3d-cube/hs-ttl/fast-l2/`): `L1 (revalidate = 3600) → L2 (revalidate = 1) → Page (revalidate = 3600)`
- **What to Verify:**
  1. **Branch A (Fast L1, Slow L2, Slow Page):** Warm baseline, poison `L2` and `Page` (`999`), bump `L1`, wait `1300ms`:
     - Reload #1 (SWR trigger): serves stale `L1` cleanly (0 `#418`) and triggers background L1 regeneration.
     - Reload #2 (after settle): **`L1` updates to fresh value**, while **`L2` AND `Page` stay frozen** (proving L1's TTL expiration cascades via `recomposeOnly` without re-executing L2 or Page, and without resetting `L2.ownGeneratedAt`).
  2. **Branch B (Slow L1, Fast L2, Slow Page):** Warm baseline, poison `L1` and `Page` (`999`), bump `L2`, wait `1300ms`:
     - Reload #1 (SWR trigger) → 0 `#418`.
     - Reload #2 → **`L2` updates to fresh value**, while **`L1` AND `Page` stay frozen**!
- **Potential Dinou Core Risk Area:**
  - Verify `handler.js` checks `ownGeneratedAt` + own `revalidate` per layout level in `activeChain` during HTML cache hits (not just page `revalidate` or merged `combinedRevalidate`)!

---

## Stage 2 — Axis Y: Vertical Segmentation (`<DinouCacheSlot>`) Deep Edge Cases

### Why These Cases Matter
Phase 1 validates 2-level bidirectional nested slots (`outer ↔ inner`), 1s TTL slots, `revalidate={0}`, wildcard `"*"`, cold-pod, and stampede. The following deeper Vertical Segmentation invariants remain untested.

### Check `#51` — 3-Level Nested `<DinouCacheSlot>` (`Outer → Middle → Inner`) Surgical Isolation & Mixed TTLs
- **Proposed Fixtures:**
  - `src/t-3d-cube/cs-deep/page.tsx` + `page_functions.ts` (`revalidate = 0` or `3600` host) containing:
    - `Outer (3600s)` → `Middle (3600s)` → `Inner (3600s)`
    - `OuterTtl (3600s)` → `MiddleTtl (3600s)` → `InnerFast (revalidate = 1)`
- **What to Verify:**
  1. **Middle-only `revalidateTag`:** Poison `Outer` and `Inner` (`999`); bump `Middle`; call `revalidateTag(middleTag)`. Reload → **`Middle` updates**, while **both `Outer` AND `Inner` stay frozen**!
  2. **Middle-only live `refreshSlot(middleId, { fresh: true })`:** Poison `Outer` and `Inner`; bump `Middle` + client counters in `Outer`, `Middle`, `Inner`. Live refresh → **`Middle` updates**, **`Inner` stays frozen** (proving our `fresh: false` fix works recursively at arbitrary nesting depth!), `Outer` stays frozen, client counters survive, F5 persists.
  3. **Deep 1s TTL inside 3600s→3600s parents:** Poison `OuterTtl` and `MiddleTtl`; bump `InnerFast`; wait `1300ms`; 2-reload SWR → **`InnerFast` updates**, while **`OuterTtl` AND `MiddleTtl` stay frozen** (0 `#418`).

### Check `#52` — Shared `<DinouCacheSlot>` (`id`) Across Multiple Routes & Layout+Page Reuse
- **Proposed Fixtures:**
  - `src/t-3d-cube/cs-shared/route-a/page.tsx` + `page_functions.ts` (`revalidate = 3600`) rendering `<DinouCacheSlot id="cube-shared-global-slot" tags={["cube-shared-global-tag"]} revalidate={3600}>`
  - `src/t-3d-cube/cs-shared/route-b/page.tsx` + `page_functions.ts` (`revalidate = 3600`) rendering the **same** `id="cube-shared-global-slot"`
- **What to Verify:**
  1. Visit `route-a` and `route-b`, capture baselines (both show initial shared slot value).
  2. On `route-a`, poison `route-a` host AND `route-b` host (`999`), bump shared slot value, call live `refreshSlot("cube-shared-global-slot", { fresh: true })` on `route-a` → `route-a` updates live.
  3. Hard-navigate to `route-b` → **`route-b` MUST reflect the refreshed shared slot value** (not stale build-time `100`!) while `route-b` host stays frozen (`999` never leaks), with 0 `#418`!
  4. Repeat via `revalidateTag("cube-shared-global-tag")` → BOTH `route-a` and `route-b` update the slot while keeping both hosts frozen.
- **Potential Dinou Core Risk Area:**
  - Verify `getSlotJSX` (`cache-slot.js:1342–1380`) or `handler.js` static-page slot splicing propagates slot updates when `route-a` triggers `refreshSlot` (which only calls `revalidatePage(route-a, { onlyRefreshSlots: true })`) and then `route-b` (whose `index.html` was built with the old slot value) is later requested! *(Very high chance of uncovering a real cross-route stale-HTML gap!)*

### Check `#53` — `<DinouCacheSlot>` Error Resilience During `refreshSlot` / `revalidateTag`
- **Proposed Fixtures:**
  - `src/t-3d-cube/cs-error/page.tsx` + `page_functions.ts` (`revalidate = 3600`) with a `<DinouCacheSlot id="cube-cs-fragile" revalidate={3600}>` that throws when `cubeState.csFragileShouldThrow === true`, plus a healthy sibling `<DinouCacheSlot id="cube-cs-healthy" revalidate={3600}>`.
- **What to Verify:**
  1. Warm page with `csFragileShouldThrow = false` → both slots cached cleanly (`100`).
  2. Toggle `csFragileShouldThrow = true` and trigger `refreshSlot("cube-cs-fragile", { fresh: true })`:
     - Verify `getSlotJSX` falls back cleanly to the last known good cached slot (`cache-slot.js:1391`) without crashing the page, corrupting `slots/cube-cs-fragile/slot.json`, or breaking `cube-cs-healthy`!
  3. Toggle `csFragileShouldThrow = false`, bump `cube-cs-fragile`, trigger `refreshSlot` again → recovers seamlessly and persists across F5!

---

## Stage 3 — Axis Z: Partial Prerendering (PPR) Deep Edge Cases

### Why These Cases Matter
Phase 1 validates 7/8 Suspense patterns, `noDynamic()`, `React.memo`, 1s PPR shell TTL SWR (single user), unwrapped bailout, XSS escaping, and `useSearchParams()`. Two high-value PPR runtime scenarios remain.

### Check `#54` — High-Concurrency Stampede During 1s PPR Shell TTL Expiration
- **Proposed Fixtures:**
  - Reuse `src/t-3d-cube/ppr/ttl-shell/` (`ppr = true`, `revalidate = 1`) + dedicated `src/t-3d-cube/ppr-stampede/page.tsx` (counting actual shell executions in `cube-state.ts`).
- **What to Verify:**
  1. Warm baseline shell (`generatedAt` fresh), mutate shell + hole values, wait `1300ms` until TTL expires.
  2. Fire **12 simultaneous HTTP requests** (`Promise.all`) right on TTL expiry + open a real browser page concurrently:
     - Every response returns `200 OK` with **internally consistent** SSR HTML + inline `__DINOU_RSC_P__`/`__DINOU_RSC_L__` scripts (never mixing old `100` SSR DOM with new `538` inline Flight scripts — causal snapshot invariant under real concurrency!).
     - Stampede deduplication ensures the background shell regenerates **at most once** (not 12×!).
     - Real browser hydration produces **zero `#418`/`#425` errors**.
     - Subsequent request after settle returns the fresh shell + live hole.

### Check `#55` — Error Isolation & `redirect()` Inside a PPR Dynamic Hole Alongside Healthy Sibling Holes
- **Proposed Fixtures:**
  - `src/t-3d-cube/ppr-hole-edge/page.tsx` + `page_functions.ts` (`ppr = true`, `revalidate = 3600`) with 2 sibling dynamic `<Suspense>` holes:
    - Hole A: healthy async hole reading query `?ok=...`
    - Hole B: throws an error when `?failHole=1`, or calls `redirect("/t-3d-cube/ppr")` when `?redirHole=1` (wrapped in an ErrorBoundary for the error case)
- **What to Verify:**
  1. With `?ok=healthy&failHole=1`: static shell stays cached (`100`), Hole A still streams and renders `healthy`, Hole B's error is isolated without crashing the HTTP stream or corrupting the static shell on disk!
  2. Next request with `?ok=recovered` (no `failHole`): static shell is intact (`100`), both Hole A and Hole B resolve cleanly with 0 hydration errors.
  3. With `?redirHole=1`: verify clean redirect handling (or client redirect fallback once headers are flushed in streaming PPR) without hanging the stream or leaving unhandled rejections.

---

## Stage 4 — Pairwise Combinations (`X+Y`, `X+Z`, `Y+Z`) Deep Edge Cases

### Why These Cases Matter
Phase 1 tests symmetric all-static `X+Y`, `X+Z`, and single-level `Y+Z`. The asymmetric crosses below exercise some of the trickiest interactions in `dinou/core/handler.js` and `ppr-runtime.js`.

### Check `#56` (`X + Y` Asymmetric) — `<DinouCacheSlot>` Inside a Dynamic Layout (`revalidate = 0`) + Static L1/L3/Page
- **Proposed Fixtures:**
  - `src/t-3d-cube/pair-xy-asym/layout.tsx` + `layout_functions.ts` (`L1`: static `3600s` + `<DinouCacheSlot id="cube-xy-l1-slot" revalidate={3600}>`)
  - `src/t-3d-cube/pair-xy-asym/dyn-l2/layout.tsx` + `layout_functions.ts` (`L2`: **dynamic `revalidate = 0`** + client probe + `<DinouCacheSlot id="cube-xy-dyn-l2-slot" revalidate={3600}>`)
  - `src/t-3d-cube/pair-xy-asym/dyn-l2/page.tsx` + `page_functions.ts` (`Page`: static `3600s` + `<DinouCacheSlot id="cube-xy-page-slot" revalidate={3600}>`)
- **What to Verify:**
  1. Poison `L1`, `L1 slot`, `L2 slot`, `Page`, `Page slot` (`999`); bump ONLY `L2` host. Hard reload → **`L2` host executes live**, while **`L2 slot` (`revalidate=3600` INSIDE dynamic L2!)**, `L1`, `L1 slot`, `Page`, and `Page slot` ALL stay cached!
  2. Live `refreshSlot("cube-xy-dyn-l2-slot", { fresh: true })` updates ONLY `L2 slot` while preserving `L2` client counter and keeping `L1`/`Page` untouched; F5 persists the refreshed `L2 slot` while `L2` host executes fresh.
  3. `revalidateTag` on `L1 slot` or `Page slot` updates only that slot without touching `L2 slot` or caching dynamic `L2`.

### Check `#57` (`X + Z` Asymmetric — HIGH RISK!) — Dynamic Layout (`revalidate = 0`) + PPR Child Page (`ppr = true, 3600s`)
- **Proposed Fixtures:**
  - `src/t-3d-cube/pair-xz-asym/layout.tsx` + `layout_functions.ts` (`L1`: static `ppr = true`, `revalidate = 3600`, with L1 dynamic hole)
  - `src/t-3d-cube/pair-xz-asym/dyn-l2/layout.tsx` + `layout_functions.ts` (`L2`: **dynamic `revalidate = 0`**)
  - `src/t-3d-cube/pair-xz-asym/dyn-l2/page.tsx` + `page_functions.ts` (`Page`: **`ppr = true`, `revalidate = 3600`** with static shell + `noDynamic()` static Suspense + dynamic `<Suspense>` hole)
- **What to Verify:**
  1. Does SSG pre-render `Page`'s static shell (`shell.page.json` / `page.rsc`) without freezing dynamic `L2`?
  2. On hard reload (poisoning `L1` shell, `Page` shell, and `Page` `noDynamic()` static Suspense to `999`; bumping `L1` hole, `L2` dynamic layout, and `Page` dynamic hole):
     - **`L2` executes live**
     - **`L1` hole and `Page` hole stream live**
     - **`L1` shell and `Page` shell stay frozen** (0 `#418` hydration mismatches!)
  3. `revalidatePage("/t-3d-cube/pair-xz-asym/dyn-l2")` updates ONLY `Page` shell without freezing `L2` or re-executing `L1` shell.
- **Potential Dinou Core Risk Area (CRITICAL):**
  - Look at `dinou/core/handler.js:3783–3787`:
    `!platformContext?.isSSG && hasDynamicLayoutConfig && !isPprConfig && activeLayoutsForRoute.length > 0 && pagePath`
  - Because of `!isPprConfig`, a route with a dynamic layout + PPR page currently **skips** the asymmetric dynamic-layout composition branch and may fall back to full dynamic SSR (re-executing `L1` shell and `Page` shell on every request!). Implementing Check `#57` will directly test this branch and guide a clean fix in `dinou/core/handler.js` + `ppr-runtime.js` if needed!

### Check `#58` (`X + Z` Per-Level TTL) — PPR Layout Chain with Short 1s TTL on L1 (`L1 PPR 1s → L2 PPR 3600s → Page PPR 3600s`)
- **Proposed Fixtures:**
  - `src/t-3d-cube/pair-xz-ttl/layout.tsx` + `layout_functions.ts` (`L1`: `ppr = true`, `revalidate = 1`, with static shell + dynamic hole)
  - `src/t-3d-cube/pair-xz-ttl/l2/layout.tsx` + `layout_functions.ts` (`L2`: `ppr = true`, `revalidate = 3600`, with static shell + dynamic hole)
  - `src/t-3d-cube/pair-xz-ttl/l2/page.tsx` + `page_functions.ts` (`Page`: `ppr = true`, `revalidate = 3600`, with static shell + dynamic hole)
- **What to Verify:**
  1. Warm route, poison `L2` shell and `Page` shell (`999`), bump `L1` shell + all 3 dynamic holes, wait `1300ms`:
     - Reload #1 (SWR trigger): stale `L1` shell + live holes + **0 `#418`/`#425`**!
     - Reload #2 (post-SWR): **`L1` shell updated**, all 3 holes live, **`L2` shell AND `Page` shell still frozen** (NOT `999`!), **0 `#418`/`#425`**!

### Check `#59` (`Y + Z` Deep) — Nested `<DinouCacheSlot>` (`Outer → Inner`) Inside a PPR Dynamic Hole
- **Proposed Fixtures:**
  - `src/t-3d-cube/pair-yz-nested-hole/page.tsx` + `page_functions.ts` (`ppr = true`, `revalidate = 3600`) with a dynamic `<Suspense>` hole containing:
    - `<DinouCacheSlot id="cube-yz-hole-outer" tag="cube-yz-hole-outer-tag" revalidate={3600}>` wrapping `<DinouCacheSlot id="cube-yz-hole-inner" tag="cube-yz-hole-inner-tag" revalidate={3600}>` (plus a 1s TTL inner sibling `cube-yz-hole-inner-ttl`).
- **What to Verify:**
  1. Live `refreshSlot("cube-yz-hole-outer", { fresh: true })` with `inner` poisoned (`999`) → `outer` updates live, **`inner` stays frozen** (verifies our Check `#42` fix inside a PPR dynamic hole!), F5 persists.
  2. Live `refreshSlot("cube-yz-hole-inner", { fresh: true })` with `outer` and enclosing hole host poisoned → `inner` updates live, `outer` stays frozen, F5 persists.
  3. 1s TTL `cube-yz-hole-inner-ttl` inside 3600s `outer` inside PPR hole expires cleanly via 2-reload SWR with 0 `#418`.

---

## Stage 5 — Triple Synergy (`X + Y + Z`) Deep Asymmetric & Cross-Layer Tags

### Why These Cases Matter
Phase 1 validates Triple Synergy on symmetric all-PPR chains (`L1 PPR → L2 PPR → Page PPR/Static`). Stage 5 combines every remaining axis into the ultimate stress tests.

### Check `#60` — Ultimate Asymmetric Triple Synergy (`L1 PPR+Slot → L2 Dynamic+Slot → L3 PPR+Slot → Page PPR+Hole+Slot`)
- **Proposed Fixtures:**
  - `src/t-3d-cube/triple-asym/layout.tsx` (`L1`: `ppr = true, 3600s` + `L1 slot 3600s` + `L1 hole` + client probe)
  - `src/t-3d-cube/triple-asym/dyn-l2/layout.tsx` (`L2`: `revalidate = 0` + `L2 slot 3600s` + client probe)
  - `src/t-3d-cube/triple-asym/dyn-l2/l3/layout.tsx` (`L3`: `ppr = true, 3600s` + `L3 slot 3600s` + `L3 hole` + client probe)
  - `src/t-3d-cube/triple-asym/dyn-l2/l3/page.tsx` (`Page`: `ppr = true, 3600s` + `Page shell slot 3600s` + `Page hole` containing `Hole slot 3600s`)
- **What to Verify:**
  1. Poison all static shells (`L1`, `L3`, `Page`) and all 5 slots (`999`); bump dynamic `L2` and all 3 PPR holes (`L1`, `L3`, `Page`). Hard reload → all static shells & all 5 slots stay frozen, while dynamic `L2` and all 3 PPR holes stream fresh with 0 `#418`.
  2. Live `refreshSlot` on `L1 slot`, `L2 slot` (inside dynamic L2!), `L3 slot`, `Page shell slot`, and `Hole slot` → all 5 update live preserving all client counters + F5 persistence.
  3. `revalidateLayout(L3)` updates ONLY `L3` shell while preserving `L1` shell, `L1` refreshed slot, `L2` slot, `Page` shell, and `Page` slots (with dynamic `L2` still live and never cached).

### Check `#61` — Shared Multi-Layer Cache Tag Across Layout + Page + `<DinouCacheSlot>` in One 3D Route
- **Proposed Fixtures:**
  - `src/t-3d-cube/triple-shared-tag/layout.tsx` + `layout_functions.ts` (`ppr = true, 3600s`, `getCacheTags: () => ["cube-shared-all", "cube-st-l1"]`) with a `<DinouCacheSlot id="cube-st-slot" tags={["cube-shared-all", "cube-st-slot-only"]} revalidate={3600}>` AND an unrelated frozen slot `cube-st-unrelated-slot` (`tags: ["cube-st-unrelated"]`).
  - `src/t-3d-cube/triple-shared-tag/page.tsx` + `page_functions.ts` (`ppr = true, 3600s`, `getCacheTags: () => ["cube-shared-all", "cube-st-page"]`) with a dynamic `<Suspense>` hole + a second unrelated static sibling page `sibling/page.tsx`.
- **What to Verify:**
  1. Poison `cube-st-unrelated-slot` and `sibling/page.tsx` (`999`); bump `L1` shell, `Page` shell, `cube-st-slot`, and `Page` hole; call a single **`revalidateTag("cube-shared-all")`**.
  2. Verify deterministic invalidation order (`slot → layout → page`): on hard reload, `cube-st-slot`, `L1` shell, and `Page` shell ALL reflect their new values consistently (never stale slot baked into fresh layout/page!), `Page` hole streams live, **`cube-st-unrelated-slot` and `sibling/page.tsx` stay frozen**, and **0 `#418` hydration errors** occur!

---

## Execution Order

We will execute one stage per iteration:
1. **Stage 1 (Axis X — Checks `#47–#50`)** ← *Next up once confirmed*
2. **Stage 2 (Axis Y — Checks `#51–#53`)**
3. **Stage 3 (Axis Z — Checks `#54–#55`)**
4. **Stage 4 (Pairwise `X+Y`, `X+Z`, `Y+Z` — Checks `#56–#59`)**
5. **Stage 5 (Triple Synergy `X+Y+Z` — Checks `#60–#61`) + Final Full Chromium Regression Sweep**
