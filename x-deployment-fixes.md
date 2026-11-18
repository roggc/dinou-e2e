# Dinou `v9.4.0` — Deployment Targets, Netlify Functions v2 Dual-Bundle & Multi-Runtime Adapter Fixes (`x-deployment-fixes.md`)

## 1. Executive Summary & Root-Cause Analysis

During the exhaustive pre-release audit of `/docs/deployment` (`src/docs/deployment/page.tsx`) against Dinou `v9.4.0` across all 3 bundlers (`esbuild`, `rollup`, `webpack`), all 5 runtime adapters (`Node.js`, `Netlify Functions v2`, `Cloudflare Workers`, `Deno` / `Deno Deploy`, `Bun`), standalone compiled binaries (`build:node:compile`, `build:bun:compile`, `build:deno:compile`), Pure Bun pipelines (`:pure`), and `dinou export-static`, we uncovered and resolved **6 framework bugs and architectural gaps**:

1. **CRITICAL — Netlify Functions v2 (`dinou/adapters/netlify.js` & `.dinou/dist1/server/netlify.js`) Broken on Dynamic SSR, `.tsx` Routes, Server Functions, and Read-Only AWS Lambda Disk**:
   - **Root Cause**: While Node, Bun, Deno, and Cloudflare Workers had migrated to Dinou's Ahead-of-Time (AOT) Dual-Bundle Engine (`rsc-engine` + `ssr-engine`), `.dinou/dist1/server/{handler.js,netlify.js}` and `dinou/adapters/netlify.js` still used a legacy pre-Dual-Bundle single-pass compilation (`conditions: ["react-server"]` directly over `core/handler.js`). Specifically:
     1. `netlifyHandler` invoked `handleRequest(request, { env, ctx })` **without** `runtime: "node-bundle"` and **without** `renderHtmlStream`. Every dynamic SSR route (`revalidate: 0`, reading `cookies`/`headers`/`query`), ISG cache miss, or custom `404` (`not_found.tsx`) fell through to line 4166 of `core/handler.js`, returning **HTTP 500 `"Internal Server Error: No renderer available"`**.
     2. Because `route-modules` was not bundled, `importModule()` attempted native `await import("file:///.../src/page.tsx")` directly from disk inside Netlify's standard Node 22 runtime (which lacks JSX/TS loaders and `--conditions=react-server`), failing with `ERR_UNKNOWN_FILE_EXTENSION`.
     3. Default `FileSystemStorage` attempted to write ISG/ISR updates into `/var/task/.dinou/dist2` (strictly read-only on AWS Lambda), throwing `EROFS: read-only file system`.
     4. Pointing `[functions] directory = ".dinou/dist1/server"` caused Netlify's function scanner to treat `handler.js` and top-level Rollup/Webpack chunk `.js` files as separate serverless functions, and previously forced `netlify.toml` to bundle `node_modules/**` + `src/**` (>200 MB).
   - **Architectural Fix**:
     - Added `bundleServerAndNetlifyAdapters(engineResult)` in `dinou/node/bundle-dual-engine.js` and wired it into `dinou/core/generate-static.js` (executed by `run-ssg.js` across Esbuild, Rollup, and Webpack) and `dinou/node/build.js`:
       - Emits a dedicated single-function directory **`.dinou/netlify/functions/ssr.mjs`** (+ `package.json`) containing **only one** self-contained pure-ESM bundle (`rsc-engine.mjs` + `ssr-engine.mjs` + routes + Server Functions + `setupFiles` + `dinou.config.*` + manifests + VFS). It defaults to `MemoryStorage({ hydrateFromDisk: true })` (unless `hasExplicitStorageAdapter()` is true, e.g. `RedisStorage`), hydrates SSG pages from read-only `.dinou/dist2` without disk writes, unifies `Netlify.env.toObject()` with `process.env`, passes `ctx` (`context.waitUntil`) and `renderHtmlStream: renderHtml`, and exports `config = { path: "/*", preferStatic: true }`. `netlify.toml` now needs only `included_files = [".dinou/dist2/**"]` (~1–2 MB total).
       - Compiles **`.dinou/dist1/server/netlify.js`** and **`.dinou/dist1/server/handler.js`** (+ `package.json`) with the exact same AOT Dual-Bundle architecture—eliminating the slow, broken legacy second server bundler pass from `esbuild/build.js`, `rollup/rollup.config.js`, and `webpack/webpack.config.js` while maintaining 100% backward compatibility.
       - Rewrote `dinou/adapters/netlify.js` (`dinou/adapters/netlify`) to delegate cleanly to `.dinou/netlify/functions/ssr.mjs` (or `.dinou/dist1/server/netlify.js`), and added explicit `dinou build:netlify` (`:esbuild`, `:rollup`, `:webpack`) CLI commands in `dinou/cli.js`.

2. **Multi-Bundle `React` Instance Isolation Across `rsc-engine` & `ssr-engine` (`dinou/node/bundle-dual-engine.js`, `cloudflare/build.js`, `bun/build.js`, `deno/build.js`)**:
   - **Root Cause**: Each compiled Dual-Bundle assigned `globalThis.__DINOU_EDGE_RENDERER__` and `globalThis.__webpack_require__` only once at module evaluation time. When two self-contained bundles (e.g., `.dinou/netlify/functions/ssr.mjs` and `.dinou/dist1/server/handler.js`, or multiple built fixtures in one test runner process) were imported in the same JS isolate, the second bundle overwrote `globalThis.__webpack_require__` with `clientModules` bound to a different bundled `React` copy, causing `TypeError: Cannot read properties of null (reading 'useContext')` during SSR streaming.
   - **Architectural Fix**: Bound `globalThis.__DINOU_EDGE_RENDERER__ = edgeRenderer` inside `handleRequest(...)` and `globalThis.__webpack_require__ = localWebpackRequire` inside `renderHtml(...)` across Node, Netlify, Cloudflare, Bun, and Deno Dual-Bundle entries, and switched `banner` declarations in `bundle-dual-engine.js` from `const` to `var`. Multiple self-contained Dual-Bundles can now coexist and execute in the exact same process with zero React dispatcher collisions.

3. **Stale `"dinou/adapters/cloudflare"` Package Export (`dinou/adapters/cloudflare.js`)**:
   - **Root Cause**: Unlike `.dinou/cloudflare/worker.js`, `dinou/adapters/cloudflare.js` called raw `handleRequest` without `renderHtmlStream` (throwing `[Dinou Edge] platformContext.renderHtmlStream is required for Edge rendering` on dynamic SSR) and omitted `hasExplicitStorageAdapter()`, overwriting custom storage adapters.
   - **Architectural Fix**: Updated `dinou/adapters/cloudflare.js` to delegate to `.dinou/cloudflare/worker.js` when present (with `mtimeMs` cache invalidation), respect `hasExplicitStorageAdapter()`, and forward `globalThis.__DINOU_RENDER_HTML_STREAM__` in direct edge fallback mode.

4. **Missing `HOST` Binding & Fail-Fast Checks in `dinou start:bun` and `dinou start:deno` (`dinou/adapters/bun.js`, `dinou/adapters/deno.js`, `dinou/bun/build.js`)**:
   - **Root Cause**: While `.dinou/bun/server.js` and `.dinou/deno/main.js` honored `HOST`, `dinou/adapters/bun.js` (`dinou start:bun`) and `dinou/adapters/deno.js` (`dinou start:deno`) omitted `hostname` (`HOST=0.0.0.0` in Docker/PaaS) and silently booted an HTTP server instead of exiting with code `1` when invoked via CLI without a prior build.
   - **Architectural Fix**: Propagated `HOST` (`hostname`) across `adapters/bun.js` and `adapters/deno.js`, added startup banners when executed as `import.meta.main`, and enforced fail-fast `exit(1)` on missing bundles when invoked directly via CLI (while keeping graceful `500` `Response` behavior when imported programmatically).

5. **Guaranteed `.dinou/dist2` Directory Creation & `Deno.cwd()` Fallback in `readDist2Fallback` (`dinou/core/generate-static.js`, `dinou/core/storage-adapter.js`)**:
   - **Root Cause**: For 100% dynamic applications (0 static routes), `generate-static.js` deleted `.dinou/dist2` via `rmSync` without recreating an empty directory, breaking `COPY --from=builder /app/.dinou/dist2 ./.dinou/dist2` in Dockerfiles and `included_files = [".dinou/dist2/**"]` in `netlify.toml`. Additionally, `readDist2Fallback` in `storage-adapter.js` checked `process.cwd()` without falling back to `Deno.cwd()`.
   - **Architectural Fix**: Added `mkdirSync(distFolder2, { recursive: true })` immediately after `rmSync` in `generate-static.js`, and added `Deno.cwd()` fallback in `readDist2Fallback`.

6. **Nested `.dinou` Workspace Path Guard in Esbuild `serverFunctionsPlugin` (`dinou/esbuild/plugins-esbuild/server-functions-plugin.js`)**:
   - **Root Cause**: `serverFunctionsPlugin` checked `normPath.includes("/.dinou/")` on the full absolute path instead of `path.relative(root, args.path)`. Any project whose parent path contained `.dinou` had all `"use server"` modules skipped during Esbuild client bundling.
   - **Architectural Fix**: Replaced `normPath.includes("/.dinou/")` with `path.relative(root, args.path).replace(/\\/g, "/").startsWith(".dinou/")` (matching Rollup and Webpack).

---

## 2. Complete File Manifest

1. `dinou/node/bundle-dual-engine.js` *(Modified — adds `bundleServerAndNetlifyAdapters`, per-call `edgeRenderer`/`localWebpackRequire` binding, `var` banner)*
2. `dinou/core/generate-static.js` *(Modified — ensures `.dinou/dist2` exists and calls `bundleServerAndNetlifyAdapters`)*
3. `dinou/node/build.js` *(Modified — calls `bundleServerAndNetlifyAdapters` and logs bound `host`)*
4. `dinou/esbuild/build.js` *(Modified — removes legacy single-bundle server pass; cleans `.dinou/netlify`)*
5. `dinou/rollup/rollup.config.js` *(Modified — removes legacy single-bundle `serverConfig`; triggers `run-ssg.js` from `post-build-ssg`)*
6. `dinou/webpack/webpack.config.js` *(Modified — removes legacy single-bundle `serverConfig`; guards `PostBuildClient` with `stats.hasErrors()`)*
7. `dinou/esbuild/plugins-esbuild/server-functions-plugin.js` *(Modified — checks relative `.dinou/` path from `root`)*
8. `dinou/adapters/netlify.js` *(Rewritten — AOT Dual-Bundle Netlify Functions v2 delegator)*
9. `dinou/adapters/cloudflare.js` *(Rewritten — AOT Dual-Bundle `.dinou/cloudflare/worker.js` delegator + `hasExplicitStorageAdapter` guard)*
10. `dinou/adapters/bun.js` *(Rewritten — `HOST` propagation, startup log, CLI fail-fast exit)*
11. `dinou/bun/build.js` *(Modified — per-call `edgeRenderer`/`localWebpackRequire` binding + `import.meta.main` startup log)*
12. `dinou/adapters/deno.js` *(Rewritten — `HOST` propagation, `.default.fetch` support, CLI fail-fast exit)*
13. `dinou/deno/build.js` *(Modified — per-call `edgeRenderer`/`localWebpackRequire` binding)*
14. `dinou/cloudflare/build.js` *(Modified — per-call `edgeRenderer`/`localWebpackRequire` binding)*
15. `dinou/core/storage-adapter.js` *(Modified — `Deno.cwd()` fallback in `readDist2Fallback`)*
16. `dinou/cli.js` *(Modified — adds `build:netlify`, `build:netlify:esbuild`, `build:netlify:rollup`, `build:netlify:webpack`)*
17. `dinou/index.d.ts` & `dinou/server.d.ts` *(Modified — uses explicit `.js` specifier on relative `.d.ts` cross-imports for strict `NodeNext` & `deno check` compatibility)*

