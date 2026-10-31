# Partial Prerendering (PPR) in Dinou — Architecture, v9.0.3 Fixes & Reference Guide

This document provides a complete technical overview of **Partial Prerendering (PPR)** in Dinou, the architectural fixes implemented in **v9.0.3**, how build-time static shell extraction and request-time streaming resume work under the hood, and usage patterns for `dinou-docs`.

---

## 1. Overview: What is PPR in Dinou?

**Partial Prerendering (PPR)** combines the instant `0ms TTFB` of Static Site Generation (SSG) with per-request dynamic Server Component streaming over a single HTTP response:

1. **At Build Time (or On-Demand Static Shell Generation)**:
   - Dinou renders the route inside a PPR context (`runWithPprContext({ isPpr: true })`).
   - Static parts of the layout and page—including `<Suspense>` boundaries whose children only perform static async work (e.g., cached data fetches, timers, computations that do **not** read request-specific data)—are **fully resolved and baked into `shell.html` and `shell.rsc`**.
   - Whenever an async Server Component wrapped inside a `<Suspense>` boundary accesses dynamic request properties (`req.cookies`, `req.headers`, `req.query`, `req.searchParams`, or `bailoutToDynamic()`), Dinou's **Bailout Proxy** throws a `PprBailoutError` (`$$typeof: Symbol.for("dinou.ppr.postpone")`).
   - Instead of bailing out the entire page to dynamic SSR, Dinou catches the `PprBailoutError` at the **nearest enclosing `<Suspense>` boundary**, renders that boundary's `fallback` into the static shell wrapped in a marker (`<div data-ppr-hole="ppr-hole-N" style="display:contents">...</div>`), and records `"ppr-hole-N"` in the route's `metadata.json` (`holes: [...]`).
   - If dynamic request data is accessed **outside** any `<Suspense>` boundary, the `PprBailoutError` bubbles up to the route level (`dynamicState.value = true`), causing a full-route bailout (no `shell.html` is saved, and the route renders dynamically on every request).

2. **At Request Time (`handlePprResume` in `dinou/core/ppr-runtime.js`)**:
   - When a request arrives for a route with a cached PPR shell (`metadata.ppr === true`), Dinou splits `shell.html` at `</body></html>` and **flushes the static shell immediately** to the response stream (`0ms TTFB`), allowing the browser to parse HTML, load CSS/JS bundles, and paint the static shell and `<Suspense>` fallbacks right away.
   - In parallel on the same HTTP connection, Dinou traverses the route's Server Component tree (`streamDynamicHoles`) with the live request context (`cookies`, `headers`, `query`).
   - Only the `<Suspense>` boundaries registered in `metadata.holes` are executed and rendered to HTML via Pass A (RSC) + Pass B (SSR).
   - As each dynamic hole resolves, Dinou streams an HTML `<template id="ppr-content-ppr-hole-N">...</template>` followed by a self-cleaning inline `<script>` that swaps `[data-ppr-hole="ppr-hole-N"]` with the resolved DOM nodes—even **before** React client hydration completes—and finally closes `</body></html>`.

---

## 2. Opt-In & Configuration Hierarchy

Dinou resolves whether a route uses PPR via a 3-tier hierarchy (most specific wins):

1. **Page-level (`page_functions.ts`)** — Highest priority:
   ```ts
   // Opt in a specific page:
   export const ppr = true;
   // Or as a function:
   export function ppr() {
     return true;
   }
   ```
   A child page can also **explicitly opt out** when a parent layout or global config enables PPR:
   ```ts
   // Opt out a specific child page:
   export const ppr = false;
   ```

2. **Layout-level (`layout_functions.ts`)** — Inherited by all descendant pages unless overridden:
   ```ts
   export const ppr = true;
   ```

3. **Global configuration (`dinou.config.js` / `dinou.config.cjs`)** — Project-wide default:
   ```js
   export default {
     ppr: true,
   };
   ```

---

## 3. Architectural Fixes Implemented in Dinou (v9.0.3)

During rigorous auditing of Dinou's PPR implementation (`src/t-ppr-rigorous` and `src/t-rigorous-sinergy`), several subtle edge cases were identified and fixed across the core engine:

### 3.1. Deterministic Build-Time vs. Runtime Hole Indexing & Layout + Page Synchronization
- **Files Modified**: `dinou/core/render-jsx-to-client-jsx.js`, `dinou/core/ppr-runtime.js`, `dinou/core/handler.js`, `dinou/core/build-static-pages.js`
- **Problem**:
  1. During SSG in `handler.js`, `resetPprHoles()` was called *after* `getJSX()` (which already pre-rendered layouts), resetting `holeCounter` and causing `<Suspense>` holes inside `layout.tsx` and `page.tsx` to collide or desynchronize.
  2. When a `<Suspense>` boundary was **static** (resolved at build time without throwing `PprBailoutError`), build-time `asyncRenderJSXToClientJSX` and runtime `streamDynamicHoles` did not increment `holeIndex` identically, shifting hole IDs (`ppr-hole-0`, `ppr-hole-1`, ...) whenever static and dynamic `<Suspense>` boundaries were mixed or nested on the same page.
- **Solution**:
  - Every `<Suspense>` boundary encountered in pre-order traversal increments the 1-based `holeIndex` (`1, 2, 3, ...`) deterministically in both `asyncRenderJSXToClientJSX` (build time) and `streamDynamicHoles` (request time).
  - Only `<Suspense>` boundaries that actually throw `PprBailoutError` during build-time rendering are registered via `registerHole(holeId)` into `metadata.holes`.
  - When a `<Suspense>` boundary resolves statically at build time, both build-time and runtime traversals still traverse its `children` and `fallback` in the exact same order so any **nested** dynamic `<Suspense>` boundary inside a static `<Suspense>` boundary receives the exact same `ppr-hole-N` identifier.
  - `resetPprHoles()` is now called **before** `getJSX()` inside `runWithPprContext({ isPpr: true })`, ensuring layout holes (`ppr-hole-1`) and page holes (`ppr-hole-2`, ...) are numbered in a single unified sequence.

### 3.2. Client Component Reference Handling During Hole Traversal
- **Files Modified**: `dinou/core/ppr-runtime.js`
- **Problem**:
  - In Pass A (`react-server` bundle), `"use client"` components are compiled into Client Reference proxies (`$$typeof: Symbol.for("react.client.reference")`) or functions with `.filepath` / `.$$id`.
  - Previously, `streamDynamicHoles` checked `if (typeof current?.type === "function")` before checking `isClientComponent(current?.type)`, attempting to invoke Client Component proxies on the server or skipping `<Suspense>` holes passed inside Client Component `children` / props.
- **Solution**:
  - `streamDynamicHoles` now checks `isClientComponent(current?.type)` first and never invokes Client Components as Server Components; instead, it traverses `current.props` (`traverseProps`) in deterministic key order so `<Suspense>` holes nested inside Client Component wrappers work seamlessly.

### 3.3. `React.memo` and `React.forwardRef` Server Component Unwrapping
- **Files Modified**: `dinou/core/ppr-runtime.js`
- **Problem**:
  - Build-time `asyncRenderJSXToClientJSX` unwrapped `Symbol.for("react.memo")` and `Symbol.for("react.forward_ref")`, but request-time `streamDynamicHoles` did not, causing dynamic `<Suspense>` boundaries inside `React.memo` or `React.forwardRef` Server Components to be skipped at runtime.
- **Solution**:
  - Added full unwrapping support for `Symbol.for("react.memo")` and `Symbol.for("react.forward_ref")` in `streamDynamicHoles` (while respecting Client Component references).

### 3.4. Layout-to-Page PPR Inheritance & Child Opt-Out (`ppr = false`)
- **Files Modified**: `dinou/core/build-static-pages.js`, `dinou/core/handler.js`, `dinou/core/resolve-module-ppr.js`
- **Problem**:
  - `build-static-pages.js` and `handler.js` checked `Boolean(pageMod.ppr)`, which treated `export const ppr = false` in a child `page_functions.ts` the same as `undefined` when a parent `layout_functions.ts` had `export const ppr = true`, preventing child routes from opting out of PPR.
