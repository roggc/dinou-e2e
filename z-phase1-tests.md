# Dinou Core Hardening — Series Z Phase 1 (Memory Bounds, HTTP Security, React 19 Server Functions, Live HMR / Typegen & Deployment Adapters)

This document specifies **5 high-impact production hardening stages** (`Checks #Z1–#Z5`) covering **Dinou outside the 3D Caching Cube** — closing the highest-value real-world reliability, security, developer-experience, and deployment-parity risks across the framework.

> **Why Series Z (Outside the 3D Caching Cube)?**
> Phases 1–7 of Series Y (`y-phase1` through `y-phase7`) exhaustively hardened Dinou's 3D Caching Cube (Hierarchical Segmentation, `<DinouCacheSlot>`, and Per-Segment PPR). However, a full architectural audit of the installed Dinou `v10.0.5` core (`dinou/core/`, `dinou/adapters/`, `dinou/esbuild/`, `dinou/rollup/`, `dinou/webpack/`) revealed **five concrete, high-impact production frontiers outside caching** — including **confirmed security and memory-leak bug candidates** directly visible in `handler.js`, `cache-slot.js`, `slot.js`, `server-function-proxy.js`, `client-redirect.jsx`, and `adapters/netlify.js`.

All 5 checks below are designed to be implemented and verified **incrementally (one stage at a time)**, tracking every `dinou/` fix in `z-changelog-phase1.md`.

---

## Production Hardening Coverage Matrix (What Series Z Phase 1 Closes)

| Area | Current E2E Coverage (Partial) | Untested / High-Risk Gaps Closed in Series Z Phase 1 |
|---|---|---|
| **Server & Client Memory Bounds (Soak & LRU)** | Short-lived single-route tests | Unbounded server `Map`s (`slotRegistry`, `recentFreshSlotRenders`, `slotRenderGenerations`, `isDynamicMap`, `pageFunctionsConfigCache`) and client `Map`s (`pageCache`, `layoutCache`, `knownClientSlots`, `slotOverrideCache`) under **thousands of unique `/items/[id]` routes** (**`#Z1`**) |
| **HTTP Security & Hardening** | Happy-path headers, basic redirects, static serving | **Confirmed `origin.includes(host)` CSRF bypass** & spoofable `X-Forwarded-Host`, **production Server Function `err.message` leakage**, Open Redirect bypasses (`/\evil.com`, `javascript:`, `//evil.com`), path traversal (`%252e%252e`, `%5c`, `\0`, dotfiles, symlinks, `/____rsc_slot____/..`), body-size DoS caps, `Range` `206`/`416` (**`#Z2`**) |
| **React 19 Server Functions & Progressive Enhancement** | Basic RPC calls, simple forms, redirects, cookies | **True no-JS `<form action={serverAction}>` progressive enhancement**, `useOptimistic` + `useActionState` rollback on error, binary `File`/`Blob` `FormData` uploads + mixed args, **rich JS argument types (`Date`/`Map`/`Set`/`BigInt`)**, concurrent Server Functions + `res.cookie()` / `clearCookie()` race visibility (**`#Z3`**) |
| **Developer Experience (Live HMR × 3 Bundlers & Strict `typegen`)** | Dev server boots & serves routes; basic typegen | **Real live file-edit HMR E2E** across Esbuild, Rollup & Webpack (Client Fast Refresh state preservation, Server Component edit, `.module.css` export change, `"use server"` edit, `page_functions.ts` edit, syntax-error overlay → recovery without restart) + `dinou typegen` verified under `tsc --noEmit --strict` + `@ts-expect-error` negative checks (**`#Z4`**) |
| **Deployment Adapters & Node Middleware Parity** | Node, Cloudflare, Deno, Bun, Static Export, Compiled Binaries | Dedicated E2E / contract suite for **Netlify Functions v2** (`adapters/netlify.js` + `.dinou/netlify/functions/ssr.mjs` + read-only Lambda FS + `mtimeMs` ESM reload) and **Node `configureServer` Express/Connect middleware runner** (`node-middleware-runner.js`, async/callback middlewares, `next(err)`, SSE/WebSocket hijack, plugin isolation) (**`#Z5`**) |

---

## Master Checklist (Series Z — Phase 1)