---

## 3. Complete Source Code & Unified Diffs

### 3.1 `dinou/node/bundle-dual-engine.js`

```diff
--- a/dinou/node/bundle-dual-engine.js
+++ b/dinou/node/bundle-dual-engine.js
@@ -30,6 +30,7 @@ import {
 import {
   getDinouConfig,
   findDinouConfigFile,
+  prepareDist1ServerEntries,
 } from "../core/load-dinou-config.js";
 import { resolveSetupFiles } from "../core/resolve-setup-files.js";
 import {
@@ -714,29 +715,40 @@ export async function bundleDualEngine(options = {}) {
   const rscEntryContent = `// Auto-generated RSC Engine entry for Node.js (Dual-Bundle)
 import "./env-setup.mjs";
 ${aotConfigPrelude}import "./route-modules.mjs";
 import * as edgeRenderer from "react-server-dom-webpack/server.edge";
+import {
+  handleRequest as coreHandleRequest,
+  WebResponseBridge,
+  resolvePageFunctionsConfig,
+} from "${dinouDirSlash}/core/handler.js";
 globalThis.__DINOU_EDGE_RENDERER__ = edgeRenderer;
-export { handleRequest } from "${dinouDirSlash}/core/handler.js";
+export function handleRequest(request, platformContext) {
+  globalThis.__DINOU_EDGE_RENDERER__ = edgeRenderer;
+  return coreHandleRequest(request, platformContext);
+}
+export { WebResponseBridge, resolvePageFunctionsConfig };
 export { buildStaticPages, getStaticPaths, getStaticLayouts, getStaticMetadata } from "${dinouDirSlash}/core/build-static-pages.js";
 `;
   const rscEntryPath = path.join(nodeDir, "rsc-entry.mjs");
   fs.writeFileSync(rscEntryPath, rscEntryContent, "utf8");
 
   const ssrEntryContent = `// Auto-generated SSR Engine entry for Node.js (Dual-Bundle)
 import { renderRscStreamToHtmlStream } from "${dinouDirSlash}/core/edge-ssr.js";
 import { clientModules, ssrConsumerManifest } from "./ssr-client-manifest.mjs";
 
 const lowerMap = new Map();
