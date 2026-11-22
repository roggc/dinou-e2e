# Dinou v10.0.2+ Core Fixes & 3D Caching Engine E2E Blueprint (`x-fixes-dinou.md`)

> **Target Audience:** Upstream Dinou maintainers and the `dinou-e2e` test-suite agent.
> **Purpose:** Complete technical specification of all root-cause bugs found while stress-testing Dinou `10.0.2` against the expanded 46-check 3D Caching Cube verification suite (`dinou-benchmark`), the exact core fixes applied in `./dinou/core/` that brought Dinou to **46/46 (100%, 0 hydration errors)**, the regression uncovered across the original 36 checks in ejected/monorepo mode, and exhaustive E2E fixture/test blueprints so `dinou-e2e` can replicate every scenario and guard all GitHub Actions pipelines against regressions.

---

## 1. Executive Summary & Verification Results

During full 3D Caching Cube verification (`HS` × `Cache-Slot` × `PPR`, plus Dinou v10 per-segment PPR chains and asymmetric dynamic/static layouts):

| Stage | Dinou Score | Failing Checks | Notes |
| --- | :---: | --- | --- |
| Baseline Dinou `10.0.2` (before fixes) | **41/46** (`89.1%`) | `#37`, `#39`, `#40`, `#41`, `#46` | 2 core architectural root causes (PPR SWR hydration race + flattened multi-level layout coupling) |
| After Fix #1 & Fix #2 (ejected `./dinou`, before Fix #3) | **37/46** (`80.4%`) | `#14`, `#15`, `#16`, `#17`, `#22`, `#23`, `#24`, `#25`, `#32` | **All 10 new checks `#37–#46` passed 10/10 immediately**; exposed `RouterContext` duplication in ejected/monorepo client bundles (8 checks) and a hidden `#418` blindspot in Check `#22` (1 check) |
| **Final (All fixes applied)** | **46/46 (`100.0%`)** | **None (0 flaky, 0 hydration errors)** | `tsc --noEmit` = 0 errors · `build` = 140 pages & 20 layouts · `dev` cold start = 4.35 s · `HMR` = 830 ms |

For reference, **Next.js `16.4.6`** scored **36–37/46** on the exact same 1:1 suite (failing `#24`, `#27`, `#29`, `#31`, `#33`, `#41`, `#44`, `#45` deterministically, plus intermittent `#19` / `#28`).

---

## 2. 3D Caching Engine Coverage Map (All 46 Checks)

Out of the **46 total checks** in `scripts/verify.mjs`:
- **Checks `#1–#13` (13 checks):** Core baseline (SSG, ISR, 404/perimeter guards, Streaming SSR dashboard, basic PPR streaming, Server Function mutation).
- **Checks `#14–#46` (33 checks):** Full **3D Caching Engine** suite covering all **7 vertices** of the 3D Caching Cube:
  - **Checks `#14–#36` (23 checks):** Original rigorous 3D caching suite.
  - **Checks `#37–#46` (10 checks):** New deep-stress 3D Caching Cube + Per-Segment PPR + Asymmetric HS suite added in this round.

| Cube Vertex | Axis Combination | Original Rigorous Checks (`#14–#36`) | New Deep Checks (`#37–#46`) |
| --- | --- | --- | --- |
| **Vertex 1** | Pure Horizontal Segmentation (`X`: HS) | `#14`, `#15`, `#16`, `#23`, `#24`, `#25`, `#26`, `#35`, `#36` | **`#37`** *(Asymmetric dynamic layout `revalidate=0` + static L1 + static page + `revalidatePath`)* |
| **Vertex 2** | Pure Vertical Segmentation (`Y`: Cache-Slot) | `#17`, `#27`, `#28`, `#33` | **`#38`** *(Bidirectional nested slots: invalidate outer → inner stays cached + dynamic-host 1s slot TTL)* |
| **Vertex 3** | Pure PPR (`Z`: Partial Prerendering) | `#18` | **`#39`** *(Shell & `noDynamic()` collapsed Suspense freeze vs 7 dynamic holes + interactive hole widget + 1s PPR shell TTL)* |
| **Vertex 4** | Pairwise `X + Y` (HS + Cache-Slot) | `#20`, `#29`, `#31`, `#32` | **`#42`** *(`@sidebar` slot + L1 nested slots + L2 layout slot + nested page slot live refresh preserving L1/L2 client state + F5)* |
| **Vertex 5** | Pairwise `X + Z` (HS + PPR + Per-Segment PPR) | `#21`, `#30` | **`#40`** *(Per-segment mixed PPR chains `false→true→false` & `false→true→true` + surgical L1 reval)*, **`#43`** *(Soft nav PPR A→B→static opt-out→nested L2 PPR + 4 live holes)* |
| **Vertex 6** | Pairwise `Y + Z` (PPR + Cache-Slot) | `#19` | **`#41`** *(Shell slot + `noDynamic()` static-Suspense slot + 1s shell & hole slot TTLs + live `refreshSlot` inside PPR hole + F5 hydration)* |
| **Vertex 7** | **Triple Synergy `X + Y + Z`** | `#22`, `#34` | **`#44`** *(Real L1 PPR cookie hole + 3-layer live `refreshSlot` across L1/Page shells & hole)*, **`#45`** *(Wildcard `refreshSlot("*")` across 3D layers + PPR↔Static round-trip)*, **`#46`** *(Surgical L2 `revalidateLayout` + real L2 PPR hole + nested PPR & static children)* |

---

## 3. Root Causes Discovered & Analyzed

### Bug 1 — PPR Stale-While-Revalidate (SWR) Hydration Race → React Error `#418`
- **Failed Checks:** `#39` (Part B: `/rigorous/ppr/ttl-shell`, 1s PPR shell TTL) and `#41` (Part B: `/rigorous/ppr-cache-slot`, 1s PPR shell-slot TTL).
- **Hidden Pre-Existing Victim:** `#22` (`/rigorous/triple`, 1s PPR shell-slot TTL — see Bug 4 below).
- **Root Cause:**
  1. In `dinou/core/handler.js` (Section 3, cached HTML hit), `cachedItem.content` (the **stale** `shell.html`, e.g. containing `100`) is already loaded in memory.
  2. When a 1s TTL expires (`isExpired` for page TTL, `isPageSlotTtlExpired` for page shell slots, or `isLayoutSlotTtlExpired` for layout shell slots), `handler.js` immediately kicked off **background SWR** (`revalidatePage(reqPath, { onlyIfExpired: true })` / `revalidatePage(reqPath, { onlyRefreshSlots: true })` / `revalidateLayout(route, { onlyRefreshSlots: true })`) **before** calling `handlePprResume(...)`.
  3. Inside `dinou/core/ppr-runtime.js` (`handlePprResume`), the async `resumePromise` immediately wrote the stale `shellPrelude` (`100`) to the HTTP stream, and **then** called `readShellJsonFromStorage(storage, shellPageKey)` and `readShellJsonFromStorage(storage, shellLayoutKey)`.
  4. Because background revalidation ran concurrently and overwrote `shell.page.json` / `shell.layout.json` with the **new** value (`538` / `553`) before `readShellJsonFromStorage` completed (or while dynamic holes awaited `sleep(20)`), `handlePprResume` emitted inline Flight scripts (`__DINOU_RSC_P__` / `__DINOU_RSC_L__`) with `538`/`553` inside an HTTP response whose SSR DOM still contained `100`.
  5. React 19 hydrated DOM `100` against Flight `538`/`553` → **`Minified React error #418`** (`args[]=text`).
  6. **Concurrent Request Window:** Even across two concurrent requests, `cache-revalidate.js` committed `shell.page.json` *before* committing `index.html`/`shell.html` without saving `shell.page._old.json` / `shell.layout._old.json`, creating a race window where Request B could read old `shell.html` + new `shell.page.json`.

