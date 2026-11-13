# `<Suspense>` + `<DinouCacheSlot>` False Dynamic Bailout in ISG (`ppr = false`) & Strict Type Definitions — Architecture, Fix & Verification Guide

This document details the root cause, exact framework changes implemented in `dinou`, `CHANGELOG.md` entry, and complete CI + Playwright E2E test suites for fixing **false dynamic bailouts on on-demand ISG routes (`ppr = false`)** when `<DinouCacheSlot>` is wrapped inside a `<Suspense>` boundary, alongside unwrapping internal header inspection in `normalizeRevalidatePath` and tightening `DinouCacheSlotProps` TypeScript types.

---

## 1. Problem Statement & Root Cause

### 1.1. Intended Architecture in Dinou's 3D Segmentation Engine

When `<DinouCacheSlot>` (`dinou/core/cache-slot.js`) is placed inside a `<Suspense>` boundary, Dinou's rendering engine distinguishes three distinct contracts based on the route's `ppr` configuration and the slot's `revalidate` TTL:

1. **PPR Route (`ppr = true`) + `<Suspense>` + `<DinouCacheSlot revalidate >= 1>`**:
   - Registers a **Cached Dynamic PPR Hole**. The `<Suspense fallback={...}>` skeleton is baked into the static shell (`shell.html`), while the slot payload is streamed on navigation and cached independently in storage (`slots/<id>/slot.json`).

2. **Standard Static / ISR / ISG Route (`ppr = false`) + `<Suspense>` + `<DinouCacheSlot revalidate >= 1>`**:
   - **Must remain static (`dynamicState.value === false`)!**
   - At `dinou build` time (`isSSG === true`), `<Suspense>` resolves inline and embeds the cached `<DinouCacheSlot>` output directly into `index.html`.
   - At production runtime on an uncached **on-demand ISG** path (e.g. `GET /products/99` where `getStaticPaths` only pre-built `["1"]`), the page and slot must render without triggering Automatic Static Bailout, persist both `products/99/index.html` and `slots/<id>/slot.json` to KV/filesystem storage, and serve subsequent requests instantaneously from cache while allowing independent Micro-ISR background slot refreshes when the slot's shorter `revalidate` TTL expires.
   - Only if the route has *already* genuinely bailed out into Dynamic SSR (`_dynamicState.value === true`), or if the incoming request carries URL query parameters (`?utm_source=...`, where `handler.js` skips writing the full-page ISG snapshot anyway), should `DinouCacheSlot` stream a cold slot boundary inside `<Suspense>` via `DinouDeferredSlotStream`.

3. **Standard Route (`ppr = false`) + `<DinouCacheSlot revalidate={0}>` (with or without `<Suspense>`)**:
   - Explicitly opts out of caching (`isNoCache === true`) on a non-PPR route, so it **must trigger Automatic Static Bailout** (`_markDynamic()`) and render via Live Dynamic SSR.

---

### 1.2. What Went Wrong (Root Cause)

#### A. Primary Bug: `Object.keys(reqCtxInitial?.req?.query || {})` in `dinou/core/cache-slot.js`
When `asyncRenderJSXToClientJSX` (`dinou/core/render-jsx-to-client-jsx.js:712`) evaluates a `<Suspense>` boundary at runtime (`!isPprBuildActive()`), it executes the children inside `runInRuntimeDynamicHole(...)`, setting `isInsideRuntimeSuspenseOutsideSlot() === true`.

Inside `DinouCacheSlot` (`dinou/core/cache-slot.js`), `shouldStreamSlotInSuspense` checked whether the incoming request had query parameters by calling `Object.keys(...)` directly on `reqCtxInitial?.req?.query`:

```js
// ❌ Previous behavior in dinou/core/cache-slot.js
const reqCtxInitial = getContext();
const shouldStreamSlotInSuspense =
  isInsideRuntimeSuspenseOutsideSlot() &&
  !isPprBuildActive() &&
  !reqCtxInitial?.platformContext?.isSSG &&
  !isRevalidationActive() &&
  !isSlotDiscoveryActive() &&
  !reqCtxInitial?._isPprRuntimeResume &&
  (Boolean(reqCtxInitial?._dynamicState?.value) ||
    isNoCache ||
    Object.keys(reqCtxInitial?.req?.query || {}).length > 0 ||
    process.env.DINOU_DEV === "true" ||
    process.env.NODE_ENV !== "production");
```

