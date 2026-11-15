# Upstream Handoff: Unified Styles, CSS Modules (RSC + SSR + Client), Tailwind v4 HMR & Multi-Bundler CSS Asset Parity (`dinou@9.4.0`)

## 1. Executive Summary & Root-Cause Analysis

During the `v9.4.0` audit of `/docs/styles`, eight interconnected architectural, multi-bundler, multi-runtime, Windows path-casing, and HMR issues in Dinou's CSS pipeline were diagnosed and resolved across all 3 bundlers (`esbuild`, `rollup`, `webpack`) and all 4 runtimes (`Node.js`, `Bun`, `Deno`, `Cloudflare Workers`):

1. **`*.module.css` Broken in Server Components & Client Component SSR Across All 4 Runtimes (`{}` Empty Class Map & Hydration Mismatches)**:
   - **Root Cause**: All Dual-Bundle server compilers (`dinou/node/dev.js`, `dinou/node/bundle-dual-engine.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`, and `dinou/deno/build.js`) mapped `.css: "empty"` in esbuild `loader` options for both Pass A (RSC) and Pass B (SSR) without a CSS Modules loader. Importing `import styles from "./card.module.css"` in any Server Component returned `{}` (`className={undefined}`), and SSR of Client Components rendered `undefined` on the server followed by `<div class="<hash>">` on the client—causing React 19 hydration mismatches and Flash of Unstyled Content (FOUC).
   - **Architectural Fix**: Created `dinou/core/server-css-modules-plugin.js` (`createServerCssModulesPlugin`, `compileCssModuleMap`, `didCssModuleExportsChange`) using `postcss`, `postcss-import` (with `tsconfig.json` alias support), and `postcss-modules` configured with Dinou's shared `createScopedName`, backed by an `mtimeMs` + `@import`-dependency cache. Wired `createServerCssModulesPlugin` and `"style"` package condition into Pass A (RSC) and Pass B (SSR) across `node/dev.js`, `node/bundle-dual-engine.js`, `cloudflare/build.js`, `bun/build.js`, and `deno/build.js`.