### Bug 2 — Flattened Multi-Level Layout Stack Coupling (`Root -> L1 -> L2`)
Previously, Dinou stored only a single flattened `layout.rsc` + `shell.layout.json` per layout directory representing the entire active layout chain (`Root -> L1 -> L2 -> <DinouPageSlot />`), always rendered top-to-bottom via `getJSX(reqPath, ..., { segment: "layout" })`. This broke per-level horizontal isolation in three distinct ways:

- **Bug 2A — Direct child `revalidateLayout(L2)` re-executed ancestor `L1` (Failed Check `#46`):**
  - Calling `revalidateLayout("/rigorous/triple/nested")` invoked `getJSX("/rigorous/triple/nested", ..., { segment: "layout" })`, which re-executed `Root`, **`L1` (`/rigorous/triple/layout.tsx`)**, and `L2` (`/rigorous/triple/nested/layout.tsx`).
  - With `tsL1ShellSeq` poisoned to `999`, `L1` leaked `999` instead of remaining frozen at `100`.
- **Bug 2B — Ancestor `revalidateLayout(L1)` forced descendant `L2` to re-execute (Failed Check `#40`):**
  - In `/rigorous/ppr/mixed/l2-ppr` (`L1 ppr=false -> L2 ppr=true -> Page ppr=false`), calling `revalidateLayout("/rigorous/ppr/mixed")` advanced `L1.layoutGeneratedAt`.
  - On the next request to `/rigorous/ppr/mixed/l2-ppr`, `handler.js` detected `isAncestorOwnNewer` (`L1.layoutGeneratedAt > L2.layoutGeneratedAt`) and called `revalidateLayout("/rigorous/ppr/mixed/l2-ppr")`, which ran `getJSX(..., { segment: "layout" })` and **re-executed `L2/layout.tsx`**.
  - With `pprMixedL2ShellSeq` poisoned to `999`, `L2`'s PPR static shell leaked `999` instead of remaining cached at `100` while splicing in the new `L1` (`541`).
- **Bug 2C — Asymmetric Dynamic Layout (`revalidate = 0`) + Static Ancestor (`3600s`) + Static Page (`3600s`) (Failed Check `#37`):**
  - Route `/rigorous/hs/dyn-layout-static-page` has `Root (static) -> L1 /rigorous/hs (3600s) -> L2 (revalidate=0) -> Page (3600s)`.
  - At runtime, `handler.js` saw `L2.isDynamic === true`, set `dynamicState.value = true` for the entire route, bypassed cache, and fell through to full SSR `getJSX(reqPath, ...)` which re-executed **`L1` (`999`)** AND **`Page` (`999`)** on every request instead of reusing cached `L1` (`100`) and cached `Page` (`100`) while executing only dynamic `L2` (`510`).
  - Furthermore, calling `revalidatePage("/rigorous/hs/dyn-layout-static-page")` saw `L2` had no cached `layout.rsc`, mistakenly attempted `revalidateLayout(L2)` (freezing a `revalidate = 0` layout!), and fell back to `fullJsx = await getJSX(...)`, re-executing `L1`.
  - Also, `handler.js` previously only saved `shell.page.json` during SSG/ISG when `genMeta.ppr || genMeta.slotTags.length > 0`, so plain static pages without PPR or slots had no `shell.page.json` available for asymmetric composition.

### Bug 3 — Regression in Original 36 Checks: Duplicate `RouterContext` in Ejected/Monorepo Mode
- **Failed Checks (after ejecting `./dinou`):** `#14`, `#15`, `#16`, `#17`, `#23`, `#24`, `#25`, `#32` (8 checks).
- **Symptom:** Browser console logged `warning: navigate called outside Router`. Clicking `<Link>` or calling `router.refresh()` inside `"use client"` components (e.g., `RigorousControls`) silently became a no-op, while `<Link>` rendered directly from Server Components still worked.
- **Root Cause:**
  - `dinou/core/slot.js` already stores `DinouPageContext` on `globalThis.__DINOU_PAGE_CONTEXT__` so multiple client bundle chunks always reference the same React Context object.
  - `dinou/core/navigation.js` created `export const RouterContext = createContext(...)` as a module-local object **without** a `globalThis` singleton.
  - In ejected / workspace-linked monorepo setups (`"dinou": "file:../../dinou"`), esbuild bundled `navigation.js` into `main.js` (via `./navigation.js`) and also into client component chunks importing `{ Link, useRouter } from "dinou"`, creating **two distinct `RouterContext` instances** at runtime in the browser.

### Bug 4 — Hidden Hydration Error Blindspot in Original Check `#22`
- **Failed Check (after fixing Bug 1):** `#22` (`rigorous-triple: 3D matrix surgical isolation (HS + Cache-Slot + PPR + 1s clock TTL)`).
- **Root Cause:**
  - Check `#22` waited 1.25s for a 1s `<DinouCacheSlot>` inside the PPR static shell (`#ts-ppr-a-ttl-shell-slot-seq`) to expire, reloaded **only once**, and asserted `"151"` immediately while checking `hydrationErrors` using only `page.on("console", msg => msg.type() === "error" && /hydrat/i.test(msg.text()))`.
  - In React 19 production builds, hydration mismatches throw `Minified React error #418` on `pageerror` (which does **not** contain the substring `"hydrat"`!).
  - Prior to Fix #1, Check `#22` only passed on reload #1 **because Bug 1 triggered React `#418`**, causing React to discard the stale SSR DOM (`100`) and client-render the raced Flight payload (`151`).
  - Once Fix #1 eliminated the `#418` race and restored true zero-error SWR (reload #1 serves consistent stale `100` at 0ms TTFB + triggers background refresh; reload #2 serves fresh `151`), Check `#22` properly revealed stale `100` on reload #1 — unlike every other 1s TTL check in `verify.mjs` (`#26`, `#27`, `#30`, `#38`, `#39`, `#41`), which all already perform the 2-reload SWR check.
  - **Fix in test harness:** Upgraded Check `#22` (and the other legacy hydration listeners in `verify.mjs`) to capture BOTH `console` errors and `pageerror` matching `/hydrat|418|425/i`, and added the standard SWR second-reload fallback when reload #1 serves the stale SWR value.

---

## 4. Detailed Implementation Specification (`dinou/core/`)

### 4.1 New Storage Artifacts & Metadata Schema

