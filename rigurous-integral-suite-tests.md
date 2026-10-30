# Dinou v9.0.3 — Rigorous Integral Verification Suite Reference (`6 Suites / 66+ End-to-End Scenarios`)

This document is the master technical reference for the **6 integral verification suites** created in `test-9.0.2` (and ported to `dinou-e2e`) to stress-test every React 19 architecture primitive introduced and refined in **Dinou v9.0.3**—individually, in pairwise combinations, and in full three-way synergy—verified **100% in green with `0` React hydration errors**.

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
|  [Suite 4: /ppr-cache-slot-test]  Pairwise Synergy (PPR + Vertical Segmentation):                 |
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
+---------------------------------------------------------------------------------------------------+
```

### Summary of Execution Results in `test-9.0.2`

| # | Suite Route (`test-9.0.2`) | Companion Route (`dinou-e2e`) | Automated Checks / Scenarios | Result | Hydration Errors |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `/sf-test` | `/t-sf-body` | **13 / 13** RPC & HMR checks | **100% PASS** | `0` |
| **2** | `/ppr-test` | `/t-ppr` | **16 / 16** PPR audit checks | **100% PASS** | `0` |
| **3** | `/cache-slot-test` (+ `/static-host`) | `/t-cache-slot` | **3 / 3** E2E blocks (11 assertions) | **100% PASS** | `0` |
| **4** | `/ppr-cache-slot-test` | `/t-ppr-cache-slot` | **2 / 2** E2E blocks (6 scenarios) | **100% PASS** | `0` |
| **5** | `/horizontal-segmentation-test` | `/t-rigurous-hs` | **12 / 12** automated scenarios | **100% PASS** | `0` |
| **6** | `/triple-sinergy-test` | `/t-rigurous-triple-sinergy` | **12 / 12** automated scenarios (+ F5 & Direct SSR) | **100% PASS** | `0` |

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

### 3.2. The 16 Automated Audit Checks (`16 / 16 Passed`)

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

---

## 4. Suite 3: Vertical Segmentation & Micro-ISR (`/cache-slot-test` / `/t-cache-slot`)

### 4.1. Purpose & Scope
Verifies `<DinouCacheSlot>` and `refreshSlot` / `useRouter().refreshSlot` across static and dynamic host pages: cold-start slot discovery on `/____rsc_slot____/:id`, vertical cache isolation on dynamic pages, `revalidate={0}` bypass, multi-tag shared invalidation (`revalidateTag`), in-place client reconciliation preserving `useState`, `"use server"` reference serialization inside cached slot JSON, and nested `<DinouCacheSlot>` (Outer → Inner) invalidation via `refreshNestedSlotsInTree`.

### 4.2. The 3 Multi-Stage Verification Blocks (`ALL PASSED`)

1. **Block 2.1 — Static Host Page & Cold-Start Slot Endpoints (`/cache-slot-test/static-host`)**:
   - Directly queries `GET /____rsc_slot____/slot-static-host?fresh=1` and `GET /____rsc_slot____/slot-layout-banner?fresh=1` with `x-dinou-current-path: /cache-slot-test/static-host` on a freshly booted server (`slotRegistry` empty), confirming cold-start route pre-evaluation inside `runWithPprContext({ isPpr: true })` and fallback layout discovery.
   - Navigates to `/cache-slot-test/static-host`, invalidates `tag-static-host-slot` + calls `refreshSlot`, reloads the page (`F5`) to confirm `metadata.json` (`slotTags`) triggered static host regeneration, and performs a live `refreshSlot("slot-static-host", { fresh: true })` asserting the slot token updates while `#static-page-time` remains frozen.
2. **Block 2.2 — Vertical Cache Isolation, `revalidate={0}` & Shared Multi-Tag Invalidation (`/cache-slot-test`)**:
   - Reloads the dynamic host page `/cache-slot-test` and asserts `#page-token` and `#slot-nocache-token` (`revalidate={0}`) change on every request, while `#slot-alpha-token`, `#slot-beta-token`, `#slot-gamma-token`, and `#slot-tag-only-token` remain cached.
   - Invalidates `tag-shared` (shared by `slot-beta` and `slot-gamma`) and reloads: asserts `slot-alpha` stays cached while both `slot-beta` and `slot-gamma` regenerate.
3. **Block 2.3 — Live `refreshSlot` by Tag, Server Action Props Inside Cached Slot & Nested Slot Isolation**:
   - Increments `#page-client-counter` (`100 → 102`), invokes both a direct `"use server"` import (`#btn-slot-client-ping`) and a prop-passed `"use server"` action (`#btn-slot-client-prop-ping`) inside a cached `<DinouCacheSlot>`, and calls `refreshSlot("tag-alpha", { fresh: true })`, verifying `slot-alpha` updates in place while `#page-client-counter` stays `102`.
   - Invalidates only `tag-inner` on the nested `<DinouCacheSlot id="slot-nested-inner">` inside `<DinouCacheSlot id="slot-nested-outer">`: verifies `#slot-nested-inner-token` updates while `#slot-nested-outer-token` stays cached both on reload (`refreshNestedSlotsInTree`) and on live `refreshSlot("slot-nested-inner", { fresh: true })`.

---

## 5. Suite 4: Pairwise Synergy — PPR + `<DinouCacheSlot>` (`/ppr-cache-slot-test` / `/t-ppr-cache-slot`)

