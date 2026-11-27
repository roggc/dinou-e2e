# Dinou Core Hardening — Series Z Phase 2 (Env Isolation, Advanced Client Router UX, Storage Fault Tolerance, Production Ops / CLI Lifecycle & React Compiler Parity)

This document specifies **5 enterprise-maturity hardening stages** (`Checks #Z6–#Z10`) planned as the natural follow-up to **Series Z Phase 1** (`z-phase1-tests.md`, Checks `#Z1–#Z5`).

> **Why Series Z Phase 2?**
> Series Y (`y-phase1` through `y-phase8`, Checks `#1–#90`) plus `OPT-1`–`OPT-8` sealed Dinou's 3D Caching Cube and hot-path performance. Series Z Phase 1 (`#Z1–#Z5`) addresses the highest-priority security, memory-bound, Server Function, live HMR/typegen, and Netlify/middleware gaps outside caching.
>
> A companion audit of Dinou `v10.0.6` (`dinou/core/env.js`, `runtime-env.js`, `client.jsx`, `client-webpack.jsx`, `link.jsx`, `storage-adapter.js`, `http-adapter.js`, `uneject.js`, `node/build.js`, `adapters/bun.js`, `adapters/deno.js`, and bundler React Compiler pipelines) identified **five additional real-world operational frontiers** — including concrete gaps in rapid-navigation cancellation, `scroll={false}` / scroll-cache bounds, remote storage timeouts, production graceful shutdown (`SIGINT`/`SIGTERM`), and cross-bundler React Compiler verification.

All 5 checks below are designed to be implemented and verified **incrementally (one stage at a time)**, tracking every `dinou/` fix in `z-changelog-phase2.md`.

---

## Enterprise Maturity Coverage Matrix (What Series Z Phase 2 Closes)

