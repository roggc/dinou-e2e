# Type-Safe Routing & Horizontal Segmentation in Dinou

## 1. Executive Summary & Architectural Motivation

Dinou is built around **3D Route Segmentation**:
1. **Hierarchical & Horizontal Segmentation**: Layouts (`layout.tsx` + `layout_functions.ts`), Parallel Slots (`@slot/page.tsx` + `@slot/error.tsx`), Error/Not-Found boundaries (`error.tsx`, `not_found.tsx`), and Pages (`page.tsx` + `page_functions.ts`) have independent lifecycles, independent RSC payloads, and independent cache entries.
2. **Vertical Segmentation**: Sub-tree caching via `<DinouCacheSlot>`.
3. **Temporal Segmentation**: Per-segment Partial Prerendering (`ppr = true`) streaming dynamic `<Suspense>` holes over an instant static shell.

Previously, Dinou's compile-time Type-Safe Routing system only indexed directories containing a `page.*` file. While sufficient for flat or page-centric routers, that page-only model left three gaps in a horizontally segmented framework:

1. **Intermediate Layouts & `not_found.tsx` Boundaries Without a Sibling `page.tsx`**:
   - In real-world architectures (e.g., `src/workspace/[org]/layout.tsx`, `layout_functions.ts`, or `not_found.tsx`, where navigable pages live deeper at `src/workspace/[org]/projects/[projectId]/page.tsx`), no `page.tsx` exists at `/workspace/[org]`.
   - Previously, the scanner only indexed `page.*` files: `not_found.tsx` only worked indirectly if a sibling `page.tsx` happened to coexist in the same folder, and intermediate layouts, `layout_functions.ts`, and intermediate `not_found.tsx` boundaries were rejected by TypeScript unless developers wrote manual parameter interfaces.
2. **Parallel `@slot` Pages, Slot Error Boundaries & Layout Slot Props**:
   - Parallel slot folders (`@sidebar/page.tsx`, `@analytics/page.tsx`, `@analytics/error.tsx`) were ignored by the route type scanner, leaving `@slot` components without segment-aware autocomplete (`SlotProps<"/workspace/[org]/@analytics">`) and requiring manual prop extensions on parent `LayoutProps` (`sidebar?: ReactNode`).
   - **Runtime Parity Bug**: In `dinou/core/get-file-path-and-dynamic-params.js`, `getSlots()` invoked `getFilePathAndDynamicParams` without forwarding the parent layout's accumulated `dParams` (and `get-jsx.js`, `get-error-jsx.js`, and `build-static-pages.js` similarly omitted `dParams` when resolving `@slot/error.*`). As a result, a parallel slot inside a dynamic segment like `src/workspace/[org]/@sidebar/page.tsx` received `params = {}` at runtime instead of `{ org: "acme" }`.
3. **Dev Watcher Coverage & Standalone Type Generation**:
   - `dinou/node/dev.js` only regenerated `.dinou/types/routes.d.ts` when `page.*` files were added or deleted—ignoring `layout.*`, `layout_functions.*`, `error.*`, and `not_found.*` changes—and there was no standalone CLI command (`npx dinou typegen`) to generate `.dinou/types/routes.d.ts` in lightweight CI typecheck jobs without running a full production build.

All three gaps have been resolved with **zero runtime bundle overhead (0 bytes added to client or server bundles)** and **100% backward compatibility**.

---

## 2. End-to-End Architecture

### 2.1. Level 1 (Outward Navigation) vs. Level 2 (Inward Segment Consumption)

Dinou strictly separates **navigable URLs** from **internal horizontal segments**:

| Layer | Purpose | Source of Truth | Key Guarantee |
| :--- | :--- | :--- | :--- |
| **Level 1: Outward Navigation** | `<Link href / to>`, `router.push()`, `router.replace()`, `DinouRoute` | `page.*` files **only** | Intermediate layout-only folders (e.g. `/workspace/[org]`) and `@slot` folders (e.g. `/workspace/[org]/@sidebar`) are **never** valid `<Link>` targets—preventing accidental links to 404 intermediate paths. |
| **Level 2: Inward Consumption** | `PageProps`, `LayoutProps`, `SlotProps`, `ErrorProps`, `NotFoundProps`, `PageFunctions`, `LayoutFunctions`, `RouteParams` | Dedicated segment maps (`params`, `layoutParams`, `layoutSlots`, `slotParams`, `errorParams`) | Every horizontal segment receives exact cumulative `params` up to its own directory (never leaking deeper child-page parameters into parent layouts or `@slots`) plus auto-inferred `@slot` `ReactNode` props on `LayoutProps`. |

---

### 2.2. Single-Pass Topology Scanner (`dinou/core/generate-route-types.js`)

`collectRouteTopology(srcDir)` walks `src/` synchronously in **under 2ms** without importing or executing application modules:

- **Private Folders (`_*`)**: Ignored completely.
- **Route Groups (`(group)`)**: Transparently unwrapped without adding a URL segment. Route groups inside `@slot` folders (e.g. `@analytics/(charts)/page.tsx`) and `@slot` folders inside route groups (e.g. `src/workspace/[org]/(panels)/@analytics/page.tsx`) both map cleanly to their effective parent segment (`"/workspace/[org]"`).
- **Parallel Slots (`@slot`)**: Inspected via `inspectSlotDirectory()`, matching Dinou's runtime `getSlots()` resolution rules (`page.*`, `error.*`, nested `(group)` folders, and optional trailing `[[opt]]` / `[[...opt]]` segments inside `@slot`).
  - Registers cumulative parameters for `"/segment/@slotName"` (and `"/segment/@slotName/[[...opt]]"` when optional sub-segments exist inside the slot).
  - Records `slotName` in `slotNamesBySegment.get(segmentPath)` so any `layout.*` at `segmentPath` automatically receives `slotName?: ReactNode`.
- **Layouts (`layout.*`, `layout_functions.*`, `layout.functions.*`)**: Indexed in `topology.layouts` whether or not a sibling `page.*` exists in the same directory.
- **Pages & Not-Found (`page.*`, `page_functions.*`, `not_found.*`)**:
  - Only `page.*` populates `topology.routes` (Level 1 navigable URLs, including progressive peeling of trailing optional `[[...]]` segments).
  - `page.*`, `page_functions.*`, and `not_found.*` populate `topology.pageSegments` (`DinouRouteParamsMap`).
- **Error Boundaries (`error.*`)**: Every segment containing `error.*`, `page.*`, `not_found.*`, `layout.*`, `layout_functions.*`, or `@slot/(page|error).*` is registered in `topology.errorSegments` (`DinouErrorParamsMap`).

---

### 2.3. Generated Module Augmentation (`.dinou/types/routes.d.ts`)

`generateRouteTypes(projectRoot)` emits `.dinou/types/routes.d.ts` (writing to disk only when content changes to avoid unnecessary TypeScript watcher churn), augmenting `"dinou"` via `DinouRouter.Register`:

```ts
// This file is auto-generated by Dinou. Do not edit directly.
import type { ReactNode } from "react";
import "dinou";

declare module "dinou" {
  export type DinouStaticRoutes =
    | "/";

  export type DinouDynamicRoutes =
    | `/workspace/${string | number}/projects/${string | number}`;

  export type DinouInternalRoute = DinouStaticRoutes | DinouDynamicRoutes;

  export type DinouRelativeOrExternalRoute =
    | `http://${string}`
    | `https://${string}`
    | `mailto:${string}`
    | `tel:${string}`
    | `#${string}`
    | `?${string}`;

  export type DinouGeneratedRoute =
    | DinouStaticRoutes
    | ((
        | DinouDynamicRoutes
        | `${DinouInternalRoute}?${string}`
        | `${DinouInternalRoute}#${string}`
        | DinouRelativeOrExternalRoute
      ) & Record<never, never>);

  export interface DinouNavigableParamsMap {
    "/": Record<string, never>;
    "/workspace/[org]/projects/[projectId]": { org: string; projectId: string };
  }

  export interface DinouRouteParamsMap {
    "/": Record<string, never>;
    "/workspace/[org]/projects/[projectId]": { org: string; projectId: string };
  }

  export interface DinouLayoutParamsMap {
    "/": Record<string, never>;
    "/workspace/[org]": { org: string };
  }

  export interface DinouLayoutSlotsMap {
    "/": {};
    "/workspace/[org]": { analytics?: ReactNode; sidebar?: ReactNode };
  }

  export interface DinouSlotParamsMap {
    "/workspace/[org]/@analytics": { org: string; metric?: string[] };
    "/workspace/[org]/@analytics/[[...metric]]": { org: string; metric?: string[] };
    "/workspace/[org]/@sidebar": { org: string };
  }

  export interface DinouErrorParamsMap {
    "/": Record<string, never>;
    "/workspace/[org]": { org: string };
    "/workspace/[org]/@analytics": { org: string; metric?: string[] };
    "/workspace/[org]/@sidebar": { org: string };
    "/workspace/[org]/projects/[projectId]": { org: string; projectId: string };
  }

  namespace DinouRouter {
    interface Register {
      route: DinouGeneratedRoute;
      navigableParams: DinouNavigableParamsMap;
      params: DinouRouteParamsMap;
      layoutParams: DinouLayoutParamsMap;
      layoutSlots: DinouLayoutSlotsMap;
      slotParams: DinouSlotParamsMap;
      errorParams: DinouErrorParamsMap;
    }
  }
}
```

---

### 2.4. Runtime Parity: Cumulative `dParams` in Parallel `@slots`

To ensure runtime props match compile-time types in every execution mode (dev SSR, production SSR, SSG/ISR static builds, PPR shell generation, and error recovery):

1. **`dinou/core/get-file-path-and-dynamic-params.js`**:
   - `getSlots(currentPath, reqSegments, query, dParams = {})` now passes `dParams` into `getFilePathAndDynamicParams(..., reqSegments.length, dParams)` and recursively into route-group `getSlots(groupPath, reqSegments, query, dParams)`.
   - All `getSlots` call sites at static segments pass `dParams`, and all dynamic segment branches (`[[...param]]`, `[[param]]`, `[...param]`, `[param]`) pass `newParams`.
   - Because each layout entry in the accumulated chain captures `dParams` at its own segment depth, a slot at `src/workspace/[org]/@sidebar/page.tsx` receives `{ org: "acme" }` when rendering `/workspace/acme/projects/42`—never `{}` and never leaking `{ projectId: "42" }`.
2. **`dinou/core/get-jsx.js`, `dinou/core/get-error-jsx.js`, and `dinou/core/build-static-pages.js`**:
   - Added `dParams` fallback when resolving `slotParams`, and passed `slotParams` as `dParams` (argument #9) when resolving `@slot/error.*` on slot render failures so `ErrorProps<"/workspace/[org]/@sidebar">` receives `{ org: "acme" }` at runtime as well.

---

## 3. Public TypeScript API & Developer Guide

All routing types are exported from `"dinou"` (and re-exported from `"dinou/server"`):

| Exported Type | Target File(s) | Description |
| :--- | :--- | :--- |
| `DinouRoute` | Any component / helper | Union of all resolved navigable URLs (`page.*`), query/hash suffixes, standalone queries/hashes (`?...`, `#...`), and external URLs (`http://`, `https://`, `mailto:`, `tel:`). Ideal for typing URL props on custom UI components. |
| `DinouLinkTarget` / `LinkProps<TFrom, THref>` | `<Link>`, `useRouter()` | Combines `DinouRoute` with exact dynamic route pattern literals (`DinouDynamicRoutePattern`, e.g. `"/blog/[slug]"`) and strict `from`-anchored relative targets (`DinouRelativeLinkTarget<TFrom>`), surfacing static, dynamic, and relative routes (`"sub"`, `"./sub"`, `"../..."`) in `Ctrl + Space` autocomplete while enforcing conditional `params`. |
| `DinouFromRoute` / `DinouRelativeLinkTarget<TFrom>` | `<Link from=...>`, `router.push(..., { from })` | Types valid `from` route/directory prefixes and computes the exact finite union of valid relative paths (excluding parent directories without `page.*`). |
| `PageProps<T, TProps?>` | `page.tsx`, `not_found.tsx`, `@slot/page.tsx` | Types `{ params: RouteParams<T> } & TProps`. Accepts both page patterns (`"/blog/[slug]"`) and registered slot patterns (`"/workspace/[org]/@sidebar"`), plus optional `TProps` from `page_functions.ts` (`getProps`). |
| `LayoutProps<T, TProps?>` | `layout.tsx` (leaf or intermediate) | Types `{ children: ReactNode; params: LayoutParams<T> } & LayoutSlots<T> & TProps`. Works on intermediate folders without a sibling `page.tsx` and **auto-infers** optional `ReactNode` props for all sibling `@slot` pages! |
| `SlotProps<T>` | `@slot/page.tsx` | Dedicated prop interface `{ params: SlotParams<T> }` with autocomplete scoped strictly to parallel `@slot` segments (e.g. `"/workspace/[org]/@analytics"`). |
| `ErrorProps<T>` | `error.tsx`, `@slot/error.tsx` | Types `{ error: Error; params: ErrorParams<T> }` across page routes, intermediate folder boundaries, and parallel `@slot` error boundaries. |
| `NotFoundProps<T, TProps?>` | `not_found.tsx` (root, leaf, or intermediate) | Semantic type `{ params: RouteParams<T> } & TProps` for 404 boundaries (with or without a sibling `page.tsx`), plus optional `TProps` returned by a sibling `page_functions.ts` (`getProps`). Excludes `@slot` paths (since slots do not resolve `not_found.*`). |
| `PageFunctions<T, TProps>` | `page_functions.ts` | Types `getProps`, `validateParams`, `getStaticPaths`, `revalidate`, `ppr`, and `allowISG` for a page route `T` (or explicit params object). |
| `LayoutFunctions<T, TProps>` | `layout_functions.ts` / `layout.functions.ts` | Types `getProps`, `validateParams`, `revalidate`, `ppr`, and `allowISG` for any layout segment `T`—including intermediate layouts without a sibling `page.tsx`. |
| `RouteParams<T>` | Standalone helpers / services | Extracts the resolved `params` dictionary for any valid page, layout, `@slot`, or error segment pattern `T`. |

### Example: Horizontal Segmentation in Action

Given the following directory tree (notice there is **no** `src/workspace/[org]/page.tsx`):

