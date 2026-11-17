# Dinou `v9.4.0` — Configuration, `setupFiles` & Plugin Architecture Audit & Fixes (`x-plugins-fixes.md`)

## 1. Executive Summary & Root-Cause Analysis

During the pre-release audit of `/docs/plugins` (`dinou.config.*`, `defineConfig`, `setupFiles`, `configureServer`, and `onRequest`), seven architectural bugs and parity gaps were uncovered across Dinou's configuration loader, request handler, client router, bundlers, and Dual-Bundle runtime compilers:

1. **CRITICAL — `dinou.config.*` & `plugins` Silently Degraded to `{ plugins: [] }` in Production Edge, Serverless, Compiled Binaries, & `--omit=dev` Containers**:
   - **Root Cause**: `cloudflare/build.js`, `bun/build.js`, `deno/build.js`, `node/bundle-dual-engine.js`, `esbuild/build.js`, `rollup/rollup.config.js`, and `webpack/webpack.config.js` evaluated `getDinouConfig()` only inside the build CLI script to read `setupFiles` and `assetExtensions`. None of them embedded `dinou.config.*` into `rsc-entry` or `.dinou/dist1/server/` (`handler.js`, `netlify.js`). At runtime, `handler.js` called `load-dinou-config.js`, which checked disk via `fs.existsSync` and invoked `esbuild.build()`. In Cloudflare `workerd` (where `esbuild` is shimmed to `{}` and VFS only contains `src/`), Deno Deploy, standalone compiled binaries (`dist/server`), or Docker images pruned with `npm ci --omit=dev`, `getDinouConfig()` silently returned `{ plugins: [] }`—disabling `onRequest`, `ppr`, `allowISG`, and custom `storage`! Additionally, `node/build.js` emitted `await import("${dinouDirSlash}/core/load-dinou-config.js")`, baking an absolute build-machine filesystem path into `.dinou/node/server.mjs`, and `rollup/rollup.config.js` ran `del({ targets: [".dinou/dist1/*"], hook: "buildStart" })` *after* config evaluation, wiping pre-generated `.dinou/dist1/` bootstrap files before `serverConfig` ran.
   - **Architectural Fix**:
     - Production Dual-Bundle compilers (`node/bundle-dual-engine.js`, `node/build.js`, `cloudflare/build.js`, `bun/build.js`, `deno/build.js`) now emit static AOT imports of the discovered `dinou.config.{ts,mjs,js,cjs}` directly into `rsc-entry` and `node-entry`, populating `globalThis.__DINOU_AOT_CONFIG__` and eliminating dynamic build-machine path imports.
     - `load-dinou-config.js` exports `prepareDist1ServerEntries()`, which pre-transpiles `setupFiles` + `dinou.config.*` into pure ESM (`.dinou/dist1/dinou-server-bootstrap.mjs`) and wraps `handler` and `netlify` entries across Esbuild, Rollup, and Webpack (`.dinou/dist1/server/`), while `rollup.config.js` cleans `.dinou/dist1` up-front prior to entry generation.

2. **CRITICAL — Security Bypass of `onRequest` Route Guards on `<Link>` SPA Navigations, Flight Parser Crash on `Response.redirect()`, & Unwanted Build-Time SSG Execution**:
   - **Root Cause**:
     - On `<Link href="/dashboard">` client navigations, Dinou fetches `/____rsc_page____/dashboard` (or `/____rsc_layout____/dashboard`). `handler.js` set `simReq.path = pathname` (`"/____rsc_page____/dashboard"`), bypassing any `onRequest` guard checking `context.req.path.startsWith("/dashboard")` (and breaking server `usePathname()` and relative redirects on RSC requests).
     - When `onRequest` returned a `3xx` `Response` (e.g. `Response.redirect(new URL("/login", request.url), 302)`) on an `/____rsc_*` request, browser `fetch()` followed the `302` redirect to `/login`, received `text/html`, and fed HTML into React's Flight `createFromFetch()`, crashing client navigation instead of issuing an `x-rsc-redirect` transition. Furthermore, `getLayoutPayload` in `client.jsx` and `client-webpack.jsx` lacked `x-rsc-redirect` handling completely.
     - `plugin.onRequest` and `plugin.onRequestContext` also executed during build-time SSG (`platformContext.isSSG === true`), causing authentication guards or request loggers to block or pollute static page pre-rendering.
   - **Architectural Fix**:
     - Added `normalizeLogicalRequestPathname()` in `handler.js`: `context.req.path` is always normalized to the logical route pathname (`"/dashboard"`), while exposing `context.req.rawPath` and `context.req.isRscRequest`.
     - Added `finalizePluginResponse()` in `handler.js`: any `3xx` `Response` with a `Location` header returned by `onRequest` on an `/____rsc_*` wire request is automatically converted into a `200` `x-rsc-redirect` response (preserving `Set-Cookie` headers). Both `getPagePayload` and `getLayoutPayload` in `client.jsx` and `client-webpack.jsx` now handle internal and external `x-rsc-redirect` targets cleanly.
     - Skipped `plugin.onRequest` and `plugin.onRequestContext` when `platformContext?.isSSG === true`, while guaranteeing `onRequest` always runs at runtime ahead of both dynamic routes and pre-rendered/cached SSG, ISR, and PPR routes.

3. **CRITICAL — `context.res` Mutations Inside `onRequest` Were Ignored or Overwritten**:
   - **Root Cause**:
     - Calling `context.res.redirect("/login")` inside `onRequest` resolved `bridge` and returned `undefined`; because `handler.js` only checked `if (result instanceof Response)`, execution continued into protected pages and `"use server"` actions!
     - Explicit `context.res.status(code)` and `context.res.setHeader("Cache-Control", ...)` calls were overwritten by hardcoded `bridge.status(200)` and `Cache-Control: no-store, ...` across dynamic SSR, cached SSG/ISR HTML, RSC endpoints, and `ppr-runtime.js` (which also omitted `bridge.cookies`).
     - Headers and cookies accumulated on `context.res` by upstream plugins were dropped when a downstream plugin returned `new Response(...)` or `Response.redirect(...)` (whose headers are immutable in Undici).
   - **Architectural Fix**:
     - Immediately short-circuit `handleRequest` with `bridge.toResponse()` when `bridge._resolved || bridge.headersSent` after `plugin.onRequest`.
     - Track `bridge._explicitStatusSet` and check `!bridge.headers.has("Cache-Control")` across `handler.js` and `ppr-runtime.js` (and append `bridge.cookies` in `handlePprResume`).
     - Clone and merge accumulated `bridge.headers` and `bridge.cookies` onto returned `Response` objects inside `finalizePluginResponse()`.

4. **Dev Config Caching Bug & Missing Live Hot-Reload for `dinou.config.*` and `dinou.setup.*`**:
   - **Root Cause**: `load-dinou-config.js` unconditionally returned `globalThis.__DINOU_CONFIG__` on line 25 even in development (and `handler.js` checked `globalThis.__DINOU_CONFIG__` before `isDevelopment`, while also invoking `createRequestContext` *before* `await getDinouConfig()` on the first request). Moreover, `node/dev.js` did not watch `dinou.config.*` or `dinou.setup.*`.
   - **Architectural Fix**:
     - Added `mtimeMs`-keyed dev caching (`0ms` per-request overhead when unchanged, instant Esbuild re-bundling when modified) plus `clearDinouConfigCache()` and `isWatchedDinouConfigOrSetupFile()` in `load-dinou-config.js`.
     - `handler.js` now awaits `getDinouConfig()` *before* `createRequestContext()`.
     - `node/dev.js` watches root `dinou.config.{ts,mjs,js,cjs}` and `dinou.setup.{mjs,js,ts}`, hot-reloading plugins, `setupFiles`, route types, RSC/SSR contexts, and `configureServer` middlewares/listeners cleanly without duplicating server event listeners.

5. **`configureServer` Callback-Async `(req, res, next)` Support, `next(err)` Propagation, & Per-Plugin Fault Isolation**:
   - **Root Cause**: `await mw(req, res, () => { continued = true; })` in `node/dev.js` and `node/build.js` aborted requests whenever a classic Connect/Express middleware (e.g. `cors` with an async origin callback) returned `undefined` synchronously and called `next()` asynchronously, ignored `next(err)`, and allowed a single throwing `configureServer` plugin to block all subsequent plugins.
   - **Architectural Fix**: Extracted `dinou/core/node-middleware-runner.js` (`runNodeMiddlewares` + `applyConfigureServerPlugins`), supporting sync `next()`, Promise-returning `async` middlewares, callback-async `next()`, `next(err)` `500` error propagation, Socket.IO external `server.on("request")` hijacking, and per-plugin `try/catch` fault attribution. Updated `NodeMiddleware` in `dinou/index.d.ts` to `next: (err?: any) => void`.

6. **`resolve-setup-files.js` Path Aliases, Extensionless Paths, & TypeScript Dev Execution**:
   - **Root Cause**: `resolve-setup-files.js` only checked `fs.existsSync(path.resolve(projectRoot, file))`, failing on `tsconfig.json`/`jsconfig.json` path aliases (`"@/polyfills"`), extensionless paths (`"./src/polyfills"`), and npm package subpaths. Additionally, `node/dev.js` called raw `import()` on `.ts` setup files in the parent Node process, failing on Node 20 or aliased imports.
   - **Architectural Fix**: Integrated `resolveCandidateFile` and `resolveTsconfigAlias` (plus `createRequire` package fallback) into `resolve-setup-files.js`, and pre-bundled dev setup files via Esbuild in `executeSetupFilesInDevProcess()` inside `node/dev.js`.

7. **Duplicate Triple Execution of `setupFiles` Across Dual-Bundle Passes**:
   - **Root Cause**: Passing `inject: setupFiles` simultaneously to Pass A (`rsc-engine`), Pass B (`ssr-engine`), and Pass C (`server.mjs` / `worker.js` / `bun/server.js` / `deno/main.js`) caused `setupFiles` side effects (e.g. `Sentry.init()`, OpenTelemetry registration) to run **3 times** in the same V8 isolate on startup, and **2 more times** on every HMR file save in `dinou dev`.
   - **Architectural Fix**: Kept Line-1 `inject: setupFiles` solely on Pass A (`rsc-engine`, which is always the first module imported by Pass C and SSG runners) in production builds and in `executeSetupFilesInDevProcess()` in `dinou dev`, guaranteeing deterministic single execution in exact `[...pluginSetupFiles, ...userSetupFiles]` order.

---

## 2. Complete File Manifest

