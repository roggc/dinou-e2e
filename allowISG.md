# Per-Segment `allowISG` & `validateParams` Architecture in Dinou

## 1. Executive Summary & Architectural Motivation

In Dinou, dynamic route segments (`[id]`, `[slug]`, `[...catchAll]`) can control whether unknown URL parameters are allowed to be generated and cached on-demand at runtime via **Incremental Static Generation (`allowISG`)** or validated via **`validateParams(params)`** inside `page_functions.ts` and `layout_functions.ts`.

Previously, Dinou's handling of `allowISG` and `validateParams` across layouts and pages had three subtle architectural flaws:

1. **Parent Layouts with `allowISG = false` Overwrote `allowISGValue` for Child Pages**:
   - In `dinou/core/handler.js`, when any layout in the route hierarchy exported `allowISG = false`, `handler.js` unconditionally executed `allowISGValue = false` for the entire route and checked whether the **child page's** `.dinou/dist2/<full-route>/index.html` existed on disk.
   - **Consequence A (Static Parent Layout + Dynamic Child Page)**: If a static parent layout (with no dynamic parameters of its own, e.g., `src/blog/layout.tsx`) defined `allowISG = false`, it blocked its dynamic child page (`src/blog/[slug]/page.tsx`, where `allowISG = true`) from generating new `[slug]` pages on-demand via ISG.
   - **Consequence B (Dynamic Parent Layout + Dynamic Child Page)**: In a nested dynamic route such as `/team/[team]/posts/[postId]` where the layout `/team/[team]` set `allowISG = false` (allowing only pre-rendered `team = "alpha"`) and the child page `posts/[postId]` set `allowISG = true` (allowing new posts to be generated via ISG), requesting `/team/alpha/posts/post-2` failed in production:
     - Even though `team = "alpha"` was valid, `.dinou/dist2/team/alpha/posts/post-2/index.html` did not exist yet, so the parent layout's check marked `isPathBlocked = true` (404) and forced `allowISGValue = false`, preventing ISG from caching `post-2`.

2. **Checking Raw Layouts Instead of the Active Layout Chain (`no_layout` / `reset_layout`)**:
   - `handler.js` iterated over raw `getFilePathAndDynamicParams(..., "layout")` results rather than `getActiveLayoutChain(...)`, meaning a parent layout bypassed by `no_layout` or `reset_layout` could still block a child route.

3. **Inconsistent HTTP Status Across `/____rsc_page____` vs `/____rsc_layout____` and Full HTML**:
   - When a parent layout rejected a dynamic parameter via `allowISG = false` or `validateParams`, `GET /route` (full HTML) and `GET /____rsc_layout____/route` returned `404 Not Found`, whereas `GET /____rsc_page____/route` only evaluated `resolvePageFunctionsConfig` (`page_functions.ts`) and returned `200 OK`.

---

## 2. The New Per-Segment `allowISG` & `validateParams` Model

### 2.1. Each Segment Validates Only Its Own Dynamic Parameters

Both `allowISG` and `validateParams` are now strictly scoped to the dynamic parameters belonging to that segment:

- **Layout Segment (`isLayoutSegmentBlocked` in `dinou/core/handler.js`)**:
  - Evaluated for each active layout in `getActiveLayoutChain(reqSegments, queryObj, srcFolder)` (respecting `no_layout` and `reset_layout`), where `entry.dParams` contains **only** the dynamic URL parameters accumulated up to that layout's directory and `entry.cleanLayoutKey` is the URL path prefix up to that layout.
  - **Rule 1 (Static Layouts Are a No-Op)**: If a layout has no dynamic parameters of its own (`Object.keys(lParams || {}).length === 0`), `isLayoutSegmentBlocked` immediately returns `false`. A static layout's `allowISG` setting never restricts dynamic child segments.
  - **Rule 2 (`validateParams`)**: If the layout has dynamic parameters (`lParams`) and defines `validateParams(lParams)`, returning `false` immediately blocks the route (`404 Not Found`).
  - **Rule 3 (`allowISG === false` on a Dynamic Layout)**:
    - Checks whether `lParams` is present in the layout's own `staticPathsSet` (from `layout_functions.ts` `getStaticPaths()`).
    - In production (`!isDevelopment && !isSSG`), if `lParams` is not in `staticPathsSet`, it checks whether that layout instance was pre-rendered at build time by verifying `.dinou/dist2/${cleanLayoutKey}/layout.rsc` (or `.dinou/dist2/${cleanReq}/index.html` / `shell.html`).
    - If the layout's own dynamic parameter **is** allowed (e.g., `team = "alpha"` in `/team/[team]/posts/[postId]`), `isLayoutSegmentBlocked` returns `false` and **does not overwrite `allowISGValue`** for the child page. The child page's own `allowISG` setting (`true` or `false`) governs whether new child parameters (`postId = "post-2"`) are generated and cached via ISG.
    - If the layout's own dynamic parameter is **not** allowed (e.g., `team = "unknown"`), `isLayoutSegmentBlocked` returns `true`, blocking the entire route (`isPathBlocked = true`, `allowISGValue = false`).

