# Upstream Handoff Specification: API Reference Batch 3 — Storage Adapter Parity (`CloudflareKVStorage`, `DenoKVStorage`), `<DinouCacheSlot>` Tag/TTL Consistency & Cold-Pod Revalidation Fixes (`v9.4.0`)

## 1. Executive Summary & Root-Cause Analysis

During the deep framework audit of `/docs/api-reference` **Batch 3** (Section 5: Server Cache & Revalidation — `revalidatePage()`, `revalidateLayout()`, `revalidatePath()`, `revalidateTag()`, `<DinouCacheSlot>`, `noDynamic()`; Section 6: Storage Adapters — `StorageAdapter`, `FileSystemStorage`, `RedisStorage`, `CloudflareKVStorage`, `DenoKVStorage`, `MemoryStorage`, `getStorageAdapter()`, `setStorageAdapter()`), we uncovered and fixed **five bugs and parity inconsistencies** across `dinou/core/storage-adapter.js`, `dinou/core/cache-slot.js`, `dinou/core/cache-revalidate.js`, and `dinou/server.d.ts`:

1. **`CloudflareKVStorage.keys(prefix)` Silent 1,000-Key Truncation & `has(key)` Missing Folder Fallback (`dinou/core/storage-adapter.js`)**:
   - **Root Cause**:
     - `CloudflareKVStorage.keys(prefix)` invoked `this.kv.list(options)` only once and returned `res.keys`, ignoring Cloudflare KV's pagination fields (`res.list_complete === false` and `res.cursor`). Because each cached route creates 5–8 KV keys (`index.html`, folder alias, `page.rsc`, `metadata.json`, `_old` snapshots, `shell.page.json`), any Cloudflare Workers deployment with ~150+ cached pages silently dropped keys on page 2+ during `revalidateTag()`.
     - `CloudflareKVStorage.has(key)` checked only `this.kv.get(cleanKey)` without falling back to `cleanKey/index.html` (or `"index.html"` for `"/"`) when `!cleanKey.includes(".")`, diverging from `CloudflareKVStorage.get(key)` and all other built-in adapters (`FileSystemStorage`, `MemoryStorage`, `RedisStorage`, `DenoKVStorage`).
   - **Fix**: Paginate `this.kv.list()` via `cursor` while `res && res.list_complete === false && res.cursor` (staying 100% compatible with simple mocks that omit `list_complete`), and add the `!cleanKey.includes(".")` index fallback in `CloudflareKVStorage.has(key)`.

2. **`DenoKVStorage._cleanKey()` Missing Trailing-Slash Normalization (`dinou/core/storage-adapter.js`)**:
   - **Root Cause**: Unlike `StorageAdapter._normalizeTrackKey`, `FileSystemStorage._resolve`, `CloudflareKVStorage._cleanKey`, `MemoryStorage._cleanKey`, and `RedisStorage._cleanKey`, `DenoKVStorage._cleanKey(key)` omitted `.replace(/\/+$/, "")`. Consequently, calling `get("/blog/")`, `has("/blog/")`, or `delete("/blog/")` looked up `"blog/"` and `"blog//index.html"` instead of `"blog"` / `"blog/index.html"`, causing cache misses and orphaned keys on trailing-slash paths.
   - **Fix**: Normalize `String(key || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")` in `DenoKVStorage._cleanKey()`.

3. **`<DinouCacheSlot>` Dropping `tag` When Combined With `tags` & Inconsistent `revalidate < 1` Handling (`dinou/core/cache-slot.js`, `dinou/server.d.ts`)**:
   - **Root Cause**:
     - `const allTags = Array.isArray(tags) ? [...tags] : tag ? [tag] : [];` silently dropped the `tag` prop whenever `tags` was also supplied (`<DinouCacheSlot id="x" tag="alpha" tags={["beta"]} />`).
     - `DinouCacheSlot` treated any numeric `revalidate < 1` as no-cache (`isNoCache`), matching `page_functions.ts`. However, `getSlotJSX()` checked `revalidateSeconds === 0` / `entry.revalidate !== 0` and `hasExpiredSlots()` checked `revalidateSeconds > 0`, so a slot with fractional/negative `revalidate` (e.g. `0.5` or `-1`) bypassed cache on initial render yet persisted into storage on `refreshSlot(id)`.
     - `DinouCacheSlotProps.revalidate` in `dinou/server.d.ts` only accepted `number`, omitting `false` despite runtime support (`typeof revalidate === "number"` treats `false` as cache forever, matching `RouteSegmentConfig.revalidate`).
   - **Fix**: Merge and deduplicate `tag` and `tags` into `allTags`, unify `revalidate < 1` (`isNoCache`) and `revalidate >= 1` (TTL) across `getSlotJSX()` and `hasExpiredSlots()`, and widen `DinouCacheSlotProps.revalidate` to `number | false`.

