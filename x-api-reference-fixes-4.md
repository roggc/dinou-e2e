# Upstream Handoff Specification: API Reference Batch 4 — Authoritative Cached RSC `validateParams` Veto, Root-to-Child Perimeter Short-Circuit, `allowISG` Parameter Normalization & Dynamic Layout `getStaticPaths` Parity (`v9.4.0`)

## 1. Executive Summary & Root-Cause Analysis

During the deep framework audit of `/docs/api-reference` **Batch 4** (Section 7: Route Lifecycles & Config — `getProps()`, `revalidate`, `ppr`, `getCacheTags`, `getStaticPaths`, `allowISG`, `validateParams()`), we uncovered and fixed **three high-impact perimeter security and static-generation bugs** across `dinou/core/handler.js`, `dinou/core/layout-functions.js`, and `dinou/core/build-static-pages.js`:

1. **Cached SPA RSC Requests (`/____rsc_page____/*`, `/____rsc_layout____/*`) Bypassed `validateParams()` & `allowISG: false`, and Layouts Evaluated Child-to-Root After Page Validation (`dinou/core/handler.js`)**:
   - **Root Cause**:
     - On direct HTML requests (`GET /*`), `handler.js` checked `!isPathBlocked` before serving cached HTML, enforcing `validateParams` returning `false` as an authoritative veto even for previously cached pages. However, on internal SPA RSC endpoints (`/____rsc_page____/*`, `/____rsc_layout____/*`, `/____rsc_payload____/*`), `canServeCachedRsc` (lines 2220–2455) did **not** check `isPathBlocked`, and `isLayoutSegmentBlocked(...)` wasn't even executed until lines 2457–2537 — **after** cached `page.rsc` / `layout.rsc` had already been returned with `200 OK`! Consequently, deactivating a previously cached tenant or item returned `404` on direct reload but leaked cached content with `200 OK` on `<Link>` SPA navigation.
     - Additionally, `getActiveLayoutChain()` returns layouts ordered **innermost-to-outermost** (`leaf -> root`), and both the HTML and RSC handlers iterated `for (const entry of activeLayoutsForRoute)` (child-to-root) **after** calling `resolvePageFunctionsConfig()` — allowing child `page_functions.ts` (`validateParams` and `getCacheTags`) and child layouts to run even when a parent layout's `validateParams` returned `false`.
   - **Fix**:
     - In Section 6 (RSC endpoints): evaluate active layout perimeter guards strictly **root-to-child** (`activeChain.length - 1` down to `0`) via `isLayoutSegmentBlocked(...)` first, then (only if not blocked and `!isLayoutReq`) evaluate `resolvePageFunctionsConfig(...)`, and immediately return `new Response("Not Found", { status: 404 })` **before** `canServeCachedRsc` ever reads or serves cached `page.rsc` / `layout.rsc`.
     - In Section 7 (HTML endpoint): evaluate `activeLayoutsForRoute` strictly **root-to-child** first; if any ancestor layout blocks via `validateParams` or `allowISG: false`, break immediately and skip child layouts and `resolvePageFunctionsConfig(...)`.

2. **`allowISG: false` Rejected Numeric (`[{ id: 1 }]`) and Catch-All Array (`[{ slug: ["a", "b"] }]`) Parameter Objects Returned by `getStaticPaths` (`dinou/core/handler.js`, `dinou/core/layout-functions.js`)**:
   - **Root Cause**: `StaticPathItem` and `ToStaticPathParams` explicitly allow `number` and `string[]` values inside parameter objects returned by `getStaticPaths` (e.g. `[{ id: 1 }]`, `[{ slug: ["docs", "intro"] }]`). However, when building `staticPathsSet` in `resolvePageFunctionsConfig` (`handler.js:612`) and `resolveLayoutFunctionsConfig` (`layout-functions.js:131`), object entries were serialized with raw types (`JSON.stringify([["id", 1]])` → `'[["id",1]]'`, `JSON.stringify([["slug", ["docs", "intro"]]])` → `'[["slug",["docs","intro"]]]'`), while runtime matching converted every value with `Array.isArray(v) ? v.join(",") : String(v)` (`'[["id","1"]]'`, `'[["slug","docs,intro"]]'`). This guaranteed a mismatch under `allowISG: false` in `dinou dev`, cold storage, and Cloudflare Workers!
   - **Fix**: Normalize all parameter values symmetrically (`Array.isArray(v) ? v.join(",") : v === undefined || v === null ? "" : String(v)`) both when populating `staticPathsSet` (for objects, arrays, numbers, and `undefined`) and when matching runtime `dynamicParams` / `lParams` in `handler.js` and `layout-functions.js`.

3. **Build-Time SSG (`buildStaticPages`) Ignored `layout_functions.ts` `getStaticPaths` on Optional (`[[param]]`) and Catch-All (`[...slug]`, `[[...slug]]`) Dynamic Segments (`dinou/core/build-static-pages.js`)**:
   - **Root Cause**: `collectPages()` in `build-static-pages.js` checked `getLayoutFunctionsPath(dynamicPath)` and `hasLocalLayout` only in the required single-segment `[param]` branch (lines 541–568), omitting it from the `[[...slug]]`, `[...slug]`, and `[[param]]` branches. A dynamic layout in `src/opt/[[locale]]/layout.tsx` + `layout_functions.ts` (`getStaticPaths = [undefined, "en", "es"]`) was never expanded during `dinou build`.
   - **Fix**: Add the exact same `getLayoutFunctionsPath(dynamicPath)` + `hasLocalLayout` fallback check to the `[[...slug]]`, `[...slug]`, and `[[param]]` branches of `collectPages()`.

