# Dinou 3D Caching Cube — Phase 8 Final Seal (Client Router Coherence, Encoded URLs, HTTP `HEAD`/Headers & Edge Races)

This document specifies the **final 4 edge-case test stages** (`Checks #87–#90`) sealing the last remaining real-world failure modes of Dinou's **3D Caching Cube + Revalidation** system (Axis X: Hierarchical Segmentation × Axis Y: Bidirectional `<DinouCacheSlot>` × Axis Z: Per-Segment PPR) — with **zero overlap** against Series Y Phases 1–7 (`Checks #1–#86`) or Series Z (`z-phase1-tests.md`, `Checks #Z1–#Z5`).

> **Why a Phase 8 Before Series Z?**
> Phases 1–7 (`Checks #1–#86`) exhaustively verified the server-side 3D Caching Cube, all 6 revalidation primitives, distributed/Edge KV storage, causal `_old` hydration, mid-ISR non-200 transitions, and React 19 head hoisting + scoped CSS Modules.
>
> A final post-Phase-7 line-by-line audit of `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`, `dinou/core/server-function-proxy.js`, `dinou/core/handler.js`, `dinou/core/cache-revalidate.js`, `dinou/core/cache-slot.js`, and `dinou/core/ppr-runtime.js` uncovered **four concrete, previously untested 3D Cube + Revalidation frontiers** — including **immediately reproducible code-level bugs** in client router cache coherence (`#87`) and percent-encoded / Unicode dynamic route revalidation (`#88`):
> 1. **Client Router Cache Coherence (`#87`):** `pageCache` / `layoutCache` serving stale V1 RSC promises after Server Functions call `revalidatePage()` / `revalidatePath()` / `revalidateLayout()` / `revalidateTag()` (including `redirect()` without `{ fresh: true }`), after `<Link prefetch>`, and when re-visiting PPR dynamic-hole or `revalidate = 0` routes (`A → B → A`).
> 2. **Unicode, Spaces & Percent-Encoded Dynamic Params (`#88`):** Direct SSR decodes `pathname` (`handler.js:447`), while `/____rsc_page____` skips `decodeURIComponent` (`handler.js:2023`) and `normalizeRevalidatePath()` never decodes `%XX` (`cache-revalidate.js:464–470`) — causing silent cache/revalidation key drift on routes like `/items/café` (`caf%C3%A9`) or `/items/hello world` (`hello%20world`).
> 3. **HTTP `HEAD` Method Semantics & Custom Response Headers (`#89`):** `handler.js` has no dedicated `HEAD` handling on static/PPR/dynamic routes (risking full body emission, unnecessary PPR dynamic-hole streaming, or unintended ISG/ISR regeneration on `HEAD`/`OPTIONS`), and custom `Cache-Control` / `Vary` / `X-*` headers set in `page_functions.ts` / `layout_functions.ts` / `plugin.onRequest` have never been verified across 3D cache hits, `handlePprResume`, and `revalidatePage()`.
> 4. **Cross-Primitive Edge Races, `<DinouCacheSlot>` Edge Placements & `React.cache()` Isolation (`#90`):** Simultaneous `Promise.all([revalidateLayout, revalidatePage, revalidateTag])` under Cloudflare Workers (where `enqueueRevalidation` intentionally bypasses the FIFO queue), multi-slot shared-tag lookup in `resolveCanonicalSlotId` / `inspectSlotsFreshness`, `<DinouCacheSlot>` with `revalidate={false}` / sub-1 values and inside `not_found.tsx` / `error.tsx`, and `React.cache()` request-scoped memoization across `Dynamic L2`, `PPR Dynamic Holes`, and `<DinouCacheSlot>`.

All 4 stages below are designed to be executed strictly via **TDD (RED → GREEN)**, one stage at a time, recording every `dinou/core/` fix in `y-changelog-cube-phase8.md`.

---

## Frontier Coverage Matrix (What Phase 8 Closes)

