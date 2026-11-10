# Universal `useSearchParams()` & Partial Prerendering (`ppr = true`) Architecture

## 1. Executive Summary

In Dinou, `useSearchParams()` (defined in `dinou/core/navigation.js` and re-exported from `dinou`) is an **isomorphic / universal hook** designed to work seamlessly in **both React Server Components (RSC) and Client Components (`"use client"`)**:

- **In RSC Compilers (`Pass A`)**: Every Dinou RSC bundler (`node/bundle-dual-engine.js`, `node/dev.js`, `cloudflare/build.js`, `bun/build.js`, and `deno/build.js`) explicitly exempts `dinou/core/navigation.js` from `dinou-client-references` (`createClientModuleProxy`), embedding its real server implementation into the RSC engine (`conditions: ["react-server"]`). On the server, `useSearchParams()` reads `ctx.req.query` (wrapped in `createBailoutProxy`).
- **In Client Components**: User files marked with `"use client"` *are* compiled as Client References (`Symbol.for("react.client.reference")`), so their function bodies are never executed during the build-time RSC pass (`Pass A`). Instead, they render initial HTML in `Pass B` (SSR) and hydrate interactively in the browser.

Prior to this fix, four subtle interactions between `useSearchParams()`, Partial Prerendering (`ppr = true`), and React 19's selective `<Suspense>` hydration caused bugs in both Server Components and Client Components:

1. **Swallowed PPR Postpone Signal in Synchronous / `noDynamic()` Server Components**: An empty `catch (e) {}` block in `navigation.js` swallowed the `Symbol.for("dinou.ppr.postpone")` signal thrown by `markDynamicAccess("Query")` when iterating `ctx.req.query`, preventing synchronous Server Components (and `async` Server Components calling `noDynamic()`) inside `<Suspense>` from registering a Dynamic PPR Hole (`ppr-hole-N`).
2. **Missing PPR Runtime Resume Hydration Guard (`#418`)**: During `handlePprResume`, `window.__DINOU_USE_STATIC__` is set to `false` while `shell.html` was pre-rendered at build time with an empty query string (`{}`). Client Components in the Static Shell (or inside streamed Dynamic Holes) calling `useSearchParams()` on a URL with query parameters (e.g., `?q=alpha`) encountered a mismatch between the pre-rendered HTML and client hydration. Conversely, relying on `window.__DINOU_PPR__` or `window.__DINOU_INLINE_RSC__` would break live SSR hydration in `dinou dev`, full-route dynamic bailouts, and pure dynamic SSR routes (`revalidate = 0`).
3. **React 19 Selective `<Suspense>` Hydration Race Condition (`#418`)**: Checking `document.body.getAttribute("data-hydrated") !== "true"` inside `useState` failed whenever a Client Component calling `useSearchParams()` was wrapped inside `<Suspense>`: React 19 commits the outer `<Router />` shell first (whose `useLayoutEffect` immediately sets `data-hydrated="true"`) *before* lazy client chunks inside `<Suspense>` finish loading and selectively hydrating.
4. **Live Query Leakage During Lazy Layout Re-Composition**: In `dinou/core/handler.js`, when a cached page's `index.html` or `shell.html` was lazily recomposed after a parent layout revalidation (`leafLayout.generatedAt > pageGeneratedAt`), `recomposeCtx` inherited `simReq.query` and `simReq.cookies` from the triggering live request, risking contamination of the shared cached HTML in storage/KV.

---

## 2. User-Facing Behavior: `useSearchParams()` When `ppr = true`

From an application developer's perspective, Dinou follows a clear, deterministic rule depending on **where** `useSearchParams()` is called on a `ppr = true` segment (`page`, `layout`, or `@slot`):

### 2.1. Complete Decision Matrix (`ppr = true`)