#### Per-Layout Storage Keys (in `FileSystemStorage` / KV / `dist2` / `ASSETS`)
| Key Pattern | Purpose |
| --- | --- |
| `[layoutKey/]shell.layout.own.json` | **NEW:** Serialized client-JSX tree of **only this single layout level** (with its own `@slots` and `layout_functions.getProps`), with a `createLayoutChildrenPlaceholder()` element at `{children}` and 0-based local PPR hole IDs (`ppr-hole-1..ownSuspenseCount`). |
| `[layoutKey/]shell.layout.json` | Composed client-JSX tree (`Root.own -> ... -> Leaf.own -> <DinouPageSlot />`) with shifted global PPR hole IDs. |
| `[layoutKey/]shell.layout._old.json` | **NEW:** Atomic previous snapshot of `shell.layout.json` written before updating `shell.layout.json` (used by causal PPR resume reads). |
| `[layoutKey/]layout.rsc` / `layout._old.rsc` | Existing composed Flight RSC stream & previous snapshot (wire format 100% unchanged). |
| `[pageKey/]shell.page.json` | Serialized client-JSX tree of the isolated page segment — now **persisted unconditionally** for all static/PPR pages (not only when `ppr` or `slotTags.length > 0`). |
| `[pageKey/]shell.page._old.json` | **NEW:** Atomic previous snapshot of `shell.page.json` written before updating `shell.page.json`. |

#### New Fields in `layout.metadata.json` & SSG Response Headers
| Metadata Field | SSG Header (`____rsc_layout____`) | Semantics |
| --- | --- | --- |
| `ownGeneratedAt` | *(set from `ssgLayoutGen`)* | Timestamp of when **this layout's own `.tsx`** last executed. Used for **this layout's own `revalidate` TTL clock**. |
| `ownHoles` | `X-Dinou-Own-Ppr-Holes` | Dynamic PPR hole IDs belonging to this level only, 0-based (`["ppr-hole-1", ...]`). |
| `ownSuspenseCount` | `X-Dinou-Own-Suspense-Count` | Total `<Suspense>` count within this level when `ownPpr === true`. |
| `ownSlotTags` | `X-Dinou-Own-Slot-Tags` | `<DinouCacheSlot>` IDs/tags rendered inside this level (including its `@slots`). |
| `ownPpr` | `X-Dinou-Own-Ppr` | Effective boolean `ppr` for this level alone (no inheritance from parent). |

#### Timestamp State Machine Invariants (Critical!)
Every layout level tracks three timestamps in `layout.metadata.json`:

| Operation | `generatedAt` | `layoutGeneratedAt` | `ownGeneratedAt` | Effect on Descendants & Pages |
| --- | :---: | :---: | :---: | --- |
| **SSG Build (`generate-static.js`)** | `T0` | `T0` | `T0` | Baseline monotonic ancestor-first timestamps |
| **Direct `revalidateLayout(L)`** | `T_new` | `T_new` | `T_new` | Descendants see `maxAncestorLayoutGen > child.layoutGeneratedAt` → triggers `recomposeOnly: true` (does **NOT** re-execute child `.tsx`!). Pages see `leaf.generatedAt > page.generatedAt` → lazy HTML recomposition. |
| **Ancestor-triggered `revalidateLayout(L, { recomposeOnly: true })`** | `T_new` | `T_new` | **Preserved (`T_prev`)** | Stops repeated recomposition on next request (`maxAncestorLayoutGen <= L.layoutGeneratedAt`), cascades to `L3` if present, **without resetting `L`'s own TTL clock**! |
| **Slot-only `revalidateLayout(L, { onlyRefreshSlots: true })`** | `T_new` | **Preserved** | **Preserved** | Descendants see `isAncestorSlotOnlyNewer` (`maxAncestorGen > child.generatedAt`) → triggers `onlyRefreshSlots: true`, never re-executing `L` or children! |

> **TTL Check Invariant:** `isLayoutTtlExpired` MUST always compare `Date.now() > entry.ownGeneratedAt + entry.revalidate * 1000` (falling back to `layoutGeneratedAt || generatedAt` for legacy metadata), never `layoutGeneratedAt`, so recomposing due to an ancestor never resets a child layout's TTL.

---

### 4.2 File-by-File Changes in `./dinou/core/`

#### 1. `dinou/core/layout-composition.js` *(NEW — 599 lines)*
Core engine for per-level layout isolation and composition:
- `shiftPprHoleIdsInTree(node, offset)` & `shiftPprHoleEntry(hole, offset)`: Pure recursive React element tree transform that shifts every `props["data-ppr-hole"]` and `props["data-ppr-static-parent"]` matching `/^ppr-hole-(\d+)$/` by `+offset`, leaving client references, server references, promises, and `createLayoutChildrenPlaceholder()` intact.
- `renderSingleLayoutLevel(entry, options)`:
  - Loads only `entry.layoutPath`, resolves `entry.slots` (`@sidebar`, `@badge`, etc.) with per-slot `error.tsx` isolation, calls `getLayoutProps(entry.layoutPath, entry.dParams)`, wraps `createLayoutChildrenPlaceholder()` as `children`, and executes `asyncRenderJSXToClientJSX` inside a scoped `layoutSegmentStore` (`scopePrefix: sanitizeLayoutScope(entry.cleanLayoutKey)`).
  - When `usePprContext === true` (SSG / ISR revalidation): runs inside `runWithPprContext({ isPpr: Boolean(entry.effectivePpr) })`. For `effectivePpr === true`, probes `@slots` for errors, then calls `resetPprHoles(0)` with a fresh `ownSlotTagSet` and `makeSegmentStore()` before rendering `layoutElement` so `@slots` and `Layout` holes are numbered once in exact DFS JSX order. For `effectivePpr === false`, renders `@slots` once and preserves `ownSlotTagSet`.
  - When `usePprContext === false` (live dynamic layout on a real request, e.g. `revalidate = 0`): executes directly in the active request context with real cookies/headers/query and zero PPR postponement.
- `composeLayoutChainFromOwnFragments(activeChain, storage, options)`:
  - Iterates `activeChain` **outermost → innermost** (`activeChain.length - 1` down to `0`).
  - For each level: takes either `overrides.get(key)` (freshly rendered static/dynamic level) or reads & deserializes `${key}/shell.layout.own.json` (plus `layout.metadata.json`) from storage/ASSETS/dist2. Returns `null` if any required static ancestor has no override and no cached own-fragment (or is marked `lMeta.dynamic`), allowing callers to safely fall back to full `getJSX`.
  - Supports `refreshSlotsForKeys` (`"all"` or `Set<string>`) and `persistRefreshedOwnKeys` (`boolean` or `Set<string>`), calling `refreshNestedSlotsInTree` on deserialized own fragments and persisting refreshed `shell.layout.own.json` for owned keys.
  - Shifts `ownTree` and `ownHoles` by `runningOffset` whenever `levelPpr === true`, increments `runningOffset += ownSuspenseCount`, unions `ownSlotTags`, and splices each inner level into the outer level's `createLayoutChildrenPlaceholder()` via `replaceLayoutChildrenPlaceholder`.
  - Returns `{ layoutOnlyTree, composedWithPlaceholder, holes, suspenseCount, slotTags, anyLayoutPpr, leafOwnMeta }`, where `layoutOnlyTree` replaces the innermost leaf placeholder with `createDinouPageSlotElement()`, and `composedWithPlaceholder` retains the leaf placeholder so callers can splice a cached or dynamic `pageClientJsx` directly into it.
