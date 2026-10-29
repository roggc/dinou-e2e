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
  - Previously, streamed hole replacement scripts injected HTML or error strings in ways that could break if the component output or error message contained `</template><script>` or special quotes.
- **Solution**:
  - Replacement chunks use `<template id="ppr-content-${currentHoleId}">${html}</template>` paired with a DOM node replacement script (`t.replaceWith(c.content)`) and `escapeHtml()` on error fallback messages, guaranteeing `0` `SyntaxError`s and preventing `<template>` breakout.

---

## 4. Supported PPR Patterns & Casuistics

| Pattern | Build-Time Behavior (`shell.html`) | Request-Time Behavior (`handlePprResume`) |
|---|---|---|
| **Static Server Component outside `<Suspense>`** | Rendered and baked into `shell.html` | Served immediately in `shellPrelude` (`0ms TTFB`) |
| **Static `<Suspense>` boundary** (async work without `cookies`/`headers`/`query`) | Resolved at build time and baked into `shell.html` (not added to `metadata.holes`) | Served in `shellPrelude`; **not** re-executed or re-streamed at request time |
| **Dynamic `<Suspense>` hole** (reads `cookies`, `headers`, `query`) | Catches `PprBailoutError`, bakes `<div data-ppr-hole="ppr-hole-N">` fallback into `shell.html`, records in `metadata.holes` | Evaluates in parallel at request time and streams `<template id="ppr-content-ppr-hole-N">` + inline DOM swap `<script>` |
| **Client Component (`"use client"`) inside Dynamic `<Suspense>` hole** | Fallback baked into `shell.html` | Streamed at request time via Pass A (RSC) + Pass B (SSR) and hydrated on the client |
| **Nested Dynamic `<Suspense>` inside Static `<Suspense>`** | Outer boundary baked into `shell.html`; inner boundary bails out as `ppr-hole-N` | Outer wrapper served in `shellPrelude`; inner hole streamed on demand |
| **Nested Dynamic `<Suspense>` inside Dynamic `<Suspense>`** | Outer boundary bails out at build time (`ppr-hole-N`) | Outer boundary streams and resolves its inner `<Suspense>` tree at request time |
| **Layout `<Suspense>` hole + Page `<Suspense>` hole** | Unified hole numbering (`ppr-hole-1` in layout, `ppr-hole-2` in page) | Both layout and page holes stream in parallel on request |
| **Unwrapped dynamic access outside `<Suspense>`** | Route-level `PprBailoutError` aborts static shell caching (`shell.html` not written) | Full route renders dynamically via streaming SSR on every request |

---

## 5. E2E Test Suite Reference (`src/t-ppr-rigorous`)

The rigorous E2E test suite in `dinou-e2e` is located at:
- **Source files**: `src/t-ppr-rigorous/` (`page.tsx`, `page_functions.ts`, `ppr-hole-client.tsx`, `components/hole-client-widget.tsx`, `inherited/layout.tsx`, `inherited/layout_functions.ts`, `inherited/page.tsx`, `inherited/opt-out/page.tsx`, `inherited/opt-out/page_functions.ts`, `unwrapped-bailout/page.tsx`, `unwrapped-bailout/page_functions.ts`)
- **Playwright Spec**: `e2e/example.spec.ts` → `test.describe("Partial Prerendering (PPR): Rigorous Casuistics", ...)`
