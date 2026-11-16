# Dinou `v9.4.0` — Environment Variables, `.env*` Hierarchy, `DINOU_PUBLIC_*` & Security Hardening (`x-env-vars-fixes.md`)

## 1. Executive Summary & Root-Cause Analysis

During the exhaustive pre-release audit of `/docs/env-vars` (`src/docs/env-vars/page.tsx`) against Dinou `v9.4.0` across all 3 bundlers (`esbuild`, `rollup`, `webpack`), all 4 production runtimes (`Node.js`, `Bun`, `Deno`, `Cloudflare Workers` + `Netlify`), `dinou dev`, `dinou build`, `dinou start`, `dinou export-static`, `dinou typegen`, and TypeScript declarations, we identified and resolved **5 critical framework bugs** and implemented **explicit `DINOU_PUBLIC_*` client support + standard `.env*` file hierarchy + live `dinou dev` hot-reload**:

1. **Bug 1 (Critical Regression) — `.env` Files Were Never Loaded Outside `webpack.config.js`**:
   - **Root Cause**: After Dinou's migration to the Dual-Bundle architecture, only `dinou/webpack/webpack.config.js` called `import "dotenv/config"`. In `dinou dev` (`esbuild` & `rollup`), `dinou build` (`esbuild` & `rollup`), `dinou start` (`adapters/node.js` / `.dinou/node/server.mjs`), `dinou export-static`, `dinou typegen`, and Deno (`deno/build.js` / `adapters/deno.js` / `deno/seed-kv.js`), `.env` was never read at all (`process.env.*` evaluated to `undefined`). Even in `dinou dev:webpack`, `node/dev.js` invoked `resolveDevPorts()` (`process.env.PORT`) before loading Webpack, ignoring `PORT=...` in `.env`.
   - **Fix**: Created `dinou/core/env.js` implementing a zero-dependency, `dotenv@16`-compatible parser (`parseDotEnv`), standard `.env*` hierarchy loader (`loadEnvFiles`: OS/CLI shell > `.env.<mode>.local` > `.env.local` [except `test`] > `.env.<mode>` > `.env`), and live hot-reloader (`{ reload: true }`), wired at startup across all CLI commands, bundlers, SSG/export runners, Dual-Engine builders, standalone server orchestrators, and adapters, plus a root Chokidar watcher in `dinou/node/dev.js` for live `.env*` hot-reloading without server restarts.

2. **Bug 2 (Critical Security & Browser Crash) — Client Component `process.env` Leaked Server Secrets in SSR/SSG HTML & Threw `ReferenceError` in Browsers**:
   - **Root Cause**: Pass B (`ssr-engine` in `node/dev.js`, `node/bundle-dual-engine.js`, `cloudflare/build.js`, `bun/build.js`, `deno/build.js`) executed `"use client"` components in the server process with live `globalThis.process.env` intact—causing any accidental `process.env.SECRET` access inside a Client Component to bake the real server secret directly into SSR/SSG HTML (`.dinou/dist2/index.html` / `out/index.html`), followed by `Uncaught ReferenceError: process is not defined` in the browser across Esbuild, Rollup, and Webpack. Furthermore, `@rollup/plugin-replace`'s default negative-lookahead delimiter `\\b(?!\\.)` failed to replace `process.env` in member expressions like `process.env.SECRET`.
   - **Fix (with Option B `DINOU_PUBLIC_*` Support)**:
     - Variables prefixed with `DINOU_PUBLIC_` (plus `NODE_ENV`) are safely inlined across all 3 client bundlers (`esbuild`, `rollup`, `webpack`), Pass B (`ssr-engine`), and Pass A (`rsc-engine` production builds).
     - All remaining `process.env` accesses and destructurings inside Client bundles and Pass B (`ssr-engine`) are replaced at compile time with the sanitized `{ NODE_ENV, ...DINOU_PUBLIC_* }` object (using a 2-stage `replace()` with `delimiters: ["(?<!\\.)\\b", "\\b"]` in Rollup, `define["process.env"]` in Esbuild, and `DefinePlugin` in Webpack dev & prod), without defining bare `process` or `typeof process` (preserving accurate browser detection in third-party npm packages). Private secrets evaluate to `undefined` in both SSR/SSG and browsers with zero leaks, zero hydration mismatches, and zero `ReferenceError` crashes.

3. **Bug 3 (Multi-Runtime & TypeScript Parity) — `getContext().env` Was Empty `{}` Outside Cloudflare & Typed as `| undefined`**:
   - **Root Cause**: `dinou/core/handler.js` set `env: platformContext.env || {}`, returning `{}` on Node.js (`dev` & `start`), Bun, Deno, Netlify, and SSG (`build-static-pages.js` omitted `env` completely). On Cloudflare Workers with older `compatibility_date`s, plain-text `env` bindings were not mirrored onto `process.env`. Meanwhile, `dinou/index.d.ts` and `dinou/server.d.ts` typed `getContext(): RequestContextStore | undefined` even though `request-context.js` always returns an object, breaking `const { env } = getContext()` under `strict: true`, and `dinou/env.d.ts` did not declare `var process: NodeJS.Process`, causing `TS2591` in projects without `@types/node`.
   - **Fix**: Created `dinou/core/runtime-env.js` (100% pure JS, zero `node:*` imports, safe across `workerd` and browsers) with `createUnifiedEnv(platformEnv)` (a cached `Proxy` preserving live Cloudflare KV/D1/R2/ASSETS host object `this` receivers while falling back seamlessly to `process.env` and `Deno.env`) and `syncEdgeEnvToProcessEnv(platformEnv)`. Updated `request-context.js`, `handler.js`, `build-static-pages.js`, `adapters/netlify.js`, `env.d.ts`, `index.d.ts` (`DinouEnv` + `getContext(): RequestContextStore`), `server.d.ts`, and `generate-route-types.js` (emitting discovered `.env*` / `.env.example` key names—never values—onto `NodeJS.ProcessEnv` in `.dinou/types/routes.d.ts`).

4. **Bug 4 (`AsyncLocalStorage` Concurrency Scope Gap in `handler.js`)**:
   - **Root Cause**: `plugin.onRequest`, `resolvePageFunctionsConfig` (`validateParams`, `getStaticPaths`, `allowISG`, `getCacheTags`, `revalidate`), and `resolveLayoutFunctionsConfig` executed outside `requestStorage.run(rootContext, ...)`, relying on a single mutable global slot susceptible to cross-request race conditions under concurrent traffic.
   - **Fix**: Wrapped `plugin.onRequest`, `resolvePageFunctionsConfig`, and `resolveLayoutFunctionsConfig` inside `requestStorage.run(rootContext, ...)`.

5. **Bug 5 (Anti-Bot Shield Bypass & Physical `public/.env*` Exclusion)**:
   - **Root Cause**: `botGarbagePatterns` in `handler.js` only matched `/\.env$/i` on raw `url.pathname`, allowing scanner probes like `GET /.env.local`, `GET /.env.production`, `GET /api/.env.staging`, `GET /%2eenv`, and `GET /.%65nv` to bypass the shield (and potentially trigger dynamic `[slug]` ISG cache writes). Additionally, `copy-static-dirs.js`, `CopyWebpackPlugin`, and `static-assets.js` did not exclude `.env` / `.env.*` if accidentally placed inside `public/`.
   - **Fix**: Added `isBotEnvProbePath` (decoding up to two URL-encoding layers and matching `.env` and `.env.*` segments without false-positiving routes like `/docs/env-vars`) and blocked `.env` / `.env.*` in `copy-static-dirs.js`, `webpack.config.js` (`CopyWebpackPlugin`), `isInternalDinouAssetPath`, and `shouldExportDist3Entry`.

---

## 2. Complete File Manifest (31 Files)

### New Files (2)
1. `dinou/core/runtime-env.js`
2. `dinou/core/env.js`

### Modified Files (29)
3. `dinou/core/request-context.js`
4. `dinou/core/handler.js`
5. `dinou/core/build-static-pages.js`
6. `dinou/core/static-assets.js`
7. `dinou/core/copy-static-dirs.js`
8. `dinou/core/generate-route-types.js`
9. `dinou/core/run-ssg.js`
10. `dinou/core/export-static.js`
11. `dinou/esbuild/dev.js`
12. `dinou/esbuild/build.js`
13. `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`
14. `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`
15. `dinou/rollup/rollup.config.js`
16. `dinou/webpack/webpack.config.js`
17. `dinou/node/dev.js`
18. `dinou/node/bundle-dual-engine.js`
19. `dinou/node/build.js`
20. `dinou/adapters/node.js`
21. `dinou/adapters/netlify.js`
22. `dinou/adapters/bun.js`
23. `dinou/adapters/deno.js`
24. `dinou/cloudflare/build.js`
25. `dinou/bun/build.js`
26. `dinou/deno/build.js`
27. `dinou/deno/seed-kv.js`
28. `dinou/cli.js`
29. `dinou/env.d.ts`
30. `dinou/index.d.ts`
31. `dinou/server.d.ts`

---

## 3. Complete Source Code & Unified Diffs

### 3.1. [NEW] `dinou/core/runtime-env.js`

