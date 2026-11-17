# Dinou `v9.4.0` — Unified `tsconfig.json` & `jsconfig.json` Path Aliases Engine (`x-alias-fixes.md`)

## 1. Executive Summary & Root-Cause Analysis

During the pre-release audit of `/docs/alias` (`src/docs/alias/page.tsx`) against Dinou `v9.4.0` across all 3 bundlers (`esbuild`, `rollup`, `webpack`), all 4 production runtimes (`Node.js`, `Cloudflare Workers`, `Bun`, `Deno`), `dinou dev`, `dinou build`, `dinou export-static`, PostCSS, and `dinou.config.ts`, we identified and resolved **6 architectural bugs** by replacing fragmented bundler-specific third-party plugins and partial regex patches with a single, zero-dependency, TypeScript-spec-compliant resolver core (`dinou/core/tsconfig-aliases.js`):

1. **Bug 1 (Critical Crash) — Any Custom Alias Other Than `@/*` Crashed `dinou dev` & Dual-Bundle Runtimes (`Node`, `Cloudflare`, `Bun`, `Deno`)**:
   - **Root Cause**: In `dinou/node/dev.js`, `createDevExternalPackagesPlugin` only recognized `args.path.startsWith("@/") || args.path === "@"`. Every other alias documented in `/docs/alias` (`@components/*`, `@lib/*`, `@server/*`, `@styles/*`, `@assets/*`, `~/*`, `#*`) fell through to `{ path: args.path, external: true }`, crashing V8 at runtime with `ERR_MODULE_NOT_FOUND: Cannot find package '@components'`. Likewise, `commonAlias` in `node/dev.js`, `node/bundle-dual-engine.js`, `cloudflare/build.js`, `bun/build.js`, `deno/build.js`, and `esbuild/build.js` hardcoded `{ "@": path.resolve(projectRoot, "src") }`, while `rollup/rollup.config.js` omitted `tsconfig` path resolution on `serverConfig` (`.dinou/dist1/server`) entirely.
   - **Fix**: Built `esbuildTsconfigAliasesPlugin` and `rollupTsconfigAliasesPlugin` in `dinou/core/tsconfig-aliases.js` and wired them across `node/dev.js` (`ctxA` & `ctxB`), `node/bundle-dual-engine.js` (Pass A & Pass B), `cloudflare/build.js` (Pass A, B, C), `bun/build.js` (Pass A, B, C), `deno/build.js` (Pass A, B, C), `esbuild/build.js`, and `rollup/rollup.config.js` (`clientConfig` & `serverConfig`), while updating `createDevExternalPackagesPlugin` (`matchesExplicitUserAlias`) so even mistyped aliases surface clean build-time errors rather than runtime external-package crashes.

2. **Bug 2 (Critical Bundler Failure) — Importing Global CSS or CSS Modules via Custom Aliases (`import "@styles/theme.css"`, `import s from "@styles/card.module.css"`) Failed in Rollup & Esbuild Prod**:
   - **Root Cause**: `rollup/rollup.config.js` used `rollup-plugin-tsconfig-paths` (which delegates to `ts.resolveModuleName`, returning `undefined` for `.css` files and failing when `jsconfig.json` is used instead of `tsconfig.json`). `esbuild/helpers-esbuild/get-config-esbuild-prod.js` used `@esbuild-plugins/tsconfig-paths` (which delegates to `ts.nodeModuleNameResolver`—also ignoring `.css`—and uses a broken `new RegExp(path.replace('*', '\\w*'))` matcher that fails on `/` or `-` subpaths when `extends` is active).
   - **Fix**: Replaced both third-party plugins with Dinou's native `rollupTsconfigAliasesPlugin` and `esbuildTsconfigAliasesPlugin`, resolving `.css` and `.module.css` imports seamlessly before PostCSS / CSS Module loaders run.

