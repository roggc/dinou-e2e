# Supporting `useId` (and Stateless Server Hooks) in Synchronous Server Components Pre-Evaluated by Dinou

This document details the technical analysis of how React 19 implements `useId` (alongside `useMemo`, `useCallback`, `useDebugValue`, and the React Compiler's `useMemoCache`) in synchronous React Server Components (RSC), why those hooks currently fail when a Server Component is pre-evaluated by Dinou's `asyncRenderJSXToClientJSX`, and the exact implementation required to support them in future versions of Dinou.

---

## 1. Executive Summary

In React 19, **stateful and lifecycle hooks** (`useState`, `useReducer`, `useEffect`, `useContext`, `useRef`, etc.) are strictly forbidden in Server Components, and **all hooks** are forbidden inside `async` Server Components (after an `await`).

However, according to the **React 19 RSC specification** (`react/react-server` and `react-server-dom-webpack`), a specific set of **stateless synchronous hooks** **is** officially supported inside **synchronous Server Components**:

1. `useId()`
2. `useMemo(fn, deps)`
3. `useCallback(fn, deps)`
4. `useDebugValue(value)`
5. `useMemoCache(size)` (injected automatically by `babel-plugin-react-compiler` / React 19 Compiler)
6. `use(usable)`

### Current Behavior in Dinou
In Dinou (`v9.1.0`), whether `useId()` works inside a synchronous Server Component currently depends on **which internal rendering path** executes that component:

- **Path A — Direct execution by `react-server-dom-webpack` (`renderToReadableStream`)**:
  - Happens on standard dynamic SSR/ISR `page.tsx` renders when neither `<DinouCacheSlot>` nor a PPR static shell build (`isPpr: true`) is pre-evaluating the component.
  - **Result**: `useId()` **works**, because `react-server-dom-webpack` sets `ReactSharedInternalsServer.H = HooksDispatcher` before invoking `Component(props)`.
- **Path B — Pre-evaluation by Dinou's `asyncRenderJSXToClientJSX` (`dinou/core/render-jsx-to-client-jsx.js`)**:
  - Happens in three core places in Dinou:
    1. Inside **`<DinouCacheSlot>`** (`dinou/core/cache-slot.js`) when resolving slot children before serializing them to JSON.
    2. During **`layout.tsx` error-isolation probing** in `getJSX` (`dinou/core/get-jsx.js`, line 305: `await runInLayoutSegment(() => asyncRenderJSXToClientJSX(testElement))`).
    3. During **PPR Static Shell generation** (`dinou/core/handler.js` and `dinou/core/cache-revalidate.js`) when `asyncRenderJSXToClientJSX` traverses the tree to detect dynamic `<Suspense>` holes and `noDynamic()` opt-outs.
  - **Result**: Calling `useId()`, `useMemo()`, `useCallback()`, or rendering a synchronous Server Component compiled with `babel-plugin-react-compiler` (`_c` / `useMemoCache`) inside Path B throws:
    ```text
    TypeError: Cannot read properties of null (reading 'useId')
    ```
    because `asyncRenderJSXToClientJSX` invokes `Component(props)` directly while React's internal hook dispatcher (`ReactSharedInternals.H`) is `null`.

---

## 2. How React 19 Implements Server Component Hooks Under the Hood

### 2.1. The `react/react-server` Entrypoint
In `react/cjs/react.react-server.production.js` (React 19.3.1), React exports only the stateless Server Component hooks, all of which delegate to `ReactSharedInternals.H`:

```js
// From react/cjs/react.react-server.production.js (lines 12 & 423-435):
var ReactSharedInternals = { H: null, A: null };

exports.use = function (usable) {
  return ReactSharedInternals.H.use(usable);
};
exports.useCallback = function (callback, deps) {
  return ReactSharedInternals.H.useCallback(callback, deps);
};
exports.useDebugValue = function () {};
exports.useId = function () {
  return ReactSharedInternals.H.useId();
};
exports.useMemo = function (create, deps) {
  return ReactSharedInternals.H.useMemo(create, deps);
};
```

And in `react/cjs/react-compiler-runtime.production.js` (used when `babel-plugin-react-compiler` is active):
```js
exports.c = function (size) {
  return ReactSharedInternals.H.useMemoCache(size);
};
```

### 2.2. `HooksDispatcher` in `react-server-dom-webpack`
When `react-server-dom-webpack` executes `performWork(request)` (lines 655–705 & 2237–2254 of `react-server-dom-webpack-server.node.production.js`), it installs `HooksDispatcher` onto `ReactSharedInternalsServer.H`:

```js
// From react-server-dom-webpack-server.node.production.js:
var HooksDispatcher = {
  readContext: unsupportedContext,
  use: use,
  useCallback: function (callback) {
    return callback;
  },
  useContext: unsupportedContext,
  useEffect: unsupportedHook,
  useImperativeHandle: unsupportedHook,
  useLayoutEffect: unsupportedHook,
  useInsertionEffect: unsupportedHook,
  useMemo: function (nextCreate) {
    return nextCreate();
  },
  useReducer: unsupportedHook,
  useRef: unsupportedHook,
  useState: unsupportedHook,
  useDebugValue: function () {},
  useDeferredValue: unsupportedHook,
  useTransition: unsupportedHook,
  useSyncExternalStore: unsupportedHook,
  useId: useId,
  useHostTransitionStatus: unsupportedHook,
  useFormState: unsupportedHook,
  useActionState: unsupportedHook,
  useOptimistic: unsupportedHook,
  useMemoCache: function (size) {
    for (var data = Array(size), i = 0; i < size; i++)
      data[i] = REACT_MEMO_CACHE_SENTINEL;
    return data;
  },
  useCacheRefresh: function () {
    return unsupportedRefresh;
  },
  useEffectEvent: unsupportedHook,
};

function useId() {
  if (null === currentRequest$1)
    throw Error("useId can only be used while React is rendering");
  var id = currentRequest$1.identifierCount++;
  return "_" + currentRequest$1.identifierPrefix + "S_" + id.toString(32) + "_";
}
```

Key observations from React 19's official implementation:
1. **No Fiber tree is needed for `useId` in Server Components**: Unlike Client Components (which use tree-indexed Fiber paths like `«R1a»` so SSR and browser hydration produce identical IDs when executing the same Client Component twice), **Server Components never execute in the browser**.
2. Instead, `react-server-dom-webpack` simply increments a monotonic per-request counter (`currentRequest.identifierCount++`) and formats the ID as:
   ```js
   "_" + identifierPrefix + "S_" + id.toString(32) + "_"
   ```
3. Once the Server Component returns its JSX (e.g., `<label htmlFor="_S_1_">` and `<input id="_S_1_" />`, or `<MyClientInput id="_S_1_" />`), that string is baked as a **static literal prop** into the resolved React element tree. Both the SSR HTML stream and the Flight `.rsc` payload receive the exact same resolved string literal, so hydration mismatches are impossible.

---

## 3. Why Dinou Must Keep `asyncRenderJSXToClientJSX` and `serializeJSX` / `deserializeJSX`

Before designing the fix, it is important to document why Dinou should **not** remove `asyncRenderJSXToClientJSX` or replace `serializeJSX` / `deserializeJSX` with `renderToReadableStream` / `createFromReadableStream`:

1. **`react-server-dom-webpack` is a one-way stream serializer**:
   - `renderToReadableStream` converts a React tree into a binary/text Flight stream (`0:["$","div",...]`).
   - `createFromReadableStream` (`react-server-dom-webpack/client`) is designed for the browser/SSR consumer: when it reads a `"use client"` reference (`I[chunkId, chunks, exportName]`), it resolves it into an actual client module function or a `Symbol.for("react.lazy")` wrapper—**stripping `$$typeof: Symbol.for("react.client.reference")`**.
   - If `<DinouCacheSlot>` deserialized its cache via `createFromReadableStream` and returned that tree to the parent page's `renderToReadableStream`, the RSC server would no longer recognize the Client Component as a client reference and would attempt to execute it as a Server Component on the server (or fail to serialize the internal `react.lazy` chunk).
2. **In-memory tree manipulation is required for Dinou's 3D Segmentation**:
   - **Nested `<DinouCacheSlot>` isolation (`refreshNestedSlotsInTree`)**: Dinou walks the deserialized JSX tree of an outer cached slot on the server to replace only invalidated descendant `<DinouCacheSlotBoundary __dinou_slot__={nestedId}>` nodes without re-executing the outer slot.
   - **Deterministic PPR (`noDynamic()` & `<Suspense>` hole replacement)**: `asyncRenderJSXToClientJSX` intercepts promises returned inside `<Suspense>` boundaries (`invokeServerComponentInPpr`), respects `noDynamic()`, and replaces postponed `<Suspense>` boundaries with `<div data-ppr-hole={holeId}>{fallback}</div>`.
   - **Lazy Shell Re-Composition**: `shell.layout.json`, `shell.page.json`, and `slot.json` are combined in memory in ~0.05ms via `serializeJSX` / `deserializeJSX` without re-executing `page.tsx` or `layout.tsx`.

Therefore, the right architectural solution is to keep `asyncRenderJSXToClientJSX` and equip it with a **React 19-compliant Server Hooks Dispatcher** during synchronous Server Component invocation.

---

## 4. Proposed Implementation for Dinou

### 4.1. Requirements & Design Goals
1. **Support both `react-server` and default React module conditions**:
   - Depending on the runtime (Node, Bun, Deno, Cloudflare Workers) and bundler (Webpack, Rollup, Esbuild), `React` may expose either `React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` or `React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` (or both if two React entrypoints are loaded). We should set `.H` on whichever internal object(s) are present whenever `.H` is currently `null`.
2. **Collision-free `useId()` prefix (`_dS_`)**:
   - `react-server-dom-webpack` generates IDs of the form `"_" + prefix + "S_" + count.toString(32) + "_"`.
   - Because a page may have some Server Components pre-evaluated by `asyncRenderJSXToClientJSX` (e.g., inside `layout.tsx` or `<DinouCacheSlot>`) and other Server Components evaluated later by `renderToReadableStream` (`react-server-dom-webpack`), Dinou's pre-evaluator should use a distinct namespace prefix such as `_dS_` (and include the slot ID when rendering inside a `<DinouCacheSlot>`, e.g. `_dS_${sanitizedSlotId}_${count}_`, so cached slots and nested slots never collide with page-level IDs or with each other!).
   - Furthermore, the generated ID only uses `[a-zA-Z0-9_-]` characters (`_dS_..._`), which are 100% valid CSS selectors and HTML `id` attributes.
3. **Strict synchronous lifecycle (matching React 19's `async` component rule)**:
   - `ReactSharedInternals.H` must be set **immediately before** calling `Component(props)` and restored to its previous value **immediately after** the synchronous call frame of `Component(props)` returns (before `await rawResult`).
   - That way:
     - In a synchronous Server Component, `useId()`, `useMemo()`, `useCallback()`, and `useMemoCache()` work throughout the entire component body.
     - In an `async` Server Component, any hook called synchronously *before* the first `await` works, while any hook called *after* an `await` fails with React's standard error, matching `react-server-dom-webpack`'s exact behavior.

### 4.2. Code Changes in `dinou/core/render-jsx-to-client-jsx.js`

In `dinou/core/render-jsx-to-client-jsx.js`, add the Server Hooks Dispatcher and wrap the synchronous `callFn()` execution inside `invokeServerComponentInPpr`:

```js
// dinou/core/render-jsx-to-client-jsx.js
import React from "react";
import { AsyncLocalStorage } from "node:async_hooks";
// ... existing imports ...

const REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel");
const REACT_CONTEXT_TYPE = Symbol.for("react.context");
const CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference");

const serverRenderIdStorage = new AsyncLocalStorage();
let fallbackRenderSeq = 0;

function unsupportedHook() {
  throw new Error("This Hook is not supported in Server Components.");
}

function unsupportedRefresh() {
  throw new Error("Refreshing the cache is not supported in Server Components.");
}

function unsupportedContext() {
  throw new Error("Cannot read a Client Context from a Server Component.");
}

function useServerId() {
  const store = serverRenderIdStorage.getStore();
  if (store) {
    const id = ++store.count;
    return `_${store.prefix}dS_${id.toString(32)}_`;
  }
  const reqCtx = getContext();
  if (reqCtx) {
    reqCtx._dinouUseIdCount = (reqCtx._dinouUseIdCount || 0) + 1;
    return `_dS_${reqCtx._dinouUseIdCount.toString(32)}_`;
  }
  const id = ++fallbackRenderSeq;
  return `_dS_${id.toString(32)}_`;
}

function useServerUsable(usable) {
  if (
    (usable !== null && typeof usable === "object") ||
    typeof usable === "function"
  ) {
    if (typeof usable.then === "function") {
      if (usable.status === "fulfilled") {
        return usable.value;
      }
      if (usable.status === "rejected") {
        throw usable.reason;
      }
      throw usable;
    }
    if (usable.$$typeof === REACT_CONTEXT_TYPE) {
      unsupportedContext();
    }
    if (usable.$$typeof === CLIENT_REFERENCE_TAG) {
      if (usable.value != null && usable.value.$$typeof === REACT_CONTEXT_TYPE) {
        unsupportedContext();
      }
      throw new Error("Cannot use() an already resolved Client Reference.");
    }
  }
  throw new Error("An unsupported type was passed to use(): " + String(usable));
}

const DinouServerHooksDispatcher = {
  readContext: unsupportedContext,
  use: useServerUsable,
  useCallback(callback) {
    return callback;
  },
  useContext: unsupportedContext,
  useEffect: unsupportedHook,
  useImperativeHandle: unsupportedHook,
  useLayoutEffect: unsupportedHook,
  useInsertionEffect: unsupportedHook,
  useMemo(nextCreate) {
    return nextCreate();
  },
  useReducer: unsupportedHook,
  useRef: unsupportedHook,
  useState: unsupportedHook,
  useDebugValue() {},
  useDeferredValue: unsupportedHook,
  useTransition: unsupportedHook,
  useSyncExternalStore: unsupportedHook,
  useId: useServerId,
  useHostTransitionStatus: unsupportedHook,
  useFormState: unsupportedHook,
  useActionState: unsupportedHook,
  useOptimistic: unsupportedHook,
  useMemoCache(size) {
    const data = new Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = REACT_MEMO_CACHE_SENTINEL;
    }
    return data;
  },
  useCacheRefresh() {
    return unsupportedRefresh;
  },
  useEffectEvent: unsupportedHook,
};

function getReactInternalsList() {
  const list = [];
  const serverInternals =
    React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const clientInternals =
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (serverInternals && typeof serverInternals === "object") {
    list.push(serverInternals);
  }
  if (
    clientInternals &&
    typeof clientInternals === "object" &&
    clientInternals !== serverInternals
  ) {
    list.push(clientInternals);
  }
  return list;
}

function invokeWithServerHooksDispatcher(callFn) {
  const internalsList = getReactInternalsList();
  const prevDispatchers = internalsList.map((internals) => internals.H);
  for (const internals of internalsList) {
    if (internals.H == null) {
      internals.H = DinouServerHooksDispatcher;
    }
  }
  try {
    return callFn();
  } finally {
    for (let i = 0; i < internalsList.length; i++) {
      internalsList[i].H = prevDispatchers[i];
    }
  }
}
```

Then, in `invokeServerComponentInPpr` (lines 35–54 of `dinou/core/render-jsx-to-client-jsx.js`), wrap `callFn()` with `invokeWithServerHooksDispatcher`:

```js
async function invokeServerComponentInPpr(fn, callFn) {
  resetComponentNoDynamicFlag();
  let rawResult;
  try {
    rawResult = invokeWithServerHooksDispatcher(callFn);
  } finally {
    // Note: invokeWithServerHooksDispatcher already restored ReactSharedInternals.H
    // synchronously before any returned Promise is awaited.
  }
  const optedOut = consumeComponentNoDynamicFlag();
  if (
    isThenable(rawResult) &&
    !isCacheSlotComponent(fn) &&
    isPprBuildActive() &&
    isInsideOuterSuspenseOutsideSlot() &&
    !isSlotDiscoveryActive() &&
    !optedOut &&
    !isNoDynamicActive()
  ) {
    try {
      rawResult.then(null, () => {});
    } catch (_) {}
    markDynamicAccess("async-suspense");
  }
  return await rawResult;
}
```

### 4.3. Scoping `useId` Prefix per `<DinouCacheSlot>`
When a `<DinouCacheSlot id="my-slot">` is rendered in isolation (e.g., via `refreshSlot("my-slot")` hitting `/____rsc_slot____/my-slot`) or served from cache alongside other slots on the same page, we want any `useId()` calls inside `"my-slot"` to never collide with `useId()` calls in sibling slots or in the parent layout/page.

By wrapping the top-level `asyncRenderJSXToClientJSX(jsx)` call (or `runInCachedSlot` in `dinou/core/cache-slot.js`) with `serverRenderIdStorage.run({ prefix: sanitizedSlotId + "_", count: 0 }, ...)`:
- A `useId()` inside `<DinouCacheSlot id="analytics">` produces `"_analytics_dS_1_"`, `"_analytics_dS_2_"`.
- A `useId()` inside `<DinouCacheSlot id="pricing">` produces `"_pricing_dS_1_"`, `"_pricing_dS_2_"`.
- A `useId()` in `layout.tsx` produces `"_layout_dS_1_"`.
- A `useId()` in `page.tsx` produces `"_page_dS_1_"`.

This guarantees **zero ID collisions** across:
- Full-page SSR vs. cached `<DinouCacheSlot>` rehydration,
- Nested `Outer → Inner` slots when only the inner slot is refreshed, and
- Client-side `refreshSlot()` updates.

---

## 5. Additional Benefit: Full React 19 Compiler (`babel-plugin-react-compiler`) Compatibility in Server Components

Notice that `DinouServerHooksDispatcher` also implements `useMemoCache(size)`:

```js
useMemoCache(size) {
  const data = new Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = REACT_MEMO_CACHE_SENTINEL;
  }
  return data;
}
```

Since Dinou includes `babel-plugin-react-compiler` in its dependencies, if a synchronous Server Component is ever compiled by the React Compiler, the compiler injects `const $ = _c(N)` at the top of the component, which calls `ReactSharedInternals.H.useMemoCache(N)`. Providing `DinouServerHooksDispatcher` inside `asyncRenderJSXToClientJSX` ensures that compiled synchronous Server Components work seamlessly inside `layout.tsx`, `<DinouCacheSlot>`, and PPR routes as well.

---

## 6. Verification & E2E Test Scenarios for Future Release

When implementing this enhancement in Dinou, the following test cases should be added to the E2E suite:

1. **Synchronous Server Component calling `useId()`, `useMemo()`, and `useCallback()` inside `layout.tsx`**:
   - Verify SSR renders the generated `<label htmlFor={id}>` and `<input id={id} />` with zero errors and zero hydration mismatches.
2. **Synchronous Server Component calling `useId()` inside `<DinouCacheSlot>`**:
   - Verify both cache MISS and cache HIT preserve the generated `id` attribute, and verify `refreshSlot()` updates the slot without ID collisions across sibling slots.
3. **Synchronous Server Component calling `useId()` inside a PPR route (`ppr = true`)**:
   - Verify `useId()` works both in the Static Shell (outside `<Suspense>` or with `noDynamic()`) and inside a Dynamic PPR `<Suspense>` Hole.
4. **Negative test — Stateful Hook in Server Component**:
   - Verify calling `useState()` or `useEffect()` inside a Server Component throws `"This Hook is not supported in Server Components."` (matching React 19's official error message instead of `Cannot read properties of null`).

