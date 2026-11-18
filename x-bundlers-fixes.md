# Multi-Bundler CLI Execution, Pure Bun Compatibility, Vendor Catalog & `-u` Unvendorized Mode Fixes (`v9.4.0`)

## 1. Executive Summary & Root-Cause Analysis

During the `/docs/bundlers` (*Bundlers & Build Tooling*) audit against `dinou@9.4.0`, seven framework bugs and packaging gaps were uncovered across `package.json`, `dinou/package.json`, `dinou/scripts/build-vendors.js`, `dinou/core/ensure-vendor-mode.js`, `dinou/cli.js`, `dinou/esbuild/`, `dinou/rollup/`, `dinou/webpack/`, and `dinou/node/dev.js`:

1. **Undeclared Direct Dependencies (`fast-glob`, `resolve`, `@babel/generator`, `@babel/types`) & Obsolete Pre-Compiled Vendors (Critical — `pnpm` & `-u` Mode)**:
   - `dinou` directly imported `fast-glob` (across Esbuild, Rollup, and Webpack entry scanners) and `resolve` (`dinou/core/get-abs-path-with-ext.js`), and mapped `#babel/generator` → `@babel/generator` and `#babel/types` → `@babel/types` in `dinou/package.json#imports` under `--conditions=unvendorized` (`-u`), yet **none of the four packages were declared in `dependencies`** in `package.json` or `dinou/package.json`. Under strict non-hoisted package managers (`pnpm`, Yarn PnP), `dinou` failed immediately with `ERR_MODULE_NOT_FOUND`.
   - Conversely, seven legacy packages replaced during earlier `v9.4.0` refactors (`dotenv`, `cross-env`, `@esbuild-plugins/tsconfig-paths`, `rollup-plugin-tsconfig-paths`, `tsconfig-paths-webpack-plugin`, `esbuild-copy-static-files`, `rollup-plugin-copy`) remained in `dependencies`, `imports`, and `dinou/compiled/`, while `fast-glob` and `resolve` were not pre-compiled into `dinou/compiled/`.
   - **Fix**: Declared `@babel/generator`, `@babel/types`, `fast-glob`, and `resolve` in `dependencies`, pre-compiled `#fast-glob` and `#resolve` into `dinou/compiled/`, removed the 7 unused legacy packages, and added automatic obsolete-directory pruning to `dinou/scripts/build-vendors.js` (resulting in a clean **31-package** active vendor catalog).

2. **Bypassed Pre-Compiled Vendors (`#chokidar`, `#css-loader`), Missing Loader Runtime Assets (`css-loader/runtime`, `mini-css-extract-plugin/hmr`), & `projectRoot`-Scoped `require()` in `node/dev.js` and `webpack.config.js` (High)**:
   - `dinou/node/dev.js` created `require = createRequire(path.resolve(projectRoot, "package.json"))` to load `esbuild`, `chokidar`, `rollup`, `webpack`, and `webpack-dev-server` from the consumer app's root instead of Dinou's own package scope (failing under strict `pnpm`) and bypassed the pre-compiled `#chokidar` bundle.
   - `dinou/webpack/webpack.config.js` passed bare strings `"css-loader"` and `"postcss-loader"` instead of resolving `#css-loader` and `postcss-loader` from Dinou's package scope. Furthermore, `dinou/scripts/build-vendors.js` bundled `css-loader` into `dinou/compiled/css-loader/index.js` without copying `css-loader/dist/runtime/*` (`./runtime/api.js`, `getUrl.js`, `noSourceMaps.js`, `sourceMaps.js`) or `mini-css-extract-plugin/dist/hmr/*`, causing `Error: Cannot find module './runtime/api'` when `#css-loader` executed in Vendorized Mode.
   - **Fix**: Switched `dinou/node/dev.js` to `#chokidar` and a Dinou-first `createRequire(import.meta.url)` resolver (falling back to `projectRoot`); resolved `#css-loader` and `postcss-loader` from Dinou's scope in `webpack.config.js`; and updated `build-vendors.js` `postProcess` hooks to copy `css-loader/dist/runtime` and `mini-css-extract-plugin/dist/hmr` alongside `{ "type": "commonjs" }` `package.json` markers.

3. **Pure Bun Mode (`build:node:pure:*` & `build:bun:pure:*`) Broken Without Node/`npx` & Webpack 5.112 Crash Under Bun (High)**:
   - In `dinou/cli.js`, `build:node:pure:rollup`, `build:node:pure:webpack`, `build:bun:pure:rollup`, and `build:bun:pure:webpack` shelled out to **`npx rollup`** and **`npx webpack`**, and every CLI command wrapped execution in **`cross-env`** (`#!/usr/bin/env node`), failing in pure Bun environments (`oven/bun`) where `node`, `npm`, and `npx` are absent.
   - Even when `rollup` and `webpack-cli` were invoked directly under Bun, `dinou/webpack/helpers/patch-webpack-internals.js` relied solely on Node's internal `module._resolveFilename` hook while `webpack.config.js` used a static `import ReactServerWebpackPlugin from "react-server-dom-webpack/plugin"`. Because Bun's native Zig CJS loader bypasses `module._resolveFilename`, Webpack builds under Bun crashed immediately with `Cannot find module 'webpack/lib/dependencies/ModuleDependency'`.
   - **Fix**: Replaced all `cross-env` and `npx` shell command strings in `dinou/cli.js` with structured `spawnSync` step execution and native `env` objects, resolving `rollup/dist/bin/rollup` and `webpack-cli/bin/cli.js` directly from Dinou's package scope and running them under `bun` in `:pure` commands (`node` in standard commands). Added `loadReactServerWebpackPlugin()` in `patch-webpack-internals.js` with an in-memory scoped CJS evaluator fallback for Bun so Webpack 5.112+ works identically in both Node.js and Bun.

4. **Missing `DINOU_BUILD_TOOL` Propagation in Rollup & Esbuild Builds, SSG, and Start Commands (Medium-High)**:
   - `build:node:rollup`, `build:node:compile*:rollup`, `build:deno:rollup`, `build:deno:compile*:rollup`, `build:bun:rollup`, `build:bun:compile*:rollup`, `start:node:rollup`, `start:bun:rollup`, and `rollup.config.js`'s `run-ssg.js` subprocess omitted `DINOU_BUILD_TOOL=rollup`, causing build logs to print `• esbuild` and baking `process.env.DINOU_BUILD_TOOL = "esbuild"` into compiled Rollup server bundles.
   - **Fix**: Propagated explicit `DINOU_BUILD_TOOL` (`"esbuild"`, `"rollup"`, `"webpack"`) across every CLI build/dev/start/export-static step and `run-ssg.js` subprocess.

5. **Silent Failure of `-u` / `--unvendorized` / `DINOU_UNVENDORIZED=true` Under Bun, `dinou/cli.js`, and `run-ssg.js` (Medium)**:
   - Bun ignores `--conditions=unvendorized` inside `NODE_OPTIONS` and requires `--conditions=unvendorized` in `process.execArgv` (`bun --conditions=unvendorized ...`). Because `dinou/core/ensure-vendor-mode.js` treated `process.env.NODE_OPTIONS.includes("unvendorized")` as already active on all runtimes and respawned `process.execPath` without `--conditions=unvendorized` in `execArgv` (while also dropping existing `process.execArgv` flags like `--conditions=react-server`), `-u` silently loaded `dinou/compiled/*` in Bun. Additionally, `dinou/cli.js` lacked an `ensureVendorMode()` guard for in-process commands (`dinou typegen -u`).
   - **Fix**: Hardened `ensureVendorMode()` to check `process.execArgv` on Bun, preserve `...process.execArgv` when respawning with `"--conditions=unvendorized"`, read `.env*` `DINOU_UNVENDORIZED`, guard `dinou/cli.js`, `export-static.js`, and `run-ssg.js`, and prepend `--conditions=unvendorized` directly in `cli.js` and `run-ssg.js` subprocesses.

6. **Dead Dev-Only `react-refresh` Entrypoints Emitted in Esbuild Production Builds (Medium)**:
   - `dinou/esbuild/build.js` included `runtime` (`react-refresh-runtime.js`) and `"react-refresh-entry"` (`react-refresh-entry.js`) in production `frameworkEntryPoints`, emitting unused `runtime-<hash>.js` and `react-refresh-entry-<hash>.js` files into `.dinou/dist3/`, `.dinou/cloudflare/assets/`, and `out/`.
   - **Fix**: Removed `runtime` and `"react-refresh-entry"` from `dinou/esbuild/build.js` (matching Rollup and Webpack production builds).

---

## 2. Complete File Manifest

1. `package.json` *(modified — declare `@babel/generator`, `@babel/types`, `fast-glob`, `resolve`; remove 7 obsolete dependencies)*
2. `dinou/package.json` *(modified — update `#imports` to 31 active vendors with `#fast-glob` & `#resolve`; sync `dependencies`)*
3. `dinou/scripts/build-vendors.js` *(modified — compile `fast-glob` & `resolve`, copy `css-loader/runtime` & `mini-css-extract-plugin/hmr`, prune obsolete `dinou/compiled/*` folders; run `npm run build:vendors` after applying)*
4. `dinou/core/ensure-vendor-mode.js` *(modified — Node + Bun `--conditions=unvendorized` `execArgv` support, `.env*` check, preserve `process.execArgv`)*
5. `dinou/cli.js` *(modified — `ensureVendorMode()`, `spawnSync` step runner without `cross-env`/`npx`, direct `rollup`/`webpack-cli` JS bin resolution, 100% Pure Bun support, full `DINOU_BUILD_TOOL` propagation)*
6. `dinou/core/get-abs-path-with-ext.js` *(modified — switch `"resolve"` to `"#resolve"`)*
7. `dinou/core/export-static.js` *(modified — add `ensureVendorMode()` guard)*
8. `dinou/core/run-ssg.js` *(modified — add `ensureVendorMode()` guard)*
9. `dinou/esbuild/build.js` *(modified — remove dead dev `react-refresh` entries in prod; `spawnSync` `run-ssg.js` with `DINOU_BUILD_TOOL: "esbuild"` & `--conditions=unvendorized`)*
10. `dinou/esbuild/helpers-esbuild/get-esbuild-entries.js` *(modified — switch `"fast-glob"` to `"#fast-glob"`)*
11. `dinou/esbuild/helpers-esbuild/swc-disk-cache.js` *(modified — switch `"fast-glob"` to `"#fast-glob"`)*
12. `dinou/rollup/rollup.config.js` *(modified — `spawnSync` `run-ssg.js` with `DINOU_BUILD_TOOL: "rollup"` & `--conditions=unvendorized`)*
13. `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` *(modified — switch `"fast-glob"` to `"#fast-glob"`)*
14. `dinou/webpack/helpers/patch-webpack-internals.js` *(modified — add `loadReactServerWebpackPlugin()` supporting both Node `module._resolveFilename` and Bun scoped CJS evaluation)*
15. `dinou/webpack/helpers/get-webpack-entries.js` *(modified — switch `"fast-glob"` to `"#fast-glob"`)*
16. `dinou/webpack/webpack.config.js` *(modified — use `loadReactServerWebpackPlugin()`, resolve `#css-loader` & `postcss-loader` from Dinou scope, `spawnSync` `run-ssg.js` with `--conditions=unvendorized`)*
17. `dinou/node/dev.js` *(modified — use `#chokidar` and Dinou-first `createRequire(import.meta.url)` fallback resolver)*

