# End-to-End & Unit Test Coverage for New Dinou Architecture & Features

## Executive Summary

All four architectural improvements and new capabilities introduced in this version are thoroughly covered by automated tests in [`e2e/example.spec.ts`](./e2e/example.spec.ts) (across both production AOT/SSG and development modes) as well as standalone core pipeline tests in [`tests/promise-streaming.test.mjs`](./tests/promise-streaming.test.mjs):

1. **[`promise.md`](./promise.md)** — Server-to-Client Promise Streaming & React 19 `use()` Support
2. **[`zero-hydration.md`](./zero-hydration.md)** — Zero Hydration Mismatch & Inline RSC Streaming Architecture
3. **[`ppr-per-segment.md`](./ppr-per-segment.md)** — Per-Segment Partial Prerendering (`ppr`) & Non-Inheritance Model
4. **[`allowISG.md`](./allowISG.md)** — Per-Segment `allowISG` & `validateParams` Architecture + Global Default in `dinou.config.js`

---

## 1. Test Coverage for [`promise.md`](./promise.md) (Server-to-Client Promise Streaming & React 19 `use()`)

**Test Suite in `e2e/example.spec.ts`**: `Server-to-Client Promise Streaming & React 19 use() (/t-promise)` (`L8307–L8507`)
**Standalone Core Pipeline Runner**: `tests/promise-streaming.test.mjs`
**Fixture Routes**: `src/t-promise/`, `src/t-promise/ppr/`, `src/t-promise/getprops/`

| Test Case | Location in `e2e/example.spec.ts` | What Is Verified |
| :--- | :---: | :--- |
| **1. Strategy 9 (`/t-promise`): RSC passes un-awaited `Promise` & `Promise[]` to Client Component** | `L8308–L8372` | • `asyncRenderJSXToClientJSX` does **not** prematurely `await` or unwrap `Promise` props or `Promise[]` arrays passed to `"use client"` components.<br>• Initial SSR HTML (`GET /t-promise`) streams `<Suspense>` fallbacks and resolved `<template>` replacements without blocking TTFB.<br>• Segmented Flight RSC endpoint (`GET /____rsc_page____/t-promise`) serializes `$@` promise chunks progressively.<br>• Browser hydration unwraps `use(promise)` inside `<Suspense>` with zero console or hydration errors. |
| **2. Strategy 9 + PPR (`/t-promise/ppr`): Client Component with `Promise` prop inside `<Suspense>`** | `L8374–L8439` | • During PPR static shell build (`isPprBuildActive()`), detecting a thenable prop on a Client Component inside `<Suspense>` calls `markDynamicAccess("async-suspense")` and registers `holes: ["ppr-hole-1"]` in `.dinou/dist2/t-promise/ppr/metadata.json` and `data-ppr-hole="ppr-hole-1"` in `shell.html`.<br>• At runtime (`handlePprResume`), `<template id="ppr-content-ppr-hole-1">` wraps resolved HTML in `<!--$-->...<!--/$-->` markers and defers `main.js` execution until after the hole swap, hydrating with zero React `#418` errors. |
| **3. Strategy 12 (`/t-promise/getprops`): Client-First `getProps` returns un-awaited `Promise` to `"use client"` Page + Soft Navigation** | `L8441–L8506` | • `getProps()` in `page_functions.ts` returns `{ docPromise }` without `await` to a `"use client"` `page.tsx` that unwraps `use(docPromise)` inside `<Suspense>`.<br>• Verifies initial SSR hydration on `/t-promise/getprops` and soft client navigation (`<Link>`) across `/t-promise/getprops` $\rightarrow$ `/t-promise` $\rightarrow$ `/t-promise/ppr`. |

---

## 2. Test Coverage for [`zero-hydration.md`](./zero-hydration.md) (Zero Hydration Mismatch & Inline RSC Streaming)

