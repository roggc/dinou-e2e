import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
fs.mkdirSync(path.join(rootDir, ".dinou"), { recursive: true });
const DINOU_ROOT = fs.existsSync(path.resolve(rootDir, "dinou", "cli.js"))
  ? path.resolve(rootDir, "dinou")
  : fs.existsSync(
        path.resolve(rootDir, "node_modules", "dinou", "dinou", "cli.js")
      )
    ? path.resolve(rootDir, "node_modules", "dinou", "dinou")
    : path.resolve(rootDir, "node_modules", "dinou");
const dinouCoreUrl = (relPath) =>
  pathToFileURL(path.join(DINOU_ROOT, "core", relPath)).href;
const vfsUrl = dinouCoreUrl("vfs.js");
const layoutFnUrl = dinouCoreUrl("layout-functions.js");
const routeModUrl = dinouCoreUrl("get-file-path-and-dynamic-params.js");

test("OPT-1: Production VFS authoritative negative lookups eliminate fs.existsSync/readdirSync syscalls while keeping DEV live & external temp dirs safe", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDinouDev = process.env.DINOU_DEV;
  const prevGlobalVfs = globalThis.__DINOU_VFS__;
  const origExistsSync = fs.existsSync;
  const origReaddirSync = fs.readdirSync;

  const tmpBase = fs.mkdtempSync(
    path.join(rootDir, ".dinou", "tmp-opt1-vfs-")
  );
  const tmpSrcDir = path.join(tmpBase, "src");
  const tmpSubDir = path.join(tmpSrcDir, "demo");
  fs.mkdirSync(tmpSubDir, { recursive: true });
  const tmpPageFile = path.join(tmpSubDir, "page.tsx");
  fs.writeFileSync(tmpPageFile, "export default function P() { return null; }\n");

  try {
    process.env.NODE_ENV = "production";
    delete process.env.DINOU_DEV;
    delete globalThis.__DINOU_VFS__;

    // Load fresh module instances in production mode
    const vfsMod = await import(`${vfsUrl}?opt1=${Date.now()}`);
    const layoutFnMod = await import(`${layoutFnUrl}?opt1=${Date.now()}`);
    const routeMod = await import(`${routeModUrl}?opt1=${Date.now()}`);

    const srcFolder = path.resolve(rootDir, "src");

    // Warm up layoutFunctionsPathCache once on a real route with nested layouts
    const segs = ["t-3d-cube", "http-head-headers", "static-page"];
    const warmChain = layoutFnMod.getActiveLayoutChain(segs, {}, srcFolder);
    assert.ok(warmChain.length >= 2, "Expected multi-level layout chain");
    for (const entry of warmChain) {
      layoutFnMod.getLayoutFunctionsPath(path.dirname(entry.layoutPath));
    }

    let realExistsCalls = 0;
    let realReaddirCalls = 0;
    fs.existsSync = function (...args) {
      realExistsCalls++;
      return origExistsSync.apply(this, args);
    };
    fs.readdirSync = function (...args) {
      realReaddirCalls++;
      return origReaddirSync.apply(this, args);
    };

    // 1. Production localVfs negative probes under src/ must execute ZERO disk syscalls
    assert.equal(
      vfsMod.existsSync(path.join(srcFolder, "__nonexistent_opt1_file__.tsx")),
      false
    );
    assert.deepEqual(
      vfsMod.readdirSync(path.join(srcFolder, "__nonexistent_opt1_dir__")),
      []
    );
    const [pagePath] = routeMod.getFilePathAndDynamicParams(segs, {}, srcFolder);
    assert.ok(pagePath, "Route should resolve from VFS");
    const chain = layoutFnMod.getActiveLayoutChain(segs, {}, srcFolder);
    assert.equal(chain.length, warmChain.length);
    for (const entry of chain) {
      layoutFnMod.getLayoutFunctionsPath(path.dirname(entry.layoutPath));
    }
    assert.equal(
      realExistsCalls,
      0,
      `Expected 0 real fs.existsSync calls under production localVfs, got ${realExistsCalls}`
    );
    assert.equal(
      realReaddirCalls,
      0,
      `Expected 0 real fs.readdirSync calls under production localVfs, got ${realReaddirCalls}`
    );

    // 2. Production globalThis.__DINOU_VFS__ authoritative negative probes (including relative src/ paths)
    globalThis.__DINOU_VFS__ = {
      src: { type: "directory", children: [{ name: "page.tsx", isDirectory: false }] },
      "/src": { type: "directory", children: [{ name: "page.tsx", isDirectory: false }] },
      "src/page.tsx": { type: "file" },
      "/src/page.tsx": { type: "file" },
    };
    assert.equal(vfsMod.existsSync("src/page.tsx"), true);
    assert.equal(vfsMod.existsSync("src/no_layout"), false);
    assert.equal(vfsMod.existsSync("/src/reset_layout"), false);
    assert.equal(
      vfsMod.existsSync(path.join(srcFolder, "layout_functions.ts")),
      false
    );
    assert.equal(
      realExistsCalls,
      0,
      `Expected 0 real fs.existsSync calls under global __DINOU_VFS__, got ${realExistsCalls}`
    );

    // 3. Temp fixture under .dinou/tmp-opt1-vfs/src MUST still fall back to real fs.existsSync
    assert.equal(vfsMod.existsSync(tmpPageFile), true);
    assert.equal(vfsMod.existsSync(path.join(tmpSubDir, "missing.ts")), false);
    assert.ok(
      realExistsCalls >= 2,
      "Expected external .dinou/tmp-* paths to fall back to real fs.existsSync"
    );

    // 4. DEV mode must bypass negative VFS short-circuit & layoutFunctionsPathCache for live HMR
    delete globalThis.__DINOU_VFS__;
    process.env.NODE_ENV = "development";
    process.env.DINOU_DEV = "true";

    const liveLfFile = path.join(tmpSubDir, "layout_functions.ts");
    assert.equal(layoutFnMod.getLayoutFunctionsPath(tmpSubDir), null);
    fs.writeFileSync(liveLfFile, "export const revalidate = 60;\n");
    assert.equal(
      path.resolve(layoutFnMod.getLayoutFunctionsPath(tmpSubDir) || ""),
      path.resolve(liveLfFile),
      "DEV mode must detect newly added layout_functions.ts without stale cache"
    );
    fs.rmSync(liveLfFile, { force: true });
    assert.equal(
      layoutFnMod.getLayoutFunctionsPath(tmpSubDir),
      null,
      "DEV mode must detect deleted layout_functions.ts immediately"
    );

    // 5. Production cache behavior for getLayoutFunctionsPath() + clearLayoutFunctionsPathCache()
    process.env.NODE_ENV = "production";
    delete process.env.DINOU_DEV;
    layoutFnMod.clearLayoutFunctionsPathCache();
    fs.writeFileSync(liveLfFile, "export const revalidate = 60;\n");
    const firstProd = layoutFnMod.getLayoutFunctionsPath(tmpSubDir);
    assert.equal(path.resolve(firstProd || ""), path.resolve(liveLfFile));
    const callsBeforeCachedHit = realExistsCalls;
    const secondProd = layoutFnMod.getLayoutFunctionsPath(tmpSubDir);
    assert.equal(secondProd, firstProd);
    assert.equal(
      realExistsCalls,
      callsBeforeCachedHit,
      "Production getLayoutFunctionsPath cache hit must invoke 0 fs.existsSync calls"
    );
  } finally {
    fs.existsSync = origExistsSync;
    fs.readdirSync = origReaddirSync;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevDinouDev === undefined) delete process.env.DINOU_DEV;
    else process.env.DINOU_DEV = prevDinouDev;
    if (prevGlobalVfs === undefined) delete globalThis.__DINOU_VFS__;
    else globalThis.__DINOU_VFS__ = prevGlobalVfs;
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test("OPT-2: Production layoutFunctionsConfigCache avoids per-request getStaticPaths() re-execution while preserving dynamic revalidate(params)/getCacheTags(params)/validateParams & single-pass layout.metadata.json reads", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDinouDev = process.env.DINOU_DEV;
  const tmpBase = fs.mkdtempSync(
    path.join(rootDir, ".dinou", "tmp-opt2-layout-cfg-")
  );
  const tmpLayoutDir = path.join(tmpBase, "src", "catalog", "[id]");
  fs.mkdirSync(tmpLayoutDir, { recursive: true });
  const lfPath = path.join(tmpLayoutDir, "layout_functions.mjs");
  const counterKey = `__OPT2_TEST_STATIC_PATHS_${Date.now()}__`;
  fs.writeFileSync(
    lfPath,
    `
globalThis[${JSON.stringify(counterKey)}] = globalThis[${JSON.stringify(counterKey)}] || 0;
export const ppr = true;
export const allowISG = false;
export function getStaticPaths() {
  globalThis[${JSON.stringify(counterKey)}]++;
  return [{ id: "alpha" }, { id: "beta" }];
}
export function revalidate(params) {
  return params?.id === "live" ? 0 : 120;
}
export function getCacheTags(params) {
  return ["cat-" + (params?.id || "none")];
}
export function validateParams(params) {
  return params?.id !== "blocked";
}
export function getProps(params) {
  return { resolvedId: params?.id || "empty" };
}
`
  );

  const storageMod = await import(dinouCoreUrl("storage-adapter.js"));
  const prevAdapter = storageMod.hasExplicitStorageAdapter()
    ? storageMod.getStorageAdapter()
    : null;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.DINOU_DEV;

    const layoutFnMod = await import(`${layoutFnUrl}?opt2=${Date.now()}`);
    layoutFnMod.clearLayoutFunctionsPathCache();
    layoutFnMod.clearLayoutFunctionsConfigCache();

    const layoutFile = path.join(tmpLayoutDir, "layout.tsx");
    const cfg1 = await layoutFnMod.resolveLayoutFunctionsConfig(layoutFile, {
      id: "alpha",
    });
    const cfg2 = await layoutFnMod.resolveLayoutFunctionsConfig(layoutFile, {
      id: "live",
    });
    const cfg3 = await layoutFnMod.resolveLayoutFunctionsConfig(layoutFile, {
      id: "blocked",
    });

    // getStaticPaths() must execute ONLY ONCE in production across all 3 requests
    assert.equal(
      globalThis[counterKey],
      1,
      `Expected getStaticPaths() to execute once in prod, got ${globalThis[counterKey]}`
    );
    assert.equal(cfg1.ppr, true);
    assert.equal(cfg1.allowISG, false);
    assert.equal(cfg1.isDynamic, false);
    assert.equal(cfg1.revalidate, 120);
    assert.deepEqual(cfg1.tags, ["cat-alpha"]);
    assert.ok(cfg1.staticPathsSet?.size === 2);

    // Dynamic per-request hooks MUST still execute with each request's dParams
    assert.equal(cfg2.isDynamic, true);
    assert.equal(cfg2.revalidate, 0);
    assert.deepEqual(cfg2.tags, ["cat-live"]);
    assert.equal(cfg1.validateParams({ id: "alpha" }), true);
    assert.equal(cfg3.validateParams({ id: "blocked" }), false);

    // getLayoutProps() uses cached getProps reference in production
    const propsRes = await layoutFnMod.getLayoutProps(layoutFile, { id: "beta" });
    assert.deepEqual(propsRes, { resolvedId: "beta" });

    // DEV mode must NOT freeze getStaticPaths() in layoutFunctionsConfigCache
    process.env.NODE_ENV = "development";
    process.env.DINOU_DEV = "true";
    await layoutFnMod.resolveLayoutFunctionsConfig(layoutFile, { id: "alpha" });
    assert.equal(
      globalThis[counterKey],
      2,
      "DEV mode must bypass layoutFunctionsConfigCache"
    );

    // Verify single-pass layout.metadata.json reads on a warm HTML cache hit (3 layouts -> 3 reads, not 6)
    process.env.NODE_ENV = "production";
    delete process.env.DINOU_DEV;
    const handlerMod = await import(dinouCoreUrl("handler.js"));
    const mem = new storageMod.MemoryStorage();
    const staticRel = "t-3d-cube/router-coherence/sub-layout";
    const now = Date.now();
    await mem.set(
      `${staticRel}/index.html`,
      "<!DOCTYPE html><html><body>ok</body></html>",
      { status: 200, generatedAt: now, pageGeneratedAt: now, revalidate: 3600, tags: [] }
    );
    const layoutKeys = [
      "",
      "t-3d-cube",
      "t-3d-cube/router-coherence",
      "t-3d-cube/router-coherence/sub-layout",
    ];
    for (const lk of layoutKeys) {
      await mem.set(
        lk ? `${lk}/layout.metadata.json` : "layout.metadata.json",
        JSON.stringify({ generatedAt: now, layoutGeneratedAt: now, ownGeneratedAt: now, revalidate: 3600 })
      );
    }
    const readCountsByKey = new Map();
    const origGet = mem.get.bind(mem);
    mem.get = async (k) => {
      const keyStr = String(k);
      if (keyStr.endsWith("layout.metadata.json")) {
        readCountsByKey.set(keyStr, (readCountsByKey.get(keyStr) || 0) + 1);
      }
      return origGet(k);
    };
    storageMod.setStorageAdapter(mem);

    // Warmup first (populates pageFunctionsConfigCache)
    const r0 = await handlerMod.handleRequest(
      new Request(`http://localhost:3000/${staticRel}`),
      { runtime: "edge" }
    );
    assert.equal(r0.status, 200);
    readCountsByKey.clear();

    const r1 = await handlerMod.handleRequest(
      new Request(`http://localhost:3000/${staticRel}`),
      { runtime: "edge" }
    );
    assert.equal(r1.status, 200);
    for (const [k, count] of readCountsByKey.entries()) {
      assert.equal(
        count,
        1,
        `Expected single-pass read (count=1) for ${k} on warm HTML hit, got ${count}`
      );
    }
    assert.ok(readCountsByKey.size >= 2, "Expected active multi-level layouts to be read once each");
  } finally {
    delete globalThis[counterKey];
    if (prevAdapter) storageMod.setStorageAdapter(prevAdapter);
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevDinouDev === undefined) delete process.env.DINOU_DEV;
    else process.env.DINOU_DEV = prevDinouDev;
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test("OPT-3: Metadata-only parallel inspectSlotsFreshness(), request-scoped deduplication with _mutationEpoch invalidation, DenoKV chunk-skip & parallel multi-layout prefetch", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDinouDev = process.env.DINOU_DEV;
  const origReadFileSync = fs.readFileSync;
  const tmpDir = fs.mkdtempSync(path.join(rootDir, ".dinou", "tmp-opt3-slots-"));

  const storageMod = await import(dinouCoreUrl("storage-adapter.js"));
  const slotMod = await import(dinouCoreUrl("cache-slot.js"));
  const reqCtxMod = await import(dinouCoreUrl("request-context.js"));
  const prevAdapter = storageMod.hasExplicitStorageAdapter()
    ? storageMod.getStorageAdapter()
    : null;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.DINOU_DEV;

    // 1. FileSystemStorage: inspectSlotsFreshness reads ZERO slot.json payload bodies,
    //    deduplicates repeated inspections within the same request, and auto-invalidates on mutation.
    const fsStore = new storageMod.FileSystemStorage(tmpDir);
    const t0 = Date.now();
    const bigSlotPayload = JSON.stringify({ payload: "Z".repeat(32 * 1024) });
    for (const id of ["opt3-a", "opt3-b", "opt3-shared"]) {
      await fsStore.set(`slots/${id}/slot.json`, bigSlotPayload, {
        slotId: id,
        tags: id === "opt3-shared" ? ["shared-tag"] : [id],
        revalidate: 3600,
        generatedAt: t0,
      });
    }
    storageMod.setStorageAdapter(fsStore);

    let slotBodyReads = 0;
    let slotMetaReads = 0;
    fs.readFileSync = function (p, ...rest) {
      const norm = String(p).replace(/\\/g, "/");
      if (norm.endsWith("/slot.json")) slotBodyReads++;
      if (norm.endsWith("/slot.metadata.json")) slotMetaReads++;
      return origReadFileSync.call(this, p, ...rest);
    };

    // Prime slotTagIndex once
    fsStore.getSlotTagIndex();
    slotBodyReads = 0;
    slotMetaReads = 0;

    await reqCtxMod.requestStorage.run({ req: { path: "/opt3" } }, async () => {
      const r1 = await slotMod.inspectSlotsFreshness(["opt3-a", "shared-tag"], t0);
      assert.deepEqual(r1, { hasExpired: false, hasNewer: false });
      const metaReadsAfterFirst = slotMetaReads;
      assert.equal(slotBodyReads, 0, "Expected 0 slot.json body reads on FileSystemStorage");
      assert.equal(metaReadsAfterFirst, 2, "Expected 2 slot.metadata.json reads (opt3-a + opt3-shared)");

      // Second call in same request with overlapping tag MUST hit request-scoped cache (0 extra reads)
      const r2 = await slotMod.inspectSlotsFreshness(["opt3-b", "shared-tag"], t0);
      assert.deepEqual(r2, { hasExpired: false, hasNewer: false });
      assert.equal(slotBodyReads, 0);
      assert.equal(
        slotMetaReads,
        metaReadsAfterFirst + 1,
        "Expected only 1 new slot.metadata.json read (opt3-b); opt3-shared must be deduplicated"
      );

      // Mid-request mutation bumps storage._mutationEpoch -> cache MUST auto-invalidate!
      await fsStore.set(`slots/opt3-shared/slot.json`, bigSlotPayload, {
        slotId: "opt3-shared",
        tags: ["shared-tag"],
        revalidate: 3600,
        generatedAt: t0 + 500,
      });
      const r3 = await slotMod.inspectSlotsFreshness(["shared-tag"], t0);
      assert.equal(
        r3.hasNewer,
        true,
        "Mid-request storage.set() must invalidate request slot freshness cache via _mutationEpoch"
      );

      // Explicit bypassRequestCache must always read fresh from storage
      const beforeBypass = slotMetaReads;
      const r4 = await slotMod.inspectSlotsFreshness(["shared-tag"], t0, {
        bypassRequestCache: true,
      });
      assert.equal(r4.hasNewer, true);
      assert.equal(
        slotMetaReads,
        beforeBypass + 1,
        "bypassRequestCache: true must always read fresh metadata"
      );
    });
    fs.readFileSync = origReadFileSync;

    // 2. DenoKVStorage.getSlotMetadata() skips reading >16KB chunk keys
    const kvMap = new Map();
    let chunkGets = 0;
    const mockKv = {
      async get(key) {
        if (key[0] === "dinou_cache_chunk") chunkGets++;
        const k = JSON.stringify(key);
        return { value: kvMap.has(k) ? kvMap.get(k) : null };
      },
      async set(key, value) {
        kvMap.set(JSON.stringify(key), value);
      },
      async delete(key) {
        kvMap.delete(JSON.stringify(key));
      },
      atomic() {
        const ops = [];
        return {
          set(key, value) {
            ops.push(() => kvMap.set(JSON.stringify(key), value));
            return this;
          },
          delete(key) {
            ops.push(() => kvMap.delete(JSON.stringify(key)));
            return this;
          },
          async commit() {
            for (const op of ops) op();
            return { ok: true };
          },
        };
      },
      async *list({ prefix }) {
        for (const [k, value] of kvMap.entries()) {
          const parsed = JSON.parse(k);
          if (parsed[0] === prefix[0]) yield { key: parsed, value };
        }
      },
    };
    const denoStore = new storageMod.DenoKVStorage(mockKv, { hydrateFromDisk: false });
    await denoStore.set("slots/chunked-slot/slot.json", bigSlotPayload, {
      slotId: "chunked-slot",
      tags: ["chunked-tag"],
      revalidate: 3600,
      generatedAt: t0,
    });
    chunkGets = 0;
    const metaOnly = await denoStore.getSlotMetadata("chunked-slot");
    assert.equal(metaOnly?.exists, true);
    assert.equal(metaOnly?.metadata?.generatedAt, t0);
    assert.equal(
      chunkGets,
      0,
      `DenoKVStorage.getSlotMetadata() must not fetch chunk keys, got ${chunkGets}`
    );

    // 3. Parallel multi-slot inspection completes in ~1 RTT instead of N sequential RTTs
    class DelayedSlotMemoryStorage extends storageMod.MemoryStorage {
      constructor() {
        super({ hydrateFromDisk: false });
        this.inFlight = 0;
        this.maxConcurrent = 0;
      }
      async getSlotMetadata(slotId) {
        this.inFlight++;
        if (this.inFlight > this.maxConcurrent) this.maxConcurrent = this.inFlight;
        await new Promise((r) => setTimeout(r, 15));
        this.inFlight--;
        return super.getSlotMetadata(slotId);
      }
    }
    const parallelStore = new DelayedSlotMemoryStorage();
    for (const id of ["p1", "p2", "p3", "p4"]) {
      await parallelStore.set(`slots/${id}/slot.json`, "{}", {
        slotId: id,
        tags: ["par-all"],
        revalidate: 3600,
        generatedAt: t0,
      });
    }
    storageMod.setStorageAdapter(parallelStore);
    await reqCtxMod.requestStorage.run({ req: { path: "/par" } }, async () => {
      const res = await slotMod.inspectSlotsFreshness(["par-all"], t0);
      assert.deepEqual(res, { hasExpired: false, hasNewer: false });
    });
    assert.equal(
      parallelStore.maxConcurrent,
      4,
      `Expected all 4 slots to be inspected concurrently (maxConcurrent=4), got ${parallelStore.maxConcurrent}`
    );
  } finally {
    fs.readFileSync = origReadFileSync;
    if (prevAdapter) storageMod.setStorageAdapter(prevAdapter);
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevDinouDev === undefined) delete process.env.DINOU_DEV;
    else process.env.DINOU_DEV = prevDinouDev;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("OPT-4: FileSystemStorage.get()/has() minimal syscalls, directory EISDIR fallback, and zero duplicate FS miss lookups in handler", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDinouDev = process.env.DINOU_DEV;
  const origExists = fs.existsSync;
  const origStat = fs.statSync;
  const origRead = fs.readFileSync;
  const tmpDir = fs.mkdtempSync(path.join(rootDir, ".dinou", "tmp-opt4-fs-"));

  const storageMod = await import(dinouCoreUrl("storage-adapter.js"));
  const handlerMod = await import(dinouCoreUrl("handler.js"));
  const prevAdapter = storageMod.hasExplicitStorageAdapter()
    ? storageMod.getStorageAdapter()
    : null;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.DINOU_DEV;

    const store = new storageMod.FileSystemStorage(tmpDir);
    const now = Date.now();
    await store.set("route/index.html", "<!DOCTYPE html><html>ok</html>", {
      status: 200,
      generatedAt: now,
    });
    await store.set("route/layout.metadata.json", JSON.stringify({ generatedAt: now }));
    // Directory with dotted name to test EISDIR/EPERM -> index.html fallback
    const dottedDir = path.join(tmpDir, "v1.0");
    fs.mkdirSync(dottedDir, { recursive: true });
    fs.writeFileSync(path.join(dottedDir, "index.html"), "<html>dotted-dir</html>");

    let existsCalls = 0;
    let statCalls = 0;
    let readCalls = 0;
    fs.existsSync = (...a) => {
      existsCalls++;
      return origExists.apply(fs, a);
    };
    fs.statSync = (...a) => {
      statCalls++;
      return origStat.apply(fs, a);
    };
    fs.readFileSync = (...a) => {
      readCalls++;
      return origRead.apply(fs, a);
    };

    // 1. Metadata file: 1 readFileSync, 0 existsSync, 0 statSync
    const metaRes = await store.get("route/layout.metadata.json");
    assert.equal(metaRes?.metadata?.generatedAt, now);
    assert.equal(existsCalls, 0);
    assert.equal(statCalls, 0);
    assert.equal(readCalls, 1);

    // 2. HTML + companion metadata: 2 readFileSync, 0 existsSync, 0 statSync
    readCalls = 0;
    const htmlRes = await store.get("route/index.html");
    assert.equal(htmlRes?.content, "<!DOCTYPE html><html>ok</html>");
    assert.equal(htmlRes?.metadata?.generatedAt, now);
    assert.equal(existsCalls, 0);
    assert.equal(statCalls, 0);
    assert.equal(readCalls, 2);

    // 3. Cache miss: 1 readFileSync (ENOENT), 0 existsSync, 0 statSync
    readCalls = 0;
    const missRes = await store.get("route/nope.html");
    assert.equal(missRes, null);
    assert.equal(existsCalls, 0);
    assert.equal(statCalls, 0);
    assert.equal(readCalls, 1);

    // 4. Dotted directory key triggers EISDIR/EPERM fallback to index.html cleanly
    const dottedRes = await store.get("v1.0");
    assert.equal(dottedRes?.content, "<html>dotted-dir</html>");

    // 5. has() uses 1 statSync (0 existsSync) for regular files and misses
    existsCalls = 0;
    statCalls = 0;
    assert.equal(await store.has("route/index.html"), true);
    assert.equal(await store.has("route/nope.html"), false);
    assert.equal(existsCalls, 0);
    assert.equal(statCalls, 2);

    // 6. Handler on FileSystemStorage skips duplicate storage.get(cleanPath) when htmlKey misses
    fs.existsSync = origExists;
    fs.statSync = origStat;
    fs.readFileSync = origRead;

    const pprRel = "t-3d-cube/router-coherence/ppr-a";
    await store.set(`${pprRel}/shell.html`, "<!DOCTYPE html><html><head></head><body>shell</body></html>", {
      status: 200,
      generatedAt: now,
      ppr: true,
      holes: [],
    });
    for (const lk of ["", "t-3d-cube", "t-3d-cube/router-coherence"]) {
      await store.set(
        lk ? `${lk}/layout.metadata.json` : "layout.metadata.json",
        JSON.stringify({ generatedAt: now, layoutGeneratedAt: now, ownGeneratedAt: now, revalidate: 3600 })
      );
    }
    const fetchedKeys = [];
    const origStoreGet = store.get.bind(store);
    store.get = async (k) => {
      fetchedKeys.push(String(k));
      return origStoreGet(k);
    };
    storageMod.setStorageAdapter(store);

    const res = await handlerMod.handleRequest(
      new Request(`http://localhost:3000/${pprRel}`, { method: "HEAD" }),
      { runtime: "edge" }
    );
    assert.equal(res.status, 200);
    assert.ok(fetchedKeys.includes(`${pprRel}/index.html`));
    assert.ok(fetchedKeys.includes(`${pprRel}/shell.html`));
    assert.equal(
      fetchedKeys.includes(pprRel),
      false,
      `FileSystemStorage must skip duplicate storage.get("${pprRel}") after "${pprRel}/index.html" missed`
    );
  } finally {
    fs.existsSync = origExists;
    fs.statSync = origStat;
    fs.readFileSync = origRead;
    if (prevAdapter) storageMod.setStorageAdapter(prevAdapter);
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevDinouDev === undefined) delete process.env.DINOU_DEV;
    else process.env.DINOU_DEV = prevDinouDev;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("OPT-5: getDiscoveredLayouts() caches permanently in production, pre-serializes JSON in O(1), and preserves 1000ms DEV TTL", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDinouDev = process.env.DINOU_DEV;
  const prevGlobalDev = globalThis.__DINOU_DEV__;
  const prevGlobalLayouts = globalThis.__DINOU_LAYOUTS__;
  const prevGlobalVfs = globalThis.__DINOU_VFS__;
  const prevGlobalRouteMods = globalThis.__DINOU_ROUTE_MODULES__;
  const origCwd = process.cwd();
  const origDateNow = Date.now;
  const origStringify = JSON.stringify;

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-opt5-"));
  const tmpSrc = path.join(tmpRoot, "src");
  fs.mkdirSync(path.join(tmpSrc, "alpha"), { recursive: true });
  fs.writeFileSync(path.join(tmpSrc, "layout.tsx"), "export default ({children}) => children;", "utf8");
  fs.writeFileSync(path.join(tmpSrc, "alpha", "page.tsx"), "export default () => null;", "utf8");

  let fakeNow = origDateNow();
  Date.now = () => fakeNow;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.DINOU_DEV;
    delete globalThis.__DINOU_DEV__;
    delete globalThis.__DINOU_LAYOUTS__;
    delete globalThis.__DINOU_VFS__;
    delete globalThis.__DINOU_ROUTE_MODULES__;

    const handlerMod = await import(dinouCoreUrl("handler.js"));
    const pprMod = await import(dinouCoreUrl("ppr-runtime.js"));

    process.chdir(tmpRoot);
    handlerMod.clearDiscoveredLayoutsCache();

    // 1. Production permanent cache: advancing Date.now by +5000ms and adding a new layout does NOT re-walk src/
    const prodFirst = handlerMod.getDiscoveredLayouts();
    assert.ok(Array.isArray(prodFirst) && prodFirst.includes(""));

    fs.mkdirSync(path.join(tmpSrc, "beta"), { recursive: true });
    fs.writeFileSync(path.join(tmpSrc, "beta", "layout.tsx"), "export default ({children}) => children;", "utf8");
    fs.writeFileSync(path.join(tmpSrc, "beta", "page.tsx"), "export default () => null;", "utf8");
    fakeNow += 5000;

    const prodSecond = handlerMod.getDiscoveredLayouts();
    assert.equal(prodSecond, prodFirst, "Production getDiscoveredLayouts() must reuse the exact cached array permanently");
    assert.equal(prodSecond.includes("beta"), false);

    // 2. getDiscoveredLayoutsJson() serializes once and returns cached string with 0 subsequent JSON.stringify calls
    let stringifyCalls = 0;
    JSON.stringify = function (...args) {
      stringifyCalls++;
      return origStringify.apply(this, args);
    };
    const json1 = handlerMod.getDiscoveredLayoutsJson();
    const json2 = handlerMod.getDiscoveredLayoutsJson();
    const json3 = handlerMod.getDiscoveredLayoutsJson();
    assert.equal(stringifyCalls, 1, "Production getDiscoveredLayoutsJson() should call JSON.stringify only once");
    assert.equal(json1, json2);
    assert.equal(json2, json3);
    assert.equal(json1, origStringify(prodFirst), "Pre-serialized JSON must match JSON.stringify(layouts) byte-for-byte");

    // 3. Pre-populated globalThis.__DINOU_LAYOUTS__ (AOT / Bun / Deno / Cloudflare):
    //    caches serialized JSON across calls and invalidates automatically when array reference changes
    const aotLayoutsA = ["", "alpha", "@alpha=0"];
    globalThis.__DINOU_LAYOUTS__ = aotLayoutsA;
    stringifyCalls = 0;
    const aotJson1 = handlerMod.getDiscoveredLayoutsJson();
    const aotJson2 = handlerMod.getDiscoveredLayoutsJson();
    assert.equal(stringifyCalls, 1);
    assert.equal(aotJson1, aotJson2);
    assert.equal(aotJson1, origStringify(aotLayoutsA));

    const aotLayoutsB = ["", "alpha", "beta", "@beta=1"];
    globalThis.__DINOU_LAYOUTS__ = aotLayoutsB;
    const aotJson3 = handlerMod.getDiscoveredLayoutsJson();
    assert.equal(stringifyCalls, 2);
    assert.equal(aotJson3, origStringify(aotLayoutsB));

    // 4. handlePprResume uses getDiscoveredLayoutsJson() without re-stringifying and produces byte-for-byte identical script
    stringifyCalls = 0;
    const pprRes = await pprMod.handlePprResume({
      reqPath: "/alpha",
      queryObj: {},
      simReq: { method: "GET", path: "/alpha", query: {}, cookies: {}, headers: {} },
      bridge: { headers: new Headers(), cookies: [], _explicitStatusSet: false, statusCode: 200 },
      platformContext: {},
      rootContext: {},
      cachedItem: {
        content: "<!DOCTYPE html><html><head></head><body>ok</body></html>",
        metadata: { status: 200, ppr: true, holes: [] },
      },
      metadata: { status: 200, ppr: true, holes: [] },
      isDevelopment: false,
      getDiscoveredLayouts: () => {
        throw new Error("handlePprResume should prefer getDiscoveredLayoutsJson over getDiscoveredLayouts");
      },
      getDiscoveredLayoutsJson: handlerMod.getDiscoveredLayoutsJson,
      createRequestContext: () => ({}),
      copyCustomContextProperties: () => {},
    });
    const pprHtml = await pprRes.text();
    assert.ok(
      pprHtml.includes(`<script>window.__DINOU_LAYOUTS__=${origStringify(aotLayoutsB)};</script>`),
      "handlePprResume must embed byte-for-byte identical window.__DINOU_LAYOUTS__ bootstrap script"
    );

    // 5. DEV mode preserves 1000ms TTL discovery refresh & updates JSON
    JSON.stringify = origStringify;
    delete globalThis.__DINOU_LAYOUTS__;
    process.env.DINOU_DEV = "true";
    handlerMod.clearDiscoveredLayoutsCache();

    const devInitial = handlerMod.getDiscoveredLayouts();
    assert.ok(devInitial.includes("beta"), "DEV initial scan must see beta layout");

    fs.mkdirSync(path.join(tmpSrc, "gamma"), { recursive: true });
    fs.writeFileSync(path.join(tmpSrc, "gamma", "layout.tsx"), "export default ({children}) => children;", "utf8");
    fs.writeFileSync(path.join(tmpSrc, "gamma", "page.tsx"), "export default () => null;", "utf8");

    // Within 1000ms TTL: still cached
    fakeNow += 500;
    const devWithinTtl = handlerMod.getDiscoveredLayouts();
    assert.equal(devWithinTtl, devInitial);
    assert.equal(devWithinTtl.includes("gamma"), false);

    // After 1000ms TTL: refreshes and picks up gamma
    fakeNow += 600;
    const devRefreshed = handlerMod.getDiscoveredLayouts();
    assert.notEqual(devRefreshed, devInitial);
    assert.ok(devRefreshed.includes("gamma"), "DEV scan after 1000ms TTL must discover new gamma layout");
    assert.equal(handlerMod.getDiscoveredLayoutsJson(), origStringify(devRefreshed));
  } finally {
    Date.now = origDateNow;
    JSON.stringify = origStringify;
    process.chdir(origCwd);
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevDinouDev === undefined) delete process.env.DINOU_DEV;
    else process.env.DINOU_DEV = prevDinouDev;
    if (prevGlobalDev === undefined) delete globalThis.__DINOU_DEV__;
    else globalThis.__DINOU_DEV__ = prevGlobalDev;
    if (prevGlobalLayouts === undefined) delete globalThis.__DINOU_LAYOUTS__;
    else globalThis.__DINOU_LAYOUTS__ = prevGlobalLayouts;
    if (prevGlobalVfs === undefined) delete globalThis.__DINOU_VFS__;
    else globalThis.__DINOU_VFS__ = prevGlobalVfs;
    if (prevGlobalRouteMods === undefined) delete globalThis.__DINOU_ROUTE_MODULES__;
    else globalThis.__DINOU_ROUTE_MODULES__ = prevGlobalRouteMods;
    const handlerMod = await import(dinouCoreUrl("handler.js"));
    handlerMod.clearDiscoveredLayoutsCache();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("OPT-6: replaceHolesWithMap preserves referential equality and handlePprResume reuses pre-rendered 0-hole layout.rsc / page.rsc causally", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDinouDev = process.env.DINOU_DEV;
  const prevGlobalDev = globalThis.__DINOU_DEV__;

  const React = (await import("react")).default;
  const pprMod = await import(dinouCoreUrl("ppr-runtime.js"));
  const storageMod = await import(dinouCoreUrl("storage-adapter.js"));
  const handlerMod = await import(dinouCoreUrl("handler.js"));
  const prevAdapter = storageMod.getStorageAdapter();

  try {
    process.env.NODE_ENV = "production";
    delete process.env.DINOU_DEV;
    delete globalThis.__DINOU_DEV__;

    // 1. replaceHolesWithMap returns exact same reference when 0 holes match (including nested arrays & elements)
    const nestedLayoutTree = React.createElement(
      "div",
      { className: "layout", meta: { nested: [1, 2, 3] } },
      [
        React.createElement("header", { key: "h" }, "Header"),
        React.createElement("main", { key: "m" }, [
          React.createElement("span", { key: "s", "data-ppr-hole": "ppr-hole-99" }, "fallback"),
        ]),
      ]
    );
    assert.equal(
      pprMod.replaceHolesWithMap(nestedLayoutTree, new Map()),
      nestedLayoutTree,
      "Empty liveHolesMap must short-circuit and return exact same reference"
    );
    const unrelatedHoles = new Map([["ppr-hole-0", React.createElement("b", null, "live")]]);
    assert.equal(
      pprMod.replaceHolesWithMap(nestedLayoutTree, unrelatedHoles),
      nestedLayoutTree,
      "Unrelated hole IDs must preserve exact referential equality across arrays and elements"
    );
    const matchingHoles = new Map([["ppr-hole-99", React.createElement("strong", null, "resolved")]]);
    const spliced = pprMod.replaceHolesWithMap(nestedLayoutTree, matchingHoles);
    assert.notEqual(spliced, nestedLayoutTree);
    assert.equal(spliced.props.children[0], nestedLayoutTree.props.children[0], "Unchanged sibling preserves reference");
    const splicedMainChild = Array.isArray(spliced.props.children[1].props.children)
      ? spliced.props.children[1].props.children[0]
      : spliced.props.children[1].props.children;
    assert.equal(splicedMainChild.type, "strong");

    // 2. Zero-hole PPR route in handlePprResume reuses preloadedLayoutRsc & preloadedPageRsc without reading shell.*.json
    const store = new storageMod.MemoryStorage();
    const touchedKeys = [];
    const origGet = store.get.bind(store);
    store.get = async (k) => {
      touchedKeys.push(String(k));
      return origGet(k);
    };
    storageMod.setStorageAdapter(store);

    const sentinelLayoutRsc = '0:["$","div",null,{"children":"PRELOADED_STATIC_LAYOUT_RSC"}]\n';
    const sentinelPageRsc = '0:["$","section",null,{"children":"PRELOADED_ZERO_HOLE_PAGE_RSC"}]\n';
    const resZeroHole = await pprMod.handlePprResume({
      reqPath: "/t-3d-cube/router-coherence/ppr-a",
      queryObj: {},
      simReq: { method: "GET", path: "/t-3d-cube/router-coherence/ppr-a", query: {}, cookies: {}, headers: {} },
      bridge: { headers: new Headers(), cookies: [], _explicitStatusSet: false, statusCode: 200 },
      platformContext: {},
      rootContext: {},
      cachedItem: {
        content: '<!DOCTYPE html><html><head><script>window.__DINOU_LAYOUTS__=[""];</script></head><body><main>shell</main></body></html>',
        metadata: { status: 200, ppr: true, holes: [] },
      },
      metadata: { status: 200, ppr: true, holes: [] },
      isDevelopment: false,
      getDiscoveredLayouts: () => [""],
      getDiscoveredLayoutsJson: () => '[""]',
      createRequestContext: () => ({}),
      copyCustomContextProperties: () => {},
      preloadedLayoutRsc: sentinelLayoutRsc,
      preloadedPageRsc: sentinelPageRsc,
      activeLayoutChain: [{ cleanLayoutKey: "t-3d-cube/router-coherence", layoutPath: "src/t-3d-cube/router-coherence/layout.tsx", dParams: {} }],
    });
    const htmlZeroHole = await resZeroHole.text();
    assert.ok(htmlZeroHole.includes("PRELOADED_STATIC_LAYOUT_RSC"), "Must emit preloaded layout.rsc inline");
    assert.ok(htmlZeroHole.includes("PRELOADED_ZERO_HOLE_PAGE_RSC"), "Must emit preloaded page.rsc inline");
    assert.ok(htmlZeroHole.includes('window.__DINOU_PAGE_CACHE_MODE__="static"'));
    assert.equal(touchedKeys.length, 0, "Zero-hole fast path with preloaded RSCs must perform 0 storage reads");

    // 3. Causal SWR safety in handler.js: older shell.html buildId selects layout._old.rsc (not newer layout.rsc)
    const cleanRel = "t-3d-cube/router-coherence/ppr-a";
    const tOld = Date.now() - 5000;
    const tNew = Date.now() - 1000;
    const oldHtml = `<!DOCTYPE html><html><head><script>window.__DINOU_LAYOUTS__=[""];window.__DINOU_BUILD_ID__="${tOld}";</script></head><body><main>old-shell</main></body></html>`;
    await store.set(`${cleanRel}/shell.html`, oldHtml, {
      status: 200,
      generatedAt: tOld,
      pageGeneratedAt: tOld,
      ppr: true,
      holes: [],
    });
    await store.set(`${cleanRel}/metadata.json`, JSON.stringify({
      status: 200,
      generatedAt: tOld,
      pageGeneratedAt: tOld,
      ppr: true,
      holes: [],
    }));
    await store.set(`${cleanRel}/page.rsc`, '0:["$","p",null,{"children":"CAUSAL_PAGE_RSC"}]\n');
    for (const lk of ["", "t-3d-cube", "t-3d-cube/router-coherence"]) {
      const gen = lk === "t-3d-cube/router-coherence" ? tNew : tOld;
      await store.set(
        lk ? `${lk}/layout.metadata.json` : "layout.metadata.json",
        JSON.stringify({ generatedAt: gen, layoutGeneratedAt: gen, ownGeneratedAt: gen, revalidate: 3600 })
      );
    }
    await store.set("t-3d-cube/router-coherence/layout.rsc", '0:["$","div",null,{"children":"NEW_LAYOUT_T_NEW"}]\n');
    await store.set("t-3d-cube/router-coherence/layout._old.rsc", '0:["$","div",null,{"children":"OLD_LAYOUT_T_OLD"}]\n');

    touchedKeys.length = 0;
    const swrRes = await handlerMod.handleRequest(
      new Request(`http://localhost:3000/${cleanRel}`),
      { runtime: "edge" }
    );
    const swrHtml = await swrRes.text();
    assert.equal(swrRes.status, 200);
    assert.ok(swrHtml.includes("OLD_LAYOUT_T_OLD"), "Causal SWR snapshot must emit layout._old.rsc matching shell.html buildId");
    assert.equal(swrHtml.includes("NEW_LAYOUT_T_NEW"), false, "Must NOT mix newer T_new layout.rsc into older T_old shell.html");
    assert.ok(swrHtml.includes("CAUSAL_PAGE_RSC"));
    assert.equal(
      touchedKeys.some((k) => k.endsWith("shell.page.json") || k.endsWith("shell.layout.json")),
      false,
      "0-hole PPR route with valid page.rsc + layout.rsc should skip shell.*.json reads"
    );
  } finally {
    if (prevAdapter) storageMod.setStorageAdapter(prevAdapter);
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevDinouDev === undefined) delete process.env.DINOU_DEV;
    else process.env.DINOU_DEV = prevDinouDev;
    if (prevGlobalDev === undefined) delete globalThis.__DINOU_DEV__;
    else globalThis.__DINOU_DEV__ = prevGlobalDev;
  }
});