- [ ] **Stage 1 — Check `#Z1`:** Long-Running Server & Client Memory Bounds (LRU / TTL Eviction Audit & Multi-Thousand-Route Soak Testing)
- [x] **Stage 2 — Check `#Z2`:** HTTP Security & Hardening (CSRF Origin/Host Validation, Open Redirect Prevention, Path Traversal & Static Confinement, Body Size DoS Caps & Production Error Sanitization)
- [ ] **Stage 3 — Check `#Z3`:** Advanced React 19 Server Functions & Progressive Enhancement (No-JS `<form action>`, `useOptimistic` + `useActionState`, Binary `File`/`Blob` `FormData`, Rich JS Types & Concurrent Cookie Mutations)
- [ ] **Stage 4 — Check `#Z4`:** Developer Experience — Live File-Edit HMR Across All 3 Bundlers (Esbuild, Rollup, Webpack) & Strict `dinou typegen` (`tsc --noEmit --strict`) Verification
- [ ] **Stage 5 — Check `#Z5`:** Deployment Adapters & Node Middleware Parity (Netlify Functions v2 Contract Suite & `configureServer` Express/Connect / SSE / WebSocket Runner)

---

## Global Verification Rules

1. **Zero Regression on Existing Suites:** Every fix introduced in `dinou/` MUST preserve 100% pass rate on all existing unit/AOT suites (`tests/unit/*.test.mjs`) and the full Playwright suite (`e2e/example.spec.ts`) across Esbuild, Rollup, and Webpack.
2. **Deterministic Cleanup & Isolation:** Soak tests, live HMR file edits, and temporary security fixtures MUST clean up / restore disk state in `finally` blocks so sequential `chromium → firefox → webkit` runs and repeated CI runs are 100% idempotent.
3. **Production vs Development Parity:** Security and error-sanitization checks (`#Z2`) MUST explicitly verify **production mode (`NODE_ENV=production`)** (both Node AOT and Edge runtimes) as well as dev-mode behavior where applicable.
4. **Companion Changelog:** Track every `dinou/` fix uncovered during Series Z Phase 1 in `z-changelog-phase1.md`.

---

## Stage 1 — Check `#Z1`: Long-Running Server & Client Memory Bounds (LRU / Eviction & Soak Testing)

### Why This Matters
Production Dinou deployments run for days or weeks serving thousands of unique parameterized URLs (`/products/1` … `/products/100000`, `/users/[id]`, search query combinations) and long-lived browser tabs navigating across hundreds of SPA routes. Any unbounded in-memory `Map` or `Set` becomes a **guaranteed OOM crash** on Node/Bun/Deno containers or a browser tab crash in long SPA sessions.

Direct audit of Dinou `v10.0.5` confirms **multiple completely unbounded global `Map`s and `Set`s**:
1. **Server-Side Unbounded Maps:**
   - `dinou/core/cache-slot.js:55` (`slotRenderGenerations = new Map()`): inserts an entry per distinct slot ID and **never evicts**.
   - `dinou/core/cache-slot.js:63` (`recentFreshSlotRenders = new Map()`): stores `{ jsx, ts }` entries with a 500ms TTL, **only deleted lazily if the exact same key is read again** — one-off dynamic slot IDs remain in RAM forever with their full JSX trees retained!
   - `dinou/core/cache-slot.js:80` (`slotRegistry = new Map()`): unbounded growth when routes use parameterized slot IDs (`<DinouCacheSlot id={`product-${params.id}`}>`), retaining closures (`renderFn`) and route sets forever!
   - `dinou/core/handler.js`: `dinou.isDynamic.map` (`isDynamicMap`) and `pageFunctionsConfigCache` — verify bounds when probed with 10,000+ unique dynamic URLs or invalid/404 paths (404 scanner bots!).
   - `dinou/core/asset-extensions.js:23` (`assetHashCache`) & `dinou/core/server-css-modules-plugin.js:16–17` (`serverCssModuleCache`, `lastKnownExportJsonByFile`).
2. **Client-Side Unbounded Maps & Detached React Trees:**
   - `dinou/core/client.jsx` & `dinou/core/client-webpack.jsx`: `pageCache` and `layoutCache` cache RSC promises per route+query URL forever with zero LRU cap!
   - `dinou/core/slot.js:367–383` (`slotOverrideCache`, `knownClientSlots`): when a user navigates away from `/items/1` to `/items/2` … `/items/500`, `knownClientSlots` keeps every unmounted entry forever (`entry.unmounted = true` at line `654`), **holding strong references to `entry.baseChildren` and `slotOverrideCache.get(id).content` (entire React element subtrees!)**!

### Proposed Fixtures & Tests
- **Server Soak Harness (`tests/unit/memory-bounds-soak.test.mjs`):**
  - Dynamic route `/t-z-soak/[id]` (with dynamic `<DinouCacheSlot id={`soak-slot-${id}`}>`, `page_functions.ts`, and random 404 probe paths `/t-z-soak/nonexistent-${i}`).
  - Drive 5,000+ distinct `[id]` SSR, `/____rsc_page____`, `/____rsc_slot____?fresh=1`, and 404 requests against an in-process compiled handler.
  - Inspect exact `.size` of `slotRegistry`, `recentFreshSlotRenders`, `slotRenderGenerations`, `isDynamicMap`, `pageFunctionsConfigCache`, and `heapUsed` slope (comparing heap after warmup vs after 5,000 requests with `--expose-gc`).