-globalThis.__webpack_require__ = (id) => {
+const localWebpackRequire = (id) => {
   if (clientModules[id]) return clientModules[id];
   if (typeof id === "string") {
     if (lowerMap.size === 0) {
       for (const k of Object.keys(clientModules)) lowerMap.set(k.toLowerCase(), clientModules[k]);
     }
     const lowerVal = lowerMap.get(id.toLowerCase());
     if (lowerVal) return lowerVal;
   }
   console.error("[SSR Engine] Module not found in __webpack_require__:", id);
   return {};
 };
-globalThis.__webpack_require__.u = (chunkId) => "" + chunkId + ".js";
+localWebpackRequire.u = (chunkId) => "" + chunkId + ".js";
+globalThis.__webpack_require__ = localWebpackRequire;
 globalThis.__webpack_chunk_load__ = () => Promise.resolve();
 
 export async function renderHtml(rscStream, options = {}) {
+  globalThis.__webpack_require__ = localWebpackRequire;
   return renderRscStreamToHtmlStream(rscStream, ssrConsumerManifest, options);
 }
 `;
@@ -780,9 +792,9 @@ export async function bundleDualEngine(options = {}) {
   const banner = {
     js: `import { createRequire as ___createRequire } from 'node:module';
 import { AsyncLocalStorage as ___AsyncLocalStorage } from 'node:async_hooks';
-const require = ___createRequire(import.meta.url || 'file:///server.js');
-const __dirname = '';
-const __filename = '';
+var require = ___createRequire(import.meta.url || 'file:///server.js');
+var __dirname = '';
+var __filename = '';
 globalThis.__dinou_require__ = require;
 if (typeof globalThis.AsyncLocalStorage === 'undefined' && typeof ___AsyncLocalStorage !== 'undefined') {
   globalThis.AsyncLocalStorage = ___AsyncLocalStorage;
@@ -1002,6 +1014,7 @@ export async function bundleDualEngine(options = {}) {
   });
 
   return {
+    projectRoot,
     nodeDir,
     rscEnginePath: rscOutfile,
     ssrEnginePath: ssrOutfile,
@@ -1021,4 +1034,264 @@ export async function bundleDualEngine(options = {}) {
   };
 }
 
-export default { bundleDualEngine };
+/**
+ * Compiles self-contained AOT Dual-Bundle server artifacts from Pass A (`rsc-engine.mjs`)
+ * and Pass B (`ssr-engine.mjs`) into:
+ * - `.dinou/netlify/functions/ssr.mjs` (dedicated single-function Netlify Functions v2 directory)
+ * - `.dinou/dist1/server/netlify.js` (backward-compatible Netlify Functions v2 bundle)
+ * - `.dinou/dist1/server/handler.js` (universal Web Standards `(Request) => Promise<Response>` bundle)
+ */
+export async function bundleServerAndNetlifyAdapters(engineResult) {
+  const {
+    projectRoot = process.cwd(),
+    nodeDir,
+    dinouDirSlash,
+    externalList,
+    commonAlias,
+    commonLoader,
+    serverAssetPlugin,
+    serverTsconfigAliasesPlugin,
+    isWebpackBuild,
+    setupFiles = [],
+    configFile,
+  } = engineResult;
+
+  const resolvedBuildTool = isWebpackBuild
+    ? "webpack"
+    : process.env.DINOU_BUILD_TOOL || "esbuild";
+
+  // Emit pre-transpiled dinou-server-bootstrap.mjs for --omit=dev config fallback if needed
+  if ((setupFiles && setupFiles.length > 0) || configFile) {
+    try {
+      await prepareDist1ServerEntries({
+        projectRoot,
+        setupFiles,
+        handlerPath: path.resolve(dinouDirSlash, "core/handler.js"),
+        netlifyPath: path.resolve(dinouDirSlash, "adapters/netlify.js"),
+      });
+      fs.rmSync(path.resolve(projectRoot, ".dinou/dist1/_entries"), {
+        recursive: true,
+        force: true,
+      });
+    } catch (e) {}
+  }
+
+  const configImportLine = configFile
+    ? `import * as __dinouPassCConfigMod from ${JSON.stringify(configFile.replace(/\\/g, "/"))};\nconst __bundledPassCConfig = (__dinouPassCConfigMod && __dinouPassCConfigMod.default) ? __dinouPassCConfigMod.default : (__dinouPassCConfigMod || { plugins: [] });\nglobalThis.__DINOU_AOT_CONFIG__ = __bundledPassCConfig;\nglobalThis.__DINOU_CONFIG__ = __bundledPassCConfig;\n`
+    : "";
+
+  const passCConfigAliasPlugin = configFile
+    ? {
+        name: "dinou-passc-config-alias",
+        setup(build) {
+          const normConfig = path.resolve(configFile).toLowerCase();
+          build.onResolve({ filter: /^dinou$/ }, (args) => {
+            if (
+              args.importer &&
+              path.resolve(args.importer).toLowerCase() === normConfig
+            ) {
+              return { path: path.resolve(dinouDirSlash, "core/config.js") };
+            }
+            return null;
+          });
+        },
+      }
+    : null;
+
+  const handlerEntryCode = `// Auto-generated Universal Web Standards Handler (AOT Dual-Bundle)
+import path from "node:path";
+import {
+  handleRequest as rawHandleRequest,
+  WebResponseBridge,
+  resolvePageFunctionsConfig,
+} from "./rsc-engine.mjs";
+import { renderHtml } from "./ssr-engine.mjs";
+import {
+  setStorageAdapter,
+  hasExplicitStorageAdapter,
+  FileSystemStorage,
+  MemoryStorage,
+} from "${dinouDirSlash}/core/storage-adapter.js";
+import { loadEnvFiles } from "${dinouDirSlash}/core/env.js";
+${configImportLine}
+const initialCwd =
+  typeof process !== "undefined" && typeof process.cwd === "function"
+    ? process.cwd()
+    : ".";
+try {
+  loadEnvFiles(initialCwd, { mode: "production" });
+} catch (e) {}
+
+if (typeof globalThis !== "undefined") {
+  globalThis.__DINOU_RUNTIME__ = "node-bundle";
+}
+
+let storageInitialized = false;
+
+function initHandlerStorage() {
+  if (!storageInitialized) {
+    if (!hasExplicitStorageAdapter()) {
+      try {
+        const cwd =
+          typeof process !== "undefined" && typeof process.cwd === "function"
+            ? process.cwd()
+            : ".";
+        setStorageAdapter(
+          new FileSystemStorage(path.resolve(cwd, ".dinou/dist2"))
+        );
+      } catch (e) {
+        setStorageAdapter(new MemoryStorage({ hydrateFromDisk: true }));
+      }
+    }
+    storageInitialized = true;
+  }
+}
+
+export async function handleRequest(request, platformContext = {}) {
+  initHandlerStorage();
+  const runtimeEnv =
+    platformContext?.env ||
+    (typeof process !== "undefined" && process.env ? process.env : {});
+  return rawHandleRequest(request, {
+    ...platformContext,
+    env: runtimeEnv,
+    runtime: platformContext?.runtime || "node-bundle",
+    renderHtmlStream: platformContext?.renderHtmlStream || renderHtml,
+  });
+}
+
+export { WebResponseBridge, resolvePageFunctionsConfig };
+export default handleRequest;
+`;
+
+  const netlifyEntryCode = `// Auto-generated Netlify Functions v2 Adapter (AOT Dual-Bundle)
+import { handleRequest as rawHandleRequest } from "./rsc-engine.mjs";
+import { renderHtml } from "./ssr-engine.mjs";
+import {
+  setStorageAdapter,
+  hasExplicitStorageAdapter,
+  MemoryStorage,
+} from "${dinouDirSlash}/core/storage-adapter.js";
+import { loadEnvFiles } from "${dinouDirSlash}/core/env.js";
+${configImportLine}
+const initialCwd =
+  typeof process !== "undefined" && typeof process.cwd === "function"
+    ? process.cwd()
+    : ".";
+try {
+  loadEnvFiles(initialCwd, { mode: "production" });
+} catch (e) {}
+
+if (typeof globalThis !== "undefined") {
+  globalThis.__DINOU_RUNTIME__ = "node-bundle";
+}
+
+let storageInitialized = false;
+
+function initNetlifyStorage() {
+  if (!storageInitialized) {
+    if (!hasExplicitStorageAdapter()) {
+      setStorageAdapter(new MemoryStorage({ hydrateFromDisk: true }));
+    }
+    storageInitialized = true;
+  }
+}
+
+export default async function netlifyHandler(request, context) {
+  initNetlifyStorage();
+  const baseEnv =
+    typeof process !== "undefined" && process.env ? process.env : {};
+  const runtimeEnv =
+    typeof globalThis !== "undefined" &&
+    globalThis.Netlify &&
+    globalThis.Netlify.env &&
+    typeof globalThis.Netlify.env.toObject === "function"
+      ? { ...baseEnv, ...globalThis.Netlify.env.toObject() }
+      : baseEnv;
+  return rawHandleRequest(request, {
+    env: runtimeEnv,
+    ctx: context || null,
+    runtime: "node-bundle",
+    renderHtmlStream: renderHtml,
+  });
+}
+
+export const config = {
+  path: "/*",
+  preferStatic: true,
+};
+`;
+
+  const handlerEntryPath = path.join(nodeDir, "dist1-handler-entry.mjs");
+  const netlifyEntryPath = path.join(nodeDir, "netlify-function-entry.mjs");
+  fs.writeFileSync(handlerEntryPath, handlerEntryCode, "utf8");
+  fs.writeFileSync(netlifyEntryPath, netlifyEntryCode, "utf8");
+
+  const dist1ServerDir = path.resolve(projectRoot, ".dinou/dist1/server");
+  const netlifyFunctionsDir = path.resolve(
+    projectRoot,
+    ".dinou/netlify/functions"
+  );
+  fs.rmSync(dist1ServerDir, { recursive: true, force: true });
+  fs.rmSync(netlifyFunctionsDir, { recursive: true, force: true });
+  fs.mkdirSync(dist1ServerDir, { recursive: true });
+  fs.mkdirSync(netlifyFunctionsDir, { recursive: true });
+
+  const sharedPassCOptions = {
+    bundle: true,
+    format: "esm",
+    target: "node20",
+    platform: "node",
+    jsx: "automatic",
+    mainFields: ["module", "main"],
+    conditions: ["node", "worker", "browser"],
+    external: externalList,
+    plugins: [
+      passCConfigAliasPlugin,
+      serverTsconfigAliasesPlugin,
+      serverAssetPlugin,
+    ].filter(Boolean),
+    alias: commonAlias,
+    loader: commonLoader,
+    define: {
+      "process.env.NODE_ENV": '"production"',
+      "process.env.DINOU_RUNTIME": '"node-bundle"',
+      "process.env.DINOU_BUILD_TOOL": JSON.stringify(resolvedBuildTool),
+    },
+    logLevel: "warning",
+  };
+
+  const dist1HandlerOut = path.join(dist1ServerDir, "handler.js");
+  const dist1NetlifyOut = path.join(dist1ServerDir, "netlify.js");
+  const netlifySsrOut = path.join(netlifyFunctionsDir, "ssr.mjs");
+
+  await Promise.all([
+    esbuild.build({
+      ...sharedPassCOptions,
+      entryPoints: [handlerEntryPath],
+      outfile: dist1HandlerOut,
+      sourcemap: true,
+    }),
+    esbuild.build({
+      ...sharedPassCOptions,
+      entryPoints: [netlifyEntryPath],
+      outfile: dist1NetlifyOut,
+      sourcemap: true,
+    }),
+  ]);
+
+  fs.copyFileSync(dist1NetlifyOut, netlifySsrOut);
+
+  const esmPkgJson = JSON.stringify({ type: "module" }, null, 2);
+  fs.writeFileSync(path.join(dist1ServerDir, "package.json"), esmPkgJson);
+  fs.writeFileSync(path.join(netlifyFunctionsDir, "package.json"), esmPkgJson);
+
+  return {
+    dist1HandlerOut,
+    dist1NetlifyOut,
+    netlifySsrOut,
+  };
+}
+
+export default { bundleDualEngine, bundleServerAndNetlifyAdapters };
```

---

### 3.2 `dinou/core/generate-static.js` & `dinou/node/build.js`

#### `dinou/core/generate-static.js`:
```diff
--- a/dinou/core/generate-static.js
+++ b/dinou/core/generate-static.js
@@ -18,17 +18,23 @@ async function generateStatic() {
   if (existsSync(distFolder2)) {
     rmSync(distFolder2, { recursive: true, force: true });
   }
+  mkdirSync(distFolder2, { recursive: true });
 
   const { updateBuildProgress, clearBuildProgress, isTTY } = await import(
     "../node/terminal-status.js"
   );
 
-  // 1. Compile or ensure Dual-Bundle engines (Pass A & Pass B)
+  // 1. Compile or ensure Dual-Bundle engines (Pass A & Pass B) + Server/Netlify AOT Adapters
   updateBuildProgress("[SSG] Compiling Dual-Engine for static generation...");
-  const { bundleDualEngine } = await import("../node/bundle-dual-engine.js");
-  const { rscEnginePath, ssrEnginePath } = await bundleDualEngine({
+  const {
+    bundleDualEngine,
+    bundleServerAndNetlifyAdapters,
+  } = await import("../node/bundle-dual-engine.js");
+  const engineResult = await bundleDualEngine({
     isDev: false,
     projectRoot: process.cwd(),
     outDir: ".dinou/node",
   });
+  const { rscEnginePath, ssrEnginePath } = engineResult;
+  await bundleServerAndNetlifyAdapters(engineResult);
```

#### `dinou/node/build.js`:
```diff
--- a/dinou/node/build.js
+++ b/dinou/node/build.js
@@ -7,7 +7,10 @@ import fs from "node:fs";
 import path from "node:path";
 import esbuild from "esbuild";
 import { fileURLToPath } from "node:url";
-import { bundleDualEngine } from "./bundle-dual-engine.js";
+import {
+  bundleDualEngine,
+  bundleServerAndNetlifyAdapters,
+} from "./bundle-dual-engine.js";
 import { loadEnvFiles } from "../core/env.js";
 import ensureVendorMode from "../core/ensure-vendor-mode.js";
 loadEnvFiles(process.cwd(), { mode: "production" });
@@ -28,6 +31,7 @@ try {
     projectRoot,
     outDir: ".dinou/node",
   });
+  await bundleServerAndNetlifyAdapters(engineResult);
 
   const {
     dinouDirSlash,
@@ -222,7 +226,7 @@ export async function startServer(port = PORT, host = process.env.HOST || undefi
   return new Promise((resolve, reject) => {
     server.on("error", reject);
     server.listen(port, host, () => {
-      console.log(\`🚀 Dinou (Node.js AOT Dual-Bundle) server running on http://localhost:\${port}\`);
+      console.log(\`🚀 Dinou (Node.js AOT Dual-Bundle) server running on http://\${host || "localhost"}:\${port}\`);
       resolve(server);
     });
   });
```

---

### 3.3 `dinou/esbuild/build.js`, `dinou/rollup/rollup.config.js`, `dinou/webpack/webpack.config.js` & `dinou/esbuild/plugins-esbuild/server-functions-plugin.js`

#### `dinou/esbuild/build.js`:
```diff
--- a/dinou/esbuild/build.js
+++ b/dinou/esbuild/build.js
@@ -9,19 +9,9 @@ import getEsbuildEntries from "./helpers-esbuild/get-esbuild-entries.js";
 import { fileURLToPath } from "url";
 import path from "node:path";
 import { updateManifestForModule } from "./helpers-esbuild/update-manifest-for-module.js";
 import { generateRouteTypes } from "../core/generate-route-types.js";
-import { esbuildContextualDinouPlugin } from "../core/resolve-contextual-dinou.js";
-import {
-  getDinouConfig,
-  prepareDist1ServerEntries,
-} from "../core/load-dinou-config.js";
-import { resolveSetupFiles } from "../core/resolve-setup-files.js";
-import {
-  createServerAssetPlugin,
-  getAssetExtensionsInfo,
-} from "../core/asset-extensions.js";
-import { createServerCssModulesPlugin } from "../core/server-css-modules-plugin.js";
-import { esbuildTsconfigAliasesPlugin } from "../core/tsconfig-aliases.js";
-import { loadEnvFiles, getEsbuildPublicEnvDefines } from "../core/env.js";
+import { getDinouConfig } from "../core/load-dinou-config.js";
+import { loadEnvFiles } from "../core/env.js";
 import ensureVendorMode, {
   isUnvendorizedRequested,
 } from "../core/ensure-vendor-mode.js";
@@ -36,6 +26,7 @@ const __dirname = path.dirname(__filename);
 const outdir = ".dinou/dist3";
 await fs.rm(outdir, { recursive: true, force: true });
 await fs.rm(".dinou/dist1", { recursive: true, force: true });
+await fs.rm(".dinou/netlify", { recursive: true, force: true });
 
 const absPathToClientRedirect = path.resolve(
   __dirname,
@@ -125,62 +116,7 @@ try {
     })
   );
 
-  // 🚀 Server & Adapter Pre-bundling with react-server condition
-  console.log("⚡ [esbuild] Pre-bundling server handler and adapters (conditions: ['react-server'])...");
-  const setupFiles = resolveSetupFiles(process.cwd(), dinouConfig);
-  const { handlerEntry, netlifyEntry } = await prepareDist1ServerEntries({
-    projectRoot: process.cwd(),
-    setupFiles,
-    handlerPath: path.resolve(__dirname, "../core/handler.js"),
-    netlifyPath: path.resolve(__dirname, "../adapters/netlify.js"),
-  });
-  await esbuild.build({
-    entryPoints: {
-      handler: handlerEntry,
-      netlify: netlifyEntry,
-    },
-    bundle: true,
-    platform: "node",
-    target: "node20",
-    format: "esm",
-    jsx: "automatic",
-    conditions: ["react-server", "node", "import", "style"],
-    outdir: ".dinou/dist1/server",
-    loader: { ".css": "empty" },
-    external: [
-      "express",
-      "chokidar",
-      "dotenv",
-      "fsevents",
-      "@swc/core",
-      "@babel/core",
-      "esbuild",
-    ],
-    banner: {
-      js: "import { createRequire as ___createRequire } from 'node:module'; import { fileURLToPath as ___fileURLToPath } from 'node:url'; import ___path from 'node:path'; const require = ___createRequire(import.meta.url || ___path.resolve(process.cwd(), 'package.json')); const __filename = import.meta.url ? ___fileURLToPath(import.meta.url) : ___path.resolve(process.cwd(), 'index.js'); const __dirname = ___path.dirname(__filename); process.env.NODE_ENV = process.env.NODE_ENV || 'production';",
-    },
-    define: getEsbuildPublicEnvDefines({
-      mode: "production",
-      defineProcessEnvObject: false,
-    }),
-    plugins: [
-      esbuildContextualDinouPlugin({ projectRoot: process.cwd() }),
-      esbuildTsconfigAliasesPlugin({
-        projectRoot: process.cwd(),
-        assetRegex: getAssetExtensionsInfo(dinouConfig, process.cwd()).regex,
-      }),
-      createServerCssModulesPlugin({ projectRoot: process.cwd() }),
-      createServerAssetPlugin({ projectRoot: process.cwd(), dinouConfig }),
-    ],
-    sourcemap: true,
-  });
-  await fs.rm(path.resolve(process.cwd(), ".dinou/dist1/_entries"), {
-    recursive: true,
-    force: true,
-  });
-  await fs.writeFile(
-    path.resolve(process.cwd(), ".dinou/dist1/server/package.json"),
-    JSON.stringify({ type: "module" }, null, 2)
-  );
-
-  // 🏗️ Pre-render static pages (SSG) at build time
+  // 🏗️ Pre-render static pages (SSG) & compile Dual-Bundle Server/Netlify adapters
   const { spawnSync } = await import("node:child_process");
```

#### `dinou/rollup/rollup.config.js`:
```diff
--- a/dinou/rollup/rollup.config.js
+++ b/dinou/rollup/rollup.config.js
@@ -32,11 +32,7 @@ import rollupMemoryPlugin from "./rollup-plugins/rollup-plugin-memory.js";
 import rollupSwcPlugin from "./rollup-plugins/rollup-plugin-swc.js";
 import { generateRouteTypes } from "../core/generate-route-types.js";
 import { rollupContextualDinouPlugin } from "../core/resolve-contextual-dinou.js";
-import {
-  getDinouConfig,
-  prepareDist1ServerEntries,
-} from "../core/load-dinou-config.js";
-import { resolveSetupFiles } from "../core/resolve-setup-files.js";
+import { getDinouConfig } from "../core/load-dinou-config.js";
 import {
   loadEnvFiles,
   getRollupPublicEnvReplacements,
@@ -75,6 +71,10 @@ export default async function () {
       fs.rmSync(path.resolve(process.cwd(), ".dinou/dist1"), {
         recursive: true,
         force: true,
       });
+      fs.rmSync(path.resolve(process.cwd(), ".dinou/netlify"), {
+        recursive: true,
+        force: true,
+      });
     } catch (e) {}
   }
@@ -314,6 +314,29 @@ export default async function () {
       !isDevelopment && manifestGeneratorPlugin(),
       serverFunctionsPlugin({ serverFiles }),
       isDevelopment && rollupMemoryPlugin(),
+      !isDevelopment && {
+        name: "post-build-ssg",
+        closeBundle() {
+          const ssgArgs = [
+            "--conditions=react-server",
+            ...(isUnvendorizedRequested() ? ["--conditions=unvendorized"] : []),
+            path.resolve(__dirname, "../core/run-ssg.js"),
+          ];
+          const ssgRes = spawnSync(process.execPath, ssgArgs, {
+            stdio: "inherit",
+            env: {
+              ...process.env,
+              NODE_ENV: "production",
+              DINOU_BUILD_TOOL: "rollup",
+            },
+          });
+          if (ssgRes.status !== 0) {
+            throw new Error(
+              `[Dinou SSG] Static generation exited with code ${ssgRes.status ?? 1}`
+            );
+          }
+        },
+      },
     ].filter(Boolean),
@@ -356,108 +379,5 @@ export default async function () {
     },
   };
 
-  if (isDevelopment) {
-    return clientConfig;
-  }
-  ... [removes legacy serverConfig block]
-  return [clientConfig, serverConfig];
+  return clientConfig;
 };
```

#### `dinou/webpack/webpack.config.js`:
```diff
--- a/dinou/webpack/webpack.config.js
+++ b/dinou/webpack/webpack.config.js
@@ -2,7 +2,6 @@ import { loadReactServerWebpackPlugin } from "./helpers/patch-webpack-internals.
 import {
   loadEnvFiles,
   getWebpackPublicEnvDefines,
-  getEsbuildPublicEnvDefines,
 } from "../core/env.js";
@@ -29,11 +28,7 @@ import {
   hasPublicStylesCss,
   warnPublicStylesCssCollision,
 } from "../core/copy-static-dirs.js";
-import {
-  getDinouConfig,
-  prepareDist1ServerEntries,
-} from "../core/load-dinou-config.js";
-import { resolveSetupFiles } from "../core/resolve-setup-files.js";
+import { getDinouConfig } from "../core/load-dinou-config.js";
@@ -122,6 +117,7 @@ export default async () => {
     cleanDir(outputDir);
     if (!isDevelopment) {
       cleanDir(path.resolve(process.cwd(), ".dinou/dist1"));
+      cleanDir(path.resolve(process.cwd(), ".dinou/netlify"));
     } else {
@@ -174,25 +170,11 @@ export default async () => {
-  let clientDone = false;
-  let serverDone = false;
   let ssgExecuted = false;
 
   function runPostBuild() {
-    if (clientDone && serverDone && !ssgExecuted) {
+    if (!ssgExecuted) {
       ssgExecuted = true;
-      try {
-        fs.rmSync(path.resolve(process.cwd(), ".dinou/dist1/_entries"), {
-          recursive: true,
-          force: true,
-        });
-      } catch (e) {}
-      const serverDir = path.resolve(process.cwd(), ".dinou/dist1/server");
-      fs.mkdirSync(serverDir, { recursive: true });
-      fs.writeFileSync(
-        path.join(serverDir, "package.json"),
-        JSON.stringify({ type: "module" }, null, 2)
-      );
       const ssgArgs = [
@@ -691,8 +673,8 @@ export default async () => {
       !isDevelopment && {
         apply(compiler) {
-          compiler.hooks.done.tap("PostBuildClient", () => {
-            clientDone = true;
+          compiler.hooks.done.tap("PostBuildClient", (stats) => {
+            if (stats.hasErrors()) return;
             runPostBuild();
           });
         },
       },
@@ -802,106 +784,5 @@ export default async () => {
-  if (isDevelopment) {
-    return clientConfig;
-  }
-  ... [removes legacy serverConfig block]
-  return [clientConfig, serverConfig];
+  return clientConfig;
 };
```

#### `dinou/esbuild/plugins-esbuild/server-functions-plugin.js`:
```diff
--- a/dinou/esbuild/plugins-esbuild/server-functions-plugin.js
+++ b/dinou/esbuild/plugins-esbuild/server-functions-plugin.js
@@ -43,7 +43,8 @@ export default function serverFunctionsPlugin({
       // 1. TRANSFORM FILES DURING BUILD
       build.onLoad({ filter: sfFilter }, async (args) => {
         const normPath = args.path.replace(/\\/g, "/");
-        if (normPath.includes("/node_modules/") || normPath.includes("/.dinou/")) return null;
+        const relFromRoot = path.relative(root, args.path).replace(/\\/g, "/");
+        if (normPath.includes("/node_modules/") || relFromRoot.startsWith(".dinou/")) return null;
```

---

### 3.4 `dinou/adapters/netlify.js`, `dinou/adapters/cloudflare.js`, `dinou/adapters/bun.js` & `dinou/adapters/deno.js` (Complete Files)

#### `dinou/adapters/netlify.js`
```javascript
// dinou/adapters/netlify.js
// Netlify Functions v2 Adapter for Dinou (Pre-bundled AOT Dual-Bundle).
// Delegates to the standalone AOT Dual-Bundle in .dinou/netlify/functions/ssr.mjs
// (or .dinou/dist1/server/netlify.js) so dynamic SSR, TypeScript/JSX routes,
// Server Functions, and read-only AWS Lambda filesystems work with zero runtime flags.

import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { loadEnvFiles } from "../core/env.js";

if (typeof process !== "undefined" && process.env && !process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

if (
  typeof globalThis.AsyncLocalStorage === "undefined" &&
  typeof AsyncLocalStorage !== "undefined"
) {
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
}

const bundleCacheByCwd = new Map();

function resolveNetlifyBundlePath(cwd) {
  const dedicated = path.resolve(cwd, ".dinou/netlify/functions/ssr.mjs");
  if (fs.existsSync(dedicated)) {
    return dedicated;
  }
  const dist1Fallback = path.resolve(cwd, ".dinou/dist1/server/netlify.js");
  if (fs.existsSync(dist1Fallback)) {
    return dist1Fallback;
  }
  return null;
}

async function getNetlifyBundle(cwd) {
  const resolvedCwd = path.resolve(cwd || ".");
  const bundlePath = resolveNetlifyBundlePath(resolvedCwd);
  if (!bundlePath) {
    return null;
  }
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(bundlePath).mtimeMs;
  } catch (e) {}

  const cached = bundleCacheByCwd.get(bundlePath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.promise;
  }

  try {
    loadEnvFiles(resolvedCwd, { mode: "production" });
  } catch (e) {}

  const loadPromise = import(pathToFileURL(bundlePath).href).catch((err) => {
    bundleCacheByCwd.delete(bundlePath);
    console.error(`[Dinou Netlify Adapter] Failed to load ${bundlePath}:`, err);
    return null;
  });
  bundleCacheByCwd.set(bundlePath, { mtimeMs, promise: loadPromise });
  return loadPromise;
}

const initialCwd =
  typeof process !== "undefined" && typeof process.cwd === "function"
    ? process.cwd()
    : ".";
if (resolveNetlifyBundlePath(initialCwd)) {
  await getNetlifyBundle(initialCwd);
}

/**
 * Netlify Function v2 handler
 * @param {Request} request
 * @param {object} context
 * @returns {Promise<Response>}
 */
export default async function netlifyHandler(request, context) {
  const cwd =
    typeof process !== "undefined" && typeof process.cwd === "function"
      ? process.cwd()
      : initialCwd;
  const mod = await getNetlifyBundle(cwd);
  const fn =
    mod && typeof mod.default === "function"
      ? mod.default
      : mod && typeof mod.netlifyHandler === "function"
        ? mod.netlifyHandler
        : null;

  if (fn) {
    return fn(request, context);
  }

  return new Response(
    "Dinou Netlify bundle not found. Please run 'npm run build' or 'npx dinou build:netlify' first.",
    {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }
  );
}

export const config = {
  path: "/*",
  preferStatic: true,
};
```

#### `dinou/adapters/cloudflare.js`
```javascript
// dinou/adapters/cloudflare.js
// Cloudflare Workers Adapter for Dinou (AOT Dual-Bundle & Edge Fallback).
// Delegates to the pre-bundled .dinou/cloudflare/worker.js orchestrator when present,
// and preserves custom storage adapters + registered SSR renderers in direct edge usage.

import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { handleRequest } from "../core/handler.js";
import {
  setStorageAdapter,
  hasExplicitStorageAdapter,
  CloudflareKVStorage,
  MemoryStorage,
} from "../core/storage-adapter.js";
import {
  getStaticContentType,
  isPublicStaticAssetRequest,
  isReservedCloudflareDist2RequestPath,
} from "../core/static-assets.js";

if (typeof globalThis !== "undefined") {
  globalThis.__DINOU_RUNTIME__ = "edge";
}

const workerCacheByPath = new Map();

async function getPrebuiltCloudflareWorker() {
  try {
    if (
      typeof process === "undefined" ||
      typeof process.cwd !== "function" ||
      typeof fs.existsSync !== "function"
    ) {
      return null;
    }
    const workerPath = path.resolve(process.cwd(), ".dinou/cloudflare/worker.js");
    if (!fs.existsSync(workerPath)) {
      return null;
    }
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(workerPath).mtimeMs;
    } catch (e) {}
    const cached = workerCacheByPath.get(workerPath);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.promise;
    }
    const promise = import(pathToFileURL(workerPath).href).catch((err) => {
      workerCacheByPath.delete(workerPath);
      console.error("[Dinou Cloudflare Adapter] Failed to load .dinou/cloudflare/worker.js:", err);
      return null;
    });
    workerCacheByPath.set(workerPath, { mtimeMs, promise });
    return promise;
  } catch (e) {
    return null;
  }
}

let storageInitialized = false;

export default {
  /**
   * Cloudflare Workers fetch handler
   * @param {Request} request
   * @param {object} env Bindings (KV, D1, ASSETS, Environment variables)
   * @param {object} ctx Execution context (waitUntil, passThroughOnException)
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const prebuilt = await getPrebuiltCloudflareWorker();
    const prebuiltFetch =
      prebuilt?.default && typeof prebuilt.default.fetch === "function"
        ? prebuilt.default.fetch
        : typeof prebuilt?.fetch === "function"
          ? prebuilt.fetch
          : null;
    if (prebuiltFetch) {
      return prebuiltFetch(request, env, ctx);
    }

    const url = new URL(request.url);
    if (
      url.pathname.startsWith("/cdn-cgi/") ||
      isReservedCloudflareDist2RequestPath(url.pathname)
    ) {
      return new Response(null, { status: 404 });
    }

    if (!storageInitialized) {
      if (!hasExplicitStorageAdapter()) {
        if (env && env.DINOU_CACHE) {
          setStorageAdapter(new CloudflareKVStorage(env.DINOU_CACHE));
        } else {
          setStorageAdapter(new MemoryStorage());
        }
      }
      storageInitialized = true;
    }

    const isRSCPayload = url.pathname.includes("____rsc_");
    const isServerFunction =
      url.pathname.includes("____server_function____") ||
      request.headers.get("x-server-function-call") === "1";

    const isStaticAsset = isPublicStaticAssetRequest(url.pathname);

    if (
      !isRSCPayload &&
      !isServerFunction &&
      isStaticAsset &&
      env &&
      env.ASSETS &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      try {
        const assetRes = await env.ASSETS.fetch(
          request.clone ? request.clone() : request
        );
        if (assetRes && assetRes.status < 400) {
          const rawCt = (assetRes.headers.get("content-type") || "").trim();
          const lowerCt = rawCt.toLowerCase();
          const expectedCt = getStaticContentType(url.pathname);
          const needsContentTypeFix =
            !rawCt ||
            (lowerCt === "application/octet-stream" &&
              expectedCt !== "application/octet-stream") ||
            (url.pathname.toLowerCase().endsWith("/apple-app-site-association") &&
              !lowerCt.includes("json"));
          if (needsContentTypeFix) {
            const headers = new Headers(assetRes.headers);
            headers.set("content-type", expectedCt);
            return new Response(assetRes.body, {
              status: assetRes.status,
              statusText: assetRes.statusText,
              headers,
            });
          }
          return assetRes;
        }
      } catch (e) {}
    }

    const registeredSsr =
      typeof globalThis !== "undefined" &&
      typeof globalThis.__DINOU_RENDER_HTML_STREAM__ === "function"
        ? globalThis.__DINOU_RENDER_HTML_STREAM__
        : undefined;

    return handleRequest(request, {
      env,
      ctx,
      runtime: "edge",
      ...(registeredSsr ? { renderHtmlStream: registeredSsr } : {}),
    });
  },
};
```

#### `dinou/adapters/bun.js`
```javascript
// dinou/adapters/bun.js
// Native Bun Adapter for Dinou (Pre-bundled AOT).
// Serves the standalone pre-bundled server from .dinou/bun/server.js.

import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { loadEnvFiles } from "../core/env.js";

const cwd =
  typeof process !== "undefined" && typeof process.cwd === "function"
    ? process.cwd()
    : ".";
loadEnvFiles(cwd, { mode: "production" });

if (
  typeof globalThis.AsyncLocalStorage === "undefined" &&
  typeof AsyncLocalStorage !== "undefined"
) {
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
}

const isMain = Boolean(typeof import.meta !== "undefined" && import.meta.main);
const bundlePath = path.resolve(cwd, ".dinou/bun/server.js");

let bundleModule = null;
if (fs.existsSync(bundlePath)) {
  try {
    bundleModule = await import(pathToFileURL(bundlePath).href);
  } catch (e) {
    console.error("[Dinou Bun Adapter] Failed to load .dinou/bun/server.js:", e);
    if (isMain) {
      process.exit(1);
    }
  }
} else if (isMain) {
  console.error(
    "❌ [Dinou Bun Adapter] .dinou/bun/server.js not found. Please run 'npm run build:bun' first."
  );
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || undefined;
const IDLE_TIMEOUT = Number(process.env.IDLE_TIMEOUT || 120);

export async function fetch(req) {
  if (bundleModule && typeof bundleModule.fetch === "function") {
    return bundleModule.fetch(req);
  }
  if (
    bundleModule &&
    bundleModule.default &&
    typeof bundleModule.default.fetch === "function"
  ) {
    return bundleModule.default.fetch(req);
  }
  return new Response(
    "Dinou Bun bundle not found. Please run 'npm run build:bun' first.",
    {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }
  );
}

if (isMain && bundleModule) {
  console.log(
    `🚀 Dinou (Bun AOT Dual-Bundle) server running on http://${HOST || "localhost"}:${PORT}`
  );
}

export default {
  port: PORT,
  ...(HOST ? { hostname: HOST } : {}),
  fetch,
  idleTimeout: IDLE_TIMEOUT,
};

if (typeof process !== "undefined") {
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  if (process.stdin && typeof process.stdin.on === "function") {
    process.stdin.on("end", () => process.exit(0));
    process.stdin.on("close", () => process.exit(0));
    if (typeof process.stdin.unref === "function") {
      process.stdin.unref();
    }
  }
}
```

#### `dinou/adapters/deno.js`
```javascript
// dinou/adapters/deno.js
// Native Deno & Deno Deploy Adapter for Dinou (Pre-bundled AOT).
// Supports standalone containers, Deno CLI, and Deno Deploy Edge.

import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { loadEnvFiles } from "../core/env.js";

if (
  typeof globalThis.AsyncLocalStorage === "undefined" &&
  typeof AsyncLocalStorage !== "undefined"
) {
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
}

const isMain = Boolean(typeof import.meta !== "undefined" && import.meta.main);
const cwd = typeof Deno !== "undefined" ? Deno.cwd() : process.cwd();
try {
  loadEnvFiles(cwd, { mode: "production" });
} catch (e) {}
const mainBundlePath = path.resolve(cwd, ".dinou/deno/main.js");

let mainModule = null;
if (fs.existsSync(mainBundlePath)) {
  try {
    mainModule = await import(pathToFileURL(mainBundlePath).href);
  } catch (e) {
    console.error("[Dinou Deno Adapter] Failed to load .dinou/deno/main.js:", e);
    if (isMain) {
      if (typeof Deno !== "undefined" && typeof Deno.exit === "function") {
        Deno.exit(1);
      } else if (typeof process !== "undefined") {
        process.exit(1);
      }
    }
  }
} else if (isMain) {
  console.error(
    "❌ [Dinou Deno Adapter] .dinou/deno/main.js not found. Please run 'npm run build:deno' first."
  );
  if (typeof Deno !== "undefined" && typeof Deno.exit === "function") {
    Deno.exit(1);
  } else if (typeof process !== "undefined") {
    process.exit(1);
  }
}

const PORT = Number(
  (typeof Deno !== "undefined" ? Deno.env.get("PORT") : process.env.PORT) || 3000
);
const HOST =
  (typeof Deno !== "undefined" ? Deno.env.get("HOST") : process.env.HOST) ||
  undefined;

export async function fetch(req) {
  if (mainModule && typeof mainModule.fetch === "function") {
    return mainModule.fetch(req);
  }
  if (
    mainModule &&
    mainModule.default &&
    typeof mainModule.default.fetch === "function"
  ) {
    return mainModule.default.fetch(req);
  }
  return new Response(
    "Dinou bundle not found. Please run 'npm run build:deno' first.",
    {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }
  );
}

// Start standalone server if run directly in Deno
if (typeof Deno !== "undefined" && typeof Deno.serve === "function" && isMain) {
  Deno.serve(HOST ? { port: PORT, hostname: HOST } : { port: PORT }, fetch);
}

export default {
  port: PORT,
  ...(HOST ? { hostname: HOST } : {}),
  fetch,
};
```

---

### 3.5 `dinou/bun/build.js`, `dinou/deno/build.js`, `dinou/cloudflare/build.js`, `dinou/core/storage-adapter.js` & `dinou/cli.js`

#### `dinou/bun/build.js`:
```diff
--- a/dinou/bun/build.js
+++ b/dinou/bun/build.js
@@ -727,29 +727,35 @@ const rscEntryContent = `// Auto-generated RSC Engine entry for Bun (Dual-Bundle
 import "./env-setup.js";
 ${aotConfigPrelude}import "./route-modules.js";
 import * as edgeRenderer from "react-server-dom-webpack/server.edge";
+import { handleRequest as coreHandleRequest } from "${dinouDirSlash}/core/handler.js";
 globalThis.__DINOU_EDGE_RENDERER__ = edgeRenderer;
-export { handleRequest } from "${dinouDirSlash}/core/handler.js";
+export function handleRequest(request, platformContext) {
+  globalThis.__DINOU_EDGE_RENDERER__ = edgeRenderer;
+  return coreHandleRequest(request, platformContext);
+}
 `;
 ...
 const lowerMap = new Map();
-globalThis.__webpack_require__ = (id) => {
+const localWebpackRequire = (id) => {
   if (clientModules[id]) return clientModules[id];
   if (typeof id === "string") {
     if (lowerMap.size === 0) {
       for (const k of Object.keys(clientModules)) lowerMap.set(k.toLowerCase(), clientModules[k]);
     }
     const lowerVal = lowerMap.get(id.toLowerCase());
     if (lowerVal) return lowerVal;
   }
   console.error("[SSR Engine] Module not found in __webpack_require__:", id);
   return {};
 };
-globalThis.__webpack_require__.u = (chunkId) => "" + chunkId + ".js";
+localWebpackRequire.u = (chunkId) => "" + chunkId + ".js";
+globalThis.__webpack_require__ = localWebpackRequire;
 globalThis.__webpack_chunk_load__ = () => Promise.resolve();
 
 export async function renderHtml(rscStream, options = {}) {
+  globalThis.__webpack_require__ = localWebpackRequire;
   return renderRscStreamToHtmlStream(rscStream, ssrConsumerManifest, options);
 }
 `;
@@ -878,6 +884,10 @@ export async function fetch(req) {
   });
 }
 
+if (typeof import.meta !== "undefined" && import.meta.main) {
+  console.log(\`🚀 Dinou (Bun AOT Dual-Bundle) server running on http://\${process.env.HOST || "localhost"}:\${PORT}\`);
+}
+
 export default {
   port: PORT, ...(process.env.HOST ? { hostname: process.env.HOST } : {}),
   fetch,
```

*(Identical `handleRequest` `edgeRenderer` and `renderHtml` `localWebpackRequire` bindings applied to `dinou/cloudflare/build.js` lines 781–820 and `dinou/deno/build.js` lines 727–766.)*

#### `dinou/core/storage-adapter.js`:
```diff
--- a/dinou/core/storage-adapter.js
+++ b/dinou/core/storage-adapter.js
@@ -893,7 +893,9 @@ async function readDist2Fallback(storage, key, knownTags = []) {
     const cwd =
       typeof process !== "undefined" && typeof process.cwd === "function"
         ? process.cwd()
-        : null;
+        : typeof Deno !== "undefined" && typeof Deno.cwd === "function"
+          ? Deno.cwd()
+          : null;
     if (!cwd) return null;
```

#### `dinou/cli.js`:
```diff
--- a/dinou/cli.js
+++ b/dinou/cli.js
@@ -442,6 +442,38 @@ for (const t of nodeTargets) {
   }
 }
 
+// --- NETLIFY FUNCTIONS V2 ---
+
+const buildNetlifySteps = (bundler) => [bundlerStep(bundler, "node")];
+
+program
+  .command("build:netlify")
+  .description("Build the app for Netlify Serverless Functions v2 (using esbuild)")
+  .action(() => {
+    runProdSteps(buildNetlifySteps("esbuild"));
+  });
+
+program
+  .command("build:netlify:esbuild")
+  .description("Build the app for Netlify Serverless Functions v2 with Esbuild")
+  .action(() => {
+    runProdSteps(buildNetlifySteps("esbuild"));
+  });
+
+program
+  .command("build:netlify:rollup")
+  .description("Build the app for Netlify Serverless Functions v2 with Rollup")
+  .action(() => {
+    runProdSteps(buildNetlifySteps("rollup"));
+  });
+
+program
+  .command("build:netlify:webpack")
+  .description("Build the app for Netlify Serverless Functions v2 with Webpack")
+  .action(() => {
+    runProdSteps(buildNetlifySteps("webpack"));
+  });
+
 // --- CLOUDFLARE WORKERS ---
```

#### `dinou/index.d.ts` & `dinou/server.d.ts`:
```diff
--- a/dinou/index.d.ts
+++ b/dinou/index.d.ts
@@ -1,6 +1,6 @@
 // dinou/index.d.ts
 import { IncomingHttpHeaders } from "http";
-import type { StorageAdapter } from "./server";
+import type { StorageAdapter } from "./server.js";
```
```diff
--- a/dinou/server.d.ts
+++ b/dinou/server.d.ts
@@ -159,5 +159,5 @@ import type {
   ScopedLinkProps,
   ScopedLinkComponent,
-} from "./index";
+} from "./index.js";
```

---

## 4. `CHANGELOG.md` Entry (`9.4.0`)

```markdown
### Added
- **Dedicated AOT Dual-Bundle Netlify Functions v2 Output & CLI Commands**: Production builds (`dinou build`, `dinou build:node`, and new `dinou build:netlify[:esbuild|:rollup|:webpack]` commands) now emit a single-file, self-contained Netlify Functions v2 bundle at `.dinou/netlify/functions/ssr.mjs` (`config = { path: "/*", preferStatic: true }`), reducing `netlify.toml` `included_files` to `[".dinou/dist2/**"]` without bundling `node_modules/**` or `src/**`.

### Fixed
- **Netlify Functions v2 & `.dinou/dist1/server/` Dynamic SSR, `.tsx` Routes & Read-Only Lambda Compatibility**: Migrated `.dinou/netlify/functions/ssr.mjs`, `.dinou/dist1/server/{netlify.js,handler.js}`, and `dinou/adapters/netlify.js` to Dinou's AOT Dual-Bundle Engine (`rsc-engine` + `ssr-engine`) with `MemoryStorage({ hydrateFromDisk: true })` by default, `Netlify.env` unification, and `context.waitUntil()` ISR support—eliminating `500 Internal Server Error: No renderer available` on dynamic/404 routes, runtime `.tsx` import crashes without `--conditions=react-server`, and `EROFS` errors on AWS Lambda's read-only `/var/task` filesystem across Esbuild, Rollup, and Webpack.
- **Multi-Bundle React Dispatcher Isolation**: Scoped `globalThis.__DINOU_EDGE_RENDERER__` and `globalThis.__webpack_require__` per `handleRequest()` and `renderHtml()` invocation across Node, Netlify, Cloudflare, Bun, and Deno Dual-Bundles so multiple compiled bundles loaded in the same process never collide on internal `React` hook dispatchers.
- **Cloudflare, Bun & Deno Runtime Adapters (`dinou/adapters/{cloudflare,bun,deno}.js`)**: Updated `dinou/adapters/cloudflare.js` to delegate to `.dinou/cloudflare/worker.js` and preserve explicit storage adapters; propagated `HOST` (`hostname`) and enforced fail-fast non-zero exit codes when `dinou start:bun` or `dinou start:deno` are invoked without a prior production build.
- **Guaranteed `.dinou/dist2` Directory & Nested `.dinou` Esbuild Server Functions Guard**: `generate-static.js` now always creates `.dinou/dist2` even for 100% dynamic apps (preventing Docker `COPY` / Netlify `included_files` failures), `readDist2Fallback` falls back to `Deno.cwd()`, and Esbuild's `serverFunctionsPlugin` checks `.dinou/` relative to the project root instead of matching parent directory substrings.
```

---

## 5. Complete Automated Test Suites

### 5.1 Unit & Multi-Bundler Integration Test Suite (`tests/unit/deployment-adapters.test.mjs`)

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDinouRoot() {
  const candidates = [
    path.resolve(__dirname, "../../dinou"),
    path.resolve(process.cwd(), "dinou"),
    path.resolve(process.cwd(), "node_modules/dinou/dinou"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "cli.js"))) {
      return c;
    }
  }
  throw new Error("Unable to locate dinou/cli.js for deployment-adapters.test.mjs");
}

const dinouRoot = resolveDinouRoot();
const cliPath = path.join(dinouRoot, "cli.js");
const repoRoot = path.resolve(dinouRoot, "..");
const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-deploy-test-"));

test.after(() => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function writePackageShims(appDir) {
  const nmDinou = path.join(appDir, "node_modules", "dinou");
  fs.mkdirSync(path.join(nmDinou, "adapters"), { recursive: true });

  const relToDinou = (subpath, fromDir = nmDinou) => {
    const rel = path.relative(fromDir, path.join(dinouRoot, subpath)).replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  };

  fs.writeFileSync(
    path.join(nmDinou, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "9.4.0",
        type: "module",
        exports: {
          ".": "./index.js",
          "./server": "./server.js",
          "./config": "./config.js",
          "./adapters/node": "./adapters/node.js",
          "./adapters/bun": "./adapters/bun.js",
          "./adapters/deno": "./adapters/deno.js",
          "./adapters/cloudflare": "./adapters/cloudflare.js",
          "./adapters/netlify": "./adapters/netlify.js",
        },
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(nmDinou, "index.js"),
    `export * from ${JSON.stringify(relToDinou("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "server.js"),
    `export * from ${JSON.stringify(relToDinou("server.js"))};\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "config.js"),
    `export * from ${JSON.stringify(relToDinou("core/config.js"))};\nexport { default } from ${JSON.stringify(relToDinou("core/config.js"))};\n`
  );

  for (const adp of ["node", "bun", "deno", "cloudflare", "netlify"]) {
    const rel = relToDinou(`adapters/${adp}.js`, path.join(nmDinou, "adapters"));
    fs.writeFileSync(
      path.join(nmDinou, `adapters/${adp}.js`),
      `export * from ${JSON.stringify(rel)};\nexport { default } from ${JSON.stringify(rel)};\n`
    );
  }

  for (const peerPkg of ["react", "react-dom"]) {
    const srcPkg = path.join(repoRoot, "node_modules", peerPkg);
    const destPkg = path.join(appDir, "node_modules", peerPkg);
    if (fs.existsSync(srcPkg) && !fs.existsSync(destPkg)) {
      fs.cpSync(srcPkg, destPkg, { recursive: true });
    }
  }
  const srcScheduler = path.join(repoRoot, "node_modules", "scheduler");
  const destScheduler = path.join(appDir, "node_modules", "scheduler");
  if (fs.existsSync(srcScheduler) && !fs.existsSync(destScheduler)) {
    fs.cpSync(srcScheduler, destScheduler, { recursive: true });
  }
}

function createFixtureApp(name, { dynamicOnly = false } = {}) {
  const dir = path.join(tmpBase, name);
  fs.mkdirSync(path.join(dir, "src", "dynamic"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "posts", "[slug]"), { recursive: true });
  fs.mkdirSync(path.join(dir, "public"), { recursive: true });

  writePackageShims(dir);

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: `fixture-${name}`,
        private: true,
        type: "module",
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          paths: {
            "@/*": ["./src/*"],
          },
        },
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dir, ".env.production"),
    "DINOU_PUBLIC_APP_STAGE=prod-verify\nSERVER_SECRET_TOKEN=top-secret-42\n"
  );

  fs.writeFileSync(
    path.join(dir, "public", "robots.txt"),
    "User-agent: *\nAllow: /\n"
  );

  fs.writeFileSync(
    path.join(dir, "dinou.config.ts"),
    `import { defineConfig } from "dinou";

export default defineConfig({
  plugins: [
    {
      name: "deploy-header-plugin",
      onRequest(_req, ctx) {
        ctx.res.setHeader("x-deploy-plugin", "active");
      },
    },
  ],
});
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "actions.ts"),
    `"use server";
import { getContext } from "dinou/server";

export async function echoAction(input: string) {
  const { env } = getContext();
  return {
    echoed: input.toUpperCase(),
    hasSecret: Boolean(env.SERVER_SECRET_TOKEN),
  };
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "client-badge.tsx"),
    `"use client";
import { echoAction } from "@/actions";

export function ClientBadge({ label }: { label: string }) {
  return (
    <span
      data-client-badge={label}
      data-public-stage={process.env.DINOU_PUBLIC_APP_STAGE}
      data-has-action={String(typeof echoAction === "function")}
    >
      {label}
    </span>
  );
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "layout.tsx"),
    `import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Deploy Fixture</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "not_found.tsx"),
    `export default function NotFoundPage() {
  return <main data-not-found="custom-404">Custom 404 Not Found</main>;
}
`
  );

  if (dynamicOnly) {
    fs.writeFileSync(
      path.join(dir, "src", "page_functions.ts"),
      `export const revalidate = 0;\n`
    );
  }

  fs.writeFileSync(
    path.join(dir, "src", "page.tsx"),
    `import { ClientBadge } from "@/client-badge";

export default function HomePage() {
  return (
    <main data-route="home" data-build-tool={process.env.DINOU_BUILD_TOOL}>
      <h1>Static Home</h1>
      <ClientBadge label="hydrated-ok" />
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "dynamic", "page_functions.ts"),
    `export const revalidate = 0;\n`
  );

  fs.writeFileSync(
    path.join(dir, "src", "dynamic", "page.tsx"),
    `import { getContext } from "dinou/server";
import { ClientBadge } from "@/client-badge";

export default function DynamicPage() {
  const { req, env } = getContext();
  const user = String(req.query.user || "anon");
  const netlifyFlag = String(env.NETLIFY_REGION || "none");
  const secret = String(env.SERVER_SECRET_TOKEN || "missing");
  return (
    <main
      data-route="dynamic"
      data-user={user}
      data-region={netlifyFlag}
      data-secret={secret}
    >
      <ClientBadge label={user} />
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "posts", "[slug]", "page.tsx"),
    `export default function PostPage({ params }: { params: { slug: string } }) {
  return <article data-post-slug={params.slug}>Post: {params.slug}</article>;
}
`
  );

  return dir;
}

function runDinouCli(cwd, args, extraEnv = {}) {
  const nodePathEntries = [
    path.join(cwd, "node_modules"),
    path.join(repoRoot, "node_modules"),
    path.join(dinouRoot, "node_modules"),
  ].filter((p) => fs.existsSync(p));

  const res = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_PATH: nodePathEntries.join(path.delimiter),
      ...extraEnv,
    },
  });
  assert.equal(
    res.status,
    0,
    `dinou ${args.join(" ")} failed (status ${res.status}):\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
  );
  return res;
}

test("Netlify Functions v2 & .dinou/dist1/server AOT Dual-Bundle work in plain Node without src/ or --conditions=react-server across Esbuild, Rollup, and Webpack", async () => {
  for (const bundler of ["esbuild", "rollup", "webpack"]) {
    const dir = createFixtureApp(`netlify-${bundler}`);
    const cmd = bundler === "esbuild" ? "build:netlify" : `build:netlify:${bundler}`;
    runDinouCli(dir, [cmd]);

    const fnFiles = fs.readdirSync(path.join(dir, ".dinou/netlify/functions")).sort();
    assert.deepEqual(fnFiles, ["package.json", "ssr.mjs"]);

    assert.equal(fs.existsSync(path.join(dir, ".dinou/dist1/server/handler.js")), true);
    assert.equal(fs.existsSync(path.join(dir, ".dinou/dist1/server/netlify.js")), true);
    assert.equal(fs.existsSync(path.join(dir, ".dinou/dist1/server/package.json")), true);

    // Delete src/ and dinou.config.ts to simulate AWS Lambda deployed bundle
    fs.rmSync(path.join(dir, "src"), { recursive: true, force: true });
    fs.rmSync(path.join(dir, "dinou.config.ts"), { force: true });

    const beforeDist2Entries = fs.readdirSync(path.join(dir, ".dinou/dist2"));

    const runnerScript = path.join(dir, "verify-lambda.mjs");
    fs.writeFileSync(
      runnerScript,
      `import assert from "node:assert/strict";
import netlifySsr, { config } from "./.dinou/netlify/functions/ssr.mjs";
import adapterNetlify, { config as adapterConfig } from "dinou/adapters/netlify";
import dist1Handler from "./.dinou/dist1/server/handler.js";

assert.deepEqual(config, { path: "/*", preferStatic: true });
assert.deepEqual(adapterConfig, { path: "/*", preferStatic: true });

globalThis.Netlify = {
  env: {
    toObject: () => ({ NETLIFY_REGION: "eu-central-1" }),
  },
};

const waitUntilPromises = [];
const mockContext = {
  waitUntil(p) {
    waitUntilPromises.push(p);
  },
};

const homeRes = await netlifySsr(new Request("https://example.netlify.app/"), mockContext);
assert.equal(homeRes.status, 200);
assert.equal(homeRes.headers.get("x-deploy-plugin"), "active");
const homeHtml = await homeRes.text();
assert.equal(homeHtml.includes('data-route="home"'), true);
assert.equal(homeHtml.includes('data-build-tool="${bundler}"'), true);
assert.equal(homeHtml.includes('data-public-stage="prod-verify"'), true);

const dynRes = await adapterNetlify(
  new Request("https://example.netlify.app/dynamic?user=alice"),
  mockContext
);
assert.equal(dynRes.status, 200);
assert.equal(dynRes.headers.get("x-deploy-plugin"), "active");
const dynHtml = await dynRes.text();
assert.equal(dynHtml.includes('data-route="dynamic"'), true);
assert.equal(dynHtml.includes('data-user="alice"'), true);
assert.equal(dynHtml.includes('data-region="eu-central-1"'), true);
assert.equal(dynHtml.includes('data-secret="top-secret-42"'), true);

const isgRes = await netlifySsr(
  new Request("https://example.netlify.app/posts/serverless-post"),
  mockContext
);
assert.equal(isgRes.status, 200);
assert.equal((await isgRes.text()).includes('data-post-slug="serverless-post"'), true);

const sfRes = await netlifySsr(
  new Request("https://example.netlify.app/____server_function____", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-server-function-call": "1",
      origin: "https://example.netlify.app",
      host: "example.netlify.app",
    },
    body: JSON.stringify({
      id: "file:///src/actions.ts#echoAction",
      args: ["hello netlify"],
    }),
  }),
  mockContext
);
assert.equal(sfRes.status, 200);
const sfBody = await sfRes.text();
assert.equal(sfBody.includes("HELLO NETLIFY"), true);
assert.equal(sfBody.includes('"hasSecret":true'), true);

const nfRes = await netlifySsr(
  new Request("https://example.netlify.app/missing-route"),
  mockContext
);
assert.equal(nfRes.status, 404);
assert.equal((await nfRes.text()).includes('data-not-found="custom-404"'), true);

const hRes = await dist1Handler(new Request("https://example.com/dynamic?user=bob"));
assert.equal(hRes.status, 200);
assert.equal((await hRes.text()).includes('data-user="bob"'), true);

await Promise.all(waitUntilPromises);
console.log("LAMBDA_OK_${bundler}");
`
    );

    const lambdaRun = spawnSync(process.execPath, [runnerScript], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    assert.equal(
      lambdaRun.status,
      0,
      `Plain Node Lambda test failed for ${bundler}:\nSTDOUT:\n${lambdaRun.stdout}\nSTDERR:\n${lambdaRun.stderr}`
    );
    assert.equal(lambdaRun.stdout.includes(`LAMBDA_OK_${bundler}`), true);

    const afterDist2Entries = fs.readdirSync(path.join(dir, ".dinou/dist2"));
    assert.deepEqual(afterDist2Entries, beforeDist2Entries);
  }
});

test("Cloudflare Workers build & dinou/adapters/cloudflare delegate cleanly with ASSETS & reserved namespace isolation", async () => {
  const dir = createFixtureApp("cloudflare-verify");
  runDinouCli(dir, ["build:cloudflare"]);

  assert.equal(fs.existsSync(path.join(dir, ".dinou/cloudflare/worker.js")), true);
  assert.equal(fs.existsSync(path.join(dir, ".dinou/cloudflare/assets/robots.txt")), true);
  assert.equal(
    fs.existsSync(path.join(dir, ".dinou/cloudflare/assets/__dinou_dist2/index.html")),
    true
  );

  fs.rmSync(path.join(dir, "src"), { recursive: true, force: true });

  const cfTestScript = path.join(dir, "verify-cf.mjs");
  fs.writeFileSync(
    cfTestScript,
    `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import cfAdapter from "dinou/adapters/cloudflare";

const assetsRoot = path.resolve(".dinou/cloudflare/assets");
const mockEnv = {
  SERVER_SECRET_TOKEN: "cf-edge-secret",
  NETLIFY_REGION: "cf-pop-mad",
  ASSETS: {
    async fetch(req) {
      const u = new URL(req.url);
      const rel = u.pathname.replace(/^\\/+/, "");
      const fp = path.join(assetsRoot, rel);
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        return new Response(fs.readFileSync(fp), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    },
  },
};
const mockCtx = { waitUntil() {} };

const robotsRes = await cfAdapter.fetch(new Request("https://workers.dev/robots.txt"), mockEnv, mockCtx);
assert.equal(robotsRes.status, 200);
assert.equal((await robotsRes.text()).includes("User-agent: *"), true);

const blockedRes = await cfAdapter.fetch(new Request("https://workers.dev/__dinou_dist2/index.html"), mockEnv, mockCtx);
assert.equal(blockedRes.status, 404);

const homeRes = await cfAdapter.fetch(new Request("https://workers.dev/"), mockEnv, mockCtx);
assert.equal(homeRes.status, 200);
assert.equal(homeRes.headers.get("x-deploy-plugin"), "active");
assert.equal((await homeRes.text()).includes('data-route="home"'), true);

const dynRes = await cfAdapter.fetch(new Request("https://workers.dev/dynamic?user=edge"), mockEnv, mockCtx);
assert.equal(dynRes.status, 200);
const dynHtml = await dynRes.text();
assert.equal(dynHtml.includes('data-user="edge"'), true);
assert.equal(dynHtml.includes('data-secret="cf-edge-secret"'), true);
console.log("CF_OK");
`
  );

  const cfRun = spawnSync(process.execPath, [cfTestScript], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  assert.equal(
    cfRun.status,
    0,
    `Cloudflare adapter test failed:\nSTDOUT:\n${cfRun.stdout}\nSTDERR:\n${cfRun.stderr}`
  );
  assert.equal(cfRun.stdout.includes("CF_OK"), true);
});

test("Node AOT orchestrator, Dynamic-only .dinou/dist2 guarantee, and export-static work end-to-end", async () => {
  const dynDir = createFixtureApp("dynamic-only", { dynamicOnly: true });
  runDinouCli(dynDir, ["build:node"]);
  assert.equal(fs.existsSync(path.join(dynDir, ".dinou/dist2")), true);

  fs.rmSync(path.join(dynDir, "src"), { recursive: true, force: true });
  const nodeVerifyScript = path.join(dynDir, "verify-node.mjs");
  fs.writeFileSync(
    nodeVerifyScript,
    `import assert from "node:assert/strict";
import { fetch as nodeFetch } from "./.dinou/node/server.mjs";

const dynRes = await nodeFetch(new Request("http://127.0.0.1:3000/dynamic?user=node-aot"));
assert.equal(dynRes.status, 200);
assert.equal(dynRes.headers.get("x-deploy-plugin"), "active");
assert.equal((await dynRes.text()).includes('data-user="node-aot"'), true);

const rangeRes = await nodeFetch(new Request("http://127.0.0.1:3000/robots.txt", {
  headers: { Range: "bytes=0-10" },
}));
assert.equal(rangeRes.status, 206);
assert.equal(await rangeRes.text(), "User-agent:");
console.log("NODE_AOT_OK");
`
  );
  const nodeRun = spawnSync(process.execPath, [nodeVerifyScript], {
    cwd: dynDir,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  assert.equal(nodeRun.status, 0, nodeRun.stderr);
  assert.equal(nodeRun.stdout.includes("NODE_AOT_OK"), true);

  const staticDir = createFixtureApp("static-export");
  runDinouCli(staticDir, ["export-static"]);
  assert.equal(fs.existsSync(path.join(staticDir, "out/index.html")), true);
  assert.equal(fs.existsSync(path.join(staticDir, "out/page.rsc")), true);
  assert.equal(fs.existsSync(path.join(staticDir, "out/robots.txt")), true);
  const exportedHtml = fs.readFileSync(path.join(staticDir, "out/index.html"), "utf8");
  assert.equal(exportedHtml.includes("window.__DINOU_STATIC_EXPORT__=true"), true);
});
```

---

### 5.2 Playwright E2E Test Suite (`tests/e2e/deployment.spec.ts`)

```typescript
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDinouRoot(): string {
  const candidates = [
    path.resolve(__dirname, "../../dinou"),
    path.resolve(process.cwd(), "dinou"),
    path.resolve(process.cwd(), "node_modules/dinou/dinou"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "cli.js"))) {
      return c;
    }
  }
  throw new Error("Could not locate dinou/cli.js");
}

const dinouRoot = resolveDinouRoot();
const cliPath = path.join(dinouRoot, "cli.js");
const repoRoot = path.resolve(dinouRoot, "..");

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function createDeploymentE2EApp(baseDir: string): string {
  const appDir = path.join(baseDir, "deploy-e2e-app");
  fs.mkdirSync(path.join(appDir, "src", "dynamic"), { recursive: true });
  fs.mkdirSync(path.join(appDir, "public"), { recursive: true });

  const nmDinou = path.join(appDir, "node_modules", "dinou");
  fs.mkdirSync(path.join(nmDinou, "adapters"), { recursive: true });

  const relToDinou = (subpath: string, fromDir = nmDinou): string => {
    const rel = path.relative(fromDir, path.join(dinouRoot, subpath)).replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  };

  fs.writeFileSync(
    path.join(nmDinou, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "9.4.0",
        type: "module",
        exports: {
          ".": "./index.js",
          "./server": "./server.js",
          "./config": "./config.js",
          "./adapters/netlify": "./adapters/netlify.js",
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(nmDinou, "index.js"),
    `export * from ${JSON.stringify(relToDinou("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "server.js"),
    `export * from ${JSON.stringify(relToDinou("server.js"))};\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "config.js"),
    `export * from ${JSON.stringify(relToDinou("core/config.js"))};\nexport { default } from ${JSON.stringify(relToDinou("core/config.js"))};\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "adapters/netlify.js"),
    `export * from ${JSON.stringify(relToDinou("adapters/netlify.js", path.join(nmDinou, "adapters")))};\nexport { default } from ${JSON.stringify(relToDinou("adapters/netlify.js", path.join(nmDinou, "adapters")))};\n`
  );

  for (const pkg of ["react", "react-dom", "scheduler"]) {
    const srcPkg = path.join(repoRoot, "node_modules", pkg);
    const destPkg = path.join(appDir, "node_modules", pkg);
    if (fs.existsSync(srcPkg) && !fs.existsSync(destPkg)) {
      fs.cpSync(srcPkg, destPkg, { recursive: true });
    }
  }

  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify({ name: "deploy-e2e-app", private: true, type: "module" }, null, 2)
  );

  fs.writeFileSync(
    path.join(appDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          paths: { "@/*": ["./src/*"] },
        },
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(appDir, ".env.production"),
    "DINOU_PUBLIC_DEPLOY_BADGE=netlify-v2-ready\nSECRET_API_KEY=live-secret-99\n"
  );

  fs.writeFileSync(
    path.join(appDir, "src", "actions.ts"),
    `"use server";
import { getContext } from "dinou/server";

export async function pingServerAction(name: string) {
  const { env } = getContext();
  return \`Pong \${name} (\${env.SECRET_API_KEY})\`;
}
`
  );

  fs.writeFileSync(
    path.join(appDir, "src", "interactive-ping.tsx"),
    `"use client";
import { useState } from "react";
import { pingServerAction } from "@/actions";

export function InteractivePing() {
  const [reply, setReply] = useState("idle");
  return (
    <div>
      <span data-testid="public-badge">{process.env.DINOU_PUBLIC_DEPLOY_BADGE}</span>
      <button
        data-testid="ping-btn"
        onClick={async () => {
          const res = await pingServerAction("Edge");
          setReply(res);
        }}
      >
        Ping Server
      </button>
      <p data-testid="ping-reply">{reply}</p>
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(appDir, "src", "layout.tsx"),
    `import type { ReactNode } from "react";
import { Link } from "dinou";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Deploy E2E</title>
      </head>
      <body>
        <nav>
          <Link href="/" data-testid="nav-home">Home</Link>
          <Link href="/dynamic?visitor=playwright" data-testid="nav-dynamic">Dynamic</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(appDir, "src", "page.tsx"),
    `import { InteractivePing } from "@/interactive-ping";

export default function HomePage() {
  return (
    <main>
      <h1 data-testid="home-heading">Pre-Rendered Static Home</h1>
      <InteractivePing />
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(appDir, "src", "dynamic", "page_functions.ts"),
    `export const revalidate = 0;\n`
  );

  fs.writeFileSync(
    path.join(appDir, "src", "dynamic", "page.tsx"),
    `import { getContext } from "dinou/server";

export default function DynamicPage() {
  const { req, env } = getContext();
  return (
    <main>
      <h1 data-testid="dyn-heading">Visitor: {String(req.query.visitor || "guest")}</h1>
      <p data-testid="dyn-region">Region: {String(env.NETLIFY_REGION || "local")}</p>
    </main>
  );
}
`
  );

  return appDir;
}

test.describe("Deployment Targets E2E (Netlify Functions v2 Simulator & Static Export)", () => {
  let tmpDir: string;
  let appDir: string;
  let serverProcess: ChildProcess | null = null;

  test.beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-e2e-deploy-"));
    appDir = createDeploymentE2EApp(tmpDir);
    const buildRes = spawnSync(process.execPath, [cliPath, "build:netlify"], {
      cwd: appDir,
      encoding: "utf8",
    });
    expect(buildRes.status).toBe(0);

    // Delete src/ to simulate serverless deployment with only .dinou/netlify/functions + .dinou/dist2 + .dinou/dist3
    fs.rmSync(path.join(appDir, "src"), { recursive: true, force: true });
  });

  test.afterEach(() => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess = null;
    }
  });

  test.afterAll(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("Netlify Functions v2 ssr.mjs + static CDN simulator hydrates React 19, executes Server Functions, and SPA-navigates to dynamic SSR", async ({
    page,
  }) => {
    const port = await getFreePort();
    const simPath = path.join(appDir, "netlify-cdn-sim.mjs");
    const staticAssetsUrl = pathToFileURL(
      path.join(dinouRoot, "core/static-assets.js")
    ).href;

    fs.writeFileSync(
      simPath,
      `import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import netlifyHandler, { config } from "./.dinou/netlify/functions/ssr.mjs";
import { getStaticContentType, resolveConfinedStaticFile, normalizePublicRequestPath } from ${JSON.stringify(staticAssetsUrl)};

globalThis.Netlify = {
  env: {
    toObject: () => ({ NETLIFY_REGION: "us-east-1" }),
  },
};

const dist3Dir = path.resolve(".dinou/dist3");
const port = Number(process.env.PORT);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", \`http://127.0.0.1:\${port}\`);

  // Simulate Netlify preferStatic: true CDN static asset serving from .dinou/dist3
  if (config.preferStatic && (req.method === "GET" || req.method === "HEAD")) {
    const clean = normalizePublicRequestPath(url.pathname);
    if (clean) {
      const fp = resolveConfinedStaticFile(dist3Dir, clean);
      if (fp && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        res.statusCode = 200;
        res.setHeader("content-type", getStaticContentType(clean));
        res.end(fs.readFileSync(fp));
        return;
      }
    }
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((item) => headers.append(k, item));
    else if (v !== undefined) headers.set(k, v);
  }
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await new Promise((resolve) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
        });

  const webReq = new Request(url.href, { method: req.method, headers, body });
  const webRes = await netlifyHandler(webReq, { waitUntil() {} });

  res.statusCode = webRes.status;
  webRes.headers.forEach((v, k) => res.setHeader(k, v));
  if (webRes.body) {
    Readable.fromWeb(webRes.body).pipe(res);
  } else {
    res.end();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(\`NETLIFY_SIM_READY:\${port}\`);
});
`
    );

    serverProcess = spawn(process.execPath, [simPath], {
      cwd: appDir,
      env: { ...process.env, PORT: String(port), NODE_OPTIONS: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out starting Netlify simulator")), 10000);
      serverProcess!.stdout!.on("data", (chunk) => {
        if (String(chunk).includes(`NETLIFY_SIM_READY:${port}`)) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.getByTestId("home-heading")).toHaveText("Pre-Rendered Static Home");
    await expect(page.getByTestId("public-badge")).toHaveText("netlify-v2-ready");

    // Invoke Server Function on simulated Netlify Function v2
    await page.getByTestId("ping-btn").click();
    await expect(page.getByTestId("ping-reply")).toHaveText("Pong Edge (live-secret-99)");

    // Soft SPA navigation via <Link> to dynamic SSR route
    await page.getByTestId("nav-dynamic").click();
    await expect(page.getByTestId("dyn-heading")).toHaveText("Visitor: playwright");
    await expect(page.getByTestId("dyn-region")).toHaveText("Region: us-east-1");
  });
});
```