| Where `useSearchParams()` Is Called | Wrapped in `<Suspense>`? | Resulting Rendering Mode | Build-Time `shell.html` Output | Runtime Behavior on `GET /route?q=alpha` |
| :--- | :---: | :--- | :--- | :--- |
| **Server Component** (sync or `async`) | **Yes** | **Dynamic PPR Hole** (`data-ppr-hole="ppr-hole-N"`) | `<Suspense fallback={...}>` is baked into `shell.html` (`0ms` TTFB). | Server evaluates the `<Suspense>` subtree live per request with `q=alpha` and streams the `<template>` replacement + inline RSC payload over the same HTTP response. |
| **Server Component** (`async` + `noDynamic()`) | **Yes** | **Dynamic PPR Hole** (`useSearchParams()` overrides `noDynamic()`) | `<Suspense fallback={...}>` is baked into `shell.html`. | Reading dynamic request data (`ctx.req.query`) always overrides `noDynamic()` and streams fresh per request with `q=alpha`. |
| **Server Component** inside `<DinouCacheSlot revalidate={60}>` | **Yes** *(outer `<Suspense>`)* | **Dynamic PPR Hole** | `<Suspense fallback={...}>` is baked into `shell.html`. | Postponed out of the static shell at build time; evaluated at runtime. |
| **Server Component** (sync or `async`) | **No** *(outside `<Suspense>`)* | **Full-Route Dynamic Bailout** (100% per-request SSR) | No `shell.html` / `index.html` saved at build time. | Entire route renders dynamically on every request (`Pass A` + `Pass B` + client hydration all see `q=alpha` from frame 0 with zero `#418`). |
| **Client Component (`"use client"`)** | **Yes** *or* **No** | **Static Shell** (Does **NOT** create a Dynamic PPR Hole) | Client Component HTML is baked directly into `shell.html` with empty `URLSearchParams` (`""`). | Served instantly in `shell.html` (`0ms` TTFB), hydrates cleanly with zero React `#418` error (even inside `<Suspense>` selective hydration), and synchronizes to `q=alpha` immediately after hydration. |
| **Client Component (`"use client"`)** nested *inside* a **Dynamic PPR Hole** | **Yes** *(parent RSC opened the hole)* | **Inside Dynamic PPR Hole** | Parent `<Suspense fallback={...}>` is in `shell.html`. | Streamed inside the hole's `<template>`, hydrates with zero `#418` mismatch, and synchronizes to `q=alpha` immediately after hydration. |

### 2.2. Practical Patterns for Developers

#### Pattern A — Instant Static Shell + Client-Side Search Params (Zero Server Hole)
Use `"use client"` when search parameters only drive client UI state (tabs, filters, modals, highlight queries) and do not require server-only secrets or DB queries:

```tsx
// FilterTabs.tsx
"use client";
import { useSearchParams, useRouter } from "dinou";

export function FilterTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") ?? "all";

  return (
    <button onClick={() => router.push("?tab=active")}>
      Active tab: {tab}
    </button>
  );
}
```
- **Even if wrapped in `<Suspense>` on a `ppr = true` route**, `<FilterTabs />` does **not** open a server Dynamic PPR Hole. The route can remain a 100% static zero-hole shell (`holes: []`), hydrating cleanly on any `?tab=...` URL and updating reactively on `router.push()` / `<Link>` soft navigations without losing React state.

#### Pattern B — Server-Rendered Search Results Streamed via Dynamic PPR Hole
Call `useSearchParams()` (or `getContext().req.query`) inside a **Server Component** wrapped in `<Suspense>` when the server must query a database or API using the URL query parameters while still delivering an instant `0ms` TTFB static shell:

```tsx
// page_functions.ts
export const ppr = true;

// page.tsx (Server Component)
import { Suspense } from "react";
import { useSearchParams } from "dinou";

function SyncOrAsyncSearchResults() {
  const searchParams = useSearchParams(); // Triggers Dynamic PPR Hole inside <Suspense>
  const q = searchParams.get("q") ?? "";
  return <div>Results for: {q}</div>;
}

export default function SearchPage() {
  return (
    <main>
      <h1>Catalog</h1>
      <Suspense fallback={<p>Loading results...</p>}>
        <SyncOrAsyncSearchResults />
      </Suspense>
    </main>
  );
}
```
- Both **synchronous** and **`async`** Server Components calling `useSearchParams()` inside `<Suspense>` automatically convert that `<Suspense>` boundary into a Dynamic PPR Hole (`data-ppr-hole`), baking `<p>Loading results...</p>` into `shell.html` and streaming the live results at request time.

---

## 3. Summary of Core Framework Changes (`./dinou`)

| File | Change Summary |
| :--- | :--- |
| `dinou/core/navigation.js` | Rethrows PPR postpone symbols (`dinou.ppr.postpone`, `react.postpone`, `dinou.ppr.skipStatic`) in `useSearchParams()`, aligns `ctx` fallback with `usePathname()`, returns empty `URLSearchParams` during `Pass B` Client Component SSR under `_isPprRuntimeResume`, and uses `React.useSyncExternalStore` paired with `window.__DINOU_USE_STATIC__ \|\| window.__DINOU_PPR_RESUME__` for selective-hydration-safe client hydration. |
| `dinou/core/ppr-runtime.js` | Emits `window.__DINOU_PPR_RESUME__ = true` exclusively during `handlePprResume` (paired 1-to-1 with `context._isPprRuntimeResume = true`). |
| `dinou/core/handler.js` | Sanitizes `recomposeSimReq` (`query: {}, cookies: {}`) when lazily recomposing `index.html` / `shell.html` after layout revalidation so live request parameters never leak into cached shells. |
| `dinou/core/request-context.js` | Adds `process.getBuiltinModule("node:async_hooks")` resolution so `AsyncLocalStorage` works natively when Dinou core modules are imported directly in unbundled Node.js ESM. |

