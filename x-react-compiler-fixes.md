# React Compiler Multi-Bundler Integration, `"use server"` Isolation, Vendor Resolution & `DinouConfig.reactCompiler` Fixes (`v9.4.0`)

## Executive Summary

During the `/docs/compiler` (*React Compiler & StrictMode*) audit against `dinou@9.4.0`, three upstream bugs and one configuration enhancement were identified and resolved across **Esbuild**, **Rollup**, and **Webpack**:

1. **Esbuild Production Skipped All Child Components & Custom Hooks Without `"use client"` (Critical)**:
   - `dinou/esbuild/plugins-esbuild/babel-react-compiler-plugin.js` previously exited early via `if (!isAnEntryPoint) return;`. Because `getEsbuildEntries` only registers root `"use client"` files (plus Dinou internal framework files) in `entryPoints`, **every child component and custom hook** imported inside a client boundary that did not repeat `"use client"` at the top of its own file (e.g., `OrderSummary.tsx`, UI primitives like `Button.tsx`, custom hooks like `useIsMobile.ts`) was **100% skipped by the React Compiler** in Dinou's default bundler (`esbuild`), while Dinou's own internal `dinou/core/*` files *were* unnecessarily compiled through Babel when ejected.
   - Furthermore, in `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`, `babelReactCompilerPlugin()` was placed **before** `serverFunctionsPlugin({ manifestData, serverFiles })`. In `esbuild`, the first `onLoad` hook returning `{ contents }` wins—meaning compiling the full client module graph without reordering and `"use server"` guards would intercept `"use server"` files before `serverFunctionsPlugin` converts them into RPC proxies.
2. **Rollup Production Executed `babel-plugin-react-compiler` Before `serverFunctionsPlugin` on `"use server"` Modules (High)**:
   - Unlike Webpack loaders (which run bottom-to-top: `server-functions-loader` → `babel-loader`), Rollup `transform` hooks run top-to-bottom unless ordered explicitly. In `dinou/rollup/rollup.config.js`, `babel(...)` (line 165) ran **before** `serverFunctionsPlugin({ serverFiles })` (line 213), causing Babel + `babel-plugin-react-compiler` to rewrite `"use server"` modules (especially inline `"use server"` functions and TypeScript actions) with `$ = _c(N)` memo-cache slots *before* `serverFunctionsPlugin` extracted exports and replaced them with client RPC proxies.
   - Note: `serverFunctionsPlugin.generateBundle` must still run *after* `manifestGeneratorPlugin.generateBundle` (to read `manifest["serverFunctionProxy.js"]`) and *before* `rollupMemoryPlugin`. Using Rollup 4's `transform: { order: "pre", handler(code, id) { ... } }` inside `rollup-plugin-server-functions.js` guarantees `"use server"` modules are converted to lightweight RPC proxies **before** `babel` (and `rollupSwcPlugin`), while preserving exact `generateBundle` ordering.
3. **Vendorized `#babel/*`, `#babel-plugin-react-compiler`, `#babel-loader`, and `#rollup-plugin-delete` Module Resolution in Isolated `node_modules` / Ejected Mode (Medium-High)**:
   - `dinou/package.json` pre-bundles `#babel/preset-react`, `#babel/preset-typescript`, `#babel/plugin-syntax-import-meta`, `#babel-plugin-react-compiler`, `#babel-loader`, and `#rollup-plugin-delete` under `dinou/compiled/*` so projects work with zero hoisted Babel dependencies (e.g., strict `pnpm` or after `npx dinou eject`).
   - However, `babel-react-compiler-plugin.js`, `rollup.config.js`, and `webpack.config.js` passed bare string names (`"babel-plugin-react-compiler"`, `"@babel/preset-react"`, `"babel-loader"`, `"rollup-plugin-delete"`), causing Babel/Webpack to resolve them from the user's project directory and fail when not hoisted in root `node_modules`.
4. **Global `reactCompiler?: boolean` Option in `DinouConfig` (`dinou.config.ts`)**:
   - Added `reactCompiler?: boolean` (`@default true`) to `DinouConfig` in `dinou/index.d.ts` and wired it across `esbuild/build.js` + `get-config-esbuild-prod.js`, `rollup/rollup.config.js`, and `webpack/webpack.config.js` alongside `configFile: false, babelrc: false` for deterministic builds across all three bundlers.

---

## Root-Cause & Architectural Details

### 1. Esbuild Full-Graph Client Compilation & Plugin Ordering
- **Plugin Order (`dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`)**:
  - Moved `reactCompiler && babelReactCompilerPlugin({ serverFiles })` to run **after** `serverFunctionsPlugin({ manifestData, serverFiles })` and right **before** `writePlugin()`.
  - Any `"use server"` module imported by a Client Component is intercepted first by `serverFunctionsPlugin` and replaced with its `/__SERVER_FUNCTION_PROXY__` stub.
- **Scoping & Defense-in-Depth (`dinou/esbuild/plugins-esbuild/babel-react-compiler-plugin.js`)**:
  - Removed the `isAnEntryPoint` restriction so root `"use client"` components, transitive child components without `"use client"`, and custom hooks (`use*`) are all compiled with `babel-plugin-react-compiler`.
  - Restricted `onLoad` to `{ filter: /\.[jt]sx?$/, namespace: "file" }` so virtual CSS/asset modules are untouched.
  - Skips `/node_modules/`, `/.dinou/`, Dinou's own internal runtime directory (`dinouRootPrefix`, covering both `node_modules/dinou` and ejected `./dinou`), `serverFilesSet`, and any non-`"use client"` file matching `useServerRegex` or `hasServerFunctions(source)`.
  - Added `pluginSyntaxImportMeta` (`#babel/plugin-syntax-import-meta`) for parity with Rollup and Webpack when client modules access `import.meta.env` or `import.meta.url`.
  - Changed `sourceMaps` to `build.initialOptions.sourcemap ? "inline" : false` to avoid wasted sourcemap generation when `sourcemap: false` while properly chaining inline sourcemaps into esbuild when enabled.