2. **Windows Drive-Letter Case Discrepancy in `createScopedName` (`C:\` vs `c:\` Producing Different Scoped Hashes)**:
   - **Root Cause**: `dinou/core/createScopedName.js` passed `process.cwd()` and `filepath` raw to `generic-names`. On Windows, tools such as SWC, Babel, Rollup, Webpack, and Node `fileURLToPath` frequently differ in drive-letter casing (`C:\...` vs `c:\...`) or slash direction (`\` vs `/`), causing `generic-names` (`path.relative(context, filepath)`) to compute different relative paths and therefore **different** `[hash:base64]` class names between Server/SSR and Client bundles!
   - **Fix**: Normalized both the `src` context directory and `filepath` through `normalizePathCase(path.resolve(...)).replace(/\\/g, "/")` in `dinou/core/createScopedName.js`, caching the `genericNames` generator instance per normalized context directory.

3. **Incremental Dev Rebuilds Wiping Unchanged Stylesheets & Stale Tailwind v4 Utilities When Editing `.tsx` Files**:
   - **Root Cause**:
     - **Esbuild**: `dinou/esbuild/plugins-postcss/postcss-extract-plugin.js` stored `extractedCSS` in a flat array cleared on every `finalize()`. During incremental dev rebuilds, cached unchanged stylesheets (like `src/globals.css`) skipped `onLoad`, wiping global styles and Tailwind utilities out of `/styles.css`! Furthermore, editing a `.tsx` file to add a new Tailwind utility class (e.g. `bg-emerald-700`) never re-ran `@tailwindcss/postcss` on `globals.css` because `globals.css`'s own `mtime` had not changed, and `@import` / `url(...)` dependencies were not tracked in `cssCache`.
     - **Rollup**: `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` only re-emitted `knownCssChunks` on incremental builds when `hasPendingCssChange` was `true`, causing Server Component stylesheets (`src/globals.css`) to disappear from `/styles.css` whenever a `.tsx` file triggered a Rollup rebuild! And `rollup-plugin-esm-hmr.js` only broadcast `style-update` when a `.css` file was in `changedIds`, missing Tailwind utility updates triggered by `.tsx` edits.
   - **Fix**:
     - Refactored `postcss-extract-plugin.js` to maintain a persistent per-file `extractedByFile` `Map` (pruning deleted files automatically and returning `changed` from `finalize()`).
     - Enhanced `css-processor-plugin.js` to track PostCSS `dependency` messages (`@import` and `url(...)` files) in dev `cssCache`, track Tailwind entry stylesheets (`tailwindCssFiles`), re-evaluate Tailwind stylesheets when `.js`/`.jsx`/`.ts`/`.tsx` files change (`changedIds` or `cssRefreshRef.refresh()` wired to `dinou/node/dev.js` for Server Component `page.tsx`/`layout.tsx` edits), and broadcast `style-update` whenever finalized `/styles.css` content changes.
     - Updated Rollup's `rollup-plugin-react-client-manifest.js` to **always** re-emit `knownCssChunks` on `!isInitial` builds and invalidate Tailwind CSS modules via `shouldTransformCachedModule` when source files change; updated `rollup-plugin-esm-hmr.js` to compare `bundle["styles.css"]` content (`lastStylesCssContent`) and broadcast `style-update` whenever `/styles.css` changes.
     - Updated `dinou/node/dev.js` to inspect `.module.css` edits with `didCssModuleExportsChange`: pure CSS property edits bypass `ctxA`/`ctxB` server rebuilds completely (0ms server overhead, instant client `style-update`), while adding/renaming a class key rebuilds `ctxA`/`ctxB` and dispatches `rsc-update` (refreshing layout cache too when needed).

4. **JSONC `tsconfig.json` Comments/Trailing Commas & Missing `@import "@/..."` Alias Support in Webpack**:
   - **Root Cause**:
     - `dinou/core/get-abs-path-with-ext.js` parsed `tsconfig.json` with plain `JSON.parse(...)` (silently failing and returning an empty alias map whenever `tsconfig.json` contained `//` comments, `/* ... */` comments, or trailing commas!).
     - Naive comment regexes (`/\/\*[\s\S]*?\*\/|\/\/.*/g`) corrupt `"@/*"` wildcards inside JSON string literals.
     - `@esbuild-plugins/tsconfig-paths` in `get-config-esbuild-prod.js` crashed with `Error: Cannot load json for '.../tsconfig.json'` when `tsconfig.json` contained trailing commas.
     - `dinou/webpack/webpack.config.js` omitted `postcss-import` completely in its inline `postcss-loader` options (and skipped `postcss-loader` altogether on `.module.css` files, breaking `@import "@/..."` and Tailwind v4 `@reference` / `@apply` inside CSS Modules in Webpack!).
   - **Fix**:
     - Added string-literal-safe `stripJsonCommentsAndTrailingCommas` and `mtimeMs`-cached `getTsconfigAliases()` in `dinou/core/get-abs-path-with-ext.js`, and passed pre-parsed `tsconfig` + `tsconfigRaw` in `get-config-esbuild-prod.js`.
     - Created shared `dinou/core/postcss-pipeline.js` (`createBasePostCssPlugins`) wiring `postcss-import` (with `resolveCssImportSpecifier`), `@tailwindcss/postcss`, `autoprefixer`, and `createPostCssUrlAssetsPlugin` identically across Esbuild, Rollup, and **both** `.css` and `.module.css` rules in Webpack.

5. **Server Component CSS Entry Discovery Bugs (`Set.prototype.add(...arr)`, `error.tsx`/`not_found.tsx`, Bare `node_modules` CSS, and Blind `glob("**/*.css")`)**:
   - **Root Cause**:
     - `get-esbuild-entries.js` and `get-webpack-entries.js` called `detectedCSSEntries.add(...csss.map(...))` — `Set.prototype.add` ignores every argument after the first, silently dropping the 2nd, 3rd, ... CSS imports in any Server Component or Layout!
     - `isPageOrLayout` omitted `error.*` and `not_found.*`, so stylesheets imported exclusively by `src/error.tsx` or `src/not_found.tsx` were never bundled.
     - Bare `node_modules` stylesheet imports in Server Components (e.g. `import "katex/dist/katex.min.css"` or `exports["./styles"].style`) returned `null` from `getAbsPathWithExt` and were dropped.
     - `get-esbuild-entries.js` ran `glob(["**/*.css"])` across all of `src/`, blindly compiling unimported partial stylesheets in Esbuild while Rollup and Webpack only bundled imported stylesheets, and attempted `readFileSync(..., "utf8")` before checking asset/CSS extensions when recursing.
   - **Fix**:
     - Added `resolveStyleImportFromCode` in `dinou/core/get-abs-path-with-ext.js` supporting bare `node_modules` `.css` files and `package.json` `exports` `"style"` condition / `"style"` field.
     - Updated `get-esbuild-entries.js`, `get-webpack-entries.js`, and `rollup-plugin-react-client-manifest.js` to deduplicate via case-normalized `Map`, include `error.*` and `not_found.*` in `isPageOrLayout`, check `.css`/asset/`.json` extensions before reading source code, and remove Esbuild's blind `glob(["**/*.css"])`.

6. **CSS `url(...)` Asset Resolution, Emission, Public `/...` Preservation & Font Extensions**:
   - **Root Cause**:
     - Esbuild and Rollup had no PostCSS `url(...)` asset emitter, leaving relative (`url("./bg.png")`, `url("../fonts/inter.woff2")`), `node_modules`-relative (`katex` fonts), or aliased (`url("@/assets/pattern.svg#grid")`) CSS URLs broken at `/styles.css` in the browser.
     - Conversely, Webpack's `css-loader` intercepted root-relative `url("/hero.png")` references meant for `public/hero.png` and failed the build when `src/hero.png` did not exist!
     - Font extensions (`woff`, `woff2`, `ttf`, `otf`, `eot`) were missing from `dinou/core/asset-extensions.js` and `dinou/assets.d.ts`.
   - **Fix**:
     - Added `woff`, `woff2`, `ttf`, `otf`, and `eot` to `dinou/core/asset-extensions.js`, `dinou/assets.d.ts`, and `dataurl` loaders in `cloudflare/build.js`, `bun/build.js`, and `deno/build.js`.
     - Implemented `createPostCssUrlAssetsPlugin` in `dinou/core/postcss-pipeline.js`: preserves `/...` (`public/`), `data:`, `blob:`, `http(s):`, `//`, and `#fragment` URLs untouched; resolves relative, `@import`-inlined (via `decl.source.input.file`), `node_modules`, and `tsconfig` aliased `url(...)` assets; rewrites them to `url("/assets/<scoped><ext>[#hash]")`; populates dev VFS (`globalThis.__DINOU_MEM_FILES__`); and emits physical files into `.dinou/dist3/assets/` across Esbuild, Rollup, and Webpack (configuring Webpack `css-loader` with `url: { filter: (url) => !url.startsWith("/") }, import: false`).

7. **Webpack Dev Mode CSS HMR (`style-update`) & `rsc-update` Without Full Page Reload**:
   - **Root Cause**: `dinou/core/client-webpack.jsx` had no WebSocket listener for Dinou's dev server HMR channel, and `dinou/node/dev.js` fell back to full page reloads (`static-changed`) in Webpack dev mode.
   - **Fix**: Defined `process.env.DINOU_HMR_PORT` in `webpack.config.js` dev builds, updated `dinou/node/dev.js` to dispatch structured `{ type: "dinou-hmr", data }` messages in Webpack dev mode, and added a WebSocket listener in `dinou/core/client-webpack.jsx` that applies `style-update` in-place via cache-busted `<link rel="stylesheet">` URLs and handles `rsc-update` via `window.__DINOU_ROUTER_REFRESH__` with zero React client state loss.

8. **Consistent Production `/styles.css` Minification Across All 3 Bundlers**:
   - **Root Cause**: Production `/styles.css` output in Esbuild and Webpack was unminified (containing full Tailwind comments and whitespace), whereas Rollup enabled `minimize: !isDevelopment`.
   - **Fix**: Added fast, deterministic `esbuild.transformSync(css, { loader: "css", minify: true })` production minification across `postcss-extract-plugin.js` (Esbuild), `rollup.config.js` (Rollup), and `DinouCssAssetsAndMinifyPlugin` in `webpack.config.js` (Webpack).

---

## 2. Complete File Manifest (27 Files in `dinou/`)

### New Files (2)
1. `dinou/core/postcss-pipeline.js`
2. `dinou/core/server-css-modules-plugin.js`

### Modified Files (25)
3. `dinou/core/createScopedName.js`
4. `dinou/core/asset-extensions.js`
5. `dinou/assets.d.ts`
6. `dinou/core/get-abs-path-with-ext.js`
7. `dinou/esbuild/plugins-postcss/postcss-extract-plugin.js`
8. `dinou/esbuild/plugins-esbuild/css-processor-plugin.js`
9. `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`
10. `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`
11. `dinou/esbuild/helpers-esbuild/get-esbuild-entries.js`
12. `dinou/esbuild/dev.js`
13. `dinou/esbuild/react-refresh/esm-hmr/client.js`
14. `dinou/rollup/postcss.config.js`
15. `dinou/rollup/rollup.config.js`
16. `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js`
17. `dinou/rollup/react-refresh/rollup-plugin-esm-hmr.js`
18. `dinou/rollup/react-refresh/esm-hmr/client.js`
19. `dinou/webpack/postcss.config.js`
20. `dinou/webpack/webpack.config.js`
21. `dinou/webpack/helpers/get-webpack-entries.js`
22. `dinou/core/client-webpack.jsx`
23. `dinou/node/dev.js`
24. `dinou/node/bundle-dual-engine.js`
25. `dinou/cloudflare/build.js`
26. `dinou/bun/build.js`
27. `dinou/deno/build.js`

---

## 3. Source Code & Exact Modifications

### 3.1. [NEW] `dinou/core/postcss-pipeline.js`

```js
import fs from "node:fs";
import path from "node:path";
import rawPostcss from "#postcss";
import rawPostcssImport from "#postcss-import";
import rawTailwindcss from "#tailwindcss/postcss";
import rawAutoprefixer from "#autoprefixer";
import rawPostCssModules from "#postcss-modules";
import createScopedName from "./createScopedName.js";
import { getAbsPathWithExt, resolveCssImportSpecifier } from "./get-abs-path-with-ext.js";

const unwrap = (mod) => (typeof mod === "function" ? mod : mod?.default || mod);

export const postcss = unwrap(rawPostcss);
export const postcssImport = unwrap(rawPostcssImport);
export const tailwindcss = unwrap(rawTailwindcss);
export const autoprefixer = unwrap(rawAutoprefixer);
export const postCssModules = unwrap(rawPostCssModules);

const URL_FUNCTION_REGEX = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)"'\s]+))\s*\)/gi;

function isExternalOrPublicCssUrl(rawUrl) {
  if (!rawUrl) return true;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("http:") ||
    trimmed.startsWith("https:") ||
    trimmed.startsWith("//")
  ) {
    return true;
  }
  return false;
}

function resolveCssAssetUrlPath(cleanUrlPath, declDir) {
  const viaAliasOrRel = getAbsPathWithExt(cleanUrlPath, { parentDir: declDir });
  if (viaAliasOrRel && fs.existsSync(viaAliasOrRel) && fs.statSync(viaAliasOrRel).isFile()) {
    return viaAliasOrRel;
  }
  const candidate = path.resolve(declDir, cleanUrlPath);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate;
  }
  return null;
}

export function getRegisteredCssUrlAssets() {
  if (typeof globalThis === "undefined") return new Map();
  if (!globalThis.__DINOU_CSS_URL_ASSETS__) {
    globalThis.__DINOU_CSS_URL_ASSETS__ = new Map();
  }
  return globalThis.__DINOU_CSS_URL_ASSETS__;
}

export function createPostCssUrlAssetsPlugin({ onAsset } = {}) {
  return {
    postcssPlugin: "dinou-postcss-url-assets",
    OnceExit(root, { result }) {
      const fallbackFrom = result?.opts?.from
        ? path.resolve(result.opts.from)
        : path.join(process.cwd(), "src", "__styles__.css");

      root.walkDecls((decl) => {
        if (!decl.value || !decl.value.includes("url(")) return;

        const declFile = decl.source?.input?.file
          ? path.resolve(decl.source.input.file)
          : fallbackFrom;
        const declDir = path.dirname(declFile);

        URL_FUNCTION_REGEX.lastIndex = 0;
        const nextValue = decl.value.replace(
          URL_FUNCTION_REGEX,
          (fullMatch, dqUrl, sqUrl, bareUrl) => {
            const rawUrl = dqUrl ?? sqUrl ?? bareUrl ?? "";
            if (isExternalOrPublicCssUrl(rawUrl)) {
              return fullMatch;
            }

            const hashIdx = rawUrl.indexOf("#");
            const hashPart = hashIdx === -1 ? "" : rawUrl.slice(hashIdx);
            const withoutHash = hashIdx === -1 ? rawUrl : rawUrl.slice(0, hashIdx);
            const queryIdx = withoutHash.indexOf("?");
            const cleanUrlPath =
              queryIdx === -1 ? withoutHash : withoutHash.slice(0, queryIdx);

            if (!cleanUrlPath) return fullMatch;

            const resolvedPath = resolveCssAssetUrlPath(cleanUrlPath, declDir);
            if (!resolvedPath) {
              return fullMatch;
            }

            const ext = path.extname(resolvedPath);
            const base = path.basename(resolvedPath, ext);
            const scoped = createScopedName(base, resolvedPath);
            const assetFileName = `assets/${scoped}${ext}`;

            const registry = getRegisteredCssUrlAssets();
            registry.set(assetFileName, resolvedPath);

            if (typeof onAsset === "function") {
              onAsset(resolvedPath, assetFileName);
            }

            if (
              typeof globalThis !== "undefined" &&
              process.env.NODE_ENV !== "production"
            ) {
              try {
                const buf = fs.readFileSync(resolvedPath);
                if (!globalThis.__DINOU_MEM_FILES__) {
                  globalThis.__DINOU_MEM_FILES__ = new Map();
                }
                globalThis.__DINOU_MEM_FILES__.set(assetFileName, buf);
                globalThis.__DINOU_MEM_FILES__.set("/" + assetFileName, buf);
                globalThis.__DINOU_MEM_FILES__.set(`${scoped}${ext}`, buf);
              } catch (e) {}
            }

            if (result && Array.isArray(result.messages)) {
              result.messages.push({
                type: "dependency",
                plugin: "dinou-postcss-url-assets",
                file: resolvedPath,
                parent: declFile,
              });
            }

            return `url("/${assetFileName}${hashPart}")`;
          }
        );

        if (nextValue !== decl.value) {
          decl.value = nextValue;
        }
      });
    },
  };
}
createPostCssUrlAssetsPlugin.postcss = true;

export function createBasePostCssPlugins({ onAsset } = {}) {
  return [
    postcssImport({
      resolve: (id, basedir) => resolveCssImportSpecifier(id, basedir),
    }),
    tailwindcss(),
    autoprefixer(),
    createPostCssUrlAssetsPlugin({ onAsset }),
  ];
}

export function isTailwindStylesheetSource(source) {
  if (typeof source !== "string") return false;
  return /@import\s+["']tailwindcss(?:\/|["'])|@tailwind\b/.test(source);
}

export default {
  postcss,
  postcssImport,
  tailwindcss,
  autoprefixer,
  postCssModules,
  createPostCssUrlAssetsPlugin,
  createBasePostCssPlugins,
  getRegisteredCssUrlAssets,
  isTailwindStylesheetSource,
};
```

---

### 3.2. [NEW] `dinou/core/server-css-modules-plugin.js`

```js
import fs from "node:fs";
import path from "node:path";
import createScopedName from "./createScopedName.js";
import { normalizePathCase } from "./path-utils.js";
import {
  resolveCssImportSpecifier,
  resolveStyleImportFromCode,
} from "./get-abs-path-with-ext.js";
import { postcss, postcssImport, postCssModules } from "./postcss-pipeline.js";

const serverCssModuleCache = new Map();
const lastKnownExportJsonByFile = new Map();

function normalizeCacheKey(filePath) {
  return normalizePathCase(path.resolve(filePath)).replace(/\\/g, "/");
}

function getFileMtimeSafe(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (e) {
    return -1;
  }
}

function isCacheEntryFresh(entry, rootPath) {
  if (!entry) return false;
  const currentMtime = getFileMtimeSafe(rootPath);
  if (currentMtime < 0 || currentMtime !== entry.mtimeMs) return false;
  if (Array.isArray(entry.deps)) {
    for (const dep of entry.deps) {
      if (getFileMtimeSafe(dep.path) !== dep.mtimeMs) {
        return false;
      }
    }
  }
  return true;
}

export async function compileCssModuleMap(filePath) {
  const absPath = path.resolve(filePath);
  const key = normalizeCacheKey(absPath);
  const cached = serverCssModuleCache.get(key);
  if (isCacheEntryFresh(cached, absPath)) {
    return {
      map: cached.map,
      contents: cached.contents,
      watchFiles: cached.watchFiles,
    };
  }

  const mtimeMs = getFileMtimeSafe(absPath);
  const source = await fs.promises.readFile(absPath, "utf8");
  let map = {};

  const result = await postcss([
    postcssImport({
      resolve: (id, basedir) => resolveCssImportSpecifier(id, basedir),
    }),
    postCssModules({
      generateScopedName: (name, filename) => {
        if (!filename || !/\.module\.css$/i.test(filename)) return name;
        return createScopedName(name, filename);
      },
      getJSON: (_, json) => {
        map = json || {};
      },
    }),
  ]).process(source, { from: absPath });

  const depPaths = new Set();
  if (Array.isArray(result.messages)) {
    for (const msg of result.messages) {
      if (msg && msg.type === "dependency" && msg.file) {
        depPaths.add(path.resolve(msg.file));
      }
    }
  }
  depPaths.delete(absPath);

  const deps = Array.from(depPaths).map((depPath) => ({
    path: depPath,
    mtimeMs: getFileMtimeSafe(depPath),
  }));
  const watchFiles = [absPath, ...Array.from(depPaths)];
  const mapJson = JSON.stringify(map);
  const contents = `export default ${mapJson};`;

  lastKnownExportJsonByFile.set(key, mapJson);
  serverCssModuleCache.set(key, {
    mtimeMs,
    deps,
    map,
    mapJson,
    contents,
    watchFiles,
  });

  return { map, contents, watchFiles };
}

export async function didCssModuleExportsChange(filePath) {
  const absPath = path.resolve(filePath);
  const key = normalizeCacheKey(absPath);
  const prevJson = lastKnownExportJsonByFile.get(key);
  if (!fs.existsSync(absPath)) {
    lastKnownExportJsonByFile.delete(key);
    serverCssModuleCache.delete(key);
    return prevJson !== undefined;
  }
  const { map } = await compileCssModuleMap(absPath);
  const nextJson = JSON.stringify(map);
  return prevJson === undefined || prevJson !== nextJson;
}

export function createServerCssModulesPlugin({ projectRoot = process.cwd() } = {}) {
  return {
    name: "dinou-server-css-modules",
    setup(build) {
      build.onResolve({ filter: /\.(?:css|scss|sass|less)(?:[?#].*)?$/i }, (args) => {
        if (args.pluginData?.skipDinouServerCssResolve) return null;
        const importer =
          args.importer ||
          path.join(args.resolveDir || projectRoot, "__dinou_server_css__.js");
        const resolved = resolveStyleImportFromCode(args.path, importer);
        if (resolved) {
          return { path: resolved };
        }
        return null;
      });

      build.onLoad({ filter: /\.module\.css$/i }, async (args) => {
        const { contents, watchFiles } = await compileCssModuleMap(args.path);
        return {
          contents,
          loader: "js",
          watchFiles,
        };
      });
    },
  };
}

export default createServerCssModulesPlugin;
```

---

### 3.3. [MODIFIED] `dinou/core/createScopedName.js`

Replace the entire file with:

```js
import genericNames from "#generic-names";
import path from "node:path";
import { normalizePathCase } from "./path-utils.js";

const generatorCache = new Map();

function normalizeForHash(p) {
  if (!p || typeof p !== "string") return "";
  return normalizePathCase(path.resolve(p)).replace(/\\/g, "/");
}

function getGenerator(contextDir) {
  let gen = generatorCache.get(contextDir);
  if (!gen) {
    gen = genericNames("[hash:base64]", { context: contextDir });
    generatorCache.set(contextDir, gen);
  }
  return gen;
}

export default function createScopedName(localName, filepath) {
  const contextDir = normalizeForHash(path.resolve(process.cwd(), "src"));
  const normalizedFilepath = filepath ? normalizeForHash(filepath) : filepath;
  return getGenerator(contextDir)(localName, normalizedFilepath);
}
```

---

### 3.4. [MODIFIED] `dinou/core/asset-extensions.js` & `dinou/assets.d.ts`

In `dinou/core/asset-extensions.js`, append font extensions to `extensions`:

```diff
   "mjpeg",
   "mjpg",
+  "woff",
+  "woff2",
+  "ttf",
+  "otf",
+  "eot",
 ];
```

In `dinou/assets.d.ts`, append ambient module declarations for fonts:

```ts
// Fonts
declare module "*.woff" {
  const value: string;
  export default value;
}

declare module "*.woff2" {
  const value: string;
  export default value;
}

declare module "*.ttf" {
  const value: string;
  export default value;
}

declare module "*.otf" {
  const value: string;
  export default value;
}

declare module "*.eot" {
  const value: string;
  export default value;
}
```

---

### 3.5. [MODIFIED] `dinou/core/get-abs-path-with-ext.js`

Replace the entire file with:

```js
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import resolve from "resolve";

export function stripJsonCommentsAndTrailingCommas(raw) {
  if (typeof raw !== "string") return "";
  const withoutComments = raw.replace(
    /"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    (match) => (match.startsWith('"') ? match : "")
  );
  return withoutComments.replace(/,(\s*[}\]])/g, "$1");
}

let cachedAliasState = {
  cwd: null,
  configFile: null,
  mtimeMs: -1,
  map: new Map(),
};

// Reads tsconfig/jsconfig (tolerating JSONC comments & trailing commas) and builds a map of alias -> targetBase
function getTsconfigAliases() {
  const cwd = process.cwd();
  const tsconfigPath = path.resolve(cwd, "tsconfig.json");
  const jsconfigPath = path.resolve(cwd, "jsconfig.json");
  const configFile = fs.existsSync(tsconfigPath)
    ? tsconfigPath
    : fs.existsSync(jsconfigPath)
      ? jsconfigPath
      : null;

  if (!configFile) {
    cachedAliasState = { cwd, configFile: null, mtimeMs: -1, map: new Map() };
    return cachedAliasState.map;
  }

  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(configFile).mtimeMs;
  } catch (e) {
    return new Map();
  }

  if (
    cachedAliasState.cwd === cwd &&
    cachedAliasState.configFile === configFile &&
    cachedAliasState.mtimeMs === mtimeMs
  ) {
    return cachedAliasState.map;
  }

  let config;
  try {
    const cleaned = stripJsonCommentsAndTrailingCommas(
      fs.readFileSync(configFile, "utf8")
    );
    config = JSON.parse(cleaned);
  } catch (err) {
    cachedAliasState = { cwd, configFile, mtimeMs, map: new Map() };
    return cachedAliasState.map;
  }

  const paths = (config.compilerOptions && config.compilerOptions.paths) || {};
  const baseUrl =
    (config.compilerOptions && config.compilerOptions.baseUrl) || ".";
  const absoluteBase = path.resolve(cwd, baseUrl);

  const map = new Map();

  for (const key of Object.keys(paths)) {
    const targets = paths[key];
    if (!targets || !targets.length) continue;

    const target = Array.isArray(targets) ? targets[0] : targets;
    if (typeof target !== "string") continue;

    const keyIsWildcard = key.endsWith("/*");
    const targetIsWildcard = target.endsWith("/*");

    const alias = keyIsWildcard ? key.slice(0, -1) : key;
    const targetBase = targetIsWildcard ? target.slice(0, -1) : target;
    const resolvedTargetBase = path.resolve(absoluteBase, targetBase);

    map.set(alias, {
      resolvedTargetBase,
      keyIsWildcard,
      targetIsWildcard,
    });
  }

  cachedAliasState = { cwd, configFile, mtimeMs, map };
  return map;
}

function tryExtensions(filePath) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return filePath;
  }
  const exts = [".js", ".mjs", ".ts", ".jsx", ".tsx", ".css", ".json"];
  for (const ext of exts) {
    const f = filePath + ext;
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    for (const ext of exts) {
      const f = path.join(filePath, "index" + ext);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    }
  }
  return null;
}

function getParentDirectory(context) {
  if (context?.parentDir) {
    return path.resolve(context.parentDir);
  }
  const parentURL = context?.parentURL;
  if (!parentURL) return process.cwd();
  const cleanParentURL = parentURL.split("?")[0];
  const fsPath = fileURLToPath(cleanParentURL);
  try {
    if (fs.existsSync(fsPath) && fs.statSync(fsPath).isDirectory()) {
      return fsPath;
    }
  } catch (e) {}
  return path.dirname(fsPath);
}

export function getAbsPathWithExt(specifier, context) {
  const cleanSpecifier = specifier ? specifier.split("?")[0].split("#")[0] : specifier;
  if (!cleanSpecifier) return null;

  const aliasMap = getTsconfigAliases();
  if (aliasMap.size > 0) {
    for (const [alias, info] of aliasMap.entries()) {
      if (info.keyIsWildcard ? cleanSpecifier.startsWith(alias) : cleanSpecifier === alias) {
        const absPath = info.keyIsWildcard
          ? path.resolve(info.resolvedTargetBase, cleanSpecifier.slice(alias.length))
          : info.resolvedTargetBase;
        return tryExtensions(absPath);
      }
    }
  }

  if (cleanSpecifier.startsWith("./") || cleanSpecifier.startsWith("../")) {
    const parentDir = getParentDirectory(context);
    const absPath = path.resolve(parentDir, cleanSpecifier);
    return tryExtensions(absPath);
  }

  return null;
}

function resolveStyleExportsTarget(expVal) {
  if (!expVal) return null;
  if (typeof expVal === "string") return expVal;
  if (typeof expVal === "object") {
    for (const key of ["style", "css", "import", "default"]) {
      if (expVal[key]) {
        const nested = resolveStyleExportsTarget(expVal[key]);
        if (nested) return nested;
      }
    }
  }
  return null;
}

function resolveBareStyleFromNodeModules(cleanSpecifier, basedir) {
  if (
    !cleanSpecifier ||
    cleanSpecifier.startsWith(".") ||
    cleanSpecifier.startsWith("/") ||
    cleanSpecifier.startsWith("\\") ||
    path.isAbsolute(cleanSpecifier)
  ) {
    return null;
  }

  const parts = cleanSpecifier.startsWith("@")
    ? cleanSpecifier.split("/").slice(0, 2)
    : [cleanSpecifier.split("/")[0]];
  const pkgName = parts.join("/");
  const subpath = cleanSpecifier.slice(pkgName.length) || ".";
  const normalizedSubpath = subpath === "." ? "." : `.${subpath}`;

  try {
    const req = createRequire(path.join(basedir || process.cwd(), "__dinou_resolve__.js"));
    let pkgJsonPath = null;
    try {
      pkgJsonPath = req.resolve(`${pkgName}/package.json`);
    } catch (e) {
      let cur = path.resolve(basedir || process.cwd());
      while (true) {
        const candidate = path.join(cur, "node_modules", pkgName, "package.json");
        if (fs.existsSync(candidate)) {
          pkgJsonPath = candidate;
          break;
        }
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
      }
    }

    if (pkgJsonPath && fs.existsSync(pkgJsonPath)) {
      const pkgDir = path.dirname(pkgJsonPath);
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      if (pkgJson.exports) {
        const exportEntry =
          normalizedSubpath === "."
            ? pkgJson.exports["."] || pkgJson.exports
            : pkgJson.exports[normalizedSubpath];
        const targetRel = resolveStyleExportsTarget(exportEntry);
        if (targetRel) {
          const candidate = path.resolve(pkgDir, targetRel);
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
          }
        }
      }
      if (normalizedSubpath === "." && typeof pkgJson.style === "string") {
        const candidate = path.resolve(pkgDir, pkgJson.style);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      }
      if (normalizedSubpath !== ".") {
        const directCandidate = tryExtensions(path.resolve(pkgDir, normalizedSubpath));
        if (directCandidate) return directCandidate;
      }
    }
  } catch (e) {}

  try {
    return resolve.sync(cleanSpecifier, {
      basedir: basedir || process.cwd(),
      extensions: [".css", ".scss", ".sass", ".less"],
      packageFilter(pkg) {
        if (pkg.style && !pkg.main) {
          pkg.main = pkg.style;
        }
        return pkg;
      },
    });
  } catch (e) {
    return null;
  }
}

export function resolveCssImportSpecifier(specifier, basedir) {
  const cleanSpecifier = specifier ? specifier.split("?")[0].split("#")[0] : specifier;
  if (!cleanSpecifier) return specifier;

  const resolvedAliasOrRel = getAbsPathWithExt(cleanSpecifier, {
    parentDir: basedir || process.cwd(),
  });
  if (resolvedAliasOrRel) {
    return resolvedAliasOrRel;
  }

  if (!cleanSpecifier.startsWith("/")) {
    const localCandidate = tryExtensions(path.resolve(basedir || process.cwd(), cleanSpecifier));
    if (localCandidate) {
      return localCandidate;
    }
  }

  const bareResolved = resolveBareStyleFromNodeModules(cleanSpecifier, basedir || process.cwd());
  if (bareResolved) {
    return bareResolved;
  }

  throw new Error(
    `[Dinou CSS] Cannot resolve CSS @import "${specifier}" from "${basedir || process.cwd()}"`
  );
}

export function resolveStyleImportFromCode(specifier, importerFilePath) {
  const cleanSpecifier = specifier ? specifier.split("?")[0].split("#")[0] : specifier;
  if (!cleanSpecifier) return null;

  const localOrAlias = getAbsPathWithExt(cleanSpecifier, {
    parentURL: pathToFileURL(importerFilePath).href,
  });
  if (localOrAlias) {
    return localOrAlias;
  }

  const looksLikeStylesheet =
    /\.(css|scss|sass|less)$/i.test(cleanSpecifier) ||
    /(?:^|\/)(?:styles?|css)(?:$|\/)/i.test(cleanSpecifier);
  if (!looksLikeStylesheet) {
    return null;
  }

  const resolved = resolveBareStyleFromNodeModules(
    cleanSpecifier,
    path.dirname(importerFilePath)
  );
  if (resolved && /\.(css|scss|sass|less)$/i.test(resolved)) {
    return resolved;
  }
  return null;
}

export default {
  getAbsPathWithExt,
  resolveCssImportSpecifier,
  resolveStyleImportFromCode,
  stripJsonCommentsAndTrailingCommas,
};
```

---

### 3.6. [MODIFIED] Esbuild CSS & Config Pipeline

#### `dinou/esbuild/plugins-postcss/postcss-extract-plugin.js`
Replace the entire file with:

```js
// postcss-extract-plugin.js
import fs from "node:fs";
import path from "node:path";
import esbuild from "esbuild";
import { normalizePathCase } from "../../core/path-utils.js";

function normalizeFileKey(filePath) {
  if (!filePath || typeof filePath !== "string") return "";
  return normalizePathCase(path.resolve(filePath)).replace(/\\/g, "/");
}

const createPostCSSExtractPlugin = (options = {}) => {
  const { outputFile = "styles.css", shouldExtract = () => true } = options;

  // Per-file CSS map so incremental rebuilds never wipe unchanged stylesheets
  const extractedByFile = new Map();
  let lastFinalizedCSS = null;
  let cachedCSSBuffer = null;

  const setExtractedCss = (filePath, cssText) => {
    const key = normalizeFileKey(filePath);
    if (!key) return;
    extractedByFile.set(key, {
      filePath: path.resolve(filePath),
      css: cssText || "",
    });
  };

  const getExtractedCss = (filePath) => {
    const key = normalizeFileKey(filePath);
    return key ? extractedByFile.get(key)?.css : undefined;
  };

  const postcssPlugin = {
    postcssPlugin: "postcss-extract",

    OnceExit(root, { result }) {
      const filePath = result.opts.from;

      if (shouldExtract(filePath, root)) {
        const cssText = root.toString();
        if (filePath) {
          setExtractedCss(filePath, cssText);
        }
        root.removeAll();
      }
    },
  };

  const finalize = () => {
    const isProduction = process.env.NODE_ENV === "production";
    const parts = [];

    for (const [key, entry] of extractedByFile.entries()) {
      if (entry.filePath && !fs.existsSync(entry.filePath)) {
        extractedByFile.delete(key);
        continue;
      }
      if (entry.css) {
        parts.push(entry.css);
      }
    }

    let combinedCSS = parts.length > 0 ? parts.join("\n") + "\n" : "";

    if (isProduction && combinedCSS) {
      try {
        combinedCSS = esbuild.transformSync(combinedCSS, {
          loader: "css",
          minify: true,
        }).code;
      } catch (e) {}
    }

    const changed = lastFinalizedCSS !== null && combinedCSS !== lastFinalizedCSS;
    lastFinalizedCSS = combinedCSS;
    cachedCSSBuffer = Buffer.from(combinedCSS, "utf8");

    if (typeof globalThis !== "undefined") {
      if (!globalThis.__DINOU_MEM_FILES__) {
        globalThis.__DINOU_MEM_FILES__ = new Map();
      }
      globalThis.__DINOU_MEM_FILES__.set("styles.css", cachedCSSBuffer);
      globalThis.__DINOU_MEM_FILES__.set("/styles.css", cachedCSSBuffer);
    }

    const shouldWriteToDisk =
      process.env.DINOU_WRITE_TO_DISK === "true" || isProduction;
    if (shouldWriteToDisk && (combinedCSS || fs.existsSync(outputFile))) {
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputFile, combinedCSS, "utf8");
    }

    return changed;
  };

  const addExtractedCss = (cssText, filePath) => {
    if (filePath) {
      setExtractedCss(filePath, cssText);
    }
  };

  return {
    plugin: postcssPlugin,
    finalize,
    addExtractedCss,
    setExtractedCss,
    getExtractedCss,
  };
};

export { createPostCSSExtractPlugin };
export default createPostCSSExtractPlugin;
```

#### `dinou/esbuild/plugins-esbuild/css-processor-plugin.js`
Replace the entire file with:

```js
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import createScopedName from "../../core/createScopedName.js";
import { normalizePathCase } from "../../core/path-utils.js";
import {
  postcss,
  postCssModules,
  createBasePostCssPlugins,
  isTailwindStylesheetSource,
} from "../../core/postcss-pipeline.js";
import createPostCSSExtractPlugin from "../plugins-postcss/postcss-extract-plugin.js";

const cssCache = new Map();
let cssCacheLoaded = false;
let cssCacheDirty = false;

function normalizeFileKey(filePath) {
  if (!filePath) return "";
  return normalizePathCase(path.resolve(filePath)).replace(/\\/g, "/");
}

function getFileMtimeSafe(filePath) {
  try {
    return fsSync.statSync(filePath).mtimeMs;
  } catch (e) {
    return -1;
  }
}

function isCssCacheEntryFresh(cached, rootPath) {
  if (!cached || cached.isTailwind) return false;
  const rootMtime = getFileMtimeSafe(rootPath);
  if (rootMtime < 0 || cached.mtime !== rootMtime) return false;
  if (Array.isArray(cached.deps)) {
    for (const dep of cached.deps) {
      if (getFileMtimeSafe(dep.path) !== dep.mtime) {
        return false;
      }
    }
  }
  return true;
}

function getCssCachePath() {
  const dir = path.resolve(process.cwd(), ".dinou/cache");
  return { dir, file: path.join(dir, "css-dev-cache.json") };
}

function loadCssCache() {
  if (process.env.NODE_ENV === "production") return;
  if (cssCacheLoaded) return;
  cssCacheLoaded = true;
  try {
    const { file } = getCssCachePath();
    if (fsSync.existsSync(file)) {
      const parsed = JSON.parse(fsSync.readFileSync(file, "utf8"));
      for (const [k, v] of Object.entries(parsed)) {
        cssCache.set(k, v);
      }
    }
  } catch (e) {}
}

async function saveCssCache() {
  if (process.env.NODE_ENV === "production") return;
  if (!cssCacheDirty) return;
  cssCacheDirty = false;
  try {
    const { dir, file } = getCssCachePath();
    if (!fsSync.existsSync(dir)) {
      fsSync.mkdirSync(dir, { recursive: true });
    }
    const data = {};
    for (const [k, v] of cssCache.entries()) {
      data[k] = v;
    }
    await fs.writeFile(file, JSON.stringify(data), "utf8");
  } catch (e) {}
}

export default function cssProcessorPlugin({
  outdir = ".dinou/public",
  hmrEngine,
  changedIds,
  cssRefreshRef,
} = {}) {
  const { finalize, plugin: extractor, setExtractedCss } =
    createPostCSSExtractPlugin({
      outputFile: `${outdir}/styles.css`,
    });

  let isInitial = true;
  let hasCssChange = false;
  let postCssTotalTime = 0;
  let postCssCount = 0;
  const reloadedInCurrentBuild = new Set();
  const tailwindCssFiles = new Set();
  const emittedCssAssets = new Map();

  function recordEmittedCssAsset(resolvedAssetPath, assetFileName) {
    emittedCssAssets.set(assetFileName, resolvedAssetPath);
  }

  function flushEmittedCssAssets() {
    if (emittedCssAssets.size === 0) return;
    const isProduction = process.env.NODE_ENV === "production";
    const shouldWriteToDisk =
      process.env.DINOU_WRITE_TO_DISK === "true" || isProduction;

    for (const [assetFileName, absAssetPath] of emittedCssAssets.entries()) {
      if (!fsSync.existsSync(absAssetPath)) continue;
      try {
        const buf = fsSync.readFileSync(absAssetPath);
        if (typeof globalThis !== "undefined") {
          if (!globalThis.__DINOU_MEM_FILES__) {
            globalThis.__DINOU_MEM_FILES__ = new Map();
          }
          globalThis.__DINOU_MEM_FILES__.set(assetFileName, buf);
          globalThis.__DINOU_MEM_FILES__.set("/" + assetFileName, buf);
          globalThis.__DINOU_MEM_FILES__.set(path.basename(assetFileName), buf);
        }
        if (shouldWriteToDisk) {
          const destPath = path.resolve(outdir, assetFileName);
          const destDir = path.dirname(destPath);
          if (!fsSync.existsSync(destDir)) {
            fsSync.mkdirSync(destDir, { recursive: true });
          }
          fsSync.writeFileSync(destPath, buf);
        }
      } catch (e) {}
    }
  }

  async function processCssFile(filePath) {
    const absPath = path.resolve(filePath);
    const cacheKey = normalizeFileKey(absPath);
    const tPostCss0 = Date.now();
    const stat = await fs.stat(absPath);
    const source = await fs.readFile(absPath, "utf8");

    let map = {};
    let extractedForFile = "";
    const localAssets = [];
    const fileCapturePlugin = {
      postcssPlugin: "file-capture",
      OnceExit(root) {
        extractedForFile = root.toString();
      },
    };

    const result = await postcss([
      ...createBasePostCssPlugins({
        onAsset: (resolvedAssetPath, assetFileName) => {
          localAssets.push({ resolvedAssetPath, assetFileName });
          recordEmittedCssAsset(resolvedAssetPath, assetFileName);
        },
      }),
      postCssModules({
        generateScopedName: (name, filename) => {
          if (!filename || !filename.endsWith(".module.css")) return name;
          return createScopedName(name, filename);
        },
        getJSON: (_, json) => {
          map = json || {};
        },
      }),
      fileCapturePlugin,
      extractor,
    ]).process(source, { from: absPath });

    const depPaths = new Set();
    let usesTailwind = isTailwindStylesheetSource(source);
    if (Array.isArray(result.messages)) {
      for (const msg of result.messages) {
        if (msg && msg.type === "dependency" && msg.file) {
          const resolvedDep = path.resolve(msg.file);
          depPaths.add(resolvedDep);
          if (resolvedDep.replace(/\\/g, "/").includes("/tailwindcss/")) {
            usesTailwind = true;
          }
        }
        if (msg && msg.type === "dir-dependency") {
          usesTailwind = true;
        }
      }
    }
    depPaths.delete(absPath);

    if (usesTailwind) {
      tailwindCssFiles.add(absPath);
    } else {
      tailwindCssFiles.delete(absPath);
    }

    postCssTotalTime += Date.now() - tPostCss0;
    postCssCount++;
    globalThis.__DINOU_POSTCSS_TIME__ = postCssTotalTime;
    globalThis.__DINOU_POSTCSS_COUNT__ = postCssCount;

    const deps = Array.from(depPaths).map((depPath) => ({
      path: depPath,
      mtime: getFileMtimeSafe(depPath),
    }));

    if (process.env.NODE_ENV !== "production") {
      cssCache.set(cacheKey, {
        mtime: stat.mtimeMs,
        deps,
        assets: localAssets,
        isTailwind: usesTailwind,
        map,
        extractedCss: extractedForFile,
      });
      cssCacheDirty = true;
    }

    return {
      map,
      watchFiles: [absPath, ...Array.from(depPaths)],
    };
  }

  async function refreshTailwindStylesheets(skipReloaded = false) {
    let anyProcessed = false;
    for (const twFile of Array.from(tailwindCssFiles)) {
      if (!fsSync.existsSync(twFile)) {
        tailwindCssFiles.delete(twFile);
        continue;
      }
      if (skipReloaded && reloadedInCurrentBuild.has(normalizeFileKey(twFile))) {
        continue;
      }
      await processCssFile(twFile);
      anyProcessed = true;
    }
    if (!anyProcessed) return false;
    flushEmittedCssAssets();
    const stylesChanged = finalize();
    if (stylesChanged && hmrEngine?.value?.broadcastMessage) {
      hmrEngine.value.broadcastMessage({
        type: "style-update",
        url: "/styles.css",
      });
    }
    return stylesChanged;
  }

  if (cssRefreshRef && typeof cssRefreshRef === "object") {
    cssRefreshRef.refresh = () => refreshTailwindStylesheets(false);
  }

  return {
    name: "css-processor",
    setup(build) {
      build.onStart(() => {
        hasCssChange = false;
        postCssTotalTime = 0;
        postCssCount = 0;
        reloadedInCurrentBuild.clear();
      });

      build.onLoad({ filter: /\.css$/ }, async (args) => {
        const filePath = path.resolve(args.path);
        const cacheKey = normalizeFileKey(filePath);
        loadCssCache();
        const cached =
          process.env.NODE_ENV !== "production" ? cssCache.get(cacheKey) : null;

        const isModule = filePath.endsWith(".module.css");
        if (cached && isCssCacheEntryFresh(cached, filePath)) {
          setExtractedCss(filePath, cached.extractedCss || "");
          if (Array.isArray(cached.assets)) {
            for (const item of cached.assets) {
              recordEmittedCssAsset(item.resolvedAssetPath, item.assetFileName);
            }
          }
          const depFiles = Array.isArray(cached.deps)
            ? cached.deps.map((d) => d.path)
            : [];
          return {
            contents: isModule
              ? `export default ${JSON.stringify(cached.map || {})};`
              : `/* global: ${path.basename(filePath)} */`,
            loader: "js",
            watchFiles: [filePath, ...depFiles],
          };
        }

        hasCssChange = true;
        reloadedInCurrentBuild.add(cacheKey);
        const { map, watchFiles } = await processCssFile(filePath);

        if (isModule) {
          return {
            contents: `export default ${JSON.stringify(map)};`,
            loader: "js",
            watchFiles,
          };
        }
        return {
          contents: `/* global: ${path.basename(filePath)} */`,
          loader: "js",
          watchFiles,
        };
      });

      build.onEnd(async () => {
        if (
          !isInitial &&
          tailwindCssFiles.size > 0 &&
          changedIds &&
          changedIds.size > 0
        ) {
          const hasSourceChange = Array.from(changedIds).some((id) =>
            /\.(?:[jt]sx?|mdx|html)$/i.test(id)
          );
          if (hasSourceChange) {
            for (const twFile of Array.from(tailwindCssFiles)) {
              if (!fsSync.existsSync(twFile)) {
                tailwindCssFiles.delete(twFile);
                continue;
              }
              if (!reloadedInCurrentBuild.has(normalizeFileKey(twFile))) {
                await processCssFile(twFile);
              }
            }
          }
        }

        flushEmittedCssAssets();
        const stylesChanged = finalize();
        saveCssCache().catch(() => {});
        globalThis.__DINOU_POSTCSS_TIME__ = postCssTotalTime;
        globalThis.__DINOU_POSTCSS_COUNT__ = postCssCount;
        if (
          !isInitial &&
          (hasCssChange || stylesChanged) &&
          hmrEngine?.value?.broadcastMessage
        ) {
          hmrEngine.value.broadcastMessage({
            type: "style-update",
            url: "/styles.css",
          });
        }
        isInitial = false;
        hasCssChange = false;
      });
    },
  };
}
```

#### `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`
Import `stripJsonCommentsAndTrailingCommas` from `../../core/get-abs-path-with-ext.js`, accept `cssRefreshRef` in `getConfigEsbuild`, pass `{ outdir, hmrEngine, changedIds, cssRefreshRef }` to `cssProcessorPlugin`, and parse `tsconfig.json` via `stripJsonCommentsAndTrailingCommas(raw)`:

```diff
 import { copyStaticDirectoriesToOutdir } from "../../core/copy-static-dirs.js";
+import { stripJsonCommentsAndTrailingCommas } from "../../core/get-abs-path-with-ext.js";
 import fs from "node:fs";
 import path from "node:path";
 
 export default function getConfigEsbuild({
   entryPoints,
   outdir = ".dinou/public",
   manifest = {},
   changedIds,
   hmrEngine,
+  cssRefreshRef,
   serverFiles,
   onManifestUpdated,
   onBuildStart,
   onBuildEnd,
   hmrPort,
 }) {
...
     skipMissingEntryPointsPlugin(),
-    cssProcessorPlugin({ outdir, hmrEngine }),
+    cssProcessorPlugin({ outdir, hmrEngine, changedIds, cssRefreshRef }),
     serverFunctionsPlugin({ serverFiles }),
...
   let userTsconfig = {};
   if (fs.existsSync("tsconfig.json")) {
     try {
       const raw = fs.readFileSync("tsconfig.json", "utf8");
-      const clean = raw
-        .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")
-        .replace(/,\s*([\]}])/g, "$1");
+      const clean = stripJsonCommentsAndTrailingCommas(raw);
       userTsconfig = JSON.parse(clean);
     } catch (e) {}
   }
```

#### `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`
Parse `tsconfig.json` / `jsconfig.json` with `stripJsonCommentsAndTrailingCommas` and pass `parsedTsconfig` to both `TsconfigPathsPlugin({ tsconfig: parsedTsconfig })` and esbuild `tsconfigRaw`:

```diff
 import { esbuildContextualDinouPlugin } from "../../core/resolve-contextual-dinou.js";
 import { copyStaticDirectoriesToOutdir } from "../../core/copy-static-dirs.js";
-import { existsSync } from "node:fs";
+import { stripJsonCommentsAndTrailingCommas } from "../../core/get-abs-path-with-ext.js";
+import { existsSync, readFileSync } from "node:fs";
+
+function loadParsedTsconfig() {
+  const candidates = ["tsconfig.json", "jsconfig.json"];
+  for (const filename of candidates) {
+    if (!existsSync(filename)) continue;
+    try {
+      const raw = readFileSync(filename, "utf8");
+      const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(raw));
+      const compilerOptions = parsed?.compilerOptions || {};
+      return {
+        ...parsed,
+        compilerOptions: {
+          ...compilerOptions,
+          baseUrl: compilerOptions.baseUrl || ".",
+        },
+      };
+    } catch (e) {}
+  }
+  return { compilerOptions: { baseUrl: "." } };
+}
 
 export default function getConfigEsbuildProd({
   entryPoints,
   outdir = ".dinou/dist3",
   manifest = {},
   serverFiles,
   reactCompiler = true,
 }) {
   const manifestData = {};
+  const parsedTsconfig = loadParsedTsconfig();
   let plugins = [
     esbuildContextualDinouPlugin({ projectRoot: process.cwd() }),
-    TsconfigPathsPlugin({}),
+    TsconfigPathsPlugin({ tsconfig: parsedTsconfig }),
     cssProcessorPlugin({ outdir }),
...
     chunkNames: "[name]-[hash]",
     entryNames: "[name]-[hash]",
+    tsconfigRaw: parsedTsconfig,
     jsx: "automatic",
```

#### `dinou/esbuild/helpers-esbuild/get-esbuild-entries.js`
Replace the entire file with the updated entry scanner (using `resolveStyleImportFromCode`, `error.*` & `not_found.*` in `isPageOrLayout`, checking `.css`/asset/`.json` extensions before `readFileSync`, deduplicating entries with `clientEntryMap` / `cssEntryMap` / `assetEntryMap` fixing `Set.prototype.add(...arr)`, and removing blind `glob(["**/*.css"])`):

```js
import { readFileSync } from "fs";
import path from "node:path";
import glob from "fast-glob";
import { pathToFileURL } from "node:url";
import parser from "#babel/parser";
import traverse from "#babel/traverse";
import crypto from "node:crypto";
import {
  regex as assetRegex,
  globPattern as assetGlobPattern,
} from "../../core/asset-extensions.js";
import {
  getAbsPathWithExt,
  resolveStyleImportFromCode,
} from "../../core/get-abs-path-with-ext.js";
import normalizePath from "./normalize-path.js";
import { useClientRegex, useServerRegex } from "../../constants.js";
import { hasServerFunctions } from "../../core/transform-server-functions.js";
import { updateManifestForModule } from "./update-manifest-for-module.js";

function hashFilePath(absPath) {
  return crypto.createHash("sha1").update(normalizePath(absPath)).digest("hex").slice(0, 8);
}

export default async function getEsbuildEntries({
  srcDir = path.resolve("src"),
  assetInclude = assetRegex,
  manifest = {},
} = {}) {
  const clientEntryMap = new Map();
  const cssEntryMap = new Map();
  const assetEntryMap = new Map();
  const serverModules = new Set();
  const serverFunctions = new Set();

  async function getImportsAndAssetsAndCsss(
    code,
    baseFilePath,
    visited = new Set(),
    isTopLevelClientComponent = false,
  ) {
    if (visited.has(baseFilePath)) {
      return { imports: [], assets: [], csss: [] };
    }
    visited.add(baseFilePath);

    const ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
    const imports = new Set();
    const assets = new Set();
    const csss = new Set();

    const importNodes = [];
    const traverseFn = typeof traverse === "function" ? traverse : (traverse.default || traverse);
    traverseFn(ast, {
      ImportDeclaration(nodePath) {
        importNodes.push(nodePath);
      },
    });

    for (const nodePath of importNodes) {
      const source = nodePath.node.source.value;

      const absImportPathWithExt =
        getAbsPathWithExt(source, {
          parentURL: pathToFileURL(baseFilePath).href,
        }) || resolveStyleImportFromCode(source, baseFilePath);

      if (!absImportPathWithExt) {
        continue;
      }

      if (
        absImportPathWithExt.endsWith(".css") ||
        absImportPathWithExt.endsWith(".scss") ||
        absImportPathWithExt.endsWith(".less")
      ) {
        csss.add(absImportPathWithExt);
        continue;
      }

      if (assetInclude.test(absImportPathWithExt)) {
        assets.add(absImportPathWithExt);
        continue;
      }

      if (absImportPathWithExt.endsWith(".json")) {
        imports.add(absImportPathWithExt);
        continue;
      }

      let importedCode;
      try {
        importedCode = readFileSync(absImportPathWithExt, "utf8");
      } catch (err) {
        console.warn(
          `[get-esbuild-entries] Could not read import: ${absImportPathWithExt}`,
          err.message,
        );
        continue;
      }

      if (!isTopLevelClientComponent) {
        const isImportedFileClient = useClientRegex.test(importedCode.trim());
        if (isImportedFileClient) {
          continue;
        }

        const isImportedFileServer = useServerRegex.test(importedCode.trim());
        if (isImportedFileServer) {
          serverFunctions.add(normalizePath(absImportPathWithExt));
          continue;
        } else if (hasServerFunctions(importedCode)) {
          serverFunctions.add(normalizePath(absImportPathWithExt));
        }
      } else {
        const isImportedFileServer = useServerRegex.test(importedCode.trim());
        if (isImportedFileServer) {
          serverFunctions.add(normalizePath(absImportPathWithExt));
          continue;
        } else if (hasServerFunctions(importedCode)) {
          serverFunctions.add(normalizePath(absImportPathWithExt));
        }
      }

      imports.add(absImportPathWithExt);

      try {
        const nested = await getImportsAndAssetsAndCsss(
          importedCode,
          absImportPathWithExt,
          visited,
          isTopLevelClientComponent,
        );
        nested.imports.forEach((p) => imports.add(p));
        nested.assets.forEach((p) => assets.add(p));
        nested.csss.forEach((p) => csss.add(p));
      } catch (err) {
        console.warn(
          `[get-esbuild-entries] Could not process imports of: ${absImportPathWithExt}`,
          err.message,
        );
      }
    }

    return {
      imports: Array.from(imports),
      assets: Array.from(assets),
      csss: Array.from(csss),
    };
  }

  function isPageOrLayout(absPath) {
    const fileName = path.basename(absPath);
    return (
      fileName.startsWith("page.") ||
      fileName.startsWith("layout.") ||
      fileName.startsWith("error.") ||
      fileName.startsWith("not_found.") ||
      fileName.startsWith("page_functions.") ||
      fileName.startsWith("layout_functions.")
    );
  }

  const files = await glob(["**/*.{js,jsx,ts,tsx}"], {
    cwd: srcDir,
    absolute: true,
    ignore: ["_*/**", "**/_*/**"],
  });

  let fileScanCount = 0;
  for (const absPath of files) {
    if (++fileScanCount % 5 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const code = readFileSync(absPath, "utf8");
    const isClientModule = useClientRegex.test(code.trim());
    const normalizedPath = normalizePath(absPath);

    if (isClientModule) {
      const name = path.basename(absPath, path.extname(absPath));
      updateManifestForModule(absPath, code, true, manifest);
      clientEntryMap.set(normalizedPath.toLowerCase(), {
        absPath: normalizedPath,
        name,
      });
      try {
        await getImportsAndAssetsAndCsss(code, absPath, new Set(), true);
      } catch (err) {}
    } else if (isPageOrLayout(absPath)) {
      serverModules.add(normalizedPath);
      if (hasServerFunctions(code)) {
        serverFunctions.add(normalizedPath);
      }
      try {
        const { imports, assets, csss } = await getImportsAndAssetsAndCsss(
          code,
          absPath,
        );

        for (const cssPath of csss) {
          const normCss = normalizePath(cssPath);
          cssEntryMap.set(normCss.toLowerCase(), {
            absPath: normCss,
            name: path.basename(cssPath, path.extname(cssPath)),
          });
        }

        assets.forEach((assetPath) => {
          const normAsset = normalizePath(assetPath);
          assetEntryMap.set(normAsset.toLowerCase(), {
            absPath: normAsset,
            name: path.basename(assetPath, path.extname(assetPath)),
          });
        });

        const serverComponentRegex = /\.(js|jsx|ts|tsx)$/i;
        imports.forEach((imp) => {
          if (serverComponentRegex.test(imp) && !imp.includes("node_modules")) {
            serverModules.add(normalizePath(imp));
          }
        });
      } catch (err) {}
    }
  }

  const assets = await glob([assetGlobPattern], {
    cwd: srcDir,
    absolute: true,
    ignore: ["_*/**", "**/_*/**"],
  });

  for (const absPath of assets) {
    const normAsset = normalizePath(absPath);
    assetEntryMap.set(normAsset.toLowerCase(), {
      absPath: normAsset,
      name: path.basename(absPath, path.extname(absPath)),
    });
  }

  const detectedClientEntries = new Set(clientEntryMap.values());
  const detectedCSSEntries = new Set(cssEntryMap.values());
  const detectedAssetEntries = new Set(assetEntryMap.values());

  for (const dCE of detectedClientEntries) {
    const hash = hashFilePath(dCE.absPath);
    const outfileName = `${dCE.name}-${hash}`;
    dCE.outfile = `${outfileName}.js`;
    dCE.outfileName = outfileName;
    if (manifest) {
      const fileUrl = pathToFileURL(dCE.absPath).href;
      const lowerFileUrl = fileUrl.toLowerCase();
      for (const key in manifest) {
        const kBase = key.split("#")[0].toLowerCase();
        if (kBase === lowerFileUrl) {
          manifest[key].id = "/" + dCE.outfile;
        }
      }
    }
  }

  for (const dCSSE of detectedCSSEntries) {
    const hash = hashFilePath(dCSSE.absPath);
    const outfileName = `${dCSSE.name}-${hash}`;
    dCSSE.outfile = `${outfileName}.js`;
    dCSSE.outfileName = outfileName;
  }

  for (const dAE of detectedAssetEntries) {
    const hash = hashFilePath(dAE.absPath);
    const outfileName = `${dAE.name}-${hash}`;
    dAE.outfile = `${outfileName}.js`;
    dAE.outfileName = outfileName;
  }

  return [
    detectedClientEntries,
    detectedCSSEntries,
    detectedAssetEntries,
    Array.from(serverFunctions),
  ];
}
```

#### `dinou/esbuild/dev.js` & `dinou/esbuild/react-refresh/esm-hmr/client.js`
In `dinou/esbuild/dev.js`, create `const cssRefreshRef = { refresh: null };`, pass `cssRefreshRef` to `getConfigEsbuild(...)`, and expose `refreshStyles` on the returned dev handle:

```diff
   const changedIds = new Set();
   const hmrEngine = { value: null };
+  const cssRefreshRef = { refresh: null };
...
       const config = getConfigEsbuild({
         entryPoints,
         outdir,
         manifest,
         changedIds,
         hmrEngine,
+        cssRefreshRef,
         hmrPort: options.hmrPort,
...
       return Promise.resolve();
     },
+    refreshStyles: async () => {
+      if (typeof cssRefreshRef.refresh === "function") {
+        try {
+          return await cssRefreshRef.refresh();
+        } catch (err) {
+          console.error("❌ [Esbuild Dev] CSS refresh error:", err);
+        }
+      }
+      return false;
+    },
     restart: async () => {
```

In `dinou/esbuild/react-refresh/esm-hmr/client.js`, refresh layout RSC cache as well when `data.layout` is true or `data.path` targets `layout.*` or `*.module.css`:

```diff
   if (data.type === "rsc-update") {
     if (typeof window !== "undefined" && typeof window.__DINOU_ROUTER_REFRESH__ === "function") {
-      window.__DINOU_ROUTER_REFRESH__();
+      const refreshLayout = Boolean(
+        data.layout ||
+          (data.path &&
+            (/(?:^|[\\/])layout\.[jt]sx?$/i.test(data.path) ||
+              /\.module\.css$/i.test(data.path)))
+      );
+      window.__DINOU_ROUTER_REFRESH__({ layout: refreshLayout });
       return;
     }
     reload();
     return;
   }
```

---

### 3.7. [MODIFIED] Rollup CSS & HMR Pipeline

#### `dinou/rollup/postcss.config.js`
Replace with:
```js
import { createBasePostCssPlugins } from "../core/postcss-pipeline.js";

export default {
  plugins: createBasePostCssPlugins(),
};
```

#### `dinou/rollup/rollup.config.js`
Import `esbuild`, `createBasePostCssPlugins`, and `getRegisteredCssUrlAssets`, update `resolve(...)` extensions/conditions, configure `postcss(...)` with `createBasePostCssPlugins()` + `config: false`, and add `dinou-rollup-css-assets-and-minify` immediately after `postcss(...)`:

```diff
 import { fileURLToPath } from "node:url";
+import esbuild from "esbuild";
 import postcss from "#rollup-plugin-postcss";
-import tailwindcss from "#tailwindcss/postcss";
-import autoprefixer from "#autoprefixer";
-import postcssImport from "#postcss-import";
-import { getAbsPathWithExt } from "../core/get-abs-path-with-ext.js";
+import {
+  createBasePostCssPlugins,
+  getRegisteredCssUrlAssets,
+} from "../core/postcss-pipeline.js";
...
       resolve({
-        extensions: [".js", ".jsx", ".ts", ".tsx"],
+        extensions: [".mjs", ".js", ".jsx", ".ts", ".tsx", ".json", ".css"],
+        exportConditions: ["style"],
         browser: true,
         preferBuiltins: false,
       }),
...
       postcss({
         modules: {
           generateScopedName: (name, filename) =>
             createScopedName(name, filename),
         },
         extract: "styles.css",
         minimize: !isDevelopment,
-        plugins: [
-          postcssImport({
-            resolve: (id, basedir) => {
-              const resolved = getAbsPathWithExt(id, {
-                parentURL: new URL(`file://${basedir}/`).href,
-              });
-              return resolved || id;
-            },
-          }),
-          tailwindcss(),
-          autoprefixer(),
-        ],
+        plugins: createBasePostCssPlugins(),
+        config: false,
       }),
