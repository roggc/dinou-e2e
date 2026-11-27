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
