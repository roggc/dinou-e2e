# Production `<Suspense>` Streaming & Direct `Promise<ReactNode>` JSX Children Fixes — Architecture, Diffs & Verification Guide

This document details the root causes, exact framework changes implemented across `dinou`, ready-to-paste `CHANGELOG.md` entries, and complete unit + Playwright E2E verification test suites for fixing **two core streaming & React 19 `Promise` rendering bugs in Dinou's RSC / SSR / PPR / `<DinouCacheSlot>` pipeline** prior to publishing `dinou@9.4.0`:

1. **Bug #1 — `<Suspense>` Progressive Streaming Was Blocked in Production on Dynamic SSR Routes (`NODE_ENV === "production"`)** (`dinou/core/render-jsx-to-client-jsx.js`, `dinou/core/handler.js`).
2. **Bug #2 — Direct `Promise<ReactNode>` JSX Children (`<Suspense>{getMetricsTable()}</Suspense>`, `<DinouCacheSlot>{getMetricsTable()}</DinouCacheSlot>`) Failed to Register PPR Holes, Corrupted `slot.json` / `shell.page.json` with `"{}"`, and Skipped Server Subtree Resolution While Needing to Preserve Raw Flight `Promise` Props on Client Components** (`dinou/core/render-jsx-to-client-jsx.js`, `dinou/core/ppr-runtime.js`).

---

## 1. Problem Statement & Root Causes

### 1.1. Bug #1: `process.env.NODE_ENV === "production"` Disabled `<Suspense>` Progressive Streaming on Dynamic SSR Routes

#### Intended Behavior
Dinou supports two distinct `<Suspense>` execution modes depending on whether the route is being cached statically or streamed dynamically:
- **Static / Clean ISG / ISR / PPR Build Passes** (`isSSG === true`, `_isStaticHtmlRender === true`, `isRevalidationActive() === true`, `getPprStore()`, or a clean ISG candidate request where `_dynamicState.value === false` and URL `query` is empty): `<Suspense>` boundaries must **settle eagerly** inside `asyncRenderJSXToClientJSX` so that pre-rendered `index.html` and `page.rsc` artifacts contain 100% settled DOM without `<Suspense>` fallback skeleton flashes, and so any dynamic request access (`req.cookies`, `req.headers`, `req.query`, `useSearchParams()`) inside `<Suspense>` is detected *before* `shouldCacheISG` decides whether to persist the artifact.
- **Dynamic Streaming SSR & Soft Navigation** (`export const revalidate = 0`, routes that already triggered dynamic bailout via `_dynamicState.value === true`, URLs carrying `?query` parameters that `handler.js` never caches as ISG, or `POST /____server_function____` RPC contexts): `<Suspense>` boundaries (without `<DinouCacheSlot>`, which manages its own hit/miss `DinouDeferredSlotStream`) must wrap their children in `DinouSuspenseHoleBoundary` so **Chunk 1** (`<head>`, layout shell, static header, and `<Suspense fallback>`) flushes immediately with fast TTFB while slow async Server Components resolve in parallel and stream **Chunk 2** (`$RC` swap + inline `__DINOU_RSC_P__` Flight payload).

#### Root Cause
In `dinou/core/render-jsx-to-client-jsx.js` (lines 705–710), `shouldEagerlyResolveSuspense` included an unconditional `process.env.NODE_ENV === "production"` check:

```js
// ❌ Previous behavior in dinou/core/render-jsx-to-client-jsx.js
const shouldEagerlyResolveSuspense =
  Boolean(getPprStore()) ||
  Boolean(getActiveRuntimeDynamicHoleStore()) ||
  Boolean(getContext()?.platformContext?.isSSG) ||
  process.env.NODE_ENV === "production" ||
  containsCacheSlot(jsx.props?.children);
```

Because `process.env.NODE_ENV === "production"` is always `true` in production builds:
1. `DinouSuspenseHoleBoundary` (along with its `holeBoundaryPromiseCache` deduplication across `streamForSsr` and `createInlineRscHtmlStream`) was **completely dead code in production**.
2. On Dynamic Streaming SSR routes (`export const revalidate = 0`, cookie/header-authenticated pages, or `?q=...` search pages), `getJSX()` eagerly `await`ed every slow `<Suspense>` child before `renderRSCStream` or `renderHtmlStream` even started—blocking TTFB 100% in production on both initial HTML loads and client-side soft navigations (`/____rsc_page____`).
3. Meanwhile, `dinou/core/cache-slot.js` (`shouldStreamSlotInSuspense`) had already been updated to check `_dynamicState?.value` and `unwrapBailoutProxy(reqCtx?.req?.query)`, creating an inconsistency where `<Suspense><DinouCacheSlot revalidate={0}>` streamed progressively in production while standard `<Suspense><SlowHeavyMetrics /></Suspense>` blocked TTFB.
4. Additionally, `createServerFunctionContext` in `dinou/core/handler.js` omitted `_dynamicState: { value: true }`.

---

### 1.2. Bug #2: Direct `Promise<ReactNode>` JSX Children (`<Suspense>{getMetricsTable()}</Suspense>`) vs. Client Component Flight `Promise` Props (`<Client use(promise) />`)

#### Intended Behavior
In React 19 + Dinou RSC, a `Promise` can appear in two fundamentally different positions in a Server Component's JSX tree:
1. **Server JSX Position** (e.g., `<Suspense fallback={<Skeleton />}>{getMetricsTable()}</Suspense>`, `<div>{[getBanner(), <Main />]}</div>`, or `<DinouCacheSlot id="metrics" revalidate={3600}>{getMetricsTable()}</DinouCacheSlot>`, where `async function getMetricsTable(): Promise<ReactNode>` is invoked directly as a JSX expression instead of `<MetricsTable />`):
   - **PPR Static Shell Build (`ppr = true`)**: Must register the enclosing `<Suspense>` boundary as a dynamic hole (`markDynamicAccess("async-suspense")` ➔ `ppr-hole-N`) and emit the `<div data-ppr-hole="ppr-hole-N">` fallback into `shell.html` / `shell.page.json`.
   - **SSG / Clean ISG / `<DinouCacheSlot>` / Runtime Hole Evaluation**: Must `await` the `Promise` and recursively pass the resolved `ReactNode` through `asyncRenderJSXToClientJSX(resolved, key, false)` so nested Server Components, `useId()` slot/hole deterministic IDs, and `serializeJSX()` receive a fully resolved element tree.
   - **PPR Runtime Hole Traversal (`spliceDynamicHolesIntoShell` & `streamDynamicHoles`)**: Any Server JSX `Promise` outside dynamic holes must be awaited and traversed in deterministic tree order so `holeIndex` stays 100% synchronized with build-time hole IDs.