---

## 3. Source Code & Unified Diffs

### 3.1 `package.json` (Root Repository `package.json`)

```diff
--- a/package.json
+++ b/package.json
@@ -60,12 +60,13 @@
   },
   "dependencies": {
     "@babel/core": "7.29.7",
+    "@babel/generator": "7.29.8",
     "@babel/parser": "7.29.11",
     "@babel/plugin-syntax-import-meta": "7.10.4",
     "@babel/preset-react": "7.29.7",
     "@babel/preset-typescript": "7.29.7",
     "@babel/traverse": "7.29.10",
-    "@esbuild-plugins/tsconfig-paths": "0.1.2",
+    "@babel/types": "7.29.11",
     "@roggc/react-server-dom-esm": "19.3.1",
     "@rollup/plugin-babel": "6.1.0",
     "@rollup/plugin-commonjs": "28.0.9",
@@ -80,11 +81,9 @@
     "chokidar": "4.0.3",
     "commander": "14.0.3",
     "copy-webpack-plugin": "14.0.0",
-    "cross-env": "7.0.3",
     "css-loader": "7.1.5",
-    "dotenv": "16.6.1",
     "esbuild": "0.27.7",
-    "esbuild-copy-static-files": "0.1.0",
+    "fast-glob": "3.3.3",
     "generic-names": "4.0.0",
     "mini-css-extract-plugin": "2.10.2",
     "postcss": "8.5.31",
@@ -93,13 +92,11 @@
     "postcss-modules": "6.0.1",
     "react-refresh": "0.17.0",
     "react-server-dom-webpack": "19.3.1",
+    "resolve": "1.22.12",
     "rollup": "4.65.0",
-    "rollup-plugin-copy": "3.5.0",
     "rollup-plugin-delete": "3.0.2",
     "rollup-plugin-postcss": "4.0.2",
-    "rollup-plugin-tsconfig-paths": "1.5.2",
     "tailwindcss": "4.3.3",
-    "tsconfig-paths-webpack-plugin": "4.2.0",
     "webpack": "5.112.2",
     "webpack-cli": "6.0.1",
     "webpack-dev-server": "5.2.7",
```

---

### 3.2 `dinou/package.json`

```diff
--- a/dinou/package.json
+++ b/dinou/package.json
@@ -118,10 +118,6 @@
       "unvendorized": "@rollup/plugin-replace",
       "default": "./compiled/rollup-plugin-replace/index.js"
     },
-    "#rollup-plugin-copy": {
-      "unvendorized": "rollup-plugin-copy",
-      "default": "./compiled/rollup-plugin-copy/index.js"
-    },
     "#rollup-plugin-delete": {
       "unvendorized": "rollup-plugin-delete",
       "default": "./compiled/rollup-plugin-delete/index.js"
@@ -130,10 +126,6 @@
       "unvendorized": "rollup-plugin-postcss",
       "default": "./compiled/rollup-plugin-postcss/index.js"
     },
-    "#rollup-plugin-tsconfig-paths": {
-      "unvendorized": "rollup-plugin-tsconfig-paths",
-      "default": "./compiled/rollup-plugin-tsconfig-paths/index.js"
-    },
     "#babel-loader": {
       "unvendorized": "babel-loader",
       "default": "./compiled/babel-loader/index.js"
@@ -150,46 +142,39 @@
       "unvendorized": "copy-webpack-plugin",
       "default": "./compiled/copy-webpack-plugin/index.js"
     },
-    "#tsconfig-paths-webpack-plugin": {
-      "unvendorized": "tsconfig-paths-webpack-plugin",
-      "default": "./compiled/tsconfig-paths-webpack-plugin/index.js"
-    },
     "#commander": {
       "unvendorized": "commander",
       "default": "./compiled/commander/index.js"
     },
-    "#dotenv": {
-      "unvendorized": "dotenv",
-      "default": "./compiled/dotenv/index.js"
-    },
-    "#cross-env": {
-      "unvendorized": "cross-env",
-      "default": "./compiled/cross-env/index.js"
-    },
     "#ws": {
       "unvendorized": "ws",
       "default": "./compiled/ws/index.js"
     },
     "#chokidar": {
       "unvendorized": "chokidar",
       "default": "./compiled/chokidar/index.js"
     },
-    "#esbuild-copy-static-files": {
-      "unvendorized": "esbuild-copy-static-files",
-      "default": "./compiled/esbuild-copy-static-files/index.js"
+    "#fast-glob": {
+      "unvendorized": "fast-glob",
+      "default": "./compiled/fast-glob/index.js"
     },
-    "#esbuild-plugins/tsconfig-paths": {
-      "unvendorized": "@esbuild-plugins/tsconfig-paths",
-      "default": "./compiled/esbuild-tsconfig-paths/index.js"
+    "#resolve": {
+      "unvendorized": "resolve",
+      "default": "./compiled/resolve/index.js"
     }
   },
   "dependencies": {
     "@babel/core": "7.29.7",
+    "@babel/generator": "7.29.8",
     "@babel/parser": "7.29.11",
     "@babel/plugin-syntax-import-meta": "7.10.4",
     "@babel/preset-react": "7.29.7",
     "@babel/preset-typescript": "7.29.7",
     "@babel/traverse": "7.29.10",
-    "@esbuild-plugins/tsconfig-paths": "0.1.2",
+    "@babel/types": "7.29.11",
     "@roggc/react-server-dom-esm": "19.3.1",
     "@rollup/plugin-babel": "6.1.0",
     "@rollup/plugin-commonjs": "28.0.9",
@@ -205,11 +190,9 @@
     "chokidar": "4.0.3",
     "commander": "14.0.3",
     "copy-webpack-plugin": "14.0.0",
-    "cross-env": "7.0.3",
     "css-loader": "7.1.5",
-    "dotenv": "16.6.1",
     "esbuild": "0.27.7",
-    "esbuild-copy-static-files": "0.1.0",
+    "fast-glob": "3.3.3",
     "generic-names": "4.0.0",
     "mini-css-extract-plugin": "2.10.2",
     "postcss": "8.5.31",
@@ -218,13 +201,11 @@
     "postcss-modules": "6.0.1",
     "react-refresh": "0.17.0",
     "react-server-dom-webpack": "19.3.1",
+    "resolve": "1.22.12",
     "rollup": "4.65.0",
-    "rollup-plugin-copy": "3.5.0",
     "rollup-plugin-delete": "3.0.2",
     "rollup-plugin-postcss": "4.0.2",
-    "rollup-plugin-tsconfig-paths": "1.5.2",
     "tailwindcss": "4.3.3",
-    "tsconfig-paths-webpack-plugin": "4.2.0",
     "webpack": "5.112.2",
     "webpack-cli": "6.0.1",
     "webpack-dev-server": "5.2.7",
```

---

### 3.3 `dinou/scripts/build-vendors.js` (Full Replacement — Run `npm run build:vendors` After Updating)