- **Solution**:
  - Introduced `resolveModulePpr(mod)` returning `true`, `false`, or `null` (when unspecified), and `resolvePprForRoute` / `resolveBuildPprForRoute` so `explicitPagePpr !== null ? explicitPagePpr : inheritedPpr` is respected at both build time and runtime.

### 3.5. On-Demand PPR Static Shell Generation (`dev` Mode & Post-`revalidateTag` Recovery)
- **Files Modified**: `dinou/core/handler.js`, `dinou/core/cache-revalidate.js`
- **Problem**:
  - In `dev` mode (where `build-static-pages.js` does not run ahead of time), or in production after `revalidateTag` invalidates a `<DinouCacheSlot>` inside a PPR route's static shell, `.dinou/dist2/<route>/shell.html` does not exist on disk when the request arrives.
- **Solution**:
  - When `pprEnabled` is true and no cached `shell.html` exists yet, `handler.js` generates the static shell on demand inside `runWithPprContext({ isPpr: true })`, persists `shell.html`, `shell.rsc`, and `metadata.json` (`ppr: true`, `holes`, `slotTags`), and immediately serves the response via `handlePprResume` (`shellPart` + streamed `data-ppr-hole` chunks)—unless an unwrapped dynamic access occurred in Pass A outside `<Suspense>` (`ssgPprUnwrappedBailout`), in which case it cleanly falls back to per-request dynamic SSR without writing `shell.html` (while preserving `platformContext.isSSG === true` static caching for non-PPR routes whose Client Components invoke Server Functions during Pass B SSR).

### 3.6. Safe DOM Template Replacement & XSS Hardening
- **Files Modified**: `dinou/core/ppr-runtime.js`
- **Problem**:
  - Previously, streamed hole replacement scripts injected HTML or error strings in ways that could break if the component output or error message contained `</template><script>` or special quotes, and async hole resolution closures referenced a mutated outer counter (`holeIndex - 1`) instead of the hole's captured index.
- **Solution**:
  - Replacement chunks capture a constant `currentHoleIndex` per `<Suspense>` boundary and emit `<template id="ppr-content-${currentHoleId}">${html}</template>` paired with a DOM node replacement script (`t.replaceWith(c.content)`) and `escapeHtml()` on error fallback messages, guaranteeing `0` `SyntaxError`s and preventing `<template>` breakout.

### 3.7. PPR Client Hydration Stability & Query Parameter Forwarding
- **Files Modified**: `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`
- **Problem**:
  - On initial load of a PPR page (`window.__DINOU_PPR__`), triggering an immediate background `/____rsc_page____` or `/____rsc_layout____` fetch during initial hydration could overwrite already-streamed dynamic holes with their build-time `<Suspense>` fallbacks or drop `window.location.search` query parameters during subsequent client refreshes.
- **Solution**:
  - Skipped redundant initial RSC page/layout fetches when hydrating PPR pages (`window.__DINOU_PPR__`) so streamed dynamic holes never flash back to `<Suspense>` fallbacks, and forwarded `window.location.search` on client-side RSC refreshes so dynamic holes reading `req.query` retain their query parameters.

### 3.8. Clock-Based PPR Static Shell TTL Expiration (`revalidate > 0`) via `revalidatePage`
- **Files Modified**: `dinou/core/handler.js`, `dinou/core/cache-revalidate.js`
- **Problem**:
  - When a PPR route configured a time-based ISR TTL (`export const revalidate = 1` in `page_functions.ts`), `handlePprResume` in `handler.js` served `shell.html` indefinitely without checking whether `Date.now() > pageGeneratedAt + pageRevalidate * 1000`.
- **Solution**:
  - `handler.js` now checks `pageRevalidate > 0 && Date.now() > pageGeneratedAt + pageRevalidate * 1000` before serving a cached PPR shell. When the clock TTL has expired, it serves the current `shell.html` immediately with live streamed holes (Stale-While-Revalidate) while triggering a deduplicated background `revalidatePage(reqPathWithSlash)` inside `backgroundRevalidations` (`ctx.waitUntil`) that regenerates `shell.html`, `shell.rsc`, `shell.page.json`, and `metadata.json` (`generatedAt`, `ppr: true`, `holes`) while composing with the cached `layout.rsc`.

