# Dinou v7: Master Knowledge Handover & Architectural Compendium

> **Authoritative Knowledge Base for Dinou v7**  
> *Target Audience:* Incoming AI Assistants, Core Framework Maintainers, and Senior Full-Stack Engineers.  
> *Language:* English  
> *Last Updated:* October 2026 (Reflecting Dinou v7.2+ with Zero-Fork Architecture, Type-Safe Routing, and Universal Multi-Runtime Engine).

---

## Table of Contents

1. [Executive Summary & Framework Philosophy](#1-executive-summary--framework-philosophy)
2. [The Architectural Paradigm Shift (v6 to v7)](#2-the-architectural-paradigm-shift-v6-to-v7)
   - [2.1 The Historical React 19 Bottleneck: The Dual Condition Conflict](#21-the-historical-react-19-bottleneck-the-dual-condition-conflict)
   - [2.2 The Legacy v6 Flaw: Child Process Forking (`child_process.fork`)](#22-the-legacy-v6-flaw-child-process-forking-child_processfork)
   - [2.3 The Dinou v7 Breakthrough: Universal 3-Pass AOT Dual-Bundle Pipeline](#23-the-dinou-v7-breakthrough-universal-3-pass-aot-dual-bundle-pipeline)
   - [2.4 Architectural Comparison Matrix: v6 vs v7](#24-architectural-comparison-matrix-v6-vs-v7)
3. [Core Breaking Changes (Dinou v6 vs Dinou v7)](#3-core-breaking-changes-dinou-v6-vs-dinou-v7)
   - [3.1 Direct Props Return in `getProps`](#31-direct-props-return-in-getprops)
   - [3.2 Strict Seconds (`s`) Time Unit for `revalidate`](#32-strict-seconds-s-time-unit-for-revalidate)
   - [3.3 Elimination of `dynamic`: Single Source of Truth via `revalidate`](#33-elimination-of-dynamic-single-source-of-truth-via-revalidate)
   - [3.4 Build-Time Static Site Generation (SSG)](#34-build-time-static-site-generation-ssg)
   - [3.5 Zero-Remount Layout Preservation](#35-zero-remount-layout-preservation)
   - [3.6 Elimination of Express Hooks: Universal Middleware (`onRequest`)](#36-elimination-of-express-hooks-universal-middleware-onrequest)
   - [3.7 100% In-Memory Dev Engine & SWC Disk-Mirror](#37-100-in-memory-dev-engine--swc-disk-mirror)
4. [Type-Safe Routing System (Level 1 & Level 2)](#4-type-safe-routing-system-level-1--level-2)
   - [4.1 Architecture & Zero-Runtime Guarantee](#41-architecture--zero-runtime-guarantee)
   - [4.2 Level 1: Outward Navigation (`<Link>`, `useRouter`, `DinouRoute`)](#42-level-1-outward-navigation-link-userouter-dinouroute)
   - [4.3 Level 2: Inward Consumption (`PageProps`, `LayoutProps`, `RouteParams`, `ErrorProps`)](#43-level-2-inward-consumption-pageprops-layoutprops-routeparams-errorprops)
   - [4.4 Route Scanner & Parameter Mapping Reference](#44-route-scanner--parameter-mapping-reference)
   - [4.5 Dynamic Navigation & TypeScript Literal Caveats](#45-dynamic-navigation--typescript-literal-caveats)
5. [Layered Segmentation & Rendering Architecture](#5-layered-segmentation--rendering-architecture)
   - [5.1 Horizontal Segmentation (Decoupled Layouts & Pages)](#51-horizontal-segmentation-decoupled-layouts--pages)
   - [5.2 Independent Layout Lifecycles (`layout_functions.ts`)](#52-independent-layout-lifecycles-layout_functionsts)
   - [5.3 Vertical Segmentation: Micro-ISR with `<DinouCacheSlot>`](#53-vertical-segmentation-micro-isr-with-dinoucacheslot)
   - [5.4 Partial Prerendering (PPR) Architecture](#54-partial-prerendering-ppr-architecture)
   - [5.5 Query String Sensitivity (`searchPart`)](#55-query-string-sensitivity-searchpart)
6. [Caching & Invalidation Architecture](#6-caching--invalidation-architecture)
   - [6.1 The Two Decoupled Cache Layers](#61-the-two-decoupled-cache-layers)
   - [6.2 Server Invalidation Primitives: `revalidatePage`, `revalidatePath`, `revalidateTag`](#62-server-invalidation-primitives-revalidatepage-revalidatepath-revalidatetag)
   - [6.3 Client Router Cache Management (`<Link fresh>`, `router.refresh()`)](#63-client-router-cache-management-link-fresh-routerrefresh)
   - [6.4 RSC Wire Protocol & Internal Endpoints (`window.__DINOU_USE_STATIC__`)](#64-rsc-wire-protocol--internal-endpoints-window__dinou_use_static__)
   - [6.5 Storage Engine (`StorageAdapter`), KV vs Filesystem, Metadata Isolation](#65-storage-engine-storageadapter-kv-vs-filesystem-metadata-isolation)
7. [Error Handling, Boundaries & Production Security](#7-error-handling-boundaries--production-security)
   - [7.1 Server Component Error Pages (`error.tsx`)](#71-server-component-error-pages-errortsx)
   - [7.2 Two-Level Error Isolation (`SlotErrorBoundary` vs `InnerErrorBoundary`)](#72-two-level-error-isolation-sloterrorboundary-vs-innererrorboundary)
   - [7.3 React 19 `SuspenseException` Handling](#73-react-19-suspenseexception-handling)
   - [7.4 Strict Production Security Contract: Error Stack Sanitization](#74-strict-production-security-contract-error-stack-sanitization)
8. [Client Navigation Engine & History Management](#8-client-navigation-engine--history-management)
   - [8.1 SPA Navigation Lifecycle & Fast Refresh](#81-spa-navigation-lifecycle--fast-refresh)
   - [8.2 Hash Fragment Navigation & Async Scroll Restoration](#82-hash-fragment-navigation--async-scroll-restoration)
   - [8.3 Native HTML5 Interactions in Server Components](#83-native-html5-interactions-in-server-components)
9. [Universal Deployment Architecture ("Deploy Everywhere")](#9-universal-deployment-architecture-deploy-everywhere)
   - [9.1 Node.js Standalone (Docker, PM2, VPS)](#91-nodejs-standalone-docker-pm2-vps)
   - [9.2 Bun Standalone & Single-Binary Compilation](#92-bun-standalone--single-binary-compilation)
   - [9.3 Deno & Deno Deploy](#93-deno--deno-deploy)
   - [9.4 Cloudflare Workers (Wrangler + KV / Assets)](#94-cloudflare-workers-wrangler--kv--assets)
   - [9.5 Netlify Functions v2](#95-netlify-functions-v2)
   - [9.6 100% Pure Static Site Generation (SSG Export)](#96-100-pure-static-site-generation-ssg-export)
   - [9.7 The Standard Static Assets Directory (`public/`)](#97-the-standard-static-assets-directory-public)
10. [Configuration, Tooling & Scaffolding](#10-configuration-tooling--scaffolding)
    - [10.1 Scaffolding: `create-dinou`](#101-scaffolding-create-dinou)
    - [10.2 Configuration API (`dinou.config.js`)](#102-configuration-api-dinouconfigjs)
    - [10.3 Bundler Agnosticism (Esbuild, Rollup, Webpack)](#103-bundler-agnosticism-esbuild-rollup-webpack)
    - [10.4 Port Selector & Dev Tooling](#104-port-selector--dev-tooling)
    - [10.5 CLI Commands & Scripts Reference](#105-cli-commands--scripts-reference)
11. [Golden Rules & Knowledge Transfer Checklist](#11-golden-rules--knowledge-transfer-checklist)

---

## 1. Executive Summary & Framework Philosophy

**Dinou** (Catalan for *"Nineteen"* / 19) is a next-generation full-stack React framework built from the ground up for **React 19**, React Server Components (RSC), and native streaming.

### Core Philosophy: "Deploy Everywhere" (Zero Vendor Lock-In)
Unlike frameworks heavily coupled to proprietary clouds (e.g. Vercel) or dependent on Node.js-only legacy APIs (like Express, cluster modules, or filesystem mutation hooks), Dinou v7 treats **W3C Web Standards** as its universal primitive:
- `Request`
- `Response`
- `Headers`
- `ReadableStream`
- `URL`

Any platform that implements the standard Web Fetch API can run Dinou natively without shims, emulators, or performance compromises. A single Dinou project can be compiled to Node.js, Bun, Deno, Cloudflare Workers, Netlify Functions, or exported as pure static HTML (SSG) with identical developer semantics.

---

## 2. The Architectural Paradigm Shift (v6 to v7)

### 2.1 The Historical React 19 Bottleneck: The Dual Condition Conflict

React 19 introduced strict ESM export conditions that conflict inside a single Node.js runtime process:
- Server Components require the `"react-server"` condition (`react`, `react-dom/server.edge`).
- Client Components, SSR HTML hydration, and runtime libraries require the standard `"browser"` or `"node"` condition (`react-dom/client`, `react-dom/server`).

Node.js cannot resolve both `"react-server"` and standard conditions simultaneously for the same module specifiers within a single execution context.

### 2.2 The Legacy v6 Flaw: Child Process Forking (`child_process.fork`)

To circumvent this conflict, Dinou v6 used process-level isolation:
1. The main server ran in standard Node.js mode for SSR and HTTP routing.
2. Every RSC execution was delegated to a spawned child process via `child_process.fork()`.
3. Communication happened over Node IPC serialization.

**Critical Weaknesses of Dinou v6:**
- **IPC Bottleneck:** High-throughput JSON/Flight stream serialization through IPC pipes created latency spikes under load.
- **Heavy Memory Footprint:** Spawning two runtime Node.js processes required 120MB+ idle memory.
- **Zero Edge/Serverless Portability:** Cloudflare Workers, Deno Deploy, and serverless environments prohibit `child_process.fork()`, confining v6 strictly to long-running Node.js virtual machines.
- **Fragile Dev Server:** Watcher restarts caused zombie child processes and desynchronized ports.

### 2.3 The Dinou v7 Breakthrough: Universal 3-Pass AOT Dual-Bundle Pipeline

Dinou v7 completely eliminated `child_process.fork()`. The dual condition problem was shifted from **runtime execution** to **Ahead-Of-Time (AOT) compilation**.

```
                           Source Code (`src/`)
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
   [Pass 1: RSC Compiler]                             [Pass 2: SSR Compiler]
Condition: ["react-server"]                           Condition: ["node" / "browser"]
Produces: `rsc-engine.mjs`                            Produces: `ssr-engine.mjs`
Exports: `renderRSC(route, params)`                   Exports: `renderHTML(stream, ...)`
           │                                                   │
           └─────────────────────────┬─────────────────────────┘
                                     ▼
                      [Pass 3: Unified Orchestrator]
                      Engine: `dinou/core/handler.js`
                 Single Thread / Zero IPC / Flat Memory
```

#### Pass 1: RSC Component Engine (`rsc-engine.mjs`)
Compiled with the `"react-server"` condition. It contains the Server Components, server data fetching functions, and `react-server-dom-*` Flight encoders. It exposes a pure Web Stream generator:
```javascript
export async function renderRSC(routeId, params, request) {
  // Returns ReadableStream of React Flight packets
}
```

#### Pass 2: SSR HTML Streaming Engine (`ssr-engine.mjs`)
Compiled with standard client conditions (`"browser"`, `"node"`). It consumes the Flight stream produced by Pass 1, reconstructs the React element tree via `createFromReadableStream`, and pipes it into `renderToReadableStream` (or `renderToPipeableStream`) to generate the initial HTML document.

#### Pass 3: Unified Single-Binary Orchestrator
The runtime entry point (`handler.js`) imports both compiled engines directly into the same process. It manages caching, layouts, routing, and headers without any child process or IPC pipe.

### 2.4 Architectural Comparison Matrix: v6 vs v7

| Metric / Dimension | Dinou v6 (Legacy) | Dinou v7 (Current Standard) | Impact / Evolution |
| :--- | :--- | :--- | :--- |
| **Architecture** | Dual-Process via `child_process.fork` | Single-Process Dual-Bundle AOT (0-Fork) | Infinite scalability, zero IPC |
| **Memory Footprint** | ~120 MB idle per instance | ~22 MB idle (Flat footprint) | **82% memory reduction** |
| **Request Latency** | Inter-process serialization penalty | In-memory stream piping (`ReadableStream`) | Sub-millisecond TTFB |
| **Edge & Serverless** | ❌ Impossible (No `fork` at Edge) | ✅ Native (Node, Bun, Deno, Cloudflare) | 100% universal deployment |
| **Single Binary** | ❌ Unsupported | ✅ `deno compile` / `bun build --compile` | Self-contained binary distribution |
| **Dev Engine** | Dual-process file watcher | In-memory VFS + SWC fast path | Sub-20ms HMR updates |
| **Dev Assets** | Written to `.dinou/` disk cache | 100% in-memory RAM serving | Zero disk wear, zero I/O lock |
| **Time Unit** | Ambiguous (mixed ms and s) | Strictly Seconds (`s`) across all APIs | Clear, predictable ISR contracts |
| **Layout State** | Remounted on navigation | Persistent across SPA transitions | 100% state & scroll preservation |

---

## 3. Core Breaking Changes (Dinou v6 vs Dinou v7)

When migrating codebases or assisting developers upgrading from v6 to v7, ensure the following contracts are adhered to:

### 3.1 Direct Props Return in `getProps`

In v6, server data functions had to return a nested object `{ page: ... }`.  
In v7, `getProps` returns the props object directly and receives route params cleanly:

```typescript
// ❌ Dinou v6 (Legacy - DO NOT USE)
export async function getProps({ params }) {
  const user = await db.getUser(params.id);
  return {
    page: { user, title: user.name }
  };
}

// ✅ Dinou v7 (Current Standard)
export async function getProps(params: { id: string }) {
  const user = await db.getUser(params.id);
  return {
    user,
    title: user.name
  };
}
```

### 3.2 Strict Seconds (`s`) Time Unit for `revalidate`

In v6, revalidation timers frequently mixed milliseconds and seconds, leading to subtle bugs. In Dinou v7, **every time unit is strictly in seconds**:

```typescript
// ❌ Dinou v6
export const revalidate = 60000; // Was 60,000 milliseconds

// ✅ Dinou v7
export const revalidate = 60; // Exactly 60 seconds (1 minute)
```

### 3.3 Elimination of `dynamic`: Single Source of Truth via `revalidate`

v6 included a `dynamic = "force-static" | "force-dynamic"` export that often contradicted `revalidate`. In v7, `dynamic` has been completely eliminated. `revalidate` is the single source of truth:

| Value of `revalidate` | Rendering Mode | Behavior |
| :--- | :--- | :--- |
| `false` | **Pure Static (SSG)** | Pre-rendered once at build time. Cached indefinitely until manual invalidation. |
| `0` | **Dynamic SSR** | Rendered on every single incoming HTTP request on the fly. |
| `N` (number > 0) | **Time-Based ISR** | Pre-rendered, served from cache, and revalidated in the background after `N` seconds (stale-while-revalidate). |

### 3.4 Build-Time Static Site Generation (SSG)

In v6, SSG pages were compiled dynamically on the first server launch. In v7:
- All static pages (`revalidate = false` or fixed static routes) are rendered during `dinou build`.
- The production server starts instantly with 0ms pre-warming overhead.

### 3.5 Zero-Remount Layout Preservation

In v6, navigating between sibling pages would unmount and remount parent layouts. In v7, Dinou's client router (`client.jsx`) isolates the page slot (`<DinouPageSlot>`). Parent layouts remain mounted in the React DOM, preserving:
- Audio/video player state
- Open sidebar/dropdown states
- Scroll positions of sub-containers
- Client-side form input values

### 3.6 Elimination of Express Hooks: Universal Middleware (`onRequest`)

v6 exposed `onServerInit(app)` hooks that passed an Express instance, breaking non-Node deployments. v7 replaces this with a universal W3C Web Middleware in `dinou.config.js`:

```javascript
// dinou.config.js
export default {
  // Runs before any Dinou internal handler across Node, Bun, Deno, and Cloudflare
  async onRequest(req, next) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/protected')) {
      const auth = req.headers.get('Authorization');
      if (!auth) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    return next();
  }
};
```

### 3.7 100% In-Memory Dev Engine & SWC Disk-Mirror

During `npm run dev`, all bundle outputs, transforms, and CSS chunks are stored in an in-memory Virtual File System (VFS). Disk writes are bypassed entirely.
- For massive enterprise codebases (500+ routes), Dinou provides an optional SWC disk-mirror (`useSwcDiskMirror: true`), which caches AST transforms in `.dinou/dev-cache/` for instant cold starts.

---

## 4. Type-Safe Routing System (Level 1 & Level 2)

Dinou v7 features an automatic, bidirectional, compile-time type-safe routing engine.

```
                    Filesystem Route Scanner
                 (`dinou/core/generate-route-types.js`)
                                   │
               Scans `src/` routes & dynamic segments
                                   │
                                   ▼
                       `.dinou/types/routes.d.ts`
                                   │
       ┌───────────────────────────┴───────────────────────────┐
       ▼                                                       ▼
[Level 1: Outward Navigation]                           [Level 2: Inward Consumption]
`<Link href="...">`                                     `PageProps<T>`
`useRouter().push(...)`                                 `LayoutProps<T>`
`DinouRoute`                                            `ErrorProps<T>`
```

### 4.1 Architecture & Zero-Runtime Guarantee
- The scanner runs on dev server startup and watches route file creation/deletion.
- It produces TypeScript declaration merges into `.dinou/types/routes.d.ts`.
- **Zero Runtime Overhead:** Route types exist only during compilation and IDE autocompletion. Zero extra bytes are shipped to the browser.

### 4.2 Level 1: Outward Navigation (`<Link>`, `useRouter`, `DinouRoute`)

`Link` and `useRouter` restrict `href` and destination arguments strictly to valid application routes:

```tsx
import { Link, useRouter } from 'dinou';

export default function Navigation() {
  const router = useRouter();

  return (
    <nav>
      {/* Autocompletes valid routes; TypeScript errors on typos */}
      <Link href="/docs/getting-started">Getting Started</Link>
      
      {/* Dynamic routes require valid string interpolation */}
      <Link href={`/blog/${postId}` as const}>Read Post</Link>

      <button onClick={() => router.push('/dashboard')}>
        Go to Dashboard
      </button>
    </nav>
  );
}
```

#### Custom Navigators via `DinouRoute`
To build reusable design-system buttons or breadcrumbs that accept valid routes:

```tsx
import type { DinouRoute } from 'dinou';

interface ButtonProps {
  label: string;
  to: DinouRoute;
}

export function ActionButton({ label, to }: ButtonProps) {
  return <Link href={to}>{label}</Link>;
}
```

### 4.3 Level 2: Inward Consumption (`PageProps`, `LayoutProps`, `RouteParams`, `ErrorProps`)

Pages, layouts, and error components use generic helpers to strongly type `params`:

```tsx
// src/blog/[category]/[slug]/page.tsx
import type { PageProps, RouteParams } from 'dinou';

// Explicitly bind the route pattern string:
type BlogPostProps = PageProps<'/blog/[category]/[slug]'>;

export async function getProps(params: RouteParams<'/blog/[category]/[slug]'>) {
  // params.category: string
  // params.slug: string
  const post = await fetchPost(params.category, params.slug);
  return { post };
}

export default function BlogPostPage({ params, post }: BlogPostProps) {
  return (
    <article>
      <h1>{post.title}</h1>
      <p>Category: {params.category} | Slug: {params.slug}</p>
    </article>
  );
}
```

### 4.4 Route Scanner & Parameter Mapping Reference

| Filesystem Path Pattern | Normalized Route Pattern | Resolved TypeScript `params` Type | Description |
| :--- | :--- | :--- | :--- |
| `src/page.tsx` | `"/"` | `{}` | Root homepage |
| `src/about/page.tsx` | `"/about"` | `{}` | Static segment |
| `src/users/[id]/page.tsx` | `"/users/[id]"` | `{ id: string }` | Single dynamic parameter |
| `src/shop/[cat]/[item]/page.tsx` | `"/shop/[cat]/[item]"` | `{ cat: string; item: string }` | Multiple dynamic parameters |
| `src/docs/[...slug]/page.tsx` | `"/docs/[...slug]"` | `{ slug: string[] }` | Catch-all dynamic segments |
| `src/settings/[[tab]]/page.tsx` | `"/settings/[[tab]]"` | `{ tab?: string }` | Optional dynamic segment |
| `src/archive/[[...slug]]/page.tsx` | `"/archive/[[...slug]]"` | `{ slug?: string[] }` | Optional catch-all segments |

### 4.5 Dynamic Navigation & TypeScript Literal Caveats

TypeScript treats template literals like `\`/${dynamicVar}\`` as a generic `string` unless typed or constrained. To maintain Level 1 type safety when navigating dynamically:

```tsx
// Option A: Use 'as const' or explicit casting
<Link href={`/users/${userId}` as `/users/[id]`}>Profile</Link>

// Option B: Standard template string (if router allows loose strings for dynamic paths)
<Link href={`/users/${encodeURIComponent(userId)}`}>Profile</Link>
```

> **Warning on Trailing Slashes:** Dinou standardizes canonical routes without trailing slashes. `/about` is valid; `/about/` will trigger a TypeScript type mismatch if strict route types are enforced.

---

## 5. Layered Segmentation & Rendering Architecture

Dinou v7 introduces **Layered Segmentation**, separating layout and page rendering horizontally and micro-component rendering vertically.

```
┌───────────────────────────────────────────────────────────┐
│ Root Layout (`src/layout.tsx`) - Cached independently     │
│ ┌───────────────────────────────────────────────────────┐ │
│ │ Nested Section Layout (`src/dashboard/layout.tsx`)     │ │
│ │ ┌───────────────────────────────────────────────────┐ │ │
│ │ │ Page Slot (`<DinouPageSlot>`)                     │ │ │
│ │ │ ┌───────────────────────────────────────────────┐ │ │ │
│ │ │ │ Static Shell Content                          │ │ │ │
│ │ │ │ ┌───────────────────────────────────────────┐ │ │ │ │
│ │ │ │ │ `<DinouCacheSlot id="ticker" revalidate=5>`│ │ │ │
│ │ │ │ └───────────────────────────────────────────┘ │ │ │ │
│ │ │ │ ┌───────────────────────────────────────────┐ │ │ │ │
│ │ │ │ │ PPR Dynamic Hole (`data-ppr-hole="cart"`) │ │ │ │ │
│ │ │ │ └───────────────────────────────────────────┘ │ │ │ │
│ │ │ └───────────────────────────────────────────────┘ │ │ │
│ │ └───────────────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 5.1 Horizontal Segmentation (Decoupled Layouts & Pages)

In traditional frameworks, rendering a page requires re-evaluating all parent layouts. In Dinou v7:
1. **Layouts are compiled as isolated endpoints.**
2. When a user navigates from `/dashboard/analytics` to `/dashboard/settings`, the server returns **only the page slot RSC stream** (`/__dinou_rsc__/page?route=...`).
3. The parent layout is neither re-rendered on the server nor remounted on the client.

### 5.2 Independent Layout Lifecycles (`layout_functions.ts`)

Layouts can fetch data independently from pages by creating a `layout_functions.ts` file in the same directory:

```typescript
// src/dashboard/layout_functions.ts
export const revalidate = 300; // Cache dashboard layout for 5 minutes

export async function getProps() {
  const notifications = await fetchUnreadNotifications();
  return { notifications };
}
```

```tsx
// src/dashboard/layout.tsx
import type { LayoutProps } from 'dinou';

export default function DashboardLayout({ children, notifications }: LayoutProps<'/dashboard'> & { notifications: any[] }) {
  return (
    <div className="dashboard-grid">
      <aside>Unread: {notifications.length}</aside>
      <main>{children}</main>
    </div>
  );
}
```

### 5.3 Vertical Segmentation: Micro-ISR with `<DinouCacheSlot>`

When a page contains both static content and rapidly changing components, wrapping the high-frequency component in `<DinouCacheSlot>` enables independent caching:

```tsx
import { DinouCacheSlot } from 'dinou';

export const revalidate = 3600; // Whole page cached for 1 hour

export default function MarketOverviewPage() {
  return (
    <div>
      <h1>Global Stock Exchange</h1>
      <p>This static analysis refreshes once per hour.</p>

      {/* This specific slot refreshes every 10 seconds independently */}
      <DinouCacheSlot id="live-stock-ticker" revalidate={10}>
        <LiveTicker />
      </DinouCacheSlot>
    </div>
  );
}
```

- When the page is requested, Dinou stitches together the cached page shell with the current cache state of the slot.
- Invalidation can target the slot directly without evicting the surrounding page.

### 5.4 Partial Prerendering (PPR) Architecture

Partial Prerendering combines the speed of static pre-rendering with the real-time capabilities of dynamic SSR.
1. **Build Time:** The static shell of the page is rendered to static HTML. Dynamic components wrapped in `Suspense` are assigned a deterministic placeholder hole (`<div data-ppr-hole="slot-id">...fallback...</div>`).
2. **First Byte:** The edge server immediately streams the static shell (0ms TTFB).
3. **PPR Stream:** While the client paints the shell, the server resolves dynamic promises and streams replacement chunks down the open HTTP connection:
   ```html
   <div data-ppr-hole="slot-id"><!-- fallback --></div>
   <!-- STREAM CONTINUES -->
   <template data-ppr-target="slot-id">
     <div class="user-cart">3 Items ($42.00)</div>
   </template>
   <script>
     $dinou_swap("slot-id");
   </script>
   ```

### 5.5 Query String Sensitivity (`searchPart`)

Layout caches in Dinou are intelligently partitioned:
- Static layouts ignore search query strings (`?ref=twitter`) to maximize cache hit ratios.
- If a layout explicitly accesses search parameters via context, Dinou marks the layout cache key with `searchPart`, preventing cache bleed across different query strings.

---

## 6. Caching & Invalidation Architecture

Dinou v7 implements a dual-layer caching strategy separating the persistent server tier from the reactive client tier.

### 6.1 The Two Decoupled Cache Layers

```
[Browser Request]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ CLIENT LAYER (In-Memory SPA Router)                   │
│ - `pageCache` Map: Holds RSC trees per URL             │
│ - `layoutCache` Map: Holds parent layout trees         │
│ - Navigations: Instant 0ms transition                  │
│ - Bypass: `<Link fresh>` or `router.refresh()`         │
└──────────────────────────────────┬─────────────────────┘
                                   │ (Cache Miss or Fresh)
                                   ▼
┌────────────────────────────────────────────────────────┐
│ SERVER LAYER (StorageAdapter: FS or KV)                │
│ - ISR Cache: Static HTML & Flight RSC payloads         │
│ - Controlled by: `revalidate = N | false | 0`          │
│ - Invalidation: `revalidatePage`, `revalidatePath`,    │
│                 `revalidateTag`                        │
└────────────────────────────────────────────────────────┘
```

### 6.2 Server Invalidation Primitives

Dinou provides three granular server-side invalidation functions available in Server Functions, Server Actions, or API handlers:

```typescript
import { revalidatePage, revalidatePath, revalidateTag } from 'dinou';
```

#### 1. `revalidatePage(exactPath)`
- **Surgical page invalidation.**
- Invalidates *only* the specific target page at `exactPath`.
- Leaves parent layouts and nested child routes intact in the cache.
- Example: `revalidatePage('/blog/post-1')`.

#### 2. `revalidatePath(pathSegment)`
- **Hierarchical cascade invalidation.**
- Evicts the target route and recursively invalidates all downstream sub-routes and layouts.
- Example: `revalidatePath('/blog')` invalidates `/blog`, `/blog/post-1`, `/blog/post-2`, and the blog layout.

#### 3. `revalidateTag(tag)`
- **Cross-cutting on-demand invalidation.**
- Pages and slots register tags in their metadata:
  ```typescript
  // src/products/[id]/page.tsx
  export const tags = ['products', `product-${params.id}`];
  ```
- Triggering `revalidateTag('products')` purges every route, slot, or layout tagged with `'products'` across the entire site without needing to know specific URLs.

### 6.3 Client Router Cache Management

The client router maintains an in-memory cache of previously visited RSC payloads.

#### The `<Link fresh>` Prop
Bypasses the client in-memory cache and forces a fetch to the server:
```tsx
<Link href="/dashboard" fresh>
  Dashboard (Always Fresh)
</Link>
```

#### The `router.refresh()` Method
Invalidates the current client cache and refetches the active page from the server without losing React component state:
```tsx
import { useRouter } from 'dinou';

export function RefreshButton() {
  const router = useRouter();
  return <button onClick={() => router.refresh()}>Refresh Feed</button>;
}
```

### 6.4 RSC Wire Protocol & Internal Endpoints

Dinou's orchestrator serves RSC payloads via deterministic internal endpoints:
- `/__dinou_rsc__/page`: Serves the page-level Flight stream.
- `/__dinou_rsc__/slot`: Serves vertical micro-cache slots.
- `/__dinou_rsc__/layout`: Serves independent layout streams.

#### The `window.__DINOU_USE_STATIC__` Protocol
When building for static exports (SSG) or CDN edge caching:
- The compiler writes pre-rendered `.rsc` and `.html` files directly into public static routes.
- The client engine sets `window.__DINOU_USE_STATIC__ = true`.
- Client-side transitions fetch static pre-rendered `.rsc` files directly (e.g. `/docs/getting-started.rsc`) rather than querying dynamic server endpoints.

### 6.5 Storage Engine (`StorageAdapter`), KV vs Filesystem, Metadata Isolation

Dinou abstracts cache storage through the `StorageAdapter` interface:
- **`FileSystemStorageAdapter`:** Used in Node.js and Bun. Writes to `.dinou/cache/`.
- **`KVStorageAdapter`:** Used in Cloudflare Workers (KV namespace) and Deno (Deno KV).

#### Critical Storage Rules
1. **Metadata Isolation:** Cache payloads (`.html`, `.rsc`) must never be mixed with metadata. Metadata (timestamps, revalidation TTL, tags) is stored in discrete companion keys (e.g. `[key].meta.json` or KV metadata fields).
2. **Cross-Platform Key Normalization:** Filesystem backslashes on Windows (`\`) must be normalized to forward slashes (`/`) in cache keys to ensure deterministic behavior between local development and Linux production containers.
3. **Edge Pre-seeding:** In Cloudflare Workers and Deno KV, build-time SSG assets are automatically pre-seeded into key-value storage during deployment.

---

## 7. Error Handling, Boundaries & Production Security

### 7.1 Server Component Error Pages (`error.tsx`)

In Dinou v7, `error.tsx` is an **Error Page**, rendered as a Server Component by default. It catches unhandled exceptions thrown during rendering or data fetching:

```tsx
// src/error.tsx
import type { ErrorProps } from 'dinou';

export default function ErrorPage({ error, params }: ErrorProps) {
  return (
    <div className="error-container">
      <h1>Something went wrong</h1>
      <p className="error-message">{error.message}</p>
      
      {/* In development, error.stack is available for debugging */}
      {error.stack && (
        <details>
          <summary>Diagnostics (Development Only)</summary>
          <pre>{error.stack}</pre>
        </details>
      )}
    </div>
  );
}
```

### 7.2 Two-Level Error Isolation

Dinou employs a nested resilience boundary:
1. **`SlotErrorBoundary`:** Wraps the page slot `<DinouPageSlot>`. If a page crashes during SSR or streaming, the error is isolated inside the slot. The parent navigation bar, headers, and layouts remain completely intact and interactive.
2. **`InnerErrorBoundary`:** Catches root-level crashes when a layout itself fails, falling back to a clean standalone HTML error response without crashing the server process.

### 7.3 React 19 `SuspenseException` Handling

React 19 uses an internal thrown promise (`SuspenseException`) to trigger suspense boundaries during streaming.  
Dinou's server engine intercepts errors during rendering:
- If `error instanceof Promise` or is a React internal Suspense exception, Dinou **does not treat it as a failure**. It yields to the streaming renderer.
- Genuine exceptions (e.g. database disconnects, syntax errors) are caught, sanitized, and routed to `error.tsx`.

### 7.4 Strict Production Security Contract: Error Stack Sanitization

> **CRITICAL SECURITY REQUIREMENT**  
> In production environments (`NODE_ENV === 'production'`), the framework strictly guarantees that:
> - `error.stack` is **`undefined`** or **empty string**.
> - Error messages are sanitized to prevent leaking database connection strings, filesystem directory paths, or internal tokens.

Dinou implements this in `dinou/core/get-error-jsx.js` and `dinou/core/handler.js`:
```javascript
// Sanitization enforcement in Dinou Core
if (process.env.NODE_ENV === 'production') {
  errorObj.stack = undefined;
  // Mask internal stack traces before serialization
}
```

---

## 8. Client Navigation Engine & History Management

Dinou's client router (`client.jsx` / `client-webpack.jsx`) is a lightweight SPA router designed for streaming RSC.

### 8.1 SPA Navigation Lifecycle & Fast Refresh
1. User clicks `<Link href="/target">`.
2. Router intercepts click via event delegation.
3. Checks `pageCache`. If present and not marked `fresh`, transitions instantly (0ms).
4. If missing, requests `/__dinou_rsc__/page?route=/target`.
5. React 19 reconciles the virtual DOM using `React.startTransition`, keeping the current UI interactive until the new page is ready to display.

### 8.2 Hash Fragment Navigation & Async Scroll Restoration

Dinou handles deep-linking to `#hash` anchors (e.g. `/docs/rendering#partial-prerendering`):
- Listens to both `popstate` and `hashchange` browser events.
- When navigating back or forward through browser history between different hashes of the same route, the router avoids reloading the page.
- **Async Polling Resolution:** If the target element (`#section-id`) is inside a streaming or lazy-rendered component, the router retries element resolution asynchronously using a micro-interval before executing a smooth scroll into view:

```javascript
// Client Hash Restoration Logic
function scrollToHash(hash) {
  const id = hash.replace(/^#/, '');
  let attempts = 0;
  const interval = setInterval(() => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      clearInterval(interval);
    } else if (++attempts > 20) {
      clearInterval(interval); // Bail after 1 second if element does not exist
    }
  }, 50);
}
```

### 8.3 Native HTML5 Interactions in Server Components

Dinou promotes native HTML5 elements (such as `<details>` and `<summary>`) for simple interactive behaviors (accordions, dropdown menus, disclosures) inside Server Components. Because native elements require zero JavaScript to toggle, they function instantly before hydration and emit zero React client warnings.

---

## 9. Universal Deployment Architecture ("Deploy Everywhere")

Dinou compiles to clean, isolated target folders under `.dinou/`:

```
.dinou/
├── node/         -> Node.js Standalone Server
├── bun/          -> Bun Standalone / Binary Entry
├── deno/         -> Deno / Deno Deploy Entry
├── cloudflare/   -> Cloudflare Workers (Wrangler)
├── netlify/      -> Netlify Functions v2
└── dist/         -> 100% Static HTML/CSS/RSC Export (SSG)
```

### 9.1 Node.js Standalone (Docker, PM2, VPS)

To build and run on any Linux/macOS/Windows server with Node >= 18:

```bash
# 1. Build project
npm run build

# 2. Start production server
node .dinou/node/server.mjs
```

#### Minimal Dockerfile:
```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY .dinou .dinou
COPY public public
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", ".dinou/node/server.mjs"]
```

### 9.2 Bun Standalone & Single-Binary Compilation

Bun executes Dinou at maximum I/O throughput:

```bash
# Run standalone
bun .dinou/node/server.mjs

# Or compile into a single self-contained binary:
bun build --compile --minify --target=bun .dinou/node/server.mjs --outfile my-app
./my-app
```

### 9.3 Deno & Deno Deploy

Deno runs Dinou using its native Web Standards HTTP server:

```bash
deno run -A .dinou/deno/server.mjs
```

### 9.4 Cloudflare Workers (Wrangler + KV / Assets)

Dinou generates a fully compliant Cloudflare Worker entry point using ES modules and Cloudflare KV for ISR caching:

```bash
# Deploy to Cloudflare Workers
npx wrangler deploy
```

`wrangler.toml` integration:
```toml
name = "my-dinou-app"
main = ".dinou/cloudflare/worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "public"
binding = "ASSETS"

[[kv_namespaces]]
binding = "DINOU_CACHE"
id = "<your-kv-id>"
```

### 9.5 Netlify Functions v2

Dinou compiles zero-configuration handlers for Netlify Functions v2:
```bash
netlify deploy --prod
```

### 9.6 100% Pure Static Site Generation (SSG Export)

To export a pure static website (compatible with GitHub Pages, AWS S3, Apache, or Nginx):

```bash
npm run build -- --export
```
- Output directory: `dist/`
- Every route is pre-rendered to `.html` and `.rsc`.
- Zero dynamic server runtime required.

### 9.7 The Standard Static Assets Directory (`public/`)

Any file placed inside `public/` (e.g. `public/favicon.ico`, `public/images/logo.png`) is served directly at the root URL path (`/favicon.ico`, `/images/logo.png`).
- Assets in `public/` are mapped to the build output across all deployment targets automatically.

---

## 10. Configuration, Tooling & Scaffolding

### 10.1 Scaffolding: `create-dinou`

To scaffold a new Dinou project:

```bash
# Recommended
npx create-dinou@latest my-app

# Or via npm create
npm create dinou@latest my-app
```

*Note: The official scaffolding package is `create-dinou` (not `create-dinou-app`).*

### 10.2 Configuration API (`dinou.config.js`)

```javascript
// dinou.config.js
import { defineConfig } from 'dinou/config';

export default defineConfig({
  // Selected bundler: 'esbuild' (default) | 'rollup' | 'webpack'
  bundler: 'esbuild',

  // Default dev server port (falls back to interactive port-selector if occupied)
  port: 3000,

  // Global Web Middleware for all incoming HTTP requests
  async onRequest(req, next) {
    // Modify headers, inspect cookies, or redirect
    return next();
  },

  // Enable SWC disk-mirror caching for large codebases (500+ routes)
  useSwcDiskMirror: false
});
```

### 10.3 Bundler Agnosticism (Esbuild, Rollup, Webpack)

Dinou is completely bundler-agnostic. The underlying compiler can be swapped via `dinou.config.js` or CLI flags with **100% feature parity**:
- **`esbuild`:** Default. Blazing fast compilation and minimal memory consumption.
- **`rollup`:** Ideal for maximum tree-shaking and custom Rollup plugin ecosystems.
- **`webpack`:** Enterprise legacy compatibility with Webpack loaders and custom plugins.

### 10.4 Port Selector & Dev Tooling

If port `3000` is already in use when launching `npm run dev`, Dinou triggers an interactive CLI selector prompting the developer to select the next available port (`3001`, `3002`, etc.) automatically, preventing collision crashes.

### 10.5 CLI Commands & Scripts Reference: Standard (Non-Ejected) vs Ejected Modes

Dinou supports two operational paradigms for project maintenance:

1. **Standard Non-Ejected Mode (Default & Recommended):**  
   All build scripts delegate directly to the `dinou` CLI binary (`dinou <subcommand>`). The underlying bundler environment variables (`DINOU_BUILD_TOOL`), platform cross-compilation flags (`deno compile`, `bun build --compile`), architecture targets (`linux`, `linux_arm`, `mac`, `win`), and KV seed utilities remain cleanly encapsulated inside the framework.
   
2. **Ejected Mode (`dinou eject`):**  
   Running `dinou eject` copies the framework core into the local `./dinou` folder and replaces the high-level `dinou <command>` scripts in `package.json` with the raw, verbose Node/cross-env commands (as seen in `package.json` lines 10-36). This gives advanced teams full control to modify internal compilers, bundlers, and loaders.

#### The Complete Non-Ejected `package.json` Scripts Catalog

Below is the complete set of standard (non-ejected) npm scripts supported by Dinou, organized by lifecycle and deployment target:

```json
{
  "scripts": {
    "dev": "dinou dev",
    "build": "dinou build",
    "start": "dinou start",
    "dev:esbuild": "dinou dev:esbuild",
    "dev:rollup": "dinou dev:rollup",
    "dev:webpack": "dinou dev:webpack",
    "build:node": "dinou build:node",
    "build:node:esbuild": "dinou build:node:esbuild",
    "build:node:rollup": "dinou build:node:rollup",
    "build:node:webpack": "dinou build:node:webpack",
    "start:node": "dinou start:node",
    "start:node:esbuild": "dinou start:node:esbuild",
    "start:node:rollup": "dinou start:node:rollup",
    "start:node:webpack": "dinou start:node:webpack",
    "build:cloudflare": "dinou build:cloudflare",
    "build:cloudflare:esbuild": "dinou build:cloudflare:esbuild",
    "build:cloudflare:rollup": "dinou build:cloudflare:rollup",
    "build:cloudflare:webpack": "dinou build:cloudflare:webpack",
    "build:deno": "dinou build:deno",
    "build:deno:esbuild": "dinou build:deno:esbuild",
    "build:deno:rollup": "dinou build:deno:rollup",
    "build:deno:webpack": "dinou build:deno:webpack",
    "build:deno:compile": "dinou build:deno:compile",
    "build:deno:compile:esbuild": "dinou build:deno:compile:esbuild",
    "build:deno:compile:rollup": "dinou build:deno:compile:rollup",
    "build:deno:compile:webpack": "dinou build:deno:compile:webpack",
    "build:deno:compile:linux": "dinou build:deno:compile:linux",
    "build:deno:compile:linux:esbuild": "dinou build:deno:compile:linux:esbuild",
    "build:deno:compile:linux:rollup": "dinou build:deno:compile:linux:rollup",
    "build:deno:compile:linux:webpack": "dinou build:deno:compile:linux:webpack",
    "build:deno:compile:linux_arm": "dinou build:deno:compile:linux_arm",
    "build:deno:compile:linux_arm:esbuild": "dinou build:deno:compile:linux_arm:esbuild",
    "build:deno:compile:linux_arm:rollup": "dinou build:deno:compile:linux_arm:rollup",
    "build:deno:compile:linux_arm:webpack": "dinou build:deno:compile:linux_arm:webpack",
    "build:deno:compile:mac": "dinou build:deno:compile:mac",
    "build:deno:compile:mac:esbuild": "dinou build:deno:compile:mac:esbuild",
    "build:deno:compile:mac:rollup": "dinou build:deno:compile:mac:rollup",
    "build:deno:compile:mac:webpack": "dinou build:deno:compile:mac:webpack",
    "build:deno:compile:win": "dinou build:deno:compile:win",
    "build:deno:compile:win:esbuild": "dinou build:deno:compile:win:esbuild",
    "build:deno:compile:win:rollup": "dinou build:deno:compile:win:rollup",
    "build:deno:compile:win:webpack": "dinou build:deno:compile:win:webpack",
    "start:deno": "dinou start:deno",
    "build:bun": "dinou build:bun",
    "build:bun:esbuild": "dinou build:bun:esbuild",
    "build:bun:rollup": "dinou build:bun:rollup",
    "build:bun:webpack": "dinou build:bun:webpack",
    "build:bun:compile": "dinou build:bun:compile",
    "build:bun:compile:esbuild": "dinou build:bun:compile:esbuild",
    "build:bun:compile:rollup": "dinou build:bun:compile:rollup",
    "build:bun:compile:webpack": "dinou build:bun:compile:webpack",
    "build:bun:compile:linux": "dinou build:bun:compile:linux",
    "build:bun:compile:linux:esbuild": "dinou build:bun:compile:linux:esbuild",
    "build:bun:compile:linux:rollup": "dinou build:bun:compile:linux:rollup",
    "build:bun:compile:linux:webpack": "dinou build:bun:compile:linux:webpack",
    "build:bun:compile:linux_arm": "dinou build:bun:compile:linux_arm",
    "build:bun:compile:linux_arm:esbuild": "dinou build:bun:compile:linux_arm:esbuild",
    "build:bun:compile:linux_arm:rollup": "dinou build:bun:compile:linux_arm:rollup",
    "build:bun:compile:linux_arm:webpack": "dinou build:bun:compile:linux_arm:webpack",
    "build:bun:compile:mac": "dinou build:bun:compile:mac",
    "build:bun:compile:mac:esbuild": "dinou build:bun:compile:mac:esbuild",
    "build:bun:compile:mac:rollup": "dinou build:bun:compile:mac:rollup",
    "build:bun:compile:mac:webpack": "dinou build:bun:compile:mac:webpack",
    "build:bun:compile:win": "dinou build:bun:compile:win",
    "build:bun:compile:win:esbuild": "dinou build:bun:compile:win:esbuild",
    "build:bun:compile:win:rollup": "dinou build:bun:compile:win:rollup",
    "build:bun:compile:win:webpack": "dinou build:bun:compile:win:webpack",
    "build:bun:pure": "dinou build:bun:pure",
    "build:bun:pure:esbuild": "dinou build:bun:pure:esbuild",
    "build:bun:pure:rollup": "dinou build:bun:pure:rollup",
    "build:bun:pure:webpack": "dinou build:bun:pure:webpack",
    "build:bun:pure:compile": "dinou build:bun:pure:compile",
    "build:bun:pure:compile:esbuild": "dinou build:bun:pure:compile:esbuild",
    "build:bun:pure:compile:rollup": "dinou build:bun:pure:compile:rollup",
    "build:bun:pure:compile:webpack": "dinou build:bun:pure:compile:webpack",
    "build:bun:pure:compile:linux": "dinou build:bun:pure:compile:linux",
    "build:bun:pure:compile:linux:esbuild": "dinou build:bun:pure:compile:linux:esbuild",
    "build:bun:pure:compile:linux:rollup": "dinou build:bun:pure:compile:linux:rollup",
    "build:bun:pure:compile:linux:webpack": "dinou build:bun:pure:compile:linux:webpack",
    "build:bun:pure:compile:linux_arm": "dinou build:bun:pure:compile:linux_arm",
    "build:bun:pure:compile:linux_arm:esbuild": "dinou build:bun:pure:compile:linux_arm:esbuild",
    "build:bun:pure:compile:linux_arm:rollup": "dinou build:bun:pure:compile:linux_arm:rollup",
    "build:bun:pure:compile:linux_arm:webpack": "dinou build:bun:pure:compile:linux_arm:webpack",
    "build:bun:pure:compile:mac": "dinou build:bun:pure:compile:mac",
    "build:bun:pure:compile:mac:esbuild": "dinou build:bun:pure:compile:mac:esbuild",
    "build:bun:pure:compile:mac:rollup": "dinou build:bun:pure:compile:mac:rollup",
    "build:bun:pure:compile:mac:webpack": "dinou build:bun:pure:compile:mac:webpack",
    "build:bun:pure:compile:win": "dinou build:bun:pure:compile:win",
    "build:bun:pure:compile:win:esbuild": "dinou build:bun:pure:compile:win:esbuild",
    "build:bun:pure:compile:win:rollup": "dinou build:bun:pure:compile:win:rollup",
    "build:bun:pure:compile:win:webpack": "dinou build:bun:pure:compile:win:webpack",
    "start:bun": "dinou start:bun",
    "start:bun:esbuild": "dinou start:bun:esbuild",
    "start:bun:rollup": "dinou start:bun:rollup",
    "start:bun:webpack": "dinou start:bun:webpack",
    "export-static": "dinou export-static",
    "export-static:esbuild": "dinou export-static:esbuild",
    "export-static:rollup": "dinou export-static:rollup",
    "export-static:webpack": "dinou export-static:webpack",
    "eject": "dinou eject"
  }
}
```

#### Scripts Breakdown by Target:
- **Dev Servers:** `dev` (runs `dev:esbuild` by default), with explicit options for `dev:rollup` and `dev:webpack`.
- **Node.js Target:** `build:node`, `build:node:esbuild`, `build:node:rollup`, `build:node:webpack`, with matching `start:node:*` commands.
- **Cloudflare Target:** `build:cloudflare`, with `:esbuild`, `:rollup`, and `:webpack` variants.
- **Deno Target:** `build:deno` (includes Deno KV automatic pre-seeding), plus cross-platform standalone compilation (`build:deno:compile:*` targeting `linux`, `linux_arm`, `mac`, `win`).
- **Bun Target:** `build:bun` (standard Node-compat mode), `build:bun:pure` (pure native Bun APIs), and single-binary compilation (`build:bun:compile:*` and `build:bun:pure:compile:*` across `linux`, `linux_arm`, `mac`, `win`).
- **Static Export:** `export-static:*` produces 100% static HTML & RSC artifacts in `dist/`.
- **Eject:** `eject` converts the project from non-ejected to ejected mode for deep internal customization.

---

## 11. Golden Rules & Knowledge Transfer Checklist

When working on or generating code for Dinou v7, always verify your implementation against these core principles:

1. **Strictly Seconds for `revalidate`:**  
   Always write `export const revalidate = 60;` (seconds). Never use milliseconds.
2. **Direct `getProps` Return:**  
   Never wrap returns in `{ page: ... }`. Return the props object directly.
3. **No `dynamic` Export:**  
   Use `revalidate = 0` for dynamic SSR, `revalidate = false` for SSG, or `revalidate = N` for ISR.
4. **Error Stack Sanitization in Production:**  
   Ensure error stacks are never rendered in production output. The framework sanitizes `error.stack = undefined` outside of development mode.
5. **Level 1 Type Safety in Links:**  
   Ensure `<Link href="...">` links match defined routes. Avoid trailing slashes.
6. **Level 2 Type Safety in Pages:**  
   Use `PageProps<'/your/route'>` and `RouteParams<'/your/route'>` for strictly typed parameters.
7. **Preserve Layout State:**  
   Avoid unmounting layouts. Place per-page dynamic logic inside `page.tsx` and shared persistent shell logic in `layout.tsx`.
8. **Decoupled Layout Data:**  
   Use `layout_functions.ts` for layout data fetching to keep layout caching independent from child page lifecycles.
9. **Deploy Everywhere:**  
   Do not introduce Node-specific primitives (`fs`, `child_process`, `cluster`) into universal runtime code paths. Always write against standard Web APIs (`Request`, `Response`, `ReadableStream`).
10. **Scaffolding Tool:**  
    Always recommend `npx create-dinou@latest <app-name>` or `npm create dinou@latest <app-name>`.

---

*End of Dinou v7 Master Compendium. This document serves as the single source of truth for Dinou v7 architecture, runtime execution, and developer API contracts.*