2. **Client Component `props` Position** (e.g., `<SearchResultsClient promise={resultsPromise} />` or `getProps` returning `{ documentPromise }` to a `"use client"` `page.tsx`, consumed on the client via React 19 `use(promise)`):
   - **PPR Static Shell Build (`ppr = true`)**: If rendered inside an outer `<Suspense>` boundary, passing a live `Promise` prop to a Client Component must still trigger `markDynamicAccess("async-suspense")` so the `<Suspense>` boundary becomes a PPR dynamic hole instead of freezing a build-time Flight promise into `shell.html`.
   - **Runtime SSR / PPR Resume / Client Flight Stream**: Must **NEVER be awaited** by `asyncRenderJSXToClientJSX`, `spliceDynamicHolesIntoShell`, or `streamDynamicHoles`! It must remain an un-awaited `Promise` reference inside `props` so React Flight serializes it as a lazy `$@N` chunk and flushes the surrounding shell in 0ms while the client unwraps it with `use(promise)`.
   - **JSX Elements Nested Inside Client Props** (e.g., `<ClientModal header={<ServerHeader />}><div>{getMetricsTable()}</div></ClientModal>`): As soon as traversal enters a React element (`$$typeof === Symbol.for("react.transitional.element")`) passed inside a Client Component's `props`, traversal re-enters **Server JSX mode** (`insideClientProps = false`) so `<ServerHeader />` and `{getMetricsTable()}` resolve on the server before Flight serialization.

#### Root Causes
1. **Single `Promise` child bypassed PPR `markDynamicAccess`**: In `dinou/core/render-jsx-to-client-jsx.js`, `Array.isArray(jsx)` (line 607) and plain object `Object.entries(jsx)` (line 845) called `markDynamicAccess("async-suspense")` on thenables, whereas a single `Promise` child (`<Suspense fallback={<Skeleton />}>{getMetricsTable()}</Suspense>`) passed `jsx.props.children` directly to `asyncRenderJSXToClientJSX(jsx.props?.children)`, which hit `else if (jsx instanceof Promise) { return jsx; }` at line 839—completely skipping `markDynamicAccess("async-suspense")`! During a `ppr = true` build, no `ppr-hole-*` was registered and `serializeJSX` serialized the raw `Promise` as `{}` into `shell.page.json`.
2. **Un-awaited Server JSX `Promise`s corrupted `<DinouCacheSlot>` & SSG**: Returning raw `Promise` values in Server JSX caused `<DinouCacheSlot>{getMetricsTable()}</DinouCacheSlot>` to pass an un-awaited `Promise` directly to `serializeJSX(resolved)`, persisting `"{}"` into `slots/<id>/slot.json` (`Objects are not valid as a React child` on deserialization), and bypassed recursive `asyncRenderJSXToClientJSX` transformation on any Server Components returned inside `getMetricsTable()`.
3. **ECMAScript `async function` `PromiseResolve` unwrapping trap**: In JavaScript, returning a `Promise` from an `async function` (`if (insideClientProps) return jsx;`) automatically unwraps/awaits that `Promise` before resolving the outer `async` call! Therefore, preserving un-awaited Flight `Promise` props inside Client Component `props` requires short-circuiting `isThenable(value)` **inside the parent `Object.entries(jsx)` and `Array.isArray(jsx)` loops** when `insideClientProps === true` (pushing the raw `Promise` directly into the resulting plain object/array without passing it as the top-level return value of an `async` call).
4. **`ppr-runtime.js` skipped all `Promise` nodes indiscriminately**: Both `spliceDynamicHolesIntoShell` and `streamDynamicHoles` had `if (typeof current !== "object" || current instanceof Promise) return;`, ignoring Server JSX promises that could contain `<Suspense>` boundaries while needing `inClientProps` tracking so Client Component prop promises remain un-awaited.

---

## 2. Summary of Framework Changes Implemented in `dinou/`

| File | Summary of Changes |
| :--- | :--- |
| `dinou/core/render-jsx-to-client-jsx.js` | Imported `unwrapBailoutProxy` and added `isRevalidationActive()` (`Symbol.for("dinou.reval.queue.storage")`). Replaced the unconditional `process.env.NODE_ENV === "production"` eager `<Suspense>` guard with `shouldStreamDynamicSuspense` so dynamic SSR routes (`_dynamicState.value === true` or non-empty `rawQuery` via `unwrapBailoutProxy` without tripping `BailoutProxy`) stream progressively via `DinouSuspenseHoleBoundary` in production while SSG, ISR revalidation, PPR builds, PPR hole resume, and clean ISG candidates continue settling `<Suspense>` eagerly. Added `attachSilentRejectionHandler` for deferred hole children, `handlePprThenableAccess`, and `insideClientProps` tracking so Server JSX `Promise<ReactNode>` values register PPR holes or await + recursively render, while Client Component `Promise` props remain un-awaited for Flight `use()`. |
| `dinou/core/ppr-runtime.js` | Threaded `inClientProps = false` through `traverse` and `traverseProps` in both `spliceDynamicHolesIntoShell` and `streamDynamicHoles`. Client Component references traverse their `props` with `inClientProps = true` (never awaiting Flight prop promises), React elements reset `inClientProps` to `false`, and Server JSX thenables outside dynamic holes are awaited and traversed so `holeIndex` stays synchronized. |
| `dinou/core/handler.js` | Added `_dynamicState: { value: true }` to `createServerFunctionContext` so any `asyncRenderJSXToClientJSX` invocation within `POST /____server_function____` recognizes the active context as a live dynamic RPC request in production. |

### Exact Unified Diffs

#### 2.1. `dinou/core/render-jsx-to-client-jsx.js`

