# Global Process Singletons & Cross-Bundle Hook Dispatching in Dinou

## 1. Executive Summary

Dinou operates a **Dual-Bundle Architecture** (Pass A: RSC Engine, Pass B: SSR Engine) and an **Incremental In-Process Development Server** (`dinou/node/dev.js`) that hot-reloads `rsc-engine.mjs` without restarting or forking the Node.js process.

Because multiple bundled and unbundled copies of Dinou's core modules (`ppr-context.js`, `render-jsx-to-client-jsx.js`, `request-context.js`, `cache-slot.js`, `revalidating.js`) can coexist within the same V8 isolate, **module-scoped state (`new AsyncLocalStorage()`, `new WeakMap()`, `new WeakSet()`, `new Map()`, `new Set()`) cannot be stored in local module variables**. Any state that tracks the active request, segment (`layout` vs `page`), `<DinouCacheSlot>`, PPR `<Suspense>` hole, or React Server Hooks dispatcher must be anchored as a process-wide singleton via `globalThis[Symbol.for(...)]`.

---

## 2. Why Multiple Copies of Core Modules Coexist in One Process

There are two primary execution lifecycles where Node.js evaluates more than one copy of `dinou/core/*` in the same process:

### Scenario A: Incremental HMR Rebuilds in `dev:esbuild`, `dev:rollup`, and `dev:webpack`

In [`dinou/node/dev.js`](./dinou/node/dev.js), Pass A (`rsc-engine.mjs`) is compiled with `esbuild` using `splitting: true` into `.dinou/node-dev/chunks/rsc/`. Whenever a source file or client manifest changes during development:

1. `ctxA.rebuild()` emits updated chunks with new content hashes (e.g., `chunk-<NEW>.mjs`).
2. `dev.js` increments `rscEngineVersion` and dynamically imports `rsc-engine.mjs?v=<rscEngineVersion>`.
3. Chunks whose content hash changed are newly evaluated by Node's ESM loader, while **unchanged chunks remain cached in Node's ESM module map** and retain references to the previously evaluated dependency chunks (`chunk-<OLD>.mjs`).
4. Specifically, `<DinouCacheSlot>` (in `dinou/server.js`) dynamically imports `./cache-slot-<OLD>.mjs`, which calls `runInCachedSlot` on the `chunk-<OLD>.mjs` instance of `ppr-context.js`, while `rsc-engine.mjs?v=<NEW>` renders the component tree using the `chunk-<NEW>.mjs` instance of `render-jsx-to-client-jsx.js` and `ppr-context.js`.

### Scenario B: Static Site Generation (`run-ssg.js` ➔ `generate-static.js`) in Production Builds

During production builds (`build:node:esbuild`, `build:node:rollup`, `build:node:webpack`, and edge/standalone builds), `run-ssg.js` invokes [`dinou/core/generate-static.js`](./dinou/core/generate-static.js):