---

## 4. Detailed Technical Breakdown & Rationale

### 4.1. `dinou/core/navigation.js` — Server Postpone Propagation & Pass A / Pass B Symmetry

1. **Propagating PPR Postpone Signals in Server Components**:
   - During a PPR static shell build (`isPprBuildActive() === true`), `ctx.req.query` is wrapped in `createBailoutProxy(target, "Query", markAsDynamic)`.
   - Inside `<Suspense>` (outside a cached slot), `Object.entries(ctx.req.query)` invokes `markDynamicAccess("Query")`, throwing an error tagged with `$$typeof = Symbol.for("dinou.ppr.postpone")`.
   - Previously, `try { ... } catch (e) {}` in `useSearchParams()` caught and discarded that signal, causing synchronous Server Components (and `async` Server Components that called `noDynamic()` before awaiting) to return `new URLSearchParams()` without registering a PPR hole.
   - Rethrowing `dinou.ppr.postpone`, `react.postpone`, and `dinou.ppr.skipStatic` lets `asyncRenderJSXToClientJSXInner` catch the postpone at the enclosing `<Suspense>` boundary and register `ppr-hole-N`.

2. **Distinguishing `Pass A` (RSC) vs `Pass B` (Client Component SSR) During `handlePprResume`**:
   - During `handlePprResume` (`ctx._isPprRuntimeResume === true`), `streamDynamicHoles` evaluates Server Components inside dynamic holes (`Pass A`) *and* renders HTML for those holes via `renderHtmlStream` (`Pass B`), both under the same `AsyncLocalStorage` context where `ctx.req.query` holds the live query parameters.
   - A **Server Component** inside a dynamic hole (including an `async` RSC calling `useSearchParams()` *after* an `await`, even in unbundled Node where `React.useState` is defined and `invokeWithServerHooksDispatcher` has already restored `H = null` on suspend) **must** read the real `ctx.req.query`.
   - A **Client Component** rendered to HTML in `Pass B` during `handlePprResume` **must** return an empty `URLSearchParams()` so its HTML matches the client's hydration snapshot (`window.__DINOU_PPR_RESUME__ === true`).
   - Because `react-dom/server` (`Pass B`) always sets `React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H` to a non-null Fizz `HooksDispatcher` (without `_dinouIsServerHooksDispatcher`), checking:
     ```js
     const clientH =
       React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?.H;
     const isClientSsrRender =
       typeof React.useState === "function" &&
       Boolean(clientH) &&
       !clientH._dinouIsServerHooksDispatcher;
     if (ctx && ctx._isPprRuntimeResume && isClientSsrRender) {
       return new URLSearchParams();
     }
     ```
     cleanly isolates `Pass B` Client Component SSR in both bundled and unbundled environments.

