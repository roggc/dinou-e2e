# Upstream Handoff Specification: Concurrent ISR Stale-Snapshot Double-Revalidation Race Fix (`v9.4.0`)

## 1. Executive Summary & Root-Cause Analysis

Under concurrent traffic or tight SWR polling (reproduced in GitHub Actions `webpack:node:ubuntu` `[webkit]` on `/t-bailout-search` test 4, where `refreshedSnapshot` was `ISR:...:2` and the immediate next read returned `ISR:...:3`), Dinou could execute a **phantom duplicate ISR regeneration (`:2 -> :3`)** milliseconds after the first regeneration (`:1 -> :2`) had already committed fresh metadata.

### Root Cause
1. **Stale `cachedItem` Across Async Layout Metadata Reads (`dinou/core/handler.js`)**:
   - At line 2802, a polling request `R_poll` reads the cached HTML (`:1`) and its expired `metadata.json` (`pageGeneratedAt = T1`) while ISR #1 is still in progress.
   - `R_poll` then yields across `await readMetaFromStorage(...)` / `hasExpiredSlots(...)` (lines 2928–3120).
   - While `R_poll` is suspended at those `await`s, ISR #1 finishes committing fresh `metadata.json` (`pageGeneratedAt = T2`) and `index.html` (`:2`), and clears the lock via `regenerating.delete(reqPath)`.
   - When `R_poll` resumes, it still evaluates `isExpired` against its stale `cachedItem` (`T1`), sees `!regenerating.has(reqPath)` (now `false`!), and spawns a **second `revalidatePage(reqPath)`** even though the cache was just refreshed milliseconds earlier.
2. **Missing Freshness Re-Check Inside Serialized Revalidation Queue (`dinou/core/cache-revalidate.js`)**:
   - `revalidatePage()` and `revalidateLayout()` always re-rendered unconditionally inside `enqueueRevalidation()`, even when triggered by automatic TTL expiry (`handler.js` HTML ISR, RSC `/____rsc_page____` ISR, and layout TTL ISR) and `storage` already held a freshly committed `metadata.json` whose TTL was no longer expired.
3. **Microtask Lock Window in HTML ISR (`dinou/core/handler.js`)**:
   - `regenerating.has(reqPath)` / `regenerating.add(reqPath)` was checked inside the spawned async IIFE instead of synchronously before spawning, and the fallback non-`revalidatePage` branch did not re-check `metaKey` from storage.

### Architectural Fix
1. Add an internal `{ onlyIfExpired?: boolean }` option to both `revalidatePage()` and `revalidateLayout()` in `dinou/core/cache-revalidate.js`. Inside the serialized `enqueueRevalidation` critical section — right after reading the latest `metadata.json` / `layout.metadata.json` from `storage` — if `onlyIfExpired && !onlyRefreshSlots` and the latest persisted `pageGeneratedAt` / `layoutGeneratedAt` is no longer expired (`Date.now() <= genAt + revalidate * 1000`), return immediately without re-rendering.
   - Explicit on-demand calls (`revalidatePage(path)`, `revalidateLayout(path)`, `revalidatePath(path)`, `revalidateTag(tag)`) do **not** pass `onlyIfExpired`, so they continue forcing an immediate refresh even when TTL has not expired.
2. In `dinou/core/handler.js`:
   - Acquire `regenerating.add(reqPath)` synchronously before spawning the background HTML ISR async IIFE, pass `{ onlyIfExpired: true }` to `revalidatePage()` in both HTML and RSC ISR handlers, re-check `metaKey` from storage in the fallback non-`revalidatePage` ISR branch, and pass `onlyIfExpired: isLayoutTtlExpired && !isAncestorNewer` to `revalidateLayout()` for TTL-triggered layout refreshes.

---

## 2. Complete File Manifest

1. `dinou/core/cache-revalidate.js` *(modified)*
2. `dinou/core/handler.js` *(modified)*

---

## 3. Exact Unified Diffs

### 3.1 `dinou/core/cache-revalidate.js`

