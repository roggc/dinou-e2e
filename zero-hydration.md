# Zero Hydration Mismatch & Inline RSC Streaming Architecture (`da4844f` → Current)

## 1. Executive Summary & Architectural Motivation

Prior to these changes (at commit `da4844f`), Dinou's initial page load lifecycle on dynamic routes, Partial Prerendering (PPR) routes, and Incremental Static Generation (ISG) cache misses operated via a **multi-request hydration model**:

1. **Request 1 (`GET /route`)**: The server executed `getJSX()` to evaluate all Server Components (Layouts, Pages, `@slots`, `getProps`), serialized the resulting tree into a Flight RSC stream, passed it to Pass B (`renderHtmlStream` in `edge-ssr.js`) to produce the initial HTML document, and **discarded the Flight RSC payload** once HTML streaming finished.
2. **Requests 2 & 3 (`GET /____rsc_layout____/...` and `GET /____rsc_page____/...`)**: As soon as the browser loaded `main.js`, `client.jsx` (and `client-webpack.jsx`) launched separate HTTP `fetch()` requests back to the server to obtain the Flight RSC streams required by `createFromFetch()` so `hydrateRoot()` could hydrate the DOM.

### Why the Multi-Request Model Caused Hydration Mismatches (`React Error #418`) and Overhead

- **Non-Deterministic Double Execution**: Because Request 1 (SSR HTML) and Requests 2/3 (client hydration RSC fetches) executed `getJSX()` in separate HTTP requests milliseconds apart, any non-deterministic data produced on the server (`Date.now()`, timestamps, random IDs, live database counters, or per-request headers/cookies) differed between the SSR HTML and the RSC payload consumed by `hydrateRoot()`, triggering **React Hydration Error `#418`**.
- **Duplicate Server Compute & Network Round-Trips**: Every dynamic page load executed Server Components, `getProps`, and `@slots` twice (once for HTML SSR, once for `/____rsc_layout____` + `/____rsc_page____`), doubling server CPU/DB load and delaying client hydration by a full network round-trip.
- **Additional Edge-Case Mismatches in Static/ISG, Streaming & Error Boundaries**:
  - Newly generated ISG pages composed `index.html` from a freshly rendered layout tree while serving an older pre-cached `layout.rsc` on `/____rsc_layout_static____`.
  - Child routes opting out of PPR (`export const ppr = false`) inside a `ppr = true` parent layout pre-rendered `index.html` with the layout's holes statically resolved, while `/____rsc_layout_static____` saw `holes` in `layout.metadata.json` and executed `spliceDynamicHolesIntoShell` live on `shell.layout.json`.
  - During dynamic HTML streaming (`createInlineRscHtmlStream`), `renderToReadableStream` flushes HTML in 4096-byte chunks that can split an HTML comment (`<!` + `-- -->`) or tag across two chunks; flushing inline `<script>` RSC pushes between those chunks corrupted the HTML comment into visible DOM text.
  - Background ISR revalidation flipping `dynamicState.value = true` caused `/____rsc_page_static____` to bypass `page.rsc` and re-execute dynamically while the browser was hydrating a static `index.html` shell.
  - `@slot` error boundaries sanitized `error.message` in `getErrorJSX` (SSR HTML) differently than in `getJSX` (`/____rsc_layout____`).
  - Client Components calling `useSearchParams()` on a statically pre-rendered page (`__DINOU_USE_STATIC__ = true`) read `window.location.search` during initial hydration while the build-time HTML was rendered with an empty query string.

---

## 2. High-Level Overview of Changes (`git diff --stat da4844f -- dinou/`)