### 5.1. Purpose & Scope
Tests the interaction between **Partial Prerendering** and **Vertical Segmentation (`<DinouCacheSlot>`)** on a single route where `layout.tsx` and `page.tsx` both use PPR and host `<DinouCacheSlot>` boundaries in every possible structural position:
- **Scenario 1**: `<DinouCacheSlot id="ppr-syn-shell-slot">` directly in the PPR Static Shell (outside `<Suspense>`).
- **Scenario 2A**: Static `<Suspense>` (no dynamic reads) wrapping `<DinouCacheSlot id="ppr-syn-static-suspense-slot">` *before* dynamic holes (testing `holeIndex` alignment).
- **Scenario 2B**: `<DinouCacheSlot id="ppr-syn-slot-with-static-suspense">` wrapping an internal Static `<Suspense>` *before* dynamic holes.
- **Scenario 3 (Dynamic Hole #1 — `ppr-hole-4`)**: Reads `req.cookies.syn_user`, `req.headers["x-syn-probe"]`, and `req.query.mode`, and renders a sibling Client Component (`PprHoleOuterClientState`), a cached slot (`ppr-syn-hole-slot-a`, `revalidate={3600}`), and an uncached slot (`ppr-syn-hole-slot-nocache`, `revalidate={0}`).
- **Scenario 4 (Dynamic Hole #2 — `ppr-hole-5`)**: Reads `req.cookies.syn_tier` and renders nested `<DinouCacheSlot id="ppr-syn-nested-outer">` → `<DinouCacheSlot id="ppr-syn-nested-inner">` inside the streamed hole.
- **Scenario 5 (Dynamic Hole #3 — `ppr-hole-6`)**: Renders `<DinouCacheSlot id="ppr-syn-client-slot">` (containing `<PprSlotInnerClientWidget onServerEcho={echoFromPprSlotAction} />`) **before** `<DynamicSiblingBailoutReader />` triggers PPR postpone (testing `deferPprSuspenseEffect` so build-time slot writes are discarded when a later sibling bails out).
- **Scenario 6 (Dynamic Hole #4 — `ppr-hole-7`)**: Reads `req.cookies.syn_direct_cookie` **directly inside** `<DinouCacheSlot id="ppr-syn-direct-dynamic-slot">`.

### 5.2. The 2 Multi-Stage Verification Blocks (`ALL PASSED`)

1. **Block 3.1 — Raw Wire Streaming Protocol & Slot Caching Inside Dynamic Holes**:
   - Sends two raw HTTP requests to `/ppr-cache-slot-test` with different cookies, headers, and query params (`alice`/`probe-1`/`alpha-mode` vs. `bob`/`probe-2`/`beta-mode`) and splits the wire HTML at `<template id="ppr-content-`.
   - Asserts `ppr-hole-1`, `ppr-hole-4`, `ppr-hole-5`, `ppr-hole-6`, and `ppr-hole-7` placeholders are in `shellPart` and their corresponding `<template>` chunks are in `streamPart` (while static `<Suspense>` boundaries `2A` and `2B` are resolved inline in `shellPart`).
   - Asserts `#syn-shell-slot-token` is cached in `shellPart`, `#syn-hole-1-user` personalizes per request (`alice` vs. `bob`), `#syn-hole-slot-a-token` stays cached across dynamic hole executions, and `#syn-hole-slot-nocache-token` regenerates on every request.
2. **Block 3.2 — Live `refreshSlot` Across Shell, Dynamic Hole & Nested Slots Preserving Client State**:
   - Hydrates `/ppr-cache-slot-test?mode=live-mode`, increments client state in the shell (`500 → 501`), in the hole (`50 → 51`), and inside the slot widget (`0 → 1`).
   - Calls `refreshSlot("ppr-syn-hole-slot-a", { fresh: true })`, `router.refreshSlot("ppr-syn-nested-inner", { fresh: true })` (verifying `#syn-nested-outer-token` stays unchanged), and `refreshSlot("ppr-syn-shell-slot", { fresh: true })` (verifying deadlock-free `revalidatePage(..., { onlyRefreshSlots: true })` shell update after releasing `inflightSlotRenders`), while all three client counters (`501`, `51`, `1`) remain intact.

---

## 6. Suite 5: Horizontal Segmentation (`/horizontal-segmentation-test` / `/t-rigurous-hs`)

### 6.1. Purpose & Scope
Tests Dinou's **Horizontal Segmentation** architecture (`layout.rsc` vs. `page.rsc` separation, `layout_functions.ts` independent lifecycle, client `layoutCache` & `pageCache`, dynamic layout parameters, layout-level access control, error boundary isolation inside `<DinouPageSlot />`, `reset_layout` / `no_layout` boundaries, and surgical `revalidatePage` vs. `revalidateLayout` re-composition).

### 6.2. The 12 Automated Scenarios (`12 / 12 PASSED`)

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

---

## 7. Suite 6: Full Triple Synergy — Horizontal + Vertical + PPR (`/triple-sinergy-test` / `/t-rigurous-triple-sinergy`)

### 7.1. Purpose & Scope
Combines **Horizontal Segmentation**, **Vertical Segmentation (`<DinouCacheSlot>`)**, and **Partial Prerendering (PPR)** simultaneously in a single multi-level route hierarchy (`src/triple-sinergy-test/` in `test-9.0.2` and `src/t-rigurous-triple-sinergy/` in `dinou-e2e`). Detailed architectural diagrams and bug root-cause analyses are also recorded in `rigurous-triple-sinergy.md`.

### 7.2. The 12 Automated Scenarios (`12 / 12 PASSED`)

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