```js
import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DINOU_ROOT = path.resolve(__dirname, "..");
const COMPILED_DIR = path.join(DINOU_ROOT, "compiled");
const vendorRequire = createRequire(import.meta.url);

const BANNER_JS = `
import { createRequire as __dinou_createRequire } from "node:module";
import { fileURLToPath as __dinou_fileURLToPath } from "node:url";
import __dinou_path from "node:path";
const require = __dinou_createRequire(import.meta.url);
const __filename = __dinou_fileURLToPath(import.meta.url);
const __dirname = __dinou_path.dirname(__filename);
`.trim();

const VENDORS = [
  // --- Babel Ecosystem ---
  { name: "babel-parser", entry: "@babel/parser" },
  { name: "babel-traverse", entry: "@babel/traverse" },
  { name: "babel-core", entry: "@babel/core" },
  { name: "babel-generator", entry: "@babel/generator" },
  { name: "babel-types", entry: "@babel/types" },
  { name: "babel-preset-react", entry: "@babel/preset-react" },
  { name: "babel-preset-typescript", entry: "@babel/preset-typescript" },
  { name: "babel-plugin-syntax-import-meta", entry: "@babel/plugin-syntax-import-meta" },
  { name: "babel-plugin-react-compiler", entry: "babel-plugin-react-compiler" },

  // --- PostCSS & CSS Ecosystem ---
  { name: "postcss", entry: "postcss" },
  { name: "postcss-import", entry: "postcss-import" },
  { name: "postcss-modules", entry: "postcss-modules" },
  { name: "autoprefixer", entry: "autoprefixer" },
  { name: "generic-names", entry: "generic-names" },
  {
    name: "tailwindcss-postcss",
    entry: "@tailwindcss/postcss",
    external: ["@tailwindcss/oxide*", "lightningcss*", "*.node"]
  },

  // --- Rollup Plugins ---
  { name: "rollup-plugin-babel", entry: "@rollup/plugin-babel" },
  { name: "rollup-plugin-commonjs", entry: "@rollup/plugin-commonjs" },
  { name: "rollup-plugin-json", entry: "@rollup/plugin-json" },
  { name: "rollup-plugin-node-resolve", entry: "@rollup/plugin-node-resolve" },
  { name: "rollup-plugin-replace", entry: "@rollup/plugin-replace" },
  { name: "rollup-plugin-delete", entry: "rollup-plugin-delete" },
  { name: "rollup-plugin-postcss", entry: "rollup-plugin-postcss" },

  // --- Webpack Loaders & Plugins ---
  { name: "babel-loader", entry: "babel-loader" },
  {
    name: "css-loader",
    entry: "css-loader",
    postProcess: async (vendorOutdir) => {
      const cssLoaderEntry = vendorRequire.resolve("css-loader");
      const srcRuntimeDir = path.join(path.dirname(cssLoaderEntry), "runtime");
      const destRuntimeDir = path.join(vendorOutdir, "runtime");
      await fs.cp(srcRuntimeDir, destRuntimeDir, { recursive: true });
      await fs.writeFile(
        path.join(destRuntimeDir, "package.json"),
        JSON.stringify({ type: "commonjs" }, null, 2),
        "utf8"
      );
    }
  },
  {
    name: "mini-css-extract-plugin",
    entries: {
      index: "mini-css-extract-plugin",
      loader: "mini-css-extract-plugin/dist/loader.js"
    },
    splitting: true,
    postProcess: async (vendorOutdir) => {
      const loaderFile = path.join(vendorOutdir, "loader.js");
      let content = await fs.readFile(loaderFile, "utf8");
      content = content.replace(
        "export default require_loader();",
        "const _loader = require_loader();\nexport default _loader;\nexport const pitch = _loader.pitch;\nexport const hotLoader = _loader.hotLoader;\n"
      );
      await fs.writeFile(loaderFile, content, "utf8");

      const mcepEntry = vendorRequire.resolve("mini-css-extract-plugin");
      const srcHmrDir = path.join(path.dirname(mcepEntry), "hmr");
      const destHmrDir = path.join(vendorOutdir, "hmr");
      await fs.cp(srcHmrDir, destHmrDir, { recursive: true });
      await fs.writeFile(
        path.join(destHmrDir, "package.json"),
        JSON.stringify({ type: "commonjs" }, null, 2),
        "utf8"
      );
    },
    external: ["webpack", "schema-utils"]
  },
  { name: "copy-webpack-plugin", entry: "copy-webpack-plugin" },

  // --- CLI & Core Utilities ---
  { name: "commander", entry: "commander" },
  { name: "ws", entry: "ws" },
  { name: "chokidar", entry: "chokidar" },
  { name: "fast-glob", entry: "fast-glob" },
  { name: "resolve", entry: "resolve" }
];

const GLOBAL_EXTERNALS = [
  "webpack",
  "rollup",
  "esbuild",
  "@swc/core",
  "react",
  "react-dom"
];

async function buildVendors() {
  console.log("🦖 [Dinou v9] Compiling vendor dependencies with esbuild...\n");
  const startTime = Date.now();
  await fs.mkdir(COMPILED_DIR, { recursive: true });

  const activeVendorNames = new Set(VENDORS.map((v) => v.name));
  const existingEntries = await fs.readdir(COMPILED_DIR, { withFileTypes: true });
  for (const entry of existingEntries) {
    if (entry.isDirectory() && !activeVendorNames.has(entry.name)) {
      await fs.rm(path.join(COMPILED_DIR, entry.name), {
        recursive: true,
        force: true,
      });
      console.log(`  🧹 Removed obsolete vendor directory: ${entry.name}`);
    }
  }

  const manifest = {};
  let successCount = 0;
  let failCount = 0;

  for (const vendor of VENDORS) {
    const t0 = Date.now();
    const vendorOutdir = path.join(COMPILED_DIR, vendor.name);
    await fs.rm(vendorOutdir, { recursive: true, force: true });
    await fs.mkdir(vendorOutdir, { recursive: true });

    const externals = Array.from(
      new Set([...GLOBAL_EXTERNALS, ...(vendor.external || [])])
    );

    try {
      if (vendor.wrapper) {
        await esbuild.build({
          stdin: {
            contents: vendor.wrapper,
            resolveDir: DINOU_ROOT,
            sourcefile: `${vendor.name}-wrapper.js`
          },
          bundle: true,
          platform: "node",
          target: "node18",
          format: "esm",
          outfile: path.join(vendorOutdir, "index.js"),
          banner: { js: BANNER_JS },
          external: externals
        });
      } else if (vendor.entries) {
        await esbuild.build({
          entryPoints: vendor.entries,
          bundle: true,
          platform: "node",
          target: "node18",
          format: "esm",
          outdir: vendorOutdir,
          banner: { js: BANNER_JS },
          external: externals,
          splitting: Boolean(vendor.splitting)
        });
        if (vendor.postProcess) {
          await vendor.postProcess(vendorOutdir);
        }
      } else {
        await esbuild.build({
          entryPoints: [vendor.entry],
          bundle: true,
          platform: "node",
          target: "node18",
          format: "esm",
          outfile: path.join(vendorOutdir, "index.js"),
          banner: { js: BANNER_JS },
          external: externals
        });
        if (vendor.postProcess) {
          await vendor.postProcess(vendorOutdir);
        }
      }

      const elapsed = Date.now() - t0;
      const indexStat = await fs.stat(path.join(vendorOutdir, "index.js"));
      const sizeKb = (indexStat.size / 1024).toFixed(1);

      console.log(`  ✓ ${vendor.name.padEnd(32)} ${elapsed.toString().padStart(4)}ms  (${sizeKb.padStart(6)} KB)`);
      manifest[vendor.name] = {
        entry: vendor.entry || vendor.entries,
        sizeKb: parseFloat(sizeKb),
        builtAt: new Date().toISOString()
      };
      successCount++;
    } catch (err) {
      console.error(`  ✗ ${vendor.name} FAILED:`, err.message);
      failCount++;
    }
  }

  await fs.writeFile(
    path.join(COMPILED_DIR, "vendors-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✨ Finished compiling ${successCount} vendors in ${totalTime}s (failed: ${failCount})`);
  console.log(`📁 Artifacts generated in: ${COMPILED_DIR}\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

buildVendors().catch((err) => {
  console.error("Fatal error compiling vendors:", err);
  process.exit(1);
});
```

---

### 3.4 `dinou/core/ensure-vendor-mode.js` (Full Replacement)

```js
import { spawn } from "node:child_process";
import { readEnvFilesMap } from "./env.js";

export function hasUnvendorizedInArgs(args = []) {
  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i] || "");
    if (
      arg === "--conditions=unvendorized" ||
      arg === "-C=unvendorized" ||
      (arg.startsWith("--conditions=") &&
        arg.slice("--conditions=".length).split(",").includes("unvendorized")) ||
      (arg.startsWith("-C=") &&
        arg.slice("-C=".length).split(",").includes("unvendorized"))
    ) {
      return true;
    }
    if ((arg === "--conditions" || arg === "-C") && args[i + 1]) {
      if (String(args[i + 1]).split(",").includes("unvendorized")) {
        return true;
      }
    }
  }
  return false;
}

export function isUnvendorizedRequested(
  projectRoot = process.cwd(),
  argv = process.argv
) {
  if (
    argv.includes("-u") ||
    argv.includes("--unvendorized") ||
    process.env.DINOU_UNVENDORIZED === "true" ||
    process.env.DINOU_UNVENDORIZED === "1" ||
    hasUnvendorizedInArgs(process.execArgv)
  ) {
    return true;
  }
  try {
    const dotEnvMap = readEnvFilesMap(projectRoot).values;
    return (
      dotEnvMap.DINOU_UNVENDORIZED === "true" ||
      dotEnvMap.DINOU_UNVENDORIZED === "1"
    );
  } catch {
    return false;
  }
}

export function isUnvendorizedConditionActive() {
  const isBunRuntime =
    typeof Bun !== "undefined" || Boolean(process.versions?.bun);
  if (hasUnvendorizedInArgs(process.execArgv)) {
    return true;
  }
  if (!isBunRuntime && process.env.NODE_OPTIONS) {
    return /(?:^|\s)(?:--conditions[=\s]|-C[=\s])[^\s]*\bunvendorized\b/.test(
      process.env.NODE_OPTIONS
    );
  }
  return false;
}

export function ensureVendorMode() {
  if (isUnvendorizedRequested() && !isUnvendorizedConditionActive()) {
    const baseNodeOptions = process.env.NODE_OPTIONS || "";
    const nodeOptions = baseNodeOptions.includes("unvendorized")
      ? baseNodeOptions
      : (baseNodeOptions ? `${baseNodeOptions} ` : "") +
        "--conditions=unvendorized";

    const child = spawn(
      process.execPath,
      [...process.execArgv, "--conditions=unvendorized", ...process.argv.slice(1)],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          NODE_OPTIONS: nodeOptions,
          DINOU_UNVENDORIZED: "true",
        },
      }
    );

    child.on("exit", (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 0);
    });

    return false;
  }

  return true;
}

export default ensureVendorMode;
```

---

### 3.5 `dinou/cli.js` (Full Replacement)

```js
#!/usr/bin/env node

import ensureVendorMode, {
  isUnvendorizedRequested,
} from "./core/ensure-vendor-mode.js";
if (!ensureVendorMode()) {
  await new Promise(() => {});
}

import { program } from "#commander";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFiles } from "./core/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dinouPath = __dirname;
const projectRoot = process.cwd();

const dinouRequire = createRequire(import.meta.url);
const projectRequire = createRequire(path.resolve(projectRoot, "package.json"));

function resolveToolBin(specifier) {
  try {
    return dinouRequire.resolve(specifier);
  } catch {
    return projectRequire.resolve(specifier);
  }
}

const dinouScript = (rel) => path.join(dinouPath, rel);

// Global CLI options for Dinou v9 (Dual-Mode Vendoring)
program
  .name("dinou")
  .description(
    "Full-stack React 19 framework with native RSC, progressive streaming, and dual-mode vendoring"
  )
  .version("9.4.0")
  .option(
    "-u, --unvendorized",
    "Run with standard node_modules dependencies instead of pre-bundled vendor packages"
  );

const pathKey =
  Object.keys(process.env).find((k) => k.toLowerCase() === "path") || "PATH";
const projectBin = path.join(projectRoot, "node_modules", ".bin");
const dinouBin = path.join(dinouPath, "node_modules", ".bin");
const dinouParentBin = path.resolve(dinouPath, "..", "node_modules", ".bin");
const extendedPath = [
  projectBin,
  dinouBin,
  dinouParentBin,
  process.env[pathKey],
]
  .filter(Boolean)
  .join(path.delimiter);

function buildChildEnv(extraEnv = {}) {
  const unvendorized =
    isUnvendorizedRequested(projectRoot) ||
    Boolean(program.opts?.().unvendorized);
  const baseNodeOptions = process.env.NODE_OPTIONS || "";
  const nodeOptions =
    unvendorized && !baseNodeOptions.includes("unvendorized")
      ? (baseNodeOptions ? `${baseNodeOptions} ` : "") +
        "--conditions=unvendorized"
      : baseNodeOptions;

  return {
    unvendorized,
    env: {
      ...process.env,
      [pathKey]: extendedPath,
      Path: extendedPath,
      PATH: extendedPath,
      ...(unvendorized ? { DINOU_UNVENDORIZED: "true" } : {}),
      ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}),
      ...extraEnv,
    },
  };
}

function jsStep(runner, scriptOrResolver, args = [], env = {}) {
  return { kind: "js", runner, scriptOrResolver, args, env };
}

function cmdStep(bin, args = [], env = {}) {
  return { kind: "cmd", bin, args, env };
}

function runSteps(steps, baseEnv = {}) {
  const isBunRuntime =
    typeof Bun !== "undefined" || Boolean(process.versions?.bun);

  for (const step of steps) {
    const mergedExtraEnv = { ...baseEnv, ...(step.env || {}) };
    const { unvendorized, env } = buildChildEnv(mergedExtraEnv);

    let bin;
    let finalArgs;

    if (step.kind === "js") {
      const targetScript =
        typeof step.scriptOrResolver === "function"
          ? step.scriptOrResolver()
          : step.scriptOrResolver;

      if (step.runner === "bun") {
        bin = isBunRuntime ? process.execPath : "bun";
      } else {
        bin = !isBunRuntime ? process.execPath : "node";
      }

      const conditionPrefix = unvendorized ? ["--conditions=unvendorized"] : [];
      finalArgs = [...conditionPrefix, targetScript, ...(step.args || [])];
    } else {
      bin =
        step.bin === "bun" && isBunRuntime ? process.execPath : step.bin;
      finalArgs = [...(step.args || [])];
    }

    let result = spawnSync(bin, finalArgs, {
      stdio: "inherit",
      cwd: projectRoot,
      env,
    });

    if (
      result.error &&
      process.platform === "win32" &&
      !path.isAbsolute(bin) &&
      (result.error.code === "ENOENT" || result.error.code === "EINVAL")
    ) {
      result = spawnSync(bin, finalArgs, {
        stdio: "inherit",
        cwd: projectRoot,
        env,
        shell: true,
      });
    }

    if (result.error) {
      console.error(
        `Error executing "${bin} ${finalArgs.join(" ")}":`,
        result.error.message
      );
      process.exit(1);
    }

    if (result.status !== 0) {
      if (result.signal) {
        process.kill(process.pid, result.signal);
      }
      process.exit(result.status ?? 1);
    }
  }
}

const runProdSteps = (steps, extraEnv = {}) =>
  runSteps(steps, { NODE_ENV: "production", ...extraEnv });

function bundlerStep(bundler, runner = "node") {
  if (bundler === "rollup") {
    return jsStep(
      runner,
      () => resolveToolBin("rollup/dist/bin/rollup"),
      ["-c", dinouScript("rollup/rollup.config.js")],
      { NODE_ENV: "production", DINOU_BUILD_TOOL: "rollup" }
    );
  }
  if (bundler === "webpack") {
    return jsStep(
      runner,
      () => resolveToolBin("webpack-cli/bin/cli.js"),
      ["--config", dinouScript("webpack/webpack.config.js")],
      { NODE_ENV: "production", DINOU_BUILD_TOOL: "webpack" }
    );
  }
  return jsStep(runner, dinouScript("esbuild/build.js"), [], {
    NODE_ENV: "production",
    DINOU_BUILD_TOOL: "esbuild",
  });
}

// --- DEV ---

program
  .command("dev")
  .description("Start development server with Esbuild")
  .action(() => {
    runSteps([
      jsStep("node", dinouScript("node/dev.js"), [], {
        DINOU_BUILD_TOOL: "esbuild",
      }),
    ]);
  });

program
  .command("dev:esbuild")
  .description("Start development server with Esbuild")
  .action(() => {
    runSteps([
      jsStep("node", dinouScript("node/dev.js"), [], {
        DINOU_BUILD_TOOL: "esbuild",
      }),
    ]);
  });

program
  .command("dev:rollup")
  .description("Start development server with Rollup")
  .action(() => {
    runSteps([
      jsStep("node", dinouScript("node/dev.js"), [], {
        DINOU_BUILD_TOOL: "rollup",
      }),
    ]);
  });

program
  .command("dev:webpack")
  .description("Start development server with Webpack")
  .action(() => {
    runSteps([
      jsStep("node", dinouScript("node/dev.js"), [], {
        DINOU_BUILD_TOOL: "webpack",
      }),
    ]);
  });

// --- NODE (BUILD & START) ---

const buildNodeSteps = (bundler, runner = "node") => [
  bundlerStep(bundler, runner),
  jsStep(runner, dinouScript("node/build.js"), [], {
    NODE_ENV: "production",
    DINOU_BUILD_TOOL: bundler,
  }),
];

program
  .command("build")
  .description("Build the app for Node.js production (using esbuild)")
  .action(() => {
    runProdSteps(buildNodeSteps("esbuild", "node"));
  });

program
  .command("build:node")
  .description("Build the app for Node.js production (using esbuild)")
  .action(() => {
    runProdSteps(buildNodeSteps("esbuild", "node"));
  });

program
  .command("build:node:esbuild")
  .description("Build the app for Node.js with Esbuild")
  .action(() => {
    runProdSteps(buildNodeSteps("esbuild", "node"));
  });

program
  .command("build:node:rollup")
  .description("Build the app for Node.js with Rollup")
  .action(() => {
    runProdSteps(buildNodeSteps("rollup", "node"));
  });

program
  .command("build:node:webpack")
  .description("Build the app for Node.js with Webpack")
  .action(() => {
    runProdSteps(buildNodeSteps("webpack", "node"));
  });

program
  .command("start")
  .description("Start the app in production mode (Node.js)")
  .action(() => {
    runProdSteps([jsStep("node", dinouScript("adapters/node.js"))]);
  });

program
  .command("start:node")
  .description("Start the app in production mode (Node.js)")
  .action(() => {
    runProdSteps([jsStep("node", dinouScript("adapters/node.js"))]);
  });

program
  .command("start:node:esbuild")
  .description("Start the app in production mode (Esbuild build)")
  .action(() => {
    runProdSteps([
      jsStep("node", dinouScript("adapters/node.js"), [], {
        DINOU_BUILD_TOOL: "esbuild",
      }),
    ]);
  });

program
  .command("start:node:rollup")
  .description("Start the app in production mode (Rollup build)")
  .action(() => {
    runProdSteps([
      jsStep("node", dinouScript("adapters/node.js"), [], {
        DINOU_BUILD_TOOL: "rollup",
      }),
    ]);
  });

program
  .command("start:node:webpack")
  .description("Start the app in production mode (Webpack build)")
  .action(() => {
    runProdSteps([
      jsStep("node", dinouScript("adapters/node.js"), [], {
        DINOU_BUILD_TOOL: "webpack",
      }),
    ]);
  });

// --- NODE (COMPILE VIA BUN) ---

const nodeTargets = [
  { name: "", args: [], outfile: "dist/server" },
  {
    name: ":linux",
    args: ["--target=bun-linux-x64"],
    outfile: "dist/server-linux",
  },
  {
    name: ":linux_arm",
    args: ["--target=bun-linux-arm64"],
    outfile: "dist/server-linux-arm",
  },
  {
    name: ":mac",
    args: ["--target=bun-darwin-arm64"],
    outfile: "dist/server-mac",
  },
  {
    name: ":win",
    args: ["--target=bun-windows-x64"],
    outfile: "dist/server-win",
  },
];

for (const t of nodeTargets) {
  for (const b of ["esbuild", "rollup", "webpack"]) {
    const cmdNames =
      b === "esbuild"
        ? [
            `build:node:compile${t.name}`,
            `build:node:compile${t.name}:esbuild`,
          ]
        : [`build:node:compile${t.name}:${b}`];
    for (const cmdName of cmdNames) {
      program
        .command(cmdName)
        .description(
          `Compile standalone Node.js server executable with Bun (${t.name || "host"}, ${b})`
        )
        .action(() => {
          runProdSteps([
            ...buildNodeSteps(b, "node"),
            cmdStep("bun", [
              "build",
              "--compile",
              ...t.args,
              ".dinou/node/server.mjs",
              "--outfile",
              t.outfile,
            ]),
          ]);
        });
    }
  }
}

// --- NODE (PURE BUN RUNNER & COMPILE) ---

program
  .command("build:node:pure")
  .description("Build the app for Node.js with 100% Bun (using esbuild)")
  .action(() => {
    runProdSteps(buildNodeSteps("esbuild", "bun"));
  });

program
  .command("build:node:pure:esbuild")
  .description("Build the app for Node.js with 100% Bun (Esbuild)")
  .action(() => {
    runProdSteps(buildNodeSteps("esbuild", "bun"));
  });

program
  .command("build:node:pure:rollup")
  .description("Build the app for Node.js with 100% Bun (Rollup)")
  .action(() => {
    runProdSteps(buildNodeSteps("rollup", "bun"));
  });

program
  .command("build:node:pure:webpack")
  .description("Build the app for Node.js with 100% Bun (Webpack)")
  .action(() => {
    runProdSteps(buildNodeSteps("webpack", "bun"));
  });

for (const t of nodeTargets) {
  for (const b of ["esbuild", "rollup", "webpack"]) {
    const cmdNames =
      b === "esbuild"
        ? [
            `build:node:pure:compile${t.name}`,
            `build:node:pure:compile${t.name}:esbuild`,
          ]
        : [`build:node:pure:compile${t.name}:${b}`];
    for (const cmdName of cmdNames) {
      program
        .command(cmdName)
        .description(
          `Compile standalone Node.js server executable with 100% Bun (${t.name || "host"}, ${b})`
        )
        .action(() => {
          runProdSteps([
            ...buildNodeSteps(b, "bun"),
            cmdStep("bun", [
              "build",
              "--compile",
              ...t.args,
              ".dinou/node/server.mjs",
              "--outfile",
              t.outfile,
            ]),
          ]);
        });
    }
  }
}

// --- CLOUDFLARE WORKERS ---

const buildCloudflareSteps = (bundler) => [
  bundlerStep(bundler, "node"),
  jsStep("node", dinouScript("cloudflare/build.js"), [], {
    NODE_ENV: "production",
    DINOU_BUILD_TOOL: bundler,
  }),
];

program
  .command("build:cloudflare")
  .description("Build the app for Cloudflare Workers (using esbuild)")
  .action(() => {
    runProdSteps(buildCloudflareSteps("esbuild"));
  });

program
  .command("build:cloudflare:esbuild")
  .description("Build the app for Cloudflare Workers with Esbuild")
  .action(() => {
    runProdSteps(buildCloudflareSteps("esbuild"));
  });

program
  .command("build:cloudflare:rollup")
  .description("Build the app for Cloudflare Workers with Rollup")
  .action(() => {
    runProdSteps(buildCloudflareSteps("rollup"));
  });

program
  .command("build:cloudflare:webpack")
  .description("Build the app for Cloudflare Workers with Webpack")
  .action(() => {
    runProdSteps(buildCloudflareSteps("webpack"));
  });

// --- DENO DEPLOY / EDGE ---

const buildDenoSteps = (bundler) => [
  bundlerStep(bundler, "node"),
  jsStep("node", dinouScript("deno/build.js"), [], {
    NODE_ENV: "production",
    DINOU_BUILD_TOOL: bundler,
  }),
  cmdStep(
    "deno",
    [
      "run",
      "--unstable-kv",
      "--allow-net",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      dinouScript("deno/seed-kv.js"),
    ],
    { NODE_ENV: "production", DINOU_BUILD_TOOL: bundler }
  ),
];

program
  .command("build:deno")
  .description("Build the app for Deno Deploy / Edge (using esbuild)")
  .action(() => {
    runProdSteps(buildDenoSteps("esbuild"));
  });

program
  .command("build:deno:esbuild")
  .description("Build the app for Deno Deploy with Esbuild")
  .action(() => {
    runProdSteps(buildDenoSteps("esbuild"));
  });

program
  .command("build:deno:rollup")
  .description("Build the app for Deno Deploy with Rollup")
  .action(() => {
    runProdSteps(buildDenoSteps("rollup"));
  });

program
  .command("build:deno:webpack")
  .description("Build the app for Deno Deploy with Webpack")
  .action(() => {
    runProdSteps(buildDenoSteps("webpack"));
  });

program
  .command("start:deno")
  .description("Start the app in production mode with Deno")
  .action(() => {
    runProdSteps([
      cmdStep("deno", [
        "run",
        "--unstable-kv",
        "--allow-net",
        "--allow-read",
        "--allow-write",
        "--allow-env",
        "--allow-sys",
        dinouScript("adapters/deno.js"),
      ]),
    ]);
  });

const denoTargets = [
  { name: "", args: [], outfile: "dist/deno-server" },
  {
    name: ":linux",
    args: ["--target", "x86_64-unknown-linux-gnu"],
    outfile: "dist/deno-server-linux",
  },
  {
    name: ":linux_arm",
    args: ["--target", "aarch64-unknown-linux-gnu"],
    outfile: "dist/deno-server-linux-arm",
  },
  {
    name: ":mac",
    args: ["--target", "aarch64-apple-darwin"],
    outfile: "dist/deno-server-mac",
  },
  {
    name: ":win",
    args: ["--target", "x86_64-pc-windows-msvc"],
    outfile: "dist/deno-server-win",
  },
];

for (const t of denoTargets) {
  for (const b of ["esbuild", "rollup", "webpack"]) {
    const cmdNames =
      b === "esbuild"
        ? [
            `build:deno:compile${t.name}`,
            `build:deno:compile${t.name}:esbuild`,
          ]
        : [`build:deno:compile${t.name}:${b}`];
    for (const cmdName of cmdNames) {
      program
        .command(cmdName)
        .description(
          `Compile standalone Deno executable (${t.name || "host"}, ${b})`
        )
        .action(() => {
          runProdSteps([
            ...buildDenoSteps(b),
            cmdStep("deno", [
              "compile",
              ...t.args,
              "--unstable-kv",
              "--no-check",
              "--no-config",
              "--allow-net",
              "--allow-read",
              "--allow-write",
              "--allow-env",
              "--allow-sys",
              "--output",
              t.outfile,
              ".dinou/deno/main.js",
            ]),
          ]);
        });
    }
  }
}

// --- BUN (STANDARD & PURE) ---

const buildBunSteps = (bundler, runner = "node") => [
  bundlerStep(bundler, runner),
  jsStep(runner, dinouScript("bun/build.js"), [], {
    NODE_ENV: "production",
    DINOU_BUILD_TOOL: bundler,
  }),
];

program
  .command("build:bun")
  .description("Build the app for Bun (using esbuild)")
  .action(() => {
    runProdSteps(buildBunSteps("esbuild", "node"));
  });

program
  .command("build:bun:esbuild")
  .description("Build the app for Bun with Esbuild")
  .action(() => {
    runProdSteps(buildBunSteps("esbuild", "node"));
  });

program
  .command("build:bun:rollup")
  .description("Build the app for Bun with Rollup")
  .action(() => {
    runProdSteps(buildBunSteps("rollup", "node"));
  });

program
  .command("build:bun:webpack")
  .description("Build the app for Bun with Webpack")
  .action(() => {
    runProdSteps(buildBunSteps("webpack", "node"));
  });

program
  .command("start:bun")
  .description("Start the app in production mode with Bun")
  .action(() => {
    runProdSteps([jsStep("bun", dinouScript("adapters/bun.js"))]);
  });

program
  .command("start:bun:esbuild")
  .description("Start the app in production mode with Bun (Esbuild)")
  .action(() => {
    runProdSteps([
      jsStep("bun", dinouScript("adapters/bun.js"), [], {
        DINOU_BUILD_TOOL: "esbuild",
      }),
    ]);
  });

program
  .command("start:bun:rollup")
  .description("Start the app in production mode with Bun (Rollup)")
  .action(() => {
    runProdSteps([
      jsStep("bun", dinouScript("adapters/bun.js"), [], {
        DINOU_BUILD_TOOL: "rollup",
      }),
    ]);
  });

program
  .command("start:bun:webpack")
  .description("Start the app in production mode with Bun (Webpack)")
  .action(() => {
    runProdSteps([
      jsStep("bun", dinouScript("adapters/bun.js"), [], {
        DINOU_BUILD_TOOL: "webpack",
      }),
    ]);
  });

const bunTargets = [
  { name: "", args: [], outfile: "dist/server" },
  {
    name: ":linux",
    args: ["--target=bun-linux-x64"],
    outfile: "dist/server-linux",
  },
  {
    name: ":linux_arm",
    args: ["--target=bun-linux-arm64"],
    outfile: "dist/server-linux-arm",
  },
  {
    name: ":mac",
    args: ["--target=bun-darwin-arm64"],
    outfile: "dist/server-mac",
  },
  {
    name: ":win",
    args: ["--target=bun-windows-x64"],
    outfile: "dist/server-win",
  },
];

for (const t of bunTargets) {
  for (const b of ["esbuild", "rollup", "webpack"]) {
    const cmdNames =
      b === "esbuild"
        ? [
            `build:bun:compile${t.name}`,
            `build:bun:compile${t.name}:esbuild`,
          ]
        : [`build:bun:compile${t.name}:${b}`];
    for (const cmdName of cmdNames) {
      program
        .command(cmdName)
        .description(
          `Compile standalone Bun executable (${t.name || "host"}, ${b})`
        )
        .action(() => {
          runProdSteps([
            ...buildBunSteps(b, "node"),
            cmdStep("bun", [
              "build",
              "--compile",
              ...t.args,
              ".dinou/bun/server.js",
              "--outfile",
              t.outfile,
            ]),
          ]);
        });
    }
  }
}

program
  .command("build:bun:pure")
  .description("Build the app with 100% Bun (using esbuild)")
  .action(() => {
    runProdSteps(buildBunSteps("esbuild", "bun"));
  });

program
  .command("build:bun:pure:esbuild")
  .description("Build the app with 100% Bun (Esbuild)")
  .action(() => {
    runProdSteps(buildBunSteps("esbuild", "bun"));
  });

program
  .command("build:bun:pure:rollup")
  .description("Build the app with 100% Bun (Rollup)")
  .action(() => {
    runProdSteps(buildBunSteps("rollup", "bun"));
  });

program
  .command("build:bun:pure:webpack")
  .description("Build the app with 100% Bun (Webpack)")
  .action(() => {
    runProdSteps(buildBunSteps("webpack", "bun"));
  });

for (const t of bunTargets) {
  for (const b of ["esbuild", "rollup", "webpack"]) {
    const cmdNames =
      b === "esbuild"
        ? [
            `build:bun:pure:compile${t.name}`,
            `build:bun:pure:compile${t.name}:esbuild`,
          ]
        : [`build:bun:pure:compile${t.name}:${b}`];
    for (const cmdName of cmdNames) {
      program
        .command(cmdName)
        .description(
          `Compile standalone Bun Pure executable (${t.name || "host"}, ${b})`
        )
        .action(() => {
          runProdSteps([
            ...buildBunSteps(b, "bun"),
            cmdStep("bun", [
              "build",
              "--compile",
              ...t.args,
              ".dinou/bun/server.js",
              "--outfile",
              t.outfile,
            ]),
          ]);
        });
    }
  }
}

// --- EXPORT STATIC ---

const exportStaticSteps = (bundler) => [
  bundlerStep(bundler, "node"),
  jsStep("node", dinouScript("core/export-static.js"), [], {
    NODE_ENV: "production",
    DINOU_BUILD_TOOL: bundler,
  }),
];

program
  .command("export-static")
  .description("Export standalone static website (using esbuild)")
  .action(() => {
    runProdSteps(exportStaticSteps("esbuild"));
  });

program
  .command("export-static:esbuild")
  .description("Export standalone static website with Esbuild")
  .action(() => {
    runProdSteps(exportStaticSteps("esbuild"));
  });

program
  .command("export-static:rollup")
  .description("Export standalone static website with Rollup")
  .action(() => {
    runProdSteps(exportStaticSteps("rollup"));
  });

program
  .command("export-static:webpack")
  .description("Export standalone static website with Webpack")
  .action(() => {
    runProdSteps(exportStaticSteps("webpack"));
  });

// --- VENDORS ---

program
  .command("build:vendors")
  .description("Bundle dependencies into dinou/compiled vendors")
  .action(() => {
    runSteps([jsStep("node", dinouScript("scripts/build-vendors.js"))]);
  });

// --- TYPEGEN ---

program
  .command("typegen")
  .description(
    "Generate .dinou/types/routes.d.ts and .dinou/routes/**/dinou.{js,d.ts} from src/"
  )
  .action(async () => {
    loadEnvFiles(projectRoot);
    const { generateRouteTypes } = await import("./core/generate-route-types.js");
    const stats = generateRouteTypes(projectRoot);
    if (stats) {
      console.log(
        `🦖 [Dinou] Generated .dinou/types/routes.d.ts & contextual "./dinou" modules (${stats.totalRoutes} routes, ${stats.layoutCount} layouts, ${stats.slotCount} slots, ${stats.contextualDirCount} route dirs)`
      );
    }
  });

// --- EJECT ---

program
  .command("eject")
  .description("Copy the framework to the root of the project")
  .action(async () => {
    console.log("Executing eject...");
    const { eject } = await import("../eject.js");
    eject();
  });

program.parse(process.argv);
```

---

### 3.6 `dinou/core/get-abs-path-with-ext.js`

```diff
--- a/dinou/core/get-abs-path-with-ext.js
+++ b/dinou/core/get-abs-path-with-ext.js
@@ -2,7 +2,9 @@
 import path from "node:path";
 import { createRequire } from "node:module";
 import { fileURLToPath, pathToFileURL } from "node:url";
-import resolve from "resolve";
+import resolveModule from "#resolve";
+
+const resolve = resolveModule?.default || resolveModule;
 import {
   inferProjectRootFromDir,
   resolveCandidateFile,
```

---

### 3.7 `dinou/core/export-static.js`

```diff
--- a/dinou/core/export-static.js
+++ b/dinou/core/export-static.js
@@ -5,14 +5,18 @@
 import fs from "node:fs";
 import path from "node:path";
 import { loadEnvFiles } from "./env.js";
+import ensureVendorMode from "./ensure-vendor-mode.js";
 import {
   shouldExportDist3Entry,
   shouldExportDist2File,
   injectStaticExportFlag,
 } from "./static-assets.js";
 
 const projectRoot = process.cwd();
 loadEnvFiles(projectRoot, { mode: "production" });
+if (!ensureVendorMode()) {
+  await new Promise(() => {});
+}
 const outDir = path.resolve(projectRoot, "out");
```

---

### 3.8 `dinou/core/run-ssg.js`

```diff
--- a/dinou/core/run-ssg.js
+++ b/dinou/core/run-ssg.js
@@ -5,7 +5,11 @@
 
 import { fileURLToPath } from "node:url";
 import { loadEnvFiles } from "./env.js";
+import ensureVendorMode from "./ensure-vendor-mode.js";
 loadEnvFiles(process.cwd(), { mode: "production" });
+if (!ensureVendorMode()) {
+  await new Promise(() => {});
+}
 import generateStatic from "./generate-static.js";
```

---

### 3.9 `dinou/esbuild/build.js`

```diff
--- a/dinou/esbuild/build.js
+++ b/dinou/esbuild/build.js
@@ -22,7 +22,9 @@
 import { createServerCssModulesPlugin } from "../core/server-css-modules-plugin.js";
 import { esbuildTsconfigAliasesPlugin } from "../core/tsconfig-aliases.js";
 import { loadEnvFiles, getEsbuildPublicEnvDefines } from "../core/env.js";
-import ensureVendorMode from "../core/ensure-vendor-mode.js";
+import ensureVendorMode, {
+  isUnvendorizedRequested,
+} from "../core/ensure-vendor-mode.js";
 loadEnvFiles(process.cwd(), { mode: "production" });
 if (!ensureVendorMode()) {
   await new Promise(() => {});
@@ -54,11 +56,6 @@
   serverFunctionProxy: path.resolve(
     __dirname,
     "../core/server-function-proxy.js"
   ),
-  runtime: path.resolve(__dirname, "react-refresh/react-refresh-runtime.js"),
-  "react-refresh-entry": path.resolve(
-    __dirname,
-    "react-refresh/react-refresh-entry.js"
-  ),
   dinouClientRedirect: absPathToClientRedirect,
   dinouLink: absPathToLink,
   dinouSlot: absPathToSlot,
@@ -187,11 +184,25 @@
   );
 
   // 🏗️ Pre-render static pages (SSG) at build time
-  const { execSync } = await import("node:child_process");
-  execSync(`"${process.execPath}" --conditions=react-server "${path.resolve(__dirname, "../core/run-ssg.js")}"`, {
+  const { spawnSync } = await import("node:child_process");
+  const ssgArgs = [
+    "--conditions=react-server",
+    ...(isUnvendorizedRequested() ? ["--conditions=unvendorized"] : []),
+    path.resolve(__dirname, "../core/run-ssg.js"),
+  ];
+  const ssgRes = spawnSync(process.execPath, ssgArgs, {
     stdio: "inherit",
-    env: { ...process.env, NODE_ENV: "production" },
+    env: {
+      ...process.env,
+      NODE_ENV: "production",
+      DINOU_BUILD_TOOL: "esbuild",
+    },
   });
+  if (ssgRes.status !== 0) {
+    throw new Error(
+      `[Dinou SSG] Static generation exited with code ${ssgRes.status ?? 1}`
+    );
+  }
 } catch (err) {
```

---

### 3.10 `dinou/esbuild/helpers-esbuild/get-esbuild-entries.js`

```diff
--- a/dinou/esbuild/helpers-esbuild/get-esbuild-entries.js
+++ b/dinou/esbuild/helpers-esbuild/get-esbuild-entries.js
@@ -1,6 +1,8 @@
 import { readFileSync } from "fs";
 import path from "node:path";
-import glob from "fast-glob";
+import globModule from "#fast-glob";
+
+const glob = globModule?.default || globModule;
 import { pathToFileURL } from "node:url";
```

---

### 3.11 `dinou/esbuild/helpers-esbuild/swc-disk-cache.js`

```diff
--- a/dinou/esbuild/helpers-esbuild/swc-disk-cache.js
+++ b/dinou/esbuild/helpers-esbuild/swc-disk-cache.js
@@ -1,7 +1,9 @@
 import fs from "node:fs/promises";
 import fsSync from "node:fs";
 import path from "node:path";
-import glob from "fast-glob";
+import globModule from "#fast-glob";
+
+const glob = globModule?.default || globModule;
 import { transform } from "@swc/core";
```

---

### 3.12 `dinou/rollup/rollup.config.js`

```diff
--- a/dinou/rollup/rollup.config.js
+++ b/dinou/rollup/rollup.config.js
@@ -1,7 +1,8 @@
 import path from "node:path";
 import fs from "node:fs";
-import { execSync } from "node:child_process";
+import { spawnSync } from "node:child_process";
 import { fileURLToPath } from "node:url";
+import { isUnvendorizedRequested } from "../core/ensure-vendor-mode.js";
 import esbuild from "esbuild";
@@ -430,10 +431,24 @@
             path.join(serverDir, "package.json"),
             JSON.stringify({ type: "module" }, null, 2)
           );
-          execSync(`"${process.execPath}" --conditions=react-server "${path.resolve(__dirname, "../core/run-ssg.js")}"`, {
+          const ssgArgs = [
+            "--conditions=react-server",
+            ...(isUnvendorizedRequested() ? ["--conditions=unvendorized"] : []),
+            path.resolve(__dirname, "../core/run-ssg.js"),
+          ];
+          const ssgRes = spawnSync(process.execPath, ssgArgs, {
             stdio: "inherit",
-            env: { ...process.env, NODE_ENV: "production" },
+            env: {
+              ...process.env,
+              NODE_ENV: "production",
+              DINOU_BUILD_TOOL: "rollup",
+            },
           });
+          if (ssgRes.status !== 0) {
+            throw new Error(
+              `[Dinou SSG] Static generation exited with code ${ssgRes.status ?? 1}`
+            );
+          }
         },
       },
```

---

### 3.13 `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js`

```diff
--- a/dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js
+++ b/dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js
@@ -1,6 +1,8 @@
 import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
 import path, { dirname } from "node:path";
-import glob from "fast-glob";
+import globModule from "#fast-glob";
+
+const glob = globModule?.default || globModule;
 import { pathToFileURL } from "node:url";
```

---

### 3.14 `dinou/webpack/helpers/patch-webpack-internals.js` (Full Replacement)

```js
import fs from "node:fs";
import path from "node:path";
import module, { createRequire } from "node:module";

// Compatibility shim for Webpack 5.112+ internal file reorganization with react-server-dom-webpack
const originalResolveFilename = module._resolveFilename;
if (originalResolveFilename) {
  module._resolveFilename = function (request, parent, isMain, options) {
    if (request === "webpack/lib/dependencies/ModuleDependency") {
      try {
        return originalResolveFilename.call(this, request, parent, isMain, options);
      } catch {
        return originalResolveFilename.call(
          this,
          "webpack/lib/dependencies/core/ModuleDependency",
          parent,
          isMain,
          options
        );
      }
    }
    if (request === "webpack/lib/Template") {
      try {
        return originalResolveFilename.call(this, request, parent, isMain, options);
      } catch {
        return originalResolveFilename.call(
          this,
          "webpack/lib/template/Template",
          parent,
          isMain,
          options
        );
      }
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

let cachedPlugin = null;

export function loadReactServerWebpackPlugin() {
  if (cachedPlugin) return cachedPlugin;

  const dinouReq = createRequire(import.meta.url);
  let baseReq = dinouReq;
  let pluginEntry = null;
  try {
    pluginEntry = dinouReq.resolve("react-server-dom-webpack/plugin");
  } catch {
    baseReq = createRequire(path.resolve(process.cwd(), "package.json"));
    pluginEntry = baseReq.resolve("react-server-dom-webpack/plugin");
  }

  const isBunRuntime =
    typeof Bun !== "undefined" || Boolean(process.versions?.bun);

  if (!isBunRuntime) {
    try {
      const loaded = baseReq(pluginEntry);
      cachedPlugin = loaded?.default || loaded;
      return cachedPlugin;
    } catch {
      // Fallback to scoped CJS evaluator below
    }
  }

  // Bun's native Zig CJS loader bypasses `module._resolveFilename`, so evaluate
  // `react-server-dom-webpack-plugin.js` with a scoped `require` shim that maps
  // Webpack 5.112+ relocated internal module paths cleanly in memory.
  const implPath = path.resolve(
    path.dirname(pluginEntry),
    "cjs/react-server-dom-webpack-plugin.js"
  );
  const implReq = createRequire(implPath);
  const resolveWebpackInternal = (id, fallbackId) => {
    try {
      return implReq(id);
    } catch {
      try {
        return implReq(fallbackId);
      } catch {
        return baseReq(fallbackId);
      }
    }
  };

  const scopedRequire = (id) => {
    if (id === "webpack/lib/dependencies/ModuleDependency") {
      return resolveWebpackInternal(
        id,
        "webpack/lib/dependencies/core/ModuleDependency"
      );
    }
    if (id === "webpack/lib/Template") {
      return resolveWebpackInternal(id, "webpack/lib/template/Template");
    }
    try {
      return implReq(id);
    } catch {
      return baseReq(id);
    }
  };
  Object.assign(scopedRequire, implReq);

  const mod = { exports: {} };
  const source = fs.readFileSync(implPath, "utf8");
  const wrapperFn = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    source
  );
  wrapperFn(
    mod.exports,
    scopedRequire,
    mod,
    implPath,
    path.dirname(implPath)
  );

  cachedPlugin = mod.exports?.default || mod.exports;
  return cachedPlugin;
}

export default { loadReactServerWebpackPlugin };
```

---

### 3.15 `dinou/webpack/helpers/get-webpack-entries.js`

```diff
--- a/dinou/webpack/helpers/get-webpack-entries.js
+++ b/dinou/webpack/helpers/get-webpack-entries.js
@@ -1,6 +1,8 @@
 import { readFileSync } from "node:fs";
 import path from "node:path";
-import glob from "fast-glob";
+import globModule from "#fast-glob";
+
+const glob = globModule?.default || globModule;
 import { pathToFileURL } from "node:url";
```

---

### 3.16 `dinou/webpack/webpack.config.js`

```diff
--- a/dinou/webpack/webpack.config.js
+++ b/dinou/webpack/webpack.config.js
@@ -1,18 +1,18 @@
-import "./helpers/patch-webpack-internals.js";
+import { loadReactServerWebpackPlugin } from "./helpers/patch-webpack-internals.js";
 import {
   loadEnvFiles,
   getWebpackPublicEnvDefines,
   getEsbuildPublicEnvDefines,
 } from "../core/env.js";
+import { isUnvendorizedRequested } from "../core/ensure-vendor-mode.js";
 import path from "node:path";
 import fs from "node:fs";
-import { execSync } from "node:child_process";
+import { spawnSync } from "node:child_process";
 import { createRequire } from "node:module";
 import { fileURLToPath } from "node:url";
-import ReactServerWebpackPlugin from "react-server-dom-webpack/plugin";
 import CopyWebpackPlugin from "#copy-webpack-plugin";
@@ -140,8 +140,19 @@
     assetInclude: activeAssetRegex,
     dinouConfig,
   });
-  const require = createRequire(import.meta.url);
-  const babelLoaderPath = require.resolve("#babel-loader");
+  const ReactServerWebpackPlugin = loadReactServerWebpackPlugin();
+  const dinouReq = createRequire(import.meta.url);
+  const projectReq = createRequire(path.resolve(process.cwd(), "package.json"));
+  const resolveLoader = (specifier) => {
+    try {
+      return dinouReq.resolve(specifier);
+    } catch {
+      return projectReq.resolve(specifier);
+    }
+  };
+  const babelLoaderPath = resolveLoader("#babel-loader");
+  const cssLoaderPath = resolveLoader("#css-loader");
+  const postcssLoaderPath = resolveLoader("postcss-loader");
   const unwrapBabel = (mod) => mod?.default ?? mod;
@@ -182,10 +193,22 @@
         path.join(serverDir, "package.json"),
         JSON.stringify({ type: "module" }, null, 2)
       );
-      execSync(`"${process.execPath}" --conditions=react-server "${path.resolve(__dirname, "../core/run-ssg.js")}"`, {
+      const ssgArgs = [
+        "--conditions=react-server",
+        ...(isUnvendorizedRequested() ? ["--conditions=unvendorized"] : []),
+        path.resolve(__dirname, "../core/run-ssg.js"),
+      ];
+      const ssgRes = spawnSync(process.execPath, ssgArgs, {
         stdio: "inherit",
-        env: { ...process.env, NODE_ENV: "production", DINOU_BUILD_TOOL: "webpack" },
+        env: {
+          ...process.env,
+          NODE_ENV: "production",
+          DINOU_BUILD_TOOL: "webpack",
+        },
       });
+      if (ssgRes.status !== 0) {
+        throw new Error(`[Dinou SSG] Static generation exited with code ${ssgRes.status ?? 1}`);
+      }
     }
   }
@@ -288,7 +311,7 @@
               },
             },
             {
-              loader: "css-loader",
+              loader: cssLoaderPath,
               options: {
                 url: {
                   filter: (url) => !url.startsWith("/"),
@@ -303,7 +326,7 @@
               },
             },
             {
-              loader: "postcss-loader",
+              loader: postcssLoaderPath,
               options: {
                 postcssOptions: {
                   config: false,
@@ -319,7 +342,7 @@
           use: [
             MiniCssExtractPlugin.loader,
             {
-              loader: "css-loader",
+              loader: cssLoaderPath,
               options: {
                 url: {
                   filter: (url) => !url.startsWith("/"),
@@ -329,7 +352,7 @@
               },
             },
             {
-              loader: "postcss-loader",
+              loader: postcssLoaderPath,
               options: {
                 postcssOptions: {
```

---

### 3.17 `dinou/node/dev.js`

```diff
--- a/dinou/node/dev.js
+++ b/dinou/node/dev.js
@@ -25,6 +25,7 @@
 import path from "node:path";
 import fs from "node:fs";
 import crypto from "node:crypto";
+import chokidarModule from "#chokidar";
 import { createRequire } from "node:module";
 import { fileURLToPath, pathToFileURL } from "node:url";
 import { Readable } from "node:stream";
@@ -103,9 +104,17 @@
 startSpinner("Initializing Incremental Dual-Bundle Engine (No fork)...");
 
 const projectRoot = process.cwd();
-const require = createRequire(path.resolve(projectRoot, "package.json"));
+const dinouRequire = createRequire(import.meta.url);
+const projectRequire = createRequire(path.resolve(projectRoot, "package.json"));
+const require = (id) => {
+  try {
+    return dinouRequire(id);
+  } catch {
+    return projectRequire(id);
+  }
+};
 const esbuild = require("esbuild");
-const chokidar = require("chokidar");
+const chokidar = chokidarModule?.default || chokidarModule;
```

---

## 4. `CHANGELOG.md` Entry (`9.4.0`)

```markdown
### Added
- Pre-compiled `#fast-glob` and `#resolve` into `dinou/compiled/` (alongside `css-loader/runtime` and `mini-css-extract-plugin/hmr` CommonJS assets) and added automatic obsolete-directory pruning to `dinou/scripts/build-vendors.js`.

### Changed
- Replaced `cross-env` and `npx` shell command wrappers in `dinou/cli.js` with structured `spawnSync` step execution and direct `rollup` / `webpack-cli` JS binary resolution, enabling 100% Node-free execution in `build:node:pure:*` and `build:bun:pure:*` across Esbuild, Rollup, and Webpack.
- Removed 7 obsolete legacy packages (`dotenv`, `cross-env`, `@esbuild-plugins/tsconfig-paths`, `rollup-plugin-tsconfig-paths`, `tsconfig-paths-webpack-plugin`, `esbuild-copy-static-files`, `rollup-plugin-copy`) from `dependencies`, `#imports`, and `dinou/compiled/`, consolidating the active vendor catalog to 31 packages.

### Fixed
- Declared `@babel/generator`, `@babel/types`, `fast-glob`, and `resolve` as direct dependencies in `package.json` and `dinou/package.json`, and switched `dinou/node/dev.js` and `dinou/webpack/webpack.config.js` to Dinou-scoped module resolution (`#chokidar`, `#css-loader`, `postcss-loader`) for strict `pnpm` compatibility.
- Fixed Webpack 5.112+ `react-server-dom-webpack/plugin` loading under Bun (`build:node:pure:webpack`, `build:bun:pure:webpack`) via `loadReactServerWebpackPlugin()` in `dinou/webpack/helpers/patch-webpack-internals.js`.
- Fixed `-u` / `--unvendorized` / `DINOU_UNVENDORIZED=true` activation under Bun, `dinou typegen -u`, and `run-ssg.js` by passing `--conditions=unvendorized` in `execArgv` while preserving existing `process.execArgv` flags.
- Fixed missing `DINOU_BUILD_TOOL=rollup` propagation across Node, Deno, and Bun build/SSG/start commands, and removed unused dev-only `react-refresh` entrypoints (`runtime`, `react-refresh-entry`) from Esbuild production builds.
```

---

## 5. Automated Test Suites

### 5.1 Unit & Multi-Bundler Integration Test Suite (`tests/unit/bundlers-and-vendoring.test.mjs`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();

function resolveDinouDir() {
  const candidates = [
    path.resolve(REPO_ROOT, "dinou"),
    path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou"),
    path.resolve(REPO_ROOT, "node_modules", "dinou"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "cli.js"))) {
      return dir;
    }
  }
  throw new Error("Could not locate dinou/cli.js from " + REPO_ROOT);
}

const DINOU_DIR = resolveDinouDir();
const CLI_PATH = path.join(DINOU_DIR, "cli.js");

function hasRuntimeBinary(bin) {
  const res = spawnSync(bin, ["--version"], { encoding: "utf8" });
  return !res.error && res.status === 0;
}

function createFixtureDir() {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, "tmp-bundlers-unit-"));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), "dinou-bundlers-unit-"));
  }
}

let FIXTURE_DIR = "";

function setupFixtureApp() {
  FIXTURE_DIR = createFixtureDir();
  fs.mkdirSync(path.join(FIXTURE_DIR, "src"), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_DIR, "public"), { recursive: true });

  const dinouShimDir = path.join(FIXTURE_DIR, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouIndexUrl = pathToFileURL(path.join(DINOU_DIR, "index.js")).href;
  const dinouServerUrl = pathToFileURL(path.join(DINOU_DIR, "server.js")).href;
  const dinouConfigUrl = pathToFileURL(
    path.join(DINOU_DIR, "core", "config.js")
  ).href;

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
    `export * from ${JSON.stringify(dinouIndexUrl)};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(dinouServerUrl)};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(dinouConfigUrl)};\nexport { default } from ${JSON.stringify(dinouConfigUrl)};\n`
  );

  for (const peerPkg of [
    "react",
    "react-dom",
    "@roggc/react-server-dom-esm",
    "react-server-dom-webpack",
  ]) {
    const srcPkgDir = path.resolve(REPO_ROOT, "node_modules", peerPkg);
    if (!fs.existsSync(srcPkgDir)) continue;
    const destPkgDir = path.join(FIXTURE_DIR, "node_modules", peerPkg);
    if (!fs.existsSync(destPkgDir)) {
      fs.mkdirSync(path.dirname(destPkgDir), { recursive: true });
      fs.cpSync(srcPkgDir, destPkgDir, { recursive: true });
    }
  }

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "package.json"),
    JSON.stringify(
      {
        name: "dinou-bundlers-unit-fixture",
        private: true,
        type: "module",
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "tsconfig.json"),
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
    path.join(FIXTURE_DIR, "public", "robots.txt"),
    "User-agent: *\nAllow: /\n"
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "src", "badge.module.css"),
    ".pill { color: rgb(16, 185, 129); font-weight: 600; }\n"
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "src", "actions.ts"),
    `"use server";
