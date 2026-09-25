# Dinou v7: Universal Architecture and Infrastructure-Agnostic Deployment ("Deploy Everywhere")

## 1. The Core Breakthrough of Dinou v7

For years, modern React frameworks supporting React Server Components (RSC) have suffered from a critical industry dilemma: **vendor lock-in**. Many of the most powerful features introduced in React 19—such as Server Components, asynchronous Suspense streaming, Server Functions RPC, and Incremental Static Regeneration (ISR)—appeared tailored to execute exclusively on proprietary serverless cloud platforms or via cumbersome, resource-heavy monolithic server setups.

**Dinou v7 completely breaks down that barrier:**
> **Any Dinou application built with React 19 and Server Components can be compiled and deployed to virtually any hosting infrastructure in the world:** from a zero-cold-start Cloudflare Worker at the edge, to Deno Deploy, bare-metal Bun, traditional Node.js in Docker/Kubernetes containers, self-contained single-binary executables with zero host dependencies (`compile`), all the way to 100% free static hosting (GitHub Pages, Surge.sh, AWS S3).

---

## 2. The Architectural Leap: From Legacy `fork()` to the Universal Dual-Bundle Pipeline

### 2.1. The Historical React 19 Bottleneck: The Dual Condition Conflict
In React 19, a fundamental module-resolution conflict exists, commonly known as the **Dual Condition Conflict**:
* **RSC Engine** (Server Component tree resolution): Requires modules to be imported under the `"react-server"` export condition. Under this condition, React components have no access to browser/client APIs (such as `useState`, `useEffect`, or `react-dom/server`).
* **SSR Engine** (Streaming HTML generation): Requires modules to be imported under the `"browser"` or client environment conditions (`react-dom/server.edge` or `react-dom/server.node`).
* If both engines are imported within the same module scope without isolation, React throws a fatal exception:
  ```text
  ReactServer has been imported outside of react-server condition.
  ```

### 2.2. The Legacy Approach: Child Process Forking (`child_process.fork`)
In earlier implementations (and in many ecosystem frameworks), this conflict was circumvented in Node.js by spawning an external child process:
1. The parent process ran the HTTP server and the SSR engine under standard module conditions.
2. Whenever Server Components needed to be rendered, the parent process dispatched an Inter-Process Communication (IPC) message to a child process (launched with `node --conditions=react-server`).
3. The child process rendered the RSC binary stream and streamed it back over IPC to the parent process for HTML conversion.

#### Why was `fork()` unsustainable?
* **Serialization Latency & IPC Overhead**: Every single incoming request incurred the penalty of serializing and deserializing streams across OS process boundaries.
* **Double Memory Consumption**: Two full Node.js runtimes had to be booted and kept warm per server instance.
* **Incompatible with Edge & Serverless Runtimes**: In environments such as **Cloudflare Workers**, **Deno Deploy**, **AWS Lambda**, or **Vercel Functions**, `child_process.fork()` **does not exist**.
* **Incompatible with Single-Binary Compilation**: Neither `bun build --compile` nor `deno compile` can package an application that relies on spawning external runtime processes.

---

### 2.3. The Dinou v7 Solution: The Universal 3-Pass Ahead-of-Time (AOT) Dual-Bundle Architecture
The architectural breakthrough originally engineered for Cloudflare Workers ([`CLOUDFLARE_WRANGLER.md`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/CLOUDFLARE_WRANGLER.md)) proved so resilient, fast, and elegant that **Dinou v7 standardized it as the canonical architecture across ALL targets (Node, Deno, Bun, and Cloudflare)**.

The `fork()` mechanism has been eliminated entirely. It is replaced with an Ahead-of-Time (AOT) 3-pass compilation pipeline:

```
                            [ Incoming Request (HTTP / Fetch) ]
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │                 Target Orchestrator                    │
                  │   Node (server.mjs) / Deno (main.js) / Bun / Worker    │
                  └───────────────────────────┬────────────────────────────┘
                                              │
              ┌───────────────────────────────┴───────────────────────────────┐
              ▼                                                               ▼
    Static Asset / SSG Cache?                                       Dynamic Route / RSC / SF?
              │                                                               │
              ▼                                                               ▼
 ┌─────────────────────────┐                                    ┌───────────────────────────┐
 │   Instant Delivery      │                                    │   Worker Orchestrator     │
 │ (Disk / KV / CDN Assets)│                                    │   (Pass C)                │
 └─────────────────────────┘                                    └─────────────┬─────────────┘
                                             ┌────────────────────────────────┴────────────────────────────────┐
                                             ▼                                                                 ▼
                                ┌──────────────────────────────┐                                  ┌──────────────────────────────┐
                                │     Pass A: RSC Engine       │                                  │     Pass B: SSR Engine       │
                                │ (conditions: [react-server]) │                                  │  (conditions: [browser])     │
                                │                              │                                  │                              │
                                │ - React 19 Server Components │        RSC Payload Stream        │ - react-dom/server.edge      │
                                │ - Server Functions RPC       │ ───────────────────────────────> │ - SSR Client Manifest        │
                                │ - Client Component Proxies   │      (ReadableStream)            │ - Native Streaming HTML      │
                                └──────────────────────────────┘                                  └──────────────┬───────────────┘
                                                                                                                 │
                                                                                                                 ▼
                                                                                                  [ Streaming HTML Response ]
```

#### The 3 Compilation Passes:
1. **Pass A — RSC Engine**:
   - Bundled with `["react-server"]` export conditions.
   - Transforms Client Components (`"use client"`) into lightweight proxies (`createClientModuleProxy`) via the `clientReferencesPlugin`. This allows the RSC engine to emit client reference IDs without importing or executing browser-specific code.
   - Registers and binds Server Functions (`"use server"`).
2. **Pass B — SSR Engine**:
   - Bundled with `["browser"]` / client export conditions.
   - Packages `react-dom/server.edge` (`renderToReadableStream`) along with the auto-generated `ssr-client-manifest.js`, embedding the actual client component implementations required to hydrate and stream the HTML tree.
3. **Pass C — Orchestrator (Runtime Adapter)**:
   - In-memory orchestration connecting Pass A and Pass B via standard W3C Web Streams (`ReadableStream`).
   - Serves static assets with optimal caching headers and hooks up the persistence and incremental revalidation layer (ISR).

---

### 2.4. Dinou v7 vs v6: From Heavy Diesel Truck to Formula 1 Ferrari (The Technical Metamorphosis)

The transition from Dinou v6 to Dinou v7 is not merely an incremental version bump; it represents a **complete architectural rebirth**. The most apt analogy is evolving from a **heavy diesel utility truck with trailers** into an **aerodynamic carbon-fiber Formula 1 Ferrari**:

| Architectural Dimension | 🚛 Dinou v6 (Heavy Diesel Truck) | 🏎️ Dinou v7 (Formula 1 Ferrari) |
| :--- | :--- | :--- |
| **Rendering Engine** | `child_process.fork()` + runtime Babel JIT. Every render required heavy IPC serialization across OS process boundaries. | **Dual-Bundle AOT In-Memory**. Direct RAM stream interconnection via native React 19 Web Streams. |
| **Chassis & Middleware** | Monolithic **Express** + `require.extensions` hacks (`asset-require-hook`, `css-require-hook`) + Chokidar. | **Pure Web Standards** (`Request`, `Response`, `ReadableStream`). Zero Express and zero runtime Babel dependencies. |
| **Concurrency & Memory** | Required `concurrency-manager.js` to guard against CPU/RAM exhaustion ("fork bomb"). High memory overhead per process. | **Flat, predictable memory footprint**. Thousands of concurrent async streams inside the native event loop with zero forks. |
| **SSG / ISG / ISR** | Duplicated, divergent pipelines (`generate-static-pages.js` vs `generate-static-page.js`) running on sub-processes. | **Single Unified Pipeline**: The exact same in-memory ISG engine (`storageAdapter`) pre-renders hundreds of pages in seconds. |
| **Cross-Runtime Portability** | Fragmented and tightly coupled to Node CJS. Bun required experimental JIT plugins; impossible on Edge/Workers. | **Universal "Deploy Everywhere"**: Identical architecture across Node Standalone (`server.mjs`), Bun, Deno (single-binary), and Cloudflare. |
| **E2E Test Performance** | Sluggish test execution (~15-20 min), prone to socket timeouts and child process IPC stalls. | **377 tests passed at 100% in ~4 minutes** across Chromium, Firefox, and WebKit simultaneously with zero failures. |
| **Developer Experience & HMR** | Fork-dependent dev server, duplicate Chokidar watchers, full page reloads on CSS edits or directive changes. | **Single-process (0 forks)** with in-memory Dual-Engine (<80ms incremental builds), hot directive synchronization (`use client`/`use server`), React Fast Refresh with state preservation, and Hot CSS swapping without page reloads. |
| **Code Hygiene** | Legacy bridges, redundant loaders, and runtime hooks. | **~2,200 lines of dead code eradicated** (14 obsolete files cleanly purged). |