```diff
--- a/dinou/core/render-jsx-to-client-jsx.js
+++ b/dinou/core/render-jsx-to-client-jsx.js
@@ -31,14 +31,20 @@ import {
   isSlotDiscoveryActive,
 } from "./ppr-context.js";
 import { getContext } from "./request-context.js";
+import { unwrapBailoutProxy } from "./bailout-proxy.js";
 
 const REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel");
 const REACT_CONTEXT_TYPE = Symbol.for("react.context");
 const CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference");
 const SERVER_HOOKS_IMPL_KEY = Symbol.for("dinou.server.hooks.impl");
 const HOLE_BOUNDARY_PROMISE_CACHE_KEY = Symbol.for(
   "dinou.hole.boundary.promise.cache"
 );
+const REVAL_QUEUE_STORAGE_KEY = Symbol.for("dinou.reval.queue.storage");
+
+function isRevalidationActive() {
+  return Boolean(globalThis[REVAL_QUEUE_STORAGE_KEY]?.getStore());
+}
 
 let fallbackRenderSeq = 0;
 
@@ -566,64 +572,125 @@ async function DinouSuspenseHoleBoundary(props) {
 }
 DinouSuspenseHoleBoundary.$$dinouDeferredSuspenseStream = true;
 
-async function asyncRenderJSXToClientJSX(jsx, key = null) {
+function attachSilentRejectionHandler(node) {
+  if (!node) return;
+  if (isThenable(node)) {
+    try {
+      node.then(null, () => {});
+    } catch (_) {}
+    return;
+  }
+  if (Array.isArray(node)) {
+    for (const item of node) {
+      attachSilentRejectionHandler(item);
+    }
+  }
+}
+
+function handlePprThenableAccess(thenable) {
+  if (
+    isPprBuildActive() &&
+    isInsideOuterSuspenseOutsideSlot() &&
+    !isSlotDiscoveryActive() &&
+    !isNoDynamicActive()
+  ) {
+    try {
+      thenable.then(null, () => {});
+    } catch (_) {}
+    markDynamicAccess("async-suspense");
+  }
+}
+
+async function asyncRenderJSXToClientJSX(
+  jsx,
+  key = null,
+  insideClientProps = false
+) {
   if (isPageRootElement(jsx)) {
     const pagePpr = getPageRootPpr(jsx);
     return await runWithSegmentPpr(pagePpr, () =>
       runInPageSegment(async () => {
-        const resolved = await asyncRenderJSXToClientJSXInner(jsx, key);
+        const resolved = await asyncRenderJSXToClientJSXInner(
+          jsx,
+          key,
+          insideClientProps
+        );
         const ctx = getContext();
         if (ctx) {
           ctx._resolvedPageClientJsx = resolved;
         }
         return resolved;
       })
     );
   }
   if (isLayoutRootElement(jsx)) {
     const layoutPpr = getLayoutRootPpr(jsx);
     return await runWithSegmentPpr(layoutPpr, () =>
       runInLayoutSegment(async () => {
-        return await asyncRenderJSXToClientJSXInner(jsx, key);
+        return await asyncRenderJSXToClientJSXInner(
+          jsx,
+          key,
+          insideClientProps
+        );
       })
     );
   }
-  return await asyncRenderJSXToClientJSXInner(jsx, key);
+  return await asyncRenderJSXToClientJSXInner(jsx, key, insideClientProps);
 }
 
-async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
+async function asyncRenderJSXToClientJSXInner(
+  jsx,
+  key = null,
+  insideClientProps = false
+) {
   if (
     typeof jsx === "string" ||
     typeof jsx === "number" ||
     typeof jsx === "boolean" ||
-    typeof jsx === "function" ||
+    (typeof jsx === "function" && !isThenable(jsx)) ||
     typeof jsx === "undefined" ||
     jsx === null
   ) {
     return jsx;
   } else if (Array.isArray(jsx)) {
     const results = [];
     for (const child of jsx) {
       if (isThenable(child)) {
-        if (
-          isPprBuildActive() &&
-          isInsideOuterSuspenseOutsideSlot() &&
-          !isSlotDiscoveryActive() &&
-          !isNoDynamicActive()
-        ) {
-          try {
-            child.then(null, () => {});
-          } catch (_) {}
-          markDynamicAccess("async-suspense");
+        handlePprThenableAccess(child);
+        if (insideClientProps) {
+          results.push(child);
+          continue;
         }
-        results.push(child);
-      } else {
-        results.push(await asyncRenderJSXToClientJSX(child, child?.key ?? null));
       }
+      results.push(
+        await asyncRenderJSXToClientJSX(
+          child,
+          child?.key ?? null,
+          insideClientProps
+        )
+      );
     }
     return results;
+  } else if (isThenable(jsx)) {
+    handlePprThenableAccess(jsx);
+    if (insideClientProps) {
+      return jsx;
+    }
+    const resolved = await jsx;
+    return await asyncRenderJSXToClientJSX(resolved, key, false);
   } else if (typeof jsx === "symbol") {
     if (jsx === Symbol.for("react.fragment")) {
       // Handle Fragment as an empty props object
       return React.createElement(React.Fragment, key != null ? { key } : null);
     }
     console.error("Unsupported symbol:", String(jsx));
     throw new Error(`Unsupported symbol: ${String(jsx)}`);
   } else if (typeof jsx === "object") {
-    if (isLayoutChildrenPlaceholder(jsx)) {
+    if (
+      isLayoutChildrenPlaceholder(jsx) ||
+      jsx.$$typeof === CLIENT_REFERENCE_TAG ||
+      isClientComponent(jsx)
+    ) {
       return jsx;
     }
     if (jsx.$$typeof === Symbol.for("react.transitional.element")) {
@@ -697,16 +757,28 @@ async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
           return await runInSuspense(async () => {
             return cloneWithDevProps(
               jsx,
-              await asyncRenderJSXToClientJSX(jsx.props),
+              await asyncRenderJSXToClientJSX(jsx.props, null, false),
               key ?? jsx.key
             );
           });
         }
+        const reqCtx = getContext();
+        const rawQuery = unwrapBailoutProxy(reqCtx?.req?.query);
+        const shouldStreamDynamicSuspense =
+          !isPprBuildActive() &&
+          !getPprStore() &&
+          !getActiveRuntimeDynamicHoleStore() &&
+          !reqCtx?.platformContext?.isSSG &&
+          !reqCtx?._isStaticHtmlRender &&
+          !reqCtx?._isPprRuntimeResume &&
+          !isRevalidationActive() &&
+          !isSlotDiscoveryActive() &&
+          (Boolean(reqCtx?._dynamicState?.value) ||
+            Object.keys(rawQuery || {}).length > 0 ||
+            process.env.DINOU_DEV === "true" ||
+            process.env.NODE_ENV !== "production");
         const shouldEagerlyResolveSuspense =
-          Boolean(getPprStore()) ||
-          Boolean(getActiveRuntimeDynamicHoleStore()) ||
-          Boolean(getContext()?.platformContext?.isSSG) ||
-          process.env.NODE_ENV === "production" ||
+          !shouldStreamDynamicSuspense ||
           containsCacheSlot(jsx.props?.children);
         if (shouldEagerlyResolveSuspense) {
           return await runInSuspense(async (holeId) => {
@@ -733,6 +805,7 @@ async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
         ) {
           return jsx;
         }
+        attachSilentRejectionHandler(jsx.props?.children);
         return await runInSuspense(async (holeId) => {
           const renderedFallback = await asyncRenderJSXToClientJSX(jsx.props?.fallback);
           return cloneWithDevProps(
@@ -755,7 +828,7 @@ async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
       ) {
         return cloneWithDevProps(
           jsx,
-          await asyncRenderJSXToClientJSX(jsx.props),
+          await asyncRenderJSXToClientJSX(jsx.props, null, false),
           key ?? jsx.key
         );
       } else if (typeof jsx.type === "function") {
@@ -772,7 +845,7 @@ async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
           }
           return cloneWithDevProps(
             jsx,
-            await asyncRenderJSXToClientJSX(props),
+            await asyncRenderJSXToClientJSX(props, null, true),
             key ?? jsx.key,
             Component
           );
@@ -783,7 +856,11 @@ async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
           const returnedJsx = await invokeServerComponentInPpr(Component, () =>
             Component(props)
           );
-          return await asyncRenderJSXToClientJSX(returnedJsx, key ?? jsx.key);
+          return await asyncRenderJSXToClientJSX(
+            returnedJsx,
+            key ?? jsx.key,
+            false
+          );
         }
       } else if (
         typeof jsx.type === "object" &&
@@ -793,7 +870,7 @@ async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
         if (isClientComponent(jsx.type)) {
           return cloneWithDevProps(
             jsx,
-            await asyncRenderJSXToClientJSX(jsx.props),
+            await asyncRenderJSXToClientJSX(jsx.props, null, true),
             key ?? jsx.key,
             jsx.type
           );
@@ -802,7 +879,11 @@ async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
             jsx.type.render,
             () => jsx.type.render(jsx.props, jsx.ref)
           );
-          return await asyncRenderJSXToClientJSX(returnedJsx, key ?? jsx.key);
+          return await asyncRenderJSXToClientJSX(
+            returnedJsx,
+            key ?? jsx.key,
+            false
+          );
         }
       } else if (
         typeof jsx.type === "object" &&
@@ -812,7 +893,7 @@ async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
         if (isClientComponent(jsx.type)) {
           return cloneWithDevProps(
             jsx,
-            await asyncRenderJSXToClientJSX(jsx.props),
+            await asyncRenderJSXToClientJSX(jsx.props, null, true),
             key ?? jsx.key,
             jsx.type
           );
@@ -822,12 +903,17 @@ async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
             const returnedJsx = await invokeServerComponentInPpr(innerComp, () =>
               innerComp(jsx.props)
             );
-            return await asyncRenderJSXToClientJSX(returnedJsx, key ?? jsx.key);
+            return await asyncRenderJSXToClientJSX(
+              returnedJsx,
+              key ?? jsx.key,
+              false
+            );
           }
           if (typeof innerComp === "object" && innerComp !== null) {
             return await asyncRenderJSXToClientJSX(
               cloneWithDevProps(jsx, jsx.props, key ?? jsx.key, innerComp),
-              key ?? jsx.key
+              key ?? jsx.key,
+              false
             );
           }
           return null;
@@ -836,28 +922,21 @@ async function asyncRenderJSXToClientJSXInner(jsx, key = null) {
         console.error("Unsupported JSX type:", jsx.type);
         throw new Error("Unsupported JSX type");
       }
-    } else if (jsx instanceof Promise) {
-      return jsx;
     } else {
       // Process object props (e.g., { className: "foo" })
       const entries = [];
       for (const [propName, value] of Object.entries(jsx)) {
         if (isThenable(value)) {
-          if (
-            isPprBuildActive() &&
-            isInsideOuterSuspenseOutsideSlot() &&
-            !isSlotDiscoveryActive() &&
-            !isNoDynamicActive()
-          ) {
-            try {
-              value.then(null, () => {});
-            } catch (_) {}
-            markDynamicAccess("async-suspense");
+          handlePprThenableAccess(value);
+          if (insideClientProps) {
+            entries.push([propName, value]);
+            continue;
           }
-          entries.push([propName, value]);
-        } else {
-          entries.push([propName, await asyncRenderJSXToClientJSX(value)]);
         }
+        entries.push([
+          propName,
+          await asyncRenderJSXToClientJSX(value, null, insideClientProps),
+        ]);
       }
       return Object.fromEntries(entries);
     }
```

