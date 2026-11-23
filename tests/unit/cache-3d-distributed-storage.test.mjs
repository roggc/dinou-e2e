import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import React from "react";

const REPO_ROOT = process.cwd();
const DINOU_ROOT = fs.existsSync(path.resolve(REPO_ROOT, "dinou", "cli.js"))
  ? path.resolve(REPO_ROOT, "dinou")
  : fs.existsSync(
        path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou", "cli.js")
      )
    ? path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou")
    : path.resolve(REPO_ROOT, "node_modules", "dinou");

const CLI_PATH = path.join(DINOU_ROOT, "cli.js");
const importDinou = (relPath) =>
  import(pathToFileURL(path.join(DINOU_ROOT, relPath)).href);

const {
  CloudflareKVStorage,
  RedisStorage,
  setStorageAdapter,
  getStorageAdapter,
  readDist2Fallback,
} = await importDinou("core/storage-adapter.js");
const { requestStorage } = await importDinou("core/request-context.js");
const {
  serializeJSX,
  inspectSlotsFreshness,
  getSlotJSX,
} = await importDinou("core/cache-slot.js");
const { composeLayoutChainFromOwnFragments } = await importDinou(
  "core/layout-composition.js"
);
const { createLayoutChildrenPlaceholder } = await importDinou(
  "core/ppr-context.js"
);

function removeDirSafe(dirPath) {
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  } catch {}
}

