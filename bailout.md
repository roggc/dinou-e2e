# Client `useSearchParams()` vs. Server Automatic Static Bailout — Architecture, Fix & Verification Guide

This document details the root cause, exact framework changes implemented in `dinou`, `CHANGELOG.md` entry, and complete CI + Playwright E2E test suites for fixing **false dynamic bailouts in ISG and background ISR** when a Client Component (`"use client"`) calls `useSearchParams()`.

---

## 1. Problem Statement & Root Cause

### 1.1. Intended Architecture in Dinou
Dinou's universal `useSearchParams()` hook (`dinou/core/navigation.js`) is designed with two distinct contracts depending on **where** it is called:

1. **Inside a Server Component (or `getProps`)**:
   - Reading URL search parameters (`useSearchParams()` or `getContext().req.query`) consumes request-specific data.
   - On standard routes, accessing `ctx.req.query` (wrapped in `createBailoutProxy`) **must trigger Automatic Static Bailout**, transitioning the route out of SSG/ISG/ISR into **Live Dynamic SSR**.
   - On Partial Prerendering (`ppr = true`) routes inside a `<Suspense>` boundary, accessing `ctx.req.query` **must register that `<Suspense>` boundary as a Dynamic PPR Hole** (`markDynamicAccess("Query")`) while keeping the outer shell static.

2. **Inside a Client Component (`"use client"`)**:
   - Calling `useSearchParams()` inside a Client Component **must NOT trigger a server-side dynamic bailout**. The route must remain eligible for **Pure SSG**, **on-demand ISG caching**, **background ISR regeneration**, and **static PPR shells**.
   - On the client (`dinou/core/navigation.js`), Dinou already prevents React hydration mismatches on cached static/PPR pages via `useSyncExternalStore`: during the initial hydration pass when `window.__DINOU_USE_STATIC__ || window.__DINOU_PPR_RESUME__` is truthy, `useSearchParams()` returns an empty `new URLSearchParams()` (matching static HTML) and immediately re-renders in the browser with the live `window.location.search`.

### 1.2. What Went Wrong (Root Cause)
During server-side HTML generation (`platformContext.renderHtmlStream`, executed by Pass B `ssr-engine` using `react-dom/server`), **Client Components (`"use client"`) also execute on the server** (`typeof window === "undefined"`, `isClientSsrRender === true`) inside `requestStorage.run(context, ...)`.

Previously, `useSearchParams()` in `dinou/core/navigation.js` only bypassed `ctx.req.query` when `ctx._isPprRuntimeResume && isClientSsrRender`:

```js
// ❌ Previous behavior in dinou/core/navigation.js
if (ctx && ctx._isPprRuntimeResume && isClientSsrRender) {
  return new URLSearchParams();
}
if (ctx && ctx.req && ctx.req.query) {
  const params = new URLSearchParams();
  Object.entries(ctx.req.query).forEach(([key, val]) => { ... });
  return params;
}
```

Whenever `renderHtmlStream` ran for any non-PPR-resume request, `Object.entries(ctx.req.query)` executed directly against `createBailoutProxy`, firing the proxy's `ownKeys` trap (`triggerBailout`) and causing **two severe production bugs**:

1. **Broken On-Demand ISG Caching (`dinou/core/handler.js`)**:
   - When the first visitor requested an uncached dynamic path (e.g. `/products/452`) containing a Client Component with `useSearchParams()`, Server Components completed with `dynamicState.value === false` (`shouldCacheISG === true`).
   - Next, `renderHtmlStream` executed the Client Component inside `requestStorage.run(context, ...)`, tripping `queryProxy` and flipping `dynamicState.value = true`.
   - After draining the HTML stream, `handler.js` saw `dynamicState.value === true`, **aborted writing the page to KV/storage** (`ℹ️ [Edge ISG] Dynamic bailout detected during render for /products/452, skipping KV cache`), rewrote `window.__DINOU_USE_STATIC__` to `false`, and left `dynamicState.value = true` in memory. ISG pages containing a `useSearchParams()` Client Component could **never** be cached.