#### 2.2. `dinou/core/ppr-runtime.js`

```diff
--- a/dinou/core/ppr-runtime.js
+++ b/dinou/core/ppr-runtime.js
@@ -234,32 +234,52 @@ async function spliceDynamicHolesIntoShell(
   let holeIndex = Number(startHoleIndex) || 0;
   const liveHolesMap = new Map();
 
-  async function traverseProps(props) {
+  async function traverseProps(props, inClientProps = false) {
     if (!props || typeof props !== "object") return;
     for (const [, value] of Object.entries(props)) {
-      if (value && typeof value === "object") {
-        await traverse(value);
+      if (liveHolesMap.size >= knownHoleIds.size) return;
+      if (value && (typeof value === "object" || typeof value === "function")) {
+        await traverse(value, inClientProps);
       }
     }
   }
 
-  async function traverse(current) {
+  async function traverse(current, inClientProps = false) {
     if (!current || liveHolesMap.size >= knownHoleIds.size) return;
     if (Array.isArray(current)) {
       for (const item of current) {
         if (liveHolesMap.size >= knownHoleIds.size) return;
-        await traverse(item);
+        await traverse(item, inClientProps);
       }
       return;
     }
-    if (typeof current !== "object" || current instanceof Promise) {
-      return;
-    }
     if (
       isClientComponentRef(current?.type) ||
       current?.$$typeof === Symbol.for("react.client.reference")
     ) {
-      await traverseProps(current?.props);
+      await traverseProps(current?.props, true);
+      return;
+    }
+    if (
+      current instanceof Promise ||
+      ((typeof current === "object" || typeof current === "function") &&
+        typeof current?.then === "function")
+    ) {
+      if (inClientProps) {
+        return;
+      }
+      try {
+        const resolved = await current;
+        await traverse(resolved, false);
+      } catch (err) {
+        if (err && err.$$typeof === SKIP_STATIC_SUSPENSE_SYMBOL) {
+          return;
+        }
+        console.error("[Dinou PPR] Error awaiting JSX promise in hole splice:", err);
+      }
+      return;
+    }
+    if (typeof current !== "object") {
       return;
     }
     if (typeof current?.type === "function") {
@@ -267,7 +287,7 @@ async function spliceDynamicHolesIntoShell(
         const evaluated = await invokeWithServerHooksDispatcher(() =>
           current.type(current.props || {})
         );
-        await traverse(evaluated);
+        await traverse(evaluated, false);
       } catch (err) {
         if (err && err.$$typeof === SKIP_STATIC_SUSPENSE_SYMBOL) {
           return;
@@ -282,14 +302,14 @@ async function spliceDynamicHolesIntoShell(
       current.type.$$typeof === Symbol.for("react.forward_ref")
     ) {
       if (isClientComponentRef(current.type)) {
-        await traverseProps(current.props);
+        await traverseProps(current.props, true);
         return;
       }
       try {
         const rendered = await invokeWithServerHooksDispatcher(() =>
           current.type.render(current.props || {}, current.ref)
         );
-        await traverse(rendered);
+        await traverse(rendered, false);
       } catch (err) {
         if (err && err.$$typeof === SKIP_STATIC_SUSPENSE_SYMBOL) {
           return;
@@ -304,7 +324,7 @@ async function spliceDynamicHolesIntoShell(
       current.type.$$typeof === Symbol.for("react.memo")
     ) {
       if (isClientComponentRef(current.type)) {
-        await traverseProps(current.props);
+        await traverseProps(current.props, true);
         return;
       }
       try {
@@ -324,7 +344,7 @@ async function spliceDynamicHolesIntoShell(
             innerComp.render(current.props || {}, current.ref)
           );
         }
-        await traverse(rendered);
+        await traverse(rendered, false);
       } catch (err) {
         if (err && err.$$typeof === SKIP_STATIC_SUSPENSE_SYMBOL) {
           return;
@@ -359,18 +379,18 @@ async function spliceDynamicHolesIntoShell(
         : runInRuntimeStaticSuspense;
       await runStaticScope(async () => {
         if (current.props?.children) {
-          await traverse(current.props.children);
+          await traverse(current.props.children, false);
         }
         if (current.props?.fallback) {
-          await traverse(current.props.fallback);
+          await traverse(current.props.fallback, false);
         }
       });
       return;
     }
     if (current?.$$typeof === Symbol.for("react.transitional.element")) {
-      await traverseProps(current.props);
+      await traverseProps(current.props, false);
     } else {
-      await traverseProps(current);
+      await traverseProps(current, inClientProps);
     }
   }
 
@@ -413,38 +433,58 @@ async function streamDynamicHoles(
 
   const clientManifest = getClientManifest();
 
-  async function traverseProps(props) {
+  async function traverseProps(props, inClientProps = false) {
     if (!props || typeof props !== "object") return;
     for (const [, value] of Object.entries(props)) {
       if (hasExplicitHoles && holePromises.length >= knownHoleIds.size) return;
-      if (value && typeof value === "object") {
-        await traverse(value);
+      if (value && (typeof value === "object" || typeof value === "function")) {
+        await traverse(value, inClientProps);
       }
     }
   }
 
-  async function traverse(current) {
+  async function traverse(current, inClientProps = false) {
     if (!current || (hasExplicitHoles && holePromises.length >= knownHoleIds.size)) return;
 
     // Handle Arrays (children)
     if (Array.isArray(current)) {
       for (const item of current) {
         if (hasExplicitHoles && holePromises.length >= knownHoleIds.size) return;
-        await traverse(item);
+        await traverse(item, inClientProps);
       }
       return;
     }
 
-    if (typeof current !== "object" || current instanceof Promise) {
-      return;
-    }
-
     // Handle Client Component: do NOT execute, only traverse props in deterministic order
     if (
       isClientComponentRef(current?.type) ||
       current?.$$typeof === Symbol.for("react.client.reference")
     ) {
-      await traverseProps(current?.props);
+      await traverseProps(current?.props, true);
+      return;
+    }
+
+    if (
+      current instanceof Promise ||
+      ((typeof current === "object" || typeof current === "function") &&
+        typeof current?.then === "function")
+    ) {
+      if (inClientProps) {
+        return;
+      }
+      try {
+        const resolved = await current;
+        await traverse(resolved, false);
+      } catch (err) {
+        if (err && err.$$typeof === SKIP_STATIC_SUSPENSE_SYMBOL) {
+          return;
+        }
+        console.error("[Dinou PPR] Error awaiting JSX promise in hole traversal:", err);
+      }
+      return;
+    }
+
+    if (typeof current !== "object") {
       return;
     }
 
@@ -454,7 +494,7 @@ async function streamDynamicHoles(
         const evaluated = await invokeWithServerHooksDispatcher(() =>
           current.type(current.props || {})
         );
-        await traverse(evaluated);
+        await traverse(evaluated, false);
       } catch (err) {
         if (err && err.$$typeof === SKIP_STATIC_SUSPENSE_SYMBOL) {
           return;
@@ -471,14 +511,14 @@ async function streamDynamicHoles(
       current.type.$$typeof === Symbol.for("react.forward_ref")
     ) {
       if (isClientComponentRef(current.type)) {
-        await traverseProps(current.props);
+        await traverseProps(current.props, true);
         return;
       }
       try {
         const rendered = await invokeWithServerHooksDispatcher(() =>
           current.type.render(current.props || {}, current.ref)
         );
-        await traverse(rendered);
+        await traverse(rendered, false);
       } catch (err) {
         if (err && err.$$typeof === SKIP_STATIC_SUSPENSE_SYMBOL) {
           return;
@@ -495,7 +535,7 @@ async function streamDynamicHoles(
       current.type.$$typeof === Symbol.for("react.memo")
     ) {
       if (isClientComponentRef(current.type)) {
-        await traverseProps(current.props);
+        await traverseProps(current.props, true);
         return;
       }
       try {
@@ -515,7 +555,7 @@ async function streamDynamicHoles(
             innerComp.render(current.props || {}, current.ref)
           );
         }
-        await traverse(rendered);
+        await traverse(rendered, false);
       } catch (err) {
         if (err && err.$$typeof === SKIP_STATIC_SUSPENSE_SYMBOL) {
           return;
@@ -594,10 +634,10 @@ async function streamDynamicHoles(
           : runInRuntimeStaticSuspense;
       await runStaticScope(async () => {
         if (current.props?.children) {
-          await traverse(current.props.children);
+          await traverse(current.props.children, false);
         }
         if (current.props?.fallback) {
-          await traverse(current.props.fallback);
+          await traverse(current.props.fallback, false);
         }
       });
       return;
@@ -605,9 +645,9 @@ async function streamDynamicHoles(
 
     // Traverse host element / Fragment props or plain props object
     if (current?.$$typeof === Symbol.for("react.transitional.element")) {
-      await traverseProps(current.props);
+      await traverseProps(current.props, false);
     } else {
-      await traverseProps(current);
+      await traverseProps(current, inClientProps);
     }
   }
```