1. At module load time, `generate-static.js` imports `./generate-static-rsc.js` ➔ `./get-jsx.js` ➔ `./render-jsx-to-client-jsx.js` ➔ `./ppr-context.js`. This evaluates the **unbundled source files** in `dinou/core/` (**Instance #1**).
2. Next, `generate-static.js` compiles and dynamically imports `.dinou/node/rsc-engine.mjs` (**Instance #2**), which contains its own bundled copy of `render-jsx-to-client-jsx.js` and `ppr-context.js`.
3. Both Instance #1 (unbundled) and Instance #2 (bundled `rsc-engine.mjs`) live in the same Node.js process while SSG pre-renders all static routes and layouts.

---

## 3. Deep Dive: The Commit `c9ae23b` Incident (`getReactInternalsList`)

### 3.1. How `getReactInternalsList()` Worked Before `c9ae23b`

In [`dinou/core/render-jsx-to-client-jsx.js`](./dinou/core/render-jsx-to-client-jsx.js), `getReactInternalsList()` collects all active `ReactSharedInternals` objects (`__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` and `__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`) so Dinou can install `DinouServerHooksDispatcher` on `internals.H` when evaluating Server Components (enabling deterministic `useId()`, `use()`, `useMemo()`, `useCallback()`, etc.):

```js
// BEFORE commit c9ae23b
addFromModule(React);
try {
  const req = createRequire(import.meta.url);
  try {
    addFromModule(req("react/index.js"));
  } catch (_) {}
  try {
    addFromModule(req("react/react.react-server.js"));
  } catch (_) {}
} catch (_) {}
```

Before commit `c9ae23b`:
- `node_modules/react/package.json` defines `"exports"` with only `"."` and `"./package.json"`. It does **not** export `"./index.js"` or `"./react.react-server.js"`.
- Consequently, calling `req("react/index.js")` and `req("react/react.react-server.js")` **always threw `ERR_PACKAGE_PATH_NOT_EXPORTED`** (`Package subpath './index.js' is not defined by "exports"`) and was silently caught by `catch (_) {}`.
- As a result, `getReactInternalsList()` only ever contained `addFromModule(React)`—the local `React` instance belonging to that specific bundle. Unbundled `dinou/core/render-jsx-to-client-jsx.js` (Instance #1) and bundled `rsc-engine.mjs` (Instance #2) never shared any `internals` object in their `internalsList`.

### 3.2. What Changed in Commit `c9ae23b`

To eliminate Webpack's `Critical dependency: the request of a dependency is an expression` warning on `createRequire(import.meta.url)`, commit `c9ae23b` resolved the filesystem directory of `react/package.json` first:

```js
// AFTER commit c9ae23b
const createReq = createRequire;
const req = createReq(import.meta.url);
const reactPkgPath = req.resolve("react/package.json");
const reactDir = reactPkgPath.slice(0, reactPkgPath.length - "package.json".length);
try {
  addFromModule(req(reactDir + "index.js"));
} catch (_) {}
try {
  addFromModule(req(reactDir + "react.react-server.js"));
} catch (_) {}
```

Because `reactDir + "index.js"` and `reactDir + "react.react-server.js"` are **absolute filesystem paths** rather than package specifiers, Node.js bypassed the `package.json` `"exports"` check and **actually loaded both CJS modules from `node_modules/react/`**.

### 3.3. How Cross-Instance Dispatcher Mutation Corrupted `useId()`

Once `req(reactDir + "react.react-server.js")` succeeded, every evaluated instance of `render-jsx-to-client-jsx.js` in the process pushed the **same shared CJS `ReactSharedInternals` singleton** from `node_modules/react/` into its `internalsList`:

1. **Instance #1** (unbundled `dinou/core/render-jsx-to-client-jsx.js` in `generate-static.js`, or `chunk-<OLD>.mjs` in `dev.js`) loaded first and called `patchInternalsDispatcherSetter(internals)` on the shared CJS `internals` object.
2. That installed an `Object.defineProperty(internals, "H", { set(nextH) { patchDispatcherObject_1(nextH, internals); } })` setter and marked `internals._dinouPatchedH = true`.
3. Later, **Instance #2** (`rsc-engine.mjs` in `generate-static.js`, or `chunk-<NEW>.mjs` in `dev.js`) rendered a Server Component via `invokeWithServerHooksDispatcher`:
   ```js
   for (const internals of internalsList) {
     internals.H = DinouServerHooksDispatcher_2;
   }
   ```
4. When that loop assigned `internals.H = DinouServerHooksDispatcher_2` on the shared CJS `internals` object, **Instance #1's `internals.H` setter fired** and called `patchDispatcherObject_1(DinouServerHooksDispatcher_2)`.
5. Inside Instance #1, `patchDispatcherObject_1` checked `if (dispatcher === DinouServerHooksDispatcher_1) return;`. Because `DinouServerHooksDispatcher_2 !== DinouServerHooksDispatcher_1`, the check evaluated to `false`!
6. `patchDispatcherObject_1` then **mutated `DinouServerHooksDispatcher_2` in-place**, overwriting `DinouServerHooksDispatcher_2.useId` with `dinouPatchedUseId_1`—which invoked `useServerId_1()` bound to **Instance #1's** module-local `AsyncLocalStorage` instances in `ppr-context.js`.
7. Because `DinouServerHooksDispatcher_2` is the exact same object assigned to all entries in Instance #2's `internalsList` (including the bundled `React` inside `rsc-engine.mjs`), **every `React.useId()` call in Instance #2 now executed `useServerId_1()`**.
8. Meanwhile, Instance #2 was calling `runInLayoutSegment_2` and `runInCachedSlot_2` on **Instance #2's** `AsyncLocalStorage` instances. When `useServerId_1()` read Instance #1's `AsyncLocalStorage` instances (`cachedSlotStorage_1`, `runtimeStaticSuspenseStorage_1`, `pageSegmentStorage_1`, `layoutSegmentStorage_1`), all four returned `null`.
9. `useServerId_1()` fell through to `getContext()` from `request-context.js` (which **was** already a `globalThis[Symbol.for("dinou.request.context.storage")]` singleton) and returned `_page_dS_${reqCtx._dinouUseIdCount}` (`"_page_dS_1_"`, `"_page_dS_3_"`, `"_page_dS_4_"`) instead of `"_slot_useid-layout-slot_dS_1_"`, `"_layout_dS_1_"`, and `"_layout_dS_2_"`.

### 3.4. Why `dev:*` Failed on Client Component `useId()` Hydration While `prod:*` Passed (`__CLIENT_INTERNALS__` vs `__SERVER_INTERNALS__`)

Once `req(reactDir + "index.js")` began resolving in `c9ae23b`, a second subtle difference emerged between `prod` (`dinou/node/bundle-dual-engine.js`) and `dev` (`dinou/node/dev.js`):

- **In `prod` (`build:node:*`)**: `ssr-engine.mjs` (Pass B) bundles its own isolated copy of `react` (`react.production.js`) inside `ssr-engine.mjs`.
- **In `dev` (`dev:esbuild`, `dev:rollup`, `dev:webpack`)**: `ssr-engine.mjs` externalizes `react` and `react-dom`, so `react-dom/server` (`react-dom-server.edge.development.js`) loads `node_modules/react/index.js` directly.

In `getReactInternalsList()`, `addFromModule(req(reactDir + "index.js"))` previously called `patchInternalsDispatcherSetter(c)` on `c` (`__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE` of `node_modules/react/index.js`).
When `react-dom/server` rendered a `"use client"` component (such as `<ClientUseIdVerifier>` in `/t-use-id`) during SSR in `dev` mode:
1. `react-dom/server` assigned its own SSR `HooksDispatcher` to `c.H` on `node_modules/react/index.js`.
2. Because `patchInternalsDispatcherSetter(c)` had installed a setter on `c.H`, `patchDispatcherObject` overwrote `react-dom/server`'s `HooksDispatcher.useId` with `dinouPatchedUseId` (`useServerId()`).
3. As a result, `<ClientUseIdVerifier>` (a `"use client"` component) rendered `_page_dS_1_` during SSR on the server, whereas `hydrateRoot()` in the browser generated React's native tree-based `_R_16_`, triggering a React Hydration Mismatch (`#418`) in `dev` mode!

**The Rule for `__CLIENT_INTERNALS__` vs `__SERVER_INTERNALS__`**:
- `patchInternalsDispatcherSetter` must **only** be installed on `s` (`__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`), which is used exclusively by React Flight (`react-server-dom-*`).
- `c` (`__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE`) is included in `internalsList` so `invokeWithServerHooksDispatcher` can temporarily swap `c.H = DinouServerHooksDispatcher` (and restore `c.H` in `finally`) during synchronous Server Component execution, but **`patchInternalsDispatcherSetter` is never installed on `c`**, preserving `react-dom/server`'s native `_R_...` `useId()` dispatcher for `"use client"` components during SSR.

---

## 4. Before vs. After: Consequence of `getReactInternalsList()` Resolving All 3 React Copies

In a Dinou Node.js process, up to **three distinct copies of React** can exist in memory:
1. **The Bundled / Vendorized React** imported via `import React from "react"` inside `rsc-engine.mjs` (or resolved to `dinou/vendor/react`).
2. **`node_modules/react/react.react-server.js`** (the CJS `react-server` build in `node_modules`, used when an external CJS dependency or `require("react-server-dom-webpack/server")` calls `require("react")` outside the bundle).
3. **`node_modules/react/index.js`** (the standard CJS build in `node_modules`, used if an external CJS package loads React via `createRequire` without `react-server` export conditions).

| Aspect | Before `c9ae23b` (`req("react/...")` threw `ERR_PACKAGE_PATH_NOT_EXPORTED`) | After `c9ae23b` + Singleton Architecture |
| :--- | :--- | :--- |
| **React copies patched in `getReactInternalsList()`** | Only Copy #1 (`import React from "react"` local to the bundle). Copies #2 and #3 failed silently in `catch (_) {}`. | All 3 copies (#1 Bundled/Vendorized React, #2 `node_modules/react/react.react-server.js`, and #3 `node_modules/react/index.js`). |
| **External `node_modules` CJS libraries calling `useId()` / `use()` / `useMemo()` in a Server Component** | Failed with `TypeError: Cannot read properties of null (reading 'useId')` (*Invalid hook call*) because `internals.H` on `node_modules/react` was `null`, or generated un-scoped native `_R_...` IDs. | Works seamlessly and produces deterministic Dinou-scoped IDs (`_layout_dS_...`, `_page_dS_...`, `_slot_..._`, `_hole_..._`). |
| **Cross-bundle / HMR rebuild safety** | Accidental isolation only because `req("react/...")` threw; `dev:esbuild` chunk splitting (`server.js` ➔ `cache-slot-<OLD>.mjs`) could still split `cachedSlotStorage`. | Guaranteed process-wide consistency via `globalThis[Symbol.for(...)]` singletons and `_dinouIsServerHooksDispatcher` immutability protection. |

---

## 5. Singleton Architecture & Safeguards Implemented

### 5.1. Process-Wide Storage Singletons in [`dinou/core/ppr-context.js`](./dinou/core/ppr-context.js)

All `AsyncLocalStorage`, `WeakMap`, `WeakSet`, and `noDynamic` flags in `ppr-context.js` are registered on `globalThis` using `Symbol.for(...)`:

- `Symbol.for("dinou.ppr.storage")` ➔ `pprStorage`
- `Symbol.for("dinou.page.segment.storage")` ➔ `pageSegmentStorage`
- `Symbol.for("dinou.layout.segment.storage")` ➔ `layoutSegmentStorage`
- `Symbol.for("dinou.cached.slot.storage")` ➔ `cachedSlotStorage`
- `Symbol.for("dinou.slot.discovery.storage")` ➔ `slotDiscoveryStorage`
- `Symbol.for("dinou.runtime.static.suspense.storage")` ➔ `runtimeStaticSuspenseStorage`
- `Symbol.for("dinou.page.root.elements")` ➔ `pageRootElements`
- `Symbol.for("dinou.layout.root.elements")` ➔ `layoutRootElements`
- `Symbol.for("dinou.layout.children.placeholders")` ➔ `layoutChildrenPlaceholders`
- `Symbol.for("dinou.ppr.noDynamic.state")` ➔ `noDynamicState`

Additionally, `runInPageSegment` and `runInLayoutSegment` enforce mutual exclusion so the innermost active segment always takes precedence:
- `runInPageSegment` runs inside `layoutSegmentStorage.run(null, () => pageSegmentStorage.run(store, callback))`.
- `runInLayoutSegment` runs inside `pageSegmentStorage.run(null, () => layoutSegmentStorage.run(store, callback))`.

### 5.2. Dispatcher Protection & Hook Delegation in [`dinou/core/render-jsx-to-client-jsx.js`](./dinou/core/render-jsx-to-client-jsx.js)

1. **`_dinouIsServerHooksDispatcher: true`**:
   Every `DinouServerHooksDispatcher` object carries `_dinouIsServerHooksDispatcher: true`. `patchDispatcherObject(dispatcher, internals)` checks `dispatcher._dinouIsServerHooksDispatcher` and returns immediately, ensuring an `internals.H` setter from an older chunk or unbundled module never mutates `DinouServerHooksDispatcher` from another bundle.
2. **`Symbol.for("dinou.server.hooks.impl")`**:
   The active `{ useServerId, snapshotActiveIdCounts, restoreActiveIdCounts }` implementation is registered on `globalThis[Symbol.for("dinou.server.hooks.impl")]`. Any `dinouPatchedUseId` / `dinouPatchedUse` wrapper installed on React Flight's internal dispatcher always delegates to the latest implementation on `globalThis`.
3. **`Symbol.for("dinou.hole.boundary.promise.cache")`**:
   `holeBoundaryPromiseCache` (`WeakMap`) is shared via `globalThis` and `<Suspense>` checks both `jsx.props?.children?.type === DinouSuspenseHoleBoundary` and `jsx.props?.children?.type?.$$dinouDeferredSuspenseStream`.

### 5.3. ISR Regeneration Singletons in [`dinou/core/revalidating.js`](./dinou/core/revalidating.js)

- `Symbol.for("dinou.regenerating.set")` ➔ `regenerating` (`Set`)
- `Symbol.for("dinou.inflight.generations")` ➔ `inFlightGenerations` (`Map`)

