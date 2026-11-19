# Upstream Handoff Specification: API Reference Batch 1 — Navigation, `<Link>`, `redirect()`, `useRouter()` & `useSearchParams()` Fixes (`v9.4.0`)

## 1. Executive Summary & Root-Cause Analysis

During the deep framework audit of `/docs/api-reference` **Batch 1** (Section 1: Components `<Link>`, `<ClientRedirect>`; Section 2: Hooks & Navigation `redirect()`, `useSearchParams()`, `usePathname()`, `useRouter()`, `refreshSlot()`, `useNavigationLoading()`), we uncovered and fixed **six bugs and parity inconsistencies** across Dinou's server rendering pipeline (`handler.js`, `get-jsx.js`) and client router (`link.jsx`, `navigation.js`, `client.jsx`, `client-webpack.jsx`, `redirect.jsx`, `index.d.ts`):

1. **`getProps()` Redirect Short-Circuit in `page_functions.ts` & `layout_functions.ts` (`dinou/core/handler.js`, `dinou/core/get-jsx.js`)**:
   - **Root Cause**: `createRequestContext()` kept `let hasRedirected = false` as a private closure variable rather than exposing it on `context`. When `getProps()` in `page_functions.ts` or `layout_functions.ts` called `return redirect("/login")` (or `res.redirect("/login")`), `get-jsx.js` did not stop execution: it spread the returned `<ClientRedirect />` element into `props` and still invoked `<Page {...props} />`, all `@slot` components, and every parent `<Layout />`. Any page or layout dereferencing expected props (e.g. `profile.name`) threw a `TypeError` — and on SPA RSC wire navigation (`/____rsc_page____/...`), `handler.js`'s `catch (err)` block caught that `TypeError` and tried to emit a `500` error payload instead of cleanly finishing the `x-rsc-redirect` response.
   - **Fix**: Expose writable `_hasRedirected: false` on `context` in `createRequestContext()` (excluded from `copyCustomContextProperties()`), flip `context._hasRedirected = true` whenever `safeResCall("redirect", ...)` triggers, short-circuit immediately in `get-jsx.js` after `getProps()`, after page rendering (before layouts/@slots), after `@slot` rendering, after `getLayoutProps()`, and after layout rendering, and add a defensive redirect guard at the top of the RSC `catch (err)` handler in `handler.js`.

2. **External URL Navigation Crash (`SecurityError`) in `router.push()` / `router.replace()` / `<ClientRedirect>` (`dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`)**:
   - **Root Cause**: `DinouLinkTarget` / `DinouRoute` and `index.d.ts` explicitly permit external URLs (`https://...`, `http://...`, `mailto:...`, `tel:...`), and `resolveUrl()` returns them intact. However, `navigate()` in both `client.jsx` (Esbuild/Rollup) and `client-webpack.jsx` (Webpack) passed external URLs straight into `window.history.pushState(null, "", finalPath)` / `replaceState(...)`, throwing a browser `DOMException: SecurityError` (also breaking `<ClientRedirect to="https://..." />`).
   - **Fix**: Check `if (isExternalUrl(finalPath))` immediately inside `navigate()` in both `client.jsx` and `client-webpack.jsx`, delegating cleanly to `window.location.replace(finalPath)` (when `options.replace` is truthy) or `window.location.assign(finalPath)` and returning early.