On a production on-demand ISG request (`GET /products/99`, `NODE_ENV === "production"`, `ppr = false`):
- `isInsideRuntimeSuspenseOutsideSlot()` is `true` (because `<DinouCacheSlot>` is wrapped in `<Suspense>`).
- `!isPprBuildActive()`, `!isSSG`, `!isRevalidationActive()`, `!isSlotDiscoveryActive()`, and `!_isPprRuntimeResume` are all `true`.
- `Boolean(reqCtxInitial?._dynamicState?.value)` is `false` and `isNoCache` (`revalidate >= 1`) is `false`.
- JavaScript short-circuit evaluation therefore reached `Object.keys(reqCtxInitial?.req?.query || {})`.
- Because `reqCtxInitial.req.query` is wrapped in `createBailoutProxy(query, "Query", markDynamic)` (`dinou/core/handler.js:1203`), `Object.keys(...)` invoked the proxy's **`ownKeys` trap**, unconditionally firing `triggerBailout("Query", markDynamic)` **even when the URL had zero query parameters**!

This caused two compounding production failures on `ppr = false` ISG routes:
1. **Aborted ISG Page Caching**: `dynamicState.value` flipped to `true` mid-render. In `dinou/core/handler.js`, `shouldCacheISG` (`!dynamicState.value`) became `false`, skipping KV/filesystem persistence for `/products/99/index.html` and emitting `window.__DINOU_USE_STATIC__ = false`.
2. **Permanent In-Memory Route De-optimization**: Even if the first visitor arrived with an unread marketing parameter (`GET /products/99?utm_source=ads`), tripping `markDynamic` mutated `isDynamic.get("/products/99/").value = true` permanently in server memory, preventing all subsequent clean `GET /products/99` visits from ever caching via ISG.

*(At `dinou build` time, `!reqCtxInitial?.platformContext?.isSSG` was `false`, short-circuiting before `Object.keys(...)`, which masked this bug during Pure SSG builds and surfaced it exclusively at production runtime on ISG routes.)*

#### B. Secondary Internal Proxy Leak: `normalizeRevalidatePath` in `dinou/core/cache-revalidate.js`
A full audit of all `req.query`, `req.cookies`, and `req.headers` accesses across `dinou/core/` surfaced one additional internal framework helper reading through `createBailoutProxy`:
- In `dinou/core/cache-revalidate.js`, `normalizeRevalidatePath(reqPath)` resolves relative paths (e.g. `revalidatePage("./analytics")`) by inspecting `ctx.req.headers["x-dinou-current-path"]` and `ctx.req.headers.referer`.
- If `ctx.req.headers` was wrapped in `createBailoutProxy`, reading those internal resolution headers fired the proxy's `get` trap unnecessarily. Unwrapping `ctx.req.headers` via `unwrapBailoutProxy(ctx.req.headers)` keeps internal relative-URL resolution side-effect-free.

#### C. Loose `any` Types on `DinouCacheSlot` in `dinou/server.d.ts`
`DinouCacheSlotProps.children` and `DinouCacheSlot`'s return signature in `dinou/server.d.ts` previously used `any` and `Promise<any>` instead of strict `ReactNode` types (`ReactNode | (() => ReactNode | Promise<ReactNode>)` and `Promise<ReactNode>`).

---

## 2. Solution & Modified Framework Files

### 2.1. Summary of Modified Files

| File | Responsibility |
| :--- | :--- |
| `dinou/core/cache-slot.js` | Imports `unwrapBailoutProxy` from `./bailout-proxy.js` and unwraps `reqCtxInitial?.req?.query` (`const rawQueryInitial = unwrapBailoutProxy(reqCtxInitial?.req?.query)`) before checking `Object.keys(rawQueryInitial \|\| {}).length > 0` in `DinouCacheSlot`. |
| `dinou/core/cache-revalidate.js` | Imports `unwrapBailoutProxy` from `./bailout-proxy.js` and unwraps `ctx.req.headers` inside `normalizeRevalidatePath` before inspecting `x-dinou-current-path` / `referer`. |
| `dinou/server.d.ts` | Tightens `DinouCacheSlotProps.children` to `ReactNode \| (() => ReactNode \| Promise<ReactNode>)` and `DinouCacheSlot(props: DinouCacheSlotProps)` return type to `Promise<ReactNode>`. |