```diff
--- a/dinou/core/cache-revalidate.js
+++ b/dinou/core/cache-revalidate.js
@@ -301,6 +301,7 @@ function normalizeRevalidatePath(reqPath) {
 async function revalidatePage(reqPath, internalOptions = {}) {
   const cleanPath = normalizeRevalidatePath(reqPath);
   const onlyRefreshSlots = Boolean(internalOptions?.onlyRefreshSlots);
+  const onlyIfExpired = Boolean(internalOptions?.onlyIfExpired);
   return enqueueRevalidation(async () => {
     const storage = getStorageAdapter();
     const cleanPathKey = cleanPath.replace(/^\/+/, "").replace(/\/+$/, "");
@@ -362,6 +363,24 @@ async function revalidatePage(reqPath, internalOptions = {}) {
     if (currentMeta.status === undefined) {
       currentMeta.status = 200;
     }
+
+    if (onlyIfExpired && !onlyRefreshSlots) {
+      const latestReval =
+        currentMeta.pageRevalidate !== undefined && currentMeta.pageRevalidate !== null
+          ? currentMeta.pageRevalidate
+          : currentMeta.revalidate;
+      const latestPageGenAt = Number(
+        currentMeta.pageGeneratedAt || currentMeta.generatedAt || 0
+      );
+      const stillExpired =
+        typeof latestReval === "number" &&
+        latestReval >= 1 &&
+        latestPageGenAt > 0 &&
+        Date.now() > latestPageGenAt + latestReval * 1000;
+      if (!stillExpired) {
+        return;
+      }
+    }
 
     let activeLayoutRscText = "";
     let maxActiveLayoutGenTime = 0;
@@ -905,7 +924,8 @@ async function revalidatePath(reqPath, options) {
 async function revalidateLayout(reqPath, internalOptions = {}) {
   const targetPath = normalizeRevalidatePath(reqPath);
   const onlyRefreshSlots = Boolean(internalOptions?.onlyRefreshSlots);
-  const inFlightKey = `${targetPath}:${onlyRefreshSlots ? "slots" : "full"}`;
+  const onlyIfExpired = Boolean(internalOptions?.onlyIfExpired);
+  const inFlightKey = `${targetPath}:${onlyRefreshSlots ? "slots" : "full"}:${onlyIfExpired ? "ttl" : "force"}`;
 
   if (inflightLayoutRevalidations.has(inFlightKey)) {
     return inflightLayoutRevalidations.get(inFlightKey);
@@ -962,6 +982,21 @@ async function revalidateLayout(reqPath, internalOptions = {}) {
         currentMeta.ppr = Boolean(anyLayoutPpr);
       } catch (e) {}
 
+      if (onlyIfExpired && !onlyRefreshSlots) {
+        const latestLayoutReval = currentMeta.revalidate;
+        const latestLayoutGenAt = Number(
+          currentMeta.layoutGeneratedAt || currentMeta.generatedAt || 0
+        );
+        const stillExpired =
+          typeof latestLayoutReval === "number" &&
+          latestLayoutReval >= 1 &&
+          latestLayoutGenAt > 0 &&
+          Date.now() > latestLayoutGenAt + latestLayoutReval * 1000;
+        if (!stillExpired) {
+          return false;
+        }
+      }
+
       const prevGenTime = (currentMeta && currentMeta.generatedAt) || 0;
       const prevLayoutOwnGenTime =
         (currentMeta && (currentMeta.layoutGeneratedAt || currentMeta.generatedAt)) || 0;
```

---

### 3.2 `dinou/core/handler.js`