#### 2.3. `dinou/core/handler.js`

```diff
--- a/dinou/core/handler.js
+++ b/dinou/core/handler.js
@@ -1360,6 +1360,7 @@ function createServerFunctionContext(simReq, resBridge, platformContext = {}) {
     env: platformContext.env || {},
     ctx: platformContext.ctx || null,
     platformContext,
+    _dynamicState: { value: true },
   };
   setCurrentContext(context);
   return context;
```

---

## 3. Proposed `CHANGELOG.md` Entry (for `dinou@9.4.0`)

```markdown
### Fixed
- **Progressive `<Suspense>` Streaming in Production on Dynamic SSR Routes**: Removed the unconditional `process.env.NODE_ENV === "production"` eager-resolution guard in `asyncRenderJSXToClientJSX` (`dinou/core/render-jsx-to-client-jsx.js`) and replaced it with context-aware dynamic streaming detection (`shouldStreamDynamicSuspense`). Dynamic SSR routes (`revalidate = 0`, prior dynamic bailout via `cookies`/`headers`/`query`, URLs carrying `?query` parameters inspected via `unwrapBailoutProxy` without tripping `BailoutProxy`, and `POST /____server_function____` contexts) now flush the initial HTML/RSC shell and `<Suspense fallback>` immediately in production via `DinouSuspenseHoleBoundary`, while SSG builds, ISR/tag background revalidations, PPR shell builds, and clean ISG candidate routes continue settling `<Suspense>` boundaries eagerly into static HTML without skeleton flashes.
- **Direct `Promise<ReactNode>` JSX Children Across PPR, SSG, Streaming SSR & `<DinouCacheSlot>`**: Fixed `asyncRenderJSXToClientJSX` (`dinou/core/render-jsx-to-client-jsx.js`) and PPR hole traversers (`spliceDynamicHolesIntoShell` and `streamDynamicHoles` in `dinou/core/ppr-runtime.js`) so direct `Promise<ReactNode>` expressions in Server JSX (such as `<Suspense fallback={<Skeleton />}>{getMetricsTable()}</Suspense>` and `<DinouCacheSlot id="metrics">{getMetricsTable()}</DinouCacheSlot>`) properly register `ppr-hole-*` boundaries during PPR builds, await and recursively transform resolved Server Component subtrees (including slot/hole-scoped `useId()`), and serialize resolved DOM trees into `slot.json` instead of `{}`—while preserving raw un-awaited `Promise` props passed to `"use client"` components for non-blocking React 19 `use(promise)` Flight streaming.
```