---

## 4. Supported PPR Patterns & Casuistics

| Pattern | Build-Time Behavior (`shell.html`) | Request-Time Behavior (`handlePprResume`) |
|---|---|---|
| **Static Server Component outside `<Suspense>`** | Rendered and baked into `shell.html` | Served immediately in `shellPrelude` (`0ms TTFB`) |
| **Static `<Suspense>` boundary** (async work without `cookies`/`headers`/`query`) | Resolved at build time and baked into `shell.html` (not added to `metadata.holes`) | Served in `shellPrelude`; **not** re-executed or re-streamed at request time |
| **Dynamic `<Suspense>` hole** (reads `cookies`, `headers`, `query`) | Catches `PprBailoutError`, bakes `<div data-ppr-hole="ppr-hole-N">` fallback into `shell.html`, records in `metadata.holes` | Evaluates in parallel at request time and streams `<template id="ppr-content-ppr-hole-N">` + inline DOM swap `<script>` |
| **Client Component (`"use client"`) inside Dynamic `<Suspense>` hole** | Fallback baked into `shell.html` | Streamed at request time via Pass A (RSC) + Pass B (SSR) and hydrated on the client |
| **Nested Dynamic `<Suspense>` inside Static `<Suspense>`** | Outer boundary baked into `shell.html`; inner boundary bails out as `ppr-hole-N` | Outer wrapper served in `shellPrelude`; inner hole streamed on demand |
| **Nested Dynamic `<Suspense>` inside Dynamic `<Suspense>`** | Outer boundary bails out at build time (`ppr-hole-N`) without duplicate inner registration | Outer boundary streams and resolves its inner `<Suspense>` tree at request time |
| **`React.memo` / `React.forwardRef` Dynamic Server Component in `<Suspense>`** | Unwrapped at build time; bails out as `ppr-hole-N` | Unwrapped at request time in `streamDynamicHoles` and streamed cleanly |
| **Layout `<Suspense>` hole + Page `<Suspense>` hole** | Unified hole numbering (`ppr-hole-1` in layout, `ppr-hole-2` in page) | Both layout and page holes stream in parallel on request |
| **Unwrapped dynamic access outside `<Suspense>`** | Route-level `PprBailoutError` aborts static shell caching (`shell.html` not written) | Full route renders dynamically via streaming SSR on every request |

---

## 5. Comprehensive E2E Test Suite Reference

Dinou's PPR engine is verified end-to-end across **Node.js, Deno, Bun, and Cloudflare Workers** and across all three bundlers (**Esbuild, Rollup, and Webpack**) in `e2e/example.spec.ts` through four complementary test suites:

---

### 5.1. Foundational PPR & Layout Inheritance Suite (`/t-ppr`, `/t-ppr-layout`, `/t-ppr-fn`)
- **Source Files**: `src/t-ppr/`, `src/t-ppr-layout/`, `src/t-ppr-fn/`
- **Playwright Spec**: `e2e/example.spec.ts` → `test.describe("Partial Prerendering (PPR)", ...)`
- **Scenarios Covered**:
  1. **Instant Static Shell + Default Dynamic Hole (`/t-ppr`)**: Verifies that `#ppr-static-title` and `#ppr-static-timestamp` ("Static Build Shell Loaded") render immediately from the static shell while `#ppr-dynamic` resolves the default user (`"Alice"`).
  2. **Cookie Personalization Preserving Static Shell (`/t-ppr`)**: Injects cookie `username=Charlie` and verifies that the static shell remains untouched while the dynamic hole personalizes `#ppr-user-name` to `"Charlie"`.
  3. **Query Parameter Personalization (`/t-ppr?user=David`)**: Verifies that `req.query.user` inside a `<Suspense>` boundary bails out only that boundary and streams `"David"` at request time.
  4. **Layout-to-Page PPR Inheritance (`/t-ppr-layout`)**: Enables `export const ppr = true` in `src/t-ppr-layout/layout_functions.ts` and verifies that child and deep 2nd-level nested routes (`/t-ppr-layout/nested?user=DeepNestedChild`) inherit PPR automatically without redeclaring `ppr` in `page_functions.ts`.
  5. **Child Page & Nested Subtree Opt-Out (`/t-ppr-layout/opt-out` & `/t-ppr-layout/nested-optout`)**: Verifies that a child page with `export const ppr = false` or a nested layout with `export function ppr() { return false; }` cleanly opts out its route/subtree from the parent layout's PPR.
  6. **Async Function Opt-In (`/t-ppr-fn`)**: Verifies activating PPR dynamically via `export async function ppr() { return true; }` in `page_functions.ts`.