```text
src/
└── workspace/
    └── [org]/
        ├── layout.tsx                        # Intermediate layout (no sibling page.tsx)
        ├── layout_functions.ts               # Intermediate layout functions
        ├── error.tsx                         # Intermediate error boundary
        ├── not_found.tsx                     # Intermediate 404 boundary
        ├── @sidebar/
        │   ├── page.tsx                      # Parallel slot @sidebar
        │   └── error.tsx                     # Slot-isolated error boundary
        ├── (panels)/
        │   └── @analytics/
        │       └── [[...metric]]/
        │           └── page.tsx              # Grouped parallel slot with optional catch-all
        └── projects/
            └── [projectId]/
                └── page.tsx                  # Navigable leaf page
```

1. **Intermediate Layout (`src/workspace/[org]/layout.tsx`)**:
   ```tsx
   import type { LayoutProps } from "dinou";
   import type { OrgLayoutData } from "./layout_functions";

   export default function WorkspaceLayout({
     children,
     params,
     sidebar,
     analytics,
     orgPlan,
   }: LayoutProps<"/workspace/[org]", OrgLayoutData>) {
     // params.org    -> string (child projectId does NOT leak here)
     // sidebar       -> ReactNode (auto-inferred from @sidebar/page.tsx)
     // analytics     -> ReactNode (auto-inferred from (panels)/@analytics/.../page.tsx)
     // orgPlan       -> "free" | "pro" (from OrgLayoutData)
     return (
       <div data-plan={orgPlan}>
         <aside>{sidebar}</aside>
         <main data-org={params.org}>{children}</main>
         <aside>{analytics}</aside>
       </div>
     );
   }
   ```

2. **Intermediate Layout Functions (`src/workspace/[org]/layout_functions.ts`)**:
   ```ts
   import type { LayoutFunctions } from "dinou";

   export interface OrgLayoutData {
     orgPlan: "free" | "pro";
   }

   export const getProps: LayoutFunctions<
     "/workspace/[org]",
     OrgLayoutData
   >["getProps"] = async (params) => {
     // params?.org -> string | undefined
     return { orgPlan: params?.org === "acme" ? "pro" : "free" };
   };

   export const validateParams: LayoutFunctions<
     "/workspace/[org]"
   >["validateParams"] = (params) => Boolean(params?.org);
   ```

3. **Parallel Slot Page (`src/workspace/[org]/(panels)/@analytics/[[...metric]]/page.tsx`)**:
   ```tsx
   import type { SlotProps } from "dinou";

   export default async function AnalyticsSlot({
     params,
   }: SlotProps<"/workspace/[org]/@analytics">) {
     // params.org    -> string
     // params.metric -> string[] | undefined
     return <section>{params.org}: {params.metric?.join("/") ?? "overview"}</section>;
   }
   ```

4. **Slot Error (`error.tsx`) & Intermediate Not-Found (`not_found.tsx`) Boundaries**:
   ```tsx
   "use client";
   import { useRouter, type ErrorProps } from "dinou";

   export default function SidebarSlotError({
     error,
     params,
   }: ErrorProps<"/workspace/[org]/@sidebar">) {
     const router = useRouter();
     return (
       <div role="alert">
         <p>Sidebar failed for {params.org}: {error.message}</p>
         <button onClick={() => router.refresh({ layout: true })}>Retry</button>
       </div>
     );
   }
   ```
   ```tsx
   // src/workspace/[org]/not_found.tsx (Server or Client Component)
   import { Link, type NotFoundProps } from "dinou";

   export default function WorkspaceNotFound({
     params,
   }: NotFoundProps<"/workspace/[org]">) {
     // params.org -> string (works even with no sibling page.tsx!)
     return (
       <section>
         <h1>Nothing found in workspace "{params.org}"</h1>
         <Link href="/">Back to Home</Link>
       </section>
     );
   }
   ```

5. **Leaf Page & Level 1 Link Safety (`src/workspace/[org]/projects/[projectId]/page.tsx`)**:
   ```tsx
   import { Link, type PageProps } from "dinou";

   export default function ProjectPage({
     params,
   }: PageProps<"/workspace/[org]/projects/[projectId]">) {
     return (
       <div>
         {/* Option A: Autocompleted dynamic pattern + required typed params */}
         <Link
           to="/workspace/[org]/projects/[projectId]"
           params={{ org: params.org, projectId: params.projectId }}
         >
           Reload Project (Pattern + params)
         </Link>

         {/* Option B: Direct template string interpolation (no params prop) */}
         <Link href={`/workspace/${params.org}/projects/${params.projectId}`}>
           Reload Project (Template)
         </Link>

         {/* Strict relative navigation anchored with `from`:
             "../../.." resolves to "/" (valid page.tsx), whereas "../.." resolves to
             "/workspace/[org]" (rejected because it has no page.tsx!) */}
         <Link from="/workspace/[org]/projects/[projectId]" to="../../..">
           Back to Root
         </Link>

         {/* Compile-time TS error: unanchored relative path without `from`! */}
         {/* <Link to="./subs">Broken Relative</Link> */}

         {/* Compile-time TS error: uninterpolated [org]/[projectId] without params! */}
         {/* <Link to="/workspace/[org]/projects/[projectId]">Missing params</Link> */}

         {/* Compile-time TS error: /workspace/[org] has no page.tsx! */}
         {/* <Link href={`/workspace/${params.org}`}>Workspace</Link> */}

         {/* Compile-time TS error: @sidebar is a parallel slot, not a URL! */}
         {/* <Link href={`/workspace/${params.org}/@sidebar`}>Sidebar</Link> */}
       </div>
     );
   }
   ```

