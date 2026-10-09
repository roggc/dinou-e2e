# Caching and Invalidation Architecture in Dinou v7.2

> **Architectural Design Document and Reference Guide**  
> *Scope:* Dinou Core Engine, Edge/Node Runtime, and Client Router  
> *Date:* October 2026  

---

## 1. Overview: The Two Decoupled Cache Layers

Dinou strictly separates caching into **two decoupled layers**:

1. **Server Layer (Persistence and Artifacts):** Controls which pages, layouts, or fragments are pre-rendered to disk (`.dinou/dist2/`) or KV store (Cloudflare Workers, Deno KV), and how they are revalidated using Incremental Static Regeneration (ISR).
2. **Client Layer (In-Memory SPA Router):** Manages React Server Components (RSC) promises stored in the browser tab's memory to deliver instantaneous navigations (0ms network latency) and reconciliation without state loss.

```
                              BROWSER (Client)
 ┌────────────────────────────────────────────────────────────────────────┐
 │                                                                        │
 │   User Action:                                                         │
 │   - <Link href="/blog">          ──► Uses in-memory pageCache (0ms)   │
 │   - <Link href="/blog" fresh>    ──► pageCache.delete() ─┐            │
 │   - router.refresh()             ──► pageCache.delete() ─┼──┐         │
 │                                                          │  │         │
 └──────────────────────────────────────────────────────────┼──┼──────────┘
                                                            │  │
                                   HTTP Network Request     ▼  ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                                                                        │
 │                    DINOU SERVER (Node / Edge / Bun)                    │
 │                                                                        │
 │   1. Is the route revalidate = 0 or dynamic?                           │
 │      ├─► YES ──► Evaluates live component (Dynamic SSR)                │
 │      │                                                                 │
 │      └─► NO (Static SSG or unexpired ISG)                              │
 │           ├─► Did revalidate = N (ISR) expire?                         │
 │           │   ├─► YES ──► Serves current stale version + regenerates   │
 │           │   │           in background                                │
 │           │   └─► NO  ──► Serves static .rsc from disk/KV              │
 │           │                                                            │
 │           └─► Was revalidatePath() or revalidateTag() called?          │
 │               └─► Invalidates & regenerates static artifact on disk/KV │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Server Layer: Persistence and Revalidation (ISR)

The server manages static generation of pages (`page.rsc`, `index.html`) and layouts (`layout.rsc`).

### 2.1. Time-Based ISR (`revalidate`)
Declared in `page_functions.ts` or `layout_functions.ts`:

```typescript
// src/products/page_functions.ts
export const revalidate = 60; // 60 seconds (ISR)
// or alternatively:
// export const revalidate = 0;     // 100% Dynamic (Pure SSR)
// export const revalidate = false; // 100% Static (SSG until manual revalidation)
```

* **`revalidate >= 1` (Time-Based ISR):**
  * The page is pre-generated at build time or on first visit (ISG).
  * A companion `metadata.json` is stored alongside the artifact with the timestamp `generatedAt`.
  * If `Date.now() > generatedAt + (revalidate * 1000)`:
    * The existing version is served immediately (*stale*).
    * Regeneration runs in the background (`getBuildStaticPage()` and `getGenerateStaticRSC()`).
    * Upon completion, the new `.rsc` and `.html` files atomically replace the previous ones (via `safeRename`), archiving the prior files as `._old.rsc` for in-flight requests.
* **`revalidate = 0` (Pure Dynamic):**
  * Dinou detects `isDynamicConfig = true`.
  * In `dinou/core/handler.js`, `dynamicState.value = true` is set, completely bypassing static cache lookup. The page always executes the React component on the server.
* **`revalidate = false` (or absent):**
  * Considered permanently static (pure SSG) until an on-demand revalidation is triggered.

---

### 2.2. Surgical Page Revalidation (`revalidatePage`)

Exported from `"dinou/server"`, used when only the content of a specific page has changed and needs revalidation without incurring the overhead of layout recompilation:

```typescript
import { revalidatePage } from "dinou/server";

export async function updateArticle(slug: string) {
  // Regenerates exclusively page.rsc and its index.html
  await revalidatePage(`/blog/${slug}`);
}
```

* **What it does:**
  1. Regenerates **`page.rsc`**.
  2. Regenerates **`index.html`** for that page.
  3. **Does not touch any `layout.rsc`**, saving CPU on heavy or shared layouts.
  4. In Edge Runtime (Cloudflare KV / Deno KV): immediately updates the keys `page.rsc` and `index.html`.

---

### 2.3. Segment Revalidation and Cascade (`revalidatePath`)

Exported from `"dinou/server"`, this is the comprehensive route-level method. It revalidates all elements present in that specific directory:

```typescript
import { revalidatePath } from "dinou/server";