4. **Cold-Start / Multi-Pod `revalidateTag(slotId)` Failing on `id`-Only `<DinouCacheSlot>` (`dinou/core/cache-revalidate.js`)**:
   - **Root Cause**: `DinouCacheSlot` records `[slotId, ...allTags]` in the host page/layout's `metadata.json` (`slotTags`), and warm `revalidateTag(tag)` matched `regId === tag` in the in-memory `slotRegistry`. However, after a cold server restart or on a sibling pod sharing `RedisStorage` (when `slotRegistry` is empty), `revalidateTag(tag)` only checked `meta.tags.includes(tag)` when scanning `slots/<id>/slot.metadata.json` and never checked `meta.slotId === tag` (or the directory `<id>`). As a result, `revalidateTag("only-id-slot")` triggered `revalidatePage(..., { onlyRefreshSlots: true })` without evicting `slots/only-id-slot/slot.json`, re-splicing stale slot content! Additionally, the non-`keys()` custom adapter fallback branch did not call `markTagInvalidatedAsync` / `markTagInvalidated` or clear `dinou.slot.recent.fresh`.
   - **Fix**: Match `meta?.slotId === tag` (and directory segment `slots/<id>/`) alongside `meta.tags.includes(tag)` in both the `storage.keys()` path and the filesystem fallback path, and invoke `markTagInvalidatedAsync` / `markTagInvalidated` + clear `dinou.slot.recent.fresh` in the fallback path.

5. **`revalidatePath(path)` Skipping Segment Layout on Cold Storage Adapters (`dinou/core/cache-revalidate.js`)**:
   - **Root Cause**: `revalidatePath(reqPath)` only invoked `revalidateLayout(cleanPath)` if `layout.rsc` or `layout.metadata.json` was already present in storage (`if (cachedLayout || cachedLayoutMeta)`). On a cold `MemoryStorage({ hydrateFromDisk: false })`, cold `RedisStorage`, or uncached dynamic segment layout, `revalidatePath("/store")` skipped `revalidateLayout("/store")` even when `src/store/layout.tsx` existed on disk.
   - **Fix**: When `cachedLayout` and `cachedLayoutMeta` are both absent, perform an exact-segment lookup via `getFilePathAndDynamicParams(reqSegments, {}, srcFolder, "layout", true, true, undefined, 0)` (setting `finalDestination = true` so ancestor layouts are never falsely matched) and invoke `revalidateLayout(cleanPath)` if an own segment layout file exists.

---

## 2. Complete File Manifest

1. `dinou/core/storage-adapter.js` *(modified)*
2. `dinou/core/cache-slot.js` *(modified)*
3. `dinou/core/cache-revalidate.js` *(modified)*
4. `dinou/server.d.ts` *(modified)*

---

## 3. Exact Source Code & Unified Diffs

### 3.1 `dinou/core/storage-adapter.js`

```diff
--- a/dinou/core/storage-adapter.js
+++ b/dinou/core/storage-adapter.js
@@ -288,7 +288,14 @@ class CloudflareKVStorage extends StorageAdapter {
   async has(key) {
     if (!this.kv) return false;
     const cleanKey = this._cleanKey(key);
     const val = await this.kv.get(cleanKey);
-    return val !== null;
+    if (val !== null) return true;
+    if (!cleanKey.includes(".")) {
+      const fallbackVal = await this.kv.get(
+        cleanKey ? `${cleanKey}/index.html` : "index.html"
+      );
+      return fallbackVal !== null;
+    }
+    return false;
   }
 
   async delete(key) {
@@ -314,9 +321,29 @@ class CloudflareKVStorage extends StorageAdapter {
   async keys(prefix = "") {
     if (!this.kv || typeof this.kv.list !== "function") return [];
     try {
       const effectivePrefix = prefix === "dinou_cache" ? "" : prefix;
-      const options = effectivePrefix ? { prefix: effectivePrefix } : undefined;
-      const res = await this.kv.list(options);
-      return res && res.keys ? res.keys.map((k) => k.name) : [];
+      const results = [];
+      let cursor = undefined;
+      while (true) {
+        const options = {};
+        if (effectivePrefix) options.prefix = effectivePrefix;
+        if (cursor) options.cursor = cursor;
+        const res = await this.kv.list(
+          Object.keys(options).length > 0 ? options : undefined
+        );
+        if (res && Array.isArray(res.keys)) {
+          for (const k of res.keys) {
+            if (k && typeof k.name === "string") {
+              results.push(k.name);
+            }
+          }
+        }
+        if (!res || res.list_complete !== false || !res.cursor) {
+          break;
+        }
+        cursor = res.cursor;
+      }
+      return results;
     } catch (e) {
       return [];
     }
@@ -682,7 +709,10 @@ class DenoKVStorage extends StorageAdapter {
   }
 
   _cleanKey(key) {
-    return String(key).replace(/\\/g, "/").replace(/^\/+/, "");
+    return String(key || "")
+      .replace(/\\/g, "/")
+      .replace(/^\/+/, "")
+      .replace(/\/+$/, "");
   }
```

---

### 3.2 `dinou/core/cache-slot.js`