- `hydrateActiveChainPpr(activeChain, reqSegments, queryObj, srcFolder, options)`: Populates `entry.effectivePpr` on every entry in `activeChain` via `resolveLayoutChainPpr`.
- `readStorageArtifact` / `readLayoutMeta`: Unified storage + Cloudflare `ASSETS` + `dist2` fallback readers honoring `isKeyDeleted`/`isDeleted`.

#### 2. `dinou/core/ppr-runtime.js`
- Exported `readShellJsonFromStorage`.
- Extended `handlePprResume` to accept optional `preloadedPageShellJson` and `preloadedLayoutShellJson`.
- Inside `resumePromise`, uses `preloadedPageShellJson` / `preloadedLayoutShellJson` whenever `!== undefined` instead of re-reading from storage after SWR has started.

#### 3. `dinou/core/handler.js`
7 targeted integration points:
1. **Imports:** Added `readShellJsonFromStorage`, `replaceLayoutChildrenPlaceholder`, and `layout-composition.js` exports.
2. **Section 6 — RSC layout chain validation (`/____rsc_layout____`, `/____rsc_page____`):** Reads `entry.ownGeneratedAt`, uses it for `isLayoutTtlExpired`, and passes `recomposeOnly: !isLayoutTtlExpired && isAncestorOwnNewer` to `revalidateLayout`.
3. **Section 6 — SSG layout compilation (`platformContext.isSSG && isLayoutReq`):** Renders only the leaf layout via `renderSingleLayoutLevel`, saves `shell.layout.own.json`, emits `X-Dinou-Own-*` headers, composes with cached ancestors via `composeLayoutChainFromOwnFragments`, saves `shell.layout.json`, and emits composed headers (`X-Dinou-Ppr-Holes`, `X-Dinou-Suspense-Count`, `X-Dinou-Slot-Tags`, `X-Dinou-Ppr`). Falls back cleanly to `getJSX` if dynamic or missing ancestors.
4. **Section 6 — PPR `/____rsc_page____` SWR ordering:** Reads `shellJson` **before** launching background `isPprPageSlotExpired` `revalidatePage`.
5. **Section 6 — Dynamic `/____rsc_layout____` with static ancestors:** When `isLayoutReq && dynamicState.value` in production, renders only dynamic layout levels (`lCfg.isDynamic || lMeta?.dynamic`) fresh via `renderSingleLayoutLevel(..., { usePprContext: false })` and splices them into cached static ancestors' `shell.layout.own.json` via `composeLayoutChainFromOwnFragments` (preserving static ancestor isolation even on soft nav!).
6. **Section 7 & Section 3 — HTML cache hit path:**
   - Tracks `entry.isDynamicConfig`, `entry.revalidate`, and route-level `hasDynamicLayoutConfig`.
   - Guards Section 3 cached HTML fast-path with `&& !hasDynamicLayoutConfig` (so routes with a `revalidate = 0` layout never serve stale `index.html`).
   - Uses `entry.ownGeneratedAt` for `isLayoutTtlExpired` and passes `recomposeOnly: !isLayoutTtlExpired && isAncestorOwnNewer` to `revalidateLayout`.
   - Defers background `isLayoutSlotTtlExpired` into `pendingLayoutSlotRevalPaths`.
   - **After** synchronous lazy HTML recomposition finishes and **before** launching ANY background SWR (`pendingLayoutSlotRevalPaths`, `isPageSlotTtlExpired`, `isExpired`), snapshots `preloadedPageShellJson` and `preloadedLayoutShellJson` (automatically selecting `shell.page._old.json` / `shell.layout._old.json` if storage `metadata.generatedAt > cachedItem.metadata.generatedAt`), and passes both into `handlePprResume(...)`.
7. **Section 4 — Asymmetric Dynamic Layout SSR & unconditional `shell.page.json` persistence:**
   - Persists `shell.page.json` unconditionally whenever `context._resolvedPageClientJsx` is cached during SSG/ISG.
   - In Dynamic SSR (`!isDevelopment && !isSSG && hasDynamicLayoutConfig && !isPprConfig && activeLayoutsForRoute.length > 0 && pagePath`):
     - Reuses cached `shell.page.json` when the page itself is static (`!isDynamicConfig && Object.keys(queryObj).length === 0`) — including page TTL SWR and slot-TTL SWR — or executes an isolated static page pass on cold ISG miss to populate `shell.page.json` + `page.rsc` + `metadata.json`.
     - Reuses cached static ancestor layouts (`shell.layout.own.json`) while executing only dynamic layout levels (`revalidate = 0` or `lMeta?.dynamic`) fresh in the real request context via `renderSingleLayoutLevel(..., { usePprContext: false })`.
     - Composes full JSX (`composedWithPlaceholder` + `pageClientJsx`) and sets `context._resolvedPageClientJsx`, `context._resolvedLayoutClientJsx = composed.layoutOnlyTree`, and `context._hasResolvedSegments = true` so `createInlineRscHtmlStream` embeds matching `__DINOU_RSC_L__` and `__DINOU_RSC_P__` with **0 hydration errors**.

#### 4. `dinou/core/cache-revalidate.js`
- **`revalidatePage`:**
  - Checks `resolveLayoutFunctionsConfig` + `lMeta.dynamic` across `activeChain` to detect `hasDynamicLayoutInChain`.
  - When `hasDynamicLayoutInChain` is `true`: skips `revalidateLayout` on the dynamic layout, skips the full `getJSX` HTML fallback (`if (!composedFromCachedLayout && !hasDynamicLayoutInChain)`), and skips writing `index.html`/`shell.html` while still committing fresh `metadata.json`, `shell.page.json`, and `page.rsc` (without ever touching static ancestor `L1`!).
  - When `hasDynamicLayoutInChain` is `false` and `isAncestorOwnNewer` is `true`: passes `recomposeOnly: !isLeafMissing && isAncestorOwnNewer` to `revalidateLayout`.
  - Saves `shell.page._old.json` right alongside `index._old.html` and `page._old.rsc` before committing `pendingShellPageJson`.
- **`revalidateLayout`:**
  - Early-returns `false` if `layoutCfg.isDynamic` (`revalidate < 1`), guaranteeing dynamic layouts are never frozen into cache (including via `revalidatePath`).
  - Supports `recomposeOnly` option (included in `inFlightKey`).
  - Uses `ownGeneratedAt` for `onlyIfExpired` TTL checks.
  - 4-tier resolution inside `requestStorage.run`:
    1. **`recomposeOnly && hasExactOwnLayout`:** Calls `composeLayoutChainFromOwnFragments` without executing this layout's `.tsx`; preserves `ownGeneratedAt` while advancing `generatedAt` and `layoutGeneratedAt`.
    2. **`onlyRefreshSlots`:** Calls `composeLayoutChainFromOwnFragments` with `refreshSlotsForKeys: "all"` and `persistRefreshedOwnKeys: new Set([cleanPathKey])` so `shell.layout.own.json` stays synced with refreshed slots; falls back to `shell.layout.json` splicing if own fragments are absent.
    3. **Direct isolated revalidation (`hasExactOwnLayout`):** Renders **only `activeChain[0]`** via `renderSingleLayoutLevel`, saves `shell.layout.own.json`, and splices it into cached ancestors' `shell.layout.own.json` via `composeLayoutChainFromOwnFragments` (**without re-executing any ancestor layout**).
    4. **Fallback:** Full `getJSX(..., { segment: "layout" })` if `targetPath` has no own layout or an ancestor lacks `shell.layout.own.json`.
  - Saves `shell.layout._old.json` before committing `shell.layout.json`, and commits `layout.metadata.json`, `shell.layout.own.json`, `shell.layout.json`, and `layout.rsc` with exact `generatedAt` / `layoutGeneratedAt` / `ownGeneratedAt` timestamps.