1. `dinou/core/node-middleware-runner.js` *(NEW)* — Shared `runNodeMiddlewares` and per-plugin isolated `applyConfigureServerPlugins`.
2. `dinou/core/resolve-setup-files.js` *(MODIFIED)* — `tsconfig`/`jsconfig` alias, extensionless, and package subpath resolution for `plugin.setupFiles` and `config.setupFiles`.
3. `dinou/core/load-dinou-config.js` *(MODIFIED)* — `findDinouConfigFile`, `isWatchedDinouConfigOrSetupFile`, `clearDinouConfigCache`, `prepareDist1ServerEntries`, AOT config support, and `mtimeMs` dev caching.
4. `dinou/core/handler.js` *(MODIFIED)* — Normalized `context.req.path` (`rawPath`, `isRscRequest`), `isSSG` skip for `onRequest`/`onRequestContext`, `finalizePluginResponse` (`x-rsc-redirect` translation + `bridge` header/cookie merging), and explicit status/`Cache-Control` preservation.
5. `dinou/core/ppr-runtime.js` *(MODIFIED)* — Preserved `bridge.cookies`, explicit `bridge.statusCode`, and custom `Cache-Control` during PPR streaming resume.
6. `dinou/core/client.jsx` *(MODIFIED)* — Added `x-rsc-redirect` handling to `getLayoutPayload` and external `https?://` redirect support.
7. `dinou/core/client-webpack.jsx` *(MODIFIED)* — Parity with `client.jsx` for Webpack builds.
8. `dinou/index.d.ts` *(MODIFIED)* — Typed `req.rawPath`, `req.isRscRequest`, and `NodeMiddleware` `next: (err?: any) => void`.
9. `dinou/esbuild/build.js` *(MODIFIED)* — Bundled `setupFiles` and `dinou.config.*` into `.dinou/dist1/server/` via `prepareDist1ServerEntries`.
10. `dinou/rollup/rollup.config.js` *(MODIFIED)* — Up-front `.dinou/dist1` cleanup and `prepareDist1ServerEntries` integration for `serverConfig`.
11. `dinou/webpack/webpack.config.js` *(MODIFIED)* — `prepareDist1ServerEntries` integration for `serverConfig`.
12. `dinou/node/bundle-dual-engine.js` *(MODIFIED)* — AOT `dinou.config.*` prelude in `rsc-entry.mjs`, `"dinou/server"` alias, and single Pass-A `setupFiles` injection.
13. `dinou/node/build.js` *(MODIFIED)* — Bundled `dinou.config.*` in `node-entry.mjs`, shared `node-middleware-runner.js`, and removed build-machine `load-dinou-config.js` path leak.
14. `dinou/node/dev.js` *(MODIFIED)* — Esbuild-backed `executeSetupFilesInDevProcess`, shared `node-middleware-runner.js`, listener-tracked `applyServerPlugins`, and live `dinou.config.*` / `dinou.setup.*` hot-reloading.
15. `dinou/cloudflare/build.js` *(MODIFIED)* — AOT `dinou.config.*` prelude in `rsc-entry.js`, `"dinou/server"` alias, and single Pass-A `setupFiles` injection.
16. `dinou/bun/build.js` *(MODIFIED)* — AOT `dinou.config.*` prelude in `rsc-entry.js`, `"dinou/server"` alias, and single Pass-A `setupFiles` injection.
17. `dinou/deno/build.js` *(MODIFIED)* — AOT `dinou.config.*` prelude in `rsc-entry.js`, `"dinou/server"` alias, and single Pass-A `setupFiles` injection.
18. `dinou/core/get-jsx.js` *(MODIFIED)* — Guarded `createRequire(import.meta.url)` / `fileURLToPath` in `try/catch` so POSIX `file:///worker.js` bundles remain safely importable inside Windows Node.js test harnesses.
19. `dinou/core/rsc-renderer.js` *(MODIFIED)* — Guarded `createRequire(import.meta.url)` in `try/catch` for Windows Node.js Edge Worker compatibility.
20. `dinou/core/cache-slot.js` *(MODIFIED)* — Guarded `createRequire(import.meta.url)` / `fileURLToPath` in `try/catch` for Windows Node.js Edge Worker compatibility.

---

## 3. Complete Source Code & Unified Diffs

### 3.1 `dinou/core/node-middleware-runner.js` *(NEW FILE)*

```js
// dinou/core/node-middleware-runner.js
// Shared Node.js configureServer hook runner and Connect/Express-style
// (req, res, next) middleware executor for dev and production servers.

/**
 * Executes a single Node.js HTTP middleware `(req, res, next)`.
 * Supports:
 * - Synchronous `next()` middlewares
 * - Async Promise-returning middlewares (`async (req, res, next) => { ... }`)
 * - Callback-async Connect/Express middlewares (`cors`, `helmet`, `compression`, etc.)
 * - `next(err)` error propagation
 * - Direct response termination (`res.end()`, `res.writeHead()`)
 * - External `server.on("request")` hijacking (e.g. Socket.IO `/socket.io/` polling
 *   where `mw` returns synchronously without calling `next()` and Socket.IO ends `res`).
 *
 * @param {Function} mw
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<boolean>} `true` if Dinou should continue handling the request, `false` if handled/short-circuited
 */
async function runSingleNodeMiddleware(mw, req, res) {
  let nextCalled = false;
  let nextError = null;
  let resolveWait = null;

  const next = (err) => {
    if (nextCalled) return;
    nextCalled = true;
    if (err !== undefined && err !== null) {
      nextError = err instanceof Error ? err : new Error(String(err));
    }
    if (resolveWait) {
      const fn = resolveWait;
      resolveWait = null;
      fn();
    }
  };

  const ret = mw(req, res, next);

  if (ret && typeof ret.then === "function") {
    await ret;
    if (nextError) throw nextError;
    if (res.writableEnded || res.headersSent) return false;
    return nextCalled;
  }

  if (nextError) throw nextError;
  if (res.writableEnded || res.headersSent) return false;
  if (nextCalled) return true;

  // A middleware with fewer than 3 declared parameters `(req, res) => {}` cannot call `next`
  if (typeof mw === "function" && mw.length < 3) {
    return false;
  }

  await new Promise((resolve) => {
    let settled = false;
    let fallbackTimer = null;
    const done = () => {
      if (settled) return;
      settled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (typeof res.off === "function") {
        res.off("finish", done);
        res.off("close", done);
      } else if (typeof res.removeListener === "function") {
        res.removeListener("finish", done);
        res.removeListener("close", done);
      }
      resolve();
    };

    resolveWait = done;

    if (typeof res.once === "function") {
      res.once("finish", done);
      res.once("close", done);
    } else {
      // Fallback only for synthetic plain-object mocks without EventEmitter methods
      fallbackTimer = setTimeout(done, 100);
    }
  });

  if (nextError) throw nextError;
  if (res.writableEnded || res.headersSent) return false;
  return nextCalled;
}

/**
 * Runs all registered Node middlewares in sequence.
 * Returns `true` if request processing should continue to Dinou's router,
 * or `false` if a middleware terminated or hijacked the response.
 *
 * @param {Function[]} middlewares
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<boolean>}
 */
export async function runNodeMiddlewares(middlewares, req, res) {
  if (!Array.isArray(middlewares) || middlewares.length === 0) {
    return !(res.writableEnded || res.headersSent);
  }
  for (const mw of middlewares) {
    if (res.writableEnded || res.headersSent) {
      return false;
    }
    const shouldContinue = await runSingleNodeMiddleware(mw, req, res);
    if (!shouldContinue || res.writableEnded || res.headersSent) {
      return false;
    }
  }
  return true;
}

/**
 * Invokes `plugin.configureServer` for each configured plugin with per-plugin
 * error isolation so one faulty plugin never blocks subsequent plugins.
 *
 * @param {object} options
 * @param {Array} options.plugins
 * @param {import("node:http").Server} options.server
 * @param {boolean} options.isDev
 * @param {Function[]} options.middlewares
 */
export async function applyConfigureServerPlugins({
  plugins,
  server,
  isDev,
  middlewares,
}) {
  if (!Array.isArray(plugins) || plugins.length === 0) {
    return;
  }
  const serverContext = {
    server,
    isDev: Boolean(isDev),
    use(middleware) {
      if (typeof middleware === "function") {
        middlewares.push(middleware);
      }
    },
  };
  for (const plugin of plugins) {
    if (plugin && typeof plugin.configureServer === "function") {
      try {
        await plugin.configureServer(serverContext);
      } catch (err) {
        console.error(
          `[Dinou Plugin Error: "${plugin.name || "unnamed"}" (configureServer)]:`,
          err
        );
      }
    }
  }
}

export default {
  runNodeMiddlewares,
  applyConfigureServerPlugins,
};
```

### 3.2 `dinou/core/resolve-setup-files.js` *(FULL REPLACEMENT)*

```js
// dinou/core/resolve-setup-files.js
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  resolveCandidateFile,
  resolveTsconfigAlias,
} from "./tsconfig-aliases.js";

export const ROOT_SETUP_CANDIDATES = [
  "dinou.setup.mjs",
  "dinou.setup.js",
  "dinou.setup.ts",
];

/**
 * Resolves a single setup file specifier (absolute path, relative path,
 * extensionless path, tsconfig/jsconfig path alias, or npm package subpath)
 * to an existing absolute file path on disk.
 *
 * @param {string} specifier
 * @param {string} projectRoot
 * @returns {string | null}
 */
export function resolveSingleSetupFile(specifier, projectRoot) {
  if (typeof specifier !== "string") return null;
  const trimmed = specifier.trim();
  if (!trimmed) return null;

  const root = path.resolve(projectRoot || process.cwd());

  if (path.isAbsolute(trimmed)) {
    const absCandidate = resolveCandidateFile(trimmed);
    if (absCandidate) return absCandidate;
    return fs.existsSync(trimmed) ? trimmed : null;
  }

  if (trimmed.startsWith("./") || trimmed.startsWith("../")) {
    const relCandidate = resolveCandidateFile(path.resolve(root, trimmed));
    if (relCandidate) return relCandidate;
  }

  const viaAlias = resolveTsconfigAlias(trimmed, { projectRoot: root });
  if (viaAlias) {
    return viaAlias;
  }

  const fromRootCandidate = resolveCandidateFile(path.resolve(root, trimmed));
  if (fromRootCandidate) {
    return fromRootCandidate;
  }

  try {
    const req = createRequire(path.join(root, "package.json"));
    const pkgResolved = req.resolve(trimmed);
    if (pkgResolved && fs.existsSync(pkgResolved)) {
      return pkgResolved;
    }
  } catch (e) {}

  return null;
}

/**
 * Resolves setup files according to Dinou's configuration hierarchy:
 * 1. Plugin setup files (`plugin.setupFiles`) always execute first, in plugin registration order.
 * 2. User setup files:
 *    - If `config.setupFiles` is explicitly provided in `dinou.config.*`, it is the sole source of truth
 *      (e.g. `setupFiles: []` disables the root `dinou.setup.*` convention).
 *    - Otherwise, falls back to checking the project root for `dinou.setup.mjs`, `dinou.setup.js`, or `dinou.setup.ts`.
 *
 * Supports relative paths, extensionless paths, `tsconfig.json`/`jsconfig.json` path aliases (`@/*`),
 * and npm package subpaths.
 *
 * @param {string} projectRoot
 * @param {object} config - Dinou config object
 * @returns {string[]} Deduplicated array of absolute file paths to inject/execute
 */
function resolveSetupFiles(projectRoot, config = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const pluginSetupFiles = [];

  if (config && config.plugins && Array.isArray(config.plugins)) {
    for (const plugin of config.plugins) {
      if (plugin && Array.isArray(plugin.setupFiles)) {
        for (const file of plugin.setupFiles) {
          const resolved = resolveSingleSetupFile(file, root);
          if (resolved) {
            pluginSetupFiles.push(resolved);
          } else {
            console.warn(
              `⚠️ [Dinou] Plugin "${plugin.name || "unnamed"}" specified setup file not found: ${file}`
            );
          }
        }
      }
    }
  }

  const userSetupFiles = [];
  if (config && Array.isArray(config.setupFiles)) {
    for (const file of config.setupFiles) {
      const resolved = resolveSingleSetupFile(file, root);
      if (resolved) {
        userSetupFiles.push(resolved);
      } else {
        console.warn(`⚠️ [Dinou] Configured setupFile not found: ${file}`);
      }
    }
  } else {
    for (const name of ROOT_SETUP_CANDIDATES) {
      const fullPath = path.resolve(root, name);
      if (fs.existsSync(fullPath)) {
        userSetupFiles.push(fullPath);
        break;
      }
    }
  }

  return [...new Set([...pluginSetupFiles, ...userSetupFiles])];
}