// 1. Standard segment revalidation
await revalidatePath("/dashboard");

// 2. Cascading revalidation (propagates to all child pages)
await revalidatePath("/dashboard", { cascade: true });
```

#### Artifacts Affected in `revalidatePath(path)`:
* **Page (`page.rsc`):** Regenerated if present in that folder.
* **Segment Layout (`layout.rsc`):** If a `layout.tsx` exists in that directory, it is regenerated atomically in both Node and Cloudflare KV (100% parity).
* **Full HTML (`index.html`):** The complete static render is re-evaluated (`getGenerateStaticPage()`).

#### Cascading Revalidation: `{ cascade: true }`
When `{ cascade: true }` is passed:
1. Dinou revalidates the current route `/dashboard` (`layout.rsc`, `page.rsc`, and `index.html`).
2. **Safety check:** Cascade **only triggers if a layout exists and was revalidated in that route**. If no layout is present, there is no shared wrapper to propagate, avoiding redundant work.
3. **Propagation:** If a layout was revalidated, Dinou recursively walks all child subfolders (`/dashboard/analytics`, `/dashboard/settings`, etc.) and internally executes **`revalidatePage(childPath)`** on each.

> **What problem does `{ cascade: true }` solve?**  
> It completely eliminates the risk of **Hydration Mismatch** on hard reloads (F5 or direct URL navigation). By updating a parent layout and cascading to all child pages, their static `index.html` files are freshly baked with the new layout, ensuring an exact match with the RSC stream and 0 visual flicker.

---

### 2.4. On-Demand Tag Revalidation (`revalidateTag`)

Allows attaching semantic tags to pages, layouts, or slots and purging them cross-cuttingly:

```typescript
// src/products/[slug]/page_functions.ts
export const getCacheTags = ["catalog", "products"];
```

When inventory updates:
```typescript
import { revalidateTag } from "dinou/server";

export async function syncInventory() {
  await revalidateTag("products"); // Invalidates all routes with this tag
}
```

#### How does `revalidateTag(tag, options)` operate internally?
Dinou recursively searches all metadata files associated with the specified tag and executes a specialized action based on the component type:

1. **If the tag was declared in `layout_functions.ts`:**
   * The tag is stored in `layout.metadata.json`.
   * **By default (`revalidateTag(tag)`):** Dinou internally executes **`revalidateLayout(path)`**.
     * **Scope:** Regenerates **exclusively `layout.rsc`**.  
     * **Advantage:** Leaves `page.rsc` and `index.html` untouched, offering ultra-fast revalidation (50ms) and minimal CPU overhead to update only the shell during SPA navigation, protecting servers against CPU avalanches in massive catalogs.
     * **Known Hydration Mismatch Risk:** Because `index.html` is not touched, a hard reload (F5 or direct URL entry) will serve the prior static HTML with the old layout, creating a potential *Hydration Mismatch* against the new `layout.rsc`.
   * **With cascade (`revalidateTag(tag, { cascade: true })`):** Dinou internally executes **`revalidatePath(path, { cascade: true })`**.
     * **Scope:** Regenerates `layout.rsc` and cascades `revalidatePage` to all child pages to bake the new layout into their `index.html`.
     * **Advantage:** Eliminates the risk and guarantees **0 Hydration Mismatch** on hard reloads (F5) in bounded modules (e.g., `/dashboard`).
2. **If the tag was declared in `page_functions.ts`:**
   * The tag is stored in `metadata.json`.
   * Dinou internally executes **`revalidatePage(path)`**.
   * **Scope:** Regenerates **exclusively `page.rsc`** and **`index.html`**.  
   * **Advantage:** Leaves `layout.rsc` untouched (even if the page shares a folder with a `layout.tsx`), guaranteeing surgical revalidation symmetric to layouts and avoiding CPU waste.
3. **If the tag was declared in a `<DinouCacheSlot>`:**
   * The tag is stored in `slot.metadata.json`.
   * Dinou purges exclusively the directory or key of that specific slot.

---

#### Full Runtime Parity: Node/Bun (Filesystem) vs Cloudflare Workers / Edge (KV Storage)

Dinou guarantees 100% isomorphic behavior between filesystem environments (Node.js / Bun) and serverless Edge KV stores (Cloudflare KV / Deno KV):

* **`revalidatePage(path)`:** In both environments, regenerates exclusively `page.rsc` and `index.html`.
* **`revalidatePath(path)`:** In both environments, regenerates `page.rsc`, `index.html`, and **`layout.rsc`** (if a layout exists in that folder). In Edge KV, Dinou verifies the existence of `layout.rsc` / `layout.metadata.json` for that segment and coordinates `revalidateLayout`.
* **`revalidatePath(path, { cascade: true })`:** In both environments, cascades `revalidatePage` to all child routes if a layout was revalidated.
* **`revalidateTag(tag, options)`:** 
  * If the tag is on a layout (`layout_functions.ts`):
    * By default, regenerates exclusively `layout.rsc`.
    * With `{ cascade: true }`, regenerates `layout.rsc` and cascades `revalidatePage` to all child pages via `revalidatePath(path, { cascade: true })`.
  * If the tag is on a page (`page_functions.ts`), regenerates exclusively `page.rsc` and `index.html` (via `revalidatePage`).
  * If the tag is on a slot (`<DinouCacheSlot>`), purges exclusively that fragment.

#### Golden Rules and Invalidation Best Practices:
1. **Surgical Shell Invalidation:**  
   Declare the tag **only in `layout_functions.ts`** (e.g., `["dashboard-shell"]`) and call `revalidateTag("dashboard-shell")`. Only `layout.rsc` is recompiled for SPA navigation.
2. **Surgical Page Invalidation:**  
   Use `revalidatePage("/path")` or declare the tag **only in `page_functions.ts`** for that page (e.g., `["analytics-view"]`). Only that specific page and its HTML are recompiled.
3. **Full Module Invalidation (Layout + Children):**  
   Use `revalidatePath("/dashboard", { cascade: true })`, call **`revalidateTag("dashboard", { cascade: true })`**, or declare a shared tag **in both `layout_functions.ts` and child `page_functions.ts`**. This ensures Dinou updates the parent layout and all module child HTMLs atomically across all runtimes, guaranteeing 0 Hydration Mismatch.

---

### 2.5. Vertical Segmentation: Micro-ISR with `<DinouCacheSlot>`

Dinou enables component-level granularity inside a page:
```tsx
import { DinouCacheSlot } from "dinou";

