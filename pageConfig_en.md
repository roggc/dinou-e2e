# Knowledge Transfer: `export default pageConfig` and `layoutConfig` (Dinou v7.1.0)

This document details the feature introduced in **Dinou v7.1.0**, the architectural design motivations, and all developer experience (DX) and TypeScript typing advantages. It is written to serve as a knowledge transfer base for the official documentation in `dinou-docs`.

---

## 1. Feature Summary in v7.1.0

Starting with version **7.1.0**, Dinou officially supports **two declaration models** for route lifecycle contracts in `page_functions` and `layout_functions`:

1. **Traditional Model (Named Exports):** Individual named exports for each contract (`export const revalidate = ...`, `export const getProps = ...`, etc.).
2. **Consolidated Model (Default Export Config Object - New):** A single typed configuration object exported via `export default pageConfig` or `export default layoutConfig`.

Both models are **fully interchangeable and backward compatible**: an application can mix routes using named exports and routes using `export default`, both in standard (non-ejected) mode and in ejected mode (`dinou eject`).

---

## 2. Motivation and Architectural Rationale

### 2.1. Resolving Framework Asymmetry
In Dinou's type declarations (`dinou/index.d.ts`), official types already existed:
```ts
export type PageFunctions<TRouteOrParams = any, TProps = any> = RouteSegmentConfig<...>;
export type LayoutFunctions<TRouteOrParams = any, TProps = any> = RouteSegmentConfig<...>;
```
However, there was an **architectural asymmetry**:
- The TypeScript type system defined `PageFunctions` as a single consolidated **object** (`RouteSegmentConfig`).
- The Dinou runtime (prior to v7.1) only inspected **individual named exports** at the module level (`mod.getProps`, `mod.revalidate`, etc.).

This turned `PageFunctions` and `LayoutFunctions` into "orphaned" types: they existed in the `.d.ts` definitions but could not be applied as a single exported contract recognized by the engine.

### 2.2. The Fragility of Previous Workarounds
Prior to v7.1.0, developers who wanted to use `PageFunctions` to type all contracts in a single block had to resort to forced destructuring:

```ts
// ⚠️ Fragile workaround prior to v7.1.0
const pageConfig: PageFunctions<"/blog/[slug]", BlogProps> = {
  ppr: true,
  revalidate: 60,
  getProps: async (params) => { ... },
  validateParams: (params) => { ... },
  allowISG: false,
};

// Manual destructuring was required for the runtime to detect them:
export const { ppr, revalidate, getProps, validateParams, allowISG } = pageConfig;
```

This workaround introduced two critical flaws:
1. **Silent Desynchronization (Human Error):** If a developer added a new property to the configuration object (such as `allowISG: false` or `getCacheTags`) but forgot to include it in the final destructuring line, TypeScript gave no error, but Dinou never received the configuration at runtime.
2. **Static AST Analysis Limitations:** Compilers and parsers (like SWC or Babel) easily identify direct declarations (`Identifier`), but destructuring patterns (`ObjectPattern`) make static extraction during build time difficult or impossible (such as build-time `ppr` route manifest detection).

Native support for `export default pageConfig` completely eliminates this boilerplate and its risks.

---

## 3. Code Comparison

### A) Before (or using Named Exports)
```ts
// src/blog/[slug]/page_functions.ts
import type { RouteParams } from "dinou";

type BlogParams = RouteParams<"/blog/[slug]">;

export const ppr = true;
export const revalidate = 60;
export const allowISG = true;

export const getStaticPaths = async () => ["getting-started", "whats-new-in-v7"];

export const validateParams = (params: BlogParams) => Boolean(params?.slug);

export const getCacheTags = (params: BlogParams) => ["blog", `post-${params?.slug}`];

export const getProps = async (params: BlogParams) => {
  const post = await fetchPost(params.slug);
  return { post };
};
```

### B) In v7.1.0: Using `export default pageConfig`
```ts
// src/blog/[slug]/page_functions.ts
import type { PageFunctions } from "dinou";

interface BlogProps {
  post: { title: string; content: string };
}

const pageConfig: PageFunctions<"/blog/[slug]", BlogProps> = {
  ppr: true,
  revalidate: 60,
  allowISG: true,
  getStaticPaths: ["getting-started", "whats-new-in-v7"],
  validateParams: (params) => Boolean(params?.slug),
  getCacheTags: (params) => ["blog", `post-${params?.slug}`],
  getProps: async (params) => {
    const post = await fetchPost(params.slug);
    return { post };
  },
};

export default pageConfig;
```

---

## 4. Key Advantages: User & TypeScript DX