export { resolveSetupFiles };
export default {
  resolveSetupFiles,
  resolveSingleSetupFile,
  ROOT_SETUP_CANDIDATES,
};
```

### 3.3 `dinou/core/load-dinou-config.js` *(FULL REPLACEMENT)*

```js
import path from "node:path";
import {
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

let require = null;
let dinouPackageRoot = null;
try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    require = createRequire(import.meta.url);
    dinouPackageRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      ".."
    );
  }
} catch (e) {}

export const DINOU_CONFIG_FILENAMES = [
  "dinou.config.ts",
  "dinou.config.mjs",
  "dinou.config.js",
  "dinou.config.cjs",
];

const ROOT_SETUP_FILENAMES = new Set([
  "dinou.setup.mjs",
  "dinou.setup.js",
  "dinou.setup.ts",
]);

let dinouConfig = { plugins: [] };
const dinouConfigPromisesByCwd = new Map();
const devConfigCacheByCwd = new Map();
let devImportCounter = 0;

function resolveCwd(customCwd) {
  return path.resolve(
    customCwd ||
      (typeof process !== "undefined" && typeof process.cwd === "function"
        ? process.cwd()
        : ".")
  );
}

function isDevEnvironment() {
  if (
    typeof globalThis !== "undefined" &&
    Boolean(globalThis.__DINOU_DEV__)
  ) {
    return true;
  }
  if (typeof process !== "undefined" && process.env) {
    if (process.env.DINOU_DEV === "true") return true;
    return process.env.NODE_ENV !== "production";
  }
  return false;
}

