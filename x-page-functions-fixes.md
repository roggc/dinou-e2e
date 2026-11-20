# Dinou `page_functions` / `layout_functions` Named-Over-Default Precedence Fix

## Context

During the pre-release documentation audit of `/docs/page-functions` (`Section 8.2: Hybrid Model & Precedence Rules`), we verified that Dinou guarantees:

> **Named exports take absolute precedence over `export default`** for every contract in `page_functions.ts` and `layout_functions.ts` (`revalidate`, `ppr`, `allowISG`, `getProps`, `validateParams`, `getStaticPaths`, `getCacheTags`).

While `build-static-pages.js` and `resolve-module-ppr.js` already honor this rule, three runtime modules contained an inverted ternary order for `revalidate` and `allowISG` that silently ignored a named **constant** override whenever `export default` defined a **function** for that same property.

---

## Root Cause

In `dinou/core/handler.js`, `dinou/core/layout-functions.js`, and `dinou/core/cache-revalidate.js`, resolution used:

```js
const resolvedAllowISG =
  typeof mod.allowISG === "function"
    ? await mod.allowISG()
    : typeof defaultExport?.allowISG === "function"
    ? await defaultExport.allowISG()
    : (mod.allowISG ?? defaultExport?.allowISG ?? defaultAllowISG);
```

and the same pattern for `revalidate`:

```js
const revalidateVal =
  typeof mod.revalidate === "function"
    ? await mod.revalidate()
    : typeof defaultExport?.revalidate === "function"
    ? await defaultExport.revalidate()
    : (mod.revalidate ?? defaultExport?.revalidate);
```

### Failure Scenario

Given a shared base preset with function exports and a route-local constant override:

```ts
// base-config.ts
export default {
  revalidate: async () => 3600,
  allowISG: async () => true,
};

// src/blog/[slug]/page_functions.ts (or layout_functions.ts)
import baseConfig from "@/config/base-config";
export default baseConfig;
export const revalidate = 0;      // Expected: Dynamic SSR (0)
export const allowISG = false;    // Expected: Strict SSG (false)
```

Because `typeof mod.revalidate === "function"` evaluates to `false` (it is the number `0`), execution fell directly into `typeof defaultExport?.revalidate === "function"`, invoking `await defaultExport.revalidate()` (`3600`) and discarding the explicit named `export const revalidate = 0`. The exact same bug occurred when `export const allowISG = false` (or `true`) overrode a default `allowISG: () => ...` function, or when `export const revalidate = false` / `60` overrode a default `revalidate: () => ...` function.

---

## Required Changes

Resolve the winning property first (`named !== undefined ? named : defaultExport?.prop`), and only then check whether the selected value is a function.

### 1. `dinou/core/handler.js`

- **`allowISG` (~line 598)**:
  ```js
  const rawAllowISG =
    pageFunctionsModule.allowISG !== undefined
      ? pageFunctionsModule.allowISG
      : defaultExport?.allowISG;
  const resolvedAllowISG =
    typeof rawAllowISG === "function"
      ? await rawAllowISG()
      : (rawAllowISG ?? null);
  ```
- **`revalidate` (~line 636)**:
  ```js
  const rawRevalidate =
    pageFunctionsModule.revalidate !== undefined
      ? pageFunctionsModule.revalidate
      : defaultExport?.revalidate;
  let revalidateVal =
    typeof rawRevalidate === "function"
      ? await rawRevalidate()
      : rawRevalidate;
  ```

### 2. `dinou/core/layout-functions.js`

- **`allowISG` (~line 119)**:
  ```js
  const rawAllowISG =
    mod.allowISG !== undefined ? mod.allowISG : defaultExport?.allowISG;
  const resolvedAllowISG =
    typeof rawAllowISG === "function"
      ? await rawAllowISG()
      : (rawAllowISG ?? defaultAllowISG);
  ```
- **`revalidate` (~line 155)**:
  ```js
  const rawRevalidate =
    mod.revalidate !== undefined ? mod.revalidate : defaultExport?.revalidate;
  const revalidateVal =
    typeof rawRevalidate === "function"
      ? await rawRevalidate()
      : rawRevalidate;
  ```

### 3. `dinou/core/cache-revalidate.js`

- **`revalidate` (~line 204)**:
  ```js
  const rawRevalidate =
    pfMod.revalidate !== undefined
      ? pfMod.revalidate
      : defaultExport?.revalidate;
  const pfRevalidate =
    typeof rawRevalidate === "function"
      ? await rawRevalidate()
      : rawRevalidate;
  ```

---

## Verification & Regression Tests to Add Upstream

Add unit/integration tests covering hybrid named + `export default` configs in both `page_functions.ts` and `layout_functions.ts`:

1. `export default { revalidate: async () => 3600 }` + `export const revalidate = 0` → resolves to `0` (`isDynamic === true`) in `handler.js`, `layout-functions.js`, and `cache-revalidate.js`.
2. `export default { revalidate: () => 60 }` + `export const revalidate = false` → resolves to `false` (pure static SSG).
3. `export default { allowISG: async () => true }` + `export const allowISG = false` → resolves to `false` (returns 404 for unlisted dynamic paths).
4. `export default { allowISG: () => false }` + `export const allowISG = true` → resolves to `true` (allows on-demand ISG).
5. Absence of named exports (`export default { revalidate: () => 120, allowISG: () => false }`) → continues invoking the default export functions as before.