3. **Bug 3 (`getTsconfigAliases` Spec Violations in `dinou/core/get-abs-path-with-ext.js`)**:
   - **Root Cause**:
     1. **No Longest-Prefix Specificity Sorting**: Iterated keys in raw JSON order and immediately returned `tryExtensions(absPath)` (even when `null`) on the first prefix match, breaking overlapping rules like `"@ui/*"` declared before `"@ui/icons/*"`.
     2. **Ignored Multi-Target Fallback Arrays**: Discarded `targets.slice(1)` (`"@shared/*": ["./src/overrides/*", "../shared/*"]`).
     3. **Ignored `"extends"` Inheritance**: Failed on monorepo `tsconfig.base.json`, TypeScript 5.0+ array `"extends": [...]`, `node_modules` presets (`@tsconfig/...`), and TypeScript 5.5+ `${configDir}` placeholders (and avoided `tsconfig-paths`'s parent-directory `baseUrl` resolution bug in Webpack).
     4. **Only Supported Trailing `/*`**: Failed on exact aliases (`"@site-config": ["./src/config.ts"]`), prefix-without-slash wildcards (`"~*": ["./src/*"]`), and suffix patterns (`"@icons/*.svg": ["./src/icons/*.svg"]`).
   - **Fix**: Implemented full TypeScript `paths` pattern compilation, specificity sorting (exact > longest `prefix` > longest `suffix` > declaration order), multi-target fallback probing, recursive `"extends"` loading with accurate per-file `baseUrl` / `pathsBaseDir` semantics, TypeScript ESM `.js` → `.ts`/`.tsx` substitution, and context-aware extension priority (`preferStyles` so sibling `Widget.tsx` + `Widget.css` files resolve to `.tsx` in JS/TS `import` and `.css` in CSS `@import`).

4. **Bug 4 (`.dinou/swc` Dev Mirror Path Corruption with `baseUrl` + SWC `mkdir` Race + Webpack Resolver Gaps)**:
   - **Root Cause**: `get-config-esbuild.js` rewrote `paths` targets to `.dinou/swc/<target>` inside `tsconfigRaw`, which Esbuild resolved relative to `compilerOptions.baseUrl`—turning `"baseUrl": "./src"` + `"@components/*": ["components/*"]` into the non-existent path `src/.dinou/swc/components/*`. Additionally, `swc-disk-cache.js` wrapped `fs.mkdir` inside the SWC `try` block, writing uncompiled TypeScript into `.dinou/swc/*.js` if `mkdir` hit a transient Windows lock. Meanwhile, `webpack.config.js` lacked zero-config `@/*` / `~/*` fallbacks, `.mjs`/`.cjs`/`.json` extensions in `resolve.extensions`, and live `tsconfig.json` invalidation.
   - **Fix**: `esbuildTsconfigAliasesPlugin({ preferSwcMirror: true })` resolves real source paths first and maps TypeScript/JSX modules to `.dinou/swc/...` relative to `projectRoot` regardless of `baseUrl` (while passing sanitized `tsconfigRaw` without `paths`/`baseUrl`), `swc-disk-cache.js` isolates SWC compilation from disk writes with retry protection, and `createWebpackTsconfigAliasesResolvePlugin` gives Webpack 100% parity (including `resolveContext.fileDependencies` tracking).

5. **Bug 5 (`jsconfig.json`, `dinou.config.ts`, & `_folder` Escape Guard Parity)**:
   - **Root Cause**: `get-config-esbuild.js` and `rollup.config.js` ignored `jsconfig.json`; `load-dinou-config.js` marked aliased imports inside `dinou.config.ts` as `external` packages; and `checkForbiddenUnderscoreImport` in `resolve-contextual-dinou.js` only checked `@/` and `~/`, allowing custom aliases (e.g. `@docs/_private/Secret` or `"@secret/*": ["./src/docs/_private/*"]`) to bypass Dinou's `_folder` escape boundary.
   - **Fix**: Unified `tsconfig.json` → `jsconfig.json` discovery everywhere, wired `esbuildTsconfigAliasesPlugin` into `load-dinou-config.js`, and integrated `getAliasCandidatePaths` into `checkForbiddenUnderscoreImport`.

6. **Bug 6 (No Live `tsconfig.json` / `jsconfig.json` Hot-Reload in `dinou dev`)**:
   - **Root Cause**: Editing `tsconfig.json` or `jsconfig.json` while `dinou dev` was running left `ctxA`, `ctxB`, and client bundlers with stale alias tables until a manual restart.
   - **Fix**: Added automatic `mtimeMs` tracking across the entire `tsconfig` / `extends` file chain, `watchFiles` / `addWatchFile` / `fileDependencies` hooks across Esbuild, Rollup, and Webpack, and live Chokidar hot-reload in `dinou/node/dev.js` (`triggerTsconfigReload` + `refreshAliases`).

---

## 2. Complete File Manifest (21 Files)

### New Files (2)
1. `dinou/core/builtin-asset-extensions.js`
2. `dinou/core/tsconfig-aliases.js`

### Modified Files (19)
3. `dinou/core/asset-extensions.js`
4. `dinou/core/get-abs-path-with-ext.js`
5. `dinou/core/resolve-contextual-dinou.js`
6. `dinou/core/load-dinou-config.js`
7. `dinou/core/server-css-modules-plugin.js`
8. `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`
9. `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`
10. `dinou/esbuild/helpers-esbuild/get-esbuild-entries.js`
11. `dinou/esbuild/helpers-esbuild/swc-disk-cache.js`
12. `dinou/esbuild/build.js`
13. `dinou/rollup/rollup.config.js`
14. `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js`
15. `dinou/webpack/webpack.config.js`
16. `dinou/webpack/helpers/get-webpack-entries.js`
17. `dinou/node/dev.js`
18. `dinou/node/bundle-dual-engine.js`
19. `dinou/cloudflare/build.js`
20. `dinou/bun/build.js`
21. `dinou/deno/build.js`

---

## 3. Complete Source Code & Unified Diffs

### 3.0. [NEW] `dinou/core/builtin-asset-extensions.js`

Canonical, zero-dependency leaf module keeping Dinou's 26 built-in static media, vector, audio/video, and font extensions as a single source of truth across `asset-extensions.js` and `tsconfig-aliases.js` while preserving a strictly acyclic `dinou/core/` dependency graph (DAG):

```js
// dinou/core/builtin-asset-extensions.js
// Canonical, zero-dependency single source of truth for Dinou's built-in static
// media, vector, audio/video, and font asset extensions.

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

export const BUILTIN_ASSET_EXTENSIONS = extensions;

export const DEFAULT_EXTENSIONS_SET = new Set(extensions);

const escapeRegExp = (str) =>
  String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const globPattern = `**/*.{${extensions.join(",")}}`;

// Regex useful for Rollup/Webpack/PostCSS/Esbuild asset matching
export const regex = new RegExp(
  `\\.(${extensions.map(escapeRegExp).join("|")})$`,
  "i"
);

export const BUILTIN_ASSET_REGEX = regex;

// Version with leading dot for direct comparisons
export const extensionsWithDot = extensions.map((ext) => `.${ext}`);

export default {
  extensions,
  BUILTIN_ASSET_EXTENSIONS,
  DEFAULT_EXTENSIONS_SET,
  globPattern,
  regex,
  BUILTIN_ASSET_REGEX,
  extensionsWithDot,
};
```

### 3.1. [NEW] `dinou/core/tsconfig-aliases.js`

```js
import fs from "node:fs";
import path from "node:path";
import { builtinModules, createRequire } from "node:module";
import { BUILTIN_ASSET_REGEX as DEFAULT_ASSET_REGEX } from "./builtin-asset-extensions.js";

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((b) => (b.startsWith("node:") ? b.slice(5) : `node:${b}`)),
]);

export const DEFAULT_ALIAS_CODE_EXTENSIONS = [
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".json",
  ".css",
  ".scss",
  ".sass",
  ".less",
];

export const DEFAULT_ALIAS_STYLE_EXTENSIONS = [
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
];

const EXTENSION_SUBSTITUTIONS = {
  ".js": [".ts", ".tsx", ".jsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

const aliasCacheByRoot = new Map();

export function stripJsonCommentsAndTrailingCommas(raw) {
  if (typeof raw !== "string") return "";
  const noBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const withoutComments = noBom.replace(
    /"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    (match) => (match.startsWith('"') ? match : "")
  );
  return withoutComments.replace(/,(\s*[}\]])/g, "$1");
}

function normalizeCacheRootKey(dirPath) {
  const resolved = path.resolve(dirPath || process.cwd()).replace(/\\/g, "/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function getFileMtimeMs(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() ? st.mtimeMs : -1;
  } catch (e) {
    return -1;
  }
}

function isExistingFile(filePath) {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (e) {
    return false;
  }
}

function isExistingDirectory(dirPath) {
  if (!dirPath) return false;
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch (e) {
    return false;
  }
}

function expandConfigDirToken(value, configDir) {
  if (typeof value !== "string" || !value.includes("${configDir}")) {
    return value;
  }
  return value.replace(/\$\{configDir\}/g, configDir);
}

function resolveExtendedConfigPath(fromConfigFile, extendsSpecifier) {
  if (!extendsSpecifier || typeof extendsSpecifier !== "string") return null;
  const fromDir = path.dirname(fromConfigFile);
  const expanded = expandConfigDirToken(extendsSpecifier.trim(), fromDir);
  if (!expanded) return null;

  const tryLocalPath = (rawTarget) => {
    const abs = path.resolve(fromDir, rawTarget);
    if (isExistingFile(abs)) return abs;
    if (!abs.endsWith(".json") && isExistingFile(abs + ".json")) {
      return abs + ".json";
    }
    if (isExistingDirectory(abs)) {
      const nested = path.join(abs, "tsconfig.json");
      if (isExistingFile(nested)) return nested;
    }
    return null;
  };

  if (
    expanded.startsWith("./") ||
    expanded.startsWith("../") ||
    expanded.startsWith("/") ||
    expanded.startsWith("\\") ||
    path.isAbsolute(expanded)
  ) {
    return tryLocalPath(expanded);
  }

  // Package preset inside node_modules (e.g. "@tsconfig/node20/tsconfig.json" or "@acme/tsconfig/base")
  try {
    const req = createRequire(fromConfigFile);
    for (const candidate of [
      expanded,
      expanded.endsWith(".json") ? null : `${expanded}.json`,
      `${expanded}/tsconfig.json`,
    ]) {
      if (!candidate) continue;
      try {
        const resolved = req.resolve(candidate);
        if (isExistingFile(resolved)) return path.resolve(resolved);
      } catch (e) {}
    }
  } catch (e) {}

  // Fallback relative lookup (TypeScript also allows relative-like extends in edge cases)
  return tryLocalPath(expanded);
}

function loadConfigChainRecursive(configFilePath, visited, trackedFiles) {
  const absConfigPath = path.resolve(configFilePath);
  const visitKey = normalizeCacheRootKey(absConfigPath);
  if (visited.has(visitKey)) {
    return {
      compilerOptions: {},
      hasExplicitBaseUrl: false,
      absoluteBaseUrl: null,
      rawPaths: null,
      pathsBaseDir: null,
    };
  }
  visited.add(visitKey);

  const mtimeMs = getFileMtimeMs(absConfigPath);
  trackedFiles.push({ path: absConfigPath, mtimeMs });
  if (mtimeMs < 0) {
    return {
      compilerOptions: {},
      hasExplicitBaseUrl: false,
      absoluteBaseUrl: null,
      rawPaths: null,
      pathsBaseDir: null,
    };
  }

  let parsed = {};
  try {
    const raw = fs.readFileSync(absConfigPath, "utf8");
    parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(raw)) || {};
  } catch (e) {
    return {
      compilerOptions: {},
      hasExplicitBaseUrl: false,
      absoluteBaseUrl: null,
      rawPaths: null,
      pathsBaseDir: null,
    };
  }

  let mergedCompilerOptions = {};
  let hasExplicitBaseUrl = false;
  let absoluteBaseUrl = null;
  let rawPaths = null;
  let pathsBaseDir = null;

  const extendsField = parsed.extends;
  if (extendsField) {
    const extendsList = Array.isArray(extendsField)
      ? extendsField
      : [extendsField];
    for (const extItem of extendsList) {
      const parentPath = resolveExtendedConfigPath(absConfigPath, extItem);
      if (!parentPath) continue;
      const parentRes = loadConfigChainRecursive(
        parentPath,
        visited,
        trackedFiles
      );
      mergedCompilerOptions = {
        ...mergedCompilerOptions,
        ...parentRes.compilerOptions,
      };
      if (parentRes.hasExplicitBaseUrl && parentRes.absoluteBaseUrl) {
        hasExplicitBaseUrl = true;
        absoluteBaseUrl = parentRes.absoluteBaseUrl;
      }
      if (parentRes.rawPaths) {
        rawPaths = parentRes.rawPaths;
        pathsBaseDir = parentRes.pathsBaseDir;
      }
    }
  }

  const configDir = path.dirname(absConfigPath);
  const ownCompilerOptions =
    parsed.compilerOptions && typeof parsed.compilerOptions === "object"
      ? parsed.compilerOptions
      : {};

  mergedCompilerOptions = {
    ...mergedCompilerOptions,
    ...ownCompilerOptions,
  };

  if (typeof ownCompilerOptions.baseUrl === "string" && ownCompilerOptions.baseUrl.trim() !== "") {
    const expandedBase = expandConfigDirToken(
      ownCompilerOptions.baseUrl.trim(),
      configDir
    );
    hasExplicitBaseUrl = true;
    absoluteBaseUrl = path.resolve(configDir, expandedBase);
  }

  if (ownCompilerOptions.paths && typeof ownCompilerOptions.paths === "object") {
    const expandedPaths = {};
    for (const [pattern, rawTargets] of Object.entries(ownCompilerOptions.paths)) {
      const targetList = Array.isArray(rawTargets) ? rawTargets : [rawTargets];
      expandedPaths[pattern] = targetList
        .filter((t) => typeof t === "string" && t.length > 0)
        .map((t) => expandConfigDirToken(t, configDir));
    }
    rawPaths = expandedPaths;
    pathsBaseDir = configDir;
  }

  return {
    compilerOptions: mergedCompilerOptions,
    hasExplicitBaseUrl,
    absoluteBaseUrl,
    rawPaths,
    pathsBaseDir,
  };
}

function findRootConfigFile(rootAbs) {
  const tsconfigPath = path.resolve(rootAbs, "tsconfig.json");
  if (isExistingFile(tsconfigPath)) return tsconfigPath;
  const jsconfigPath = path.resolve(rootAbs, "jsconfig.json");
  if (isExistingFile(jsconfigPath)) return jsconfigPath;
  return null;
}

function isCachedEntryFresh(entry, rootAbs) {
  if (!entry) return false;
  const currentRootConfig = findRootConfigFile(rootAbs);
  if ((currentRootConfig || null) !== (entry.configFile || null)) {
    return false;
  }
  for (const tracked of entry.configFiles) {
    if (getFileMtimeMs(tracked.path) !== tracked.mtimeMs) {
      return false;
    }
  }
  return true;
}

function compileAliasRules({
  rootAbs,
  rawPaths,
  effectiveBaseDir,
  hasExplicitBaseUrl,
  absoluteBaseUrl,
}) {
  const userRules = [];
  const pathsObj = rawPaths && typeof rawPaths === "object" ? rawPaths : {};
  let order = 0;

  for (const [pattern, rawTargets] of Object.entries(pathsObj)) {
    if (!pattern || typeof pattern !== "string") continue;
    const targets = (Array.isArray(rawTargets) ? rawTargets : [rawTargets]).filter(
      (t) => typeof t === "string" && t.length > 0
    );
    if (targets.length === 0) continue;

    const starIdx = pattern.indexOf("*");
    if (starIdx === -1) {
      userRules.push({
        pattern,
        isWildcard: false,
        prefix: pattern,
        suffix: "",
        targets,
        baseDir: effectiveBaseDir,
        isFallback: false,
        isBaseUrlFallback: false,
        order: order++,
      });
    } else {
      const prefix = pattern.slice(0, starIdx);
      const suffix = pattern.slice(starIdx + 1);
      userRules.push({
        pattern,
        isWildcard: true,
        prefix,
        suffix,
        targets,
        baseDir: effectiveBaseDir,
        isFallback: false,
        isBaseUrlFallback: false,
        order: order++,
      });
    }
  }

  userRules.sort((a, b) => {
    if (a.isWildcard !== b.isWildcard) {
      return a.isWildcard ? 1 : -1;
    }
    if (!a.isWildcard) {
      return a.order - b.order;
    }
    if (b.prefix.length !== a.prefix.length) {
      return b.prefix.length - a.prefix.length;
    }
    if (b.suffix.length !== a.suffix.length) {
      return b.suffix.length - a.suffix.length;
    }
    return a.order - b.order;
  });

  const fallbackRules = [];

  if (!Object.prototype.hasOwnProperty.call(pathsObj, "@/*")) {
    fallbackRules.push({
      pattern: "@/*",
      isWildcard: true,
      prefix: "@/",
      suffix: "",
      targets: ["src/*"],
      baseDir: rootAbs,
      isFallback: true,
      isBaseUrlFallback: false,
      order: order++,
    });
  }
  if (!Object.prototype.hasOwnProperty.call(pathsObj, "~/*")) {
    fallbackRules.push({
      pattern: "~/*",
      isWildcard: true,
      prefix: "~/",
      suffix: "",
      targets: ["src/*"],
      baseDir: rootAbs,
      isFallback: true,
      isBaseUrlFallback: false,
      order: order++,
    });
  }

  if (hasExplicitBaseUrl && absoluteBaseUrl && !Object.prototype.hasOwnProperty.call(pathsObj, "*")) {
    fallbackRules.push({
      pattern: "*",
      isWildcard: true,
      prefix: "",
      suffix: "",
      targets: ["*"],
      baseDir: absoluteBaseUrl,
      isFallback: true,
      isBaseUrlFallback: true,
      order: order++,
    });
  }

  return [...userRules, ...fallbackRules];
}

export function clearTsconfigAliasCache(projectRoot = null) {
  if (!projectRoot) {
    aliasCacheByRoot.clear();
    return;
  }
  aliasCacheByRoot.delete(normalizeCacheRootKey(projectRoot));
}

export function inferProjectRootFromDir(startDir, explicitCwd = null) {
  if (explicitCwd) {
    return path.resolve(explicitCwd);
  }
  const cwdAbs = path.resolve(process.cwd());
  if (!startDir) {
    return cwdAbs;
  }

  const startAbs = path.resolve(startDir);
  const normCwd = normalizeCacheRootKey(cwdAbs);
  const normStart = normalizeCacheRootKey(startAbs);
  if (normStart === normCwd || normStart.startsWith(normCwd + "/")) {
    let cur = startAbs;
    while (true) {
      if (findRootConfigFile(cur)) {
        return cur;
      }
      if (normalizeCacheRootKey(cur) === normCwd) {
        return cwdAbs;
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    return cwdAbs;
  }

  let cur = startAbs;
  while (true) {
    if (findRootConfigFile(cur)) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return cwdAbs;
}

export function loadTsconfigAliasInfo(projectRoot = process.cwd()) {
  const rootAbs = path.resolve(projectRoot || process.cwd());
  const cacheKey = normalizeCacheRootKey(rootAbs);
  const cached = aliasCacheByRoot.get(cacheKey);
  if (isCachedEntryFresh(cached, rootAbs)) {
    return cached;
  }

  const rootConfig = findRootConfigFile(rootAbs);
  const trackedFiles = [];
  let compilerOptions = {};
  let hasExplicitBaseUrl = false;
  let absoluteBaseUrl = null;
  let rawPaths = null;
  let pathsBaseDir = null;

  if (rootConfig) {
    const loaded = loadConfigChainRecursive(
      rootConfig,
      new Set(),
      trackedFiles
    );
    compilerOptions = loaded.compilerOptions;
    hasExplicitBaseUrl = loaded.hasExplicitBaseUrl;
    absoluteBaseUrl = loaded.absoluteBaseUrl;
    rawPaths = loaded.rawPaths;
    pathsBaseDir = loaded.pathsBaseDir;
  }

  const effectiveBaseDir = absoluteBaseUrl || pathsBaseDir || rootAbs;
  const rules = compileAliasRules({
    rootAbs,
    rawPaths,
    effectiveBaseDir,
    hasExplicitBaseUrl,
    absoluteBaseUrl,
  });

  const entry = {
    projectRoot: rootAbs,
    configFile: rootConfig,
    configFiles: trackedFiles,
    compilerOptions,
    hasExplicitBaseUrl,
    absoluteBaseUrl,
    effectiveBaseDir,
    rawPaths: rawPaths || {},
    rules,
  };

  aliasCacheByRoot.set(cacheKey, entry);
  return entry;
}

export function getWatchedTsconfigFiles(projectRoot = process.cwd()) {
  const info = loadTsconfigAliasInfo(projectRoot);
  return info.configFiles.map((cf) => cf.path);
}

export function getSanitizedEsbuildTsconfigRaw(projectRoot = process.cwd()) {
  const info = loadTsconfigAliasInfo(projectRoot);
  const sanitizedOptions = {};
  const allowedKeys = [
    "experimentalDecorators",
    "emitDecoratorMetadata",
    "useDefineForClassFields",
    "verbatimModuleSyntax",
    "importsNotUsedAsValues",
    "preserveValueImports",
    "jsxFactory",
    "jsxFragmentFactory",
    "jsxImportSource",
    "target",
    "strict",
  ];
  for (const key of allowedKeys) {
    if (info.compilerOptions && info.compilerOptions[key] !== undefined) {
      sanitizedOptions[key] = info.compilerOptions[key];
    }
  }
  return { compilerOptions: sanitizedOptions };
}

export function resolveCandidateFile(
  absCandidate,
  { extensions = null, preferStyles = false } = {}
) {
  if (!absCandidate) return null;

  if (isExistingFile(absCandidate)) {
    return absCandidate;
  }

  const rawExt = path.extname(absCandidate).toLowerCase();
  const substExts = EXTENSION_SUBSTITUTIONS[rawExt];
  if (substExts) {
    const stem = absCandidate.slice(0, -rawExt.length);
    for (const altExt of substExts) {
      const altPath = stem + altExt;
      if (isExistingFile(altPath)) {
        return altPath;
      }
    }
  }

  const activeExts =
    extensions ||
    (preferStyles ? DEFAULT_ALIAS_STYLE_EXTENSIONS : DEFAULT_ALIAS_CODE_EXTENSIONS);

  for (const ext of activeExts) {
    const candidate = absCandidate + ext;
    if (isExistingFile(candidate)) {
      return candidate;
    }
  }

  if (isExistingDirectory(absCandidate)) {
    const pkgJsonPath = path.join(absCandidate, "package.json");
    if (isExistingFile(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
        const fields = preferStyles
          ? ["style", "main"]
          : ["module", "main"];
        for (const field of fields) {
          if (typeof pkg[field] === "string" && pkg[field].trim() !== "") {
            const pkgEntry = resolveCandidateFile(
              path.resolve(absCandidate, pkg[field]),
              { extensions: activeExts, preferStyles }
            );
            if (pkgEntry) return pkgEntry;
          }
        }
      } catch (e) {}
    }

    for (const ext of activeExts) {
      const indexCandidate = path.join(absCandidate, "index" + ext);
      if (isExistingFile(indexCandidate)) {
        return indexCandidate;
      }
    }
  }

  return null;
}

function isDisallowedAliasSpecifier(cleanSpec) {
  if (!cleanSpec || typeof cleanSpec !== "string") return true;
  if (
    cleanSpec.startsWith("./") ||
    cleanSpec.startsWith("../") ||
    cleanSpec.startsWith(".\\") ||
    cleanSpec.startsWith("..\\") ||
    cleanSpec.startsWith("/") ||
    cleanSpec.startsWith("\\") ||
    cleanSpec.startsWith("\0") ||
    cleanSpec.startsWith("virtual:") ||
    cleanSpec.startsWith("node:") ||
    cleanSpec.startsWith("http:") ||
    cleanSpec.startsWith("https:") ||
    cleanSpec.startsWith("data:") ||
    cleanSpec === "." ||
    cleanSpec === ".." ||
    cleanSpec === "dinou" ||
    cleanSpec.startsWith("dinou/") ||
    path.isAbsolute(cleanSpec)
  ) {
    return true;
  }
  return false;
}

function matchRuleToSpecifier(rule, cleanSpec) {
  if (!rule.isWildcard) {
    return cleanSpec === rule.pattern ? "" : null;
  }
  if (rule.isBaseUrlFallback) {
    if (
      NODE_BUILTINS.has(cleanSpec) ||
      cleanSpec === "react" ||
      cleanSpec.startsWith("react/") ||
      cleanSpec === "react-dom" ||
      cleanSpec.startsWith("react-dom/") ||
      cleanSpec === "react-server-dom-webpack" ||
      cleanSpec.startsWith("react-server-dom-webpack/") ||
      cleanSpec === "@roggc/react-server-dom-esm" ||
      cleanSpec.startsWith("@roggc/react-server-dom-esm/")
    ) {
      return null;
    }
  }
  if (cleanSpec.length < rule.prefix.length + rule.suffix.length) {
    return null;
  }
  if (!cleanSpec.startsWith(rule.prefix)) {
    return null;
  }
  if (rule.suffix !== "" && !cleanSpec.endsWith(rule.suffix)) {
    return null;
  }
  return cleanSpec.slice(
    rule.prefix.length,
    cleanSpec.length - rule.suffix.length
  );
}

function expandRuleTargets(rule, matchedStar) {
  const candidates = [];
  for (const targetPattern of rule.targets) {
    const substituted =
      rule.isWildcard && targetPattern.includes("*")
        ? targetPattern.replace(/\*/g, () => matchedStar)
        : targetPattern;
    candidates.push(path.resolve(rule.baseDir, substituted));
  }
  return candidates;
}