<DinouCacheSlot id="news-panel" tag="news" revalidate={30}>
  <LiveNews />
</DinouCacheSlot>
```
* Each slot stores its own payload (`____rsc_slot____/news-panel`) and its own `slot.metadata.json`.
* Can be invalidated from the server with `revalidateTag("news")` or from the client with `router.refreshSlot("news-panel")` without re-rendering the surrounding page.

---

## 3. Client Layer: SPA Router and In-Memory Cache

Dinou's router (`dinou/core/client.jsx`) manages smooth, ultra-fast SPA navigation.

### 3.1. The Router's In-Memory Caches (`pageCache` and `layoutCache`)

The client router maintains two in-memory structures for instant, flicker-free navigations:

1. **`pageCache` (Page Cache):**
   ```javascript
   const pageCache = new Map(); // url -> Promise<RSCPayload>
   ```
   * When navigating to an already visited route (e.g., `<Link href="/dashboard">`), it is served directly from `pageCache`.
   * **0ms Latency:** No network requests are made to the server.

2. **`layoutCache` (Layout Preservation):**
   ```javascript
   const layoutCache = new Map(); // layoutKey -> Promise<RSCPayload>
   ```
   * When navigating between pages sharing the same layout (e.g., from `/dashboard/analytics` to `/dashboard/settings`), Dinou checks if `layoutKey` (`/dashboard`) already exists in `layoutCache`.
   * **Core Benefit:** The layout is **neither downloaded again nor re-mounted in React**. Sidebar scroll state, focus, playing audio, and input states within the layout remain completely uninterrupted.

---

### 3.2. The `<Link fresh>` Prop

```tsx
<Link href="/t-spa-fresh/random" fresh>
  View Fresh Value
</Link>
```

* **What it does:** Executes `pageCache.delete(finalPath)` immediately before navigating.
* **What it does NOT do:** It does **NOT** invalidate the server cache. It does not delete files in `.dinou/dist2/` nor call `revalidatePath`.
* **Purpose:** Instructs the client router: *"Do not use the in-memory cached promise from prior visits; make an actual HTTP request to the server"*.
* **Behavior at destination:**
  * If the destination is **dynamic** (`revalidate = 0`): The server evaluates the component and returns fresh data.
  * If the destination is **static** (SSG): The server returns the existing pre-compiled static `.rsc`.

---

### 3.3. The `router.refresh()` Method

```tsx
const router = useRouter();

// 1. Standard page refresh (default)
<button onClick={() => router.refresh()}>
  Refresh Page
</button>

// 2. Full refresh with Layout (page + layout shell)
<button onClick={() => router.refresh({ layout: true })}>
  Refresh Everything (Includes Layout)