```diff
--- a/dinou/core/cache-slot.js
+++ b/dinou/core/cache-slot.js
@@ -682,11 +682,13 @@ async function DinouCacheSlot(props) {
     return await computeAnon();
   }
 
-  const allTags = Array.isArray(tags)
-    ? [...tags]
-    : tag
-    ? [tag]
-    : [];
+  const allTags = Array.from(
+    new Set(
+      [...(tag ? [tag] : []), ...(Array.isArray(tags) ? tags : [])].filter(
+        Boolean
+      )
+    )
+  );
   const slotTagsToCommit = Array.from(new Set([slotId, ...allTags].filter(Boolean)));
 
   const storageKey = `slots/${slotId}/slot.json`;
@@ -1114,11 +1116,11 @@ async function getSlotJSX(slotId, options = {}) {
         ? meta.revalidate
         : undefined;
 
-    const isNoCache = revalidateSeconds === 0;
+    const isNoCache = typeof revalidateSeconds === "number" && revalidateSeconds < 1;
     const isExpired =
       isNoCache ||
       (typeof revalidateSeconds === "number" &&
-        revalidateSeconds > 0 &&
+        revalidateSeconds >= 1 &&
         now > generatedAt + revalidateSeconds * 1000);
 
     const serveStaleWhileRevalidate =
@@ -1276,6 +1278,9 @@ async function getSlotJSX(slotId, options = {}) {
       slotRenderGenerations.set(storageKey, renderGen);
       const isLatestGen = () => slotRenderGenerations.get(storageKey) === renderGen;
 
+      const isEntryNoCache =
+        typeof entry.revalidate === "number" && entry.revalidate < 1;
+
       const renderPromise = (async () => {
         const resolved = await entry.render();
         const serialized = serializeJSX(resolved);
@@ -1285,7 +1290,7 @@ async function getSlotJSX(slotId, options = {}) {
             serialized,
           });
         }
-        if (storage && entry.revalidate !== 0 && isLatestGen()) {
+        if (storage && !isEntryNoCache && isLatestGen()) {
           await storage.set(storageKey, serialized, {
             tags: entry.tags,
             revalidate: entry.revalidate,
@@ -1314,7 +1319,7 @@ async function getSlotJSX(slotId, options = {}) {
 
       if (
         storage &&
-        entry.revalidate !== 0 &&
+        !isEntryNoCache &&
         !options.skipHostRevalidate &&
         options.currentPath &&
         isLatestGen()
@@ -1402,7 +1407,7 @@ async function hasExpiredSlots(slotTags) {
         : undefined;
     if (
       typeof revalidateSeconds === "number" &&
-      revalidateSeconds > 0 &&
+      revalidateSeconds >= 1 &&
       now > (meta.generatedAt || 0) + revalidateSeconds * 1000
     ) {
       return true;
```

---

### 3.3 `dinou/core/cache-revalidate.js`

```diff
--- a/dinou/core/cache-revalidate.js
+++ b/dinou/core/cache-revalidate.js
@@ -913,7 +913,25 @@ async function revalidatePath(reqPath, options) {
   // 1. Revalidate layout first if present for this segment (so revalidatePage composes with the fresh layout)
   const cachedLayout = await readEdgeStorageOrAsset(storage, layoutRscKey);
   const cachedLayoutMeta = await readEdgeStorageOrAsset(storage, layoutMetaKey);
-  if (cachedLayout || cachedLayoutMeta) {
+  let hasOwnLayoutFile = false;
+  if (!cachedLayout && !cachedLayoutMeta) {
+    try {
+      const reqSegments = cleanPath.split("/").filter(Boolean);
+      const srcFolder = path.resolve(process.cwd(), "src");
+      const [exactLayoutPath] = getFilePathAndDynamicParams(
+        reqSegments,
+        {},
+        srcFolder,
+        "layout",
+        true,
+        true,
+        undefined,
+        0
+      );
+      hasOwnLayoutFile = Boolean(exactLayoutPath);
+    } catch (e) {}
+  }
+  if (cachedLayout || cachedLayoutMeta || hasOwnLayoutFile) {
     await revalidateLayout(cleanPath);
   }
 
@@ -1263,7 +1281,13 @@ async function revalidateTag(tag, options) {
                 meta = JSON.parse(item.content);
               } catch (e) {}
             }
-            if (meta && Array.isArray(meta.tags) && meta.tags.includes(tag)) {
+            const slotIdMatch = key.match(/^slots\/([^/]+)\//);
+            const matchedSlotId = meta?.slotId || slotIdMatch?.[1];
+            const matchesSlotId = Boolean(matchedSlotId && matchedSlotId === tag);
+            const matchesSlotTag = Boolean(
+              meta && Array.isArray(meta.tags) && meta.tags.includes(tag)
+            );
+            if (matchesSlotId || matchesSlotTag) {
               targetSlotKeys.add(key);
               if (key.endsWith("/slot.metadata.json")) {
                 targetSlotKeys.add(key.slice(0, -"/slot.metadata.json".length) + "/slot.json");
@@ -1361,6 +1385,15 @@ async function revalidateTag(tag, options) {
     return;
   }
 
+  if (storage) {
+    if (typeof storage.markTagInvalidatedAsync === "function") {
+      await storage.markTagInvalidatedAsync(tag);
+    } else if (typeof storage.markTagInvalidated === "function") {
+      storage.markTagInvalidated(tag);
+    }
+  }
+  globalThis[Symbol.for("dinou.slot.recent.fresh")]?.clear?.();
+
   const dist2Folder = path.resolve(process.cwd(), ".dinou/dist2");
   if (!existsSync(dist2Folder)) return;
 
@@ -1373,10 +1406,14 @@ async function revalidateTag(tag, options) {
     try {
       const content = await fs.readFile(fileOfMeta, "utf8");
       const metadata = JSON.parse(content);
+      const isSlotMeta = path.basename(fileOfMeta) === "slot.metadata.json";
+      const hasSlotIdMatch =
+        isSlotMeta &&
+        (metadata?.slotId === tag || path.basename(path.dirname(fileOfMeta)) === tag);
       const hasRouteTag = Boolean(metadata && Array.isArray(metadata.tags) && metadata.tags.includes(tag));
       const hasSlotTag = Boolean(metadata && Array.isArray(metadata.slotTags) && metadata.slotTags.includes(tag));
-      if (hasRouteTag || hasSlotTag) {
-        if (path.basename(fileOfMeta) === "slot.metadata.json") {
+      if (hasSlotIdMatch || hasRouteTag || hasSlotTag) {
+        if (isSlotMeta) {
           const slotFolder = path.dirname(fileOfMeta);
           console.log(`✅ [Revalidate] Invalidating cache slot directory: ${slotFolder}`);
           slotPromises.push(
```