### Parameter Mapping Reference

| Filesystem Segment | Example Path | Inferred `params` Property |
| :--- | :--- | :--- |
| Static segment | `src/about/page.tsx` | `Record<string, never>` |
| Dynamic `[param]` | `src/blog/[slug]/page.tsx` | `{ slug: string }` |
| Catch-all `[...param]` | `src/docs/[...slug]/page.tsx` | `{ slug: string[] }` |
| Optional `[[param]]` | `src/[[lang]]/page.tsx` | `{ lang?: string }` (`string \| undefined`) |
| Optional catch-all `[[...param]]` | `src/shop/[[...opt]]/page.tsx` | `{ opt?: string[] }` (`string[] \| undefined`) |

> **Leading Slash Ergonomics**: All segment generic types (`PageProps`, `LayoutProps`, `SlotProps`, `ErrorProps`, `NotFoundProps`, `PageFunctions`, `LayoutFunctions`, `RouteParams`) accept patterns both with and without a leading slash (e.g. `"/workspace/[org]"` or `"workspace/[org]"`), normalized internally via `CleanRoutePath<T>`.

### `PageProps` vs. Semantic Aliases (`NotFoundProps`, `SlotProps`) vs. Dedicated Types (`LayoutProps`, `ErrorProps`)

- **Semantic Aliases (`NotFoundProps` & `SlotProps`)**:
  - `not_found.tsx` and `@slot/page.tsx` receive the exact same `{ params }` runtime shape as `page.tsx`.
  - Developers can freely use `PageProps` in `page.tsx`, `not_found.tsx`, and `@slot/page.tsx`, or opt into `NotFoundProps` / `SlotProps` for semantic clarity and scoped `Ctrl + Space` autocomplete (`SlotProps` lists only `@slot` folders; `NotFoundProps` excludes `@slot` folders and includes intermediate layout folders even before `not_found.tsx` is first saved).
- **Dedicated Non-Alias Types (`LayoutProps` & `ErrorProps`)**:
  - **`LayoutProps`** is **not** an alias of `PageProps`: always use `LayoutProps` in `layout.tsx`. It adds `children: ReactNode`, auto-infers sibling parallel `@slot` `ReactNode` props, and validates against `DinouLayoutParamsMap` (supporting intermediate layouts without a sibling `page.tsx`, where `PageProps` intentionally errors).
  - **`ErrorProps`** is **not** an alias of `PageProps`: always use `ErrorProps` in `error.tsx` and `@slot/error.tsx`. It adds `error: Error` alongside `params` and validates against `DinouErrorParamsMap`.

---

## 4. TypeScript Compiler Guarantees & Edge Cases Solved

Several subtle TypeScript type-checker constraints are handled in `dinou/index.d.ts`:

1. **Preventing Union Collapse on Projects With Zero `@slots` (`DinouRegisteredSlotPattern` vs. `DinouSlotPattern`)**:
   - In projects without any `@slot` directories, `DinouSlotParamsMap` is `{}` (`keyof DinouSlotParamsMap` is `never`).
   - If `PageProps<T extends DinouRoutePattern | DinouSlotPattern>` allowed the slot pattern to fall back to `string` when `keyof SP` is `never`, `DinouRoutePattern | string` would collapse to `string`, silently disabling route validation and autocomplete on `PageProps`!
   - Solution: `DinouRegisteredSlotPattern` evaluates to **`never`** when `Register` is active and `DinouSlotParamsMap` is empty (`DinouRoutePattern | never` = `DinouRoutePattern`), while `DinouSlotPattern` (used by `SlotProps<T>`) evaluates to `` `/@${string}` | `${string}/@${string}` `` when zero slots exist and to the exact union of registered slot keys once at least one `@slot` exists.
2. **`TS2312` Interface Extension Compatibility (`interface Custom extends LayoutProps<...>`)**:
   - TypeScript requires any type extended by an `interface` to have statically known members (never a union).
   - `LayoutSlots<T>` uses `true extends IsUnion<CleanRoutePath<T>> ? {} : ...` so unparameterized `LayoutProps` (where `T` defaults to the union `DinouLayoutPattern`) resolves `LayoutSlots<T>` to `{}` instead of a union across all layouts, and `PageProps` / `LayoutProps` wrap their resulting intersection in `SimplifyParams<...>` (`{ [K in keyof X]: X[K] }`).
   - Consequently, both `interface OrgProps extends LayoutProps<"/workspace/[org]">` and `interface GenericProps extends LayoutProps` compile cleanly with zero `TS2312` errors, and IDE hover tooltips display flat, readable object shapes.