---

### 5.2. Multi-Level Cascading Opt-In / Opt-Out & Anti-Test Suite (`/t-ppr-levels`, `/t-ppr-anti`)
- **Source Files**: `src/t-ppr-levels/`, `src/t-ppr-anti/`
- **Playwright Spec**: `e2e/example.spec.ts` → `test.describe("Partial Prerendering (PPR): dinou.config.js & Multi-Level Cascading Opt-Out", ...)`
- **Scenarios Covered**:
  1. **3-Level Cascading Override (`Parent Opt-In -> Nested Layout Opt-Out -> Subpage Opt-In`)**:
     - On `/t-ppr-levels/nested-optout`, `layout_functions.ts` sets `ppr = false`, disabling PPR (`metadata.ppr === false`, no `shell.html`).
     - On its child `/t-ppr-levels/nested-optout/page-optin`, `page_functions.ts` sets `ppr = true`, re-enabling PPR and generating `.dinou/dist2/t-ppr-levels/nested-optout/page-optin/shell.html` + `metadata.json` (`ppr: true`).
  2. **Page-Level Explicit Opt-Out (`/t-ppr-levels/page-optout`)**: Verifies `metadata.ppr === false` and absence of `shell.html` on disk.
  3. **Unconfigured Route Default (`/t-ppr-levels`)**: Verifies that routes without `ppr` enabled at global, layout, or page level default to `metadata.ppr === false`.
  4. **Creative Anti-Test — Component File Exports Ignored (`/t-ppr-anti`)**:
     - Exports `export const ppr = true` directly inside `src/t-ppr-anti/page.tsx` and `src/t-ppr-anti/layout.tsx` (instead of `page_functions.ts` / `layout_functions.ts`).
     - Verifies that Dinou strictly ignores configuration exports inside UI component files (`metadata.ppr === false`, `shell.html` is **not** generated), while rendering the page normally without errors.

---

### 5.3. Rigorous PPR Casuistics, Wire Protocol, Pre-Hydration Streaming & Security Suite (`/t-ppr-rigorous`)
- **Source Files**:
  - `src/t-ppr-rigorous/page.tsx` & `src/t-ppr-rigorous/page_functions.ts`
  - `src/t-ppr-rigorous/components/ppr-holes.tsx` & `src/t-ppr-rigorous/components/hole-client-widget.tsx`
  - `src/t-ppr-rigorous/inherited/layout.tsx`, `layout_functions.ts`, `page.tsx`, and `inherited/opt-out/page.tsx` + `page_functions.ts`
  - `src/t-ppr-rigorous/unwrapped-bailout/page.tsx` & `page_functions.ts`
- **Playwright Spec**: `e2e/example.spec.ts` → `test.describe("Partial Prerendering (PPR): Rigorous Casuistics, Hole Alignment & Security Audit", ...)`