---

## 4. Verification Test Suite (Unit + Playwright Production E2E)

### 4.1. Unit Test Suite (`tests/unit/streaming-suspense-promises.test.mjs`)

Run directly with Node's built-in test runner (`node --test tests/unit/streaming-suspense-promises.test.mjs`) or Vitest:

```js
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { asyncRenderJSXToClientJSX } from "../../dinou/core/render-jsx-to-client-jsx.js";
import { requestStorage } from "../../dinou/core/request-context.js";
import { createBailoutProxy } from "../../dinou/core/bailout-proxy.js";
import {
  runWithPprContext,
  resetPprHoles,
  getRegisteredHoles,
} from "../../dinou/core/ppr-context.js";
import {
  DinouCacheSlot,
  serializeJSX,
  deserializeJSX,
} from "../../dinou/core/cache-slot.js";
import {
  MemoryStorage,
  setStorageAdapter,
} from "../../dinou/core/storage-adapter.js";
import {
  spliceDynamicHolesIntoShell,
  streamDynamicHoles,
} from "../../dinou/core/ppr-runtime.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createMockRequestContext({
  dynamic = false,
  query = {},
  cookies = {},
  isSSG = false,
} = {}) {
  const dynamicState = { value: dynamic };
  const markDynamic = () => {
    dynamicState.value = true;
  };
  return {
    req: {
      query: createBailoutProxy(query, "Query", markDynamic),
      cookies: createBailoutProxy(cookies, "Cookies", markDynamic),
      headers: createBailoutProxy({}, "Headers", markDynamic),
      path: "/dashboard/",
      method: "GET",
    },
    res: {},
    platformContext: { isSSG },
    _markDynamic: markDynamic,
    _dynamicState: dynamicState,
  };
}

test("Production Dynamic SSR streams <Suspense> via DinouSuspenseHoleBoundary without blocking TTFB", async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevDev = process.env.DINOU_DEV;
  process.env.NODE_ENV = "production";
  delete process.env.DINOU_DEV;

  try {
    let settled = false;
    async function SlowHeavyMetrics() {
      await sleep(250);
      settled = true;
      return React.createElement("div", { id: "metrics" }, "Revenue: $42k");
    }

    const pageJsx = React.createElement(
      "main",
      null,
      React.createElement("h1", null, "Executive Overview"),
      React.createElement(
        React.Suspense,
        { fallback: React.createElement("div", { id: "skeleton" }, "Loading...") },
        React.createElement(SlowHeavyMetrics)
      )
    );

    const ctx = createMockRequestContext({ dynamic: true });
    const start = Date.now();
    const rendered = await requestStorage.run(ctx, () =>
      asyncRenderJSXToClientJSX(pageJsx)
    );
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 80, `Expected non-blocking shell (<80ms), got ${elapsed}ms`);
    assert.equal(settled, false);

    const suspenseNode = rendered.props.children[1];
    assert.equal(suspenseNode.type, Symbol.for("react.suspense"));
    assert.equal(
      suspenseNode.props.children.type.$$dinouDeferredSuspenseStream,
      true
    );

    const resolvedHole = await requestStorage.run(ctx, () =>
      suspenseNode.props.children.type(suspenseNode.props.children.props)
    );
    assert.equal(settled, true);
    assert.equal(resolvedHole.props.id, "metrics");
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevDev !== undefined) process.env.DINOU_DEV = prevDev;
  }
});

test("Production query URLs (?q=...) stream <Suspense> without tripping BailoutProxy on clean routes", async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  delete process.env.DINOU_DEV;

  try {
    async function SlowResults() {
      await sleep(200);
      return React.createElement("div", null, "Found 10 items");
    }

    const tree = React.createElement(
      React.Suspense,
      { fallback: React.createElement("span", null, "Searching...") },
      React.createElement(SlowResults)
    );

    // 1. With query params: streams immediately without mutating _dynamicState via BailoutProxy
    const queryCtx = createMockRequestContext({ dynamic: false, query: { q: "dinou" } });
    const t0 = Date.now();
    const streamed = await requestStorage.run(queryCtx, () =>
      asyncRenderJSXToClientJSX(tree)
    );
    assert.ok(Date.now() - t0 < 80);
    assert.equal(queryCtx._dynamicState.value, false);
    assert.equal(streamed.props.children.type.$$dinouDeferredSuspenseStream, true);

    // 2. Clean ISG candidate (no query, _dynamicState=false): settles eagerly into final static HTML
    const cleanCtx = createMockRequestContext({ dynamic: false, query: {} });
    const t1 = Date.now();
    const settled = await requestStorage.run(cleanCtx, () =>
      asyncRenderJSXToClientJSX(tree)
    );
    assert.ok(Date.now() - t1 >= 160);
    assert.equal(cleanCtx._dynamicState.value, false);
    assert.equal(settled.props.children.type, "div");
    assert.equal(settled.props.children.props.children, "Found 10 items");
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test("Direct Promise<ReactNode> JSX children work across PPR Build, PPR Splice, SSG, and <DinouCacheSlot>", async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  delete process.env.DINOU_DEV;

  try {
    function ServerIdBadge({ text }) {
      const id = React.useId();
      return React.createElement("span", { "data-uid": id }, text);
    }

    async function getMetricsTable(delay = 80) {
      await sleep(delay);
      return React.createElement(
        "section",
        { id: "promise-metrics" },
        React.createElement(ServerIdBadge, { text: "Live" })
      );
    }

    // 1. PPR Build registers ppr-hole-1 and serializes cleanly without "{}"
    const pprBuildCtx = createMockRequestContext({ isSSG: true });
    let shellTree;
    let registeredHoles = [];
    await requestStorage.run(pprBuildCtx, async () => {
      await runWithPprContext({ isPpr: true }, async () => {
        resetPprHoles(0);
        const page = React.createElement(
          "main",
          null,
          React.createElement("h1", null, "Title"),
          React.createElement(
            React.Suspense,
            { fallback: React.createElement("div", { className: "skel" }, "Loading...") },
            getMetricsTable(100)
          )
        );
        shellTree = await asyncRenderJSXToClientJSX(page);
        registeredHoles = getRegisteredHoles();
      });
    });

    assert.deepEqual(registeredHoles, ["ppr-hole-1"]);
    const shellJson = serializeJSX(shellTree);
    assert.ok(shellJson.includes("ppr-hole-1"));
    assert.ok(!shellJson.includes("{}"));

    // 2. PPR Runtime spliceDynamicHolesIntoShell resolves direct Promise child + scoped useId
    const runtimeCtx = createMockRequestContext({ dynamic: true });
    const spliced = await requestStorage.run(runtimeCtx, () =>
      spliceDynamicHolesIntoShell(
        deserializeJSX(shellJson),
        () =>
          React.createElement(
            "main",
            null,
            Promise.resolve(React.createElement("h1", null, "Title")),
            React.createElement(
              React.Suspense,
              { fallback: React.createElement("div", { className: "skel" }, "Loading...") },
              getMetricsTable(40)
            )
          ),
        0
      )
    );
    const holeBoundary = spliced.props.children[1].props.children;
    const resolvedHole = await requestStorage.run(runtimeCtx, () =>
      holeBoundary.type(holeBoundary.props)
    );
    assert.equal(resolvedHole.props.id, "promise-metrics");
    assert.match(resolvedHole.props.children.props["data-uid"], /^_hole_ppr-hole-1_dS_/);

    // 3. <DinouCacheSlot>{getMetricsTable()}</DinouCacheSlot> persists resolved DOM tree
    const storage = new MemoryStorage({ hydrateFromDisk: false });
    setStorageAdapter(storage);
    const slotCtx = createMockRequestContext({ isSSG: true });
    await requestStorage.run(slotCtx, () =>
      asyncRenderJSXToClientJSX(
        React.createElement(
          DinouCacheSlot,
          { id: "direct-promise-slot", revalidate: 60 },
          getMetricsTable(30)
        )
      )
    );
    const cachedSlot = await storage.get("slots/direct-promise-slot/slot.json");
    assert.ok(cachedSlot?.content);
    assert.notEqual(cachedSlot.content, "{}");
    assert.ok(cachedSlot.content.includes("promise-metrics"));
    assert.ok(cachedSlot.content.includes("_slot_direct-promise-slot_dS_"));
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test("Client Component Flight Promise props remain un-awaited while registering PPR holes in <Suspense>", async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    function ClientResults() {}
    Object.defineProperties(ClientResults, {
      $$typeof: { value: Symbol.for("react.client.reference") },
      $$id: { value: "file:///src/search/client-results.tsx#ClientResults" },
    });

    let settled = false;
    const flightPromise = sleep(400).then(() => {
      settled = true;
      return [{ id: "p1", title: "Pro Plan" }];
    });

    const dynCtx = createMockRequestContext({ dynamic: true });
    const t0 = Date.now();
    const rendered = await requestStorage.run(dynCtx, () =>
      asyncRenderJSXToClientJSX(
        React.createElement(
          ClientResults,
          {
            promise: flightPromise,
            nested: { itemsPromise: [flightPromise] },
          },
          React.createElement("div", null, Promise.resolve("Server Child Resolved"))
        )
      )
    );
    const elapsed = Date.now() - t0;

    assert.ok(elapsed < 50, `Expected 0ms non-blocking client prop traversal, got ${elapsed}ms`);
    assert.equal(settled, false);
    assert.equal(rendered.props.promise, flightPromise);
    assert.equal(rendered.props.nested.itemsPromise[0], flightPromise);
    assert.equal(rendered.props.children.props.children, "Server Child Resolved");

    // streamDynamicHoles skips awaiting Client Component prop promises
    const writtenChunks = [];
    const writer = {
      write: async (bytes) => writtenChunks.push(new TextDecoder().decode(bytes)),
    };
    const tStream = Date.now();
    await requestStorage.run(dynCtx, () =>
      streamDynamicHoles(
        React.createElement(
          "div",
          null,
          React.createElement(ClientResults, { promise: flightPromise }),
          React.createElement(
            React.Suspense,
            { fallback: React.createElement("span", null, "Loading") },
            Promise.resolve(React.createElement("p", null, "Streamed Hole"))
          )
        ),
        ["ppr-hole-1"],
        writer,
        new TextEncoder(),
        null,
        false
      )
    );
    assert.ok(Date.now() - tStream < 80);
    assert.equal(writtenChunks.length, 1);
    assert.ok(writtenChunks[0].includes("ppr-content-ppr-hole-1"));

    // PPR Build inside <Suspense> registers ppr-hole-1 on Client Component Flight Promise prop
    const pprCtx = createMockRequestContext({ isSSG: true });
    let holes = [];
    await requestStorage.run(pprCtx, async () => {
      await runWithPprContext({ isPpr: true }, async () => {
        resetPprHoles(0);
        await asyncRenderJSXToClientJSX(
          React.createElement(
            React.Suspense,
            { fallback: React.createElement("div", null, "Searching...") },
            React.createElement(ClientResults, { promise: flightPromise })
          )
        );
        holes = getRegisteredHoles();
      });
    });
    assert.deepEqual(holes, ["ppr-hole-1"]);
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});
```

