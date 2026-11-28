# Dinou Core Hardening — Series Z Phase 3 (Multi-User Concurrency Isolation, Clean-Room Packaging, Ecosystem CSS/Deps Interop, Cross-OS Compiled Binaries & HTTP/DX Polish)

This document specifies **5 optional final-mile hardening stages** (`Checks #Z11–#Z15`) designed as the natural closing phase after **Series Z Phase 1** (`z-phase1-tests.md`, Checks `#Z1–#Z5`) and **Series Z Phase 2** (`z-phase2-tests.md`, Checks `#Z6–#Z10`).

> **Why Series Z Phase 3 (Optional Final Mile)?**
> After Series X, Series Y (`#1–#90` + `OPT-1`–`OPT-8`), Series Z Phase 1 (`#Z1–#Z5`), and Series Z Phase 2 (`#Z6–#Z10`), Dinou's core security, caching, memory bounds, Server Functions, HMR/typegen, router UX, storage fault tolerance, graceful shutdown, and React Compiler pipelines are ~95%+ production-hardened.
>
> A full module-by-module audit of `dinou/` (`core/request-context.js`, `core/handler.js`, `core/postcss-pipeline.js`, `core/scan-dependency-components.js`, `core/static-assets.js`, `core/vfs.js`, `deno/seed-kv.js`, `node/port-selector.js`, and package distribution metadata) identified **five remaining real-world edge frontiers** to take Dinou from ~95% to ~99%+ confidence across real multi-tenant deployments, clean npm installs, third-party UI libraries, Windows compiled binaries, and HTTP protocol polish.

All 5 checks below are designed to be implemented and verified **incrementally (one stage at a time)**, tracking every `dinou/` fix in `z-changelog-phase3.md`.

---

## Final-Mile Coverage Matrix (What Series Z Phase 3 Closes)

| Area | Current E2E Coverage (Partial) | Remaining Real-World Gaps Closed in Series Z Phase 3 |
|---|---|---|
| **Multi-User Concurrency & `AsyncLocalStorage` Isolation** | Single-flight ISR concurrency & sequential 155-route soak (`#Z1`) | **Real parallel HTTP contention (50–100 simultaneous distinct users)** carrying unique `Cookie` / `Authorization` / `x-user-id` across Dynamic SSR, Pure PPR holes, `<DinouCacheSlot>`, Server Functions, and mid-flight `revalidateTag()`, proving **zero cross-request `requestStorage` leakage** and zero deadlocks (**`#Z11`**) |
| **Clean-Room Tarball Packaging (`dinou.tgz`)** | Real-tarball matrix via `npm run uneject -- ./dinou.tgz` inside `dinou-e2e` | **Zero-hoisting clean-room install** of `./dinou.tgz` (or fresh `npm pack`) into an isolated workspace containing *only* `react`, `react-dom`, and `dinou` — catching accidental host-repo `devDependencies` leakage, missing `"files"` entries, broken `exports` subpaths, and `bin` (`npx dinou`) execution on Windows & Linux (**`#Z12`**) |
| **PostCSS Ecosystem & Third-Party `"use client"` `node_modules`** | Basic `styles.css` & CSS Modules, local `src/` Client Components | Deep verification of `postcss-pipeline.js` (**Tailwind v4 `@reference`/`@source`/`@plugin` hoisting**, nested `@import` + `url(...)` asset rewriting + dev CSS HMR) and `scan-dependency-components.js` (**third-party ESM/CJS/scoped/wildcard `"use client"` packages** in `node_modules` & lockfile cache invalidation across npm/pnpm/yarn/bun) (**`#Z13`**) |
| **Cross-OS Compiled Binaries, VFS & Deno KV Large Payloads** | `compile-and-export-smoke.mjs` on `ubuntu-24.04` only | **Windows `.exe` compiled binary parity** (`build:node:compile`, `build:bun:compile`, `build:deno:compile`) + deep `vfs.js` case/path integrity + Server Functions & PPR inside compiled binaries + `deno/seed-kv.js` large-payload chunking (`>16 KB` and high chunk counts) (**`#Z14`**) |
| **HTTP Protocol Completeness, `<head>` Hoisting & Dev DX Edge Cases** | Basic static `200`/`206`/`416`, SSR `<head>` importmap order | **`ETag` / `If-None-Match` (`304 Not Modified`)**, `HEAD` (empty body + exact `Content-Length`), `OPTIONS`, **React 19 `<title>`/`<meta>` hoisting during SPA soft-navigation & error boundaries**, `port-selector.js` dual-port `[P, P+1]` collision fallback, and `dev` server survival on `dinou.config.ts` syntax errors (**`#Z15`**) |