3. **Selective-Hydration-Safe Client Sync via `useSyncExternalStore`**:
   - Previously, `useSearchParams()` initialized `useState` using `document.body?.getAttribute("data-hydrated") !== "true"`. When a Client Component was wrapped in `<Suspense>`, React 19 committed `<Router />` first (setting `data-hydrated="true"` in `<Router />`'s `useLayoutEffect`) while the `<Suspense>` child's lazy JS chunk was still being fetched. Milliseconds later, when React selectively hydrated the `<Suspense>` boundary, `data-hydrated` was already `"true"`, so `useSearchParams()` read `window.location.search` during hydration and threw **React Error `#418`**.
   - Replacing `useState` + `useEffect` with `useSyncExternalStore`:
     ```js
     const isReactHydrating = useSyncExternalStore(
       emptySubscribe,
       () => false,
       () => true
     );
     const isStaticHydrating =
       isReactHydrating &&
       typeof window !== "undefined" &&
       Boolean(window.__DINOU_USE_STATIC__ || window.__DINOU_PPR_RESUME__);
     ```
     delegates hydration tracking directly to React's Fiber reconciler: React invokes `getServerSnapshot` (`() => true`) *if and only if* that specific component fiber is currently hydrating server HTML (including asynchronous selective `<Suspense>` hydration), and automatically replays with `getSnapshot` (`() => false`) once hydration of that boundary completes — while immediately returning `false` on client-only mounts and SPA soft navigations.

### 4.2. `dinou/core/ppr-runtime.js` — Dedicated `window.__DINOU_PPR_RESUME__` Flag

- `window.__DINOU_PPR__ = true` is emitted not only in pre-rendered `shell.html` files, but also during live SSR in `dinou dev`, on PPR routes that experienced a Full-Route Dynamic Bailout, and on non-cached query requests (`handler.js:3085`), where `Pass B` renders the live query string directly into HTML.
- To maintain strict 1-to-1 symmetry with `context._isPprRuntimeResume = true`, `handlePprResume` injects `window.__DINOU_PPR_RESUME__ = true` into `shellPrelude` (alongside `window.__DINOU_PPR__ = true` in `<script id="_R_">`, with a `<head>` fallback). Note that because pre-rendered `shell.html` files already contain `window.__DINOU_USE_STATIC__ = false` and `window.__DINOU_PPR__ = true`, `window.__DINOU_PPR_RESUME__` is checked independently so it is guaranteed to be present in every resumed shell.

### 4.3. `dinou/core/handler.js` — Query & Cookie Isolation in Lazy Shell Re-Composition

- When a parent layout is revalidated (`leafLayout.generatedAt > pageGeneratedAt`), `handler.js` lazily recomposes `index.html` (and `shell.html` for PPR routes) from cached `layout.rsc` + `shell.rsc`/`page.rsc` and persists the result back to storage/KV.
- Creating `recomposeCtx` from `{ ...simReq, query: {}, cookies: {} }` ensures that if the request triggering lazy re-composition carries `?q=foo` or cookies, those request-specific values never leak into the shared static `index.html` or `shell.html`.

### 4.4. `dinou/core/request-context.js` — Native Node.js ESM `AsyncLocalStorage`

- Added `process.getBuiltinModule("node:async_hooks")?.AsyncLocalStorage` before the CJS `require` probe so `requestStorage` initializes a real `AsyncLocalStorage` instance when Dinou's ESM modules are imported directly in Node.js (e.g., unit tests or unbundled tooling) without introducing top-level `node:` imports into browser/edge bundles.

---

## 5. Automated Tests Implemented

### 5.1. Node.js Unit & Integration Suite (`tests/ppr-use-search-params.test.js`)
Run via `npm run test:ppr:search-params` (`node --test tests/ppr-use-search-params.test.js`):
1. **Synchronous RSC inside `<Suspense>` (`ppr = true`)**: Verifies `holes` equals `["ppr-hole-1"]`, `data-ppr-hole="ppr-hole-1"` is emitted, and the route shell remains static (`isStatic === true`).
2. **`async` RSC with `noDynamic()` + `useSearchParams()` inside `<Suspense>` (`ppr = true`)**: Verifies `useSearchParams()` overrides `noDynamic()` and registers `["ppr-hole-1"]`.
3. **Synchronous RSC outside `<Suspense>` (`ppr = true`)**: Verifies `isStatic` flips to `false` (Full-Route Dynamic Bailout).
4. **Unbundled Node Runtime Resume Symmetry (`_isPprRuntimeResume = true` vs Live SSR)**: Verifies that an `async` RSC calling `useSearchParams()` *after* an `await` reads the live query (`rsc:after-await`), `Pass B` (`renderToReadableStream`) during PPR resume renders `client:none`, and `Pass B` during live SSR renders `client:live-ssr`.

### 5.2. End-to-End Routes & Playwright Suite (`e2e/example.spec.ts`)
- **`/t-new-ppr/search-params`** (`src/t-new-ppr/search-params/page.tsx` + `client-search-widgets.tsx`, `ppr = true`):
  - **Boundary #1**: `"use client"` `<ClientShellSearchWidget />` wrapped in `<Suspense>` → stays baked in `shell.html` (**not** in `metadata.json` `holes`), hydrates on `?q=alpha&tab=docs` with zero `#418` error, syncs to `alpha`/`docs`, and preserves state across `router.push()` soft navigation.
  - **Boundary #2**: Synchronous RSC `<SyncServerSearchWidget />` → registered as `ppr-hole-2`, streams live query values per request while root page render count stays frozen.
  - **Boundary #3**: `async` RSC `<NoDynamicOverrideSearchWidget />` calling `noDynamic()` + `useSearchParams()` → registered as `ppr-hole-3`, streams live query values per request.
  - **Boundary #4**: `async` RSC `<AsyncHoleWithNestedClientWidget />` reading `useSearchParams()` after `await` + nested `"use client"` `<ClientHoleSearchWidget />` → registered as `ppr-hole-4`, streams live RSC query + hydrates nested client widget with zero `#418` error.
- **`/t-new-ppr/bailout-search-params`** (`src/t-new-ppr/bailout-search-params/page.tsx`, `ppr = true`):
  - Calls `useSearchParams()` in an unwrapped RSC alongside `<ClientShellSearchWidget />`. Verifies neither `shell.html` nor `index.html` is emitted at build time, and visiting `?q=livebailout&tab=bailtab` in both `Node AOT` and `dinou dev` renders and hydrates `livebailout`/`bailtab` directly with zero `#418` error.