---

## 3. The v7 Developer Experience (DX): Single-Process (0-Fork) Dual-Engine & Next-Gen HMR

The transition to Dinou v7's Dual-Bundle architecture doesn't just supercharge production; it has completely transformed the local development experience (`npm run dev`):

### 3.1. In-Process (0-Fork) Dev Server & Unified Watcher
In previous versions, the development server spawned separate child processes to run the React Server Components engine while a separate process coordinated client asset bundling. Each process maintained its own file watcher (`chokidar`), causing duplicate disk I/O, IPC sync bottlenecks, and potential manifest divergence.

In **Dinou v7**, [`dinou/node/dev.mjs`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/node/dev.mjs) unifies everything within a **single Node.js process**:
* **Incremental In-Memory Rebuilds**: Both Pass A (RSC Engine) and Pass B (SSR Engine) utilize esbuild incremental contexts (`ctxA.rebuild()` and `ctxB.rebuild()`) that rebuild changed server modules in RAM in 30–80 ms.
* **Centralized File Watcher**: A single Chokidar instance observes `src/`. Upon detecting changes, it notifies both the server engines and the client bundler in memory, guaranteeing manifest synchronization before dispatching client updates.
* **Zero Zombie Processes**: Terminating the server (`Ctrl + C`) cleanly closes the process without leaving dangling child processes holding ports or consuming system RAM.

### 3.2. Next-Generation React Fast Refresh & ESM-HMR
Dinou v7 incorporates an ultra-refined HMR pipeline that guarantees state continuity across edits:
* **Total State Preservation in Client Components (`"use client"`)**: Edits to interactive components are hot-swapped in the browser via ESM-HMR and React Refresh Runtime, flawlessly preserving hooks (`useState`, `useReducer`), form inputs, and UI component state.
* **Hot Directive Switching**: If a developer adds or removes `"use client"` or `"use server"` from a file, Dinou immediately detects the directive change, rebuilds the client entry points, and synchronizes the Dual-Bundle engine without requiring a manual dev server restart.
* **Static Assets & Image HMR**: Dynamic imports of images (`.png`, `.jpg`, `.svg`), fonts, and media assets in client components hot-reload reliably without crashing the React tree.
* **Instant Hot CSS Swapping (`style-update`)**:
  * Any edit to a `.css` file (global stylesheet, in layouts, or component-imported) is compiled and dispatched via `{ type: "style-update", url: "/styles.css" }`.
  * The browser HMR runtime updates the `<link rel="stylesheet">` tag with a cache-busting timestamp (`?t=...`), applying visual styling changes **instantly, without full page reloads, without flickering, and without unmounting components or resetting state**.
  * CSS entry chunks are isolated from React Refresh boundaries, preventing erroneous full reloads.

### 3.3. Complete Parity Across All 3 Bundlers (Esbuild, Rollup, Webpack)
The local development experience is identical regardless of the underlying bundler chosen:
* `npm run dev:esbuild`: Sub-second rebuilds designed for ultra-fast day-to-day iteration.
* `npm run dev:rollup`: Ideal for debugging production-grade ESM chunk splitting.
* `npm run dev:webpack`: Full feature parity for enterprise ecosystems dependent on Webpack plugins.
All three engines share identical WebSocket protocols, manifest formats, and HMR semantics.

---

## 4. Core Architectural Highlights