---

## Master Checklist (Series Z — Phase 3)

- [ ] **Stage 1 — Check `#Z11`:** Multi-User Concurrency & `AsyncLocalStorage` Isolation Under Real Parallel HTTP Load (Zero Cross-User Session/Cookie/Header Leakage & Zero Deadlocks)
- [ ] **Stage 2 — Check `#Z12`:** Clean-Room Tarball Packaging & Distribution Audit (`./dinou.tgz` / `npm pack` Zero-Hoisting Install, `exports`, `bin` & Types Verification)
- [ ] **Stage 3 — Check `#Z13`:** PostCSS Ecosystem (`@import`, Tailwind v4 Hoisting, `url()` Rewriting) & Third-Party `"use client"` `node_modules` Interop Across Esbuild, Rollup & Webpack
- [ ] **Stage 4 — Check `#Z14`:** Cross-OS Compiled Binaries (Windows `.exe` + Linux), Embedded VFS Integrity & Deno KV Large-Payload Seeding
- [ ] **Stage 5 — Check `#Z15`:** HTTP Protocol Completeness (`ETag`/`304`, `HEAD`/`OPTIONS`), React 19 `<head>` Hoisting Parity & Dev DX Edge Cases (`port-selector`, Broken `dinou.config`)

---

## Global Verification Rules

1. **Zero Regression on Existing Suites:** Every fix introduced in `dinou/` MUST preserve 100% pass rate across all existing unit/AOT suites (`tests/unit/*.test.mjs`), Series Z Phase 1 (`#Z1–#Z5`), Series Z Phase 2 (`#Z6–#Z10`), and the full Playwright suite (`e2e/example.spec.ts`) across Esbuild, Rollup, and Webpack.
2. **Deterministic Cleanup & Isolation:** Clean-room install temp dirs, synthetic `node_modules` packages, compiled binaries, and occupied-port TCP sockets MUST be cleaned up in `finally` blocks so local runs and CI remain 100% idempotent on both Windows and Linux.
3. **Multi-Bundler & Cross-OS Rigor:** Bundler-facing checks (`#Z13`) MUST validate **Esbuild, Rollup, and Webpack** (including `-u` unvendorized where applicable); packaging & binary checks (`#Z12`, `#Z14`) MUST validate **Windows and Linux** path/executable semantics.
4. **Companion Changelog:** Track every `dinou/` fix uncovered during Series Z Phase 3 in `z-changelog-phase3.md`.

---

## Stage 1 — Check `#Z11`: Multi-User Concurrency & `AsyncLocalStorage` Isolation Under Real Parallel HTTP Load

### Why This Matters
In a production multi-tenant app, a single Node/Bun/Deno process serves dozens of overlapping requests concurrently across asynchronous I/O boundaries (`await fetch()`, database queries, streaming `<Suspense>` PPR holes, `<DinouCacheSlot>` renders, and Server Functions). If `requestStorage` (`dinou/core/request-context.js`) or any module-level cache accidentally bleeds across `AsyncLocalStorage` contexts, **User A can receive User B's cookies, auth headers, or private SSR payload** — the highest-severity bug class in SSR frameworks.