3. **`<Link>` & Global Anchor Listener Respecting `target="_blank"`, `download`, and Non-Primary Mouse Clicks (`dinou/core/link.jsx`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`)**:
   - **Root Cause**: `link.jsx` only checked modifier keys (`meta`/`ctrl`/`shift`/`alt`) and `isExternalUrl(targetHref)`, so internal links like `<Link href="/report" target="_blank">` or `<Link href="/export.csv" download>` called `e.preventDefault()`, hijacked navigation into the current tab, and triggered unnecessary hover prefetches. Meanwhile, the global `onNavigate` listener in `client.jsx` / `client-webpack.jsx` did not check `download` or `e.button !== 0` and treated `target="_self"` as non-SPA.
   - **Fix**: Compute `isNonSelfTarget = Boolean(props.target && props.target !== "_self")` and `isDownload = props.download !== undefined && props.download !== false` in `link.jsx`, skipping both `handlePrefetch` and SPA click interception (plus `e.button !== 0`). Align `onNavigate` in both `client.jsx` and `client-webpack.jsx` with `(anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download") || e.button !== 0`.

4. **Hash Fragment (`#hash`) Stripping From `pageCache`, `route` State, and Cache-Busting Query Placement (`dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`)**:
   - **Root Cause**: Navigating to `/blog#comments` with `{ fresh: true }` called `pageCache.delete("/blog#comments")` (missing cached `"/blog"`), stored `"/blog#comments"` in `route`, and built `/____rsc_page____/blog#comments?____v____=1` — placing `?____v____=1` and `?____build_id____=...` *inside* the URL fragment where `fetch()` strips them, while duplicating `pageCache` entries per hash.
   - **Fix**: Keep full `finalPath` (including `#hash`) in `window.history.pushState` / `replaceState`, but normalize `routeWithoutHash = finalPath.split("#")[0] || "/"` for `pageCache.delete(...)`, `setRoute(...)`, `getPagePayload(...)`, and `window.__DINOU_PREFETCH__`.

5. **Referential Stability of `useRouter()` (`dinou/core/navigation.js`)**:
   - **Root Cause**: `useRouter()` allocated a brand-new `{ push, replace, back, forward, refresh, refreshSlot }` object on every component re-render, causing `useEffect(..., [router])` hooks (including polling timers and `ClientRedirect`) to tear down and re-run whenever unrelated local `useState` changed.
   - **Fix**: Memoize the returned router object with `useMemo(..., [context])` and guard optional context methods (`context.back?.()`, `context.forward?.()`, `context.refresh?.(options)`).

6. **`useSearchParams()` Static-Export Hydration Guard & `redirect()` JSDoc Parity (`dinou/core/navigation.js`, `dinou/core/redirect.jsx`, `dinou/index.d.ts`)**:
   - **Fix**: Include `window.__DINOU_STATIC_EXPORT__` alongside `window.__DINOU_USE_STATIC__` and `window.__DINOU_PPR_RESUME__` in `isStaticHydrating` (`dinou/core/navigation.js`) so `dinou export-static` outputs never hit React `#418` hydration mismatches even for exported `ppr = true` zero-hole pages. Update stale `HTTP 307` comments/JSDoc in `dinou/index.d.ts` and `dinou/core/redirect.jsx` to accurately match `handler.js`'s `HTTP 302` redirect status.

---

## 2. Complete File Manifest

1. `dinou/core/handler.js` *(modified)*
2. `dinou/core/get-jsx.js` *(modified)*
3. `dinou/core/link.jsx` *(modified)*
4. `dinou/core/navigation.js` *(modified)*
5. `dinou/core/client.jsx` *(modified)*
6. `dinou/core/client-webpack.jsx` *(modified)*
7. `dinou/core/redirect.jsx` *(modified)*
8. `dinou/index.d.ts` *(modified)*

---

## 3. Exact Source Code & Unified Diffs

### 3.1 `dinou/core/handler.js`

```diff
--- a/dinou/core/handler.js
+++ b/dinou/core/handler.js
@@ -161,6 +161,7 @@ function copyCustomContextProperties(source, target) {
         "platformContext",
         "_markDynamic",
         "_dynamicState",
+        "_hasRedirected",
         "_isStaticHtmlRender",
         "_isPprRuntimeResume",
       ].includes(key)
@@ -1294,6 +1295,7 @@ function createRequestContext(simReq, resBridge, platformContext = {}, dynamicSt
           return;
         }
         hasRedirected = true;
+        if (context) context._hasRedirected = true;
         let url = args[0];
         if (args.length === 2) {
           url = args[1];
@@ -1309,6 +1311,7 @@ function createRequestContext(simReq, resBridge, platformContext = {}, dynamicSt
     }
     if (methodName === "redirect") {
       hasRedirected = true;
+      if (context) context._hasRedirected = true;
       let url = args[0];
       let status = 302;
       if (args.length === 2) {
@@ -1356,6 +1359,7 @@ function createRequestContext(simReq, resBridge, platformContext = {}, dynamicSt
     platformContext,
     _markDynamic: markDynamic,
     _dynamicState: dynamicState,
+    _hasRedirected: false,
   };
 
   if (
@@ -2662,6 +2666,9 @@ async function handleRequest(request, platformContext = {}) {
         const manifest = getClientManifest();
         pipeRSC(jsx, bridge, manifest, platformContext);
       } catch (err) {
+        if (bridge.headers.has("x-rsc-redirect") || bridge.headers.has("Location")) {
+          return;
+        }
         console.error(`[Dinou] Error rendering RSC ${segment}:`, err);
         const serializedError = {
           message: isDevelopment
```

---

### 3.2 `dinou/core/get-jsx.js`

```diff
--- a/dinou/core/get-jsx.js
+++ b/dinou/core/get-jsx.js
@@ -171,6 +171,9 @@ async function getJSX(
           const defaultExport = pageFunctionsModule.default?.default ? pageFunctionsModule.default.default : pageFunctionsModule.default;
           const getProps = pageFunctionsModule.getProps || defaultExport?.getProps;
           pageFunctionsProps = await getProps?.(dParams ?? {});
+          if (getContext()?._hasRedirected) {
+            return null;
+          }
           props = { ...props, ...(pageFunctionsProps ?? {}) };
         }
         const notFoundEffectivePpr =
@@ -268,6 +271,9 @@ async function getJSX(
           const getProps =
             pageFunctionsModule.getProps || defaultExport?.getProps;
           pageFunctionsProps = await getProps?.(dynamicParams);
+          if (getContext()?._hasRedirected) {
+            return null;
+          }
           props = { ...props, ...(pageFunctionsProps ?? {}) };
         }
 
@@ -286,6 +292,9 @@ async function getJSX(
     ) {
       jsx = await runInPageSegment(() => asyncRenderJSXToClientJSX(jsx));
       const ctx = getContext();
+      if (ctx?._hasRedirected) {
+        return jsx;
+      }
       if (ctx) {
         ctx._resolvedPageClientJsx = jsx;
       }
@@ -438,8 +447,14 @@ async function getJSX(
         } finally {
           updatedSlots[slotName] = updatedSlotElement;
         }
+        if (getContext()?._hasRedirected) {
+          return null;
+        }
       }
       const layoutProps = await getLayoutProps(layoutPath, dParams);
+      if (getContext()?._hasRedirected) {
+        return null;
+      }
       let props = { params: dParams, ...updatedSlots, ...(layoutProps ?? {}) };
       if (options?.skipLayoutProbe) {
         jsx = markLayoutRootElement(
@@ -454,6 +469,9 @@ async function getJSX(
             layoutEffectivePpr,
           );
           await runInLayoutSegment(() => asyncRenderJSXToClientJSX(testElement));
+          if (getContext()?._hasRedirected) {
+            return null;
+          }
           jsx = markLayoutRootElement(
             React.createElement(Layout, props, jsx),
             layoutEffectivePpr,
@@ -492,6 +510,9 @@ async function getJSX(
             () => asyncRenderJSXToClientJSX(testElement),
             layoutSegmentStore
           );
+          if (getContext()?._hasRedirected) {
+            return null;
+          }
           jsx = replaceLayoutChildrenPlaceholder(resolvedLayout, jsx, placeholder);
           if (layoutOnlyJsx && !layoutRenderFailed) {
             layoutOnlyJsx = replaceLayoutChildrenPlaceholder(resolvedLayout, layoutOnlyJsx, placeholder);
```

---

### 3.3 `dinou/core/link.jsx` (Complete Updated File)

```jsx
"use client";

import { useRouter, usePathname } from "./navigation.js";
import {
  resolveUrl,
  isExternalUrl,
  interpolateRouteParams,
} from "./navigation-utils.js";

export function Link({
  href,
  to,
  from,
  params,
  children,
  prefetch = true,
  fresh = false,
  onClick,
  ...props
}) {
  const targetHref = interpolateRouteParams(href || to || "", params);
  const { push } = useRouter();
  const pathname = usePathname();
  const resolvedHref = resolveUrl(targetHref, pathname, from);
  const isNonSelfTarget = Boolean(props.target && props.target !== "_self");
  const isDownload = props.download !== undefined && props.download !== false;

  const handlePrefetch = () => {
    if (
      !prefetch ||
      !targetHref ||
      fresh ||
      isNonSelfTarget ||
      isDownload ||
      isExternalUrl(targetHref)
    ) {
      return;
    }
    if (window.__DINOU_PREFETCH__) {
      window.__DINOU_PREFETCH__(resolvedHref);
    }
  };

  const handleClick = (e) => {
    if (onClick) {
      onClick(e);
    }

    if (e.defaultPrevented) return;
    if (
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      isNonSelfTarget ||
      isDownload ||
      isExternalUrl(targetHref)
    ) {
      return;
    }

    e.preventDefault();
    if (targetHref) {
      push(resolvedHref || targetHref, { fresh });
    }
  };

  return (
    <a
      {...props}
      href={resolvedHref || undefined}
      onClick={handleClick}
      onMouseEnter={handlePrefetch}
    >
      {children}
    </a>
  );
}

export default Link;
```

---

### 3.4 `dinou/core/navigation.js`

```diff
--- a/dinou/core/navigation.js
+++ b/dinou/core/navigation.js
@@ -15,6 +15,7 @@ const useState =
   React.useState ||
   ((init) => [typeof init === "function" ? init() : init, () => {}]);
 const useEffect = React.useEffect || (() => {});
+const useMemo = React.useMemo || ((fn) => fn());
 const useSyncExternalStore =
   React.useSyncExternalStore || ((_sub, getSnap) => getSnap());
 const emptySubscribe = () => () => {};
@@ -62,53 +63,70 @@ export function useNavigationLoading() {
 export function useRouter() {
   const context = useContext(RouterContext);
 
-  // Guards for SSR (optional, but good practice)
-  if (!context) {
-    // On the server we return empty functions to not break the rendering
+  return useMemo(() => {
+    // Guards for SSR (optional, but good practice)
+    if (!context) {
+      // On the server we return empty functions to not break the rendering
+      return {
+        push: () => {},
+        replace: () => {},
+        back: () => {},
+        forward: () => {},
+        refresh: () => {},
+        refreshSlot: () => Promise.resolve(),
+      };
+    }
+
     return {
-      push: () => { },
-      replace: () => { },
-      back: () => { },
-      forward: () => { },
-      refresh: (options) => { },
-      refreshSlot: (slotId, options) => Promise.resolve(),
+      push: (href, options) => {
+        const { params, from, ...restOptions } = options || {};
+        const interpolated = interpolateRouteParams(href, params);
+        const target =
+          from && typeof window !== "undefined"
+            ? resolveUrl(interpolated, window.location.pathname, from)
+            : interpolated;
+        return context.navigate(target, restOptions);
+      },
+      replace: (href, options) => {
+        const { params, from, ...restOptions } = options || {};
+        const interpolated = interpolateRouteParams(href, params);
+        const target =
+          from && typeof window !== "undefined"
+            ? resolveUrl(interpolated, window.location.pathname, from)
+            : interpolated;
+        return context.navigate(target, { replace: true, ...restOptions });
+      },
+
+      /**
+       * Navigate back in the browser's history.
+       * Equivalent to clicking the browser's Back button.
+       */
+      back: () => context.back?.(),
+
+      /**
+       * Navigate forward in the browser's history.
+       */
+      forward: () => context.forward?.(),
+
+      /**
+       * Refresh the current route.
+       * Makes a new request to the server for the current URL, clearing the cache,
+       * and re-renders the server component without a full browser reload.
+       * Pass `{ layout: true }` to also invalidate and re-render the layout.
+       */
+      refresh: (options) => context.refresh?.(options),
+
+      /**
+       * Refresh a specific DinouCacheSlot without re-rendering the rest of the page.
+       * @param {string} slotId The ID or tag of the slot to refresh.
+       * @param {object} [options] Optional configuration ({ fresh?: boolean }).
+       */
+      refreshSlot: (slotId, options) => refreshSlot(slotId, options),
     };
-  }
-
-  return {
-    push: (href, options) => { const { params, from, ...restOptions } = options || {}; const interpolated = interpolateRouteParams(href, params); const target = from && typeof window !== "undefined" ? resolveUrl(interpolated, window.location.pathname, from) : interpolated; return context.navigate(target, restOptions); },
-    replace: (href, options) => { const { params, from, ...restOptions } = options || {}; const interpolated = interpolateRouteParams(href, params); const target = from && typeof window !== "undefined" ? resolveUrl(interpolated, window.location.pathname, from) : interpolated; return context.navigate(target, { replace: true, ...restOptions }); },
-
-
-    /**
-     * Navigate back in the browser's history.
-     * Equivalent to clicking the browser's Back button.
-     */
-    back: () => context.back(),
-
-    /**
-     * Navigate forward in the browser's history.
-     */
-    forward: () => context.forward(),
-
-    /**
-     * Refresh the current route.
-     * Makes a new request to the server for the current URL, clearing the cache,
-     * and re-renders the server component without a full browser reload.
-     * Pass `{ layout: true }` to also invalidate and re-render the layout.
-     */
-    refresh: (options) => context.refresh(options),
-
-    /**
-     * Refresh a specific DinouCacheSlot without re-rendering the rest of the page.
-     * @param {string} slotId The ID or tag of the slot to refresh.
-     * @param {object} [options] Optional configuration ({ fresh?: boolean }).
-     */
-    refreshSlot: (slotId, options) => refreshSlot(slotId, options),
-  };
+  }, [context]);
 }
@@ -225,7 +243,11 @@ export function useSearchParams() {
   const isStaticHydrating =
     isReactHydrating &&
     typeof window !== "undefined" &&
-    Boolean(window.__DINOU_USE_STATIC__ || window.__DINOU_PPR_RESUME__);
+    Boolean(
+      window.__DINOU_USE_STATIC__ ||
+        window.__DINOU_PPR_RESUME__ ||
+        window.__DINOU_STATIC_EXPORT__
+    );
 
   if (isStaticHydrating) {
     return new URLSearchParams();
```

---

### 3.5 `dinou/core/client.jsx` & `dinou/core/client-webpack.jsx` (Identical Patch to Both Files)

Apply the exact same diff to both `dinou/core/client.jsx` and `dinou/core/client-webpack.jsx`:

```diff
--- a/dinou/core/client.jsx
+++ b/dinou/core/client.jsx
@@ -316,7 +316,7 @@ const executeRscRedirect = (redirectUrl) => {
 };
 
 const getPagePayload = (route, isPrefetch = false, version = 0) => {
-  const url = route.split("::")[0];
+  const url = route.split("::")[0].split("#")[0] || "/";
   if (pageCache.has(url)) {
     return pageCache.get(url);
   }
@@ -752,6 +752,15 @@ function Router() {
     }
     const finalPath = resolveUrl(href, window.location.pathname);
 
+    if (isExternalUrl(finalPath)) {
+      if (options.replace) {
+        window.location.replace(finalPath);
+      } else {
+        window.location.assign(finalPath);
+      }
+      return;
+    }
+
     // 🛡️ NAVIGATE PROTECTION: Hash Detection
     if (isHashChangeOnly(finalPath)) {
       if (options.replace) {
@@ -770,8 +779,10 @@ function Router() {
       return; // CRITICAL STOP
     }
 
+    const routeWithoutHash = finalPath.split("#")[0] || "/";
+
     if (options.fresh) {
-      pageCache.delete(finalPath);
+      pageCache.delete(routeWithoutHash);
     }
 
     // Normal RSC Navigation
@@ -788,7 +799,7 @@ function Router() {
     flushPendingSsrStreams();
     startTransition(() => {
       setIsPopState(false);
-      setRoute(finalPath);
+      setRoute(routeWithoutHash);
       if (options.fresh) {
         setVersion((v) => v + 1);
       }
@@ -831,11 +842,12 @@ function Router() {
     window.__DINOU_PREFETCH__ = (url) => {
       // 🛡️ PREFETCH PROTECTION: If it's a local hash, do nothing
       if (isHashChangeOnly(url)) return;
-      const lKey = getLayoutKey(url);
+      const cleanUrl = String(url || "/").split("#")[0] || "/";
+      const lKey = getLayoutKey(cleanUrl);
       if (lKey && !layoutCache.has(lKey)) {
         getLayoutPayload(lKey);
       }
-      getPagePayload(url, true);
+      getPagePayload(cleanUrl, true);
     };
 
     window.__DINOU_ROUTER_NAVIGATE__ = navigate;
@@ -867,7 +879,9 @@ function Router() {
       const anchor = e.target.closest("a");
       if (
         !anchor ||
-        anchor.target ||
+        (anchor.target && anchor.target !== "_self") ||
+        anchor.hasAttribute("download") ||
+        e.button !== 0 ||
         e.metaKey ||
         e.ctrlKey ||
         e.shiftKey ||
```

*(Apply the exact same 4 hunks to `dinou/core/client-webpack.jsx`.)*

---

### 3.6 `dinou/core/redirect.jsx` & `dinou/index.d.ts`

```diff
--- a/dinou/core/redirect.jsx
+++ b/dinou/core/redirect.jsx
@@ -21,7 +21,7 @@ export function redirect(destination) {
     } catch (e) { }
 
     // 2. If we are on the server and headers have NOT been sent yet...
-    // We can do a real HTTP redirect (Status 307 or x-rsc-redirect).
+    // We can do a real HTTP redirect (Status 302 or x-rsc-redirect).
     // This is better for SEO and speed in Hard Navigation.
     if (ctx && ctx.res && typeof ctx.res.redirect === "function") {
       ctx.res.redirect(destination);
```

```diff
--- a/dinou/index.d.ts
+++ b/dinou/index.d.ts
@@ -445,7 +445,7 @@ export declare function ClientRedirect(props: ClientRedirectProps): ReactNode;
 /**
  * Universal redirect function for Server Components and Server Functions.
  * * It handles the logic intelligently based on the context:
- * 1. **Server-Side (Hard Navigation):** If headers haven't been sent, it performs a real HTTP 307 redirect (better for SEO and performance).
+ * 1. **Server-Side (Hard Navigation):** If headers haven't been sent, it performs a real HTTP 302 redirect (better for SEO and performance).
  * 2. **Client-Side / Streaming (Soft Navigation):** If the response stream has started or we are on the client, it returns a component that triggers a SPA navigation.
```

---

## 4. `CHANGELOG.md` Entry (`9.4.0`)

```markdown
### Fixed
- **Immediate `getProps()` Redirect Short-Circuit (`page_functions.ts` & `layout_functions.ts`)**: Exposes `context._hasRedirected` in `dinou/core/handler.js` and short-circuits `dinou/core/get-jsx.js` immediately after `getProps()`, page rendering, `@slot` rendering, `getLayoutProps()`, and layout rendering whenever a redirect occurs — preventing `<Page />` / `<Layout />` components from executing with undefined props or turning SPA `x-rsc-redirect` responses into 500 errors.
- **External URL Handling in `router.push()`, `router.replace()`, and `<ClientRedirect>`**: `navigate()` in both `dinou/core/client.jsx` and `dinou/core/client-webpack.jsx` now detects external URLs via `isExternalUrl()` and delegates to `window.location.assign()` / `window.location.replace()`, preventing cross-origin `History.pushState` `SecurityError` crashes.
- **`<Link>` Native Browser Yielding (`target="_blank"`, `download`, Non-Primary Clicks)**: `dinou/core/link.jsx` and the global anchor click handlers in `client.jsx` / `client-webpack.jsx` now skip hover prefetching and SPA interception when `target` is set to a non-`_self` value, when `download` is present, or when `e.button !== 0`.
- **Hash Fragment Normalization for Client RSC Cache & `{ fresh: true }`**: `navigate()`, `getPagePayload()`, and `__DINOU_PREFETCH__` now strip `#hash` fragments from `pageCache` keys, `route` state, and RSC fetch URLs while preserving `#hash` in browser history — ensuring `?____v____=` and `?____build_id____=` are never placed inside the URL fragment and avoiding duplicate cache entries.
- **Referentially Stable `useRouter()` & Static-Export `useSearchParams()` Hydration**: Memoizes the object returned by `useRouter()` on `RouterContext` so local state updates do not unnecessarily re-run `useEffect(..., [router])` hooks, includes `window.__DINOU_STATIC_EXPORT__` in `useSearchParams()`'s static hydration guard, and corrects the `redirect()` JSDoc in `dinou/index.d.ts` from HTTP 307 to HTTP 302.
```

---

## 5. Complete, Copy-Pasteable Automated Test Suites

### 5.1 Unit & Multi-Bundler Integration Test Suite (`tests/unit/api-reference-navigation.test.mjs`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const DINOU_ROOT = fs.existsSync(path.resolve(REPO_ROOT, "dinou", "cli.js"))
  ? path.resolve(REPO_ROOT, "dinou")
  : path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou");

const esbuild = await import(
  pathToFileURL(path.resolve(REPO_ROOT, "node_modules", "esbuild", "lib", "main.js")).href
);

function createFixtureDir(prefix) {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

test("1. All modified JSX files parse cleanly with esbuild", async () => {
  const jsxFiles = [
    "core/link.jsx",
    "core/client.jsx",
    "core/client-webpack.jsx",
    "core/redirect.jsx",
  ];
  for (const rel of jsxFiles) {
    const abs = path.join(DINOU_ROOT, rel);
    const code = fs.readFileSync(abs, "utf8");
    const result = await esbuild.transform(code, {
      loader: "jsx",
      jsx: "automatic",
      format: "esm",
      sourcefile: abs,
    });
    assert.ok(result.code.length > 0, `Expected transformed output for ${rel}`);
  }
});

test("2. <Link> respects target='_blank', target='_self', download, and e.button !== 0", async () => {
  const linkAbs = path.join(DINOU_ROOT, "core", "link.jsx");
  const navUtilsAbs = path.join(DINOU_ROOT, "core", "navigation-utils.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-link-unit-"));
  try {
    const bundled = await esbuild.build({
      entryPoints: [linkAbs],
      bundle: true,
      format: "esm",
      platform: "neutral",
      jsx: "automatic",
      write: false,
      plugins: [
        {
          name: "mock-deps",
          setup(build) {
            build.onResolve({ filter: /^\.\/navigation\.js$/ }, () => ({
              path: "mock-navigation",
              namespace: "mock",
            }));
            build.onResolve({ filter: /^\.\/navigation-utils\.js$/ }, () => ({
              path: navUtilsAbs,
            }));
            build.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, (args) => ({
              path: args.path,
              namespace: "mock-react",
            }));
            build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
              contents: `
                export const pushCalls = [];
                export function useRouter() {
                  return { push: (href, opts) => pushCalls.push({ href, opts }) };
                }
                export function usePathname() {
                  return "/dashboard";
                }
              `,
              loader: "js",
            }));
            build.onLoad({ filter: /.*/, namespace: "mock-react" }, () => ({
              contents: `
                export function jsx(type, props) { return { type, props }; }
                export const jsxs = jsx;
                export default { createElement: (type, props) => ({ type, props }) };
              `,
              loader: "js",
            }));
          },
        },
      ],
    });

    const outPath = path.join(tmpDir, "link-bundle.mjs");
    fs.writeFileSync(outPath, bundled.outputFiles[0].text, "utf8");
    const { Link } = await import(pathToFileURL(outPath).href);

    const prefetchCalls = [];
    const prevWindow = globalThis.window;
    globalThis.window = {
      location: { origin: "http://localhost:3000", pathname: "/dashboard" },
      __DINOU_PREFETCH__: (href) => prefetchCalls.push(href),
    };

    try {
      const makeEvent = (overrides = {}) => ({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...overrides,
      });

      const blankEl = Link({ href: "/report", target: "_blank", children: "Report" });
      assert.equal(blankEl.props.href, "/report");
      assert.equal(blankEl.props.target, "_blank");
      blankEl.props.onMouseEnter();
      assert.equal(prefetchCalls.length, 0, "target=_blank should not prefetch");
      const blankEv = makeEvent();
      blankEl.props.onClick(blankEv);
      assert.equal(blankEv.defaultPrevented, false, "target=_blank must not preventDefault");

      const dlEl = Link({ href: "/export.csv", download: true, children: "Export" });
      dlEl.props.onMouseEnter();
      assert.equal(prefetchCalls.length, 0, "download link should not prefetch");
      const dlEv = makeEvent();
      dlEl.props.onClick(dlEv);
      assert.equal(dlEv.defaultPrevented, false, "download link must not preventDefault");

      const midEl = Link({ href: "/settings", children: "Settings" });
      const midEv = makeEvent({ button: 1 });
      midEl.props.onClick(midEv);
      assert.equal(midEv.defaultPrevented, false, "middle click must not preventDefault");

      const selfEl = Link({ href: "/profile", target: "_self", children: "Profile" });
      selfEl.props.onMouseEnter();
      assert.deepEqual(prefetchCalls, ["/profile"]);
      const selfEv = makeEvent();
      selfEl.props.onClick(selfEv);
      assert.equal(selfEv.defaultPrevented, true, "target=_self should SPA-navigate");
    } finally {
      if (prevWindow === undefined) delete globalThis.window;
      else globalThis.window = prevWindow;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("3. useRouter() memoizes object reference & useSearchParams() guards __DINOU_STATIC_EXPORT__", async () => {
  const navAbs = path.join(DINOU_ROOT, "core", "navigation.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-nav-unit-"));
  try {
    const wrapperEntry = path.join(tmpDir, "entry.js");
    fs.writeFileSync(
      wrapperEntry,
      `import React, { __setMockState } from "react";
       export { useRouter, useSearchParams } from ${JSON.stringify(navAbs)};
       export { __setMockState };`,
      "utf8"
    );

    const bundled = await esbuild.build({
      entryPoints: [wrapperEntry],
      bundle: true,
      format: "esm",
      platform: "neutral",
      write: false,
      plugins: [
        {
          name: "mock-react-hooks",
          setup(build) {
            build.onResolve({ filter: /^react$/ }, () => ({
              path: "mock-react",
              namespace: "mock",
            }));
            build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
              contents: `
                let memoCache = null;
                let memoDeps = null;
                let currentCtxValue = null;
                let hydratingFlag = false;
                export function __setMockState({ ctxValue, hydrating, resetMemo }) {
                  if (ctxValue !== undefined) currentCtxValue = ctxValue;
                  if (hydrating !== undefined) hydratingFlag = hydrating;
                  if (resetMemo) { memoCache = null; memoDeps = null; }
                }
                export default {
                  createContext: (def) => ({ _currentValue: def }),
                  useContext: () => currentCtxValue,
                  useState: (init) => [typeof init === "function" ? init() : init, () => {}],
                  useEffect: () => {},
                  useMemo: (fn, deps) => {
                    const same = memoDeps && deps && memoDeps.length === deps.length && deps.every((d, i) => Object.is(d, memoDeps[i]));
                    if (same) return memoCache;
                    memoDeps = deps;
                    memoCache = fn();
                    return memoCache;
                  },
                  useSyncExternalStore: (_sub, getSnap, getServerSnap) => hydratingFlag ? getServerSnap() : getSnap(),
                };
              `,
              loader: "js",
            }));
          },
        },
      ],
    });

    const outPath = path.join(tmpDir, "nav-bundle.mjs");
    fs.writeFileSync(outPath, bundled.outputFiles[0].text, "utf8");
    const mod = await import(pathToFileURL(outPath).href);

    const ctx1 = {
      url: "/a",
      navigate: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      isPending: false,
    };
    mod.__setMockState({ ctxValue: ctx1, resetMemo: true });
    const r1 = mod.useRouter();
    const r2 = mod.useRouter();
    assert.strictEqual(
      r1,
      r2,
      "useRouter() must return stable reference across renders with identical RouterContext"
    );

    const ctx2 = { ...ctx1, url: "/b" };
    mod.__setMockState({ ctxValue: ctx2 });
    const r3 = mod.useRouter();
    assert.notStrictEqual(
      r1,
      r3,
      "useRouter() must update reference when RouterContext changes"
    );

    const prevWindow = globalThis.window;
    globalThis.window = {
      __DINOU_STATIC_EXPORT__: true,
      __DINOU_USE_STATIC__: false,
      __DINOU_PPR_RESUME__: false,
      location: { search: "?q=dinou&page=2" },
    };
    try {
      mod.__setMockState({ ctxValue: { url: "/search?q=dinou&page=2" }, hydrating: true });
      const duringHydration = mod.useSearchParams();
      assert.equal(
        duringHydration.toString(),
        "",
        "During static-export hydration, useSearchParams() must return empty URLSearchParams"
      );

      mod.__setMockState({ hydrating: false });
      const afterHydration = mod.useSearchParams();
      assert.equal(afterHydration.get("q"), "dinou");
      assert.equal(afterHydration.get("page"), "2");
    } finally {
      if (prevWindow === undefined) delete globalThis.window;
      else globalThis.window = prevWindow;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("4. client.jsx & client-webpack.jsx parity: external URL guard, hash stripping, target/download/button", () => {
  for (const rel of ["core/client.jsx", "core/client-webpack.jsx"]) {
    const src = fs.readFileSync(path.join(DINOU_ROOT, rel), "utf8");
    assert.match(
      src,
      /const url = route\.split\("::"\)\[0\]\.split\("#"\)\[0\] \|\| "\/";/,
      `${rel}: getPagePayload must strip #hash`
    );
    assert.match(
      src,
      /if \(isExternalUrl\(finalPath\)\) \{[\s\S]*?window\.location\.replace\(finalPath\)[\s\S]*?window\.location\.assign\(finalPath\)/,
      `${rel}: navigate must handle external URLs via window.location`
    );
    assert.match(
      src,
      /const routeWithoutHash = finalPath\.split\("#"\)\[0\] \|\| "\/";[\s\S]*?pageCache\.delete\(routeWithoutHash\);/,
      `${rel}: navigate must delete hashless cache key on fresh`
    );
    assert.match(
      src,
      /setRoute\(routeWithoutHash\);/,
      `${rel}: navigate must store hashless route state`
    );
    assert.match(
      src,
      /\(anchor\.target && anchor\.target !== "_self"\)/,
      `${rel}: global click listener must allow _self and skip _blank`
    );
    assert.match(
      src,
      /anchor\.hasAttribute\("download"\)/,
      `${rel}: global click listener must skip download links`
    );
    assert.match(
      src,
      /e\.button !== 0/,
      `${rel}: global click listener must skip non-primary clicks`
    );
  }
  const dts = fs.readFileSync(path.join(DINOU_ROOT, "index.d.ts"), "utf8");
  assert.match(dts, /HTTP 302 redirect/, "index.d.ts redirect JSDoc must specify HTTP 302");
  assert.doesNotMatch(dts, /HTTP 307 redirect/, "index.d.ts redirect JSDoc must not say HTTP 307");
});

