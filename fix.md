# Dinou PPR + `<DinouCacheSlot>` Behavior Model: Scenario 2B (Before vs. After Fix)

## 1. Overview of Scenario 2B

In `src/ppr-cache-slot-test/page.tsx`, the route runs with **Partial Prerendering enabled (`ppr = true`)**. Inside the static shell, **Scenario 2B** renders a cached `<DinouCacheSlot>` (`revalidate={3600}`) that **wraps an internal `<Suspense>` boundary** containing an `async` Server Component (`InnerStaticSuspenseChild`):

```tsx
<DinouCacheSlot
  id="ppr-syn-slot-with-static-suspense"
  revalidate={3600}
  tags={["ppr-syn-tag-slot-with-suspense"]}
>
  <Suspense fallback={<div id="syn-slot-with-suspense-fallback">...</div>}>
    <InnerStaticSuspenseChild />
  </Suspense>
</DinouCacheSlot>
```

Across `/ppr-cache-slot-test` (layout + page), there are **7 `<Suspense>` boundaries** in total, traversed in this exact order:

1. `ppr-hole-1`: Layout dynamic `<Suspense>` boundary.
2. `ppr-hole-2`: **Scenario 2A** — Static `<Suspense>` (with `noDynamic()`) wrapping a `<DinouCacheSlot>`.
3. `ppr-hole-3`: **Scenario 2B** — Cached `<DinouCacheSlot>` wrapping a `<Suspense>` boundary (`InnerStaticSuspenseChild`).
4. `ppr-hole-4`: **Scenario 3** — Dynamic PPR Hole #1 (`DynamicHole1MicroIsrInsidePpr`).
5. `ppr-hole-5`: **Scenario 4** — Dynamic PPR Hole #2 (`DynamicHole2NestedSlots`).
6. `ppr-hole-6`: **Scenario 5** — Dynamic PPR Hole #3 (`DynamicHole3ClientAndServerActionSlot`).
7. `ppr-hole-7`: **Scenario 6** — Dynamic PPR Hole #4 (`DynamicHole4DirectCookieInSlot`).

---

## 2. Behavior Model BEFORE the Fix (What Happened & Why It Broke)

### Phase 1: Initial Build / Slot Cache MISS (`isPprBuildActive() === true`)

1. `DinouCacheSlot` executed its children inside `runInCachedSlot(() => asyncRenderJSXToClientJSX(childElement))` (`dinou/core/cache-slot.js`).
2. `asyncRenderJSXToClientJSXInner` (`dinou/core/render-jsx-to-client-jsx.js`) encountered the inner `<Suspense>` of Scenario 2B, called `runInSuspense`, assigned it **`ppr-hole-3`**, and set `isInsideSuspense() === true`.
3. When invoking `InnerStaticSuspenseChild`, `invokeServerComponentInPpr` checked:
   - `isThenable(rawResult)` → `true`
   - `!isCacheSlotComponent(fn)` → `true` (because `fn` was `InnerStaticSuspenseChild`, not `DinouCacheSlot` itself)
   - `isPprBuildActive() && isInsideSuspense()` → `true`
   - **Missing check**: It did **not** check `!isInsideCachedSlot()`.
4. As a result, `invokeServerComponentInPpr` called `markDynamicAccess("async-suspense")`, throwing a `dinou.ppr.postpone` error for `ppr-hole-3`.
5. The inner `<Suspense>` boundary inside the slot caught `dinou.ppr.postpone`, registered `ppr-hole-3` in `metadata.holes`, and **replaced the `<Suspense>` element (`Symbol.for("react.suspense")`) with a fallback `<div data-ppr-hole="ppr-hole-3">...fallback...</div>`**.
6. `DinouCacheSlot` received that `<div data-ppr-hole="ppr-hole-3">` placeholder and **serialized it directly into `slots/ppr-syn-slot-with-static-suspense/slot.json`**.

### Phase 2: Runtime PPR Streaming (`streamDynamicHoles` / `spliceDynamicHolesIntoShell`) & `revalidatePage` on Slot Cache HIT

This created a structural asymmetry between a **Slot Cache MISS** and a **Slot Cache HIT**:

1. During a live HTTP request (`handlePprResume` → `streamDynamicHoles` in `dinou/core/ppr-runtime.js`), Dinou traverses the component tree and increments `holeIndex++` every time it encounters a `<Suspense>` node (`type === Symbol.for("react.suspense")`).
2. When traversal reached `DinouCacheSlot` (`id="ppr-syn-slot-with-static-suspense"`), it hit the storage cache and deserialized `slot.json`.
3. Because the `<Suspense>` inside `slot.json` had been replaced at build time by a plain `<div>` (`<div data-ppr-hole="ppr-hole-3">`), **there was no longer any `<Suspense>` node inside the cached slot VDOM**.
4. Consequently, `streamDynamicHoles` (and `spliceDynamicHolesIntoShell`) **did not increment `holeIndex`** when passing through Scenario 2B:
   - When traversal reached **Scenario 3** (`DynamicHole1MicroIsrInsidePpr`, whose placeholder in `shell.html` was `data-ppr-hole="ppr-hole-4"`), `streamDynamicHoles` assigned it **`ppr-hole-3`**.
   - The streamed `<template id="ppr-content-ppr-hole-3">` targeted `[data-ppr-hole="ppr-hole-3"]`, **overwriting Scenario 2B with Scenario 3's dynamic content**.
   - Every subsequent hole shifted by one index (`Scenario 4 → ppr-hole-4`, `Scenario 5 → ppr-hole-5`, `Scenario 6 → ppr-hole-6`), leaving the last hole in `shell.html` (`data-ppr-hole="ppr-hole-7"`, Scenario 6) permanently stuck on its fallback.
   - Furthermore, if `revalidatePage("/ppr-cache-slot-test")` ran while the slot was cached, the new build read the cached `<div data-ppr-hole="ppr-hole-3">` from `slot.json` without incrementing `nextHoleIndex` and then assigned **another** `ppr-hole-3` to Scenario 3, producing duplicate `data-ppr-hole="ppr-hole-3"` elements in `shell.html`.

---

## 3. Behavior Model AFTER the Fix (How It Works Now)

The architectural invariant enforced by the unified fix in `dinou/core/ppr-context.js` and `dinou/core/render-jsx-to-client-jsx.js` is:

> **Whether `<DinouCacheSlot>` belongs to the Static Shell or becomes a Cached Dynamic PPR Hole depends on the nesting order between `<Suspense>` and `<DinouCacheSlot>`:**
> - **Scenario 2B (`<DinouCacheSlot>` outside wrapping `<Suspense>` inside, with no outer `<Suspense>` outside the slot)**: `slotDepthAtSuspense > 0` and `isInsideOuterSuspenseOutsideSlot() === false`. Any `async` Server Component and any `<Suspense>` boundary inside the slot resolves into `slot.json` and `shell.html`, preserving `Symbol.for("react.suspense")` in `slot.json` and never turning into a `<div data-ppr-hole>`.
> - **Option A (`<Suspense>` outside wrapping `<DinouCacheSlot>` inside)**: `slotDepthAtSuspense === 0` on the outer `<Suspense>` and `isInsideOuterSuspenseOutsideSlot() === true`. Unless opted out with `noDynamic()`, the outer `<Suspense>` postpones at build time into a Cached Dynamic PPR Hole (`data-ppr-hole`) and caches `slot.json` when streamed at runtime.

```text
+-----------------------------------------------------------------------------+
| 1. BUILD / SLOT CACHE MISS (isPprBuildActive = true)                        |
+-----------------------------------------------------------------------------+
| DinouCacheSlot enters runInCachedSlot() (isInsideCachedSlot = true)         |
|                                     |                                       |
|                                     v                                       |
| Encounters inner <Suspense> -> runInSuspense assigns ppr-hole-3             |
|                                     |                                       |
|                                     v                                       |
| Invokes InnerStaticSuspenseChild()                                          |
| (!isInsideCachedSlot is false -> does NOT postpone)                         |
|                                     |                                       |
|                                     v                                       |
| Resolves #syn-slot-wrapping-susp-resolved                                   |
| Preserves <Suspense> node (does NOT replace with <div data-ppr-hole>)       |
|                                     |                                       |
|                                     v                                       |
| Persists <Suspense> with resolved children in slot.json                     |
| Does NOT register ppr-hole-3 in metadata.holes                              |
+-----------------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------+
| 2. RUNTIME / REVALIDATE ON SLOT CACHE HIT                                   |
+-----------------------------------------------------------------------------+
| DinouCacheSlot reads slot.json -> deserializeJSX restores <Suspense> node   |
|                                     |                                       |
|                                     v                                       |
| streamDynamicHoles / spliceDynamicHolesIntoShell / revalidatePage           |
| see the <Suspense> node and increment holeIndex to 3                        |
|                                     |                                       |
|                                     v                                       |
| Is ppr-hole-3 in metadata.holes?                                            |
| NO -> Static boundary, not re-streamed                                      |
|                                     |                                       |
|                                     v                                       |
| Scenario 3 (Dynamic Hole #1) always receives ppr-hole-4                     |
| 100% deterministic alignment between shell.html and runtime stream          |
+-----------------------------------------------------------------------------+
```