test("OPT-7: _DinouPageSlot memoizes client ref with manifest invalidation, and route-match/active-layout LRU caches enforce 1000-entry cap & zero mutation leaks", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDinouDev = process.env.DINOU_DEV;
  const prevGlobalDev = globalThis.__DINOU_DEV__;
  const prevManifest = globalThis.__DINOU_CLIENT_MANIFEST__;
  const prevEdgeRenderer = globalThis.__DINOU_EDGE_RENDERER__;

  const jsxMod = await import(dinouCoreUrl("get-jsx.js"));
  const routeMod = await import(routeModUrl);
  const layoutFnMod = await import(layoutFnUrl);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-opt7-"));
  const tmpSrc = path.join(tmpRoot, "routes");
  fs.mkdirSync(path.join(tmpSrc, "items", "[...slug]"), { recursive: true });
  fs.writeFileSync(path.join(tmpSrc, "layout.tsx"), "export default ({children}) => children;", "utf8");
  fs.writeFileSync(path.join(tmpSrc, "items", "layout.tsx"), "export default ({children}) => children;", "utf8");
  fs.writeFileSync(path.join(tmpSrc, "items", "[...slug]", "page.tsx"), "export default () => null;", "utf8");

  try {
    process.env.NODE_ENV = "production";
    delete process.env.DINOU_DEV;
    delete globalThis.__DINOU_DEV__;

    // 1. _DinouPageSlot client reference memoization + manifest invalidation
    let regCalls = 0;
    globalThis.__DINOU_EDGE_RENDERER__ = {
      registerClientReference(_fn, fileUrl, exportName) {
        regCalls++;
        return {
          $$typeof: Symbol.for("react.client.reference"),
          $$id: `${fileUrl}#${exportName}`,
        };
      },
    };
    globalThis.__DINOU_CLIENT_MANIFEST__ = {
      "file:///manifest-a/dinou/core/slot.js#DinouPageSlot": {
        id: "slot-a",
        chunks: ["main.js"],
        name: "DinouPageSlot",
      },
    };
    jsxMod.clearDinouPageSlotCache();

    const el1 = jsxMod.createDinouPageSlotElement();
    const el2 = jsxMod.createDinouPageSlotElement();
    assert.equal(regCalls, 1, "registerClientReference must run only once while manifest reference is unchanged");
    assert.equal(el1.type, el2.type);
    assert.equal(el1.type.$$id, "file:///manifest-a/dinou/core/slot.js#DinouPageSlot");

    // Replacing globalThis.__DINOU_CLIENT_MANIFEST__ invalidates cache automatically
    globalThis.__DINOU_CLIENT_MANIFEST__ = {
      "file:///manifest-b/dinou/core/slot.js#DinouPageSlot": {
        id: "slot-b",
        chunks: ["main.js"],
        name: "DinouPageSlot",
      },
    };
    const el3 = jsxMod.createDinouPageSlotElement();
    assert.equal(regCalls, 2);
    assert.equal(el3.type.$$id, "file:///manifest-b/dinou/core/slot.js#DinouPageSlot");

    // 2. getFilePathAndDynamicParams production LRU cache: cloning & isFound preservation
    routeMod.clearRouteMatchCache();
    layoutFnMod.clearActiveLayoutChainCache();

    const found1 = { value: false };
    const match1 = routeMod.getFilePathAndDynamicParams(
      ["items", "books", "sci-fi"],
      {},
      tmpSrc,
      "page",
      true,
      true,
      undefined,
      0,
      {},
      false,
      [],
      found1
    );
    assert.equal(found1.value, true);
    assert.deepEqual(match1[1].slug, ["books", "sci-fi"]);
    // Mutate returned array & catch-all param array aggressively
    match1[1].slug.push("MUTATED");
    match1[1].injected = "bad";
    match1.reverse();

    const found2 = { value: false };
    const match2 = routeMod.getFilePathAndDynamicParams(
      ["items", "books", "sci-fi"],
      {},
      tmpSrc,
      "page",
      true,
      true,
      undefined,
      0,
      {},
      false,
      [],
      found2
    );
    assert.equal(found2.value, true, "Cached route hit must faithfully set isFound.value = true");
    assert.deepEqual(match2[1].slug, ["books", "sci-fi"], "Catch-all param array must be cloned per call");
    assert.equal("injected" in match2[1], false, "dParams mutations must never leak across requests");

    // 3. getActiveLayoutChain production LRU cache: shallow-cloned entries prevent cross-request mutation leaks
    const chain1 = layoutFnMod.getActiveLayoutChain(["items", "books", "sci-fi"], {}, tmpSrc);
    assert.equal(chain1.length, 2);
    chain1[0]._prefetchedMeta = { generatedAt: 99999 };
    chain1[0]._hasPrefetchedMeta = true;
    chain1[0].effectivePpr = true;
    chain1[0].dParams.tampered = "yes";
    chain1.reverse();

    const chain2 = layoutFnMod.getActiveLayoutChain(["items", "books", "sci-fi"], {}, tmpSrc);
    assert.equal(chain2.length, 2);
    assert.equal(chain2[0].cleanLayoutKey, "items", "Reversing previous chain must not reverse cached order");
    assert.equal(chain2[0]._prefetchedMeta, undefined, "Request-scoped entry mutations must not bleed across requests");
    assert.equal(chain2[0].effectivePpr, undefined);
    assert.equal("tampered" in chain2[0].dParams, false);

    // 4. Bounded LRU cap (MAX_ENTRIES = 1000) prevents unbounded memory growth on dynamic URLs
    routeMod.clearRouteMatchCache();
    layoutFnMod.clearActiveLayoutChainCache();
    for (let i = 0; i < 1250; i++) {
      routeMod.getFilePathAndDynamicParams(["items", `id-${i}`], {}, tmpSrc, "page");
      layoutFnMod.getActiveLayoutChain(["items", `id-${i}`], {}, tmpSrc);
    }
    assert.equal(routeMod.getRouteMatchCacheSize(), 1000, "routeMatchCache must be hard-capped at 1000 entries");
    assert.equal(
      layoutFnMod.getActiveLayoutChainCacheSize(),
      1000,
      "activeLayoutChainCache must be hard-capped at 1000 entries"
    );

    // 5. DEV mode bypasses both route-match and active-layout-chain caches so new routes are seen immediately
    process.env.DINOU_DEV = "true";
    const devBefore = routeMod.getFilePathAndDynamicParams(["fresh-dev-route"], {}, tmpSrc, "page");
    assert.equal(devBefore.length, 0);
    fs.mkdirSync(path.join(tmpSrc, "fresh-dev-route"), { recursive: true });
    fs.writeFileSync(path.join(tmpSrc, "fresh-dev-route", "page.tsx"), "export default () => null;", "utf8");
    const devAfter = routeMod.getFilePathAndDynamicParams(["fresh-dev-route"], {}, tmpSrc, "page");
    assert.ok(devAfter[0] && devAfter[0].endsWith("page.tsx"), "DEV mode must bypass route cache and see new files immediately");
  } finally {
    jsxMod.clearDinouPageSlotCache();
    routeMod.clearRouteMatchCache();
    layoutFnMod.clearActiveLayoutChainCache();
    if (prevManifest === undefined) delete globalThis.__DINOU_CLIENT_MANIFEST__;
    else globalThis.__DINOU_CLIENT_MANIFEST__ = prevManifest;
    if (prevEdgeRenderer === undefined) delete globalThis.__DINOU_EDGE_RENDERER__;
    else globalThis.__DINOU_EDGE_RENDERER__ = prevEdgeRenderer;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevDinouDev === undefined) delete process.env.DINOU_DEV;
    else process.env.DINOU_DEV = prevDinouDev;
    if (prevGlobalDev === undefined) delete globalThis.__DINOU_DEV__;
    else globalThis.__DINOU_DEV__ = prevGlobalDev;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("OPT-8: O(1) inverted tag index on FileSystemStorage & MemoryStorage, zero-get CloudflareKV listKeysWithMetadata, and parallel revalidateTag scan", async () => {
  const storageMod = await import(dinouCoreUrl("storage-adapter.js"));
  const revalMod = await import(dinouCoreUrl("cache-revalidate.js"));
  const {
    FileSystemStorage,
    MemoryStorage,
    CloudflareKVStorage,
    StorageAdapter,
    getStorageAdapter,
    setStorageAdapter,
  } = storageMod;

  const prevStorage = getStorageAdapter();
  const origReaddir = fs.readdirSync;
  const origReadFile = fs.readFileSync;
  const tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-opt8-"));

  try {
    // 1. FileSystemStorage: O(1) inverted tag index across slots, layouts & pages,
    //    preserving exact onlyRefreshSlots semantics & incremental set()/delete() updates
    const fsStore = new FileSystemStorage(tmpDist);
    const now = Date.now();
    await fsStore.set("slots/id-only-slot/slot.json", '"v1"', {
      slotId: "id-only-slot",
      tags: [],
      generatedAt: now,
    });
    await fsStore.set("slots/tagged-slot/slot.json", '"v1"', {
      slotId: "tagged-slot",
      tags: ["shared-tag"],
      generatedAt: now,
    });
    await fsStore.set(
      "section/layout.metadata.json",
      JSON.stringify({
        generatedAt: now,
        tags: ["layout-route-tag", "dual-tag"],
        slotTags: ["shared-tag", "dual-tag"],
      })
    );
    await fsStore.set(
      "section/page-a/metadata.json",
      JSON.stringify({
        generatedAt: now,
        tags: ["page-route-tag"],
        slotTags: ["id-only-slot", "shared-tag"],
      })
    );

    // Warm build
    const warm1 = fsStore.findTargetsByTag("id-only-slot");
    assert.ok(warm1.slotKeys.has("slots/id-only-slot/slot.json"));
    assert.ok(warm1.slotKeys.has("slots/id-only-slot/slot.metadata.json"));
    assert.deepEqual(warm1.pagePaths.get("/section/page-a"), { onlyRefreshSlots: true });

    // Subsequent queries perform 0 readdirSync and 0 readFileSync
    let readdirCalls = 0;
    let readFileCalls = 0;
    fs.readdirSync = function (...args) {
      readdirCalls++;
      return origReaddir.apply(this, args);
    };
    fs.readFileSync = function (...args) {
      readFileCalls++;
      return origReadFile.apply(this, args);
    };

    const dualRes = fsStore.findTargetsByTag("dual-tag");
    assert.deepEqual(
      dualRes.layoutPaths.get("/section"),
      { onlyRefreshSlots: false },
      "When a layout carries BOTH route tag and slotTag, onlyRefreshSlots must be false"
    );
    const sharedRes = fsStore.findTargetsByTag("shared-tag");
    assert.ok(sharedRes.slotKeys.has("slots/tagged-slot/slot.json"));
    assert.deepEqual(sharedRes.layoutPaths.get("/section"), { onlyRefreshSlots: true });
    assert.deepEqual(sharedRes.pagePaths.get("/section/page-a"), { onlyRefreshSlots: true });
    assert.equal(readdirCalls, 0, "Warm FileSystemStorage.findTargetsByTag must perform 0 readdirSync");
    assert.equal(readFileCalls, 0, "Warm FileSystemStorage.findTargetsByTag must perform 0 readFileSync");

    // Incremental set() updates index without rebuilding from disk
    await fsStore.set("section/page-b/index.html", "<html>b</html>", {
      generatedAt: now,
      tags: ["new-incremental-tag"],
    });
    const incRes = fsStore.findTargetsByTag("new-incremental-tag");
    assert.deepEqual(incRes.pagePaths.get("/section/page-b"), { onlyRefreshSlots: false });
    assert.equal(readdirCalls, 0, "Incremental set() must update inverted tag index without full re-walk");

    // Incremental delete() removes target cleanly without rebuilding from disk
    await fsStore.delete("slots/id-only-slot/slot.json");
    const afterDel = fsStore.findTargetsByTag("id-only-slot");
    assert.equal(afterDel.slotKeys.size, 0);
    assert.equal(readdirCalls, 0, "Incremental delete() must update inverted tag index without full re-walk");

    fs.readdirSync = origReaddir;
    fs.readFileSync = origReadFile;

    // 2. MemoryStorage: O(1) findTargetsByTag (0 storage.get() calls on revalidateTag)
    const memStore = new MemoryStorage({ hydrateFromDisk: false });
    await memStore.set("slots/mem-slot/slot.json", '"v1"', { slotId: "mem-slot", tags: ["m-tag"], generatedAt: now });
    await memStore.set("mem-page/metadata.json", JSON.stringify({ generatedAt: now, tags: ["p-tag"], slotTags: ["m-tag"] }));
    setStorageAdapter(memStore);

    let memGets = 0;
    const origMemGet = memStore.get.bind(memStore);
    memStore.get = async (...a) => {
      memGets++;
      return origMemGet(...a);
    };
    await revalMod.revalidateTag("nonexistent-mem-tag");
    assert.equal(memGets, 0, "MemoryStorage revalidateTag must use O(1) inverted index with 0 storage.get() calls");

    const memMatch = memStore.findTargetsByTag("m-tag");
    assert.ok(memMatch.slotKeys.has("slots/mem-slot/slot.json"));
    assert.deepEqual(memMatch.pagePaths.get("/mem-page"), { onlyRefreshSlots: true });
    await memStore.delete("slots/mem-slot/slot.json");
    assert.equal(memStore.findTargetsByTag("m-tag").slotKeys.size, 0);

    // 3. CloudflareKVStorage: listKeysWithMetadata() avoids per-key kv.get() for <=1024B inline metadata
    //    and fetches ONLY >1024B overflow metadata keys
    const kvMap = new Map();
    let kvGets = 0;
    let kvLists = 0;
    const mockKv = {
      async put(k, v, opts) {
        kvMap.set(k, { value: v, metadata: opts?.metadata || null });
      },
      async get(k) {
        kvGets++;
        return kvMap.get(k)?.value ?? null;
      },
      async getWithMetadata(k) {
        kvGets++;
        const hit = kvMap.get(k);
        return hit ? { value: hit.value, metadata: hit.metadata } : { value: null, metadata: null };
      },
      async delete(k) {
        kvMap.delete(k);
      },
      async list({ prefix } = {}) {
        kvLists++;
        const keys = [];
        for (const [name, entry] of kvMap.entries()) {
          if (!prefix || name.startsWith(prefix)) {
            keys.push({ name, metadata: entry.metadata });
          }
        }
        return { keys, list_complete: true };
      },
    };
    const cfStore = new CloudflareKVStorage(mockKv);
    cfStore.hydrateFromDisk = false;
    for (let i = 0; i < 25; i++) {
      await cfStore.set(`cf-p-${i}/index.html`, "<html>ok</html>", { generatedAt: now, tags: [`cf-t-${i}`] });
    }
    const bigTags = Array.from({ length: 80 }, (_, j) => `overflow-tag-${j}-padding-xxxxxxxxxxxx`);
    await cfStore.set("cf-overflow/index.html", "<html>big</html>", { generatedAt: now, tags: bigTags });
    await cfStore.set("slots/cf-inline-slot/slot.json", '"v1"', {
      slotId: "cf-inline-slot",
      tags: ["cf-inline-tag"],
      generatedAt: now,
    });

    setStorageAdapter(cfStore);
    kvGets = 0;
    kvLists = 0;
    await revalMod.revalidateTag("cf-miss-tag");
    assert.equal(kvLists, 1);
    assert.equal(
      kvGets,
      1,
      `CloudflareKVStorage revalidateTag should fetch ONLY the 1 overflow metadata.json (skipping 26 inline keys), got ${kvGets}`
    );

    // Inline match still deletes slot accurately via listKeysWithMetadata
    kvGets = 0;
    await revalMod.revalidateTag("cf-inline-tag");
    assert.equal(await cfStore.get("slots/cf-inline-slot/slot.json"), null);

    // 4. Generic remote adapter (Redis/DenoKV): runs metadata fetches in bounded parallel concurrency
    let inflight = 0;
    let maxInflight = 0;
    class ConcurrentRemoteAdapter extends StorageAdapter {
      constructor() {
        super();
        this.hydrateFromDisk = false;
        this.map = new Map();
      }
      async get(k) {
        inflight++;
        if (inflight > maxInflight) maxInflight = inflight;
        await new Promise((r) => setTimeout(r, 15));
        inflight--;
        return this.map.get(k) || null;
      }
      async set(k, content, metadata = null) {
        this.map.set(k, { content, metadata });
      }
      async has(k) { return this.map.has(k); }
      async delete(k) { this.map.delete(k); }
      async keys() { return Array.from(this.map.keys()); }
    }
    const remote = new ConcurrentRemoteAdapter();
    for (let i = 0; i < 24; i++) {
      await remote.set(`rem-${i}/metadata.json`, JSON.stringify({ generatedAt: now, tags: [`rt-${i}`] }));
    }
    setStorageAdapter(remote);
    await revalMod.revalidateTag("rem-miss-tag");
    assert.ok(
      maxInflight >= 8 && maxInflight <= 16,
      `Expected bounded parallel scan concurrency in [8..16], observed maxInflight=${maxInflight}`
    );
  } finally {
    fs.readdirSync = origReaddir;
    fs.readFileSync = origReadFile;
    if (prevStorage) setStorageAdapter(prevStorage);
    fs.rmSync(tmpDist, { recursive: true, force: true });
  }
});