### 2. Rollup Pre-Transform Server Function Extraction
- **`dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js`**:
  - Upgraded `transform(code, id)` to `transform: { order: "pre", handler(code, id) { ... } }` with an extension fast-path (`if (!/\.[jt]sx?($|\?)/.test(id)) return null;`).
  - Ensures `"use server"` modules are converted into two-line JS RPC proxy stubs *before* Babel (`babel-plugin-react-compiler`) or SWC (`rollupSwcPlugin`) parses them, while keeping `generateBundle` running after `manifestGeneratorPlugin`.

### 3. Vendor Subpath Imports & `DinouConfig.reactCompiler`
- Imported `#babel/preset-react`, `#babel/preset-typescript`, `#babel/plugin-syntax-import-meta`, and `#babel-plugin-react-compiler` directly in `babel-react-compiler-plugin.js`, `rollup.config.js`, and `webpack.config.js`, unwrapping ESM/CJS interop via `const unwrapBabel = (mod) => mod?.default ?? mod;`.
- Resolved `#babel-loader` in `webpack.config.js` via `createRequire(import.meta.url).resolve("#babel-loader")` and `#rollup-plugin-delete` in `rollup.config.js` via `await import("#rollup-plugin-delete")`. Both resolve to `dinou/compiled/*` in Vendor Mode and to `node_modules/*` under `--conditions=unvendorized`.

---

## Unified Diffs

### 1. `dinou/index.d.ts`

```diff
--- a/dinou/index.d.ts
+++ b/dinou/index.d.ts
@@ -170,6 +170,14 @@
 }
 
 export interface DinouConfig {
+  /**
+   * Enable or disable the React Compiler (`babel-plugin-react-compiler`) during production builds.
+   * Applies across all supported bundlers (Esbuild, Rollup, and Webpack).
+   * Individual components or hooks can also opt out locally with the `"use no memo"` directive.
+   * @default true
+   */
+  reactCompiler?: boolean;
+
   /**
    * Enable or disable React StrictMode in development mode.
    * When enabled, React double-invokes render and effect functions in development to catch side-effects.
```

### 2. `dinou/esbuild/plugins-esbuild/babel-react-compiler-plugin.js`

```diff
--- a/dinou/esbuild/plugins-esbuild/babel-react-compiler-plugin.js
+++ b/dinou/esbuild/plugins-esbuild/babel-react-compiler-plugin.js
@@ -1,56 +1,98 @@
-import babel from "#babel/core";
+import babelModule from "#babel/core";
+import presetReactModule from "#babel/preset-react";
+import presetTypescriptModule from "#babel/preset-typescript";
+import pluginSyntaxImportMetaModule from "#babel/plugin-syntax-import-meta";
+import pluginReactCompilerModule from "#babel-plugin-react-compiler";
 import fs from "node:fs/promises";
 import path from "node:path";
-const norm = (p) => path.resolve(p).replace(/\\/g, "/");
-export default function babelReactCompilerPlugin() {
+import { fileURLToPath } from "node:url";
+import { useClientRegex, useServerRegex } from "../../constants.js";
+import { hasServerFunctions } from "../../core/transform-server-functions.js";
+
+const unwrapBabel = (mod) => mod?.default ?? mod;
+const babel = unwrapBabel(babelModule);
+const presetReact = unwrapBabel(presetReactModule);
+const presetTypescript = unwrapBabel(presetTypescriptModule);
+const pluginSyntaxImportMeta = unwrapBabel(pluginSyntaxImportMetaModule);
+const pluginReactCompiler = unwrapBabel(pluginReactCompilerModule);
+
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+const normalizeNormPath = (p) => {
+  let s = path.resolve(p).replace(/\\/g, "/");
+  if (process.platform === "win32") {
+    s = s.replace(/^([a-zA-Z]):/, (_, d) => d.toLowerCase() + ":");
+  }
+  return s;
+};
+const dinouRootPrefix =
+  normalizeNormPath(path.resolve(__dirname, "../..")) + "/";
+
+export default function babelReactCompilerPlugin({ serverFiles = null } = {}) {
+  const serverFilesSet = serverFiles
+    ? new Set(Array.from(serverFiles).map((f) => normalizeNormPath(f)))
+    : null;
+
   return {
     name: "babel-react-compiler-bridge",
     setup(build) {
-      const entryPoints = build.initialOptions.entryPoints;
-      // Intercept JS/TS/JSX/TSX files
-      // NOTE: Filter node_modules to avoid slowing down by processing external libraries
-      build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
-        // Double check security to avoid node_modules
-        if (args.path.includes("node_modules")) return;
-        const abs = path.resolve(args.path);
-
-        const absNorm = norm(abs);
-        const isAnEntryPoint = Object.values(entryPoints).some(
-          (val) => norm(path.resolve(val)) === absNorm,
-        );
-        if (!isAnEntryPoint) {
-          return;
+      // Intercept user JS/TS/JSX/TSX modules across the entire client graph
+      // (including child components and custom hooks without their own "use client" directive).
+      build.onLoad({ filter: /\.[jt]sx?$/, namespace: "file" }, async (args) => {
+        const normPath = args.path.replace(/\\/g, "/");
+        if (
+          normPath.includes("/node_modules/") ||
+          normPath.includes("/.dinou/")
+        ) {
+          return null;
         }
+
+        const absNorm = normalizeNormPath(args.path);
+        // Skip Dinou's internal framework runtime (both in library and ejected mode)
+        if (absNorm.startsWith(dinouRootPrefix)) {
+          return null;
+        }
+        // Skip known "use server" modules so serverFunctionsPlugin handles them exclusively
+        if (serverFilesSet && serverFilesSet.has(absNorm)) {
+          return null;
+        }
+
         try {
           const source = await fs.readFile(args.path, "utf8");
-          const filename = args.path;
+          const trimmed = source.trim();
+
+          // Defense-in-depth: never run client React Compiler on "use server" modules
+          if (
+            !useClientRegex.test(trimmed) &&
+            (useServerRegex.test(trimmed) || hasServerFunctions(source))
+          ) {
+            return null;
+          }
 
-          // Transform the code with Babel + React Compiler
           const result = await babel.transformAsync(source, {
-            filename,
+            filename: args.path,
             presets: [
-              // We need to tell Babel to understand React and TS before compiling
-              ["@babel/preset-react", { runtime: "automatic" }],
-              "@babel/preset-typescript",
+              [presetReact, { runtime: "automatic" }],
+              presetTypescript,
             ],
             plugins: [
-              "babel-plugin-react-compiler", // 👈 The jewel in the crown
+              pluginReactCompiler,
+              pluginSyntaxImportMeta,
             ],
-            sourceMaps: true, // Vital for esbuild sourcemaps to work
-            configFile: false, // Ignore global babel.config.js to get straight to the point
+            sourceMaps: build.initialOptions.sourcemap ? "inline" : false,
+            configFile: false,
+            babelrc: false,
           });
 
-          // If for some reason Babel does not return code, let esbuild handle it
-          if (!result || !result.code) return;
+          if (!result || !result.code) return null;
 
           return {
             contents: result.code,
-            loader: "js", // Babel returns standard JS
+            loader: "js",
+            resolveDir: path.dirname(args.path),
           };
         } catch (error) {
-          // If Babel fails, show a clean error to not break the build silently
           return {
             errors: [
               {
```