- **Browser SPA Soak Test (`e2e/example.spec.ts`):**
  - Soft-navigate sequentially across 150+ unique `/t-z-soak/[id]` pages (triggering `refreshSlot` on each) in a single tab.
  - Assert `window.__DINOU_KNOWN_CLIENT_SLOTS__.size`, `window.__DINOU_SLOT_OVERRIDE_CACHE__.size`, `pageCache.size`, and `layoutCache.size` stay strictly below configured LRU bounds (e.g., `<= MAX_CLIENT_CACHE_ENTRIES`) and navigating `Back` cleanly re-fetches evicted routes with zero errors!

### What to Verify
1. **Bounded Server Caches:** All server-side per-URL and per-slot caches enforce deterministic LRU or periodic TTL sweep caps (never exceeding configured maximums even under 5,000+ unique `[id]` requests or 404 scanner traffic).
2. **Zero Functional Regression on Eviction:** Evicting an older entry from `slotRegistry` or `isDynamicMap` transparently re-discovers/recomputes it on a subsequent request without 500 errors or stale cache artifacts.
3. **Bounded Client Caches:** `pageCache`, `layoutCache`, `knownClientSlots` (unmounted entries), and `slotOverrideCache` enforce an LRU cap so long-lived SPA tabs do not leak detached React subtrees.
4. **Flat Memory Slope:** Post-warmup `heapUsed` stabilizes after reaching LRU capacity (bounded delta, zero monotonic leak).

### Potential Dinou Core Risk Areas
- `dinou/core/cache-slot.js:53–80` — `slotRenderGenerations`, `recentFreshSlotRenders`, and `slotRegistry` currently have zero eviction or max-size cap.
- `dinou/core/slot.js:367–420, 650–656` — `knownClientSlots` and `slotOverrideCache` retain `baseChildren` / `content` forever for unmounted dynamic slots.
- `dinou/core/client.jsx` & `dinou/core/client-webpack.jsx` — `pageCache` and `layoutCache` have no LRU eviction cap.
- `dinou/core/handler.js` — `isDynamicMap` and per-path resolution caches must reject/cap 404 scanner cardinality.

---

## Stage 2 — Check `#Z2`: HTTP Security & Hardening (CSRF, Open Redirect, Path Traversal, DoS & Production Error Sanitization)

### Why This Matters
Before deploying any full-stack RSC framework to the public internet, its HTTP boundary must resist OWASP-class attacks. Direct audit of Dinou `v10.0.5` uncovered **four genuine, immediately exploitable security gaps**:
1. **Server Function CSRF `Origin` Substring Bypass & Spoofable `X-Forwarded-Host` (`dinou/core/handler.js:1736–1744`):**
   - Line `1739` checks `if (!isDevelopment && origin && !origin.includes(host))` — a classic **substring bypass**: if `host` is `app.com`, an attacker site `https://app.com.evil.com` or `https://evil.com/app.com` **passes** `origin.includes(host)`! It must compare `new URL(origin).host.toLowerCase() === expectedHost.toLowerCase()`.
   - Line `1737` blindly trusts `headersObj["x-forwarded-host"] || headersObj["host"]`, allowing any external attacker to bypass Origin checks by sending `X-Forwarded-Host: evil.com` alongside `Origin: https://evil.com` unless trusted-proxy config is enabled (or comparing against `host` / allowed origins)!
   - Also check: what happens when `Origin` is omitted on a cross-site request or `Sec-Fetch-Site: cross-site` is sent, and verify body-size limits on `request.json()` / `request.formData()` to prevent memory-exhaustion DoS!
2. **Production Error Leakage in Server Functions & Fallback HTML (`dinou/core/handler.js:1877–1884, 5431, 5503`):**
   - Line `1879` returns `{ error: err?.message || "Internal Server Error" }` **unconditionally in production** (`!isDevelopment`), leaking raw internal database/filesystem error messages directly to untrusted clients! (Compare with SSR at line `5420` and `/____rsc_payload_error____` at line `1900`, which properly redact to `"An error occurred..."` in production!)
   - Lines `5431` & `5503` hardcode `<title>Dinou Dev Error</title>` even when `isDevelopment === false`!
   - Also audit PPR dynamic hole error payloads and `error.tsx` props in production mode to confirm zero stack traces, absolute filesystem paths, or internal error messages leak.