| Frontier | Covered in Phases 1–7 / Series Z (Distinct) | Untested / Confirmed Code-Level Gaps Closed in Phase 8 |
|---|---|---|
| **Client Router Cache Coherence** | `#Z1` bounds `pageCache`/`layoutCache` memory size (LRU/OOM); `#69`/`#71` test explicit `router.refresh()` | Server Function calling `revalidatePage`/`revalidatePath`/`revalidateLayout`/`revalidateTag` + `<Link>` or `redirect()` serving stale V1 from `pageCache`/`layoutCache`; `<Link prefetch>` staleness; `A → B → A` re-visit freezing PPR dynamic holes and `revalidate = 0` pages (**`#87`**) |
| **Unicode / Percent-Encoded Dynamic Routes** | ASCII dynamic `[id]` (`alpha`, `beta`) & `[[...slug]]` (`docs/v2`) | `/items/caf%C3%A9` (`café`), `/items/hello%20world` (`hello world`), `+`, trailing slashes `/route/` vs `/route` across SSG, ISG, Direct SSR, `/____rsc_page____`, `/____rsc_layout____`, `<DinouCacheSlot id>`, and `revalidatePage("./")` / `revalidatePath` / `revalidateLayout` / `revalidateTag` (**`#88`**) |
| **HTTP `HEAD` & Custom Headers in 3D Cube** | `GET` SSR/RSC + `POST` Server Functions; `404`/`410`/`302` statuses (`#85`) | `HEAD` on Static, Pure PPR (`handlePprResume`), Asymmetric 3D PPR, Dynamic, and Tombstoned `404`/`410`/`302` routes (exact status/headers, empty body, zero spurious ISG/PPR hole execution); custom `Cache-Control`, `Vary`, and `X-*` header preservation across cache hits, PPR resume & revalidation (**`#89`**) |
| **Cross-Primitive Edge Races, Slot Edge Placements & `React.cache()`** | Same-key stampede (`#54`, `#81`); single-surface `revalidateTag` (`#80`) | Concurrent mixed `Promise.all([revalidateLayout, revalidatePage, revalidateTag])` under Cloudflare Workers (no FIFO queue); multi-slot shared-tag lookup in `resolveCanonicalSlotId` / `inspectSlotsFreshness`; `<DinouCacheSlot>` with `revalidate={false}` / `0.5` / `-1` and inside `not_found.tsx` & `error.tsx`; `React.cache()` request deduplication & zero cross-request leakage across `L2(D)`, PPR holes & slots (**`#90`**) |

---

## Master Checklist (Phase 8)

- [x] **Stage 1 — Check `#87`:** Client Router Cache Coherence (`pageCache` / `layoutCache`) Across `revalidate*()` Server Functions, `<Link prefetch>`, `redirect()`, and PPR / Dynamic Route Re-Visits
- [x] **Stage 2 — Check `#88`:** Unicode, Spaces & Percent-Encoded Dynamic Parameters (`/items/caf%C3%A9`, `/items/hello%20world`, Trailing Slashes) Across 3D Cube SSG/ISG, RSC Endpoints, `<DinouCacheSlot>` & `revalidate*()`
- [x] **Stage 3 — Check `#89`:** HTTP `HEAD` Method Semantics & Custom HTTP Headers (`Cache-Control`, `Vary`, `X-*`) Preservation Across 3D Cube Static, PPR Resume, Asymmetric Dynamic & Tombstoned Routes
- [ ] **Stage 4 — Check `#90`:** Cross-Primitive Concurrent Revalidation Races on Cloudflare Workers, Multi-Slot Tag Resolution, `<DinouCacheSlot>` Edge Placements (`revalidate={false}`, `not_found.tsx`, `error.tsx`) & `React.cache()` Isolation

---

## Global Verification Rules

1. **Strict TDD (RED → GREEN):** For every stage, write fixtures, unit tests (`tests/unit/cache-3d-cube-phase8.test.mjs`), and Playwright E2E tests (`e2e/example.spec.ts`) **first**, run them to reproduce and confirm the real bugs (RED), then implement minimal surgical fixes in `dinou/core/`, and re-verify GREEN.
2. **Poisoning Methodology:** Poison untouched ancestor/sibling static shells (`base + 899`) during every revalidation or slot refresh to prove mathematically that only the targeted segment/slot re-executed.
3. **Idempotence Across Browsers & Re-Runs:** Derive baselines dynamically from live DOM/storage and restore all mutated flags/state in `finally` blocks so sequential `chromium → firefox → webkit` runs and repeated CI invocations remain 100% deterministic.
4. **Strict Guards:** Zero React hydration errors (`#418/#419/#422/#423/#425`), zero `"navigate called outside Router"` warnings, zero uncaught `pageerror`, zero WebKit access-control errors, and zero regressions across existing unit/CI suites (`test:3d-cube`, `test:3d-reval`, `cache-3d-cube-phase7`, `verify-revalidation-fixes-ci`, `verify-api-reference-fixes-1-ci`, and Chromium E2E).
5. **Companion Changelog:** Document every `dinou/core/` bug fix uncovered during Phase 8 in English in `y-changelog-cube-phase8.md` (at project root, Keep-a-Changelog + Tracking Log format).

---

## Stage 1 — Check `#87`: Client Router Cache Coherence Across `revalidate*()` Server Functions, `<Link prefetch>`, `redirect()` & PPR/Dynamic Re-Visits

### Why This Matters
In real single-page RSC apps, users constantly perform the classic mutation loop: visit `/route-b` (or hover a `<Link href="/route-b">` that triggers `window.__DINOU_PREFETCH__`), navigate to `/route-a`, submit a `"use server"` mutation that calls `revalidatePage("/route-b")` / `revalidatePath(...)` / `revalidateLayout(...)` / `revalidateTag(...)` (optionally calling `redirect("/route-b")`), and navigate back to `/route-b` with a normal `<Link>` (without remembering to put `fresh` on every link!).