```js
// dinou/core/runtime-env.js
// Runtime-agnostic environment helpers with zero Node filesystem/path imports.
// Safe across Node.js, Bun, Deno, Cloudflare Workers (workerd), and Browser bundles.

export const DINOU_PUBLIC_PREFIX = "DINOU_PUBLIC_";

const unifiedEnvCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
let defaultServerEnvProxy = null;

/**
 * Returns true if a file basename is `.env` or `.env.*` (case-insensitive).
 */
export function isDotEnvFileName(name) {
  if (!name || typeof name !== "string") return false;
  const clean = name.replace(/\\/g, "/").split("/").pop() || "";
  const lower = clean.toLowerCase();
  return lower === ".env" || lower.startsWith(".env.");
}

/**
 * Safely URL-decodes up to two layers so percent-encoded probes such as
 * `/%2eenv`, `/.%65nv`, or `/%252eenv` cannot bypass the Anti-Bot Shield.
 */
function safeDecodePathnameCandidates(pathname) {
  if (!pathname || typeof pathname !== "string") return [];
  const candidates = new Set([pathname]);
  let current = pathname;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      candidates.add(next);
      current = next;
    } catch {
      break;
    }
  }
  return Array.from(candidates);
}

const BOT_DOT_ENV_SEGMENT_REGEX = /(?:^|\/)\.env(?:\.[a-z0-9_-]+)*(?:\/|$)/i;
const BOT_TRAILING_ENV_EXT_REGEX = /\.env$/i;

/**
 * Returns true when an incoming HTTP URL pathname probes `.env` or `.env.*` files
 * (including nested `/api/.env.local`, `/backup.env`, or URL-encoded `/%2eenv`),
 * without matching legitimate routes such as `/docs/env` or `/docs/env-vars`.
 */
export function isBotEnvProbePath(pathname) {
  const candidates = safeDecodePathnameCandidates(pathname);
  for (const candidate of candidates) {
    const normalized = candidate.replace(/\\/g, "/");
    if (
      BOT_DOT_ENV_SEGMENT_REGEX.test(normalized) ||
      BOT_TRAILING_ENV_EXT_REGEX.test(normalized)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Mirrors plain-text string variables from an Edge/Cloudflare `env` object onto
 * `process.env` when `process.env` is available (e.g. `nodejs_compat`) and the key
 * is not yet populated, preserving live resource bindings untouched.
 */
export function syncEdgeEnvToProcessEnv(platformEnv) {
  if (
    typeof window !== "undefined" ||
    !platformEnv ||
    typeof platformEnv !== "object"
  ) {
    return;
  }
  if (
    typeof process === "undefined" ||
    !process ||
    !process.env ||
    typeof process.env !== "object"
  ) {
    return;
  }
  try {
    for (const key of Object.keys(platformEnv)) {
      const val = platformEnv[key];
      if (typeof val === "string" && process.env[key] === undefined) {
        try {
          process.env[key] = val;
        } catch {}
      }
    }
  } catch {}
}

function readFallbackServerEnvValue(prop) {
  if (typeof window !== "undefined" || typeof prop !== "string") {
    return undefined;
  }

  const globalEdgeEnv =
    typeof globalThis !== "undefined" ? globalThis.__DINOU_ENV__ : null;
  if (
    globalEdgeEnv &&
    typeof globalEdgeEnv === "object" &&
    prop in globalEdgeEnv &&
    globalEdgeEnv[prop] !== undefined
  ) {
    return globalEdgeEnv[prop];
  }

  if (
    typeof process !== "undefined" &&
    process &&
    process.env &&
    typeof process.env === "object" &&
    prop in process.env &&
    process.env[prop] !== undefined
  ) {
    return process.env[prop];
  }

  if (
    typeof Deno !== "undefined" &&
    Deno &&
    Deno.env &&
    typeof Deno.env.get === "function"
  ) {
    try {
      const val = Deno.env.get(prop);
      if (val !== undefined) return val;
    } catch {}
  }

  return undefined;
}

function collectFallbackServerEnvKeys() {
  const keys = new Set();
  if (typeof window !== "undefined") return keys;

  const globalEdgeEnv =
    typeof globalThis !== "undefined" ? globalThis.__DINOU_ENV__ : null;
  if (globalEdgeEnv && typeof globalEdgeEnv === "object") {
    try {
      for (const k of Object.keys(globalEdgeEnv)) keys.add(k);
    } catch {}
  }

  if (
    typeof process !== "undefined" &&
    process &&
    process.env &&
    typeof process.env === "object"
  ) {
    try {
      for (const k of Object.keys(process.env)) keys.add(k);
    } catch {}
  }

  if (
    typeof Deno !== "undefined" &&
    Deno &&
    Deno.env &&
    typeof Deno.env.toObject === "function"
  ) {
    try {
      for (const k of Object.keys(Deno.env.toObject())) keys.add(k);
    } catch {}
  }

  return keys;
}

function buildUnifiedEnvProxy(baseTarget) {
  const target = baseTarget && typeof baseTarget === "object" ? baseTarget : {};
  return new Proxy(target, {
    get(t, prop) {
      if (typeof prop === "symbol") {
        return Reflect.get(t, prop, t);
      }
      if (prop in t && t[prop] !== undefined) {
        return Reflect.get(t, prop, t);
      }
      return readFallbackServerEnvValue(prop);
    },
    has(t, prop) {
      if (typeof prop === "symbol") {
        return Reflect.has(t, prop);
      }
      if (prop in t) {
        return true;
      }
      return readFallbackServerEnvValue(prop) !== undefined;
    },
    ownKeys(t) {
      const merged = new Set(Reflect.ownKeys(t));
      for (const k of collectFallbackServerEnvKeys()) {
        merged.add(k);
      }
      return Array.from(merged);
    },
    getOwnPropertyDescriptor(t, prop) {
      if (
        typeof prop === "symbol" ||
        Object.prototype.hasOwnProperty.call(t, prop)
      ) {
        return Object.getOwnPropertyDescriptor(t, prop);
      }
      const val = readFallbackServerEnvValue(prop);
      if (val !== undefined) {
        return {
          configurable: true,
          enumerable: true,
          writable: false,
          value: val,
        };
      }
      return undefined;
    },
  });
}

/**
 * Creates a zero-copy unified server `env` view for `getContext().env` and `req.env`
 * across Cloudflare Workers (preserving live KV, D1, R2, and ASSETS bindings),
 * Node.js, Bun, Deno, Netlify, and SSG/ISR contexts.
 */
export function createUnifiedEnv(platformEnv) {
  if (typeof window !== "undefined") {
    return {};
  }

  const hasCustomTarget =
    platformEnv &&
    typeof platformEnv === "object" &&
    Object.keys(platformEnv).length > 0;

  if (!hasCustomTarget) {
    if (!defaultServerEnvProxy) {
      defaultServerEnvProxy = buildUnifiedEnvProxy({});
    }
    return defaultServerEnvProxy;
  }

  if (unifiedEnvCache) {
    const cached = unifiedEnvCache.get(platformEnv);
    if (cached) return cached;
    const created = buildUnifiedEnvProxy(platformEnv);
    unifiedEnvCache.set(platformEnv, created);
    return created;
  }

  return buildUnifiedEnvProxy(platformEnv);
}

export default {
  DINOU_PUBLIC_PREFIX,
  isDotEnvFileName,
  isBotEnvProbePath,
  syncEdgeEnvToProcessEnv,
  createUnifiedEnv,
};
```

---

### 3.2. [NEW] `dinou/core/env.js`

```js
// dinou/core/env.js
// Server & build-time .env* hierarchy loader, live dev hot-reloader,
// TypeScript .env key scanner, and DINOU_PUBLIC_* bundler replacement builder.

import fs from "node:fs";
import path from "node:path";
import { DINOU_PUBLIC_PREFIX, isDotEnvFileName } from "./runtime-env.js";

const ENV_LOADER_STATE_KEY = Symbol.for("dinou.env.loaderState");

function getLoaderStateMap() {
  if (typeof globalThis === "undefined") return new Map();
  if (!globalThis[ENV_LOADER_STATE_KEY]) {
    globalThis[ENV_LOADER_STATE_KEY] = new Map();
  }
  return globalThis[ENV_LOADER_STATE_KEY];
}

const LINE_KEY_REGEX = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/;
const VALID_TS_ENV_IDENT_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED_PROCESS_ENV_KEYS = new Set(["NODE_ENV", "TZ"]);

function unescapeDoubleQuotedValue(raw) {
  return raw.replace(/\\([nrt"'\\])/g, (_match, ch) => {
    switch (ch) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case '"':
        return '"';
      case "'":
        return "'";
      case "\\":
        return "\\";
      default:
        return ch;
    }
  });
}

function findClosingQuoteIndex(str, quoteChar, allowEscapes) {
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (allowEscapes && ch === "\\") {
      i++;
      continue;
    }
    if (ch === quoteChar) {
      return i;
    }
  }
  return -1;
}

function stripUnquotedInlineComment(val) {
  for (let i = 0; i < val.length; i++) {
    if (val[i] === "#" && (i === 0 || /\s/.test(val[i - 1]))) {
      return val.slice(0, i).trim();
    }
  }
  return val.trim();
}

/**
 * Parses `.env` file contents compatibly with `dotenv@16` (UTF-8 BOM, comments,
 * optional `export `, single/double/backtick quotes, multiline strings, escapes).
 *
 * @param {string} rawContent
 * @returns {Record<string, string>}
 */
export function parseDotEnv(rawContent) {
  const result = {};
  if (typeof rawContent !== "string" || rawContent.length === 0) {
    return result;
  }

  const normalized = rawContent
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = LINE_KEY_REGEX.exec(line);
    if (!match) {
      continue;
    }

    const key = match[1];
    const rest = match[2] ?? "";

    if (rest.length === 0) {
      result[key] = "";
      continue;
    }

    const firstChar = rest[0];
    if (firstChar === '"' || firstChar === "'" || firstChar === "`") {
      const allowEscapes = firstChar === '"' || firstChar === "`";
      let afterOpen = rest.slice(1);
      let closeIdx = findClosingQuoteIndex(afterOpen, firstChar, allowEscapes);

      if (closeIdx !== -1) {
        const inner = afterOpen.slice(0, closeIdx);
        result[key] =
          firstChar === '"' ? unescapeDoubleQuotedValue(inner) : inner;
        continue;
      }

      // Multiline quoted value
      const chunks = [afterOpen];
      while (lineIdx + 1 < lines.length) {
        lineIdx++;
        const nextLine = lines[lineIdx];
        const nextClose = findClosingQuoteIndex(
          nextLine,
          firstChar,
          allowEscapes
        );
        if (nextClose !== -1) {
          chunks.push(nextLine.slice(0, nextClose));
          break;
        }
        chunks.push(nextLine);
      }
      const joined = chunks.join("\n");
      result[key] =
        firstChar === '"' ? unescapeDoubleQuotedValue(joined) : joined;
      continue;
    }

    result[key] = stripUnquotedInlineComment(rest);
  }

  return result;
}

/**
 * Returns the ordered `.env*` file names from highest priority to lowest priority
 * for a given `mode` (`development`, `production`, `test`, etc.).
 *
 * Precedence (after real OS / CLI environment variables):
 * 1. `.env.<mode>.local`
 * 2. `.env.local` (skipped when `mode === "test"`)
 * 3. `.env.<mode>`
 * 4. `.env`
 */
export function getEnvFileHierarchy(mode) {
  const resolvedMode =
    String(
      mode ||
        (typeof process !== "undefined" && process.env?.NODE_ENV) ||
        "development"
    ).trim() || "development";

  const candidates = [
    `.env.${resolvedMode}.local`,
    ...(resolvedMode !== "test" ? [".env.local"] : []),
    `.env.${resolvedMode}`,
    ".env",
  ];

  return Array.from(new Set(candidates));
}

/**
 * Reads and merges `.env*` files from `projectRoot` without mutating `process.env`.
 */
export function readEnvFilesMap(projectRoot = ".", options = {}) {
  const cwd = path.resolve(
    projectRoot ||
      (typeof process !== "undefined" && typeof process.cwd === "function"
        ? process.cwd()
        : ".")
  );
  const mode =
    String(
      options.mode ||
        (typeof process !== "undefined" && process.env?.NODE_ENV) ||
        "development"
    ).trim() || "development";

  const hierarchy = getEnvFileHierarchy(mode);
  const mergedValues = {};
  const loadedFiles = [];

  for (const fileName of hierarchy) {
    const filePath = path.join(cwd, fileName);
    try {
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parseDotEnv(raw);
      loadedFiles.push(fileName);
      for (const [k, v] of Object.entries(parsed)) {
        if (!(k in mergedValues)) {
          mergedValues[k] = v;
        }
      }
    } catch {}
  }

  return {
    cwd,
    mode,
    loadedFiles,
    values: mergedValues,
  };
}

/**
 * Collects currently active `DINOU_PUBLIC_*` environment variables from `process.env`
 * and `Deno.env` (if running under Deno).
 */
export function getPublicEnvVars() {
  const pub = {};

  if (
    typeof Deno !== "undefined" &&
    Deno &&
    Deno.env &&
    typeof Deno.env.toObject === "function"
  ) {
    try {
      const denoVars = Deno.env.toObject();
      for (const key of Object.keys(denoVars).sort()) {
        if (key.startsWith(DINOU_PUBLIC_PREFIX) && denoVars[key] !== undefined) {
          pub[key] = String(denoVars[key]);
        }
      }
    } catch {}
  }

  if (
    typeof process !== "undefined" &&
    process &&
    process.env &&
    typeof process.env === "object"
  ) {
    for (const key of Object.keys(process.env).sort()) {
      if (
        key.startsWith(DINOU_PUBLIC_PREFIX) &&
        process.env[key] !== undefined
      ) {
        pub[key] = String(process.env[key]);
      }
    }
  }

  return pub;
}