---

### 3.4 `dinou/server.d.ts`

```diff
--- a/dinou/server.d.ts
+++ b/dinou/server.d.ts
@@ -165,7 +165,7 @@ export interface DinouCacheSlotProps {
   id?: string;
   tag?: string;
   tags?: string[];
-  revalidate?: number;
+  revalidate?: number | false;
   children: ReactNode | (() => ReactNode | Promise<ReactNode>);
 }
```

---

## 4. `CHANGELOG.md` Entry (Draft for `v9.4.0`)

```markdown
### Fixed (API Reference Batch 3 — Storage Adapters, `<DinouCacheSlot>` & Cold-Pod Revalidation)
- **`CloudflareKVStorage` Pagination & `has()` Fallback (`dinou/core/storage-adapter.js`)**: Implemented cursor-based pagination in `CloudflareKVStorage.keys(prefix)` so `revalidateTag()` no longer truncates at Cloudflare KV's 1,000-key limit, and added folder/index (`<key>/index.html`) fallback parity to `CloudflareKVStorage.has(key)`.
- **`DenoKVStorage` Trailing-Slash Normalization (`dinou/core/storage-adapter.js`)**: Stripped trailing slashes in `DenoKVStorage._cleanKey()` to match `FileSystemStorage`, `MemoryStorage`, `RedisStorage`, and `CloudflareKVStorage` across `get()`, `has()`, `set()`, and `delete()`.
- **`<DinouCacheSlot>` Combined `tag` + `tags` Merging & `revalidate < 1` Parity (`dinou/core/cache-slot.js`, `dinou/server.d.ts`)**: Merged and deduplicated `tag` and `tags` when both props are supplied; unified `< 1` no-cache semantics across `DinouCacheSlot`, `getSlotJSX()`, and `hasExpiredSlots()`; and widened `DinouCacheSlotProps.revalidate` to `number | false`.
- **Cold-Start / Multi-Pod `revalidateTag(slotId)` & Cold `revalidatePath()` Layout Detection (`dinou/core/cache-revalidate.js`)**: Matched `id`-only `<DinouCacheSlot id="...">` records via `meta.slotId` / directory name even when the in-memory `slotRegistry` is cold (plus calling `markTagInvalidatedAsync` on non-`keys()` adapters), and detected exact segment `layout.tsx` files in `revalidatePath()` when storage is cold.
```

---

## 5. Verification & Complete Test Suite

### 5.1 Unit & Multi-Bundler Integration Test (`tests/unit/api-reference-cache-storage.test.mjs`)