export function findDinouConfigFile(customCwd) {
  const cwd = resolveCwd(customCwd);
  for (const filename of DINOU_CONFIG_FILENAMES) {
    const candidate = path.resolve(cwd, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function isWatchedDinouConfigOrSetupFile(filePath, projectRoot) {
  if (!filePath) return false;
  const root = resolveCwd(projectRoot);
  const resolved = path.resolve(filePath);
  if (path.dirname(resolved).toLowerCase() !== root.toLowerCase()) {
    return false;
  }
  const base = path.basename(resolved).toLowerCase();
  return (
    DINOU_CONFIG_FILENAMES.includes(base) || ROOT_SETUP_FILENAMES.has(base)
  );
}

export function clearDinouConfigCache(customCwd) {
  if (customCwd) {
    const cwd = resolveCwd(customCwd);
    dinouConfigPromisesByCwd.delete(cwd);
    devConfigCacheByCwd.delete(cwd);
    if (
      typeof globalThis !== "undefined" &&
      !globalThis.__DINOU_AOT_CONFIG__ &&
      (!globalThis.__DINOU_CONFIG_CWD__ ||
        globalThis.__DINOU_CONFIG_CWD__ === cwd)
    ) {
      delete globalThis.__DINOU_CONFIG__;
      delete globalThis.__DINOU_CONFIG_CWD__;
    }
  } else {
    dinouConfigPromisesByCwd.clear();
    devConfigCacheByCwd.clear();
    if (
      typeof globalThis !== "undefined" &&
      !globalThis.__DINOU_AOT_CONFIG__
    ) {
      delete globalThis.__DINOU_CONFIG__;
      delete globalThis.__DINOU_CONFIG_CWD__;
    }
  }
}

function getLocalEsbuild(cwd) {
  if (
    typeof process === "undefined" ||
    !process.versions ||
    !process.versions.node ||
    (process.env && process.env.DINOU_RUNTIME === "edge")
  ) {
    return null;
  }
  const esbuildPkg = "esbuild";
  try {
    if (typeof require === "function") {
      return require(esbuildPkg);
    }
  } catch (e) {}
  try {
    const projectReq = createRequire(path.join(cwd, "package.json"));
    return projectReq(esbuildPkg);
  } catch (e) {}
  return null;
}

function resolveActiveDinouRoot(cwd) {
  const ejectedCandidate = path.resolve(cwd, "dinou");
  if (
    existsSync(ejectedCandidate) &&
    existsSync(path.join(ejectedCandidate, "core", "config.js"))
  ) {
    return ejectedCandidate;
  }
  if (
    dinouPackageRoot &&
    existsSync(path.join(dinouPackageRoot, "core", "config.js"))
  ) {
    return dinouPackageRoot;
  }
  const nmNested = path.resolve(cwd, "node_modules", "dinou", "dinou");
  if (existsSync(path.join(nmNested, "core", "config.js"))) {
    return nmNested;
  }
  const nmFlat = path.resolve(cwd, "node_modules", "dinou");
  if (existsSync(path.join(nmFlat, "core", "config.js"))) {
    return nmFlat;
  }
  return null;
}

function createEsbuildDinouConfigPlugin(cwd) {
  const activeDinouRoot = resolveActiveDinouRoot(cwd);
  return {
    name: "dinou-config-alias",
    setup(build) {
      build.onResolve({ filter: /^dinou(?:\/config)?$/ }, () => {
        if (activeDinouRoot) {
          return { path: path.join(activeDinouRoot, "core", "config.js") };
        }
        return { path: "dinou/config", external: true };
      });
      build.onResolve({ filter: /^dinou\/server$/ }, () => {
        if (activeDinouRoot) {
          return {
            path: pathToFileURL(path.join(activeDinouRoot, "server.js")).href,
            external: true,
          };
        }
        return { path: "dinou/server", external: true };
      });
    },
  };
}

export async function prepareDist1ServerEntries({
  projectRoot,
  setupFiles = [],
  handlerPath,
  netlifyPath,
}) {
  const cwd = resolveCwd(projectRoot);
  const configFile = findDinouConfigFile(cwd);
  if ((!setupFiles || setupFiles.length === 0) && !configFile) {
    return {
      handlerEntry: handlerPath,
      netlifyEntry: netlifyPath,
      bootstrapPath: null,
    };
  }

  const dist1Dir = path.resolve(cwd, ".dinou", "dist1");
  const entriesDir = path.join(dist1Dir, "_entries");
  mkdirSync(entriesDir, { recursive: true });

  const rawBootstrapPath = path.join(entriesDir, "raw-server-bootstrap.mjs");
  const compiledBootstrapPath = path.join(dist1Dir, "dinou-server-bootstrap.mjs");

  let rawCode = "// Auto-generated Dinou server bootstrap (setupFiles + dinou.config)\n";
  for (const sf of setupFiles) {
    rawCode += `import ${JSON.stringify(sf.replace(/\\/g, "/"))};\n`;
  }
  if (configFile) {
    rawCode += `import * as __dinouConfigMod from ${JSON.stringify(configFile.replace(/\\/g, "/"))};\n`;
    rawCode += `const __resolvedDinouCfg = (__dinouConfigMod && __dinouConfigMod.default) ? __dinouConfigMod.default : (__dinouConfigMod || { plugins: [] });\n`;
    rawCode += `globalThis.__DINOU_AOT_CONFIG__ = __resolvedDinouCfg;\n`;
    rawCode += `globalThis.__DINOU_CONFIG__ = __resolvedDinouCfg;\n`;
    rawCode += `globalThis.__DINOU_CONFIG_CWD__ = typeof process !== "undefined" && typeof process.cwd === "function" ? process.cwd() : "";\n`;
    rawCode += `export default __resolvedDinouCfg;\n`;
  } else {
    rawCode += `export default { plugins: [] };\n`;
  }

  writeFileSync(rawBootstrapPath, rawCode, "utf8");

  const esbuild = getLocalEsbuild(cwd);
  if (esbuild && typeof esbuild.build === "function") {
    const { esbuildTsconfigAliasesPlugin } = await import(
      "./tsconfig-aliases.js"
    );
    await esbuild.build({
      entryPoints: [rawBootstrapPath],
      outfile: compiledBootstrapPath,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node20",
      packages: "external",
      jsx: "automatic",
      loader: {
        ".js": "jsx",
        ".jsx": "jsx",
        ".ts": "ts",
        ".tsx": "tsx",
        ".json": "json",
        ".css": "empty",
      },
      plugins: [
        createEsbuildDinouConfigPlugin(cwd),
        esbuildTsconfigAliasesPlugin({
          projectRoot: cwd,
          skipAssets: false,
        }),
      ],
    });
  } else {
    writeFileSync(compiledBootstrapPath, rawCode, "utf8");
  }

  const bootstrapSlash = compiledBootstrapPath.replace(/\\/g, "/");
  const handlerSlash = handlerPath.replace(/\\/g, "/");
  const netlifySlash = netlifyPath.replace(/\\/g, "/");

  const handlerWrapperPath = path.join(entriesDir, "handler.mjs");
  const netlifyWrapperPath = path.join(entriesDir, "netlify.mjs");

  writeFileSync(
    handlerWrapperPath,
    `import * as __boot from ${JSON.stringify(bootstrapSlash)};\nglobalThis.__DINOU_BOOTSTRAPPED__ = Boolean(__boot);\nexport * from ${JSON.stringify(handlerSlash)};\nexport { default } from ${JSON.stringify(handlerSlash)};\n`,
    "utf8"
  );
  writeFileSync(
    netlifyWrapperPath,
    `import * as __boot from ${JSON.stringify(bootstrapSlash)};\nglobalThis.__DINOU_BOOTSTRAPPED__ = Boolean(__boot);\nexport * from ${JSON.stringify(netlifySlash)};\nexport { default } from ${JSON.stringify(netlifySlash)};\n`,
    "utf8"
  );

  return {
    handlerEntry: handlerWrapperPath,
    netlifyEntry: netlifyWrapperPath,
    bootstrapPath: compiledBootstrapPath,
  };
}

async function loadConfigFromDisk(cwd, isDev, configFile) {
  if (!configFile) {
    const prebuiltDist1 = path.resolve(
      cwd,
      ".dinou",
      "dist1",
      "dinou-server-bootstrap.mjs"
    );
    if (!isDev && existsSync(prebuiltDist1)) {
      try {
        const mod = await import(pathToFileURL(prebuiltDist1).href);
        const cfg = mod && mod.default ? mod.default : mod || { plugins: [] };
        dinouConfig = cfg;
        return cfg;
      } catch (e) {}
    }
    const fallback = { plugins: [] };
    dinouConfig = fallback;
    return fallback;
  }

  const filename = path.basename(configFile);
  try {
    let loaded;
    const prebuiltDist1 = path.resolve(
      cwd,
      ".dinou",
      "dist1",
      "dinou-server-bootstrap.mjs"
    );
    const esbuild = getLocalEsbuild(cwd);

    if (!isDev && !esbuild && existsSync(prebuiltDist1)) {
      loaded = await import(pathToFileURL(prebuiltDist1).href);
    } else if (esbuild && typeof esbuild.build === "function") {
      const outDir = path.resolve(cwd, ".dinou");
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }
      const bundledPath = path.resolve(outDir, "dinou.config.bundled.mjs");
      const { esbuildTsconfigAliasesPlugin } = await import(
        "./tsconfig-aliases.js"
      );
      await esbuild.build({
        entryPoints: [configFile],
        outfile: bundledPath,
        bundle: true,
        format: "esm",
        platform: "node",
        packages: "external",
        jsx: "automatic",
        sourcemap: "inline",
        plugins: [
          createEsbuildDinouConfigPlugin(cwd),
          esbuildTsconfigAliasesPlugin({
            projectRoot: cwd,
            skipAssets: false,
          }),
        ],
      });
      const cacheBuster = isDev
        ? `?t=${Date.now()}-${++devImportCounter}`
        : "";
      loaded = await import(pathToFileURL(bundledPath).href + cacheBuster);
    } else if (!isDev && existsSync(prebuiltDist1)) {
      loaded = await import(pathToFileURL(prebuiltDist1).href);
    } else if (configFile.endsWith(".mjs")) {
      const cacheBuster = isDev
        ? `?t=${Date.now()}-${++devImportCounter}`
        : "";
      loaded = await import(pathToFileURL(configFile).href + cacheBuster);
    } else {
      const nodeReq =
        typeof globalThis !== "undefined" &&
        typeof globalThis.__dinou_require__ === "function"
          ? globalThis.__dinou_require__
          : typeof require === "function"
            ? require
            : null;
      if (nodeReq && !isDev) {
        try {
          loaded = nodeReq(configFile);
        } catch (e) {
          loaded = await import(pathToFileURL(configFile).href);
        }
      } else {
        const cacheBuster = isDev
          ? `?t=${Date.now()}-${++devImportCounter}`
          : "";
        loaded = await import(pathToFileURL(configFile).href + cacheBuster);
      }
    }

    const cfg =
      loaded && loaded.default ? loaded.default : loaded || { plugins: [] };
    dinouConfig = cfg;
    if (!isDev && typeof globalThis !== "undefined") {
      globalThis.__DINOU_CONFIG__ = cfg;
      globalThis.__DINOU_CONFIG_CWD__ = cwd;
    }
    return cfg;
  } catch (err) {
    console.error(`[Dinou] Error loading ${filename}:`, err);
    const fallback = { plugins: [] };
    dinouConfig = fallback;
    return fallback;
  }
}

async function getDinouConfig(customCwd) {
  const cwd = resolveCwd(customCwd);
  const isDev = isDevEnvironment();

  if (
    typeof globalThis !== "undefined" &&
    globalThis.__DINOU_AOT_CONFIG__ &&
    (!globalThis.__DINOU_CONFIG_CWD__ ||
      globalThis.__DINOU_CONFIG_CWD__ === cwd)
  ) {
    dinouConfig = globalThis.__DINOU_AOT_CONFIG__;
    return globalThis.__DINOU_AOT_CONFIG__;
  }

  if (
    !isDev &&
    typeof globalThis !== "undefined" &&
    globalThis.__DINOU_CONFIG__ &&
    (!globalThis.__DINOU_CONFIG_CWD__ ||
      globalThis.__DINOU_CONFIG_CWD__ === cwd)
  ) {
    dinouConfig = globalThis.__DINOU_CONFIG__;
    return globalThis.__DINOU_CONFIG__;
  }

  if (!isDev && dinouConfigPromisesByCwd.has(cwd)) {
    return dinouConfigPromisesByCwd.get(cwd);
  }

  if (isDev) {
    const configFile = findDinouConfigFile(cwd);
    let mtimeMs = 0;
    if (configFile) {
      try {
        mtimeMs = statSync(configFile).mtimeMs;
      } catch (e) {}
    }
    const cachedDev = devConfigCacheByCwd.get(cwd);
    if (
      cachedDev &&
      cachedDev.filePath === configFile &&
      cachedDev.mtimeMs === mtimeMs
    ) {
      if (cachedDev.promise) return cachedDev.promise;
      dinouConfig = cachedDev.config;
      return cachedDev.config;
    }

    const devPromise = loadConfigFromDisk(cwd, true, configFile).then((cfg) => {
      devConfigCacheByCwd.set(cwd, {
        filePath: configFile,
        mtimeMs,
        config: cfg,
        promise: null,
      });
      return cfg;
    });
    devConfigCacheByCwd.set(cwd, {
      filePath: configFile,
      mtimeMs,
      config: null,
      promise: devPromise,
    });
    return devPromise;
  }

  const configFile = findDinouConfigFile(cwd);
  const loadPromise = loadConfigFromDisk(cwd, false, configFile);
  dinouConfigPromisesByCwd.set(cwd, loadPromise);
  return loadPromise;
}

if (
  typeof globalThis !== "undefined" &&
  (globalThis.__DINOU_AOT_CONFIG__ || globalThis.__DINOU_CONFIG__)
) {
  dinouConfig = globalThis.__DINOU_AOT_CONFIG__ || globalThis.__DINOU_CONFIG__;
}

export { getDinouConfig };
export default {
  getDinouConfig,
  findDinouConfigFile,
  isWatchedDinouConfigOrSetupFile,
  clearDinouConfigCache,
  prepareDist1ServerEntries,
  DINOU_CONFIG_FILENAMES,
};
```

### 3.4 `dinou/core/handler.js` *(UNIFIED DIFFS)*

```diff
@@ -80,15 +80,19 @@
 async function getDinouConfig() {
   const isSsgBuild =
     typeof globalThis !== "undefined" && Boolean(globalThis.__DINOU_IS_SSG_BUILD__);
-  if (typeof globalThis !== "undefined" && globalThis.__DINOU_CONFIG__) {
-    const cfg = globalThis.__DINOU_CONFIG__;
-    if (!isSsgBuild && cfg && cfg.storage) {
-      setStorageAdapter(cfg.storage);
+  const aotOrProdCached =
+    typeof globalThis !== "undefined"
+      ? globalThis.__DINOU_AOT_CONFIG__ ||
+        (!isDevelopment ? globalThis.__DINOU_CONFIG__ : null)
+      : null;
+  if (aotOrProdCached) {
+    if (!isSsgBuild && aotOrProdCached.storage) {
+      setStorageAdapter(aotOrProdCached.storage);
     }
-    dinouConfig = cfg;
-    return cfg;
+    dinouConfig = aotOrProdCached;
+    return aotOrProdCached;
   }
   if (!dinouConfigPromise || isDevelopment) {
     dinouConfigPromise = loadDinouConfig();
@@ -102,8 +106,11 @@
 }
 
 // Initial sync load attempt for immediate storage adapter setup
-if (typeof globalThis !== "undefined" && globalThis.__DINOU_CONFIG__) {
-  const cfg = globalThis.__DINOU_CONFIG__;
+if (
+  typeof globalThis !== "undefined" &&
+  (globalThis.__DINOU_AOT_CONFIG__ || globalThis.__DINOU_CONFIG__)
+) {
+  const cfg = globalThis.__DINOU_AOT_CONFIG__ || globalThis.__DINOU_CONFIG__;
   if (!globalThis.__DINOU_IS_SSG_BUILD__ && cfg && cfg.storage) {
     setStorageAdapter(cfg.storage);
   }
@@ -980,6 +987,7 @@
 class WebResponseBridge extends PassThrough {
   constructor(platformContext = null) {
     super();
     this.statusCode = 200;
+    this._explicitStatusSet = false;
     this.statusMessage = "";
@@ -995,6 +1003,7 @@
   status(code) {
     this.statusCode = code;
+    this._explicitStatusSet = true;
     return this;
   }
```

```diff
@@ -1201,9 +1210,24 @@
   };
 
+  const isRscSimReq = Boolean(
+    simReq.isRscRequest ||
+      String(simReq.rawPath || simReq.path || "").includes("____rsc_")
+  );
+
+  const isAllowedRedirectTarget = (candidate) =>
+    typeof candidate === "string" &&
+    ((candidate.startsWith("/") && !candidate.startsWith("//")) ||
+      /^https?:\/\//i.test(candidate));
+
   const safeResCall = (methodName, ...args) => {
     if (hasRedirected) return;
-    if (methodName === "setHeader" || methodName === "cookie" || methodName === "clearCookie" || methodName === "redirect") {
+    if (
+      methodName === "status" ||
+      methodName === "setHeader" ||
+      methodName === "cookie" ||
+      methodName === "clearCookie" ||
+      methodName === "redirect"
+    ) {
       markDynamic();
     }
     // ... uses `!isRscSimReq` / `isRscSimReq` instead of `simReq.path.includes("____rsc_")`
     // and `isAllowedRedirectTarget(resolvedUrl)` for `redirect`
@@ -1308,6 +1328,8 @@
     req: {
       cookies: cookiesProxy,
       headers: headersProxy,
       query: queryProxy,
       path: simReq.path,
+      rawPath: simReq.rawPath || simReq.path,
+      isRscRequest: isRscSimReq,
       method: simReq.method,
       env: unifiedEnv,
       ctx: platformContext.ctx || null,
     },
@@ -1332,7 +1354,11 @@
-  if (dinouConfig.plugins && Array.isArray(dinouConfig.plugins)) {
+  if (
+    !platformContext?.isSSG &&
+    dinouConfig.plugins &&
+    Array.isArray(dinouConfig.plugins)
+  ) {
```

Add `normalizeLogicalRequestPathname` and `finalizePluginResponse` immediately above `handleRequest`, and update step 4 + status/`Cache-Control` guards inside `handleRequest`:

```js
function normalizeLogicalRequestPathname(pathname, headersObj = {}) {
  if (typeof pathname !== "string" || !pathname) {
    return "/";
  }
  if (
    /^\/____rsc_(?:page|layout|payload)(?:_(?:old_static|old|static))?____(?:\/|$)/.test(
      pathname
    )
  ) {
    const stripped = pathname.replace(
      /^\/____rsc_(?:page|layout|payload)(?:_(?:old_static|old|static))?____/,
      ""
    );
    return stripped || "/";
  }
  if (/^\/____rsc_payload_error____(?:\/|$)/.test(pathname)) {
    const stripped = pathname.replace(/^\/____rsc_payload_error____/, "");
    return stripped || "/";
  }
  if (/^\/____rsc_slot____(?:\/|$)/.test(pathname)) {
    const currentPath = headersObj["x-dinou-current-path"];
    if (typeof currentPath === "string" && currentPath.startsWith("/")) {
      return currentPath.split("?")[0] || "/";
    }
  }
  return pathname;
}

function finalizePluginResponse(result, bridge, request, isRscWireRequest) {
  let hasBridgeHeaders = false;
  for (const _ of bridge.headers.keys()) {
    hasBridgeHeaders = true;
    break;
  }
  const hasBridgeCookies = bridge.cookies.length > 0;
  let finalRes = result;

  if (hasBridgeHeaders || hasBridgeCookies) {
    const mergedHeaders = new Headers(result.headers);
    for (const [k, v] of bridge.headers.entries()) {
      if (!mergedHeaders.has(k)) {
        mergedHeaders.set(k, v);
      }
    }
    for (const c of bridge.cookies) {
      mergedHeaders.append("Set-Cookie", c);
    }
    finalRes = new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers: mergedHeaders,
    });
  }

  const location = finalRes.headers.get("location");
  if (
    isRscWireRequest &&
    finalRes.status >= 300 &&
    finalRes.status < 400 &&
    location
  ) {
    const reqUrl = new URL(request.url);
    let redirectTarget = location;
    try {
      const resolved = new URL(location, reqUrl.origin);
      if (resolved.origin === reqUrl.origin) {
        redirectTarget = resolved.pathname + resolved.search + resolved.hash;
      } else {
        redirectTarget = resolved.href;
      }
    } catch (e) {}

    const rscHeaders = new Headers();
    for (const [k, v] of finalRes.headers.entries()) {
      const lower = k.toLowerCase();
      if (lower === "location" || lower === "set-cookie") continue;
      rscHeaders.set(k, v);
    }
    const setCookies =
      typeof finalRes.headers.getSetCookie === "function"
        ? finalRes.headers.getSetCookie()
        : [];
    for (const c of setCookies) {
      rscHeaders.append("Set-Cookie", c);
    }
    rscHeaders.set("x-rsc-redirect", redirectTarget);
    if (!rscHeaders.has("Cache-Control")) {
      rscHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
    }
    return new Response("", {
      status: 200,
      headers: rscHeaders,
    });
  }

  return finalRes;
}
```

Inside `handleRequest`:
```js
  const isRscWireRequest =
    pathname.includes("____rsc_") && !pathname.includes("____server_function____");
  const logicalPathname = normalizeLogicalRequestPathname(pathname, headersObj);

  const simReq = {
    path: logicalPathname,
    rawPath: pathname,
    isRscRequest: isRscWireRequest,
    url: logicalPathname + url.search,
    query: queryObj,
    headers: headersObj,
    cookies: cookiesObj,
    method: request.method,
  };

  const cfg = await getDinouConfig();
  const bridge = new WebResponseBridge(platformContext);
  const rootContext = createRequestContext(simReq, bridge, platformContext);

  // 4. Plugin onRequest Hook (Universal Middlewares & Webhooks; skipped during build-time SSG)
  if (!platformContext?.isSSG && cfg.plugins && Array.isArray(cfg.plugins)) {
    for (const plugin of cfg.plugins) {
      if (typeof plugin.onRequest === "function") {
        try {
          const result = await requestStorage.run(rootContext, () =>
            plugin.onRequest(request, rootContext)
          );
          if (bridge._resolved || bridge.headersSent) {
            return bridge.toResponse();
          }
          if (result instanceof Response) {
            return finalizePluginResponse(
              result,
              bridge,
              request,
              isRscWireRequest
            );
          }
        } catch (pluginErr) {
          console.error(`[Dinou Plugin Error: "${plugin.name || "unnamed"}"]:`, pluginErr);
          return new Response("Internal Server Error", { status: 500 });
        }
      }
    }
  }
```
And guard every default `bridge.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")` with `if (!bridge.headers.has("Cache-Control"))`, and default `bridge.status(...)` with `if (!bridge._explicitStatusSet)` (unless `404`/`500` error boundary).

### 3.5 `dinou/core/ppr-runtime.js` *(UNIFIED DIFF)*

```diff
@@ -886,15 +886,27 @@
   const headers = new Headers(bridge.headers);
+  if (Array.isArray(bridge.cookies)) {
+    for (const c of bridge.cookies) {
+      headers.append("Set-Cookie", c);
+    }
+  }
   headers.set("Content-Type", "text/html; charset=utf-8");
-  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
+  const existingCacheControl = headers.get("Cache-Control");
+  if (!existingCacheControl) {
+    headers.set("Cache-Control", "no-store, no-cache, must-revalidate, no-transform");
+  } else if (!/\bno-transform\b/i.test(existingCacheControl)) {
+    headers.set("Cache-Control", `${existingCacheControl}, no-transform`);
+  }
   if (!headers.has("Content-Encoding")) {
     headers.set("Content-Encoding", "identity");
   }
   if (!headers.has("X-Accel-Buffering")) {
     headers.set("X-Accel-Buffering", "no");
   }
 
   return new Response(readable, {
-    status: metadata?.status || 200,
+    status: bridge._explicitStatusSet
+      ? bridge.statusCode
+      : metadata?.status || 200,
     headers,
     encodeBody: "manual",
   });
```

### 3.6 `dinou/core/client.jsx` & `dinou/core/client-webpack.jsx` *(IDENTICAL DIFF IN BOTH FILES)*

```diff
@@ -359,11 +359,14 @@
         if (res.headers.has("x-rsc-redirect")) {
           const redirectUrl = res.headers.get("x-rsc-redirect");
           pageCache.delete(url);
-          if (!isPrefetch) {
-            if (window.__DINOU_ROUTER_NAVIGATE__) {
+          if (!isPrefetch && redirectUrl) {
+            if (
+              /^https?:\/\//i.test(redirectUrl) ||
+              !window.__DINOU_ROUTER_NAVIGATE__
+            ) {
+              window.location.href = redirectUrl;
+            } else {
               window.__DINOU_ROUTER_NAVIGATE__(redirectUrl, { replace: true });
-            } else {
-              window.location.href = redirectUrl;
             }
           }
           return new Promise(() => {});
@@ -452,6 +455,21 @@
       }).then(
         (res) => {
+          if (res.headers.has("x-rsc-redirect")) {
+            const redirectUrl = res.headers.get("x-rsc-redirect");
+            layoutCache.delete(cacheKey);
+            if (redirectUrl) {
+              if (
+                /^https?:\/\//i.test(redirectUrl) ||
+                !window.__DINOU_ROUTER_NAVIGATE__
+              ) {
+                window.location.href = redirectUrl;
+              } else {
+                window.__DINOU_ROUTER_NAVIGATE__(redirectUrl, { replace: true });
+              }
+            }
+            return new Promise(() => {});
+          }
           if (isStaticExportUnloading()) {
```

### 3.7 `dinou/index.d.ts` *(UNIFIED DIFF)*

```diff
@@ -94,6 +94,11 @@
   req: {
     query: Query;
     cookies: Cookies;
     headers: Headers;
+    /** Normalized logical route pathname (e.g. `"/dashboard"` even on internal `/____rsc_*` SPA fetches). */
     path: string;
+    /** Raw wire HTTP URL pathname before RSC prefix normalization (e.g. `"/____rsc_page____/dashboard"`). */
+    rawPath?: string;
+    /** Whether the current HTTP request is an internal React Server Components wire fetch (`/____rsc_*`). */
+    isRscRequest?: boolean;
     method: "GET" | "POST" | string;
     env: DinouEnv;
     ctx?: any;
@@ -131,5 +136,5 @@
 export type NodeMiddleware = (
   req: import("node:http").IncomingMessage,
   res: import("node:http").ServerResponse,
-  next: () => void
+  next: (err?: any) => void
 ) => void | Promise<void>;
```

### 3.8 `dinou/esbuild/build.js`, `dinou/rollup/rollup.config.js`, & `dinou/webpack/webpack.config.js`

- **`dinou/esbuild/build.js`**: Import `prepareDist1ServerEntries` from `../core/load-dinou-config.js` and `resolveSetupFiles` from `../core/resolve-setup-files.js`; pass `{ handler: handlerEntry, netlify: netlifyEntry }` + `jsx: "automatic"` when bundling `.dinou/dist1/server`, then clean `.dinou/dist1/_entries`.
- **`dinou/rollup/rollup.config.js`**: Clean `.dinou/dist1` synchronously at the top of the config factory (`if (!isDevelopment && shouldWriteToDisk) fs.rmSync(".dinou/dist1", ...)`), remove `".dinou/dist1/*"` from `del({ targets })`, wire `prepareDist1ServerEntries` into `serverConfig.input`, and clean `.dinou/dist1/_entries` in `closeBundle`.
- **`dinou/webpack/webpack.config.js`**: Wire `prepareDist1ServerEntries` into `serverConfig.entry` and clean `.dinou/dist1/_entries` inside `runPostBuild`.

### 3.9 `dinou/node/bundle-dual-engine.js`, `dinou/node/build.js`, `dinou/node/dev.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`, & `dinou/deno/build.js`

- **`bundle-dual-engine.js`, `cloudflare/build.js`, `bun/build.js`, `deno/build.js`**:
  - Import `findDinouConfigFile` from `../core/load-dinou-config.js`.
  - Prepend `aotConfigPrelude` to `rscEntryContent` when a `configFile` exists (`!isDev` in `bundle-dual-engine.js`, unconditionally in production `cloudflare`/`bun`/`deno` builds):
    ```js
    const aotConfigPrelude = configFile
      ? `import * as __dinouConfigMod from ${JSON.stringify(configFile.replace(/\\/g, "/"))};
    const __resolvedDinouCfg = (__dinouConfigMod && __dinouConfigMod.default) ? __dinouConfigMod.default : (__dinouConfigMod || { plugins: [] });
    globalThis.__DINOU_AOT_CONFIG__ = __resolvedDinouCfg;
    globalThis.__DINOU_CONFIG__ = __resolvedDinouCfg;
    `
      : "";
    ```
  - Add `"dinou/server": path.resolve(dinouDir, "server.js")` to `commonAlias`.
  - Inject `setupFiles` **once** on Pass A (`rsc-engine`) and remove duplicate `inject: setupFiles` from Pass B (`ssr-engine`) and Pass C.
- **`dinou/node/build.js`**:
  - Statically import `configFile` in `nodeEntryContent` (after `./rsc-engine.mjs`), use `runNodeMiddlewares` + `applyConfigureServerPlugins` from `dinou/core/node-middleware-runner.js`, add `passCConfigAliasPlugin` + `jsx: "automatic"` to Pass C, and remove dynamic `await import("${dinouDirSlash}/core/load-dinou-config.js")`.
- **`dinou/node/dev.js`**:
  - Compile and execute `setupFiles` via `executeSetupFilesInDevProcess(setupFiles)` (removing duplicate `inject: setupFiles` from `ctxA`/`ctxB`), use `runNodeMiddlewares` + listener-tracked `applyConfigureServerPlugins`, and watch root `dinou.config.{ts,mjs,js,cjs}` and `dinou.setup.{mjs,js,ts}` via `scheduleDinouConfigReload` / `triggerDinouConfigReload`.

### 3.10 `dinou/core/get-jsx.js`, `dinou/core/rsc-renderer.js`, `dinou/core/cache-slot.js` & `dinou/cloudflare/build.js` Banner Guard

```diff
--- a/dinou/core/get-jsx.js
+++ b/dinou/core/get-jsx.js
@@ -26,5 +26,9 @@
 import { getContext } from "./request-context.js";
 import { createRequire } from "node:module";
 
-const require = createRequire(import.meta.url);
-const currentDir = path.dirname(fileURLToPath(import.meta.url));
+let require = null;
+let currentDir = ".";
+try {
+  require = createRequire(import.meta.url);
+  currentDir = path.dirname(fileURLToPath(import.meta.url));
+} catch (e) {}
```

```diff
--- a/dinou/core/rsc-renderer.js
+++ b/dinou/core/rsc-renderer.js
@@ -5,5 +5,8 @@
 import { createRequire } from "node:module";
 import { ensureServerHooksPatched } from "./render-jsx-to-client-jsx.js";
 
-const require = createRequire(import.meta.url);
+let require = null;
+try {
+  require = createRequire(import.meta.url);
+} catch (e) {}
```

```diff
--- a/dinou/core/cache-slot.js
+++ b/dinou/core/cache-slot.js
@@ -32,6 +32,10 @@
 import { createRequire } from "node:module";
 import { fetchCloudflareDist2Asset } from "./static-assets.js";
 
-const require = createRequire(import.meta.url);
-const currentDir = path.dirname(fileURLToPath(import.meta.url));
+let require = null;
+let currentDir = ".";
+try {
+  require = createRequire(import.meta.url);
+  currentDir = path.dirname(fileURLToPath(import.meta.url));
+} catch (e) {}
```

```diff
--- a/dinou/cloudflare/build.js
+++ b/dinou/cloudflare/build.js
@@ -966,4 +966,7 @@
 const banner = {
   js: `import { createRequire as ___createRequire } from 'node:module';
 import { AsyncLocalStorage as ___AsyncLocalStorage } from 'node:async_hooks';
-const require = ___createRequire(import.meta.url || 'file:///worker.js');
+let require = null;
+try {
+  require = ___createRequire(import.meta.url || 'file:///worker.js');
+} catch (e) {}
```

---

## 4. `CHANGELOG.md` Entry (`9.4.0`)

```markdown
### Added
- **Ahead-of-Time (AOT) `dinou.config.*` Bundling Across All Runtimes & Serverless Targets**: `dinou.config.{ts,mjs,js,cjs}` and configured plugins are now statically compiled into production Node.js, Cloudflare Workers (`workerd`), Bun, Deno, standalone compiled binaries (`dist/server`), and `.dinou/dist1/server/` (`handler.js`, `netlify.js`) via `prepareDist1ServerEntries`, removing any runtime dependency on `esbuild` or raw `.ts` configuration files.
- **Live Hot-Reload for `dinou.config.*` & `dinou.setup.*` in `dinou dev`**: Editing root configuration or setup files now automatically reloads plugins, re-applies `configureServer` middlewares and listeners without duplicating event handlers, refreshes `setupFiles`, regenerates route types, and broadcasts a live client reload.
- **Normalized SPA-Safe `context.req.path` (`rawPath` & `isRscRequest`)**: `context.req.path` now normalizes internal `/____rsc_page____/*`, `/____rsc_layout____/*`, `/____rsc_payload____/*`, `/____rsc_payload_error____/*`, and `/____rsc_slot____/*` wire paths to their clean logical route pathname (e.g. `"/dashboard"`), exposing `context.req.rawPath` and `context.req.isRscRequest` on `RequestContextStore`.
- **Full `tsconfig.json` / `jsconfig.json` Alias & Extensionless Support in `setupFiles`**: `resolveSetupFiles` now resolves path aliases (`"@/polyfills"`), extensionless specifiers (`"./src/polyfills"`), and npm package subpaths across `plugin.setupFiles` and `config.setupFiles`.

### Changed
- **`plugin.onRequest` Build-Time SSG vs. Runtime Contract**: `plugin.onRequest` and `plugin.onRequestContext` no longer execute during build-time SSG (`platformContext.isSSG === true`), preventing auth redirects and request loggers from blocking static page generation while continuing to execute on every runtime HTTP request ahead of both dynamic routes and pre-rendered/cached SSG, ISR, and PPR routes.
- **Shared Node `configureServer` Middleware Runner (`dinou/core/node-middleware-runner.js`)**: Unified `dinou dev` and `dinou start` middleware execution with native support for synchronous, `async` Promise, and callback-async Connect/Express `(req, res, next)` middlewares (e.g. `cors`, `helmet`), `next(err)` error propagation, Socket.IO external listener hijacking, and per-plugin `configureServer` fault isolation.

### Fixed
- **Automatic `x-rsc-redirect` Translation for `onRequest` Redirects on `<Link>` Navigations**: Returning a `3xx` `Response.redirect(...)` (or calling `context.res.redirect(...)`) inside `onRequest` during client-side RSC fetches (`/____rsc_page____/*` and `/____rsc_layout____/*`) now translates cleanly into an `x-rsc-redirect` response (preserving `Set-Cookie` headers) across Esbuild, Rollup, and Webpack instead of feeding redirected HTML into React's Flight stream parser.
- **`context.res` Mutations Preserved in `onRequest` & PPR Resume**: Fixed `context.res.redirect()` not halting `onRequest`, prevented default `200` status and `Cache-Control: no-store` from overwriting explicit `context.res.status()` / `context.res.setHeader("Cache-Control", ...)` calls, preserved `bridge.cookies` in `handlePprResume`, and merged accumulated `context.res` headers and cookies onto returned `Response` instances.
- **Single-Execution Guarantee for `setupFiles`**: Removed duplicate `inject: setupFiles` across Pass B and Pass C so initialization side effects (such as `Sentry.init()` or OpenTelemetry SDK registration) execute once at Line 1 rather than three times per isolate boot or twice per HMR save.
- **Rollup `.dinou/dist1` Cleanup Ordering**: Moved production `.dinou/dist1` cleanup in `dinou/rollup/rollup.config.js` ahead of `prepareDist1ServerEntries` so Rollup's `buildStart` hook no longer deletes generated server bootstrap entries before `serverConfig` runs.
```

---

## 5. Complete Automated Test Suites

### 5.1 Unit & Multi-Bundler / Multi-Runtime Integration Test (`tests/unit/plugins.test.mjs`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

function resolveDinouRoot() {
  const candidates = [
    path.resolve(process.cwd(), "dinou"),
    path.resolve(process.cwd()),
    path.resolve(__dirname, "../../dinou"),
    path.resolve(__dirname, "../.."),
    path.resolve(process.cwd(), "node_modules/dinou/dinou"),
    path.resolve(process.cwd(), "node_modules/dinou"),
  ];
  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "core/handler.js")) &&
      fs.existsSync(path.join(candidate, "core/load-dinou-config.js"))
    ) {
      return candidate;
    }
  }
  throw new Error("Unable to locate Dinou framework root directory");
}

function resolveToolBin(relCandidates) {
  const roots = [
    process.cwd(),
    path.resolve(__dirname, "../.."),
    resolveDinouRoot(),
  ];
  for (const root of roots) {
    for (const rel of relCandidates) {
      const full = path.join(root, "node_modules", rel);
      if (fs.existsSync(full)) return full;
    }
  }
  throw new Error(`Unable to locate CLI binary from candidates: ${relCandidates.join(", ")}`);
}

const DINOU_DIR = resolveDinouRoot();
const TMP_BASE = path.join(process.cwd(), ".dinou", "tmp-unit-plugins-tests");

const { resolveSetupFiles } = await import(
  pathToFileURL(path.join(DINOU_DIR, "core/resolve-setup-files.js")).href
);
const {
  getDinouConfig,
  clearDinouConfigCache,
  findDinouConfigFile,
} = await import(
  pathToFileURL(path.join(DINOU_DIR, "core/load-dinou-config.js")).href
);
const {
  runNodeMiddlewares,
  applyConfigureServerPlugins,
} = await import(
  pathToFileURL(path.join(DINOU_DIR, "core/node-middleware-runner.js")).href
);

function createFixtureApp(name) {
  const dir = path.join(TMP_BASE, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const nmDinou = path.join(dir, "node_modules", "dinou");
  fs.mkdirSync(path.join(nmDinou, "adapters"), { recursive: true });
  fs.writeFileSync(
    path.join(nmDinou, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "9.4.0",
        type: "module",
        exports: {
          ".": "./index.js",
          "./config": "./config.js",
          "./server": "./server.js",
          "./adapters/node": "./adapters/node.js",
          "./adapters/netlify": "./adapters/netlify.js",
        },
      },
      null,
      2
    )
  );

  const dinouSlash = DINOU_DIR.replace(/\\/g, "/");
  fs.writeFileSync(
    path.join(nmDinou, "index.js"),
    `export * from "${dinouSlash}/index.js";\nexport { default } from "${dinouSlash}/index.js";\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "config.js"),
    `export * from "${dinouSlash}/core/config.js";\nexport { default } from "${dinouSlash}/core/config.js";\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "server.js"),
    `export * from "${dinouSlash}/server.js";\nexport { default } from "${dinouSlash}/server.js";\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "adapters/node.js"),
    `export * from "${dinouSlash}/adapters/node.js";\nexport { default } from "${dinouSlash}/adapters/node.js";\n`
  );
  fs.writeFileSync(
    path.join(nmDinou, "adapters/netlify.js"),
    `export * from "${dinouSlash}/adapters/netlify.js";\nexport { default } from "${dinouSlash}/adapters/netlify.js";\n`
  );

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: `dinou-plugins-fixture-${name}`,
        private: true,
        type: "module",
      },
      null,
      2
    )
  );
  return dir;
}

class MockServerResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.headersSent = false;
    this.writableEnded = false;
    this.body = "";
  }
  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = String(value);
  }
  writeHead(code, hdrs = {}) {
    this.statusCode = code;
    for (const [k, v] of Object.entries(hdrs)) {
      this.setHeader(k, v);
    }
    this.headersSent = true;
  }
  end(chunk = "") {
    this.headersSent = true;
    this.writableEnded = true;
    this.body += String(chunk);
    this.emit("finish");
  }
}

test.after(() => {
  try {
    fs.rmSync(TMP_BASE, { recursive: true, force: true });
  } catch {}
});

test("resolveSetupFiles enforces plugin-first hierarchy, deduplication, tsconfig aliases, extensionless paths, and convention opt-out", () => {
  const dir = createFixtureApp("setup-resolution");
  fs.mkdirSync(path.join(dir, "src", "init"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["./src/*"],
        },
      },
    })
  );

  const pluginA = path.join(dir, "src", "init", "otel.ts");
  const pluginShared = path.join(dir, "src", "init", "shared.ts");
  const userPolyfill = path.join(dir, "src", "polyfills.ts");
  const rootMjs = path.join(dir, "dinou.setup.mjs");
  const rootTs = path.join(dir, "dinou.setup.ts");

  fs.writeFileSync(pluginA, "globalThis.__OTEL__ = 1;\n");
  fs.writeFileSync(pluginShared, "globalThis.__SHARED__ = 1;\n");
  fs.writeFileSync(userPolyfill, "globalThis.__USER__ = 1;\n");
  fs.writeFileSync(rootMjs, "globalThis.__ROOT_MJS__ = 1;\n");
  fs.writeFileSync(rootTs, "globalThis.__ROOT_TS__ = 1;\n");

  const explicit = resolveSetupFiles(dir, {
    setupFiles: ["@/polyfills", "./src/init/shared"],
    plugins: [{ name: "otel", setupFiles: ["@/init/otel.ts", "@/init/shared"] }],
  });
  assert.deepEqual(explicit, [pluginA, pluginShared, userPolyfill]);

  const disabledConvention = resolveSetupFiles(dir, {
    setupFiles: [],
    plugins: [{ name: "otel", setupFiles: ["./src/init/otel"] }],
  });
  assert.deepEqual(disabledConvention, [pluginA]);

  const fallbackConvention = resolveSetupFiles(dir, {
    plugins: [{ name: "otel", setupFiles: ["@/init/otel"] }],
  });
  assert.deepEqual(fallbackConvention, [pluginA, rootMjs]);
});