| Architectural Mechanism / Edge Case | Test Suite in `e2e/example.spec.ts` | Lines | What Is Verified |
| :--- | :--- | :---: | :--- |
| **Single-Pass Evaluation (`getJSX`) & Inline RSC Streaming (`__DINOU_RSC_L__` / `__DINOU_RSC_P__`) on Dynamic, PPR & `<DinouCacheSlot>` Routes** | • `Dinou Core: Rigorous Triple Synergy (/t-rigurous-triple-sinergy)`<br>• `Dinou Core: Rigorous HS + DinouCacheSlot Synergy (/t-rigurous-hs-cache-slot)`<br>• `Dinou Core: Rigorous HS + PPR Synergy (/t-rigurous-hs-ppr)` | `L7072–L7122`<br>`L7124–L7171`<br>`L7173–L7238` | • Runs 12 end-to-end scenarios per suite (36 scenarios total) covering SSR, PPR resume, `<DinouCacheSlot>`, `revalidateLayout`, `revalidatePage`, `revalidateTag`, `no_layout`, and `reset_layout`.<br>• Captures all browser console errors and page errors matching `/hydration\|didn't match/i` and asserts `expect(hydrationErrors).toEqual([])` on both initial load and hard reload (`F5`). |
| **Safe `</script>` Boundary Buffering in `createInlineRscHtmlStream` (4096-Byte Chunk Split Protection)** | `React 19 Server Component useId() & Stateless Hooks Suite (/t-use-id)` — Test 3 | `L7807–L8025` (`L7953–L8024`) | • Renders 24 Server/Client `useId()` casuistics streamed over `createInlineRscHtmlStream`.<br>• Verifies that inline `<script>` RSC pushes never split multi-chunk HTML comments (`<!-- -->`) across esbuild, rollup, and webpack bundles, asserting `expect(hydrationWarnings).toEqual([])`. |
| **Deterministic Static/ISG `index.html` Composition from Cached `layout.rsc` + `page.rsc` on Revalidation Cascade** | `Revalidate Cascade (/t-revalidate-cascade)` | `L1470–L1635` | • Verifies that revalidating a child page (`/t-revalidate-cascade/child`) or parent layout (`/t-revalidate-cascade`) composes `index.html` using the active `layout.rsc` so layout and page timestamps match between SSR HTML and `/____rsc_layout_static____`. |
| **Child `ppr = false` Opt-Out Inside `ppr = true` Parent Layout (`layout.static.rsc`)** | `New PPR Mental Model (/t-new-ppr)` — Test 3 (`/t-new-ppr/opt-out-route`) | `L7527–L7636` | • Verifies that `/t-new-ppr/opt-out-route` (`pagePpr: false` inside a `ppr: true` layout) pre-renders `shell.html` / `index.html` and serves consistent RSC payloads without triggering React Error `#418`. |
| **Background ISR Revalidation & Concurrent Dynamic Bailout (`internalBuildId` Preservation)** | `Hybrid Static/Dynamic Bailout (/t-hybrid, /t-hybrid-chaos, /t-hybrid-staggered)` | `L3375–L4180` | • Fires concurrent requests with and without cookies during ISR expiration windows to ensure static clients (`__DINOU_USE_STATIC__`) receive the matching cached `page.rsc` for their `____build_id____`. |
| **`@slot/error.tsx` Error Message Parity When Both `@slot` and `page` Throw** | `Slot Error + Page Error (/t-slots-error-error)` | `L3250–L3275` | • Verifies that `getErrorJSX` (SSR HTML) and `getJSX` (`/____rsc_layout____`) serialize identical `error.message` strings for `@slot` error boundaries. |
| **`useSearchParams()` Hydration Safety on Statically Pre-Rendered Pages (`__DINOU_USE_STATIC__`)** | `SPA Query Params (/t-params/t-spa-query)` | `L4448–L4485` | • Loads `/t-params/t-spa-query?tab=overview&q=first` directly with query params on a build-time static page, verifying zero hydration mismatch on initial `hydrateRoot` and immediate synchronization of `useSearchParams()` after hydration. |

---