2. **Broken Background ISR & Permanent De-optimization to Dynamic SSR (`dinou/core/cache-revalidate.js`)**:
   - At `dinou build` time, SSG pre-rendering (`platformContext.isSSG === true`) ignored `dynamicState.value` via an explicit override (`!dynamicState.value || (platformContext.isSSG === true && !ssgPprUnwrappedBailout)`), so ISR routes initially built as static.
   - However, as soon as the `revalidate` TTL expired in production, `revalidatePage()` in `dinou/core/cache-revalidate.js` ran `renderHtmlStream` inside `requestStorage.run(revalContext, ...)`, where `revalContext.req.query` was `createBailoutProxy({}, "req.query", markRevalDynamic)`.
   - The Client Component's `useSearchParams()` call tripped `markRevalDynamic()` (`revalDynamicState.value = true`). At line 657 (`if (revalDynamicState.value && !isRoutePpr)`), Dinou logged `[ISR] Bailout detected for ... Switching to Dynamic.`, **discarded the refreshed cache**, and called `markRouteDynamicInMap(..., true)` — **permanently de-optimizing the static ISR route into Live Dynamic SSR for the lifetime of the server process**.

---

## 2. Solution & Modified Framework Files

### 2.1. Summary of Modified Files

| File | Responsibility |
| :--- | :--- |
| `dinou/core/bailout-proxy.js` | Exports `BAILOUT_RAW_TARGET = Symbol.for("dinou.bailout.raw")` and `unwrapBailoutProxy(value)`. Returns the raw target object `t` in `createBailoutProxy`'s `get` trap before calling `triggerBailout`. |
| `dinou/core/navigation.js` | When `isClientSsrRender === true` in `useSearchParams()`, never accesses `ctx.req.query` through `createBailoutProxy`: returns empty `new URLSearchParams()` when `!ctx \|\| ctx._isPprRuntimeResume \|\| ctx._isStaticHtmlRender`, and otherwise reads `ctx.req.query[Symbol.for("dinou.bailout.raw")]` so Live Dynamic SSR / `dinou dev` renders live query params without mutating `dynamicState`. Server Components (`isClientSsrRender === false`) continue reading `ctx.req.query` through `createBailoutProxy`. |
| `dinou/core/handler.js` | Marks `_isStaticHtmlRender = true` on `context` / `recomposeCtx` whenever generating cacheable static/ISG/recomposed HTML (including across async `htmlStream` draining), resets it in `catch`/`finally`, and excludes `_isStaticHtmlRender` & `_isPprRuntimeResume` in `copyCustomContextProperties`. |
| `dinou/core/cache-revalidate.js` | Marks `_isStaticHtmlRender: true` on `revalContext` in both `revalidatePage` and `revalidateLayout`. |

> **Why `Symbol.for("dinou.bailout.raw")` is defined inline in `navigation.js`:**
> 1. **Dual-Engine Cross-Bundle Compatibility**: Pass A (`rsc-engine`, `react-server` condition) creates `createBailoutProxy` on `context.req.query`, while Pass B (`ssr-engine`, `browser` condition) executes Client Components during `renderHtmlStream`. Using `Symbol.for("dinou.bailout.raw")` from the global symbol registry works seamlessly across both isolated bundles.
> 2. **Zero Browser Bundle Bloat**: `dinou/core/navigation.js` is a `"use client"` module shipped to the browser. Referencing `Symbol.for("dinou.bailout.raw")` inline avoids importing `bailout-proxy.js` (and `ppr-context.js`) into client bundles across Esbuild, Rollup, and Webpack.

---

### 2.2. Exact Code Changes

#### A. `dinou/core/bailout-proxy.js`
```js
export const BAILOUT_RAW_TARGET = Symbol.for("dinou.bailout.raw");

export function unwrapBailoutProxy(value) {
  if (value && (typeof value === "object" || typeof value === "function")) {
    return value[BAILOUT_RAW_TARGET] || value;
  }
  return value;
}

export function createBailoutProxy(target, label = "Context", onBailout) {
  const safeTarget = target || {};

  return new Proxy(safeTarget, {
    get(t, prop, receiver) {
      if (prop === BAILOUT_RAW_TARGET) {
        return t;
      }
      if (
        typeof prop === "symbol" ||
        prop === "inspect" ||
        prop === "valueOf" ||
        prop === "toString" ||
        prop === "constructor" ||
        prop === "prototype"
      ) {
        return Reflect.get(t, prop, receiver);
      }

      triggerBailout(label, onBailout);

      return Reflect.get(t, prop, receiver);
    },
    // ownKeys & has traps unchanged...
  });
}
```