test("getDinouConfig resolves file precedence, tsconfig aliases, and hot-reloads on mtimeMs changes in development", async () => {
  const dir = createFixtureApp("config-hot-reload");
  fs.mkdirSync(path.join(dir, "src", "_plugins"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        paths: {
          "@/*": ["./src/*"],
        },
      },
    })
  );
  fs.writeFileSync(
    path.join(dir, "src", "_plugins", "meta.ts"),
    `export const PLUGIN_NAME: string = "aliased-plugin-v1";\n`
  );

  const cfgTs = path.join(dir, "dinou.config.ts");
  const cfgMjs = path.join(dir, "dinou.config.mjs");
  fs.writeFileSync(cfgMjs, `export default { ppr: false, plugins: [{ name: "mjs" }] };\n`);
  fs.writeFileSync(
    cfgTs,
    `import { defineConfig } from "dinou";
import { PLUGIN_NAME } from "@/_plugins/meta";
export default defineConfig({
  ppr: true,
  plugins: [{ name: PLUGIN_NAME }],
});
`
  );

  assert.equal(findDinouConfigFile(dir), cfgTs);

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    clearDinouConfigCache(dir);
    const first = await getDinouConfig(dir);
    assert.equal(first.ppr, true);
    assert.equal(first.plugins[0].name, "aliased-plugin-v1");

    fs.writeFileSync(
      cfgTs,
      `import { defineConfig } from "dinou";
export default defineConfig({
  ppr: false,
  allowISG: false,
  plugins: [{ name: "reloaded-v2" }],
});
`
    );
    const bumped = new Date(Date.now() + 5000);
    fs.utimesSync(cfgTs, bumped, bumped);

    const second = await getDinouConfig(dir);
    assert.equal(second.ppr, false);
    assert.equal(second.allowISG, false);
    assert.equal(second.plugins[0].name, "reloaded-v2");
  } finally {
    process.env.NODE_ENV = prevEnv;
    clearDinouConfigCache(dir);
  }
});