export async function pingAction(label: string) {
  return \`pong:\${label}\`;
}
`
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "src", "counter.tsx"),
    `"use client";
import { useState } from "react";
import styles from "@/badge.module.css";
import { pingAction } from "@/actions";

export default function Counter({ initial = 1 }: { initial?: number }) {
  const [count, setCount] = useState(initial);
  const doubled = count * 2;
  return (
    <button
      className={styles.pill}
      data-doubled={doubled}
      onClick={async () => {
        await pingAction(String(count));
        setCount((c) => c + 1);
      }}
    >
      Count: {count}
    </button>
  );
}
`
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "src", "layout.tsx"),
    `import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "src", "page.tsx"),
    `import Counter from "@/counter";

export default function HomePage() {
  return (
    <main>
      <h1 data-build-tool={process.env.DINOU_BUILD_TOOL}>Tri-Bundler Matrix OK</h1>
      <Counter initial={5} />
    </main>
  );
}
`
  );
}

test.before(() => {
  setupFixtureApp();
});

test.after(() => {
  if (FIXTURE_DIR && fs.existsSync(FIXTURE_DIR)) {
    try {
      fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
    } catch {}
  }
});

test("1. Vendor catalog (31 active vendors) & declared dependencies resolve in Vendorized and Unvendorized (-u) modes", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(DINOU_DIR, "package.json"), "utf8")
  );
  const importKeys = Object.keys(pkg.imports || {});
  assert.equal(
    importKeys.length,
    31,
    `Expected 31 active vendor #subpath imports, got ${importKeys.length}`
  );

  for (const obsolete of [
    "#dotenv",
    "#cross-env",
    "#rollup-plugin-copy",
    "#esbuild-copy-static-files",
    "#esbuild-plugins/tsconfig-paths",
    "#rollup-plugin-tsconfig-paths",
    "#tsconfig-paths-webpack-plugin",
  ]) {
    assert.ok(!pkg.imports[obsolete], `Obsolete ${obsolete} must be removed`);
  }

  for (const requiredSubpath of [
    "#fast-glob",
    "#resolve",
    "#chokidar",
    "#css-loader",
    "#babel-loader",
  ]) {
    assert.ok(pkg.imports[requiredSubpath], `Missing ${requiredSubpath}`);
  }

  for (const requiredDep of [
    "@babel/generator",
    "@babel/types",
    "fast-glob",
    "resolve",
  ]) {
    assert.ok(
      pkg.dependencies[requiredDep],
      `Missing declared direct dependency ${requiredDep}`
    );
  }

  assert.ok(
    fs.existsSync(
      path.join(DINOU_DIR, "compiled", "css-loader", "runtime", "api.js")
    ),
    "Missing dinou/compiled/css-loader/runtime/api.js"
  );
  assert.ok(
    fs.existsSync(
      path.join(
        DINOU_DIR,
        "compiled",
        "mini-css-extract-plugin",
        "hmr",
        "hotModuleReplacement.js"
      )
    ),
    "Missing dinou/compiled/mini-css-extract-plugin/hmr/hotModuleReplacement.js"
  );

  const checkScript = `
    import { createRequire } from "node:module";
    import fs from "node:fs";
    const dinouPkgPath = ${JSON.stringify(path.join(DINOU_DIR, "package.json"))};
    const pkg = JSON.parse(fs.readFileSync(dinouPkgPath, "utf8"));
    const req = createRequire(${JSON.stringify(CLI_PATH)});
    const results = {};
    for (const k of Object.keys(pkg.imports)) {
      results[k] = req.resolve(k).replace(/\\\\/g, "/");
    }
    console.log(JSON.stringify(results));
  `;

  const nodeVend = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", checkScript],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );
  assert.equal(nodeVend.status, 0, nodeVend.stderr);
  const nodeVendMap = JSON.parse(nodeVend.stdout.trim());
  for (const [k, resolved] of Object.entries(nodeVendMap)) {
    assert.ok(
      resolved.includes("/compiled/"),
      `Node vendorized ${k} should resolve to compiled/, got ${resolved}`
    );
  }

  const nodeUnvend = spawnSync(
    process.execPath,
    ["--conditions=unvendorized", "--input-type=module", "-e", checkScript],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );
  assert.equal(nodeUnvend.status, 0, nodeUnvend.stderr);
  const nodeUnvendMap = JSON.parse(nodeUnvend.stdout.trim());
  for (const [k, resolved] of Object.entries(nodeUnvendMap)) {
    assert.ok(
      resolved.includes("/node_modules/") && !resolved.includes("/compiled/"),
      `Node unvendorized ${k} should resolve to node_modules, got ${resolved}`
    );
  }
});