+      {
+        name: "dinou-rollup-css-assets-and-minify",
+        buildStart() {
+          getRegisteredCssUrlAssets().clear();
+        },
+        generateBundle(_options, bundle) {
+          for (const [assetFileName, absAssetPath] of getRegisteredCssUrlAssets().entries()) {
+            if (!bundle[assetFileName] && fs.existsSync(absAssetPath)) {
+              try {
+                this.emitFile({
+                  type: "asset",
+                  fileName: assetFileName,
+                  source: fs.readFileSync(absAssetPath),
+                });
+              } catch (e) {}
+            }
+          }
+          if (!isDevelopment && bundle["styles.css"]?.type === "asset") {
+            try {
+              const rawCss = Buffer.isBuffer(bundle["styles.css"].source)
+                ? bundle["styles.css"].source.toString("utf8")
+                : String(bundle["styles.css"].source || "");
+              if (rawCss) {
+                bundle["styles.css"].source = esbuild.transformSync(rawCss, {
+                  loader: "css",
+                  minify: true,
+                }).code;
+              }
+            } catch (e) {}
+          }
+        },
+      },
```

#### `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js`
1. Import `resolveStyleImportFromCode` from `../../core/get-abs-path-with-ext.js` and `isTailwindStylesheetSource` from `../../core/postcss-pipeline.js`.
2. In `getImportsAndAssetsAndCsss`, resolve `getAbsPathWithExt(...) || resolveStyleImportFromCode(source, baseFilePath)` and check `.css`/`.scss`/`.less`, `assetInclude`, and `.json` before calling `readFileSync`.
3. Add `error.` and `not_found.` to `isPageOrLayout`.
4. Always re-emit `knownCssChunks` on `!isInitial` incremental builds, track `hasPendingSourceChange` in `watchChange`, and implement `shouldTransformCachedModule({ id, code })` to invalidate Tailwind CSS modules when JS/TSX source files change:

```diff
       if (!isInitial) {
         for (const entry of knownClientChunks.values()) {
           this.emitFile({
             type: "chunk",
             id: entry.id,
             name: entry.name,
           });
         }
-        if (hasPendingCssChange) {
-          for (const entry of knownCssChunks.values()) {
-            this.emitFile({
-              type: "chunk",
-              id: entry.id,
-              name: entry.name,
-            });
-          }
-          hasPendingCssChange = false;
+        for (const entry of knownCssChunks.values()) {
+          this.emitFile({
+            type: "chunk",
+            id: entry.id,
+            name: entry.name,
+          });
         }
+        hasPendingCssChange = false;
```

```js
    watchChange(id) {
      const cleanId = id.split("?")[0];
      if (/\.(?:css|scss|sass|less)$/i.test(cleanId)) {
        hasPendingCssChange = true;
      } else if (/\.(?:[jt]sx?|mdx|html)$/i.test(cleanId)) {
        hasPendingSourceChange = true;
      }
    },
    shouldTransformCachedModule({ id, code }) {
      const cleanId = id ? id.split("?")[0] : "";
      if (hasPendingSourceChange && cleanId.endsWith(".css")) {
        if (isTailwindStylesheetSource(code)) {
          return true;
        }
        try {
          const diskCss = readFileSync(cleanId, "utf8");
          if (isTailwindStylesheetSource(diskCss)) {
            return true;
          }
        } catch (e) {}
      }
      return false;
    },
    buildEnd() {
      hasPendingSourceChange = false;
    },
```

#### `dinou/rollup/react-refresh/rollup-plugin-esm-hmr.js` & `dinou/rollup/react-refresh/esm-hmr/client.js`
In `rollup-plugin-esm-hmr.js`, track `let lastStylesCssContent = null;` and `let hasPendingCssUpdate = false;` so any change to `bundle["styles.css"]` (including new Tailwind utilities from `.tsx` edits) broadcasts `{ type: "style-update", url: "/styles.css" }`:

```js
      const stylesAsset = bundle["styles.css"];
      if (stylesAsset && stylesAsset.type === "asset") {
        const nextCss = Buffer.isBuffer(stylesAsset.source)
          ? stylesAsset.source.toString("utf8")
          : String(stylesAsset.source || "");
        if (lastStylesCssContent !== null && nextCss !== lastStylesCssContent) {
          hasPendingCssUpdate = true;
        }
        lastStylesCssContent = nextCss;
      }
```

In `dinou/rollup/react-refresh/esm-hmr/client.js`, update the `rsc-update` handler identically to `dinou/esbuild/react-refresh/esm-hmr/client.js` so layout & `.module.css` updates refresh the layout RSC cache.

---

### 3.8. [MODIFIED] Webpack CSS, Asset & Dev HMR Pipeline

#### `dinou/webpack/postcss.config.js`
Replace with:
```js
import { createBasePostCssPlugins } from "../core/postcss-pipeline.js";

export default {
  plugins: createBasePostCssPlugins(),
};
```

#### `dinou/webpack/webpack.config.js`
1. Import `esbuild` and `{ createBasePostCssPlugins, getRegisteredCssUrlAssets }` from `../core/postcss-pipeline.js`.
2. Update both `.module.css` and `.css` module rules so **both** run `postcss-loader` (`createBasePostCssPlugins()`) and configure `css-loader` with `url: { filter: (url) => !url.startsWith("/") }, import: false`:

```js
        {
          test: /\.module\.css$/,
          use: [
            {
              loader: MiniCssExtractPlugin.loader,
              options: {
                defaultExport: true,
              },
            },
            {
              loader: "css-loader",
              options: {
                url: {
                  filter: (url) => !url.startsWith("/"),
                },
                import: false,
                modules: {
                  getLocalIdent: (context, localIdentName, localName) => {
                    return createScopedName(localName, context.resourcePath);
                  },
                },
                importLoaders: 1,
              },
            },
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  config: false,
                  plugins: createBasePostCssPlugins(),
                },
              },
            },
          ],
        },
        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            {
              loader: "css-loader",
              options: {
                url: {
                  filter: (url) => !url.startsWith("/"),
                },
                import: false,
                importLoaders: 1,
              },
            },
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  config: false,
                  plugins: createBasePostCssPlugins(),
                },
              },
            },
          ],
        },
