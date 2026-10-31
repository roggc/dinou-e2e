# Dinou v9.0.3 — Rigorous Integral Verification Suite Reference (`8 Suites / 94+ End-to-End Scenarios`)

This document is the master technical reference for the **8 integral verification suites** created in `test-9.0.2` (and ported to `dinou-e2e`) to stress-test every React 19 architecture primitive introduced and refined in **Dinou v9.0.3**—covering Server Functions and **all 7 non-empty combinations ($2^3 - 1 = 7$)** of **Horizontal Segmentation (HS)**, **Vertical Segmentation (`<DinouCacheSlot>`)**, and **Partial Prerendering (PPR)** (3 individual suites, 3 pairwise synergy suites, and 1 full three-way synergy suite)—verified **100% in green with `0` React hydration errors**.

---

## 1. Executive Summary & Architectural Coverage Matrix

```text
+---------------------------------------------------------------------------------------------------+
|                             DINOU v9.0.3 INTEGRAL VERIFICATION MATRIX                             |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [Suite 1: /sf-test]              Inline & Function-Level "use server" RPC, Lexical Closures,     |
|  (13 Automated Checks)            .map() Loop Hoisting, Direct Client Imports, Manifest           |
|                                   Tree-Shaking, RSC Flight Streaming & Live HMR Sync              |
|                                                                                                   |
|  [Suite 2: /ppr-test]             Partial Prerendering (PPR): 0ms Static Shell (shell.html /      |
|  (16 Automated Audit Checks)      shell.rsc), Concurrent <Suspense> Holes, Tri-State Cascading    |
|                                   Config, React.memo, Nested Holes, Unwrapped Bailout & XSS Guard |
|                                                                                                   |
|  [Suite 3: /cache-slot-test]      Vertical Segmentation (<DinouCacheSlot> & refreshSlot):         |
|  (3 Multi-Stage E2E Blocks)       Cold-Start Discovery, Static/Dynamic Hosts, revalidate={0},     |
|                                   Shared Multi-Tag Invalidation, Server Action Serialization      |
|                                   & Nested Slot (Outer -> Inner) Isolation                        |
|                                                                                                   |
|  [Suite 4: /ppr-cache-slot-test]  Pairwise Synergy #1 (PPR + Vertical Segmentation):              |
|  (2 Multi-Stage E2E Blocks /      <DinouCacheSlot> in PPR Static Shell, Static <Suspense>         |
|   6 Architectural Scenarios)      Permutations, Micro-ISR Slots Inside Streamed Dynamic Holes,    |
|                                   Pre-Bailout Slot Persistence & Deadlock-Free Live refreshSlot   |
|                                                                                                   |
|  [Suite 5: /horizontal-           Horizontal Segmentation (layout.rsc vs. page.rsc):              |
|   segmentation-test]              Sibling Soft Navigation (0 Layout Fetches), pageCache vs.       |
|  (12 Automated Scenarios)         <Link fresh>, Nested Layouts + @slot, Dynamic [deptId] Params,  |
|                                   validateParams, allowISG: false, router.refresh({ layout }),    |
|                                   error.tsx Isolation, reset_layout, no_layout & Surgical ISR     |
|                                                                                                   |
|  [Suite 6: /triple-sinergy-test]  Full Triple Synergy (Horizontal + Vertical + PPR):              |
|  (12 Automated Scenarios)         L1 & L2 PPR Layouts with Layout Slots + Sibling PPR & Static    |
|                                   (ppr=false) Pages + Shell Slots + Dynamic Holes with Nested     |
|                                   Slots + Cross-Mode Soft Nav + Lazy HTML Re-Composition          |
|                                                                                                   |
|  [Suite 7: /hs-cache-slot-test]   Pairwise Synergy #2 (Horizontal + Vertical Without PPR):        |
|  (10 Automated Scenarios)         L1/L2 Layouts + @sidebar Parallel Slot + Page A/B Slots,        |
|                                   Cross-Axis Shared Tags, Nested Slots in Layout & Page,          |
|                                   revalidate={0} in Static Page, Round-Trip Soft Nav              |
|                                   (slotOverrideCache) & Unmounted Slot Refresh (knownClientSlots) |
|                                                                                                   |
|  [Suite 8: /hs-ppr-test]          Pairwise Synergy #3 (Horizontal + PPR Without DinouCacheSlot):  |
|  (11 Automated Scenarios)         Frozen shell.layout.json & shell.page.json + Live Spliced       |
|                                   <Suspense> Holes Across L1 + @sidebar + L2 + Page, Surgical     |
|                                   Layout/Page Revalidation, Lazy shell.html Re-Composition,       |
|                                   reset_layout / no_layout PPR & Dynamic [team] Guardrails        |
+---------------------------------------------------------------------------------------------------+
```

### Summary of Execution Results in `test-9.0.2`

| # | Suite Route (`test-9.0.2`) | Companion Route (`dinou-e2e`) | Automated Checks / Scenarios | Result | Hydration Errors |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `/sf-test` | `/t-sf-body` | **13 / 13** RPC & HMR checks | **100% PASS** | `0` |
| **2** | `/ppr-test` | `/t-ppr-rigorous` | **17 / 17** PPR audit checks (incl. Clock TTL) | **100% PASS** | `0` |
| **3** | `/cache-slot-test` (+ `/static-host`) | `/t-rigorous-cache-slot` | **4 / 4** E2E blocks (incl. Clock TTL on dynamic & static hosts) | **100% PASS** | `0` |
| **4** | `/ppr-cache-slot-test` | `/t-rigorous-sinergy` | **3 / 3** E2E blocks (incl. Clock TTL in PPR Shell & Hole) | **100% PASS** | `0` |
| **5** | `/horizontal-segmentation-test` | `/t-rigurous-hs` | **13 / 13** automated scenarios (incl. Layout vs. Page Clock TTL) | **100% PASS** | `0` |
| **6** | `/triple-sinergy-test` | `/t-rigurous-triple-sinergy` | **13 / 13** automated scenarios (+ Clock TTL, F5 & Direct SSR) | **100% PASS** | `0` |
| **7** | `/hs-cache-slot-test` | `/t-rigurous-hs-cache-slot` | **11 / 11** automated scenarios (+ Clock TTL & F5 reload) | **100% PASS** | `0` |
| **8** | `/hs-ppr-test` | `/t-rigurous-hs-ppr` | **12 / 12** automated scenarios (+ Layout & Page Clock TTL, F5 & Direct SSR) | **100% PASS** | `0` |

---

## 2. Suite 1: Inline & Function-Level `"use server"` Actions (`/sf-test` / `/t-sf-body`)

### 2.1. Purpose & Scope
Verifies the AST compiler pass (`transformServerFunctions`), client bundler plugins (`esbuild`, `rollup`, `webpack`), granular manifest tree-shaking (`__DINOU_SERVER_FUNCTIONS_MANIFEST__`), lexical closure hoisting via `.bind()`, direct `"use client"` imports of function-level `"use server"` exports from mixed utility modules, and live HMR manifest synchronization without restarting the dev server.