Save this complete, zero-dependency Node test file in `dinou-e2e` (or `dinou`) and execute it with `node --test tests/unit/api-reference-cache-storage.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const DINOU_ROOT = fs.existsSync(path.resolve(REPO_ROOT, "dinou", "cli.js"))
  ? path.resolve(REPO_ROOT, "dinou")
  : path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou");

const storageMod = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core", "storage-adapter.js")).href
);
const cacheSlotMod = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core", "cache-slot.js")).href
);
const cacheRevalMod = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core", "cache-revalidate.js")).href
);

const {
  StorageAdapter,
  CloudflareKVStorage,
  DenoKVStorage,
  MemoryStorage,
  setStorageAdapter,
} = storageMod;
const { DinouCacheSlot, getSlotJSX, hasExpiredSlots } = cacheSlotMod;
const { revalidateTag } = cacheRevalMod;

function createFixtureDir(prefix) {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

test("1. CloudflareKVStorage paginates keys() past page limit and supports folder fallback in has()", async () => {
  const kvMap = new Map();
  kvMap.set("blog/index.html", { value: "<h1>Blog</h1>", metadata: { tags: ["blog"] } });
  kvMap.set("index.html", { value: "<h1>Home</h1>", metadata: null });
  for (let i = 0; i < 25; i++) {
    kvMap.set(`items/${i}/metadata.json`, {
      value: JSON.stringify({ tags: ["all-items"] }),
      metadata: null,
    });
  }

  let listCallCount = 0;
  const mockKv = {
    async get(key) {
      return kvMap.has(key) ? kvMap.get(key).value : null;
    },
    async getWithMetadata(key) {
      if (!kvMap.has(key)) return { value: null, metadata: null };
      return kvMap.get(key);
    },
    async put(key, value, opts) {
      kvMap.set(key, { value, metadata: opts?.metadata || null });
    },
    async delete(key) {
      kvMap.delete(key);
    },
    async list(opts = {}) {
      listCallCount += 1;
      const prefix = opts?.prefix || "";
      const matching = Array.from(kvMap.keys()).filter((k) =>
        prefix ? k.startsWith(prefix) : true
      );
      const pageSize = 10;
      const start = opts?.cursor ? Number(opts.cursor) : 0;
      const slice = matching.slice(start, start + pageSize);
      const next = start + pageSize;
      const done = next >= matching.length;
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: done,
        cursor: done ? undefined : String(next),
      };
    },
  };

  const storage = new CloudflareKVStorage(mockKv);

  assert.equal(await storage.has("blog"), true);
  assert.equal(await storage.has("/blog/"), true);
  assert.equal(await storage.has("/"), true);
  assert.equal(await storage.has("nonexistent"), false);

  const allKeys = await storage.keys();
  assert.equal(allKeys.length, 27);
  assert.ok(listCallCount >= 3, `Expected paginated kv.list() calls, got ${listCallCount}`);
  assert.ok(allKeys.includes("items/24/metadata.json"));

  const itemsOnly = await storage.keys("items/");
  assert.equal(itemsOnly.length, 25);
});

test("2. DenoKVStorage normalizes trailing slashes identically across get(), has(), set(), and delete()", async () => {
  const kvStore = new Map();
  const keyStr = (parts) => JSON.stringify(parts);
  const mockDenoKv = {
    async get(parts) {
      const k = keyStr(parts);
      return kvStore.has(k) ? { key: parts, value: kvStore.get(k) } : { key: parts, value: null };
    },
    async set(parts, value) {
      kvStore.set(keyStr(parts), value);
    },
    async delete(parts) {
      kvStore.delete(keyStr(parts));
    },
    atomic() {
      const ops = [];
      return {
        set(parts, value) {
          ops.push({ type: "set", parts, value });
          return this;
        },
        delete(parts) {
          ops.push({ type: "delete", parts });
          return this;
        },
        async commit() {
          for (const op of ops) {
            if (op.type === "set") kvStore.set(keyStr(op.parts), op.value);
            else kvStore.delete(keyStr(op.parts));
          }
          return { ok: true };
        },
      };
    },
    async *list({ prefix }) {
      const prefixJson = JSON.stringify(prefix).slice(0, -1);
      for (const [k, value] of kvStore.entries()) {
        if (k.startsWith(prefixJson)) {
          yield { key: JSON.parse(k), value };
        }
      }
    },
  };

  const storage = new DenoKVStorage(mockDenoKv);
  await storage.set("/blog/index.html", "<h1>Blog</h1>", { tags: ["blog"] });

  assert.equal(await storage.has("/blog/"), true);
  assert.equal(await storage.has("/blog"), true);
  const fetched = await storage.get("/blog/");
  assert.ok(fetched, "Expected DenoKVStorage.get('/blog/') to hit cached blog/index.html");
  assert.equal(fetched.content, "<h1>Blog</h1>");

  await storage.delete("/blog/");
  assert.equal(await storage.has("/blog"), false);
  assert.equal(await storage.has("blog/index.html"), false);
  assert.equal(await storage.get("blog/index.html"), null);
});

test("3. DinouCacheSlot merges tag + tags without dropping tag and treats revalidate < 1 consistently as no-cache", async () => {
  const storage = new MemoryStorage();
  setStorageAdapter(storage);
  const slotRegistry = globalThis[Symbol.for("dinou.slot.registry")];
  slotRegistry?.clear?.();

  await DinouCacheSlot({
    id: "combo-slot",
    tag: "primary-tag",
    tags: ["secondary-tag", "primary-tag"],
    revalidate: 120,
    children: () => "Combo Content",
  });
  const storedCombo = await storage.get("slots/combo-slot/slot.json");
  assert.ok(storedCombo, "Expected combo-slot to be cached");
  assert.deepEqual(storedCombo.metadata.tags, ["primary-tag", "secondary-tag"]);
  assert.deepEqual(slotRegistry.get("combo-slot").tags, ["primary-tag", "secondary-tag"]);

  let renderCount = 0;
  await DinouCacheSlot({
    id: "frac-nocache",
    revalidate: 0.5,
    children: () => {
      renderCount += 1;
      return `Render-${renderCount}`;
    },
  });
  assert.equal(await storage.get("slots/frac-nocache/slot.json"), null);

  await getSlotJSX("frac-nocache", { fresh: true });
  assert.equal(renderCount, 2);
  assert.equal(
    await storage.get("slots/frac-nocache/slot.json"),
    null,
    "getSlotJSX must not persist slots with revalidate < 1"
  );
  assert.equal(await hasExpiredSlots(["frac-nocache"]), false);
});

test("4. revalidateTag(slotId) invalidates id-only slots after cold restart (empty slotRegistry) & marks tag on non-keys() adapters", async () => {
  const storage = new MemoryStorage();
  setStorageAdapter(storage);

  globalThis[Symbol.for("dinou.slot.registry")]?.clear?.();
  await storage.set("slots/cold-ticker/slot.json", JSON.stringify("OLD"), {
    tags: [],
    slotId: "cold-ticker",
    generatedAt: Date.now() - 1000,
  });
  await storage.set(
    "slots/cold-ticker/slot.metadata.json",
    JSON.stringify({ tags: [], slotId: "cold-ticker", generatedAt: Date.now() - 1000 })
  );

  await revalidateTag("cold-ticker");

  assert.equal(
    await storage.get("slots/cold-ticker/slot.json"),
    null,
    "Expected cold-start revalidateTag(slotId) to delete slots/<id>/slot.json"
  );
  assert.equal(
    await storage.get("slots/cold-ticker/slot.metadata.json"),
    null,
    "Expected cold-start revalidateTag(slotId) to delete slots/<id>/slot.metadata.json"
  );

  let markedTag = null;
  class MinimalAdapter extends StorageAdapter {
    async get() { return null; }
    async set() {}
    async has() { return false; }
    async delete() {}
    async markTagInvalidatedAsync(t) {
      markedTag = t;
      super.markTagInvalidated(t);
    }
  }
  const minimal = new MinimalAdapter();
  setStorageAdapter(minimal);
  const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-min-reval-"));
  const prevCwd = process.cwd();
  try {
    const slotDir = path.join(tmpCwd, ".dinou", "dist2", "slots", "disk-only-slot");
    fs.mkdirSync(slotDir, { recursive: true });
    fs.writeFileSync(
      path.join(slotDir, "slot.metadata.json"),
      JSON.stringify({ tags: [], slotId: "disk-only-slot", generatedAt: Date.now() - 1000 })
    );
    fs.writeFileSync(path.join(slotDir, "slot.json"), JSON.stringify("OLD"));
    process.chdir(tmpCwd);
    await revalidateTag("disk-only-slot");
    assert.equal(markedTag, "disk-only-slot");
    assert.equal(fs.existsSync(slotDir), false, "Expected disk-only id slot directory to be removed");
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  }
});

test("5. Multi-bundler (Esbuild, Rollup, Webpack) integration: cold revalidatePath() segment layout detection & cold-pod revalidateTag() on id-only + tag+tags slots", async () => {
  const bundlers = ["esbuild", "rollup", "webpack"];
  for (const bundler of bundlers) {
    const tmpApp = createFixtureDir(`tmp-cache-ref3-${bundler}-`);
    try {
      fs.writeFileSync(
        path.join(tmpApp, "package.json"),
        JSON.stringify({ name: `cache-ref3-${bundler}`, type: "module", private: true }, null, 2)
      );

      const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
      fs.mkdirSync(dinouShimDir, { recursive: true });
      const dinouIndexPath = path.join(DINOU_ROOT, "index.js").replace(/\\/g, "/");
      const dinouServerPath = path.join(DINOU_ROOT, "server.js").replace(/\\/g, "/");
      const dinouConfigPath = path.join(DINOU_ROOT, "core", "config.js").replace(/\\/g, "/");
      fs.writeFileSync(
        path.join(dinouShimDir, "package.json"),
        JSON.stringify(
          {
            name: "dinou",
            version: "9.4.0",
            type: "module",
            exports: { ".": "./index.js", "./server": "./server.js", "./config": "./config.js" },
          },
          null,
          2
        )
      );
      fs.writeFileSync(
        path.join(dinouShimDir, "index.js"),
        `export * from ${JSON.stringify(dinouIndexPath)};\nexport { default } from ${JSON.stringify(dinouIndexPath)};\n`
      );
      fs.writeFileSync(
        path.join(dinouShimDir, "server.js"),
        `export * from ${JSON.stringify(dinouServerPath)};\n`
      );
      fs.writeFileSync(
        path.join(dinouShimDir, "config.js"),
        `export * from ${JSON.stringify(dinouConfigPath)};\nexport { default } from ${JSON.stringify(dinouConfigPath)};\n`
      );

      fs.mkdirSync(path.join(tmpApp, "src", "store"), { recursive: true });
      fs.mkdirSync(path.join(tmpApp, "src", "slot-demo"), { recursive: true });

      fs.writeFileSync(
        path.join(tmpApp, "src", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html><head><title>Ref3</title></head><body>{children}</body></html>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "page.tsx"),
        `export default function Home() { return <main>Home</main>; }\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "store", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function StoreLayout({ children }: { children: ReactNode }) {
  const n = ((globalThis as any).__STORE_LAYOUT_RUNS__ = ((globalThis as any).__STORE_LAYOUT_RUNS__ || 0) + 1);
  return <section data-store-layout={n}><header>StoreLayout:{n}</header>{children}</section>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "store", "page.tsx"),
        `export default function StorePage() {
  const n = ((globalThis as any).__STORE_PAGE_RUNS__ = ((globalThis as any).__STORE_PAGE_RUNS__ || 0) + 1);
  return <main>StorePage:{n}</main>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "slot-demo", "page.tsx"),
        `import { DinouCacheSlot } from "dinou/server";