```

3. Add `DefinePlugin` in dev mode (`process.env.DINOU_HMR_PORT`), `DinouCssAssetsAndMinifyPlugin` (emitting CSS `url(...)` assets and minifying `styles.css` in production), and `.css` / `"style"` support in `resolve`:

```js
      isDevelopment &&
        new webpack.DefinePlugin({
          "process.env.DINOU_HMR_PORT": JSON.stringify(
            String(process.env.DINOU_HMR_PORT || "3001")
          ),
        }),
      {
        apply(compiler) {
          const pluginName = "DinouCssAssetsAndMinifyPlugin";
          const clearRegistry = () => {
            getRegisteredCssUrlAssets().clear();
          };
          compiler.hooks.beforeRun.tap(pluginName, clearRegistry);
          compiler.hooks.watchRun.tap(pluginName, clearRegistry);

          compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
            compilation.hooks.processAssets.tap(
              {
                name: pluginName,
                stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
              },
              () => {
                for (const [
                  assetFileName,
                  absAssetPath,
                ] of getRegisteredCssUrlAssets().entries()) {
                  if (
                    !compilation.getAsset(assetFileName) &&
                    !compilation.getAsset("/" + assetFileName) &&
                    fs.existsSync(absAssetPath)
                  ) {
                    try {
                      const buf = fs.readFileSync(absAssetPath);
                      compilation.emitAsset(
                        assetFileName,
                        new webpack.sources.RawSource(buf)
                      );
                    } catch (e) {}
                  }
                }
              }
            );

            if (!isDevelopment) {
              compilation.hooks.processAssets.tap(
                {
                  name: `${pluginName}:minify`,
                  stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
                },
                () => {
                  const cssAsset = compilation.getAsset("styles.css");
                  if (!cssAsset) return;
                  try {
                    const raw = cssAsset.source.source();
                    const rawCss = Buffer.isBuffer(raw)
                      ? raw.toString("utf8")
                      : String(raw || "");
                    if (rawCss) {
                      const minified = esbuild.transformSync(rawCss, {
                        loader: "css",
                        minify: true,
                      }).code;
                      compilation.updateAsset(
                        "styles.css",
                        new webpack.sources.RawSource(minified)
                      );
                    }
                  } catch (e) {}
                }
              );
            }
          });
        },
      },