### 2.2. Source Files (`src/sf-test/`)
- `src/sf-test/page.tsx`: Server Component defining inline `"use server"` actions, top-level unexported `"use server"` functions, `.map()` loop bound actions, native `<form action={...}>` JSX handlers, `useActionState` handlers, and RSC Flight JSX streaming actions.
- `src/sf-test/components/sf-test-client.tsx`: Interactive client testbench and 13-test automated runner.
- `src/sf-test/components/server-badge-card.tsx`: Async Server Component streamed directly to the client as the return value of an inline `"use server"` function.
- `src/sf-test/utils/mixed-server-utils.ts`: Module **without** a top-level `"use server"` directive that mixes private helpers (`computeInternalDiscount`), normal exported helpers (`nonServerHelperFormat`), and functions declaring `"use server"` inside their body (`calculateOrderOnServer`, `verifyContextAndSign`, `inspectSfManifest`, `directClientImportedServerFn`).

### 2.3. The 13 Automated Scenarios (`13 / 13 PASS`)

| # | Test ID | Scenario | What It Verifies & Asserts | Status |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `t1` | **Basic Inline Server Function (`inlineCounterAction`)** | Invokes an inline `"use server"` function defined inside `SfTestPage` over `POST /____server_function____`, mutating server state (`+5`) and returning the updated count. | **PASS** |
| **2** | `t2` | **Lexical Closure Hoisting & `.bind()` (`inlineClosureAction`)** | Verifies that an inline `"use server"` function captures `pageRenderId`, `serverSecretToken`, and `baseMultiplier` from the enclosing `SfTestPage` scope via compiler-generated `.bind(null, ...)` arguments (`7 × 8 = 56`). | **PASS** |
| **3** | `t3` | **Inline Server Function Inside `.map()` Loop (`applyPresetAction`)** | Verifies that inline `"use server"` functions created inside `rawPresets.map(...)` capture both the iterated `preset` object (`bonus`) and the parent `pageRenderId`. | **PASS** |
| **4** | `t4` | **Auto-Export of Top-Level Function Without Explicit `export` (`autoExportedTopLevelAction`)** | Verifies that a top-level function without `export` that declares `"use server"` in its body is automatically exported by the AST transform and registered in the RPC manifest. | **PASS** |
| **5** | `t5` | **Mixed Module Without Top-Level `"use server"` + `getContext()` (`calculateOrderOnServer` & `verifyContextAndSign`)** | Calls both a function declaration and an arrow function with body-level `"use server"` in `mixed-server-utils.ts`, verifying discount/IVA calculation (`96.8€`), `req.headers` / `req.cookies` reading, and `res.cookie("sf_test_tag", ...)` writing. | **PASS** |
| **6** | `t6` | **Granular Manifest Tree-Shaking (`inspectSfManifest`)** | Inspects `__DINOU_SERVER_FUNCTIONS_MANIFEST__` at runtime and asserts that `calculateOrderOnServer`, `verifyContextAndSign`, and `directClientImportedServerFn` are registered while `nonServerHelperFormat` and `computeInternalDiscount` are excluded. | **PASS** |
| **7** | `t7` | **Direct RSC JSX Streaming (`inlineStreamRscAction`)** | Invokes an inline `"use server"` function that returns `<ServerBadgeCard />` (an async Server Component) over Flight RPC and mounts the streamed JSX directly into client state. | **PASS** |
| **8** | `t8` | **Direct `"use client"` Import of Function-Level `"use server"` Export (`directClientImportedServerFn`)** | Imports `directClientImportedServerFn` directly into `sf-test-client.tsx` (`"use client"`) from `mixed-server-utils.ts` (which has no module-level `"use server"`). Asserts `typeof window === "undefined"` and a valid Node/runtime PID (`executedOnServer: true`), proving all 3 client bundlers emit `createServerFunctionProxy`. | **PASS** |
| **9** | `t9` | **HMR Manifest Sync on Added Inline Action (`hotReloadAddedInlineAction`)** | Verifies that an inline `"use server"` function added to an existing `page.tsx` is registered in `__DINOU_SERVER_FUNCTIONS_MANIFEST__` and preserves closure bindings. | **PASS** |
| **10** | `t10` | **Live HMR Injection Without Dev Server Restart (`hotReloadLiveNoRestartAction`)** | Verifies live manifest registration and closure computation (`baseMultiplier × 9 = 63`) without restarting `dinou dev`. | **PASS** |
| **11** | `t11` | **Rollup HMR Sync (`hotReloadRollupVerifyAction`)** | Verifies `rollup-plugin-server-functions` live manifest updates and closure binding (`Rollup-HMR-OK`). | **PASS** |
| **12** | `t12` | **Webpack LiveReload Sync (`hotReloadWebpackVerifyAction`)** | Verifies `server-functions-loader.js` + `notifyFileChanged` client compilation synchronization in Webpack. | **PASS** |
| **13** | `t13` | **Rollup Post-Patch `sfMtimeCache` Verification (`hotReloadRollupPostPatchVerifyAction`)** | Verifies `sfMtimeCache` invalidation and live manifest synchronization (`baseMultiplier × 11 = 77`). | **PASS** |

---

## 3. Suite 2: Partial Prerendering — PPR (`/ppr-test` / `/t-ppr`)

### 3.1. Purpose & Scope
Audits Dinou's Dual-Bundle Partial Prerendering engine end-to-end: build-time static shell extraction (`shell.html`, `shell.rsc`, `shell.page.json`, `metadata.json`), pre-order `1`-based `ppr-hole-N` indexing across layouts and pages, static `<Suspense>` vs. dynamic `<Suspense>` separation, tri-state `ppr` config inheritance and opt-out (`resolveModulePpr`), runtime streaming via `handlePprResume` (`<template id="ppr-content-...">` + inline DOM replacement `<script>`), `React.memo` and nested `<Suspense>` holes, unwrapped dynamic bailout detection (`ssgPprUnwrappedBailout`), and XSS protection when escaping `</template>` in streamed holes.

### 3.2. The 17 Automated Audit Checks (`17 / 17 Passed`)