test("node-middleware-runner supports sync, Promise, callback-async cors, next(err), Socket.IO hijack, and per-plugin fault isolation", async () => {
  const middlewares = [];
  const serverEmitter = new EventEmitter();

  serverEmitter.on("request", (req, res) => {
    if (req.url && req.url.startsWith("/socket.io/")) {
      res.writeHead(200, { "x-socket-io": "handled" });
      res.end('0{"sid":"xyz"}');
    }
  });

  await applyConfigureServerPlugins({
    server: serverEmitter,
    isDev: true,
    middlewares,
    plugins: [
      {
        name: "faulty-startup-plugin",
        configureServer() {
          throw new Error("simulated startup crash");
        },
      },
      {
        name: "working-node-plugin",
        configureServer({ use }) {
          use((req, _res, next) => {
            if (req.url?.startsWith("/socket.io/")) return;
            next();
          });
          use((req, res, next) => {
            setTimeout(() => {
              if (req.url === "/callback-error") {
                next(new Error("cors-origin-rejected"));
                return;
              }
              res.setHeader("x-callback-async", "ok");
              next();
            }, 12);
          });
          use(async (_req, res, next) => {
            await new Promise((r) => setTimeout(r, 4));
            res.setHeader("x-promise-async", "ok");
            next();
          });
          use((req, res, next) => {
            if (req.url === "/healthz") {
              res.writeHead(200, { "content-type": "text/plain" });
              res.end("OK");
              return;
            }
            next();
          });
        },
      },
    ],
  });

  async function sendMockRequest(url) {
    const req = { url, method: "GET", headers: {} };
    const res = new MockServerResponse();
    const runner = (async () => {
      try {
        const cont = await runNodeMiddlewares(middlewares, req, res);
        if (!cont || res.writableEnded || res.headersSent) return;
        res.statusCode = 200;
        res.end("reached-dinou-router");
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(`err:${err.message}`);
        }
      }
    })();
    serverEmitter.emit("request", req, res);
    await runner;
    return res;
  }

  const normal = await sendMockRequest("/docs");
  assert.equal(normal.statusCode, 200);
  assert.equal(normal.headers["x-callback-async"], "ok");
  assert.equal(normal.headers["x-promise-async"], "ok");
  assert.equal(normal.body, "reached-dinou-router");

  const socketPoll = await sendMockRequest("/socket.io/?EIO=4&transport=polling");
  assert.equal(socketPoll.statusCode, 200);
  assert.equal(socketPoll.headers["x-socket-io"], "handled");
  assert.equal(socketPoll.body, '0{"sid":"xyz"}');

  const callbackErr = await sendMockRequest("/callback-error");
  assert.equal(callbackErr.statusCode, 500);
  assert.match(callbackErr.body, /err:cors-origin-rejected/);

  const probe = await sendMockRequest("/healthz");
  assert.equal(probe.statusCode, 200);
  assert.equal(probe.body, "OK");
});

