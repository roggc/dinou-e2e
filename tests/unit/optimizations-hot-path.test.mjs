import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();
const vfsUrl = pathToFileURL(path.resolve(rootDir, "dinou/core/vfs.js")).href;
const layoutFnUrl = pathToFileURL(
  path.resolve(rootDir, "dinou/core/layout-functions.js")
).href;
const routeModUrl = pathToFileURL(
  path.resolve(rootDir, "dinou/core/get-file-path-and-dynamic-params.js")
).href;

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

  const storageMod = await import(
    pathToFileURL(path.resolve(rootDir, "dinou/core/storage-adapter.js")).href
  );
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
    const handlerMod = await import(
      pathToFileURL(path.resolve(rootDir, "dinou/core/handler.js")).href
    );
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

  const storageMod = await import(
    pathToFileURL(path.resolve(rootDir, "dinou/core/storage-adapter.js")).href
  );
  const slotMod = await import(
    pathToFileURL(path.resolve(rootDir, "dinou/core/cache-slot.js")).href
  );
  const reqCtxMod = await import(
    pathToFileURL(path.resolve(rootDir, "dinou/core/request-context.js")).href
  );
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

  const storageMod = await import(
    pathToFileURL(path.resolve(rootDir, "dinou/core/storage-adapter.js")).href
  );
  const handlerMod = await import(
    pathToFileURL(path.resolve(rootDir, "dinou/core/handler.js")).href
  );
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
