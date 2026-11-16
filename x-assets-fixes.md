# Dinou `v9.4.0` — Static Media, Fonts & Custom `assetExtensions` Pipeline Fixes (`x-assets-fixes.md`)

## 1. Executive Summary & Root-Cause Analysis

During the exhaustive pre-release audit of `/docs/assets` (`src/docs/assets/page.tsx`) against Dinou's media/font bundling and serving architecture across all **3 bundlers** (`esbuild`, `rollup`, `webpack`), all **4 production runtimes** (`Node.js`, `Bun`, `Deno`, `Cloudflare Workers`), `dinou dev`, `dinou build`, and `dinou export-static`, **8 critical bugs and parity gaps** were identified and resolved alongside first-class `dinou.config.*` `assetExtensions` support:

1. **Esbuild Dev Crash on Relative Asset Imports in `"use client"` Components (`swc-disk-cache.js`)**:
   - **Root Cause**: In `dinou dev:esbuild`, `"use client"` modules are pre-transformed by SWC into `.dinou/swc/src/...`. `swcRedirectPlugin` ran before `assetsPlugin` and returned `{ path: target }` (in Esbuild's default `"file"` namespace) for relative imports, short-circuiting Esbuild's `onResolve` chain so `assetsPlugin` never ran. Esbuild then crashed with `ERROR: No loader is configured for ".webp" files`.
   - **Fix**: Excluded asset specifiers (`activeAssetFilter.test(args.path)`) from `swcRedirectPlugin` and taught `resolveAssetImport` to map `.dinou/swc/...` importers back to their original `src/...` directory so `assetsPlugin` handles 100% of relative and aliased assets in the `dinou-asset` namespace.

2. **Server-Component-Only Asset `404`s in Webpack Prod & Rollup Incremental Watch (`get-webpack-entries.js`, `webpack.config.js`, `rollup-plugin-react-client-manifest.js`, `write.js`)**:
   - **Root Cause**:
     - `dinou/webpack/helpers/get-webpack-entries.js` computed `{ imports, assets, csss }` for Server Components (`page.tsx`, `layout.tsx`, etc.) but destructured only `{ csss }`, discarding `assets`. Any image/video/font imported solely in a Server Component was never emitted to `.dinou/dist3/assets/` in Webpack builds (`404` in production).
     - `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` cleared `__DINOU_EMITTED_ASSETS__` on incremental watch rebuilds (`!isInitial`) and re-emitted JS/CSS chunks without re-emitting Server Component assets.
     - `dinou/esbuild/helpers-esbuild/write.js` could write duplicate `outputFiles` concurrently on Windows when an asset entered via both `dinou-asset` and `dinou-asset-entry`, and `esbuild/build.js` could skip writing `.dinou/dist3` if `DINOU_DEV=true` leaked into the environment.
   - **Fix**: Collected and emitted `serverAssetEntries` in Webpack's `DinouCssAssetsAndMinifyPlugin`; tracked and re-emitted `knownServerAssets` across Rollup watch rebuilds; deduplicated `outputFiles`/`filesToWrite` in Esbuild and cleared `process.env.DINOU_DEV` at the start of `esbuild/build.js`.

3. **Hydration Mismatch, Base64 Worker Bloat, and Build Crashes in Cloudflare Workers, Bun & Deno (`cloudflare/build.js`, `bun/build.js`, `deno/build.js`)**:
   - **Root Cause**: None of `cloudflare/build.js`, `bun/build.js`, or `deno/build.js` wired a server asset plugin. Instead, they configured Esbuild's `"dataurl"` loader for only 11 extensions:
     - Importing `.avif`, `.gif`, `.mp4`, `.webm`, `.mp3`, `.wav`, etc. crashed `dinou build:cloudflare`, `dinou build:bun`, and `dinou build:deno` (`No loader is configured for ".mp4"`).
     - Importing `.png`, `.svg`, `.webp`, etc. in a Client Component rendered `src="data:image/png;base64,..."` during SSR (`ssr-engine.js`) while hydrating `src="/assets/..."` on the client, causing React 19 hydration mismatches and bloating `worker.js` with Base64 media.
   - **Fix**: Created `createServerAssetPlugin` in `dinou/core/asset-extensions.js` and wired it across Pass A (RSC), Pass B (SSR), and Pass C (Orchestrator) in `node/bundle-dual-engine.js`, `node/build.js`, `node/dev.js`, `cloudflare/build.js`, `bun/build.js`, `deno/build.js`, and `.dinou/dist1/server` builds, removing all `"dataurl"` asset loaders.

4. **Immutable Cache Poisoning Because Asset Hashes Ignored File Bytes (`asset-extensions.js`, `postcss-pipeline.js`)**:
   - **Root Cause**: `/assets/*` is served in production with `Cache-Control: public, max-age=31536000, immutable`, yet `createScopedName(base, filepath)` hashed **only the file path** (never the file's binary content) and omitted `[name]-`. Replacing `src/logo.png` with new image bytes at the same path kept the exact same URL, serving stale media for up to 1 year on returning browsers and CDNs.
   - **Fix**: Implemented `getAssetInfo` / `getAssetFileName` / `getAssetPublicUrl` in `dinou/core/asset-extensions.js`, generating `assets/<sanitized-name>-<8hex>.<ext>` where `<8hex>` is the SHA-256 digest of `relPosixPath + "\0" + fileBytes` (cached in memory by `mtimeMs + size`). Used uniformly across Esbuild, Rollup, Webpack, CSS `url(...)`, and all server/edge engines.

5. **Broken Custom `tsconfig.json` / `jsconfig.json` Path Aliases & Bare `node_modules` Asset Imports (`asset-extensions.js`, `dinou-asset-plugin.js`, `webpack.config.js`)**:
   - **Root Cause**: Previous server asset plugins hardcoded `args.path.startsWith("@/")` -> `src/`, failing on custom aliases (`@media/*`, `~/*`, `#assets/*`) and bare `node_modules` assets (e.g. `@fontsource/inter/files/inter.woff2`). Rollup's `dinouAssetPlugin` lacked `resolveId`, failing whenever `rollup-plugin-tsconfig-paths` skipped non-TS files or `jsconfig.json`.
   - **Fix**: Centralized resolution in `resolveAssetImport` (supporting `tsconfig.json`/`jsconfig.json` aliases, `.dinou/swc` mirror mapping, `@/` & `~/` fallbacks, relative paths, and `createRequire` `node_modules` resolution) and wired it into Esbuild, Rollup (`resolveId` before `tsconfigPaths()`), Webpack (`beforeResolve`), and all server plugins.

6. **Live Asset Edits Ignored in `dinou dev` (`node/dev.js`, `assets-plugin.js`, `dinou-asset-plugin.js`)**:
   - **Root Cause**: `doRebuildBatch` in `dinou/node/dev.js` set `isClientRelevant = false` and `hasClientChanges = false` for non-JS/CSS files (while wastefully calling `fs.readFileSync(absFilePath, "utf8")` on binary media), and `assets-plugin.js` / `dinou-asset-plugin.js` cached initial asset buffers indefinitely.
   - **Fix**: Detected `isAssetFile` in `dinou/node/dev.js` (skipping UTF-8 directive parsing on binary assets, notifying the client bundler, refreshing CSS `url(...)`, and rebuilding RSC/SSR engines) and purged stale asset hashes from `__DINOU_MEM_FILES__`.

7. **Missing RFC 9110 HTTP `Range` (`206 Partial Content`) Support for `<video>` & `<audio>` (`static-assets.js`, `node/dev.js`, `node/build.js`, `bun/build.js`, `deno/build.js`)**:
   - **Root Cause**: Dinou's HTTP servers always returned `200 OK` without `Accept-Ranges: bytes`, breaking `<video>`/`<audio>` timeline scrubbing in Chrome/Firefox/Edge and blocking media playback in Safari.
   - **Fix**: Implemented `parseHttpByteRange(rangeHeader, totalSize)` in `dinou/core/static-assets.js` (`bytes=start-end`, `bytes=start-`, `bytes=-suffix`, `206 Partial Content`, `416 Range Not Satisfiable`, `Accept-Ranges: bytes`) and wired zero-copy range streaming into `node/dev.js`, `node/build.js`, `bun/build.js`, and `deno/build.js`.

8. **Missing Media/3D MIME Types & First-Class `dinou.config.*` `assetExtensions` (`static-assets.js`, `asset-extensions.js`, `generate-route-types.js`, `index.d.ts`)**:
   - Added `.avi`, `.mkv`, `.mjpeg`, `.mjpg`, `.opus`, `.glb`, `.gltf`, and `.hdr` to `STATIC_MIME_TYPES` and `PUBLIC_STATIC_EXT_REGEX`.
   - Added `assetExtensions?: string[]` to `DinouConfig` (`dinou.config.{ts,mjs,js,cjs}`), automatically recognized by all 3 bundlers, all 4 runtimes, and `generateRouteTypes` (which emits ambient `declare module "*.<ext>"` blocks into `.dinou/types/routes.d.ts` without requiring `dinou eject`).

---

## 2. Complete File Manifest (`26` Modified Framework Files)

1. `dinou/core/asset-extensions.js` *(Rewritten — unified extensions, `assetExtensions` config merging, path+content hashing, specifier resolver, and `createServerAssetPlugin`)*
2. `dinou/core/load-dinou-config.js` *(Updated — per-`cwd` config caching and `globalThis.__DINOU_CONFIG_CWD__` tracking)*
3. `dinou/core/get-abs-path-with-ext.js` *(Updated — optional `context.cwd` forwarding in `getTsconfigAliases`)*
4. `dinou/core/postcss-pipeline.js` *(Updated — unified `getAssetFileName` for CSS `url(...)` assets)*
5. `dinou/core/static-assets.js` *(Updated — missing video/audio/3D MIME types, `PUBLIC_STATIC_EXT_REGEX`, and `parseHttpByteRange`)*
6. `dinou/core/generate-route-types.js` *(Updated — auto-generates `declare module "*.<ext>"` in `.dinou/types/routes.d.ts` for custom `assetExtensions`)*
7. `dinou/index.d.ts` *(Updated — `assetExtensions?: string[]` on `DinouConfig`)*
8. `dinou/esbuild/plugins-esbuild/assets-plugin.js` *(Rewritten — unified `resolveAssetImport` + `getAssetInfo`, stale hash eviction, deduplicated emission)*
9. `dinou/esbuild/helpers-esbuild/swc-disk-cache.js` *(Updated — stops intercepting asset imports in `swcRedirectPlugin`)*
10. `dinou/esbuild/helpers-esbuild/write.js` *(Updated — handles `dinou-asset-entry:`, custom `assetExtensions`, and deduplicated `filesToWrite`)*
11. `dinou/esbuild/helpers-esbuild/get-esbuild-entries.js` *(Updated — honors `dinouConfig.assetExtensions` and bare `node_modules` assets)*
12. `dinou/esbuild/helpers-esbuild/get-config-esbuild.js` *(Updated — forwards `serverAssetPaths` and `dinouConfig`)*
13. `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js` *(Updated — forwards `serverAssetPaths` and `dinouConfig`)*
14. `dinou/esbuild/build.js` *(Updated — clears `DINOU_DEV`, passes `serverAssetPaths`/`dinouConfig`, wires server asset & CSS modules plugins into `.dinou/dist1/server`)*
15. `dinou/esbuild/dev.js` *(Updated — loads `dinouConfig` and forwards `serverAssetPaths`)*
16. `dinou/rollup/rollup-plugins/dinou-asset-plugin.js` *(Rewritten — per-build emission set, `resolveId` alias/package resolution, `addWatchFile`, `emitFiles` option)*
17. `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` *(Updated — `getAssetInfo`, `knownServerAssets` watch persistence, `resolveAssetImport`)*
18. `dinou/rollup/rollup.config.js` *(Updated — loads `dinouConfig` before `generateRouteTypes`, places `dinouAssetPlugin` before `tsconfigPaths`, wires `serverConfig` asset plugin)*
19. `dinou/webpack/helpers/get-webpack-entries.js` *(Updated — collects and returns `detectedAssetEntries` for Server Components)*
20. `dinou/webpack/webpack.config.js` *(Updated — `getAssetFileName`, `DinouWebpackAssetAliasPlugin`, `serverAssetEntries` emission, and `serverConfig` rules)*
21. `dinou/node/bundle-dual-engine.js` *(Updated — uses shared `createServerAssetPlugin`)*
22. `dinou/node/build.js` *(Updated — HTTP `206`/`416` `Range` streaming + `serverAssetPlugin` in Pass C)*
23. `dinou/cloudflare/build.js` *(Updated — replaces `dataurl` loaders with `createServerAssetPlugin` across Pass A, Pass B, and Pass C)*
24. `dinou/bun/build.js` *(Updated — replaces `dataurl` loaders with `createServerAssetPlugin` + HTTP `206`/`416` `Range` support)*
25. `dinou/deno/build.js` *(Updated — replaces `dataurl` loaders with `createServerAssetPlugin` + HTTP `206`/`416` `Range` support)*
26. `dinou/node/dev.js` *(Updated — shared `createServerAssetPlugin`, `isAssetFile` rebuild handling, and HTTP `206`/`416` `Range` streaming)*

---

## 3. Complete Source Code & Unified Diffs

### 3.1. `dinou/core/asset-extensions.js` *(Full Replacement)*

```js
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { normalizePathCase } from "./path-utils.js";
import {
  getAbsPathWithExt,
  stripJsonCommentsAndTrailingCommas,
} from "./get-abs-path-with-ext.js";

export const extensions = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "avif",
  "ico",
  "mp4",
  "webm",
  "ogg",
  "mov",
  "avi",
  "mkv",
  "mp3",
  "wav",
  "flac",
  "m4a",
  "aac",
  "mjpeg",
  "mjpg",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
];

const DEFAULT_EXTENSIONS_SET = new Set(extensions);

const escapeRegExp = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const globPattern = `**/*.{${extensions.join(",")}}`;

// Regex useful for Rollup/Webpack/PostCSS/Esbuild asset matching
export const regex = new RegExp(`\\.(${extensions.map(escapeRegExp).join("|")})$`, "i");

// Version with leading dot for direct comparisons
export const extensionsWithDot = extensions.map((ext) => `.${ext}`);

const syncConfigExtCache = new Map();
const assetHashCache = new Map();

export function normalizeAssetExtension(rawExt) {
  if (typeof rawExt !== "string") return null;
  const cleaned = rawExt.trim().replace(/^\.+/, "").toLowerCase();
  if (!cleaned || !/^[a-z0-9][a-z0-9.+-]*$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function normalizeAssetExtensionsList(rawList) {
  if (!Array.isArray(rawList)) return [];
  const result = [];
  const seen = new Set();
  for (const item of rawList) {
    const norm = normalizeAssetExtension(item);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

/**
 * Synchronously inspects `globalThis.__DINOU_CONFIG__` or `dinou.config.{ts,mjs,js,cjs}`
 * to extract user-configured `assetExtensions` when synchronous tools (like `generateRouteTypes`) run.
 */
export function readCustomAssetExtensionsSync(projectRoot = process.cwd()) {
  const rootDir = path.resolve(projectRoot || process.cwd());
  if (
    typeof globalThis !== "undefined" &&
    globalThis.__DINOU_CONFIG__ &&
    globalThis.__DINOU_CONFIG_CWD__ === rootDir &&
    Array.isArray(globalThis.__DINOU_CONFIG__.assetExtensions)
  ) {
    return normalizeAssetExtensionsList(
      globalThis.__DINOU_CONFIG__.assetExtensions
    ).filter((ext) => !DEFAULT_EXTENSIONS_SET.has(ext));
  }

  for (const filename of [
    "dinou.config.ts",
    "dinou.config.mjs",
    "dinou.config.js",
    "dinou.config.cjs",
  ]) {
    const cfgPath = path.join(rootDir, filename);
    if (!fs.existsSync(cfgPath)) continue;
    try {
      const stat = fs.statSync(cfgPath);
      const cached = syncConfigExtCache.get(cfgPath);
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        return cached.customExtensions;
      }
      const raw = fs.readFileSync(cfgPath, "utf8");
      const stripped = stripJsonCommentsAndTrailingCommas(raw);
      const match = stripped.match(/\bassetExtensions\s*:\s*\[([\s\S]*?)\]/);
      const parsed = [];
      if (match && match[1]) {
        const strLiterals = match[1].matchAll(/(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g);
        for (const lit of strLiterals) {
          const val = lit[1] ?? lit[2] ?? lit[3];
          if (val) parsed.push(val);
        }
      }
      const customExtensions = normalizeAssetExtensionsList(parsed).filter(
        (ext) => !DEFAULT_EXTENSIONS_SET.has(ext)
      );
      syncConfigExtCache.set(cfgPath, {
        mtimeMs: stat.mtimeMs,
        customExtensions,
      });
      return customExtensions;
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Builds the merged set of built-in + custom `assetExtensions` (from `dinou.config.*`),
 * returning `{ extensions, customExtensions, extensionsWithDot, globPattern, regex, resolveFilterRegex }`.
 */
export function getAssetExtensionsInfo(
  dinouConfigOrList = null,
  projectRoot = process.cwd()
) {
  let rawCustom = [];
  if (Array.isArray(dinouConfigOrList)) {
    rawCustom = dinouConfigOrList;
  } else if (
    dinouConfigOrList &&
    typeof dinouConfigOrList === "object" &&
    Array.isArray(dinouConfigOrList.assetExtensions)
  ) {
    rawCustom = dinouConfigOrList.assetExtensions;
  } else {
    rawCustom = readCustomAssetExtensionsSync(projectRoot);
  }

  const normalizedCustom = normalizeAssetExtensionsList(rawCustom);
  const customExtensions = normalizedCustom.filter(
    (ext) => !DEFAULT_EXTENSIONS_SET.has(ext)
  );
  const merged =
    customExtensions.length > 0
      ? [...extensions, ...customExtensions]
      : extensions;

  const escapedAlternation = merged.map(escapeRegExp).join("|");
  return {
    extensions: merged,
    customExtensions,
    extensionsWithDot: merged.map((ext) => `.${ext}`),
    globPattern:
      merged.length === 1
        ? `**/*.${merged[0]}`
        : `**/*.{${merged.join(",")}}`,
    regex: new RegExp(`\\.(${escapedAlternation})$`, "i"),
    resolveFilterRegex: new RegExp(
      `\\.(${escapedAlternation})(?:[?#].*)?$`,
      "i"
    ),
  };
}

function normalizePosixCasePath(p) {
  return normalizePathCase(path.resolve(p)).replace(/\\/g, "/");
}

function sanitizeAssetBaseName(rawBase) {
  const cleaned = String(rawBase || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "asset";
}

/**
 * Computes a deterministic, OS-independent, content-and-path-addressed asset descriptor:
 * - `fileName`: `"assets/<name>-<8hex>.<ext>"`
 * - `publicUrl`: `"/assets/<name>-<8hex>.<ext>"`
 * - `hash`: 8-character SHA-256 hex digest of `relPosixPath + "\0" + fileBytes`
 */
export function getAssetInfo(
  absFilePath,
  projectRoot = process.cwd(),
  { includeBuffer = false, buffer = null } = {}
) {
  const absPath = path.resolve(absFilePath);
  const normAbs = normalizePosixCasePath(absPath);
  const normRoot = normalizePosixCasePath(projectRoot || process.cwd());
  const relForHash = path.posix.relative(normRoot, normAbs) || path.posix.basename(normAbs);

  let stat = null;
  try {
    stat = fs.statSync(absPath);
  } catch (e) {}

  if (stat && stat.isFile() && !buffer) {
    const cached = assetHashCache.get(normAbs);
    if (
      cached &&
      cached.normRoot === normRoot &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.size === stat.size
    ) {
      if (!includeBuffer) {
        return {
          hash: cached.hash,
          fileName: cached.fileName,
          publicUrl: cached.publicUrl,
        };
      }
      const freshBuf = fs.readFileSync(absPath);
      return {
        hash: cached.hash,
        fileName: cached.fileName,
        publicUrl: cached.publicUrl,
        buffer: freshBuf,
      };
    }
  }

  let fileBuf = buffer;
  if (!fileBuf && stat && stat.isFile()) {
    try {
      fileBuf = fs.readFileSync(absPath);
    } catch (e) {
      fileBuf = null;
    }
  }

  const hasher = crypto.createHash("sha256").update(relForHash);
  if (fileBuf) {
    hasher.update("\0").update(fileBuf);
  }
  const hash = hasher.digest("hex").slice(0, 8);

  const rawExt = path.extname(absPath);
  const ext = rawExt.toLowerCase();
  const safeBase = sanitizeAssetBaseName(path.basename(absPath, rawExt));
  const fileName = `assets/${safeBase}-${hash}${ext}`;
  const publicUrl = `/${fileName}`;

  if (stat && stat.isFile()) {
    assetHashCache.set(normAbs, {
      normRoot,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      hash,
      fileName,
      publicUrl,
    });
  }

  return includeBuffer
    ? { hash, fileName, publicUrl, buffer: fileBuf }
    : { hash, fileName, publicUrl };
}

export function getAssetFileName(absFilePath, projectRoot = process.cwd()) {
  return getAssetInfo(absFilePath, projectRoot).fileName;
}

export function getAssetPublicUrl(absFilePath, projectRoot = process.cwd()) {
  return getAssetInfo(absFilePath, projectRoot).publicUrl;
}

function mapSwcMirrorDirToOriginal(dirPath, projectRoot) {
  if (!dirPath) return path.resolve(projectRoot);
  const resolvedDir = path.resolve(dirPath);
  const swcRoot = path.resolve(projectRoot, ".dinou", "swc");
  const normDir = normalizePosixCasePath(resolvedDir);
  const normSwc = normalizePosixCasePath(swcRoot);
  if (normDir === normSwc) {
    return path.resolve(projectRoot);
  }
  if (normDir.startsWith(normSwc + "/")) {
    const rel = path.relative(swcRoot, resolvedDir);
    return path.resolve(projectRoot, rel);
  }
  return resolvedDir;
}

function isExistingFile(filePath) {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (e) {
    return false;
  }
}

export function resolveAssetImport(
  specifier,
  {
    importer = "",
    resolveDir = "",
    projectRoot = process.cwd(),
    assetRegex = null,
  } = {}
) {
  if (!specifier || typeof specifier !== "string") return null;
  const cleanSpec = specifier.split("?")[0].split("#")[0];
  if (!cleanSpec) return null;

  const rootDir = path.resolve(projectRoot || process.cwd());
  const activeRegex =
    assetRegex || getAssetExtensionsInfo(null, rootDir).regex;
  if (!activeRegex.test(cleanSpec)) {
    return null;
  }

  if (path.isAbsolute(cleanSpec) && isExistingFile(cleanSpec)) {
    return path.resolve(cleanSpec);
  }

  const rawImporterDir = importer
    ? path.dirname(importer)
    : resolveDir || rootDir;
  const effectiveImporterDir = mapSwcMirrorDirToOriginal(rawImporterDir, rootDir);

  const viaAliasOrRel = getAbsPathWithExt(cleanSpec, {
    parentDir: effectiveImporterDir,
    cwd: rootDir,
  });
  if (isExistingFile(viaAliasOrRel)) {
    return path.resolve(viaAliasOrRel);
  }

  if (cleanSpec.startsWith("@/")) {
    const fallbackAt = path.resolve(rootDir, "src", cleanSpec.slice(2));
    if (isExistingFile(fallbackAt)) {
      return fallbackAt;
    }
  }
  if (cleanSpec.startsWith("~/")) {
    const fallbackTilde = path.resolve(rootDir, "src", cleanSpec.slice(2));
    if (isExistingFile(fallbackTilde)) {
      return fallbackTilde;
    }
  }

  if (cleanSpec.startsWith("./") || cleanSpec.startsWith("../")) {
    const relCandidate = path.resolve(effectiveImporterDir, cleanSpec);
    if (isExistingFile(relCandidate)) {
      return relCandidate;
    }
    return null;
  }

  if (!cleanSpec.startsWith("/")) {
    try {
      const req = createRequire(
        path.join(effectiveImporterDir, "__dinou_asset_resolve__.js")
      );
      const resolvedPkgAsset = req.resolve(cleanSpec);
      if (isExistingFile(resolvedPkgAsset)) {
        return path.resolve(resolvedPkgAsset);
      }
    } catch (e) {
      let cur = effectiveImporterDir;
      while (true) {
        const directPkgPath = path.join(cur, "node_modules", cleanSpec);
        if (isExistingFile(directPkgPath)) {
          return path.resolve(directPkgPath);
        }
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
      }
    }
  }

  return null;
}

export function createServerAssetPlugin({
  projectRoot = process.cwd(),
  dinouConfig = null,
  assetRegex = null,
  emitToDevMemory = false,
} = {}) {
  const rootDir = path.resolve(projectRoot || process.cwd());
  const lastEmittedKeyBySource = new Map();

  return {
    name: "dinou-server-asset-plugin",
    setup(build) {
      const extInfo = getAssetExtensionsInfo(dinouConfig, rootDir);
      const cleanRegex = assetRegex || extInfo.regex;
      const filterRegex = assetRegex
        ? new RegExp(
            assetRegex.source.replace(/\\\$$|\$$/, "(?:[?#].*)?$"),
            assetRegex.flags.includes("i") ? "i" : `${assetRegex.flags}i`
          )
        : extInfo.resolveFilterRegex;

      build.onResolve({ filter: filterRegex }, (args) => {
        const resolved = resolveAssetImport(args.path, {
          importer: args.importer,
          resolveDir: args.resolveDir,
          projectRoot: rootDir,
          assetRegex: cleanRegex,
        });
        if (!resolved) return null;
        return { path: resolved, namespace: "dinou-server-asset" };
      });

      build.onLoad({ filter: /.*/, namespace: "dinou-server-asset" }, (args) => {
        const info = getAssetInfo(args.path, rootDir, {
          includeBuffer: emitToDevMemory,
        });

        if (emitToDevMemory && info.buffer) {
          const sourceKey = normalizePosixCasePath(args.path);
          const prevFileName = lastEmittedKeyBySource.get(sourceKey);
          if (
            prevFileName &&
            prevFileName !== info.fileName &&
            typeof globalThis !== "undefined" &&
            globalThis.__DINOU_MEM_FILES__
          ) {
            globalThis.__DINOU_MEM_FILES__.delete(prevFileName);
            globalThis.__DINOU_MEM_FILES__.delete("/" + prevFileName);
            globalThis.__DINOU_MEM_FILES__.delete(path.basename(prevFileName));
          }
          lastEmittedKeyBySource.set(sourceKey, info.fileName);

          if (typeof globalThis !== "undefined") {
            if (!globalThis.__DINOU_MEM_FILES__) {
              globalThis.__DINOU_MEM_FILES__ = new Map();
            }
            globalThis.__DINOU_MEM_FILES__.set(info.fileName, info.buffer);
            globalThis.__DINOU_MEM_FILES__.set("/" + info.fileName, info.buffer);
            globalThis.__DINOU_MEM_FILES__.set(
              path.basename(info.fileName),
              info.buffer
            );
          }

          if (process.env.DINOU_WRITE_TO_DISK === "true") {
            try {
              const outAssetPath = path.resolve(
                rootDir,
                ".dinou/public",
                info.fileName
              );
              fs.mkdirSync(path.dirname(outAssetPath), { recursive: true });
              fs.writeFileSync(outAssetPath, info.buffer);
            } catch (e) {}
          }
        }

        return {
          contents: `export default ${JSON.stringify(info.publicUrl)};`,
          loader: "js",
          watchFiles: [args.path],
        };
      });
    },
  };
}

export default {
  extensions,
  extensionsWithDot,
  regex,
  globPattern,
  normalizeAssetExtension,
  normalizeAssetExtensionsList,
  readCustomAssetExtensionsSync,
  getAssetExtensionsInfo,
  getAssetInfo,
  getAssetFileName,
  getAssetPublicUrl,
  resolveAssetImport,
  createServerAssetPlugin,
};
```

---

### 3.2. `dinou/core/load-dinou-config.js` *(Full Replacement)*

```js
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let dinouConfig = { plugins: [] };
const dinouConfigPromisesByCwd = new Map();

async function getDinouConfig(customCwd) {
  const cwd = path.resolve(
    customCwd ||
      (typeof process !== "undefined" && typeof process.cwd === "function"
        ? process.cwd()
        : ".")
  );

  if (
    typeof globalThis !== "undefined" &&
    globalThis.__DINOU_CONFIG__ &&
    (!globalThis.__DINOU_CONFIG_CWD__ || globalThis.__DINOU_CONFIG_CWD__ === cwd)
  ) {
    return globalThis.__DINOU_CONFIG__;
  }

  const isDev = process.env.NODE_ENV !== "production";
  if (!isDev && dinouConfigPromisesByCwd.has(cwd)) {
    return dinouConfigPromisesByCwd.get(cwd);
  }

  const loadPromise = (async () => {
    for (const filename of [
      "dinou.config.ts",
      "dinou.config.mjs",
      "dinou.config.js",
      "dinou.config.cjs",
    ]) {
      const p = path.resolve(cwd, filename);
      if (existsSync(p)) {
        try {
          let loaded;
          let esbuild;
          if (
            typeof process !== "undefined" &&
            process.versions &&
            process.versions.node &&
            process.env.DINOU_RUNTIME !== "edge"
          ) {
            try {
              const req = typeof require === "function" ? require : null;
              const esbuildPkg = "esbuild";
              if (req) {
                esbuild = req(esbuildPkg);
              }
            } catch (e) {}
          }

          if (esbuild && typeof esbuild.build === "function") {
            const outDir = path.resolve(cwd, ".dinou");
            if (!existsSync(outDir)) {
              mkdirSync(outDir, { recursive: true });
            }
            const bundledPath = path.resolve(outDir, "dinou.config.bundled.mjs");
            await esbuild.build({
              entryPoints: [p],
              outfile: bundledPath,
              bundle: true,
              format: "esm",
              platform: "node",
              packages: "external",
              sourcemap: "inline",
              plugins: [
                {
                  name: "dinou-config-alias",
                  setup(build) {
                    build.onResolve({ filter: /^dinou$/ }, () => {
                      return { path: "dinou/config", external: true };
                    });
                  },
                },
              ],
            });
            loaded = await import(
              pathToFileURL(bundledPath).href + (isDev ? `?t=${Date.now()}` : "")
            );
          } else if (p.endsWith(".mjs")) {
            loaded = await import(
              pathToFileURL(p).href + (isDev ? `?t=${Date.now()}` : "")
            );
          } else {
            const nodeReq =
              typeof globalThis !== "undefined" &&
              typeof globalThis.__dinou_require__ === "function"
                ? globalThis.__dinou_require__
                : typeof require === "function"
                  ? require
                  : null;
            if (nodeReq) {
              try {
                loaded = nodeReq(p);
              } catch (e) {
                loaded = await import(
                  pathToFileURL(p).href + (isDev ? `?t=${Date.now()}` : "")
                );
              }
            } else {
              loaded = await import(
                pathToFileURL(p).href + (isDev ? `?t=${Date.now()}` : "")
              );
            }
          }
          const cfg =
            loaded && loaded.default ? loaded.default : loaded || { plugins: [] };
          dinouConfig = cfg;
          if (typeof globalThis !== "undefined") {
            globalThis.__DINOU_CONFIG__ = cfg;
            globalThis.__DINOU_CONFIG_CWD__ = cwd;
          }
          return cfg;
        } catch (err) {
          console.error(`[Dinou] Error loading ${filename}:`, err);
        }
      }
    }
    const fallback = { plugins: [] };
    dinouConfig = fallback;
    return fallback;
  })();

  if (!isDev) {
    dinouConfigPromisesByCwd.set(cwd, loadPromise);
  }
  return loadPromise;
}

if (typeof globalThis !== "undefined" && globalThis.__DINOU_CONFIG__) {
  dinouConfig = globalThis.__DINOU_CONFIG__;
}

export { getDinouConfig };
export default {
  getDinouConfig,
};
```

---

### 3.3. `dinou/core/get-abs-path-with-ext.js`

```diff
-function getTsconfigAliases() {
-  const cwd = process.cwd();
+function getTsconfigAliases(customCwd) {
+  const cwd = path.resolve(customCwd || process.cwd());
   const tsconfigPath = path.resolve(cwd, "tsconfig.json");
```

```diff
 export function getAbsPathWithExt(specifier, context) {
   const cleanSpecifier = specifier ? specifier.split("?")[0].split("#")[0] : specifier;
   if (!cleanSpecifier) return null;

-  const aliasMap = getTsconfigAliases();
+  const aliasMap = getTsconfigAliases(context?.cwd);
```

---

### 3.4. `dinou/core/postcss-pipeline.js`

```diff
 import createScopedName from "./createScopedName.js";
+import { getAssetFileName } from "./asset-extensions.js";
 import { getAbsPathWithExt, resolveCssImportSpecifier } from "./get-abs-path-with-ext.js";
```

```diff
         const resolvedPath = resolveCssAssetUrlPath(cleanUrlPath, declDir);
         if (!resolvedPath) {
           return fullMatch;
         }

-        const ext = path.extname(resolvedPath);
-        const base = path.basename(resolvedPath, ext);
-        const scoped = createScopedName(base, resolvedPath);
-        const assetFileName = `assets/${scoped}${ext}`;
+        const assetFileName = getAssetFileName(resolvedPath, process.cwd());
+        const assetBaseName = path.basename(assetFileName);

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
-            globalThis.__DINOU_MEM_FILES__.set(`${scoped}${ext}`, buf);
+            globalThis.__DINOU_MEM_FILES__.set(assetBaseName, buf);
           } catch (e) {}
         }
```

---

### 3.5. `dinou/core/static-assets.js`

```diff
   // Images & Icons
   ".svg": "image/svg+xml",
   ".png": "image/png",
   ".jpg": "image/jpeg",
   ".jpeg": "image/jpeg",
   ".gif": "image/gif",
   ".webp": "image/webp",
   ".avif": "image/avif",
   ".ico": "image/x-icon",
   ".bmp": "image/bmp",
   ".apng": "image/apng",
+  ".hdr": "image/vnd.radiance",

   // Fonts
   ".woff": "font/woff",
   ".woff2": "font/woff2",
   ".ttf": "font/ttf",
   ".otf": "font/otf",
   ".eot": "application/vnd.ms-fontobject",

-  // Documents & Archives
+  // Documents, 3D Models & Archives
   ".pdf": "application/pdf",
+  ".glb": "model/gltf-binary",
+  ".gltf": "model/gltf+json",
   ".zip": "application/zip",
   ".gz": "application/gzip",

   // Video & Audio
   ".mp4": "video/mp4",
   ".webm": "video/webm",
   ".ogv": "video/ogg",
   ".mov": "video/quicktime",
+  ".avi": "video/x-msvideo",
+  ".mkv": "video/x-matroska",
+  ".mjpeg": "video/x-motion-jpeg",
+  ".mjpg": "video/x-motion-jpeg",
   ".mp3": "audio/mpeg",
   ".wav": "audio/wav",
   ".ogg": "audio/ogg",
+  ".opus": "audio/opus",
   ".m4a": "audio/mp4",
   ".aac": "audio/aac",
   ".flac": "audio/flac",
 });

 export const PUBLIC_STATIC_EXT_REGEX =
-  /\.(?:js|mjs|cjs|css|map|wasm|png|jpg|jpeg|gif|svg|ico|webp|avif|bmp|apng|woff|woff2|ttf|eot|otf|txt|xml|rss|atom|json|webmanifest|html|htm|pdf|csv|md|ics|vtt|mp4|webm|ogv|mov|mp3|wav|ogg|m4a|aac|flac|zip|gz)$/i;
+  /\.(?:js|mjs|cjs|css|map|wasm|png|jpg|jpeg|gif|svg|ico|webp|avif|bmp|apng|hdr|woff|woff2|ttf|eot|otf|txt|xml|rss|atom|json|webmanifest|html|htm|pdf|glb|gltf|csv|md|ics|vtt|mp4|webm|ogv|mov|avi|mkv|mjpeg|mjpg|mp3|wav|ogg|opus|m4a|aac|flac|zip|gz)$/i;
```

Also append `parseHttpByteRange` to `dinou/core/static-assets.js`:

```js
/**
 * Parses an incoming RFC 9110 `Range: bytes=<start>-<end>` HTTP header against `totalSize`.
 * Supports standard `bytes=start-end`, open-ended `bytes=start-`, and suffix `bytes=-length`
 * ranges required by HTML5 `<video>` and `<audio>` scrubbing and Safari media playback.
 *
 * @returns {null | { unsatisfiable: true, contentRange: string } | { unsatisfiable: false, start: number, end: number, length: number, contentRange: string }}
 */
export function parseHttpByteRange(rangeHeader, totalSize) {
  if (
    !rangeHeader ||
    typeof rangeHeader !== "string" ||
    typeof totalSize !== "number" ||
    !Number.isFinite(totalSize) ||
    totalSize < 0
  ) {
    return null;
  }

  const trimmed = rangeHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bytes=")) {
    return null;
  }

  const spec = trimmed.slice(6).trim();
  if (!spec || spec.includes(",")) {
    return null;
  }

  const dashIdx = spec.indexOf("-");
  if (dashIdx === -1) {
    return null;
  }

  const startStr = spec.slice(0, dashIdx).trim();
  const endStr = spec.slice(dashIdx + 1).trim();

  if (totalSize === 0) {
    return {
      unsatisfiable: true,
      contentRange: "bytes */0",
    };
  }

  let start;
  let end;

  if (startStr === "") {
    if (!/^\d+$/.test(endStr)) return null;
    const suffixLength = Number(endStr);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return {
        unsatisfiable: true,
        contentRange: `bytes */${totalSize}`,
      };
    }
    start = Math.max(0, totalSize - suffixLength);
    end = totalSize - 1;
  } else {
    if (!/^\d+$/.test(startStr)) return null;
    start = Number(startStr);
    if (!Number.isSafeInteger(start) || start >= totalSize) {
      return {
        unsatisfiable: true,
        contentRange: `bytes */${totalSize}`,
      };
    }
    if (endStr === "") {
      end = totalSize - 1;
    } else {
      if (!/^\d+$/.test(endStr)) return null;
      const parsedEnd = Number(endStr);
      if (!Number.isSafeInteger(parsedEnd) || parsedEnd < start) {
        return {
          unsatisfiable: true,
          contentRange: `bytes */${totalSize}`,
        };
      }
      end = Math.min(parsedEnd, totalSize - 1);
    }
  }

  return {
    unsatisfiable: false,
    start,
    end,
    length: end - start + 1,
    contentRange: `bytes ${start}-${end}/${totalSize}`,
  };
}
```

---

### 3.6. `dinou/core/generate-route-types.js` & `dinou/index.d.ts`

In `dinou/core/generate-route-types.js`:

```diff
 import fs from "node:fs";
 import path from "node:path";
+import { readCustomAssetExtensionsSync } from "./asset-extensions.js";
```

```diff
   const formatInterfaceBody = (body) => (body ? `\n${body}\n  ` : "");
+  const customAssetExts = readCustomAssetExtensionsSync(projectRoot);
+  const customAssetDeclarations =
+    customAssetExts.length > 0
+      ? "\n" +
+        customAssetExts
+          .map(
+            (ext) =>
+              `declare module "*.${ext}" {\n  const value: string;\n  export default value;\n}\n`
+          )
+          .join("\n")
+      : "";
```

And append `${customAssetDeclarations}` at the end of `content` in `generateRouteTypes`:

```diff
-  }
-}
-`;
+  }
+}
+${customAssetDeclarations}`;
```

In `dinou/index.d.ts` (`DinouConfig`):

```diff
+  /**
+   * Additional file extensions (with or without leading dot, e.g. `["glb", "gltf", "hdr", "wasm"]`)
+   * recognized as static media/binary assets when imported in Server Components, Client Components, or CSS `url(...)`.
+   * Automatically fingerprinted into `/assets/[name]-[hash].[ext]` across Esbuild, Rollup, Webpack, and all runtimes,
+   * with ambient TypeScript declarations emitted into `.dinou/types/routes.d.ts`.
+   */
+  assetExtensions?: string[];
+
   /**
    * Array of Dinou plugins.
    */
   plugins?: DinouPlugin[];
```

---

### 3.7. `dinou/esbuild/plugins-esbuild/assets-plugin.js` *(Full Replacement)*

```js
import fs from "node:fs";
import path from "node:path";
import {
  getAssetExtensionsInfo,
  getAssetInfo,
  resolveAssetImport,
} from "../../core/asset-extensions.js";

const normKey = (p) => {
  if (!p) return "";
  let s = path.resolve(p).replace(/\\/g, "/");
  if (process.platform === "win32") {
    s = s.replace(/^([a-zA-Z]):/, (_, d) => d.toLowerCase() + ":");
  }
  return s;
};

export default function assetsPlugin({
  include = null,
  dinouConfig = null,
  projectRoot = process.cwd(),
  serverAssetPaths = [],
  changedIds,
} = {}) {
  const rootDir = path.resolve(projectRoot || process.cwd());
  const emittedAssetsBySource = new Map();

  function recordEmittedAsset(absSourcePath) {
    if (!absSourcePath || !fs.existsSync(absSourcePath)) return null;
    const info = getAssetInfo(absSourcePath, rootDir, { includeBuffer: true });
    if (!info.buffer) return info;

    const sourceKey = normKey(absSourcePath);
    const prev = emittedAssetsBySource.get(sourceKey);
    if (
      prev &&
      prev.fileName !== info.fileName &&
      typeof globalThis !== "undefined" &&
      globalThis.__DINOU_MEM_FILES__
    ) {
      globalThis.__DINOU_MEM_FILES__.delete(prev.fileName);
      globalThis.__DINOU_MEM_FILES__.delete("/" + prev.fileName);
      globalThis.__DINOU_MEM_FILES__.delete(path.basename(prev.fileName));
    }

    emittedAssetsBySource.set(sourceKey, {
      sourcePath: path.resolve(absSourcePath),
      fileName: info.fileName,
      contents: info.buffer,
    });
    return info;
  }

  return {
    name: "assets-plugin",
    setup(build) {
      const outdir = build.initialOptions.outdir;
      if (!outdir) {
        throw new Error("assetsPlugin requires outdir to be set");
      }

      build.initialOptions.assetNames = "assets/[name]-[hash]";

      const extInfo = getAssetExtensionsInfo(dinouConfig, rootDir);
      const cleanRegex = include || extInfo.regex;
      const filterRegex = include
        ? new RegExp(
            include.source.replace(/\\\$$|\$$/, "(?:[?#].*)?$"),
            include.flags.includes("i") ? "i" : `${include.flags}i`
          )
        : extInfo.resolveFilterRegex;

      build.onResolve({ filter: filterRegex }, async (args) => {
        if (args.pluginData?.inAssetPlugin) return null;

        let resolvedPath =
          args.kind === "entry-point"
            ? path.resolve(rootDir, args.path)
            : resolveAssetImport(args.path, {
                importer: args.importer,
                resolveDir: args.resolveDir,
                projectRoot: rootDir,
                assetRegex: cleanRegex,
              });

        if (!resolvedPath) {
          try {
            const res = await build.resolve(args.path, {
              resolveDir: args.resolveDir,
              kind: args.kind,
              pluginData: { inAssetPlugin: true },
            });
            if (res && res.path) {
              resolvedPath = res.path;
            }
          } catch (e) {}
        }

        if (!resolvedPath) return null;

        if (args.kind === "entry-point") {
          return {
            path: resolvedPath,
            namespace: "dinou-asset-entry",
          };
        }

        return {
          path: resolvedPath,
          namespace: "dinou-asset",
        };
      });

      const loadAssetModule = async (args) => {
        const info = recordEmittedAsset(args.path);
        const publicUrl =
          info?.publicUrl || getAssetInfo(args.path, rootDir).publicUrl;
        return {
          contents: `export default ${JSON.stringify(publicUrl)};`,
          loader: "js",
          watchFiles: [args.path],
        };
      };

      build.onLoad({ filter: /.*/, namespace: "dinou-asset" }, loadAssetModule);
      build.onLoad(
        { filter: /.*/, namespace: "dinou-asset-entry" },
        loadAssetModule
      );

      build.onEnd(async (result) => {
        const tAssets0 = Date.now();
        try {
          if (!result || !Array.isArray(result.outputFiles)) return;

          if (Array.isArray(serverAssetPaths) && serverAssetPaths.length > 0) {
            for (const serverAssetPath of serverAssetPaths) {
              recordEmittedAsset(serverAssetPath);
            }
          }

          if (changedIds && changedIds.size > 0) {
            for (const changedPath of changedIds) {
              if (cleanRegex.test(changedPath) && fs.existsSync(changedPath)) {
                recordEmittedAsset(changedPath);
              }
            }
          }

          const existingDestKeys = new Set(
            result.outputFiles.map((f) => normKey(f.path))
          );

          for (const [sourceKey, asset] of emittedAssetsBySource.entries()) {
            if (!fs.existsSync(asset.sourcePath)) {
              emittedAssetsBySource.delete(sourceKey);
              continue;
            }
            const destPath = path.resolve(outdir, asset.fileName);
            const destKey = normKey(destPath);
            if (existingDestKeys.has(destKey)) continue;
            existingDestKeys.add(destKey);

            const contents = asset.contents;
            result.outputFiles.push({
              path: destPath,
              contents,
              get text() {
                return new TextDecoder().decode(this.contents);
              },
            });
          }
        } finally {
          globalThis.__DINOU_ASSETS_TIME__ = Date.now() - tAssets0;
        }
      });
    },
  };
}
```

---

### 3.8. Esbuild Helpers & Entry Scripts (`swc-disk-cache.js`, `write.js`, `get-esbuild-entries.js`, `get-config-esbuild.js`, `get-config-esbuild-prod.js`, `esbuild/build.js`, `esbuild/dev.js`)

In `dinou/esbuild/helpers-esbuild/swc-disk-cache.js`:

```diff
-import { extensions as assetExtensions } from "../../core/asset-extensions.js";
+import { getAssetExtensionsInfo } from "../../core/asset-extensions.js";
...
 const styleExtensions = ["css", "scss", "less", "sass"];
-const fontExtensions = ["woff", "woff2", "ttf", "eot", "otf"];
-const redirectExtensions = [...styleExtensions, ...assetExtensions, ...fontExtensions];
-const redirectFilter = new RegExp(`\\.(${redirectExtensions.join("|")})$`, "i");
+const redirectFilter = new RegExp(`\\.(${styleExtensions.join("|")})$`, "i");
```

```diff
+      let activeAssetFilter = getAssetExtensionsInfo(null, projectRoot).resolveFilterRegex;
       build.onStart(() => {
+        activeAssetFilter = getAssetExtensionsInfo(null, projectRoot).resolveFilterRegex;
         resolveCache.clear();
         redirTime = 0;
         redirCalls = 0;
         redirHits = 0;
       });

       build.onResolve(
         { filter: /.*/ },
         (args) => {
           const importer = args.importer || "";
           if (!importer.includes(".dinou/swc") && !importer.includes(".dinou\\swc")) {
             return null;
           }

+          if (activeAssetFilter.test(args.path)) {
+            return null;
+          }
+
           const isRelative = args.path.startsWith(".");
-          const isAsset = redirectFilter.test(args.path);
-          if (!isRelative && !isAsset) {
+          const isStyle = redirectFilter.test(args.path);
+          if (!isRelative && !isStyle) {
             return null;
           }
```

In `dinou/esbuild/helpers-esbuild/write.js`:

```diff
-import { regex } from "../../core/asset-extensions.js";
+import { getAssetExtensionsInfo } from "../../core/asset-extensions.js";
...
   const cssRegex = /\.(css|scss|less)$/i;
+  const activeAssetRegex = getAssetExtensionsInfo(null, process.cwd()).regex;
   for (const [relPath, info] of Object.entries(result.metafile.outputs)) {
     if (!info.entryPoint) continue;
     let entryPointNormalized = info.entryPoint;
-    if (entryPointNormalized.startsWith("dinou-asset:")) {
+    if (entryPointNormalized.startsWith("dinou-asset-entry:")) {
+      entryPointNormalized = entryPointNormalized.replace("dinou-asset-entry:", "");
+    } else if (entryPointNormalized.startsWith("dinou-asset:")) {
       entryPointNormalized = entryPointNormalized.replace("dinou-asset:", "");
     }
     const inputKeys = Object.keys(info.inputs);
     if (
-      regex.test(entryPointNormalized) &&
+      activeAssetRegex.test(entryPointNormalized) &&
       inputKeys.length === 1 &&
       inputKeys[0] === info.entryPoint
     ) {
```

```diff
   const filesToWrite = [];
+  const seenWritePaths = new Set();
   for (const file of result.outputFiles) {
+    const resolvedOutPath = path.resolve(file.path);
+    const outKey = process.platform === "win32" ? resolvedOutPath.toLowerCase() : resolvedOutPath;
+    if (seenWritePaths.has(outKey)) {
+      continue;
+    }
+    seenWritePaths.add(outKey);
     const fileRelPath = normalizeRel(path.relative(process.cwd(), file.path));
```

In `dinou/esbuild/helpers-esbuild/get-esbuild-entries.js`:

```diff
 import {
-  regex as assetRegex,
-  globPattern as assetGlobPattern,
+  getAssetExtensionsInfo,
+  resolveAssetImport,
 } from "../../core/asset-extensions.js";
...
 export default async function getEsbuildEntries({
   srcDir = path.resolve("src"),
-  assetInclude = assetRegex,
+  assetInclude = null,
+  dinouConfig = null,
   manifest = {},
 } = {}) {
+  const projectRoot = path.dirname(path.resolve(srcDir));
+  const extInfo = getAssetExtensionsInfo(dinouConfig, projectRoot);
+  const activeAssetInclude = assetInclude || extInfo.regex;
+  const activeAssetGlobPattern = extInfo.globPattern;
...
       const absImportPathWithExt =
         getAbsPathWithExt(source, {
           parentURL: pathToFileURL(baseFilePath).href,
-        }) || resolveStyleImportFromCode(source, baseFilePath);
+        }) ||
+        resolveStyleImportFromCode(source, baseFilePath) ||
+        resolveAssetImport(source, {
+          importer: baseFilePath,
+          projectRoot,
+          assetRegex: activeAssetInclude,
+        });
...
-      if (assetInclude.test(absImportPathWithExt)) {
+      if (activeAssetInclude.test(absImportPathWithExt)) {
         assets.add(absImportPathWithExt);
         continue;
       }
...
-  const assets = await glob([assetGlobPattern], {
+  const assets = await glob([activeAssetGlobPattern], {
```

In `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`:

```diff
 export default function getConfigEsbuild({
   entryPoints,
   outdir = ".dinou/public",
   manifest = {},
   changedIds,
   cssModuleClassChanges,
   hmrEngine,
   cssRefreshRef,
   serverFiles,
+  serverAssetPaths = [],
+  dinouConfig = null,
   onManifestUpdated,
   onBuildStart,
   onBuildEnd,
   hmrPort,
 }) {
...
-    assetsPlugin({ changedIds }),
+    assetsPlugin({
+      changedIds,
+      serverAssetPaths,
+      dinouConfig,
+      projectRoot: process.cwd(),
+    }),
```

In `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`:

```diff
 export default function getConfigEsbuildProd({
   entryPoints,
   outdir = ".dinou/dist3",
   manifest = {},
   serverFiles,
+  serverAssetPaths = [],
+  dinouConfig = null,
   reactCompiler = true,
 }) {
...
-    assetsPlugin(),
+    assetsPlugin({
+      dinouConfig,
+      serverAssetPaths,
+      projectRoot: process.cwd(),
+    }),
```

In `dinou/esbuild/build.js`:

```diff
+delete process.env.DINOU_DEV;
+process.env.NODE_ENV = "production";
+
 import esbuild from "esbuild";
...
 import { getDinouConfig } from "../core/load-dinou-config.js";
+import { createServerAssetPlugin } from "../core/asset-extensions.js";
+import { createServerCssModulesPlugin } from "../core/server-css-modules-plugin.js";
...
 try {
+  const dinouConfig = await getDinouConfig();
+  const enableReactCompiler = dinouConfig?.reactCompiler !== false;
   try {
     generateRouteTypes(process.cwd());
   } catch (e) {}
   const manifest = {};

   const [
     esbuildEntries,
     detectedCSSEntries,
     detectedAssetEntries,
     serverFiles,
-  ] = await getEsbuildEntries({ manifest });
+  ] = await getEsbuildEntries({ manifest, dinouConfig });
...
-  const assetEntryPoints = [...detectedAssetEntries].reduce(
-    (acc, dAE) => ({ ...acc, [dAE.outfileName]: dAE.absPath }),
-    {}
-  );
+  const serverAssetPaths = [...detectedAssetEntries].map((dAE) => dAE.absPath);

   const entryPoints = {
     ...frameworkEntryPoints,
     ...componentEntryPoints,
     ...cssEntryPoints,
-    ...assetEntryPoints,
   };

-  const dinouConfig = await getDinouConfig();
-  const enableReactCompiler = dinouConfig?.reactCompiler !== false;
-
   await esbuild.build(
     getConfigEsbuildProd({
       entryPoints,
       manifest,
       outdir,
       serverFiles,
+      serverAssetPaths,
+      dinouConfig,
       reactCompiler: enableReactCompiler,
     })
   );
...
     conditions: ["react-server", "node", "import", "style"],
     outdir: ".dinou/dist1/server",
+    loader: { ".css": "empty" },
...
-    plugins: [esbuildContextualDinouPlugin({ projectRoot: process.cwd() })],
+    plugins: [
+      esbuildContextualDinouPlugin({ projectRoot: process.cwd() }),
+      createServerCssModulesPlugin({ projectRoot: process.cwd() }),
+      createServerAssetPlugin({ projectRoot: process.cwd(), dinouConfig }),
+    ],
```

In `dinou/esbuild/dev.js`:

```diff
 import { generateRouteTypes } from "../core/generate-route-types.js";
+import { getDinouConfig } from "../core/load-dinou-config.js";
...
   let cssEntryPoints = {};
+  let serverAssetPaths = [];
+  let activeDinouConfig = null;
...
   async function updateEntriesAndComponents() {
+    activeDinouConfig = await getDinouConfig();
     try {
       generateRouteTypes(process.cwd());
     } catch (e) {}
     manifest = {};
     const [
       esbuildEntries,
       detectedCSSEntries,
       detectedAssetEntries,
       serverFiles,
-    ] = await getEsbuildEntries({ manifest });
+    ] = await getEsbuildEntries({ manifest, dinouConfig: activeDinouConfig });
...
-    const assetEntryPoints = [...detectedAssetEntries].reduce(
-      (acc, dAE) => ({ ...acc, [dAE.outfileName]: dAE.absPath }),
-      {}
-    );
+    serverAssetPaths = [...detectedAssetEntries].map((dAE) => dAE.absPath);
...
         getConfigEsbuild({
           entryPoints,
           manifest,
           changedIds,
           hmrEngine,
           cssRefreshRef,
           serverFiles: currentServerFiles,
+          serverAssetPaths,
+          dinouConfig: activeDinouConfig,
           hmrPort: options.hmrPort,
```

---

### 3.9. Rollup Pipeline (`dinou-asset-plugin.js`, `rollup-plugin-react-client-manifest.js`, `rollup.config.js`)

`dinou/rollup/rollup-plugins/dinou-asset-plugin.js` *(Full Replacement)*:

```js
import path from "node:path";
import {
  getAssetExtensionsInfo,
  getAssetInfo,
  resolveAssetImport,
} from "../../core/asset-extensions.js";

function dinouAssetPlugin({
  include = null,
  dinouConfig = null,
  projectRoot = process.cwd(),
  emitFiles = true,
} = {}) {
  const rootDir = path.resolve(projectRoot || process.cwd());
  let cleanRegex =
    include || getAssetExtensionsInfo(dinouConfig, rootDir).regex;
  let emittedInCurrentBuild = new Set();

  return {
    name: "dinou-asset-plugin",
    buildStart() {
      cleanRegex =
        include || getAssetExtensionsInfo(dinouConfig, rootDir).regex;
      emittedInCurrentBuild = new Set();
    },
    resolveId(source, importer) {
      if (!source || source.startsWith("\0")) return null;
      const cleanSpec = source.split("?")[0].split("#")[0];
      if (!cleanRegex.test(cleanSpec)) return null;
      const resolved = resolveAssetImport(source, {
        importer: importer || "",
        projectRoot: rootDir,
        assetRegex: cleanRegex,
      });
      return resolved || null;
    },
    async load(id) {
      if (!id || id.startsWith("\0")) return null;
      const cleanId = id.split("?")[0].split("#")[0];
      if (!cleanRegex.test(cleanId)) return null;

      this.addWatchFile(cleanId);

      const info = getAssetInfo(cleanId, rootDir, {
        includeBuffer: emitFiles,
      });

      if (emitFiles && info.buffer) {
        const sharedEmitted =
          typeof globalThis !== "undefined"
            ? globalThis.__DINOU_EMITTED_ASSETS__ ||
              (globalThis.__DINOU_EMITTED_ASSETS__ = new Set())
            : null;
        if (
          !emittedInCurrentBuild.has(info.fileName) &&
          (!sharedEmitted || !sharedEmitted.has(info.fileName))
        ) {
          emittedInCurrentBuild.add(info.fileName);
          sharedEmitted?.add(info.fileName);
          this.emitFile({
            type: "asset",
            fileName: info.fileName,
            source: info.buffer,
          });
        }
      }

      return `export default ${JSON.stringify(info.publicUrl)};`;
    },
  };
}

export { dinouAssetPlugin };
export default dinouAssetPlugin;
```

In `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js`:

```diff
-import { regex } from "../../core/asset-extensions.js";
-import createScopedName from "../../core/createScopedName.js";
+import {
+  getAssetExtensionsInfo,
+  getAssetInfo,
+  resolveAssetImport,
+} from "../../core/asset-extensions.js";
...
 function reactClientManifestPlugin({
   srcDir = path.resolve("src"),
   manifestPath = null,
-  assetInclude = regex,
+  assetInclude = null,
+  dinouConfig = null,
   serverFiles = new Set(),
 } = {}) {
+  const projectRoot = path.dirname(path.resolve(srcDir));
+  const activeAssetInclude =
+    assetInclude || getAssetExtensionsInfo(dinouConfig, projectRoot).regex;
   const manifest = {};
   const clientModules = new Set();
   const serverModules = new Set();
+  const knownServerAssets = new Set();
   let lastManifest = null;
...
       const absImportPathWithExt =
         getAbsPathWithExt(source, {
           parentURL: pathToFileURL(baseFilePath).href,
-        }) || resolveStyleImportFromCode(source, baseFilePath);
+        }) ||
+        resolveStyleImportFromCode(source, baseFilePath) ||
+        resolveAssetImport(source, {
+          importer: baseFilePath,
+          projectRoot,
+          assetRegex: activeAssetInclude,
+        });
...
-      if (assetInclude.test(absImportPathWithExt)) {
+      if (activeAssetInclude.test(absImportPathWithExt)) {
         assets.add(absImportPathWithExt);
         continue;
       }
...
-  function emitAsset(absAssetPath, pluginContext) {
-    const base = path.basename(absAssetPath, path.extname(absAssetPath));
-    const scoped = createScopedName(base, absAssetPath);
-    const ext = path.extname(absAssetPath);
-    const fileName = `assets/${scoped}${ext}`;
-    const emitted = globalThis.__DINOU_EMITTED_ASSETS__ || (globalThis.__DINOU_EMITTED_ASSETS__ = new Set());
-    if (emitted.has(fileName)) return;
-    emitted.add(fileName);
-    const source = readFileSync(absAssetPath);
-    pluginContext.emitFile({
-      type: "asset",
-      fileName,
-      source,
-    });
-  }
+  function emitAsset(absAssetPath, pluginContext) {
+    if (!existsSync(absAssetPath)) return;
+    const info = getAssetInfo(absAssetPath, projectRoot, { includeBuffer: true });
+    if (!info.buffer) return;
+    const emitted =
+      globalThis.__DINOU_EMITTED_ASSETS__ ||
+      (globalThis.__DINOU_EMITTED_ASSETS__ = new Set());
+    if (emitted.has(info.fileName)) return;
+    emitted.add(info.fileName);
+    pluginContext.emitFile({
+      type: "asset",
+      fileName: info.fileName,
+      source: info.buffer,
+    });
+  }
```

And in `buildStart` (`!isInitial`), initial server scan, and `watchChange` inside `rollup-plugin-react-client-manifest.js`:

```diff
         for (const entry of knownCssChunks.values()) {
           this.emitFile({
             type: "chunk",
             id: entry.id,
             name: entry.name,
           });
         }
+        for (const assetPath of Array.from(knownServerAssets)) {
+          if (!existsSync(assetPath)) {
+            knownServerAssets.delete(assetPath);
+            continue;
+          }
+          this.addWatchFile(assetPath);
+          emitAsset(assetPath, this);
+        }
         hasPendingCssChange = false;
...
           for (const assetPath of assets) {
             this.addWatchFile(assetPath);
+            knownServerAssets.add(assetPath);
             if (!emittedAssets.has(assetPath)) {
               emittedAssets.add(assetPath);
               emitAsset(assetPath, this);
             }
           }
...
           for (const assetPath of assets) {
             this.addWatchFile(assetPath);
+            knownServerAssets.add(assetPath);
           }
```

In `dinou/rollup/rollup.config.js`:

```diff
-import { regex } from "../core/asset-extensions.js";
+import { getAssetExtensionsInfo } from "../core/asset-extensions.js";
...
 export default async function () {
   const isDevelopment = process.env.NODE_ENV !== "production";
   const outputDirectory = isDevelopment ? ".dinou/public" : ".dinou/dist3";
   const shouldWriteToDisk = process.env.DINOU_WRITE_TO_DISK === "true" || !isDevelopment;
   const serverFiles = new Set();
   const dinouConfig = await getDinouConfig();
   const enableReactCompiler = dinouConfig?.reactCompiler !== false;
+  const { regex: activeAssetRegex } = getAssetExtensionsInfo(
+    dinouConfig,
+    process.cwd()
+  );
   try {
     generateRouteTypes(process.cwd());
   } catch (e) {}
...
       rollupContextualDinouPlugin({ projectRoot: process.cwd() }),
+      dinouAssetPlugin({
+        include: activeAssetRegex,
+        dinouConfig,
+        projectRoot: process.cwd(),
+      }),
       tsconfigPaths(),
...
-      dinouAssetPlugin({
-        include: regex,
-      }),
...
       reactClientManifest({
         manifestPath: path.join(
           isDevelopment ? ".dinou/node-dev" : ".dinou/dist1",
           "react-client-manifest.json",
         ),
+        assetInclude: activeAssetRegex,
+        dinouConfig,
         serverFiles,
       }),
...
       rollupContextualDinouPlugin({ projectRoot: process.cwd() }),
+      dinouAssetPlugin({
+        include: activeAssetRegex,
+        dinouConfig,
+        projectRoot: process.cwd(),
+        emitFiles: false,
+      }),
       resolve({
```

---

### 3.10. Webpack Pipeline (`get-webpack-entries.js`, `webpack.config.js`)

In `dinou/webpack/helpers/get-webpack-entries.js`:

```diff
-import { regex as assetRegex } from "../../core/asset-extensions.js";
+import {
+  getAssetExtensionsInfo,
+  resolveAssetImport,
+} from "../../core/asset-extensions.js";
...
 async function getCSSEntries({
   srcDir = path.resolve("src"),
-  assetInclude = assetRegex,
+  assetInclude = null,
+  dinouConfig = null,
   manifest = {},
 } = {}) {
+  const projectRoot = path.dirname(path.resolve(srcDir));
+  const activeAssetInclude =
+    assetInclude || getAssetExtensionsInfo(dinouConfig, projectRoot).regex;
   const clientEntryMap = new Map();
   const cssEntryMap = new Map();
+  const assetEntryMap = new Map();
...
       const absImportPathWithExt =
         getAbsPathWithExt(source, {
           parentURL: pathToFileURL(baseFilePath).href,
-        }) || resolveStyleImportFromCode(source, baseFilePath);
+        }) ||
+        resolveStyleImportFromCode(source, baseFilePath) ||
+        resolveAssetImport(source, {
+          importer: baseFilePath,
+          projectRoot,
+          assetRegex: activeAssetInclude,
+        });
...
-      if (assetInclude.test(absImportPathWithExt)) {
+      if (activeAssetInclude.test(absImportPathWithExt)) {
         assets.add(absImportPathWithExt);
         continue;
       }
...
       try {
-        const { csss } = await getImportsAndAssetsAndCsss(code, absPath);
+        const { assets, csss } = await getImportsAndAssetsAndCsss(code, absPath);

         for (const cssPath of csss) {
           const normCss = normalizePath(cssPath);
           cssEntryMap.set(normCss.toLowerCase(), {
             absPath: normCss,
             name: path.basename(cssPath, path.extname(cssPath)),
           });
         }
+
+        for (const assetPath of assets) {
+          const normAsset = normalizePath(assetPath);
+          assetEntryMap.set(normAsset.toLowerCase(), {
+            absPath: normAsset,
+            name: path.basename(assetPath, path.extname(assetPath)),
+          });
+        }
       } catch (err) {}
...
   const detectedClientEntries = new Set(clientEntryMap.values());
   const detectedCSSEntries = new Set(cssEntryMap.values());
+  const detectedAssetEntries = new Set(assetEntryMap.values());
...
-  return [detectedCSSEntries, detectedClientEntries, serverFiles];
+  return [
+    detectedCSSEntries,
+    detectedClientEntries,
+    serverFiles,
+    detectedAssetEntries,
+  ];
```

In `dinou/webpack/webpack.config.js`:

```diff
-import { regex } from "../core/asset-extensions.js";
+import {
+  getAssetExtensionsInfo,
+  getAssetFileName,
+  resolveAssetImport,
+} from "../core/asset-extensions.js";
...
 export default async () => {
+  const dinouConfig = await getDinouConfig();
+  const enableReactCompiler = dinouConfig?.reactCompiler !== false;
+  const { regex: activeAssetRegex } = getAssetExtensionsInfo(
+    dinouConfig,
+    process.cwd()
+  );
   try {
     generateRouteTypes(process.cwd());
   } catch (e) {}
...
-  const [cssEntries, , serverFiles] = await getCSSEntries();
-  const dinouConfig = await getDinouConfig();
-  const enableReactCompiler = dinouConfig?.reactCompiler !== false;
+  const [cssEntries, , serverFiles, serverAssetEntries] = await getCSSEntries({
+    assetInclude: activeAssetRegex,
+    dinouConfig,
+  });
...
         {
-          test: regex,
+          test: activeAssetRegex,
           type: "asset/resource",
           generator: {
             filename: (pathData) => {
               const resourcePath =
-                pathData.module.resourceResolveData?.path ||
-                pathData.module.resource;
-
-              const base = path.basename(
-                resourcePath,
-                path.extname(resourcePath),
-              );
-              const scoped = createScopedName(base, resourcePath);
-
-              return `/assets/${scoped}[ext]`;
+                pathData.module?.resourceResolveData?.path ||
+                pathData.module?.resource ||
+                pathData.filename;
+              return getAssetFileName(resourcePath, process.cwd());
             },
-            publicPath: "",
+            publicPath: "/",
           },
         },
       ],
     },
     plugins: [
       webpackContextualDinouPlugin({ projectRoot: process.cwd() }),
+      {
+        apply(compiler) {
+          compiler.hooks.normalModuleFactory.tap(
+            "DinouWebpackAssetAliasPlugin",
+            (nmf) => {
+              nmf.hooks.beforeResolve.tap(
+                "DinouWebpackAssetAliasPlugin",
+                (resolveData) => {
+                  if (!resolveData || !resolveData.request) return;
+                  const cleanReq = resolveData.request
+                    .split("?")[0]
+                    .split("#")[0];
+                  if (!activeAssetRegex.test(cleanReq)) return;
+                  const importer = resolveData.contextInfo?.issuer || "";
+                  const resolved = resolveAssetImport(resolveData.request, {
+                    importer,
+                    resolveDir: resolveData.context || process.cwd(),
+                    projectRoot: process.cwd(),
+                    assetRegex: activeAssetRegex,
+                  });
+                  if (resolved) {
+                    resolveData.request = resolved;
+                  }
+                }
+              );
+            }
+          );
+        },
+      },
```

And in `DinouCssAssetsAndMinifyPlugin` + `serverConfig` inside `dinou/webpack/webpack.config.js`:

```diff
                 for (const [
                   assetFileName,
                   absAssetPath,
                 ] of getRegisteredCssUrlAssets().entries()) {
-                  if (
-                    !compilation.getAsset(assetFileName) &&
-                    !compilation.getAsset("/" + assetFileName) &&
-                    fs.existsSync(absAssetPath)
-                  ) {
-                    try {
-                      const buf = fs.readFileSync(absAssetPath);
-                      compilation.emitAsset(
-                        assetFileName,
-                        new webpack.sources.RawSource(buf)
-                      );
-                    } catch (e) {}
+                  if (fs.existsSync(absAssetPath)) {
+                    compilation.fileDependencies.add(absAssetPath);
+                    if (
+                      !compilation.getAsset(assetFileName) &&
+                      !compilation.getAsset("/" + assetFileName)
+                    ) {
+                      try {
+                        const buf = fs.readFileSync(absAssetPath);
+                        compilation.emitAsset(
+                          assetFileName,
+                          new webpack.sources.RawSource(buf)
+                        );
+                      } catch (e) {}
+                    }
                   }
                 }
+
+                if (serverAssetEntries && serverAssetEntries.size > 0) {
+                  for (const assetEntry of serverAssetEntries) {
+                    const absAssetPath = assetEntry.absPath;
+                    if (!absAssetPath || !fs.existsSync(absAssetPath)) continue;
+                    compilation.fileDependencies.add(absAssetPath);
+                    const assetFileName = getAssetFileName(
+                      absAssetPath,
+                      process.cwd()
+                    );
+                    if (
+                      !compilation.getAsset(assetFileName) &&
+                      !compilation.getAsset("/" + assetFileName)
+                    ) {
+                      try {
+                        const buf = fs.readFileSync(absAssetPath);
+                        compilation.emitAsset(
+                          assetFileName,
+                          new webpack.sources.RawSource(buf)
+                        );
+                      } catch (e) {}
+                    }
+                  }
+                }
```

```diff
     resolve: {
       conditionNames: ["react-server", "node", "import", "require"],
       extensions: [".js", ".jsx", ".ts", ".tsx"],
       alias: {
         ...(isEjected ? { dinou: localDinouPath } : {}),
       },
+      plugins: configFile
+        ? [
+            new TsconfigPathsPlugin({
+              configFile,
+              extensions: [".js", ".jsx", ".ts", ".tsx", ".css"],
+            }),
+          ]
+        : [],
     },
...
     module: {
       exprContextCritical: false,
+      rules: [
+        {
+          test: activeAssetRegex,
+          type: "asset/resource",
+          generator: {
+            emit: false,
+            filename: (pathData) => {
+              const resourcePath =
+                pathData.module?.resourceResolveData?.path ||
+                pathData.module?.resource ||
+                pathData.filename;
+              return getAssetFileName(resourcePath, process.cwd());
+            },
+            publicPath: "/",
+          },
+        },
+      ],
     },
```

---

### 3.11. Runtime Compilers & Dev Server (`node/bundle-dual-engine.js`, `node/build.js`, `cloudflare/build.js`, `bun/build.js`, `deno/build.js`, `node/dev.js`)

In `dinou/node/bundle-dual-engine.js`:
- Import `createServerAssetPlugin` from `../core/asset-extensions.js` (replacing `createScopedName` and `assetRegex`).
- Pass `projectRoot` to `await getDinouConfig(projectRoot)`.
- Replace inline `serverAssetPlugin` with `const serverAssetPlugin = createServerAssetPlugin({ projectRoot, dinouConfig });` and include `serverAssetPlugin` in the returned object.

In `dinou/node/build.js`:
- Import `parseHttpByteRange` from `${dinouDirSlash}/core/static-assets.js` inside `nodeEntryContent`, returning `206 Partial Content` (streaming `fs.createReadStream(filePath, { start: range.start, end: range.end })`), `416 Range Not Satisfiable`, and `"accept-ranges": "bytes"` on `200`/`206`/`416`.
- Pass `plugins: [serverAssetPlugin].filter(Boolean)` in Pass C `esbuild.build`.

In `dinou/cloudflare/build.js`, `dinou/bun/build.js`, and `dinou/deno/build.js`:
- Import `createServerAssetPlugin` from `../core/asset-extensions.js`.
- Remove all 11 `".svg": "dataurl"` .. `".eot": "dataurl"` entries from `commonLoader`.
- Instantiate `const serverAssetPlugin = createServerAssetPlugin({ projectRoot, dinouConfig });` and pass `serverAssetPlugin` into Pass A (`rscOutfile`), Pass B (`ssrOutfile`), and Pass C (`finalOutfile`) `plugins`.
- In `bun/build.js` (`bunEntryContent`) and `deno/build.js` (`denoEntryContent`), import `parseHttpByteRange` and serve `206 Partial Content`, `416 Range Not Satisfiable`, and `"accept-ranges": "bytes"`.

In `dinou/node/dev.js`:
- Import `createServerAssetPlugin` & `getAssetExtensionsInfo` from `../core/asset-extensions.js` and `parseHttpByteRange` from `../core/static-assets.js`.
- Replace inline `serverAssetPlugin` with `createServerAssetPlugin({ projectRoot, dinouConfig, emitToDevMemory: true })`.
- In `doRebuildBatch`: compute `const isAssetFile = getAssetExtensionsInfo(dinouConfig, projectRoot).regex.test(absFilePath);`, skip UTF-8 directive parsing when `isAssetFile || isCssFile`, include `isAssetFile` in `isClientRelevant`, `hasClientChanges`, and `hasServerChanges`, and call `clientBundlerHandle?.refreshStyles()` when an asset changes.
- In HTTP static delivery: support `parseHttpByteRange` (`206`, `416`, `accept-ranges: bytes`) for both `memBuf` and disk files (streaming non-code files via `fs.createReadStream`).

#### Exact Diffs for `dinou/node/bundle-dual-engine.js`

```diff
-import createScopedName from "../core/createScopedName.js";
-import { regex as assetRegex } from "../core/asset-extensions.js";
+import { createServerAssetPlugin } from "../core/asset-extensions.js";
 import { createServerCssModulesPlugin } from "../core/server-css-modules-plugin.js";
...
-  const dinouConfig = await getDinouConfig();
+  const dinouConfig = await getDinouConfig(projectRoot);
...
-  const serverAssetPlugin = {
-    name: "dinou-server-asset-plugin",
-    setup(build) {
-      build.onResolve({ filter: assetRegex }, (args) => {
-        let resolvedPath;
-        if (args.path.startsWith("@/")) {
-          resolvedPath = path.resolve(projectRoot, "src", args.path.slice(2));
-        } else if (path.isAbsolute(args.path)) {
-          resolvedPath = args.path;
-        } else {
-          resolvedPath = path.resolve(args.resolveDir, args.path);
-        }
-        return { path: resolvedPath, namespace: "dinou-server-asset" };
-      });
-
-      build.onLoad({ filter: /.*/, namespace: "dinou-server-asset" }, (args) => {
-        const ext = path.extname(args.path);
-        const base = path.basename(args.path, ext);
-        const scoped = createScopedName(base, args.path);
-        const assetUrl = `/assets/${scoped}${ext}`;
-
-        return {
-          contents: `export default ${JSON.stringify(assetUrl)};`,
-          loader: "js",
-        };
-      });
-    },
-  };
+  const serverAssetPlugin = createServerAssetPlugin({
+    projectRoot,
+    dinouConfig,
+  });
...
     commonAlias,
     commonLoader,
+    serverAssetPlugin,
     isWebpackBuild,
     setupFiles,
```

#### Exact Diffs for `dinou/node/build.js`

```diff
-  const { dinouDirSlash, externalList, banner, commonAlias, commonLoader, isWebpackBuild, setupFiles } = engineResult;
+  const {
+    dinouDirSlash,
+    externalList,
+    banner,
+    commonAlias,
+    commonLoader,
+    serverAssetPlugin,
+    isWebpackBuild,
+    setupFiles,
+  } = engineResult;
...
 import {
   getStaticContentType,
   getStaticCacheControl,
   normalizePublicRequestPath,
+  parseHttpByteRange,
   resolveConfinedStaticFile,
 } from "${dinouDirSlash}/core/static-assets.js";
...
           if (stat.isFile()) {
+            const contentType = getStaticContentType(cleanPath);
+            const cacheControl = getStaticCacheControl(cleanPath);
+            const rangeHeader = req.method === "GET" ? req.headers.get("range") : null;
+            const range = rangeHeader ? parseHttpByteRange(rangeHeader, stat.size) : null;
+
+            if (range && range.unsatisfiable) {
+              return new Response(null, {
+                status: 416,
+                headers: {
+                  "content-range": range.contentRange,
+                  "accept-ranges": "bytes",
+                },
+              });
+            }
+
+            if (range) {
+              const stream = fs.createReadStream(filePath, {
+                start: range.start,
+                end: range.end,
+              });
+              return new Response(Readable.toWeb(stream), {
+                status: 206,
+                headers: {
+                  "content-type": contentType,
+                  "content-length": String(range.length),
+                  "content-range": range.contentRange,
+                  "accept-ranges": "bytes",
+                  "cache-control": cacheControl,
+                },
+              });
+            }
+
             const body =
               req.method === "HEAD"
                 ? null
                 : Readable.toWeb(fs.createReadStream(filePath));
             return new Response(body, {
               headers: {
-                "content-type": getStaticContentType(cleanPath),
+                "content-type": contentType,
                 "content-length": String(stat.size),
-                "cache-control": getStaticCacheControl(cleanPath),
+                "accept-ranges": "bytes",
+                "cache-control": cacheControl,
               },
             });
           }
...
     banner,
     inject: setupFiles,
+    plugins: [serverAssetPlugin].filter(Boolean),
     alias: commonAlias,
```

#### Exact Diffs for `dinou/cloudflare/build.js`

```diff
 import { createServerCssModulesPlugin } from "../core/server-css-modules-plugin.js";
+import { createServerAssetPlugin } from "../core/asset-extensions.js";
...
 const commonLoader = {
   ".js": "jsx",
   ".jsx": "jsx",
   ".ts": "ts",
   ".tsx": "tsx",
   ".json": "json",
   ".css": "empty",
-  ".svg": "dataurl",
-  ".png": "dataurl",
-  ".jpg": "dataurl",
-  ".jpeg": "dataurl",
-  ".webp": "dataurl",
-  ".ico": "dataurl",
-  ".woff": "dataurl",
-  ".woff2": "dataurl",
-  ".ttf": "dataurl",
-  ".otf": "dataurl",
-  ".eot": "dataurl",
 };
...
 const serverCssModulesPlugin = createServerCssModulesPlugin({ projectRoot });
+const serverAssetPlugin = createServerAssetPlugin({ projectRoot, dinouConfig });
...
-    plugins: [esbuildContextualDinouPlugin({ projectRoot }), clientReferencesPlugin, serverReferencesPlugin, serverCssModulesPlugin],
+    plugins: [esbuildContextualDinouPlugin({ projectRoot }), clientReferencesPlugin, serverReferencesPlugin, serverCssModulesPlugin, serverAssetPlugin],
...
-    plugins: [esbuildContextualDinouPlugin({ projectRoot }), serverReferencesPluginSsr, serverCssModulesPlugin],
+    plugins: [esbuildContextualDinouPlugin({ projectRoot }), serverReferencesPluginSsr, serverCssModulesPlugin, serverAssetPlugin],
...
     banner,
+    plugins: [serverAssetPlugin],
     inject: setupFiles.length > 0 ? setupFiles : undefined,
```

#### Exact Diffs for `dinou/bun/build.js` & `dinou/deno/build.js`

In both `dinou/bun/build.js` and `dinou/deno/build.js`:
- Import `createServerAssetPlugin` from `../core/asset-extensions.js`.
- Import `parseHttpByteRange` in `bunEntryContent` / `denoEntryContent` and serve `206 Partial Content` (`file.slice(range.start, range.end + 1)` in Bun; `full.subarray(range.start, range.end + 1)` in Deno), `416 Range Not Satisfiable`, and `"accept-ranges": "bytes"`.
- Remove the 11 `"dataurl"` asset entries from `commonLoader`.
- Instantiate `const serverAssetPlugin = createServerAssetPlugin({ projectRoot, dinouConfig });` and add `serverAssetPlugin` to Pass A, Pass B, and Pass C `plugins`.

#### Exact Diffs for `dinou/node/dev.js`

```diff
 import {
   getStaticContentType,
   normalizePublicRequestPath,
+  parseHttpByteRange,
   resolveConfinedStaticFile,
 } from "../core/static-assets.js";
...
-import createScopedName from "../core/createScopedName.js";
-import { regex as assetRegex } from "../core/asset-extensions.js";
+import {
+  createServerAssetPlugin,
+  getAssetExtensionsInfo,
+} from "../core/asset-extensions.js";
...
-const serverAssetPlugin = { ... };
+const serverAssetPlugin = createServerAssetPlugin({
+  projectRoot,
+  dinouConfig,
+  emitToDevMemory: true,
+});
...
       const normLower = absFilePath.toLowerCase();
+      const activeAssetRegex = getAssetExtensionsInfo(dinouConfig, projectRoot).regex;
+      const isAssetFile = activeAssetRegex.test(absFilePath);
       const isCssFile = normLower.endsWith(".css") || normLower.endsWith(".scss") || normLower.endsWith(".less");
...
-      if (fs.existsSync(absFilePath)) {
+      if (!isAssetFile && !isCssFile && fs.existsSync(absFilePath)) {
...
       const isClientRelevant =
         isClientFile ||
         wasClientFile ||
         clientDirectiveChanged ||
         isCssFile ||
+        isAssetFile ||
         (isJsTsSource && !isPageRoute);
...
+      if (isAssetFile && clientBundlerHandle?.refreshStyles) {
+        clientRebuildPromises.push(clientBundlerHandle.refreshStyles());
+      }

-      if (isClientFile || cssModuleClassesChanged) {
+      if (isClientFile || cssModuleClassesChanged || isAssetFile) {
         hasClientChanges = true;
       }
-      if (isServerFile || cssModuleClassesChanged || (!isClientFile && !isCssFile)) {
+      if (isServerFile || cssModuleClassesChanged || isAssetFile || (!isClientFile && !isCssFile)) {
         hasServerChanges = true;
       }
```

And in `dinou/node/dev.js` HTTP static delivery (`memBuf` and `foundFilePath`): handle `parseHttpByteRange(String(rangeHeader), size)` returning `416` on unsatisfiable ranges, `206` with `content-range` + `accept-ranges: bytes` on valid ranges, and streaming non-code disk files via `fs.createReadStream(foundFilePath, range ? { start: range.start, end: range.end } : undefined)`.

---

## 4. `CHANGELOG.md` Entry (`9.4.0`)

```markdown
### Added
- **Custom `assetExtensions` in `dinou.config.*` with Auto-Generated TypeScript Declarations**: Added `assetExtensions?: string[]` to `DinouConfig` (e.g. `defineConfig({ assetExtensions: ["glb", "gltf", "hdr", "wasm"] })`), enabling custom binary/3D/media asset imports across Esbuild, Rollup, Webpack, and all 4 runtimes without ejecting, while `dinou typegen` automatically emits ambient `declare module "*.<ext>"` declarations in `.dinou/types/routes.d.ts`.
- **RFC 9110 HTTP Byte-Range (`206 Partial Content`) Media Streaming**: Added `parseHttpByteRange` and `Accept-Ranges: bytes` / `206 Partial Content` / `416 Range Not Satisfiable` support across `dinou dev` and standalone Node.js, Bun, and Deno servers for native `<video>` and `<audio>` timeline scrubbing and Safari playback, alongside built-in MIME types for `.avi`, `.mkv`, `.mjpeg`, `.mjpg`, `.opus`, `.glb`, `.gltf`, and `.hdr`.

### Fixed
- **Content + Path Asset Fingerprinting (`/assets/[name]-[hash].[ext]`)**: Replaced path-only `createScopedName` asset naming with an OS-independent SHA-256 digest of `relPosixPath + "\0" + fileBytes`, preventing stale 1-year `immutable` browser/CDN caches when media files are updated at the same path while preserving zero-collision folder scoping and deduplicating CSS `url(...)` and JS/TS imports.
- **Full Bundler & Runtime Asset Parity (Esbuild, Rollup, Webpack × Node, Bun, Deno, Cloudflare)**: Fixed `swcRedirectPlugin` crashing `dinou dev:esbuild` on relative asset imports inside `"use client"` components; fixed Webpack production builds and Rollup incremental watch rebuilds dropping assets imported exclusively in Server Components; replaced `dataurl` asset loaders in Cloudflare Workers, Bun, and Deno builds with `createServerAssetPlugin` (eliminating SSR hydration mismatches, Base64 Worker bloat, and `No loader is configured` crashes on `.mp4`/`.avif`/`.gif`/`.webm`/audio files); unified custom `tsconfig.json`/`jsconfig.json` path aliases and `node_modules` asset resolution; and wired live asset rebuilds in `dinou dev`.
```

---

## 5. Complete, Unabbreviated Automated Test Suites

### 5.1. Unit & Multi-Bundler / Multi-Runtime Integration Test Suite (`tests/unit/assets-pipeline.test.mjs`)

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
  const dinouPkgRoot = fs.existsSync(path.join(repoRoot, "dinou", "index.js"))
    ? path.join(repoRoot, "dinou")
    : fs.existsSync(path.join(repoRoot, "index.js"))
      ? repoRoot
      : path.join(repoRoot, "node_modules", "dinou", "dinou");
  const dinouRootUrl = pathToFileURL(dinouPkgRoot).href;

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
    JSON.stringify(
      { name: "dinou-assets-fixture", version: "1.0.0", type: "module" },
      null,
      2
    ),
    "utf8"
  );
  return { fixturesBase, tmpApp };
}

test("1. Path + content fingerprinting prevents folder collisions and busts immutable cache on edits", async () => {
  const { getAssetInfo } = await importDinou("core/asset-extensions.js");
  const { fixturesBase, tmpApp } = createFixtureApp("assets-hash-");

  try {
    const dirA = path.join(tmpApp, "src", "header");
    const dirB = path.join(tmpApp, "src", "footer");
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });

    const fileA = path.join(dirA, "logo.png");
    const fileB = path.join(dirB, "logo.png");
    const specialFile = path.join(dirA, "Hero Banner (2x).PNG");

    const bytesV1 = Buffer.from("PNG_V1_PAYLOAD_BYTES");
    fs.writeFileSync(fileA, bytesV1);
    fs.writeFileSync(fileB, bytesV1);
    fs.writeFileSync(specialFile, bytesV1);

    const infoA1 = getAssetInfo(fileA, tmpApp);
    const infoB1 = getAssetInfo(fileB, tmpApp);
    const infoSpecial = getAssetInfo(specialFile, tmpApp);

    assert.match(infoA1.publicUrl, /^\/assets\/logo-[a-f0-9]{8}\.png$/);
    assert.match(infoB1.publicUrl, /^\/assets\/logo-[a-f0-9]{8}\.png$/);
    assert.notEqual(
      infoA1.publicUrl,
      infoB1.publicUrl,
      "Same-named files with identical bytes in different folders must not collide"
    );
    assert.match(
      infoSpecial.publicUrl,
      /^\/assets\/Hero-Banner-2x-[a-f0-9]{8}\.png$/,
      "Special characters and uppercase extensions must normalize cleanly"
    );

    const bytesV2 = Buffer.from("PNG_V2_UPDATED_DESIGN_PAYLOAD_BYTES");
    fs.writeFileSync(fileA, bytesV2);
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(fileA, future, future);

    const infoA2 = getAssetInfo(fileA, tmpApp);
    assert.notEqual(
      infoA2.publicUrl,
      infoA1.publicUrl,
      "Updating file bytes at the same path must produce a new immutable content hash"
    );
  } finally {
    fs.rmSync(tmpApp, { recursive: true, force: true });
    if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
      fs.rmSync(fixturesBase, { recursive: true, force: true });
    }
  }
});

test("2. dinou.config.ts assetExtensions merges custom formats and emits TypeScript declarations in routes.d.ts", async () => {
  const { getAssetExtensionsInfo } = await importDinou("core/asset-extensions.js");
  const { generateRouteTypes } = await importDinou("core/generate-route-types.js");
  const { fixturesBase, tmpApp } = createFixtureApp("assets-custom-cfg-");

  try {
    fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      "export default function Page() { return <div>Home</div>; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "dinou.config.ts"),
      `import { defineConfig } from "dinou";\nexport default defineConfig({\n  assetExtensions: ["glb", ".gltf", "HDR", "png"],\n});\n`,
      "utf8"
    );

    const info = getAssetExtensionsInfo(null, tmpApp);
    assert.deepEqual(info.customExtensions, ["glb", "gltf", "hdr"]);
    assert.equal(info.regex.test("scene.glb"), true);
    assert.equal(info.regex.test("model.gltf"), true);
    assert.equal(info.regex.test("skybox.hdr"), true);

    generateRouteTypes(tmpApp);
    const routesDts = fs.readFileSync(
      path.join(tmpApp, ".dinou", "types", "routes.d.ts"),
      "utf8"
    );
    assert.match(routesDts, /declare module "\*\.glb"/);
    assert.match(routesDts, /declare module "\*\.gltf"/);
    assert.match(routesDts, /declare module "\*\.hdr"/);
    assert.equal(
      routesDts.includes('declare module "*.png"'),
      false,
      "Built-in extensions from dinou/assets.d.ts must not be re-declared in routes.d.ts"
    );
  } finally {
    fs.rmSync(tmpApp, { recursive: true, force: true });
    if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
      fs.rmSync(fixturesBase, { recursive: true, force: true });
    }
  }
});

test("3. MIME types and RFC 9110 HTTP Byte-Range parsing cover all media & 3D formats", async () => {
  const {
    getStaticContentType,
    isPublicStaticAssetRequest,
    parseHttpByteRange,
  } = await importDinou("core/static-assets.js");

  assert.equal(getStaticContentType("/assets/clip-12345678.avi"), "video/x-msvideo");
  assert.equal(getStaticContentType("/assets/clip-12345678.mkv"), "video/x-matroska");
  assert.equal(getStaticContentType("/assets/cam-12345678.mjpeg"), "video/x-motion-jpeg");
  assert.equal(getStaticContentType("/assets/cam-12345678.mjpg"), "video/x-motion-jpeg");
  assert.equal(getStaticContentType("/assets/voice-12345678.opus"), "audio/opus");
  assert.equal(getStaticContentType("/assets/scene-12345678.glb"), "model/gltf-binary");
  assert.equal(getStaticContentType("/assets/scene-12345678.gltf"), "model/gltf+json");
  assert.equal(getStaticContentType("/assets/env-12345678.hdr"), "image/vnd.radiance");

  assert.equal(isPublicStaticAssetRequest("/assets/custom-12345678.xyz"), true);
  assert.equal(isPublicStaticAssetRequest("/demo.mkv"), true);
  assert.equal(isPublicStaticAssetRequest("/scene.glb"), true);

  assert.deepEqual(parseHttpByteRange("bytes=0-1", 100), {
    unsatisfiable: false,
    start: 0,
    end: 1,
    length: 2,
    contentRange: "bytes 0-1/100",
  });
  assert.deepEqual(parseHttpByteRange("bytes=40-", 100), {
    unsatisfiable: false,
    start: 40,
    end: 99,
    length: 60,
    contentRange: "bytes 40-99/100",
  });
  assert.deepEqual(parseHttpByteRange("bytes=-15", 100), {
    unsatisfiable: false,
    start: 85,
    end: 99,
    length: 15,
    contentRange: "bytes 85-99/100",
  });
  assert.deepEqual(parseHttpByteRange("bytes=500-600", 100), {
    unsatisfiable: true,
    contentRange: "bytes */100",
  });
});

test("4. Esbuild dev mode resolves relative & aliased assets in 'use client' SWC mirror and live-updates hash on edit", async () => {
  const { startEsbuildDev } = await importDinou("esbuild/dev.js");
  const { getAssetInfo } = await importDinou("core/asset-extensions.js");
  const { fixturesBase, tmpApp } = createFixtureApp("assets-esbuild-dev-");
  const prevCwd = process.cwd();
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDinouDev = process.env.DINOU_DEV;

  let handle = null;
  try {
    fs.mkdirSync(path.join(tmpApp, "src", "components"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "custom-media"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
            "@media/*": ["./custom-media/*"],
          },
        },
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "dinou.config.mjs"),
      `export default { assetExtensions: ["glb"] };\n`,
      "utf8"
    );

    const relBadgePath = path.join(tmpApp, "src", "components", "badge.webp");
    const glbPath = path.join(tmpApp, "custom-media", "cube.glb");
    const serverAvifPath = path.join(tmpApp, "src", "hero.avif");

    fs.writeFileSync(relBadgePath, Buffer.from("WEBP_V1_DATA"));
    fs.writeFileSync(glbPath, Buffer.from("GLB_BINARY_DATA"));
    fs.writeFileSync(serverAvifPath, Buffer.from("AVIF_SERVER_DATA"));

    fs.writeFileSync(
      path.join(tmpApp, "src", "components", "viewer.tsx"),
      `"use client";
import badgeUrl from "./badge.webp";
import modelUrl from "@media/cube.glb";
export default function Viewer() {
  return <div data-badge={badgeUrl} data-model={modelUrl} />;
}
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import heroUrl from "./hero.avif";
import Viewer from "./components/viewer";
export default function Page() {
  return <main data-hero={heroUrl}><Viewer /></main>;
}
`,
      "utf8"
    );

    process.chdir(tmpApp);
    process.env.NODE_ENV = "development";
    delete globalThis.__DINOU_CONFIG__;
    delete globalThis.__DINOU_CONFIG_CWD__;

    const v1Info = getAssetInfo(relBadgePath, tmpApp);
    const glbInfo = getAssetInfo(glbPath, tmpApp);
    const avifInfo = getAssetInfo(serverAvifPath, tmpApp);

    handle = await startEsbuildDev({ hmrPort: 0 });
    const mem = globalThis.__DINOU_MEM_FILES__;
    assert.ok(mem, "__DINOU_MEM_FILES__ should be populated");
    assert.deepEqual(mem.get(v1Info.fileName), Buffer.from("WEBP_V1_DATA"));
    assert.deepEqual(mem.get(glbInfo.fileName), Buffer.from("GLB_BINARY_DATA"));
    assert.deepEqual(mem.get(avifInfo.fileName), Buffer.from("AVIF_SERVER_DATA"));

    fs.writeFileSync(relBadgePath, Buffer.from("WEBP_V2_UPDATED_CONTENT"));
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(relBadgePath, future, future);

    const v2Info = getAssetInfo(relBadgePath, tmpApp);
    assert.notEqual(v2Info.fileName, v1Info.fileName);

    await handle.notifyFileChanged(relBadgePath);
    assert.equal(mem.has(v1Info.fileName), false, "Stale asset hash should be purged from dev memory");
    assert.deepEqual(mem.get(v2Info.fileName), Buffer.from("WEBP_V2_UPDATED_CONTENT"));
  } finally {
    if (handle?.close) {
      await handle.close();
    }
    delete globalThis.__DINOU_CONFIG__;
    delete globalThis.__DINOU_CONFIG_CWD__;
    process.chdir(prevCwd);
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevDinouDev === undefined) delete process.env.DINOU_DEV;
    else process.env.DINOU_DEV = prevDinouDev;
    fs.rmSync(tmpApp, { recursive: true, force: true });
    if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
      fs.rmSync(fixturesBase, { recursive: true, force: true });
    }
  }
});

test("5. Full production parity across Esbuild, Rollup, Webpack + Cloudflare/Bun/Deno builds + HTTP 206 Range serving", async () => {
  const { getAssetInfo } = await importDinou("core/asset-extensions.js");
  const { fixturesBase, tmpApp } = createFixtureApp("assets-prod-parity-");

  try {
    fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "custom-media"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
            "@media/*": ["./custom-media/*"],
          },
        },
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "dinou.config.ts"),
      `import { defineConfig } from "dinou";\nexport default defineConfig({ assetExtensions: ["glb"] });\n`,
      "utf8"
    );

    const serverHeroPath = path.join(tmpApp, "src", "server-hero.avif");
    const clientIconPath = path.join(tmpApp, "src", "client-icon.png");
    const sharedVideoPath = path.join(tmpApp, "src", "shared-clip.mp4");
    const customGlbPath = path.join(tmpApp, "custom-media", "robot.glb");
    const cssFontPath = path.join(tmpApp, "src", "inter.woff2");

    fs.writeFileSync(serverHeroPath, Buffer.from("AVIF_ONLY_SERVER_BYTES"));
    fs.writeFileSync(clientIconPath, Buffer.from("PNG_CLIENT_ICON_BYTES"));
    fs.writeFileSync(sharedVideoPath, Buffer.from("0123456789ABCDEF_MP4_STREAM"));
    fs.writeFileSync(customGlbPath, Buffer.from("GLTF_BINARY_3D_MODEL"));
    fs.writeFileSync(cssFontPath, Buffer.from("WOFF2_FONT_BINARY"));

    fs.writeFileSync(
      path.join(tmpApp, "src", "styles.css"),
      `@font-face { font-family: "InterTest"; src: url("./inter.woff2") format("woff2"); }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "player.tsx"),
      `"use client";
import iconUrl from "./client-icon.png";
import videoUrl from "./shared-clip.mp4";
import modelUrl from "@media/robot.glb";
export default function Player() {
  return (
    <div id="client-player" data-icon={iconUrl} data-video={videoUrl} data-model={modelUrl}>
      <img src={iconUrl} alt="icon" />
      <video src={videoUrl} />
    </div>
  );
}
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import "./styles.css";
import serverHeroUrl from "./server-hero.avif";
import videoUrl from "./shared-clip.mp4";
import modelUrl from "@media/robot.glb";
import Player from "./player";
export default function Page() {
  return (
    <html>
      <head>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <section id="rsc-media" data-hero={serverHeroUrl} data-video={videoUrl} data-model={modelUrl}>
          <img src={serverHeroUrl} alt="hero" />
        </section>
        <Player />
      </body>
    </html>
  );
}
`,
      "utf8"
    );

    const expected = {
      hero: getAssetInfo(serverHeroPath, tmpApp),
      icon: getAssetInfo(clientIconPath, tmpApp),
      video: getAssetInfo(sharedVideoPath, tmpApp),
      glb: getAssetInfo(customGlbPath, tmpApp),
      font: getAssetInfo(cssFontPath, tmpApp),
    };

    for (const cmd of ["build:node:esbuild", "build:node:rollup", "build:node:webpack"]) {
      const res = spawnSync(process.execPath, [cliPath, cmd], {
        cwd: tmpApp,
        encoding: "utf8",
      });
      assert.equal(
        res.status,
        0,
        `${cmd} failed:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
      );

      for (const [key, item] of Object.entries(expected)) {
        const diskPath = path.join(tmpApp, ".dinou", "dist3", item.fileName);
        assert.equal(
          fs.existsSync(diskPath),
          true,
          `[${cmd}] Missing ${key} at ${item.fileName}`
        );
      }

      const ssgHtml = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist2", "index.html"),
        "utf8"
      );
      assert.equal(ssgHtml.includes(expected.hero.publicUrl), true, `[${cmd}] SSG HTML missing RSC hero URL`);
      assert.equal(ssgHtml.includes(expected.icon.publicUrl), true, `[${cmd}] SSG HTML missing SSR client icon URL`);
      assert.equal(ssgHtml.includes(expected.video.publicUrl), true, `[${cmd}] SSG HTML missing shared video URL`);
      assert.equal(ssgHtml.includes(expected.glb.publicUrl), true, `[${cmd}] SSG HTML missing custom .glb URL`);
      assert.equal(ssgHtml.includes("data:image/"), false, `[${cmd}] SSG HTML must never inline data: URLs`);

      const cssOut = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist3", "styles.css"),
        "utf8"
      );
      assert.equal(cssOut.includes(expected.font.publicUrl), true, `[${cmd}] styles.css missing hashed font URL`);
    }

    const prevCwd = process.cwd();
    process.chdir(tmpApp);
    try {
      const serverMod = await import(
        pathToFileURL(path.join(tmpApp, ".dinou", "node", "server.mjs")).href + `?t=${Date.now()}`
      );
      const partialRes = await serverMod.fetch(
        new Request(`http://localhost${expected.video.publicUrl}`, {
          headers: { Range: "bytes=4-9" },
        })
      );
      assert.equal(partialRes.status, 206);
      assert.equal(partialRes.headers.get("accept-ranges"), "bytes");
      assert.equal(partialRes.headers.get("content-range"), "bytes 4-9/27");
      assert.equal(partialRes.headers.get("content-length"), "6");
      assert.equal(partialRes.headers.get("content-type"), "video/mp4");
      assert.equal(
        partialRes.headers.get("cache-control"),
        "public, max-age=31536000, immutable"
      );
      assert.equal(await partialRes.text(), "456789");

      const invalidRangeRes = await serverMod.fetch(
        new Request(`http://localhost${expected.video.publicUrl}`, {
          headers: { Range: "bytes=999-1000" },
        })
      );
      assert.equal(invalidRangeRes.status, 416);
      assert.equal(invalidRangeRes.headers.get("content-range"), "bytes */27");
    } finally {
      process.chdir(prevCwd);
    }

    const cfRes = spawnSync(
      process.execPath,
      [path.join(dinouRoot, "cloudflare", "build.js")],
      { cwd: tmpApp, encoding: "utf8" }
    );
    assert.equal(cfRes.status, 0, `Cloudflare build failed:\n${cfRes.stdout}\n${cfRes.stderr}`);
    const cfWorkerCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "cloudflare", "worker.js"),
      "utf8"
    );
    assert.equal(cfWorkerCode.includes("data:image/png;base64"), false);
    const cfSsrEngineCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "cloudflare", "ssr-engine.js"),
      "utf8"
    );
    assert.equal(cfSsrEngineCode.includes(expected.icon.publicUrl), true);
    assert.equal(cfSsrEngineCode.includes(expected.glb.publicUrl), true);
    assert.equal(
      fs.existsSync(
        path.join(tmpApp, ".dinou", "cloudflare", "assets", expected.hero.fileName)
      ),
      true
    );

    const bunRes = spawnSync(
      process.execPath,
      [path.join(dinouRoot, "bun", "build.js")],
      { cwd: tmpApp, encoding: "utf8" }
    );
    assert.equal(bunRes.status, 0, `Bun build failed:\n${bunRes.stdout}\n${bunRes.stderr}`);
    const bunSsrCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "bun", "ssr-engine.js"),
      "utf8"
    );
    assert.equal(bunSsrCode.includes(expected.icon.publicUrl), true);
    assert.equal(bunSsrCode.includes("data:image/png;base64"), false);

    const denoRes = spawnSync(
      process.execPath,
      [path.join(dinouRoot, "deno", "build.js")],
      { cwd: tmpApp, encoding: "utf8" }
    );
    assert.equal(denoRes.status, 0, `Deno build failed:\n${denoRes.stdout}\n${denoRes.stderr}`);
    const denoSsrCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "deno", "ssr-engine.js"),
      "utf8"
    );
    assert.equal(denoSsrCode.includes(expected.icon.publicUrl), true);
    assert.equal(denoSsrCode.includes("data:image/png;base64"), false);
  } finally {
    fs.rmSync(tmpApp, { recursive: true, force: true });
    if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
      fs.rmSync(fixturesBase, { recursive: true, force: true });
    }
  }
});
```

---

### 5.2. Playwright End-to-End Test Suite (`tests/e2e/assets.spec.ts`)

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const dinouRoot = fs.existsSync(path.join(repoRoot, "dinou", "cli.js"))
  ? path.join(repoRoot, "dinou")
  : fs.existsSync(path.join(repoRoot, "cli.js"))
    ? repoRoot
    : path.join(repoRoot, "node_modules", "dinou", "dinou");
const cliPath = path.join(dinouRoot, "cli.js");

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

async function waitForServer(url: string, timeoutMs = 45000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/__DINOU_STATUS_PLAYWRIGHT__`);
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { isReady?: boolean } | null;
        if (!json || json.isReady !== false) return;
      }
    } catch {}
    try {
      const prodRes = await fetch(url);
      if (prodRes.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for Dinou server at ${url}`);
}

function killProcessTree(proc: ChildProcess | null): Promise<void> {
  return new Promise((resolve) => {
    if (!proc || proc.pid == null) return resolve();
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      resolve();
    } else {
      proc.once("exit", () => resolve());
      try {
        proc.kill("SIGTERM");
      } catch {
        resolve();
      }
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {}
        resolve();
      }, 2000);
    }
  });
}

function createE2EFixture(prefix: string) {
  const fixturesBase = path.join(repoRoot, ".dinou", "tmp-e2e-assets");
  fs.mkdirSync(fixturesBase, { recursive: true });
  const appDir = fs.mkdtempSync(path.join(fixturesBase, prefix));

  const dinouShimDir = path.join(appDir, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouPkgRoot = fs.existsSync(path.join(repoRoot, "dinou", "index.js"))
    ? path.join(repoRoot, "dinou")
    : fs.existsSync(path.join(repoRoot, "index.js"))
      ? repoRoot
      : path.join(repoRoot, "node_modules", "dinou", "dinou");
  const dinouRootUrl = pathToFileURL(dinouPkgRoot).href;

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
    path.join(appDir, "package.json"),
    JSON.stringify({ name: "dinou-e2e-assets", version: "1.0.0", type: "module" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(appDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["./src/*"],
          "@models/*": ["./models/*"],
        },
      },
    }),
    "utf8"
  );
  fs.writeFileSync(
    path.join(appDir, "dinou.config.ts"),
    `import { defineConfig } from "dinou";\nexport default defineConfig({ assetExtensions: ["glb"] });\n`,
    "utf8"
  );

  fs.mkdirSync(path.join(appDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(appDir, "models"), { recursive: true });

  // Minimal valid 1x1 SVG + mock MP4 + mock GLB
  const svgV1 = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#10b981"/></svg>`;
  fs.writeFileSync(path.join(appDir, "src", "server-logo.svg"), svgV1, "utf8");
  fs.writeFileSync(path.join(appDir, "src", "client-badge.svg"), svgV1, "utf8");
  fs.writeFileSync(path.join(appDir, "src", "demo-clip.mp4"), "0123456789_VIDEO_STREAM_BYTES", "utf8");
  fs.writeFileSync(path.join(appDir, "models", "avatar.glb"), "GLTF2_BINARY_SCENE", "utf8");

  fs.writeFileSync(
    path.join(appDir, "src", "media-card.tsx"),
    `"use client";
import badgeUrl from "./client-badge.svg";
import clipUrl from "./demo-clip.mp4";
import glbUrl from "@models/avatar.glb";

export default function MediaCard() {
  return (
    <div id="client-card" data-badge={badgeUrl} data-clip={clipUrl} data-glb={glbUrl}>
      <img id="client-img" src={badgeUrl} alt="Client Badge" />
    </div>
  );
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(appDir, "src", "page.tsx"),
    `import serverLogo from "./server-logo.svg";
import glbUrl from "@models/avatar.glb";
import MediaCard from "./media-card";

export default function Page() {
  return (
    <html lang="en">
      <head>
        <title>Dinou Assets E2E</title>
      </head>
      <body>
        <div id="server-box" data-logo={serverLogo} data-glb={glbUrl}>
          <img id="server-img" src={serverLogo} alt="Server Logo" />
        </div>
        <MediaCard />
      </body>
    </html>
  );
}
`,
    "utf8"
  );

  return { fixturesBase, appDir };
}

test.describe("Dinou Static Assets, Custom Extensions & HTTP Byte-Range E2E", () => {
  test("hydrates RSC & Client assets without mismatch, serves HTTP 206 Ranges, and hot-updates edited asset hashes in dev", async ({
    page,
  }) => {
    const { fixturesBase, appDir } = createE2EFixture("dev-e2e-");
    const port = await getFreePort();
    const hmrPort = await getFreePort();
    let devProc: ChildProcess | null = null;

    try {
      devProc = spawn(process.execPath, [cliPath, "dev:esbuild"], {
        cwd: appDir,
        env: {
          ...process.env,
          PORT: String(port),
          HMR_PORT: String(hmrPort),
        },
        stdio: "pipe",
      });

      const baseUrl = `http://127.0.0.1:${port}`;
      await waitForServer(baseUrl);

      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await page.goto(baseUrl);
      await expect(page.locator("#server-img")).toBeVisible();
      await expect(page.locator("#client-img")).toBeVisible();

      const initialBadgeUrl = await page.locator("#client-card").getAttribute("data-badge");
      const initialGlbUrl = await page.locator("#client-card").getAttribute("data-glb");
      const serverGlbUrl = await page.locator("#server-box").getAttribute("data-glb");
      const clipUrl = await page.locator("#client-card").getAttribute("data-clip");

      expect(initialBadgeUrl).toMatch(/^\/assets\/client-badge-[a-f0-9]{8}\.svg$/);
      expect(initialGlbUrl).toMatch(/^\/assets\/avatar-[a-f0-9]{8}\.glb$/);
      expect(initialGlbUrl).toBe(serverGlbUrl);
      expect(consoleErrors.some((e) => /hydration/i.test(e))).toBe(false);

      // Verify HTTP 206 Partial Content Byte-Range streaming on video asset
      const rangeRes = await fetch(`${baseUrl}${clipUrl}`, {
        headers: { Range: "bytes=0-9" },
      });
      expect(rangeRes.status).toBe(206);
      expect(rangeRes.headers.get("accept-ranges")).toBe("bytes");
      expect(rangeRes.headers.get("content-range")).toBe("bytes 0-9/29");
      expect(await rangeRes.text()).toBe("0123456789");

      // Edit client-badge.svg on disk -> hash must change and serve updated SVG!
      const svgV2 = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="#2563eb"/></svg>`;
      fs.writeFileSync(path.join(appDir, "src", "client-badge.svg"), svgV2, "utf8");

      await expect
        .poll(
          async () => {
            await page.reload();
            return await page.locator("#client-card").getAttribute("data-badge");
          },
          { timeout: 15000 }
        )
        .not.toBe(initialBadgeUrl);

      const updatedBadgeUrl = await page.locator("#client-card").getAttribute("data-badge");
      const svgFetch = await fetch(`${baseUrl}${updatedBadgeUrl}`);
      expect(svgFetch.status).toBe(200);
      expect(await svgFetch.text()).toContain("#2563eb");
    } finally {
      await killProcessTree(devProc);
      fs.rmSync(appDir, { recursive: true, force: true });
      if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
        fs.rmSync(fixturesBase, { recursive: true, force: true });
      }
    }
  });
});
```