function IdOnlyWidget() {
  const val = (globalThis as any).__ID_SLOT_VALUE__ || "v1";
  return <span>IdSlot:{val}</span>;
}

function ComboWidget() {
  const val = (globalThis as any).__COMBO_SLOT_VALUE__ || "c1";
  return <span>ComboSlot:{val}</span>;
}

export default function SlotDemoPage() {
  return (
    <main>
      <DinouCacheSlot id="only-id-slot">
        <IdOnlyWidget />
      </DinouCacheSlot>
      <DinouCacheSlot id="combo-tag-slot" tag="alpha" tags={["beta"]}>
        <ComboWidget />
      </DinouCacheSlot>
    </main>
  );
}
`
      );

      const buildRes = spawnSync(
        process.execPath,
        [path.join(DINOU_ROOT, "cli.js"), `build:node:${bundler}`],
        { cwd: tmpApp, encoding: "utf8" }
      );
      assert.equal(
        buildRes.status,
        0,
        `Build failed for ${bundler}:\n${buildRes.stdout}\n${buildRes.stderr}`
      );

      const prevCwd = process.cwd();
      const prevRuntime = globalThis.__DINOU_RUNTIME__;
      process.chdir(tmpApp);
      try {
        globalThis.__DINOU_RUNTIME__ = "node-bundle";
        globalThis.__STORE_LAYOUT_RUNS__ = 0;
        globalThis.__STORE_PAGE_RUNS__ = 0;
        globalThis.__ID_SLOT_VALUE__ = "v1";
        globalThis.__COMBO_SLOT_VALUE__ = "c1";

        const rscMod = await import(
          pathToFileURL(path.join(tmpApp, ".dinou", "node", "rsc-engine.mjs")).href +
            `?b=${bundler}&t=${Date.now()}`
        );
        const ssrMod = await import(
          pathToFileURL(path.join(tmpApp, ".dinou", "node", "ssr-engine.mjs")).href +
            `?b=${bundler}&t=${Date.now()}`
        );
        globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;

        const coldStorage = new MemoryStorage({ hydrateFromDisk: false });
        setStorageAdapter(coldStorage);

        await cacheRevalMod.revalidatePath("/store");
        const layoutItem = await coldStorage.get("store/layout.rsc");
        const pageItem = await coldStorage.get("store/index.html");
        assert.ok(layoutItem && layoutItem.content, `[${bundler}] Expected cold revalidatePath('/store') to build store/layout.rsc`);
        assert.ok(pageItem && pageItem.content.includes("StoreLayout:"), `[${bundler}] Expected store/index.html to contain StoreLayout`);
        assert.ok(pageItem.content.includes("StorePage:"), `[${bundler}] Expected store/index.html to contain StorePage`);

        const demoStorage = new MemoryStorage({ hydrateFromDisk: false });
        setStorageAdapter(demoStorage);

        const r1 = await rscMod.handleRequest(new Request("http://localhost:3000/slot-demo"), {
          runtime: "node-bundle",
          renderHtmlStream: ssrMod.renderHtml,
        });
        const html1 = await r1.text();
        assert.match(html1, /IdSlot:(?:<!-- -->)?v1/, `[${bundler}] Initial IdSlot expected v1:\n${html1}`);
        assert.match(html1, /ComboSlot:(?:<!-- -->)?c1/, `[${bundler}] Initial ComboSlot expected c1:\n${html1}`);

        globalThis.__ID_SLOT_VALUE__ = "v2";
        globalThis.__COMBO_SLOT_VALUE__ = "c2";
        globalThis[Symbol.for("dinou.slot.registry")]?.clear?.();

        await cacheRevalMod.revalidateTag("only-id-slot");
        const r2 = await rscMod.handleRequest(new Request("http://localhost:3000/slot-demo"), {
          runtime: "node-bundle",
          renderHtmlStream: ssrMod.renderHtml,
        });
        const html2 = await r2.text();
        assert.match(html2, /IdSlot:(?:<!-- -->)?v2/, `[${bundler}] Revalidated IdSlot expected v2:\n${html2}`);
        assert.match(html2, /ComboSlot:(?:<!-- -->)?c1/, `[${bundler}] Sibling ComboSlot must remain cached c1:\n${html2}`);

        await cacheRevalMod.revalidateTag("alpha");
        const r3 = await rscMod.handleRequest(new Request("http://localhost:3000/slot-demo"), {
          runtime: "node-bundle",
          renderHtmlStream: ssrMod.renderHtml,
        });
        const html3 = await r3.text();
        assert.match(html3, /IdSlot:(?:<!-- -->)?v2/, `[${bundler}] IdSlot expected v2:\n${html3}`);
        assert.match(html3, /ComboSlot:(?:<!-- -->)?c2/, `[${bundler}] Revalidated ComboSlot expected c2:\n${html3}`);
      } finally {
        globalThis.__DINOU_RUNTIME__ = prevRuntime;
        process.chdir(prevCwd);
      }
    } finally {
      fs.rmSync(tmpApp, { recursive: true, force: true });
    }
  }
});
```

