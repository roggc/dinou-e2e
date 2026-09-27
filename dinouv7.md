# Dinou v7: Architecture & Features Overview

Dinou v7 is an ultra-fast, zero-fork, agnostic full-stack meta-framework powered by **React 19**, designed to deliver top-tier developer experience and optimal production performance across all JavaScript runtimes and bundlers.

---

## 1. Core Architectural Innovations

### Dual-Bundle (0-Fork, Single-Process Architecture)
* **Decoupled Engines**: Native separation of the **React Server Components (RSC) Engine** and the **Server-Side Rendering (SSR) Engine**.
* **Zero Child Process Overhead**: Unlike legacy meta-framework architectures that spawn separate processes or worker threads for dev server orchestration, Dinou v7 runs both engines inside a **single unified process**. This eliminates IPC communication lag, serialization overhead, and process management complexity.

### 100% In-Memory Development Mode
* **Zero Disk I/O (`__DINOU_MEM_FILES__`)**: During development, client and server bundles, manifests, and assets reside entirely in memory.
* **Disk Write Elimination**: No constant filesystem writes on hot edits, removing disk thrashing, file lock contention, and antivirus scanning delays on Windows, macOS, and Linux.
* **Instant In-Memory Serving**: Static and compiled assets are served directly from RAM cache with sub-millisecond HTTP response times.

### Unified Single-Watcher Pipeline
* **Race-Condition Elimination**: Dinou coordinates a single root watcher (powered by Chokidar) that orchestrates incremental rebuilds.
* **No Dual-Watcher Collision**: Native bundler watchers (such as esbuild's Go watcher) are disabled in integrated dev mode, ensuring one coordinated rebuild cycle per file modification with zero duplicate builds or race conditions.

---

## 2. Next-Generation React 19 Capabilities

### React Server Components (RSC) & React Compiler
* **Native RSC Support**: First-class support for React 19 Server Components with automatic client component discovery and boundary identification.
* **React Compiler Ready**: Out-of-the-box integration with Babel and the React Compiler for automatic memoization and optimal rendering.
* **Stable Chunk Hashing**: Deterministic client module hashing ensuring seamless client-side hydration without manifest desynchronization.

### Server Functions (`"use server"`) with Automated RPC
* **Zero-Boilerplate Backend Interaction**: Invoke server functions directly from Client Components or Server Components (`await updateProfile(data)`).
* **Transparent RPC Protocol**: Backed by React Flight's streaming protocol with automatic proxy generation. Eliminates manual `fetch()` calls, custom API endpoints, and duplicated TypeScript request/response interfaces.
* **Full Form & FormData Integration**: Native handling of progressive enhancement, standard `multipart/form-data`, redirects, and file uploads.

### Universal Request Context (`getContext`)
* **AsyncLocalStorage Engine**: Safe, request-scoped context across asynchronous boundaries.
* **Seamless Context Preservation**: Context enriched during early request interception is fully preserved and accessible across Server Components, layouts, and Server Functions via `getContext()`.

---

## 3. True Universal Multi-Runtime Support

Dinou v7 compiles and deploys natively to any major runtime environment:

| Runtime | Deployment Target | Key Features |
| :--- | :--- | :--- |
| **Node.js** | Servers, Containers, VMs | Dual-Bundle SSR engine, optimized dev mode, production cluster ready. |
| **Cloudflare Workers** | Cloudflare Edge / Pages | 100% pure V8 isolate execution. Zero Node runtime dependencies. Bundled VFS, KV caching, and Cloudflare Static Assets binding. |
| **Deno** | Deno Deploy, Standalone Binaries | Deno KV storage adapter, and `deno compile` support producing self-contained single-binary executables for Linux, macOS, Windows, and ARM. |
| **Bun** | Bun Server, Standalone Binaries | High-throughput native Bun HTTP engine and `bun build --compile` distribution. |

---

## 4. Multi-Bundler Agnostic Foundation

Dinou does not lock developers into a single bundler:

* **esbuild**: Blazing-fast development server, native SWC Fast Refresh scoped strictly to application source code, deterministic chunk generation, and instant memory caching.
* **Rollup**: Maximum tree-shaking efficiency and optimal code-splitting graphs for production client builds.
* **Webpack**: Full enterprise ecosystem support, utilizing `ReactServerWebpackPlugin` and standard webpack loaders.

---

## 5. Full-Spectrum Rendering Matrix

Dinou v7 supports every modern web rendering pattern interchangeably:

* **Static Site Generation (SSG)**: Pre-rendered static HTML and RSC payloads at build time.
* **Dynamic Server-Side Rendering (SSR)**: High-performance streaming HTML directly from RSC payloads.
* **Incremental Static Regeneration (ISR)**: Background stale-while-revalidate regeneration backed by swappable storage adapters (In-Memory, Cloudflare KV, Deno KV, Redis).
* **Edge Incremental Static Generation (Edge ISG)**: On-demand page generation at the edge with built-in **Concurrency Stampede Protection** (in-flight request deduplication).

---

## 6. Universal Plugin System & Middlewares

### `dinou.config.mjs`
* **Declarative Configuration**: Centralized, type-safe configuration via `defineConfig({ plugins: [...] })`.
* **Universal `onRequest` Pipeline**: Sequential middleware execution chain receiving standard Web Fetch [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) objects.
  * Returning a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) terminates the chain and serves the client directly (ideal for Webhooks, REST endpoints, binary file downloads like PDFs/CSVs, and dynamic `sitemap.xml`).
  * Passing through enriches `context` for downstream Server Components and Server Functions.
* **Edge-Native Pre-Bundling**: `dinou.config.mjs` and its plugin dependencies are statically analyzed and bundled directly into Edge worker bundles (Cloudflare, Deno, Bun) at build time, ensuring universal execution without runtime filesystem dependencies.

---

## 7. Developer Experience & Benchmark Performance

* **Lightning-Fast Cold Starts**: Project boot times reduced from several minutes to under **10 seconds**, achieved by eliminating redundant recursive Babel AST passes and optimizing entry-point resolution.
* **Hot Module Replacement (HMR)**: Sub-3-second rebuild and browser update times on large-scale applications with over 170+ components and documentation routes.
* **Clean Terminal Status**: High-visibility timeline logging with detailed phase breakdowns (Discovery, RSC/SSR, Evaluation, AST Scan, Bundling) for maximum observability.
* **Automated CI/CD Resilience**: Full End-to-End verification via Playwright test suites covering complex routing, slots, error boundaries, streaming, and context enrichment across Windows, Linux, and all runtime targets.