test("5. Integration across Esbuild, Rollup & Webpack: getProps() redirect short-circuits Page, Layout & @slot cleanly (SSR + RSC)", async () => {
  const bundlers = ["esbuild", "rollup", "webpack"];
  for (const bundler of bundlers) {
    const tmpApp = createFixtureDir(`tmp-redirect-${bundler}-`);
    try {
      fs.writeFileSync(
        path.join(tmpApp, "package.json"),
        JSON.stringify(
          {
            name: `redirect-test-${bundler}`,
            type: "module",
            private: true,
          },
          null,
          2
        )
      );

      const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
      fs.mkdirSync(dinouShimDir, { recursive: true });
      const dinouIndexPath = path.join(DINOU_ROOT, "index.js").replace(/\\/g, "/");
      const dinouServerPath = path.join(DINOU_ROOT, "server.js").replace(/\\/g, "/");
      const dinouConfigPath = path.join(DINOU_ROOT, "core", "config.js").replace(/\\/g, "/");
      fs.writeFileSync(
        path.join(dinouShimDir, "package.json"),
        JSON.stringify(
          {
            name: "dinou",
            version: "9.4.0",
            type: "module",
            exports: {
              ".": "./index.js",
              "./server": "./server.js",
              "./config": "./config.js",
            },
          },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(dinouShimDir, "index.js"),
        `export * from ${JSON.stringify(dinouIndexPath)};\nexport { default } from ${JSON.stringify(dinouIndexPath)};\n`
      );
      fs.writeFileSync(
        path.join(dinouShimDir, "server.js"),
        `export * from ${JSON.stringify(dinouServerPath)};\n`
      );
      fs.writeFileSync(
        path.join(dinouShimDir, "config.js"),
        `export * from ${JSON.stringify(dinouConfigPath)};\nexport { default } from ${JSON.stringify(dinouConfigPath)};\n`
      );

      fs.mkdirSync(path.join(tmpApp, "src", "login"), { recursive: true });
      fs.mkdirSync(path.join(tmpApp, "src", "guarded", "@sidebar"), { recursive: true });
      fs.mkdirSync(path.join(tmpApp, "src", "layout-guarded"), { recursive: true });

      fs.writeFileSync(
        path.join(tmpApp, "src", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Redirect Test</title></head>
      <body>{children}</body>
    </html>
  );
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "page.tsx"),
        `export default function Home() { return <main>Home</main>; }\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "login", "page.tsx"),
        `export default function Login() { return <main>Login Screen</main>; }\n`
      );

      fs.writeFileSync(
        path.join(tmpApp, "src", "guarded", "page_functions.ts"),
        `import { redirect, getContext } from "dinou";
export const revalidate = 0;
export async function getProps() {
  const { req } = getContext();
  if (req.cookies.session !== "valid") {
    return redirect("/login?from=/guarded");
  }
  return { profile: { name: "Alice" } };
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "guarded", "page.tsx"),
        `export default function GuardedPage({ profile }: { profile: { name: string } }) {
  (globalThis as any).__GUARDED_PAGE_RENDER_COUNT__ = ((globalThis as any).__GUARDED_PAGE_RENDER_COUNT__ || 0) + 1;
  return <main id="guarded-ok">Hello {profile.name}</main>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "guarded", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function GuardedLayout({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  (globalThis as any).__GUARDED_LAYOUT_RENDER_COUNT__ = ((globalThis as any).__GUARDED_LAYOUT_RENDER_COUNT__ || 0) + 1;
  return <div id="guarded-layout">{sidebar}{children}</div>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "guarded", "@sidebar", "page.tsx"),
        `export default function SidebarSlot() {
  (globalThis as any).__GUARDED_SLOT_RENDER_COUNT__ = ((globalThis as any).__GUARDED_SLOT_RENDER_COUNT__ || 0) + 1;
  return <aside>Sidebar</aside>;
}
`
      );

      fs.writeFileSync(
        path.join(tmpApp, "src", "layout-guarded", "layout_functions.ts"),
        `import { redirect, getContext } from "dinou";
export const revalidate = 0;
export async function getProps() {
  const { req } = getContext();
  if (req.cookies.tenant !== "acme") {
    return redirect("/login?from=layout");
  }
  return { tenant: { title: "Acme Corp" } };
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "layout-guarded", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function TenantLayout({ children, tenant }: { children: ReactNode; tenant: { title: string } }) {
  return <section data-tenant={tenant.title}>{children}</section>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "layout-guarded", "page.tsx"),
        `export default function TenantPage() { return <main>Tenant Dashboard</main>; }\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "layout-guarded", "page_functions.ts"),
        `export const revalidate = 0;\n`
      );

      const buildRes = spawnSync(
        process.execPath,
        [path.join(DINOU_ROOT, "cli.js"), `build:node:${bundler}`],
        { cwd: tmpApp, encoding: "utf8" }
      );
      assert.equal(
        buildRes.status,
        0,
        `Build failed for ${bundler}:\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
      );

      const prevCwd = process.cwd();
      process.chdir(tmpApp);
      try {
        const rscMod = await import(
          pathToFileURL(path.join(tmpApp, ".dinou", "node", "rsc-engine.mjs")).href +
            `?b=${bundler}&t=${Date.now()}`
        );
        const ssrMod = await import(
          pathToFileURL(path.join(tmpApp, ".dinou", "node", "ssr-engine.mjs")).href +
            `?b=${bundler}&t=${Date.now()}`
        );

        globalThis.__GUARDED_PAGE_RENDER_COUNT__ = 0;
        globalThis.__GUARDED_LAYOUT_RENDER_COUNT__ = 0;
        globalThis.__GUARDED_SLOT_RENDER_COUNT__ = 0;

        const ssrRedirectRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/guarded"),
          { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
        );
        assert.equal(ssrRedirectRes.status, 302, `[${bundler}] SSR /guarded should return 302`);
        assert.equal(ssrRedirectRes.headers.get("location"), "/login?from=/guarded");
        assert.equal(
          globalThis.__GUARDED_PAGE_RENDER_COUNT__,
          0,
          `[${bundler}] Page must not execute after getProps redirect`
        );
        assert.equal(
          globalThis.__GUARDED_LAYOUT_RENDER_COUNT__,
          0,
          `[${bundler}] Layout must not execute after getProps redirect`
        );
        assert.equal(
          globalThis.__GUARDED_SLOT_RENDER_COUNT__,
          0,
          `[${bundler}] @slot must not execute after getProps redirect`
        );

        const rscRedirectRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/____rsc_page____/guarded"),
          { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
        );
        assert.equal(rscRedirectRes.status, 200, `[${bundler}] RSC /guarded redirect should return 200`);
        assert.equal(rscRedirectRes.headers.get("x-rsc-redirect"), "/login?from=/guarded");
        assert.equal(
          globalThis.__GUARDED_PAGE_RENDER_COUNT__,
          0,
          `[${bundler}] Page must not execute on RSC redirect`
        );

        const ssrOkRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/guarded", {
            headers: { cookie: "session=valid" },
          }),
          { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
        );
        assert.equal(ssrOkRes.status, 200, `[${bundler}] Authenticated /guarded should return 200`);
        const okHtml = await ssrOkRes.text();
        assert.match(okHtml, /Hello.*Alice/);

        const layoutRedirectRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/layout-guarded"),
          { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
        );
        assert.equal(
          layoutRedirectRes.status,
          302,
          `[${bundler}] SSR /layout-guarded should return 302`
        );
        assert.equal(layoutRedirectRes.headers.get("location"), "/login?from=layout");

        const rscLayoutRedirectRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/____rsc_layout____/layout-guarded"),
          { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
        );
        assert.equal(
          rscLayoutRedirectRes.status,
          200,
          `[${bundler}] RSC layout redirect should return 200`
        );
        assert.equal(rscLayoutRedirectRes.headers.get("x-rsc-redirect"), "/login?from=layout");
      } finally {
        process.chdir(prevCwd);
      }
    } finally {
      fs.rmSync(tmpApp, { recursive: true, force: true });
    }
  }
});
```

---

### 5.2 Playwright E2E Test Suite (`tests/e2e/api-reference-navigation.spec.ts`)

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const REPO_ROOT = process.cwd();
const DINOU_ROOT = fs.existsSync(path.resolve(REPO_ROOT, "dinou", "cli.js"))
  ? path.resolve(REPO_ROOT, "dinou")
  : path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou");

function createFixtureDir(prefix: string): string {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not allocate free port")));
      }
    });
    srv.on("error", reject);
  });
}

async function waitForHttpReady(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function setupE2EFixture(externalPort: number): string {
  const fixtureRoot = createFixtureDir("tmp-api-ref-nav-e2e-");

  fs.writeFileSync(
    path.join(fixtureRoot, "package.json"),
    JSON.stringify(
      {
        name: "api-reference-nav-e2e",
        type: "module",
        private: true,
      },
      null,
      2
    )
  );

  const dinouShimDir = path.join(fixtureRoot, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouIndexPath = path.join(DINOU_ROOT, "index.js").replace(/\\/g, "/");
  const dinouServerPath = path.join(DINOU_ROOT, "server.js").replace(/\\/g, "/");
  const dinouConfigPath = path.join(DINOU_ROOT, "core", "config.js").replace(/\\/g, "/");

  fs.writeFileSync(
    path.join(dinouShimDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "9.4.0",
        type: "module",
        exports: {
          ".": "./index.js",
          "./server": "./server.js",
          "./config": "./config.js",
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "index.js"),
    `export * from ${JSON.stringify(dinouIndexPath)};\nexport { default } from ${JSON.stringify(dinouIndexPath)};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(dinouServerPath)};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(dinouConfigPath)};\nexport { default } from ${JSON.stringify(dinouConfigPath)};\n`
  );

  fs.mkdirSync(path.join(fixtureRoot, "public"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "public", "report.txt"), "DINOU_REPORT_DATA", "utf8");

  fs.mkdirSync(path.join(fixtureRoot, "src", "guarded"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "src", "login"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "src", "counter-page"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "src", "report"), { recursive: true });

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Dinou Nav E2E</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "nav-controls.tsx"),
    `"use client";