test("2. Standard Node builds across Esbuild, Rollup, and Webpack propagate DINOU_BUILD_TOOL, omit dead react-refresh chunks in Esbuild prod, and serve SSR HTML", async () => {
  for (const bundler of ["esbuild", "rollup", "webpack"]) {
    const extraFlags = bundler === "rollup" ? ["-u"] : [];
    const res = spawnSync(
      process.execPath,
      [CLI_PATH, `build:node:${bundler}`, ...extraFlags],
      { cwd: FIXTURE_DIR, encoding: "utf8" }
    );
    assert.equal(
      res.status,
      0,
      `build:node:${bundler} failed:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
    );
    assert.ok(
      res.stdout.includes(`Dinou (Node.js • ${bundler})`),
      `Expected banner "Dinou (Node.js • ${bundler})" in stdout`
    );

    const dist3Files = fs.readdirSync(path.join(FIXTURE_DIR, ".dinou", "dist3"));
    if (bundler === "esbuild") {
      assert.ok(
        !dist3Files.some(
          (f) =>
            f.startsWith("runtime-") || f.startsWith("react-refresh-entry-")
        ),
        `Esbuild prod dist3 must not contain dead react-refresh files, found: ${dist3Files.join(", ")}`
      );
    }

    const serverMjsPath = path.join(FIXTURE_DIR, ".dinou", "node", "server.mjs");
    const rscEnginePath = path.join(
      FIXTURE_DIR,
      ".dinou",
      "node",
      "rsc-engine.mjs"
    );
    assert.ok(fs.existsSync(serverMjsPath), "Missing .dinou/node/server.mjs");
    assert.ok(fs.existsSync(rscEnginePath), "Missing .dinou/node/rsc-engine.mjs");

    const prevCwd = process.cwd();
    process.chdir(FIXTURE_DIR);
    try {
      const mod = await import(
        `${pathToFileURL(serverMjsPath).href}?b=${bundler}-${Date.now()}`
      );
      const response = await mod.fetch(new Request("http://localhost/"));
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(
        html.includes("Tri-Bundler Matrix OK") &&
          html.includes(`data-build-tool="${bundler}"`)
      );
      assert.ok(html.includes("Count:") && html.includes("5"));
    } finally {
      process.chdir(prevCwd);
    }
  }
});

test("3. Pure Bun mode executes Esbuild, Rollup, and Webpack natively under Bun (including -u unvendorized)", (t) => {
  if (!hasRuntimeBinary("bun")) {
    t.skip("Bun binary not installed in test environment");
    return;
  }

  const pathKey =
    Object.keys(process.env).find((k) => k.toLowerCase() === "path") || "PATH";
  const filteredPath = (process.env[pathKey] || "")
    .split(path.delimiter)
    .filter((entry) => !entry.toLowerCase().includes("nodejs"))
    .join(path.delimiter);

  for (const bundler of ["esbuild", "rollup", "webpack"]) {
    const res = spawnSync("bun", [CLI_PATH, `build:node:pure:${bundler}`], {
      cwd: FIXTURE_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        [pathKey]: filteredPath,
        Path: filteredPath,
        PATH: filteredPath,
      },
    });
    assert.equal(
      res.status,
      0,
      `build:node:pure:${bundler} failed under Bun:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
    );
    assert.ok(res.stdout.includes(`Dinou (Node.js • ${bundler})`));
  }

  const bunPureRes = spawnSync(
    "bun",
    [CLI_PATH, "build:bun:pure:rollup", "-u"],
    {
      cwd: FIXTURE_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        [pathKey]: filteredPath,
        Path: filteredPath,
        PATH: filteredPath,
      },
    }
  );
  assert.equal(bunPureRes.status, 0, bunPureRes.stderr);
  assert.ok(bunPureRes.stdout.includes("Dinou (Bun • rollup)"));
  assert.ok(
    fs.existsSync(path.join(FIXTURE_DIR, ".dinou", "bun", "server.js"))
  );
});