---

### 4.2. Playwright Production E2E Test (`tests/e2e/streaming-suspense-production.spec.ts`)

Add the fixture routes below to your E2E test app, build for production (`npm run build`), start the production server (`npm start`), and run Playwright:

#### Fixture Routes
1. **`src/e2e-streaming-ssr/page_functions.ts`**:
   ```ts
   export const revalidate = 0;
   ```
2. **`src/e2e-streaming-ssr/page.tsx`**:
   ```tsx
   import { Suspense } from "react";

   async function getDelayedMetrics() {
     await new Promise((r) => setTimeout(r, 600));
     return <div data-testid="streamed-metrics">Live Revenue: $128,400</div>;
   }

   export default function StreamingSsrPage() {
     return (
       <main>
         <h1 data-testid="instant-header">Executive Dashboard</h1>
         <Suspense fallback={<div data-testid="metrics-skeleton">Loading metrics...</div>}>
           {getDelayedMetrics()}
         </Suspense>
       </main>
     );
   }
   ```
3. **`src/e2e-ppr-promise/page_functions.ts`**:
   ```ts
   export const ppr = true;
   ```
4. **`src/e2e-ppr-promise/page.tsx`**:
   ```tsx
   import { Suspense } from "react";

   async function fetchLiveOrderStatus() {
     await new Promise((r) => setTimeout(r, 450));
     return <p data-testid="ppr-promise-resolved">Order #9042: Shipped</p>;
   }

   export default function PprDirectPromisePage() {
     return (
       <main>
         <h1 data-testid="ppr-shell-heading">Order Tracker</h1>
         <Suspense fallback={<p data-testid="ppr-promise-fallback">Fetching live status...</p>}>
           {fetchLiveOrderStatus()}
         </Suspense>
       </main>
     );
   }
   ```