---

## 2. Complete File Manifest

1. `dinou/core/handler.js` *(modified)*
2. `dinou/core/layout-functions.js` *(modified)*
3. `dinou/core/build-static-pages.js` *(modified)*

---

## 3. Exact Source Code & Unified Diffs

### 3.1 `dinou/core/handler.js`

```diff
--- a/dinou/core/handler.js
+++ b/dinou/core/handler.js
@@ -611,12 +611,22 @@ async function resolvePageFunctionsConfig(pagePath, reqSegments, queryObj, dynam
           if (Array.isArray(paths)) {
             staticPathsSet = new Set(
               paths.map((pathObj) => {
                 if (pathObj && typeof pathObj === "object" && !Array.isArray(pathObj)) {
-                  const sortedEntries = Object.entries(pathObj).sort((a, b) =>
-                    a[0].localeCompare(b[0])
-                  );
+                  const sortedEntries = Object.entries(pathObj)
+                    .sort((a, b) => a[0].localeCompare(b[0]))
+                    .map(([k, v]) => [
+                      k,
+                      Array.isArray(v)
+                        ? v.join(",")
+                        : v === undefined || v === null
+                        ? ""
+                        : String(v),
+                    ]);
                   return JSON.stringify(sortedEntries);
                 }
-                return String(pathObj);
+                if (Array.isArray(pathObj)) {
+                  return pathObj.join(",");
+                }
+                return pathObj === undefined || pathObj === null ? "" : String(pathObj);
               })
             );
           }
@@ -681,15 +691,23 @@ async function resolvePageFunctionsConfig(pagePath, reqSegments, queryObj, dynam
       if (!isPathBlocked && allowISGValue === false && !isSSG) {
         let isPathAllowed = false;
         if (staticPathsSet) {
           const sortedQueryEntries = Object.entries(dynamicParams)
             .sort((a, b) => a[0].localeCompare(b[0]))
-            .map(([k, v]) => {
-              if (Array.isArray(v)) return [k, v.join(",")];
-              return [k, String(v)];
-            });
+            .map(([k, v]) => [
+              k,
+              Array.isArray(v)
+                ? v.join(",")
+                : v === undefined || v === null
+                ? ""
+                : String(v),
+            ]);
           const serializedQuery = JSON.stringify(sortedQueryEntries);
           const singleVal = Object.values(dynamicParams)[0];
-          const singleValStr = Array.isArray(singleVal) ? singleVal.join(",") : String(singleVal);
+          const singleValStr = Array.isArray(singleVal)
+            ? singleVal.join(",")
+            : singleVal === undefined || singleVal === null
+            ? ""
+            : String(singleVal);
           isPathAllowed = staticPathsSet.has(serializedQuery) || staticPathsSet.has(singleValStr);
         }
         if (!isPathAllowed) {
@@ -757,12 +775,23 @@ async function isLayoutSegmentBlocked(
   if (layoutConfig.allowISG === false && !isSSG) {
     let isPathAllowed = false;
     if (layoutConfig.staticPathsSet) {
       const sortedEntries = Object.entries(lParams)
         .sort((a, b) => a[0].localeCompare(b[0]))
-        .map(([k, v]) => (Array.isArray(v) ? [k, v.join(",")] : [k, String(v)]));
+        .map(([k, v]) => [
+          k,
+          Array.isArray(v)
+            ? v.join(",")
+            : v === undefined || v === null
+            ? ""
+            : String(v),
+        ]);
       const serialized = JSON.stringify(sortedEntries);
       const singleVal = Object.values(lParams)[0];
-      const singleValStr = Array.isArray(singleVal) ? singleVal.join(",") : String(singleVal);
+      const singleValStr = Array.isArray(singleVal)
+        ? singleVal.join(",")
+        : singleVal === undefined || singleVal === null
+        ? ""
+        : String(singleVal);
       isPathAllowed =
         layoutConfig.staticPathsSet.has(serialized) ||
         layoutConfig.staticPathsSet.has(singleValStr);
@@ -2002,25 +2031,73 @@ async function handleRequest(request, platformContext = {}) {
     let layoutConfig = null;
     let pageConfig = null;
     await requestStorage.run(rootContext, async () => {
-      if (isLayoutReq) {
+      // Authoritative perimeter validation (root-to-child layouts, then page) BEFORE any cached RSC hit
+      const perimeterLayoutChain = getActiveLayoutChain(reqSegments, queryObj, srcFolder, {
+        ignoreNoLayout: isLayoutReq,
+      });
+      if (perimeterLayoutChain.length > 0) {
+        for (let i = perimeterLayoutChain.length - 1; i >= 0; i--) {
+          const entry = perimeterLayoutChain[i];
+          const lCfg = await resolveLayoutFunctionsConfig(entry.layoutPath, entry.dParams);
+          if (i === 0 && isLayoutReq) {
+            layoutConfig = lCfg;
+          }
+          if (isLayoutReq && lCfg.isDynamic) {
+            dynamicState.value = true;
+          }
+          if (
+            await isLayoutSegmentBlocked(
+              entry.layoutPath,
+              entry.dParams,
+              lCfg,
+              entry.cleanLayoutKey,
+              reqPath,
+              isDevelopment,
+              Boolean(platformContext?.isSSG),
+            )
+          ) {
+            isPathBlocked = true;
+            break;
+          }
+        }
+      } else if (isLayoutReq && layoutPath) {
         layoutConfig = await resolveLayoutFunctionsConfig(layoutPath, layoutParams);
         if (layoutConfig.isDynamic) {
           dynamicState.value = true;
         }
-      } else if (isPageReq) {
+        if (
+          await isLayoutSegmentBlocked(
+            layoutPath,
+            layoutParams,
+            layoutConfig,
+            undefined,
+            reqPath,
+            isDevelopment,
+            Boolean(platformContext?.isSSG),
+          )
+        ) {
+          isPathBlocked = true;
+        }
+      }
+
+      if (!isLayoutReq && !isPathBlocked) {
         pageConfig = await resolvePageFunctionsConfig(
           pagePath,
           reqSegments,
           queryObj,
           dynamicParams,
           reqPath,
           Boolean(platformContext?.isSSG),
         );
         if (pageConfig.isDynamicConfig) {
           dynamicState.value = true;
         }
         isPathBlocked = pageConfig.isPathBlocked;
       }
     });
 
+    if (isPathBlocked) {
+      return new Response("Not Found", { status: 404 });
+    }
+
     const nonBuildIdQueryKeys = Object.keys(queryObj);
@@ -2457,81 +2534,10 @@ async function handleRequest(request, platformContext = {}) {
-    if (isLayoutReq) {
-      const activeLayoutChainForRsc = getActiveLayoutChain(reqSegments, queryObj, srcFolder, {
-        ignoreNoLayout: true,
-      });
-      if (activeLayoutChainForRsc.length > 0) {
-        for (const entry of activeLayoutChainForRsc) {
-          const lConfig = await resolveLayoutFunctionsConfig(entry.layoutPath, entry.dParams);
-          if (
-            await isLayoutSegmentBlocked(
-              entry.layoutPath,
-              entry.dParams,
-              lConfig,
-              entry.cleanLayoutKey,
-              reqPath,
-              isDevelopment,
-              Boolean(platformContext?.isSSG),
-            )
-          ) {
-            isPathBlocked = true;
-            break;
-          }
-        }
-      } else if (layoutPath) {
-        if (!layoutConfig) {
-          layoutConfig = await resolveLayoutFunctionsConfig(layoutPath, layoutParams);
-        }
-        if (
-          await isLayoutSegmentBlocked(
-            layoutPath,
-            layoutParams,
-            layoutConfig,
-            undefined,
-            reqPath,
-            isDevelopment,
-            Boolean(platformContext?.isSSG),
-          )
-        ) {
-          isPathBlocked = true;
-        }
-      }
-      if (isPathBlocked) {
-        return new Response("Not Found", { status: 404 });
-      }
-    } else {
-      if (!pageConfig) {
-        pageConfig = await resolvePageFunctionsConfig(
-          pagePath,
-          reqSegments,
-          queryObj,
-          dynamicParams,
-          reqPath,
-          Boolean(platformContext?.isSSG),
-        );
-      }
-      isPathBlocked = pageConfig.isPathBlocked;
-      if (!isPathBlocked) {
-        const activeLayoutChainForPage = getActiveLayoutChain(reqSegments, queryObj, srcFolder, {
-          ignoreNoLayout: false,
-        });
-        for (const entry of activeLayoutChainForPage) {
-          const lConfig = await resolveLayoutFunctionsConfig(entry.layoutPath, entry.dParams);
-          if (
-            await isLayoutSegmentBlocked(
-              entry.layoutPath,
-              entry.dParams,
-              lConfig,
-              entry.cleanLayoutKey,
-              reqPath,
-              isDevelopment,
-              Boolean(platformContext?.isSSG),
-            )
-          ) {
-            isPathBlocked = true;
-            break;
-          }
-        }
-      }
-      if (isPathBlocked) {
-        return new Response("Not Found", { status: 404 });
-      }
+    // Perimeter checks (root-to-child layouts + page) already ran authoritatively above before cache lookup.
+    if (isPathBlocked) {
+      return new Response("Not Found", { status: 404 });
     }
@@ -2726,29 +2726,6 @@ async function handleRequest(request, platformContext = {}) {
-  let {
-    isPathBlocked,
-    allowISGValue,
-    isDynamicConfig,
-    revalidate,
-    tags,
-    ppr: isPprConfig,
-    pagePpr: isPagePprConfig,
-  } = await requestStorage.run(rootContext, () =>
-    resolvePageFunctionsConfig(
-      pagePath,
-      reqSegments,
-      queryObj,
-      dynamicParams,
-      reqPath,
-      Boolean(platformContext?.isSSG),
-    )
-  );
-  let hasStaticDynamicConfig = Boolean(isDynamicConfig);
-  if (isDynamicConfig) {
-    dynamicState.value = true;
-  }
-
   const layouts = getFilePathAndDynamicParams(
     reqSegments,
     queryObj,
@@ -2762,28 +2739,41 @@ async function handleRequest(request, platformContext = {}) {
-  let combinedTags = Array.isArray(tags) ? [...tags] : [];
-  let combinedRevalidate = revalidate;
+  let isPathBlocked = false;
+  let allowISGValue = true;
+  let isDynamicConfig = false;
+  let revalidate = undefined;
+  let tags = [];
+  let isPprConfig = false;
+  let isPagePprConfig = false;
+  let hasStaticDynamicConfig = false;
+  let combinedTags = [];
+  let combinedRevalidate = undefined;
 
+  // 1. Evaluate ancestor layouts root-to-child FIRST so a parent layout perimeter guard
+  // (`validateParams` returning false or `allowISG: false`) halts before child layouts/pages run.
   const activeLayoutsForRoute = getActiveLayoutChain(reqSegments, queryObj, srcFolder);
   if (activeLayoutsForRoute.length > 0) {
     await requestStorage.run(rootContext, async () => {
-      for (const entry of activeLayoutsForRoute) {
+      for (let i = activeLayoutsForRoute.length - 1; i >= 0; i--) {
+        const entry = activeLayoutsForRoute[i];
         const layoutConfig = await resolveLayoutFunctionsConfig(entry.layoutPath, entry.dParams);
 
-        if (layoutConfig.isDynamic) {
-          dynamicState.value = true;
-          hasStaticDynamicConfig = true;
-        }
-
         if (
           await isLayoutSegmentBlocked(
             entry.layoutPath,
             entry.dParams,
             layoutConfig,
             entry.cleanLayoutKey,
             reqPath,
             isDevelopment,
             Boolean(platformContext?.isSSG),
           )
         ) {
           isPathBlocked = true;
           allowISGValue = false;
+          break;
         }
+
+        if (layoutConfig.isDynamic) {
+          dynamicState.value = true;
+          hasStaticDynamicConfig = true;
+        }
 
         if (typeof layoutConfig.revalidate === "number" && layoutConfig.revalidate >= 0) {
           if (typeof combinedRevalidate === "number") {
@@ -2805,6 +2795,48 @@ async function handleRequest(request, platformContext = {}) {
         }
       }
     });
   }
+
+  // 2. Evaluate page_functions only when no ancestor layout blocked the request
+  if (!isPathBlocked) {
+    const pageCfg = await requestStorage.run(rootContext, () =>
+      resolvePageFunctionsConfig(
+        pagePath,
+        reqSegments,
+        queryObj,
+        dynamicParams,
+        reqPath,
+        Boolean(platformContext?.isSSG),
+      )
+    );
+    isPathBlocked = pageCfg.isPathBlocked;
+    allowISGValue = pageCfg.allowISGValue;
+    isDynamicConfig = pageCfg.isDynamicConfig;
+    revalidate = pageCfg.revalidate;
+    tags = pageCfg.tags;
+    isPprConfig = pageCfg.ppr;
+    isPagePprConfig = pageCfg.pagePpr;
+
+    if (isDynamicConfig) {
+      dynamicState.value = true;
+      hasStaticDynamicConfig = true;
+    }
+
+    if (typeof revalidate === "number" && revalidate >= 0) {
+      if (typeof combinedRevalidate === "number") {
+        combinedRevalidate = Math.min(combinedRevalidate, revalidate);
+      } else {
+        combinedRevalidate = revalidate;
+      }
+    }
+
+    if (Array.isArray(tags)) {
+      const merged = [...tags];
+      for (const t of combinedTags) {
+        if (!merged.includes(t)) {
+          merged.push(t);
+        }
+      }
+      combinedTags = merged;
+    }
+  }
```