export function getAliasCandidatePaths(
  specifier,
  projectRoot = process.cwd(),
  { includeBaseUrlFallback = false } = {}
) {
  if (!specifier || typeof specifier !== "string") return [];
  const cleanSpec = specifier.split("?")[0].split("#")[0];
  if (isDisallowedAliasSpecifier(cleanSpec)) return [];

  const info = loadTsconfigAliasInfo(projectRoot);
  const candidates = [];
  for (const rule of info.rules) {
    if (rule.isBaseUrlFallback && !includeBaseUrlFallback) continue;
    const matchedStar = matchRuleToSpecifier(rule, cleanSpec);
    if (matchedStar === null) continue;
    for (const absCandidate of expandRuleTargets(rule, matchedStar)) {
      candidates.push(absCandidate);
    }
  }
  return candidates;
}

export function matchesExplicitUserAlias(
  specifier,
  projectRoot = process.cwd()
) {
  if (!specifier || typeof specifier !== "string") return false;
  const cleanSpec = specifier.split("?")[0].split("#")[0];
  if (isDisallowedAliasSpecifier(cleanSpec)) return false;

  const info = loadTsconfigAliasInfo(projectRoot);
  for (const rule of info.rules) {
    if (rule.isBaseUrlFallback) continue;
    if (rule.pattern === "*") continue;
    if (matchRuleToSpecifier(rule, cleanSpec) !== null) {
      return true;
    }
  }
  return false;
}