```diff
--- a/dinou/core/handler.js
+++ b/dinou/core/handler.js
@@ -2095,6 +2095,7 @@ async function handleRequest(request, platformContext = {}) {
                 await revalidateLayout(entry.layoutRoutePath, {
                   onlyRefreshSlots:
                     !isLayoutTtlExpired && !isAncestorOwnNewer && isAncestorSlotOnlyNewer,
+                  onlyIfExpired: isLayoutTtlExpired && !(isLayoutReq && isAncestorNewer),
                 });
                 const lMetaKey = entry.cleanLayoutKey
                   ? `${entry.cleanLayoutKey}/layout.metadata.json`
@@ -2334,7 +2335,7 @@ async function handleRequest(request, platformContext = {}) {
                   regenerating.add(reqPath);
                   try {
                     const { revalidatePage } = await import("./cache-revalidate.js");
-                    await revalidatePage(cleanPath, {});
+                    await revalidatePage(cleanPath, { onlyIfExpired: true });
                   } finally {
                     regenerating.delete(reqPath);
                   }
@@ -2991,6 +2992,7 @@ async function handleRequest(request, platformContext = {}) {
               await revalidateLayout(entry.layoutRoutePath, {
                 onlyRefreshSlots:
                   !isLayoutTtlExpired && !isAncestorOwnNewer && isAncestorSlotOnlyNewer,
+                onlyIfExpired: isLayoutTtlExpired && !isAncestorNewer,
               });
               const refreshedMeta = await readMetaFromStorage(
                 storage,
@@ -3133,18 +3135,38 @@ async function handleRequest(request, platformContext = {}) {
         pageOwnRevalidate >= 1 &&
         Date.now() > (pageOwnGeneratedAt || 0) + pageOwnRevalidate * 1000;
 
-      if (isExpired) {
+      if (isExpired && !regenerating.has(reqPath)) {
         // Trigger background revalidation on Edge!
+        regenerating.add(reqPath);
         const revalPromise = (async () => {
-          if (regenerating.has(reqPath)) return;
-          regenerating.add(reqPath);
           try {
             console.log(`[Edge ISR] Starting regeneration for ${reqPath}...`);
             if (metadata.ppr || isPprConfig || (platformContext && platformContext.renderHtmlStream)) {
               const { revalidatePage } = await import("./cache-revalidate.js");
-              await revalidatePage(reqPath);
+              await revalidatePage(reqPath, { onlyIfExpired: true });
               return;
             }
+            const latestMeta = await readMetaFromStorage(
+              storage,
+              metaKey,
+              cleanPath ? `${cleanPath}/page.rsc` : "page.rsc",
+              platformContext,
+              request.url
+            );
+            if (latestMeta) {
+              const latestReval =
+                latestMeta.pageRevalidate !== undefined && latestMeta.pageRevalidate !== null
+                  ? latestMeta.pageRevalidate
+                  : pageOwnRevalidate;
+              const latestPageGen = Number(latestMeta.pageGeneratedAt || latestMeta.generatedAt || 0);
+              if (
+                typeof latestReval === "number" &&
+                latestReval >= 1 &&
+                latestPageGen > 0 &&
+                Date.now() <= latestPageGen + latestReval * 1000
+              ) {
+                return;
+              }
+            }
             const revalBridge = new WebResponseBridge();
             const revalSimReq = simReq
               ? { ...simReq, query: {}, cookies: {} }
```

---

## 4. `CHANGELOG.md` Entry (`9.4.0`)

```markdown
### Fixed
- **ISR Concurrent Stale-Snapshot Double-Revalidation Race**: Added an internal `onlyIfExpired` freshness check inside the serialized `enqueueRevalidation` critical section of `revalidatePage()` and `revalidateLayout()`, acquired `regenerating.add(reqPath)` synchronously before spawning background Edge ISR work in `handler.js`, and passed `{ onlyIfExpired: true }` across all TTL-triggered HTML/RSC/Layout ISR paths — eliminating phantom duplicate regenerations when concurrent requests read expired cache metadata right before an in-flight ISR commit completes, while keeping explicit on-demand `revalidatePage()` / `revalidateLayout()` / `revalidatePath()` / `revalidateTag()` calls immediate and unconditional.
```

---

## 5. Complete, Copy-Pasteable Automated Test Suites

### 5.1 Unit & Multi-Bundler Concurrency Test (`tests/unit/isr-concurrency.test.mjs`)