| File | Lines Changed | Primary Responsibility in This Architecture |
| :--- | :---: | :--- |
| `dinou/core/render-jsx-to-client-jsx.js` | `+21 / -4` | Captures resolved page JSX on all renders (`ctx._resolvedPageClientJsx`), caches deferred `<Suspense>` hole boundary promises (`WeakMap`), and guards `replaceLayoutChildrenPlaceholder` against Client Reference proxies and thenables. |
| `dinou/core/get-jsx.js` | `+74 / -30` | Evaluates the layout chain and page once during a full render (`!options?.segment`) and simultaneously produces the combined SSR JSX tree and isolated `_resolvedLayoutClientJsx` (with `<DinouPageSlot />`) and `_resolvedPageClientJsx` trees. |
| `dinou/core/handler.js` | `+517 / -43` | Multiplexes inline RSC `<script>` chunks (`__DINOU_RSC_L__`, `__DINOU_RSC_P__`) into the initial HTML stream at safe `</script>` boundaries (`createInlineRscHtmlStream`), injects inline RSC on first ISG misses/bailouts, composes non-PPR static `index.html` from cached `layout.rsc` (or `layout.static.rsc` when parent layout has PPR holes) + `page.rsc`, and preserves static `layout.rsc`/`page.rsc` delivery when `internalBuildId` is present. |
| `dinou/core/ppr-runtime.js` | `+244 / -88` | Captures resolved dynamic holes during `handlePprResume`, splices them into cached `shell.layout.json` and `shell.page.json` via `replaceHolesWithMap`, and emits inline RSC `<script>` payloads at the end of the PPR resume HTML stream. |
| `dinou/core/client.jsx` | `+97 / -20` | Implements `consumeInlineRscResponse(kind)` to convert inline `window.__DINOU_RSC_L__` and `window.__DINOU_RSC_P__` chunks/streams into a Web `Response` for `createFromFetch()` during initial hydration (`isInitialHydration && !version`), eliminating network fetches on initial load. |
| `dinou/core/client-webpack.jsx` | `+97 / -20` | Mirrors the exact `consumeInlineRscResponse(kind)` inline RSC stream consumption for the Webpack client entry. |
| `dinou/core/cache-revalidate.js` | `+64 / -3` | Defers persisting `shell.page.json` (`pendingShellPageJson`) until after `renderHtmlStream` finishes, rotates/invalidates `layout.static.rsc` on `revalidateLayout`, and uses `layout.static.rsc` when revalidating a `ppr = false` child page inside a `ppr = true` layout. |
| `dinou/core/get-error-jsx.js` | `+1 / -3` | Aligns `@slot` error boundary `serializedError.message` in `getErrorJSX` with `getJSX` so SSR HTML and client hydration render identical slot error messages. |
| `dinou/core/navigation.js` | `+20 / -0` | Prevents hydration mismatch (`#418`) when `useSearchParams()` is used on a statically pre-rendered page (`__DINOU_USE_STATIC__`) loaded with URL query parameters by returning an empty `URLSearchParams` during the initial hydration pass and syncing on `useEffect`. |

---

## 3. Detailed File-by-File Analysis & Justification

### 3.1. `dinou/core/render-jsx-to-client-jsx.js`

#### What Changed
1. **Unconditional capture of `ctx._resolvedPageClientJsx`**:
   ```js
   // Before (da4844f):
   if (ctx && getPprStore()) {
     ctx._resolvedPageClientJsx = resolved;
   }

   // After:
   if (ctx) {
     ctx._resolvedPageClientJsx = resolved;
   }
   ```
2. **Memoization of `DinouSuspenseHoleBoundary` via `WeakMap` and `$$dinouDeferredSuspenseStream`**:
   ```js
   const holeBoundaryPromiseCache = new WeakMap();
   async function DinouSuspenseHoleBoundary(props) {
     if (props && typeof props === "object" && holeBoundaryPromiseCache.has(props)) {
       return await holeBoundaryPromiseCache.get(props);
     }
     const { holeId, children } = props || {};
     const promise = runInRuntimeDynamicHole(
       () => asyncRenderJSXToClientJSX(children),
       holeId
     );
     if (props && typeof props === "object") {
       holeBoundaryPromiseCache.set(props, promise);
     }
     return await promise;
   }
   DinouSuspenseHoleBoundary.$$dinouDeferredSuspenseStream = true;
   ```
3. **Guards in `replaceLayoutChildrenPlaceholder`**:
   Added `isThenable(node) || node.$$typeof === CLIENT_REFERENCE_TAG || isClientComponent(node)` to the early-return guard before `Object.entries(node)` cloning.