## 3. Test Coverage for [`ppr-per-segment.md`](./ppr-per-segment.md) (Per-Segment `ppr` & Non-Inheritance Model)

**Primary Test Suite in `e2e/example.spec.ts`**: `New PPR Mental Model, noDynamic() & DinouCacheSlot Matrix (/t-new-ppr)` (`L7240–L7805`), plus `/t-ppr-layout` (`L5360–L5415`) and `/t-ppr-rigorous` (`L5978–L6210`).

| Test Case / Feature | Location in `e2e/example.spec.ts` | What Is Verified |
| :--- | :---: | :--- |
| **1. Independent Layout & Page Hole Registration (`layout.metadata.json` vs `metadata.json`)** | `L7272–L7438` (Test 1)<br>`L7440–L7525` (Test 2) | • Verifies that `/t-new-ppr` registers `holes: ["ppr-hole-2"]` in `layout.metadata.json` and all 10 composite dynamic holes in `metadata.json`.<br>• Verifies that `noDynamic()` boundaries and cached `<DinouCacheSlot>`s resolve statically at build time (`renderCount` stays constant across requests), while uncached dynamic holes stream via `<template id="ppr-content-...">` on every request. |
| **2. Zero-Hole PPR Route (`/t-new-ppr/all-static`)** | `L7532–L7603` (Test 3) | • Verifies that a `ppr = true` route where all `<Suspense>` boundaries are static (`noDynamic()`) produces `holes: []` and streams zero `<template>` tags at runtime. |
| **3. Child Page Opt-Out (`ppr = false`) Inside `ppr = true` Parent Layout (`/t-new-ppr/opt-out-route`)** | `L7546–L7560`<br>`L7604–L7636` (Test 3) | • Verifies `metadata.json` has `ppr: true, pagePpr: false, holes: ["ppr-hole-2"]`.<br>• The `ppr = false` page resolves its `<Suspense>` boundary statically at build time without `noDynamic()` (0 runtime re-executions), while the `ppr = true` parent layout streams `ppr-hole-2` on every request. |
| **4. Nested Layout Opt-Out (`ppr = false`) Between `ppr = true` Outer Layout and `ppr = true` Page (`/t-new-ppr/opt-in-route`)** | `L7562–L7577`<br>`L7637–L7697` (Test 3) | • Verifies 3-level mixed hierarchy: Outer Layout (`ppr = true`) $\rightarrow$ Inner Nested Layout (`ppr = false`) $\rightarrow$ Page (`ppr = true`).<br>• The inner layout (`ppr = false`) resolves its `<Suspense>` statically in the shell (`opt-in-layout-suspense-resolved`), while the outer layout (`ppr-hole-2`) and page (`ppr-hole-4`) stream their dynamic holes on every request. |
| **5. Non-Inheritance Across Segments & Global Default in `dinou.config.js` (`resolveLayoutChainPpr`)** | `L7699–L7736` (Test 3, Section 4) | • Asserts that `src/t-ppr-layout/nested/layout.tsx` (which has no `layout_functions.ts`) does **not** inherit `ppr = true` from `src/t-ppr-layout/layout.tsx`, resolving `effectivePpr = false` (`defaultPpr = false`).<br>• Asserts that setting `__DINOU_CONFIG__ = { ppr: true }` flips unconfigured segments to `effectivePpr = true`, while segments with explicit `ppr = false` (`src/t-new-ppr/opt-in-route/layout.tsx`) remain `false`. |
| **6. Full-Route Dynamic Bailout When a `ppr = false` Segment Reads Cookies Inside `<Suspense>` (`/t-new-ppr/no-ppr-bailout`)** | `L7739–L7804` (Test 4) | • Verifies that when a segment has `ppr = false` (`/t-new-ppr/no-ppr-bailout`), reading `req.cookies` even inside `<Suspense>` triggers `markAsDynamic()` (`isPprBuildActive() === false`), skipping static shell generation and dynamically rendering the entire route on every request. |

---