test("4. Cloudflare, Static Export, and typegen -u propagate DINOU_BUILD_TOOL cleanly", () => {
  const cfRes = spawnSync(
    process.execPath,
    [CLI_PATH, "build:cloudflare:rollup"],
    { cwd: FIXTURE_DIR, encoding: "utf8" }
  );
  assert.equal(cfRes.status, 0, cfRes.stderr);
  assert.ok(cfRes.stdout.includes("Dinou (Cloudflare Workers • rollup)"));
  const workerCode = fs.readFileSync(
    path.join(FIXTURE_DIR, ".dinou", "cloudflare", "worker.js"),
    "utf8"
  );
  assert.ok(workerCode.includes('"rollup"'));

  const expRes = spawnSync(
    process.execPath,
    [CLI_PATH, "export-static:webpack"],
    { cwd: FIXTURE_DIR, encoding: "utf8" }
  );
  assert.equal(expRes.status, 0, expRes.stderr);
  assert.ok(expRes.stdout.includes("Dinou (Static Export • webpack)"));
  const exportedHtml = fs.readFileSync(
    path.join(FIXTURE_DIR, "out", "index.html"),
    "utf8"
  );
  assert.ok(exportedHtml.includes("window.__DINOU_STATIC_EXPORT__=true"));

  const typegenRes = spawnSync(
    process.execPath,
    [CLI_PATH, "typegen", "-u"],
    { cwd: FIXTURE_DIR, encoding: "utf8" }
  );
  assert.equal(typegenRes.status, 0, typegenRes.stderr);
  assert.ok(
    fs.existsSync(path.join(FIXTURE_DIR, ".dinou", "types", "routes.d.ts"))
  );
});
```

---

### 5.2 Playwright E2E Test Suite (`tests/e2e/bundlers-and-vendoring.spec.ts`)

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();

function resolveDinouDir(): string {
  const candidates = [
    path.resolve(REPO_ROOT, "dinou"),
    path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou"),
    path.resolve(REPO_ROOT, "node_modules", "dinou"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "cli.js"))) {
      return dir;
    }
  }
  throw new Error("Could not locate dinou/cli.js from " + REPO_ROOT);
}

const DINOU_DIR = resolveDinouDir();
const CLI_PATH = path.join(DINOU_DIR, "cli.js");

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for server at ${url}`);
}