export function resolveTsconfigAlias(
  specifier,
  {
    projectRoot = process.cwd(),
    extensions = null,
    preferStyles = false,
  } = {}
) {
  if (!specifier || typeof specifier !== "string") return null;
  const cleanSpec = specifier.split("?")[0].split("#")[0];
  if (isDisallowedAliasSpecifier(cleanSpec)) return null;

  const info = loadTsconfigAliasInfo(projectRoot);
  for (const rule of info.rules) {
    const matchedStar = matchRuleToSpecifier(rule, cleanSpec);
    if (matchedStar === null) continue;

    const expandedCandidates = expandRuleTargets(rule, matchedStar);
    for (const absCandidate of expandedCandidates) {
      const resolved = resolveCandidateFile(absCandidate, {
        extensions,
        preferStyles,
      });
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

function mapResolvedToSwcMirrorIfPresent(resolvedPath, rootAbs) {
  if (!resolvedPath || !/\.[jt]sx?$/i.test(resolvedPath)) {
    return resolvedPath;
  }
  const normResolved = normalizeCacheRootKey(resolvedPath);
  const normRoot = normalizeCacheRootKey(rootAbs);
  if (!normResolved.startsWith(normRoot + "/")) {
    return resolvedPath;
  }
  const rel = path.relative(rootAbs, resolvedPath).replace(/\\/g, "/");
  if (rel.startsWith(".dinou/") || rel.startsWith("node_modules/")) {
    return resolvedPath;
  }
  const mirrorRel = rel.replace(/\.[jt]sx?$/i, ".js");
  const mirrorAbs = path.resolve(rootAbs, ".dinou", "swc", mirrorRel);
  if (isExistingFile(mirrorAbs)) {
    return mirrorAbs;
  }
  return resolvedPath;
}

export function esbuildTsconfigAliasesPlugin({
  projectRoot = process.cwd(),
  assetRegex = null,
  getAssetRegex = null,
  preferSwcMirror = false,
  skipAssets = true,
} = {}) {
  const rootDir = path.resolve(projectRoot || process.cwd());

  return {
    name: "dinou-tsconfig-aliases",
    setup(build) {
      let activeAssetRegex = assetRegex || DEFAULT_ASSET_REGEX;
      build.onStart(() => {
        if (typeof getAssetRegex === "function") {
          try {
            activeAssetRegex = getAssetRegex() || DEFAULT_ASSET_REGEX;
          } catch (e) {
            activeAssetRegex = assetRegex || DEFAULT_ASSET_REGEX;
          }
        }
      });

      build.onResolve({ filter: /^[^.\/\\]/ }, (args) => {
        if (args.kind === "entry-point") return null;
        if (args.pluginData?.skipDinouTsconfigAliases) return null;

        const cleanSpec = args.path ? args.path.split("?")[0].split("#")[0] : "";
        if (isDisallowedAliasSpecifier(cleanSpec)) return null;

        if (skipAssets && activeAssetRegex && activeAssetRegex.test(cleanSpec)) {
          return null;
        }

        const resolved = resolveTsconfigAlias(cleanSpec, {
          projectRoot: rootDir,
        });
        if (!resolved) {
          return null;
        }

        if (skipAssets && activeAssetRegex && activeAssetRegex.test(resolved)) {
          return null;
        }

        const finalPath = preferSwcMirror
          ? mapResolvedToSwcMirrorIfPresent(resolved, rootDir)
          : resolved;

        const isDev =
          process.env.DINOU_DEV === "true" ||
          process.env.NODE_ENV !== "production";
        if (isDev) {
          const watchFiles = getWatchedTsconfigFiles(rootDir);
          if (watchFiles.length > 0) {
            return { path: finalPath, watchFiles };
          }
        }

        return { path: finalPath };
      });
    },
  };
}

export function rollupTsconfigAliasesPlugin({
  projectRoot = process.cwd(),
  assetRegex = null,
  skipAssets = true,
} = {}) {
  const rootDir = path.resolve(projectRoot || process.cwd());
  const activeAssetRegex = assetRegex || DEFAULT_ASSET_REGEX;

  return {
    name: "dinou-tsconfig-aliases",
    resolveId(source, _importer, options) {
      if (options?.isEntry) return null;
      if (!source || typeof source !== "string") return null;

      const cleanSpec = source.split("?")[0].split("#")[0];
      if (isDisallowedAliasSpecifier(cleanSpec)) return null;

      if (skipAssets && activeAssetRegex && activeAssetRegex.test(cleanSpec)) {
        return null;
      }

      if (typeof this?.addWatchFile === "function") {
        for (const cf of getWatchedTsconfigFiles(rootDir)) {
          this.addWatchFile(cf);
        }
      }

      const resolved = resolveTsconfigAlias(cleanSpec, {
        projectRoot: rootDir,
      });
      if (!resolved) return null;

      if (skipAssets && activeAssetRegex && activeAssetRegex.test(resolved)) {
        return null;
      }

      return resolved;
    },
  };
}

export function createWebpackTsconfigAliasesResolvePlugin({
  projectRoot = process.cwd(),
} = {}) {
  const rootDir = path.resolve(projectRoot || process.cwd());

  return {
    apply(resolver) {
      if (!resolver || typeof resolver.ensureHook !== "function") return;
      const target = resolver.ensureHook("resolve");
      resolver
        .getHook("described-resolve")
        .tapAsync(
          "DinouTsconfigAliasesResolvePlugin",
          (request, resolveContext, callback) => {
            const rawReq = request?.request;
            if (!rawReq || typeof rawReq !== "string") {
              return callback();
            }
            const cleanSpec = rawReq.split("?")[0].split("#")[0];
            if (isDisallowedAliasSpecifier(cleanSpec)) {
              return callback();
            }

            const info = loadTsconfigAliasInfo(rootDir);
            if (
              resolveContext?.fileDependencies &&
              typeof resolveContext.fileDependencies.add === "function"
            ) {
              for (const cf of info.configFiles) {
                resolveContext.fileDependencies.add(cf.path);
              }
            }

            const resolved = resolveTsconfigAlias(cleanSpec, {
              projectRoot: rootDir,
            });
            if (!resolved) {
              return callback();
            }

            const qIdx = rawReq.search(/[?#]/);
            const suffix = qIdx === -1 ? "" : rawReq.slice(qIdx);
            const nextRequest = {
              ...request,
              request: resolved + suffix,
            };

            return resolver.doResolve(
              target,
              nextRequest,
              `resolved tsconfig alias ${rawReq} -> ${resolved}`,
              resolveContext,
              callback
            );
          }
        );
    },
  };
}

export default {
  DEFAULT_ALIAS_CODE_EXTENSIONS,
  DEFAULT_ALIAS_STYLE_EXTENSIONS,
  stripJsonCommentsAndTrailingCommas,
  clearTsconfigAliasCache,
  inferProjectRootFromDir,
  loadTsconfigAliasInfo,
  getWatchedTsconfigFiles,
  getSanitizedEsbuildTsconfigRaw,
  resolveCandidateFile,
  getAliasCandidatePaths,
  matchesExplicitUserAlias,
  resolveTsconfigAlias,
  esbuildTsconfigAliasesPlugin,
  rollupTsconfigAliasesPlugin,
  createWebpackTsconfigAliasesResolvePlugin,
};
```

### 3.1b. [MODIFIED] `dinou/core/asset-extensions.js`

```diff
--- a/dinou/core/asset-extensions.js
+++ b/dinou/core/asset-extensions.js
@@ -6,46 +6,16 @@
 import {
   getAbsPathWithExt,
   stripJsonCommentsAndTrailingCommas,
 } from "./get-abs-path-with-ext.js";
+import {
+  extensions,
+  DEFAULT_EXTENSIONS_SET,
+  globPattern,
+  regex,
+  extensionsWithDot,
+} from "./builtin-asset-extensions.js";
 
-export const extensions = [
-  "png",
-  "jpg",
-  "jpeg",
-  "gif",
-  "svg",
-  "webp",
-  "avif",
-  "ico",
-  "mp4",
-  "webm",
-  "ogg",
-  "mov",
-  "avi",
-  "mkv",
-  "mp3",
-  "wav",
-  "flac",
-  "m4a",
-  "aac",
-  "mjpeg",
-  "mjpg",
-  "woff",
-  "woff2",
-  "ttf",
-  "otf",
-  "eot",
-];
-
-const DEFAULT_EXTENSIONS_SET = new Set(extensions);
+export { extensions, globPattern, regex, extensionsWithDot };
 
 const escapeRegExp = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
-
-export const globPattern = `**/*.{${extensions.join(",")}}`;
-
-// Regex useful for Rollup/Webpack/PostCSS/Esbuild asset matching
-export const regex = new RegExp(`\\.(${extensions.map(escapeRegExp).join("|")})$`, "i");
-
-// Version with leading dot for direct comparisons
-export const extensionsWithDot = extensions.map((ext) => `.${ext}`);
```

### 3.2. [MODIFIED — Full Replacement] `dinou/core/get-abs-path-with-ext.js`

```js
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import resolve from "resolve";
import {
  inferProjectRootFromDir,
  resolveCandidateFile,
  resolveTsconfigAlias,
  stripJsonCommentsAndTrailingCommas,
} from "./tsconfig-aliases.js";

export { stripJsonCommentsAndTrailingCommas };

const STYLESHEET_FILE_RE = /\.(css|scss|sass|less)$/i;

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
  const cleanSpecifier = specifier
    ? specifier.split("?")[0].split("#")[0]
    : specifier;
  if (!cleanSpecifier) return null;

  const parentDir = getParentDirectory(context);
  const projectRoot = inferProjectRootFromDir(parentDir, context?.cwd || null);
  const preferStyles = Boolean(context?.preferStyles);
  const extensions = context?.extensions || null;

  if (cleanSpecifier.startsWith("./") || cleanSpecifier.startsWith("../")) {
    const absPath = path.resolve(parentDir, cleanSpecifier);
    return resolveCandidateFile(absPath, { extensions, preferStyles });
  }

  const viaAlias = resolveTsconfigAlias(cleanSpecifier, {
    projectRoot,
    extensions,
    preferStyles,
  });
  if (viaAlias) {
    return viaAlias;
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
    const req = createRequire(
      path.join(basedir || process.cwd(), "__dinou_resolve__.js")
    );
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
        const directCandidate = resolveCandidateFile(
          path.resolve(pkgDir, normalizedSubpath),
          { preferStyles: true }
        );
        if (directCandidate && STYLESHEET_FILE_RE.test(directCandidate)) {
          return directCandidate;
        }
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

export function resolveCssImportSpecifier(specifier, basedir, customCwd = null) {
  const cleanSpecifier = specifier
    ? specifier.split("?")[0].split("#")[0]
    : specifier;
  if (!cleanSpecifier) return specifier;

  const resolvedAliasOrRel = getAbsPathWithExt(cleanSpecifier, {
    parentDir: basedir || process.cwd(),
    cwd: customCwd || null,
    preferStyles: true,
  });
  if (resolvedAliasOrRel) {
    return resolvedAliasOrRel;
  }

  if (!cleanSpecifier.startsWith("/")) {
    const localCandidate = resolveCandidateFile(
      path.resolve(basedir || process.cwd(), cleanSpecifier),
      { preferStyles: true }
    );
    if (localCandidate) {
      return localCandidate;
    }
  }

  const bareResolved = resolveBareStyleFromNodeModules(
    cleanSpecifier,
    basedir || process.cwd()
  );
  if (bareResolved) {
    return bareResolved;
  }

  throw new Error(
    `[Dinou CSS] Cannot resolve CSS @import "${specifier}" from "${basedir || process.cwd()}"`
  );
}

export function resolveStyleImportFromCode(
  specifier,
  importerFilePath,
  customCwd = null
) {
  const cleanSpecifier = specifier
    ? specifier.split("?")[0].split("#")[0]
    : specifier;
  if (!cleanSpecifier) return null;

  const localOrAlias = getAbsPathWithExt(cleanSpecifier, {
    parentURL: pathToFileURL(importerFilePath).href,
    cwd: customCwd || null,
    preferStyles: true,
  });
  if (localOrAlias && STYLESHEET_FILE_RE.test(localOrAlias)) {
    return localOrAlias;
  }

  const looksLikeStylesheet =
    STYLESHEET_FILE_RE.test(cleanSpecifier) ||
    /(?:^|\/)(?:styles?|css)(?:$|\/)/i.test(cleanSpecifier);
  if (!looksLikeStylesheet) {
    return null;
  }

  const resolved = resolveBareStyleFromNodeModules(
    cleanSpecifier,
    path.dirname(importerFilePath)
  );
  if (resolved && STYLESHEET_FILE_RE.test(resolved)) {
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

### 3.3. [MODIFIED] `dinou/core/resolve-contextual-dinou.js`

```diff
--- a/dinou/core/resolve-contextual-dinou.js
+++ b/dinou/core/resolve-contextual-dinou.js
@@ -2,8 +2,10 @@
 import fs from "node:fs";
 import path from "node:path";
 import { fileURLToPath } from "node:url";
+import { getAliasCandidatePaths } from "./tsconfig-aliases.js";
 
 const CONTEXTUAL_DINOU_FILTER = /^\.\.?[\\/](?:.*[\\/])?dinou(?:\.js)?(?:[?#].*)?$/;
 const UNDERSCORE_SEGMENT_HINT_RE = /(?:^|[\\/])_[^\\/]+(?:[\\/]|$)/;
+const ESBUILD_FORBIDDEN_IMPORT_FILTER = /^[^.\/\\]|(?:^|[\\/])_[^\\/]+(?:[\\/]|$)/;
@@ -129,7 +131,9 @@
   const cleanSpec = specifier.split("?")[0].split("#")[0].replace(/\\/g, "/");
-  if (!UNDERSCORE_SEGMENT_HINT_RE.test(cleanSpec)) {
+  const isRelativeSpec =
+    cleanSpec.startsWith("./") || cleanSpec.startsWith("../");
+  if (isRelativeSpec && !UNDERSCORE_SEGMENT_HINT_RE.test(cleanSpec)) {
     return null;
   }
@@ -164,50 +168,65 @@
-  let candidateTarget = null;
-  if (cleanSpec.startsWith("./") || cleanSpec.startsWith("../")) {
-    candidateTarget = path.resolve(effectiveImporterDir, cleanSpec);
-  } else if (cleanSpec.startsWith("@/") || cleanSpec.startsWith("~/")) {
-    candidateTarget = path.resolve(srcDir, cleanSpec.slice(2));
-  } else if (cleanSpec.startsWith("src/")) {
-    candidateTarget = path.resolve(rootAbs, cleanSpec);
-  } else {
-    return null;
-  }
+  const candidateTargets = [];
+  if (isRelativeSpec) {
+    candidateTargets.push(path.resolve(effectiveImporterDir, cleanSpec));
+  } else {
+    for (const aliasTarget of getAliasCandidatePaths(cleanSpec, rootAbs, {
+      includeBaseUrlFallback: true,
+    })) {
+      candidateTargets.push(aliasTarget);
+    }
+    if (candidateTargets.length === 0 && cleanSpec.startsWith("src/")) {
+      candidateTargets.push(path.resolve(rootAbs, cleanSpec));
+    }
+  }
 
-  const normCandidate = normCompare(candidateTarget);
-  if (
-    normCandidate !== normSrcDir &&
-    !normCandidate.startsWith(normSrcDir + "/")
-  ) {
-    return null;
-  }
-
-  const relTarget = path.relative(srcDir, candidateTarget).replace(/\\/g, "/");
-  if (!relTarget || relTarget.startsWith("..")) {
-    return null;
-  }
-
-  const parts = relTarget.split("/").filter(Boolean);
-  let escapedIdx = parts.slice(0, -1).findIndex((seg) => seg.startsWith("_"));
-
-  if (escapedIdx === -1 && parts.length > 0 && parts[parts.length - 1].startsWith("_")) {
-    try {
-      if (
-        fs.existsSync(candidateTarget) &&
-        fs.statSync(candidateTarget).isDirectory()
-      ) {
-        escapedIdx = parts.length - 1;
-      }
-    } catch (e) {}
-  }
-
-  if (escapedIdx === -1) {
-    return null;
-  }
-
-  const escapedFolderRel = "src/" + parts.slice(0, escapedIdx + 1).join("/");
-  const importerRel = path
-    .relative(rootAbs, mappedImporter)
-    .replace(/\\/g, "/");
-
-  return (
-    `Cannot import "${specifier}" from "${importerRel}": directories prefixed with "_" ("${escapedFolderRel}") ` +
-    `are ignored by Dinou's router and bundlers. For active components, hooks, or actions, remove the leading "_" from the folder name.`
-  );
+  for (const candidateTarget of candidateTargets) {
+    const normCandidate = normCompare(candidateTarget);
+    if (
+      normCandidate !== normSrcDir &&
+      !normCandidate.startsWith(normSrcDir + "/")
+    ) {
+      continue;
+    }
+
+    const relTarget = path
+      .relative(srcDir, candidateTarget)
+      .replace(/\\/g, "/");
+    if (!relTarget || relTarget.startsWith("..")) {
+      continue;
+    }
+
+    const parts = relTarget.split("/").filter(Boolean);
+    let escapedIdx = parts
+      .slice(0, -1)
+      .findIndex((seg) => seg.startsWith("_"));
+
+    if (
+      escapedIdx === -1 &&
+      parts.length > 0 &&
+      parts[parts.length - 1].startsWith("_")
+    ) {
+      try {
+        if (
+          fs.existsSync(candidateTarget) &&
+          fs.statSync(candidateTarget).isDirectory()
+        ) {
+          escapedIdx = parts.length - 1;
+        }
+      } catch (e) {}
+    }
+
+    if (escapedIdx === -1) {
+      continue;
+    }
+
+    const escapedFolderRel = "src/" + parts.slice(0, escapedIdx + 1).join("/");
+    const importerRel = path
+      .relative(rootAbs, mappedImporter)
+      .replace(/\\/g, "/");
+
+    return (
+      `Cannot import "${specifier}" from "${importerRel}": directories prefixed with "_" ("${escapedFolderRel}") ` +
+      `are ignored by Dinou's router and bundlers. For active components, hooks, or actions, remove the leading "_" from the folder name.`
+    );
+  }
+
+  return null;
 }
@@ -328,5 +347,5 @@
     setup(build) {
-      build.onResolve({ filter: UNDERSCORE_SEGMENT_HINT_RE }, (args) => {
+      build.onResolve({ filter: ESBUILD_FORBIDDEN_IMPORT_FILTER }, (args) => {
         const importer = args.importer || args.resolveDir;
```

### 3.4. [MODIFIED] `dinou/core/load-dinou-config.js`

```diff
--- a/dinou/core/load-dinou-config.js
+++ b/dinou/core/load-dinou-config.js
@@ -67,6 +67,9 @@
             const bundledPath = path.resolve(outDir, "dinou.config.bundled.mjs");
+            const { esbuildTsconfigAliasesPlugin } = await import(
+              "./tsconfig-aliases.js"
+            );
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
+                esbuildTsconfigAliasesPlugin({
+                  projectRoot: cwd,
+                  skipAssets: false,
+                }),
               ],
             });
```

### 3.5. [MODIFIED] `dinou/core/server-css-modules-plugin.js`

```diff
--- a/dinou/core/server-css-modules-plugin.js
+++ b/dinou/core/server-css-modules-plugin.js
@@ -16,2 +16,7 @@
 const serverCssModuleCache = new Map();
 const lastKnownExportJsonByFile = new Map();
+
+export function clearServerCssModulesCache() {
+  serverCssModuleCache.clear();
+  lastKnownExportJsonByFile.clear();
+}
```

### 3.6. [MODIFIED] `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`

```diff
--- a/dinou/esbuild/helpers-esbuild/get-config-esbuild.js
+++ b/dinou/esbuild/helpers-esbuild/get-config-esbuild.js
@@ -9,6 +9,9 @@
 import { esbuildContextualDinouPlugin } from "../../core/resolve-contextual-dinou.js";
 import { copyStaticDirectoriesToOutdir } from "../../core/copy-static-dirs.js";
 import { getEsbuildPublicEnvDefines } from "../../core/env.js";
-import { stripJsonCommentsAndTrailingCommas } from "../../core/get-abs-path-with-ext.js";
+import { getAssetExtensionsInfo } from "../../core/asset-extensions.js";
+import {
+  esbuildTsconfigAliasesPlugin,
+  getSanitizedEsbuildTsconfigRaw,
+} from "../../core/tsconfig-aliases.js";
 import fs from "node:fs";
-import path from "node:path";
@@ -34,6 +37,12 @@
   let plugins = [
     esbuildContextualDinouPlugin({ projectRoot: process.cwd() }),
+    esbuildTsconfigAliasesPlugin({
+      projectRoot: process.cwd(),
+      getAssetRegex: () =>
+        getAssetExtensionsInfo(dinouConfig, process.cwd()).regex,
+      preferSwcMirror: true,
+    }),
     swcRedirectPlugin({ projectRoot: process.cwd() }),
@@ -116,35 +125,1 @@
-  let userTsconfig = {};
-  if (fs.existsSync("tsconfig.json")) {
-    try {
-      const raw = fs.readFileSync("tsconfig.json", "utf8");
-      const clean = stripJsonCommentsAndTrailingCommas(raw);
-      userTsconfig = JSON.parse(clean);
-    } catch (e) {}
-  }
-  const compilerOptions = userTsconfig.compilerOptions || {};
-  const userPaths = compilerOptions.paths || {};
-
-  const paths = {};
-  for (const [alias, targets] of Object.entries(userPaths)) {
-    const list = Array.isArray(targets) ? targets : [targets];
-    const swcTargets = list.map((t) => {
-      const norm = t.replace(/^\.\//, "");
-      return `.dinou/swc/${norm}`;
-    });
-    paths[alias] = [...swcTargets, ...list];
-  }
-  if (!paths["@/*"]) {
-    paths["@/*"] = [".dinou/swc/src/*", "src/*"];
-  }
-  if (!paths["~/*"]) {
-    paths["~/*"] = [".dinou/swc/src/*", "src/*"];
-  }
-
-  const tsconfigRaw = {
-    ...userTsconfig,
-    compilerOptions: {
-      ...compilerOptions,
-      baseUrl: compilerOptions.baseUrl || ".",
-      paths,
-    },
-  };
+  const tsconfigRaw = getSanitizedEsbuildTsconfigRaw(process.cwd());
```

### 3.7. [MODIFIED — Full Replacement] `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`

```js
import reactClientManifestPlugin from "../plugins-esbuild/react-client-manifest-plugin.js";
import serverFunctionsPlugin from "../plugins-esbuild/server-functions-plugin.js";
import cssProcessorPlugin from "../plugins-esbuild/css-processor-plugin.js";
import assetsPlugin from "../plugins-esbuild/assets-plugin.js";
import manifestGeneratorPlugin from "../plugins-esbuild/manifest-generator-plugin.js";
import writePlugin from "../plugins-esbuild/write-plugin.js";
import babelReactCompilerPlugin from "../plugins-esbuild/babel-react-compiler-plugin.js";
import { esbuildContextualDinouPlugin } from "../../core/resolve-contextual-dinou.js";
import { copyStaticDirectoriesToOutdir } from "../../core/copy-static-dirs.js";
import { getEsbuildPublicEnvDefines } from "../../core/env.js";
import { getAssetExtensionsInfo } from "../../core/asset-extensions.js";
import {
  esbuildTsconfigAliasesPlugin,
  getSanitizedEsbuildTsconfigRaw,
} from "../../core/tsconfig-aliases.js";
import { existsSync } from "node:fs";

export default function getConfigEsbuildProd({
  entryPoints,
  outdir = ".dinou/dist3",
  manifest = {},
  serverFiles,
  serverAssetPaths = [],
  dinouConfig = null,
  reactCompiler = true,
}) {
  const manifestData = {};
  const projectRoot = process.cwd();
  const parsedTsconfig = getSanitizedEsbuildTsconfigRaw(projectRoot);
  const { regex: activeAssetRegex } = getAssetExtensionsInfo(
    dinouConfig,
    projectRoot
  );
  let plugins = [
    esbuildContextualDinouPlugin({ projectRoot }),
    esbuildTsconfigAliasesPlugin({
      projectRoot,
      assetRegex: activeAssetRegex,
    }),
    cssProcessorPlugin({ outdir }),
    reactClientManifestPlugin({
      manifest,
      manifestPath: `.dinou/dist1/react-client-manifest.json`,
    }),
    assetsPlugin({
      dinouConfig,
      serverAssetPaths,
      projectRoot,
    }),
    manifestGeneratorPlugin(manifestData),
    serverFunctionsPlugin({ manifestData, serverFiles }),
    reactCompiler && babelReactCompilerPlugin({ serverFiles }),
    writePlugin(),
  ].filter(Boolean);

  if (existsSync("public")) {
    plugins = [
      ...plugins,
      {
        name: "copy-static-files",
        setup(build) {
          build.onEnd(() => {
            copyStaticDirectoriesToOutdir(projectRoot, outdir);
          });
        },
      },
    ];
  }

  return {
    entryPoints,
    outdir,
    format: "esm",
    bundle: true,
    splitting: true,
    sourcemap: false,
    chunkNames: "[name]-[hash]",
    entryNames: "[name]-[hash]",
    tsconfigRaw: parsedTsconfig,
    jsx: "automatic",
    target: "es2022",
    write: false,
    conditions: ["style"],
    metafile: true,
    logLevel: "warning",
    minify: true,
    define: getEsbuildPublicEnvDefines({ mode: "production" }),
    external: [
      "/__SERVER_FUNCTION_PROXY__",
      "/serverFunctionProxy.js",
      "/__hmr_client__.js",
      "/react-refresh-entry.js",
    ],
    plugins,
  };
}
```

### 3.8. [MODIFIED] `dinou/esbuild/helpers-esbuild/get-esbuild-entries.js`, `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js`, & `dinou/webpack/helpers/get-webpack-entries.js`

In all three entry/manifest discovery scanners:

```diff
       const absImportPathWithExt =
         getAbsPathWithExt(source, {
           parentURL: pathToFileURL(baseFilePath).href,
+          cwd: projectRoot,
         }) ||
-        resolveStyleImportFromCode(source, baseFilePath) ||
+        resolveStyleImportFromCode(source, baseFilePath, projectRoot) ||
         resolveAssetImport(source, {
           importer: baseFilePath,
           projectRoot,
           assetRegex: activeAssetInclude,
         });
```

### 3.9. [MODIFIED] `dinou/esbuild/helpers-esbuild/swc-disk-cache.js`

```diff
--- a/dinou/esbuild/helpers-esbuild/swc-disk-cache.js
+++ b/dinou/esbuild/helpers-esbuild/swc-disk-cache.js
@@ -71,25 +71,37 @@
-  try {
-    const { code } = await transform(raw, {
-      filename: normSrc,
-      sourceMaps: "inline",
-      jsc: {
-        parser: { syntax: "typescript", tsx: true, dynamicImport: true },
-        target: "es2022",
-        transform: {
-          react: {
-            refresh: true,
-            development: true,
-            runtime: "automatic",
-          },
-        },
-      },
-    });
-    await fs.mkdir(path.dirname(targetPath), { recursive: true });
-    await fs.writeFile(targetPath, code, "utf8");
-    return targetPath;
-  } catch (err) {
-    await fs.mkdir(path.dirname(targetPath), { recursive: true });
-    await fs.writeFile(targetPath, raw, "utf8");
-    return targetPath;
-  }
+  let compiledCode = raw;
+  try {
+    const { code } = await transform(raw, {
+      filename: normSrc,
+      configFile: false,
+      swcrc: false,
+      sourceMaps: "inline",
+      jsc: {
+        parser: { syntax: "typescript", tsx: true, dynamicImport: true },
+        target: "es2022",
+        transform: {
+          react: {
+            refresh: true,
+            development: true,
+            runtime: "automatic",
+          },
+        },
+      },
+    });
+    compiledCode = code;
+  } catch (err) {
+    compiledCode = raw;
+  }
+
+  const targetDir = path.dirname(targetPath);
+  for (let attempt = 0; attempt < 3; attempt++) {
+    try {
+      await fs.mkdir(targetDir, { recursive: true });
+      await fs.writeFile(targetPath, compiledCode, "utf8");
+      break;
+    } catch (ioErr) {
+      if (attempt === 2) throw ioErr;
+      await new Promise((r) => setTimeout(r, 15));
+    }
+  }
+  return targetPath;
```

### 3.10. [MODIFIED] `dinou/esbuild/build.js`

```diff
--- a/dinou/esbuild/build.js
+++ b/dinou/esbuild/build.js
@@ -13,4 +13,8 @@
 import { getDinouConfig } from "../core/load-dinou-config.js";
-import { createServerAssetPlugin } from "../core/asset-extensions.js";
+import {
+  createServerAssetPlugin,
+  getAssetExtensionsInfo,
+} from "../core/asset-extensions.js";
 import { createServerCssModulesPlugin } from "../core/server-css-modules-plugin.js";
+import { esbuildTsconfigAliasesPlugin } from "../core/tsconfig-aliases.js";
 import { loadEnvFiles, getEsbuildPublicEnvDefines } from "../core/env.js";
@@ -153,5 +157,9 @@
     plugins: [
       esbuildContextualDinouPlugin({ projectRoot: process.cwd() }),
+      esbuildTsconfigAliasesPlugin({
+        projectRoot: process.cwd(),
+        assetRegex: getAssetExtensionsInfo(dinouConfig, process.cwd()).regex,
+      }),
       createServerCssModulesPlugin({ projectRoot: process.cwd() }),
       createServerAssetPlugin({ projectRoot: process.cwd(), dinouConfig }),
     ],
```

### 3.11. [MODIFIED] `dinou/rollup/rollup.config.js`

```diff
--- a/dinou/rollup/rollup.config.js
+++ b/dinou/rollup/rollup.config.js
@@ -25,3 +25,3 @@
 import dinouAssetPlugin from "./rollup-plugins/dinou-asset-plugin.js";
-import tsconfigPaths from "#rollup-plugin-tsconfig-paths";
+import { rollupTsconfigAliasesPlugin } from "../core/tsconfig-aliases.js";
 import serverFunctionsPlugin from "./rollup-plugins/rollup-plugin-server-functions.js";
@@ -188,14 +188,17 @@
-      tsconfigPaths(),
+      rollupTsconfigAliasesPlugin({
+        projectRoot: process.cwd(),
+        assetRegex: activeAssetRegex,
+      }),
       replace({
         preventAssignment: true,
         values: rollupExactEnv,
       }),
       replace({
         preventAssignment: true,
         delimiters: ["(?<!\\.)\\b", "\\b"],
         values: rollupObjectEnv,
       }),
       json(),
       resolve({
-        extensions: [".mjs", ".js", ".jsx", ".ts", ".tsx", ".json", ".css"],
+        extensions: [".mjs", ".js", ".jsx", ".ts", ".tsx", ".cjs", ".json", ".css"],
@@ -381,5 +384,10 @@
+      rollupTsconfigAliasesPlugin({
+        projectRoot: process.cwd(),
+        assetRegex: activeAssetRegex,
+      }),
       resolve({
+        extensions: [".mjs", ".js", ".jsx", ".ts", ".tsx", ".cjs", ".json"],
         exportConditions: ["react-server", "node", "import"],
         preferBuiltins: true,
         browser: false,
       }),
```

### 3.12. [MODIFIED] `dinou/webpack/webpack.config.js`

```diff
--- a/dinou/webpack/webpack.config.js
+++ b/dinou/webpack/webpack.config.js
@@ -29,3 +29,6 @@
 import { getDinouConfig } from "../core/load-dinou-config.js";
-import TsconfigPathsPlugin from "#tsconfig-paths-webpack-plugin";
+import {
+  createWebpackTsconfigAliasesResolvePlugin,
+  getWatchedTsconfigFiles,
+} from "../core/tsconfig-aliases.js";
 import manifestGeneratorPlugin from "./plugins/manifest-generator-plugin.js";
@@ -59,13 +62,1 @@
 const outputDirectory = isDevelopment ? ".dinou/public" : ".dinou/dist3";
-
-function getConfigFileIfExists() {
-  const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
-  const jsconfigPath = path.resolve(process.cwd(), "jsconfig.json");
-
-  if (fs.existsSync(tsconfigPath)) return tsconfigPath;
-  if (fs.existsSync(jsconfigPath)) return jsconfigPath;
-
-  return null;
-}
-
-const configFile = getConfigFileIfExists();
@@ -491,6 +482,11 @@
           compiler.hooks.afterCompile.tap("DinouWatchSrcPlugin", (compilation) => {
             const srcDir = path.resolve(process.cwd(), "src");
             if (fs.existsSync(srcDir)) {
               compilation.contextDependencies.add(srcDir);
             }
+            for (const cfgPath of getWatchedTsconfigFiles(process.cwd())) {
+              if (fs.existsSync(cfgPath)) {
+                compilation.fileDependencies.add(cfgPath);
+              }
+            }
           });
@@ -673,24 +669,23 @@
     resolve: {
       conditionNames: ["style", "import", "module", "browser", "default"],
-      extensions: [".js", ".jsx", ".ts", ".tsx", ".css"],
+      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".css"],
       modules: ["src", "node_modules"],
       extensionAlias: {
         ".js": [".js", ".ts", ".tsx"],
         ".jsx": [".jsx", ".tsx"],
+        ".mjs": [".mjs", ".mts"],
+        ".cjs": [".cjs", ".cts"],
       },
       alias: {
         ...(isEjected ? { dinou: localDinouPath } : {}),
       },
       fallback: {
         async_hooks: false,
         "node:async_hooks": false,
       },
-      plugins: configFile
-        ? [
-          new TsconfigPathsPlugin({
-            configFile,
-            extensions: [".js", ".jsx", ".ts", ".tsx", ".css"],
-          }),
-        ]
-        : [],
+      plugins: [
+        createWebpackTsconfigAliasesResolvePlugin({
+          projectRoot: process.cwd(),
+        }),
+      ],
     },
@@ -796,15 +791,18 @@
     resolve: {
       conditionNames: ["react-server", "node", "import", "require"],
-      extensions: [".js", ".jsx", ".ts", ".tsx"],
+      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json"],
+      extensionAlias: {
+        ".js": [".js", ".ts", ".tsx"],
+        ".jsx": [".jsx", ".tsx"],
+        ".mjs": [".mjs", ".mts"],
+        ".cjs": [".cjs", ".cts"],
+      },
       alias: {
         ...(isEjected ? { dinou: localDinouPath } : {}),
       },
-      plugins: configFile
-        ? [
-            new TsconfigPathsPlugin({
-              configFile,
-              extensions: [".js", ".jsx", ".ts", ".tsx", ".css"],
-            }),
-          ]
-        : [],
+      plugins: [
+        createWebpackTsconfigAliasesResolvePlugin({
+          projectRoot: process.cwd(),
+        }),
+      ],
     },
```

### 3.13. [MODIFIED] `dinou/node/dev.js`

```diff
--- a/dinou/node/dev.js
+++ b/dinou/node/dev.js
@@ -66,6 +66,13 @@
 import {
+  clearServerCssModulesCache,
   createServerCssModulesPlugin,
   didCssModuleExportsChange,
 } from "../core/server-css-modules-plugin.js";
 import { resolveStyleImportFromCode } from "../core/get-abs-path-with-ext.js";
+import {
+  clearTsconfigAliasCache,
+  esbuildTsconfigAliasesPlugin,
+  getWatchedTsconfigFiles,
+  matchesExplicitUserAlias,
+} from "../core/tsconfig-aliases.js";
@@ -1364,5 +1371,4 @@
 const commonAlias = {
-  "@": path.resolve(projectRoot, "src"),
   "dinou/config": path.resolve(dinouDir, "core/config.js"),
   dinou: dinouDir,
 };
@@ -1374,6 +1380,11 @@
 const serverAssetPlugin = createServerAssetPlugin({
   projectRoot,
   dinouConfig,
   emitToDevMemory: true,
 });
+
+const serverTsconfigAliasesPlugin = esbuildTsconfigAliasesPlugin({
+  projectRoot,
+  getAssetRegex: () => getAssetExtensionsInfo(dinouConfig, projectRoot).regex,
+});
@@ -1399,7 +1410,27 @@
-        // 4. Aliases
-        if (args.path.startsWith("@/") || args.path === "@") {
-          return null;
-        }
         if (args.path === "dinou" || args.path.startsWith("dinou/")) {
           return null;
         }
+        if (matchesExplicitUserAlias(args.path, projectRoot)) {
+          let pkgExists = false;
+          try {
+            const cacheKey = `${args.path}::${args.resolveDir || projectRoot}`;
+            let resolved = resolvePkgCache.get(cacheKey);
+            if (resolved === undefined) {
+              try {
+                resolved = require.resolve(args.path, {
+                  paths: [args.resolveDir || projectRoot],
+                });
+              } catch (e) {
+                resolved = null;
+              }
+              resolvePkgCache.set(cacheKey, resolved);
+            }
+            pkgExists = Boolean(resolved);
+          } catch (e) {}
+          if (!pkgExists) {
+            return null;
+          }
+        }
```

Plus wrapping `ctxA` inside `async function createRscContext()` (including `serverTsconfigAliasesPlugin` alongside `createSsrContext()`), adding `refreshAliases()` to Webpack's dev bundler handle, and wiring `triggerTsconfigReload` + `tsconfigExtendsWatcher` into `envWatcher` and `cleanup()` so editing `tsconfig.json`, `jsconfig.json`, or any local extended config file hot-reloads aliases in `dinou dev` without restarting.

### 3.14. [MODIFIED] `dinou/node/bundle-dual-engine.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`, & `dinou/deno/build.js`

Across all 4 Dual-Engine production runtime compilers:
- Removed hardcoded `"@": path.resolve(projectRoot, "src")` from `commonAlias`.
- Created `const serverTsconfigAliasesPlugin = esbuildTsconfigAliasesPlugin({ projectRoot, assetRegex: getAssetExtensionsInfo(dinouConfig, projectRoot).regex });`
- Added `serverTsconfigAliasesPlugin` right after `esbuildContextualDinouPlugin({ projectRoot })` in Pass A (`rsc-engine`), Pass B (`ssr-engine`), and Pass C (Cloudflare `worker.js`, Bun `server.js`, Deno `main.js`).

---

## 4. `CHANGELOG.md` Entry (`9.4.0`)

```markdown
### Added
- **Unified TypeScript-Spec `tsconfig.json` & `jsconfig.json` Path Aliases Engine (`dinou/core/tsconfig-aliases.js`)**: Full support for multiple granular aliases (`@components/*`, `@server/*`, `@lib/*`, `@styles/*`, `@assets/*`), longest-prefix specificity sorting, exact single-file mappings, prefix/suffix wildcards, multi-target fallback arrays, recursive `"extends"` chains (including monorepo parent configs with `baseUrl`, TypeScript 5.0+ array `extends`, `node_modules` presets, and `${configDir}`), TypeScript ESM `.js` → `.ts`/`.tsx` extension substitution, `dinou.config.ts` aliased imports, and live hot-reloading of `tsconfig.json` / `jsconfig.json` in `dinou dev` across Esbuild, Rollup, and Webpack.

### Fixed
- **Custom Path Aliases in `dinou dev` & Edge/Server Runtimes**: Fixed `createDevExternalPackagesPlugin` in `dinou/node/dev.js` and hardcoded `commonAlias` maps in `node`, `cloudflare`, `bun`, `deno`, `esbuild/build.js`, and `rollup/rollup.config.js` (`serverConfig`) where any alias other than `@/*` was treated as an external `node_modules` package and crashed at runtime with `ERR_MODULE_NOT_FOUND`.
- **Aliased Stylesheet & CSS Module Imports in Rollup & Esbuild Prod**: Replaced `rollup-plugin-tsconfig-paths` and `@esbuild-plugins/tsconfig-paths` (which delegated to TypeScript's JS-only module resolver and failed on `.css` / `.module.css` imports and `jsconfig.json` projects) with Dinou's unified alias plugins.
- **Esbuild Dev `.dinou/swc` Mirror Resolution with Explicit `baseUrl`**: Fixed `get-config-esbuild.js` resolving `.dinou/swc` mirror targets relative to `compilerOptions.baseUrl` (which broke projects setting `"baseUrl": "./src"`), and isolated SWC compilation from disk `mkdir` retries in `swc-disk-cache.js`.
- **Underscore (`_folder`) Escape Enforcement Across Custom Aliases**: Updated `checkForbiddenUnderscoreImport` in `dinou/core/resolve-contextual-dinou.js` so custom `tsconfig.json` / `jsconfig.json` aliases pointing into `_`-prefixed directories under `src/` are blocked consistently across all bundlers.
```

---

## 5. Automated Test Suites

### 5.1. Unit & Multi-Bundler / Multi-Runtime Integration Test Suite (`tests/unit/tsconfig-aliases.test.mjs`)

Run with:
```bash
node --conditions=react-server --test tests/unit/tsconfig-aliases.test.mjs
```

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const DINOU_DIR = fs.existsSync(path.join(REPO_ROOT, "dinou", "cli.js"))
  ? path.join(REPO_ROOT, "dinou")
  : fs.existsSync(path.join(REPO_ROOT, "cli.js"))
    ? REPO_ROOT
    : path.join(REPO_ROOT, "node_modules", "dinou", "dinou");

const aliasesMod = await import(
  pathToFileURL(path.join(DINOU_DIR, "core/tsconfig-aliases.js")).href
);
const builtinAssetsMod = await import(
  pathToFileURL(path.join(DINOU_DIR, "core/builtin-asset-extensions.js")).href
);
const assetExtensionsMod = await import(
  pathToFileURL(path.join(DINOU_DIR, "core/asset-extensions.js")).href
);
const absPathMod = await import(
  pathToFileURL(path.join(DINOU_DIR, "core/get-abs-path-with-ext.js")).href
);
const contextualMod = await import(
  pathToFileURL(path.join(DINOU_DIR, "core/resolve-contextual-dinou.js")).href
);
const configLoaderMod = await import(
  pathToFileURL(path.join(DINOU_DIR, "core/load-dinou-config.js")).href
);
const createScopedName = (
  await import(
    pathToFileURL(path.join(DINOU_DIR, "core/createScopedName.js")).href
  )
).default;

const TMP_BASE = path.join(REPO_ROOT, ".dinou", "tmp-alias-unit-fixtures");

function createTempDir(prefix) {
  fs.mkdirSync(TMP_BASE, { recursive: true });
  return fs.mkdtempSync(path.join(TMP_BASE, prefix));
}

test.after(() => {
  try {
    fs.rmSync(TMP_BASE, { recursive: true, force: true });
  } catch (e) {}
});

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.resolve(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(abs, content);
    } else {
      fs.writeFileSync(abs, content, "utf8");
    }
  }
}

function linkDinouShim(fixtureRoot) {
  const dinouShimDir = path.join(fixtureRoot, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouRootUrl = pathToFileURL(DINOU_DIR).href;
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
    `export * from ${JSON.stringify(`${dinouRootUrl}/index.js`)};\nexport { default } from ${JSON.stringify(`${dinouRootUrl}/index.js`)};\n`,
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
}

function resolveBinScript(candidates) {
  for (const rel of candidates) {
    const abs = path.join(REPO_ROOT, rel);
    if (fs.existsSync(abs)) return abs;
  }
  throw new Error(`Could not locate binary script from: ${candidates.join(", ")}`);
}

test("1. TypeScript paths spec: specificity sorting, exact match, suffix wildcards, multi-target fallbacks, BOM/JSONC, .js->.ts substitution, sibling .tsx vs .css, and canonical builtin asset extensions", () => {
  assert.strictEqual(
    builtinAssetsMod.extensions,
    assetExtensionsMod.extensions
  );
  assert.strictEqual(builtinAssetsMod.regex, assetExtensionsMod.regex);
  const defaultRollupPlugin = aliasesMod.rollupTsconfigAliasesPlugin({
    projectRoot: REPO_ROOT,
  });
  assert.equal(defaultRollupPlugin.resolveId("@/clip.mov", undefined, {}), null);
  assert.equal(defaultRollupPlugin.resolveId("@/video.mkv", undefined, {}), null);

  const tmp = createTempDir("spec-");
  try {
    writeFiles(tmp, {
      "tsconfig.json":
        "\uFEFF{\n" +
        "  // JSONC line comment with URL https://dinou.dev\n" +
        "  /* Block comment */\n" +
        '  "compilerOptions": {\n' +
        '    "paths": {\n' +
        '      "@ui/*": ["./src/ui/*"],\n' +
        '      "@ui/icons/*": ["./src/icons/*"],\n' +
        '      "@config": ["./src/exact-config.ts"],\n' +
        '      "@icons/*.svg": ["./src/svg-icons/*.svg"],\n' +
        '      "~*": ["./src/tilde/*"],\n' +
        '      "@shared/*": ["./src/local-override/*", "./shared-lib/*"],\n' +
        '      "@/*": ["./src/*"],\n' +
        "    },\n" +
        "  },\n" +
        "}\n",
      "src/ui/button.tsx": "export const Button = () => null;",
      "src/icons/check.tsx": "export const Check = () => null;",
      "src/exact-config.ts": "export const EXACT = true;",
      "src/svg-icons/star.svg": "<svg></svg>",
      "src/tilde/helper.ts": "export const tilde = 1;",
      "src/local-override/only-local.ts": "export const local = true;",
      "shared-lib/only-shared.ts": "export const shared = true;",
      "shared-lib/only-local.ts": "export const shadowed = false;",
      "src/lib/esm-target.ts": "export const esm = 42;",
      "src/components/Widget.tsx": "export const Widget = () => null;",
      "src/components/Widget.css": ".widget { color: red; }",
      "src/components/Modal/index.tsx": "export const Modal = () => null;",
    });

    assert.equal(
      aliasesMod.resolveTsconfigAlias("@ui/icons/check", { projectRoot: tmp }),
      path.join(tmp, "src/icons/check.tsx")
    );
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@ui/button", { projectRoot: tmp }),
      path.join(tmp, "src/ui/button.tsx")
    );
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@config", { projectRoot: tmp }),
      path.join(tmp, "src/exact-config.ts")
    );
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@icons/star.svg", { projectRoot: tmp }),
      path.join(tmp, "src/svg-icons/star.svg")
    );
    assert.equal(
      aliasesMod.resolveTsconfigAlias("~helper", { projectRoot: tmp }),
      path.join(tmp, "src/tilde/helper.ts")
    );
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@shared/only-local", { projectRoot: tmp }),
      path.join(tmp, "src/local-override/only-local.ts")
    );
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@shared/only-shared", { projectRoot: tmp }),
      path.join(tmp, "shared-lib/only-shared.ts")
    );
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@/lib/esm-target.js", { projectRoot: tmp }),
      path.join(tmp, "src/lib/esm-target.ts")
    );
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@/components/Modal", { projectRoot: tmp }),
      path.join(tmp, "src/components/Modal/index.tsx")
    );

    assert.equal(
      absPathMod.getAbsPathWithExt("@/components/Widget", { cwd: tmp }),
      path.join(tmp, "src/components/Widget.tsx")
    );
    assert.equal(
      absPathMod.resolveCssImportSpecifier(
        "@/components/Widget",
        path.join(tmp, "src/styles"),
        tmp
      ),
      path.join(tmp, "src/components/Widget.css")
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("2. Recursive extends (monorepo parent baseUrl, TS 5 array extends, node_modules preset, ${configDir}), jsconfig.json, zero-config fallback, and live mtime reload", () => {
  const mono = createTempDir("extends-");
  try {
    const appDir = path.join(mono, "apps/web");
    writeFiles(mono, {
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@monorepo/*": ["packages/common/src/*"],
          },
        },
      }),
      "packages/common/src/greeting.ts": "export const hi = 'mono';",
      "apps/web/node_modules/@acme/tsconfig/base.json": JSON.stringify({
        compilerOptions: {
          experimentalDecorators: true,
        },
      }),
      "apps/web/tsconfig.paths.json": JSON.stringify({
        compilerOptions: {
          paths: {
            "@monorepo/*": ["packages/common/src/*"],
            "@cfgdir/*": ["${configDir}/src/cfg/*"],
          },
        },
      }),
      "apps/web/tsconfig.json": JSON.stringify({
        extends: [
          "../../tsconfig.base.json",
          "@acme/tsconfig/base.json",
          "./tsconfig.paths.json",
        ],
      }),
      "apps/web/src/cfg/env.ts": "export const cfg = true;",
      "apps/web/src/default-at.ts": "export const defAt = true;",
    });

    assert.equal(
      aliasesMod.resolveTsconfigAlias("@monorepo/greeting", {
        projectRoot: appDir,
      }),
      path.join(mono, "packages/common/src/greeting.ts")
    );
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@cfgdir/env", { projectRoot: appDir }),
      path.join(appDir, "src/cfg/env.ts")
    );
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@/default-at", { projectRoot: appDir }),
      path.join(appDir, "src/default-at.ts")
    );
    const rawEsbuild = aliasesMod.getSanitizedEsbuildTsconfigRaw(appDir);
    assert.equal(rawEsbuild.compilerOptions.experimentalDecorators, true);

    writeFiles(mono, {
      "apps/docs/tsconfig.json": JSON.stringify({
        extends: "../../tsconfig.base.json",
      }),
    });
    const docsDir = path.join(mono, "apps/docs");
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@monorepo/greeting", {
        projectRoot: docsDir,
      }),
      path.join(mono, "packages/common/src/greeting.ts")
    );

    const futureTime = new Date(Date.now() + 5000);
    writeFiles(mono, {
      "apps/docs/src/new-mod.ts": "export const fresh = 1;",
      "apps/docs/tsconfig.json": JSON.stringify({
        compilerOptions: {
          paths: {
            "@fresh/*": ["./src/*"],
          },
        },
      }),
    });
    fs.utimesSync(path.join(docsDir, "tsconfig.json"), futureTime, futureTime);
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@fresh/new-mod", {
        projectRoot: docsDir,
      }),
      path.join(docsDir, "src/new-mod.ts")
    );

    const jsApp = path.join(mono, "apps/js-only");
    writeFiles(jsApp, {
      "jsconfig.json": JSON.stringify({
        compilerOptions: {
          paths: {
            "@utils/*": ["./src/utils/*"],
          },
        },
      }),
      "src/utils/math.js": "export const sum = (a, b) => a + b;",
    });
    assert.equal(
      aliasesMod.resolveTsconfigAlias("@utils/math", { projectRoot: jsApp }),
      path.join(jsApp, "src/utils/math.js")
    );
  } finally {
    fs.rmSync(mono, { recursive: true, force: true });
  }
});

test("3. Underscore _folder escape guard works on custom aliases + dinou.config.ts supports tsconfig aliases", async () => {
  const tmp = createTempDir("guard-");
  try {
    linkDinouShim(tmp);
    writeFiles(tmp, {
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          paths: {
            "@docs/*": ["./src/docs/*"],
            "@secret/*": ["./src/docs/_private/*"],
            "@cfg/*": ["./config/*"],
          },
        },
      }),
      "config/ext.ts": 'export const EXTRA_ASSETS = [".glb"];',
      "dinou.config.ts":
        'import { EXTRA_ASSETS } from "@cfg/ext";\n' +
        "export default { assetExtensions: EXTRA_ASSETS };\n",
      "src/page.tsx": "export default function Page() { return null; }",
      "src/docs/_private/Hidden.tsx": "export const Hidden = 1;",
    });

    const err1 = contextualMod.checkForbiddenUnderscoreImport(
      "@docs/_private/Hidden",
      path.join(tmp, "src/page.tsx"),
      tmp,
      { importerIsFile: true }
    );
    assert.ok(err1 && err1.includes("src/docs/_private"));

    const err2 = contextualMod.checkForbiddenUnderscoreImport(
      "@secret/Hidden",
      path.join(tmp, "src/page.tsx"),
      tmp,
      { importerIsFile: true }
    );
    assert.ok(err2 && err2.includes("src/docs/_private"));

    delete globalThis.__DINOU_CONFIG__;
    delete globalThis.__DINOU_CONFIG_CWD__;
    const loadedCfg = await configLoaderMod.getDinouConfig(tmp);
    assert.deepEqual(loadedCfg.assetExtensions, [".glb"]);
    delete globalThis.__DINOU_CONFIG__;
    delete globalThis.__DINOU_CONFIG_CWD__;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("4. Full Matrix End-to-End Build & Runtime Parity (Esbuild Dev + Esbuild/Rollup/Webpack Prod + Node/Cloudflare/Bun/Deno + Static Export)", async () => {
  const tmp = createTempDir("matrix-");
  const prevCwd = process.cwd();
  try {
    linkDinouShim(tmp);

    const pngBytes = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
      "hex"
    );

    writeFiles(tmp, {
      "package.json": JSON.stringify({
        name: "alias-matrix-app",
        type: "module",
        private: true,
      }),
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: {
          baseUrl: "./src",
          paths: {
            "@ui/*": ["ui/*"],
            "@ui/icons/*": ["icons/*"],
            "@components/*": ["components/*"],
            "@server/*": ["server-functions/*"],
            "@lib/*": ["lib/*"],
            "@styles/*": ["styles/*"],
            "@assets/*": ["assets/*"],
            "@shared/*": ["override/*", "../external-shared/*"],
          },
        },
      }),
      "tsconfig.json": JSON.stringify({
        extends: "./tsconfig.base.json",
      }),
      "external-shared/banner.ts":
        'export const SHARED_BANNER = "FROM_EXTERNAL_SHARED_FALLBACK";\n',
      "src/ui/box.tsx":
        'export function Box({ children }: { children: any }) { return <section data-ui="box">{children}</section>; }\n',
      "src/icons/spark.tsx":
        'export function SparkIcon() { return <span data-icon="spark">SPARK_SPECIFICITY_OK</span>; }\n',
      "src/lib/utils/index.ts":
        'export function formatTag(v: string) { return `TAG:${v}`; }\n',
      "src/lib/meta.json": JSON.stringify({ version: "9.4.0-alias" }),
      "src/server-functions/metrics.ts":
        '"use server";\n' +
        'import { formatTag } from "@lib/utils";\n' +
        'export async function fetchMetrics() {\n' +
        '  return formatTag("SERVER_FN_OK");\n' +
        "}\n",
      "src/assets/brand/logo.svg":
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
      "src/assets/images/bg.png": pngBytes,
      "src/styles/tokens.css": ":root { --alias-token-color: #123456; }\n",
      "src/styles/theme.css":
        '@import "@styles/tokens.css";\n' +
        '.hero-bg { background-image: url("@assets/images/bg.png"); color: var(--alias-token-color); }\n',
      "src/styles/card.module.css":
        '@import "@styles/tokens.css";\n' +
        ".cardBox { border-color: var(--alias-token-color); }\n",
      "src/components/user-card.tsx":
        '"use client";\n' +
        'import styles from "@styles/card.module.css";\n' +
        'import { SparkIcon } from "@ui/icons/spark";\n' +
        'import { fetchMetrics } from "@server/metrics";\n' +
        'import logoUrl from "@assets/brand/logo.svg";\n' +
        'import meta from "@lib/meta";\n' +
        "export function UserCard({ metric, shared }: { metric: string; shared: string }) {\n" +
        "  void fetchMetrics;\n" +
        "  return (\n" +
        "    <div className={styles.cardBox} data-meta={meta.version} data-logo={logoUrl}>\n" +
        "      <SparkIcon />\n" +
        "      <span>{metric}</span>\n" +
        "      <span>{shared}</span>\n" +
        "    </div>\n" +
        "  );\n" +
        "}\n",
      "src/layout.tsx":
        'import "@styles/theme.css";\n' +
        "export default function Layout({ children }: { children: any }) {\n" +
        "  return <html><body>{children}</body></html>;\n" +
        "}\n",
      "src/page.tsx":
        'import { Link } from "./dinou";\n' +
        'import { Box } from "@ui/box";\n' +
        'import { UserCard } from "@components/user-card";\n' +
        'import { fetchMetrics } from "@server/metrics";\n' +
        'import { SHARED_BANNER } from "@shared/banner";\n' +
        'import { formatTag } from "lib/utils";\n' +
        "export default async function Page() {\n" +
        "  const metric = await fetchMetrics();\n" +
        "  return (\n" +
        "    <Box>\n" +
        '      <Link href="/">Home</Link>\n' +
        '      <p>{formatTag("BASEURL_BARE_OK")}</p>\n' +
        "      <UserCard metric={metric} shared={SHARED_BANNER} />\n" +
        "    </Box>\n" +
        "  );\n" +
        "}\n",
    });

    process.chdir(tmp);
    const expectedCardClass = createScopedName(
      "cardBox",
      path.join(tmp, "src/styles/card.module.css")
    );
    const { startEsbuildDev } = await import(
      pathToFileURL(path.join(DINOU_DIR, "esbuild/dev.js")).href
    );
    const devHandle = await startEsbuildDev({ hmrPort: 0 });
    try {
      const mem = globalThis.__DINOU_MEM_FILES__;
      assert.ok(mem && mem.has("styles.css"), "Esbuild dev emitted styles.css");
      const devCss = Buffer.isBuffer(mem.get("styles.css"))
        ? mem.get("styles.css").toString("utf8")
        : String(mem.get("styles.css"));
      assert.match(devCss, /--alias-token-color:\s*#123456/);
      assert.match(devCss, /\/assets\/bg-[0-9a-f]{8}\.png/);
      assert.ok(devCss.includes(expectedCardClass));
    } finally {
      await devHandle.close();
      process.chdir(prevCwd);
    }

    const rollupBin = resolveBinScript([
      "node_modules/rollup/dist/bin/rollup",
      "dinou/node_modules/rollup/dist/bin/rollup",
    ]);
    const webpackBin = resolveBinScript([
      "node_modules/webpack-cli/bin/cli.js",
      "dinou/node_modules/webpack-cli/bin/cli.js",
    ]);

    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      const args =
        bundler === "esbuild"
          ? [path.join(DINOU_DIR, "esbuild/build.js")]
          : bundler === "rollup"
            ? [rollupBin, "-c", path.join(DINOU_DIR, "rollup/rollup.config.js")]
            : [
                webpackBin,
                "build",
                "-c",
                path.join(DINOU_DIR, "webpack/webpack.config.js"),
              ];

      execFileSync(process.execPath, args, {
        cwd: tmp,
        env: {
          ...process.env,
          NODE_ENV: "production",
          DINOU_BUILD_TOOL: bundler,
        },
        stdio: "pipe",
      });

      const prodCss = fs.readFileSync(
        path.join(tmp, ".dinou/dist3/styles.css"),
        "utf8"
      );
      assert.match(
        prodCss,
        /--alias-token-color:#?123456|--alias-token-color:\s*#123456/,
        `[${bundler}] CSS @import "@styles/tokens.css" resolved`
      );
      assert.match(
        prodCss,
        /\/assets\/bg-[0-9a-f]{8}\.png/,
        `[${bundler}] CSS url("@assets/images/bg.png") resolved`
      );
      assert.ok(
        prodCss.includes(expectedCardClass),
        `[${bundler}] Client aliased CSS Module "@styles/card.module.css" extracted`
      );

      const ssgHtml = fs.readFileSync(
        path.join(tmp, ".dinou/dist2/index.html"),
        "utf8"
      );
      assert.match(ssgHtml, /SPARK_SPECIFICITY_OK/);
      assert.match(ssgHtml, /TAG:SERVER_FN_OK/);
      assert.match(ssgHtml, /FROM_EXTERNAL_SHARED_FALLBACK/);
      assert.match(ssgHtml, /TAG:BASEURL_BARE_OK/);
      assert.match(ssgHtml, /9\.4\.0-alias/);
      assert.match(ssgHtml, /\/assets\/logo-[0-9a-f]{8}\.svg/);
      assert.ok(ssgHtml.includes(expectedCardClass));
    }

    for (const runtimeScript of [
      "cloudflare/build.js",
      "bun/build.js",
      "deno/build.js",
      "core/export-static.js",
    ]) {
      execFileSync(process.execPath, [path.join(DINOU_DIR, runtimeScript)], {
        cwd: tmp,
        env: {
          ...process.env,
          NODE_ENV: "production",
        },
        stdio: "pipe",
      });
    }

    assert.ok(fs.existsSync(path.join(tmp, ".dinou/cloudflare/worker.js")));
    assert.ok(fs.existsSync(path.join(tmp, ".dinou/bun/server.js")));
    assert.ok(fs.existsSync(path.join(tmp, ".dinou/deno/main.js")));
    assert.ok(fs.existsSync(path.join(tmp, "out/index.html")));
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("5. Dual-Engine RSC & SSR (bundleDualEngine) resolves jsconfig.json and .mjs aliases dynamically", async () => {
  const tmp = createTempDir("dynamic-");
  try {
    linkDinouShim(tmp);
    writeFiles(tmp, {
      "package.json": JSON.stringify({
        name: "alias-dynamic-app",
        type: "module",
        private: true,
      }),
      "jsconfig.json": JSON.stringify({
        compilerOptions: {
          paths: {
            "@domain/*": ["./src/domain/*"],
            "@styles/*": ["./src/styles/*"],
          },
        },
      }),
      "src/domain/calc.mjs": "export const compute = () => 'JSCONFIG_MJS_OK';\n",
      "src/styles/badge.module.css": ".pill { padding: 4px; }\n",
      "src/page_functions.js": "export function dynamic() { return true; }\n",
      "src/page.jsx":
        'import { compute } from "@domain/calc";\n' +
        'import styles from "@styles/badge.module.css";\n' +
        "export default function Page() {\n" +
        "  return <div className={styles.pill}>{compute()}</div>;\n" +
        "}\n",
    });

    execFileSync(
      process.execPath,
      [path.join(DINOU_DIR, "esbuild/build.js")],
      {
        cwd: tmp,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "pipe",
      }
    );

    const { bundleDualEngine } = await import(
      pathToFileURL(path.join(DINOU_DIR, "node/bundle-dual-engine.js")).href
    );
    const prevCwd = process.cwd();
    process.chdir(tmp);
    try {
      const expectedPillClass = createScopedName(
        "pill",
        path.join(tmp, "src/styles/badge.module.css")
      );
      const { rscEnginePath, ssrEnginePath } = await bundleDualEngine({
        isDev: false,
        projectRoot: tmp,
        outDir: ".dinou/node",
      });
      const rscMod = await import(
        pathToFileURL(rscEnginePath).href + `?t=${Date.now()}`
      );
      const ssrMod = await import(
        pathToFileURL(ssrEnginePath).href + `?t=${Date.now()}`
      );
      const res = await rscMod.handleRequest(
        new Request("http://localhost/"),
        {
          runtime: "node-bundle",
          renderHtmlStream: ssrMod.renderHtml,
        }
      );
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /JSCONFIG_MJS_OK/);
      assert.ok(html.includes(expectedPillClass));
    } finally {
      process.chdir(prevCwd);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
```

---

### 5.2. Playwright E2E Test Suite (`tests/e2e/tsconfig-aliases.spec.ts`)

Run with:
```bash
npx playwright test tests/e2e/tsconfig-aliases.spec.ts
```

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const DINOU_DIR = fs.existsSync(path.join(REPO_ROOT, "dinou", "cli.js"))
  ? path.join(REPO_ROOT, "dinou")
  : fs.existsSync(path.join(REPO_ROOT, "cli.js"))
    ? REPO_ROOT
    : path.join(REPO_ROOT, "node_modules", "dinou", "dinou");
const CLI_PATH = path.join(DINOU_DIR, "cli.js");
const TMP_BASE = path.join(REPO_ROOT, ".dinou", "tmp-alias-e2e-fixtures");

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

async function waitForHttpReady(url: string, timeoutMs = 45000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stopProcessTree(proc: ChildProcess | null): Promise<void> {
  return new Promise((resolve) => {
    if (!proc || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }
    proc.once("exit", () => resolve());
    if (process.platform === "win32" && proc.pid) {
      try {
        execFileSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } catch {}
      resolve();
    } else {
      proc.kill("SIGTERM");
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {}
        resolve();
      }, 2000);
    }
  });
}

function createAliasE2EFixture(prefix: string): string {
  fs.mkdirSync(TMP_BASE, { recursive: true });
  const appDir = fs.mkdtempSync(path.join(TMP_BASE, prefix));

  const dinouShimDir = path.join(appDir, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouRootUrl = pathToFileURL(DINOU_DIR).href;
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
    `export * from ${JSON.stringify(`${dinouRootUrl}/index.js`)};\nexport { default } from ${JSON.stringify(`${dinouRootUrl}/index.js`)};\n`,
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

  const files: Record<string, string> = {
    "package.json": JSON.stringify({
      name: "alias-e2e-fixture",
      type: "module",
      private: true,
    }),
    "tsconfig.base.json": JSON.stringify({
      compilerOptions: {
        paths: {
          "@/*": ["./src/*"],
          "@ui/*": ["./src/ui/*"],
          "@ui/icons/*": ["./src/icons/*"],
          "@components/*": ["./src/components/*"],
          "@server/*": ["./src/server-functions/*"],
          "@lib/*": ["./src/lib/*"],
          "@styles/*": ["./src/styles/*"],
          "@assets/*": ["./src/assets/*"],
        },
      },
    }),
    "tsconfig.json": JSON.stringify({
      extends: "./tsconfig.base.json",
    }),
    "src/styles/tokens.css": ":root { --e2e-accent: rgb(18, 52, 86); }\n",
    "src/styles/global.css":
      '@import "@styles/tokens.css";\n' +
      "body { margin: 0; }\n",
    "src/styles/panel.module.css":
      '@import "@styles/tokens.css";\n' +
      ".panel { color: var(--e2e-accent); font-weight: 700; }\n",
    "src/assets/logo.svg":
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#123456"/></svg>',
    "src/icons/star.tsx":
      'export function StarIcon() { return <span data-testid="icon">ICON_SPECIFICITY_OK</span>; }\n',
    "src/ui/shell.tsx":
      'export function Shell({ children }: { children: any }) { return <main data-testid="shell">{children}</main>; }\n',
    "src/lib/format/index.ts":
      'export const formatEcho = (msg: string) => `ECHO:${msg.toUpperCase()}`;\n',
    "src/server-functions/echo.ts":
      '"use server";\n' +
      'import { formatEcho } from "@lib/format";\n' +
      "export async function runEcho(input: string) {\n" +
      "  return formatEcho(input);\n" +
      "}\n",
    "src/components/interactive-panel.tsx":
      '"use client";\n' +
      'import { useState } from "react";\n' +
      'import styles from "@styles/panel.module.css";\n' +
      'import { StarIcon } from "@ui/icons/star";\n' +
      'import { runEcho } from "@server/echo";\n' +
      'import logoSrc from "@assets/logo.svg";\n' +
      "export function InteractivePanel() {\n" +
      '  const [result, setResult] = useState("IDLE");\n' +
      "  return (\n" +
      '    <section data-testid="panel" className={styles.panel}>\n' +
      "      <StarIcon />\n" +
      '      <img data-testid="logo" src={logoSrc} alt="Logo" />\n' +
      '      <button data-testid="action-btn" onClick={async () => setResult(await runEcho("alias-ok"))}>Invoke</button>\n' +
      '      <output data-testid="action-out">{result}</output>\n' +
      "    </section>\n" +
      "  );\n" +
      "}\n",
    "src/layout.tsx":
      'import "@styles/global.css";\n' +
      "export default function Layout({ children }: { children: any }) {\n" +
      "  return <html lang=\"en\"><body>{children}</body></html>;\n" +
      "}\n",
    "src/page.tsx":
      'import { Shell } from "@ui/shell";\n' +
      'import { InteractivePanel } from "@components/interactive-panel";\n' +
      "export default function Page() {\n" +
      "  return (\n" +
      "    <Shell>\n" +
      "      <InteractivePanel />\n" +
      "    </Shell>\n" +
      "  );\n" +
      "}\n",
  };

  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(appDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }

  return appDir;
}

test.describe("Dinou tsconfig.json & jsconfig.json Path Aliases E2E", () => {
  test.setTimeout(180_000);

  test.afterAll(() => {
    try {
      fs.rmSync(TMP_BASE, { recursive: true, force: true });
    } catch {}
  });

  test("dinou dev resolves granular aliases across RSC, Client, CSS Modules, Assets, Server Functions, and hot-reloads tsconfig.json live", async ({
    page,
  }) => {
    const appDir = createAliasE2EFixture("dev-");
    const port = await getFreePort();
    const hmrPort = await getFreePort();
    let serverProc: ChildProcess | null = null;

    try {
      serverProc = spawn(
        process.execPath,
        [path.join(DINOU_DIR, "node/dev.js")],
        {
          cwd: appDir,
          env: {
            ...process.env,
            PORT: String(port),
            HMR_PORT: String(hmrPort),
            DINOU_BUILD_TOOL: "esbuild",
          },
          stdio: "pipe",
        }
      );

      await waitForHttpReady(`http://127.0.0.1:${port}/`);
      await page.goto(`http://127.0.0.1:${port}/`);

      await expect(page.getByTestId("icon")).toHaveText("ICON_SPECIFICITY_OK");
      await expect(page.getByTestId("logo")).toHaveAttribute(
        "src",
        /^\/assets\/logo-[0-9a-f]{8}\.svg$/
      );

      const computedColor = await page
        .getByTestId("panel")
        .evaluate((el) => getComputedStyle(el).color);
      expect(computedColor).toBe("rgb(18, 52, 86)");

      await page.getByTestId("action-btn").click();
      await expect(page.getByTestId("action-out")).toHaveText("ECHO:ALIAS-OK");

      // Add a brand-new alias `@live/*` while `dinou dev` is running without restarting!
      fs.mkdirSync(path.join(appDir, "src/live-feature"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "src/live-feature/badge.tsx"),
        'export function LiveBadge() { return <div data-testid="live-badge">HOT_TSCONFIG_RELOAD_OK</div>; }\n',
        "utf8"
      );
      fs.writeFileSync(
        path.join(appDir, "tsconfig.json"),
        JSON.stringify(
          {
            extends: "./tsconfig.base.json",
            compilerOptions: {
              paths: {
                "@/*": ["./src/*"],
                "@ui/*": ["./src/ui/*"],
                "@ui/icons/*": ["./src/icons/*"],
                "@components/*": ["./src/components/*"],
                "@server/*": ["./src/server-functions/*"],
                "@lib/*": ["./src/lib/*"],
                "@styles/*": ["./src/styles/*"],
                "@assets/*": ["./src/assets/*"],
                "@live/*": ["./src/live-feature/*"],
              },
            },
          },
          null,
          2
        ),
        "utf8"
      );
      await new Promise((r) => setTimeout(r, 800));
      fs.writeFileSync(
        path.join(appDir, "src/page.tsx"),
        'import { Shell } from "@ui/shell";\n' +
          'import { InteractivePanel } from "@components/interactive-panel";\n' +
          'import { LiveBadge } from "@live/badge";\n' +
          "export default function Page() {\n" +
          "  return (\n" +
          "    <Shell>\n" +
          "      <LiveBadge />\n" +
          "      <InteractivePanel />\n" +
          "    </Shell>\n" +
          "  );\n" +
          "}\n",
        "utf8"
      );

      await expect
        .poll(
          async () => {
            await page.reload();
            return page.getByTestId("live-badge").textContent().catch(() => "");
          },
          { timeout: 20_000, intervals: [500, 1000] }
        )
        .toBe("HOT_TSCONFIG_RELOAD_OK");
    } finally {
      await stopProcessTree(serverProc);
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });

  for (const bundler of ["esbuild", "rollup", "webpack"] as const) {
    test(`production build & start (${bundler}) serves aliased RSC, Client, CSS Modules, Assets, and Server Functions`, async ({
      page,
    }) => {
      const appDir = createAliasE2EFixture(`prod-${bundler}-`);
      const port = await getFreePort();
      let serverProc: ChildProcess | null = null;

      try {
        execFileSync(
          process.execPath,
          [CLI_PATH, `build:node:${bundler}`],
          {
            cwd: appDir,
            env: { ...process.env, NODE_ENV: "production" },
            stdio: "pipe",
          }
        );

        serverProc = spawn(
          process.execPath,
          [CLI_PATH, `start:node:${bundler}`],
          {
            cwd: appDir,
            env: {
              ...process.env,
              NODE_ENV: "production",
              PORT: String(port),
            },
            stdio: "pipe",
          }
        );

        await waitForHttpReady(`http://127.0.0.1:${port}/`);
        await page.goto(`http://127.0.0.1:${port}/`);

        await expect(page.getByTestId("icon")).toHaveText("ICON_SPECIFICITY_OK");
        const logoSrc = await page.getByTestId("logo").getAttribute("src");
        expect(logoSrc).toMatch(/^\/assets\/logo-[0-9a-f]{8}\.svg$/);

        const assetRes = await page.request.get(
          `http://127.0.0.1:${port}${logoSrc}`
        );
        expect(assetRes.status()).toBe(200);

        const computedColor = await page
          .getByTestId("panel")
          .evaluate((el) => getComputedStyle(el).color);
        expect(computedColor).toBe("rgb(18, 52, 86)");

        await page.getByTestId("action-btn").click();
        await expect(page.getByTestId("action-out")).toHaveText("ECHO:ALIAS-OK");
      } finally {
        await stopProcessTree(serverProc);
        fs.rmSync(appDir, { recursive: true, force: true });
      }
    });
  }
});
```
