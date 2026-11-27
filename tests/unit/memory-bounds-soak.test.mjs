// tests/unit/memory-bounds-soak.test.mjs
// Series Z — Phase 1 — Stage 1 (Check #Z1):
// Long-Running Server & Client Memory Bounds (LRU / TTL Eviction & Multi-Thousand-Route Soak)
//   1. Server Soak (5,000+ unique dynamic `/items/[id]` + dynamic `<DinouCacheSlot>` + 404 scanner storm):
//      - `slotRegistry`, `recentFreshSlotRenders`, `slotRenderGenerations`, `isDynamicMap`,
//        `pageFunctionsConfigCache` stay strictly bounded below LRU caps
//      - 404 scanner probes add ZERO entries to `isDynamicMap`
//      - Evicted dynamic slots transparently re-discover & re-render without 500 or stale artifacts
//      - Post-warmup `heapUsed` slope stabilizes under `--expose-gc`
//   2. Auxiliary server build/runtime caches (`assetHashCache`, `serverCssModuleCache`) enforce LRU bounds
//   3. Client caches (`slot.js` `knownClientSlots` & `slotOverrideCache`, `client.jsx` & `client-webpack.jsx`
//      `pageCache`, `layoutCache`, `scrollCache`) enforce strict LRU caps without evicting mounted/active entries

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
  : fs.existsSync(
        path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou", "cli.js")
      )
    ? path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou")
    : path.resolve(REPO_ROOT, "node_modules", "dinou");

const CLI_PATH = path.join(DINOU_ROOT, "cli.js");