#### B. `dinou/core/navigation.js`
```js
const DINOU_CONTEXT_KEY = Symbol.for("dinou.request.context.storage");
const BAILOUT_RAW_TARGET = Symbol.for("dinou.bailout.raw");

// Inside useSearchParams() -> if (typeof window === "undefined"):
      const clientH =
        React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?.H;
      const isClientSsrRender =
        typeof React.useState === "function" &&
        Boolean(clientH) &&
        !clientH._dinouIsServerHooksDispatcher;
      if (isClientSsrRender) {
        if (!ctx || ctx._isPprRuntimeResume || ctx._isStaticHtmlRender) {
          return new URLSearchParams();
        }
        const rawQuery =
          ctx.req && ctx.req.query
            ? ctx.req.query[BAILOUT_RAW_TARGET] || ctx.req.query
            : null;
        if (rawQuery) {
          const params = new URLSearchParams();
          Object.entries(rawQuery).forEach(([key, val]) => {
            if (Array.isArray(val)) val.forEach((v) => params.append(key, v));
            else if (val) params.append(key, val);
          });
          return params;
        }
        return new URLSearchParams();
      }
      if (ctx && ctx.req && ctx.req.query) {
        const params = new URLSearchParams();
        Object.entries(ctx.req.query).forEach(([key, val]) => {
          if (Array.isArray(val)) val.forEach((v) => params.append(key, val));
          else if (val) params.append(key, val);
        });
        return params;
      }
```

#### C. `dinou/core/handler.js`
1. In `copyCustomContextProperties(source, target)`:
   Exclude `"_isStaticHtmlRender"` and `"_isPprRuntimeResume"` alongside `"_markDynamic"` and `"_dynamicState"`.
2. In layout+page HTML recomposition (`recomposeCtx`):
   ```js
   const recomposeCtx = createRequestContext(recomposeSimReq, bridge, platformContext);
   recomposeCtx._isStaticHtmlRender = true;
   copyCustomContextProperties(rootContext, recomposeCtx);
   ```
3. In fallback Edge ISR HTML regeneration (`revalBridge`):
   ```js
   const revalSimReq = simReq
     ? { ...simReq, query: {}, cookies: {} }
     : { query: {}, cookies: {}, headers: {}, path: reqPath, method: "GET" };
   const context = createRequestContext(revalSimReq, revalBridge, platformContext);
   context._isStaticHtmlRender = true;
   ```
4. Around primary `renderHtmlStream` and `shouldCacheISG` stream draining:
   ```js
   let htmlStream;
   context._isStaticHtmlRender = Boolean(shouldCacheISG);
   try {
     await requestStorage.run(context, async () => {
       // ... platformContext.renderHtmlStream(...)
     });
   } catch (ssrErr) {
     context._isStaticHtmlRender = false;
     // ... error boundary fallback
   }
   // ...
   if (shouldCacheISG) {
     // ...
     try {
       const [rsc, html] = await requestStorage.run(context, () =>
         Promise.all([
           new Response(streamForCache).text(),
           new Response(htmlStream).text(),
         ])
       );
       rscPayload = rsc;
       fullHtml = html;
     } catch (drainErr) {
       console.error("[Edge ISG] Error reading streams:", drainErr);
     } finally {
       context._isStaticHtmlRender = false;
     }
   ```

#### D. `dinou/core/cache-revalidate.js`
In both `revalidatePage` and `revalidateLayout`, add `_isStaticHtmlRender: true` to `revalContext`:
```js
const revalContext = {
  req: { ... },
  res: { ... },
  env: activeEnv,
  platformContext: outerCtx?.platformContext || { env: activeEnv },
  _isStaticHtmlRender: true,
};
```

---

### 2.3. Complete Behavior Matrix After Fix