function createE2EFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-bundlers-e2e-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "public"), { recursive: true });

  const dinouShimDir = path.join(dir, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouIndexUrl = pathToFileURL(path.join(DINOU_DIR, "index.js")).href;
  const dinouServerUrl = pathToFileURL(path.join(DINOU_DIR, "server.js")).href;
  const dinouConfigUrl = pathToFileURL(
    path.join(DINOU_DIR, "core", "config.js")
  ).href;

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
    `export * from ${JSON.stringify(dinouIndexUrl)};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(dinouServerUrl)};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(dinouConfigUrl)};\nexport { default } from ${JSON.stringify(dinouConfigUrl)};\n`
  );

  for (const peerPkg of [
    "react",
    "react-dom",
    "@roggc/react-server-dom-esm",
    "react-server-dom-webpack",
  ]) {
    const srcPkgDir = path.resolve(REPO_ROOT, "node_modules", peerPkg);
    if (!fs.existsSync(srcPkgDir)) continue;
    const destPkgDir = path.join(dir, "node_modules", peerPkg);
    fs.mkdirSync(path.dirname(destPkgDir), { recursive: true });
    fs.cpSync(srcPkgDir, destPkgDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      { name: "dinou-bundlers-e2e-app", private: true, type: "module" },
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
          paths: { "@/*": ["./src/*"] },
        },
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(dir, "src", "box.module.css"),
    ".badge { background-color: rgb(16, 185, 129); padding: 4px 8px; }\n"
  );

  fs.writeFileSync(
    path.join(dir, "src", "actions.ts"),
    `"use server";
export async function doubleOnServer(value: number): Promise<number> {
  return value * 2;
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "interactive.tsx"),
    `"use client";
import { useState } from "react";
import styles from "@/box.module.css";
import { doubleOnServer } from "@/actions";

export default function InteractiveWidget() {
  const [val, setVal] = useState(3);
  return (
    <div>
      <span data-testid="val" className={styles.badge}>{val}</span>
      <button
        data-testid="double-btn"
        onClick={async () => {
          const next = await doubleOnServer(val);
          setVal(next);
        }}
      >
        Double via Server Function
      </button>
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "layout.tsx"),
    `import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "page.tsx"),
    `import InteractiveWidget from "@/interactive";

export default function Page() {
  return (
    <main>
      <h1 data-testid="heading">Bundler Parity E2E</h1>
      <InteractiveWidget />
    </main>
  );
}
`
  );

  return dir;
}

test.describe("Dinou Multi-Bundler & Dual-Mode Vendoring E2E", () => {
  for (const [bundler, extraArgs] of [
    ["esbuild", []],
    ["rollup", ["-u"]],
    ["webpack", []],
  ] as const) {
    test(`builds, hydrates, applies CSS Modules, and executes Server Functions with ${bundler} ${extraArgs.join(" ")}`, async ({
      page,
    }) => {
      const fixtureDir = createE2EFixture();
      let serverProc: ChildProcess | null = null;

      try {
        const buildRes = spawnSync(
          process.execPath,
          [CLI_PATH, `build:node:${bundler}`, ...extraArgs],
          { cwd: fixtureDir, encoding: "utf8" }
        );
        expect(buildRes.status, buildRes.stderr).toBe(0);

        const port = await getFreePort();
        serverProc = spawn(
          process.execPath,
          [CLI_PATH, `start:node:${bundler}`, ...extraArgs],
          {
            cwd: fixtureDir,
            env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
            stdio: "pipe",
          }
        );

        const baseUrl = `http://127.0.0.1:${port}`;
        await waitForServer(baseUrl);

        await page.goto(baseUrl);
        await expect(page.getByTestId("heading")).toHaveText(
          "Bundler Parity E2E"
        );
        const valBadge = page.getByTestId("val");
        await expect(valBadge).toHaveText("3");

        const bgColor = await valBadge.evaluate(
          (el) => getComputedStyle(el).backgroundColor
        );
        expect(bgColor).toBe("rgb(16, 185, 129)");

        await page.getByTestId("double-btn").click();
        await expect(valBadge).toHaveText("6");
      } finally {
        if (serverProc && !serverProc.killed) {
          serverProc.kill();
        }
        try {
          fs.rmSync(fixtureDir, { recursive: true, force: true });
        } catch {}
      }
    });
  }
});