### Proposed Fixtures & Tests (`tests/unit/concurrency-isolation.test.mjs`)
- Build an isolated production Node AOT app containing:
  1. **Dynamic SSR Route (`/user-profile`)**: reads `getContext().req.cookies.session_id`, `req.headers["x-tenant"]`, and `req.query.nonce`, awaits a randomized jitter (`5–40ms`), calls `res.cookie("echo_session", sessionId)` + `res.setHeader("x-echo-tenant", tenant)`, and renders all three values in HTML.
  2. **Pure PPR Route (`/ppr-dashboard`)**: static shared shell (`ppr = true`) + two staggered dynamic `<Suspense>` holes (10ms and 35ms) that each call `getContext()` and render per-user `session_id` + `x-tenant` (proving static shell caching never leaks dynamic user context into the shared shell or neighboring users' holes).
  3. **3D `<DinouCacheSlot>` + Dynamic Sibling Route (`/slot-mix`)**: shared cached `<DinouCacheSlot id="shared-catalog" tags={["catalog"]}>` alongside a dynamic user greeting reading `getContext().req.cookies.session_id`.
  4. **Server Function (`echoSessionAction`)**: reads `getContext().req.cookies.session_id` & `req.headers["x-tenant"]`, awaits randomized jitter (`5–30ms`), sets a per-user `Set-Cookie`, and returns `{ sessionId, tenant, arg }`.
  5. **Concurrent Revalidation Endpoint/Action**: triggers `revalidateTag("catalog")` mid-storm while 60+ requests are in flight.
- Launch **64–100 truly concurrent HTTP requests** (`Promise.all`) across all 4 endpoints simultaneously, each with a cryptographically unique `session_id`, `x-tenant`, `nonce`, and `Origin` header, repeated over 3 consecutive bursts.

### What to Verify
1. **Zero Cross-User Context Leakage (100% Exact Match):** Every single response body, `Set-Cookie` header, and `x-echo-tenant` header matches ONLY its own caller's `{ sessionId, tenant, nonce }` — zero occurrences of any other user's token across hundreds of concurrent responses.
2. **Pure PPR Shared-Shell Purity:** Static shell bytes cached in `.dinou/dist2` contain ZERO private user tokens; each concurrent PPR response injects strictly its own user's dynamic hole output.
3. **Zero Deadlocks or Orphaned In-Flight Locks:** Concurrent `revalidateTag("catalog")` bursts during active SSR/slot generation never deadlock `inFlightGenerations` / `inflightSlotRenders` or return `500` / truncated streams.
4. **No `unhandledRejection` / `uncaughtException` & Clean Socket Closure:** Zero server errors or hung connections across all bursts.

### Potential Dinou Core Risk Areas
- `dinou/core/request-context.js` & `dinou/core/handler.js` — verify `requestStorage.run()` wraps every async continuation including streaming `renderToReadableStream`, PPR hole resumption (`ppr-runtime.js`), `<DinouCacheSlot>` dynamic fallback discovery (`cache-slot.js`), and `POST /____server_function____`.
- `dinou/core/ppr-runtime.js` — verify shared cached shell streams never retain per-request `requestStorage` references or mutate shared metadata objects across concurrent requests.

---

## Stage 2 — Check `#Z12`: Clean-Room Tarball Packaging & Distribution Audit (`dinou.tgz` / `npm pack`)

### Why This Matters
Running `npm run uneject -- ./dinou.tgz` inside `dinou-e2e` and executing the full GitHub Actions matrix is already a strong non-ejected validation of the tarball — it exercises `node_modules/dinou` across all runtimes, bundlers, and browsers.

However, `dinou-e2e/package.json` itself already installs extra `dependencies` and `devDependencies` (`typescript`, `wrangler`, `@playwright/test`, etc.) that get hoisted into `dinou-e2e/node_modules`. A **clean-room install test** into a brand-new temporary project directory containing *only* `react`, `react-dom`, and `dinou` (installed from `./dinou.tgz` when present, or a freshly generated `npm pack` tarball) closes the remaining real-world release risks that host-repo hoisting can hide:
- An internal Dinou module importing a package that only existed in `dinou-e2e/node_modules` instead of `dinou`'s own `dependencies` or compiled vendor bundle.
- Missing files in `dinou/package.json`'s `"files"` allowlist (e.g., `index.d.ts`, `adapters/*`, `core/server-function-codec.js`, `compiled/*`).
- Broken `"exports"` subpath entries (`"dinou"`, `"dinou/server"`, `"dinou/config"`, `"dinou/adapters/node"`, `"dinou/adapters/netlify"`, `"dinou/adapters/cloudflare"`, `"dinou/adapters/bun"`, `"dinou/adapters/deno"`).
- Broken `"bin"` CLI invocation (`npx dinou` / `node_modules/.bin/dinou` on both Windows `.cmd` and POSIX shells).

### Proposed Fixtures & Tests (`tests/unit/clean-room-package.test.mjs`)
- Resolve the tarball (`./dinou.tgz` if present in workspace root; otherwise run `npm pack` against `./dinou` into a temp directory — skip gracefully only if neither exists).
- Create an isolated temp directory **outside** the repo's `node_modules` resolution chain (in `os.tmpdir()`, so Node CANNOT walk up to `dinou-e2e/node_modules`!).
- Verify tarball contents (`tar -tzf` / `node:zlib` inspection):
  - Every file referenced by `package.json`'s `"main"`, `"types"`, `"bin"`, and `"exports"` exists inside the tarball.
  - Zero unintended junk files inside the tarball (`.git`, `.dinou`, `test-results`, local `.env*`, temporary fixtures).
- Install in the isolated temp dir (`package.json` with ONLY `dinou`, `react`, `react-dom` — using local cache / offline-friendly install when run in CI) and exercise:
  1. `npx dinou typegen` (validating `bin` shim resolution on Windows & Linux + `.dinou/types/routes.d.ts` generation).
  2. Importing every declared `"exports"` subpath from ESM (`dinou`, `dinou/server`, `dinou/config`, `dinou/adapters/*`).
  3. `npx dinou build:node:esbuild` + `npx dinou start:node:esbuild` on a minimal 2-route + Server Function + CSS Module app, probing live SSR `200 OK` and `POST /____server_function____`.
  4. Optional `-u` (`--unvendorized`) check when unvendorized peer dependencies are present.

### What to Verify
1. **Zero Hidden Hoisting Dependencies:** Dinou builds and boots in an `os.tmpdir()` workspace completely isolated from `dinou-e2e/node_modules`.
2. **100% Tarball & `exports` Integrity:** Every declared export, adapter, CLI `bin`, and `.d.ts` type entry resolves cleanly with zero `ERR_MODULE_NOT_FOUND` or `ERR_PACKAGE_PATH_NOT_EXPORTED`.
3. **Cross-OS `bin` Execution:** `npx dinou` works seamlessly on both `windows-latest` and `ubuntu-24.04`.

### Potential Dinou Core Risk Areas
- `dinou/package.json` — `"files"`, `"exports"`, `"types"`, `"bin"`, and `"dependencies"` completeness whenever new core files (like `server-function-codec.js`, `node-middleware-runner.js`, or new adapters) are added.
- `dinou/cli.js` & `dinou/core/dinou-paths.js` — verifying path resolution when running from `node_modules/dinou/` with zero `./dinou` directory present in the app root.

---

## Stage 3 — Check `#Z13`: PostCSS Ecosystem & Third-Party `"use client"` `node_modules` Interoperability

### Why This Matters
Real user applications rely heavily on:
1. **Advanced CSS & PostCSS pipelines (`dinou/core/postcss-pipeline.js`)**: Tailwind CSS v4 directives (`@import "tailwindcss";`, `@source`, `@reference`, `@plugin`, `@config`), nested `@import` chains across relative paths and `tsconfig` aliases, CSS `url(...)` references to local fonts/images inside imported stylesheets, and live CSS edits in `dev`.
2. **Third-party React UI libraries inside `node_modules` (`dinou/core/scan-dependency-components.js`)**: Scoped packages (`@acme/ui`), dual ESM/CJS packages with `"exports"` maps (including subpath & wildcard exports like `"./*": "./dist/*.js"`), and libraries that export `"use client"` components consumed by Server Components.

Direct audit of `dinou/core/scan-dependency-components.js` reveals concrete edge cases:
- **Lockfile-only cache invalidation (`scan-dependency-components.js:85–93`):** `.dinou/deps-client-cache.json` computes its cache signature **only** from `package-lock.json` (falling back to `package.json`), ignoring `pnpm-lock.yaml`, `yarn.lock`, and `bun.lock`! Updating a dependency via pnpm/yarn/bun without changing `package.json` can leave a stale client-component cache.
- **Wildcard & nested `exports` (`scan-dependency-components.js:45–54`):** `addExport()` checks `/\.[jt]sx?$/.test(exp)` and skips wildcard patterns (`"./dist/*.js"`) or `.mjs`/`.cjs` files (`/\.[cm]?[jt]sx?$/` is missing `c`/`m`!).
- **Packages without `"react"` in `name`/`keywords`/direct `package.json` fields (`scan-dependency-components.js:34–40`)** vs scoped packages (`@scope/pkg` inside `node_modules/@scope/pkg`).

### Proposed Fixtures & Tests (`tests/unit/postcss-and-third-party-deps.test.mjs` + Production Browser E2E)
- **Part A — PostCSS Pipeline (`postcss-pipeline.js`) Across Esbuild, Rollup & Webpack:**
  - Fixture `styles.css` combining:
    - Tailwind v4 `@reference` / `@source` + `@import "./tokens.css"` (verifying `createHoistCssImportsPlugin()` hoists `@import` above Tailwind header rules without invalid CSS ordering).
    - Nested `@import` (`tokens.css` → `fonts.css`) referencing a local asset via `url("./sample.svg")` and via a `tsconfig` alias `url("@/assets/bg.png")`, verifying `rewriteCssUrlAssets()` emits hashed assets into `.dinou/dist3/` and rewrites URLs accurately with zero 404s.
    - CSS Modules (`*.module.css`) combined with Tailwind/PostCSS transforms + `autoprefixer`.
  - Verify both **vendored** (default) and **`-u` unvendorized** modes produce valid compiled CSS with working asset URLs.
- **Part B — Third-Party `"use client"` Packages in `node_modules` Across Esbuild, Rollup & Webpack:**
  - Stage synthetic third-party packages inside fixture `node_modules/`:
    1. `@acme/ui-esm`: scoped ESM package with `"exports": { ".": "./dist/index.mjs", "./button": "./dist/button.mjs" }` exporting a `"use client"` interactive component (`.mjs` extension!).
    2. `legacy-cjs-widget`: CJS package (`"main": "./index.cjs"`) with `"use client"` + `module.exports` interactive component.
    3. `wildcard-ui`: package with `"exports": { "./*": "./components/*.js" }` imported as `import { Badge } from "wildcard-ui/badge"`.
  - Render all three directly from a Server Component `page.tsx`, build with **Esbuild, Rollup, and Webpack**, boot, and verify SSR HTML + full React 19 client hydration & interactivity (zero `#418`, zero `Client Component cannot be rendered on server` / missing client manifest entry).
  - Verify `deps-client-cache.json` invalidates cleanly when `pnpm-lock.yaml`, `yarn.lock`, or `bun.lock` changes.

### What to Verify
1. **PostCSS Ordering & Asset Rewriting Parity:** Nested `@import` + Tailwind v4 header hoisting + `url(...)` asset rewriting produce identical valid CSS and 200-OK hashed assets across Esbuild, Rollup, and Webpack.
2. **Third-Party `"use client"` Discovery & Hydration:** Scoped `.mjs`, `.cjs`, subpath, and wildcard-export `"use client"` dependencies in `node_modules` are discovered into `react-client-manifest.json`, bundled cleanly, and hydrate interactively across all 3 bundlers.
3. **Lockfile-Agnostic Cache Invalidation:** `scan-dependency-components.js` detects lockfile changes across `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, and `bun.lock`.

### Potential Dinou Core Risk Areas
- `dinou/core/scan-dependency-components.js:45–93` — extend file-extension regex from `/\.[jt]sx?$/` to `/\.[cm]?[jt]sx?$/` (supporting `.mjs`/`.cjs` client packages!), handle wildcard export directories safely, and include `pnpm-lock.yaml` / `yarn.lock` / `bun.lock` in the lockfile cache signature.
- `dinou/core/postcss-pipeline.js:40–150` — verify `rewriteCssUrlAssets()` preserves query/hash suffixes (`font.woff2?v=1#iefix`) and resolves nested relative paths relative to the imported CSS file rather than only `src/styles.css`.

---

## Stage 4 — Check `#Z14`: Cross-OS Compiled Binaries (Windows `.exe` + Linux), Embedded VFS Integrity & Deno KV Large-Payload Seeding

### Why This Matters
`tests/compile-and-export-smoke.mjs` currently verifies compiled executables (`build:node:compile`, `build:bun:compile`, `build:deno:compile`) **only on `ubuntu-24.04`** in `.github/workflows/playwright.yml`. Production users targeting Windows servers/desktops or large Deno Deploy apps face distinct edge cases:
1. **Windows Compiled Executables (`dist/server.exe`, `dist/deno-server.exe`)**:
   - Windows path separators (`\`), drive letters (`C:\...` vs `/...` in `dinou/core/vfs.js:23–28` `normalizeKey()`), case-insensitive lookups, and Windows file-locking during Node SEA / Bun `--compile` / Deno `compile` binary injection.
2. **Feature Depth Inside Compiled Binaries**:
   - Confirm that compiled standalone binaries (running from a temp directory completely separate from `src/`!) support **Server Functions (`POST /____server_function____`)**, **Pure PPR + `<DinouCacheSlot>` + `/____rsc_slot____`**, **nested layouts**, and **embedded static assets** strictly from the embedded VFS (`dinou/core/vfs.js`).
3. **Deno KV Large-Payload Seeding (`dinou/deno/seed-kv.js:37–60`)**:
   - `setKvCache()` splits values > `KV_CHUNK_SIZE = 16384` into chunks and commits them inside a single `kvInstance.atomic()` transaction.
   - Verify round-trip seeding & reading via `DenoKVStorage` for:
     - Pages > `16 KB` (multi-chunk atomic write),
     - Very large static pages > `256 KB` / `1 MB` (verifying whether Deno KV's per-transaction byte limit is hit and batching/guarding cleanly if exceeded!),
     - Unicode route keys and Windows path normalization (`cleanRelPath`) for `index.html`, `shell.html`, `metadata.json`, `slot.json`, and `slot.metadata.json`.

### Proposed Fixtures & Tests (`tests/unit/compiled-vfs-and-deno-kv.test.mjs` + Optional Windows CI Job)
- **Part A — VFS & Compiled Binary Deep Verification:**
  - Unit tests for `dinou/core/vfs.js`: Windows drive-letter normalization (`C:\app\src\...` vs `/src/...`), mixed separators, case sensitivity, `_ignored` directory exclusion, deterministic sorted directory listing (`sortByName`), and `isAuthoritativeVfsPath` isolation when `src/` does not exist on disk.
  - Extend or complement `compile-and-export-smoke.mjs` so compiled executables are copied to an **empty temp directory** (proving zero implicit dependency on `cwd/src/` or `cwd/.dinou/`) and verified for SSR, PPR, `<DinouCacheSlot>`, static assets, and `POST /____server_function____`, including Windows `.exe` support in CI (`windows-latest`).
- **Part B — Deno KV Seeding (`dinou/deno/seed-kv.js`):**
  - When `deno` is available (and via a mocked `Deno.openKv` unit harness so it also runs on Node without Deno installed!):
    - Seed `.dinou/dist2` containing small (`<16 KB`), medium (`64 KB`), and large (`>512 KB`) HTML/shell/slot payloads plus Unicode paths.
    - Verify `DenoKVStorage.get()` reassembles every chunked artifact byte-for-byte identically and never fails Deno KV atomic transaction size limits.

### What to Verify
1. **True Self-Contained Binaries:** Moving the compiled executable to an empty directory outside the project still serves SSR, PPR, `<DinouCacheSlot>`, static assets, and Server Functions with `200 OK` on both Linux and Windows (`.exe`).
2. **VFS Cross-OS Determinism:** `dinou/core/vfs.js` resolves routes identically regardless of OS drive letters, backslashes, or `cwd`.
3. **Deno KV Large-Page Reliability:** `seed-kv.js` seeds large static pages and chunked slots without hitting Deno KV atomic size limits and reassembles cleanly in `DenoKVStorage`.

### Potential Dinou Core Risk Areas
- `dinou/deno/seed-kv.js:39–60` — Deno KV limits single `atomic()` commits by total mutation count and byte size (~800 KB / 1000 ops); large pre-rendered HTML pages should batch chunk writes safely before committing the manifest pointer key atomically.
- `dinou/core/vfs.js:23–93` — verify `normalizeKey()` and `isAuthoritativeVfsPath()` handle Windows drive letters (`D:\...` on CI runners) and running compiled `.exe` binaries from an unrelated working directory.
- `.github/workflows/playwright.yml` — verify whether `compile-and-export-smoke` can run a `matrix.os: [ubuntu-24.04, windows-latest]` cleanly.

---

## Stage 5 — Check `#Z15`: HTTP Protocol Completeness, React 19 `<head>` Hoisting Parity & Dev DX Edge Cases

### Why This Matters
Small HTTP protocol and developer-experience details separate a "works on my machine" framework from a polished production framework:
1. **HTTP Conditional Requests & Methods (`ETag` / `If-None-Match` → `304 Not Modified`, `HEAD`, `OPTIONS`)**:
   - Direct audit shows static asset serving in `dinou/node/build.js`, `dinou/bun/build.js`, and `dinou/deno/build.js` does not yet handle `ETag` / `If-None-Match` (`304 Not Modified`) for mutable `public/` assets (non-hashed files like `/favicon.ico`, `/robots.txt`, `/styles.css`), nor verify consistent `HEAD` (identical `Content-Type` & `Content-Length`, strictly 0 body bytes) and `OPTIONS` behavior.
2. **React 19 Document Metadata (`<title>`, `<meta>`, `<link>`) Hoisting Across SPA Navigation & Error Boundaries**:
   - Verify that navigating softly from Route A (`<title>Page A</title>`, `<meta name="description" content="A" />`) → Route B (`<title>Page B</title>`, `<meta name="description" content="B" />`) → Error Boundary route → Back to Route A cleanly updates `document.title` and hoisted `<head>` tags without duplicating stale `<meta>` tags or breaking the `<script type="importmap">` ordering.
3. **Dev DX Edge Cases (`dinou/node/port-selector.js` & `dinou/node/dev.js`)**:
   - **Port Collision Handling (`port-selector.js`)**: when port `P` (or companion HMR port `P+1`) is already bound by another process, verify `findAvailablePortPair()` skips cleanly to `[P+2, P+3]` (keeping even/odd parity) and `resolveDevPorts()` fails fast with a clear non-zero exit message in non-TTY/CI environments instead of hanging on `readline`.
   - **Broken `dinou.config.ts` / `setupFiles` Survival in Dev**: editing `dinou.config.ts` to contain a syntax error while `dinou dev` is running MUST log a clear error without crashing the dev server process, and restoring valid syntax MUST hot-reload the config cleanly.

### Proposed Fixtures & Tests (`tests/unit/http-protocol-and-dx.test.mjs` + Production Browser E2E)
- **Part A — HTTP Protocol Unit & Live Server Checks (`tests/unit/http-protocol-and-dx.test.mjs`):**
  - Static asset `GET` → capture `ETag` (or `Last-Modified`) → follow-up `GET` with `If-None-Match` returns `304 Not Modified` with empty body; mismatched `If-None-Match` returns `200 OK` with full body.
  - `HEAD` on static assets and SSR pages returns `200 OK` with accurate `Content-Type` and strictly 0 response body bytes.
  - `port-selector.js`: bind a real TCP listener on `[freePort]` and `[freePort + 1]` independently and assert `isPortAvailable`, `arePortsAvailable`, `findAvailablePortPair`, and non-TTY `resolveDevPorts` behavior.
  - Live `dev:esbuild` resilience test: break `dinou.config.mjs` with syntax error → verify dev server stays alive (`exitCode === null`) → restore valid config adding a new `onRequest` header → verify new header takes effect immediately.
- **Part B — Browser React 19 `<head>` Hoisting E2E (`src/t-z-head-hoist/` + `e2e/example.spec.ts`):**
  - Cold SSR on `/t-z-head-hoist/a` → verify `<title>`, `<meta>`, and single `<script type="importmap">` order in `<head>`.
  - Soft SPA navigate to `/t-z-head-hoist/b` → verify `document.title` updates to `"Page B"` and `<meta name="description">` updates cleanly without duplicate tags.
  - Soft SPA navigate to `/t-z-head-hoist/crash` (`error.tsx`) and back via `history.back()` → verify `<title>` recovers cleanly with zero hydration/console errors.

### What to Verify
1. **Conditional Static Caching & `HEAD` Compliance:** Static assets support `ETag` / `If-None-Match` → `304 Not Modified` (with zero body bytes) and spec-compliant `HEAD` responses without breaking hashed immutable `Cache-Control` headers.
2. **Clean React 19 `<head>` Hoisting:** `<title>` and `<meta>` update accurately on SSR, SPA soft navigation, error boundaries, and Back/Forward without duplicate `<meta>` leaks or broken `<script type="importmap">`.
3. **Resilient Dev DX:** Occupied HTTP or HMR ports are detected accurately (no silent hangs in non-TTY CI), and transient syntax errors in `dinou.config.*` never crash `dinou dev`.

### Potential Dinou Core Risk Areas
- `dinou/core/static-assets.js` & `dinou/node/build.js` / `dinou/bun/build.js` / `dinou/deno/build.js` — add lightweight weak `ETag` generation (`W/"<size>-<mtimeMs>"`) + `If-None-Match` `304 Not Modified` fast-path on static file serving while preserving `OPT-1`–`OPT-8` zero-allocation hot-path discipline.
- `dinou/node/dev.js` (`triggerDinouConfigReload`) — ensure config import/parse errors catch cleanly, retain the last known-good config (or safe empty config), and recover automatically on the next valid save.

---

## Recommended Execution Order

When ready to execute Series Z Phase 3 (optional, after Series Z Phase 2, one stage at a time, maintaining `z-changelog-phase3.md` in parallel):
1. **Stage 1 (`#Z11` — Multi-User Concurrency & `AsyncLocalStorage` Isolation)** — highest production safety value; proves zero cross-user context leakage under real parallel HTTP load.
2. **Stage 2 (`#Z12` — Clean-Room Tarball Packaging Audit)** — complements `npm run uneject -- ./dinou.tgz` by guaranteeing zero accidental dependency hoisting and clean `npx dinou` installs in virgin projects.
3. **Stage 3 (`#Z13` — PostCSS Ecosystem & Third-Party `"use client"` `node_modules`)** — closes concrete `.mjs`/`.cjs`/wildcard export and pnpm/yarn/bun lockfile cache gaps found in `scan-dependency-components.js` plus Tailwind v4 / nested `@import` CSS asset rewriting.
4. **Stage 4 (`#Z14` — Cross-OS Compiled Binaries, VFS & Deno KV Large Payloads)** — extends compiled binary verification to Windows `.exe` + self-contained directory isolation + Deno KV large-page atomic batching.
5. **Stage 5 (`#Z15` — HTTP `ETag`/`304` + `HEAD`, React 19 `<head>` Hoisting & Dev DX Polish)** — final protocol and developer-experience polish.