#### Why It Was Changed
- **Single-Pass Segment Extraction**: Previously, `ctx._resolvedPageClientJsx` was only saved during PPR builds (`getPprStore()`). To emit the isolated page RSC stream inline alongside SSR HTML on normal dynamic routes, `handler.js` needs `ctx._resolvedPageClientJsx` on every request.
- **Deduplicating Deferred `<Suspense>` Execution Across Dual Streams**: When a dynamic route contains a `<Suspense>` boundary, `asyncRenderJSXToClientJSX` wraps its children in `<DinouSuspenseHoleBoundary>` so `renderRSCStream` can stream the boundary progressively. With Inline RSC enabled, `renderRSCStream` is called on **both** the combined SSR tree (`streamForSsr`) and the isolated segment tree (`context._resolvedLayoutClientJsx` or `context._resolvedPageClientJsx`). Without `holeBoundaryPromiseCache`, `DinouSuspenseHoleBoundary` would execute the async children twice—producing two different timestamps/values and causing a hydration mismatch once the `<Suspense>` boundary resolves! Memoizing the promise per `props` object in a `WeakMap` guarantees that both RSC streams await the exact same promise execution and serialize identical resolved trees.
- **Proxy Trap Safety**: In `replaceLayoutChildrenPlaceholder`, traversing into a Client Reference Proxy (`Symbol.for("react.client.reference")`) or custom thenable via `Object.entries(node)` or `{ ...node }` could trigger Proxy traps or corrupt thenable references passed to Client Components.

---

### 3.2. `dinou/core/get-jsx.js`

#### What Changed
1. **Extracted `createDinouPageSlotElement()` helper**:
   Centralizes the creation and `registerClientReference` registration of `<DinouPageSlot />` (`slot.js#DinouPageSlot`).
2. **Simultaneous assembly of `jsx` (full tree) and `layoutOnlyJsx` (isolated layout tree)**:
   During a full route render (`!options?.segment`), `getJSX` initializes:
   ```js
   let layoutOnlyJsx = !options?.segment && layouts.length > 0 ? createDinouPageSlotElement() : null;
   ```
   As each layout in `layouts.reverse()` is resolved once into `resolvedLayout` (with a `placeholder` for `children`), `replaceLayoutChildrenPlaceholder` is called twice on that already-evaluated `resolvedLayout`:
   ```js
   jsx = replaceLayoutChildrenPlaceholder(resolvedLayout, jsx, placeholder);
   if (layoutOnlyJsx && !layoutRenderFailed) {
     layoutOnlyJsx = replaceLayoutChildrenPlaceholder(resolvedLayout, layoutOnlyJsx, placeholder);
   }
   ```
3. **Storing `_resolvedLayoutClientJsx`, `_resolvedPageClientJsx`, and `_hasResolvedSegments` on `ctx`**:
   At the end of `getJSX` (including early-return paths for `no_layout` or empty layout arrays), `ctx._resolvedLayoutClientJsx`, `ctx._resolvedPageClientJsx`, and `ctx._hasResolvedSegments` are populated.

#### Why It Was Changed
- **Zero Double Execution of Layouts and Pages**: On the client, `hydrateRoot` renders `<RootLayoutTree>` (hydrated from the layout Flight stream, which contains `<DinouPageSlot />` at the leaf) and `<PageSlot>` (which calls `use(pagePayload)` from the page Flight stream). On the server, Pass B (`renderHtmlStream`) requires a single unified Flight stream where the page is already spliced inside the layout.
- By resolving each `Layout` and `@slot` **once** into `resolvedLayout` and then substituting `jsx` (for SSR) and `layoutOnlyJsx` (which holds `<DinouPageSlot />` at its leaf) into the same `resolvedLayout` object graph, Dinou obtains **both** the unified SSR tree and the segmented layout/page trees from a single execution of user code. Every timestamp, random value, database query, or `DinouCacheSlot` inside the layout, `@slots`, and page is guaranteed to be 100% identical between SSR HTML and client hydration.

---

### 3.3. `dinou/core/handler.js`