#### Test 1 — Build Artifacts, `metadata.holes` Preservation, Wire-Level Shell/Stream Split, Inline `<script>` Syntax & Pre-Hydration DOM Replacement (`main*.js` Blocked)
1. **Disk Artifact & Hole Index Verification**:
   - Inspects `.dinou/dist2/t-ppr-rigorous/{metadata.json,shell.html,shell.rsc}`.
   - Verifies `meta.ppr === true` and `meta.holes` equals `["ppr-hole-2", "ppr-hole-3", "ppr-hole-4", "ppr-hole-6", "ppr-hole-7", "ppr-hole-8", "ppr-hole-9"]`.
   - Notice that `ppr-hole-1` (`StaticAsyncCard`, an async `<Suspense>` boundary with a `15ms` timer that reads no request data) and `ppr-hole-5` (`OuterStaticWithInnerDynamicHole`, an outer static `<Suspense>` boundary wrapping an inner dynamic `<Suspense>` boundary `ppr-hole-6`) are **baked directly into `shell.html`** (`data-testid="static-suspense-resolved"` and `data-testid="outer-static-wrapper"`) and excluded from `meta.holes`, while preserving deterministic 1-based hole numbering for all dynamic holes!
2. **Raw HTTP Wire Protocol Inspection (`splitShellAndStream`)**:
   - Issues two raw HTTP GET requests (`resA` and `resB`) with completely different cookies (`ppr_user=Alice` vs `Bob`, `ppr_session`, `ppr_tier`), query parameters (`theme`, `lang`, `plan`, `nested`, `deep`, `memo`), and headers (`x-ppr-probe: probe-alpha` vs `probe-beta`).
   - Splits the raw HTML response at `<template id="ppr-content-` into `shellPart` (flushed immediately at `0ms TTFB`) and `streamPart` (streamed dynamically):
     - Asserts `shell-build-id` and `static-suspense-hash` are **identical** across `shellA` and `shellB`.
     - Asserts `streamPart` **never** re-streams `static-suspense-resolved` or `outer-static-id`.
     - Asserts a 1-to-1 match between every `data-ppr-hole="ppr-hole-N"` in `shellPart` and `<template id="ppr-content-ppr-hole-N">` in `streamPart`.
     - Extracts every streamed inline `<script>` tag from `streamPart` and compiles it via `new Function(scriptCode)` to assert **zero JavaScript syntax errors**.
3. **Creative Pre-Hydration DOM Replacement Proof (Blocking Client JS Bundle)**:
   - Uses `await page.route("**/main*.js", (route) => route.abort())` to completely block React and the client JavaScript bundle from loading in the browser.
   - Navigates to `/t-ppr-rigorous?theme=no-hydration&nested=pre-nest&deep=pre-deep&memo=pre-memo` with cookie `ppr_user=PreHydratedAda`.
   - Verifies that `hole-cookies-user` (`"PreHydratedAda"`), `hole-query-theme` (`"no-hydration"`), `inner-dynamic-val` (`"pre-nest"`), `deep-inner-val` (`"pre-deep"`), and `hole-memo-param` (`"pre-memo"`) are all visible in the live DOM—proving that Dinou's inline `<template>` + `<script>` replacement swaps `[data-ppr-hole]` fallbacks **before** client-side React hydration even runs.

#### Test 2 — All 8 `<Suspense>` Casuistics, Out-of-Order Parallel Hole Streaming, Interactive `"use client"` Child Hydration & `</template><script>` Breakout Immunity
Verifies all 8 `<Suspense>` boundary casuistics on `/t-ppr-rigorous` in a real hydrated browser session:
1. **Casuistic 1 — Static `<Suspense>` Before Dynamic Holes (`StaticAsyncCard`)**: Resolved at build time into `shell.html` (`data-testid="static-suspense-resolved"`).
2. **Casuistic 2 — Slow Dynamic Cookie Hole (`DynamicCookieHole`, `35ms` delay, `ppr-hole-2`)**: Reads `ctx.req.cookies.ppr_user` (`"Elena"`) and `ppr_session` (`"sess-999"`).
3. **Casuistic 3 — Fast Sibling Query & Header Hole (`DynamicQueryHeaderHole`, `10ms` delay, `ppr-hole-3`)**: Resolves *before* Hole #2 (`10ms < 35ms`), proving out-of-order parallel streaming without closure index drift (`B:${currentHoleIndex - 1}`), reading `query.theme` (`"synthwave"`), `query.lang` (`"fr"`), and `headers["user-agent"]`.
4. **Casuistic 4 — Interactive `"use client"` Widget Inside a Dynamic Hole (`DynamicWithClientChildHole` -> `<HoleClientWidget />`, `ppr-hole-4`)**:
   - Server hole reads `cookies.ppr_tier` (`"enterprise"`) and `query.plan` (`"ultra"`) and passes them as props to `<HoleClientWidget />`.
   - Verifies that `<HoleClientWidget />` streams inside the hole, hydrates on the client (`data-hydrated="true"`), and responds to user clicks (`#hole-client-btn` increments `#hole-client-clicks` from `0` to `2`) without flashing back to its `<Suspense>` fallback.