| # | Check ID | Audit Check | What It Verifies & Asserts | Status |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `check-1` | **Build Artifacts (`/ppr-test`)** | Verifies `.dinou/dist2/ppr-test/` contains `shell.html`, `shell.rsc`, and `metadata.json` with `ppr: true` and `holes[]`. | **PASS** |
| **2** | `check-2` | **Static `<Suspense>` Isolation (`StaticAsyncCard`)** | Verifies that an async `<Suspense>` boundary that does **not** touch `req.cookies`/`headers`/`query` resolves at build time directly into `shell.html` and is **not** registered as a dynamic hole. | **PASS** |
| **3** | `check-3` | **Concurrent Sibling `<Suspense>` Holes** | Verifies all 7 dynamic `<Suspense>` holes on `/ppr-test` are postponed into `shell.html` with sequential `data-ppr-hole` IDs without leaking bailouts across siblings. | **PASS** |
| **4** | `check-4` | **Cascading Config Inheritance (`/ppr-test/inherited`)** | Verifies `/ppr-test/inherited` inherits `ppr = true` from `src/ppr-test/inherited/layout_functions.ts` and generates `shell.html`. | **PASS** |
| **5** | `check-5` | **Cascading Config Opt-Out (`/ppr-test/inherited/opt-out`)** | Verifies `export const ppr = false` in `opt-out/page_functions.ts` overrides the parent layout's `ppr = true` and does **not** generate `shell.html`. | **PASS** |
| **6** | `check-6` | **Async Function Config (`/ppr-test/fn-config`)** | Verifies `export async function ppr() { return true; }` in `page_functions.ts` enables PPR and generates `shell.html`. | **PASS** |
| **7** | `check-7` | **Anti-Test: `export const ppr = true` in `page.tsx` (`/ppr-test/anti-test`)** | Verifies that exporting `ppr` from `page.tsx` instead of `page_functions.ts` is ignored by the PPR config resolver. | **PASS** |
| **8** | `check-8` | **Runtime Static Shell Preservation** | Compares two runtime `GET /ppr-test` requests and asserts the static shell timestamp and static `<Suspense>` card remain identical and are never re-streamed. | **PASS** |
| **9** | `check-9` | **Runtime Dynamic Holes Personalization** | Sends distinct `Cookie`, `Query`, and `X-Custom-Header` values across requests and asserts the streamed `<template>` chunks reflect each request's live values. | **PASS** |
| **10** | `check-10` | **`React.memo` Dynamic Hole Support** | Verifies `MemoizedDynamicHole` wrapped in `React.memo` is unwrapped during hole traversal and streams fresh per-request values. | **PASS** |
| **11** | `check-11` | **Nested `<Suspense>` Inside Dynamic Hole** | Verifies an inner `<Suspense>` nested inside a dynamic parent `<Suspense>` hole resolves cleanly inside the parent's streamed chunk without registering a duplicate hole ID. | **PASS** |
| **12** | `check-12` | **Streamed Inline `<script>` JS Syntax** | Parses every inline replacement `<script>` emitted by `streamDynamicHoles` with `new Function(...)` to guarantee valid JavaScript syntax. | **PASS** |
| **13** | `check-13` | **Build vs. Runtime Hole ID Alignment (`/ppr-test`)** | Asserts a 1-to-1 match between every `data-ppr-hole="ppr-hole-N"` in `shell.html` and every streamed `<template id="ppr-content-ppr-hole-N">`. | **PASS** |
| **14** | `check-14` | **Layout + Page `<Suspense>` Hole Alignment (`/ppr-test/inherited`)** | Verifies that when both `layout.tsx` (`ppr-hole-1`) and `page.tsx` (`ppr-hole-2`) contain dynamic `<Suspense>` holes, build-time and runtime hole IDs stay aligned (`B:0` and `B:1`). | **PASS** |
| **15** | `check-15` | **Unwrapped Dynamic Access in PPR Route (`/ppr-test/unwrapped-bailout`)** | Verifies that reading `req.cookies` outside `<Suspense>` on a PPR route skips static shell persistence (`ssgPprUnwrappedBailout`) and renders fresh per request. | **PASS** |
| **16** | `check-16` | **Security: `</template>` Breakout & Error Message XSS Guard** | Verifies that throwing `SimulatedHoleError: </template><script>window.__PPR_ERR_XSS__=1</script>` inside a dynamic hole is HTML-escaped and never breaks out of the `<template>` tag. | **PASS** |
| **17** | `check-17` | **Clock-Based PPR Static Shell TTL Expiration (`/ppr-test/ttl-shell`, `revalidate = 1s`)** | Verifies that a PPR route with `export const revalidate = 1` serves its cached `shell.html` within the 1s window while streaming live dynamic holes, and after `> 1s` clock expiration regenerates `shell.html` in the background via ISR while preserving `<Suspense>` hole streaming. | **PASS** |

---

## 4. Suite 3: Vertical Segmentation & Micro-ISR (`/cache-slot-test` / `/t-cache-slot`)

### 4.1. Purpose & Scope
Verifies `<DinouCacheSlot>` and `refreshSlot` / `useRouter().refreshSlot` across static and dynamic host pages: cold-start slot discovery on `/____rsc_slot____/:id`, vertical cache isolation on dynamic pages, `revalidate={0}` bypass, multi-tag shared invalidation (`revalidateTag`), in-place client reconciliation preserving `useState`, `"use server"` reference serialization inside cached slot JSON, and nested `<DinouCacheSlot>` (Outer → Inner) invalidation via `refreshNestedSlotsInTree`.

### 4.2. The 4 Multi-Stage Verification Blocks (`ALL PASSED`)

1. **Block 2.1 — Static Host Page & Cold-Start Slot Endpoints (`/cache-slot-test/static-host`)**:
   - Directly queries `GET /____rsc_slot____/slot-static-host?fresh=1` and `GET /____rsc_slot____/slot-layout-banner?fresh=1` with `x-dinou-current-path: /cache-slot-test/static-host` on a freshly booted server (`slotRegistry` empty), confirming cold-start route pre-evaluation inside `runWithPprContext({ isPpr: true })` and fallback layout discovery.
   - Navigates to `/cache-slot-test/static-host`, invalidates `tag-static-host-slot` + calls `refreshSlot`, reloads the page (`F5`) to confirm `metadata.json` (`slotTags`) triggered static host regeneration, and performs a live `refreshSlot("slot-static-host", { fresh: true })` asserting the slot token updates while `#static-page-time` remains frozen.
2. **Block 2.2 — Vertical Cache Isolation, `revalidate={0}` & Shared Multi-Tag Invalidation (`/cache-slot-test`)**:
   - Reloads the dynamic host page `/cache-slot-test` and asserts `#page-token` and `#slot-nocache-token` (`revalidate={0}`) change on every request, while `#slot-alpha-token`, `#slot-beta-token`, `#slot-gamma-token`, and `#slot-tag-only-token` remain cached.
   - Invalidates `tag-shared` (shared by `slot-beta` and `slot-gamma`) and reloads: asserts `slot-alpha` stays cached while both `slot-beta` and `slot-gamma` regenerate.
3. **Block 2.3 — Live `refreshSlot` by Tag, Server Action Props Inside Cached Slot & Nested Slot Isolation**:
   - Increments `#page-client-counter` (`100 → 102`), invokes both a direct `"use server"` import (`#btn-slot-client-ping`) and a prop-passed `"use server"` action (`#btn-slot-client-prop-ping`) inside a cached `<DinouCacheSlot>`, and calls `refreshSlot("tag-alpha", { fresh: true })`, verifying `slot-alpha` updates in place while `#page-client-counter` stays `102`.
   - Invalidates only `tag-inner` on the nested `<DinouCacheSlot id="slot-nested-inner">` inside `<DinouCacheSlot id="slot-nested-outer">`: verifies `#slot-nested-inner-token` updates while `#slot-nested-outer-token` stays cached both on reload (`refreshNestedSlotsInTree`) and on live `refreshSlot("slot-nested-inner", { fresh: true })`.