---

### 3.2 `dinou/core/layout-functions.js`

```diff
--- a/dinou/core/layout-functions.js
+++ b/dinou/core/layout-functions.js
@@ -130,10 +130,22 @@ async function resolveLayoutFunctionsConfig(layoutPath, dParams = {}) {
       if (Array.isArray(paths)) {
         staticPathsSet = new Set(
           paths.map((p) => {
             if (typeof p === "object" && p !== null && !Array.isArray(p)) {
-              const sorted = Object.entries(p).sort((a, b) => a[0].localeCompare(b[0]));
+              const sorted = Object.entries(p)
+                .sort((a, b) => a[0].localeCompare(b[0]))
+                .map(([k, v]) => [
+                  k,
+                  Array.isArray(v)
+                    ? v.join(",")
+                    : v === undefined || v === null
+                    ? ""
+                    : String(v),
+                ]);
               return JSON.stringify(sorted);
             }
-            return String(p);
+            if (Array.isArray(p)) {
+              return p.join(",");
+            }
+            return p === undefined || p === null ? "" : String(p);
           })
         );
       }
```

---

### 3.3 `dinou/core/build-static-pages.js`

Apply the exact same `layout_functions` + `hasLocalLayout` check to all three remaining dynamic directory branches (`[[...slug]]`, `[...slug]`, and `[[param]]`):