### 3. `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`

```diff
--- a/dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js
+++ b/dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js
@@ -15,11 +15,11 @@
   outdir = ".dinou/dist3",
   manifest = {},
   serverFiles,
+  reactCompiler = true,
 }) {
   const manifestData = {};
   let plugins = [
     esbuildContextualDinouPlugin({ projectRoot: process.cwd() }),
-    babelReactCompilerPlugin(),
     TsconfigPathsPlugin({}),
     cssProcessorPlugin({ outdir }),
     reactClientManifestPlugin({
@@ -29,8 +29,9 @@
     assetsPlugin(),
     manifestGeneratorPlugin(manifestData),
     serverFunctionsPlugin({ manifestData, serverFiles }),
+    reactCompiler && babelReactCompilerPlugin({ serverFiles }),
     writePlugin(),
-  ];
+  ].filter(Boolean);
```

### 4. `dinou/esbuild/build.js`

```diff
--- a/dinou/esbuild/build.js
+++ b/dinou/esbuild/build.js
@@ -7,6 +7,7 @@
 import { updateManifestForModule } from "./helpers-esbuild/update-manifest-for-module.js";
 import { generateRouteTypes } from "../core/generate-route-types.js";
 import { esbuildContextualDinouPlugin } from "../core/resolve-contextual-dinou.js";
+import { getDinouConfig } from "../core/load-dinou-config.js";
 import ensureVendorMode from "../core/ensure-vendor-mode.js";
 if (!ensureVendorMode()) {
   await new Promise(() => {});
@@ -103,12 +104,16 @@
     ...assetEntryPoints,
   };
 
+  const dinouConfig = await getDinouConfig();
+  const enableReactCompiler = dinouConfig?.reactCompiler !== false;
+
   await esbuild.build(
     getConfigEsbuildProd({
       entryPoints,
       manifest,
       outdir,
       serverFiles,
+      reactCompiler: enableReactCompiler,
     })
   );
```

### 5. `dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js`

```diff
--- a/dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js
+++ b/dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js
@@ -30,49 +30,53 @@
 
   return {
     name: "server-functions-proxy",
-    transform(code, id) {
-      if (id.includes("node_modules") || id.includes("\0")) return null;
-      if (serverFiles && !serverFiles.has(normalizeFsPath(id))) {
-        if (!useServerRegex.test(code.trim()) && !hasServerFunctions(code)) return null;
-        serverFiles.add(normalizeFsPath(id));
-      } else if (!useServerRegex.test(code.trim()) && !hasServerFunctions(code)) {
-        return null;
-      }
+    transform: {
+      order: "pre",
+      handler(code, id) {
+        if (id.includes("node_modules") || id.includes("\0")) return null;
+        if (!/\.[jt]sx?($|\?)/.test(id)) return null;
+        if (serverFiles && !serverFiles.has(normalizeFsPath(id))) {
+          if (!useServerRegex.test(code.trim()) && !hasServerFunctions(code)) return null;
+          serverFiles.add(normalizeFsPath(id));
+        } else if (!useServerRegex.test(code.trim()) && !hasServerFunctions(code)) {
+          return null;
+        }
 
-      const isModuleLevel = useServerRegex.test(code.trim());
-      const exports = isModuleLevel ? parseExports(code) : extractServerFunctions(code, id);
-      if (!exports || exports.length === 0) return null;
+        const isModuleLevel = useServerRegex.test(code.trim());
+        const exports = isModuleLevel ? parseExports(code) : extractServerFunctions(code, id);
+        if (!exports || exports.length === 0) return null;
 
-      const relativePath = path
-        .relative(normalizedRoot, normalizePathCase(path.resolve(id)))
-        .replace(/\\/g, "/");
-      serverFunctions.set(relativePath, new Set(exports)); // Save exports as a Set for uniqueness
+        const relativePath = path
+          .relative(normalizedRoot, normalizePathCase(path.resolve(id)))
+          .replace(/\\/g, "/");
+        serverFunctions.set(relativePath, new Set(exports)); // Save exports as a Set for uniqueness
 
-      const fileUrl = `file:///${relativePath}`;
+        const fileUrl = `file:///${relativePath}`;
 