### 4.1. W3C Web Standards at the Foundation
The core request orchestrator (`handleRequest` in [`dinou/core/handler.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js)) is 100% runtime-agnostic. It relies exclusively on open W3C standards:
- Native `Request` and `Response` interfaces (Web Fetch API).
- Native `ReadableStream` and `TransformStream` for non-blocking streaming of HTML and RSC payloads.
- Native `Headers`, `URL`, `URLSearchParams`, and standard cookie parsers.

### 4.2. Bundler-Agnostic Compilation
Dinou does not lock you into a single bundler. The entire application pipeline seamlessly compiles using any of the three major JS bundlers:
- **Esbuild**: Sub-second compilation for development and lightning-fast production builds.
- **Rollup**: Highly optimized dependency graphs with precise tree-shaking.
- **Webpack**: Full compatibility with legacy plugins and enterprise tooling.

### 4.3. In-Memory Virtual File System (VFS) & Semantic Module Filtering
To run flawlessly in environments lacking physical file systems (`workerd` in Cloudflare Workers or Deno Deploy):
- Dinou compiles an **In-Memory Virtual File System (`__DINOU_VFS__`)** containing the route hierarchy discovered during build time.
- **Semantic Module Filter**: Inspects transitive dependencies in `node_modules` to prevent non-standard bundles (such as legacy SystemJS or UMD wrappers found in libraries like Jotai) from corrupting the edge server bundle.

### 4.4. Universal Storage & ISR Layer (`StorageAdapter`)
Dinou decouples static cache storage and on-demand revalidation (ISR / ISG) from the local filesystem through the abstract contract in [`dinou/core/storage-adapter.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/storage-adapter.js):
- **`FileSystemStorage`**: Used by Node.js and Bun (persists to physical disk at `.dinou/dist2`).
- **`DenoKVStorage`**: Used by Deno CLI and Deno Deploy (persists to local disk or the globally distributed Deno KV cloud database).
- **`CloudflareKVStorage`**: Used by Cloudflare Workers via native KV bindings (`DINOU_CACHE`).
- **`MemoryStorage`**: In-memory caching for ephemeral environments and unit/E2E test isolation.

---

## 5. Deployment Targets & Practical Guide ("Deploy Everywhere")

Dinou v7 enables deploying the exact same codebase to any of the following targets:

| Deployment Target | Production Runtime | Cache / ISR Engine | Build Command | Start / Deploy Command |
| :--- | :--- | :--- | :--- | :--- |
| **Node.js AOT** | Node.js (>= 18) | FileSystem | `npm run build:node` | `npm run start:node` |
| **Bun Standalone** | Bun | FileSystem | `npm run build:bun` | `npm run start:bun` |
| **Bun Pure (Zero Node)** | Bun (100% native) | FileSystem | `npm run build:bun:pure` | `npm run start:bun` |
| **Bun Binary (`compile`)** | None (Standalone Exe) | FileSystem | `npm run build:bun:compile` | `./dist/server` |
| **Deno Standalone** | Deno CLI | Deno KV (Local Disk) | `npm run build:deno` | `npm run start:deno` |
| **Deno Deploy (Edge)** | Deno Deploy | Deno KV (Global Cloud)| `npm run build:deno` | `deployctl deploy .dinou/deno/main.js` |
| **Deno Binary (`compile`)**| None (Standalone Exe) | Deno KV (Embedded) | `npm run build:deno:compile`| `./dist/deno-server` |
| **Cloudflare Workers** | workerd (V8 Isolates) | Cloudflare KV | `npm run build:cloudflare` | `npx wrangler deploy` |
| **Netlify Functions v2**| Netlify Edge | CDN Cache | `npm run build` | `git push netlify` |
| **Static Hosting (SSG)**| Web Server / CDN | Pre-rendered HTML | `npm run export-static` | Deploy `out/` folder |

---

### A. Deploying to Node.js (VPS, Docker, PM2, PaaS)
With Dinou v7's AOT Dual-Bundle orchestrator, Node.js no longer spawns child processes (`fork`). Both RSC and SSR engines run in-process within the same Node instance with zero IPC latency.

1. **Build**:
   ```bash
   npm run build:node
   # Or with your preferred bundler: npm run build:node:esbuild / :rollup / :webpack
   ```
2. **Run**:
   ```bash
   npm run start:node
   ```
3. **Containerized Deployment (Dockerfile)**:
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --omit=dev
   COPY . .
   RUN npm run build:node
   EXPOSE 3000
   CMD ["npm", "run", "start:node"]
   ```

---

### B. Deploying to Bun (Ultra-Fast Standalone or Single Binary)
Bun provides instant startup and zero-copy kernel streaming via `Bun.file`.

1. **Standard Mode (Built with Node, executed with Bun)**:
   ```bash
   npm run build:bun
   npm run start:bun
   ```
2. **Pure Bun Mode (100% Bun, zero Node.js on the CI/Build machine)**:
   ```bash
   npm run build:bun:pure
   npm run start:bun
   ```
3. **Self-Contained Executable (`bun build --compile`)**:
   Packages the entire runtime, node_modules, and application into a single standalone binary:
   ```bash
   npm run build:bun:compile
   # Run the resulting executable on any machine:
   ./dist/server
   ```

---

### C. Deploying to Deno and Deno Deploy
Deno provides granular permission security, native TypeScript support, and out-of-the-box persistence via Deno KV.

1. **Deno Standalone (VPS, Docker, or Linux Server)**:
   ```bash
   npm run build:deno
   npm run start:deno
   ```
2. **Deno Deploy (Globally Distributed Serverless Edge)**:
   ```bash
   npm run build:deno
   deployctl deploy --project=<my-project> .dinou/deno/main.js
   ```
   *Dinou automatically connects to `Deno.openKv()` in Deno Deploy, persisting ISR pages across Deno's global edge without requiring any external database configuration.*
3. **Self-Contained Executable (`deno compile`)**:
   Generates a single standalone executable embedding the Deno runtime, permissions, and Deno KV:
   ```bash
   npm run build:deno:compile
   # Run the resulting binary directly:
   ./dist/deno-server
   ```

---

### D. Deploying to Cloudflare Workers (Wrangler)
Executes across Cloudflare's global edge network spanning 300+ cities with sub-millisecond cold starts.

1. **Build for Cloudflare**:
   ```bash
   npm run build:cloudflare
   # (Generates the self-contained bundle at .dinou/cloudflare/worker.js)
   ```
2. **Local Preview with Wrangler**:
   ```bash
   npx wrangler dev --port 3000
   ```
3. **Deploy to Cloudflare**:
   ```bash
   npx wrangler deploy
   ```
   *(The `wrangler.toml` configuration routes static assets and SSG pages to `env.ASSETS`, serving them directly from Cloudflare's global CDN at zero compute cost)*.

---

### E. Deploying to Netlify (Functions v2)
Dinou includes official support for Netlify Functions v2 via [`dinou/adapters/netlify.js`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/adapters/netlify.js):

1. Create `netlify/functions/dinou.js` in your project:
   ```javascript
   export { default, config } from "dinou/adapters/netlify";
   ```
2. Configure your `netlify.toml`:
   ```toml
   [build]
     command = "npm run build"
     publish = ".dinou/dist3"

   [functions]
     directory = "netlify/functions"
   ```
3. With `preferStatic: true` pre-configured in the adapter, Netlify serves assets from `.dinou/dist3` directly through its CDN, invoking the serverless function only for dynamic SSR and Server Functions.

---

### F. 100% Pure Static Site Generation (SSG)
If your application uses static pages and client interactivity without dynamic server-side computation, you can export it with zero backend requirements:

1. **Export Static Files**:
   ```bash
   npm run export-static
   ```
   *Generates an independent, self-contained `out/` folder containing all pre-rendered HTML pages and `.rsc` binary payloads.*
2. **Upload Anywhere**:
   - **GitHub Pages**: `npx gh-pages -d out`
   - **Surge.sh**: `npx surge out my-domain.surge.sh`
   - **AWS S3 / Cloudflare Pages / DigitalOcean Spaces**: Uploading the `out/` directory directly to your storage bucket.

---

## 6. The Standard Static Assets Directory: `public/`

Dinou v7 adheres to standard industry conventions:
- Any file placed in `public/` (`favicon.ico`, `robots.txt`, `sitemap.xml`, images, fonts, etc.) is automatically copied to the root public output folder during compilation.
- It is served immediately at the root URL (e.g., `public/robots.txt` -> `https://example.com/robots.txt`).
- Full backward compatibility is preserved for projects that previously used the `favicons/` directory.

---

## 7. Complete `package.json` Scripts Overview

Dinou v7 organizes all operations into a structured matrix categorized by **Target Platform** and **Bundler Engine**:

```text
├── build / dev / start                      (Default development and build scripts)
│
├── Node.js AOT Dual-Bundle:
│   ├── build:node                           (Alias -> build:node:esbuild)
│   ├── build:node:esbuild / :rollup / :webpack
│   └── start:node / :esbuild / :rollup / :webpack
│
├── Deno & Deno Deploy:
│   ├── build:deno                           (Generates .dinou/deno/main.js & seeds KV)
│   ├── build:deno:esbuild / :rollup / :webpack
│   ├── build:deno:compile                   (Compiles standalone binary for current host OS)
│   ├── build:deno:compile:esbuild / :rollup / :webpack
│   ├── build:deno:compile:linux             (Cross-compiles for Linux x64 -> dist/deno-server-linux)
│   ├── build:deno:compile:linux:esbuild / :rollup / :webpack
│   ├── build:deno:compile:linux_arm         (Cross-compiles for Linux ARM64 -> dist/deno-server-linux-arm)
│   ├── build:deno:compile:linux_arm:esbuild / :rollup / :webpack
│   ├── build:deno:compile:mac               (Cross-compiles for macOS Apple Silicon -> dist/deno-server-mac)
│   ├── build:deno:compile:mac:esbuild / :rollup / :webpack
│   ├── build:deno:compile:win               (Cross-compiles for Windows x64 -> dist/deno-server-win.exe)
│   ├── build:deno:compile:win:esbuild / :rollup / :webpack
│   └── start:deno                           (Runs native Deno CLI adapter)
│
├── Bun Standalone & Compile:
│   ├── build:bun                            (Generates .dinou/bun/server.js)
│   ├── build:bun:esbuild / :rollup / :webpack
│   ├── build:bun:compile                    (Compiles standalone binary for current host OS)
│   ├── build:bun:compile:esbuild / :rollup / :webpack
│   ├── build:bun:compile:linux              (Cross-compiles for Linux x64 -> dist/server-linux)
│   ├── build:bun:compile:linux:esbuild / :rollup / :webpack
│   ├── build:bun:compile:linux_arm          (Cross-compiles for Linux ARM64 -> dist/server-linux-arm)
│   ├── build:bun:compile:linux_arm:esbuild / :rollup / :webpack
│   ├── build:bun:compile:mac                (Cross-compiles for macOS Apple Silicon -> dist/server-mac)
│   ├── build:bun:compile:mac:esbuild / :rollup / :webpack
│   ├── build:bun:compile:win                (Cross-compiles for Windows x64 -> dist/server-win.exe)
│   ├── build:bun:compile:win:esbuild / :rollup / :webpack
│   ├── build:bun:pure                       (100% Bun build, zero Node dependency -> :esbuild)
│   ├── build:bun:pure:esbuild / :rollup / :webpack
│   ├── build:bun:pure:compile               (Compiles standalone binary using 100% Bun)
│   ├── build:bun:pure:compile:esbuild / :rollup / :webpack
│   ├── build:bun:pure:compile:linux         (Cross-compiles for Linux x64 with 100% Bun)
│   ├── build:bun:pure:compile:linux:esbuild / :rollup / :webpack
│   ├── build:bun:pure:compile:linux_arm     (Cross-compiles for Linux ARM64 with 100% Bun)
│   ├── build:bun:pure:compile:linux_arm:esbuild / :rollup / :webpack
│   ├── build:bun:pure:compile:mac           (Cross-compiles for macOS Apple Silicon with 100% Bun)
│   ├── build:bun:pure:compile:mac:esbuild / :rollup / :webpack
│   ├── build:bun:pure:compile:win           (Cross-compiles for Windows x64 with 100% Bun)
│   ├── build:bun:pure:compile:win:esbuild / :rollup / :webpack
│   └── start:bun / :esbuild / :rollup / :webpack
│
├── Cloudflare Workers:
│   ├── build:cloudflare                     (Generates .dinou/cloudflare/worker.js)
│   ├── build:cloudflare:esbuild / :rollup / :webpack
│   └── test:cloudflare                      (E2E tests with Wrangler and Playwright)
│
└── Static Site Generation (SSG):
    ├── export-static                        (Alias -> export-static:esbuild)
    └── export-static:esbuild / :rollup / :webpack
```

---

## 8. Conclusion: Freedom, Performance, and Future-Proofing

The architecture of **Dinou v7** demonstrates that it is entirely possible to leverage the full power of **React 19 (Server Components, Streaming SSR, Server Functions, and ISR)** without submitting to cloud platform lock-in:
* **Zero Child Processes (`fork`)**: A unified, lightweight, and ultra-fast in-process AOT architecture.
* **No Platform Lock-in**: The exact same codebase runs in a Cloudflare Edge Worker, inside a Kubernetes cluster on Node.js, on a bare-metal Bun VM, or as a standalone native binary executable.
* **Built on Web Standards**: Your application code relies not on proprietary vendor SDKs, but on the universal open web standards of the W3C.