5. **Casuistic 5 — Outer Static `<Suspense>` Wrapping an Inner Dynamic `<Suspense>` (`OuterStaticWithInnerDynamicHole` -> `InnerDynamicInStaticHole`, `ppr-hole-6`)**: Outer wrapper is served from the static shell while the nested inner `<Suspense>` streams `query.nested` (`"inner-ok"`) and `cookies.ppr_user` (`"Elena"`).
6. **Casuistic 6 — Outer Dynamic `<Suspense>` Wrapping a Deep Inner Dynamic `<Suspense>` (`OuterDynamicWithInnerDynamicHole` -> `DeepInnerDynamicBadge`, `ppr-hole-7`)**: Verifies that nested dynamic `<Suspense>` boundaries inside an already-postponed outer `<Suspense>` boundary do not register duplicate holes at build time and resolve both outer (`"Elena"`) and deep inner (`"deep-ok"`) values at runtime.
7. **Casuistic 7 — `React.memo` Wrapping an Async Dynamic Server Component (`MemoizedDynamicHole`, `ppr-hole-8`)**: Verifies `Symbol.for("react.memo")` unwrapping during both build-time shell extraction and runtime `streamDynamicHoles` traversal (`memoParam="memo-custom"`).
8. **Casuistic 8 — `</template><script>` XSS Breakout Payload in Normal Hole Output (`EdgeCasePayloadHole`, `ppr-hole-9`)**: Renders the literal string `Safe text </template><script>window.__PPR_XSS__=1</script>` inside a streamed PPR hole, verifying that the full string appears as safe text in `#hole-edge-payload` and `window.__PPR_XSS__` is `false`.

#### Test 3 — Unified Layout `<Suspense>` + Page `<Suspense>` Hole Alignment & Child Opt-Out (`/t-ppr-rigorous/inherited` & `/t-ppr-rigorous/inherited/opt-out`)
- Verifies that when `inherited/layout.tsx` contains a dynamic `<Suspense>` hole (`ppr-hole-1`, reading `cookies.ppr_layout_banner`) and `inherited/page.tsx` contains a dynamic `<Suspense>` hole (`ppr-hole-2`, reading `cookies.ppr_user` and `query.from`):
  - `.dinou/dist2/t-ppr-rigorous/inherited/shell.html` contains `["ppr-hole-1", "ppr-hole-2"]` in unified pre-order (`resetPprHoles()` called before `getJSX()`).
  - Both layout (`"BannerPro"`) and page (`"InheritedUser"`, `"e2e"`) holes stream and resolve in parallel.
- Verifies that the child route `/t-ppr-rigorous/inherited/opt-out` (`export const ppr = false` in `page_functions.ts`) does **not** create `shell.html` and renders dynamically.

#### Test 4 — Unwrapped Dynamic Access Outside `<Suspense>` on a PPR Route (`/t-ppr-rigorous/unwrapped-bailout`)
- On `/t-ppr-rigorous/unwrapped-bailout`, `page_functions.ts` sets `export const ppr = true`, but `page.tsx` reads `ctx.req.cookies.ppr_user` **outside** any `<Suspense>` boundary.
- Verifies that:
  1. No `shell.html` is written to `.dinou/dist2/t-ppr-rigorous/unwrapped-bailout/shell.html` (avoiding static cache poisoning).
  2. Two consecutive requests with `Cookie: ppr_user=DirectUserOne` and `Cookie: ppr_user=DirectUserTwo` each execute full dynamic SSR and return their respective cookie values and distinct `unwrapped-render-id`s.