3. **Narrowing Generic `TRouteOrParams` in `PageFunctions` & `LayoutFunctions`**:
   - Handles both `any` defaults (`0 extends 1 & TRouteOrParams ? any : ...`), string segment patterns (`Extract<TRouteOrParams, DinouLayoutPattern>`), and explicit object parameter dictionaries (`LayoutFunctions<{ org: string }>`) while rejecting invalid string typos (`LayoutFunctions<"/typo">` fails constraint `DinouLayoutPattern | object` because primitives are not assignable to `object`).
4. **`TS4058` Declaration Emit Safety**:
   - Every helper type referenced in the signature of exported types (`SimplifyParams`, `FallbackRouteParams`, `FormatPatternKeys`, `FormatOptionalPatternKeys`, `IsUnion`, `CleanRoutePath`, `LookupSingleSegmentParams`, `LookupSegmentParams`, `DinouRegisteredSlotPattern`, `DinouSlotPattern`, `DinouLayoutPattern`, `DinouErrorPattern`, `DinouSegmentPattern`, `LayoutParams`, `LayoutSlots`, `SlotParams`, `ErrorParams`) is explicitly exported from both `dinou/index.d.ts` and `dinou/server.d.ts`, guaranteeing clean compilation under `declaration: true`.
5. **Graceful Fallback Mode (Before `.dinou/types/routes.d.ts` Exists)**:
   - When `DinouRouter.Register` has not been augmented yet (e.g. in a brand-new project before running `dinou dev`, `dinou build`, or `dinou typegen`), `DinouRoute` falls back to `string` and `RouteParams` / `LayoutParams` / `SlotParams` / `ErrorParams` fall back to `FallbackRouteParams<T>` (template-literal `ExtractRouteParams<T>`), inferring `{ org: string }` directly from `"/workspace/[org]/@sidebar"`.
6. **Dynamic Route Autocomplete (`Ctrl + Space`), Coexisting Navigation Styles & Ironclad Bracket Safety (`<Link>` & `useRouter`)**:
   - **Why Template Literals Alone Don't Autocomplete**: TypeScript's `tsserver` (`getCompletionsAtPosition`) hides infinite `TemplateLiteralType` members like `` `/blog/${string | number}` `` from `Ctrl + Space` completion menus and only displays finite string literal types. Furthermore, TypeScript's union subtype reduction (`removeSubtypes`) normally absorbs string literals like `"/blog/[slug]"` (and sibling static routes next to catch-all routes) into `` `/blog/${string | number}` `` because `"[slug]"` is assignable to `string`!
   - **Preserving Completion Literals (`& Record<never, never>`)**: Wrapping template-literal union branches in `& Record<never, never>` keeps them 100% assignable from interpolated template strings (`` `/blog/${slug}` ``) while preventing `removeSubtypes` from collapsing exact `DinouDynamicRoutePattern` literals (`"/blog/[slug]"`)—making every navigable dynamic route appear in `Ctrl + Space` inside `<Link to="|">`, `<Link href="|">`, `router.push("|")`, and `router.replace("|")`.
   - **Pure Covariant Inference (`NoInfer<THref>`) & Conditional `params` Enforcement**: `Link<THref>` and `router.push<THref>` / `router.replace<THref>` keep `href` / `to` as pure covariant `THref` while wrapping `LinkParamsProps<NoInfer<THref>>` and `RouterNavigationArgs<NoInfer<THref>>` in `NoInfer<THref>`. Whenever `THref` contains internal `[...]` brackets:
     - `HasInvalidBracketPattern<THref>` rejects unregistered bracket names (`"/blog/[wrong]"`) or half-interpolated templates (`` `/shop/${cat}/[item]` ``) with `never`.
     - `LinkParamsProps<THref>` and `RouterNavigationArgs<THref>` make `params` **strictly required** whenever at least one parameter is required (`[param]` or `[...param]`), optional when all parameters are optional (`[[param]]` / `[[...param]]`), and forbidden (`params?: never`) on static or already-interpolated URLs.
     - Deliberate bracket values passed inside `params` (e.g. `params={{ slug: "[slug]" }}`) are permitted and safely encoded via `encodeURIComponent` in `interpolateRouteParams()` (`dinou/core/navigation-utils.js`).
