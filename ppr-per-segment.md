# Per-Segment Partial Prerendering (`ppr`) & Non-Inheritance Model in Dinou

## 1. Executive Summary & Architectural Motivation

In Dinou's App Router architecture, a route is composed of independent **segments**: a root `layout`, zero or more nested `layout`s (each optionally accompanied by parallel `@slots`), and a leaf `page`. Each segment is rendered and cached both as part of full-document HTML requests (`GET /route`) and as independent Flight RSC payloads (`GET /____rsc_layout____/...` and `GET /____rsc_page____/...`).

Previously, Dinou's Partial Prerendering (`ppr`) model had two architectural limitations:

1. **Route-Wide `isPprBuildActive()` Bleeding Across Mixed Segments**:
   - When *any* segment in a route enabled `ppr = true` (e.g., a parent `layout` with `ppr = true` wrapping a child `page` with `ppr = false`, or vice versa), `runWithPprContext` activated a single route-wide `pprStore.isPprBuild = true` flag across the entire React element tree.
   - As a result, `<Suspense>` boundaries inside a `ppr = false` segment were mistakenly treated as PPR dynamic holes (`data-ppr-hole="ppr-hole-N"`), and dynamic API reads (`req.cookies`, `req.headers`, `req.query`, `revalidate = 0`) inside `<Suspense>` in a `ppr = false` segment postponed into PPR holes instead of triggering a standard dynamic SSR bailout (`markAsDynamic()`).
   - Furthermore, when `getJSX(..., { segment: "page" })` rendered a `ppr = true` page inside a `ppr = false` layout, `getJSX` still traversed and executed the parent layout chain before returning `ctx._resolvedPageClientJsx`, allowing layout-level `<Suspense>` boundaries to pollute the page's `capturedHoles` list and shift hole indices (`ppr-hole-1` vs `ppr-hole-2`).

2. **Implicit Parent-to-Child `ppr` Inheritance**:
   - Previously, `resolveLayoutChainPpr` cascaded `inheritedPpr` from parent layouts down to child layouts and pages whenever a child segment omitted `ppr` in its `layout_functions.ts` or `page_functions.ts`.
   - Because layouts and pages are independent segments with their own RSC endpoints (`layout.rsc` vs `page.rsc`) and metadata (`layout.metadata.json` vs `metadata.json`), implicit inheritance made it difficult for developers and AI agents to determine a segment's effective `ppr` value without inspecting every ancestor `layout_functions.ts` up to `src/`.

---

## 2. The New Per-Segment `ppr` Architecture

### 2.1. Strict Per-Segment Resolution (No Parent-to-Child Inheritance)

Every segment (`layout`, nested `layout`, or `page`) now resolves its `ppr` flag **strictly from its own segment configuration**, falling back directly to the project-wide default defined in `dinou.config.js` (`false` if omitted):

$$\text{effectivePpr}(\text{segment}) = \text{segmentConfig.ppr} \ ?? \ \text{Boolean}(\text{dinouConfig.ppr}) \ ?? \ \text{false}$$

- **Default (`dinou.config.js` omits `ppr` or sets `ppr: false`)**:
  - Every `layout` and `page` defaults to `ppr = false` unless it explicitly exports `ppr = true` (or `export function ppr() { return true; }`) in its own `layout_functions.ts` or `page_functions.ts`.
- **Global Opt-In (`dinou.config.js` sets `ppr: true`)**:
  - Every `layout` and `page` defaults to `ppr = true` unless it explicitly opts out with `ppr = false` in its own `layout_functions.ts` or `page_functions.ts`.
- **No Cascading Across Segments**:
  - Defining `ppr = true` in `src/dashboard/layout_functions.ts` enables PPR **only** for `src/dashboard/layout.tsx` (and its parallel `@slots`).
  - Child layouts (`src/dashboard/settings/layout.tsx`) and child pages (`src/dashboard/page.tsx`) do **not** inherit `ppr = true` from `src/dashboard/layout_functions.ts`; each segment uses its own explicit `ppr` or the global default from `dinou.config.js`.

### 2.2. Independent Per-Layout and Per-Page PPR Execution Scopes

During both static shell generation (`build-static-pages.js`, `generate-static.js`, `cache-revalidate.js`) and runtime PPR resume (`ppr-runtime.js`, `handler.js`), Dinou tracks PPR activation **per individual segment** inside `AsyncLocalStorage` (`dinou/core/ppr-context.js`):