#### Test 5 — Security: HTML Escaping of Error Messages Thrown Inside Dynamic PPR Holes
- Sends a request to `/t-ppr-rigorous?throw_err=%3C%2Ftemplate%3E%3Cscript%3Ewindow.__PPR_ERR_XSS__%3D1%3C%2Fscript%3E`, causing `EdgeCasePayloadHole` to throw `new Error("SimulatedHoleError: </template><script>window.__PPR_ERR_XSS__=1</script>")` during `streamDynamicHoles`.
- Verifies that the streamed `[PPR Error: ...]` fallback block in `ppr-runtime.js` HTML-escapes the error message (`escapeHtml`), preventing `</template><script>` from breaking out of the `<template>` tag in the raw HTTP stream.

#### Test 6 — Clock-Based TTL Expiration on PPR Static Shell (`/t-ppr-rigorous/ttl-shell`, `revalidate = 1`)
- Requests `/t-ppr-rigorous/ttl-shell?q=TtlUser1` (`export const ppr = true` and `export const revalidate = 1` in `src/t-ppr-rigorous/ttl-shell/page_functions.ts`) and records `ppr-ttl-shell-token` (`shellToken1`) while verifying the dynamic hole streams `ppr-ttl-hole-q === "TtlUser1"`.
- Waits `1200ms` for the 1-second static shell TTL to expire by clock, sends a trigger request (`?q=TtlUser2`, verifying the dynamic hole immediately streams `"TtlUser2"` while triggering background ISR `revalidatePage`), and then polls `?q=TtlUser3` to verify that `ppr-ttl-shell-token` updates to a fresh `shellToken3 !== shellToken1` while `ppr-ttl-hole-q` streams `"TtlUser3"`.

---

### 5.4. PPR + `<DinouCacheSlot>` (Micro-ISR) Synergy Suite (`/t-rigorous-sinergy`)
- **Source Files**: `src/t-rigorous-sinergy/` (`page.tsx`, `layout.tsx`, `page_functions.ts`, `layout_functions.ts`, `synergy-client.tsx`, `actions.ts`, `static-host/`)
- **Playwright Spec**: `e2e/example.spec.ts` → `test.describe.serial("PPR + DinouCacheSlot Synergy: Rigorous Casuistics (/t-rigorous-sinergy)", ...)`
- **Detailed Reference**: See [`rigurous-sinergy.md`](./rigurous-sinergy.md) for the complete breakdown of the 6 synergy tests covering:
  1. Static-shell `<DinouCacheSlot>`s, static `<Suspense>` + `<DinouCacheSlot>` combinations (`__clientJsxAlreadyRendered` preventing `ppr-hole-N` drift), transactional `<Suspense>` slot effects (`pushPprSuspenseEffects` / `popPprSuspenseEffects`), per-request dynamic PPR holes containing cached, `revalidate={0}`, and nested `<DinouCacheSlot>`s, and build-time cache-poisoning prevention when reading cookies directly inside a `<DinouCacheSlot>`.
  2. Surgical `revalidateTag` differentiation between dynamic-hole slots (`inStaticShell: false`, keeping `shell.html` intact) and static-shell slots (`inStaticShell: true`, triggering background `shell.html` regeneration).
  3. Live `refreshSlot` (by ID, by tag, via `useRouter().refreshSlot`, and wildcard `'*'`) across static-shell slots, layout hole slots, and nested dynamic-hole slots while preserving 3 levels of Client Component `useState` and `"use server"` Server Action prop bindings.
  4. Direct `/____rsc_slot____` cold-start recovery and 6-way concurrent `?fresh=1` stampede deduplication for slots inside PPR holes.
  5. Clock-based `<DinouCacheSlot revalidate={1}>` TTL expiration in both the PPR Static Shell (`ppr-syn-ttl-shell-slot`) and a Dynamic PPR Hole (`ppr-syn-ttl-hole-slot`).
  6. Standalone non-PPR static host page (`/t-rigorous-sinergy/static-host`) clock-based page TTL (`revalidate = 1`) vs. slot TTL (`revalidate = 1` vs. `revalidate = 3600`) isolation.