-      // Generate a module that exports proxies instead of the real code
-      let proxyCode = `
+        // Generate a module that exports proxies instead of the real code
+        let proxyCode = `
         import { createServerFunctionProxy } from "/__SERVER_FUNCTION_PROXY__";
       `;
 
-      for (const exp of exports) {
-        const key =
-          exp === "default" ? `${fileUrl}#default` : `${fileUrl}#${exp}`;
-        if (exp === "default") {
-          proxyCode += `export default createServerFunctionProxy(${JSON.stringify(
-            key
-          )});\n`;
-        } else {
-          proxyCode += `export const ${exp} = createServerFunctionProxy(${JSON.stringify(
-            key
-          )});\n`;
+        for (const exp of exports) {
+          const key =
+            exp === "default" ? `${fileUrl}#default` : `${fileUrl}#${exp}`;
+          if (exp === "default") {
+            proxyCode += `export default createServerFunctionProxy(${JSON.stringify(
+              key
+            )});\n`;
+          } else {
+            proxyCode += `export const ${exp} = createServerFunctionProxy(${JSON.stringify(
+              key
+            )});\n`;
+          }
         }
-      }
 
-      return {
-        code: proxyCode,
-        map: null,
-      };
+        return {
+          code: proxyCode,
+          map: null,
+        };
+      },
     },
     // 🪄 After manifest exists, replace the placeholder with the final URL
     async generateBundle(options, bundle) {
```

### 6. `dinou/rollup/rollup.config.js`

```diff
--- a/dinou/rollup/rollup.config.js
+++ b/dinou/rollup/rollup.config.js
@@ -22,7 +22,17 @@
 import rollupSwcPlugin from "./rollup-plugins/rollup-plugin-swc.js";
 import { generateRouteTypes } from "../core/generate-route-types.js";
 import { rollupContextualDinouPlugin } from "../core/resolve-contextual-dinou.js";
+import { getDinouConfig } from "../core/load-dinou-config.js";
+import presetReactModule from "#babel/preset-react";
+import presetTypescriptModule from "#babel/preset-typescript";
+import pluginSyntaxImportMetaModule from "#babel/plugin-syntax-import-meta";
+import pluginReactCompilerModule from "#babel-plugin-react-compiler";
 
+const unwrapBabel = (mod) => mod?.default ?? mod;
+const presetReact = unwrapBabel(presetReactModule);
+const presetTypescript = unwrapBabel(presetTypescriptModule);
+const pluginSyntaxImportMeta = unwrapBabel(pluginSyntaxImportMetaModule);
+const pluginReactCompiler = unwrapBabel(pluginReactCompilerModule);
 const babel = babelModule?.default || babelModule;
 const resolve = resolveModule?.default || resolveModule;
 const __dirname = path.dirname(fileURLToPath(import.meta.url));
@@ -44,7 +54,10 @@
   const outputDirectory = isDevelopment ? ".dinou/public" : ".dinou/dist3";
   const shouldWriteToDisk = process.env.DINOU_WRITE_TO_DISK === "true" || !isDevelopment;
   const serverFiles = new Set();
-  const del = (await import("rollup-plugin-delete")).default;
+  const dinouConfig = await getDinouConfig();
+  const enableReactCompiler = dinouConfig?.reactCompiler !== false;
+  const delModule = await import("#rollup-plugin-delete");
+  const del = delModule?.default || delModule;
   const clientConfig = {
     input: isDevelopment
       ? {
@@ -164,14 +177,16 @@
         ? rollupSwcPlugin()
         : babel({
             babelHelpers: "bundled",
+            configFile: false,
+            babelrc: false,
             extensions: [".js", ".jsx", ".ts", ".tsx"],
             presets: [
-              ["@babel/preset-react", { runtime: "automatic" }],
-              "@babel/preset-typescript",
+              [presetReact, { runtime: "automatic" }],
+              presetTypescript,
             ],
             plugins: [
-              "babel-plugin-react-compiler",
-              "@babel/plugin-syntax-import-meta",
+              enableReactCompiler && pluginReactCompiler,
+              pluginSyntaxImportMeta,
             ].filter(Boolean),
             exclude: /node_modules[\\/](?!dinou|react-refresh)/,
           }),
```

### 7. `dinou/webpack/webpack.config.js`

```diff
--- a/dinou/webpack/webpack.config.js
+++ b/dinou/webpack/webpack.config.js
@@ -3,11 +3,17 @@
 import path from "node:path";
 import fs from "node:fs";
 import { execSync } from "node:child_process";
+import { createRequire } from "node:module";
 import { fileURLToPath } from "node:url";
 import ReactServerWebpackPlugin from "react-server-dom-webpack/plugin";
 import CopyWebpackPlugin from "#copy-webpack-plugin";
 import MiniCssExtractPlugin from "#mini-css-extract-plugin";
+import presetReactModule from "#babel/preset-react";
+import presetTypescriptModule from "#babel/preset-typescript";
+import pluginSyntaxImportMetaModule from "#babel/plugin-syntax-import-meta";
+import pluginReactCompilerModule from "#babel-plugin-react-compiler";
 import createScopedName from "../core/createScopedName.js";
+import { getDinouConfig } from "../core/load-dinou-config.js";
 import TsconfigPathsPlugin from "#tsconfig-paths-webpack-plugin";
 import manifestGeneratorPlugin from "./plugins/manifest-generator-plugin.js";
 import ServerFunctionsPlugin from "./plugins/server-functions-plugin.js";
@@ -91,6 +97,15 @@
     cleanDir(outputDir);
   }
   const [cssEntries, , serverFiles] = await getCSSEntries();
+  const dinouConfig = await getDinouConfig();
+  const enableReactCompiler = dinouConfig?.reactCompiler !== false;
+  const require = createRequire(import.meta.url);
+  const babelLoaderPath = require.resolve("#babel-loader");
+  const unwrapBabel = (mod) => mod?.default ?? mod;
+  const presetReact = unwrapBabel(presetReactModule);
+  const presetTypescript = unwrapBabel(presetTypescriptModule);
+  const pluginSyntaxImportMeta = unwrapBabel(pluginSyntaxImportMetaModule);
+  const pluginReactCompiler = unwrapBabel(pluginReactCompilerModule);
 
   const dependencyClientFiles = new Set();
   if (typeof scanProjectDependenciesForClientComponentsAsync === "function") {
@@ -191,15 +206,17 @@
                   },
                 }
               : {
-                  loader: "babel-loader",
+                  loader: babelLoaderPath,
                   options: {
+                    configFile: false,
+                    babelrc: false,
                     presets: [
-                      ["@babel/preset-react", { runtime: "automatic" }],
-                      "@babel/preset-typescript",
+                      [presetReact, { runtime: "automatic" }],
+                      presetTypescript,
                     ],
                     plugins: [
-                      "babel-plugin-react-compiler",
-                      "@babel/plugin-syntax-import-meta",
+                      enableReactCompiler && pluginReactCompiler,
+                      pluginSyntaxImportMeta,
                     ].filter(Boolean),
                   },
                 },
```

---

## `CHANGELOG.md` Entry

```markdown
### Fixed
- **Esbuild React Compiler Full Client Subgraph Compilation**: Fixed `babelReactCompilerPlugin` in `dinou/esbuild/plugins-esbuild/babel-react-compiler-plugin.js` where an `isAnEntryPoint` guard caused child components and custom hooks without their own `"use client"` directive to skip `babel-plugin-react-compiler` in production builds, while unnecessarily compiling Dinou's own ejected runtime files. Moved `babelReactCompilerPlugin` after `serverFunctionsPlugin` in `get-config-esbuild-prod.js` and added defense-in-depth `"use server"` guards plus `@babel/plugin-syntax-import-meta` parity.
- **Rollup Production `"use server"` Pre-Transform Ordering**: Updated `dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js` to run `transform` with `order: "pre"`, ensuring module-level and inline `"use server"` functions are converted into lightweight RPC proxies before `babel-plugin-react-compiler` processes the client module graph.
- **Vendorized Babel & React Compiler Resolution Across All Bundlers**: Replaced bare string plugin/preset/loader specifiers in Esbuild, Rollup, and Webpack configs with direct subpath imports (`#babel/preset-react`, `#babel/preset-typescript`, `#babel/plugin-syntax-import-meta`, `#babel-plugin-react-compiler`, `#babel-loader`, `#rollup-plugin-delete`) so strict `pnpm` installations and ejected projects require zero hoisted Babel packages.

### Added
- **`DinouConfig.reactCompiler` Option**: Added `reactCompiler?: boolean` (default `true`) to `defineConfig()` / `DinouConfig` (`dinou.config.ts`) to optionally toggle `babel-plugin-react-compiler` globally across Esbuild, Rollup, and Webpack production builds.
```

---

## Automated Tests

### 1. Unit Test Suite (`tests/unit/react-compiler-integration.test.mjs`)

Save this complete file to `tests/unit/react-compiler-integration.test.mjs` and run with `node --test tests/unit/react-compiler-integration.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const require = createRequire(path.join(projectRoot, "package.json"));
const esbuild = require("esbuild");
const { rollup } = require("rollup");

const importDinou = (relPath) =>
  import(pathToFileURL(path.join(projectRoot, "dinou", relPath)).href);

const { default: babelReactCompilerPlugin } = await importDinou(
  "esbuild/plugins-esbuild/babel-react-compiler-plugin.js"
);
const { default: serverFunctionsEsbuildPlugin } = await importDinou(
  "esbuild/plugins-esbuild/server-functions-plugin.js"
);
const { default: getConfigEsbuildProd } = await importDinou(
  "esbuild/helpers-esbuild/get-config-esbuild-prod.js"
);
const { default: rollupServerFunctionsPlugin } = await importDinou(
  "rollup/rollup-plugins/rollup-plugin-server-functions.js"
);

test("1. Esbuild babelReactCompilerPlugin compiles root 'use client', child components without 'use client', custom hooks, and import.meta while respecting 'use no memo'", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dinou-rc-esbuild-"));
  try {
    const parentPath = path.join(tmpDir, "ParentWidget.tsx");
    const childPath = path.join(tmpDir, "OrderSummary.tsx");
    const hookPath = path.join(tmpDir, "useFilteredItems.ts");
    const legacyPath = path.join(tmpDir, "LegacyUnmemoized.tsx");

    await fs.writeFile(
      hookPath,
      `import { useState } from "react";
export function useFilteredItems(items: string[], prefix: string) {
  const [selected, setSelected] = useState<string | null>(null);
  const visible = items.filter((item) => item.startsWith(prefix));
  return { visible, selected, setSelected, mode: import.meta.url };
}
`,
      "utf8"
    );

    await fs.writeFile(
      childPath,
      `import { useFilteredItems } from "./useFilteredItems";
export function OrderSummary({ items, prefix }: { items: string[]; prefix: string }) {
  const { visible, selected, setSelected } = useFilteredItems(items, prefix);
  return (
    <section data-selected={selected ?? ""}>
      {visible.map((item) => (
        <button key={item} onClick={() => setSelected(item)}>{item}</button>
      ))}
    </section>
  );
}
`,
      "utf8"
    );

    await fs.writeFile(
      legacyPath,
      `export function LegacyUnmemoized({ label }: { label: string }) {
  "use no memo";
  return <span>{label.toUpperCase()}</span>;
}
`,
      "utf8"
    );

    await fs.writeFile(
      parentPath,
      `"use client";
import { OrderSummary } from "./OrderSummary";
import { LegacyUnmemoized } from "./LegacyUnmemoized";

export default function ParentWidget({ items }: { items: string[] }) {
  return (
    <div>
      <OrderSummary items={items} prefix="pro-" />
      <LegacyUnmemoized label="raw" />
    </div>
  );
}
`,
      "utf8"
    );

    const result = await esbuild.build({
      entryPoints: { parent: parentPath },
      bundle: true,
      write: false,
      format: "esm",
      jsx: "automatic",
      external: ["react", "react/*"],
      plugins: [babelReactCompilerPlugin()],
    });

    const output = result.outputFiles[0].text;
    assert.match(output, /react\/compiler-runtime/);

    const fnSlice = (name) => {
      const idx = output.indexOf(`function ${name}`);
      assert.notEqual(idx, -1, `Expected function ${name} in output`);
      const rest = output.slice(idx);
      const nextMod = rest.indexOf("\n// ");
      return nextMod !== -1 ? rest.slice(0, nextMod) : rest;
    };

    assert.match(fnSlice("ParentWidget"), /\b_?c\d*\(\d+\)/);
    assert.match(fnSlice("OrderSummary"), /\b_?c\d*\(\d+\)/);
    assert.match(fnSlice("useFilteredItems"), /\b_?c\d*\(\d+\)/);
    assert.doesNotMatch(fnSlice("LegacyUnmemoized"), /\b_?c\d*\(\d+\)/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("2. Esbuild skips Dinou internal runtime files AND never intercepts 'use server' modules before serverFunctionsPlugin", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dinou-rc-sf-"));
  try {
    const actionPath = path.join(tmpDir, "actions.ts");
    const inlineActionPath = path.join(tmpDir, "inline-actions.ts");
    const clientPath = path.join(tmpDir, "ClientForm.tsx");
    const dinouInternalFile = path.join(projectRoot, "dinou/core/slot.js");

    await fs.writeFile(
      actionPath,
      `"use server";
const TOP_SECRET_DB_URI = "postgres://admin:supersecret@db.internal/prod";
export async function saveOrder(id: string) {
  return TOP_SECRET_DB_URI + ":" + id;
}
`,
      "utf8"
    );

    await fs.writeFile(
      inlineActionPath,
      `const INLINE_SECRET_TOKEN = "sk_live_inline_999";
export async function pingServer() {
  "use server";
  return INLINE_SECRET_TOKEN;
}
`,
      "utf8"
    );

    await fs.writeFile(
      clientPath,
      `"use client";
import { saveOrder } from "./actions";
import { pingServer } from "./inline-actions";

export function ClientForm({ orderId }: { orderId: string }) {
  return (
    <button onClick={() => { saveOrder(orderId); pingServer(); }}>
      Submit {orderId}
    </button>
  );
}
`,
      "utf8"
    );

    const serverFiles = new Set([actionPath, inlineActionPath]);
    const manifestData = { "serverFunctionProxy.js": "serverFunctionProxy-HASH.js" };

    const result = await esbuild.build({
      entryPoints: {
        client: clientPath,
        dinouSlot: dinouInternalFile,
      },
      outdir: path.join(tmpDir, "dist"),
      bundle: true,
      write: false,
      format: "esm",
      jsx: "automatic",
      external: [
        "react",
        "react/*",
        "/__SERVER_FUNCTION_PROXY__",
        "/serverFunctionProxy-HASH.js",
      ],
      plugins: [
        serverFunctionsEsbuildPlugin({ manifestData, serverFiles }),
        babelReactCompilerPlugin({ serverFiles }),
      ],
    });

    const clientOut = result.outputFiles.find((f) => f.path.includes("client")).text;
    const slotOut = result.outputFiles.find((f) => f.path.includes("dinouSlot")).text;

    assert.match(clientOut, /react\/compiler-runtime/);
    assert.doesNotMatch(clientOut, /TOP_SECRET_DB_URI/);
    assert.doesNotMatch(clientOut, /INLINE_SECRET_TOKEN/);
    assert.match(clientOut, /createServerFunctionProxy/);
    assert.doesNotMatch(slotOut, /react\/compiler-runtime/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("3. getConfigEsbuildProd respects reactCompiler: false and places babelReactCompilerPlugin after serverFunctionsPlugin", async () => {
  const prodDefault = getConfigEsbuildProd({
    entryPoints: { main: "src/main.tsx" },
    outdir: ".dinou/dist3",
    serverFiles: new Set(),
  });
  const pluginNamesDefault = prodDefault.plugins.map((p) => p.name);
  const sfIdx = pluginNamesDefault.indexOf("server-functions-proxy");
  const rcIdx = pluginNamesDefault.indexOf("babel-react-compiler-bridge");
  assert.ok(sfIdx !== -1, "server-functions-proxy must be present");
  assert.ok(rcIdx !== -1, "babel-react-compiler-bridge must be present by default");
  assert.ok(
    rcIdx > sfIdx,
    `babel-react-compiler-bridge (${rcIdx}) must run AFTER server-functions-proxy (${sfIdx})`
  );

  const prodDisabled = getConfigEsbuildProd({
    entryPoints: { main: "src/main.tsx" },
    outdir: ".dinou/dist3",
    serverFiles: new Set(),
    reactCompiler: false,
  });
  const pluginNamesDisabled = prodDisabled.plugins.map((p) => p.name);
  assert.equal(
    pluginNamesDisabled.includes("babel-react-compiler-bridge"),
    false,
    "babel-react-compiler-bridge must be omitted when reactCompiler: false"
  );
});

test("4. Rollup serverFunctionsPlugin transform uses order: 'pre' and runs BEFORE Babel + React Compiler on 'use server' files", async () => {
  const sfPlugin = rollupServerFunctionsPlugin({ serverFiles: new Set() });
  assert.equal(
    sfPlugin.transform?.order,
    "pre",
    "Rollup serverFunctionsPlugin.transform must declare order: 'pre'"
  );

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dinou-rc-rollup-"));
  try {
    const actionPath = path.join(tmpDir, "inlineAction.ts");
    const entryPath = path.join(tmpDir, "Entry.tsx");

    await fs.writeFile(
      actionPath,
      `const ROLLUP_SERVER_SECRET = "shh_rollup_secret";
export async function mutateItem(name: string) {
  "use server";
  return ROLLUP_SERVER_SECRET + name;
}
`,
      "utf8"
    );

    await fs.writeFile(
      entryPath,
      `"use client";
import { mutateItem } from "./inlineAction";
export function Entry({ label }: { label: string }) {
  return <button onClick={() => mutateItem(label)}>{label}</button>;
}
`,
      "utf8"
    );

    const transformOrder = [];
    const babelModule = await importDinou("compiled/rollup-plugin-babel/index.js");
    const presetReactMod = await importDinou("compiled/babel-preset-react/index.js");
    const presetTsMod = await importDinou("compiled/babel-preset-typescript/index.js");
    const rcMod = await importDinou("compiled/babel-plugin-react-compiler/index.js");
    const unwrap = (m) => m?.default ?? m;

    const prevWriteEnv = process.env.DINOU_WRITE_TO_DISK;
    process.env.DINOU_WRITE_TO_DISK = "false";
    try {
      const bundle = await rollup({
        input: entryPath,
        external: ["react", /^react\//, "/__SERVER_FUNCTION_PROXY__"],
        onwarn(warning, warn) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          warn(warning);
        },
        plugins: [
          {
            name: "resolve-ts-tsx",
            resolveId(source, importer) {
              if (!importer || !source.startsWith(".")) return null;
              for (const ext of ["", ".ts", ".tsx", ".js", ".jsx"]) {
                const full = path.resolve(path.dirname(importer), source + ext);
                if (full === actionPath || full === entryPath) return full;
              }
              return null;
            },
          },
          {
            name: "spy-before-babel",
            transform(code, id) {
              if (path.resolve(id) === path.resolve(actionPath)) {
                transformOrder.push({
                  stage: "normal-transform-input",
                  hasSecret: code.includes("ROLLUP_SERVER_SECRET"),
                });
              }
              return null;
            },
          },
          unwrap(babelModule)({
            babelHelpers: "bundled",
            configFile: false,
            babelrc: false,
            extensions: [".js", ".jsx", ".ts", ".tsx"],
            presets: [[unwrap(presetReactMod), { runtime: "automatic" }], unwrap(presetTsMod)],
            plugins: [unwrap(rcMod)],
          }),
          rollupServerFunctionsPlugin({ serverFiles: new Set() }),
        ],
      });

      const { output } = await bundle.generate({ format: "esm" });
      const code = output[0].code;

      assert.equal(transformOrder.length, 1);
      assert.equal(
        transformOrder[0].hasSecret,
        false,
        "By the time normal transform hooks (Babel) run, 'use server' code must already be replaced with RPC proxy"
      );
      assert.doesNotMatch(code, /ROLLUP_SERVER_SECRET/);
      assert.match(code, /createServerFunctionProxy/);
      assert.match(code, /react\/compiler-runtime/);
    } finally {
      if (prevWriteEnv === undefined) delete process.env.DINOU_WRITE_TO_DISK;
      else process.env.DINOU_WRITE_TO_DISK = prevWriteEnv;
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("5. Rollup and Webpack production configs honor global DinouConfig.reactCompiler and use resolved vendor functions/loaders", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevWrite = process.env.DINOU_WRITE_TO_DISK;
  const prevConfig = globalThis.__DINOU_CONFIG__;
  const origCwd = process.cwd();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dinou-rc-cfg-"));

  try {
    await fs.mkdir(path.join(tmpDir, "src"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "tmp-app", type: "module", dependencies: {} }),
      "utf8"
    );
    await fs.writeFile(
      path.join(tmpDir, "src/page.tsx"),
      `export default function Page() { return <main>ok</main>; }\n`,
      "utf8"
    );
    process.chdir(tmpDir);
    process.env.NODE_ENV = "production";
    process.env.DINOU_WRITE_TO_DISK = "false";

    const { default: getRollupConfig } = await import(
      pathToFileURL(path.join(projectRoot, "dinou/rollup/rollup.config.js")).href + `?t=${Date.now()}-1`
    );
    const { default: getWebpackConfig } = await import(
      pathToFileURL(path.join(projectRoot, "dinou/webpack/webpack.config.js")).href + `?t=${Date.now()}-1`
    );

    globalThis.__DINOU_CONFIG__ = {};
    const webpackClientEnabled = (await getWebpackConfig())[0];
    const babelUseEnabled = webpackClientEnabled.module.rules[0].use[0];

    assert.ok(
      path.isAbsolute(babelUseEnabled.loader),
      `Expected absolute resolved #babel-loader path, got: ${babelUseEnabled.loader}`
    );
    assert.equal(babelUseEnabled.options.configFile, false);
    assert.equal(babelUseEnabled.options.babelrc, false);
    assert.equal(typeof babelUseEnabled.options.presets[0][0], "function");
    assert.equal(typeof babelUseEnabled.options.presets[1], "function");
    assert.equal(babelUseEnabled.options.plugins.length, 2);
    assert.equal(typeof babelUseEnabled.options.plugins[0], "function");
    assert.equal(typeof babelUseEnabled.options.plugins[1], "function");

    const rollupConfigsEnabled = await getRollupConfig();
    assert.ok(Array.isArray(rollupConfigsEnabled));

    globalThis.__DINOU_CONFIG__ = { reactCompiler: false };
    const webpackClientDisabled = (await getWebpackConfig())[0];
    const babelUseDisabled = webpackClientDisabled.module.rules[0].use[0];
    assert.equal(babelUseDisabled.options.plugins.length, 1);
  } finally {
    process.chdir(origCwd);
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevWrite === undefined) delete process.env.DINOU_WRITE_TO_DISK;
    else process.env.DINOU_WRITE_TO_DISK = prevWrite;
    if (prevConfig === undefined) delete globalThis.__DINOU_CONFIG__;
    else globalThis.__DINOU_CONFIG__ = prevConfig;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
```

---

### 2. Playwright End-to-End Test Suite (`tests/e2e/react-compiler.spec.ts`)

#### Fixture Routes to Add in Test App (`src/compiler-e2e/...`)

1. **`src/compiler-e2e/actions.ts`** (verifies `"use server"` RPC coexisting with compiled client components):
```typescript
"use server";

export async function echoCompiledAction(tag: string): Promise<string> {
  return `ack:${tag}`;
}
```

2. **`src/compiler-e2e/child-counter.tsx`** (intentionally has **NO** `"use client"` directive—verifies child component automatic memoization in production builds across Esbuild, Rollup, and Webpack!):
```tsx
import { useRef } from "react";

let childRenderCount = 0;

export function ChildMemoProbe({ label }: { label: string }) {
  // Read module counter to prove React Compiler skips re-rendering ChildMemoProbe
  // when unrelated parent state (`unrelatedClicks`) updates!
  childRenderCount += 1;
  const renders = useRef(0);
  renders.current += 1;

  return (
    <div data-testid="child-probe" data-renders={String(renders.current)}>
      <span>{label}</span>
      <span data-testid="child-render-count">{renders.current}</span>
    </div>
  );
}

export function LegacyNoMemoProbe({ tick }: { tick: number }) {
  "use no memo";
  const renders = useRef(0);
  renders.current += 1;

  return (
    <div data-testid="no-memo-probe">
      <span data-testid="no-memo-tick">{tick}</span>
      <span data-testid="no-memo-renders">{renders.current}</span>
    </div>
  );
}
```

3. **`src/compiler-e2e/compiler-harness.tsx`** (root `"use client"` boundary):
```tsx
"use client";

import { useState } from "react";
import { ChildMemoProbe, LegacyNoMemoProbe } from "./child-counter";
import { echoCompiledAction } from "./actions";

export function CompilerHarness() {
  const [unrelatedClicks, setUnrelatedClicks] = useState(0);
  const [label, setLabel] = useState("initial");
  const [serverReply, setServerReply] = useState("idle");

  return (
    <div>
      <button
        data-testid="bump-unrelated"
        onClick={() => setUnrelatedClicks((c) => c + 1)}
      >
        Unrelated: {unrelatedClicks}
      </button>

      <button
        data-testid="change-label"
        onClick={() => setLabel("updated")}
      >
        Update Label
      </button>

      <button
        data-testid="call-action"
        onClick={async () => {
          const res = await echoCompiledAction(label);
          setServerReply(res);
        }}
      >
        Invoke Server Action
      </button>

      <p data-testid="server-reply">{serverReply}</p>

      {/* ChildMemoProbe receives stable `label` when `unrelatedClicks` increments */}
      <ChildMemoProbe label={label} />

      {/* LegacyNoMemoProbe opts out with "use no memo" */}
      <LegacyNoMemoProbe tick={unrelatedClicks} />
    </div>
  );
}
```

4. **`src/compiler-e2e/page.tsx`**:
```tsx
import { CompilerHarness } from "./compiler-harness";

export default function CompilerE2EPage() {
  return (
    <main>
      <h1>React Compiler E2E</h1>
      <CompilerHarness />
    </main>
  );
}
```

#### Playwright Spec (`tests/e2e/react-compiler.spec.ts`)

```typescript
import { test, expect } from "@playwright/test";

test.describe("React Compiler Production Optimization & Server Action Isolation", () => {
  test("automatically memoizes non-entry child components on unrelated parent state updates while preserving 'use no memo' and Server Functions", async ({
    page,
  }) => {
    await page.goto("/compiler-e2e");
    await page.waitForSelector('body[data-hydrated="true"]');

    const childRenderCount = page.getByTestId("child-render-count");
    const noMemoRenders = page.getByTestId("no-memo-renders");
    const bumpBtn = page.getByTestId("bump-unrelated");
    const updateLabelBtn = page.getByTestId("change-label");
    const actionBtn = page.getByTestId("call-action");
    const serverReply = page.getByTestId("server-reply");

    // Initial hydration render
    await expect(childRenderCount).toHaveText("1");
    await expect(noMemoRenders).toHaveText("1");

    // Click unrelated parent state 3 times:
    // Because React Compiler compiled both CompilerHarness AND ChildMemoProbe
    // (even though ChildMemoProbe has no "use client" directive!),
    // <ChildMemoProbe label={label} /> JSX element is memoized and skipped!
    await bumpBtn.click();
    await bumpBtn.click();
    await bumpBtn.click();

    await expect(bumpBtn).toContainText("Unrelated: 3");
    await expect(childRenderCount).toHaveText("1");
    await expect(noMemoRenders).toHaveText("4");

    // Updating `label` invalidates the memoized slot and re-renders ChildMemoProbe once
    await updateLabelBtn.click();
    await expect(childRenderCount).toHaveText("2");

    // Server Function imported into the compiled client component executes cleanly via RPC proxy
    await actionBtn.click();
    await expect(serverReply).toHaveText("ack:updated");
  });
});
```