3. **Open Redirect Bypasses (`server-function-proxy.js:3–5`, `client-redirect.jsx:7–22`, `client.jsx:468–478`):**
   - `server-function-proxy.js:4`: `url.startsWith("/") && !url.startsWith("//")` allows **`/\evil.com`** (backslash normalized to `//evil.com` by browsers → Open Redirect!) and control chars (`/\t`, `/\r\n`).
   - `client-redirect.jsx:13–20`: performs **zero validation** on `to` before `window.location.href = to` — vulnerable to `javascript:alert(1)`, `//evil.com`, and `/\evil.com`!
   - `client.jsx:468–478` (`executeRscRedirect`): executes `window.location.href = redirectUrl` on arbitrary `https://` and does not block `javascript:` / `//evil.com` / `/\evil.com`!
4. **Path Traversal, Static Confinement & Server Function ID Spoofing (`static-assets.js:180–249`, `handler.js:1785–1834`, `handler.js:1933–1943`, `storage-adapter.js`):**
   - Exhaustively probe `/____rsc_page____`, `/____rsc_layout____`, `/____rsc_slot____/:id`, static assets (`.dinou/dist3`), and `POST /____server_function____` `id` parsing against: `../`, `%2e%2e`, `%252e%252e` (double encoding), `%5c` (Windows backslash), `\0` null bytes, `/.env`, `/.git/config`, symlinks escaping `.dinou/dist3`, `file:///etc/passwd#x`, `file:///src/_private/secret.ts#leak`, malformed `Range` headers (`206` valid partial content vs `416` unsatisfiable range), and `Cache-Control` header poisoning.

### Proposed Fixtures & Tests (`tests/unit/security-hardening.test.mjs` + Production Browser E2E)
- Dedicated security contract test suite running against a **production-mode (`NODE_ENV=production`)** Dinou server (and Edge handler) covering all 4 attack classes above.
- Browser E2E confirming malicious redirect payloads (`javascript:alert(1)`, `//evil.com`, `/\evil.com`) never execute script or leave the origin unless explicitly allowed, and production `error.tsx` / Server Function failures redact internal details.

### What to Verify
1. **CSRF & Origin Validation (`POST /____server_function____`):**
   - `Origin: https://localhost:3000.evil.com` → `403 Forbidden` (exact `URL.host` equality!).
   - Spoofed `X-Forwarded-Host: evil.com` + `Origin: https://evil.com` → `403 Forbidden` (unless explicitly configured as trusted proxy).
   - Missing `x-server-function-call: 1` (for JSON RPC) or `Sec-Fetch-Site: cross-site` → `403 Forbidden`.
   - Oversized JSON / multipart payload exceeding configured limit → `413 Payload Too Large` (never OOM!).