```

```diff
     resolve: {
+      conditionNames: ["style", "import", "module", "browser", "default"],
-      extensions: [".js", ".jsx", ".ts", ".tsx"],
+      extensions: [".js", ".jsx", ".ts", ".tsx", ".css"],
...
         ? [
           new TsconfigPathsPlugin({
             configFile,
-            extensions: [".js", ".jsx", ".ts", ".tsx"],
+            extensions: [".js", ".jsx", ".ts", ".tsx", ".css"],
           }),
         ]
```

#### `dinou/webpack/helpers/get-webpack-entries.js`
Mirror the exact `get-esbuild-entries.js` fixes (`resolveStyleImportFromCode`, `.css`/asset/`.json` extension checks before `readFileSync`, `error.*` & `not_found.*` in `isPageOrLayout`, and `Map` deduplication replacing `detectedCSSEntries.add(...csss.map(...))`).

#### `dinou/core/client-webpack.jsx`
Append the dev WebSocket HMR listener after hydration:

```js
if (
  process.env.NODE_ENV !== "production" &&
  typeof window !== "undefined" &&
  typeof WebSocket !== "undefined"
) {
  try {
    const hmrPort = process.env.DINOU_HMR_PORT || "3001";
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.hostname}:${hmrPort}/ws`;
    const ws = new WebSocket(wsUrl);

    const applyStyleUpdate = (targetUrl) => {
      const cleanTarget = targetUrl ? targetUrl.split("?")[0] : "";
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      for (const link of links) {
        const rawHref = link.getAttribute("href");
        if (!rawHref) continue;
        const cleanHref = rawHref.split("?")[0];
        if (
          !cleanTarget ||
          cleanHref.endsWith(cleanTarget) ||
          cleanTarget.endsWith(cleanHref) ||
          cleanHref.includes("styles.css")
        ) {
          const nextUrl = new URL(link.href, window.location.origin);
          nextUrl.searchParams.set("t", String(Date.now()));
          link.href = nextUrl.href;
        }
      }
    };

    ws.addEventListener("message", (event) => {
      if (!event?.data || typeof event.data !== "string") return;
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "static-changed") {
          window.location.reload();
          return;
        }
        if (parsed.type === "dinou-hmr" && parsed.data) {
          const msg = parsed.data;
          if (msg.type === "reload") {
            window.location.reload();
            return;
          }
          if (msg.type === "style-update") {
            applyStyleUpdate(msg.url || "/styles.css");
            return;
          }
          if (msg.type === "rsc-update") {
            if (typeof window.__DINOU_ROUTER_REFRESH__ === "function") {
              const refreshLayout = Boolean(
                msg.layout ||
                  (msg.path &&
                    (/(?:^|[\\/])layout\.[jt]sx?$/i.test(msg.path) ||
                      /\.module\.css$/i.test(msg.path)))
              );
              window.__DINOU_ROUTER_REFRESH__({ layout: refreshLayout });
            } else {
              window.location.reload();
            }
          }
        }
      } catch (e) {}
    });
  } catch (e) {}
}
```

---

### 3.9. [MODIFIED] Dual-Bundle Server Compilers & Dev Orchestrator (`node`, `cloudflare`, `bun`, `deno`)

1. **`dinou/node/dev.js`**:
   - Import `{ createServerCssModulesPlugin, didCssModuleExportsChange }` from `../core/server-css-modules-plugin.js`.
   - Instantiate `const serverCssModulesPlugin = createServerCssModulesPlugin({ projectRoot });` and include it in `plugins` + add `"style"` to `conditions` in both `ctxA` (RSC) and `ctxB` (SSR).
   - Set `process.env.DINOU_HMR_PORT = String(HMR_PORT)` before launching Webpack dev.
   - In `broadcastToClients(msg)`: when running Webpack dev (`!clientBundlerHandle?.broadcast`), broadcast `{ type: "dinou-hmr", data: msg }` over `wssClients` instead of collapsing all updates into `{ type: "static-changed" }`.
   - In the `src/` file watcher:
     - When `normLower.endsWith(".module.css")`, compute `const cssModuleClassesChanged = await didCssModuleExportsChange(absFilePath)`: if `false`, skip `ctxA`/`ctxB` rebuild (client bundler emits `style-update` in-place); if `true`, mark `hasServerChanges = true` so `ctxA`/`ctxB` rebuild and `rsc-update` refreshes scoped class attributes.
     - When `isJsTsSource && isPageRoute`, call `clientBundlerHandle.refreshStyles()` (or `notifyFileChanged(absFilePath)`) so new Tailwind utility classes in Server Component `page.tsx`/`layout.tsx` files are compiled into `/styles.css` immediately.
     - In Webpack dev, if `hasCssChanges && !hasServerChanges && !hasClientChanges`, broadcast `{ type: "style-update", url: "/styles.css" }`.

2. **`dinou/node/bundle-dual-engine.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`, `dinou/deno/build.js`**:
   - Import `{ createServerCssModulesPlugin }` from `../core/server-css-modules-plugin.js`.
   - Add `createServerCssModulesPlugin({ projectRoot })` to `plugins` and `"style"` to `conditions` in **both** Pass A (RSC Engine) and Pass B (SSR Engine).
   - In `cloudflare/build.js`, `bun/build.js`, and `deno/build.js`, add font loaders (`".woff": "dataurl"`, `".woff2": "dataurl"`, `".ttf": "dataurl"`, `".otf": "dataurl"`, `".eot": "dataurl"`) alongside existing asset `dataurl` loaders in Pass A and Pass B.

---

## 4. `CHANGELOG.md` Entry (`9.4.0`)

```markdown
### Added
- **Universal CSS Modules in Server Components & SSR**: Added `dinou/core/server-css-modules-plugin.js`, enabling `import styles from "./card.module.css"` natively across React Server Components (RSC) and Client Component SSR in `dinou dev`, `dinou build` (`Node.js`, `Bun`, `Deno`, `Cloudflare Workers`), and `dinou export-static` with zero hydration mismatches.
- **Unified PostCSS & CSS `url(...)` Asset Pipeline**: Added `dinou/core/postcss-pipeline.js` (`createBasePostCssPlugins`, `createPostCssUrlAssetsPlugin`) across Esbuild, Rollup, and Webpack—automatically resolving relative, `node_modules`, and `tsconfig.json` aliased `url(...)` assets to `/assets/<hash><ext>` while preserving root-relative `public/` URLs (`url("/hero.svg")`), `data:`, external URLs, and SVG `#fragment` identifiers.
- **Font Asset Support**: Added `.woff`, `.woff2`, `.ttf`, `.otf`, and `.eot` extensions to `dinou/core/asset-extensions.js`, `dinou/assets.d.ts` (`dinou/env`), and Edge/Bun/Deno server loaders.
- **Zero-Reload CSS & RSC HMR in Webpack Dev Mode**: Added WebSocket `dinou-hmr` handling (`style-update` and `rsc-update`) to `dinou/core/client-webpack.jsx`.

### Changed
- **Production CSS Minification Parity**: Standardized production `/styles.css` minification across Esbuild, Rollup, and Webpack via `esbuild.transformSync(..., { loader: "css", minify: true })`.

### Fixed
- **Windows Drive-Letter Case Determinism in `createScopedName`**: Normalized `src` context and file paths in `dinou/core/createScopedName.js` so CSS Module class hashes match 100% regardless of Windows uppercase/lowercase drive letters (`C:\` vs `c:\`) or path separators.
- **Incremental Dev CSS Preservation & Tailwind v4 `.tsx` Refresh**: Fixed Esbuild's `postcss-extract-plugin.js` and Rollup's `rollup-plugin-react-client-manifest.js` wiping unchanged global stylesheets on incremental rebuilds, and added automatic Tailwind v4 stylesheet re-evaluation when `.tsx`/`.jsx` files add new utility classes.
- **JSONC `tsconfig.json` Comments, Trailing Commas & Webpack CSS `@import` Aliases**: Fixed `tsconfig.json` parsing with comments and trailing commas in `get-abs-path-with-ext.js` and `get-config-esbuild-prod.js`, and wired `postcss-import` alias resolution into both `.css` and `.module.css` rules in Webpack.
- **Server Component Stylesheet Discovery**: Fixed `Set.prototype.add(...arr)` dropping multiple CSS imports in a single Server Component, added `error.tsx` and `not_found.tsx` CSS discovery, supported bare `node_modules` stylesheet imports (e.g. `import "katex/dist/katex.min.css"` and `"style"` export conditions) in Server Components, and removed blind compilation of unimported `.css` files in Esbuild.
```

---

## 5. Complete Automated Test Suites

### 5.1. Unit & Multi-Bundler / Multi-Runtime Integration Suite (`tests/unit/styles-css.test.mjs`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const reqFromRepo = createRequire(path.join(repoRoot, "package.json"));
const esbuild = reqFromRepo("esbuild");

const dinouRoot = fs.existsSync(path.join(repoRoot, "dinou", "cli.js"))
  ? path.join(repoRoot, "dinou")
  : fs.existsSync(path.join(repoRoot, "cli.js"))
    ? repoRoot
    : path.join(repoRoot, "node_modules", "dinou", "dinou");

const importDinou = (relPath) =>
  import(pathToFileURL(path.join(dinouRoot, relPath)).href);

test("1. createScopedName produces identical hashes across Windows drive-letter casing and path separators", async () => {
  const { default: createScopedName } = await importDinou("core/createScopedName.js");
  const sampleRel = path.join("src", "components", "card.module.css");
  const absNative = path.resolve(repoRoot, sampleRel);
  const absPosix = absNative.replace(/\\/g, "/");

  const hashNative = createScopedName("card", absNative);
  const hashPosix = createScopedName("card", absPosix);
  assert.equal(hashNative, hashPosix);

  if (process.platform === "win32" && /^[a-zA-Z]:/.test(absNative)) {
    const upperDrive = absNative[0].toUpperCase() + absNative.slice(1);
    const lowerDrive = absNative[0].toLowerCase() + absNative.slice(1);
    assert.equal(
      createScopedName("card", upperDrive),
      createScopedName("card", lowerDrive)
    );
  }
});

test("2. JSONC tsconfig alias parser & CSS import resolvers support comments, trailing commas, aliases, and node_modules stylesheets", async () => {
  const {
    stripJsonCommentsAndTrailingCommas,
    getAbsPathWithExt,
    resolveCssImportSpecifier,
    resolveStyleImportFromCode,
  } = await importDinou("core/get-abs-path-with-ext.js");

  const rawJsonc = `{
    // Single-line comment before compilerOptions
    "compilerOptions": {
      "baseUrl": ".",
      /* Multi-line block comment with @/* wildcard mention */
      "paths": {
        "@/*": ["./src/*"],
        "~styles/*": ["./src/styles/*"],
      },
    },
  }`;
  const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(rawJsonc));
  assert.deepEqual(parsed.compilerOptions.paths["@/*"], ["./src/*"]);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-css-resolve-"));
  const prevCwd = process.cwd();
  try {
    fs.mkdirSync(path.join(tmpDir, "src", "styles"), { recursive: true });
    fs.mkdirSync(
      path.join(tmpDir, "node_modules", "mock-katex", "dist"),
      { recursive: true }
    );
    fs.mkdirSync(
      path.join(tmpDir, "node_modules", "mock-ui", "dist"),
      { recursive: true }
    );

    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), rawJsonc, "utf8");
    const tokensFile = path.join(tmpDir, "src", "styles", "tokens.css");
    fs.writeFileSync(tokensFile, ":root { --accent: #7c3aed; }\n", "utf8");

    const katexCss = path.join(
      tmpDir,
      "node_modules",
      "mock-katex",
      "dist",
      "katex.min.css"
    );
    fs.writeFileSync(katexCss, ".katex { font-size: 1.1em; }\n", "utf8");
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "mock-katex", "package.json"),
      JSON.stringify({ name: "mock-katex", version: "1.0.0" }),
      "utf8"
    );

    const mockUiCss = path.join(
      tmpDir,
      "node_modules",
      "mock-ui",
      "dist",
      "theme.css"
    );
    fs.writeFileSync(mockUiCss, ".mock-ui-btn { display: inline-flex; }\n", "utf8");
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "mock-ui", "package.json"),
      JSON.stringify({
        name: "mock-ui",
        version: "1.0.0",
        exports: {
          "./styles": {
            style: "./dist/theme.css",
          },
        },
      }),
      "utf8"
    );

    const pageFile = path.join(tmpDir, "src", "page.tsx");
    fs.writeFileSync(pageFile, "export default function Page() { return null; }\n", "utf8");

    process.chdir(tmpDir);

    assert.equal(
      path.resolve(getAbsPathWithExt("@/styles/tokens.css")),
      path.resolve(tokensFile)
    );
    assert.equal(
      path.resolve(resolveCssImportSpecifier("~styles/tokens.css", path.join(tmpDir, "src"))),
      path.resolve(tokensFile)
    );
    assert.equal(
      path.resolve(resolveStyleImportFromCode("mock-katex/dist/katex.min.css", pageFile)),
      path.resolve(katexCss)
    );
    assert.equal(
      path.resolve(resolveStyleImportFromCode("mock-ui/styles", pageFile)),
      path.resolve(mockUiCss)
    );
    assert.equal(resolveStyleImportFromCode("react", pageFile), null);
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("3. Server CSS Modules plugin matches createScopedName and tracks exported class-map changes accurately", async () => {
  const { default: createScopedName } = await importDinou("core/createScopedName.js");
  const {
    compileCssModuleMap,
    didCssModuleExportsChange,
  } = await importDinou("core/server-css-modules-plugin.js");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-server-cssmod-"));
  const prevCwd = process.cwd();
  try {
    fs.mkdirSync(path.join(tmpDir, "src", "styles"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpDir, "src", "styles", "tokens.css"),
      ":root { --gap: 8px; }\n",
      "utf8"
    );

    const modFile = path.join(tmpDir, "src", "widget.module.css");
    fs.writeFileSync(
      modFile,
      `@reference "tailwindcss";\n@import "@/styles/tokens.css";\n.card { @apply p-4; gap: var(--gap); }\n`,
      "utf8"
    );

    process.chdir(tmpDir);

    const first = await compileCssModuleMap(modFile);
    assert.equal(first.map.card, createScopedName("card", modFile));

    await new Promise((r) => setTimeout(r, 25));
    fs.writeFileSync(
      modFile,
      `@reference "tailwindcss";\n@import "@/styles/tokens.css";\n.card { @apply p-6; color: red; }\n`,
      "utf8"
    );
    assert.equal(await didCssModuleExportsChange(modFile), false);

    await new Promise((r) => setTimeout(r, 25));
    fs.writeFileSync(
      modFile,
      `@reference "tailwindcss";\n@import "@/styles/tokens.css";\n.card { color: red; }\n.badge { font-weight: 700; }\n`,
      "utf8"
    );
    assert.equal(await didCssModuleExportsChange(modFile), true);
    const updated = await compileCssModuleMap(modFile);
    assert.equal(updated.map.badge, createScopedName("badge", modFile));
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("4. createPostCSSExtractPlugin preserves unchanged stylesheets across incremental rebuilds", async () => {
  const { createPostCSSExtractPlugin } = await importDinou(
    "esbuild/plugins-postcss/postcss-extract-plugin.js"
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-extract-inc-"));
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const globalsPath = path.join(tmpDir, "globals.css");
    const modulePath = path.join(tmpDir, "card.module.css");
    fs.writeFileSync(globalsPath, ".global-reset { margin: 0; }\n", "utf8");
    fs.writeFileSync(modulePath, ".card_hash { color: red; }\n", "utf8");

    const outCss = path.join(tmpDir, "styles.css");
    const extractor = createPostCSSExtractPlugin({ outputFile: outCss });

    extractor.setExtractedCss(globalsPath, ".global-reset { margin: 0; }");
    extractor.setExtractedCss(modulePath, ".card_hash { color: red; }");
    assert.equal(extractor.finalize(), false);

    const initialMem = globalThis.__DINOU_MEM_FILES__.get("/styles.css").toString("utf8");
    assert.match(initialMem, /\.global-reset/);
    assert.match(initialMem, /color: red/);

    extractor.setExtractedCss(modulePath, ".card_hash { color: blue; }");
    assert.equal(extractor.finalize(), true);

    const afterIncMem = globalThis.__DINOU_MEM_FILES__.get("/styles.css").toString("utf8");
    assert.match(afterIncMem, /\.global-reset/, "globals.css must NOT be wiped on incremental HMR");
    assert.match(afterIncMem, /color: blue/);
    assert.doesNotMatch(afterIncMem, /color: red/);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("5. Incremental Esbuild dev CSS HMR refreshes Tailwind utilities on TSX edits and preserves globals.css on CSS Module edits", async () => {
  const { default: cssProcessorPlugin } = await importDinou(
    "esbuild/plugins-esbuild/css-processor-plugin.js"
  );
  const fixturesBase = path.join(repoRoot, ".dinou", "tmp-fixtures");
  fs.mkdirSync(fixturesBase, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(fixturesBase, "dinou-dev-hmr-"));
  const prevCwd = process.cwd();
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  let ctx = null;
  try {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    const globalsCss = path.join(tmpDir, "src", "globals.css");
    const cardModuleCss = path.join(tmpDir, "src", "card.module.css");
    const pageTsx = path.join(tmpDir, "src", "page.tsx");

    fs.writeFileSync(
      globalsCss,
      `@import "tailwindcss";\n.base-marker { display: grid; }\n`,
      "utf8"
    );
    fs.writeFileSync(cardModuleCss, `.box { color: crimson; }\n`, "utf8");
    fs.writeFileSync(
      pageTsx,
      `import "./globals.css";\nimport styles from "./card.module.css";\nexport default function Page() { return <div className={"bg-amber-600 " + styles.box}>Hi</div>; }\n`,
      "utf8"
    );

    process.chdir(tmpDir);

    const changedIds = new Set();
    const cssRefreshRef = { refresh: null };
    const broadcasts = [];
    const hmrEngine = {
      value: {
        broadcastMessage(msg) {
          broadcasts.push(msg);
        },
      },
    };

    ctx = await esbuild.context({
      entryPoints: [pageTsx],
      outdir: path.join(tmpDir, ".dinou", "public"),
      bundle: true,
      format: "esm",
      jsx: "automatic",
      write: false,
      plugins: [
        cssProcessorPlugin({
          outdir: path.join(tmpDir, ".dinou", "public"),
          hmrEngine,
          changedIds,
          cssRefreshRef,
        }),
      ],
    });

    await ctx.rebuild();
    let cssText = globalThis.__DINOU_MEM_FILES__.get("/styles.css").toString("utf8");
    assert.match(cssText, /\.bg-amber-600\b/);
    assert.match(cssText, /\.base-marker\b/);
    assert.match(cssText, /color:\s*crimson/);
    assert.doesNotMatch(cssText, /\.text-fuchsia-500\b/);

    broadcasts.length = 0;
    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(
      pageTsx,
      `import "./globals.css";\nimport styles from "./card.module.css";\nexport default function Page() { return <div className={"bg-amber-600 text-fuchsia-500 " + styles.box}>Hi</div>; }\n`,
      "utf8"
    );
    changedIds.clear();
    changedIds.add(pageTsx);
    assert.equal(typeof cssRefreshRef.refresh, "function");
    await cssRefreshRef.refresh();

    cssText = globalThis.__DINOU_MEM_FILES__.get("/styles.css").toString("utf8");
    assert.match(cssText, /\.text-fuchsia-500\b/);
    assert.match(cssText, /color:\s*crimson/);
    assert.ok(
      broadcasts.some((m) => m.type === "style-update" && m.url === "/styles.css")
    );

    broadcasts.length = 0;
    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(cardModuleCss, `.box { color: seagreen; }\n`, "utf8");
    changedIds.clear();
    changedIds.add(cardModuleCss);
    await ctx.rebuild();

    cssText = globalThis.__DINOU_MEM_FILES__.get("/styles.css").toString("utf8");
    assert.match(cssText, /\.base-marker\b/);
    assert.match(cssText, /\.text-fuchsia-500\b/);
    assert.match(cssText, /color:\s*seagreen/);
    assert.doesNotMatch(cssText, /color:\s*crimson/);
    assert.ok(
      broadcasts.some((m) => m.type === "style-update" && m.url === "/styles.css")
    );
  } finally {
    if (ctx) await ctx.dispose();
    process.chdir(prevCwd);
    process.env.NODE_ENV = prevNodeEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
        fs.rmdirSync(fixturesBase);
      }
    } catch (e) {}
  }
});

test("6. Full 3-bundler (Esbuild, Rollup, Webpack) + 4-runtime + export-static CSS & CSS Modules parity", async () => {
  const { default: createScopedName } = await importDinou("core/createScopedName.js");
  const fixturesBase = path.join(repoRoot, ".dinou", "tmp-fixtures");
  fs.mkdirSync(fixturesBase, { recursive: true });
  const tmpApp = fs.mkdtempSync(path.join(fixturesBase, "dinou-styles-"));
  const prevCwd = process.cwd();

  try {
    const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
    fs.mkdirSync(dinouShimDir, { recursive: true });
    const dinouRootUrl = pathToFileURL(dinouRoot).href;
    fs.writeFileSync(
      path.join(dinouShimDir, "package.json"),
      JSON.stringify(
        {
          name: "dinou",
          version: "9.4.0",
          type: "module",
          main: "./index.js",
          exports: {
            ".": "./index.js",
            "./server": "./server.js",
            "./config": "./config.js",
          },
        },
        null,
        2
      ),
      "utf8"
    );
    fs.writeFileSync(
      path.join(dinouShimDir, "index.js"),
      `export * from ${JSON.stringify(`${dinouRootUrl}/index.js`)};\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(dinouShimDir, "server.js"),
      `export * from ${JSON.stringify(`${dinouRootUrl}/server.js`)};\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(dinouShimDir, "config.js"),
      `export * from ${JSON.stringify(`${dinouRootUrl}/core/config.js`)};\nexport { default } from ${JSON.stringify(`${dinouRootUrl}/core/config.js`)};\n`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "dinou-styles-fixture", version: "1.0.0", type: "module" }, null, 2),
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      `{
        // JSONC comment in tsconfig
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["./src/*"],
          },
        },
      }`,
      "utf8"
    );

    fs.mkdirSync(path.join(tmpApp, "public"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "public", "hero-public.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
      "utf8"
    );

    fs.mkdirSync(path.join(tmpApp, "src", "assets"), { recursive: true });
    const patternSvgPath = path.join(tmpApp, "src", "assets", "pattern.svg");
    const fontWoff2Path = path.join(tmpApp, "src", "assets", "local-font.woff2");
    fs.writeFileSync(
      patternSvgPath,
      '<svg xmlns="http://www.w3.org/2000/svg"><g id="grid"/></svg>',
      "utf8"
    );
    fs.writeFileSync(fontWoff2Path, Buffer.from("wOF2mockfontbytes"));

    const nestedVendorDir = path.join(
      tmpApp,
      "src",
      "node_modules",
      "mock-third-party-css",
      "dist"
    );
    fs.mkdirSync(path.join(nestedVendorDir, "fonts"), { recursive: true });
    const thirdPartyFontPath = path.join(nestedVendorDir, "fonts", "third-party.woff2");
    fs.writeFileSync(thirdPartyFontPath, Buffer.from("wOF2thirdparty"));
    fs.writeFileSync(
      path.join(tmpApp, "src", "node_modules", "mock-third-party-css", "package.json"),
      JSON.stringify({
        name: "mock-third-party-css",
        version: "1.0.0",
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(nestedVendorDir, "styles.min.css"),
      `@font-face { font-family: "MockMath"; src: url(fonts/third-party.woff2) format("woff2"); }\n.mock-third-party-widget { letter-spacing: 0.05em; }\n`,
      "utf8"
    );

    fs.mkdirSync(path.join(tmpApp, "src", "styles"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "src", "styles", "tokens.css"),
      `:root { --brand-token: #7c3aed; }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "styles", "unimported.css"),
      `.should-never-be-bundled { color: hotpink; }\n`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "globals.css"),
      `@import "tailwindcss";\n@import "@/styles/tokens.css";\n.hero-banner { background-image: url("/hero-public.svg"), url("@/assets/pattern.svg#grid"); }\n@font-face { font-family: "LocalFont"; src: url("./assets/local-font.woff2") format("woff2"); }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "second-global.css"),
      `.second-global-marker { border-color: var(--brand-token); }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "error-only.css"),
      `.error-only-marker { outline: 2px solid crimson; }\n`,
      "utf8"
    );

    const cardModulePath = path.join(tmpApp, "src", "card.module.css");
    fs.writeFileSync(
      cardModulePath,
      `@reference "tailwindcss";\n@import "@/styles/tokens.css";\n.serverCard { @apply rounded-xl; color: var(--brand-token); }\n.clientBadge { font-weight: 600; }\n`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import "./globals.css";
import "./second-global.css";

export default function Layout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <title>Styles Parity</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body className="bg-emerald-700">{children}</body>
    </html>
  );
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "error.tsx"),
      `import "./error-only.css";
export default function ErrorPage() {
  return <div className="error-only-marker">Error</div>;
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "ClientBadge.tsx"),
      `"use client";
import styles from "./card.module.css";

export function ClientBadge() {
  return <span data-testid="client-badge" className={styles.clientBadge}>Client Badge</span>;
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import "mock-third-party-css/dist/styles.min.css";
import styles from "./card.module.css";
import { ClientBadge } from "./ClientBadge";

export default function Page() {
  return (
    <main data-testid="server-card" className={styles.serverCard}>
      <h1>Server Styled Card</h1>
      <ClientBadge />
    </main>
  );
}
`,
      "utf8"
    );

    process.chdir(tmpApp);
    const expectedServerHash = createScopedName("serverCard", cardModulePath);
    const expectedClientHash = createScopedName("clientBadge", cardModulePath);
    const expectedPatternAsset = `assets/${createScopedName("pattern", patternSvgPath)}.svg`;
    const expectedLocalFontAsset = `assets/${createScopedName("local-font", fontWoff2Path)}.woff2`;
    const expectedThirdPartyFontAsset = `assets/${createScopedName("third-party", thirdPartyFontPath)}.woff2`;

    const cliPath = path.join(dinouRoot, "cli.js");

    for (const buildCmd of ["build:node:esbuild", "build:node:rollup", "build:node:webpack"]) {
      execFileSync(process.execPath, [cliPath, buildCmd], {
        cwd: tmpApp,
        stdio: "pipe",
        env: { ...process.env, NODE_ENV: "production" },
      });

      const stylesPath = path.join(tmpApp, ".dinou", "dist3", "styles.css");
      assert.ok(fs.existsSync(stylesPath), `[${buildCmd}] .dinou/dist3/styles.css must exist`);
      const css = fs.readFileSync(stylesPath, "utf8");

      assert.match(css, /--brand-token:\s*#7c3aed/i);
      assert.match(css, /\.bg-emerald-700\b/);
      assert.match(css, /\.second-global-marker\b/);
      assert.match(css, /\.error-only-marker\b/);
      assert.match(css, /\.mock-third-party-widget\b/);
      assert.ok(css.includes(`.${expectedServerHash}`));
      assert.ok(css.includes(`.${expectedClientHash}`));
      assert.ok(css.includes("/hero-public.svg"));
      assert.ok(css.includes(`/${expectedPatternAsset}#grid`));
      assert.ok(css.includes(`/${expectedLocalFontAsset}`));
      assert.ok(css.includes(`/${expectedThirdPartyFontAsset}`));
      assert.ok(!css.includes("should-never-be-bundled"));

      for (const relAsset of [
        expectedPatternAsset,
        expectedLocalFontAsset,
        expectedThirdPartyFontAsset,
      ]) {
        assert.ok(fs.existsSync(path.join(tmpApp, ".dinou", "dist3", relAsset)));
      }

      const ssgHtml = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist2", "index.html"),
        "utf8"
      );
      assert.ok(ssgHtml.includes(`class="${expectedServerHash}"`));
      assert.ok(ssgHtml.includes(`class="${expectedClientHash}"`));
    }

    for (const [runtimeScript, extraEnv] of [
      ["cloudflare/build.js", { DINOU_BUILD_TOOL: "webpack" }],
      ["bun/build.js", { DINOU_BUILD_TOOL: "webpack" }],
      ["deno/build.js", { DINOU_BUILD_TOOL: "webpack" }],
    ]) {
      execFileSync(process.execPath, [path.join(dinouRoot, runtimeScript)], {
        cwd: tmpApp,
        stdio: "pipe",
        env: { ...process.env, NODE_ENV: "production", ...extraEnv },
      });
    }

    const cfWorkerCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "cloudflare", "worker.js"),
      "utf8"
    );
    const bunServerCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "bun", "server.js"),
      "utf8"
    );
    const denoMainCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "deno", "main.js"),
      "utf8"
    );
    for (const [, bundleCode] of [
      ["cloudflare", cfWorkerCode],
      ["bun", bunServerCode],
      ["deno", denoMainCode],
    ]) {
      assert.ok(
        bundleCode.includes(expectedServerHash) && bundleCode.includes(expectedClientHash)
      );
    }

    execFileSync(process.execPath, [cliPath, "export-static"], {
      cwd: tmpApp,
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production" },
    });
    assert.ok(fs.existsSync(path.join(tmpApp, "out", "styles.css")));
    assert.ok(fs.existsSync(path.join(tmpApp, "out", expectedPatternAsset)));
    const exportedHtml = fs.readFileSync(path.join(tmpApp, "out", "index.html"), "utf8");
    assert.ok(exportedHtml.includes(`class="${expectedServerHash}"`));
    assert.ok(exportedHtml.includes(`class="${expectedClientHash}"`));
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmpApp, { recursive: true, force: true });
    try {
      if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
        fs.rmdirSync(fixturesBase);
      }
    } catch (e) {}
  }
});
```

---

### 5.2. Playwright End-to-End Test Suite (`tests/e2e/styles-css.spec.ts`)

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const dinouRoot = fs.existsSync(path.join(repoRoot, "dinou", "cli.js"))
  ? path.join(repoRoot, "dinou")
  : fs.existsSync(path.join(repoRoot, "cli.js"))
    ? repoRoot
    : path.join(repoRoot, "node_modules", "dinou", "dinou");

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not allocate port")));
      }
    });
    srv.on("error", reject);
  });
}

async function waitForHttpReady(url: string, timeoutMs = 45000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopChildProcess(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.killed) return;
  proc.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      resolve();
    }, 4000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

test.describe("Dinou Styles, CSS Modules (RSC + SSR + Client) & Live CSS HMR", () => {
  test.setTimeout(120000);

  let tmpApp = "";
  let devProc: ChildProcess | null = null;
  let port = 0;

  test.beforeAll(async () => {
    const fixturesBase = path.join(repoRoot, ".dinou", "tmp-e2e-fixtures");
    fs.mkdirSync(fixturesBase, { recursive: true });
    tmpApp = fs.mkdtempSync(path.join(fixturesBase, "styles-e2e-"));

    const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
    fs.mkdirSync(dinouShimDir, { recursive: true });
    const dinouRootUrl = pathToFileURL(dinouRoot).href;
    fs.writeFileSync(
      path.join(dinouShimDir, "package.json"),
      JSON.stringify(
        {
          name: "dinou",
          version: "9.4.0",
          type: "module",
          main: "./index.js",
          exports: {
            ".": "./index.js",
            "./server": "./server.js",
            "./config": "./config.js",
          },
        },
        null,
        2
      ),
      "utf8"
    );
    fs.writeFileSync(
      path.join(dinouShimDir, "index.js"),
      `export * from ${JSON.stringify(`${dinouRootUrl}/index.js`)};\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(dinouShimDir, "server.js"),
      `export * from ${JSON.stringify(`${dinouRootUrl}/server.js`)};\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(dinouShimDir, "config.js"),
      `export * from ${JSON.stringify(`${dinouRootUrl}/core/config.js`)};\nexport { default } from ${JSON.stringify(`${dinouRootUrl}/core/config.js`)};\n`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "dinou-styles-e2e", version: "1.0.0", type: "module" }, null, 2),
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      `{
        // JSONC tsconfig with comment & trailing comma
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["./src/*"],
          },
        },
      }`,
      "utf8"
    );

    fs.mkdirSync(path.join(tmpApp, "public"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "public", "public-dot.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="4" fill="#10b981"/></svg>',
      "utf8"
    );

    fs.mkdirSync(path.join(tmpApp, "src", "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "src", "assets", "tile.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#6366f1"/></svg>',
      "utf8"
    );

    fs.mkdirSync(path.join(tmpApp, "src", "styles"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "src", "styles", "tokens.css"),
      `:root { --server-card-color: rgb(124, 58, 237); }\n`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "globals.css"),
      `@import "tailwindcss";