/**
 * Loads the `.env*` hierarchy from `projectRoot` into `process.env` (and `Deno.env`
 * when available), never overriding real OS/CLI environment variables already set
 * before Dinou started. Supports `{ reload: true }` for hot-reloading `.env*` edits
 * during `dinou dev`.
 */
export function loadEnvFiles(projectRoot, options = {}) {
  const resolvedRoot = path.resolve(
    projectRoot ||
      (typeof process !== "undefined" && typeof process.cwd === "function"
        ? process.cwd()
        : ".")
  );
  const mode =
    String(
      options.mode ||
        (typeof process !== "undefined" && process.env?.NODE_ENV) ||
        "development"
    ).trim() || "development";

  const stateMap = getLoaderStateMap();
  const prevState = stateMap.get(resolvedRoot);

  if (prevState && prevState.mode === mode && !options.reload) {
    return {
      cwd: resolvedRoot,
      mode,
      loadedFiles: prevState.loadedFiles,
      values: prevState.values,
      publicEnv: getPublicEnvVars(),
      changed: false,
      publicEnvChanged: false,
    };
  }

  // If reloading or switching mode in the same process, remove keys previously injected from .env*
  if (prevState) {
    if (
      typeof process !== "undefined" &&
      process &&
      process.env &&
      prevState.injectedKeys
    ) {
      for (const key of prevState.injectedKeys) {
        try {
          delete process.env[key];
        } catch {}
      }
    }
    if (
      typeof Deno !== "undefined" &&
      Deno &&
      Deno.env &&
      typeof Deno.env.delete === "function" &&
      prevState.injectedDenoKeys
    ) {
      for (const key of prevState.injectedDenoKeys) {
        try {
          Deno.env.delete(key);
        } catch {}
      }
    }
  }

  const { loadedFiles, values } = readEnvFilesMap(resolvedRoot, { mode });
  const injectedKeys = new Set();
  const injectedDenoKeys = new Set();

  for (const [key, val] of Object.entries(values)) {
    if (
      typeof process !== "undefined" &&
      process &&
      process.env &&
      process.env[key] === undefined
    ) {
      try {
        process.env[key] = val;
        injectedKeys.add(key);
      } catch {}
    }

    if (
      typeof Deno !== "undefined" &&
      Deno &&
      Deno.env &&
      typeof Deno.env.get === "function" &&
      typeof Deno.env.set === "function"
    ) {
      try {
        if (Deno.env.get(key) === undefined) {
          Deno.env.set(key, val);
          injectedDenoKeys.add(key);
        }
      } catch {}
    }
  }

  const publicEnv = getPublicEnvVars();
  const publicSnapshot = JSON.stringify(publicEnv);
  const allSnapshot = JSON.stringify(values);

  const changed = prevState ? prevState.allSnapshot !== allSnapshot : true;
  const publicEnvChanged = prevState
    ? prevState.publicSnapshot !== publicSnapshot
    : Object.keys(publicEnv).length > 0;

  stateMap.set(resolvedRoot, {
    mode,
    loadedFiles,
    values,
    injectedKeys,
    injectedDenoKeys,
    publicSnapshot,
    allSnapshot,
  });

  return {
    cwd: resolvedRoot,
    mode,
    loadedFiles,
    values,
    publicEnv,
    changed,
    publicEnvChanged,
  };
}

/**
 * Scans `.env*` and `.env.example` files in `projectRoot` and returns ONLY valid
 * TypeScript identifier key names (never values) for `.dinou/types/routes.d.ts`.
 */
export function collectDeclaredEnvKeys(projectRoot = ".") {
  const cwd = path.resolve(
    projectRoot ||
      (typeof process !== "undefined" && typeof process.cwd === "function"
        ? process.cwd()
        : ".")
  );
  const keys = new Set();

  try {
    if (!fs.existsSync(cwd)) return [];
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!isDotEnvFileName(entry.name)) continue;
      try {
        const raw = fs.readFileSync(path.join(cwd, entry.name), "utf8");
        const parsed = parseDotEnv(raw);
        for (const key of Object.keys(parsed)) {
          if (
            VALID_TS_ENV_IDENT_REGEX.test(key) &&
            !RESERVED_PROCESS_ENV_KEYS.has(key)
          ) {
            keys.add(key);
          }
        }
      } catch {}
    }
  } catch {}

  return Array.from(keys).sort();
}

/**
 * Builds the sanitized public environment dictionary `{ NODE_ENV, ...DINOU_PUBLIC_*, ...extra }`
 * safe for Client Components and SSR Pass B (`ssr-engine`).
 */
export function getPublicEnvObject(options = {}) {
  const mode =
    String(
      options.mode ||
        (typeof process !== "undefined" && process.env?.NODE_ENV) ||
        "development"
    ).trim() || "development";

  const publicVars = getPublicEnvVars();
  const obj = {
    NODE_ENV: mode,
    ...publicVars,
  };

  if (options.extra && typeof options.extra === "object") {
    for (const [k, v] of Object.entries(options.extra)) {
      if (v !== undefined) {
        obj[k] = String(v);
      }
    }
  }

  return obj;
}

/**
 * Generates Esbuild `define` entries for Client bundles and Dual-Engine passes.
 * - When `defineProcessEnvObject !== false` (Client bundles & Pass B SSR), also defines
 *   `"process.env"` to the sanitized `publicEnvObject` so non-public `process.env.*`
 *   evaluates safely to `undefined` without leaking server secrets or throwing `ReferenceError`.
 * - When `defineProcessEnvObject === false` (Pass A RSC server bundles), only defines
 *   `NODE_ENV`, `DINOU_PUBLIC_*`, and `extra` keys while keeping `process.env` live for secrets.
 */
export function getEsbuildPublicEnvDefines(options = {}) {
  const defineProcessEnvObject = options.defineProcessEnvObject !== false;
  const pubObj = getPublicEnvObject(options);
  const defines = {};

  for (const key of Object.keys(pubObj).sort()) {
    defines[`process.env.${key}`] = JSON.stringify(pubObj[key]);
  }

  if (defineProcessEnvObject) {
    defines["process.env"] = JSON.stringify(pubObj);
  }

  return defines;
}

/**
 * Generates Rollup `@rollup/plugin-replace` maps:
 * - `exactValues`: replaces `process.env.NODE_ENV` and `process.env.DINOU_PUBLIC_*`
 * - `objectValues`: replaces remaining standalone/member `process.env` expressions
 *   using `delimiters: ["(?<!\\.)\\b", "\\b"]` so `process.env.SECRET` evaluates to `undefined`.
 */
export function getRollupPublicEnvReplacements(options = {}) {
  const pubObj = getPublicEnvObject(options);
  const exactValues = {};
  for (const key of Object.keys(pubObj).sort()) {
    exactValues[`process.env.${key}`] = JSON.stringify(pubObj[key]);
  }
  return {
    exactValues,
    objectValues: {
      "process.env": `(${JSON.stringify(pubObj)})`,
    },
  };
}

/**
 * Generates Webpack `DefinePlugin` definitions for Client bundles (both dev and prod).
 */
export function getWebpackPublicEnvDefines(options = {}) {
  return getEsbuildPublicEnvDefines({
    ...options,
    defineProcessEnvObject: true,
  });
}

/**
 * Returns true when `filePath` is a `.env` or `.env.*` file in the root directory.
 */
export function isWatchedDotEnvFile(filePath, projectRoot = ".") {
  if (!filePath || typeof filePath !== "string") return false;
  const absFile = path.resolve(filePath);
  const absRoot = path.resolve(projectRoot);
  if (path.dirname(absFile).toLowerCase() !== absRoot.toLowerCase()) {
    return false;
  }
  return isDotEnvFileName(path.basename(absFile));
}

export default {
  DINOU_PUBLIC_PREFIX,
  isDotEnvFileName,
  parseDotEnv,
  getEnvFileHierarchy,
  readEnvFilesMap,
  getPublicEnvVars,
  loadEnvFiles,
  collectDeclaredEnvKeys,
  getPublicEnvObject,
  getEsbuildPublicEnvDefines,
  getRollupPublicEnvReplacements,
  getWebpackPublicEnvDefines,
  isWatchedDotEnvFile,
};
```

---

### 3.3. `dinou/core/request-context.js`

```diff
 // dinou/core/request-context.js
+import { createUnifiedEnv } from "./runtime-env.js";
+
 const DINOU_CONTEXT_KEY = Symbol.for("dinou.request.context.storage");
 let requestStorage;
@@ -58,13 +60,53 @@ function getCurrentContext() {
   return undefined;
 }
 
+const noopResponseProxy = Object.freeze({
+  cookie() {},
+  clearCookie() {},
+  setHeader() {},
+  redirect() {},
+  status() {},
+});
+
+function createFallbackServerContext() {
+  const unifiedEnv = createUnifiedEnv();
+  return {
+    req: {
+      query: {},
+      cookies: {},
+      headers: {},
+      path: "/",
+      method: "GET",
+      env: unifiedEnv,
+      ctx: null,
+    },
+    res: noopResponseProxy,
+    env: unifiedEnv,
+    ctx: null,
+  };
+}
+
 function getContext() {
   if (typeof window !== "undefined") {
     console.error(
       "[Dinou] ❌ You are calling getContext() inside a Client Component running in the browser. This function is Server-Only. Pass the data as props from a Server Component instead."
     );
-    return {};
+    return {
+      req: { query: {}, cookies: {}, headers: {}, path: "/", method: "GET", env: {}, ctx: null },
+      res: noopResponseProxy,
+      env: {},
+      ctx: null,
+    };
   }
-  const store = requestStorage?.getStore();
-  return store || getCurrentContext() || {};
+  const store = requestStorage?.getStore() || getCurrentContext();
+  if (store) {
+    if (!store.env) {
+      store.env = createUnifiedEnv(store.platformContext?.env);
+    }
+    if (store.req && !store.req.env) {
+      store.req.env = store.env;
+    }
+    return store;
+  }
+  return createFallbackServerContext();
 }
```

---

### 3.4. `dinou/core/handler.js`

```diff
 import { requestStorage, setCurrentContext } from "./request-context.js";
+import {
+  createUnifiedEnv,
+  syncEdgeEnvToProcessEnv,
+  isBotEnvProbePath,
+} from "./runtime-env.js";
 import { getStatus } from "./status-manifest.js";
@@ -424,6 +429,18 @@ const botGarbagePatterns = [
   /\.bak$/i,
   /\.log$/i,
 ];
+
+function isBotScannerRequest(pathname) {
+  if (!pathname || typeof pathname !== "string") return false;
+  if (isBotEnvProbePath(pathname)) return true;
+  let decoded = pathname;
+  try {
+    decoded = decodeURIComponent(pathname);
+  } catch {}
+  return botGarbagePatterns.some(
+    (pattern) => pattern.test(pathname) || pattern.test(decoded)
+  );
+}
 
 const IS_DYNAMIC_MAP_KEY = Symbol.for("dinou.isDynamic.map");