---

### 2.2. Exact Code Diffs

#### A. `dinou/core/cache-slot.js`
```diff
 import { getContext } from "./request-context.js";
+import { unwrapBailoutProxy } from "./bailout-proxy.js";
 import { getStorageAdapter } from "./storage-adapter.js";
```

```diff
 async function DinouCacheSlot(props) {
   const { id, tag, tags, revalidate, children } = props || {};
   const isNoCache = typeof revalidate === "number" && revalidate < 1;
   const reqCtxInitial = getContext();
+  const rawQueryInitial = unwrapBailoutProxy(reqCtxInitial?.req?.query);
   const shouldStreamSlotInSuspense =
     isInsideRuntimeSuspenseOutsideSlot() &&
     !isPprBuildActive() &&
     !reqCtxInitial?.platformContext?.isSSG &&
     !isRevalidationActive() &&
     !isSlotDiscoveryActive() &&
     !reqCtxInitial?._isPprRuntimeResume &&
     (Boolean(reqCtxInitial?._dynamicState?.value) ||
       isNoCache ||
-      Object.keys(reqCtxInitial?.req?.query || {}).length > 0 ||
+      Object.keys(rawQueryInitial || {}).length > 0 ||
       process.env.DINOU_DEV === "true" ||
       process.env.NODE_ENV !== "production");
```

#### B. `dinou/core/cache-revalidate.js`
```diff
 import { getDinouConfig } from "./load-dinou-config.js";
-import { createBailoutProxy } from "./bailout-proxy.js";
+import { createBailoutProxy, unwrapBailoutProxy } from "./bailout-proxy.js";
 import {
```

```diff
 function normalizeRevalidatePath(reqPath) {
   let targetPath = reqPath;
 
   if (targetPath && !targetPath.startsWith("/") && !targetPath.includes("://")) {
     const ctx = getContext();
     let currentPathname = "/";
-    if (ctx && ctx.req && ctx.req.headers) {
-      const headerPath =
-        ctx.req.headers["x-dinou-current-path"] ||
-        ctx.req.headers["X-Dinou-Current-Path"];
-      const referer = ctx.req.headers.referer;
+    if (ctx && ctx.req) {
+      const rawReqHeaders = unwrapBailoutProxy(ctx.req.headers);
+      const headerPath =
+        rawReqHeaders?.["x-dinou-current-path"] ||
+        rawReqHeaders?.["X-Dinou-Current-Path"];
+      const referer = rawReqHeaders?.referer;
       if (headerPath) {
         currentPathname = headerPath;
       } else if (referer) {
```

#### C. `dinou/server.d.ts`
```diff
+import type { ReactNode } from "react";
 import type { RequestContextStore } from "./index";
```

```diff
 export interface DinouCacheSlotProps {
   id?: string;
   tag?: string;
   tags?: string[];
   revalidate?: number;
-  children: any;
+  children: ReactNode | (() => ReactNode | Promise<ReactNode>);
 }
 
 /**
  * DinouCacheSlot: Vertical segmentation primitive (Micro-ISR) for React Server Components.
  * Caches and invalidates component sub-trees inside a page via revalidate and revalidateTag,
  * without re-evaluating the parent page or re-fetching unneeded database queries.
  */
-export declare function DinouCacheSlot(props: DinouCacheSlotProps): Promise<any>;
+export declare function DinouCacheSlot(props: DinouCacheSlotProps): Promise<ReactNode>;
```

---

### 2.3. Complete Behavior Matrix After Fix