```js
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

function createFixtureDir(prefix) {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

test("Concurrent ISR SWR + polling storm across Esbuild, Rollup & Webpack commits EXACTLY one regeneration (no phantom :2 -> :3)", async () => {
  const bundlers = ["esbuild", "rollup", "webpack"];
  for (const bundler of bundlers) {
    const tmpApp = createFixtureDir(`tmp-isr-race-${bundler}-`);
    try {
      fs.writeFileSync(
        path.join(tmpApp, "package.json"),
        JSON.stringify({ name: `isr-race-${bundler}`, type: "module", private: true }, null, 2)
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
            exports: {
              ".": "./index.js",
              "./server": "./server.js",
              "./config": "./config.js",
            },
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

      fs.mkdirSync(path.join(tmpApp, "src", "isr", "[id]"), { recursive: true });

      fs.writeFileSync(
        path.join(tmpApp, "src", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>ISR Race Test</title></head>
      <body>{children}</body>
    </html>
  );
}
`
      );

      fs.writeFileSync(
        path.join(tmpApp, "src", "client-search.tsx"),
        `"use client";
import { useSearchParams } from "dinou";
export function ClientSearch() {
  const sp = useSearchParams();
  return <span data-testid="client-q">Q:{sp.get("q") ?? "EMPTY"}</span>;
}
`
      );

      fs.writeFileSync(
        path.join(tmpApp, "src", "page.tsx"),
        `export default function Home() { return <main>Home</main>; }\n`
      );

      fs.writeFileSync(
        path.join(tmpApp, "src", "isr", "[id]", "page_functions.ts"),
        `export const revalidate = 2;
export const getStaticPaths = ["seed"];
`
      );

      fs.writeFileSync(
        path.join(tmpApp, "src", "isr", "[id]", "page.tsx"),
        `import { ClientSearch } from "../../client-search";
const counts = new Map<string, number>();
export default async function IsrPage({ params }: { params: { id: string } }) {
  await new Promise((r) => setTimeout(r, 40));
  const next = (counts.get(params.id) ?? 0) + 1;
  counts.set(params.id, next);
  return (
    <main>
      <h1 data-testid="isr-count">{\`ISR:\${params.id}:\${next}\`}</h1>
      <ClientSearch />
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
      process.chdir(tmpApp);
      try {
        const rscMod = await import(
          pathToFileURL(path.join(tmpApp, ".dinou", "node", "rsc-engine.mjs")).href +
            `?b=${bundler}&t=${Date.now()}`
        );
        const ssrMod = await import(
          pathToFileURL(path.join(tmpApp, ".dinou", "node", "ssr-engine.mjs")).href +
            `?b=${bundler}&t=${Date.now()}`
        );
        const { FileSystemStorage, setStorageAdapter } = await import(
          pathToFileURL(path.join(DINOU_ROOT, "core", "storage-adapter.js")).href
        );
        const storage = new FileSystemStorage(path.join(tmpApp, ".dinou", "dist2"));
        setStorageAdapter(storage);
        if (typeof rscMod.setStorageAdapter === "function") {
          rscMod.setStorageAdapter(storage);
        }

        const id = `race-${bundler}`;
        const url = `http://localhost:3000/isr/${id}`;
        const ctxOpts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

        const initRes = await rscMod.handleRequest(new Request(url), ctxOpts);
        const initHtml = await initRes.text();
        assert.match(initHtml, new RegExp(`ISR:${id}:1`), `[${bundler}] Initial render must be :1`);

        const metaPath = path.join(tmpApp, ".dinou", "dist2", "isr", id, "metadata.json");
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const expiredTime = Date.now() - 5000;
        meta.generatedAt = expiredTime;
        meta.pageGeneratedAt = expiredTime;
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

        const storm = [];
        for (let i = 0; i < 16; i++) {
          storm.push(
            (async () => {
              if (i > 0) await new Promise((r) => setTimeout(r, i * 6));
              const reqUrl =
                i % 4 === 3
                  ? `http://localhost:3000/____rsc_page____/isr/${id}`
                  : `${url}?q=poll-${i}`;
              const r = await rscMod.handleRequest(new Request(reqUrl), ctxOpts);
              return await r.text();
            })()
          );
        }
        await Promise.all(storm);
        await new Promise((r) => setTimeout(r, 300));

        const check1 = await (await rscMod.handleRequest(new Request(`${url}?q=after-1`), ctxOpts)).text();
        const check2 = await (await rscMod.handleRequest(new Request(`${url}?q=after-2`), ctxOpts)).text();
        assert.match(
          check1,
          new RegExp(`ISR:${id}:2`),
          `[${bundler}] Expected exactly 1 regeneration (:2), got: ${check1.match(/ISR:[^<"]*/)?.[0]}`
        );
        assert.match(check2, new RegExp(`ISR:${id}:2`), `[${bundler}] Second check must stay cached at :2`);

        if (typeof rscMod.revalidatePage === "function") {
          await rscMod.revalidatePage(`/isr/${id}`, { onlyIfExpired: true });
          const still2 = await (await rscMod.handleRequest(new Request(url), ctxOpts)).text();
          assert.match(still2, new RegExp(`ISR:${id}:2`), `[${bundler}] onlyIfExpired must no-op when fresh`);

          await rscMod.revalidatePage(`/isr/${id}`);
          const forced3 = await (await rscMod.handleRequest(new Request(url), ctxOpts)).text();
          assert.match(forced3, new RegExp(`ISR:${id}:3`), `[${bundler}] Explicit revalidatePage must force :3`);
        }
      } finally {
        process.chdir(prevCwd);
      }
    } finally {
      fs.rmSync(tmpApp, { recursive: true, force: true });
    }
  }
});
```

### 5.2 Playwright E2E Test Suite (`tests/e2e/isr-concurrency.spec.ts`)

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const REPO_ROOT = process.cwd();
const DINOU_ROOT = fs.existsSync(path.resolve(REPO_ROOT, "dinou", "cli.js"))
  ? path.resolve(REPO_ROOT, "dinou")
  : path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou");

function createFixtureDir(prefix: string): string {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not allocate free port")));
      }
    });
    srv.on("error", reject);
  });
}

async function waitForHttpReady(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test.describe("ISR Concurrent SWR Polling Storm", () => {
  let fixtureRoot = "";
  let serverProc: ChildProcess | null = null;

  test.afterEach(() => {
    if (serverProc) {
      serverProc.kill("SIGTERM");
      serverProc = null;
    }
    if (fixtureRoot && fs.existsSync(fixtureRoot)) {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
      fixtureRoot = "";
    }
  });

  test("concurrent polling during ISR refresh commits exactly once without phantom double-increment", async ({
    page,
    request,
  }) => {
    fixtureRoot = createFixtureDir("tmp-isr-concurrency-e2e-");
    fs.writeFileSync(
      path.join(fixtureRoot, "package.json"),
      JSON.stringify({ name: "isr-concurrency-e2e", type: "module", private: true }, null, 2)
    );

    const dinouShimDir = path.join(fixtureRoot, "node_modules", "dinou");
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

    fs.mkdirSync(path.join(fixtureRoot, "src", "isr", "[id]"), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureRoot, "src", "layout.tsx"),
      `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>ISR Concurrency E2E</title></head>
      <body>{children}</body>
    </html>
  );
}
`
    );
    fs.writeFileSync(
      path.join(fixtureRoot, "src", "client-search.tsx"),
      `"use client";