1. **Element Tagging (`markLayoutRootElement` & `markPageRootElement`)**:
   - In `get-jsx.js` and `build-static-pages.js`, each layout root element in the active layout chain is tagged with its own resolved boolean `effectivePpr` via `markLayoutRootElement(el, layoutEffectivePpr)`.
   - The page root element is tagged with `markPageRootElement(el, pageEffectivePpr)`.
2. **Per-Element `inLayoutSegment` & `inPageSegment` Tracking**:
   - In `render-jsx-to-client-jsx.js`, when `asyncRenderJSXToClientJSX` enters a tagged layout or page root element, it runs `runInLayoutSegment(fn, el.$$dinouLayoutPpr)` or `runInPageSegment(fn, el.$$dinouPagePpr)`.
   - Because each nested layout carries its own `$$dinouLayoutPpr` boolean, a parent layout with `ppr = true` wrapping a nested layout with `ppr = false` (or vice versa) dynamically switches `store.currentLayoutPpr` as traversal moves from the outer layout into the inner layout and finally into the page (`store.pagePpr`).
3. **Segment-Aware `isPprBuildActive()`**:
   ```js
   function isPprBuildActive() {
     const store = pprStorage.getStore();
     if (!store || !store.isPprBuild) return false;
     if (store.inPageSegment) return Boolean(store.pagePpr);
     if (store.inLayoutSegment) return Boolean(store.currentLayoutPpr);
     return true;
   }
   ```
   - When `isPprBuildActive()` is `true` for the current segment:
     - `<Suspense>` boundaries that perform async work or access dynamic request APIs (`req.cookies`, `req.headers`, `req.query`, `revalidate = 0` slots) throw `PPR_DYNAMIC_POSTPONE` and are captured as static shell placeholders (`<div data-ppr-hole="ppr-hole-N">`) to be streamed at request time.
     - Unwrapped dynamic API accesses (outside `<Suspense>`) still trigger a full-route dynamic bailout (`markAsDynamic()`).
   - When `isPprBuildActive()` is `false` for the current segment (even if another segment in the same route has `ppr = true`):
     - `<Suspense>` boundaries in that segment resolve normally as standard React trees without registering `ppr-hole-*` placeholders.
     - Reading `req.cookies`, `req.headers`, `req.query`, or rendering a `revalidate = 0` `<DinouCacheSlot>` inside that `ppr = false` segment (even inside `<Suspense>`) immediately invokes `markAsDynamic()`, bailing out of static generation into full Dynamic SSR.

### 2.3. Isolated Segment Rendering in `getJSX(..., { segment: "page" })`

When `getJSX` is invoked with `{ segment: "page" }` (for `/____rsc_page____`, `/____rsc_page_static____`, or `generate-static.js` page shell compilation), `getJSX` now **skips traversing and rendering the parent layout chain altogether** and returns `ctx._resolvedPageClientJsx` directly after evaluating `Page`. This guarantees:
- Zero wasted server CPU re-evaluating parent layouts and `@slots` during page-only RSC requests.
- Page PPR hole indices (`ppr-hole-1`, `ppr-hole-2`, ...) in `metadata.json` and `shell.page.json` are 100% isolated from layout PPR holes.

---

## 3. Behavior Matrix Across Mixed Segments

| Root Layout `ppr` | Nested Layout `ppr` | Page `ppr` | Full Route HTML (`GET /route`) | Layout RSC (`layout.rsc` / `shell.layout.json`) | Page RSC (`page.rsc` / `shell.page.json`) |
| :---: | :---: | :---: | :--- | :--- | :--- |
| `false` | `false` | `false` | Standard SSG / ISR / Dynamic SSR (`index.html`). | Static `layout.rsc` (or dynamic if bailout). | Static `page.rsc` (or dynamic if bailout). |
| `true` | `false` | `false` | Route is composite PPR (`shell.html`): Root Layout streams its `<Suspense>` holes; Nested Layout & Page are statically embedded in the shell. | Root Layout has `shell.layout.json` with holes; Nested Layout has static `layout.rsc`. | Static `page.rsc` (`pagePpr: false`, `holes: []`). |
| `false` | `true` | `false` | Route is composite PPR (`shell.html`): Nested Layout streams its `<Suspense>` holes; Root Layout & Page are static in the shell. | Root Layout has static `layout.rsc`; Nested Layout has `shell.layout.json` with holes. | Static `page.rsc` (`pagePpr: false`, `holes: []`). |
| `false` | `false` | `true` | Route is composite PPR (`shell.html`): Both Layouts are static in the shell; Page streams its `<Suspense>` holes. | Both Layouts have static `layout.rsc` (`holes: []`). | Page has `shell.page.json` with `holes: ["ppr-hole-..."]`. |
| `true` | `true` | `true` | Full PPR across all segments: each segment's `<Suspense>` holes stream in parallel during `handlePprResume`. | Each layout stores its own `shell.layout.json` & `holes`. | Page stores its own `shell.page.json` & `holes`. |