| Rendering Mode | Component Calling `useSearchParams()` | Server HTML Output | Bailout Triggered? | Client Hydration Pass | Post-Hydration Client State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pure SSG (`dinou build`)** | Client (`"use client"`) | Empty (`""`) | **No** (Cached static) | Empty (`__DINOU_USE_STATIC__ = true`) -> **0 mismatch** | Syncs live `?q=...` immediately |
| **On-Demand ISG (`/items/99`)** | Client (`"use client"`) | Empty (`""`) | **No** (**Cached in KV!**) | Empty (`__DINOU_USE_STATIC__ = true`) -> **0 mismatch** | Syncs live `?q=...` immediately |
| **Uncached ISG w/ Query (`/items/99?q=x`)** | Client (`"use client"`) | Live (`"x"`) | **No** (`isDynamic` stays `false`; next clean `/items/99` caches!) | Live (`__DINOU_USE_STATIC__ = false`) -> **0 mismatch** | Live (`"x"`) |
| **Background ISR (`revalidate >= 1`)** | Client (`"use client"`) | Empty (`""`) | **No** (**Commits refreshed ISR cache!**) | Empty (`__DINOU_USE_STATIC__ = true`) -> **0 mismatch** | Syncs live `?q=...` immediately |
| **PPR Static Shell / Dynamic Hole** | Client (`"use client"`) | Empty (`""`) | **No** | Empty (`__DINOU_PPR_RESUME__ = true`) -> **0 mismatch** | Syncs live `?q=...` immediately |
| **Live Dynamic SSR (`revalidate = 0`) / `dev`** | Client (`"use client"`) | Live (`"x"`) | **No** (Already dynamic) | Live (`__DINOU_USE_STATIC__ = false`) -> **0 mismatch** | Live (`"x"`) |
| **Standard Route (No PPR)** | **Server Component** | Live (`"x"`) | **Yes** (Automatic Static Bailout -> Live SSR) | Live (`__DINOU_USE_STATIC__ = false`) -> **0 mismatch** | N/A (Server-rendered) |
| **PPR Route (`ppr = true`) in `<Suspense>`** | **Server Component** | Streamed in PPR hole | **Registers Dynamic PPR Hole** (Outer shell stays static!) | Streamed `<template>` swap | N/A (Server-rendered hole) |

---

## 3. `CHANGELOG.md` Entry

Add the following bullet under `### Fixed` in `dinou`'s `CHANGELOG.md`:

```markdown
### Fixed
- **False Dynamic Bailout on Client `useSearchParams()` in ISG & ISR**: Fixed a server-rendering bug where calling `useSearchParams()` inside a `"use client"` component accessed `ctx.req.query` through `createBailoutProxy` during React Fizz HTML SSR (`renderHtmlStream`), falsely flagging the render as dynamic. Client Components calling `useSearchParams()` no longer prevent on-demand ISG pages from caching to storage or de-optimize static ISR routes into permanent Dynamic SSR during background revalidation, while Server Components calling `useSearchParams()` continue to trigger Automatic Static Bailout (or register Dynamic PPR Holes inside `<Suspense>`) as intended.
```

---

## 4. Verification & Test Suite for `dinou` / `dev/dinou-e2e`

### 4.1. Fast Standalone Unit + Dual-Engine Integration Script (`scripts/verify-bailout-ci.mjs`)

This self-contained Node test script verifies **both** low-level proxy/dispatcher invariants and a full compiled Dual-Engine (`rsc-engine` + `ssr-engine`) pipeline covering SSG discovery, ISG with and without query strings, background ISR regeneration after TTL expiry, and Server Component bailouts in ~3 seconds:

```js
// scripts/verify-bailout-ci.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToReadableStream } from "react-dom/server";

import {
  BAILOUT_RAW_TARGET,
  unwrapBailoutProxy,
  createBailoutProxy,
} from "../dinou/core/bailout-proxy.js";
import { requestStorage } from "../dinou/core/request-context.js";
import { useSearchParams } from "../dinou/core/navigation.js";
import { asyncRenderJSXToClientJSX } from "../dinou/core/render-jsx-to-client-jsx.js";
import {
  runWithPprContext,
  resetPprHoles,
  getRegisteredHoles,
} from "../dinou/core/ppr-context.js";
import { bundleDualEngine } from "../dinou/node/bundle-dual-engine.js";
import {
  FileSystemStorage,
  setStorageAdapter,
} from "../dinou/core/storage-adapter.js";

const projectRoot = process.cwd();

console.log("1️⃣ Unit-testing createBailoutProxy & BAILOUT_RAW_TARGET...");
{
  let bailoutCount = 0;
  const rawQuery = { q: "dinou", tag: ["rsc", "isg"] };
  const proxy = createBailoutProxy(rawQuery, "Query", () => {
    bailoutCount++;
  });

  assert.equal(proxy[Symbol.for("dinou.bailout.raw")], rawQuery);
  assert.equal(unwrapBailoutProxy(proxy), rawQuery);
  assert.equal(BAILOUT_RAW_TARGET, Symbol.for("dinou.bailout.raw"));
  assert.equal(bailoutCount, 0, "Unwrapping raw target must NOT trigger bailout");

  assert.equal(proxy.q, "dinou");
  assert.equal(bailoutCount, 1, "Direct property read MUST trigger bailout");
}

function ClientSearchProbe() {
  const sp = useSearchParams();
  return React.createElement("span", { "data-q": sp.toString() }, sp.get("q") || "EMPTY");
}

console.log("2️⃣ Unit-testing Client Component Fizz SSR (Static/ISG/ISR, PPR & Live SSR)...");
{
  // 2a. Static / ISG / ISR HTML render -> empty output + 0 bailouts
  let staticBailouts = 0;
  const staticCtx = {
    req: {
      query: createBailoutProxy({ q: "do-not-leak" }, "Query", () => staticBailouts++),
      path: "/products/42",
      method: "GET",
    },
    _isStaticHtmlRender: true,
  };
  const staticHtml = await requestStorage.run(staticCtx, async () => {
    const stream = await renderToReadableStream(React.createElement(ClientSearchProbe));
    return await new Response(stream).text();
  });
  assert.equal(staticBailouts, 0);
  assert.match(staticHtml, />EMPTY<\/span>/);

  // 2b. Live Dynamic SSR / dev -> live query output + 0 bailouts
  let liveBailouts = 0;
  const liveCtx = {
    req: {
      query: createBailoutProxy({ q: "react19", tag: ["a", "b"] }, "Query", () => liveBailouts++),
      path: "/search",
      method: "GET",
    },
    _isStaticHtmlRender: false,
  };
  const liveHtml = await requestStorage.run(liveCtx, async () => {
    const stream = await renderToReadableStream(React.createElement(ClientSearchProbe));
    return await new Response(stream).text();
  });
  assert.equal(liveBailouts, 0);
  assert.match(liveHtml, /data-q="q=react19&amp;tag=a&amp;tag=b">react19<\/span>/);
}

console.log("3️⃣ Unit-testing Server Component useSearchParams() (Standard Bailout & PPR Hole)...");
{
  let serverBailouts = 0;
  function ServerSearchComp() {
    const sp = useSearchParams();
    return React.createElement("h1", null, `Server:${sp.get("q") || "none"}`);
  }
  const serverCtx = {
    req: {
      query: createBailoutProxy({ q: "rsc-query" }, "Query", () => serverBailouts++),
      path: "/server-q",
      method: "GET",
    },
  };
  const el = await requestStorage.run(serverCtx, () =>
    asyncRenderJSXToClientJSX(React.createElement(ServerSearchComp))
  );
  assert.equal(serverBailouts > 0, true, "Server Component MUST trigger bailout");
  assert.equal(el.props.children, "Server:rsc-query");

  // PPR inside <Suspense> -> registers 1 dynamic hole, 0 full-route bailouts
  let pprOuterBailouts = 0;
  const pprCtx = {
    req: {
      query: createBailoutProxy({}, "Query", () => pprOuterBailouts++),
      path: "/ppr-q",
      method: "GET",
    },
  };
  let holes = [];
  await requestStorage.run(pprCtx, () =>
    runWithPprContext({ isPpr: true }, async () => {
      resetPprHoles();
      await asyncRenderJSXToClientJSX(
        React.createElement(
          "main",
          null,
          React.createElement(
            React.Suspense,
            { fallback: React.createElement("span", null, "Loading") },
            React.createElement(ServerSearchComp)
          )
        )
      );
      holes = getRegisteredHoles();
    })
  );
  assert.equal(pprOuterBailouts, 0);
  assert.equal(holes.length, 1);
}

console.log("4️⃣ Integration-testing Dual-Engine SSG, ISG & Background ISR...");
const miniRoot = path.resolve(projectRoot, ".dinou/_tmp_bailout_verify");
fs.rmSync(miniRoot, { recursive: true, force: true });

try {
  fs.mkdirSync(path.join(miniRoot, "src/components"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/isg/[id]"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/isr-blog"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/server-search"), { recursive: true });

  fs.writeFileSync(
    path.join(miniRoot, "package.json"),
    JSON.stringify({ name: "bailout-verify", type: "module" }, null, 2)
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/components/client-search.tsx"),
    `"use client";