#### 5. `dinou/core/generate-static.js`
- Initializes `ownGeneratedAt: ssgLayoutGen` in `layoutMeta`.
- Parses `x-dinou-own-slot-tags`, `x-dinou-own-ppr-holes`, `x-dinou-own-suspense-count`, `x-dinou-own-ppr` headers returned by SSG layout compilation and stores them in `layout.metadata.json` (clearing `ownHoles` if `x-dinou-dynamic === "true"`).

#### 6. `dinou/core/storage-adapter.js`
- Updated `FileSystemStorage.get`, `FileSystemStorage.set`, and `readDist2Fallback` to treat `shell.layout.own.json`, `shell.layout._old.json`, and `layout._old.rsc` as layout keys (`layout.metadata.json`) and `shell.page._old.json` / `shell.layout.own.json` / `shell.layout._old.json` as shell JSON keys.
- In `readDist2Fallback`, uses `ownGeneratedAt || layoutGeneratedAt || generatedAt` for tag-invalidation comparison on `shell.layout.own.json`.

#### 7. `dinou/core/render-jsx-to-client-jsx.js`
- Updated `useServerId()` so when `layoutStore.scopePrefix` is set, IDs are generated as `_layout_${layoutStore.scopePrefix}_dS_${count}_` (collision-free across independently rendered layout levels `Root`, `L1`, `L2`, ... and invariant when any other layout level revalidates).

#### 8. `dinou/core/get-jsx.js`
- Exported `createDinouPageSlotElement` alongside `getJSX` so `layout-composition.js` shares the exact same client-reference registration for `<DinouPageSlot />`.

#### 9. `dinou/core/navigation.js`
- Converted `RouterContext` to a `globalThis.__DINOU_ROUTER_CONTEXT__` singleton so client components importing from `"dinou"` and `core/client.jsx` always share the exact same React Context instance even in ejected or workspace-linked monorepo setups.

---

## 5. Edge Cases & Architectural Invariants to Guard in `dinou-e2e`

1. **Strict Hydration Error Detection (Mandatory Helper):**
   Every E2E test checking hydration MUST attach **both** listeners (React 19 production builds emit `Minified React error #418` / `#425` on `pageerror`, without the word `"hydrat"`!):
   ```js
   function attachHydrationErrors(page) {
     const errs = [];
     page.on("console", (msg) => {
       if (msg.type() === "error" && /hydrat|418|425/i.test(msg.text())) {
         errs.push(msg.text());
       }
     });
     page.on("pageerror", (err) => {
       if (/hydrat|418|425/i.test(err.message)) {
         errs.push(err.message);
       }
     });
     return errs;
   }
   ```
2. **Dinou v10 `noDynamic()` Requirement:** Under `ppr = true`, any `async` component inside `<Suspense>` intended to collapse statically into the shell MUST call `noDynamic()` from `"dinou"`; otherwise Dinou v10 treats async suspension inside `<Suspense>` as a dynamic hole.
3. **Dinou v10 Per-Segment PPR Semantics:** `ppr` does NOT inherit from parent layout to child layout or page. Each segment uses its own explicit `ppr` in `layout_functions.ts` / `page_functions.ts`, or falls back to `dinou.config.ts`'s `ppr` (default `false`).
4. **Dinou v10 TypeScript Config:** Do NOT put `/// <reference path="./.dinou/types/routes.d.ts" />` in `dinou-env.d.ts`. Instead configure `tsconfig.json` with `"rootDirs": ["src", ".dinou/routes"]`, include `".dinou/types/**/*.d.ts"`, and do not exclude `".dinou"`.
5. **Escape Hatches (`reset_layout`, `no_layout`):** `getActiveLayoutChain` stops at `reset_layout` and returns `[]` on `no_layout`, so per-level composition automatically respects both.
6. **Parallel `@slots` in Both PPR & Non-PPR Layouts:** `@sidebar` inside `ppr = true` L1 (Check `#43`) and `@sidebar` with `<DinouCacheSlot>` inside `ppr = false` L1 (Check `#42`) must both preserve exact hole ordering and `ownSlotTags`.
7. **Multi-Level Cascade Depth:** Revalidating `L1` must cascade through `L2` (via `recomposeOnly`) to both PPR and static child pages without re-executing `L2` or child pages, and without resetting `L2.ownGeneratedAt`.
8. **Dynamic Layout Never Cached:** Calling `revalidateLayout(dynLayout)` or `revalidatePath(dynLayout)` on a layout with `revalidate = 0` must never create `layout.rsc` / `shell.layout.json` / `shell.layout.own.json`.
9. **Slot Persistence Across Layout Recomposition:** Refreshing a `<DinouCacheSlot>` inside `L1` must update `L1/shell.layout.own.json` so a subsequent `revalidateLayout(L2)` composes `L1`'s refreshed slot value, not the build-time value.
10. **Storage & Runtime Matrix:** Verify `FileSystemStorage`, `MemoryStorage`, and (if enabled in CI) Redis / Edge KV adapters, plus Node AOT Dual-Bundle (`dinou build && dinou start`), `dinou dev` + HMR, and ejected/symlinked workspace builds.

---

## 6. E2E Fixtures & Test Specifications for `dinou-e2e` (Checks `#37–#46` + Regression Guards)

### 6.1 Shared State & Test Mechanics
All rigorous tests rely on a mutable JSON/in-memory server state file (defaulting every counter to `100`) exposed via Server Functions (`resetState()`, `mutateState(patch)`, `revalidateTag(tag)`, `revalidatePage(path)`, `revalidateLayout(path)`, `revalidatePath(path)`) plus client router helpers (`refreshPage()`, `refreshLayout()`, `refreshSlot(idOrTag, fresh)`).

**Poisoning Methodology:** Before every isolation step, tests mutate every segment that **must NOT re-execute** to a poison value (`999`), while mutating only the target segment(s) to a distinct expected value (`510`, `520`, ..., `602`). Any accidental re-execution immediately exposes `999` in the DOM!

### 6.2 New & Updated Route Fixtures to Create in `dinou-e2e`

#### Fixture Group A — Asymmetric Dynamic Layout (`#37`)
- **`src/rigorous/hs/layout.tsx` & `layout_functions.ts`**: Static L1 (`revalidate = 3600`, `tags = ["hs-l1-layout-tag"]`), renders `#hs-l1-seq` (`hsL1LayoutSeq`).
- **`src/rigorous/hs/dyn-layout-static-page/layout_functions.ts`**: `export const revalidate = 0;`
- **`src/rigorous/hs/dyn-layout-static-page/layout.tsx`**: Sync layout reading `hsAsymDynLayoutSeq` → `#hs-asym-dyn-layout-seq`, client probe `#hs-asym-dyn-layout-client`, renders `{children}`.
- **`src/rigorous/hs/dyn-layout-static-page/page_functions.ts`**: `export const revalidate = 3600; export const tags = ["hs-asym-static-page-tag"]; export function getCacheTags() { return ["hs-asym-static-page-tag"]; }`
- **`src/rigorous/hs/dyn-layout-static-page/page.tsx`**: Renders `hsAsymStaticPageSeq` → `#hs-asym-static-page-seq`.