---

## 4. Summary of Modified Core Files

| File | Responsibility |
| :--- | :--- |
| `dinou/core/ppr-context.js` | Added per-segment state (`layoutPpr`, `pagePpr`, `currentLayoutPpr`, `inLayoutSegment`, `inPageSegment`), `markLayoutRootElement`, `markPageRootElement`, `runInLayoutSegment`, `runInPageSegment`, and segment-scoped `isPprBuildActive()`. |
| `dinou/core/render-jsx-to-client-jsx.js` | Enters `runInLayoutSegment(fn, jsx.$$dinouLayoutPpr)` and `runInPageSegment(fn, jsx.$$dinouPagePpr)` when evaluating tagged layout and page root elements. |
| `dinou/core/layout-functions.js` | Updated `resolveLayoutChainPpr` to resolve each layout's `effectivePpr` strictly from its own `layout_functions` config or `defaultPpr = Boolean(globalCfg?.ppr)`, removing parent-to-child `ppr` inheritance. |
| `dinou/core/get-jsx.js` | Tags each layout element with `markLayoutRootElement(..., layoutEffectivePpr)` and the page element with `markPageRootElement(..., pageEffectivePpr)`, and short-circuits before layout traversal when `options?.segment === "page"`. |
| `dinou/core/build-static-pages.js` | Computes `isRoutePpr`, `pageEffectivePpr`, and `layoutPprMap` via `resolveBuildPprForRoute` (without inheritance) and passes segment-specific PPR flags into `runWithPprContext`. |
| `dinou/core/generate-static.js` | Persists both `ppr` (composite route PPR) and `pagePpr` (page segment PPR) into `metadata.json`, and compiles `shell.page.json` / `shell.html` accurately for mixed-PPR routes. |
| `dinou/core/handler.js` | Resolves `ppr` (route composite) and `pagePpr` (page segment) without inheritance; passes `{ layoutPpr, pagePpr }` into `runWithPprContext`; serves static `page.rsc` on `/____rsc_page____` when `pagePpr === false` even if a parent layout has `ppr === true`. |
| `dinou/core/ppr-runtime.js` | Passes segment-specific `{ layoutPpr, pagePpr }` into `runWithPprContext` during `streamDynamicHoles` and `spliceDynamicHolesIntoShell`; falls back cleanly to `page.rsc` when `shell.page.json` is absent on a `pagePpr === false` child page. |
| `dinou/core/cache-revalidate.js` | Updated `revalidatePage` and `revalidateLayout` to resolve per-segment `effectivePpr` via `resolveLayoutChainPpr` without parent-to-child inheritance. |

---

## 5. Verification & E2E Test Coverage

The per-segment `ppr` model and non-inheritance behavior are verified across both production (`start:node:esbuild`) and development (`dev:esbuild`) modes in `e2e/example.spec.ts`:

- **`Dinou Core: Comprehensive PPR Verification Suite (/t-new-ppr)`**:
  - Verifies mixed-segment routes: `/t-new-ppr/opt-out-route` (`layout` with `ppr = true`, `page` with `ppr = false`), `/t-new-ppr/opt-in-route` (`layout` with `ppr = false`, `page` with `ppr = true`), `/t-new-ppr/no-ppr-bailout` (`ppr = false` segment reading cookies inside `<Suspense>` triggering full dynamic SSR bailout), and unit assertions on `resolveLayoutChainPpr` verifying zero inheritance and `dinou.config.js` global default (`ppr: false` vs `ppr: true`).
- **`Dinou Core: Rigorous PPR & Layout PPR Verification`**:
  - Verifies `/t-ppr-rigorous`, `/t-ppr-layout`, `/t-ppr-layout/nested`, `/t-rigurous-hs-ppr`, and `/t-rigurous-triple-sinergy`.