import { useEffect, useState } from "react";
import { Link, useRouter } from "dinou";

export function NavControls() {
  const router = useRouter();
  const [localTick, setLocalTick] = useState(0);
  const [effectRuns, setEffectRuns] = useState(0);

  useEffect(() => {
    setEffectRuns((c) => c + 1);
  }, [router]);

  return (
    <div id="controls">
      <button id="bump-local" type="button" onClick={() => setLocalTick((n) => n + 1)}>
        Local:{localTick}
      </button>
      <span id="effect-runs">EffectRuns:{effectRuns}</span>

      <Link id="link-guarded" href="/guarded">
        Go Guarded
      </Link>
      <Link id="link-blank" href="/report" target="_blank" rel="noopener noreferrer">
        Report New Tab
      </Link>
      <Link id="link-download" href="/report.txt" download="report.txt">
        Download Report
      </Link>
      <Link id="link-hash-fresh" href="/counter-page#target-sec" fresh>
        Fresh Hash
      </Link>
      <button
        id="btn-external-push"
        type="button"
        onClick={() => router.push("http://127.0.0.1:${externalPort}/external-landing")}
      >
        External Push
      </button>
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "page.tsx"),
    `import { NavControls } from "./nav-controls";
export default function HomePage() {
  return (
    <main>
      <h1 id="home-title">Home</h1>
      <NavControls />
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "report", "page.tsx"),
    `export default function ReportPage() {
  return <main id="report-page">Report Opened</main>;
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "login", "page.tsx"),
    `export default function LoginPage() {
  return <main id="login-page">Please Sign In</main>;
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "guarded", "page_functions.ts"),
    `import { redirect, getContext } from "dinou";
export const revalidate = 0;
export async function getProps() {
  const { req } = getContext();
  if (req.cookies.auth !== "yes") {
    return redirect("/login");
  }
  return { user: { name: "Bob" } };
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "guarded", "page.tsx"),
    `export default function GuardedPage({ user }: { user: { name: string } }) {
  return <main id="guarded-page">Secret {user.name}</main>;
}
`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "counter-page", "page_functions.ts"),
    `export const revalidate = 0;\n`
  );

  fs.writeFileSync(
    path.join(fixtureRoot, "src", "counter-page", "page.tsx"),
    `import { Link } from "dinou";
let hits = 0;
export default function CounterPage() {
  hits += 1;
  return (
    <main>
      <div id="hit-count">Hits:{hits}</div>
      <Link id="back-home" href="/">Home</Link>
      <div style={{ height: "1200px" }} />
      <section id="target-sec">Target Hash Section</section>
    </main>
  );
}
`
  );

  return fixtureRoot;
}