#### Fixture Group B — Per-Segment Mixed PPR Chains (`#40`)
- **`src/rigorous/ppr/mixed/layout_functions.ts`**: `export const ppr = false; export const revalidate = 3600; export const tags = ["ppr-mixed-l1-tag"];`
- **`src/rigorous/ppr/mixed/layout.tsx`**: Renders `#ppr-mixed-l1-seq` (`pprMixedL1Seq`), `<RigorousClientProbe id="ppr-mixed-l1-client" />`, `<Link>`s to static leaf & PPR leaf, `{children}`.
- **`src/rigorous/ppr/mixed/l2-ppr/layout_functions.ts`**: `export const ppr = true; export const revalidate = 3600; export const tags = ["ppr-mixed-l2-tag"];`
- **`src/rigorous/ppr/mixed/l2-ppr/layout.tsx`**: Renders static shell `#ppr-mixed-l2-shell-seq` (`pprMixedL2ShellSeq`), `<Suspense>` wrapping async `PprMixedL2DynamicHole` (reads cookie `mixed_user`, `await sleep(20)`, renders `#ppr-mixed-l2-hole-seq` & `#ppr-mixed-l2-hole-user`), `{children}`.
- **`src/rigorous/ppr/mixed/l2-ppr/page_functions.ts`**: `export const ppr = false; export const revalidate = 3600; export const tags = ["ppr-mixed-static-page-tag"];`
- **`src/rigorous/ppr/mixed/l2-ppr/page.tsx`**: Renders `#ppr-mixed-static-page-seq` (`pprMixedStaticPageSeq`). *(Chain: `false → true → false`)*
- **`src/rigorous/ppr/mixed/l2-ppr/ppr-leaf/page_functions.ts`**: `export const ppr = true; export const revalidate = 3600; export const tags = ["ppr-mixed-ppr-leaf-tag"];`
- **`src/rigorous/ppr/mixed/l2-ppr/ppr-leaf/page.tsx`**: Renders static shell `#ppr-mixed-leaf-shell-seq` (`pprMixedLeafShellSeq`) + `<Suspense>` wrapping async `PprMixedLeafDynamicHole` (reads `ctx.req.query.mode`, `await sleep(20)`, renders `#ppr-mixed-leaf-hole-seq` & `#ppr-mixed-leaf-hole-mode`). *(Chain: `false → true → true`)*
- **`src/rigorous/ppr/inherited/page_functions.ts`**: Explicit `export const ppr = true; export const revalidate = 3600;` (plus sibling `/opt-out` with `export const ppr = false;`) so per-segment `true → true` and `true → false` are explicitly tested under Dinou v10.

#### Fixture Group C — Triple Synergy Real L1 & L2 PPR Dynamic Holes (`#44`, `#45`, `#46`)
- **`src/rigorous/triple/layout.tsx`** (`ppr = true`, `revalidate = 3600`):
  - Static shell `#ts-l1-shell-seq` + `<RigorousClientProbe id="ts-l1-client" />`
  - `<DinouCacheSlot id="ts-layout-shell-slot" tags={["ts-tag-layout-shell-slot"]} revalidate={3600}>` with `<RigorousSlotWidget>` (server action ping + local counter)
  - `<Suspense>` wrapping **real async** `TsL1DynamicHole` reading cookie `ts_user` + `await sleep(20)` → `#ts-l1-hole-seq` & `#ts-l1-hole-user`
- **`src/rigorous/triple/nested/layout.tsx`** (`ppr = true`, `revalidate = 3600`, `tags = ["ts-l2-layout-tag"]`):
  - Static shell `#ts-l2-shell-seq` + `<RigorousClientProbe id="ts-l2-client" />`
  - `<DinouCacheSlot id="ts-nested-layout-slot" tags={["ts-tag-nested-layout-slot"]} revalidate={3600}>`
  - `<Suspense>` wrapping **real async** `TsL2DynamicHole` reading `ctx.req.headers["user-agent"]` + `await sleep(20)` → `#ts-l2-hole-seq`
- Children under L2:
  - `/rigorous/triple/nested/page.tsx` (`ppr = true`, `revalidate = 3600`, static shell `#ts-nested-ppr-shell-seq`, dynamic hole `#ts-nested-ppr-hole-host-seq`)
  - `/rigorous/triple/nested/static-child/page.tsx` (`ppr = false`, `revalidate = 3600`, static page `#ts-nested-static-host-seq`)

#### Fixture Group D — Collapsed Static `<Suspense>` with `noDynamic()` (`#39`, `#41`, `#43`)
- In `/rigorous/ppr/page.tsx`, `/rigorous/ppr-cache-slot/page.tsx`, and `/rigorous/hs-ppr/page.tsx`, every static collapsed async `<Suspense>` component (`StaticSuspenseComponent`, `OuterStaticWrapper`, `SynStaticSuspenseBoundary`, `HsPprPageAStaticSuspense`) calls `noDynamic()` before `await sleep(5)`.

---

### 6.3 Exact Specification of the 10 New E2E Checks (`#37–#46`)

#### Check `#37` — `rigorous-hs-asymmetric` (Axis X — Pure HS)
- **Route:** `/rigorous/hs/dyn-layout-static-page` (`L1 3600s → L2 revalidate=0 → Page 3600s`) + `/rigorous/hs`
- **Steps & Assertions:**
  1. Reset state, revalidate page, reload → verify `#hs-l1-seq = 100`, `#hs-asym-dyn-layout-seq = 100`, `#hs-asym-static-page-seq = 100`.
  2. Mutate `{ hsL1LayoutSeq: 999, hsAsymDynLayoutSeq: 510, hsAsymStaticPageSeq: 999 }`. Hard reload:
     - Assert `#hs-asym-dyn-layout-seq === "510"` (dynamic L2 executes fresh).
     - Assert `#hs-l1-seq === "100"` (static L1 reused from `shell.layout.own.json`).
     - Assert `#hs-asym-static-page-seq === "100"` (static Page reused from `shell.page.json`).
  3. Mutate `{ hsL1LayoutSeq: 999, hsAsymDynLayoutSeq: 512, hsAsymStaticPageSeq: 511 }` + `revalidatePage("/rigorous/hs/dyn-layout-static-page")`. Hard reload:
     - Assert `#hs-asym-dyn-layout-seq === "512"`, `#hs-asym-static-page-seq === "511"`, `#hs-l1-seq === "100"`.
  4. Navigate to `/rigorous/hs`, mutate `{ hsL1LayoutSeq: 513, hsIndexPageSeq: 514 }` + `revalidatePath("/rigorous/hs")`. Hard reload:
     - Assert `#hs-l1-seq === "513"`, `#hs-index-seq === "514"`.
  5. Assert `hydrationErrors.length === 0`.