import { useSearchParams } from "dinou";
export function ClientSearch() {
  const sp = useSearchParams();
  return <p data-testid="client-q">ClientQ:{sp.get("q") ?? "EMPTY"}</p>;
}
`
    );
    fs.writeFileSync(
      path.join(fixtureRoot, "src", "page.tsx"),
      `export default function Home() { return <main>Home</main>; }\n`
    );
    fs.writeFileSync(
      path.join(fixtureRoot, "src", "isr", "[id]", "page_functions.ts"),
      `export const revalidate = 2;
export const getStaticPaths = ["seed"];
`
    );
    fs.writeFileSync(
      path.join(fixtureRoot, "src", "isr", "[id]", "page.tsx"),
      `import { ClientSearch } from "../../client-search";
const counts = new Map<string, number>();
export default async function IsrPage({ params }: { params: { id: string } }) {
  await new Promise((r) => setTimeout(r, 60));
  const next = (counts.get(params.id) ?? 0) + 1;
  counts.set(params.id, next);
  return (
    <main>
      <h1 data-testid="isr-count">{\`ISR:\${params.id}:\${next}\`}</h1>
      <ClientSearch />
    </main>
  );
}
`
    );

    const buildRun = spawnSync(
      process.execPath,
      [path.join(DINOU_ROOT, "cli.js"), "build"],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(buildRun.status, `${buildRun.stdout}\n${buildRun.stderr}`).toBe(0);

    const port = await getFreePort();
    serverProc = spawn(
      process.execPath,
      [path.join(DINOU_ROOT, "cli.js"), "start"],
      {
        cwd: fixtureRoot,
        env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
        stdio: "ignore",
      }
    );
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHttpReady(baseUrl);

    const id = `storm-${Date.now()}`;
    const routeUrl = `${baseUrl}/isr/${id}`;

    // 1. Seed initial ISG/ISR cache (:1)
    const initRes = await request.get(routeUrl);
    expect(await initRes.text()).toContain(`ISR:${id}:1`);

    // 2. Wait for TTL=2s to expire, then fire 12 concurrent requests
    await page.waitForTimeout(2200);
    await Promise.all(
      Array.from({ length: 12 }, (_, idx) =>
        request.get(`${routeUrl}?q=burst-${idx}`)
      )
    );

    // 3. Poll until :2 is committed
    let refreshedSnapshot = "";
    await expect
      .poll(
        async () => {
          const html = await (await request.get(routeUrl)).text();
          const m = html.match(new RegExp(`ISR:${id}:\\d+`));
          refreshedSnapshot = m ? m[0] : "";
          return refreshedSnapshot;
        },
        { timeout: 10_000 }
      )
      .toBe(`ISR:${id}:2`);

    // 4. Two immediate follow-up checks + browser hydration must stay on :2 with zero hydration errors
    const count1Html = await (await request.get(`${routeUrl}?q=check1`)).text();
    const count2Html = await (await request.get(`${routeUrl}?q=check2`)).text();
    expect(count1Html).toContain(`ISR:${id}:2`);
    expect(count2Html).toContain(`ISR:${id}:2`);

    const hydrationErrors: string[] = [];
    page.on("pageerror", (e) => hydrationErrors.push(e.message));
    await page.goto(`${routeUrl}?q=hydrated-ok`);
    await expect(page.getByTestId("isr-count")).toHaveText(`ISR:${id}:2`);
    await expect(page.getByTestId("client-q")).toHaveText("ClientQ:hydrated-ok");
    expect(hydrationErrors).toEqual([]);
  });
});
```