@import "@/styles/tokens.css";

@theme {
  --color-e2e-brand: rgb(16, 185, 129);
}

.asset-bg {
  background-image: url("/public-dot.svg"), url("@/assets/tile.svg");
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "card.module.css"),
      `.serverBox {
  color: var(--server-card-color);
  padding: 16px;
}

.clientCounter {
  background-color: rgb(220, 38, 38);
  color: rgb(255, 255, 255);
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import "./globals.css";

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <title>Dinou Styles E2E</title>
        <link href="/styles.css" rel="stylesheet" precedence="default" />
      </head>
      <body className="bg-e2e-brand">{children}</body>
    </html>
  );
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "CounterWidget.tsx"),
      `"use client";
import { useState } from "react";
import styles from "./card.module.css";

export function CounterWidget() {
  const [count, setCount] = useState(0);
  return (
    <button
      type="button"
      data-testid="client-counter"
      className={styles.clientCounter}
      onClick={() => setCount((c) => c + 1)}
    >
      Count: {count}
    </button>
  );
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import styles from "./card.module.css";
import { CounterWidget } from "./CounterWidget";

export default function Page() {
  return (
    <main data-testid="server-box" className={styles.serverBox}>
      <div data-testid="asset-banner" className="asset-bg">Assets</div>
      <CounterWidget />
    </main>
  );
}
`,
      "utf8"
    );

    port = await getFreePort();
    const hmrPort = await getFreePort();
    devProc = spawn(
      process.execPath,
      [path.join(dinouRoot, "cli.js"), "dev:esbuild"],
      {
        cwd: tmpApp,
        env: {
          ...process.env,
          PORT: String(port),
          HMR_PORT: String(hmrPort),
          NODE_ENV: "development",
        },
        stdio: "pipe",
      }
    );

    await waitForHttpReady(`http://127.0.0.1:${port}/`);
  });

  test.afterAll(async () => {
    await stopChildProcess(devProc);
    if (tmpApp) {
      fs.rmSync(tmpApp, { recursive: true, force: true });
    }
  });

  test("renders Tailwind v4, CSS Modules in Server & Client Components without hydration mismatch, CSS url(...) assets, and live HMR without losing React state", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await expect(page.locator("body")).toHaveAttribute("data-hydrated", "true");

    // 1. Tailwind v4 custom @theme utility applied on <body>
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(16, 185, 129)");

    // 2. Server Component CSS Module + @import "@/styles/tokens.css" custom property applied
    const serverBox = page.getByTestId("server-box");
    await expect(serverBox).toHaveCSS("color", "rgb(124, 58, 237)");
    await expect(serverBox).toHaveCSS("padding", "16px");

    // 3. Client Component CSS Module applied with zero React hydration mismatch errors
    const counterBtn = page.getByTestId("client-counter");
    await expect(counterBtn).toHaveCSS("background-color", "rgb(220, 38, 38)");
    expect(
      consoleErrors.filter((e) => /hydrat/i.test(e)),
      "Must hydrate Server & Client CSS Modules with zero hydration errors"
    ).toEqual([]);

    // 4. Verify CSS url("/public-dot.svg") and url("@/assets/tile.svg") resolve 200 OK
    const bgImage = await page
      .getByTestId("asset-banner")
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bgImage).toContain("/public-dot.svg");
    expect(bgImage).toContain("/assets/");

    const assetMatch = bgImage.match(/\/assets\/[^")]+/);
    expect(assetMatch).not.toBeNull();
    const assetRes = await page.request.get(`http://127.0.0.1:${port}${assetMatch![0]}`);
    expect(assetRes.status()).toBe(200);

    // 5. Increment client React state, edit card.module.css, and verify zero-reload CSS HMR!
    await counterBtn.click();
    await counterBtn.click();
    await expect(counterBtn).toHaveText("Count: 2");

    fs.writeFileSync(
      path.join(tmpApp, "src", "card.module.css"),
      `.serverBox {
  color: var(--server-card-color);
  padding: 24px;
}

.clientCounter {
  background-color: rgb(37, 99, 235);
  color: rgb(255, 255, 255);
}
`,
      "utf8"
    );

    await expect(counterBtn).toHaveCSS("background-color", "rgb(37, 99, 235)", {
      timeout: 15000,
    });
    await expect(serverBox).toHaveCSS("padding", "24px");
    // Client state MUST still be "Count: 2" (zero full-page reload)
    await expect(counterBtn).toHaveText("Count: 2");
  });
});
```


---

## 6. Addendum (Part II — Delta Patch): `public/styles.css` Coexistence & Collision Precedence

*(Note: Apply ONLY the 6 file changes and unit test below on top of Part I above.)*

### 6.1. Root-Cause Analysis & Design (Option A)

Because `/styles.css` is Dinou's single fixed-name public client stylesheet URL:
1. **Dev-vs-Prod Inversion & Bundler Divergence When Both `src/` CSS and `public/styles.css` Existed**:
   - In `dinou dev` (`esbuild` / `rollup`), `globalThis.__DINOU_MEM_FILES__` took priority over `public/`, serving compiled `src/` CSS.
   - In `dinou build` (`esbuild` / `rollup`), `copyStaticDirectoriesToOutdir` ran *after* `styles.css` emission with `fs.cpSync(..., { force: true })`, silently overwriting compiled Tailwind/CSS-Modules `.dinou/dist3/styles.css` with raw `public/styles.css`.
   - In `webpack`, case-variant `public/Styles.css` or `DinouCssAssetsAndMinifyPlugin` did not distinguish copied `public/styles.css` (`asset.info.copied === true`) from compiled `MiniCssExtractPlugin` output, and `WebpackMemoryPlugin` froze copied `public/*` assets in memory in dev mode.
2. **Empty 0-Byte Buffer Shadowing `public/styles.css` in `dinou dev:esbuild` When Zero CSS Was Imported in `src/`**:
   - `postcss-extract-plugin.js` previously stored `Buffer.from("", "utf8")` in `globalThis.__DINOU_MEM_FILES__.set("styles.css", ...)` even when `extractedByFile.size === 0`, causing `dinou/node/dev.js` (`if (memBuf)`) to serve 0 bytes instead of falling through to `public/styles.css`.

**Fix (Option A — Smart Coexistence + Explicit Collision Warning)**:
- **Zero CSS imported in `src/`**: `public/styles.css` works seamlessly and unminified across `dinou dev` and `dinou build` in all 3 bundlers (`esbuild`, `rollup`, `webpack`) with zero warnings.
- **CSS imported in `src/` + `public/styles.css` present**: Dinou's compiled `styles.css` wins deterministically across `dinou dev` and `dinou build` in all 3 bundlers (preserving nested `public/<subdir>/styles.css` untouched), emitting a clear, deduplicated `⚠️ [Dinou] Detected "public/styles.css" alongside CSS imported in "src/"...` warning.

---

### 6.2. Delta File Manifest (6 Modified Files in `dinou/`)

1. `dinou/core/copy-static-dirs.js`
2. `dinou/esbuild/plugins-postcss/postcss-extract-plugin.js`
3. `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`
4. `dinou/rollup/rollup.config.js`
5. `dinou/webpack/webpack.config.js`
6. `dinou/webpack/plugins/webpack-memory-plugin.js`

---

### 6.3. Exact Code Modifications for Part II

#### 1. `dinou/core/copy-static-dirs.js` (Full Replacement)

```js
import fs from "node:fs";
import path from "node:path";

const IGNORED_OS_BASENAMES = new Set([".ds_store", "thumbs.db"]);
const warnedCollisionRoots = new Set();

function shouldCopyStaticEntry(srcPath) {
  const baseLower = path.basename(srcPath).toLowerCase();
  return !IGNORED_OS_BASENAMES.has(baseLower);
}

export function hasPublicStylesCss(projectRoot = process.cwd()) {
  const publicDir = path.resolve(projectRoot || process.cwd(), "public");
  if (!fs.existsSync(publicDir)) return false;
  try {
    const entries = fs.readdirSync(publicDir, { withFileTypes: true });
    return entries.some(
      (entry) =>
        (entry.isFile() || entry.isSymbolicLink()) &&
        entry.name.toLowerCase() === "styles.css"
    );
  } catch (e) {
    return false;
  }
}

export function warnPublicStylesCssCollision(projectRoot = process.cwd()) {
  const rootDir = path.resolve(projectRoot || process.cwd());
  const rootKey = rootDir.toLowerCase();
  if (warnedCollisionRoots.has(rootKey)) return;
  if (!hasPublicStylesCss(rootDir)) return;
  warnedCollisionRoots.add(rootKey);
  console.warn(
    '⚠️ [Dinou] Detected "public/styles.css" alongside CSS imported in "src/". ' +
      '"/styles.css" is used by Dinou\'s compiled stylesheet bundle, so "public/styles.css" was ignored. ' +
      'Rename the file in "public/" (e.g. "public/custom.css") or import it from "src/".'
  );
}

/**
 * Recursively copies the project's `public/` directory into `outdir`, preserving
 * nested subdirectories and dotfiles (such as `public/.well-known/*` or `public/.nojekyll`).
 * If Dinou already emitted a compiled `styles.css` from `src/`, root `public/styles.css`
 * is skipped with a warning so compiled styles are never overwritten.
 */