#### Check `#38` — `rigorous-cache-slot-bidirectional` (Axis Y — Pure Cache-Slot)
- **Route:** `/rigorous/cache-slot` (`revalidate = 0` host with nested `<DinouCacheSlot>` outer/inner + 1s TTL slot `#cs-fast-seq` + 3600s sibling `#cs-alpha-seq`)
- **Steps & Assertions:**
  1. Reset & revalidate tags → verify outer `100`, inner `100`, fast `100`.
  2. **Part A (Outer → Inner preservation):** Mutate `{ csNestedOuterSeq: 520, csNestedInnerSeq: 999 }` + `revalidateTag("cs-tag-nested-outer")`. Reload → assert `#cs-nested-outer-seq === "520"` and `#cs-nested-inner-seq === "100"`.
  3. **Part B (Dynamic-host 1s slot TTL):** Mutate `{ csAlphaSeq: 999, csFastSeq: 521 }`. Wait 1300ms, reload (with SWR 2nd reload fallback after 250ms) → assert `#cs-fast-seq === "521"` and `#cs-alpha-seq === "100"`.

#### Check `#39` — `rigorous-ppr-deep` (Axis Z — Pure PPR)
- **Routes:** `/rigorous/ppr` + `/rigorous/ppr/ttl-shell` (`ppr = true`, `revalidate = 1`)
- **Steps & Assertions:**
  1. Verify initial static shell `#ppr-rig-shell-seq = 100` and two `noDynamic()` collapsed static Suspense boundaries `#ppr-rig-static-suspense-seq = 100`, `#ppr-outer-static-val = 100`.
  2. **Part A:** Poison static shell + both collapsed static Suspense boundaries (`999`); bump 7 dynamic holes (`530..536`: cookie hole, query hole, client-widget hole, inner dynamic inside static Suspense, outer dynamic, deep inner, `React.memo` hole). Set cookie `rig_user=alice`, navigate to `/rigorous/ppr?theme=neon`:
     - Assert all 3 static regions stay `"100"`.
     - Assert all 7 dynamic holes stream fresh (`alice`/`530`, `neon`/`531`, `ppr-client-532`, `533`, `534`, `535`, `536`).
     - Click `#ppr-hole-client-widget-btn` → assert `#ppr-hole-client-widget-count === "1"` (interactive hydration inside streamed hole).
  3. **Part B (1s PPR Shell TTL — regression guard for Bug 1!):** Open `/rigorous/ppr/ttl-shell` with `attachHydrationErrors`, verify shell `100`, mutate `{ pprTtlShellSeq: 538, pprTtlHoleSeq: 539 }`, wait 1300ms, reload (plus 250ms SWR 2nd reload if stale) → assert `#ppr-ttl-shell-seq === "538"`, `#ppr-ttl-hole-seq === "539"`, and **`ttlHydrationErrors.length === 0`** (must NOT emit `#418` on either reload #1 or reload #2!).
  4. Assert `hydrationErrors.length === 0`.

#### Check `#40` — `rigorous-ppr-mixed-segments` (Axis Z × Axis X — Per-Segment PPR)
- **Routes:** `/rigorous/ppr/mixed/l2-ppr` (`false→true→false`), `/rigorous/ppr/mixed/l2-ppr/ppr-leaf` (`false→true→true`), `/rigorous/ppr/inherited` (`true→true`), `/rigorous/ppr/inherited/opt-out` (`true→false`)
- **Steps & Assertions:**
  1. Set cookie `mixed_user=neo`, load `/rigorous/ppr/mixed/l2-ppr`, reset & revalidate baseline → verify `L1=100`, `L2 shell=100`, `L2 hole=100/neo`, `static page=100`.
  2. **Chain `false→true→false`:** Poison `L1`, `L2 shell`, `static page` (`999`); bump `L2 hole=540` + cookie `mixed_user=trinity`. Reload → assert `L2 hole=540/trinity`, `L1=100`, `L2 shell=100`, `static page=100`.
  3. **Surgical L1 revalidation (regression guard for Bug 2B!):** Mutate `{ pprMixedL1Seq: 541, pprMixedL2ShellSeq: 999, pprMixedStaticPageSeq: 999 }` + `revalidateLayout("/rigorous/ppr/mixed")`. Reload → assert `#ppr-mixed-l1-seq === "541"`, `#ppr-mixed-l2-hole-seq === "540"`, **`#ppr-mixed-l2-shell-seq === "100"`** (L2 NOT re-executed!), `#ppr-mixed-static-page-seq === "100"`.
  4. **Chain `false→true→true`:** Mutate `{ pprMixedLeafShellSeq: 999, pprMixedLeafHoleSeq: 542, pprMixedL2HoleSeq: 543 }`, navigate to `/rigorous/ppr/mixed/l2-ppr/ppr-leaf?mode=hyper` → assert `L1=541`, `L2 shell=100`, `L2 hole=543`, `leaf shell=100`, `leaf hole=542/hyper`.
  5. **Explicit `true→true` & `true→false`:** Poison `inheritedLayout`, `inheritedShell`, `optOut` (`999`), bump `inheritedHole=544`, verify `/rigorous/ppr/inherited` streams `544` with shells at `100`, and `/rigorous/ppr/inherited/opt-out` stays `100/100`.
  6. Assert `hydrationErrors.length === 0`.

#### Check `#41` — `rigorous-ppr-cache-slot-deep` (Pairwise `Y + Z`)
- **Route:** `/rigorous/ppr-cache-slot`
- **Steps & Assertions:**
  1. Set cookies `syn_user=bob`, `syn_session=s-99`. Verify initial `100`s + `bob` + `s-99`.
  2. **Part A:** Poison shell (`999`) & `noDynamic()` static Suspense host (`999`); bump shell slot (`550`), static-Suspense slot (`551`), no-cache hole slot (`552`); call `revalidateTag` on both static slots. Reload → assert `550`, `551`, `552` while shell & static-Suspense host stay `100`.
  3. **Part B (1s Shell & Hole Slot TTLs — regression guard for Bug 1!):** Mutate `{ synShellTtlSlotSeq: 553, synHoleTtlSlotSeq: 554, synHoleSlotASeq: 999 }`. Wait 1300ms, reload (plus 300ms SWR 2nd reload if stale) → assert `553`, `554`, `3600s hole slot A = 100`, and **0 hydration errors (`#418`)** across both reloads!
  4. **Part C (Live `refreshSlot` inside PPR dynamic hole):** Increment shell client widget (`1`), hole client widget (`1`), trigger server-action ping (`pong:...`), record `#syn-hole3-host-seq`. Poison `synHole3HostSeq = 999`, bump `synClientSlotSeq = 555`, call `refreshSlot("syn-client-slot", true)` → assert slot updates to `555`, enclosing hole host untouched, both client counts remain `1`. Wait 300ms + F5 reload → assert `555`, `s-99`, `hydrationErrors.length === 0`.

#### Check `#42` — `rigorous-hs-cache-slot-deep` (Pairwise `X + Y`)
- **Route:** `/rigorous/hs-cache-slot/nested` (L1 + `@sidebar` + L1 nested outer/inner slots + L2 + Nested Page)
- **Steps & Assertions:**
  1. Increment L1 & L2 client counters (`1`, `1`) and capture `mountId`s.
  2. Poison all 4 hosts + L1 outer slot (`999`); bump 4 slots (`@sidebar=560`, `L2=561`, `nestedPage=562`, `L1 inner=563`); call `refreshSlot(..., true)` on all 4.
  3. Assert all 4 slots update (`560/561/562/563`), all 4 hosts + L1 outer stay `100`, both L1 & L2 `mountId`s and counts (`1`) persist.
  4. Wait 300ms + F5 reload → assert all 4 slot values persist (`560/561/562/563`), L1 host stays `100`, `hydrationErrors.length === 0`.

#### Check `#43` — `rigorous-hs-ppr-deep` (Pairwise `X + Z`)
- **Routes:** `/rigorous/hs-ppr` → `/rigorous/hs-ppr/ppr-b` → `/rigorous/hs-ppr/static-optout` → `/rigorous/hs-ppr/nested`
- **Steps & Assertions:**
  1. Set cookie `hsppr_user=dana`, increment L1 client probe (`1`), capture `l1Mount`.
  2. Poison all 8 static shells + Page A `noDynamic()` static Suspense (`999`); bump all 5 dynamic holes (`570..574`).
  3. Soft-nav `Page A → Page B → Static Opt-Out (ppr=false) → Nested L2 PPR`: assert each page shell stays `100`, each hole streams fresh, and `l1Mount` + count `1` persist across every hop.
  4. Hard reload `/rigorous/hs-ppr/nested`: assert all 4 dynamic holes (`L1=570/dana`, `@sidebar=571`, `L2=573`, `Page=574`) stream fresh while all 4 static shells (`L1`, `@sidebar`, `L2`, `Nested Page`) stay `100` with `hydrationErrors.length === 0`.

#### Check `#44` — `rigorous-triple-live-slots` (Triple Synergy `X + Y + Z` #1)
- **Route:** `/rigorous/triple`
- **Steps & Assertions:**
  1. Set cookie `ts_user=vega`. Increment all 5 client widgets across L1 shell, L1 shell slot, Page shell, Page shell slot, and Page dynamic hole slot; trigger server-action ping in hole slot.
  2. Poison L1 shell, Page A shell, and Page A dynamic hole host (`999`); bump L1 dynamic hole (`580`) and 3 slots across all 3 layers (`581/582/583`); call `refreshSlot(..., true)` on all 3 slots.
  3. Assert all 3 slots update (`581/582/583`), L1 shell / Page shell / **enclosing dynamic hole host** all stay `100`, all 5 client widgets stay `1`.
  4. Wait 350ms + F5 reload → assert L1 dynamic hole streams `580/vega`, all 3 refreshed slots persist (`581/582/583`), shells stay `100`, `hydrationErrors.length === 0`.

#### Check `#45` — `rigorous-triple-wildcard-nav` (Triple Synergy `X + Y + Z` #2)
- **Routes:** `/rigorous/triple` → `/rigorous/triple/ppr-b` → `/rigorous/triple/static-a` → `/rigorous/triple`
- **Steps & Assertions:**
  1. Increment L1 client count (`1`), capture `l1Mount`.
  2. Poison all hosts (`999`); bump 4 mounted 3D slots (`590/591/592/593`); click `#btn-refresh-all-slots` (`refreshSlot("*", { fresh: true })`).
  3. Assert all 4 slots update (`590/591/592/593`) while L1 shell, Page A shell, and dynamic hole host all stay `100`.
  4. Soft-nav round-trip `PPR A → PPR B → Static Child A → PPR A`: assert `l1Mount` and count `1` survive the entire PPR↔Static round-trip, refreshed slots (`590/591`) persist on return to PPR A, `hydrationErrors.length === 0`.

#### Check `#46` — `rigorous-triple-l2-reval` (Triple Synergy `X + Y + Z` #3 — Regression Guard for Bug 2A!)
- **Routes:** `/rigorous/triple/nested` (`L1 PPR → L2 PPR → Nested PPR Page`) & `/rigorous/triple/nested/static-child` (`L1 PPR → L2 PPR → Static Page`)
- **Steps & Assertions:**
  1. Reset & revalidate L1 and L2 baseline → verify `L1=100`, `L2 shell=100`, `L2 hole=100`, `L2 slot=100`, `nested PPR shell=100`.
  2. Mutate `{ tsL1ShellSeq: 999, tsLayoutShellSlotSeq: 999, tsNestedLayoutSlotSeq: 999, tsNestedPprShellSeq: 999, tsNestedStaticHostSeq: 999, tsL2ShellSeq: 600, tsL2HoleSeq: 601, tsNestedPprHoleHostSeq: 602 }` + call **`revalidateLayout("/rigorous/triple/nested")`**.
  3. Hard reload `/rigorous/triple/nested`:
     - Assert `#ts-l2-shell-seq === "600"`, `#ts-l2-hole-seq === "601"`, `#ts-nested-ppr-hole-host-seq === "602"`.
     - Assert **`#ts-l1-shell-seq === "100"`** (ancestor L1 NOT re-executed!).
     - Assert `#ts-layout-shell-slot-seq === "100"`, `#ts-nested-layout-slot-seq === "100"`, `#ts-nested-ppr-shell-seq === "100"`.
  4. Hard `page.goto("/rigorous/triple/nested/static-child")`:
     - Assert `#ts-l2-shell-seq === "600"`, `#ts-l2-hole-seq === "601"`, `#ts-l1-shell-seq === "100"`, `#ts-nested-layout-slot-seq === "100"`, `#ts-nested-static-host-seq === "100"`.
  5. Assert `hydrationErrors.length === 0`.

### 6.4 Additional Regression Tests Recommended Specifically for `dinou-e2e`
Beyond `#37–#46`, `dinou-e2e` should also include:
1. **Check `#22` Strict `#418` + SWR Guard:** Verify `/rigorous/triple` 1s shell-slot TTL with `attachHydrationErrors(page)` (catching `418`/`425` on `pageerror`) + 2-reload SWR pattern — guarantees Bug 1 can never regress silently.
2. **Client Bundle `RouterContext` Singleton Regression (Bug 3):** Test `<Link>` soft navigation and `useRouter().refresh()` from inside a `"use client"` component under both normal `node_modules/dinou` **and** ejected/workspace-linked `"dinou": "file:..."`, asserting **zero** `"navigate called outside Router"` console warnings.
3. **Multi-Level Layout `useId()` Isolation:** Render a route with `L1` and `L2` both calling `React.useId()`, verify distinct DOM IDs across levels, revalidate `L2` alone and `L1` alone, and assert 0 hydration mismatches (`#418`).
4. **3-Level Layout Cascade (`L1 → L2 → L3`):** Revalidate `L1` with `L2` and `L3` poisoned (`999`), verify `L1` updates while both `L2` and `L3` remain `100` (proving `recomposeOnly` cascades cleanly through arbitrary depth without resetting `ownGeneratedAt`).
5. **Layout Slot Persistence Across Descendant Revalidation:** Call `refreshSlot` / `revalidateTag` on a slot in `L1` (updating `L1/shell.layout.own.json` to `581`), then call `revalidateLayout(L2)` with `L1` poisoned (`999`), and verify `L1` host stays `100`, `L1` slot stays `581` (not reverting to build-time `100`), and `L2` updates to `600`.