4. **Block 2.4 — Clock-Based TTL Expiration (`revalidate = N`) on Dynamic & Static Hosts**:
   - Waits `2.3s` on `/cache-slot-test` and reloads: asserts `#slot-fast-token` (`revalidate={2}`) regenerates by clock while `#slot-alpha-token` (`revalidate={60}`) stays cached.
   - Waits `1.4s` on `/cache-slot-test/static-host` and calls `refreshSlot("slot-static-fast")` **without** `{ fresh: true }` followed by `F5` reload: asserts `#slot-static-fast-token` (`revalidate={1}`) expires by clock and surgically recomposes `index.html` (`onlyRefreshSlots: true`) while preserving `#static-page-time` and the `60s` slot (`#slot-static-host-token`).

---

## 5. Suite 4: Pairwise Synergy #1 — PPR + `<DinouCacheSlot>` (`/ppr-cache-slot-test` / `/t-ppr-cache-slot`)

### 5.1. Purpose & Scope
Tests the interaction between **Partial Prerendering** and **Vertical Segmentation (`<DinouCacheSlot>`)** on a single route where `layout.tsx` and `page.tsx` both use PPR and host `<DinouCacheSlot>` boundaries in every possible structural position:
- **Scenario 1**: `<DinouCacheSlot id="ppr-syn-shell-slot">` directly in the PPR Static Shell (outside `<Suspense>`).
- **Scenario 2A**: Static `<Suspense>` (no dynamic reads) wrapping `<DinouCacheSlot id="ppr-syn-static-suspense-slot">` *before* dynamic holes (testing `holeIndex` alignment).
- **Scenario 2B**: `<DinouCacheSlot id="ppr-syn-slot-with-static-suspense">` wrapping an internal Static `<Suspense>` *before* dynamic holes.
- **Scenario 3 (Dynamic Hole #1 — `ppr-hole-4`)**: Reads `req.cookies.syn_user`, `req.headers["x-syn-probe"]`, and `req.query.mode`, and renders a sibling Client Component (`PprHoleOuterClientState`), a cached slot (`ppr-syn-hole-slot-a`, `revalidate={3600}`), and an uncached slot (`ppr-syn-hole-slot-nocache`, `revalidate={0}`).
- **Scenario 4 (Dynamic Hole #2 — `ppr-hole-5`)**: Reads `req.cookies.syn_tier` and renders nested `<DinouCacheSlot id="ppr-syn-nested-outer">` → `<DinouCacheSlot id="ppr-syn-nested-inner">` inside the streamed hole.
- **Scenario 5 (Dynamic Hole #3 — `ppr-hole-6`)**: Renders `<DinouCacheSlot id="ppr-syn-client-slot">` (containing `<PprSlotInnerClientWidget onServerEcho={echoFromPprSlotAction} />`) **before** `<DynamicSiblingBailoutReader />` triggers PPR postpone (testing `deferPprSuspenseEffect` so build-time slot writes are discarded when a later sibling bails out).
- **Scenario 6 (Dynamic Hole #4 — `ppr-hole-7`)**: Reads `req.cookies.syn_direct_cookie` **directly inside** `<DinouCacheSlot id="ppr-syn-direct-dynamic-slot">`.

### 5.2. The 3 Multi-Stage Verification Blocks (`ALL PASSED`)

1. **Block 3.1 — Raw Wire Streaming Protocol & Slot Caching Inside Dynamic Holes**:
   - Sends two raw HTTP requests to `/ppr-cache-slot-test` with different cookies, headers, and query params (`alice`/`probe-1`/`alpha-mode` vs. `bob`/`probe-2`/`beta-mode`) and splits the wire HTML at `<template id="ppr-content-`.
   - Asserts `ppr-hole-1`, `ppr-hole-4`, `ppr-hole-5`, `ppr-hole-6`, and `ppr-hole-7` placeholders are in `shellPart` and their corresponding `<template>` chunks are in `streamPart` (while static `<Suspense>` boundaries `2A` and `2B` are resolved inline in `shellPart`).
   - Asserts `#syn-shell-slot-token` is cached in `shellPart`, `#syn-hole-1-user` personalizes per request (`alice` vs. `bob`), `#syn-hole-slot-a-token` stays cached across dynamic hole executions, and `#syn-hole-slot-nocache-token` regenerates on every request.
2. **Block 3.2 — Live `refreshSlot` Across Shell, Dynamic Hole & Nested Slots Preserving Client State**:
   - Hydrates `/ppr-cache-slot-test?mode=live-mode`, increments client state in the shell (`500 → 501`), in the hole (`50 → 51`), and inside the slot widget (`0 → 1`).
   - Calls `refreshSlot("ppr-syn-hole-slot-a", { fresh: true })`, `router.refreshSlot("ppr-syn-nested-inner", { fresh: true })` (verifying `#syn-nested-outer-token` stays unchanged), and `refreshSlot("ppr-syn-shell-slot", { fresh: true })` (verifying deadlock-free `revalidatePage(..., { onlyRefreshSlots: true })` shell update after releasing `inflightSlotRenders`), while all three client counters (`501`, `51`, `1`) remain intact.
3. **Block 3.3 — Clock-Based TTL Expiration (`revalidate = 1s`) Inside PPR Static Shell & Dynamic Hole**:
   - Sends an initial `GET /ppr-cache-slot-test?mode=ttl-1`, waits `1.4s` for the 1-second TTL slots to expire by clock without calling any `revalidate*` or `refreshSlot` API, and sends `GET /ppr-cache-slot-test?mode=ttl-2`.
   - Verifies that `#syn-shell-fast-slot-token` (`revalidate={1}` in the PPR Static Shell) and `#syn-hole-fast-slot-token` (`revalidate={1}` in Dynamic Hole #1) both regenerate and recompose `shell.html` via `hasExpiredSlots` + `revalidatePage(..., { onlyRefreshSlots: true })`, while `#syn-shell-token` (host PPR shell) and the `60s` slots remain cached.

---

## 6. Suite 5: Horizontal Segmentation (`/horizontal-segmentation-test` / `/t-rigurous-hs`)

### 6.1. Purpose & Scope
Tests Dinou's **Horizontal Segmentation** architecture (`layout.rsc` vs. `page.rsc` separation, `layout_functions.ts` independent lifecycle, client `layoutCache` & `pageCache`, dynamic layout parameters, layout-level access control, error boundary isolation inside `<DinouPageSlot />`, `reset_layout` / `no_layout` boundaries, and surgical `revalidatePage` vs. `revalidateLayout` re-composition).

### 6.2. The 13 Automated Scenarios (`13 / 13 PASSED`)

| # | Scenario | What It Verifies & Asserts | Status |
| :--- | :--- | :--- | :--- |
| **1** | **Layout Manifest (`__DINOU_LAYOUTS__`) & Independent Props** | Verifies `window.__DINOU_LAYOUTS__` contains the discovered layout hierarchy and `!horizontal-segmentation-test/no-layout-page`, and confirms `layout_functions.ts` (`getProps`) and `page_functions.ts` (`getProps`) inject independent props into `layout.tsx` and `page.tsx`. | **PASSED** |
| **2** | **Sibling Soft Navigation (`page.rsc` Only, `0` `/____rsc_layout____` Requests)** | Soft-navigates across `/horizontal-segmentation-test` → `/sibling-a` → `/sibling-b` → `/horizontal-segmentation-test`. Asserts **0 `/____rsc_layout____` network fetches** and 100% preservation of layout client `mountId`, `clicks`, and server `layoutSeq`. | **PASSED** |
| **3** | **Client `pageCache` Deduplication vs. `<Link fresh>` Cache Bypass** | Revisits `/sibling-a` via normal `<Link>` (`0` network requests, served from `pageCache`), then mutates server state and clicks `<Link fresh>` to `/sibling-a` (`1` `/____rsc_page____` fetch with fresh server data, `0` layout fetches). | **PASSED** |
| **4** | **Multi-Level Nested Layouts (`/nested/page-1 ↔ page-2`) & Parallel `@slot` Error Containment** | Navigates into L2 nested layout (`/nested/page-1` ↔ `/nested/page-2`), verifying L1 layout never re-fetches, L2 layout fetches once on entry and stays mounted between `page-1` and `page-2`, and `@badge` parallel slot error boundary catches `?crash_slot=1` without crashing L1/L2 layouts or the page. | **PASSED** |
| **5** | **Dynamic Layout Params (`dept/[deptId]`): Intra-Param vs. Inter-Param** | Navigates `/dept/eng` → `/dept/eng/Overview` (same `deptId="eng"`: `0` layout fetches, `dept` layout state preserved) → `/dept/sales` (different `deptId="sales"`: `1` `/____rsc_layout____` fetch with new `deptId="sales"`). | **PASSED** |
| **6** | **Dynamic Layout `validateParams` Enforcement (`HTTP 404`)** | Requests `/dept/invalid` where `layout_functions.ts` `validateParams` returns `false`: asserts HTTP `404` on both raw SSR `GET` and `/____rsc_layout____`. | **PASSED** |
| **7** | **Dynamic Layout `getStaticPaths` + `allowISG: false`** | Verifies pre-rendered `/locked/alpha` returns `200` while unlisted `/locked/unlisted` is blocked with HTTP `404` on both SSR HTML and `/____rsc_layout____`. | **PASSED** |
| **8** | **`router.refresh()` vs. `router.refresh({ layout: true })` + Query String Integrity** | On `?filter=active`, verifies `router.refresh()` fetches only `/____rsc_page____` (`0` layout fetches) while forwarding `?filter=active`, and `router.refresh({ layout: true })` fetches both `/____rsc_layout____` and `/____rsc_page____` while preserving layout client `useState`. | **PASSED** |
| **9** | **Page Error Boundary (`error.tsx`) Isolation Inside `<DinouPageSlot />` & Recovery** | Navigates to `/broken-page`, verifying `error.tsx` renders inside `<DinouPageSlot />` while the parent layout navbar/state stays interactive, and recovers cleanly via soft navigation back to `/horizontal-segmentation-test`. | **PASSED** |
| **10** | **`reset_layout` Boundary (`/reset-branch` & `/reset-branch/sub`)** | Navigates to `/reset-branch` and `/reset-branch/sub`, verifying the ancestor section layout unmounts and the branch's own layout mounts cleanly. | **PASSED** |
| **11** | **`no_layout` Boundary (`/no-layout-page`)** | Navigates to `/no-layout-page` (`no_layout`), verifying standalone page rendering without any ancestor layout and clean layout remount upon returning. | **PASSED** |
| **12** | **Surgical On-Demand Revalidation (`revalidatePage` vs. `revalidateLayout` vs. `revalidateTag`)** | Verifies `revalidatePage` updates only `page.rsc` + `index.html` (reusing cached `layout.rsc` without re-executing `layout.tsx`), and `revalidateLayout` / `revalidateTag("hs-section-layout-tag")` updates `layout.rsc` and lazily re-composes child `index.html` on the next `GET` without re-executing child `page.tsx`. | **PASSED** |
| **13** | **Clock-Based Layout TTL (`revalidate = 1s`) vs. Page TTL (`revalidate = 1s`) Surgical Expiration** | On `/ttl-isr` (Layout TTL `1s`, Page TTL `3600s`), waits `1.25s` and verifies the layout expires by clock and lazily recomposes `index.html` (`301`) while keeping the child page frozen (`100`). On `/ttl-page-only` (Page TTL `1s`, Section Layout TTL `3600s`), waits `1.25s` and verifies background ISR delegates to `revalidatePage`, updating the page to `302` while composing with cached `layout.rsc` (`110`) without re-executing `layout.tsx`. | **PASSED** |

---

## 7. Suite 6: Full Triple Synergy — Horizontal + Vertical + PPR (`/triple-sinergy-test` / `/t-rigurous-triple-sinergy`)

### 7.1. Purpose & Scope
Combines **Horizontal Segmentation**, **Vertical Segmentation (`<DinouCacheSlot>`)**, and **Partial Prerendering (PPR)** simultaneously in a single multi-level route hierarchy (`src/triple-sinergy-test/` in `test-9.0.2` and `src/t-rigurous-triple-sinergy/` in `dinou-e2e`). Detailed architectural diagrams and bug root-cause analyses are also recorded in `rigurous-triple-sinergy.md`.

### 7.2. The 13 Automated Scenarios (`13 / 13 PASSED`)

| # | Scenario | What It Verifies & Asserts | Status |
| :--- | :--- | :--- | :--- |
| **1** | **Raw PPR Stream Split & Static Opt-Out** | Splits raw HTTP response of `/triple-sinergy-test?mode=stream-check` at `<template id="ppr-content-`: verifies L1 layout, L1 layout slot, PPR Page A static shell, PPR Page A shell slot, and hole fallback are in `shellPart`, while the dynamic hole (`mode=stream-check`) and hole `<DinouCacheSlot>` arrive in `streamPart`. Verifies sibling `/static-a` (`export const ppr = false`) has zero streamed `<template>` chunks. | **PASSED** |
| **2** | **PPR Static Shell Immutability vs. Live Dynamic Hole on Unrevalidated Mutation** | Mutates `layoutSeq`, `pprAPageSeq`, and `pprAHoleSeq` to `101` without revalidation. Asserts across both raw `GET` and `/____rsc_page____` (`router.refresh()`) that `shell.page.json` keeps the outer page shell (`100`), layout (`100`), and cached hole slot (`100`) frozen while splicing live dynamic hole updates (`101`). | **PASSED** |
| **3** | **Cross-Mode Horizontal Soft Navigation (`PPR A → PPR B → Static A → Static B → PPR B → PPR A`)** | Performs 5 soft navigations across PPR and Static (`ppr = false`) sibling routes sharing the L1 PPR layout. Asserts **0 `/____rsc_layout____` requests** and 100% preservation of L1 layout and L1 layout slot client `mountId` and `useState` counters. | **PASSED** |
| **4** | **Live Vertical `refreshSlot` Across Layout Slot, PPR Shell Slot & PPR Hole Slot** | Tests direct and prop-passed `"use server"` actions inside the cached slot in the dynamic PPR hole, bumps slot counters, and calls `refreshSlot` on the hole slot, PPR shell slot, and layout slot (`router.refreshSlot`), asserting in-place updates (`100 → 101`) with preserved client `useState`. | **PASSED** |
| **5** | **Nested `<DinouCacheSlot>` (Outer → Inner) Inside Dynamic PPR Hole** | Bumps both outer and inner nested slot counters inside the dynamic PPR hole and calls `revalidateTag("ts-hole-nested-inner-tag")`: asserts `refreshNestedSlotsInTree` updates only the inner slot (`100 → 101`) while keeping the outer slot cached (`100`). | **PASSED** |
| **6** | **Surgical `revalidateTag("ts-ppr-a-hole-slot-tag")`** | With `layoutSeq = 999` and `pprAPageSeq = 999` (unrevalidated), invalidates only the hole slot tag (`102`): asserts the hole slot updates on the next PPR stream while the PPR static shell (`100`) and layout (`100`) remain untouched. | **PASSED** |
| **7** | **Surgical `revalidateTag("ts-ppr-a-shell-slot-tag")`** | With `layoutSeq = 999` and `pprAPageSeq = 999` (unrevalidated), invalidates only the PPR static-shell slot tag (`102`): asserts `revalidatePage(..., { onlyRefreshSlots: true })` updates the shell slot in `shell.page.json` / `shell.html` to `102` and preserves hole streaming without re-executing `layout.tsx` (`100`) or `page_functions.ts` (`100`). | **PASSED** |
| **8** | **Surgical `revalidatePage("/triple-sinergy-test")` & `revalidateTag("ts-ppr-a-page-tag")` on PPR Route** | With `layoutSeq = 999` and `pprAShellSlotSeq = 999` (unrevalidated), revalidates the PPR page (`100 → 102 → 103`): asserts `revalidatePage` updates `shell.html`, `shell.rsc`, and `shell.page.json` while preserving `[data-ppr-hole]` streaming, cached `layout.rsc` (`100`), and cached `ts-ppr-a-shell-slot` (`102`). | **PASSED** |
| **9** | **Surgical `revalidateTag("ts-layout-shell-slot-tag")` Across Static & PPR Children** | Invalidates only the L1 layout's `<DinouCacheSlot>` tag (`102`) with child page counters at `999`: asserts `revalidateLayout` updates `layout.rsc` and lazily re-composes both Static child `/static-b` (`101`) and PPR child `/triple-sinergy-test` (`103`) to display `layoutSlotSeq = 102` without re-executing either child `page.tsx`. | **PASSED** |
| **10** | **`revalidateLayout("/triple-sinergy-test")` & `revalidateTag("ts-layout-tag")` Across All PPR & Static Children** | Revalidates the L1 layout (`100 → 105 → 106`) with all child page counters at `999`: asserts PPR A, PPR B, Static A, and Static B all lazily re-compose their `shell.html` / `index.html` with `layoutSeq = 105/106` while keeping their cached page shells (`103, 100, 100, 101`) and PPR hole streaming intact. | **PASSED** |
| **11** | **Multi-Level Nested Layout (`L1 + L2`) Soft Navigation & Ancestor `revalidateLayout` Cascade** | Soft-navigates to `/triple-sinergy-test/nested` (PPR) and `/triple-sinergy-test/nested/static-child` (`ppr = false`) with 0 L1 layout fetches, then revalidates ancestor L1 layout (`107`) and verifies automatic cascade to L2 `layout.rsc` and lazy HTML re-composition on both nested PPR and nested Static children. | **PASSED** |
| **12** | **`router.refresh()` vs. `router.refresh({ layout: true })` with Query Params (`?mode=live-query`) + `no_layout` PPR Boundary** | Verifies `router.refresh()` on `/triple-sinergy-test?mode=live-query` makes 0 `/____rsc_layout____` fetches while forwarding `?mode=live-query` to the dynamic PPR hole, `router.refresh({ layout: true })` refreshes both while preserving layout client state, and soft-navigation to `/triple-sinergy-test/no-layout-ppr` (`no_layout` + PPR + `<DinouCacheSlot>`) and back works with `0` hydration errors. | **PASSED** |
| **13** | **Clock-Based `<DinouCacheSlot revalidate={1}>` TTL Expiration in PPR Static Shell & Dynamic Hole Preserving Segmented Layout & Page** | Mutates 1s-TTL slots in the PPR Static Shell and Dynamic Hole to `501` while poisoning L1 Layout, PPR Page A, and `3600s` slots to `999` without calling `revalidateTag`. Waits `1.25s` for the 1s clock TTL to expire, calls `refreshSlot` without `{ fresh: true }`, and verifies both DOM and raw wire (`shellPart` and `streamPart`) update to `501` while L1 Layout, PPR Page A, and `3600s` slots remain frozen. | **PASSED** |

---

## 8. Suite 7: Pairwise Synergy #2 — Pure Horizontal Segmentation + `<DinouCacheSlot>` Without PPR (`/hs-cache-slot-test` / `/t-rigurous-hs-cache-slot`)

### 8.1. Purpose & Scope
Tests the interaction between **Horizontal Segmentation** (`layout.rsc` vs. `page.rsc`, `@sidebar` parallel route slots, multi-level nested layouts, and client `pageCache` / `layoutCache`) and **Vertical Segmentation** (`<DinouCacheSlot>`, `refreshSlot`, `revalidateTag`, nested slots, and `revalidate={0}`) on standard non-PPR routes (`ppr = false`). Detailed root-cause analyses of the client-side `slotOverrideCache` and `knownClientSlots` unmounted refresh architecture are recorded in `rigurous-hs-cache-slot.md`.

### 8.2. The 11 Automated Scenarios (`11 / 11 PASSED`)

| # | Scenario | What It Verifies & Asserts | Status |
| :--- | :--- | :--- | :--- |
| **1** | **Baseline Segmented Render (`L1 Layout + @sidebar + Page A`) & Multi-Level Client State Init** | Resets and revalidates all segments (`100` / `200` baselines) and increments client `useState` counters inside L1 Layout, L1 Layout Slot, `@sidebar` Host, `@sidebar` Slot, Page A Host, and Page A Slot, recording their initial `mountId` values. | **PASSED** |
| **2** | **Surgical Page A Slot Revalidation (`revalidateTag` + `refreshSlot`) & Server Action Prop in Slot** | Bumps `l1LayoutSeq`, `pageASeq`, and `pageASlotSeq` (`200 -> 201`), then calls `revalidateTag("hscs-page-a-slot-tag")` + `refreshSlot("hscs-page-a-slot-tag")` and `refreshSlot("hscs-page-a-slot", true)` (`201 -> 202`). Verifies `pageASlotSeq` updates in place while `l1LayoutSeq` (`100`) and `pageASeq` (`200`) are untouched, client `useState` and `mountId` inside the slot are preserved, and the prop-passed `"use server"` action (`hscsSlotServerAction`) executes over RPC. | **PASSED** |
| **3** | **Surgical L1 Layout Slot & `@sidebar` Parallel Slot Revalidation (Preserving Host Layout & Page)** | Bumps `l1SlotSeq` (`100 -> 101`) and `sidebarSlotSeq` (`100 -> 101`), then invalidates and refreshes `"hscs-l1-slot-tag"` and `"hscs-sidebar-slot-tag"`. Verifies both layout-level slots update to `101`, their internal client `useState` and `mountId`s remain intact, `@sidebar`'s prop-passed `"use server"` action succeeds, and neither L1 Layout host (`100`) nor Page A host (`200`) re-executes. | **PASSED** |
| **4** | **Cross-Axis Shared Tag (`hscs-shared-tag`) Simultaneous Layout Slot + Page Slot Update** | Bumps `l1SharedSlotSeq` (`100 -> 101`) and `pageASharedSlotSeq` (`200 -> 201`), then calls `revalidateTag("hscs-shared-tag")` + `refreshSlot("hscs-shared-tag")` once. Verifies both the L1 layout slot (`101`) and Page A slot (`201`) update simultaneously without re-executing `layout.tsx` (`100`) or `page.tsx` (`200`). | **PASSED** |
| **5** | **Nested `<DinouCacheSlot>` (`Outer + Inner`) Surgical Inner vs. Outer Refresh in Layout & Page** | Bumps both outer and inner counters in L1 Layout and Page A, invalidates only the inner tags (`"hscs-l1-inner-tag"` and `"hscs-page-a-inner-tag"`), and verifies `refreshNestedSlotsInTree` updates the inner slots (`101` and `201`) while keeping the outer slots cached (`100` and `200`). Then invalidates the outer tags and verifies both outer (`102`, `202`) and inner (`103`, `203`) slots update. | **PASSED** |
| **6** | **Dynamic `<DinouCacheSlot revalidate={0}>` Storage Bypass Inside Static Non-PPR Page** | Bumps `pageADynSlotSeq` (`200 -> 201`) without revalidating any tag or page, calls `router.refresh()`, and verifies `hscs-page-a-dyn-slot` (`revalidate={0}`) bypasses storage caching (`201`) while host Page A remains cached (`200`). | **PASSED** |
| **7** | **Round-Trip Soft Navigation (`Page A -> Page B -> Page A`): `0` Network Hits + Refreshed Slot Persistence** | Refreshes `hscs-page-a-slot` to `203` on Page A, soft-navigates to `/hs-cache-slot-test/page-b` (`0` `/____rsc_layout____` fetches, L1 Layout & `@sidebar` client state preserved), and soft-navigates back to `/hs-cache-slot-test`. Asserts **`0` `/____rsc_page____` and `0` `/____rsc_layout____` network requests** (served from `pageCache`) and verifies `slotOverrideCache` preserves the refreshed `203` slot tree. | **PASSED** |
| **8** | **Unmounted Slot Refresh on Sibling Route (`Refresh Page A Slot While on Page B -> Return to Page A`)** | Navigates to `/hs-cache-slot-test/page-b` (unmounting Page A), bumps `pageASlotSeq` to `204`, calls `revalidateTag("hscs-page-a-slot-tag")` + `refreshSlot("hscs-page-a-slot-tag")` while `hscs-page-a-slot` is **unmounted**, and immediately soft-navigates back to Page A. Verifies `knownClientSlots` + `slotOverrideCache` refreshes the unmounted slot in the background and renders `204` on Page A. | **PASSED** |
| **9** | **Multi-Level Nested Layout (`/nested`) Slot Refresh & Round-Trip (`/nested -> /page-b -> /nested`)** | Soft-navigates to `/hs-cache-slot-test/nested` (`0` L1 layout fetches), increments L2 Layout and L2 Slot client `useState`, surgically refreshes L2 Layout Slot (`400 -> 401`) and Nested Page Slot (`500 -> 501`), and performs a round-trip soft navigation (`/nested -> /page-b -> /nested`) verifying `slotOverrideCache` preserves both `401` and `501` with `0` `/____rsc_page____` fetches. | **PASSED** |
| **10** | **Host Segment Revalidation (`revalidatePage` & `revalidateLayout`) Coexistence with Cached Slots** | Revalidates host Page A (`200 -> 205`) and host L1 Layout (`100 -> 105`) without invalidating slot tags, verifying both hosts update while reusing their cached `<DinouCacheSlot>` entries (`204` and `101`) from `slots/<id>/slot.json` and preserving L1 Layout & `@sidebar` client `mountId`s. | **PASSED** |
| **11** | **Clock-Based `<DinouCacheSlot revalidate={1}>` TTL Expiration in Static L1 Layout & Static Page A** | Mutates 1s-TTL slots in Static L1 Layout and Static Page A to `501` while poisoning L1 Layout, Page A, and `3600s` slots to `999` without calling `revalidateTag`. Waits `1.25s` for the 1s clock TTL to expire, calls `refreshSlot` without `{ fresh: true }`, and verifies DOM, raw `index.html`, and `/____rsc_layout____` update to `501` while preserving host Layout, host Page A, and `3600s` slots. | **PASSED** |

---

## 9. Suite 8: Pairwise Synergy #3 — Pure Horizontal Segmentation + PPR Without `<DinouCacheSlot>` (`/hs-ppr-test` / `/t-rigurous-hs-ppr`)

### 9.1. Purpose & Scope
Tests the pure interaction between **Horizontal Segmentation** (`layout.rsc` / `shell.layout.json` vs. `shell.rsc` / `shell.page.json`, `@sidebar` parallel route slots, multi-level nested layouts, `reset_layout` / `no_layout` boundaries, and dynamic `[team]` layout parameter validation) and **Partial Prerendering (`ppr = true`)** (`shell.html`, pre-order `ppr-hole-N` indexing across layouts and pages, static `<Suspense>` vs. dynamic `<Suspense>` resolution, and `spliceDynamicHolesIntoShell` on both `/____rsc_layout____` and `/____rsc_page____`) without `<DinouCacheSlot>`. Detailed architectural diagrams, empirical TDD bug root-cause analyses, and a developer usage guide are recorded in `rigurous-hs-ppr.md`.

### 9.2. The 12 Automated Scenarios (`12 / 12 PASSED`)

| # | Scenario | What It Verifies & Asserts | Status |
| :--- | :--- | :--- | :--- |
| **1** | **Raw Wire PPR Stream Split Across Segmented Layout + `@sidebar` + Page A (`shell.html` vs. `<template>`) & Static `<Suspense>` + Opt-Out** | Fetches `/hs-ppr-test?mode=wire-check&lmode=l-wire` and splits wire HTML at `<template id="ppr-content-`. Asserts `shell.html` contains the static L1 shell (`100`), `@sidebar` shell (`100`), Page A shell (`100`), and resolved Static `<Suspense>` (`100`), plus `data-ppr-hole` placeholders for `ppr-hole-1`, `ppr-hole-2`, `ppr-hole-4`, and `ppr-hole-5` (skipping Static `<Suspense>` #3 and deduplicating nested `<Suspense>` inside Hole 2). Also verifies `/hs-ppr-test/static-optout` (`ppr = false`) emits zero PPR scripts/templates. | **PASSED** |
| **2** | **Unrevalidated Mutation: Frozen Layout & Page Static Shells (`shell.layout.json` & `shell.page.json`) vs. Live Dynamic Holes on `router.refresh()` & `router.refresh({ layout: true })`** | Increments client `useState` counters in L1 Layout and Page A (`count = 1`), then mutates all server counters to `101` without revalidating. Verifies `router.refresh()` keeps Page A's static shell frozen at `100` (`shell.page.json`) while updating Page A's dynamic holes to `101`, and `router.refresh({ layout: true })` keeps L1 Layout & `@sidebar` static shells frozen at `100` (`shell.layout.json` + `spliceDynamicHolesIntoShell`) while updating L1 & `@sidebar` dynamic holes to `101`, with `0` client remounts. | **PASSED** |
| **3** | **Surgical Page Revalidation (`revalidateTag('hsppr-page-a-tag')`) Composing With Cached `layout.rsc` Without Re-Executing L1 Layout** | Mutates Page A counters to `102` (while L1 Layout in-memory counter is `101` unrevalidated) and calls `revalidateTag("hsppr-page-a-tag")`. Verifies `revalidatePage` regenerates Page A (`102`) and composes `shell.html` with cached `layout.rsc` (`100`, not `101`), and `router.refresh()` updates Page A's DOM shell to `102` while L1 Layout stays `100`. | **PASSED** |
| **4** | **Surgical Layout Revalidation (`revalidateTag('hsppr-l1-layout-tag')`) + Lazy `shell.html` Re-Composition Preserving Frozen Page A Shell** | Bumps L1 Layout counters to `103` and poisons Page A's in-memory shell counter to `999` (without revalidating Page A), then calls `revalidateTag("hsppr-l1-layout-tag")`. Verifies lazy `shell.html` re-composition combines fresh `layout.rsc` (`103`) with Page A's frozen `shell.rsc` (`102`, not `999`), and `router.refresh({ layout: true })` updates L1 DOM shell to `103`. | **PASSED** |
| **5** | **Cross-Mode Horizontal Soft Navigation (`PPR Page A -> PPR Page B -> Static Opt-Out -> PPR Page A ?mode=nav-query`: `0` Layout Remounts)** | Soft-navigates across `/hs-ppr-test` (`ppr = true`) → `/hs-ppr-test/ppr-b` (`ppr = true`) → `/hs-ppr-test/static-optout` (`ppr = false`) → `/hs-ppr-test?mode=nav-query`, verifying L1 Layout's `mountId` and client `count` (`1`) are preserved without remounting and query parameters reach Page A's dynamic holes. | **PASSED** |
| **6** | **Multi-Level Nested PPR Hierarchy (`/nested`: L1 Hole #1 + `@sidebar` Hole #2 + L2 Hole #3 + Nested Page Hole #4) & Surgical L2 Revalidation** | Verifies raw wire on `/hs-ppr-test/nested?nmode=nested-wire` contains `ppr-hole-1..4` in `shell.html` and streams all 4 `<template>` chunks. Soft-navigates to `/nested`, poisons Nested Page in-memory shell to `888`, calls `revalidateTag("hsppr-l2-layout-tag")` (`201`), and verifies lazy `shell.html` re-composition updates L2 Layout shell to `201` while keeping Nested Page frozen at `100`. | **PASSED** |
| **7** | **Ancestor Layout Revalidation Propagation (`revalidateLayout('/hs-ppr-test')` -> Lazy Leaf `layout.rsc` & `shell.html` Re-Composition on `/nested`)** | Bumps ancestor L1 Layout to `301`, poisons Nested Page in-memory shell to `777`, and calls `revalidateLayout("/hs-ppr-test")`. Requests `/hs-ppr-test/nested` and verifies `handler.js` detects `maxAncestorGen > leafLayout.generatedAt`, regenerates `/nested`'s leaf `layout.rsc` (L1=`301`, L2=`201`), and recomposes `/nested`'s `shell.html` while keeping Nested Page frozen at `100`. | **PASSED** |
| **8** | **Full-Segment `revalidatePath('/hs-ppr-test/nested')` Simultaneous Layout Shell + Page Shell Regeneration Preserving Client State** | Bumps both L2 Layout and Nested Page counters to `401`, calls `revalidatePath("/hs-ppr-test/nested")`, and triggers `router.refresh({ layout: true })`, verifying both L2 Layout shell (`401`), Nested Page shell (`401`), and dynamic holes (`401`) update in the DOM while preserving L1 and L2 client `mountId`s and `useState` counters. | **PASSED** |
| **9** | **Standalone PPR Boundaries: `reset_layout` (`/reset-ppr`) & `no_layout` (`/no-layout-ppr`) Wire Split & Hydration** | Fetches `/hs-ppr-test/reset-ppr?rmode=reset-wire` and `/hs-ppr-test/no-layout-ppr?nlmode=nl-wire`, verifying neither route includes ancestor `#hsppr-l1-layout`, both pre-render isolated static shells (`100`) in `shell.html`, and both stream `ppr-hole-1` with live query parameters (`reset-wire` and `nl-wire`). | **PASSED** |
| **10** | **Dynamic Layout Parameter Validation (`validateParams` + `getStaticPaths` + `allowISG = false`) on PPR Routes (`/team/[team]`)** | Verifies pre-rendered `/hs-ppr-test/team/alpha?tmode=alpha-wire` returns `200` with `Team Shell: alpha` in `shell.html` and `alpha-wire` in the streamed `<template>`, while `/team/beta` (`allowISG = false`) and `/team/gamma` (`validateParams() === false`) return `404` on both HTML and `/____rsc_layout____`. | **PASSED** |
| **11** | **Clock-Based Layout TTL Expiration (`revalidate = 1s` in `layout_functions.ts`) + Lazy `shell.html` Re-Composition Preserving Long-Lived PPR Child Page (`revalidate = 3600s`)** | Soft-navigates to `/hs-ppr-test/ttl-ppr`, increments client state in the TTL layout, mutates TTL layout counters to `501`, and poisons the child PPR page's in-memory shell counter to `999` without calling any `revalidate*` function. Waits `1.3s` for the layout's 1-second TTL to expire by clock and fetches `/hs-ppr-test/ttl-ppr?ttlmode=ttl-verified`. Verifies `layout.rsc` and `shell.layout.json` regenerate automatically to `501` and lazily recompose `shell.html` (`501`), while the child PPR page (`revalidate = 3600s`) remains frozen at `100` (not `999`), and `router.refresh({ layout: true })` updates the DOM to `501` while preserving client state. | **PASSED** |
| **12** | **Inverse Clock-Based PPR Child Page TTL Expiration (`revalidate = 1s` in `page_functions.ts`) Composing With Cached Long-Lived L1 Layout (`revalidate = 3600s`)** | Soft-navigates to `/hs-ppr-test/page-ttl-ppr`, mutates the child PPR page counters to `601`, and poisons the parent L1 Layout in-memory shell counter to `999` without calling any `revalidate*` function. Waits `1.25s` for the child page's 1-second TTL to expire by clock, triggers background ISR (`GET /hs-ppr-test/page-ttl-ppr?pttl=trigger`), and verifies `GET /hs-ppr-test/page-ttl-ppr?pttl=verify` serves the regenerated child PPR page shell (`601`) composed with the cached L1 Layout (`301`, not `999`), and `router.refresh()` updates the DOM to `601` while preserving L1 Layout state. | **PASSED** |