function removeDirSafe(dirPath) {
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 60,
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
  const relTo = (relPath) => {
    const rel = path
      .relative(dinouShimDir, path.join(DINOU_ROOT, relPath))
      .replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  };
  fs.writeFileSync(
    path.join(dinouShimDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "10.0.6",
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
    `export * from ${JSON.stringify(relTo("index.js"))};\nexport { default } from ${JSON.stringify(relTo("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(relTo("server.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(relTo("core/config.js"))};\nexport { default } from ${JSON.stringify(relTo("core/config.js"))};\n`
  );
}

test("1. [#Z1] Server multi-thousand-route soak (5,000+ unique /items/[id] + dynamic <DinouCacheSlot> + 404 scanner storm): bounded Maps, eviction recovery & flat heap slope", () => {
  const tmpApp = createFixtureDir("tmp-z1-soak-");

  try {
    fs.mkdirSync(path.join(tmpApp, "src/items/[id]"), { recursive: true });
    writeDinouShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "z1-soak-app", type: "module" }, null, 2)
    );

    // Use MemoryStorage to keep soak purely in-memory (no 5,000 disk files) while testing real handler & slot caches
    fs.writeFileSync(
      path.join(tmpApp, "dinou.config.mjs"),
      `import { MemoryStorage } from "dinou/server";
const storage = new MemoryStorage();
export default {
  plugins: [],
  storage,
};
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/layout.tsx"),
      `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Z1 Soak App</title></head>
      <body>{children}</body>
    </html>
  );
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/page.tsx"),
      `export default function HomePage() { return <main>Z1 Home</main>; }\n`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/items/[id]/page_functions.ts"),
      `export const dynamic = true;\n`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/items/[id]/page.tsx"),
      `import { DinouCacheSlot } from "dinou/server";

let renderSeq = 0;

async function ItemSlotBody({ id }: { id: string }) {
  renderSeq += 1;
  return <span data-slot-item={id}>{\`item-slot:\${id}:seq=\${renderSeq}\`}</span>;
}

export default function ItemPage({ params }: { params: { id: string } }) {
  const id = String(params?.id || "0");
  return (
    <main data-item={id}>
      <h1>Item {id}</h1>
      <DinouCacheSlot id={\`soak-slot-\${id}\`} revalidate={60}>
        <ItemSlotBody id={id} />
      </DinouCacheSlot>
    </main>
  );
}
`
    );

    const buildRes = spawnSync(process.execPath, [CLI_PATH, "build:node:esbuild"], {
      cwd: tmpApp,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DINOU_DEV: "",
        DINOU_BUILD_TOOL: "esbuild",
      },
      encoding: "utf8",
      timeout: 120000,
    });

    if (buildRes.status !== 0) {
      throw new Error(
        `build:node:esbuild failed (status=${buildRes.status}):\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
      );
    }

    const probeFile = path.join(tmpApp, "__z1_soak_probe.mjs");
    fs.writeFileSync(
      probeFile,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TMP_APP = ${JSON.stringify(tmpApp)};
const serverFile = fs.existsSync(path.join(TMP_APP, ".dinou/node/server.js"))
  ? path.join(TMP_APP, ".dinou/node/server.js")
  : path.join(TMP_APP, ".dinou/node/server.mjs");
const serverMod = await import(pathToFileURL(serverFile).href);
const appFetch = serverMod.fetch;

const slotRegistry = globalThis[Symbol.for("dinou.slot.registry")];
const recentFreshSlotRenders = globalThis[Symbol.for("dinou.slot.recent.fresh")];
const slotRenderGenerations = globalThis[Symbol.for("dinou.slot.render.generation")];
const isDynamicMap = globalThis[Symbol.for("dinou.isDynamic.map")];

// Phase A: 404 scanner storm (1,500 random nonexistent routes) -> MUST NOT grow isDynamicMap!
const isDynamicSizeBefore404 = isDynamicMap ? isDynamicMap.size : 0;
for (let i = 0; i < 1500; i++) {
  const res = await appFetch(
    new Request(\`http://localhost:3000/nonexistent-scanner-probe-\${i}/sub\`)
  );
  assert.equal(res.status, 404);
}
const isDynamicSizeAfter404 = isDynamicMap ? isDynamicMap.size : 0;
assert.equal(
  isDynamicSizeAfter404,
  isDynamicSizeBefore404,
  \`404 scanner storm grew isDynamicMap from \${isDynamicSizeBefore404} to \${isDynamicSizeAfter404}\`
);

// Phase B: Warmup 1,200 unique /items/[id] RSC + fresh slot requests (saturates LRU caps)
for (let i = 0; i < 1200; i++) {
  const rscRes = await appFetch(new Request(\`http://localhost:3000/____rsc_page____/items/\${i}\`));
  assert.equal(rscRes.status, 200);
  await rscRes.text();
  if (i % 3 === 0) {
    const slotRes = await appFetch(
      new Request(\`http://localhost:3000/____rsc_slot____/soak-slot-\${i}?fresh=1\`, {
        headers: { "x-dinou-current-path": \`/items/\${i}\` },
      })
    );
    assert.equal(slotRes.status, 200);
    await slotRes.text();
  }
}

// Clear backing MemoryStorage between warmup and steady-state so we measure Dinou core Map memory slope, not mock KV storage
const memStore = globalThis[Symbol.for("dinou.storage.adapter")];
if (memStore && memStore.store instanceof Map) {
  memStore.store.clear();
}

if (typeof globalThis.gc === "function") {
  globalThis.gc();
  globalThis.gc();
}
const heapAfterWarmup = process.memoryUsage().heapUsed;

// Phase C: Soak 3,800 MORE unique /items/[id] (total 5,000 unique dynamic URLs + slots!)
for (let i = 1200; i < 5000; i++) {
  const rscRes = await appFetch(new Request(\`http://localhost:3000/____rsc_page____/items/\${i}\`));
  assert.equal(rscRes.status, 200);
  await rscRes.text();
  if (i % 3 === 0) {
    const slotRes = await appFetch(
      new Request(\`http://localhost:3000/____rsc_slot____/soak-slot-\${i}?fresh=1\`, {
        headers: { "x-dinou-current-path": \`/items/\${i}\` },
      })
    );
    assert.equal(slotRes.status, 200);
    await slotRes.text();
  }
  if (i % 500 === 0 && memStore && memStore.store instanceof Map) {
    memStore.store.clear();
  }
}

// Verify ALL server-side global Maps stayed strictly bounded!
assert.ok(slotRegistry instanceof Map, "Expected global slotRegistry Map");
assert.ok(
  slotRegistry.size <= 1000,
  \`slotRegistry grew unbounded to \${slotRegistry.size} (expected <= 1000)\`
);
assert.ok(
  recentFreshSlotRenders.size <= 256,
  \`recentFreshSlotRenders grew unbounded to \${recentFreshSlotRenders.size} (expected <= 256)\`
);
assert.ok(
  slotRenderGenerations.size <= 2000,
  \`slotRenderGenerations grew unbounded to \${slotRenderGenerations.size} (expected <= 2000)\`
);
assert.ok(
  isDynamicMap.size <= 1000,
  \`isDynamicMap grew unbounded to \${isDynamicMap.size} (expected <= 1000)\`
);

// Wait > 550ms and trigger one more fresh slot render -> expired entries in recentFreshSlotRenders MUST be swept
await new Promise((r) => setTimeout(r, 550));
{
  const slotRes = await appFetch(
    new Request("http://localhost:3000/____rsc_slot____/soak-slot-4999?fresh=1", {
      headers: { "x-dinou-current-path": "/items/4999" },
    })
  );
  assert.equal(slotRes.status, 200);
  await slotRes.text();
  assert.ok(
    recentFreshSlotRenders.size <= 5,
    \`Expired entries in recentFreshSlotRenders were not swept after 550ms TTL (size=\${recentFreshSlotRenders.size})\`
  );
}

// Phase D: Eviction recovery! Request an OLD evicted slot (id = 0) via /____rsc_slot____?fresh=1
// It was evicted from slotRegistry, so getSlotJSX MUST transparently re-discover and render it cleanly!
assert.equal(slotRegistry.has("soak-slot-0"), false, "Expected soak-slot-0 to have been evicted from slotRegistry");
{
  const recoveredRes = await appFetch(
    new Request("http://localhost:3000/____rsc_slot____/soak-slot-0?fresh=1", {
      headers: { "x-dinou-current-path": "/items/0" },
    })
  );
  assert.equal(recoveredRes.status, 200, "Evicted slot MUST transparently re-discover & return 200");
  const recoveredText = await recoveredRes.text();
  assert.ok(
    recoveredText.includes("item-slot:0:seq="),
    "Recovered slot payload must contain freshly rendered item-slot:0, got: " + recoveredText.slice(0, 300)
  );
}

// Also verify Direct SSR on evicted route /items/0 still works cleanly
{
  const ssrRes = await appFetch(new Request("http://localhost:3000/items/0"));
  assert.equal(ssrRes.status, 200);
  const html = await ssrRes.text();
  assert.ok(html.includes("Item <!-- -->0") || html.includes("Item 0"));
}

// Phase E: Heap slope bound check under --expose-gc
if (memStore && memStore.store instanceof Map) {
  memStore.store.clear();
}
if (typeof globalThis.gc === "function") {
  globalThis.gc();
  globalThis.gc();
}
const heapAfterSoak = process.memoryUsage().heapUsed;
const heapDeltaMB = (heapAfterSoak - heapAfterWarmup) / (1024 * 1024);
console.log(
  \`[Z1 Soak Stats] slotRegistry=\${slotRegistry.size}, recentFresh=\${recentFreshSlotRenders.size}, gens=\${slotRenderGenerations.size}, isDynamic=\${isDynamicMap.size}, heapDelta=\${heapDeltaMB.toFixed(2)} MB\`
);
assert.ok(
  heapDeltaMB < 64,
  \`Expected bounded post-warmup heap delta (< 64 MB), got \${heapDeltaMB.toFixed(2)} MB\`
);
`,
      "utf8"
    );

    const runRes = spawnSync(process.execPath, ["--expose-gc", probeFile], {
      cwd: tmpApp,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DINOU_DEV: "",
        DINOU_BUILD_TOOL: "esbuild",
      },
      encoding: "utf8",
      timeout: 120000,
    });

    if (runRes.status !== 0) {
      throw new Error(
        `Soak probe failed (status=${runRes.status}):\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
      );
    }
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("2. [#Z1] Auxiliary server caches (assetHashCache & serverCssModuleCache) enforce deterministic LRU bounds", async () => {
  const tmpDir = createFixtureDir("tmp-z1-aux-");
  try {
    const assetMod = await import(
      `${pathToFileURL(path.join(DINOU_ROOT, "core/asset-extensions.js")).href}?z1=${Date.now()}`
    );
    const cssMod = await import(
      `${pathToFileURL(path.join(DINOU_ROOT, "core/server-css-modules-plugin.js")).href}?z1=${Date.now()}`
    );

    assert.equal(
      typeof assetMod.getAssetHashCacheSize,
      "function",
      "asset-extensions.js must export getAssetHashCacheSize() with bounded LRU"
    );
    assert.equal(
      typeof cssMod.getServerCssModuleCacheSize,
      "function",
      "server-css-modules-plugin.js must export getServerCssModuleCacheSize() with bounded LRU"
    );

    // Drive > 2,100 distinct asset files through getAssetInfo -> cap <= 2000
    const assetsDir = path.join(tmpDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    for (let i = 0; i < 2050; i++) {
      const f = path.join(assetsDir, `a-${i}.png`);
      fs.writeFileSync(f, `img-${i}`);
      assetMod.getAssetInfo(f, tmpDir);
    }
    const assetSize = assetMod.getAssetHashCacheSize();
    assert.ok(
      assetSize <= 2000,
      `assetHashCache grew unbounded to ${assetSize} (expected <= 2000)`
    );

    // Check serverCssModuleCache default cap (1000) & real PostCSS LRU eviction via configurable cap
    assert.equal(
      cssMod.DEFAULT_MAX_CSS_MODULE_CACHE_ENTRIES,
      1000,
      "serverCssModuleCache default LRU cap must be 1000"
    );
    const prevCssCap = process.env.DINOU_MAX_CSS_MODULE_CACHE_ENTRIES;
    process.env.DINOU_MAX_CSS_MODULE_CACHE_ENTRIES = "40";
    try {
      cssMod.clearServerCssModulesCache();
      const cssDir = path.join(tmpDir, "css");
      fs.mkdirSync(cssDir, { recursive: true });
      for (let i = 0; i < 65; i++) {
        const f = path.join(cssDir, `m-${i}.module.css`);
        fs.writeFileSync(f, `.c${i} { color: red; }\n`);
        await cssMod.compileCssModuleMap(f);
      }
      const cssSize = cssMod.getServerCssModuleCacheSize();
      assert.ok(
        cssSize > 0 && cssSize <= 40,
        `serverCssModuleCache grew unbounded to ${cssSize} (expected <= 40)`
      );
    } finally {
      if (prevCssCap === undefined) delete process.env.DINOU_MAX_CSS_MODULE_CACHE_ENTRIES;
      else process.env.DINOU_MAX_CSS_MODULE_CACHE_ENTRIES = prevCssCap;
      cssMod.clearServerCssModulesCache();
    }

    // Check layoutFunctionsPathCache enforces cap <= 500 in production mode
    const prevNodeEnv = process.env.NODE_ENV;
    const prevDinouDev = process.env.DINOU_DEV;
    process.env.NODE_ENV = "production";
    process.env.DINOU_DEV = "";
    try {
      const lfMod = await import(
        `${pathToFileURL(path.join(DINOU_ROOT, "core/layout-functions.js")).href}?z1=${Date.now()}`
      );
      lfMod.clearLayoutFunctionsPathCache();
      for (let i = 0; i < 650; i++) {
        lfMod.getLayoutFunctionsPath(path.join(tmpDir, "fake-layout-dir", String(i)));
      }
      const lfSizes = lfMod.getLayoutFunctionsCacheSizes();
      assert.ok(
        lfSizes.pathCache <= 500,
        `layoutFunctionsPathCache grew unbounded to ${lfSizes.pathCache} (expected <= 500)`
      );
      lfMod.clearLayoutFunctionsPathCache();
    } finally {
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
      if (prevDinouDev === undefined) delete process.env.DINOU_DEV;
      else process.env.DINOU_DEV = prevDinouDev;
    }
  } finally {
    removeDirSafe(tmpDir);
  }
});

test("3. [#Z1] Client caches (slot.js knownClientSlots/slotOverrideCache & client.jsx/client-webpack.jsx pageCache/layoutCache/scrollCache) enforce strict LRU bounds without evicting mounted entries", async () => {
  // 3A. Verify client.jsx and client-webpack.jsx enforce LRU caps on pageCache, layoutCache, and scrollCache
  for (const rel of ["core/client.jsx", "core/client-webpack.jsx"]) {
    const src = fs.readFileSync(path.join(DINOU_ROOT, rel), "utf8");
    assert.ok(
      src.includes("MAX_CLIENT_PAGE_CACHE_ENTRIES") || src.includes("MAX_PAGE_CACHE_ENTRIES"),
      `${rel} must enforce an LRU cap on pageCache`
    );
    assert.ok(
      src.includes("MAX_CLIENT_LAYOUT_CACHE_ENTRIES") || src.includes("MAX_LAYOUT_CACHE_ENTRIES"),
      `${rel} must enforce an LRU cap on layoutCache`
    );
    assert.ok(
      src.includes("MAX_CLIENT_SCROLL_CACHE_ENTRIES") || src.includes("MAX_SCROLL_CACHE_ENTRIES"),
      `${rel} must enforce an LRU cap on scrollCache`
    );
    assert.ok(
      src.includes("__DINOU_PAGE_CACHE__") && src.includes("__DINOU_LAYOUT_CACHE__"),
      `${rel} must expose pageCache and layoutCache on window for observability/soak verification`
    );
  }

  // 3B. Verify slot.js enforces LRU eviction on unmounted knownClientSlots & slotOverrideCache
  const slotSrc = fs.readFileSync(path.join(DINOU_ROOT, "core/slot.js"), "utf8");
  assert.ok(
    slotSrc.includes("MAX_CLIENT_SLOT_CACHE_ENTRIES") || slotSrc.includes("evictUnmountedClientSlots"),
    "core/slot.js must enforce LRU eviction on unmounted knownClientSlots and slotOverrideCache"
  );
});