---

### 5.2 Playwright E2E Test Suite (`tests/e2e/api-reference-cache-storage.spec.ts`)

Add the following fixtures into `dinou-e2e`'s test app (`src/t-slot-combo/actions.ts`, `src/t-slot-combo/controls.tsx`, `src/t-slot-combo/page.tsx`) and run the Playwright spec below:

#### Fixture A: `src/t-slot-combo/actions.ts`
```ts
"use server";

import { revalidateTag } from "dinou/server";

export async function bumpIdOnlySlotAndRevalidate(nextValue: string) {
  (globalThis as any).__E2E_ID_ONLY_SLOT_VAL__ = nextValue;
  // Clear in-memory slotRegistry to simulate a cold server restart / sibling pod
  (globalThis as any)[Symbol.for("dinou.slot.registry")]?.clear?.();
  await revalidateTag("e2e-id-only-slot");
  return { ok: true };
}

export async function bumpComboSlotAndRevalidateTagProp(nextValue: string) {
  (globalThis as any).__E2E_COMBO_SLOT_VAL__ = nextValue;
  // Revalidate via the singular `tag="e2e-combo-primary"` prop (coexisting with `tags={["e2e-combo-secondary"]}`)
  await revalidateTag("e2e-combo-primary");
  return { ok: true };
}
```