### 1. During Build / Slot Cache MISS
- `InnerStaticSuspenseChild` executes inside `runInCachedSlot()`, so `isInsideCachedSlot()` is `true`.
- In `invokeServerComponentInPpr` (`dinou/core/render-jsx-to-client-jsx.js`), `!isInsideCachedSlot()` is `false`, so it **does not** trigger `markDynamicAccess("async-suspense")` (making `noDynamic()` unnecessary inside cached slots).
- `InnerStaticSuspenseChild` resolves to `<div id="syn-slot-wrapping-susp-resolved">...</div>`, which is baked into both `slot.json` and `shell.html`.
- Because the inner `<Suspense>` does not enter its `catch` block, **the element serialized into `slot.json` retains its `Symbol.for("react.suspense")` type** (instead of turning into a `<div data-ppr-hole="...">`), and `ppr-hole-3` is **not** added to `metadata.holes`.

### 2. During Runtime (`streamDynamicHoles` / `spliceDynamicHolesIntoShell`) & `revalidatePage` (Slot Cache HIT)
- When `slot.json` is deserialized on a cache hit, the VDOM returned by `DinouCacheSlot` **still contains the `<Suspense>` element (`Symbol.for("react.suspense")`)**.
- Consequently, whether `DinouCacheSlot` is a **Cache MISS** or a **Cache HIT**, tree traversal always counts `ppr-hole-3` at Scenario 2B, sees that `ppr-hole-3` is not in `metadata.holes` (`["ppr-hole-1", "ppr-hole-4", "ppr-hole-5", "ppr-hole-6", "ppr-hole-7"]`), skips streaming it, and assigns `ppr-hole-4` to Scenario 3 with zero index drift.
- When `refreshSlot("ppr-syn-slot-with-static-suspense")` or `revalidateTag("ppr-syn-tag-slot-with-suspense")` is triggered, `/____rsc_slot____/ppr-syn-slot-with-static-suspense` re-evaluates `InnerStaticSuspenseChild`, updates `slot.json` with the new token, and refreshes `shell.html` cleanly without disturbing any PPR holes on the page.

---

## 4. Bonus Engine Fix: Static `<Suspense>` Wrapping Nested Dynamic `<Suspense>` (`data-ppr-static-parent`)

In `src/ppr-test/components/ppr-holes.tsx` (**Case 6A**: `OuterStaticWithInnerDynamicHole`), an outer static `<Suspense>` (opting out via `noDynamic()`) wraps an inner dynamic `<Suspense>` (`InnerDynamicInStaticHole`).

- **Leaf static `<Suspense>` boundaries** (where `getPprHoleCounter()` does not increase while rendering children, such as `StaticAsyncCard`) continue to throw `SKIP_STATIC_SUSPENSE_SYMBOL` when `noDynamic()` is called inside `runInRuntimeStaticSuspense`, skipping their async execution in `0ms` during runtime hole traversal.
- **Parent static `<Suspense>` boundaries** that contain nested `<Suspense>` boundaries (`getPprHoleCounter() > countBefore`) are marked with `data-ppr-static-parent="ppr-hole-N"` in `dinou/core/render-jsx-to-client-jsx.js`. During runtime traversal in `dinou/core/ppr-runtime.js` (`streamDynamicHoles` and `spliceDynamicHolesIntoShell`), these parent boundaries are traversed without throwing `SKIP_STATIC_SUSPENSE_SYMBOL` so their nested dynamic `<Suspense>` holes are discovered, streamed, and kept index-aligned.