- **Page Segment (`resolvePageFunctionsConfig` in `dinou/core/handler.js`)**:
  - Evaluates `validateParams(dynamicParams)` and `allowISG` for the leaf page when `Object.keys(dynamicParams || {}).length > 0`.
  - When `allowISG === false` (and `!isSSG`), checks the page's `staticPathsSet` and, in production, checks `.dinou/dist2/${cleanReq}/index.html`, `shell.html`, or `page.rsc`.

- **Build-Time SSG Guard (`!isSSG`)**:
  - During Static Site Generation (`platformContext?.isSSG === true` in `generate-static.js`), routes and layouts being compiled have already been discovered from `getStaticPaths()`, and their `.dinou/dist2` files are in the process of being written. Passing `isSSG` into `resolvePageFunctionsConfig` and `isLayoutSegmentBlocked` ensures `allowISG = false` never prematurely blocks a static route while `generate-static.js` is building it (even when `getStaticPaths` is defined in `page_functions.ts` and `allowISG = false` is in `layout_functions.ts`, or vice versa).

### 2.2. Full 404 Consistency Across All Three Endpoints

When any active layout segment or the page segment blocks a request (`isPathBlocked === true`), Dinou now returns `404 Not Found` consistently across all three endpoints:
1. **Full SSR / Static HTML**: `GET /route` $\rightarrow$ `404`
2. **Segmented Layout RSC**: `GET /____rsc_layout____/route` $\rightarrow$ `404`
3. **Segmented Page RSC**: `GET /____rsc_page____/route` $\rightarrow$ `404`

---

## 3. Global Default `allowISG` in `dinou.config.js`

Just like `ppr`, Dinou now supports configuring the project-wide default value of `allowISG` in `dinou.config.js` (or `dinou.config.ts` / `dinou.config.mjs`):

```ts
// dinou.config.ts
import { defineConfig } from "dinou";

export default defineConfig({
  // Default is true if omitted.
  // Set to false to disable on-demand ISG globally across all dynamic segments
  // unless a segment explicitly opts in with allowISG = true.
  allowISG: false,
});
```

### Resolution Formula per Segment

$$\text{effectiveAllowISG}(\text{segment}) = \text{segmentConfig.allowISG} \ ?? \ (\text{dinouConfig.allowISG} \ ?? \ \text{true})$$

| `dinou.config.js` `allowISG` | Segment `allowISG` (`page_functions` / `layout_functions`) | Effective `allowISG` for That Segment |
| :---: | :---: | :---: |
| *omitted* (or `true`) | *omitted* | `true` (on-demand ISG enabled by default) |
| *omitted* (or `true`) | `false` | `false` (segment opts out of ISG; only build-time paths allowed) |
| `false` | *omitted* | `false` (strict SSG-only by default across the project) |
| `false` | `true` | `true` (segment explicitly opts into on-demand ISG) |

---

## 4. Behavior Matrix for Nested Dynamic Routes (`/team/[team]/posts/[postId]`)

Assume `team = "alpha"` and `postId = "post-1"` were pre-rendered at build time:

| Layout `/team/[team]` `allowISG` | Page `posts/[postId]` `allowISG` | Request URL | Result |
| :---: | :---: | :--- | :--- |
| `false` | `true` | `/team/alpha/posts/post-1` | `200 OK` (served from build-time static cache). |
| `false` | `true` | `/team/alpha/posts/post-2` | `200 OK` (`team = "alpha"` passes layout check; new `post-2` is generated and cached on-demand via ISG). |
| `false` | `true` | `/team/beta/posts/post-1` | `404 Not Found` on HTML, `layout.rsc`, and `page.rsc` (`team = "beta"` is rejected by layout `allowISG = false`). |
| `true` | `false` | `/team/beta/posts/post-1` | `404 Not Found` (`team = "beta"` is allowed by layout, but `/team/beta/posts/post-1` was not pre-rendered for the page and page has `allowISG = false`). |

---

## 5. Summary of Modified Files

| File | Responsibility |
| :--- | :--- |
| `dinou/index.d.ts` | Added `allowISG?: boolean` (`@default true`) to the `DinouConfig` TypeScript interface. |
| `dinou/core/layout-functions.js` | Updated `resolveLayoutFunctionsConfig` to read `defaultAllowISG` from `getDinouConfig()` (`true` by default) and use it when a layout does not explicitly export `allowISG`. |
| `dinou/core/handler.js` | Updated `resolvePageFunctionsConfig` to use `defaultAllowISG` from `getDinouConfig()` when a page does not explicitly define `allowISG`; added `isLayoutSegmentBlocked` using `getActiveLayoutChain` and `.dinou/dist2/${cleanLayoutKey}/layout.rsc`; enforced `isLayoutSegmentBlocked` across HTML, `/____rsc_layout____`, and `/____rsc_page____` without overwriting child `allowISGValue` when the layout's own dynamic params are valid. |
| `src/t-layout-functions/...` & `e2e/example.spec.ts` | Added nested dynamic child route `src/t-layout-functions/no-isg/[id]/posts/[postId]` (`allowISG = true`) under `no-isg/[id]` (`allowISG = false`), static parent `allowISG = false` in `src/t-layout-functions/layout_functions.ts`, 404 assertions on `/____rsc_page____`, and global `dinou.config.js` `allowISG` default verification. |

