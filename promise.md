# Server-to-Client Promise Streaming & React 19 `use()` Fix in Dinou

## 1. Overview

In React 19 and Dinou, Server Components and server-side data loaders (`getProps` in `page_functions.ts` / `layout_functions.ts`) can initiate asynchronous operations **without `await`** and pass the raw `Promise` (or array of `Promise`s) as a prop to a Client Component (`"use client"`). Inside a `<Suspense>` boundary, the Client Component unwraps the streamed Flight promise using React 19's `use(promise)` hook:

- **Strategy 9 (`RSC Promise ➔ Client use()`)**: A Server Component (`page.tsx`) creates an un-awaited `Promise` and passes it as a prop to a child Client Component wrapped in `<Suspense>`.
- **Strategy 9 + PPR (`ppr = true`)**: On a Partial Prerendering route, the outer page shell and `<Suspense>` fallback are pre-rendered into the 0ms static shell (`shell.html` / `shell.page.json`), while the `<Suspense>` boundary containing the Client Component and its `Promise` prop is registered as a dynamic PPR hole (`ppr-hole-*`) and streamed at runtime.
- **Strategy 12 (`Client-First getProps Promise ➔ Client use()`)**: In Dinou's Client-First model (`"use client"` `page.tsx`), `getProps()` in `page_functions.ts` starts an async query without `await` and returns `{ docPromise }` inside the props object. The client page renders its shell immediately and unwraps `use(docPromise)` inside `<Suspense>` without blocking TTFB.

---

## 2. Root Cause Analysis (The Problem)

### 2.1. Premature Promise Unwrapping in `asyncRenderJSXToClientJSX`

In `dinou/core/render-jsx-to-client-jsx.js`, when `asyncRenderJSXToClientJSX` encountered a Client Component (`isClientComponent(Component)`), it recursively processed the component's `props` via `await asyncRenderJSXToClientJSX(props)`:

```js
// Previous code in dinou/core/render-jsx-to-client-jsx.js:
} else if (Array.isArray(jsx)) {
  const results = [];
  for (const child of jsx) {
    results.push(await asyncRenderJSXToClientJSX(child, child?.key ?? null));
  }
  return results;
...
} else if (jsx instanceof Promise) {
  return jsx;
} else {
  // Process object props (e.g., { className: "foo" })
  const entries = [];
  for (const [propName, value] of Object.entries(jsx)) {
    entries.push([propName, await asyncRenderJSXToClientJSX(value)]);
  }
  return Object.fromEntries(entries);
}
```

Although `else if (jsx instanceof Promise) { return jsx; }` intended to return the `Promise` untouched, **`asyncRenderJSXToClientJSXInner` and `asyncRenderJSXToClientJSX` are `async` functions**. In JavaScript (ECMAScript specification), returning a `Promise` (or thenable) from an `async` function automatically assimilates and unwraps that `Promise`. Consequently, `await asyncRenderJSXToClientJSX(value)` waited for `value` to settle on the server and resolved to the **unwrapped value** rather than preserving the `Promise` instance.

This caused two critical issues:
1. **TTFB Blocking**: `getJSX` / `asyncRenderJSXToClientJSX` blocked on the server until the `Promise` settled before handing the element tree to React Flight (`renderRSCStream`).
2. **React 19 `use()` Runtime Crash**: Because `props.promise` was replaced by its resolved plain object (e.g. `{ label: "...", value: 42 }`) instead of a `Promise`, calling `use(promise)` inside the Client Component threw:
   ```text
   TypeError: An unsupported type was passed to use(): [object Object]
   ```

### 2.2. Missing PPR Dynamic Hole Registration for Client Components with Promise Props

During a PPR static shell build (`isPprBuildActive() === true`), `<Suspense>` boundaries in `dinou/core/render-jsx-to-client-jsx.js` only convert into dynamic PPR holes (`data-ppr-hole="ppr-hole-*"`) when evaluating their children throws `Symbol.for("dinou.ppr.postpone")` via `markDynamicAccess(...)`.

While `async` Server Components triggered `markDynamicAccess("async-suspense")` inside `invokeServerComponentInPpr`, a Client Component (`$$typeof: Symbol.for("react.client.reference")`) inside `<Suspense>` receiving a `Promise` prop is not invoked as a Server Component. Without calling `markDynamicAccess("async-suspense")` when detecting a thenable prop on a child inside `<Suspense>` during a PPR build, the enclosing `<Suspense>` boundary was not registered in `getRegisteredHoles()`.

### 2.3. Promise Guard in PPR Hole Splicing (`ppr-runtime.js`)

In `dinou/core/ppr-runtime.js`, `collectKnownHoles(node)` and `replaceHoles(node)` recursively traversed `typeof node === "object"` without early-returning when `node` was a `Promise` (or thenable), whereas `traverse(current)` already checked `current instanceof Promise`.

---

## 3. Solution Implemented in Dinou Core

### 3.1. `dinou/core/render-jsx-to-client-jsx.js`