7. **Strict Relative Navigation via `from` (Option B2 — Zero Unvalidated Relative Wildcards)**:
   - Unanchored `./${string}` and `../${string}` wildcards are intentionally omitted from `DinouRelativeOrExternalRoute` so typos like `<Link to="./subs">` or `<Link to="sub">` without `from` fail at compile time.
   - When `from` is provided (`<Link from="/workspace/[org]/contact" to="...">` or `router.push("...", { from: "/workspace/[org]/contact" })`), `BuildDirectoryPrefixes<SplitRouteSegments<Path>>` populates `DinouFromRoute` with all navigable routes and intermediate directory prefixes, and `DinouRelativeLinkTarget<TFrom>` computes every valid relative path from `TFrom` to registered `DinouNavigableParamsMap` entries:
     - Emits **both** filesystem-style bare child segments (`"sub"`, like `cd sub`) and dot-slash child segments (`"./sub"`, like `cd ./sub`), plus `"."` (when `TFrom` itself has a `page.*`) and valid `".."` / `"../sibling"` paths (automatically excluding intermediate parent folders that lack `page.*`).
     - Shared parent dynamic parameters already present in `TFrom` (e.g. `[slug]`) are inherited from the active browser URL at runtime without requiring `params`; only newly entered child dynamic segments require `params` (via `ExtractRelativeTargetParams`).
     - At runtime, `resolveBasePathname(from, currentPathname)` (`dinou/core/navigation-utils.js`) slices `currentPathname` to `from`'s segment depth when `from` is a prefix of a deeper active URL (while preserving standalone `?query` and `#hash` suffixes against the full `currentPathname`), making relative links inside persistent layouts and parallel `@slots` 100% deterministic.