export function copyStaticDirectoriesToOutdir(projectRoot, outdir, options = {}) {
  const rootDir = path.resolve(projectRoot || process.cwd());
  const srcDir = path.resolve(rootDir, "public");
  if (!fs.existsSync(srcDir)) return false;

  try {
    if (!fs.statSync(srcDir).isDirectory()) return false;
    const destDir = path.resolve(rootDir, outdir);
    fs.mkdirSync(destDir, { recursive: true });

    const compiledStylesExists =
      Boolean(options.hasCompiledStyles) ||
      Boolean(
        typeof globalThis !== "undefined" && globalThis.__DINOU_HAS_COMPILED_STYLES__
      ) ||
      fs.existsSync(path.join(destDir, "styles.css"));

    if (compiledStylesExists && hasPublicStylesCss(rootDir)) {
      warnPublicStylesCssCollision(rootDir);
    }

    fs.cpSync(srcDir, destDir, {
      recursive: true,
      force: true,
      dereference: true,
      preserveTimestamps: true,
      filter: (srcPath) => {
        if (!shouldCopyStaticEntry(srcPath)) return false;
        if (compiledStylesExists) {
          const rel = path.relative(srcDir, srcPath);
          if (
            rel &&
            !rel.includes(path.sep) &&
            !rel.includes("/") &&
            rel.toLowerCase() === "styles.css"
          ) {
            return false;
          }
        }
        return true;
      },
    });
    return true;
  } catch (e) {
    return false;
  }
}