| Route Mode | Composition | Incoming URL | Bailout (`dynamicState.value`) | Page & Slot Caching Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **Pure SSG (`dinou build`, `ppr = false`)** | `<Suspense>` + `<DinouCacheSlot revalidate={60}>` | Build-time (`isSSG: true`) | **`false`** | Resolved inline into static `index.html` + `slots/<id>/slot.json` |
| **On-Demand ISG (`ppr = false`)** | `<Suspense>` + `<DinouCacheSlot revalidate={60}>` | Clean URL (`/products/99`) | **`false`** | **Both `products/99/index.html` and `slots/<id>/slot.json` cached to KV!** Subsequent requests served from static cache; slot refreshes independently on TTL expiry |
| **On-Demand ISG (`ppr = false`)** | `<Suspense>` + `<DinouCacheSlot revalidate={60}>` | Unread query (`/products/99?utm_source=ads`) | **`false`** (`isDynamic` NOT poisoned!) | Streams cold slot for the query request without caching polluted HTML; next clean `/products/99` visit caches to KV normally |
| **Standard Route (`ppr = false`)** | `<Suspense>` + `<DinouCacheSlot revalidate={0}>` | Any URL | **`true`** (Intended bailout) | Explicit `revalidate={0}` opts into Live Dynamic SSR |
| **Standard Route (`ppr = false`)** | Server Component reads `req.query` + `<DinouCacheSlot revalidate={60}>` | Any URL | **`true`** (Intended bailout) | Page bails out to Live Dynamic SSR while `<DinouCacheSlot>` streams & caches its isolated sub-tree |
| **PPR Route (`ppr = true`)** | `<Suspense>` + `<DinouCacheSlot revalidate={60}>` | Build & Runtime | **`false`** (Registers PPR Hole) | `<Suspense>` fallback baked into `shell.html`; cached slot payload streamed into Dynamic PPR Hole |

---

## 3. `CHANGELOG.md` Entry

Add the following bullet under `### Fixed` in `dinou`'s `CHANGELOG.md`:

```markdown
### Fixed
- **False Dynamic Bailout on `<Suspense>`-Wrapped `<DinouCacheSlot>` in ISG (`ppr = false`)**: Fixed a bug in `DinouCacheSlot` where checking for incoming URL query parameters (`Object.keys(reqCtx.req.query)`) inside a runtime `<Suspense>` boundary accessed `req.query` through `createBailoutProxy` (`ownKeys` trap), falsely triggering Automatic Static Bailout even when no query parameters were present. Non-PPR on-demand ISG routes (`ppr = false`) wrapping `<DinouCacheSlot revalidate >= 1>` inside `<Suspense>` now cache cleanly to storage (`index.html` + `slots/<id>/slot.json`), preserve `isDynamic === false` across unread marketing query strings (`?utm_source=...`), and refresh Micro-ISR slots independently without re-rendering the parent page. Also unwrapped internal `req.headers` inspection in `normalizeRevalidatePath` and tightened `DinouCacheSlotProps` TypeScript types from `any` to `ReactNode`.
```

---

## 4. Verification & Test Suite for `dinou` / `dev/dinou-e2e`

### 4.1. Fast Standalone Unit, TypeScript & Dual-Engine CI Script (`scripts/verify-cache-slot-bailout-ci.mjs`)

This self-contained Node verification script tests low-level RSC/proxy invariants, `DinouCacheSlotProps` under TypeScript `strict: true`, and a full compiled Dual-Engine (`rsc-engine` + `ssr-engine`) ISG + Micro-ISR pipeline in ~4 seconds:

```js
// scripts/verify-cache-slot-bailout-ci.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React, { Suspense } from "react";
import ts from "typescript";

import { DinouCacheSlot } from "../dinou/core/cache-slot.js";
import { createBailoutProxy } from "../dinou/core/bailout-proxy.js";
import { getContext, requestStorage } from "../dinou/core/request-context.js";
import { asyncRenderJSXToClientJSX } from "../dinou/core/render-jsx-to-client-jsx.js";
import {
  markPageRootElement,
  runWithPprContext,
  resetPprHoles,
  getRegisteredHoles,
} from "../dinou/core/ppr-context.js";
import {
  MemoryStorage,
  FileSystemStorage,
  setStorageAdapter,
} from "../dinou/core/storage-adapter.js";
import { revalidatePage } from "../dinou/core/cache-revalidate.js";
import { bundleDualEngine } from "../dinou/node/bundle-dual-engine.js";

process.env.NODE_ENV = "production";
delete process.env.DINOU_DEV;

const projectRoot = process.cwd();

function makeContext({ pathStr = "/products/99/", query = {}, headers = {}, isSSG = false } = {}) {
  const dynamicState = { value: false };
  const markDynamic = () => {
    dynamicState.value = true;
  };
  return {
    dynamicState,
    ctx: {
      req: {
        path: pathStr,
        method: "GET",
        query: createBailoutProxy(query, "Query", markDynamic),
        cookies: createBailoutProxy({}, "Cookies", markDynamic),
        headers: createBailoutProxy(headers, "Headers", markDynamic),
      },
      res: {},
      platformContext: { isSSG },
      _dynamicState: dynamicState,
      _markDynamic: markDynamic,
    },
  };
}

console.log("1️⃣ Unit-testing <Suspense> + <DinouCacheSlot> bailout invariants...");
{
  // 1a. Clean ISG request (ppr = false, revalidate = 60) -> NO bailout, slot persisted
  const storage = new MemoryStorage();
  setStorageAdapter(storage);

  async function LiveStockCounter() {
    return React.createElement("span", null, "In stock: 42");
  }
  function ProductPage() {
    return React.createElement(
      "main",
      null,
      React.createElement(
        Suspense,
        { fallback: React.createElement("span", null, "Loading...") },
        React.createElement(
          DinouCacheSlot,
          { id: "stock-99", revalidate: 60 },
          React.createElement(LiveStockCounter, null)
        )
      )
    );
  }

  const { ctx, dynamicState } = makeContext({ pathStr: "/products/99/", query: {} });
  await requestStorage.run(ctx, async () => {
    const pageEl = markPageRootElement(React.createElement(ProductPage, null), false);
    await asyncRenderJSXToClientJSX(pageEl);
  });

  assert.equal(dynamicState.value, false, "ISG <Suspense> + <DinouCacheSlot revalidate={60}> must NOT bail out");
  const storedSlot = await storage.get("slots/stock-99/slot.json");
  assert.ok(storedSlot?.content, "Slot must be persisted in storage");
  assert.equal(storedSlot.metadata?.inStaticShell, true);

  // 1b. Unread query param (?utm_source=newsletter) -> NO bailout poisoning
  const { ctx: qCtx, dynamicState: qDyn } = makeContext({
    pathStr: "/products/100/",
    query: { utm_source: "newsletter" },
  });
  let rendered;
  await requestStorage.run(qCtx, async () => {
    const pageEl = markPageRootElement(React.createElement(ProductPage, null), false);
    rendered = await asyncRenderJSXToClientJSX(pageEl);
  });
  assert.equal(qDyn.value, false, "Unread query param must NOT poison dynamicState via DinouCacheSlot");
  if (rendered?.props?.children?.props?.children?.props?.promise) {
    await rendered.props.children.props.children.props.promise;
  }

  // 1c. revalidate={0} on ppr=false -> MUST trigger bailout
  const { ctx: zeroCtx, dynamicState: zeroDyn } = makeContext({ pathStr: "/live/", query: {} });
  await requestStorage.run(zeroCtx, async () => {
    const pageEl = markPageRootElement(
      React.createElement(
        Suspense,
        { fallback: null },
        React.createElement(DinouCacheSlot, { id: "zero", revalidate: 0 }, React.createElement("span", null, "Live"))
      ),
      false
    );
    await asyncRenderJSXToClientJSX(pageEl);
  });
  assert.equal(zeroDyn.value, true, "revalidate={0} on ppr=false MUST trigger bailout");

  // 1d. PPR route (ppr=true) -> registers Dynamic PPR Hole without full-route bailout
  const { ctx: pprCtx, dynamicState: pprDyn } = makeContext({ pathStr: "/telemetry/", isSSG: true });
  let holes = [];
  await requestStorage.run(pprCtx, async () => {
    await runWithPprContext({ isPpr: true }, async () => {
      resetPprHoles(0);
      const pageEl = markPageRootElement(React.createElement(ProductPage, null), true);
      await asyncRenderJSXToClientJSX(pageEl);
      holes = getRegisteredHoles();
    });
  });
  assert.equal(pprDyn.value, false);
  assert.deepEqual(holes, ["ppr-hole-1"]);

  // 1e. normalizeRevalidatePath relative URL resolution -> does NOT trip headers bailout proxy
  const { ctx: revCtx, dynamicState: revDyn } = makeContext({
    pathStr: "/dashboard/",
    headers: { "x-dinou-current-path": "/dashboard" },
  });
  await requestStorage.run(revCtx, async () => {
    try {
      await revalidatePage("./analytics");
    } catch (_) {}
  });
  assert.equal(revDyn.value, false, "normalizeRevalidatePath must unwrap headers proxy");
}

console.log("2️⃣ Type-checking DinouCacheSlotProps in dinou/server.d.ts (strict: true)...");
{
  const virtualFile = path.resolve(projectRoot, "src/_verify_slot_dts.tsx");
  const code = `