#### What Changed
1. **Inline RSC Script Serialization & Multiplexed HTML Stream (`createInlineRscHtmlStream` & `injectInlineRscIntoHtmlString`)**:
   - Added `safeJsonForInlineScript`, `formatRscPushScript(kind, chunkStr)`, and `formatRscDoneScript(kind)`:
     ```html
     <script>(self.__DINOU_RSC_P__=self.__DINOU_RSC_P__||[]).push("...");if(self.__DINOU_RSC_P_PUSH__)self.__DINOU_RSC_P_PUSH__("...");</script>
     <script>self.__DINOU_RSC_P_DONE__=true;if(self.__DINOU_RSC_P_CLOSE__)self.__DINOU_RSC_P_CLOSE__();</script>
     ```
   - Added `createInlineRscHtmlStream(htmlStream, context, clientManifest)`:
     - Starts background readers (`startPump`) on `renderRSCStream(context._resolvedLayoutClientJsx)` (`"L"`) and `renderRSCStream(context._resolvedPageClientJsx)` (`"P"`).
     - Reads the SSR `htmlStream` chunk by chunk into `htmlBuffer`, holding back the trailing `</body></html>` close tags (`heldBodyClose`) until both RSC pumps complete.
     - Right before the complete client entry `<script src="/main.js"></script>` tag (waiting up to `15ms` for the first synchronous RSC chunks to be ready), splices any already-available RSC `<script>` chunks directly before `main.js` so they are already in `window.__DINOU_RSC_L__` / `window.__DINOU_RSC_P__` before `main.js` even executes.
     - After `initialSpliceDone`, flushes `htmlBuffer` **only up to the last complete `</script>` boundary** (`lastIndexOf("</script>") + 9`), and `onRscScript` only calls `flushPendingScripts()` when `initialSpliceDone && htmlBuffer.length === 0`. This guarantees that an inline `<script>` tag is never injected in the middle of a 4096-byte split HTML comment (such as `<!` + `-- -->`) or DOM node.
     - As slower `<Suspense>` chunks resolve in the RSC streams, flushes `<script>` push tags progressively into the open HTML stream before finally emitting `</body></html>`.
2. **Inline RSC Injection on First ISG Render & Dynamic Bailout (`injectInlineRscIntoHtmlString`)**:
   - When a route is rendered on-demand in production (`shouldCacheISG` or when a route starts as static/ISG and bails out dynamically mid-render via `dynamicState.value = true`), the cached `index.html` saved to storage stays clean for future static hits, while the live HTTP response returned to the current visitor has the inline RSC scripts injected via `injectInlineRscIntoHtmlString`.
3. **Deterministic Static/ISG `index.html` Composition from Cached `layout.rsc` / `layout.static.rsc` + `page.rsc`**:
   - When generating or caching a non-PPR static/ISG page (`shouldCacheISG && !isPprConfig`), `handler.js` pre-computes `precomputedPageRscText` from `context._resolvedPageClientJsx`.
   - If the leaf layout has no PPR holes (`!layoutHasPprHoles`), it reads the cached `layout.rsc`.
   - If the leaf layout has PPR holes (`layoutHasPprHoles` is `true`, i.e., a child page with `export const ppr = false` inside a parent layout with `export const ppr = true`), it reads or generates `layout.static.rsc` from `context._resolvedLayoutClientJsx` (where all layout holes are statically resolved) and serves `layout.static.rsc` on `/____rsc_layout_static____`.
   - `platformContext.renderHtmlStream` then renders `index.html` by combining `toStream(precomputedLayoutRscText)` and `pageRscStream: toStream(precomputedPageRscText)`.
4. **Preserving Static `layout.rsc` / `page.rsc` Delivery When `internalBuildId` Is Present**:
   - In `/____rsc_layout_static____` and `/____rsc_page_static____` (`canServeCachedRsc`), updated `!dynamicState.value` to `(!dynamicState.value || (isStatic && Boolean(internalBuildId)))`, and added a Node filesystem fallback from `_old.rsc` to the current `.rsc` file when `_old.rsc` has not been created yet.