import { useSearchParams } from "dinou";
export function ClientSearch() {
  const sp = useSearchParams();
  return <div data-testid="client-q">{\`ClientQ:\${sp.get("q") ?? "EMPTY"}\`}</div>;
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/layout.tsx"),
    `export default function RootLayout({ children }: { children: any }) {
  return <html><head><title>Verify</title></head><body>{children}</body></html>;
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/isg/[id]/page_functions.ts"),
    `export const getStaticPaths = ["1"];\n`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/isg/[id]/page.tsx"),
    `import { ClientSearch } from "@/components/client-search";
let count = 0;
export default function IsgPage({ params }: { params: { id: string } }) {
  count++;
  return <main><h1>{\`Product:\${params.id}:Render:\${count}\`}</h1><ClientSearch /></main>;
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/isr-blog/page_functions.ts"),
    `export const revalidate = 1;\n`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/isr-blog/page.tsx"),
    `import { ClientSearch } from "@/components/client-search";
let count = 0;
export default function IsrPage() {
  count++;
  return <main><h1>{\`ISRCount:\${count}\`}</h1><ClientSearch /></main>;
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/server-search/page.tsx"),
    `import { useSearchParams } from "dinou";
export default function ServerSearchPage() {
  const sp = useSearchParams();
  return <h1>{\`ServerSearch:\${sp.get("q") ?? "NONE"}\`}</h1>;
}
`
  );

  process.chdir(miniRoot);
  const { rscEnginePath, ssrEnginePath } = await bundleDualEngine({
    isDev: false,
    projectRoot: miniRoot,
    outDir: ".dinou/node",
  });

  const dist2 = path.join(miniRoot, ".dinou/dist2");
  fs.mkdirSync(dist2, { recursive: true });
  const storage = new FileSystemStorage(dist2);
  setStorageAdapter(storage);

  const rscModule = await import(pathToFileURL(rscEnginePath).href);
  const ssrModule = await import(pathToFileURL(ssrEnginePath).href);
  if (typeof rscModule.setStorageAdapter === "function") {
    rscModule.setStorageAdapter(storage);
  }

  await rscModule.buildStaticPages();
  const staticPaths = rscModule.getStaticPaths();
  assert(staticPaths.includes("/isg/1/"));
  assert(staticPaths.includes("/isr-blog/"));
  assert(!staticPaths.includes("/server-search/"));

  // Pre-render root layout & ISR route
  const layoutRes = await rscModule.handleRequest(
    new Request("http://localhost/____rsc_layout____/"),
    { runtime: "node-bundle", isSSG: true }
  );
  await storage.set("layout.rsc", await layoutRes.text(), {
    status: 200,
    generatedAt: Date.now(),
  });

  await (
    await rscModule.handleRequest(new Request("http://localhost/isr-blog"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
      isSSG: true,
    })
  ).text();

  // ISG: query visit followed by clean visit MUST cache and serve subsequent requests from KV
  const qVisit = await rscModule.handleRequest(
    new Request("http://localhost/isg/99?q=boots"),
    { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
  );
  assert.match(await qVisit.text(), /ClientQ:boots/);
  assert.equal(await storage.get("isg/99/index.html"), null);

  const cleanVisit = await rscModule.handleRequest(
    new Request("http://localhost/isg/99"),
    { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
  );
  const cleanHtml = await cleanVisit.text();
  assert.match(cleanHtml, /Product:99:Render:3/);
  assert(await storage.get("isg/99/index.html"), "Expected /isg/99 to cache in storage!");

  const cachedVisit = await rscModule.handleRequest(
    new Request("http://localhost/isg/99?q=sneakers"),
    { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
  );
  assert.match(await cachedVisit.text(), /Product:99:Render:3/);

  // ISR: expire TTL -> trigger background regeneration -> assert refreshed cache stays static ISR
  await new Promise((r) => setTimeout(r, 1150));
  await (
    await rscModule.handleRequest(
      new Request("http://localhost/isr-blog?q=trigger"),
      { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
    )
  ).text();
  await new Promise((r) => setTimeout(r, 500));

  const isrHit1 = await (
    await rscModule.handleRequest(new Request("http://localhost/isr-blog"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();
  const isrHit2 = await (
    await rscModule.handleRequest(new Request("http://localhost/isr-blog"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();
  assert.match(isrHit1, /ISRCount:3/);
  assert.match(isrHit2, /ISRCount:3/, "Expected /isr-blog to remain cached ISR, not Dynamic SSR!");
} finally {
  process.chdir(projectRoot);
  fs.rmSync(miniRoot, { recursive: true, force: true });
}

console.log("✅ All bailout & useSearchParams verification checks passed!");
```

---

### 4.2. Permanent Fixtures & Playwright E2E Suite for `dev/dinou-e2e`

To permanently guard this behavior across all bundlers (`esbuild`, `rollup`, `webpack`) in both `dev` and `prod` (`build + start`), add the following fixture subtree and Playwright spec in `dinou-e2e`:

#### Fixture Tree (`src/t-bailout-search/`)
```text
src/t-bailout-search/
├── ClientSearchWidget.tsx        # "use client" component reading useSearchParams() directly in JSX
├── ssg/
│   └── page.tsx                  # Pure SSG route + ClientSearchWidget
├── isg/
│   └── [id]/
│       ├── page_functions.ts     # getStaticPaths = ["1"] (other IDs generated via on-demand ISG)
│       └── page.tsx              # Renders server timestamp/renderId + ClientSearchWidget
├── isr/
│   ├── page_functions.ts         # export const revalidate = 2;
│   └── page.tsx                  # Renders server renderId + ClientSearchWidget
└── server/
    └── page.tsx                  # Server Component calling useSearchParams() -> Automatic Static Bailout
```

##### `src/t-bailout-search/ClientSearchWidget.tsx`
```tsx
"use client";

import { useSearchParams } from "dinou";

export function ClientSearchWidget() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "EMPTY";
  return <p data-testid="client-search-value">ClientSearch:{q}</p>;
}
```

##### `src/t-bailout-search/ssg/page.tsx`
```tsx
import { ClientSearchWidget } from "../ClientSearchWidget";

let ssgRenderCount = 0;

export default function BailoutSsgPage() {
  ssgRenderCount++;
  return (
    <section>
      <h1 data-testid="ssg-render-count">SSG:{ssgRenderCount}</h1>
      <ClientSearchWidget />
    </section>
  );
}
```

##### `src/t-bailout-search/isg/[id]/page_functions.ts`
```ts
import type { PageFunctions } from "./dinou";

export const getStaticPaths: PageFunctions["getStaticPaths"] = ["1"];
```

##### `src/t-bailout-search/isg/[id]/page.tsx`
```tsx
import type { PageProps } from "./dinou";
import { ClientSearchWidget } from "../../ClientSearchWidget";

const renderCounts = new Map<string, number>();

export default function BailoutIsgPage({ params }: PageProps) {
  const next = (renderCounts.get(params.id) ?? 0) + 1;
  renderCounts.set(params.id, next);
  return (
    <section>
      <h1 data-testid="isg-render-count">
        ISG:{params.id}:{next}
      </h1>
      <ClientSearchWidget />
    </section>
  );
}
```

##### `src/t-bailout-search/isr/page_functions.ts`
```ts
import type { PageFunctions } from "./dinou";

export const revalidate: PageFunctions["revalidate"] = 2;
```

##### `src/t-bailout-search/isr/page.tsx`
```tsx
import { ClientSearchWidget } from "../ClientSearchWidget";

let isrRenderCount = 0;

export default function BailoutIsrPage() {
  isrRenderCount++;
  return (
    <section>
      <h1 data-testid="isr-render-count">ISR:{isrRenderCount}</h1>
      <ClientSearchWidget />
    </section>
  );
}
```

##### `src/t-bailout-search/server/page.tsx`
```tsx
import { useSearchParams } from "dinou";

let serverRenderCount = 0;

export default function BailoutServerSearchPage() {
  serverRenderCount++;
  const searchParams = useSearchParams();
  return (
    <section>
      <h1 data-testid="server-render-count">Server:{serverRenderCount}</h1>
      <p data-testid="server-search-value">
        ServerSearch:{searchParams.get("q") ?? "NONE"}
      </p>
    </section>
  );
}
```

---

#### Playwright E2E Spec (`tests/client-search-params-bailout.spec.ts`)

```ts
// tests/client-search-params-bailout.spec.ts
import { test, expect, type Page } from "@playwright/test";

function trackHydrationErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (/hydrat|mismatch|did not match/i.test(text)) {
        errors.push(text);
      }
    }
  });
  page.on("pageerror", (err) => {
    if (/hydrat|mismatch|did not match/i.test(err.message)) {
      errors.push(err.message);
    }
  });
  return errors;
}

test.describe("useSearchParams() Hydration & Static Bailout Semantics", () => {
  test("1. Pure SSG with Client useSearchParams() hydrates `?q=...` with zero hydration errors", async ({
    page,
  }) => {
    const hydrationErrors = trackHydrationErrors(page);

    await page.goto("/t-bailout-search/ssg?q=hydration-safe");
    await expect(page.getByTestId("client-search-value")).toHaveText(
      "ClientSearch:hydration-safe"
    );
    expect(hydrationErrors).toEqual([]);
  });

  test("2. Server Component calling useSearchParams() triggers Automatic Static Bailout (Live SSR)", async ({
    page,
  }) => {
    const hydrationErrors = trackHydrationErrors(page);

    await page.goto("/t-bailout-search/server?q=first");
    const firstCount = await page.getByTestId("server-render-count").textContent();
    await expect(page.getByTestId("server-search-value")).toHaveText(
      "ServerSearch:first"
    );

    await page.goto("/t-bailout-search/server?q=second");
    const secondCount = await page.getByTestId("server-render-count").textContent();
    await expect(page.getByTestId("server-search-value")).toHaveText(
      "ServerSearch:second"
    );

    expect(secondCount).not.toBe(firstCount);
    expect(hydrationErrors).toEqual([]);
  });

  test.describe("Production Caching Guarantees (ISG & Background ISR)", () => {
    test.skip(
      process.env.E2E_MODE === "dev",
      "ISG and ISR caching apply exclusively to production builds"
    );

    test("3. On-demand ISG route with Client useSearchParams() caches on first clean visit and hydrates `?q=...` without mismatch", async ({
      page,
    }) => {
      const hydrationErrors = trackHydrationErrors(page);
      const uniqueId = `item-${Date.now()}`;

      // 1st visit (clean URL): generates and caches ISG page
      await page.goto(`/t-bailout-search/isg/${uniqueId}`);
      await expect(page.getByTestId("isg-render-count")).toHaveText(
        `ISG:${uniqueId}:1`
      );
      await expect(page.getByTestId("client-search-value")).toHaveText(
        "ClientSearch:EMPTY"
      );

      // 2nd visit with query string: served from static ISG cache (render count stays 1!) while client syncs ?q=cached-ok
      await page.goto(`/t-bailout-search/isg/${uniqueId}?q=cached-ok`);
      await expect(page.getByTestId("isg-render-count")).toHaveText(
        `ISG:${uniqueId}:1`
      );
      await expect(page.getByTestId("client-search-value")).toHaveText(
        "ClientSearch:cached-ok"
      );
      expect(hydrationErrors).toEqual([]);
    });

    test("4. Background ISR route with Client useSearchParams() refreshes after TTL without de-optimizing to Dynamic SSR", async ({
      page,
      request,
    }) => {
      const hydrationErrors = trackHydrationErrors(page);

      await page.goto("/t-bailout-search/isr?q=initial");
      const initialRenderText = await page
        .getByTestId("isr-render-count")
        .textContent();
      await expect(page.getByTestId("client-search-value")).toHaveText(
        "ClientSearch:initial"
      );

      // Wait for revalidate = 2s TTL to expire, then trigger background SWR
      await page.waitForTimeout(2200);
      await request.get("/t-bailout-search/isr?q=swr-trigger");

      // Poll until background regeneration commits the new static snapshot
      await expect
        .poll(
          async () => {
            const res = await request.get("/t-bailout-search/isr");
            const html = await res.text();
            const match = html.match(/ISR:\d+/);
            return match ? match[0] : null;
          },
          { timeout: 10_000 }
        )
        .not.toBe(initialRenderText);

      // Verify route is STILL static ISR (two immediate back-to-back requests must return the exact same render count!)
      await page.goto("/t-bailout-search/isr?q=still-static-1");
      const refreshedCount1 = await page
        .getByTestId("isr-render-count")
        .textContent();
      await expect(page.getByTestId("client-search-value")).toHaveText(
        "ClientSearch:still-static-1"
      );

      await page.goto("/t-bailout-search/isr?q=still-static-2");
      const refreshedCount2 = await page
        .getByTestId("isr-render-count")
        .textContent();
      await expect(page.getByTestId("client-search-value")).toHaveText(
        "ClientSearch:still-static-2"
      );

      expect(refreshedCount1).toBe(refreshedCount2);
      expect(hydrationErrors).toEqual([]);
    });
  });
});
```