## 4. Test Coverage for [`allowISG.md`](./allowISG.md) (Per-Segment `allowISG`, `validateParams` & Global Default in `dinou.config.js`)

**Primary Test Suites in `e2e/example.spec.ts`**:
- `Dinou layout_functions` (`L2849–L3005`)
- `Dinou Core: allowISG() & validateParams() Route Restriction` (`L4318–L4375`)
- `Dinou export default config (pageConfig / layoutConfig)` (`L5552–L5575`)
- `Dinou Core: Rigorous HS + PPR Synergy (/t-rigurous-hs-ppr)` — Scenario 9 (`L7194–L7226`)

| Test Case / Feature | Location in `e2e/example.spec.ts` | What Is Verified |
| :--- | :---: | :--- |
| **1. Static Parent Layout with `allowISG = false` Does Not Block Dynamic Child Routes** | `L2885–L2947` | • `src/t-layout-functions/layout_functions.ts` defines `allowISG = false` on a static layout (`dParams = {}`).<br>• Verifies that dynamic child routes (`/t-layout-functions/dyn/1` and `/t-layout-functions/no-isg/prerendered/posts/post-2`) are not blocked by the static parent layout. |
| **2. `validateParams` at Layout Level + 404 Consistency Across HTML, `layout.rsc`, and `page.rsc`** | `L2885–L2905`<br>`L4348–L4375`<br>`L5552–L5575` | • Valid param (`/t-layout-functions/dyn/1` and `/t-layout-functions/dyn/1/sub`) renders `200 OK`.<br>• Invalid param (`/t-layout-functions/dyn/invalid` and `/t-layout-functions/dyn/invalid/sub`) returns `404` on `GET /t-layout-functions/dyn/invalid`, `GET /____rsc_layout____/t-layout-functions/dyn/invalid`, and `GET /____rsc_page____/t-layout-functions/dyn/invalid`. |
| **3. `allowISG = false` at Dynamic Layout Level + 404 Consistency Across All 3 Endpoints** | `L2907–L2926` | • Pre-rendered layout param (`/t-layout-functions/no-isg/prerendered`) returns `200 OK`.<br>• Non-prerendered layout param (`/t-layout-functions/no-isg/unrendered-slug-123`) returns `404` across `GET /...`, `GET /____rsc_layout____/...`, and `GET /____rsc_page____/...`. |
| **4. Valid Dynamic Layout (`allowISG = false`) Allows Child Dynamic Page (`allowISG = true`) to Generate New Params via ISG** | `L2927–L2936` | • Requests `/t-layout-functions/no-isg/prerendered/posts/post-2` (where `prerendered` is valid in the `allowISG = false` parent layout, and `post-2` is a new un-prerendered param in the `allowISG = true` child page).<br>• Verifies that `isLayoutSegmentBlocked` validates `id = "prerendered"` against the layout's `staticPathsSet` / `layout.rsc` without overwriting `allowISGValue = false` for the child page, returning `200 OK` and caching `post-2` via ISG. |
| **5. Invalid Dynamic Layout (`allowISG = false`) Blocks Valid Child Page Param Across HTML and `page.rsc`** | `L2937–L2947` | • Requests `/t-layout-functions/no-isg/unrendered-slug-123/posts/post-1` (invalid layout param `unrendered-slug-123`, valid child param `post-1`).<br>• Verifies `404 Not Found` on both `GET /...` and `GET /____rsc_page____/...`. |
| **6. Global Default `allowISG` in `dinou.config.js` & Per-Segment Opt-In Override** | `L2948–L3004` | • Verifies that without `__DINOU_CONFIG__`, unconfigured layouts and pages default to `allowISG = true`.<br>• Verifies that with `__DINOU_CONFIG__ = { allowISG: false }`, unconfigured layouts (`dyn/[id]`) and pages (`no-isg/[id]`) default to `allowISG = false`.<br>• Verifies that a segment with explicit `allowISG = true` (`no-isg/[id]/posts/[postId]`) overrides the global `allowISG: false` default and resolves `allowISGValue = true`. |

