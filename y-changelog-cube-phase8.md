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

---

## Tracking Log by Stage

| # | Stage / Check | Bug Summary | Core Files Modified | Commit |
| :-: | --- | --- | --- | --- |
| 1 | Phase 8 — Stage 1 (`#87` Client Router Cache Coherence) | Server Functions invoking `revalidatePage`/`revalidateLayout`/`revalidatePath`/`revalidateTag` never invalidated client `pageCache`/`layoutCache` (leaving visited or `<Link prefetch>` routes stale); `executeRedirect()` omitted `{ fresh: true }`; forward re-visits (`A → B → A`) to PPR dynamic-hole and `revalidate = 0` routes served frozen promises from `pageCache` | `cache-revalidate.js`, `handler.js`, `ppr-runtime.js`, `server-function-proxy.js`, `server-function-proxy-webpack.js`, `client.jsx`, `client-webpack.jsx` | *(uncommitted)* |