test.describe("API Reference Batch 1: Navigation, <Link>, redirect(), useRouter()", () => {
  let fixtureRoot = "";
  let serverProc: ChildProcess | null = null;
  let externalServer: http.Server | null = null;

  test.afterEach(async () => {
    if (serverProc) {
      serverProc.kill("SIGTERM");
      serverProc = null;
    }
    if (externalServer) {
      await new Promise<void>((resolve) => externalServer!.close(() => resolve()));
      externalServer = null;
    }
    if (fixtureRoot && fs.existsSync(fixtureRoot)) {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
      fixtureRoot = "";
    }
  });

  test("verifies getProps redirect (SSR + SPA), <Link target=_blank & download>, hash+fresh, useRouter stability & external push", async ({
    page,
    context,
  }) => {
    const externalPort = await getFreePort();
    externalServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<html><body><h1 id='external-ok'>External Destination</h1></body></html>");
    });
    await new Promise<void>((resolve) => externalServer!.listen(externalPort, "127.0.0.1", resolve));

    fixtureRoot = setupE2EFixture(externalPort);

    const buildRun = spawnSync(
      process.execPath,
      [path.join(DINOU_ROOT, "cli.js"), "build"],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(buildRun.status, `${buildRun.stdout}\n${buildRun.stderr}`).toBe(0);

    const port = await getFreePort();
    serverProc = spawn(
      process.execPath,
      [path.join(DINOU_ROOT, "cli.js"), "start"],
      {
        cwd: fixtureRoot,
        env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
        stdio: "ignore",
      }
    );

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHttpReady(baseUrl);

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // 1. Hard SSR redirect from getProps() without crashing GuardedPage
    const directRes = await page.goto(`${baseUrl}/guarded`);
    expect(directRes?.status()).toBe(200);
    await expect(page).toHaveURL(`${baseUrl}/login`);
    await expect(page.locator("#login-page")).toHaveText("Please Sign In");

    // 2. Navigate to Home and verify useRouter() stability across local state changes
    await page.goto(baseUrl);
    await expect(page.locator("#home-title")).toHaveText("Home");
    await expect(page.locator("#effect-runs")).toHaveText("EffectRuns:1");
    await page.locator("#bump-local").click();
    await page.locator("#bump-local").click();
    await expect(page.locator("#bump-local")).toHaveText("Local:2");
    await expect(page.locator("#effect-runs")).toHaveText("EffectRuns:1");

    // 3. <Link target="_blank"> opens a new tab instead of hijacking current tab
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.locator("#link-blank").click(),
    ]);
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(`${baseUrl}/report`);
    await expect(popup.locator("#report-page")).toHaveText("Report Opened");
    await expect(page).toHaveURL(`${baseUrl}/`);
    await popup.close();

    // 4. <Link download> triggers browser file download instead of SPA navigation
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#link-download").click(),
    ]);
    expect(download.suggestedFilename()).toBe("report.txt");
    await expect(page).toHaveURL(`${baseUrl}/`);

    // 5. Hash + fresh navigation sends ?____v____ in query string (not after #hash) and busts cache
    const rscRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/____rsc_page____/counter-page")) {
        rscRequests.push(req.url());
      }
    });
    await page.locator("#link-hash-fresh").click();
    await expect(page).toHaveURL(`${baseUrl}/counter-page#target-sec`);
    const firstHits = await page.locator("#hit-count").textContent();
    expect(firstHits).toBe("Hits:1");

    await page.locator("#back-home").click();
    await expect(page).toHaveURL(`${baseUrl}/`);

    await page.locator("#link-hash-fresh").click();
    await expect(page).toHaveURL(`${baseUrl}/counter-page#target-sec`);
    await expect(page.locator("#hit-count")).toHaveText("Hits:2");
    expect(rscRequests.some((u) => u.includes("____v____=") && !u.includes("#target-sec"))).toBe(
      true
    );

    // 6. SPA navigation to /guarded redirects cleanly via x-rsc-redirect without 500 error
    await page.locator("#back-home").click();
    await expect(page).toHaveURL(`${baseUrl}/`);
    await page.locator("#link-guarded").click();
    await expect(page).toHaveURL(`${baseUrl}/login`);
    await expect(page.locator("#login-page")).toHaveText("Please Sign In");

    // 7. router.push("http://...") navigates externally without SecurityError
    await page.goto(baseUrl);
    await page.locator("#btn-external-push").click();
    await expect(page).toHaveURL(`http://127.0.0.1:${externalPort}/external-landing`);
    await expect(page.locator("#external-ok")).toHaveText("External Destination");

    expect(pageErrors).toEqual([]);
  });
});
```