```diff
--- a/dinou/core/build-static-pages.js
+++ b/dinou/core/build-static-pages.js
@@ -151,10 +151,35 @@ async function buildStaticPages(onProgress = null) {
           let revalidate, getStaticPaths;
           if (pageFunctionsPath) {
             const module = await importModule(pageFunctionsPath);
             const defMod = module.default?.default ? module.default.default : module.default;
             getStaticPaths = module.getStaticPaths || defMod?.getStaticPaths;
             revalidate = module.revalidate ?? defMod?.revalidate;
           }
+          const lfPath = getLayoutFunctionsPath(dynamicPath);
+          if (lfPath) {
+            const lmod = await importModule(lfPath);
+            const ldefMod = lmod.default?.default ? lmod.default.default : lmod.default;
+            const lmodGetStaticPaths = lmod.getStaticPaths || ldefMod?.getStaticPaths;
+            const lmodRevalidate = lmod.revalidate ?? ldefMod?.revalidate;
+            if (!getStaticPaths && lmodGetStaticPaths) {
+              getStaticPaths = lmodGetStaticPaths;
+            }
+            if (revalidate === undefined && lmodRevalidate !== undefined) {
+              revalidate = lmodRevalidate;
+            }
+          }
           const isLocalPage =
             pagePath && path.dirname(pagePath) === dynamicPath;
-          if (isLocalPage && !(await isDynamicRoute(revalidate))) {
+          const [layoutPath] = getFilePathAndDynamicParams(
+            segments,
+            {},
+            dynamicPath,
+            "layout",
+            true,
+            true,
+            undefined,
+            segments.length,
+          );
+          const hasLocalLayout =
+            layoutPath && path.dirname(layoutPath) === dynamicPath;
+          if ((isLocalPage || hasLocalLayout) && !(await isDynamicRoute(revalidate))) {
```