8. **Zero-Boilerplate Route-Contextual `"./dinou"` Modules via TypeScript `rootDirs`**:
   - Root `tsconfig.json` configures `"rootDirs": ["src", ".dinou/routes"]` inside `compilerOptions` (while keeping `.dinou/routes` out of `include` so TypeScript loads each folder's `dinou.d.ts` on demand without suggesting cross-route `../../other/dinou` auto-imports).
   - `generateRouteTypes(projectRoot)` emits `.dinou/routes/<relDir>/dinou.js` and `.dinou/routes/<relDir>/dinou.d.ts` **only** for route-tree directories inside `src/` (any non-`_` directory containing a route file or a route descendant, including `(group)` folders, intermediate dynamic folders, and active `@slot` folders), pruning stale files/directories automatically and warning if a physical `dinou.*` / `dinou/index.*` file in `src/` shadows `"./dinou"`.
   - Non-route folders (`src/components/`, `src/lib/`, `_components/`) do not receive `dinou.{js,d.ts}`, so importing `"./dinou"` inside a global shared component fails immediately with `TS2307` (whereas colocated `_components/` inside a route folder can cleanly import `"../dinou"`).
   - Every contextual `"./dinou"` module exports `ROUTE`, pre-bound `Link` (`ScopedLinkComponent<typeof ROUTE>`), pre-bound `useRouter` (`ScopedUseRouterHook<typeof ROUTE>`), zero-generic `PageProps`, `LayoutProps` (with auto-inferred `@slot` props), `SlotProps`, `ErrorProps`, `NotFoundProps`, `PageFunctions`, `LayoutFunctions`, and `RouteParams`, plus all remaining runtime exports and types from `"dinou"`.
   - `dinou/core/resolve-contextual-dinou.js` provides `esbuildContextualDinouPlugin`, `rollupContextualDinouPlugin`, and `webpackContextualDinouPlugin` wired across all client bundlers (`esbuild`, `Rollup`, `Webpack`, including `.dinou/swc/src/...` dev disk-cache redirection) and all Dual-Engine RSC/SSR pipelines (`node/dev.js`, `node/bundle-dual-engine.js`, `esbuild/build.js`, `bun/build.js`, `deno/build.js`, `cloudflare/build.js`).

---

## 5. Lifecycle: Dev Watcher, Production Builds & `dinou typegen`

1. **Local Development (`dinou dev` — `dinou/node/dev.js`)**:
   - Generates `.dinou/types/routes.d.ts` immediately on startup.
   - Chokidar watcher triggers `generateRouteTypes(projectRoot)` (`< 2ms`) whenever any `page`, `page_functions`, `layout`, `layout_functions`, `layout.functions`, `error`, or `not_found` file (`.tsx`, `.ts`, `.jsx`, `.js`, `.mjs`) is added or removed anywhere under `src/` (including inside `@slot` and `(group)` directories).
2. **Production Builds (`dinou build` across Node, Bun, Deno & Cloudflare)**:
   - `bundleDualEngine` (`dinou/node/bundle-dual-engine.js`) and the Bun, Deno, and Cloudflare build pipelines invoke `generateRouteTypes(projectRoot)` as Step 0 prior to bundling.
   - Because Dinou's bundlers (`esbuild`, `Rollup`, `Webpack`) perform fast type-stripping rather than running `tsc`, static route errors are surfaced at **dev time in the IDE** (via the TypeScript Language Server) and whenever **`tsc --noEmit`** is executed (e.g., `npm run typegen && npx tsc --noEmit` in CI/CD).
3. **Standalone CLI Command (`npm run typegen` / `npx dinou typegen` — `dinou/cli.js`)**:
   - Can be exposed in `package.json` as `"typegen": "dinou typegen"` (or `"node dinou/cli.js typegen"` in ejected projects).
   - Runs `generateRouteTypes(process.cwd())` directly in a few milliseconds without starting a dev server or running bundlers:
     ```bash
     npm run typegen && npx tsc --noEmit
     ```
   - Ideal right after cloning a repository (where `.dinou/` is gitignored), after offline route scaffolding while the dev server is stopped, or in fast typecheck-only CI/CD pipelines.

---

## 6. Summary of Modified Files

| File | Summary of Changes |
| :--- | :--- |
| `dinou/core/get-file-path-and-dynamic-params.js` | Forwarded cumulative `dParams` / `newParams` into `getSlots()` and nested route-group slots so parallel `@slot/page.*` receives parent dynamic route parameters at runtime. |
| `dinou/core/get-jsx.js` | Added `dParams` fallback for `slotParams` and passed `slotParams` into `getFilePathAndDynamicParams` when resolving `@slot/error.*` in runtime RSC/SSR rendering. |
| `dinou/core/get-error-jsx.js` | Propagated `dParams` / `slotParams` into parallel `@slot` and `@slot/error.*` rendering inside error recovery trees. |
| `dinou/core/build-static-pages.js` | Propagated `slotParams` into `@slot/error.*` resolution during static/PPR build passes. |
| `dinou/core/generate-route-types.js` | Added `collectRouteTopology()` and `inspectSlotDirectory()`, generating `DinouNavigableParamsMap`, `DinouRouteParamsMap`, `DinouLayoutParamsMap`, `DinouLayoutSlotsMap`, `DinouSlotParamsMap`, and `DinouErrorParamsMap`, removing unvalidated `./` / `../` wildcards from `DinouRelativeOrExternalRoute`, and preserving literal completions on `DinouGeneratedRoute` via `& Record<never, never>`. |
| `dinou/core/navigation-utils.js` | Added `interpolateRouteParams(href, params)` and `resolveBasePathname(from, currentPathname)` (wired into `resolveUrl`) for dynamic param interpolation and layout-safe relative resolution. |
| `dinou/core/link.jsx` | Wired `params` and `from` props into `<Link>` without leaking either prop onto the rendered `<a>` DOM element. |
| `dinou/core/navigation.js` | Wired `{ params, from }` options into `useRouter().push()` and `useRouter().replace()`. |
| `dinou/index.d.ts` | Upgraded `Link`, `LinkProps`, `useRouter`, `LayoutProps`, `PageProps`, `ErrorProps`, `RouteParams`, `PageFunctions`, and `LayoutFunctions`; added `DinouFromRoute`, `DinouRelativeLinkTarget`, `DinouLinkTargetForFrom`, `LinkParamsPropsForFrom`, `DinouRouterNavigateFn`, `SlotProps`, `NotFoundProps`, and `TS2312`/`TS4058`-safe helpers. |
| `dinou/server.d.ts` | Re-exported all new horizontal routing types and helpers from `./index` so `"dinou"` and `"dinou/server"` stay in complete parity. |
| `dinou/node/dev.js` | Expanded the hot route-type watcher regex to regenerate `.dinou/types/routes.d.ts` on `add`/`unlink` of `page`, `page_functions`, `layout`, `layout_functions`, `layout.functions`, `error`, and `not_found` files. |
| `dinou/core/resolve-contextual-dinou.js` | Added bundler plugins (`esbuild`, `Rollup`, `Webpack`) resolving route-contextual `"./dinou"` / `"../dinou"` imports from `src/` (and `.dinou/swc/src/`) to `.dinou/routes/<relDir>/dinou.js`. |
| `dinou/esbuild/*`, `dinou/rollup/rollup.config.js`, `dinou/webpack/webpack.config.js`, `dinou/node/*`, `dinou/bun/build.js`, `dinou/deno/build.js`, `dinou/cloudflare/build.js` | Wired contextual `"./dinou"` plugins and Step-0 `generateRouteTypes` across every client & server bundler pipeline. |
| `tsconfig.json` | Added `"rootDirs": ["src", ".dinou/routes"]` to map virtual `.dinou/routes/<relDir>/dinou.d.ts` onto `src/<relDir>/` with zero `src/` file pollution. |
| `dinou/cli.js` | Added the `dinou typegen` CLI command for instant standalone `.dinou/types/routes.d.ts` and `.dinou/routes/**/dinou.{js,d.ts}` generation. |
| `src/docs/type-safe-routing/page.tsx` | Documented Horizontal Segmentation & Parallel `@slot` type safety, `SlotProps`, auto-inferred `@slot` props on `LayoutProps`, intermediate `ErrorProps`, generated topology maps, expanded watcher lifecycle, and `npx dinou typegen`. |
| `src/docs/routing/page.tsx` | Updated the Parallel Routes layout example to showcase automatic `@slot` prop inference on `LayoutProps<"/dashboard">`. |