Direct audit of Dinou `v10.0.6` reveals **three confirmed client-cache coherence gaps**:
1. **Zero Client Router Cache Invalidation Signal After Server Function `revalidate*()` (`dinou/core/cache-revalidate.js`, `dinou/core/handler.js`, `dinou/core/server-function-proxy.js`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`):**
   - `server-function-proxy.js:94–210` (and `server-function-proxy-webpack.js`) handles `D:{"type":"redirect"}` and `D:{"type":"cookie"}`, but receives **no cache invalidation signal** when a Server Function invokes `revalidatePath()`, `revalidatePage()`, `revalidateLayout()`, or `revalidateTag()`.
   - Even worse, `executeRedirect()` (`server-function-proxy.js:11`, `server-function-proxy-webpack.js:11`) calls `window.__DINOU_ROUTER_NAVIGATE__(safeUrl)` **without `{ fresh: true }`** — so redirecting back to a previously visited or prefetched route renders the **stale V1 promise** from `pageCache`!
2. **Stale `<Link prefetch>` After Server Revalidation (`dinou/core/client.jsx:1093–1109`, `dinou/core/client-webpack.jsx:1093–1109`):**
   - Hovering `<Link href="/route-b">` populates `pageCache` (and `layoutCache`) with V1. If the user then mutates state + calls `revalidatePage("/route-b")` or `revalidateTag("route-b-tag")` via a Server Function and clicks `<Link href="/route-b">`, the prefetched V1 entry wins over the freshly revalidated server V2!
3. **Frozen PPR Dynamic Holes & `revalidate = 0` Pages on Client Re-Visits (`A → B → A`) (`dinou/core/client.jsx:516–518`, `dinou/core/client-webpack.jsx:516–518`):**
   - `getPagePayload()` hits `if (pageCache.has(url)) return pageCache.get(url);` unconditionally — regardless of whether `/____rsc_page____` returned a **dynamic (`revalidate = 0`)** or **PPR (dynamic-hole)** response (`Cache-Control: no-store` / dynamic response header)!
   - Consequence: Navigating `Route A (PPR with live dynamic hole) → Route B → Route A` (via normal `<Link href="/route-a">`) serves the **frozen dynamic hole from visit #1** instead of re-evaluating the live PPR dynamic hole (while keeping the static PPR shell cached on the server!).
   - *Design note:* Browser `Back`/`Forward` (`popstate`) may preserve history feel or refresh cleanly, whereas forward `<Link>` navigation / Server Function `redirect()` to a dynamic/PPR route (or any route invalidated by a Server Function) MUST reflect fresh dynamic holes and post-revalidation V2 state without forcing developers to add `fresh` to every `<Link>`! Also verify `layoutCache` invalidation when a Server Function calls `revalidateLayout()` or `revalidateTag()` targeting a layout!

### Proposed Fixtures & Tests (`src/t-3d-cube/router-coherence/` + Unit & Playwright E2E)
- `src/t-3d-cube/router-coherence/`:
  - `layout.tsx` + `layout_functions.ts` (`ppr = true`, `revalidate = 3600`, `getCacheTags: () => ["rc-l1"]`): renders `L1` shell seq, `<CubeClientProbe id="rc-l1" />`, `<CubeControlBridge />`, and `<Link>`s (including prefetch-enabled links!) to `ppr-a`, `static-b`, `dyn-c`, and `reval-layout-branch/sub`.
  - `actions.ts` (`"use server"`):
    - `mutateAndRevalPage(target, patch)` — mutates state + calls `revalidatePage(target)`.
    - `mutateRevalAndRedirect(target, patch)` — mutates state + calls `revalidatePage(target)` + `redirect(target)`.
    - `mutateAndRevalTag(tag, patch)` — mutates state + calls `revalidateTag(tag)`.
    - `mutateAndRevalLayout(layoutPath, patch)` — mutates state + calls `revalidateLayout(layoutPath)`.
  - `ppr-a/page.tsx` (`ppr = true`, `revalidate = 3600`, tag `rc-ppr-a`): static PPR shell (`rcPprAShellSeq`) + live dynamic PPR hole (`rcPprAHoleSeq` reading `headers`).
  - `static-b/page.tsx` (`revalidate = 3600`, tag `rc-static-b`): pure static page (`rcStaticBSeq`) with buttons invoking `mutateAndRevalPage`, `mutateRevalAndRedirect`, and `mutateAndRevalTag`.
  - `dyn-c/page.tsx` (`revalidate = 0`): pure dynamic page (`rcDynCSeq`).
  - `sub-layout/layout.tsx` (`ppr = true`, `revalidate = 3600`, tag `rc-sub-l2`) + `sub-layout/page.tsx` (`revalidate = 3600`): tests `layoutCache` invalidation when `revalidateLayout("/t-3d-cube/router-coherence/sub-layout")` runs inside a Server Function!

### What to Verify
1. **Server Function `revalidatePage` / `revalidateTag` + Normal `<Link>` Navigation (No `fresh` Prop):**
   - Visit `static-b` (warming `pageCache` with V1), navigate to `ppr-a`, invoke `mutateAndRevalPage("/.../static-b", { rcStaticBSeq: V2 })` (with `L1` poisoned), click normal `<Link href=".../static-b">` -> DOM immediately shows `V2` (NOT stale `V1`!) while `L1` stays mounted and frozen!
   - Repeat with `mutateAndRevalTag("rc-static-b", ...)` and with **hovered `<Link prefetch>`** prior to mutation -> clicking the prefetched link MUST show `V2`, never stale prefetched `V1`!
2. **Server Function `revalidatePage` + `redirect()` to Previously Visited Route:**
   - Visit `static-b` (V1 cached in `pageCache`), go to `ppr-a`, invoke `mutateRevalAndRedirect("/.../static-b", { rcStaticBSeq: V3 })` -> client redirects smoothly to `static-b` and renders `V3` immediately with zero manual `refresh()`!
3. **Server Function `revalidateLayout` + `layoutCache` Coherence:**
   - Visit `sub-layout` (warming `layoutCache` with `L2 = V1`), navigate out to `ppr-a`, invoke `mutateAndRevalLayout("/.../sub-layout", { rcSubL2Seq: V2 })` (with `L1` and `sub-layout` page poisoned), click normal `<Link>` back to `sub-layout` -> `L2` renders `V2` while poisoned `L1` and `sub-layout` page stay frozen!
4. **PPR Dynamic Hole & `revalidate = 0` Re-Visit Freshness (`A → B → A`):**
   - Visit `ppr-a` (shell = `100`, hole = `100`), navigate to `static-b`, mutate `rcPprAHoleSeq = 200` and poison `rcPprAShellSeq = POISON`, click normal `<Link>` back to `ppr-a` -> static shell stays frozen at `100` (zero `POISON`) while dynamic PPR hole immediately renders fresh `200`!
   - Visit `dyn-c` (`100`), navigate to `static-b`, mutate `rcDynCSeq = 200`, click normal `<Link>` back to `dyn-c` -> renders fresh `200`!
5. **Cross-Bundler Parity (`Esbuild`, `Rollup`, `Webpack`) & 3 Browsers (`Chromium`, `Firefox`, `WebKit`):**
   - Both `client.jsx` + `server-function-proxy.js` (Esbuild/Rollup) AND `client-webpack.jsx` + `server-function-proxy-webpack.js` (Webpack) emit and honor the exact same invalidation contract with zero `#418` hydration errors.

### Potential Dinou Core Risk Areas
- `dinou/core/client.jsx:514–628, 1022–1109` & `dinou/core/client-webpack.jsx:514–628, 1022–1109` — unconditional `pageCache.has(url)` / `layoutCache.has(cacheKey)` reuse; no header-driven dynamic/PPR cache-bypass or global invalidation hook (`window.__DINOU_INVALIDATE_CLIENT_CACHE__`).
- `dinou/core/server-function-proxy.js:7–16, 94–196` & `dinou/core/server-function-proxy-webpack.js:7–16, 94–196` — `executeRedirect()` omits `{ fresh: true }` and lacks a `D:{"type":"revalidate",...}` / `X-Dinou-Revalidated` response header handler to purge stale client `pageCache`/`layoutCache` entries.
- `dinou/core/handler.js:1850–1885, 2005–3530` & `dinou/core/cache-revalidate.js` — track revalidations invoked inside `requestStorage` during a Server Function and emit a lightweight invalidation header/directive (`X-Dinou-Revalidated` or `D:{"type":"revalidate"}`), plus emit a response header (e.g. `X-Dinou-Cache-Mode: dynamic|ppr|static`) on `/____rsc_page____` so the client router knows not to freeze PPR/dynamic payloads across forward navigations.

---

## Stage 2 — Check `#88`: Unicode, Spaces & Percent-Encoded Dynamic Parameters Across 3D Cube SSG/ISG, RSC Endpoints, `<DinouCacheSlot>` & `revalidate*()`

### Why This Matters
Real international apps routinely serve slugs containing accented letters (`/blog/programación`, `/items/café`), CJK/emoji (`/topics/東京`), spaces (`/docs/hello world`), plus signs (`/tags/c++`), or trailing slashes (`/items/café/` vs `/items/café`). Browsers encode these in HTTP requests, `Referer`, and `window.location.pathname` (`%C3%A9`, `%20`, `%E6%9D%B1%E4%BA%AC`), while developers pass either decoded (`revalidatePage("/items/café")`) or encoded (`x-dinou-current-path: /items/caf%C3%A9` with `revalidatePage("./")`) paths!

Direct audit of Dinou `v10.0.6` confirms **three concrete encoding-drift bugs**:
1. **`/____rsc_page____` Skips `decodeURIComponent` (`dinou/core/handler.js:2019–2034`):**
   - Direct SSR decodes `pathname` at `handler.js:447`, producing decoded `reqPath` (`items/café`) and decoded `dynamicParams` (`{ slug: "café" }`).
   - In `/____rsc_page____`, lines `2022–2028` explicitly guard `if (!isLayoutReq) return s;` — leaving `reqSegments` and `cleanPath` **percent-encoded** (`items/caf%C3%A9`)!
   - Consequence: Soft navigation or hydration on `/items/caf%C3%A9` misses the cached `items/café/page.rsc` / `shell.page.json` artifact, passes raw `"caf%C3%A9"` as `params.slug` (causing `#418` hydration mismatch against SSR's `"café"`!), or writes duplicate shadow cache directories (`items/caf%C3%A9/` alongside `items/café/`)!
2. **`normalizeRevalidatePath()` Never Decodes Percent-Encoding (`dinou/core/cache-revalidate.js:429–472`):**
   - `revalidatePage("/items/caf%C3%A9")`, `revalidatePage("./")` (when `x-dinou-current-path` or `Referer` is `/items/caf%C3%A9`), `revalidateLayout("./")`, and `revalidatePath("/items/hello%20world")` build storage keys with literal `%C3%A9` / `%20` instead of canonical decoded segments — **silently failing to invalidate the real cached entry** (and leaving stale V1 forever on Node FS, Redis, Deno KV, and Cloudflare KV)!
3. **Parameterized `<DinouCacheSlot id>` & Trailing-Slash Normalization (`dinou/core/cache-slot.js:765, 1153–1156`, `dinou/core/storage-adapter.js`):**
   - Verify `/____rsc_slot____/${encodeURIComponent(slotId)}` (e.g. `slot-café`, `slot-hello world`) decodes consistently between `DinouCacheSlot`, `slotRegistry`, `storageKey`, and `revalidateTag()`, and that trailing-slash requests (`/items/café/` vs `/items/café`) map to the exact same canonical 3D Cube cache entry with zero duplicate cache keys!

### Proposed Fixtures & Tests (`src/t-3d-cube/encoded-params/` + Unit & Playwright E2E)
- `src/t-3d-cube/encoded-params/`:
  - `layout.tsx` + `layout_functions.ts` (`ppr = true`, `revalidate = 3600`, tag `enc-l1`).
  - `[category]/layout.tsx` + `layout_functions.ts` (`ppr = true`, `revalidate = 3600`, `getStaticPaths: () => ["café", "hello world"]`, dynamic `getCacheTags: ({ category }) => [\`enc-cat-${category}\`]`).
  - `[category]/[slug]/page.tsx` + `page_functions.ts` (`ppr = true`, `revalidate = 3600`, `getStaticPaths: () => [{ category: "café", slug: "crème brûlée" }, { category: "hello world", slug: "c++ guide" }]`):
    - Renders decoded `params.category` & `params.slug` in static PPR shell, inside a dynamic PPR hole (`<Suspense>`), AND inside a parameterized `<DinouCacheSlot id={\`enc-slot-${category}-${slug}\`} tags={[\`enc-slot-tag-${slug}\`]}>`!
    - Also supports on-demand ISG for a third Unicode/encoded param pair (`/t-3d-cube/encoded-params/東京/ramen%20bowl` → `category: "東京"`, `slug: "ramen bowl"`).
    - Server Function calling relative `revalidatePage("./")` and `revalidateLayout("./")` using `x-dinou-current-path`!

### What to Verify
1. **SSG & On-Demand ISG Parity (Direct SSR + Hydration + Soft-Nav):**
   - Direct SSR `GET /t-3d-cube/encoded-params/caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e` AND trailing-slash `.../cr%C3%A8me%20br%C3%BBl%C3%A9e/` AND on-demand ISG `/.../東京/ramen%20bowl` (encoded) render identical decoded `params` (`café`, `crème brûlée`, `東京`, `ramen bowl`) across SSR HTML, `/____rsc_page____`, and `/____rsc_layout____` with **zero `#418` hydration mismatch** and zero duplicate cache folders!
2. **Revalidation Parity (Encoded vs Decoded vs Relative `./`):**
   - Calling `revalidatePage("/.../caf%C3%A9/cr%C3%A8me%20br%C3%BBl%C3%A9e")` (encoded), `revalidatePage("/.../café/crème brûlée")` (decoded), `revalidatePage("/.../café/crème brûlée/")` (trailing slash), AND relative `revalidatePage("./")` from a Server Function on that page ALL hit and update the **exact same canonical cache entry** while poisoned `L1` and sibling `hello world` stay frozen!
   - Same for `revalidateLayout("./")` on `[category]`, `revalidatePath(...)`, and `revalidateTag("enc-cat-café")`!
3. **Parameterized `<DinouCacheSlot>` With Unicode/Space IDs & Tags:**
   - `refreshSlot("enc-slot-café-crème brûlée", { fresh: true })` (hitting `/____rsc_slot____/...`) and `revalidateTag("enc-slot-tag-crème brûlée")` update the slot live in browser and persist on F5 reload while static PPR shells stay frozen!
4. **Cross-Runtime & Cross-OS Storage Safety:**
   - Unit test verifies `FileSystemStorage`, `RedisStorage`, `DenoKVStorage`, and `CloudflareKVStorage` (including Windows/Linux path safety and zero traversal regression on `%2e%2e`!).

### Potential Dinou Core Risk Areas
- `dinou/core/handler.js:2015–2040` — `/____rsc_page____` skips `decodeURIComponent(s)` when `!isLayoutReq`, drifting from Direct SSR (`handler.js:447`).
- `dinou/core/cache-revalidate.js:429–475` — `normalizeRevalidatePath()` does not decode percent-encoded path segments before computing `cleanPath` / `reqSegments` (must decode safely while preserving security/traversal guards!).
- `dinou/core/handler.js` (`/____rsc_slot____/:id`) & `dinou/core/cache-slot.js:765, 1099–1156` — verify consistent `decodeURIComponent` for encoded slot IDs/tags in URLs and storage keys.
- `dinou/core/build-static-pages.js` / `dinou/core/generate-static-rsc.js` — verify SSG writes canonical decoded paths matching runtime `handler.js` & `cache-revalidate.js` (including spaces and `+` signs).

---

## Stage 3 — Check `#89`: HTTP `HEAD` Method Semantics & Custom HTTP Headers (`Cache-Control`, `Vary`, `X-*`) Preservation Across 3D Cube

### Why This Matters
Production traffic isn't only browser `GET` requests: CDNs, reverse proxies (Cloudflare, CloudFront, Nginx), uptime probes, SEO crawlers, and social link previewers continuously send **`HEAD`** requests and rely on accurate **`Cache-Control`**, **`Vary`**, and custom **`X-*`** response headers across cached, PPR, dynamic, and tombstoned routes.

Direct audit of Dinou `v10.0.6` shows:
1. **No `HEAD` Handling in `dinou/core/handler.js`:**
   - Searching `dinou/core/handler.js` confirms zero `request.method === "HEAD"` checks.
   - Sending `HEAD /static-ppr-route` enters `handlePprResume()`, starts streaming dynamic PPR holes (executing live DB/dynamic code unnecessarily!) and attaches a non-empty `ReadableStream` body to a `HEAD` `Response`!
   - Sending `HEAD /isg-cold-route` can trigger full ISG generation and write to cache on a probe request, or return a non-empty body violating RFC 9110 §9.3.2!
   - Sending `HEAD /tombstoned-404` / `HEAD /tombstoned-410` / `HEAD /tombstoned-302` MUST return the exact `404` / `410` / `302` status + `Location` / `Content-Type` headers with an **empty body (`""`)**!
2. **Custom Header Preservation Across 3D Cache Hits, `handlePprResume` & Revalidation:**
   - What happens when `plugin.onRequest`, `layout_functions.ts` (`getProps`), `page_functions.ts` (`getProps`), or a PPR dynamic hole sets custom headers via `res.setHeader("X-Cube-Hdr", ...)`, `res.setHeader("Vary", "Accept-Language")`, or custom `res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300")`?
   - Verify whether `handler.js` / `ppr-runtime.js:1224–1229` preserves or overwrites them cleanly on:
     - Warm static cache hit (`index.html`),
     - Pure PPR streaming resume (`handlePprResume`),
     - Asymmetric `L1(S PPR) → L2(D) → Page(S PPR)` live composition,
     - And post-`revalidatePage()` regeneration!

### Proposed Fixtures & Tests (`tests/unit/cache-3d-cube-phase8.test.mjs` Test 3 + Playwright HTTP/E2E)
- Standalone unit/AOT fixture + E2E route branch `src/t-3d-cube/http-head-headers/`:
  - Static SSG route (`revalidate = 3600`) with custom `Cache-Control` & `X-Cube-Static` header set via `plugin.onRequest` / `page_functions.ts`.
  - Pure PPR route (`ppr = true`, `revalidate = 3600`) with a dynamic hole counter (to verify `HEAD` behavior + custom `X-Cube-Ppr` header preservation) and an asymmetric `L1(S PPR) → L2(D) → Page(S PPR)` route.
  - Dynamic route (`revalidate = 0`) setting `Vary: Accept-Language` and `X-Cube-Dyn`.
  - Mid-ISR tombstoned routes (`404`, `410`, `302` redirect) from Stage 1 (`#85`) probed with `HEAD`.

### What to Verify
1. **`HEAD` RFC 9110 Compliance Across All 3D Cube Modes:**
   - `HEAD` on Static, Pure PPR, Asymmetric 3D PPR, Dynamic, `404`, `410`, and `302` returns the **exact same HTTP status code** (`200`, `404`, `410`, `302`) and matching `Content-Type` / `Location` / custom headers as `GET`, with a **strictly empty response body (`body.length === 0`)**!
   - `HEAD` on a warm Static or Pure PPR route does **not** corrupt cached artifacts or leak open/hanging streams (and for Pure PPR warm cache, does not leak unhandled stream cancellations).
2. **Custom `Cache-Control`, `Vary`, and `X-*` Header Preservation:**
   - Custom headers set in `plugin.onRequest` survive **all** cache-hit paths (static `index.html`, Pure PPR `handlePprResume`, Asymmetric Step 4, `/____rsc_page____`, `/____rsc_slot____`, and tombstoned `404`/`410`/`302`).
   - Custom `Cache-Control` set before `handlePprResume` is preserved (only appending `no-transform` if absent, never clobbering user directives), and custom headers set inside a PPR dynamic hole before body flush propagate cleanly.
   - Revalidating a route via `revalidatePage()` does not strip or break expected headers on subsequent `GET` or `HEAD` requests.
3. **Node AOT Server + Web Standard `handleRequest` Parity:**
   - Verified both via direct `handleRequest(new Request(..., { method: "HEAD" }))` AND against a live Node AOT HTTP server (`page.request.head(...)` in Playwright).

### Potential Dinou Core Risk Areas
- `dinou/core/handler.js` — add clean RFC-compliant `HEAD` response finalization (stripping body while preserving status & headers, and avoiding unnecessary streaming/body work on `HEAD` for static/PPR cache hits).
- `dinou/core/ppr-runtime.js:1217–1243` — verify `HEAD` requests do not leave dangling `TransformStream` writers or fire unawaited background hole streams, and verify custom `bridge.headers` propagation.
- `dinou/node/` AOT server bridge — verify Node's `http.ServerResponse` handles `HEAD` responses cleanly without `ERR_HTTP_CONTENT_LENGTH_MISMATCH` or hanging keep-alive sockets.

---

## Stage 4 — Check `#90`: Cross-Primitive Concurrent Edge Races, Multi-Slot Tag Resolution, `<DinouCacheSlot>` Edge Placements & `React.cache()` Isolation

### Why This Matters
Phase 6 (`#80–#84`) verified each revalidation primitive individually and same-key stampedes. Four subtle multi-feature edge cases inside the 3D Cube remain untested:
1. **Cross-Primitive Concurrent Revalidation Races on Cloudflare Workers (`dinou/core/cache-revalidate.js:92–103`):**
   - On Node, `enqueueRevalidation()` serializes `revalidateLayout`, `revalidatePage`, and `revalidateTag` through `revalState.queue`.
   - On Cloudflare Workers (`isCloudflareWorkersRuntime() === true`), line `96` deliberately bypasses `revalState.queue` to avoid cross-request `IoContext` errors!
   - When a webhook or concurrent isolates fire `Promise.all([revalidateLayout("/a"), revalidatePage("/a/b"), revalidateTag("slot-in-a")])` simultaneously on Cloudflare KV, race conditions between `layoutGeneratedAt`, `page.generatedAt`, and `slot.generatedAt` can produce inconsistent `index.html` / `page.rsc` pairs or drop a slot update!
2. **Multi-Slot Shared Tag Lookup in `resolveCanonicalSlotId` & `inspectSlotsFreshness` (`dinou/core/cache-slot.js:1099–1148, 1553–1615`):**
   - `resolveCanonicalSlotId(slotIdOrTag)` returns only the **first** slot matching a tag. When two distinct `<DinouCacheSlot>`s (`id="slot-a" tag="shared"` and `id="slot-b" tag="shared"`) live in the same page or layout (e.g., `slot-a` has `revalidate={3600}` while `slot-b` has `revalidate={1}` or was refreshed independently), verify `inspectSlotsFreshness()`, `refreshSlot("shared", { fresh: true })`, and `revalidateTag("shared")` consistently update **both** slots without `slot-a` masking `slot-b`!
3. **`<DinouCacheSlot>` Edge Placements (`revalidate={false}`, `0.5`/`-1`, and Inside `not_found.tsx` / `error.tsx`):**
   - `cache-slot.js:715` checks `typeof revalidate === "number" && revalidate < 1`, treating `revalidate={false}` as permanent cache (verify it truly never expires and still responds to `revalidateTag()` / `refreshSlot({ fresh: true })`), and verify `revalidate={0.5}` / `revalidate={-1}` never divide/cache unexpectedly.
   - Verify a `<DinouCacheSlot>` rendered inside **`not_found.tsx`** or **`error.tsx`** renders cleanly, supports `refreshSlot()` / `revalidateTag()`, and does **not** leak its `slotTags` into healthy `200` sibling pages or corrupt `metadata.json`!
4. **`React.cache()` Request-Scoped Memoization Across 3D Cube Boundaries:**
   - React 19 apps rely heavily on `import { cache } from "react"` (`const getViewer = cache(async () => ...)`).
   - Verify that within a single dynamic/PPR request:
     - Two sibling PPR dynamic holes (in BOTH **Asymmetric Step 4** and **Pure PPR `handlePprResume`**) and `Dynamic L2` calling `getViewer()` deduplicate cleanly within the request (or document/fix any boundary gap where `streamDynamicHoles` breaks React's per-render cache scope), AND
     - Two **concurrent requests** (Request A for `tenant=alice`, Request B for `tenant=bob`) have **100% isolated** `React.cache()` scopes with zero cross-tenant leakage — including when a `<DinouCacheSlot>` executes alongside them!

### Proposed Fixtures & Tests (`tests/unit/cache-3d-cube-phase8.test.mjs` Test 4 + Playwright E2E)
- **Unit & Multi-Runtime Harness (`tests/unit/cache-3d-cube-phase8.test.mjs` Test 4):**
  - Simulated Cloudflare Workers (`navigator.userAgent = "Cloudflare-Workers"` + `CloudflareKVStorage` + `ctx.waitUntil`) firing 10-way `Promise.all([revalidateLayout, revalidatePage, revalidateTag])` bursts over a 3-layer PPR + Slot hierarchy -> assert monotonic consistency, zero `#418`-inducing `layout`/`page` version skew, and zero lost updates!
  - Two distinct `<DinouCacheSlot>`s (`slot-a` `revalidate={3600}` and `slot-b` `revalidate={1}`) sharing `tag="multi-shared"` -> verify `slot-b` TTL expiry is NEVER masked by `slot-a` in `inspectSlotsFreshness()`, and `refreshSlot("multi-shared")` + `revalidateTag("multi-shared")` update BOTH!
  - `<DinouCacheSlot revalidate={false}>` permanence + on-demand `revalidateTag`, `<DinouCacheSlot>` inside `not_found.tsx` & `error.tsx`, and concurrent multi-tenant `React.cache()` probe across `Dynamic L2`, two PPR dynamic holes, and `<DinouCacheSlot>`.
- **Playwright E2E (`e2e/example.spec.ts`):**
  - Verifies `<DinouCacheSlot>` with `revalidate={false}`, dual-slot `refreshSlot("shared-tag", { fresh: true })` updating both mounted slots simultaneously, `<DinouCacheSlot>` inside `not_found.tsx`, and `React.cache()` request isolation in live Chromium/Firefox/WebKit.

### Potential Dinou Core Risk Areas
- `dinou/core/cache-revalidate.js:92–103, 741–766, 2247–2261` — Cloudflare Workers concurrent cross-primitive revalidation timestamp & artifact ordering.
- `dinou/core/cache-slot.js:1099–1148, 1553–1615` — `resolveCanonicalSlotId` returning only the first matching slot for a shared tag; ensure `inspectSlotsFreshness` resolves **all** matching slot IDs when given a shared tag.
- `dinou/core/ppr-runtime.js:768–838` & `dinou/core/get-jsx.js` — verify `React.cache()` scope consistency across `Dynamic L2` and `streamDynamicHoles` and zero leakage across concurrent requests.

---

## Recommended Execution Order

When ready to execute Phase 8 (strictly via **TDD: RED → GREEN**, one stage at a time, with `y-changelog-cube-phase8.md` maintained in parallel):
1. **Stage 1 (`#87` — Client Router Cache Coherence Across `revalidate*()`, `<Link prefetch>`, `redirect()` & PPR/Dynamic Re-Visits)** — highest real-world user impact; confirmed stale-cache bugs in `client.jsx`, `client-webpack.jsx`, and `server-function-proxy*.js`.
2. **Stage 2 (`#88` — Unicode, Spaces & Percent-Encoded Dynamic Parameters)** — confirmed encoding-drift bugs in `handler.js:2023` (`/____rsc_page____`) and `cache-revalidate.js:464–470` (`normalizeRevalidatePath()`).
3. **Stage 3 (`#89` — HTTP `HEAD` Semantics & Custom Headers in 3D Cube)** — closes RFC 9110 `HEAD` handling and CDN/proxy header contracts across all 3D caching modes.
4. **Stage 4 (`#90` — Cross-Primitive Edge Races, Multi-Slot Tag Resolution, Slot Edge Placements & `React.cache()`)** — seals the final subtle concurrency, slot-placement, and React 19 `cache()` interactions before moving cleanly to Series Z (`z-phase1-tests.md`).