test("Multi-bundler (Esbuild, Rollup, Webpack) & multi-runtime (Node, Cloudflare, Bun, Deno) AOT plugin pipeline", async () => {
  const dir = createFixtureApp("aot-matrix");
  fs.mkdirSync(path.join(dir, "src", "_plugins"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "dashboard"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "login"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "teapot"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          baseUrl: ".",
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
    path.join(dir, "src", "polyfills.ts"),
    `globalThis.__SETUP_EXEC_LOG__ = globalThis.__SETUP_EXEC_LOG__ || [];
globalThis.__SETUP_EXEC_LOG__.push("user-setup");
`
  );
  fs.writeFileSync(
    path.join(dir, "src", "_plugins", "plugin-polyfill.ts"),
    `globalThis.__SETUP_EXEC_LOG__ = globalThis.__SETUP_EXEC_LOG__ || [];
globalThis.__SETUP_EXEC_LOG__.push("plugin-setup");
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "_plugins", "security-guard.ts"),
    `import type { DinouPlugin } from "dinou";

export function securityGuardPlugin(): DinouPlugin {
  return {
    name: "security-guard",
    setupFiles: ["@/_plugins/plugin-polyfill"],
    async onRequest(request, context) {
      if (context.platformContext?.isSSG) {
        globalThis.__SSG_HOOK_INVOKED__ = true;
      }

      context.res.setHeader("x-plugin-shield", "enabled");

      if (context.req.path === "/api/ping") {
        context.res.cookie("ping_seen", "yes", { path: "/", httpOnly: true });
        return Response.json({
          ok: true,
          setupLog: globalThis.__SETUP_EXEC_LOG__ || [],
        });
      }

      if (context.req.path === "/res-redirect-test") {
        context.res.redirect("/login");
        return;
      }

      if (context.req.path === "/teapot") {
        context.res.status(418);
        context.res.setHeader("Cache-Control", "private, max-age=90");
        return;
      }

      if (context.req.path.startsWith("/dashboard")) {
        if (context.req.cookies.session !== "authenticated") {
          context.res.cookie("flash", "auth-required", { path: "/" });
          return Response.redirect(new URL("/login", request.url), 302);
        }
        context.user = { id: "user_99" };
      }
    },
  };
}
`
  );

  fs.writeFileSync(
    path.join(dir, "dinou.config.ts"),
    `import { defineConfig } from "dinou";
import { securityGuardPlugin } from "@/_plugins/security-guard";

export default defineConfig({
  setupFiles: ["@/polyfills"],
  plugins: [securityGuardPlugin()],
});
`
  );

  fs.writeFileSync(
    path.join(dir, "src", "layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Plugin Matrix</title></head>
      <body>{children}</body>
    </html>
  );
}
`
  );
  fs.writeFileSync(
    path.join(dir, "src", "page.tsx"),
    `export default function HomePage() {
  return <main>Public Home</main>;
}
`
  );
  fs.writeFileSync(
    path.join(dir, "src", "login", "page.tsx"),
    `export default function LoginPage() {
  return <main>Sign In</main>;
}
`
  );
  fs.writeFileSync(
    path.join(dir, "src", "teapot", "page.tsx"),
    `export default function TeapotPage() {
  return <main>Custom Status Page</main>;
}
`
  );
  fs.writeFileSync(
    path.join(dir, "src", "dashboard", "page.tsx"),
    `import { getContext } from "dinou";
export default function DashboardPage() {
  const ctx = getContext();
  return <main data-uid={ctx.user?.id || "prerendered"}>Secret Dashboard</main>;
}
`
  );

  const rollupBin = resolveToolBin(["rollup/dist/bin/rollup"]);
  const webpackBin = resolveToolBin(["webpack-cli/bin/cli.js"]);

  for (const bundler of ["esbuild", "rollup", "webpack"]) {
    if (bundler === "esbuild") {
      execFileSync(process.execPath, [path.join(DINOU_DIR, "esbuild/build.js")], {
        cwd: dir,
        stdio: "pipe",
        env: { ...process.env, NODE_ENV: "production", DINOU_BUILD_TOOL: "esbuild" },
      });
    } else if (bundler === "rollup") {
      execFileSync(
        process.execPath,
        [rollupBin, "-c", path.join(DINOU_DIR, "rollup/rollup.config.js")],
        {
          cwd: dir,
          stdio: "pipe",
          env: { ...process.env, NODE_ENV: "production", DINOU_BUILD_TOOL: "rollup" },
        }
      );
    } else {
      execFileSync(
        process.execPath,
        [webpackBin, "--config", path.join(DINOU_DIR, "webpack/webpack.config.js")],
        {
          cwd: dir,
          stdio: "pipe",
          env: { ...process.env, NODE_ENV: "production", DINOU_BUILD_TOOL: "webpack" },
        }
      );
    }

    assert.equal(
      fs.existsSync(path.join(dir, ".dinou/dist2/dashboard/index.html")),
      true,
      `[${bundler}] SSG build must pre-render /dashboard without firing runtime auth guard`
    );
    assert.equal(
      fs.existsSync(path.join(dir, ".dinou/dist1/dinou-server-bootstrap.mjs")),
      true,
      `[${bundler}] .dinou/dist1/dinou-server-bootstrap.mjs must exist`
    );
  }

  for (const runtimeBuild of [
    "node/build.js",
    "cloudflare/build.js",
    "bun/build.js",
    "deno/build.js",
  ]) {
    execFileSync(process.execPath, [path.join(DINOU_DIR, runtimeBuild)], {
      cwd: dir,
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production", DINOU_BUILD_TOOL: "esbuild" },
    });
  }

  // Delete source config and plugin source files to prove 100% standalone AOT execution
  fs.rmSync(path.join(dir, "dinou.config.ts"), { force: true });
  fs.rmSync(path.join(dir, "src", "_plugins"), { recursive: true, force: true });

  const verifyNodeScript = path.join(dir, "verify-node-bundle.mjs");
  fs.writeFileSync(
    verifyNodeScript,
    `import assert from "node:assert/strict";
import { handleRequest } from "./.dinou/node/rsc-engine.mjs";
import { renderHtml } from "./.dinou/node/ssr-engine.mjs";

const invoke = (urlPath, init = {}, extra = {}) =>
  handleRequest(new Request("http://localhost:3000" + urlPath, init), {
    runtime: "node-bundle",
    renderHtmlStream: renderHtml,
    ...extra,
  });

const ssgPass = await invoke("/dashboard", {}, { isSSG: true });
assert.equal(ssgPass.status, 200);
assert.equal(globalThis.__SSG_HOOK_INVOKED__, undefined);

const ping = await invoke("/api/ping");
assert.equal(ping.status, 200);
assert.equal(ping.headers.get("x-plugin-shield"), "enabled");
assert.match(ping.headers.get("set-cookie") || "", /ping_seen=yes/);
assert.deepEqual(await ping.json(), {
  ok: true,
  setupLog: ["plugin-setup", "user-setup"],
});

const unauthHard = await invoke("/dashboard");
assert.equal(unauthHard.status, 302);
assert.match(unauthHard.headers.get("location") || "", /\\/login$/);
assert.match(unauthHard.headers.get("set-cookie") || "", /flash=auth-required/);

const unauthSpaPage = await invoke("/____rsc_page____/dashboard");
assert.equal(unauthSpaPage.status, 200);
assert.equal(unauthSpaPage.headers.get("x-rsc-redirect"), "/login");
assert.match(unauthSpaPage.headers.get("set-cookie") || "", /flash=auth-required/);

const unauthSpaLayout = await invoke("/____rsc_layout____/dashboard");
assert.equal(unauthSpaLayout.status, 200);
assert.equal(unauthSpaLayout.headers.get("x-rsc-redirect"), "/login");

const authOk = await invoke("/dashboard", {
  headers: { Cookie: "session=authenticated" },
});
assert.equal(authOk.status, 200);
assert.equal(authOk.headers.get("x-plugin-shield"), "enabled");
assert.match(await authOk.text(), /Secret Dashboard/);

const proxyRedirectHard = await invoke("/res-redirect-test");
assert.equal(proxyRedirectHard.status, 302);
assert.equal(proxyRedirectHard.headers.get("location"), "/login");

const proxyRedirectSpa = await invoke("/____rsc_page____/res-redirect-test");
assert.equal(proxyRedirectSpa.status, 200);
assert.equal(proxyRedirectSpa.headers.get("x-rsc-redirect"), "/login");

const teapot = await invoke("/teapot");
assert.equal(teapot.status, 418);
assert.equal(teapot.headers.get("cache-control"), "private, max-age=90");
assert.match(await teapot.text(), /Custom Status Page/);

console.log("NODE_BUNDLE_OK");
`
  );

  const nodeStdout = execFileSync(process.execPath, [verifyNodeScript], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  });
  assert.match(nodeStdout, /NODE_BUNDLE_OK/);

  const verifyCfScript = path.join(dir, "verify-cf-worker.mjs");
  fs.writeFileSync(
    verifyCfScript,
    `import assert from "node:assert/strict";
import worker from "./.dinou/cloudflare/worker.js";

const ctx = { waitUntil() {} };
const env = {};

const ping = await worker.fetch(new Request("https://edge.test/api/ping"), env, ctx);
assert.equal(ping.status, 200);
assert.equal(ping.headers.get("x-plugin-shield"), "enabled");
assert.deepEqual(await ping.json(), {
  ok: true,
  setupLog: ["plugin-setup", "user-setup"],
});

const unauthSpa = await worker.fetch(
  new Request("https://edge.test/____rsc_page____/dashboard"),
  env,
  ctx
);
assert.equal(unauthSpa.status, 200);
assert.equal(unauthSpa.headers.get("x-rsc-redirect"), "/login");

const authRes = await worker.fetch(
  new Request("https://edge.test/dashboard", {
    headers: { Cookie: "session=authenticated" },
  }),
  env,
  ctx
);
assert.equal(authRes.status, 200);
assert.match(await authRes.text(), /user_99/);

console.log("CF_WORKER_OK");
`
  );

  const cfStdout = execFileSync(process.execPath, [verifyCfScript], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  });
  assert.match(cfStdout, /CF_WORKER_OK/);
});
```

### 5.2 Playwright End-to-End Test Suite (`tests/e2e/plugins.spec.ts`)

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";

function resolveDinouCliPath(): { dinouRoot: string; cliPath: string } {
  const candidates = [
    path.resolve(process.cwd(), "dinou"),
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), "node_modules/dinou/dinou"),
    path.resolve(process.cwd(), "node_modules/dinou"),
  ];
  for (const dir of candidates) {
    const cli = path.join(dir, "cli.js");
    if (fs.existsSync(cli) && fs.existsSync(path.join(dir, "core/handler.js"))) {
      return { dinouRoot: dir, cliPath: cli };
    }
  }
  throw new Error("Could not locate Dinou cli.js");
}

async function waitForServerReady(baseUrl: string, timeoutMs = 45000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/__DINOU_STATUS_PLAYWRIGHT__`);
      if (res.ok) {
        const data = (await res.json()) as { isReady?: boolean };
        if (data.isReady) return;
      }
    } catch {
      // Server still booting
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for Dinou server at ${baseUrl}`);
}

function setupE2EFixtureProject(dinouRoot: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-e2e-plugins-"));
  const repoNodeModules = path.resolve(process.cwd(), "node_modules");
  if (fs.existsSync(repoNodeModules)) {
    fs.symlinkSync(
      repoNodeModules,
      path.join(tmpDir, "node_modules"),
      process.platform === "win32" ? "junction" : "dir"
    );
  }

  const ejectedTarget = path.join(tmpDir, "dinou");
  if (!fs.existsSync(path.join(tmpDir, "node_modules", "dinou"))) {
    fs.symlinkSync(
      dinouRoot,
      ejectedTarget,
      process.platform === "win32" ? "junction" : "dir"
    );
  }

  fs.mkdirSync(path.join(tmpDir, "src", "_plugins"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "src", "dashboard"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "src", "login"), { recursive: true });

  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "dinou-e2e-plugins", private: true, type: "module" }, null, 2)
  );

  fs.writeFileSync(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          baseUrl: ".",
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
    path.join(tmpDir, "src", "polyfills.ts"),
    `if (typeof (globalThis as any).__DINOU_POLYFILL_TAG__ === "undefined") {
  (globalThis as any).__DINOU_POLYFILL_TAG__ = "polyfill-ready";
}
`
  );

  fs.writeFileSync(
    path.join(tmpDir, "src", "_plugins", "app-plugin.ts"),
    `import type { DinouPlugin } from "dinou";

export function appPlugin(versionLabel = "v1"): DinouPlugin {
  return {
    name: "e2e-app-plugin",
    configureServer({ use }) {
      use((req, res, next) => {
        if (req.url === "/healthz") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("HEALTH_OK_" + versionLabel);
          return;
        }
        setTimeout(() => {
          res.setHeader("x-node-version", versionLabel);
          next();
        }, 5);
      });
    },
    async onRequest(request, context) {
      context.res.setHeader("x-plugin-version", versionLabel);

      if (context.req.path === "/api/webhook") {
        return Response.json({
          webhook: true,
          version: versionLabel,
          polyfill: (globalThis as any).__DINOU_POLYFILL_TAG__ || "missing",
        });
      }

      if (context.req.path.startsWith("/dashboard")) {
        if (context.req.cookies.auth_token !== "secret-ok") {
          return Response.redirect(new URL("/login?from=guard", request.url), 302);
        }
        context.user = { name: "Ada Lovelace" };
      }
    },
  };
}
`
  );

  fs.writeFileSync(
    path.join(tmpDir, "dinou.config.ts"),
    `import { defineConfig } from "dinou";