function createFixtureDir(prefix) {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

function writeDinouShim(tmpApp) {
  const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const relTo = (relPath) =>
    path
      .relative(dinouShimDir, path.join(DINOU_ROOT, relPath))
      .replace(/\\/g, "/");
  fs.writeFileSync(
    path.join(dinouShimDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "10.0.4",
        type: "module",
        main: "./index.js",
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
    `export * from "${relTo("index.js")}";\nexport { default } from "${relTo("index.js")}";\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from "${relTo("server.js")}";\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from "${relTo("core/config.js")}";\nexport { default } from "${relTo("core/config.js")}";\n`
  );
}

/**
 * Creates a strict request-scoped Cloudflare KV mock backed by `backingMap`.
 * Enforces:
 *  - Per-request IoContext isolation (`activeReqRef.current === ownerId`)
 *  - Cloudflare KV's real 1024-byte metadata size limit on `put()`
 */
function createStrictCloudflareKvProxy(backingMap, ownerId, activeReqRef, stats) {
  const guard = () => {
    if (activeReqRef.current !== ownerId) {
      throw new Error(
        `Cannot perform I/O on behalf of a different request (binding=${ownerId}, active=${activeReqRef.current})`
      );
    }
    stats[ownerId] = (stats[ownerId] || 0) + 1;
  };
  const guardKey = (key) => {
    guard();
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("KV key name cannot be empty");
    }
  };
  return {
    async get(key) {
      guardKey(key);
      const entry = backingMap.get(key);
      return entry ? entry.value : null;
    },
    async getWithMetadata(key) {
      guardKey(key);
      const entry = backingMap.get(key);
      if (!entry) return { value: null, metadata: null };
      return { value: entry.value, metadata: entry.metadata ?? null };
    },
    async put(key, value, options) {
      guardKey(key);
      const meta = options?.metadata ?? null;
      if (meta !== null) {
        const metaBytes = Buffer.byteLength(JSON.stringify(meta), "utf8");
        if (metaBytes > 1024) {
          throw new Error(
            `KV PUT failed: 413 Metadata can have at most 1024 bytes (got ${metaBytes})`
          );
        }
      }
      backingMap.set(key, { value: String(value), metadata: meta });
    },
    async delete(key) {
      guardKey(key);
      backingMap.delete(key);
    },
    async list(options = {}) {
      guard();
      const prefix = options?.prefix || "";
      const keys = [];
      for (const name of backingMap.keys()) {
        if (!prefix || name.startsWith(prefix)) {
          keys.push({ name });
        }
      }
      return { keys, list_complete: true };
    },
  };
}

/**
 * Shared in-memory Redis mock supporting `get`, `set`, `del`, `exists`, and `scan`.
 */
function createMockRedisClient(backingMap) {
  return {
    async get(k) {
      return backingMap.has(k) ? backingMap.get(k) : null;
    },
    async set(k, v) {
      backingMap.set(k, String(v));
      return "OK";
    },
    async del(k) {
      return backingMap.delete(k) ? 1 : 0;
    },
    async exists(k) {
      return backingMap.has(k) ? 1 : 0;
    },
    async scan(cursor, matchKeyword, pattern) {
      const prefix = String(pattern || "*").replace(/\*$/, "");
      const matched = [];
      for (const k of backingMap.keys()) {
        if (!prefix || k.startsWith(prefix)) matched.push(k);
      }
      return ["0", matched];
    },
  };
}

test("1. [Phase 3 / Stage 2 / Check #63] CloudflareKVStorage resolves per-request DINOU_CACHE bindings via requestStorage without cross-request I/O & handles >1024B metadata", async () => {
  const backing = new Map();
  const activeReqRef = { current: "req-1" };
  const stats = {};

  const req1Kv = createStrictCloudflareKvProxy(backing, "req-1", activeReqRef, stats);
  const req2Kv = createStrictCloudflareKvProxy(backing, "req-2", activeReqRef, stats);

  // Mirror worker.js singleton initialization captured during Request 1
  const kvStorage = new CloudflareKVStorage(req1Kv);
  kvStorage.hydrateFromDisk = false;

  await requestStorage.run({ env: { DINOU_CACHE: req1Kv } }, async () => {
    await kvStorage.set("items/a/index.html", "<html>A</html>", {
      generatedAt: 1000,
      tags: ["item-a"],
    });
  });
  const req1CallsAfterReq1 = stats["req-1"];
  assert.ok(req1CallsAfterReq1 > 0, "Expected req-1 KV calls during Request 1");

  // Switch active IoContext to Request 2: touching req1Kv now THROWS!
  activeReqRef.current = "req-2";
  await requestStorage.run({ env: { DINOU_CACHE: req2Kv } }, async () => {
    const got = await kvStorage.get("items/a/index.html");
    assert.equal(got?.content, "<html>A</html>");
    assert.equal(got?.metadata?.generatedAt, 1000);
    assert.equal(await kvStorage.has("items/a"), true);

    // Oversized (>1024 bytes) metadata must NOT crash KV PUT
    const hugeMeta = {
      generatedAt: 2000,
      tags: Array.from({ length: 40 }, (_, i) => `very-long-cache-tag-name-${i}-padding-xyz`),
      holes: Array.from({ length: 20 }, (_, i) => `ppr-hole-${i}`),
    };
    assert.ok(
      Buffer.byteLength(JSON.stringify(hugeMeta), "utf8") > 1024,
      "Test metadata must exceed 1024 bytes"
    );
    await kvStorage.set("items/big/index.html", "<html>BIG</html>", hugeMeta);
    const bigGot = await kvStorage.get("items/big/index.html");
    assert.equal(bigGot?.content, "<html>BIG</html>");
    assert.equal(
      bigGot?.metadata?.generatedAt,
      2000,
      "Companion metadata recovery must preserve generatedAt when >1024B"
    );
    assert.equal(
      bigGot?.metadata?.tags?.length,
      40,
      "Companion metadata recovery must preserve full tags array when >1024B"
    );
    const bigFolderGot = await kvStorage.get("items/big");
    assert.equal(bigFolderGot?.content, "<html>BIG</html>");
    assert.equal(bigFolderGot?.metadata?.generatedAt, 2000);

    // Root route ("/" / "index.html") must never issue an empty-string KV key call
    await kvStorage.set("index.html", "<html>HOME</html>", { generatedAt: 1500 });
    assert.equal(await kvStorage.has("/"), true);
    const homeGot = await kvStorage.get("/");
    assert.equal(homeGot?.content, "<html>HOME</html>");
    assert.equal(homeGot?.metadata?.generatedAt, 1500);
    await kvStorage.delete("/");
    assert.equal(await kvStorage.get("/"), null);
    assert.equal(await kvStorage.isKeyDeleted("index.html"), true);

    const allKeys = await kvStorage.keys();
    assert.ok(allKeys.includes("items/a/index.html"));
    assert.ok(allKeys.includes("items/big/index.html"));

    await kvStorage.delete("items/a/index.html");
    assert.equal(await kvStorage.get("items/a/index.html"), null);
  });

  assert.equal(
    stats["req-1"],
    req1CallsAfterReq1,
    "Request 2 MUST NOT invoke Request 1's KV binding!"
  );
  assert.ok((stats["req-2"] || 0) > 0, "Expected Request 2 to use its own req-2 KV binding");
});

test("2. [Phase 3 / Stage 2 / Check #63] CloudflareKVStorage cross-isolate tombstones & tag invalidations prevent env.ASSETS stale resurrection (Isolate A -> Isolate B)", async () => {
  const sharedKvMap = new Map();
  const activeReqRef = { current: "iso-a" };
  const stats = {};

  const kvA = createStrictCloudflareKvProxy(sharedKvMap, "iso-a", activeReqRef, stats);
  const kvB = createStrictCloudflareKvProxy(sharedKvMap, "iso-b", activeReqRef, stats);

  // Two completely separate isolate instances (separate RAM _deletedKeys & _invalidatedTags)
  const isoA = new CloudflareKVStorage(kvA);
  const isoB = new CloudflareKVStorage(kvB);
  isoA.hydrateFromDisk = false;
  isoB.hydrateFromDisk = false;

  const staleSlotPayload = serializeJSX(React.createElement("span", { id: "cf-sl" }, "STALE-100"));
  const staleSlotMeta = {
    slotId: "cf-dist-slot",
    tags: ["cf-dist-tag"],
    revalidate: 3600,
    generatedAt: 1000,
    inStaticShell: true,
  };
  const mockAssets = {
    async fetch(req) {
      const u = new URL(typeof req === "string" ? req : req.url);
      if (u.pathname.endsWith("/__dinou_dist2/slots/cf-dist-slot/slot.json")) {
        return new Response(staleSlotPayload, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.pathname.endsWith("/__dinou_dist2/slots/cf-dist-slot/slot.metadata.json")) {
        return new Response(JSON.stringify(staleSlotMeta), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
  };

  const prevAdapter = getStorageAdapter();
  try {
    // Isolate A invalidates tag & deletes slot
    setStorageAdapter(isoA);
    await requestStorage.run({ env: { DINOU_CACHE: kvA, ASSETS: mockAssets } }, async () => {
      await isoA.set("slots/cf-dist-slot/slot.json", staleSlotPayload, staleSlotMeta);
      await isoA.markTagInvalidatedAsync("cf-dist-tag");
      await isoA.delete("slots/cf-dist-slot/slot.json");
    });

    // Isolate B (cold RAM) must observe remote tombstone & tag invalidation and NOT resurrect stale env.ASSETS!
    activeReqRef.current = "iso-b";
    setStorageAdapter(isoB);
    await requestStorage.run({ env: { DINOU_CACHE: kvB, ASSETS: mockAssets } }, async () => {
      assert.equal(
        await isoB.isKeyDeleted("slots/cf-dist-slot/slot.json"),
        true,
        "Isolate B must observe cross-isolate KV tombstone for deleted slot"
      );
      const invAt = await isoB.getTagInvalidatedAtAsync("cf-dist-tag");
      assert.ok(
        invAt >= 1000,
        `Isolate B must observe cross-isolate KV tag invalidation timestamp (got ${invAt})`
      );

      // Even getSlotJSX with env.ASSETS fallback MUST NOT resurrect deleted build-time slot
      const resolvedSlot = await getSlotJSX("cf-dist-slot");
      assert.equal(
        resolvedSlot,
        null,
        "Isolate B must NOT resurrect deleted slot from env.ASSETS!"
      );

      // Internal tombstone / tag_inv keys must stay hidden from storage.keys()
      const visibleKeys = await isoB.keys();
      assert.equal(
        visibleKeys.some(
          (k) => k.includes("__tombstone__:") || k.includes("__tag_inv__:")
        ),
        false,
        `Internal tombstone/tag_inv keys must be filtered from CloudflareKVStorage.keys(): ${JSON.stringify(visibleKeys)}`
      );
    });

    // Isolate A writes fresh slot -> clears tombstone -> Isolate B sees fresh slot and hasNewer: true!
    activeReqRef.current = "iso-a";
    setStorageAdapter(isoA);
    const freshGenAt = Date.now() + 5000;
    const freshSlotPayload = serializeJSX(React.createElement("span", { id: "cf-sl" }, "FRESH-200"));
    await requestStorage.run({ env: { DINOU_CACHE: kvA, ASSETS: mockAssets } }, async () => {
      await isoA.set("slots/cf-dist-slot/slot.json", freshSlotPayload, {
        ...staleSlotMeta,
        generatedAt: freshGenAt,
      });
    });

    activeReqRef.current = "iso-b";
    setStorageAdapter(isoB);
    await requestStorage.run({ env: { DINOU_CACHE: kvB, ASSETS: mockAssets } }, async () => {
      assert.equal(
        await isoB.isKeyDeleted("slots/cf-dist-slot/slot.json"),
        false,
        "Writing fresh slot in Isolate A must clear remote tombstone for Isolate B"
      );
      const freshness = await inspectSlotsFreshness(["cf-dist-slot"], 1000);
      assert.equal(freshness.hasNewer, true, "Isolate B must detect fresher slot from Isolate A");
      const freshItem = await isoB.get("slots/cf-dist-slot/slot.json");
      assert.ok(freshItem?.content?.includes("FRESH-200"));
    });
  } finally {
    setStorageAdapter(prevAdapter);
  }
});

test("3. [Phase 3 / Stage 2 / Check #63] Multi-pod RedisStorage: remote tombstones, tag invalidation vs local .dinou/dist2 disk fallback & cross-pod 3D layout composition", async () => {
  const tmpApp = createFixtureDir("tmp-3d-p3-s2-redis-");
  const prevCwd = process.cwd();
  const prevAdapter = getStorageAdapter();
  try {
    const dist2 = path.join(tmpApp, ".dinou", "dist2");
    fs.mkdirSync(path.join(dist2, "l1/l2"), { recursive: true });
    fs.mkdirSync(path.join(dist2, "slots/shared-pod-slot"), { recursive: true });

    const staleTime = 1000;
    const staleSlotJson = serializeJSX(React.createElement("span", { id: "sp" }, "DISK-100"));
    const staleSlotMeta = {
      slotId: "shared-pod-slot",
      tags: ["shared-pod-tag"],
      revalidate: 3600,
      generatedAt: staleTime,
    };
    fs.writeFileSync(
      path.join(dist2, "slots/shared-pod-slot/slot.json"),
      staleSlotJson
    );
    fs.writeFileSync(
      path.join(dist2, "slots/shared-pod-slot/slot.metadata.json"),
      JSON.stringify(staleSlotMeta)
    );
    fs.writeFileSync(
      path.join(dist2, "l1/l2/index.html"),
      "<html><body>DISK-PAGE-100</body></html>"
    );
    fs.writeFileSync(
      path.join(dist2, "l1/l2/metadata.json"),
      JSON.stringify({
        generatedAt: staleTime,
        pageGeneratedAt: staleTime,
        tags: ["page-l2-tag"],
        slotTags: ["shared-pod-tag"],
      })
    );

    const sharedRedisMap = new Map();
    const podA = new RedisStorage(createMockRedisClient(sharedRedisMap), "dinou:p3:");
    const podB = new RedisStorage(createMockRedisClient(sharedRedisMap), "dinou:p3:");

    process.chdir(tmpApp);

    // 1. Pod A deletes slot & invalidates shared-pod-tag -> Pod B must NOT resurrect stale .dinou/dist2 files!
    await podA.markTagInvalidatedAsync("shared-pod-tag");
    await podA.delete("slots/shared-pod-slot/slot.json");

    assert.equal(await podB.isKeyDeleted("slots/shared-pod-slot/slot.json"), true);
    assert.ok((await podB.getTagInvalidatedAtAsync("shared-pod-tag")) >= staleTime);
    assert.equal(
      await readDist2Fallback(podB, "slots/shared-pod-slot/slot.json", ["shared-pod-tag"]),
      null,
      "Pod B must NOT resurrect deleted slot from local .dinou/dist2"
    );
    assert.equal(
      await readDist2Fallback(podB, "l1/l2/index.html"),
      null,
      "Pod B must NOT resurrect stale HTML referencing invalidated slotTag from .dinou/dist2"
    );

    // 2. Pod A writes fresh slot + L1 & L2 shell.layout.own.json -> Pod B clears tombstone, detects hasNewer, and composes L1->L2!
    const freshTime = Date.now() + 5000;
    const freshSlotJson = serializeJSX(React.createElement("span", { id: "sp" }, "REDIS-200"));
    await podA.set("slots/shared-pod-slot/slot.json", freshSlotJson, {
      ...staleSlotMeta,
      generatedAt: freshTime,
    });
    const l1Tree = React.createElement(
      "div",
      { id: "pod-l1" },
      "L1-REDIS",
      createLayoutChildrenPlaceholder()
    );
    const l2Tree = React.createElement(
      "section",
      { id: "pod-l2" },
      "L2-REDIS",
      createLayoutChildrenPlaceholder()
    );
    await podA.set("l1/shell.layout.own.json", serializeJSX(l1Tree));
    await podA.set(
      "l1/layout.metadata.json",
      JSON.stringify({ generatedAt: freshTime, ownGeneratedAt: freshTime })
    );
    await podA.set("l1/l2/shell.layout.own.json", serializeJSX(l2Tree));
    await podA.set(
      "l1/l2/layout.metadata.json",
      JSON.stringify({ generatedAt: freshTime, ownGeneratedAt: freshTime })
    );

    setStorageAdapter(podB);
    assert.equal(await podB.isKeyDeleted("slots/shared-pod-slot/slot.json"), false);
    const freshCheck = await inspectSlotsFreshness(["shared-pod-slot"], staleTime);
    assert.equal(freshCheck.hasNewer, true);

    const activeChain = [
      { cleanLayoutKey: "l1/l2", layoutRoutePath: "/l1/l2", effectivePpr: false },
      { cleanLayoutKey: "l1", layoutRoutePath: "/l1", effectivePpr: false },
    ];
    const composed = await composeLayoutChainFromOwnFragments(activeChain, podB, {
      currentPath: "/l1/l2",
    });
    assert.ok(composed && composed.composedWithPlaceholder, "Pod B must compose L1->L2 from Redis");
    const serializedComposed = serializeJSX(composed.composedWithPlaceholder);
    assert.ok(serializedComposed.includes("L1-REDIS"));
    assert.ok(serializedComposed.includes("L2-REDIS"));
  } finally {
    process.chdir(prevCwd);
    setStorageAdapter(prevAdapter);
    removeDirSafe(tmpApp);
  }
});

test("4. [Phase 3 / Stage 2 / Check #63] End-to-end compiled Node AOT 3D Cube over multi-pod RedisStorage (Pod A revalidates tag & layout, cold Pod B serves fresh without disk resurrection)", async () => {
  const tmpApp = createFixtureDir("tmp-3d-p3-s2-aot-");
  try {
    fs.mkdirSync(path.join(tmpApp, "src/cube/l2"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify(
        {
          name: "tmp-3d-p3-s2-aot",
          type: "module",
          private: true,
          dependencies: { react: "^19.3.0", "react-dom": "^19.3.0" },
        },
        null,
        2
      )
    );
    writeDinouShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "src/state.ts"),
      `import fs from "node:fs";
import path from "node:path";
const FILE = path.resolve(process.cwd(), "s2-state.json");
const DEF = { l1: 100, slot: 100, l2: 100, page: 100, hole: 100 };
export function readS() {
  try { if (fs.existsSync(FILE)) return { ...DEF, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
  return { ...DEF };
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/layout.tsx"),
      `import type { ReactNode } from "react";
export default function Root({ children }: { children: ReactNode }) {
  return <html><head><title>P3S2</title></head><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/page.tsx"),
      `export default function Home() { return <main>home</main>; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/cube/layout_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\nexport function getCacheTags() { return ["p3s2-l1"]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/cube/layout.tsx"),
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function L1({ children }: { children: ReactNode }) {
  return (
    <section>
      <span id="c-l1">{readS().l1}</span>
      <DinouCacheSlot id="p3s2-slot" tag="p3s2-slot-tag" revalidate={3600}>
        {async () => <span id="c-sl">{readS().slot}</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/cube/l2/layout_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/cube/l2/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function L2({ children }: { children: ReactNode }) {
  return <div><span id="c-l2">{readS().l2}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/cube/l2/page_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/cube/l2/page.tsx"),
      `import { Suspense } from "react";
import { readS, sleep } from "../../state";
async function Hole() {
  await sleep(10);
  return <span id="c-h">{readS().hole}</span>;
}
export default function Page() {
  return (
    <main>
      <span id="c-p">{readS().page}</span>
      <Suspense fallback={<span>fb</span>}><Hole /></Suspense>
    </main>
  );
}
`
    );

    const buildRes = spawnSync(process.execPath, [CLI_PATH, "build:node:esbuild"], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      timeout: 120_000,
    });
    assert.equal(
      buildRes.status,
      0,
      `Stage 2 AOT fixture build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    const verifyScript = path.join(tmpApp, "verify-p3s2.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { RedisStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const { revalidateTag, revalidateLayout } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/cache-revalidate.js")).href
      )});

const sharedRedisMap = new Map();
const makeClient = () => ({
  async get(k) { return sharedRedisMap.has(k) ? sharedRedisMap.get(k) : null; },
  async set(k, v) { sharedRedisMap.set(k, String(v)); return "OK"; },
  async del(k) { return sharedRedisMap.delete(k) ? 1 : 0; },
  async exists(k) { return sharedRedisMap.has(k) ? 1 : 0; },
  async scan(cursor, _m, pattern) {
    const prefix = String(pattern || "*").replace(/\\*$/, "");
    const matched = [];
    for (const k of sharedRedisMap.keys()) {
      if (!prefix || k.startsWith(prefix)) matched.push(k);
    }
    return ["0", matched];
  },
});

const podA = new RedisStorage(makeClient(), "dinou:aot:");
const podB = new RedisStorage(makeClient(), "dinou:aot:");
setStorageAdapter(podA);
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const writeS = (patch) => {
  const f = path.resolve("s2-state.json");
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const get = async (u) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u), opts);
  assert.equal(r.status, 200, "Expected 200 for " + u);
  return await r.text();
};
const textById = (html, id) => {
  const m = html.match(new RegExp(\`id="\${id}"[^>]*>([^<]+)<\`));
  return m ? m[1] : null;
};

// 1. Pod A warms from .dinou/dist2 -> Redis
const h1 = await get("/cube/l2");
assert.equal(textById(h1, "c-l1"), "100");
assert.equal(textById(h1, "c-sl"), "100");
assert.equal(textById(h1, "c-l2"), "100");
assert.equal(textById(h1, "c-p"), "100");
assert.equal(textById(h1, "c-h"), "100");

// 2. Pod A poisons L2 & Page, bumps Slot & L1, and runs revalidateTag("p3s2-slot-tag") + revalidateLayout("/cube")
writeS({ l1: 501, slot: 502, l2: 999, page: 999, hole: 503 });
await revalidateTag("p3s2-slot-tag");
await revalidateLayout("/cube");

// 3. Switch to fresh Pod B (empty local RAM, stale .dinou/dist2 still has 100 on disk!)
setStorageAdapter(podB);
const h2 = await get("/cube/l2");
assert.equal(textById(h2, "c-l1"), "501", "Pod B must serve fresh L1 from Redis");
assert.equal(textById(h2, "c-sl"), "502", "Pod B must serve fresh slot from Redis");
assert.equal(textById(h2, "c-l2"), "100", "Pod B must keep L2 frozen (no 999 re-exec)");
assert.equal(textById(h2, "c-p"), "100", "Pod B must keep Page frozen (no 999 re-exec)");
assert.equal(textById(h2, "c-h"), "503", "Pod B must stream live PPR hole");

console.log("PHASE3_STAGE2_DISTRIBUTED_OK");
`
    );

    const runRes = spawnSync(process.execPath, [verifyScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
      timeout: 60_000,
    });
    assert.equal(
      runRes.status,
      0,
      `Stage 2 AOT multi-pod Redis failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("PHASE3_STAGE2_DISTRIBUTED_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});