Updated both the `Array.isArray(jsx)` branch and the plain object props (`Object.entries(jsx)`) branch to check `isThenable(...)`:
- **At runtime (`!isPprBuildActive()`)**: Preserves the `Promise` reference directly in the array or props object (`results.push(child)` / `entries.push([propName, value])`) without calling `await asyncRenderJSXToClientJSX(...)`.
- **During PPR Static Shell Build (`isPprBuildActive()`)**: When inside an outer `<Suspense>` boundary outside a cached slot (`isInsideOuterSuspenseOutsideSlot() && !isSlotDiscoveryActive() && !isNoDynamicActive()`), attaches a no-op rejection handler (`value.then(null, () => {})`) and calls `markDynamicAccess("async-suspense")` so the enclosing `<Suspense>` boundary is registered as a dynamic PPR hole (`ppr-hole-*`).

```js
// dinou/core/render-jsx-to-client-jsx.js

  } else if (Array.isArray(jsx)) {
    const results = [];
    for (const child of jsx) {
      if (isThenable(child)) {
        if (
          isPprBuildActive() &&
          isInsideOuterSuspenseOutsideSlot() &&
          !isSlotDiscoveryActive() &&
          !isNoDynamicActive()
        ) {
          try {
            child.then(null, () => {});
          } catch (_) {}
          markDynamicAccess("async-suspense");
        }
        results.push(child);
      } else {
        results.push(await asyncRenderJSXToClientJSX(child, child?.key ?? null));
      }
    }
    return results;
```

```js
// dinou/core/render-jsx-to-client-jsx.js

    } else if (jsx instanceof Promise) {
      return jsx;
    } else {
      // Process object props (e.g., { className: "foo" })
      const entries = [];
      for (const [propName, value] of Object.entries(jsx)) {
        if (isThenable(value)) {
          if (
            isPprBuildActive() &&
            isInsideOuterSuspenseOutsideSlot() &&
            !isSlotDiscoveryActive() &&
            !isNoDynamicActive()
          ) {
            try {
              value.then(null, () => {});
            } catch (_) {}
            markDynamicAccess("async-suspense");
          }
          entries.push([propName, value]);
        } else {
          entries.push([propName, await asyncRenderJSXToClientJSX(value)]);
        }
      }
      return Object.fromEntries(entries);
    }
```

### 3.2. `dinou/core/ppr-runtime.js`

Added a guard in `collectKnownHoles` and `replaceHoles` so `Promise` / thenable instances are returned untouched without object cloning or property traversal:

```js
// dinou/core/ppr-runtime.js

function collectKnownHoles(node) {
  if (!node || typeof node !== "object" || node instanceof Promise || typeof node.then === "function") return;
  ...
}

function replaceHoles(node) {
  if (!node || typeof node !== "object" || node instanceof Promise || typeof node.then === "function") return node;
  ...
}
```

---

## 4. Documentation Updates

- **`src/docs/data-fetching/page.tsx`**:
  - Expanded the architecture guide from 13 to **14 Strategies**.
  - Clarified **Strategy 11 (`Client-First getProps (Dynamic SSR)`)** regarding its blocking TTFB trade-off when `getProps` `await`s data before rendering `page.tsx`.
  - Added **Strategy 12 (`Client-First getProps Promise ➔ Client use() (React 19)`)** in the TOC, Quick Jump Index, Comparison Matrix, and detailed strategy sections, demonstrating how `getProps` can return an un-awaited `Promise` inside the props object to a `"use client"` `page.tsx` that unwraps it with `use()` inside `<Suspense>`.
- **`src/docs/server-client-components/page.tsx`**:
  - Updated the callout reference to point to the 14 strategies in `/docs/data-fetching`.

---

## 5. Verification & Test Suite (`src/test-promise/`)

A dedicated test suite was created under `src/test-promise/`:

- `src/test-promise/client-consumer.tsx`: `"use client"` components (`ClientPromiseConsumer` and `ClientPromiseArrayConsumer`) that unwrap `promise` and `promises` using React 19's `use()`.
- `src/test-promise/page.tsx` & `src/test-promise/page_functions.ts`: **Strategy 9 (Dynamic SSR)** route passing a single `Promise` and an array of `Promise`s from an RSC to Client Components inside `<Suspense>`.
- `src/test-promise/ppr/page.tsx` & `src/test-promise/ppr/page_functions.ts`: **Strategy 9 + PPR (`export const ppr = true`)** route verifying static shell generation and `ppr-hole-1` registration when a Client Component inside `<Suspense>` receives a `Promise` prop.
- `src/test-promise/getprops/page.tsx` & `src/test-promise/getprops/page_functions.ts`: **Strategy 12 (`getProps` Promise ➔ Client `use()`)** route where `getProps()` returns `{ docPromise }` without `await` to a `"use client"` page.
- `src/test-promise/run-tests.mjs`: Automated test runner executing the Dinou pipeline (`getJSX`, `asyncRenderJSXToClientJSX`, `runWithPprContext`, `getRegisteredHoles`, and `use()` verification).

### Running the Tests

```bash
node src/test-promise/run-tests.mjs
```

1. **Before the fix (`git stash`)**: All 3 tests failed (`props.promise` and `tree.props.docPromise` were unwrapped into plain objects on the server, blocking TTFB, and PPR registered `[]` instead of `['ppr-hole-1']`).
2. **After the fix (`git stash pop`)**: All 3 tests pass (`RESULT: All 3 tests PASSED ✅`).