export default copyStaticDirectoriesToOutdir;
```

#### 2. `dinou/esbuild/plugins-postcss/postcss-extract-plugin.js`

```diff
 import fs from "node:fs";
 import path from "node:path";
 import esbuild from "esbuild";
 import { normalizePathCase } from "../../core/path-utils.js";
+import {
+  hasPublicStylesCss,
+  warnPublicStylesCssCollision,
+} from "../../core/copy-static-dirs.js";
...
-    let combinedCSS = parts.length > 0 ? parts.join("\n") + "\n" : "";
+    const hasCompiledStyles = extractedByFile.size > 0;
+    let combinedCSS = parts.length > 0 ? parts.join("\n") + "\n" : "";
 
     if (isProduction && combinedCSS) {
       try {
         combinedCSS = esbuild.transformSync(combinedCSS, {
           loader: "css",
           minify: true,
         }).code;
       } catch (e) {}
     }
 
-    const changed = lastFinalizedCSS !== null && combinedCSS !== lastFinalizedCSS;
-    lastFinalizedCSS = combinedCSS;
-    cachedCSSBuffer = Buffer.from(combinedCSS, "utf8");
-
-    if (typeof globalThis !== "undefined") {
-      if (!globalThis.__DINOU_MEM_FILES__) {
-        globalThis.__DINOU_MEM_FILES__ = new Map();
-      }
-      globalThis.__DINOU_MEM_FILES__.set("styles.css", cachedCSSBuffer);
-      globalThis.__DINOU_MEM_FILES__.set("/styles.css", cachedCSSBuffer);
-    }
+    const nextState = hasCompiledStyles ? combinedCSS : null;
+    const changed = lastFinalizedCSS !== null && nextState !== lastFinalizedCSS;
+    lastFinalizedCSS = nextState;
+
+    if (typeof globalThis !== "undefined") {
+      globalThis.__DINOU_HAS_COMPILED_STYLES__ = hasCompiledStyles;
+      if (!globalThis.__DINOU_MEM_FILES__) {
+        globalThis.__DINOU_MEM_FILES__ = new Map();
+      }
+      if (hasCompiledStyles) {
+        cachedCSSBuffer = Buffer.from(combinedCSS, "utf8");
+        globalThis.__DINOU_MEM_FILES__.set("styles.css", cachedCSSBuffer);
+        globalThis.__DINOU_MEM_FILES__.set("/styles.css", cachedCSSBuffer);
+      } else {
+        cachedCSSBuffer = null;
+        globalThis.__DINOU_MEM_FILES__.delete("styles.css");
+        globalThis.__DINOU_MEM_FILES__.delete("/styles.css");
+      }
+    }
+
+    if (hasCompiledStyles && hasPublicStylesCss(process.cwd())) {
+      warnPublicStylesCssCollision(process.cwd());
+    }
 
     const shouldWriteToDisk =
       process.env.DINOU_WRITE_TO_DISK === "true" || isProduction;
-    if (shouldWriteToDisk && (combinedCSS || fs.existsSync(outputFile))) {
+    if (shouldWriteToDisk && hasCompiledStyles) {
       const outputDir = path.dirname(outputFile);
       if (!fs.existsSync(outputDir)) {
         fs.mkdirSync(outputDir, { recursive: true });
       }
       fs.writeFileSync(outputFile, combinedCSS, "utf8");
     }
```

#### 3. `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`
Append `copy-static-files-once` *after* `...plugins` (matching `get-config-esbuild-prod.js` so `cssProcessorPlugin` runs first):

```diff
   const shouldWriteToDisk = process.env.DINOU_WRITE_TO_DISK === "true";
   if (fs.existsSync("public") && shouldWriteToDisk) {
     let staticCopied = false;
     plugins = [
+      ...plugins,
       {
         name: "copy-static-files-once",
         setup(build) {
           build.onEnd(() => {
             if (staticCopied) return;
             staticCopied = true;
             copyStaticDirectoriesToOutdir(process.cwd(), outdir);
           });
         },
       },
-      ...plugins,
     ];
   }
```

#### 4. `dinou/rollup/rollup.config.js`

```diff
-import { copyStaticDirectoriesToOutdir } from "../core/copy-static-dirs.js";
+import {
+  copyStaticDirectoriesToOutdir,
+  hasPublicStylesCss,
+  warnPublicStylesCssCollision,
+} from "../core/copy-static-dirs.js";
...
       {
         name: "dinou-rollup-css-assets-and-minify",
         buildStart() {
           getRegisteredCssUrlAssets().clear();
+          if (typeof globalThis !== "undefined") {
+            globalThis.__DINOU_HAS_COMPILED_STYLES__ = false;
+          }
         },
         generateBundle(_options, bundle) {
+          const hasCompiledStyles = Boolean(bundle["styles.css"]);
+          if (typeof globalThis !== "undefined") {
+            globalThis.__DINOU_HAS_COMPILED_STYLES__ = hasCompiledStyles;
+            if (!hasCompiledStyles && globalThis.__DINOU_MEM_FILES__) {
+              globalThis.__DINOU_MEM_FILES__.delete("styles.css");
+              globalThis.__DINOU_MEM_FILES__.delete("/styles.css");
+            }
+          }
+          if (hasCompiledStyles && hasPublicStylesCss(process.cwd())) {
+            warnPublicStylesCssCollision(process.cwd());
+          }
           for (const [assetFileName, absAssetPath] of getRegisteredCssUrlAssets().entries()) {
```

#### 5. `dinou/webpack/webpack.config.js`

```diff
 import {
   createBasePostCssPlugins,
   getRegisteredCssUrlAssets,
 } from "../core/postcss-pipeline.js";
+import {
+  hasPublicStylesCss,
+  warnPublicStylesCssCollision,
+} from "../core/copy-static-dirs.js";
...
         apply(compiler) {
           const pluginName = "DinouCssAssetsAndMinifyPlugin";
           const clearRegistry = () => {
             getRegisteredCssUrlAssets().clear();
+            if (typeof globalThis !== "undefined") {
+              globalThis.__DINOU_HAS_COMPILED_STYLES__ = false;
+            }
           };
           compiler.hooks.run.tap(pluginName, clearRegistry);
           compiler.hooks.watchRun.tap(pluginName, clearRegistry);
 
           compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
             compilation.hooks.processAssets.tap(
               {
                 name: pluginName,
                 stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
               },
               () => {
+                const stylesAsset = compilation.getAsset("styles.css");
+                const hasCompiledStyles = Boolean(
+                  stylesAsset && !stylesAsset.info?.copied
+                );
+                if (typeof globalThis !== "undefined") {
+                  globalThis.__DINOU_HAS_COMPILED_STYLES__ = hasCompiledStyles;
+                }
+                if (hasCompiledStyles) {
+                  if (hasPublicStylesCss(process.cwd())) {
+                    warnPublicStylesCssCollision(process.cwd());
+                  }
+                  for (const assetObj of compilation.getAssets()) {
+                    if (
+                      assetObj.info?.copied &&
+                      assetObj.name.toLowerCase() === "styles.css"
+                    ) {
+                      compilation.deleteAsset(assetObj.name);
+                    }
+                  }
+                }
+
                 for (const [
...
             if (!isDevelopment) {
               compilation.hooks.processAssets.tap(
                 {
                   name: `${pluginName}:minify`,
                   stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
                 },
                 () => {
                   const cssAsset = compilation.getAsset("styles.css");
-                  if (!cssAsset) return;
+                  if (!cssAsset || cssAsset.info?.copied) return;
```

#### 6. `dinou/webpack/plugins/webpack-memory-plugin.js`

```diff
+        if (typeof globalThis !== "undefined" && globalThis.__DINOU_MEM_FILES__) {
+          const stylesInfo = compilation.getAsset("styles.css")?.info;
+          if (!assets["styles.css"] || stylesInfo?.copied) {
+            globalThis.__DINOU_MEM_FILES__.delete("styles.css");
+            globalThis.__DINOU_MEM_FILES__.delete("/styles.css");
+          }
+        }
+
         for (const [filename, asset] of Object.entries(assets)) {
           if (!asset) continue;
+          if (compilation.getAsset(filename)?.info?.copied) {
+            continue;
+          }
```

---

### 6.4. Additional `CHANGELOG.md` Bullet (`9.4.0` — under `### Fixed`)

```markdown
- **Deterministic `public/styles.css` Coexistence & Collision Protection**: Fixed `postcss-extract-plugin.js` shadowing static `public/styles.css` with an empty in-memory buffer when no CSS is imported in `src/`, and prevented `copyStaticDirectoriesToOutdir` / `CopyWebpackPlugin` from overwriting compiled `/styles.css` in production builds when both `public/styles.css` and `src/` CSS imports exist (emitting an explicit collision warning across Esbuild, Rollup, and Webpack while preserving nested `public/<dir>/styles.css` files).
```

---

### 6.5. Complete Automated Unit/Integration Test (`tests/unit/public-styles-css.test.mjs`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const dinouRoot = fs.existsSync(path.join(repoRoot, "dinou", "cli.js"))
  ? path.join(repoRoot, "dinou")
  : fs.existsSync(path.join(repoRoot, "cli.js"))
    ? repoRoot
    : path.join(repoRoot, "node_modules", "dinou", "dinou");
const cliPath = path.join(dinouRoot, "cli.js");
const importDinou = (relPath) =>
  import(pathToFileURL(path.join(dinouRoot, relPath)).href);

function createFixtureApp(prefix) {
  const fixturesBase = path.join(repoRoot, ".dinou", "tmp-fixtures");
  fs.mkdirSync(fixturesBase, { recursive: true });
  const tmpApp = fs.mkdtempSync(path.join(fixturesBase, prefix));

  const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouRootUrl = pathToFileURL(dinouRoot).href;
  fs.writeFileSync(
    path.join(dinouShimDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "9.4.0",
        type: "module",
        main: "./index.js",
        exports: {
          ".": "./index.js",
          "./server": "./server.js",
          "./config": "./config.js",
        },
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "index.js"),
    `export * from ${JSON.stringify(`${dinouRootUrl}/index.js`)};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(`${dinouRootUrl}/server.js`)};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(`${dinouRootUrl}/core/config.js`)};\nexport { default } from ${JSON.stringify(`${dinouRootUrl}/core/config.js`)};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(tmpApp, "package.json"),
    JSON.stringify({ name: "dinou-pub-styles", version: "1.0.0", type: "module" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(tmpApp, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } }),
    "utf8"
  );
  return { fixturesBase, tmpApp };
}

test("1. public/styles.css works cleanly in dev & all 3 bundlers when no CSS is imported in src/", async () => {
  const { createPostCSSExtractPlugin } = await importDinou(
    "esbuild/plugins-postcss/postcss-extract-plugin.js"
  );
  const { fixturesBase, tmpApp } = createFixtureApp("pub-styles-no-src-");
  const prevCwd = process.cwd();
  const prevNodeEnv = process.env.NODE_ENV;

  try {
    fs.mkdirSync(path.join(tmpApp, "public", "nested"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpApp, "public", "styles.css"),
      "/* raw public stylesheet */\nbody { background: papayawhip; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "public", "nested", "styles.css"),
      ".nested-public { color: rebeccapurple; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `export default function Layout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head><link rel="stylesheet" href="/styles.css" /></head>
      <body>{children}</body>
    </html>
  );
}
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `export default function Page() { return <main>Hello</main>; }\n`,
      "utf8"
    );

    process.chdir(tmpApp);
    process.env.NODE_ENV = "development";
    globalThis.__DINOU_MEM_FILES__ = new Map([["styles.css", Buffer.from("stale")]]);
    const extractor = createPostCSSExtractPlugin({
      outputFile: path.join(tmpApp, ".dinou", "public", "styles.css"),
    });
    extractor.finalize();
    assert.equal(globalThis.__DINOU_MEM_FILES__.has("styles.css"), false);
    assert.equal(globalThis.__DINOU_MEM_FILES__.has("/styles.css"), false);

    for (const buildCmd of ["build:node:esbuild", "build:node:rollup", "build:node:webpack"]) {
      const res = spawnSync(process.execPath, [cliPath, buildCmd], {
        cwd: tmpApp,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "production" },
      });
      assert.equal(res.status, 0, `[${buildCmd}] failed:\n${res.stderr}`);
      assert.doesNotMatch(
        `${res.stdout}\n${res.stderr}`,
        /Detected "public\/styles\.css"/
      );

      const distStyles = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist3", "styles.css"),
        "utf8"
      );
      assert.match(distStyles, /papayawhip/);
      assert.match(distStyles, /\/\* raw public stylesheet \*\//);
    }
  } finally {
    process.chdir(prevCwd);
    process.env.NODE_ENV = prevNodeEnv;
    fs.rmSync(tmpApp, { recursive: true, force: true });
    try {
      if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
        fs.rmdirSync(fixturesBase);
      }
    } catch (e) {}
  }
});

test("2. compiled src/ CSS wins over public/styles.css with an explicit warning across all 3 bundlers", async () => {
  const { fixturesBase, tmpApp } = createFixtureApp("pub-styles-collision-");

  try {
    fs.mkdirSync(path.join(tmpApp, "public", "nested"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpApp, "public", "styles.css"),
      ".from-public-should-be-ignored { color: orange; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "public", "nested", "styles.css"),
      ".nested-public-preserved { color: purple; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "globals.css"),
      ".compiled-from-src { color: teal; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import "./globals.css";
export default function Layout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head><link rel="stylesheet" href="/styles.css" /></head>
      <body>{children}</body>
    </html>
  );
}
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `export default function Page() { return <main className="compiled-from-src">Hi</main>; }\n`,
      "utf8"
    );

    for (const buildCmd of ["build:node:esbuild", "build:node:rollup", "build:node:webpack"]) {
      const res = spawnSync(process.execPath, [cliPath, buildCmd], {
        cwd: tmpApp,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "production" },
      });
      assert.equal(res.status, 0, `[${buildCmd}] failed:\n${res.stderr}`);

      const combinedLogs = `${res.stdout}\n${res.stderr}`;
      assert.match(
        combinedLogs,
        /Detected "public\/styles\.css" alongside CSS imported in "src\/"/
      );

      const distStyles = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist3", "styles.css"),
        "utf8"
      );
      assert.match(distStyles, /\.compiled-from-src\b/);
      assert.doesNotMatch(distStyles, /from-public-should-be-ignored/);

      const nestedStyles = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist3", "nested", "styles.css"),
        "utf8"
      );
      assert.match(nestedStyles, /\.nested-public-preserved\b/);
    }
  } finally {
    fs.rmSync(tmpApp, { recursive: true, force: true });
    try {
      if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
        fs.rmdirSync(fixturesBase);
      }
    } catch (e) {}
  }
});
```