*(Apply the exact same hunk to the `[...slug]` and `[[param]]` branches right below it in `collectPages()`.)*

---

## 4. `CHANGELOG.md` Entry (Draft for `v9.4.0`)

```markdown
### Fixed (API Reference Batch 4 — Route Contracts, Perimeter Validation & Static Path Parity)
- **Authoritative `validateParams()` & `allowISG: false` Veto on Cached SPA RSC Requests (`dinou/core/handler.js`)**: Moved layout and page perimeter checks ahead of cached `page.rsc` / `layout.rsc` delivery on `/____rsc_page____/*`, `/____rsc_layout____/*`, and `/____rsc_payload____/*` so deactivated tenants/items return `404 Not Found` on SPA navigation just like direct HTML requests, and reversed layout perimeter evaluation order to strict **root-to-child** so a failing ancestor layout short-circuits before child layouts or child `page_functions.ts` execute.
- **`allowISG: false` Parameter Normalization for Numeric & Array `getStaticPaths` Objects (`dinou/core/handler.js`, `dinou/core/layout-functions.js`)**: Normalized `number`, `string[]`, and `undefined` values symmetrically when constructing and querying `staticPathsSet` so routes declaring `getStaticPaths = [{ id: 1 }]` or `[{ slug: ["docs", "intro"] }]` with `allowISG = false` no longer falsely 404 in `dinou dev`, cold storage, or Cloudflare Workers.
- **SSG `layout_functions.ts` `getStaticPaths` Support Across All Dynamic Bracket Types (`dinou/core/build-static-pages.js`)**: Extended `layout_functions.ts` `getStaticPaths` and `hasLocalLayout` discovery in `buildStaticPages()` from required `[param]` folders to optional `[[param]]`, catch-all `[...slug]`, and optional catch-all `[[...slug]]` segments.
```

---

## 5. Verification & Complete Test Suite

### 5.1 Multi-Bundler Integration Test (`tests/unit/api-reference-contracts.test.mjs`)

Save this complete, zero-dependency Node test file in `dinou-e2e` (or `dinou`) and run it with `node --test tests/unit/api-reference-contracts.test.mjs`:

```javascript
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

const { FileSystemStorage, setStorageAdapter } = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core", "storage-adapter.js")).href
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

test("Multi-bundler (Esbuild, Rollup, Webpack): allowISG object normalization, authoritative cached HTML+RSC validateParams veto, root-to-child short-circuit & optional layout getStaticPaths", async () => {
  const bundlers = ["esbuild", "rollup", "webpack"];

  for (const bundler of bundlers) {
    const tmpApp = createFixtureDir(`tmp-contracts-ref4-${bundler}-`);
    try {
      fs.writeFileSync(
        path.join(tmpApp, "package.json"),
        JSON.stringify(
          { name: `contracts-ref4-${bundler}`, type: "module", private: true },
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

      fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpApp, "src", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html><head><title>Ref4</title></head><body>{children}</body></html>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "page.tsx"),
        `export default function Home() { return <main>Home</main>; }\n`
      );

      fs.mkdirSync(path.join(tmpApp, "src", "num", "[id]"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpApp, "src", "num", "[id]", "page_functions.ts"),
        `export const getStaticPaths = [{ id: 1 }, { id: 2 }];
export const allowISG = false;
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "num", "[id]", "page.tsx"),
        `export default function NumPage({ params }: { params: { id: string } }) {
  return <main>Num:{params.id}</main>;
}
`
      );

      fs.mkdirSync(path.join(tmpApp, "src", "catch", "[...slug]"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpApp, "src", "catch", "[...slug]", "page_functions.ts"),
        `export const getStaticPaths = [{ slug: ["docs", "intro"] }];
export const allowISG = false;
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "catch", "[...slug]", "page.tsx"),
        `export default function CatchPage({ params }: { params: { slug: string[] } }) {
  return <main>Catch:{params.slug.join("/")}</main>;
}
`
      );

      fs.mkdirSync(path.join(tmpApp, "src", "org", "[tenant]", "item", "[id]"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(tmpApp, "src", "org", "[tenant]", "layout_functions.ts"),
        `export const getStaticPaths = [{ tenant: "acme" }];
export function validateParams(params: { tenant: string }) {
  const log = ((globalThis as any).__VALIDATION_ORDER__ = (globalThis as any).__VALIDATION_ORDER__ || []);
  log.push("layout:" + params.tenant);
  if ((globalThis as any).__TENANT_ACTIVE__ === false) return false;
  return params.tenant === "acme";
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "org", "[tenant]", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function OrgLayout({ children, params }: { children: ReactNode; params: { tenant: string } }) {
  return <section data-tenant={params.tenant}><h2>Org:{params.tenant}</h2>{children}</section>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "org", "[tenant]", "item", "[id]", "page_functions.ts"),
        `export const getStaticPaths = [{ tenant: "acme", id: "1" }];
export function validateParams(params: { tenant: string; id: string }) {
  const log = ((globalThis as any).__VALIDATION_ORDER__ = (globalThis as any).__VALIDATION_ORDER__ || []);
  log.push("page:" + params.id);
  if ((globalThis as any).__ITEM_ACTIVE__ === false) return false;
  return /^[0-9]+$/.test(params.id);
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "org", "[tenant]", "item", "[id]", "page.tsx"),
        `export default function OrgItemPage({ params }: { params: { tenant: string; id: string } }) {
  return <main>Item:{params.tenant}:{params.id}</main>;
}
`
      );

      fs.mkdirSync(path.join(tmpApp, "src", "opt", "[[locale]]", "about"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(tmpApp, "src", "opt", "[[locale]]", "layout_functions.ts"),
        `export const getStaticPaths = [undefined, "en", "es"];\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "opt", "[[locale]]", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function LocaleLayout({ children, params }: { children: ReactNode; params: { locale?: string } }) {
  return <div data-locale={params.locale || "default"}>{children}</div>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "opt", "[[locale]]", "about", "page.tsx"),
        `export default function AboutPage({ params }: { params: { locale?: string } }) {
  return <main>About:{params.locale || "default"}</main>;
}
`
      );

      const buildRes = spawnSync(
        process.execPath,
        [path.join(DINOU_ROOT, "cli.js"), `build:node:${bundler}`],
        { cwd: tmpApp, encoding: "utf8" }
      );
      assert.equal(
        buildRes.status,
        0,
        `Build failed for ${bundler}:\n${buildRes.stdout}\n${buildRes.stderr}`
      );

      for (const expectedRel of [
        "opt/about/index.html",
        "opt/en/about/index.html",
        "opt/es/about/index.html",
      ]) {
        assert.ok(
          fs.existsSync(path.join(tmpApp, ".dinou", "dist2", expectedRel)),
          `[${bundler}] Expected SSG artifact .dinou/dist2/${expectedRel} from [[locale]]/layout_functions.ts`
        );
      }

      const prevCwd = process.cwd();
      const prevRuntime = globalThis.__DINOU_RUNTIME__;
      process.chdir(tmpApp);
      try {
        globalThis.__DINOU_RUNTIME__ = "node-bundle";
        setStorageAdapter(new FileSystemStorage(path.join(tmpApp, ".dinou", "dist2")));

        const rscMod = await import(
          pathToFileURL(path.join(tmpApp, ".dinou", "node", "rsc-engine.mjs")).href +
            `?b=${bundler}&t=${Date.now()}`
        );
        const ssrMod = await import(
          pathToFileURL(path.join(tmpApp, ".dinou", "node", "ssr-engine.mjs")).href +
            `?b=${bundler}&t=${Date.now()}`
        );

        const reqOpts = {
          runtime: "node-bundle",
          renderHtmlStream: ssrMod.renderHtml,
        };

        fs.rmSync(path.join(tmpApp, ".dinou", "dist2", "num"), { recursive: true, force: true });
        fs.rmSync(path.join(tmpApp, ".dinou", "dist2", "catch"), { recursive: true, force: true });

        const numOkHtml = await rscMod.handleRequest(new Request("http://localhost:3000/num/1"), reqOpts);
        assert.equal(numOkHtml.status, 200, `[${bundler}] Expected /num/1 to return 200`);
        const numOkRsc = await rscMod.handleRequest(new Request("http://localhost:3000/____rsc_page____/num/1"), reqOpts);
        assert.equal(numOkRsc.status, 200, `[${bundler}] Expected RSC /num/1 to return 200`);

        const numBlockedHtml = await rscMod.handleRequest(new Request("http://localhost:3000/num/999"), reqOpts);
        assert.equal(numBlockedHtml.status, 404, `[${bundler}] Expected /num/999 to return 404`);
        const numBlockedRsc = await rscMod.handleRequest(new Request("http://localhost:3000/____rsc_page____/num/999"), reqOpts);
        assert.equal(numBlockedRsc.status, 404, `[${bundler}] Expected RSC /num/999 to return 404`);

        const catchOkHtml = await rscMod.handleRequest(new Request("http://localhost:3000/catch/docs/intro"), reqOpts);
        assert.equal(catchOkHtml.status, 200, `[${bundler}] Expected /catch/docs/intro to return 200`);
        const catchBlockedHtml = await rscMod.handleRequest(new Request("http://localhost:3000/catch/docs/unknown"), reqOpts);
        assert.equal(catchBlockedHtml.status, 404, `[${bundler}] Expected /catch/docs/unknown to return 404`);

        globalThis.__TENANT_ACTIVE__ = true;
        globalThis.__ITEM_ACTIVE__ = true;
        globalThis.__VALIDATION_ORDER__ = [];

        const orgOkHtml = await rscMod.handleRequest(new Request("http://localhost:3000/org/acme/item/1"), reqOpts);
        assert.equal(orgOkHtml.status, 200, `[${bundler}] Expected cached /org/acme/item/1 HTML to return 200`);
        assert.deepEqual(
          globalThis.__VALIDATION_ORDER__,
          ["layout:acme", "page:1"],
          `[${bundler}] Expected root-to-child validation order on HTML`
        );

        const orgOkLayoutRsc = await rscMod.handleRequest(new Request("http://localhost:3000/____rsc_layout____/org/acme"), reqOpts);
        assert.equal(orgOkLayoutRsc.status, 200, `[${bundler}] Expected cached layout RSC to return 200`);
        const orgOkPageRsc = await rscMod.handleRequest(new Request("http://localhost:3000/____rsc_page____/org/acme/item/1"), reqOpts);
        assert.equal(orgOkPageRsc.status, 200, `[${bundler}] Expected cached page RSC to return 200`);

        globalThis.__ITEM_ACTIVE__ = false;
        const itemVetoHtml = await rscMod.handleRequest(new Request("http://localhost:3000/org/acme/item/1"), reqOpts);
        assert.equal(itemVetoHtml.status, 404, `[${bundler}] Expected cached HTML veto 404 when page validateParams=false`);
        const itemVetoRsc = await rscMod.handleRequest(new Request("http://localhost:3000/____rsc_page____/org/acme/item/1"), reqOpts);
        assert.equal(itemVetoRsc.status, 404, `[${bundler}] Expected cached page RSC veto 404 when page validateParams=false`);

        globalThis.__TENANT_ACTIVE__ = false;
        globalThis.__ITEM_ACTIVE__ = true;

        globalThis.__VALIDATION_ORDER__ = [];
        const tenantVetoHtml = await rscMod.handleRequest(new Request("http://localhost:3000/org/acme/item/1"), reqOpts);
        assert.equal(tenantVetoHtml.status, 404, `[${bundler}] Expected cached HTML veto 404 when layout validateParams=false`);
        assert.deepEqual(
          globalThis.__VALIDATION_ORDER__,
          ["layout:acme"],
          `[${bundler}] Parent layout veto MUST short-circuit before child page validateParams on HTML`
        );

        globalThis.__VALIDATION_ORDER__ = [];
        const tenantVetoLayoutRsc = await rscMod.handleRequest(new Request("http://localhost:3000/____rsc_layout____/org/acme"), reqOpts);
        assert.equal(tenantVetoLayoutRsc.status, 404, `[${bundler}] Expected cached layout RSC veto 404 when layout validateParams=false`);
        assert.deepEqual(globalThis.__VALIDATION_ORDER__, ["layout:acme"]);

        globalThis.__VALIDATION_ORDER__ = [];
        const tenantVetoPageRsc = await rscMod.handleRequest(new Request("http://localhost:3000/____rsc_page____/org/acme/item/1"), reqOpts);
        assert.equal(tenantVetoPageRsc.status, 404, `[${bundler}] Expected cached page RSC veto 404 when layout validateParams=false`);
        assert.deepEqual(
          globalThis.__VALIDATION_ORDER__,
          ["layout:acme"],
          `[${bundler}] Parent layout veto MUST short-circuit before child page validateParams on RSC`
        );
      } finally {
        globalThis.__DINOU_RUNTIME__ = prevRuntime;
        delete globalThis.__TENANT_ACTIVE__;
        delete globalThis.__ITEM_ACTIVE__;
        delete globalThis.__VALIDATION_ORDER__;
        process.chdir(prevCwd);
      }
    } finally {
      fs.rmSync(tmpApp, { recursive: true, force: true });
    }
  }
});
```

---

### 5.2 Playwright E2E Test Suite (`tests/e2e/api-reference-contracts.spec.ts`)

Add the following fixtures into `dinou-e2e`'s test app (`src/t-contract-veto/actions.ts`, `src/t-contract-veto/page.tsx`, `src/t-contract-veto/[tenant]/layout_functions.ts`, `src/t-contract-veto/[tenant]/layout.tsx`, `src/t-contract-veto/[tenant]/items/[id]/page_functions.ts`, `src/t-contract-veto/[tenant]/items/[id]/page.tsx`) and run the Playwright spec below:

#### Fixture A: `src/t-contract-veto/actions.ts`
```ts
"use server";

export async function setContractVetoState(state: {
  tenantActive?: boolean;
  itemActive?: boolean;
}) {
  if (typeof state.tenantActive === "boolean") {
    (globalThis as any).__E2E_CONTRACT_TENANT_ACTIVE__ = state.tenantActive;
  }
  if (typeof state.itemActive === "boolean") {
    (globalThis as any).__E2E_CONTRACT_ITEM_ACTIVE__ = state.itemActive;
  }
  return { ok: true };
}
```

#### Fixture B: `src/t-contract-veto/controls.tsx`
```tsx
"use client";

import { useState } from "react";
import { setContractVetoState } from "./actions";

export function VetoControls() {
  const [status, setStatus] = useState("ready");

  return (
    <div>
      <span data-testid="veto-status">{status}</span>
      <button
        type="button"
        data-testid="deactivate-tenant"
        onClick={async () => {
          await setContractVetoState({ tenantActive: false, itemActive: true });
          setStatus("tenant-off");
        }}
      >
        Deactivate Tenant
      </button>
      <button
        type="button"
        data-testid="reset-veto"
        onClick={async () => {
          await setContractVetoState({ tenantActive: true, itemActive: true });
          setStatus("reset");
        }}
      >
        Reset
      </button>
    </div>
  );
}
```

#### Fixture C: `src/t-contract-veto/page.tsx`
```tsx
import { Link } from "dinou";
import { VetoControls } from "./controls";

export default function ContractVetoHome() {
  return (
    <main>
      <h1>Contract Veto Hub</h1>
      <Link href="/t-contract-veto/acme/items/1" data-testid="go-acme-item">
        Open Acme Item 1
      </Link>
      <VetoControls />
    </main>
  );
}
```

#### Fixture D: `src/t-contract-veto/[tenant]/layout_functions.ts`
```ts
export const getStaticPaths = [{ tenant: "acme" }];
export const allowISG = false;

export function validateParams(params: { tenant: string }) {
  if ((globalThis as any).__E2E_CONTRACT_TENANT_ACTIVE__ === false) {
    return false;
  }
  return params.tenant === "acme";
}
```

#### Fixture E: `src/t-contract-veto/[tenant]/layout.tsx`
```tsx
import type { ReactNode } from "react";

export default function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { tenant: string };
}) {
  return (
    <section data-testid="tenant-shell" data-tenant={params.tenant}>
      {children}
    </section>
  );
}
```

#### Fixture F: `src/t-contract-veto/[tenant]/items/[id]/page_functions.ts`
```ts
export const getStaticPaths = [{ tenant: "acme", id: 1 }];
export const allowISG = false;

export function validateParams(params: { tenant: string; id: string }) {
  if ((globalThis as any).__E2E_CONTRACT_ITEM_ACTIVE__ === false) {
    return false;
  }
  return /^[0-9]+$/.test(params.id);
}
```

#### Fixture G: `src/t-contract-veto/[tenant]/items/[id]/page.tsx`
```tsx
export default function TenantItemPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  return (
    <main data-testid="tenant-item">
      Tenant:{params.tenant}:Item:{params.id}
    </main>
  );
}
```

#### Playwright Spec (`tests/e2e/api-reference-contracts.spec.ts`)
```ts
import { test, expect } from "@playwright/test";

test.describe("API Reference Batch 4 — Route Contracts Perimeter Veto & allowISG Parity", () => {
  test("1. Numeric getStaticPaths object works with allowISG=false, and layout validateParams vetoes cached HTML and RSC payloads", async ({
    page,
    request,
  }) => {
    try {
      // 1. Numeric `{ tenant: "acme", id: 1 }` with allowISG=false must succeed
      const initialRes = await page.goto("/t-contract-veto/acme/items/1");
      expect(initialRes?.status()).toBe(200);
      await expect(page.getByTestId("tenant-item")).toHaveText(
        "Tenant:acme:Item:1"
      );

      // 2. Unlisted numeric id with allowISG=false must return 404
      const unlistedRes = await request.get("/t-contract-veto/acme/items/999");
      expect(unlistedRes.status()).toBe(404);
      const unlistedRsc = await request.get(
        "/____rsc_page____/t-contract-veto/acme/items/999"
      );
      expect(unlistedRsc.status()).toBe(404);

      // 3. Deactivate tenant while route is already cached
      await page.goto("/t-contract-veto");
      await page.getByTestId("deactivate-tenant").click();
      await expect(page.getByTestId("veto-status")).toHaveText("tenant-off");

      // 4. Both cached HTML and cached RSC wire endpoints MUST return 404
      const vetoHtml = await request.get("/t-contract-veto/acme/items/1");
      expect(vetoHtml.status()).toBe(404);

      const vetoLayoutRsc = await request.get(
        "/____rsc_layout____/t-contract-veto/acme"
      );
      expect(vetoLayoutRsc.status()).toBe(404);

      const vetoPageRsc = await request.get(
        "/____rsc_page____/t-contract-veto/acme/items/1"
      );
      expect(vetoPageRsc.status()).toBe(404);
    } finally {
      // Restore state so other tests are unaffected
      await page.goto("/t-contract-veto");
      await page.getByTestId("reset-veto").click();
      await expect(page.getByTestId("veto-status")).toHaveText("reset");
    }
  });
});
```

---

### 5.3 Execution Commands

```bash
# 1. Syntax check modified framework files
node --check dinou/core/handler.js
node --check dinou/core/layout-functions.js
node --check dinou/core/build-static-pages.js

# 2. Run 3-bundler (Esbuild, Rollup, Webpack) integration test suite
node --test tests/unit/api-reference-contracts.test.mjs

# 3. Run Playwright E2E suite (in dinou-e2e)
npx playwright test tests/e2e/api-reference-contracts.spec.ts
```