#### Fixture B: `src/t-slot-combo/controls.tsx`
```tsx
"use client";

import { useState } from "react";
import {
  bumpIdOnlySlotAndRevalidate,
  bumpComboSlotAndRevalidateTagProp,
} from "./actions";

export function SlotComboControls() {
  const [status, setStatus] = useState("idle");

  return (
    <div>
      <span data-testid="slot-action-status">{status}</span>
      <button
        type="button"
        data-testid="reval-id-only"
        onClick={async () => {
          setStatus("pending-id");
          await bumpIdOnlySlotAndRevalidate("id-v2");
          setStatus("done-id");
        }}
      >
        Revalidate ID-Only Slot (Cold)
      </button>
      <button
        type="button"
        data-testid="reval-combo-primary"
        onClick={async () => {
          setStatus("pending-combo");
          await bumpComboSlotAndRevalidateTagProp("combo-v2");
          setStatus("done-combo");
        }}
      >
        Revalidate Combo Slot via tag Prop
      </button>
    </div>
  );
}
```

#### Fixture C: `src/t-slot-combo/page.tsx`
```tsx
import { DinouCacheSlot } from "dinou/server";
import { SlotComboControls } from "./controls";

function IdOnlyDisplay() {
  const val = (globalThis as any).__E2E_ID_ONLY_SLOT_VAL__ || "id-v1";
  return <div data-testid="id-only-slot-value">{val}</div>;
}

function ComboTagDisplay() {
  const val = (globalThis as any).__E2E_COMBO_SLOT_VAL__ || "combo-v1";
  return <div data-testid="combo-slot-value">{val}</div>;
}

export default function SlotComboPage() {
  return (
    <main>
      <h1>Slot Tag &amp; Cold ID Revalidation</h1>
      <DinouCacheSlot id="e2e-id-only-slot" revalidate={false}>
        <IdOnlyDisplay />
      </DinouCacheSlot>
      <DinouCacheSlot
        id="e2e-combo-slot"
        tag="e2e-combo-primary"
        tags={["e2e-combo-secondary"]}
        revalidate={false}
      >
        <ComboTagDisplay />
      </DinouCacheSlot>
      <SlotComboControls />
    </main>
  );
}
```

#### Playwright Spec (`tests/e2e/api-reference-cache-storage.spec.ts`)
```ts
import { test, expect } from "@playwright/test";

test.describe("API Reference Batch 3 — Cold Slot ID Revalidation & tag+tags Merge", () => {
  test("1. Cold-pod revalidateTag(slotId) refreshes id-only slot without disturbing sibling slot, and tag+tags preserves singular tag", async ({
    page,
  }) => {
    await page.goto("/t-slot-combo");

    await expect(page.getByTestId("id-only-slot-value")).toHaveText("id-v1");
    await expect(page.getByTestId("combo-slot-value")).toHaveText("combo-v1");

    // Step 1: Simulate cold pod & revalidate id-only slot by its `id`
    await page.getByTestId("reval-id-only").click();
    await expect(page.getByTestId("slot-action-status")).toHaveText("done-id");

    await page.reload();
    await expect(page.getByTestId("id-only-slot-value")).toHaveText("id-v2");
    await expect(page.getByTestId("combo-slot-value")).toHaveText("combo-v1");

    // Step 2: Revalidate combo slot using singular `tag="e2e-combo-primary"` alongside `tags`
    await page.getByTestId("reval-combo-primary").click();
    await expect(page.getByTestId("slot-action-status")).toHaveText("done-combo");

    await page.reload();
    await expect(page.getByTestId("id-only-slot-value")).toHaveText("id-v2");
    await expect(page.getByTestId("combo-slot-value")).toHaveText("combo-v2");
  });
});
```

---

### 5.3 Execution Commands

```bash
# 1. Syntax check modified framework files
node --check dinou/core/storage-adapter.js
node --check dinou/core/cache-slot.js
node --check dinou/core/cache-revalidate.js

# 2. Run unit + 3-bundler (Esbuild, Rollup, Webpack) integration test suite
node --test tests/unit/api-reference-cache-storage.test.mjs

# 3. Run Playwright E2E suite (in dinou-e2e)
npx playwright test tests/e2e/api-reference-cache-storage.spec.ts
```