import { DinouCacheSlot, type DinouCacheSlotProps } from "dinou/server";

async function AsyncWidget() {
  return <div>Async</div>;
}

export function ValidUsages() {
  const fnProps: DinouCacheSlotProps = {
    id: "fn-slot",
    revalidate: 30,
    children: async () => <AsyncWidget />,
  };
  return (
    <div>
      <DinouCacheSlot id="1" revalidate={60}>
        <AsyncWidget />
      </DinouCacheSlot>
      <DinouCacheSlot {...fnProps} />
    </div>
  );
}
`;
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot);
  const baseHost = ts.createCompilerHost(parsed.options);
  const origGetSourceFile = baseHost.getSourceFile.bind(baseHost);
  baseHost.getSourceFile = (fileName, languageVersion, ...rest) => {
    if (path.resolve(fileName) === virtualFile) {
      return ts.createSourceFile(fileName, code, languageVersion, true, ts.ScriptKind.TSX);
    }
    return origGetSourceFile(fileName, languageVersion, ...rest);
  };
  baseHost.fileExists = (fileName) =>
    path.resolve(fileName) === virtualFile || ts.sys.fileExists(fileName);
  baseHost.readFile = (fileName) =>
    path.resolve(fileName) === virtualFile ? code : ts.sys.readFile(fileName);

  const program = ts.createProgram([virtualFile], { ...parsed.options, noEmit: true }, baseHost);
  const diagnostics = ts.getPreEmitDiagnostics(program, program.getSourceFile(virtualFile));
  assert.equal(diagnostics.length, 0, `Expected 0 TS errors, got: ${diagnostics.map((d) => d.messageText).join("; ")}`);
}

console.log("3️⃣ Integration-testing Dual-Engine ISG + Micro-ISR (<Suspense> + <DinouCacheSlot>)...");
const miniRoot = path.resolve(projectRoot, ".dinou/_tmp_slot_isg_verify");
fs.rmSync(miniRoot, { recursive: true, force: true });

try {
  fs.mkdirSync(path.join(miniRoot, "src/products/[slug]"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/live-zero"), { recursive: true });

  fs.writeFileSync(
    path.join(miniRoot, "package.json"),
    JSON.stringify({ name: "slot-isg-verify", type: "module" }, null, 2)
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html><head><title>Slot ISG</title></head><body>{children}</body></html>;
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/products/[slug]/page_functions.ts"),
    `export const getStaticPaths = ["1"];
export const revalidate = 3600;
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/products/[slug]/page.tsx"),
    `import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";

const pageCounts = new Map<string, number>();
const slotCounts = new Map<string, number>();

async function LiveStockCounter({ slug }: { slug: string }) {
  const next = (slotCounts.get(slug) ?? 0) + 1;
  slotCounts.set(slug, next);
  return <div data-testid="slot-stock">{\`Stock:\${slug}:SlotRender:\${next}\`}</div>;
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const nextPage = (pageCounts.get(params.slug) ?? 0) + 1;
  pageCounts.set(params.slug, nextPage);
  return (
    <main>
      <h1>{\`Product:\${params.slug}:PageRender:\${nextPage}\`}</h1>
      <Suspense fallback={<span>Loading stock...</span>}>
        <DinouCacheSlot id={\`stock-\${params.slug}\`} revalidate={1}>
          <LiveStockCounter slug={params.slug} />
        </DinouCacheSlot>
      </Suspense>
    </main>
  );
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/live-zero/page.tsx"),
    `import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";