#### Why It Was Changed
- **Eliminating the Hydration Round-Trip on Dynamic Routes**: With `createInlineRscHtmlStream`, `GET /route` streams both the visible HTML and the segmented Flight payloads (`L` and `P`) in a single HTTP response.
- **Preventing Timestamp Mismatch on First ISG Miss, Revalidation Cascade & Child `ppr = false` Opt-Out**:
  - On the very first request to an uncached ISG route (or when `revalidatePath` lazily recomposes a child route's `index.html`), the layout's `layout.rsc` was already generated earlier (at build time or parent revalidation time). If `index.html` were rendered using a newly evaluated layout instance, `index.html` would contain a newer layout timestamp than the cached `layout.rsc` fetched by `/____rsc_layout_static____` on hydration, causing React Error `#418` (e.g. in `/t-revalidate-cascade/child`). Rendering `index.html` from the leaf layout's cached `layout.rsc` + `precomputedPageRscText` guarantees that `index.html`, `layout.rsc`, and `page.rsc` are 100% consistent.
  - Conversely, if a parent layout has `export const ppr = true` (contains PPR holes in `layout.metadata.json`) while a child page opts out with `export const ppr = false` (e.g. `/t-new-ppr/opt-out-route`), `layoutHasPprHoles` is `true`. Persisting `layout.static.rsc` (where all layout holes are statically resolved) and serving `layout.static.rsc` on `/____rsc_layout_static____` prevents `/____rsc_layout_static____` from running `spliceDynamicHolesIntoShell` live on `shell.layout.json` and producing a different timestamp/counter than the static `index.html`.
- **Preventing Race Conditions During Background ISR Bailout (`/t-hybrid`)**:
  - When a static/ISR route is reloaded while a background revalidation is in progress (`internalBuildId` is present on `/____rsc_page_static____?____build_id____=...`), if a concurrent request triggers a dynamic bailout (`dynamicState.value = true`), a client that already received the static `index.html` (`window.__DINOU_USE_STATIC__ = true`) must still receive the matching cached `page.rsc` for its build ID rather than a freshly executed dynamic RSC payload that disagrees with the static HTML shell.

---

### 3.4. `dinou/core/ppr-runtime.js`

#### What Changed
1. **Added `readShellJsonFromStorage` and `replaceHolesWithMap(node, liveHolesMap)`**:
   - Reads the serialized static shell ASTs (`shell.page.json` and `shell.layout.json`) from storage, disk (`.dinou/dist2`), or Cloudflare `env.ASSETS`.
   - Replaces `<div data-ppr-hole="ppr-hole-N">` placeholders in those deserialized shell ASTs with the live resolved `<Suspense>` subtrees captured during `streamDynamicHoles`.
2. **Captured Resolved Dynamic Holes in `streamDynamicHoles` (`resolvedHolesOut`)**:
   - As each dynamic hole (`ppr-hole-N`) resolves its children via `asyncRenderJSXToClientJSX(children)` to stream `<template id="ppr-content-...">`, it also records the resolved `<React.Suspense>` element in `resolvedHolesMap`.
3. **Emitted Inline RSC Scripts at the End of `handlePprResume`**:
   - Once all dynamic holes have streamed their HTML replacement `<template>`s (and if no hole threw an unhandled error), `handlePprResume` splices `resolvedHolesMap` into `cachedPageTree` and `cachedLayoutTree`, renders their Flight streams via `renderRSCStream`, and writes `window.__DINOU_INLINE_RSC__=true` along with `formatRscPushScript("L", ...)` and `formatRscPushScript("P", ...)` directly to the PPR HTML stream before `shellPostlude`.

#### Why It Was Changed
- **Single-Execution PPR Resume Without Extra RSC Fetches**:
  Previously, on a PPR route (`export const ppr = true`), `GET /route` executed `handlePprResume` to stream `<template id="ppr-content-...">` chunks into `shell.html`, **and** the browser simultaneously fired `GET /____rsc_layout____` and `GET /____rsc_page____`, which ran `handlePprRscRequest`—executing all dynamic holes a **second time**!
- Because the dynamic holes ran twice in parallel (once for the HTML `<template>` and once for `/____rsc_page____`), any dynamic timestamp or random value inside a PPR hole (or a `DinouCacheSlot` with `revalidate: 0` inside a hole) differed between the DOM `<template>` and the RSC stream, causing React Hydration Error `#418`.
- By capturing the exact `resolvedChildren` produced during `streamDynamicHoles`, splicing them into `shell.layout.json` and `shell.page.json`, and emitting the resulting RSC payloads inline in the same response stream, the dynamic holes execute **once** and the client hydrates with zero network fetches and zero hydration mismatches.

---

### 3.5. `dinou/core/client.jsx` & `dinou/core/client-webpack.jsx`

#### What Changed
1. **Added `consumeInlineRscResponse(kind)` (`"L"` for layout, `"P"` for page)**:
   - Checks `window.__DINOU_INLINE_RSC__` and ensures each inline stream (`__DINOU_RSC_L_CONSUMED__`, `__DINOU_RSC_P_CONSUMED__`) is only consumed once (during initial hydration).
   - Creates a `ReadableStream` that:
     1. Immediately enqueues any Flight chunks already pushed to `window.__DINOU_RSC_L__` / `window.__DINOU_RSC_P__`.
     2. If `window.__DINOU_RSC_L_DONE__` / `window.__DINOU_RSC_P_DONE__` is already `true`, closes the stream synchronously.
     3. Otherwise, registers live callbacks `window.__DINOU_RSC_L_PUSH__` / `window.__DINOU_RSC_L_CLOSE__` so subsequent `<script>` tags arriving over the streaming HTML connection push chunks directly into `createFromFetch()`'s reader in real time.
   - Wraps the `ReadableStream` in `new Response(stream, { status: 200, headers: { "Content-Type": "text/x-component" } })`.
2. **Integrated `consumeInlineRscResponse` into `getPagePayload` and `getLayoutPayload`**:
   ```js
   const inlineRes = isInitialHydration && !version ? consumeInlineRscResponse("P") : null;
   const fetchPromise = inlineRes ? Promise.resolve(inlineRes) : fetch(payloadUrl).then(...);
   ```

#### Why It Was Changed
- **Seamless Integration with React's `createFromFetch`**: By wrapping the inline `ReadableStream` in a standard `Response` object and passing `Promise.resolve(inlineRes)` to `createFromFetch()`, the rest of Dinou's client router (`pageCache`, `layoutCache`, `ServerFunction` `callServer` hooks, `<Suspense>` progressive hydration, and `isInitialHydration`) works identically without any special-casing.
- **Preserving SPA Navigations**: Because `consumeInlineRscResponse` is gated by `isInitialHydration && !version` and marks `__DINOU_RSC_${kind}_CONSUMED__ = true`, subsequent soft navigations (`<Link>`, `router.push`, `router.replace`, `router.refresh`, `popstate`) automatically fall back to network `fetch(payloadUrl)` requests against `/____rsc_layout____` and `/____rsc_page____`.

---

### 3.6. `dinou/core/cache-revalidate.js`

#### What Changed
- In `revalidatePage`:
  - Instead of writing `await storage.set(shellPageKey, serializeJSX(resolvedPageJsx))` immediately after `asyncRenderJSXToClientJSX` (before `renderHtmlStream`), the serialized JSON is held in `pendingShellPageJson` and persisted to `shellPageKey` (`shell.page.json`) at the end of `revalidatePage` alongside `shell.html`.
  - When revalidating a non-PPR child page (`!isRoutePpr`) inside a leaf layout that has PPR holes (`leafHoles.length > 0`), `revalidatePage` reads or generates `layout.static.rsc` rather than using the PPR shell `layout.rsc`.
- In `revalidateLayout`:
  - Rotates `layout.static.rsc` to `layout.static._old.rsc` and removes the stale `layout.static.rsc` so any subsequent child static page revalidation or request regenerates it with fresh layout data.

#### Why It Was Changed
- Ensures atomic cache updates during on-demand/background revalidation so a concurrent PPR resume request (`handlePprResume`) never reads a new `shell.page.json` paired with an old `shell.html` (or vice versa) while `renderHtmlStream` is still draining, and keeps `layout.static.rsc` synchronized when layouts are revalidated.

---

### 3.7. `dinou/core/get-error-jsx.js`

#### What Changed
```js
// Before (da4844f):
const serializedError = {
  message: isDevelopment
    ? (e.message || "Unknown Error")
    : "An error occurred in the Server Components render",
  name: e.name,
  stack: isDevelopment ? e.stack : undefined,
};

// After:
const serializedError = {
  message: e.message || "Unknown Error",
  name: e.name,
  stack: isDevelopment ? e.stack : undefined,
};
```

#### Why It Was Changed
- When a parallel `@slot` throws an error and is caught by its local `@slot/error.tsx` boundary, `getJSX.js` (line 318) passes `message: e.message || "Unknown Error"` to the slot's `ErrorComponent`. However, when the page *also* throws an error (such as in `/t-slots-error-error`), SSR falls back to `getErrorJSX.js`, which previously replaced the `@slot`'s `e.message` in production with the generic string `"An error occurred in the Server Components render"`. Meanwhile, `/____rsc_layout____` (rendered via `getJSX.js`) passed the actual `e.message` (`"Simulated failure in @sidebar slot"`), causing a React Hydration Error `#418` between the SSR HTML and the hydrated layout. Aligning `getErrorJSX.js` with `getJSX.js` for `@slot` error boundaries eliminates the mismatch.

---

### 3.8. `dinou/core/navigation.js`

#### What Changed
- In `useSearchParams()`, added an `isStaticHydrating` state initialized on the client when `Boolean(window.__DINOU_USE_STATIC__) && document.body?.getAttribute("data-hydrated") !== "true"`:
  ```js
  const [isStaticHydrating, setIsStaticHydrating] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.__DINOU_USE_STATIC__) &&
      document.body?.getAttribute("data-hydrated") !== "true"
  );

  useEffect(() => {
    if (isStaticHydrating) {
      setIsStaticHydrating(false);
    }
  }, [isStaticHydrating]);

  if (isStaticHydrating) {
    return new URLSearchParams();
  }
  ```

#### Why It Was Changed
- Static pages (`window.__DINOU_USE_STATIC__ === true`) are pre-rendered at build time (SSG) without query parameters (`req.query` is `{}`), so any Client Component calling `useSearchParams()` renders its initial build-time HTML with an empty `URLSearchParams`.
- When a user requests that static page in production with query parameters in the URL (e.g., `GET /t-params/t-spa-query?q=initial&filter=active`), the server serves the static `index.html` and static `page.rsc` (`__DINOU_USE_STATIC__ = true`). Previously, during the synchronous `hydrateRoot()` pass, `useSearchParams()` immediately read `window.location.search` (`?q=initial&filter=active`), producing `"initial"` on the client while the static DOM contained `"none"`, throwing React Hydration Error `#418`.
- By returning an empty `URLSearchParams()` during the initial hydration render pass on static pages (`isStaticHydrating === true`) and immediately flipping `setIsStaticHydrating(false)` in `useEffect` right after hydration completes, `hydrateRoot` matches the build-time HTML with **zero hydration errors**, and React immediately commits the live URL query parameters on the post-hydration effect pass.

---

## 4. Deep-Dive on the Two CI Edge Cases Resolved

### 4.1. Edge Case A: Child Route Opt-Out (`ppr = false`) Inside a `ppr = true` Layout (`/t-new-ppr/opt-out-route`)

#### Symptom in CI
- Failed with `Minified React error #418 (args[]=text)` in `e2e/example.spec.ts:7397:5` (`3. Zero-Hole PPR Route (/t-new-ppr/all-static) & Child Route Opt-Out ppr=false Inside ppr=true Layout (/t-new-ppr/opt-out-route)`) on `Ubuntu - Node AOT (-u Unvendorized) - esbuild` and `Windows - Node AOT - esbuild`, while passing in `Ubuntu - Node DEV - esbuild` and `Ubuntu - Node AOT - esbuild`.

#### Root Cause
1. `src/t-new-ppr/opt-out-route/page_functions.ts` exports `ppr = false`, whereas its parent layout `src/t-new-ppr/layout.tsx` has `export const ppr = true` and contains a dynamic hole (`LayoutLiveClock` with a `20ms` delay that renders `Render #{count} @ {new Date().toISOString()}` plus a header `PPR Test Suite Layout Shell (Render #{layoutShellCount})`).
2. In **DEV (`dev:esbuild`)**, `/t-new-ppr/opt-out-route` is rendered dynamically per request with Inline RSC (`window.__DINOU_INLINE_RSC__ = true`), so SSR HTML and client RSC payloads come from the same in-memory render pass (`0` mismatch).
3. In **AOT Production (`generate-static.js`)**, `/t-new-ppr/opt-out-route/index.html` is pre-rendered as a static page (`ppr = false`, `window.__DINOU_USE_STATIC__ = true`). Because `t-new-ppr/layout.metadata.json` had `holes: ["ppr-hole-2"]` (`layoutHasPprHoles === true`), Step 5 of SSG rendered `opt-out-route/index.html` from a newly evaluated full tree (`Render #5 @ <build_timestamp>`).
4. When the browser navigated to `/t-new-ppr/opt-out-route`, `client.jsx` requested `GET /____rsc_layout_static____/t-new-ppr?____build_id____=...`. Because `t-new-ppr/layout.metadata.json` contained `holes: ["ppr-hole-2"]`, `handler.js` set `isRoutePpr = true` even on `/____rsc_layout_static____` and ran `spliceDynamicHolesIntoShell` live on `shell.layout.json` (which had `Render #1` in the shell header and executed `LayoutLiveClock` live with a `20ms` delay, returning `Render #11 @ <new_timestamp>`), triggering React Error `#418`.
5. **Why it passed on fast runners (`Ubuntu - Node AOT - esbuild`) and failed on slower ones (`Windows` and `-u Unvendorized`)**:
   In `e2e/example.spec.ts` (lines 7478–7482), after `page.goto("/t-new-ppr/opt-out-route")` there were only 3 `toBeVisible()` assertions on elements already present in the static `index.html` without waiting for `body[data-hydrated="true"]`. Because `LayoutLiveClock` takes `20ms` to resolve `/____rsc_layout_static____/t-new-ppr`, on the fast Ubuntu runner those 3 assertions finished in `< 20ms` before `hydrateRoot` ran; on Windows and `-u` Unvendorized they took `> 20ms`, allowing `hydrateRoot` to run and throw `#418` before the test ended.

#### Fix
- When pre-rendering or caching a `ppr = false` static/ISG route whose leaf layout has PPR holes (`layoutHasPprHoles === true`), `handler.js` now serializes and persists `layout.static.rsc` from `context._resolvedLayoutClientJsx` (where layout holes are statically resolved) and composes `index.html` from `layout.static.rsc` + `page.rsc`.
- When `/____rsc_layout_static____` is requested for a layout that has `layout.static.rsc`, `handler.js` serves `layout.static.rsc` directly (`isRoutePpr = false`, `canServeCachedRsc = true`) instead of running `spliceDynamicHolesIntoShell` live.

---

### 4.2. Edge Case B: 4096-Byte HTML Chunk Boundary Corruption in `createInlineRscHtmlStream` (`/t-use-id` on Webpack)

#### Symptom in CI
- Failed with `Minified React error #418 (args[]=text)` in `e2e/example.spec.ts:7698:5` (`3. Browser Hydration, Zero Hydration Warnings, 24/24 Unique IDs & Interactive Slot + Router Refresh Stability (/t-use-id)`) in `Ubuntu - Cloudflare Worker - webpack` across Chromium, Firefox, and WebKit.

#### Root Cause
1. `/t-use-id` contains `<DinouCacheSlot id="useid-nocache-slot" revalidate={0}>` outside `<Suspense>`, so in production it streams dynamically via `createInlineRscHtmlStream` in `dinou/core/handler.js`.
2. `renderToReadableStream` (from `react-dom/server.edge`) flushes HTML in fixed **4096-byte `Uint8Array` chunks**.
3. In the **Webpack** build (where there is no `<script type="importmap">` in `<head>` and bundle filenames carry 20-character hashes such as `/main-34abcc6267d17271b8b6.js`), the exact byte offset caused **Chunk 4** (4096 bytes) of `htmlStream` to end literally in the middle of a React HTML comment inside `<div hidden id="S:2">`:
   - End of Chunk 4: `...8A. Sync Server Component with React.use(pendingPromise) + useId()<!`
   - Start of Chunk 5: `-- --> (resolved: <code>resolved-in-sync-server-comp</code>)</div>...`
4. Because `initialSpliceDone` was already `true` after Chunk 1, `onRscScript` / `flushPendingScripts()` enqueued `<script>(self.__DINOU_RSC_P__=...).push(...)</script>` **right between Chunk 4 (`<!`) and Chunk 5 (`-- -->`)**:
   ```html
   <!<script>(self.__DINOU_RSC_P__=self.__DINOU_RSC_P__||[]).push("...");</script>-- -->
   ```
   The browser's HTML parser interpreted `<!<script>...>` as a bogus comment and parsed `-- -->` as visible text inside `<div id="useid-sync-use-promise">`, causing React Hydration Error `#418 (args[]=text)` across all browsers.

#### Fix
- In `createInlineRscHtmlStream` (`dinou/core/handler.js`), incoming `htmlStream` chunks are now buffered in `htmlBuffer`:
  - Before `initialSpliceDone`, `htmlBuffer` waits until the complete bootstrap script tag `<script ... src="/(runtime|main)..."></script>` has arrived before splicing the initial RSC scripts.
  - After `initialSpliceDone`, `htmlBuffer` **only flushes HTML up to the end of the last complete `</script>` tag** (`lastIndexOf("</script>") + 9`), keeping any trailing partial HTML fragment (such as `<div hidden id="S:2">...<!`) in `htmlBuffer` until its closing `</script>` arrives.
  - `onRscScript` only calls `flushPendingScripts()` immediately when `initialSpliceDone && htmlBuffer.length === 0`, guaranteeing that inline RSC `<script>` tags are only ever injected at safe top-level `</script>` boundaries.