### 1. Cascading Type Inference (Single Point of Truth)
Typing the configuration object once with `PageFunctions<"/blog/[slug]", BlogProps>` (or passing a custom params interface `PageFunctions<BlogParams, BlogProps>`):
- Automatically propagates parameter types to:
  - `getProps(params)`
  - `validateParams(params)`
  - `getCacheTags(params)`
  - `getStaticPaths()`
- Validates the return type of `getProps` strictly against `BlogProps`.
- **Zero repetition:** No need to import `RouteParams` or duplicate parameter signatures across 4 or 5 separate functions.

### 2. Full IDE Autocomplete & Discoverability
Pressing `Ctrl + Space` inside the object brackets immediately displays all recognized Dinou contracts:
- `ppr`
- `revalidate`
- `getStaticPaths`
- `allowISG`
- `validateParams`
- `getCacheTags`
- `getProps`

This prevents common typos (e.g., writing `getcachetags` or `getStaticParam`) and catches invalid properties at compile time.

### 3. Value / Function Duality in Contracts
The configuration object fully supports Dinou v7.0+ value/function duality:
- `ppr`: `true` | `false` | `() => boolean` | `async () => Promise<boolean>`
- `revalidate`: `number` (ISR seconds) | `false` (immutable cache) | `0` (dynamic SSR) | sync/async function
- `allowISG`: `boolean` | sync/async function
- `getCacheTags`: `string[]` | `(params) => string[]` | `async (params) => Promise<string[]>`
- `getStaticPaths`: direct array | sync/async generator function

### 4. Modern JS/TS Idiomatic Cohesion
Matches modern ecosystem standards (`vite.config.ts`, `playwright.config.ts`, Astro, TanStack Router). Route configuration is handled as a single cohesive unit rather than scattered global variables.

### 5. Higher-Order Configs & Composition
Because it is a standard JavaScript object, reusable higher-order wrappers can easily apply shared policies across multiple routes:

```ts
// src/utils/route-helpers.ts
import type { PageFunctions } from "dinou";

export function withProtectedCache<TParams, TProps>(
  config: PageFunctions<TParams, TProps>
): PageFunctions<TParams, TProps> {
  return {
    ...config,
    revalidate: process.env.NODE_ENV === "production" ? 120 : 0,
    getCacheTags: (params) => [
      "tenant-global",
      ...(typeof config.getCacheTags === "function" ? config.getCacheTags(params) : config.getCacheTags || [])
    ],
  };
}
```
```ts
// src/dashboard/page_functions.ts
import { withProtectedCache } from "@/utils/route-helpers";

export default withProtectedCache({
  getProps: async () => ({ stats: await fetchStats() }),
});
```
> *Note: Whole-configuration wrapping like this is virtually impossible with individual named exports.*

### 6. Encapsulation and Private Helper Functions
In complex `page_functions.ts` files containing database clients, local constants, or helper utilities (e.g. `function formatSlug(...)`), using `export default pageConfig` ensures that internal helpers remain strictly private to the module without risk of accidental export leaks.

---

## 5. Precedence and Overriding: Coexistence of `default` with Named Exports

A key design choice in Dinou v7.1.0 is the **harmonious coexistence** of both models. Developers do not need to choose exclusively between them; both can be combined in the same file.

### Dinou Resolution Rule:
> **Named Exports take absolute precedence over the Default Export.**
>
> When resolving each individual contract (`revalidate`, `ppr`, `getProps`, `validateParams`, `allowISG`, `getStaticPaths`, `getCacheTags`), Dinou first checks whether a named export exists on the module. If it does not, it falls back to the property on the `default` export.

### Use Case 1: Overriding contracts in a shared `baseConfig`
Import a shared configuration common to a section, export it as `default`, and **override a specific directive** via a named export:

```ts
// src/blog/[slug]/page_functions.ts
import baseBlogConfig from "@/config/base-blog.config";

// Export the shared configuration (getProps, validateParams, getStaticPaths, etc.)
export default baseBlogConfig;

// ⚡ Specific override for this route:
// While baseBlogConfig defines revalidate = 3600 (ISR),
// this specific page requires real-time dynamic SSR:
export const revalidate = 0;
```

### Use Case 2: Adding supplementary contracts to a `pageConfig`
Declare static flags in the default object while exporting contracts with heavy runtime dependencies as named exports:

```ts
// src/products/[id]/page_functions.ts
import type { PageFunctions } from "dinou";

const pageConfig: PageFunctions<"/products/[id]"> = {
  ppr: true,
  revalidate: 60,
  allowISG: true,
};

export default pageConfig;

// Add getProps as a named export:
export const getProps = async (params) => {
  const product = await fetchProduct(params.id);
  return { product };
};
```