import { appPlugin } from "@/_plugins/app-plugin";

export default defineConfig({
  setupFiles: ["@/polyfills"],
  plugins: [appPlugin("v1")],
});
`
  );

  fs.writeFileSync(
    path.join(tmpDir, "src", "layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Plugins E2E</title></head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpDir, "src", "page.tsx"),
    `import { Link } from "dinou";
export default function HomePage() {
  return (
    <main>
      <h1>Home Route</h1>
      <Link href="/dashboard" id="go-dashboard">Go to Dashboard</Link>
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpDir, "src", "login", "page.tsx"),
    `export default function LoginPage() {
  return (
    <main>
      <h1 id="login-heading">Login Required</h1>
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpDir, "src", "dashboard", "page.tsx"),
    `import { getContext } from "dinou";
export const revalidate = 0;
export default function DashboardPage() {
  const { user } = getContext();
  return (
    <main>
      <h1 id="dashboard-heading">Welcome {user?.name ?? "Guest"}</h1>
    </main>
  );
}
`
  );

  return tmpDir;
}

test.describe("Dinou Plugins Architecture (Dev Hot-Reload & Prod AOT)", () => {
  test("enforces SPA-safe onRequest guards, configureServer middlewares, setupFiles, and live config hot-reload in dinou dev", async ({
    page,
    context,
  }) => {
    const { dinouRoot, cliPath } = resolveDinouCliPath();
    const fixtureDir = setupE2EFixtureProject(dinouRoot);
    const port = 44190;
    const hmrPort = 44191;
    const baseUrl = `http://localhost:${port}`;

    let devProc: ChildProcess | null = null;
    try {
      devProc = spawn(process.execPath, [cliPath, "dev"], {
        cwd: fixtureDir,
        env: {
          ...process.env,
          PORT: String(port),
          HMR_PORT: String(hmrPort),
        },
        stdio: "pipe",
      });

      await waitForServerReady(baseUrl);

      // 1. configureServer /healthz probe & webhook endpoint with setupFiles polyfill
      const healthRes = await fetch(`${baseUrl}/healthz`);
      expect(healthRes.status).toBe(200);
      expect(await healthRes.text()).toBe("HEALTH_OK_v1");

      const webhookRes = await fetch(`${baseUrl}/api/webhook`);
      expect(webhookRes.status).toBe(200);
      expect(webhookRes.headers.get("x-node-version")).toBe("v1");
      expect(webhookRes.headers.get("x-plugin-version")).toBe("v1");
      expect(await webhookRes.json()).toEqual({
        webhook: true,
        version: "v1",
        polyfill: "polyfill-ready",
      });

      // 2. Unauthenticated <Link> SPA navigation to /dashboard must redirect cleanly to /login
      await page.goto(baseUrl);
      await expect(page.locator("h1")).toHaveText("Home Route");
      await page.locator("#go-dashboard").click();
      await expect(page).toHaveURL(/\/login\?from=guard$/);
      await expect(page.locator("#login-heading")).toHaveText("Login Required");

      // 3. Authenticated navigation renders context.user enriched by onRequest
      await context.addCookies([
        {
          name: "auth_token",
          value: "secret-ok",
          domain: "localhost",
          path: "/",
        },
      ]);
      await page.goto(`${baseUrl}/dashboard`);
      await expect(page.locator("#dashboard-heading")).toHaveText(
        "Welcome Ada Lovelace"
      );

      // 4. Live hot-reload of dinou.config.ts without restarting dinou dev
      fs.writeFileSync(
        path.join(fixtureDir, "dinou.config.ts"),
        `import { defineConfig } from "dinou";
import { appPlugin } from "@/_plugins/app-plugin";

export default defineConfig({
  setupFiles: ["@/polyfills"],
  plugins: [appPlugin("v2-hot")],
});
`
      );

      await expect
        .poll(
          async () => {
            const r = await fetch(`${baseUrl}/healthz`);
            return await r.text();
          },
          { timeout: 15000 }
        )
        .toBe("HEALTH_OK_v2-hot");

      const reloadedWebhook = await fetch(`${baseUrl}/api/webhook`);
      expect(reloadedWebhook.headers.get("x-plugin-version")).toBe("v2-hot");
    } finally {
      if (devProc) devProc.kill();
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test("executes AOT-bundled plugins and SPA-safe redirects in production dinou build + dinou start", async ({
    page,
  }) => {
    const { dinouRoot, cliPath } = resolveDinouCliPath();
    const fixtureDir = setupE2EFixtureProject(dinouRoot);
    const port = 44195;
    const baseUrl = `http://localhost:${port}`;

    let prodProc: ChildProcess | null = null;
    try {
      execFileSync(process.execPath, [cliPath, "build"], {
        cwd: fixtureDir,
        stdio: "pipe",
      });

      // Remove source dinou.config.ts to verify standalone AOT production execution
      fs.rmSync(path.join(fixtureDir, "dinou.config.ts"), { force: true });

      prodProc = spawn(process.execPath, [cliPath, "start"], {
        cwd: fixtureDir,
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: String(port),
        },
        stdio: "pipe",
      });

      await waitForServerReady(baseUrl);

      const probe = await fetch(`${baseUrl}/healthz`);
      expect(await probe.text()).toBe("HEALTH_OK_v1");

      await page.goto(baseUrl);
      await page.locator("#go-dashboard").click();
      await expect(page).toHaveURL(/\/login\?from=guard$/);
      await expect(page.locator("#login-heading")).toHaveText("Login Required");
    } finally {
      if (prodProc) prodProc.kill();
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
```