let count = 0;
export default function LiveZeroPage() {
  count++;
  return (
    <main>
      <h1>{\`LiveZeroPage:\${count}\`}</h1>
      <Suspense fallback={<span>Loading...</span>}>
        <DinouCacheSlot id="zero-slot" revalidate={0}>
          <span>Live</span>
        </DinouCacheSlot>
      </Suspense>
    </main>
  );
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
  assert(staticPaths.includes("/products/1/"));
  assert(!staticPaths.includes("/live-zero/"));

  const layoutRes = await rscModule.handleRequest(
    new Request("http://localhost/____rsc_layout____/"),
    { runtime: "node-bundle", isSSG: true }
  );
  await storage.set("layout.rsc", await layoutRes.text(), {
    status: 200,
    generatedAt: Date.now(),
  });

  // Unread query visit does not poison isDynamic
  await (
    await rscModule.handleRequest(
      new Request("http://localhost/products/99?utm_source=ads"),
      { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
    )
  ).text();
  assert.equal(await storage.get("products/99/index.html"), null);

  // Clean ISG visit caches both page and slot
  const cleanHtml1 = await (
    await rscModule.handleRequest(new Request("http://localhost/products/99"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();
  assert.match(cleanHtml1, /Product:99:PageRender:2/);
  assert.match(cleanHtml1, /window\.__DINOU_USE_STATIC__ = true;/);
  assert(await storage.get("products/99/index.html"));
  assert(await storage.get("slots/stock-99/slot.json"));

  // Cached hit does not re-run page
  const cleanHtml2 = await (
    await rscModule.handleRequest(new Request("http://localhost/products/99"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();
  assert.match(cleanHtml2, /Product:99:PageRender:2/);
  const initialSlotRender = Number(cleanHtml2.match(/Stock:99:SlotRender:(\d+)/)[1]);

  // Micro-ISR slot expiry refreshes ONLY the slot while keeping PageRender:2 intact
  await new Promise((r) => setTimeout(r, 1150));
  await (
    await rscModule.handleRequest(new Request("http://localhost/products/99"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();
  await new Promise((r) => setTimeout(r, 500));

  const afterSlotSwrHtml = await (
    await rscModule.handleRequest(new Request("http://localhost/products/99"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();
  assert.match(afterSlotSwrHtml, /Product:99:PageRender:2/);
  const refreshedSlotRender = Number(afterSlotSwrHtml.match(/Stock:99:SlotRender:(\d+)/)[1]);
  assert(refreshedSlotRender > initialSlotRender);
} finally {
  process.chdir(projectRoot);
  fs.rmSync(miniRoot, { recursive: true, force: true });
}

console.log("✅ All <Suspense> + <DinouCacheSlot> ISG bailout & type checks passed!");
```

---

### 4.2. Permanent Fixtures & Playwright E2E Suite for `dev/dinou-e2e`

To guard `<Suspense>` + `<DinouCacheSlot>` behavior on non-PPR ISG routes across all bundlers (`esbuild`, `rollup`, `webpack`) in `dinou-e2e`, add the following fixture subtree and Playwright spec:

#### Fixture Tree (`src/t-cache-slot-isg/`)
```text
src/t-cache-slot-isg/
├── products/
│   └── [slug]/
│       ├── page_functions.ts     # getStaticPaths = ["1"], revalidate = 3600 (ppr = false default)
│       └── page.tsx              # Renders PageRender counter + <Suspense><DinouCacheSlot revalidate={2}>
└── live-zero/
    └── page.tsx                  # Non-PPR route with <Suspense><DinouCacheSlot revalidate={0}> -> Live SSR
```

##### `src/t-cache-slot-isg/products/[slug]/page_functions.ts`
```ts
import type { PageFunctions } from "./dinou";

export const getStaticPaths: PageFunctions["getStaticPaths"] = ["1"];
export const revalidate: PageFunctions["revalidate"] = 3600;
```

##### `src/t-cache-slot-isg/products/[slug]/page.tsx`
```tsx
import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";
import type { PageProps } from "./dinou";

const pageRenders = new Map<string, number>();
const slotRenders = new Map<string, number>();

async function StockBadge({ slug }: { slug: string }) {
  const next = (slotRenders.get(slug) ?? 0) + 1;
  slotRenders.set(slug, next);
  return <p data-testid="slot-render-count">Slot:{slug}:{next}</p>;
}

export default function SlotIsgProductPage({ params }: PageProps) {
  const nextPage = (pageRenders.get(params.slug) ?? 0) + 1;
  pageRenders.set(params.slug, nextPage);

  return (
    <section>
      <h1 data-testid="page-render-count">Page:{params.slug}:{nextPage}</h1>
      <Suspense fallback={<p data-testid="slot-fallback">Loading stock...</p>}>
        <DinouCacheSlot id={`e2e-stock-${params.slug}`} revalidate={2}>
          <StockBadge slug={params.slug} />
        </DinouCacheSlot>
      </Suspense>
    </section>
  );
}
```

##### `src/t-cache-slot-isg/live-zero/page.tsx`
```tsx
import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";

let liveZeroRenders = 0;

export default function SlotLiveZeroPage() {
  liveZeroRenders++;
  return (
    <section>
      <h1 data-testid="live-zero-count">LiveZero:{liveZeroRenders}</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <DinouCacheSlot id="e2e-zero-slot" revalidate={0}>
          <p data-testid="live-zero-slot">LivePayload:{liveZeroRenders}</p>
        </DinouCacheSlot>
      </Suspense>
    </section>
  );
}
```

---

#### Playwright E2E Spec (`tests/cache-slot-isg-bailout.spec.ts`)

```ts
// tests/cache-slot-isg-bailout.spec.ts
import { test, expect } from "@playwright/test";

test.describe("<Suspense> + <DinouCacheSlot> on Non-PPR ISG Routes", () => {
  test("1. <DinouCacheSlot revalidate={0}> on ppr=false triggers Automatic Static Bailout (Live SSR)", async ({
    page,
  }) => {
    await page.goto("/t-cache-slot-isg/live-zero");
    const first = await page.getByTestId("live-zero-count").textContent();

    await page.goto("/t-cache-slot-isg/live-zero");
    const second = await page.getByTestId("live-zero-count").textContent();

    expect(second).not.toBe(first);
  });

  test.describe("Production On-Demand ISG + Micro-ISR Guarantees", () => {
    test.skip(
      process.env.E2E_MODE === "dev",
      "ISG and Micro-ISR caching apply exclusively to production builds"
    );

    test("2. Uncached ISG route with <Suspense> + <DinouCacheSlot revalidate={2}> caches page and refreshes slot independently", async ({
      page,
      request,
    }) => {
      const slug = `sku-${Date.now()}`;

      // Optional first visit with unread marketing query string must NOT poison ISG eligibility
      await page.goto(`/t-cache-slot-isg/products/${slug}?utm_source=campaign`);
      await expect(page.getByTestId("page-render-count")).toHaveText(
        `Page:${slug}:1`
      );

      // Clean visit generates and caches the static ISG snapshot (Page render #2)
      await page.goto(`/t-cache-slot-isg/products/${slug}`);
      await expect(page.getByTestId("page-render-count")).toHaveText(
        `Page:${slug}:2`
      );
      const initialSlotText = await page
        .getByTestId("slot-render-count")
        .textContent();

      // Immediate repeat visit hits cached ISG snapshot (Page render stays 2!)
      await page.goto(`/t-cache-slot-isg/products/${slug}`);
      await expect(page.getByTestId("page-render-count")).toHaveText(
        `Page:${slug}:2`
      );
      await expect(page.getByTestId("slot-render-count")).toHaveText(
        initialSlotText!
      );

      // Wait for slot TTL (2s) to expire while parent page TTL (3600s) stays fresh
      await page.waitForTimeout(2200);
      await request.get(`/t-cache-slot-isg/products/${slug}`);

      // Poll until Micro-ISR updates ONLY the slot while keeping Page render at 2
      await expect
        .poll(
          async () => {
            const res = await request.get(`/t-cache-slot-isg/products/${slug}`);
            const html = await res.text();
            const match = html.match(new RegExp(`Slot:${slug}:\\d+`));
            return match ? match[0] : null;
          },
          { timeout: 10_000 }
        )
        .not.toBe(initialSlotText);

      await page.goto(`/t-cache-slot-isg/products/${slug}`);
      await expect(page.getByTestId("page-render-count")).toHaveText(
        `Page:${slug}:2`
      );
    });
  });
});
```

