# Changelog — Dinou `10.0.7` (Phase 8 — 3D Caching Cube Final Seal)

All notable core bug fixes uncovered and resolved during Phase 8 (`y-phase8-cube-tests.md`, Checks `#87–#90`) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [10.0.7] - Unreleased

### Fixed

#### Client Router Cache Coherence (`pageCache` / `layoutCache`) Across `revalidate*()` Server Functions, `<Link prefetch>`, `redirect()` & PPR / Dynamic Re-Visits (`Check #87`)
- **Fixed stale client `pageCache` / `layoutCache` hits after Server Function revalidations, prefetches, redirects, and PPR/dynamic route re-visits across Esbuild, Rollup & Webpack** (`dinou/core/cache-revalidate.js`, `dinou/core/handler.js`, `dinou/core/ppr-runtime.js`, `dinou/core/server-function-proxy.js`, `dinou/core/server-function-proxy-webpack.js`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`):
  - **Server-to-client revalidation hint propagation (`cache-revalidate.js`, `handler.js`, `server-function-proxy.js`, `server-function-proxy-webpack.js`)**: Server Functions calling `revalidatePage()`, `revalidateLayout()`, `revalidatePath()`, or `revalidateTag()` previously never notified the browser router to purge stale entries from `pageCache` or `layoutCache`, causing subsequent `<Link>` navigations (including previously hovered `<Link prefetch>` entries) and Server Function `redirect()`s to render stale V1 payloads.
    - Added `recordClientRevalidationHint()` in `cache-revalidate.js` (captured synchronously on the caller's Server Function context before `enqueueRevalidation()`), serialized by `handler.js` into an `X-Dinou-Revalidated` response header (or `D:{"type":"revalidate",...}` hybrid-stream command when headers were already flushed) on both normal returns and `dinou-internal-redirect` responses.
    - Updated `server-function-proxy.js` and `server-function-proxy-webpack.js` to apply `X-Dinou-Revalidated` / `D:{"type":"revalidate"}` hints via `window.__DINOU_INVALIDATE_CLIENT_CACHE__()` before redirect or return, and updated `executeRedirect()` to navigate with `{ fresh: true }`.
  - **Targeted client router cache invalidation & volatile PPR/dynamic re-visit freshness (`client.jsx`, `client-webpack.jsx`, `handler.js`, `ppr-runtime.js`)**:
    - Exposed `window.__DINOU_INVALIDATE_CLIENT_CACHE__()` in both `client.jsx` and `client-webpack.jsx` to surgically evict matching `pageCache` entries and matching/descendant `layoutCache` entries without disturbing untouched mounted layouts.
    - Emitted `X-Dinou-Cache-Mode: static | ppr | dynamic` on `/____rsc_page____` & `/____rsc_layout____` responses (and embedded `window.__DINOU_PAGE_CACHE_MODE__` on initial inline-RSC SSR in `handler.js` and `ppr-runtime.js`, with `dynamicState.value` taking precedence over inherited layout `ppr = true`).
    - Tracked `volatilePageCacheKeys` and `volatileLayoutCacheKeys` in `client.jsx` and `client-webpack.jsx`: forward navigations (`<Link>`, `router.push()`, `router.replace()`) to `ppr` or `dynamic` routes automatically bypass stale client promises so PPR dynamic holes and `revalidate = 0` routes re-evaluate fresh on `A → B → A` re-visits, while static routes keep instant `pageCache`/`prefetch` reuse and `Back`/`Forward` (`popstate`) remains intact.

#### Unicode, Spaces & Percent-Encoded Dynamic Parameters Across 3D Cube SSG/ISG, RSC Endpoints, `<DinouCacheSlot>` & `revalidate*()` (`Check #88`)
- **Fixed percent-encoding key drift, ByteString HTTP header crashes on non-Latin-1 Unicode, and encoded path-traversal safety across SSR, RSC endpoints, `<DinouCacheSlot>`, `revalidate*()`, and client cache matching** (`dinou/core/handler.js`, `dinou/core/cache-revalidate.js`, `dinou/core/cache-slot.js`, `dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`):
  - **Direct SSR & `/____rsc_page____` canonical per-segment decoding (`handler.js`)**: Direct SSR previously used raw percent-encoded `url.pathname` segments (`caf%C3%A9`, `cr%C3%A8me%20br%C3%BBl%C3%A9e`), and `/____rsc_page____` skipped `decodeURIComponent` when `!isLayoutReq`, missing pre-rendered SSG artifacts (written with decoded paths) and spawning duplicate percent-encoded shadow folders in `.dinou/dist2` / KV. Added `decodePathSegmentsSafely()` (decoding per segment while rejecting `%2e%2e`, `.`, `%2f`, `%5c`, `\0`, and malformed `%XX` with `400 Bad Request`) across Direct SSR, `/____rsc_page____`, `/____rsc_layout____`, and `/____rsc_slot____`.
  - **Unicode & space `<DinouCacheSlot>` IDs and ByteString-safe HTTP headers (`handler.js`, `cache-slot.js`, `client.jsx`, `client-webpack.jsx`)**:
    - Updated `fetchSlotRSC()` in `client.jsx` and `client-webpack.jsx` to `encodeURIComponent(slotId)` in `/____rsc_slot____/:id` requests, and updated `handler.js` to decode `slotId` and `x-dinou-current-path` (plus `cache-slot.js` `normalizeSlotRouteKey()` and `cleanRouteKey`).
    - Fixed `TypeError: Cannot convert argument to a ByteString` crashes on non-Latin-1 Unicode routes/slots (e.g. CJK `東京`) by ASCII-escaping `X-Dinou-Revalidated` via `toAsciiHeaderJson()` and percent-encoding `X-Dinou-Slot`.
  - **Revalidation & client cache matching parity (`cache-revalidate.js`, `client.jsx`, `client-webpack.jsx`)**:
    - Updated `normalizeRevalidatePath()` in `cache-revalidate.js` to safely decode per-segment percent-encoding (making encoded paths, decoded paths, trailing slashes, and relative `revalidatePage("./")` / `revalidateLayout("..")` via browser-encoded `x-dinou-current-path` / `Referer` all resolve to the exact same canonical storage key).
    - Updated `normalizeCachePathname()` in `client.jsx` and `client-webpack.jsx` to decode segments so percent-encoded `pageCache`/`layoutCache` keys match decoded `X-Dinou-Revalidated` invalidation hints.

#### HTTP `HEAD` Method Semantics (RFC 9110) & Custom HTTP Headers (`Cache-Control`, `Vary`, `X-*`) Preservation Across 3D Cube (`Check #89`)
- **Fixed RFC 9110 `HEAD` body/side-effect compliance and custom `plugin.onRequest` / route header preservation across Static, Pure PPR, Asymmetric 3D PPR, Dynamic, Cold ISG, Tombstoned (`404`/`410`/`302`), and RSC endpoints** (`dinou/core/handler.js`, `dinou/core/ppr-runtime.js`, `dinou/core/http-adapter.js`):
  - **Universal RFC 9110 `HEAD` finalization & read-only cache hygiene (`handler.js`)**:
    - Added `finalizeHeadResponse()` wrapping `handleRequest()` so every `HEAD` exit path (Static, PPR, Dynamic, Tombstoned `404`/`410`/`302`, `/____rsc_page____`, `/____rsc_layout____`, `/____rsc_slot____`, plugin direct `Response`, and error responses) returns strictly `body: null` (`0` bytes) while preserving exact HTTP status, `statusText`, and all headers.
    - Guarded warm static cache hits, cold PPR shell pre-generation, `canUseInFlight`, `shouldCacheISG`, background SWR/slot-SWR triggers, and inline RSC wrapping with `isHeadRequest` so `HEAD` probes never mutate/pollute ISG disk/KV caches, never share `inFlightGenerations` keys with `GET`, and never spawn redundant `TransformStream` pumps (while applying `applyStreamingResponseHeaders(bridge.headers)` on streaming Step 4 routes so `HEAD` headers match `GET` byte-for-byte, and canceling `result.stream` cleanly without unhandled rejections).
  - **Zero-hole-execution `HEAD` short-circuit in Pure PPR (`ppr-runtime.js`)**:
    - Extracted shared `buildPprResponseHeaders()` inside `handlePprResume()` and added an early `HEAD` return before `TransformStream` / `streamDynamicHoles()`, guaranteeing warm Pure PPR `HEAD` requests return matching status and headers (including custom `plugin.onRequest` `Cache-Control` + `, no-transform`) with an empty body and **zero** unnecessary dynamic PPR hole executions.
  - **Custom `plugin.onRequest` header preservation (`handler.js`)**:
    - Fixed cold PPR `ssgRes` redirects (`handler.js`) to merge `bridge.headers` and `bridge.cookies` via `finalizePluginResponse(ssgRes, bridge, request, false)` instead of returning the bare internal SSG response without plugin headers.
    - Fixed `isPathBlocked` `404` responses on RSC endpoints to respond through `bridge.status(404).send("Not Found")` instead of dropping `bridge.headers` with a bare `new Response(...)`.
  - **Node HTTP adapter `HEAD` stream cancellation (`http-adapter.js`)**:
    - Updated `sendWebResponseToNode()` to detect `res.req?.method === "HEAD"`, cancel any attached `webResponse.body` stream cleanly, and call `res.end()` immediately without piping bytes or stalling keep-alive sockets.

---

## Tracking Log by Stage

| # | Stage / Check | Bug Summary | Core Files Modified | Commit |
| :-: | --- | --- | --- | --- |
| 1 | Phase 8 — Stage 1 (`#87` Client Router Cache Coherence) | Server Functions invoking `revalidatePage`/`revalidateLayout`/`revalidatePath`/`revalidateTag` never invalidated client `pageCache`/`layoutCache` (leaving visited or `<Link prefetch>` routes stale); `executeRedirect()` omitted `{ fresh: true }`; forward re-visits (`A → B → A`) to PPR dynamic-hole and `revalidate = 0` routes served frozen promises from `pageCache` | `cache-revalidate.js`, `handler.js`, `ppr-runtime.js`, `server-function-proxy.js`, `server-function-proxy-webpack.js`, `client.jsx`, `client-webpack.jsx` | *(committed)* |
| 2 | Phase 8 — Stage 2 (`#88` Unicode, Spaces & Percent-Encoded Dynamic Parameters) | Direct SSR and `/____rsc_page____` kept `%XX`-encoded path segments (missing SSG artifacts & creating duplicate shadow folders); `/____rsc_slot____` never decoded `slotId`/`currentPath`; `normalizeRevalidatePath()` never decoded `%XX` (breaking relative `./`/`..` revalidation on encoded URLs); non-Latin-1 Unicode (`東京`) crashed `X-Dinou-Slot` & `X-Dinou-Revalidated` headers with `ByteString` `TypeError`; `normalizeCachePathname()` mismatched encoded browser URLs against decoded invalidation hints | `handler.js`, `cache-revalidate.js`, `cache-slot.js`, `client.jsx`, `client-webpack.jsx` | *(uncommitted)* |
| 3 | Phase 8 — Stage 3 (`#89` HTTP `HEAD` Semantics & Custom Headers) | `handler.js` had zero `HEAD` handling (emitting full HTML/RSC/plugin bodies, executing Pure PPR dynamic holes in `handlePprResume`, triggering cold ISG/SSG cache writes and SWR background revalidations on read-only `HEAD` probes); cold PPR `ssgRes` redirects and blocked-path RSC `404`s dropped `plugin.onRequest` custom headers; `sendWebResponseToNode()` did not short-circuit/cancel body streams on `HEAD` | `handler.js`, `ppr-runtime.js`, `http-adapter.js` | *(uncommitted)* |