</button>
```

* **What it does by default (`router.refresh()`):**
  1. Deletes the current page from client cache: `pageCache.delete(currentPath)`.
  2. **Preserves `layoutCache` intact**: Avoids unnecessary layout network requests (1 RSC request instead of 2), ensuring maximum speed and zero disturbance to the layout shell (expanded menus, media players, etc.).
  3. Triggers `startTransition(() => setVersion(v => v + 1))`.
  4. Fetches the fresh RSC payload for the current page from the server.
  5. Reconciles the React component tree while **preserving client state intact** (input text, focus, `useState` states, scroll position).
* **With `{ layout: true }` (`router.refresh({ layout: true })`):**
  1. Deletes `pageCache` for the current page and also purges the active layout from `layoutCache`.
  2. Triggers `startTransition`, incrementing both the page version and `layoutVersion`.
  3. Fetches both updated page and layout from the server (ideal after global mutations like updating an avatar or switching the active organization in the navbar).
* **What it does NOT do:** It does **NOT** force a static page to become dynamic on the server.
* **Behavior by environment:**
  * **In Development:** All routes are dynamic; `refresh()` always reflects the latest code and data changes.
  * **In Production:**
    * If the route is **dynamic** (`revalidate = 0`): Refreshes with the latest server data.
    * If the route is **static** (SSG): The server returns the generated static payload (or newly revalidated if ISR expired or `revalidatePath`/`revalidatePage` was called). Input and client states are preserved without a full page reload.

---

## 4. Internal Endpoints and the `window.__DINOU_USE_STATIC__` Flag

### 4.1. The RSC Endpoint Family
Dinou splits component requests across two pipelines:

| Endpoint | Type | Server-Side Behavior |
| :--- | :--- | :--- |
| `/____rsc_page____/*` | Dynamic | Goes through the live React evaluation pipeline (`getJSX` ➔ `pipeRSC`). |
| `/____rsc_page_static____/*` | Static | Reads directly from the pre-compiled binary file on disk (`page.rsc`) or ASSETS/KV without evaluating React. |
| `/____rsc_layout____/*` | Segmented Dynamic | Evaluates exclusively the requested layout. |
| `/____rsc_layout_static____/*` | Segmented Static | Serves `layout.rsc` directly from disk/KV. |

### 4.2. What is `window.__DINOU_USE_STATIC__` for?
When a user initially visits an application (first HTML request), the server inspects whether that specific page is served from static cache ([`handler.js:1890`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js#L1890)):

```javascript
if (shouldCacheISG && !isPprConfig) {
  bootstrapScriptContent += "window.__DINOU_USE_STATIC__ = true;\n";
} else {
  bootstrapScriptContent += "window.__DINOU_USE_STATIC__ = false;\n";
}
```

* **Role on client:** Informs the router whether the production application can request payloads via the ultra-fast `/____rsc_page_static____` route.
* **Server guarantee:** On the server ([`handler.js:1228`](file:///c:/Users/roggc/dev/my-dinou-apps/dinou-e2e/dinou/core/handler.js#L1228)), Dinou evaluates the route configuration (`resolvePageFunctionsConfig`) **before** deciding to serve from static cache. If the page declares `revalidate = 0`, the server sets `dynamicState.value = true` and enforces dynamic execution, ensuring dynamic routes are never accidentally served from static files.

---

## 5. Strategy Summary Matrix

| Mechanism | Layer | Execution Target | Invalidates Server? | Invalidates Client? | Preserves Client State |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **`revalidate = N` (ISR)** | Server | Declarative (`page_functions.ts`) | **Yes** (time-based SWR) | Indirect | N/A |
| **`revalidatePage(path)`** | Server | Server Action / Endpoint | **Yes** (page/HTML only) | Indirect | N/A |
| **`revalidatePath(path)`** | Server | Server Action / Endpoint | **Yes** (current segment) | Indirect | N/A |
| **`revalidatePath(path, { cascade: true })`** | Server | Server Action / Endpoint | **Yes** (layout + children) | Indirect | N/A |
| **`revalidateTag(tag, { cascade? })`** | Server | Server Action / Endpoint | **Yes** (selective or cascade) | Indirect | N/A |
| **`<Link href="...">`** | Client | JSX | No | No (uses `pageCache`) | Yes (Soft Nav) |
| **`<Link href="..." fresh>`** | Client | JSX | No | **Yes** (`pageCache.delete`) | No (fresh page) |
| **`router.refresh()`** | Client | `useRouter()` hook | No | **Yes** (page only by default; layout with `{layout:true}`) | **Yes** (maintains inputs/focus) |
| **`router.refreshSlot(id)`** | Client | `useRouter()` hook | No | **Yes** (slot only) | **Yes** (rest of page unchanged) |