| Area | Current E2E Coverage (Partial) | Untested / Operational Gaps Closed in Series Z Phase 2 |
|---|---|---|
| **Env & Secret Isolation Across Bundlers** | Basic `DINOU_PUBLIC_*` reads & `.env` loading | Zero secret leakage in Client bundles & Pass B SSR across Esbuild, Rollup & Webpack (destructuring, bracket access, shared server/client helpers, `.dinou/types/routes.d.ts`), `.env*` precedence & dev reload, and Anti-Bot `.env` probe shield (`/%2eenv`, `/%252eenv`, `/.%65nv`, `\`) (**`#Z6`**) |
| **Advanced Client Router UX & Resilience** | Standard `<Link>`, `useRouter()`, `Back`/`Forward`, basic `#hash` | **Rapid soft-navigation race cancellation** (preventing a slow Route B `x-rsc-redirect` from hijacking fast Route C), bounded/history-accurate `scrollCache`, `{ scroll: false }` opt-out, async `<Suspense>` `#hash` scrolling, and **mid-SPA network outage (`502`/`503`/offline) recovery** (**`#Z7`**) |
| **Remote Storage Fault Tolerance & Timeouts** | Happy-path & distributed multi-pod sync across 5 adapters | **Zero-hang per-operation timeout guards** and clean live-SSR degradation when Redis, Deno KV, Cloudflare KV, or FS throw `ECONNREFUSED` / `ETIMEDOUT` / `503` during SSR, PPR resume, `<DinouCacheSlot>`, background SWR, or `revalidateTag()` without poisoning in-memory indexes (**`#Z8`**) |
| **Production Ops, Compression & CLI Lifecycle** | Server boot/serve, basic static export, unit uneject tests | **Graceful `SIGINT`/`SIGTERM` shutdown & connection draining** across Node (`node/build.js`), Bun (`bun/build.js` / `adapters/bun.js` currently hard-exit immediately), and Deno; **HTTP `gzip`/`brotli` compression + streaming SSR/PPR** non-buffering verification; full cross-OS `dinou eject` ↔ `dinou uneject` round-trip & `export-static` topology matrix (**`#Z9`**) |
| **React Compiler Cross-Bundler Parity** | Enabled by default (`reactCompiler !== false`), basic smoke | **Verified compiler memoization activity** (render-count proof) + deep interoperability with `"use client"` (`useOptimistic`, `useActionState`, `useTransition`, `useSearchParams`), `"use server"` actions, `<DinouCacheSlot>`, `"use no memo"`, and `reactCompiler: false` across Esbuild, Rollup & Webpack (**`#Z10`**) |

---

## Master Checklist (Series Z — Phase 2)

- [ ] **Stage 1 — Check `#Z6`:** Environment Variable & Secret Isolation Across All 3 Bundlers (`DINOU_PUBLIC_*`, Indirect Access, Shared Modules, `.env*` Reload & Anti-Bot Shield)
- [ ] **Stage 2 — Check `#Z7`:** Advanced Client Router UX (Rapid Navigation Race Cancellation, Bounded Scroll Restoration, `{ scroll: false }`, Async Hash Anchors & Offline/5xx Recovery)
- [ ] **Stage 3 — Check `#Z8`:** Remote Storage Outage, Timeout & Fault-Tolerance Resilience (Redis, Deno KV, Cloudflare KV & FS I/O Degradation Without Hangs or Index Poisoning)
- [ ] **Stage 4 — Check `#Z9`:** Production Operations & CLI Lifecycle (Graceful `SIGINT`/`SIGTERM` Connection Draining, HTTP `gzip`/`brotli` Streaming Parity, `eject` ↔ `uneject` Round-Trip & `export-static` Matrix)
- [ ] **Stage 5 — Check `#Z10`:** React Compiler Deep Interoperability Across Esbuild, Rollup & Webpack (Verified Memoization, React 19 Hooks, Server Actions, `<DinouCacheSlot>` & Opt-Out Semantics)

---

## Global Verification Rules

1. **Zero Regression on Existing Suites:** Every fix introduced in `dinou/` MUST preserve 100% pass rate on all existing unit/AOT suites (`tests/unit/*.test.mjs`), Series Z Phase 1 suites, and the full Playwright suite (`e2e/example.spec.ts`) across Esbuild, Rollup, and Webpack.
2. **Deterministic Cleanup & Isolation:** Temporary `.env*` files, fault-injection mock storages, spawned child servers (`SIGINT`/`SIGTERM`), and temporary `eject`/`uneject` scratch workspaces MUST be cleaned up in `finally` blocks so sequential runs and CI are 100% idempotent.
3. **Multi-Bundler & Multi-Runtime Parity:** Bundle-inspection checks (`#Z6`, `#Z10`) MUST execute across **Esbuild, Rollup, and Webpack**; operational checks (`#Z8`, `#Z9`) MUST validate **Node**, **Bun**, **Deno**, and **Edge** semantics where applicable.
4. **Companion Changelog:** Track every `dinou/` fix uncovered during Series Z Phase 2 in `z-changelog-phase2.md`.

---

## Stage 1 — Check `#Z6`: Environment Variable & Secret Isolation Across All 3 Bundlers

### Why This Matters
A single misconfigured bundler replacement or `"use client"` boundary leak can embed database passwords, JWT secrets, or third-party API keys directly into public `.dinou/dist3/*.js` browser bundles or SSR HTML payloads. While `dinou/core/env.js` implements `getEsbuildPublicEnvDefines()`, `getRollupPublicEnvReplacements()`, and `getWebpackPublicEnvDefines()`, subtle real-world patterns must be proven airtight across **all 3 bundlers** and **both SSR Pass A (RSC) and Pass B (Client SSR)**.

### Proposed Fixtures & Tests (`tests/unit/env-secret-isolation.test.mjs` + Production Browser E2E)
- **Secret-Leak Build Audit (Esbuild, Rollup, Webpack):**
  - Inject distinctive high-entropy canary env vars during build & runtime:
    - Private: `SECRET_DB_TOKEN=CANARY_PRIVATE_9F8E7D6C`, `API_PRIVATE_KEY=CANARY_SECRET_1A2B3C`
    - Public: `DINOU_PUBLIC_APP_LABEL=CANARY_PUBLIC_OK`
  - Fixture Client Component & shared helper module exercising:
    1. Direct property access (`process.env.SECRET_DB_TOKEN` vs `process.env.DINOU_PUBLIC_APP_LABEL`).
    2. Destructuring (`const { SECRET_DB_TOKEN, DINOU_PUBLIC_APP_LABEL } = process.env`).
    3. Dynamic bracket access (`const k = "SECRET_" + "DB_TOKEN"; process.env[k]`).
    4. Aliased reference (`const e = process.env; e.API_PRIVATE_KEY`).
    5. Shared utility imported by BOTH a Server Component (reads `process.env.SECRET_DB_TOKEN` safely on server) and a Client Component (only calls a pure helper).
  - Scan **every emitted file** in `.dinou/dist3/` (JS, `.map` if present, CSS, manifests) AND `.dinou/types/routes.d.ts` (verifying `collectDeclaredEnvKeys()` emits key names only, never values!) AND initial SSR HTML + `/____rsc_page____` responses — asserting **zero occurrences** of `CANARY_PRIVATE_9F8E7D6C` or `CANARY_SECRET_1A2B3C`.
- **`.env*` Precedence, Live Reload & Anti-Bot Shield:**
  - Verify strict precedence: OS env > `.env.<mode>.local` > `.env.local` (skipped in `mode === "test"`) > `.env.<mode>` > `.env`, plus `loadEnvFiles(root, { reload: true })` cleanly removing deleted keys without clobbering real OS env vars.
  - Probe `isBotEnvProbePath()` and live HTTP server against `/%2eenv`, `/%252eenv`, `/.%65nv`, `/api/.env.local`, `/backup.env`, `/sub\\.env`, `/.ENV.PRODUCTION` (all blocked `403`/`404`) while confirming legitimate routes `/docs/env` and `/docs/env-vars` return `200 OK`.

### What to Verify
1. **Zero Secret Leakage in Client Bundles:** No private env canary appears anywhere in `.dinou/dist3/` or browser-visible SSR/RSC output across Esbuild, Rollup, and Webpack, under direct, destructured, bracket, or aliased `process.env` reads.
2. **Pass B SSR Safety:** Client Components running during Pass B SSR evaluate non-public `process.env.*` to `undefined` (matching browser hydration with zero `#418` mismatch), while Server Components (Pass A) and `getContext().env` still read live server secrets and Cloudflare/Edge bindings cleanly.
3. **Typegen Safety:** `collectDeclaredEnvKeys()` (`dinou/core/env.js:393`) never leaks values or invalid identifier strings into `.dinou/types/routes.d.ts`.
4. **Anti-Bot Shield Accuracy:** Encoded and nested `.env` probes are blocked with zero false positives on legitimate `/env` documentation/app routes.

### Potential Dinou Core Risk Areas
- `dinou/core/env.js:463–514` — verify Rollup `@rollup/plugin-replace` `delimiters` and Webpack `DefinePlugin` handle destructuring (`const { SECRET } = process.env`) and aliased `process.env` identically to Esbuild without syntax errors or fallback global leaks.
- `dinou/core/runtime-env.js:68–95` (`syncEdgeEnvToProcessEnv`) — ensure Edge/Cloudflare string mirroring to `process.env` never exposes private bindings during Pass B SSR.
- `dinou/node/bundle-dual-engine.js` — confirm Pass B (`ssr-engine`) strictly receives `defineProcessEnvObject: true` while Pass A (`rsc-engine`) keeps live server `process.env`.

---

## Stage 2 — Check `#Z7`: Advanced Client Router UX (Navigation Races, Scroll Restoration, `{ scroll: false }` & Offline Recovery)

### Why This Matters
Real users click fast, double-click links, use browser `Back`/`Forward` repeatedly across long pages, jump to `#anchors` inside streaming `<Suspense>` subtrees, and experience flaky mobile/Wi-Fi networks.

Direct audit of Dinou `v10.0.6` (`dinou/core/client.jsx` & `dinou/core/client-webpack.jsx`) reveals concrete gaps:
1. **In-Flight Soft-Navigation Race Condition (`client.jsx:849–850`, `1078–1173`):**
   - `getPagePayload()` / `getLayoutPayload()` do not attach an `AbortController` or navigation sequence token. If a user clicks **slow Route B** (takes 1.5s and returns an `x-rsc-redirect: /login` header) and 100ms later clicks **fast Route C** (resolves in 50ms), when Route B's response finishes at `t = 1.5s`, `executeRscRedirect()` (`client.jsx:849–850`) still fires `window.__DINOU_ROUTER_NAVIGATE__("/login", { replace: true })` — **hijacking the user away from Route C**!
2. **Unbounded `scrollCache` & Missing `{ scroll: false }` (`client.jsx:37, 1150–1153, 1357–1371`, `link.jsx:10–67`):**
   - `scrollCache` is an unbounded `Map` keyed only by `pathname + search` (cannot distinguish two separate history entries for the same URL and grows unbounded in long sessions).
   - `<Link>` and `router.push()` / `router.replace()` currently lack a `scroll={false}` / `{ scroll: false }` option — `useLayoutEffect` at `client.jsx:1368` unconditionally calls `window.scrollTo(0, 0)` on every forward navigation (breaking tabbed filters, query-param pagination, and modal routes).
3. **Async `#hash` Scroll & Mid-SPA Network Recovery (`client.jsx:1305–1387`, `clearErroredCaches`):**
   - Verify `#hash` scrolling when the target element streams inside a `<Suspense>` boundary after >1s, and verify clean recovery (no permanently poisoned `pageCache`/`layoutCache` promises and no stuck `isPending`) when a soft navigation fails offline or hits HTTP `502`/`503` and the user retries or navigates elsewhere once connectivity returns.

### Proposed Fixtures & Tests (`src/t-z-router-ux/` + `e2e/example.spec.ts`)
- Fixture routes:
  - `/t-z-router-ux/tall-a`, `/t-z-router-ux/tall-b` (tall scrollable pages with `#anchor-bottom` inside an async `<Suspense>` boundary and query-param tabs using `<Link scroll={false}>` / `router.push(..., { scroll: false })`).
  - `/t-z-router-ux/slow-redirect` (1.2s delay before server `redirect("/t-z-router-ux/redirect-target")`) + `/t-z-router-ux/fast-target` (instant render).
  - `/t-z-router-ux/flaky` (intercepted via Playwright `page.route()` to fail with `abort('failed')` / `503` on first soft navigation, then succeed on retry).
- Playwright E2E across Chromium, Firefox & WebKit (Esbuild, Rollup & Webpack).

### What to Verify
1. **Rapid Navigation Cancellation (Last-Click-Wins):** Clicking slow Route B (including slow `x-rsc-redirect`) then immediately clicking fast Route C settles permanently on Route C — Route B's late response or redirect MUST NOT overwrite the URL or DOM (and ideally aborts cleanly via `AbortController` with zero console errors).
2. **Scroll Restoration & `{ scroll: false }`:**
   - Scrolling `tall-a` to `Y = 1200`, navigating forward to `tall-b` resets to `Y = 0`; pressing `Back` restores `Y ≈ 1200`; pressing `Forward` restores `tall-b`'s saved scroll position.
   - Navigating with `<Link href="?tab=2" scroll={false}>` or `router.push("?tab=2", { scroll: false })` preserves exact `window.scrollY` without jumping to top.
   - `scrollCache` enforces a bounded LRU size (never growing unbounded across hundreds of routes).
3. **Async `#hash` Anchors:** Navigating to `/t-z-router-ux/tall-b#anchor-bottom` scrolls cleanly to `#anchor-bottom` even when the anchor streams in via `<Suspense>`, and same-page `#anchor` clicks work without refetching RSC.
4. **Mid-SPA Network Failure & Recovery:** When `/____rsc_page____` fails due to offline/network abort or `503`, the router surfaces a clean error state (never hangs `useNavigationLoading()` forever), purges the failed cache entry, and recovers cleanly on retry or subsequent `<Link>` click without needing a full browser reload.

### Potential Dinou Core Risk Areas
- `dinou/core/client.jsx` & `dinou/core/client-webpack.jsx` — add monotonic navigation sequence ID (`activeNavSeq`) + `AbortController` tracking for soft-nav fetches so stale responses/redirects are ignored; bound `scrollCache`; plumb `options.scroll !== false` into scroll `useLayoutEffect`.
- `dinou/core/link.jsx` & `dinou/core/navigation.js` — accept `scroll = true` prop on `<Link>` and pass `{ fresh, scroll }` through `router.push`/`router.replace` (plus update TypeScript definitions in `dinou/index.d.ts`).

---

## Stage 3 — Check `#Z8`: Remote Storage Outage, Timeout & Fault-Tolerance Resilience

### Why This Matters
In distributed production architectures, Redis, Deno KV, or Cloudflare KV **will** eventually experience transient network partitions, `ECONNREFUSED`, `503 Service Unavailable`, or TCP packet blackholes (half-open sockets that hang forever). A cache outage MUST degrade gracefully to live SSR/rendering — **never** hang worker threads indefinitely, crash Node with unhandled promise rejections, or corrupt in-memory tombstones/indexes once the cache comes back online.

Direct audit of `dinou/core/storage-adapter.js` shows:
- `RedisStorage`, `CloudflareKVStorage`, and `DenoKVStorage` have **zero per-operation timeout guards** — a stalled socket on `redis.get()` or `kv.get()` blocks every incoming request until the upstream load balancer returns `504 Gateway Timeout`.
- Background fire-and-forget writes (`set`, `delete`, `markTagInvalidated`) and `revalidateTag()` failure paths under partial outages (e.g., `get` succeeds but `set` or `keys` throws) have never been systematically fault-injected.

### Proposed Fixtures & Tests (`tests/unit/storage-fault-tolerance.test.mjs`)
- Build deterministic fault-injecting wrapper clients for `RedisStorage`, `CloudflareKVStorage`, `DenoKVStorage`, and a restricted-permission `FileSystemStorage` supporting 3 fault modes:
  1. **Hard failure** (`ECONNREFUSED` / `503` rejecting every call).
  2. **Stalled / hung I/O** (promises that never resolve or delay 5,000ms vs configured storage timeout e.g. `250ms`).
  3. **Intermittent flap** (fails during request 1–5, recovers healthy at request 6).
- Drive Direct SSR (Static, Pure PPR, Asymmetric 3D PPR), `/____rsc_page____`, `/____rsc_slot____`, `<DinouCacheSlot>` refresh, background SWR, and `revalidateTag()` through all 3 fault modes.

### What to Verify
1. **Bounded Latency Under Hung Storage:** Configuring a storage operation timeout (or default safe timeout on remote adapters) causes stalled `get`/`has`/`getSlotMetadata`/`set` calls to time out cleanly within the configured budget and fall back to live SSR rather than hanging indefinitely.
2. **Graceful Degradation on Hard Failure:** When Redis/KV throws on read/write, Direct SSR and RSC endpoints still return `200 OK` live-rendered HTML/RSC with zero `unhandledRejection` / `uncaughtException` events.
3. **Clean Recovery Without Index Poisoning:** After a transient outage during `set()`, `delete()`, or `revalidateTag()`, once the remote storage recovers:
   - In-memory `_deletedKeys`, `_mutationEpoch`, and `InvertedTagIndex` are NOT left in a permanently desynchronized state.
   - Subsequent requests cache normally and `revalidateTag()` accurately invalidates newly written artifacts.
4. **SWR & Background Revalidation Isolation:** Failures inside detached background SWR (`revalidatePage` / `revalidateLayout` / slot SWR) are caught, logged without crashing the process, and release `inFlightRevalidations` / `revalidating` locks cleanly so future requests are not permanently locked out!

### Potential Dinou Core Risk Areas
- `dinou/core/storage-adapter.js` — add optional `timeoutMs` guard wrapper (`withTimeout`) for remote adapters (`RedisStorage`, `CloudflareKVStorage`, `DenoKVStorage`) and verify `_deletedKeys` / `InvertedTagIndex` are only mutated after underlying I/O succeeds (or rolled back cleanly on error).
- `dinou/core/handler.js`, `dinou/core/cache-revalidate.js`, `dinou/core/cache-slot.js` — verify every storage read/write and `finally` lock release (`inFlightGenerations`, `revalidating`, `slotRenderGenerations`) handles rejected storage promises cleanly.

---

## Stage 4 — Check `#Z9`: Production Operations (Graceful Shutdown, HTTP Compression + Streaming) & CLI Lifecycle (`eject`/`uneject`, `export-static`)

### Why This Matters
Deploying and maintaining a Dinou app in Kubernetes, Docker, Fly.io, Railway, or static CDNs depends on clean operational behavior at startup, during traffic, during rolling restarts, and across framework upgrades:
1. **Graceful Shutdown (`SIGINT` / `SIGTERM`) Gap:**
   - Direct audit shows **`dinou/node/build.js` (`startServer`) and `dinou/adapters/node.js` register ZERO `SIGINT`/`SIGTERM` handlers** — a container `SIGTERM` terminates the process immediately mid-stream.
   - **`dinou/bun/build.js:915–916` and `dinou/adapters/bun.js:82–83` call `process.exit(0)` synchronously on `SIGTERM`/`SIGINT` without calling `server.stop()`** to drain active HTTP connections!
   - **`dinou/adapters/deno.js:79`** calls `Deno.serve(...)` without wiring `Deno.addSignalListener("SIGTERM", ...)` + `server.shutdown()`.
2. **HTTP Compression (`gzip` / `brotli`) + Streaming SSR / Pure PPR Parity:**
   - When apps or reverse proxies enable `Accept-Encoding: gzip` / `br` (e.g., via `configureServer` Express `compression()` middleware or a Node proxy), buffering compressors can accidentally stall streaming `<Suspense>` fallbacks and Pure PPR dynamic hole chunks unless headers (`Cache-Control: no-transform`, `X-Accel-Buffering: no`, chunked transfer without stale `Content-Length`) are honored cleanly.
3. **CLI Lifecycle (`eject` ↔ `uneject` & `export-static` Full Matrix):**
   - Verify real end-to-end `dinou eject` → modify file → `dinou uneject` round-trips (`dinou/core/uneject.js`) across npm/pnpm/yarn/bun lockfile detection, custom script preservation, failed-install rollback, and Windows locked-file fallback (`WIN_LOCK_ERROR_CODES`).
   - Verify `dinou export-static` across complex route topologies (dynamic `[id]`, catch-all `[...slug]`, Unicode params, nested layouts, `<DinouCacheSlot>`, `not_found.tsx`, assets, and zero runtime server dependency).

### Proposed Fixtures & Tests
- **Part A — Graceful Shutdown Integration (`tests/unit/graceful-shutdown.test.mjs`):**
  - Spawn a compiled production Node server (and Bun/Deno when available in PATH).
  - Open an in-flight slow streaming SSR/PPR request (e.g., 600ms dynamic hole) + a Server Function write.
  - Send `SIGTERM` (or `SIGINT` on Windows via IPC/signal harness) 150ms into the request.
  - Assert: (1) the in-flight request completes with full `200 OK` body (zero truncated stream / `ECONNRESET`), (2) new connections arriving after `SIGTERM` are rejected/closed, and (3) the process exits cleanly with code `0` within bounded shutdown timeout (force-closing idle keep-alive sockets so it never hangs for 30s!).
- **Part B — Compression + Streaming Integration (`tests/unit/compression-streaming.test.mjs`):**
  - Serve a streaming `<Suspense>` route and a Pure PPR route behind both a Node `zlib` (`gzip`/`br`) proxy and a `configureServer` compression middleware (`Accept-Encoding: gzip, br`).
  - Measure Time-To-First-Chunk (TTFC) vs Time-To-Last-Chunk (TTLC) to prove the initial static/PPR shell flushes immediately **before** the 500ms dynamic hole resolves, decompresses with 100% integrity, preserves `Vary: Accept-Encoding`, and never sends a mismatched `Content-Length`.
- **Part C — CLI `eject`/`uneject` & `export-static` Contract (`tests/unit/cli-lifecycle.test.mjs`):**
  - Isolated temp workspace testing full `runEject()` → verify `package.json` & `./dinou` → `uneject({ yes: true, skipInstall: true })` → verify exact restoration + rollback test on simulated install failure + lockfile PM detection (`npm`, `pnpm`, `yarn`, `bun`).
  - Run `export-static` verification asserting every pre-rendered HTML/RSC artifact, Unicode route, `404.html`, and hashed asset resolves cleanly from a pure static file server.

### What to Verify
1. **Zero-Drop Rolling Restarts:** `SIGTERM`/`SIGINT` stops accepting new connections, drains active SSR/PPR/Server Function requests to completion, closes idle keep-alive sockets (`server.closeIdleConnections?.()`), and exits with status `0` within a bounded grace period.
2. **True Streaming Under Compression:** `gzip`/`br` responses flush the initial PPR/Suspense shell promptly without buffering the entire stream until the slowest dynamic hole finishes, with valid decompression and accurate `Vary` headers.
3. **Clean `eject` ↔ `uneject` & `export-static`:** Round-trip preserves user scripts and dependencies, rolls back cleanly on error, handles Windows lock codes without crashing, and `export-static` produces self-contained static output.

### Potential Dinou Core Risk Areas
- `dinou/node/build.js:190–250` & `dinou/adapters/node.js` — add coordinated `SIGTERM`/`SIGINT` graceful shutdown with `server.close()`, `server.closeIdleConnections?.()`, and bounded force-exit timeout (`DINOU_SHUTDOWN_TIMEOUT_MS`, e.g., 10s).
- `dinou/bun/build.js:915–916` & `dinou/adapters/bun.js:82–83` — replace immediate `process.exit(0)` with `await server.stop()` graceful drain before exit.
- `dinou/adapters/deno.js:78–80` — capture `const server = Deno.serve(...)` and wire `server.shutdown()` on `SIGTERM`/`SIGINT` (guarded for platforms supporting each signal).
- `dinou/core/http-adapter.js` — ensure streaming responses preserve flush semantics and never conflict with compression middleware (`res.flush?.()` / header hygiene).

---

## Stage 5 — Check `#Z10`: React Compiler Deep Interoperability Across Esbuild, Rollup & Webpack

### Why This Matters
Dinou enables **React Compiler (`babel-plugin-react-compiler`) by default** (`dinouConfig?.reactCompiler !== false`) across Esbuild (`dinou/esbuild/build.js:56,114`), Rollup (`dinou/rollup/rollup.config.js:85,237`), and Webpack (`dinou/webpack/webpack.config.js:102,274`).

However, subtle bundler pipeline ordering bugs (Babel vs SWC vs Esbuild JSX transform, `"use server"` transform ordering, `"use client"` directive preservation, or `react/compiler-runtime` import resolution) can either **silently disable** React Compiler memoization without failing builds, or **break** stateful React 19 primitives (`useOptimistic`, `useActionState`, `<DinouCacheSlot>` children updates, `useSearchParams()`).

### Proposed Fixtures & Tests (`src/t-z-react-compiler/` + `tests/unit/react-compiler-parity.test.mjs` + Playwright E2E)
- Dedicated fixture route `/t-z-react-compiler` containing:
  1. **Memoization Proof Component (`"use client"`):** Parent with unrelated state counter (`parentCount`) rendering a child (`<CompilerMemoChild staticProp="fixed" />`) that tracks its own render count in a ref/DOM counter — **without** manual `React.memo()` or `useMemo()`. When `parentCount` increments, `<CompilerMemoChild>` MUST stay at `renders === 1` (proving React Compiler actually transformed & memoized it!).
  2. **`"use no memo"` Opt-Out Component:** Identical child annotated with `"use no memo"` MUST re-render (`renders === 2, 3, ...`) when `parentCount` increments.
  3. **React 19 Primitives Under Compiler:** `useOptimistic` + `useActionState` + `useTransition` invoking a `"use server"` action, plus `useSearchParams()` reading live query updates and `<DinouCacheSlot>` refreshed via `refreshSlot()`.
- Build & inspect emitted client bundles across **Esbuild, Rollup, and Webpack** for `react/compiler-runtime` (`_c` / `c(` memo cache slot calls) both with default `reactCompiler: true` and with `reactCompiler: false` toggle.

### What to Verify
1. **Compiler Is Actively Running (Not Silently No-Op'd):** Across Esbuild, Rollup, and Webpack, default builds emit React Compiler memoization (`react/compiler-runtime`) and `<CompilerMemoChild>` stays at `renders === 1` on unrelated parent re-renders.
2. **Directive & Config Opt-Out Parity:** `"use no memo"` skips memoization per component; `reactCompiler: false` in `dinou.config.mjs` cleanly disables compiler transforms across all 3 bundlers.
3. **Zero Regressions With React 19 & Dinou Primitives:** `useOptimistic`, `useActionState`, `"use server"` bindings, `useSearchParams()`, and `<DinouCacheSlot>` + `refreshSlot()` hydrate with zero `#418` mismatches and update reactively under compiler memoization (no stale closure traps).

### Potential Dinou Core Risk Areas
- `dinou/esbuild/build.js`, `dinou/rollup/rollup.config.js`, `dinou/webpack/webpack.config.js` — verify transform order (`"use client"` / `"use server"` detection vs React Compiler Babel pass vs SWC/Esbuild JSX lowering) so compiler transforms never strip directives or break Server Function proxy rewriting.
- `dinou/core/slot.js` & `dinou/core/navigation.js` — confirm context values and hook outputs work cleanly with React Compiler's referential-equality memoization assumptions.

---

## Recommended Execution Order

When ready to execute Series Z Phase 2 (after Series Z Phase 1, one stage at a time, maintaining `z-changelog-phase2.md` in parallel):
1. **Stage 1 (`#Z6` — Env & Secret Isolation Across 3 Bundlers)** — directly complements `#Z2` security hardening with zero-leak guarantees across all client bundles and Pass B SSR.
2. **Stage 2 (`#Z7` — Advanced Client Router UX & Resilience)** — fixes the real slow-redirect navigation race, adds `{ scroll: false }`, bounds `scrollCache`, and proves offline/5xx recovery.
3. **Stage 3 (`#Z8` — Remote Storage Fault Tolerance & Timeouts)** — hardens production Redis / Deno KV / Cloudflare KV deployments against hangs and partial outages.
4. **Stage 4 (`#Z9` — Graceful Shutdown, Compression + Streaming & CLI Lifecycle)** — closes zero-downtime rolling-deploy gaps across Node, Bun, and Deno plus streaming compression and CLI lifecycle parity.
5. **Stage 5 (`#Z10` — React Compiler Deep Interoperability)** — verifies that Dinou's default-on React Compiler truly optimizes client components without breaking React 19 or Dinou primitives across Esbuild, Rollup, and Webpack.