2. **Production Error Sanitization (`NODE_ENV=production`):**
   - Uncaught `throw new Error("SECRET_DB_PASSWORD_LEAK")` in: (a) Server Function, (b) SSR page without `error.tsx`, (c) SSR page with `error.tsx`, (d) soft-nav RSC page, (e) PPR dynamic hole, and (f) `<DinouCacheSlot>` -> response body, HTML, headers, and RSC stream MUST NOT contain `"SECRET_DB_PASSWORD_LEAK"`, absolute file paths (`C:\` / `/home/`), stack traces, or `"Dinou Dev Error"`; intentional `err.digest` (when set) still propagates safely.
3. **Open Redirect & XSS-via-Redirect Prevention:**
   - `//evil.com`, `/\evil.com`, `///evil.com`, `javascript:alert(1)`, `data:text/html,...`, and `https://evil.com` (unless explicitly opted in as external redirect) are safely blocked or rejected across `server-function-proxy.js`, `client-redirect.jsx`, `client.jsx`, `client-webpack.jsx`, and `ppr-runtime.js`.
   - Legitimate internal redirects (`/dashboard?tab=1#top`) and explicit external redirects (when deliberately passed via server `res.redirect` / opted-in external URL) continue to work.
4. **Path Traversal, Static Confinement & Range Requests:**
   - All traversal variants (`%2e%2e`, `%252e%252e`, `%5c`, `\0`, `/.env`, `/.git/config`, symlink escape, `/____rsc_slot____/../../etc/passwd`, `POST /____server_function____` with non-manifest/private/outside-`src/` IDs) return `400`/`403`/`404` and never leak filesystem contents.
   - `/.well-known/security.txt` serves `200 OK`; valid `Range: bytes=0-9` returns `206 Partial Content` with exact `Content-Range`; invalid `Range: bytes=99999-100000` returns `416 Range Not Satisfiable`.

### Potential Dinou Core Risk Areas
- `dinou/core/handler.js:1736–1744` — `origin.includes(host)` substring bypass + untrusted `x-forwarded-host` + no request body size guard.
- `dinou/core/handler.js:1877–1884` — raw `err.message` returned in `NODE_ENV=production`!
- `dinou/core/handler.js:5431, 5503` — hardcoded `<title>Dinou Dev Error</title>` in production error fallback HTML.
- `dinou/core/server-function-proxy.js:3–16` & `server-function-proxy-webpack.js` — `isSafeRedirect` misses `/\evil.com` and control chars.
- `dinou/core/client-redirect.jsx:7–22` & `dinou/core/client.jsx:468–478` — missing URL scheme / protocol-relative / backslash validation.
- `dinou/core/storage-adapter.js` (`FileSystemStorage._resolve`) & `dinou/core/static-assets.js:227` — verify realpath symlink containment in addition to lexical `path.resolve`.

---

## Stage 3 — Check `#Z3`: Advanced React 19 Server Functions & True Progressive Enhancement

### Why This Matters
Server Functions (`"use server"`) are a centerpiece of React 19 full-stack apps. While Dinou's existing E2E tests cover basic RPC invocations and JS-enabled forms, **four real-world React 19 Server Function workflows** are currently untested or structurally limited in Dinou `v10.0.5`:
1. **True Progressive Enhancement (`<form action={serverAction}>` With JavaScript Disabled):**
   - In `handler.js:1742`, `POST /____server_function____` currently requires the custom header `x-server-function-call: 1` (which browsers can ONLY attach via JS `fetch()`, NEVER via native HTML `<form method="POST">`).
   - Testing with Playwright `javaScriptEnabled: false` verifies whether Dinou supports (or should add support for) native HTML `<form action>` submissions using `Origin`/`Sec-Fetch-Site: same-origin` CSRF protection + `303 See Other` PRG redirect (or SSR re-render) when JS hasn't loaded yet!
2. **`useOptimistic` + `useActionState` + `useFormStatus` Complete Lifecycle:**
   - Rapidly submitting a form twice: optimistic UI must appear instantaneously (`useFormStatus().pending === true`), settle cleanly when the Server Function resolves, and **cleanly roll back** the optimistic state when the Server Function returns a validation error or throws — with zero hydration mismatch across Esbuild, Rollup, and Webpack.
3. **Binary `FormData` Uploads (`File` / `Blob` + Mixed Extra Args) & Rich JS Argument Serialization (`Date`, `Map`, `Set`, `BigInt`, `Uint8Array`):**
   - Look at `dinou/core/server-function-proxy.js:58, 64` and `dinou/core/handler.js:1762, 1776`: arguments are currently serialized with plain **`JSON.stringify` / `JSON.parse`**!
   - Consequence: passing a `BigInt` throws `TypeError: Do not know how to serialize a BigInt`; passing a `Date` arrives as a `string`; passing a `Map` or `Set` arrives as `{}` — even though Server Function **return values** use `pipeRSC` (React Flight) which supports all of them!
   - Also verify multi-file binary `File`/`Blob` uploads (non-ASCII UTF-8 filenames, binary byte-for-byte SHA-256 integrity, mixed `[prevState, formData]` with `useActionState` where `formDataIndex === 1`, AND server-side `formData.delete("__dinou_*")` stripping without mutating caller state!).
4. **Concurrent Server Functions + `res.cookie()` / `res.clearCookie()` Race Visibility:**
   - Two concurrent Server Functions invoked in parallel where Action A sets cookie `session_a=1` and Action B clears `session_b` + sets `session_c=2`, immediately followed by `router.refresh()` and `refreshSlot()` — verify no dropped cookies, exact `Set-Cookie` + `D:{"type":"cookie"}` propagation, and immediate server-side visibility in `getContext().req.cookies`!

### Proposed Fixtures & Tests (`src/t-z-server-actions/` + `e2e/example.spec.ts`)
- `actions.ts` (`"use server"`):
  - `submitProgressiveForm(formData)` (mutates server state + redirects or returns status).
  - `optimisticAddTodo(prevState, formData)` (supports deterministic delay + simulated failure toggle for rollback check).
  - `uploadBinaryWithMeta(prevState, formData)` (verifies exact binary `File` bytes via checksum, filename UTF-8 preservation, and mixed `prevState` arg).
  - `echoRichTypes(payload)` (receives `{ date: Date, map: Map, set: Set, big: BigInt, bytes: Uint8Array, undef: undefined }` and asserts `instanceof` / `typeof` on server before returning them back to client!).
  - `mutateCookiesAndRead(op)` (sets/clears multiple cookies concurrently).
- Playwright tests covering both JS-enabled (`chromium`/`firefox`/`webkit`) and JS-disabled (`browser.newContext({ javaScriptEnabled: false })`) flows.

### What to Verify
1. **No-JS Progressive Enhancement (`javaScriptEnabled: false`):**
   - Submitting `<form action={submitProgressiveForm}>` executes the `"use server"` function on the server, mutates state, and returns a clean `303`/HTML response reflecting the updated state (while still rejecting cross-origin CSRF POSTs!).
2. **`useOptimistic` + `useActionState` + `useFormStatus`:**
   - Pending indicator renders during in-flight Server Function, optimistic item appears immediately, commits on success, and rolls back cleanly on thrown/validation error.
3. **Binary `FormData` & Mixed Args:**
   - Multi-file binary upload (`Uint8Array` bytes including `0x00`..`0xFF`) + non-ASCII filename (`café-🚀.bin`) + `useActionState` `prevState` (`formDataIndex = 1`) round-trips with 100% byte accuracy and zero leaked `__dinou_func_id` / `__dinou_args` keys in user `formData`!
   - Caller's `FormData` instance is NOT permanently mutated with `__dinou_*` internal fields if re-submitted.
4. **Rich JS Types Round-Trip:**
   - `Date`, `Map`, `Set`, `BigInt`, `Uint8Array`, and `undefined` serialize accurately in BOTH directions (client → Server Function args AND Server Function return → client) across Esbuild, Rollup, and Webpack (or via `encodeReply`/`decodeReply` Flight serialization!).
5. **Concurrent Cookies + Immediate Refresh:**
   - Parallel Server Functions mutating distinct cookies both apply cleanly (no overwrites/drops), and immediate `router.refresh()` + `refreshSlot()` observe all updated cookies on the server.

### Potential Dinou Core Risk Areas
- `dinou/core/server-function-proxy.js:50–65` & `dinou/core/handler.js:1749–1779` — plain `JSON.stringify` breaks `Date`/`Map`/`Set`/`BigInt`/`Uint8Array`; mutating caller's `formData.append("__dinou_*")` directly in place mutates caller state on retry!
- `dinou/core/handler.js:1742` — strict `x-server-function-call: 1` check blocks native no-JS `<form>` progressive enhancement (needs safe progressive-enhancement form path guarded by `Origin` + `Sec-Fetch-Site: same-origin` + manifest allowlist).
- `dinou/core/server-function-proxy-webpack.js` — ensure feature parity with `server-function-proxy.js` (Esbuild/Rollup).

---

## Stage 4 — Check `#Z4`: Developer Experience — Live File-Edit HMR Across All 3 Bundlers & Strict `dinou typegen`

### Why This Matters
Developers spend 90% of their time in `dinou dev` and TypeScript IDE tooling. Currently, CI tests that `dinou dev` boots and serves pages, **but never tests real live file edits while the dev server is running** across Esbuild, Rollup, and Webpack — nor does it run `tsc --noEmit --strict` on the generated `.dinou` route types against complex route topologies!

Live HMR regressions (stale server module cache, broken Fast Refresh state retention, CSS Modules export hash drift, `"use server"` manifest not refreshing, or syntax errors permanently wedging the watcher) are among the most painful bugs a developer can hit.

### Proposed Fixtures & Tests
- **Part A — Live HMR E2E Suite (`tests/hmr/live-hmr.test.mjs` or dedicated Playwright dev spec):**
  - Dedicated isolated fixture route `src/t-z-hmr/` containing:
    - `page.tsx` (Server Component rendering a version token + CSS Module class + `<HmrClientCounter />` + `<form>` calling `hmrAction`).
    - `hmr-client.tsx` (`"use client"` stateful counter + label).
    - `hmr.module.css` (scoped CSS rules).
    - `hmr-actions.ts` (`"use server"` action returning a version string).
    - `page_functions.ts` (`dynamic` / `revalidate` config).
  - Run against live dev servers for **all 3 bundlers**: `esbuild`, `rollup`, and `webpack` (always restoring original file contents in `finally`!).
- **Part B — Strict Typegen Verification (`tests/unit/typegen-strict.test.mjs`):**
  - Run `generateRouteTypes()` (`dinou/core/generate-route-types.js`) against a comprehensive fixture matrix including:
    - Route groups `(alpha)`/`(beta)`, dynamic `[id]`, catch-all `[...slug]`, optional catch-all `[[...opt]]`, optional single `[[opt]]`, parallel `@modal` & `@sidebar` slots (including nested groups inside slots), contextual `./dinou` shadow dirs, custom asset extensions (`.svg`, `.webp`), and `.env` keys.
  - Create a positive & negative TypeScript probe file exercising `Link`, `useRouter`, `PageProps`, `LayoutProps`, `refreshSlot`, and `env` — then run `tsc --noEmit --strict`!

### What to Verify
1. **Client Component Fast Refresh (State Preservation):**
   - Increment `<HmrClientCounter />` to `42` in the browser.
   - Edit `hmr-client.tsx` label text on disk → DOM label updates live within timeout **while counter remains `42`** (proving true React Fast Refresh, not a full page reload!).
2. **Server Component Live Edit:**
   - Edit `page.tsx` server text on disk → browser reflects updated server text automatically with zero manual reload and zero console errors.
3. **CSS Module Live Edit (Value Change & Class Export Rename):**
   - Edit `hmr.module.css` color rule → `getComputedStyle()` updates live.
   - Add/rename an exported class in `hmr.module.css` + reference it in `page.tsx` → `didCssModuleExportsChange()` (`server-css-modules-plugin.js:113–125`) invalidates cleanly and applies the new class with zero stale-class mismatch!
4. **`"use server"` Live Edit:**
   - Edit `hmr-actions.ts` return value (and add a new exported Server Function!) → invoking it from the open browser tab immediately returns the new value without restarting the dev server (manifest hot-reloaded!).
5. **Syntax Error Overlay → Automatic Recovery:**
   - Write an intentional TypeScript/JSX syntax error into `hmr-client.tsx` or `page.tsx` → error overlay / dev error appears cleanly without crashing the dev server process.
   - Restore valid code on disk → dev server rebuilds and browser recovers automatically to working UI!
6. **Strict `dinou typegen` (`tsc --noEmit --strict`):**
   - Zero TypeScript errors on valid typed routes, params, parallel layout slot props, `Link` `href`, and `env` keys.
   - Every `@ts-expect-error` negative assertion (invalid route string, missing required `[id]` param, wrong `string` vs `string[]` catch-all type, unknown layout `@slot` prop) is actually caught by `tsc` (unused `@ts-expect-error` fails the test!).

### Potential Dinou Core Risk Areas
- `dinou/core/server-css-modules-plugin.js:16–125` — stale `serverCssModuleCache` / `lastKnownExportJsonByFile` on Windows file-watcher `mtimeMs` granularity or deleted/renamed CSS files.
- `dinou/esbuild/`, `dinou/rollup/`, `dinou/webpack/` dev servers — `"use server"` manifest refresh when a new export is added during dev; dev server stability after syntax errors in `page_functions.ts` or Server Components.
- `dinou/core/generate-route-types.js:51–150` — edge cases with hyphenated param names (`[user-id]`), nested `(group)` inside `@parallel` slots, Windows case normalization (`normKey`), and `[[...opt]]` navigation vs component prop types.

---

## Stage 5 — Check `#Z5`: Deployment Adapters & Node Middleware Parity (Netlify Functions v2 + `configureServer` Express/Connect)

### Why This Matters
Dinou's CI already tests Node (Dev/AOT/Unvendorized), Cloudflare Workers, Deno, Bun, Bun Pure, Static Export, and Compiled Binaries — leaving **two officially shipped production integration layers** with minimal or zero dedicated E2E coverage:
1. **Netlify Functions v2 Adapter (`dinou/adapters/netlify.js`):**
   - Delegates incoming Web Standard `(Request, context)` calls to the pre-bundled AOT Dual-Bundle in `.dinou/netlify/functions/ssr.mjs` (or `.dinou/dist1/server/netlify.js`), targeting read-only AWS Lambda filesystems.
   - Direct audit of `dinou/adapters/netlify.js:49–64` already spots a subtle bug: `bundleCacheByCwd` checks `cached.mtimeMs === mtimeMs` to reload on rebuild, **but line `58` runs `import(pathToFileURL(bundlePath).href)` without a `?v=${mtimeMs}` cache-buster**, so Node's ESM module cache returns the stale module anyway!
2. **Node `configureServer` & Express/Connect Middleware Runner (`dinou/core/node-middleware-runner.js`):**
   - Powers Express/Connect middleware integration (`cors`, `helmet`, `compression`, auth middlewares, Socket.IO `/socket.io/` hijacking, custom streaming SSE endpoints) in both dev and production Node servers via `dinou.config.mjs` `configureServer({ server, isDev, use })`.
   - Complex edge cases (callback-async middlewares vs Promise middlewares vs `<3`-arg `(req, res)` short-circuiters, `next(err)` propagation, external `server.on("request")` hijacking, streaming SSE coexistence with `onRequest` plugins, and faulty-plugin isolation) deserve dedicated contract and live HTTP coverage!

### Proposed Fixtures & Tests
- **Part A — Netlify Functions v2 Contract Suite (`tests/unit/adapter-netlify.test.mjs`):**
  - Run `dinou build:netlify` (or build the Netlify Dual-Bundle) against the project and invoke `netlifyHandler(request, mockNetlifyContext)` directly:
    - Static prerendered route, Dynamic SSR route, 3D PPR route + `<DinouCacheSlot>` + `/____rsc_slot____`, Server Function (`POST /____server_function____`), `redirect()`, `notFound()`, cookies/headers, `onRequest` plugin, and `config` export verification (`path: "/*"`, `preferStatic: true`).
    - Read-only filesystem simulation (ensuring Netlify handler never crashes attempting writes outside `/tmp` or configured storage) and missing-bundle graceful `500` message test.
    - Bundle reload test when `ssr.mjs` `mtimeMs` changes on disk (proving `?v=${mtimeMs}` cache-busting works!).
- **Part B — Node `configureServer` Middleware Suite (`tests/unit/node-middleware-runner.test.mjs` + live HTTP integration):**
  - Unit & real `http.createServer` integration tests covering:
    1. Sync `next()`, async Promise middleware, and callback-async Express/Connect middleware (`setTimeout(() => next(), 10)`).
    2. Short-circuit middleware calling `res.end()` / `res.writeHead()` (Dinou router MUST NOT run or throw `ERR_HTTP_HEADERS_SENT`).
    3. Fewer-than-3-arg `(req, res) => {}` middleware (`node-middleware-runner.js:53`) + external `server.on("request")` hijacking (simulating Socket.IO polling).
    4. `next(err)` error propagation (returns clean `500`, never hangs the socket!).
    5. Streaming Server-Sent Events (`/api/mw-sse` keeping connection open while concurrent Dinou SSR/RSC/PPR requests complete cleanly).
    6. Coexistence of `configureServer` Node middlewares + `onRequest` Web Standard plugins (order of execution, header propagation, request isolation).
    7. Faulty `plugin.configureServer` throwing during startup (`lines 147–158`) does NOT prevent subsequent plugins from registering!

### What to Verify
1. **Netlify Functions v2 Full Feature Parity:**
   - Static, Dynamic, 3D PPR, `<DinouCacheSlot>`, Server Functions, `redirect()`, `notFound()`, cookies, and `onRequest` plugins all execute cleanly via `netlifyHandler(request, context)` with zero runtime flags and zero read-only FS errors.
   - Rebuilding `.dinou/netlify/functions/ssr.mjs` updates the loaded handler cleanly on `mtimeMs` change.
2. **Node `configureServer` & Middleware Parity (Dev + Production AOT):**
   - Every Express/Connect middleware pattern (`sync`, `async`, `callback`, `2-arg`, `short-circuit`, `next(err)`, `SSE`, `server.on("request")` hijack) behaves cleanly with zero hanging sockets, zero `ERR_HTTP_HEADERS_SENT`, and zero interference with Dinou's SSR/RSC/PPR pipeline.

### Potential Dinou Core Risk Areas
- `dinou/adapters/netlify.js:49–64` — `import(pathToFileURL(bundlePath).href)` lacks a `?v=${mtimeMs}` cache-buster, defeating the `mtimeMs` reload check on rebuilds.
- `dinou/adapters/netlify.js` & Netlify build script — verify `.dinou/dist2` / storage adapter fallback behavior on read-only AWS Lambda filesystems (`/var/task`).
- `dinou/core/node-middleware-runner.js:52–86` — verify a callback-async middleware that forgets to call `next()` AND never ends `res` (or where client aborts early via `req.on("aborted")` / `res.on("close")`) cleans up listeners without leaking memory or hanging!
- `dinou/node/` dev & prod server integration — verify `next(err)` thrown by a middleware returns a sanitized `500` in production (never unhandled promise rejection crashing the Node process!).

---

## Recommended Execution Order

When ready to execute Series Z Phase 1 (one stage at a time, with `z-changelog-phase1.md` maintained in parallel):
1. **Stage 2 (`#Z2` — HTTP Security & Hardening)** — highest immediate production impact (fixes confirmed `origin.includes(host)` CSRF bypass, spoofable `X-Forwarded-Host`, production Server Function `err.message` leak, and Open Redirect `/\evil.com` / `javascript:` gaps!).
2. **Stage 1 (`#Z1` — Server & Client Memory Bounds / Soak)** — eliminates unbounded `Map` OOM risks (`slotRegistry`, `recentFreshSlotRenders`, `slotRenderGenerations`, `knownClientSlots`, `pageCache`/`layoutCache`) for long-running production deployments.
3. **Stage 3 (`#Z3` — Advanced React 19 Server Functions & Progressive Enhancement)** — brings full React 19 ergonomics (`useOptimistic`, `useActionState`, binary `FormData`, rich argument serialization, and no-JS `<form action>` progressive enhancement).
4. **Stage 4 (`#Z4` — Live HMR Across 3 Bundlers & Strict `dinou typegen`)** — locks down day-to-day developer experience across Esbuild, Rollup, Webpack, and TypeScript strict mode.
5. **Stage 5 (`#Z5` — Netlify Functions v2 & Node `configureServer` Middleware Parity)** — completes end-to-end coverage of Dinou's remaining adapter and server-extension surfaces.