#### Playwright Spec (`tests/e2e/streaming-suspense-production.spec.ts`)

```ts
import { test, expect } from "@playwright/test";

test.describe("Production Progressive <Suspense> Streaming & Direct Promise<ReactNode> Children", () => {
  test("Dynamic SSR (revalidate = 0) flushes Chunk 1 shell & fallback before slow Suspense child resolves", async ({
    request,
    page,
  }) => {
    // 1. Verify raw HTTP chunked TTFB vs total stream completion in production
    const t0 = Date.now();
    const res = await fetch(`${process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000"}/e2e-streaming-ssr`);
    expect(res.status).toBe(200);
    expect(res.body).not.toBeNull();

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let firstChunkHtml = "";
    let firstChunkTime = 0;
    let fullHtml = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkText = decoder.decode(value, { stream: true });
      fullHtml += chunkText;
      if (!firstChunkTime && fullHtml.includes("Executive Dashboard")) {
        firstChunkTime = Date.now() - t0;
        firstChunkHtml = fullHtml;
      }
    }
    const totalTime = Date.now() - t0;

    // Chunk 1 (header + skeleton) arrives well before the 600ms delay finishes
    expect(firstChunkTime).toBeLessThan(350);
    expect(firstChunkHtml).toContain("Executive Dashboard");
    expect(firstChunkHtml).toContain("Loading metrics...");
    expect(firstChunkHtml).not.toContain("Live Revenue: $128,400");

    // Chunk 2 streams the resolved Suspense payload when ready
    expect(totalTime).toBeGreaterThanOrEqual(550);
    expect(fullHtml).toContain("Live Revenue: $128,400");

    // 2. Verify browser DOM swap and clean hydration without errors
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/e2e-streaming-ssr", { waitUntil: "commit" });
    await expect(page.getByTestId("instant-header")).toBeVisible();
    await expect(page.getByTestId("streamed-metrics")).toHaveText(
      "Live Revenue: $128,400",
      { timeout: 3000 }
    );
    await expect(page.getByTestId("metrics-skeleton")).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test("PPR (ppr = true) registers dynamic hole and streams direct Promise<ReactNode> child", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/e2e-ppr-promise", { waitUntil: "commit" });
    await expect(page.getByTestId("ppr-shell-heading")).toHaveText("Order Tracker");
    await expect(page.getByTestId("ppr-promise-resolved")).toHaveText(
      "Order #9042: Shipped",
      { timeout: 3000 }
    );
    await expect(page.getByTestId("ppr-promise-fallback")).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});
```