@@ -1286,25 +1303,26 @@ function createRequestContext(simReq, resBridge, platformContext = {}) {
   const cookiesProxy = createBailoutProxy(simReq.cookies, "Cookies", markDynamic);
   const headersProxy = createBailoutProxy(simReq.headers, "Headers", markDynamic);
   const queryProxy = createBailoutProxy(simReq.query, "Query", markDynamic);
+  const unifiedEnv = createUnifiedEnv(platformContext.env);
 
   const context = {
     req: {
       cookies: cookiesProxy,
       headers: headersProxy,
       query: queryProxy,
       path: simReq.path,
       method: simReq.method,
-      env: platformContext.env || {},
+      env: unifiedEnv,
       ctx: platformContext.ctx || null,
     },
     res: {
       status: (code) => safeResCall("status", code),
       setHeader: (name, value) => safeResCall("setHeader", name, value),
       clearCookie: (name, options) => safeResCall("clearCookie", name, options),
       cookie: (name, value, options) => safeResCall("cookie", name, value, options),
       redirect: (...args) => safeResCall("redirect", ...args),
     },
-    env: platformContext.env || {},
+    env: unifiedEnv,
     ctx: platformContext.ctx || null,
     platformContext,
     _markDynamic: markDynamic,
@@ -1331,14 +1349,15 @@ function createRequestContext(simReq, resBridge, platformContext = {}) {
 function createServerFunctionContext(simReq, resBridge, platformContext = {}) {
+  const unifiedEnv = createUnifiedEnv(platformContext.env);
   const context = {
     req: {
       cookies: { ...simReq.cookies },
       headers: { ...simReq.headers },
       query: { ...simReq.query },
       path: simReq.path,
       method: simReq.method,
-      env: platformContext.env || {},
+      env: unifiedEnv,
       ctx: platformContext.ctx || null,
     },
@@ -1397,7 +1416,7 @@ function createServerFunctionContext(simReq, resBridge, platformContext = {}) {
         resBridge.write(`D:{"type":"cookie","cookie":${JSON.stringify(cookieStr)}}\n`);
       },
     },
-    env: platformContext.env || {},
+    env: unifiedEnv,
     ctx: platformContext.ctx || null,
     platformContext,
     _dynamicState: { value: true },
@@ -1418,15 +1437,16 @@ async function handleRequest(request, platformContext = {}) {
     if (platformContext?.env) {
       globalThis.__DINOU_ENV__ = platformContext.env;
+      syncEdgeEnvToProcessEnv(platformContext.env);
     }
   }
   const url = new URL(request.url);
   const pathname = url.pathname;
 
   // 1. Anti-Bot Shield & Reserved Internal Namespace Guard
   if (
-    botGarbagePatterns.some((pattern) => pattern.test(pathname)) ||
+    isBotScannerRequest(pathname) ||
     isReservedCloudflareDist2RequestPath(pathname)
   ) {
     return new Response("Not Found", { status: 404 });
   }
@@ -1493,7 +1513,9 @@ async function handleRequest(request, platformContext = {}) {
     for (const plugin of cfg.plugins) {
       if (typeof plugin.onRequest === "function") {
         try {
-          const result = await plugin.onRequest(request, rootContext);
+          const result = await requestStorage.run(rootContext, () =>
+            plugin.onRequest(request, rootContext)
+          );
           if (result instanceof Response) {
             return result;
           }
@@ -1810,21 +1832,23 @@ async function handleRequest(request, platformContext = {}) {
     let layoutConfig = null;
     let pageConfig = null;
-    if (isLayoutReq) {
-      layoutConfig = await resolveLayoutFunctionsConfig(layoutPath, layoutParams);
-      if (layoutConfig.isDynamic) {
-        dynamicState.value = true;
-      }
-    } else if (isPageReq) {
-      pageConfig = await resolvePageFunctionsConfig(
-        pagePath,
-        reqSegments,
-        queryObj,
-        dynamicParams,
-        reqPath,
-        Boolean(platformContext?.isSSG),
-      );
-      if (pageConfig.isDynamicConfig) {
-        dynamicState.value = true;
-      }
-      isPathBlocked = pageConfig.isPathBlocked;
-    }
+    await requestStorage.run(rootContext, async () => {
+      if (isLayoutReq) {
+        layoutConfig = await resolveLayoutFunctionsConfig(layoutPath, layoutParams);
+        if (layoutConfig.isDynamic) {
+          dynamicState.value = true;
+        }
+      } else if (isPageReq) {
+        pageConfig = await resolvePageFunctionsConfig(
+          pagePath,
+          reqSegments,
+          queryObj,
+          dynamicParams,
+          reqPath,
+          Boolean(platformContext?.isSSG),
+        );
+        if (pageConfig.isDynamicConfig) {
+          dynamicState.value = true;
+        }
+        isPathBlocked = pageConfig.isPathBlocked;
+      }
+    });
@@ -2505,14 +2529,16 @@ async function handleRequest(request, platformContext = {}) {
     ppr: isPprConfig,
     pagePpr: isPagePprConfig,
-  } = await resolvePageFunctionsConfig(
-    pagePath,
-    reqSegments,
-    queryObj,
-    dynamicParams,
-    reqPath,
-    Boolean(platformContext?.isSSG),
+  } = await requestStorage.run(rootContext, () =>
+    resolvePageFunctionsConfig(
+      pagePath,
+      reqSegments,
+      queryObj,
+      dynamicParams,
+      reqPath,
+      Boolean(platformContext?.isSSG),
+    )
   );
@@ -2536,41 +2562,43 @@ async function handleRequest(request, platformContext = {}) {
   const activeLayoutsForRoute = getActiveLayoutChain(reqSegments, queryObj, srcFolder);
   if (activeLayoutsForRoute.length > 0) {
-    for (const entry of activeLayoutsForRoute) {
-      const layoutConfig = await resolveLayoutFunctionsConfig(entry.layoutPath, entry.dParams);
+    await requestStorage.run(rootContext, async () => {
+      for (const entry of activeLayoutsForRoute) {
+        const layoutConfig = await resolveLayoutFunctionsConfig(entry.layoutPath, entry.dParams);
 ...
+      }
+    });
   }
```

---

### 3.5. `dinou/core/build-static-pages.js`

```diff
 import { requestStorage } from "./request-context.js";
+import { createUnifiedEnv } from "./runtime-env.js";
@@ -910,17 +911,22 @@ async function buildStaticPages(onProgress = null) {
+      const unifiedEnv = createUnifiedEnv();
       const mockReq = {
         query: queryProxy,
         cookies: cookiesProxy,
         headers: headersProxy,
         path: reqPath,
         method: "GET",
+        env: unifiedEnv,
+        ctx: null,
       };
 
       // 3. FULL CONTEXT
       const mockContext = {
         req: mockReq,
         res: mockRes,
+        env: unifiedEnv,
+        ctx: null,
         _markDynamic: markAsDynamic,
       };
```

---

### 3.6. `dinou/core/static-assets.js` & `dinou/core/copy-static-dirs.js`

#### `dinou/core/static-assets.js`
```diff
 import path from "node:path";
+import { isDotEnvFileName } from "./runtime-env.js";
@@ -144,8 +145,16 @@ export function isInternalDinouAssetPath(relPosixPath) {
   const baseLower = segments[segments.length - 1].toLowerCase();
-  if (baseLower === ".ds_store" || baseLower === "thumbs.db") {
+  if (
+    baseLower === ".ds_store" ||
+    baseLower === "thumbs.db" ||
+    isDotEnvFileName(baseLower)
+  ) {
     return true;
   }
 
+  if (segments.some((seg) => isDotEnvFileName(seg))) {
+    return true;
+  }
+
   return false;
 }
@@ -300,8 +309,16 @@ export function shouldExportDist3Entry(relPosixPath) {
   const baseLower = segments[segments.length - 1].toLowerCase();
-  if (baseLower === ".ds_store" || baseLower === "thumbs.db") {
+  if (
+    baseLower === ".ds_store" ||
+    baseLower === "thumbs.db" ||
+    isDotEnvFileName(baseLower)
+  ) {
     return false;
   }
 
+  if (segments.some((seg) => isDotEnvFileName(seg))) {
+    return false;
+  }
+
   return true;
 }
```

#### `dinou/core/copy-static-dirs.js`
```diff
 import fs from "node:fs";
 import path from "node:path";
+import { isDotEnvFileName } from "./runtime-env.js";
 
 const IGNORED_OS_BASENAMES = new Set([".ds_store", "thumbs.db"]);
 const warnedCollisionRoots = new Set();
 
 function shouldCopyStaticEntry(srcPath) {
   const baseLower = path.basename(srcPath).toLowerCase();
-  return !IGNORED_OS_BASENAMES.has(baseLower);
+  if (IGNORED_OS_BASENAMES.has(baseLower) || isDotEnvFileName(baseLower)) {
+    return false;
+  }
+  return true;
 }
```

---

### 3.7. `dinou/core/generate-route-types.js`, `dinou/env.d.ts`, `dinou/index.d.ts`, and `dinou/server.d.ts`

#### `dinou/core/generate-route-types.js`
```diff
 import { readCustomAssetExtensionsSync } from "./asset-extensions.js";
+import { collectDeclaredEnvKeys } from "./env.js";
@@ -1011,6 +1012,14 @@ function generateRouteTypes(projectRoot = process.cwd(), retryAttempts = 0) {
           .join("\n")
       : "";
 
+  const declaredEnvKeys = collectDeclaredEnvKeys(projectRoot);
+  const customEnvDeclarations =
+    declaredEnvKeys.length > 0
+      ? `\ndeclare global {\n  namespace NodeJS {\n    interface ProcessEnv {\n${declaredEnvKeys
+          .map((k) => `      ${k}?: string;`)
+          .join("\n")}\n    }\n  }\n}\n`
+      : "";
+
   const content = `// This file is auto-generated by Dinou. Do not edit directly.
 ...
 }
-${customAssetDeclarations}`;
+${customAssetDeclarations}${customEnvDeclarations}`;
```

#### `dinou/env.d.ts` (Full Replacement)
```ts
// dinou/env.d.ts
/// <reference path="./assets.d.ts" />
/// <reference path="./css.d.ts" />

declare var process: NodeJS.Process;

declare namespace NodeJS {
  interface Process {
    env: ProcessEnv;
  }

  interface ProcessEnv {
    NODE_ENV?: "development" | "production" | "test";
    PORT?: string;
    HOST?: string;
    HMR_PORT?: string;
    IDLE_TIMEOUT?: string;
    DINOU_WRITE_TO_DISK?: string;
    DINOU_UNVENDORIZED?: string;
    [key: `DINOU_PUBLIC_${string}`]: string | undefined;
    [key: string]: string | undefined;
  }
}
```

#### `dinou/index.d.ts` & `dinou/server.d.ts`
```diff
+// dinou/index.d.ts
+export interface DinouEnv extends Record<string, any> {}
+
 export interface RequestContextStore {
   req: {
     query: Query;
     cookies: Cookies;
     headers: Headers;
     path: string;
     method: "GET" | "POST" | string;
-    env?: Record<string, any>;
+    env: DinouEnv;
     ctx?: any;
     [key: string]: any;
   };
   res: ResponseProxy;
-  env?: Record<string, any>;
+  env: DinouEnv;
   ctx?: any;
   [key: string]: any;
 }
 ...
-export declare function getContext(): RequestContextStore | undefined;
+export declare function getContext(): RequestContextStore;
```

```diff
 // dinou/server.d.ts
   StaticPathItem,
   StaticPathsResult,
+  DinouEnv,
   RequestContextStore,
 ...
-export declare function getContext(): RequestContextStore | undefined;
+export declare function getContext(): RequestContextStore;
```

---

### 3.8. Bundler Configs (`esbuild`, `rollup`, `webpack`)

#### `dinou/esbuild/dev.js`
```diff
 import { generateRouteTypes } from "../core/generate-route-types.js";
 import { getDinouConfig } from "../core/load-dinou-config.js";
+import { loadEnvFiles } from "../core/env.js";
 
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = path.dirname(__filename);
 
 export async function startEsbuildDev(options = {}) {
+  loadEnvFiles(process.cwd(), { mode: "development" });
```

#### `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`
```diff
 import { copyStaticDirectoriesToOutdir } from "../../core/copy-static-dirs.js";
+import { getEsbuildPublicEnvDefines } from "../../core/env.js";
@@ -167,9 +168,7 @@ export default function getConfigEsbuild({
     metafile: true,
     logLevel: "warning",
-    define: {
-      "process.env.NODE_ENV": JSON.stringify("development"),
-    },
+    define: getEsbuildPublicEnvDefines({ mode: "development" }),
```

#### `dinou/esbuild/build.js`
```diff
 import { createServerAssetPlugin } from "../core/asset-extensions.js";
 import { createServerCssModulesPlugin } from "../core/server-css-modules-plugin.js";
+import { loadEnvFiles, getEsbuildPublicEnvDefines } from "../core/env.js";
 import ensureVendorMode from "../core/ensure-vendor-mode.js";
+loadEnvFiles(process.cwd(), { mode: "production" });
 if (!ensureVendorMode()) {
@@ -144,6 +146,10 @@ try {
     banner: {
       js: "import { createRequire as ___createRequire } from 'node:module'; ...",
     },
+    define: getEsbuildPublicEnvDefines({
+      mode: "production",
+      defineProcessEnvObject: false,
+    }),
     plugins: [
```

#### `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`
```diff
 import { copyStaticDirectoriesToOutdir } from "../../core/copy-static-dirs.js";
+import { getEsbuildPublicEnvDefines } from "../../core/env.js";
@@ -94,9 +95,7 @@ export default function getConfigEsbuildProd({
     logLevel: "warning",
     minify: true,
-    define: {
-      "process.env.NODE_ENV": JSON.stringify("production"),
-    },
+    define: getEsbuildPublicEnvDefines({ mode: "production" }),
```

#### `dinou/rollup/rollup.config.js`
```diff
 import { rollupContextualDinouPlugin } from "../core/resolve-contextual-dinou.js";
 import { getDinouConfig } from "../core/load-dinou-config.js";
+import {
+  loadEnvFiles,
+  getRollupPublicEnvReplacements,
+} from "../core/env.js";
@@ -58,6 +62,10 @@ console.log(
 export default async function () {
   const isDevelopment = process.env.NODE_ENV !== "production";
+  const envMode = isDevelopment ? "development" : "production";
+  loadEnvFiles(process.cwd(), { mode: envMode });
+  const { exactValues: rollupExactEnv, objectValues: rollupObjectEnv } =
+    getRollupPublicEnvReplacements({ mode: envMode });
   const outputDirectory = isDevelopment ? ".dinou/public" : ".dinou/dist3";
@@ -181,10 +189,14 @@ export default async function () {
       tsconfigPaths(),
       replace({
         preventAssignment: true,
-        "process.env.NODE_ENV": JSON.stringify(
-          isDevelopment ? "development" : "production",
-        ),
+        values: rollupExactEnv,
+      }),
+      replace({
+        preventAssignment: true,
+        delimiters: ["(?<!\\.)\\b", "\\b"],
+        values: rollupObjectEnv,
       }),
       json(),
@@ -359,7 +371,7 @@ export default async function () {
     plugins: [
       replace({
         preventAssignment: true,
-        "process.env.NODE_ENV": JSON.stringify("production"),
+        values: rollupExactEnv,
       }),
       json(),
```

#### `dinou/webpack/webpack.config.js`
```diff
 import "./helpers/patch-webpack-internals.js";
-import "dotenv/config";
+import {
+  loadEnvFiles,
+  getWebpackPublicEnvDefines,
+  getEsbuildPublicEnvDefines,
+} from "../core/env.js";
 import path from "node:path";
@@ -50,6 +54,9 @@ const __dirname = path.dirname(fileURLToPath(import.meta.url));
 const isDevelopment = process.env.NODE_ENV !== "production";
+loadEnvFiles(process.cwd(), {
+  mode: isDevelopment ? "development" : "production",
+});
 const outputDirectory = isDevelopment ? ".dinou/public" : ".dinou/dist3";
@@ -101,6 +108,8 @@ function cleanDir(dir) {
 export default async () => {
+  const envMode = isDevelopment ? "development" : "production";
+  loadEnvFiles(process.cwd(), { mode: envMode });
   const dinouConfig = await getDinouConfig();
@@ -495,7 +504,12 @@ export default async () => {
             noErrorOnMissing: true,
             globOptions: {
               dot: true,
-              ignore: ["**/.DS_Store", "**/Thumbs.db"],
+              ignore: [
+                "**/.DS_Store",
+                "**/Thumbs.db",
+                "**/.env",
+                "**/.env.*",
+              ],
             },
           },
@@ -518,14 +532,18 @@ export default async () => {
-      isDevelopment &&
-        new webpack.DefinePlugin({
-          "process.env.DINOU_HMR_PORT": JSON.stringify(
-            String(
-              process.env.HMR_PORT || Number(process.env.PORT || 3000) + 1
-            )
-          ),
-        }),
+      new webpack.DefinePlugin(
+        getWebpackPublicEnvDefines({
+          mode: envMode,
+          extra: isDevelopment
+            ? {
+                DINOU_HMR_PORT: String(
+                  process.env.HMR_PORT || Number(process.env.PORT || 3000) + 1
+                ),
+              }
+            : undefined,
+        })
+      ),
@@ -825,6 +843,12 @@ export default async () => {
     plugins: [
       webpackContextualDinouPlugin({ projectRoot: process.cwd() }),
+      new webpack.DefinePlugin(
+        getEsbuildPublicEnvDefines({
+          mode: "production",
+          defineProcessEnvObject: false,
+        })
+      ),
       new webpack.BannerPlugin({
```

---

### 3.9. Runtimes, Dev Server, Adapters, SSG, Export Static & CLI

#### `dinou/node/dev.js`
```diff
 process.env.DINOU_DEV = "true";
 if (!process.env.NODE_ENV) {
   process.env.NODE_ENV = "development";
 }
 
+import {
+  loadEnvFiles,
+  getEsbuildPublicEnvDefines,
+  getWebpackPublicEnvDefines,
+  isWatchedDotEnvFile,
+} from "../core/env.js";
+loadEnvFiles(process.cwd(), { mode: "development" });
+
 import ensureVendorMode from "../core/ensure-vendor-mode.js";
@@ -1499,28 +1507,46 @@ const ctxA = await esbuild.context({ ... });
-const ctxB = await esbuild.context({
-  ...
-});
+async function createSsrContext() {
+  return esbuild.context({
+    entryPoints: { "ssr-engine": path.join(devDir, "ssr-entry.mjs") },
+    outdir: devDir,
+    splitting: true,
+    outExtension: { ".js": ".mjs" },
+    chunkNames: "chunks/ssr/[name]-[hash]",
+    bundle: true,
+    format: "esm",
+    target: "node20",
+    platform: "node",
+    mainFields: ["module", "main"],
+    conditions: ["node", "worker", "browser", "style"],
+    external: externalList,
+    banner,
+    inject: setupFiles,
+    plugins: [
+      esbuildContextualDinouPlugin({ projectRoot }),
+      serverReferencesPluginSsr,
+      serverCssModulesPlugin,
+      serverAssetPlugin,
+      createDevExternalPackagesPlugin(false),
+    ],
+    alias: commonAlias,
+    loader: commonLoader,
+    jsx: "automatic",
+    define: getEsbuildPublicEnvDefines({
+      mode: "development",
+      defineProcessEnvObject: true,
+      extra: {
+        DINOU_DEV: "true",
+        DINOU_RUNTIME: "node-bundle",
+        DINOU_BUILD_TOOL: isWebpackBuild
+          ? "webpack"
+          : process.env.DINOU_BUILD_TOOL || "esbuild",
+        ...(process.env.DINOU_DEBUG
+          ? { DINOU_DEBUG: process.env.DINOU_DEBUG }
+          : {}),
+      },
+    }),
+    logLevel: "warning",
+  });
+}
+
+let ctxB = await createSsrContext();
```
*(Plus `envWatcher` on `projectRoot` with `depth: 0` calling `loadEnvFiles(projectRoot, { mode: "development", reload: true })`, updating `.dinou/types/routes.d.ts`, recreating `ctxB` & calling `refreshPublicEnv()` / `restart()` when `publicEnvChanged`, and closing `envWatcher` in `cleanup()`).*

#### `dinou/node/bundle-dual-engine.js`, `dinou/node/build.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`, `dinou/deno/build.js`
- Each calls `loadEnvFiles(projectRoot, { mode })` at startup.
- Pass A (`rsc-engine`) uses `getEsbuildPublicEnvDefines({ mode, defineProcessEnvObject: false, extra: { DINOU_RUNTIME, DINOU_BUILD_TOOL } })`.
- Pass B (`ssr-engine`) uses `getEsbuildPublicEnvDefines({ mode, defineProcessEnvObject: true, extra: { DINOU_RUNTIME, DINOU_BUILD_TOOL, ...(process.env.DINOU_DEBUG ? { DINOU_DEBUG: process.env.DINOU_DEBUG } : {}) } })`.
- Generated `node-entry.mjs` (`.dinou/node/server.mjs`), `bun-entry.js` (`.dinou/bun/server.js`), and `deno-entry.js` (`.dinou/deno/main.js`) statically import `{ loadEnvFiles }` and load `.env*` at server boot before reading `PORT` / `HOST` / `IDLE_TIMEOUT`.

#### `dinou/adapters/node.js`, `dinou/adapters/bun.js`, `dinou/adapters/deno.js`, `dinou/adapters/netlify.js`, `dinou/deno/seed-kv.js`, `dinou/core/run-ssg.js`, `dinou/core/export-static.js`, `dinou/cli.js`
- `adapters/node.js`, `adapters/bun.js`, `adapters/deno.js`, `deno/seed-kv.js`, `core/run-ssg.js`, `core/export-static.js`, and `cli.js` (`typegen`) call `loadEnvFiles` on startup; `cli.js` also inspects `readEnvFilesMap(projectRoot).values.DINOU_UNVENDORIZED` without pre-populating child `process.env` so `node/dev.js` accurately tracks `.env*`-injected keys vs shell variables.
- `adapters/netlify.js` passes `{ env: typeof process !== "undefined" && process.env ? process.env : {}, ctx: context || null }` to `handleRequest`.

---

## 4. `CHANGELOG.md` Entry (`9.4.0`)

```markdown
### Added
- **`DINOU_PUBLIC_*` Client Environment Variables & Standard `.env*` Hierarchy**:
  - Added `dinou/core/env.js` and `dinou/core/runtime-env.js` supporting the full `.env.<NODE_ENV>.local` → `.env.local` (skipped in `test`) → `.env.<NODE_ENV>` → `.env` precedence hierarchy (never overriding real OS/CLI shell variables) across all bundlers (`esbuild`, `rollup`, `webpack`), CLI commands (`dev`, `build`, `start`, `export-static`, `typegen`), and standalone Node.js, Bun, and Deno servers.
  - Added compile-time `DINOU_PUBLIC_*` inlining across Esbuild, Rollup, Webpack, and Dual-Engine SSR (`Pass B`), plus live `.env*` hot-reloading in `dinou dev` without restarting the dev server.
  - Automatic TypeScript IntelliSense augmentation for `NodeJS.ProcessEnv` in `.dinou/types/routes.d.ts` (emitting `.env*` and `.env.example` variable names without ever writing secret values) and `DinouEnv` interface for typed `getContext().env` bindings.

### Fixed
- **Environment Variable Loading, SSR Secret Isolation, Unified `getContext().env` & Anti-Bot Shield**:
  - Fixed a regression where `.env` files were ignored in `dinou dev` (`esbuild` & `rollup`), `dinou build` (`esbuild` & `rollup`), `dinou start`, `dinou export-static`, Deno builds, and `dinou dev:webpack` port selection.
  - Fixed a critical SSR/SSG security leak and client hydration crash where accessing unprefixed `process.env.*` inside `"use client"` components leaked server secrets into Pass B SSR/SSG HTML and threw `ReferenceError: process is not defined` in browsers across Esbuild, Rollup, and Webpack.
  - Unified `getContext().env` via a live zero-copy `Proxy` (`createUnifiedEnv`) so plain-text secrets and Cloudflare Workers bindings (KV, D1, R2) resolve consistently across Cloudflare Edge, Node.js, Bun, Deno, Netlify, and SSG, synced Edge string bindings onto `process.env`, wrapped `plugin.onRequest` and `page_functions` / `layout_functions` config hooks in `AsyncLocalStorage`, and fixed `getContext()` TypeScript return type (`RequestContextStore`).
  - Hardened the Anti-Bot Shield and static build pipelines to block `.env.*` and percent-encoded probes (`/.env.production`, `/%2eenv`, `/.%65nv`) with `404` before routing/ISG and physically exclude any accidental `public/.env*` files from `.dinou/dist3`, `.dinou/cloudflare/assets`, and `out/`.
```

---

## 5. Automated Test Suites

### 5.1. Unit & Multi-Bundler / Multi-Runtime Integration Test Suite (`tests/unit/env-vars.test.mjs`)

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

async function importDinou(relPath) {
  return import(pathToFileURL(path.join(dinouRoot, relPath)).href);
}

function createFixtureApp(prefix) {
  const fixturesBase = path.join(repoRoot, ".dinou", "tmp-env-fixtures");
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
  fs.writeFileSync(
    path.join(tmpApp, "package.json"),
    JSON.stringify(
      { name: "dinou-env-fixture", version: "1.0.0", type: "module" },
      null,
      2
    ),
    "utf8"
  );
  return { fixturesBase, tmpApp };
}

test("1. parseDotEnv, standard .env* hierarchy precedence, shell priority, and hot-reload", async () => {
  const { parseDotEnv, getEnvFileHierarchy, loadEnvFiles } =
    await importDinou("core/env.js");
  const { fixturesBase, tmpApp } = createFixtureApp("env-hierarchy-");

  const savedShellVal = process.env.DINOU_TEST_SHELL_WIN;
  process.env.DINOU_TEST_SHELL_WIN = "from_real_shell";

  try {
    const parsed = parseDotEnv(
      `\uFEFF# Comment line
export SIMPLE_KEY=hello_world # inline comment
SINGLE_QUOTED='literal \\n # hash stays'
DOUBLE_QUOTED="line1\\nline2 # hash stays"
MULTILINE_PEM="-----BEGIN KEY-----
ABCDEF123456
-----END KEY-----"
EMPTY_VAL=
`
    );
    assert.equal(parsed.SIMPLE_KEY, "hello_world");
    assert.equal(parsed.SINGLE_QUOTED, "literal \\n # hash stays");
    assert.equal(parsed.DOUBLE_QUOTED, "line1\nline2 # hash stays");
    assert.equal(
      parsed.MULTILINE_PEM,
      "-----BEGIN KEY-----\nABCDEF123456\n-----END KEY-----"
    );
    assert.equal(parsed.EMPTY_VAL, "");

    assert.deepEqual(getEnvFileHierarchy("development"), [
      ".env.development.local",
      ".env.local",
      ".env.development",
      ".env",
    ]);
    assert.deepEqual(getEnvFileHierarchy("test"), [
      ".env.test.local",
      ".env.test",
      ".env",
    ]);

    fs.writeFileSync(
      path.join(tmpApp, ".env"),
      `DINOU_TEST_SHELL_WIN=from_base
DINOU_TEST_TIER=from_base
DINOU_TEST_ONLY_BASE=base_ok
DINOU_PUBLIC_TEST_BRAND=BaseBrand
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, ".env.development"),
      `DINOU_TEST_TIER=from_dev
DINOU_PUBLIC_TEST_BRAND=DevBrand
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, ".env.local"),
      `DINOU_TEST_TIER=from_local
DINOU_TEST_LOCAL_SECRET=local_secret_v1
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, ".env.development.local"),
      `DINOU_TEST_TIER=from_dev_local
`,
      "utf8"
    );

    loadEnvFiles(tmpApp, { mode: "development" });

    assert.equal(
      process.env.DINOU_TEST_SHELL_WIN,
      "from_real_shell",
      "Real OS/CLI shell variables must never be overwritten by .env* files"
    );
    assert.equal(process.env.DINOU_TEST_TIER, "from_dev_local");
    assert.equal(process.env.DINOU_TEST_LOCAL_SECRET, "local_secret_v1");
    assert.equal(process.env.DINOU_TEST_ONLY_BASE, "base_ok");
    assert.equal(process.env.DINOU_PUBLIC_TEST_BRAND, "DevBrand");

    fs.writeFileSync(
      path.join(tmpApp, ".env.local"),
      `DINOU_TEST_TIER=from_local_v2\n`,
      "utf8"
    );
    fs.unlinkSync(path.join(tmpApp, ".env.development.local"));

    const reload1 = loadEnvFiles(tmpApp, { mode: "development", reload: true });
    assert.equal(reload1.changed, true);
    assert.equal(reload1.publicEnvChanged, false);
    assert.equal(process.env.DINOU_TEST_TIER, "from_local_v2");
    assert.equal(
      process.env.DINOU_TEST_LOCAL_SECRET,
      undefined,
      "Deleted .env keys must be cleaned up on hot-reload"
    );
    assert.equal(process.env.DINOU_TEST_SHELL_WIN, "from_real_shell");

    fs.writeFileSync(
      path.join(tmpApp, ".env.development"),
      `DINOU_PUBLIC_TEST_BRAND=HotReloadedBrand\n`,
      "utf8"
    );
    const reload2 = loadEnvFiles(tmpApp, { mode: "development", reload: true });
    assert.equal(reload2.changed, true);
    assert.equal(reload2.publicEnvChanged, true);
    assert.equal(process.env.DINOU_PUBLIC_TEST_BRAND, "HotReloadedBrand");

    fs.rmSync(path.join(tmpApp, ".env"), { force: true });
    fs.rmSync(path.join(tmpApp, ".env.local"), { force: true });
    fs.rmSync(path.join(tmpApp, ".env.development"), { force: true });
    loadEnvFiles(tmpApp, { mode: "development", reload: true });
  } finally {
    if (savedShellVal === undefined) delete process.env.DINOU_TEST_SHELL_WIN;
    else process.env.DINOU_TEST_SHELL_WIN = savedShellVal;
    fs.rmSync(tmpApp, { recursive: true, force: true });
    if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
      fs.rmSync(fixturesBase, { recursive: true, force: true });
    }
  }
});

test("2. TypeScript .env* key discovery emits ProcessEnv keys in routes.d.ts without leaking values", async () => {
  const { generateRouteTypes } = await importDinou(
    "core/generate-route-types.js"
  );
  const { fixturesBase, tmpApp } = createFixtureApp("env-typegen-");

  try {
    fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      "export default function Page() { return <div>Home</div>; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, ".env"),
      `NODE_ENV=development
DATABASE_URL="postgresql://admin:ULTRA_TOP_SECRET_PASSWORD@db.internal:5432/prod"
DINOU_PUBLIC_ANALYTICS_ID="G-999888777"
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, ".env.example"),
      `STRIPE_WEBHOOK_SECRET="whsec_placeholder"\n`,
      "utf8"
    );

    generateRouteTypes(tmpApp);
    const routesDts = fs.readFileSync(
      path.join(tmpApp, ".dinou", "types", "routes.d.ts"),
      "utf8"
    );

    assert.match(routesDts, /DATABASE_URL\?: string;/);
    assert.match(routesDts, /DINOU_PUBLIC_ANALYTICS_ID\?: string;/);
    assert.match(routesDts, /STRIPE_WEBHOOK_SECRET\?: string;/);
    assert.equal(
      routesDts.includes("NODE_ENV?: string;"),
      false,
      "Reserved @types/node NODE_ENV union must not be widened to string"
    );
    assert.equal(
      routesDts.includes("ULTRA_TOP_SECRET_PASSWORD"),
      false,
      "Secret values must NEVER be written to .dinou/types/routes.d.ts"
    );
    assert.equal(routesDts.includes("G-999888777"), false);
  } finally {
    fs.rmSync(tmpApp, { recursive: true, force: true });
    if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
      fs.rmSync(fixturesBase, { recursive: true, force: true });
    }
  }
});

test("3. Unified getContext().env preserves live Cloudflare bindings and falls back to process.env", async () => {
  const { createUnifiedEnv, syncEdgeEnvToProcessEnv } = await importDinou(
    "core/runtime-env.js"
  );
  const { requestStorage, getContext } = await importDinou(
    "core/request-context.js"
  );

  class MockKVNamespace {
    #store = new Map([["user:42", "Ada Lovelace"]]);
    async get(key) {
      return this.#store.get(key) ?? null;
    }
  }

  const prevFallback = process.env.DINOU_UNIFIED_NODE_SECRET;
  process.env.DINOU_UNIFIED_NODE_SECRET = "node_secret_abc";
  delete process.env.DINOU_EDGE_ONLY_TEXT;

  try {
    const kvBinding = new MockKVNamespace();
    const edgeEnv = {
      MY_KV: kvBinding,
      DINOU_EDGE_ONLY_TEXT: "edge_text_xyz",
    };

    syncEdgeEnvToProcessEnv(edgeEnv);
    assert.equal(
      process.env.DINOU_EDGE_ONLY_TEXT,
      "edge_text_xyz",
      "Plain-text Edge bindings should sync onto process.env when unset"
    );
    assert.equal(
      process.env.MY_KV,
      undefined,
      "Live object bindings (KV/D1/R2) must not be stringified onto process.env"
    );

    const unified = createUnifiedEnv(edgeEnv);
    assert.equal(unified.MY_KV, kvBinding);
    assert.equal(await unified.MY_KV.get("user:42"), "Ada Lovelace");
    assert.equal(unified.DINOU_UNIFIED_NODE_SECRET, "node_secret_abc");
    assert.equal("MY_KV" in unified, true);
    assert.equal("DINOU_UNIFIED_NODE_SECRET" in unified, true);

    const keys = Object.keys(unified);
    assert.equal(keys.includes("MY_KV"), true);
    assert.equal(keys.includes("DINOU_UNIFIED_NODE_SECRET"), true);

    const outsideCtx = getContext();
    assert.equal(outsideCtx.env.DINOU_UNIFIED_NODE_SECRET, "node_secret_abc");

    await requestStorage.run({ req: {}, res: {}, env: unified }, async () => {
      const { env } = getContext();
      assert.equal(await env.MY_KV.get("user:42"), "Ada Lovelace");
      assert.equal(env.DINOU_UNIFIED_NODE_SECRET, "node_secret_abc");
    });
  } finally {
    if (prevFallback === undefined) delete process.env.DINOU_UNIFIED_NODE_SECRET;
    else process.env.DINOU_UNIFIED_NODE_SECRET = prevFallback;
    delete process.env.DINOU_EDGE_ONLY_TEXT;
  }
});

test("4. Anti-Bot Shield and public/ static copying strictly block .env* and encoded probes", async () => {
  const { isBotEnvProbePath } = await importDinou("core/runtime-env.js");
  const { shouldExportDist3Entry, isInternalDinouAssetPath } =
    await importDinou("core/static-assets.js");
  const { copyStaticDirectoriesToOutdir } = await importDinou(
    "core/copy-static-dirs.js"
  );
  const { fixturesBase, tmpApp } = createFixtureApp("env-shield-");

  try {
    for (const blocked of [
      "/.env",
      "/.env.local",
      "/.env.production",
      "/.env.development.local",
      "/api/.env",
      "/api/.env.staging",
      "/config/secrets.env",
      "/%2eenv",
      "/.%65nv",
      "/%2eenv.production",
      "/%252eenv",
    ]) {
      assert.equal(
        isBotEnvProbePath(blocked),
        true,
        `Expected Anti-Bot Shield to block ${blocked}`
      );
    }

    for (const allowed of [
      "/",
      "/docs/env",
      "/docs/env-vars",
      "/blog/dotenv-tutorial",
      "/.well-known/apple-app-site-association",
    ]) {
      assert.equal(
        isBotEnvProbePath(allowed),
        false,
        `Expected Anti-Bot Shield to allow ${allowed}`
      );
    }

    assert.equal(isInternalDinouAssetPath(".env"), true);
    assert.equal(isInternalDinouAssetPath(".env.production"), true);
    assert.equal(isInternalDinouAssetPath("sub/.env.local"), true);
    assert.equal(shouldExportDist3Entry(".env"), false);
    assert.equal(shouldExportDist3Entry(".env.local"), false);
    assert.equal(shouldExportDist3Entry(".well-known/security.txt"), true);

    fs.mkdirSync(path.join(tmpApp, "public", ".well-known"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(tmpApp, "public", ".env"), "SECRET=1\n", "utf8");
    fs.writeFileSync(
      path.join(tmpApp, "public", ".env.production"),
      "SECRET=2\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "public", ".well-known", "security.txt"),
      "Contact: mailto:sec@example.com\n",
      "utf8"
    );

    copyStaticDirectoriesToOutdir(tmpApp, ".dinou/dist3");
    assert.equal(
      fs.existsSync(path.join(tmpApp, ".dinou", "dist3", ".env")),
      false
    );
    assert.equal(
      fs.existsSync(path.join(tmpApp, ".dinou", "dist3", ".env.production")),
      false
    );
    assert.equal(
      fs.existsSync(
        path.join(tmpApp, ".dinou", "dist3", ".well-known", "security.txt")
      ),
      true
    );
  } finally {
    fs.rmSync(tmpApp, { recursive: true, force: true });
    if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
      fs.rmSync(fixturesBase, { recursive: true, force: true });
    }
  }
});

test("5. Esbuild dev mode loads .env, inlines DINOU_PUBLIC_*, strips secrets, and hot-reloads on restart()", async () => {
  const { startEsbuildDev } = await importDinou("esbuild/dev.js");
  const { loadEnvFiles } = await importDinou("core/env.js");
  const { fixturesBase, tmpApp } = createFixtureApp("env-dev-inproc-");

  const prevCwd = process.cwd();
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDinouDev = process.env.DINOU_DEV;
  let handle = null;

  try {
    fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, ".env"),
      `DEV_PRIVATE_SECRET="SUPER_SECRET_DEV_999"
DINOU_PUBLIC_BANNER="DevBanner_V1"
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "banner.tsx"),
      `"use client";
export default function Banner() {
  return <div data-pub={process.env.DINOU_PUBLIC_BANNER} data-sec={String(process.env.DEV_PRIVATE_SECRET)} />;
}
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import Banner from "./banner";
export default function Page() { return <Banner />; }
`,
      "utf8"
    );

    process.chdir(tmpApp);
    process.env.NODE_ENV = "development";
    handle = await startEsbuildDev({ hmrPort: 0 });

    const allMemJs1 = Array.from(globalThis.__DINOU_MEM_FILES__.entries())
      .filter(([k]) => k.endsWith(".js"))
      .map(([, buf]) => buf.toString("utf8"))
      .join("\n");

    assert.equal(allMemJs1.includes("DevBanner_V1"), true);
    assert.equal(allMemJs1.includes("SUPER_SECRET_DEV_999"), false);

    fs.writeFileSync(
      path.join(tmpApp, ".env"),
      `DEV_PRIVATE_SECRET="SUPER_SECRET_DEV_999"
DINOU_PUBLIC_BANNER="DevBanner_V2_Reloaded"
`,
      "utf8"
    );
    const reload = loadEnvFiles(tmpApp, { mode: "development", reload: true });
    assert.equal(reload.publicEnvChanged, true);
    await handle.restart();

    const allMemJs2 = Array.from(globalThis.__DINOU_MEM_FILES__.entries())
      .filter(([k]) => k.endsWith(".js"))
      .map(([, buf]) => buf.toString("utf8"))
      .join("\n");

    assert.equal(allMemJs2.includes("DevBanner_V2_Reloaded"), true);
    assert.equal(allMemJs2.includes("SUPER_SECRET_DEV_999"), false);

    fs.rmSync(path.join(tmpApp, ".env"), { force: true });
    loadEnvFiles(tmpApp, { mode: "development", reload: true });
  } finally {
    if (handle?.close) await handle.close();
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

test("6. Full Matrix Parity: Esbuild, Rollup, Webpack + Static Export + Cloudflare/Bun/Deno + Zero Secret Leaks", async () => {
  const { fixturesBase, tmpApp } = createFixtureApp("env-prod-matrix-");
  const PRIVATE_SECRET = "sk_live_ULTRA_PRIVATE_99887766_DO_NOT_LEAK";
  const DB_SECRET_URL = "postgresql://dbuser:SUPER_DB_PASS_5544@db.internal/app";

  try {
    fs.mkdirSync(path.join(tmpApp, "src", "[slug]"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "public"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["./src/*"] },
        },
      }),
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, ".env"),
      `DATABASE_URL="${DB_SECRET_URL}"
STRIPE_SECRET_KEY="${PRIVATE_SECRET}"
DINOU_PUBLIC_APP_NAME="BaseAppName"
DINOU_PUBLIC_API_BASE="https://base.example.com"
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, ".env.production"),
      `DINOU_PUBLIC_APP_NAME="ProdMatrixApp"
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "public", ".env"),
      `ACCIDENTAL_PUBLIC_ENV="${PRIVATE_SECRET}"\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "public", "robots.txt"),
      "User-agent: *\nAllow: /\n",
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "client-env-box.tsx"),
      `"use client";
export default function ClientEnvBox({ serverPassedPub }: { serverPassedPub: string }) {
  const directPub = process.env.DINOU_PUBLIC_APP_NAME;
  const { DINOU_PUBLIC_API_BASE, STRIPE_SECRET_KEY } = process.env;
  const directSecretAttempt = process.env.STRIPE_SECRET_KEY;

  return (
    <div
      id="client-env-box"
      data-direct-pub={directPub}
      data-destructured-api={DINOU_PUBLIC_API_BASE}
      data-server-prop={serverPassedPub}
      data-leak-direct={String(directSecretAttempt)}
      data-leak-destructured={String(STRIPE_SECRET_KEY)}
    >
      Client:{directPub}|{DINOU_PUBLIC_API_BASE}|Leak:{String(directSecretAttempt)}
    </div>
  );
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "page_functions.ts"),
      `import { getContext } from "dinou";

export async function getProps() {
  const { env } = getContext();
  const hasDbInContextEnv = typeof env.DATABASE_URL === "string" && env.DATABASE_URL.includes("db.internal");
  const hasStripeInProcessEnv = typeof process.env.STRIPE_SECRET_KEY === "string" && process.env.STRIPE_SECRET_KEY.startsWith("sk_live_");
  return {
    serverStatus: \`ctxDb:\${hasDbInContextEnv}|procStripe:\${hasStripeInProcessEnv}\`,
    serverPubName: process.env.DINOU_PUBLIC_APP_NAME || "missing",
  };
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import ClientEnvBox from "./client-env-box";

export default function Page({
  serverStatus,
  serverPubName,
}: {
  serverStatus: string;
  serverPubName: string;
}) {
  return (
    <html>
      <head><title>Env Matrix</title></head>
      <body>
        <div id="server-status">{serverStatus}</div>
        <ClientEnvBox serverPassedPub={serverPubName} />
      </body>
    </html>
  );
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "[slug]", "page.tsx"),
      `export default function DynamicPage({ params }: { params: { slug: string } }) {
  return <html><body><div>Slug:{params.slug}</div></body></html>;
}
`,
      "utf8"
    );

    function assertZeroSecretInDir(dirPath, label) {
      if (!fs.existsSync(dirPath)) return;
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          assertZeroSecretInDir(full, label);
        } else {
          assert.notEqual(
            entry.name.toLowerCase(),
            ".env",
            `[${label}] .env file must never exist inside ${dirPath}`
          );
          assert.equal(
            entry.name.toLowerCase().startsWith(".env."),
            false,
            `[${label}] .env.* file must never exist inside ${dirPath}`
          );
          const text = fs.readFileSync(full, "utf8");
          assert.equal(
            text.includes(PRIVATE_SECRET),
            false,
            `[${label}] CRITICAL SECRET LEAK detected in ${full}!`
          );
          assert.equal(
            text.includes("SUPER_DB_PASS_5544"),
            false,
            `[${label}] CRITICAL DB PASSWORD LEAK detected in ${full}!`
          );
        }
      }
    }

    for (const cmd of [
      "build:node:esbuild",
      "build:node:rollup",
      "build:node:webpack",
    ]) {
      const res = spawnSync(process.execPath, [cliPath, cmd], {
        cwd: tmpApp,
        encoding: "utf8",
      });
      assert.equal(
        res.status,
        0,
        `${cmd} failed:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
      );

      assertZeroSecretInDir(path.join(tmpApp, ".dinou", "dist3"), `${cmd}:dist3`);
      assertZeroSecretInDir(path.join(tmpApp, ".dinou", "dist2"), `${cmd}:dist2`);

      const ssgHtml = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist2", "index.html"),
        "utf8"
      );
      assert.match(ssgHtml, /ctxDb:true\|procStripe:true/);
      assert.match(
        ssgHtml,
        /Client:(?:<!-- -->)?ProdMatrixApp(?:<!-- -->)?\|(?:<!-- -->)?https:\/\/base\.example\.com(?:<!-- -->)?\|Leak:(?:<!-- -->)?undefined/
      );
      assert.equal(ssgHtml.includes('data-leak-direct="undefined"'), true);
      assert.equal(ssgHtml.includes('data-leak-destructured="undefined"'), true);

      const dist3Js = fs
        .readdirSync(path.join(tmpApp, ".dinou", "dist3"))
        .filter((f) => f.endsWith(".js"))
        .map((f) =>
          fs.readFileSync(path.join(tmpApp, ".dinou", "dist3", f), "utf8")
        )
        .join("\n");
      assert.equal(
        dist3Js.includes("ProdMatrixApp"),
        true,
        `[${cmd}] Client chunks must inline .env.production DINOU_PUBLIC_APP_NAME`
      );
      assert.equal(
        dist3Js.includes("https://base.example.com"),
        true,
        `[${cmd}] Client chunks must inline .env DINOU_PUBLIC_API_BASE`
      );
    }

    const prevCwd = process.cwd();
    process.chdir(tmpApp);
    try {
      const serverMod = await import(
        pathToFileURL(path.join(tmpApp, ".dinou", "node", "server.mjs")).href +
          `?t=${Date.now()}`
      );
      for (const probe of [
        "/.env",
        "/.env.local",
        "/.env.production",
        "/%2eenv",
        "/.%65nv",
      ]) {
        const botRes = await serverMod.fetch(
          new Request(`http://localhost${probe}`)
        );
        assert.equal(
          botRes.status,
          404,
          `Probe ${probe} must return 404 from Anti-Bot Shield`
        );
      }
      assert.equal(
        fs.existsSync(path.join(tmpApp, ".dinou", "dist2", ".env.production")),
        false,
        "Bot probe /.env.production must NEVER trigger [slug] ISG cache generation"
      );
    } finally {
      process.chdir(prevCwd);
    }

    const expRes = spawnSync(process.execPath, [cliPath, "export-static"], {
      cwd: tmpApp,
      encoding: "utf8",
    });
    assert.equal(expRes.status, 0, `export-static failed:\n${expRes.stderr}`);
    assertZeroSecretInDir(path.join(tmpApp, "out"), "export-static:out");
    assert.equal(
      fs
        .readFileSync(path.join(tmpApp, "out", "index.html"), "utf8")
        .includes("ProdMatrixApp"),
      true
    );

    for (const [runtimeName, scriptRel, outSubdir, ssrFile] of [
      ["cloudflare", ["cloudflare", "build.js"], "cloudflare", "ssr-engine.js"],
      ["bun", ["bun", "build.js"], "bun", "ssr-engine.js"],
      ["deno", ["deno", "build.js"], "deno", "ssr-engine.js"],
    ]) {
      const rtRes = spawnSync(
        process.execPath,
        [path.join(dinouRoot, ...scriptRel)],
        { cwd: tmpApp, encoding: "utf8" }
      );
      assert.equal(
        rtRes.status,
        0,
        `${runtimeName} build failed:\n${rtRes.stdout}\n${rtRes.stderr}`
      );
      const ssrCode = fs.readFileSync(
        path.join(tmpApp, ".dinou", outSubdir, ssrFile),
        "utf8"
      );
      assert.equal(
        ssrCode.includes("ProdMatrixApp"),
        true,
        `[${runtimeName}] SSR engine should inline DINOU_PUBLIC_APP_NAME`
      );
      assert.equal(
        ssrCode.includes(PRIVATE_SECRET),
        false,
        `[${runtimeName}] SSR engine must never inline private secrets`
      );
    }
    assertZeroSecretInDir(
      path.join(tmpApp, ".dinou", "cloudflare", "assets"),
      "cloudflare:assets"
    );
  } finally {
    delete process.env.DATABASE_URL;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.DINOU_PUBLIC_APP_NAME;
    delete process.env.DINOU_PUBLIC_API_BASE;
    fs.rmSync(tmpApp, { recursive: true, force: true });
    if (fs.existsSync(fixturesBase) && fs.readdirSync(fixturesBase).length === 0) {
      fs.rmSync(fixturesBase, { recursive: true, force: true });
    }
  }
});
```

---

### 5.2. Playwright End-to-End Test Suite (`tests/e2e/env-vars.spec.ts`)

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

function getFreePortPair(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s1 = net.createServer();
    s1.listen(0, "127.0.0.1", () => {
      const addr = s1.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const s2 = net.createServer();
      s2.listen(port + 1, "127.0.0.1", () => {
        s2.close(() => s1.close((err) => (err ? reject(err) : resolve(port))));
      });
      s2.on("error", () => {
        s1.close(() => getFreePortPair().then(resolve, reject));
      });
    });
    s1.on("error", reject);
  });
}

async function waitForServer(url: string, timeoutMs = 45000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/__DINOU_STATUS_PLAYWRIGHT__`);
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as {
          isReady?: boolean;
        } | null;
        if (!json || json.isReady !== false) return;
      }
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

function createE2EEnvFixture(prefix: string, port: number) {
  const fixturesBase = path.join(repoRoot, ".dinou", "tmp-e2e-env");
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
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(
      { name: "dinou-e2e-env", version: "1.0.0", type: "module" },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(appDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@/*": ["./src/*"] },
      },
    }),
    "utf8"
  );

  // PORT configured exclusively via .env (not CLI env) + private secret + DINOU_PUBLIC_*
  fs.writeFileSync(
    path.join(appDir, ".env"),
    `PORT=${port}
DB_MASTER_PASSWORD="TOP_SECRET_E2E_PASSWORD_12345"
DINOU_PUBLIC_SITE_TITLE="Dinou_Public_V1"
`,
    "utf8"
  );

  fs.mkdirSync(path.join(appDir, "src"), { recursive: true });

  fs.writeFileSync(
    path.join(appDir, "src", "actions.ts"),
    `"use server";
import { getContext } from "dinou";

export async function verifyServerSecretAction() {
  const { env } = getContext();
  return env.DB_MASTER_PASSWORD === "TOP_SECRET_E2E_PASSWORD_UPDATED"
    ? "SECRET_V2_VERIFIED"
    : env.DB_MASTER_PASSWORD === "TOP_SECRET_E2E_PASSWORD_12345"
      ? "SECRET_V1_VERIFIED"
      : "SECRET_MISSING";
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(appDir, "src", "env-inspector.tsx"),
    `"use client";
import { useState } from "react";
import { verifyServerSecretAction } from "./actions";

export default function EnvInspector() {
  const [rpcStatus, setRpcStatus] = useState("idle");
  const pubTitle = process.env.DINOU_PUBLIC_SITE_TITLE;
  const { DB_MASTER_PASSWORD } = process.env;
  const directLeak = process.env.DB_MASTER_PASSWORD;

  return (
    <div
      id="client-inspector"
      data-pub-title={pubTitle}
      data-leak-direct={String(directLeak)}
      data-leak-destructured={String(DB_MASTER_PASSWORD)}
    >
      <span id="pub-title">{pubTitle}</span>
      <button
        id="check-rpc"
        onClick={async () => {
          const res = await verifyServerSecretAction();
          setRpcStatus(res);
        }}
      >
        Check Server Secret
      </button>
      <span id="rpc-result">{rpcStatus}</span>
    </div>
  );
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(appDir, "src", "page.tsx"),
    `import { getContext } from "dinou";
import EnvInspector from "./env-inspector";

export default function Page() {
  const { env } = getContext();
  const hasServerSecret = Boolean(env.DB_MASTER_PASSWORD);

  return (
    <html lang="en">
      <head>
        <title>Dinou Env E2E</title>
      </head>
      <body>
        <div id="server-indicator" data-has-secret={String(hasServerSecret)}>
          ServerReady:{String(hasServerSecret)}
        </div>
        <EnvInspector />
      </body>
    </html>
  );
}
`,
    "utf8"
  );

  return { fixturesBase, appDir };
}

test.describe("Dinou Environment Variables, DINOU_PUBLIC_*, Anti-Bot Shield & Live Hot-Reload E2E", () => {
  test("binds PORT from .env, hydrates DINOU_PUBLIC_* without ReferenceError or secret leaks, blocks .env* probes, and hot-reloads .env edits", async ({
    page,
  }) => {
    const port = await getFreePortPair();
    const { fixturesBase, appDir } = createE2EEnvFixture("e2e-dev-", port);
    let devProc: ChildProcess | null = null;

    try {
      const spawnEnv = { ...process.env, CI: "true" };
      delete spawnEnv.PORT;
      delete spawnEnv.HMR_PORT;

      devProc = spawn(process.execPath, [cliPath, "dev:esbuild"], {
        cwd: appDir,
        env: spawnEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
      devProc.stdout?.on("data", () => {});
      devProc.stderr?.on("data", () => {});

      const baseUrl = `http://127.0.0.1:${port}`;
      await waitForServer(baseUrl);

      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await page.goto(baseUrl);
      await expect(page.locator("#server-indicator")).toHaveAttribute(
        "data-has-secret",
        "true"
      );
      await expect(page.locator("#pub-title")).toHaveText("Dinou_Public_V1");
      await expect(page.locator("#client-inspector")).toHaveAttribute(
        "data-leak-direct",
        "undefined"
      );
      await expect(page.locator("#client-inspector")).toHaveAttribute(
        "data-leak-destructured",
        "undefined"
      );

      // Ensure private secret is completely absent from HTML and zero ReferenceError occurred
      const htmlContent = await page.content();
      expect(htmlContent).not.toContain("TOP_SECRET_E2E_PASSWORD_12345");
      expect(pageErrors).toEqual([]);
      expect(consoleErrors.some((e) => /hydration|process is not defined/i.test(e))).toBe(
        false
      );

      // Verify Server Function reads getContext().env secret on the server
      await page.locator("#check-rpc").click();
      await expect(page.locator("#rpc-result")).toHaveText("SECRET_V1_VERIFIED");

      // Verify Anti-Bot Shield blocks /.env, /.env.local, and /%2eenv
      for (const probe of ["/.env", "/.env.local", "/%2eenv", "/.%65nv"]) {
        const res = await fetch(`${baseUrl}${probe}`);
        expect(res.status).toBe(404);
      }

      // Live Hot-Reload: edit .env on disk without restarting dinou dev!
      fs.writeFileSync(
        path.join(appDir, ".env"),
        `PORT=${port}
DB_MASTER_PASSWORD="TOP_SECRET_E2E_PASSWORD_UPDATED"
DINOU_PUBLIC_SITE_TITLE="Dinou_Public_V2_HotReloaded"
`,
        "utf8"
      );

      await expect
        .poll(
          async () => {
            await page.reload();
            return await page.locator("#pub-title").textContent();
          },
          { timeout: 15000 }
        )
        .toBe("Dinou_Public_V2_HotReloaded");

      await page.locator("#check-rpc").click();
      await expect(page.locator("#rpc-result")).toHaveText("SECRET_V2_VERIFIED");
      expect(await page.content()).not.toContain(
        "TOP_SECRET_E2E_PASSWORD_UPDATED"
      );
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