---

## 6. Generics Flexibility in `PageFunctions` and `LayoutFunctions`

The formal type signature in Dinou is:
```ts
export type PageFunctions<TRouteOrParams = any, TProps = any> = RouteSegmentConfig<...>;
export type LayoutFunctions<TRouteOrParams = any, TProps = any> = RouteSegmentConfig<...>;
```

Both type parameters are **entirely optional** (defaulting to `any`), adapting gracefully to each route's needs without forcing redundant type boilerplate:

### 1. Zero Generics (`PageFunctions` / `LayoutFunctions`)
When the page or layout only needs segment-level directives (such as `ppr`, `revalidate`, or `allowISG`) without dynamic parameter validation or `getProps`:

```ts
// src/about/page_functions.ts
import type { PageFunctions } from "dinou";

// ✅ No generics required
const pageConfig: PageFunctions = {
  ppr: true,
  revalidate: 86400, // 24h cache
};

export default pageConfig;
```

### 2. Route Generic Only: Dynamic Route without `getProps` (`PageFunctions<TRoute>`)
When the route has dynamic parameters used in `validateParams`, `getCacheTags`, or `getStaticPaths`, but **does not implement `getProps`** (e.g. data fetching is performed directly inside the `page.tsx` Server Component):

```ts
// src/docs/[section]/[slug]/page_functions.ts
import type { PageFunctions } from "dinou";

// ✅ Pass the route pattern only; infers { section: string; slug: string }
const pageConfig: PageFunctions<"/docs/[section]/[slug]"> = {
  revalidate: 3600,
  validateParams: (params) => params.section === "guides",
  getCacheTags: (params) => ["docs", params.section],
  getStaticPaths: [
    { section: "guides", slug: "get-started" },
    { section: "guides", slug: "installation" },
  ],
};

export default pageConfig;
```

### 3. Both Generics: Dynamic Route with Typed `getProps` (`PageFunctions<TRoute, TProps>`)
When `getProps` is implemented and TypeScript must verify both parameter inputs and the returned props structure:

```ts
// src/shop/[id]/page_functions.ts
import type { PageFunctions } from "dinou";

interface ShopProps {
  item: { id: string; name: string; price: number };
}

// ✅ Comprehensive typing: params inferred and getProps return value validated
const pageConfig: PageFunctions<"/shop/[id]", ShopProps> = {
  getProps: async (params) => {
    const item = await fetchItem(params.id);
    return { item }; // TypeScript validates against ShopProps
  },
};

export default pageConfig;
```

### 4. Custom Parameter Interface
Instead of passing a route pattern string, you can pass a custom parameter type directly:
```ts
interface CustomParams {
  category: string;
}

const pageConfig: PageFunctions<CustomParams> = {
  validateParams: (params) => params.category !== "drafts",
};
```

---

## 7. Applicability to `layout_functions`

Everything documented above applies 100% identically to `layout_functions.ts` using the `LayoutFunctions` type:

```ts
// src/admin/layout_functions.ts
import type { LayoutFunctions } from "dinou";

interface AdminLayoutProps {
  userSession: { role: string; email: string };
}

const layoutConfig: LayoutFunctions<"/admin/[...rest]", AdminLayoutProps> = {
  ppr: true,
  revalidate: 0, // Admin layout is always dynamic
  getProps: async (params) => {
    const session = await getAdminSession();
    return { userSession: session };
  },
};

export default layoutConfig;
```

---

## 8. Quick Reference Guide for Official Docs (`dinou-docs`)

| Criterion | Named Exports (`export const ...`) | Default Export (`export default pageConfig`) | Hybrid Mode (`default` + `named`) |
| :--- | :--- | :--- | :--- |
| **Mental Model** | Next.js App Router style variables | Config / Vite / Astro style object | `baseConfig` with local overrides |
| **TypeScript Inference** | Manual per individual function | Centralized via generic (`PageFunctions`) | Centralized with granular overrides |
| **Discoverability (Autocomplete)** | Must know export names by heart | `Ctrl + Space` inside object brackets | Autocomplete on the base config object |
| **Dinou Precedence** | **High** (overrides default export) | **Base** (fallback if no named export) | Named export wins contract-by-contract |
| **Composition (Middlewares)** | High boilerplate per export | Native (functions taking and returning config) | Composable via wrapper + named override |
| **Desync Risk** | N/A | Zero (no intermediate destructuring step) | Zero |
| **Dinou Compatibility** | $\ge$ v1.0.0 | $\ge$ v7.1.0 | $\ge$ v7.1.0 |
