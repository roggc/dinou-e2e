// scripts/verify-api-reference-fixes-3-ci.mjs
// Verifies Dinou v9.4.0 API Reference Batch 3 Fixes (x-api-reference-fixes-3.md):
// 1. JS syntax check & source contracts in storage-adapter.js, cache-slot.js, cache-revalidate.js & server.d.ts
// 2. CloudflareKVStorage cursor pagination + has() folder fallback & DenoKVStorage trailing-slash normalization
// 3. <DinouCacheSlot> tag+tags deduplication, revalidate < 1 no-cache consistency, revalidate: false, & cold-start revalidateTag(slotId) (keys(), non-keys() adapter, Cloudflare ASSETS & readDist2Fallback)
// 4. Tri-bundler (esbuild, rollup, webpack) integration: cold revalidatePath() segment layout detection & cold-pod revalidateTag() on id-only + tag+tags slots

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

const guardedManifestRelPaths = [
  ".dinou/dist1/manifest.json",
  ".dinou/dist1/react-client-manifest.json",
  ".dinou/dist1/react-ssr-manifest.json",
  ".dinou/dist1/server-functions-manifest.json",
  ".dinou/node-dev/manifest.json",
  ".dinou/node-dev/react-client-manifest.json",
  ".dinou/node-dev/react-ssr-manifest.json",
  ".dinou/node-dev/server-functions-manifest.json",
];
const manifestSnapshotBefore = new Map(
  guardedManifestRelPaths.map((rel) => {
    const abs = path.join(projectRoot, rel);
    return [rel, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null];
  })
);

const dinouRootCandidates = [
  path.resolve(projectRoot, "dinou"),
  path.resolve(projectRoot, "node_modules/dinou/dinou"),
  path.resolve(projectRoot, "node_modules/dinou"),
];
const DINOU_ROOT =
  dinouRootCandidates.find((dir) => fs.existsSync(path.join(dir, "cli.js"))) ??
  dinouRootCandidates[0];
const CLI_PATH = path.join(DINOU_ROOT, "cli.js");

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

function writeDinouShim(appDir) {
  const dinouShimDir = path.join(appDir, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouIndexPath = path.join(DINOU_ROOT, "index.js").replace(/\\/g, "/");
  const dinouServerPath = path.join(DINOU_ROOT, "server.js").replace(/\\/g, "/");
  const dinouConfigPath = path
    .join(DINOU_ROOT, "core", "config.js")
    .replace(/\\/g, "/");

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
}

const fixturesParent = path.join(
  projectRoot,
  ".dinou",
  "tmp-api-ref-3-ci-fixtures"
);
fs.mkdirSync(fixturesParent, { recursive: true });
const tmpBase = fs.mkdtempSync(path.join(fixturesParent, "run-"));

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
  getStorageAdapter,
  setStorageAdapter,
  readDist2Fallback,
} = storageMod;
const { DinouCacheSlot, getSlotJSX, hasExpiredSlots } = cacheSlotMod;
const { revalidateTag } = cacheRevalMod;

const prevStorageGlobal = getStorageAdapter();

try {
  // =========================================================================
  // 1️⃣ Syntax Check & Source Contracts
  // =========================================================================
  console.log(
    "1️⃣ Verifying JS syntax & source contracts in storage-adapter.js, cache-slot.js, cache-revalidate.js & server.d.ts..."
  );
  {
    for (const rel of [
      "core/storage-adapter.js",
      "core/cache-slot.js",
      "core/cache-revalidate.js",
    ]) {
      const abs = path.join(DINOU_ROOT, rel);
      const checkRes = spawnSync(process.execPath, ["--check", abs], {
        encoding: "utf8",
      });
      assert.equal(
        checkRes.status,
        0,
        `node --check failed for ${rel}:\n${checkRes.stderr}`
      );
    }

    const storageSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core", "storage-adapter.js"),
      "utf8"
    );
    assert.match(storageSrc, /res\.list_complete !== false \|\| !res\.cursor/);
    assert.match(storageSrc, /cleanKey \? `\$\{cleanKey\}\/index\.html` : "index\.html"/);
    assert.match(storageSrc, /\.replace\(\/\\\/\+\$\/, ""\)/);
    assert.match(storageSrc, /item\.metadata\?\.slotId/);

    const cacheSlotSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core", "cache-slot.js"),
      "utf8"
    );
    assert.match(
      cacheSlotSrc,
      /\[\.\.\.\(tag \? \[tag\] : \[\]\), \.\.\.\(Array\.isArray\(tags\) \? tags : \[\]\)\]/
    );
    assert.match(
      cacheSlotSrc,
      /const isNoCache = typeof revalidateSeconds === "number" && revalidateSeconds < 1;/
    );
    assert.match(
      cacheSlotSrc,
      /const isEntryNoCache =\s*typeof entry\.revalidate === "number" && entry\.revalidate < 1;/
    );
    assert.match(cacheSlotSrc, /metadata\?\.slotId/);

    const cacheRevalSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core", "cache-revalidate.js"),
      "utf8"
    );
    assert.match(cacheRevalSrc, /let hasOwnLayoutFile = false;/);
    assert.match(cacheRevalSrc, /const matchesSlotId = Boolean\(matchedSlotId && matchedSlotId === tag\);/);
    assert.match(cacheRevalSrc, /const hasSlotIdMatch =/);

    const serverDts = fs.readFileSync(
      path.join(DINOU_ROOT, "server.d.ts"),
      "utf8"
    );
    assert.match(serverDts, /revalidate\?: number \| false;/);
  }
  console.log("   ✅ Section 1 passed!");

  // =========================================================================
  // 2️⃣ Storage Adapter Parity (CloudflareKVStorage & DenoKVStorage)
  // =========================================================================
  console.log(
    "2️⃣ Verifying CloudflareKVStorage pagination + has() fallback & DenoKVStorage trailing-slash normalization..."
  );
  {
    const kvMap = new Map();
    kvMap.set("blog/index.html", { value: "<h1>Blog</h1>", metadata: null });
    kvMap.set("index.html", { value: "<h1>Home</h1>", metadata: null });
    for (let i = 0; i < 25; i++) {
      kvMap.set(`items/${i}/metadata.json`, {
        value: JSON.stringify({ tags: ["all-items"] }),
        metadata: null,
      });
    }
    let listCalls = 0;
    const cf = new CloudflareKVStorage({
      async get(k) {
        return kvMap.has(k) ? kvMap.get(k).value : null;
      },
      async list(opts = {}) {
        listCalls += 1;
        const prefix = opts?.prefix || "";
        const matching = Array.from(kvMap.keys()).filter((k) =>
          prefix ? k.startsWith(prefix) : true
        );
        const start = opts?.cursor ? Number(opts.cursor) : 0;
        const slice = matching.slice(start, start + 10);
        const next = start + 10;
        const done = next >= matching.length;
        return {
          keys: slice.map((name) => ({ name })),
          list_complete: done,
          cursor: done ? undefined : String(next),
        };
      },
    });
    assert.equal(await cf.has("blog"), true);
    assert.equal(await cf.has("/blog/"), true);
    assert.equal(await cf.has("/"), true);
    assert.equal(await cf.has("missing"), false);
    const cfKeys = await cf.keys();
    assert.equal(cfKeys.length, 27);
    assert.ok(listCalls >= 3);

    const denoMap = new Map();
    const deno = new DenoKVStorage({
      async get(parts) {
        const k = JSON.stringify(parts);
        return denoMap.has(k) ? { key: parts, value: denoMap.get(k) } : { key: parts, value: null };
      },
      async set(parts, value) {
        denoMap.set(JSON.stringify(parts), value);
      },
      async delete(parts) {
        denoMap.delete(JSON.stringify(parts));
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
              if (op.type === "set") denoMap.set(JSON.stringify(op.parts), op.value);
              else denoMap.delete(JSON.stringify(op.parts));
            }
            return { ok: true };
          },
        };
      },
    });
    await deno.set("/blog/index.html", "<h1>Blog</h1>", { tags: ["blog"] });
    assert.equal(await deno.has("/blog/"), true);
    assert.equal((await deno.get("/blog/"))?.content, "<h1>Blog</h1>");
    await deno.delete("/blog/");
    assert.equal(await deno.has("/blog"), false);
    assert.equal(await deno.get("blog/index.html"), null);
  }
  console.log("   ✅ Section 2 passed!");

  // =========================================================================
  // 3️⃣ <DinouCacheSlot> tag+tags, revalidate < 1 & Cold-Pod revalidateTag(slotId)
  // =========================================================================
  console.log(
    "3️⃣ Verifying <DinouCacheSlot> tag+tags merge, revalidate < 1 consistency & cold-start revalidateTag(slotId)..."
  );
  {
    const mem = new MemoryStorage({ hydrateFromDisk: false });
    setStorageAdapter(mem);
    globalThis[Symbol.for("dinou.slot.registry")]?.clear?.();

    await DinouCacheSlot({
      id: "ci-combo",
      tag: "alpha",
      tags: ["beta", "alpha"],
      revalidate: false,
      children: () => "Combo",
    });
    const stored = await mem.get("slots/ci-combo/slot.json");
    assert.deepEqual(stored?.metadata?.tags, ["alpha", "beta"]);

    let count = 0;
    await DinouCacheSlot({
      id: "ci-frac",
      revalidate: 0.5,
      children: () => {
        count += 1;
        return `R${count}`;
      },
    });
    assert.equal(await mem.get("slots/ci-frac/slot.json"), null);
    await getSlotJSX("ci-frac", { fresh: true });
    assert.equal(count, 2);
    assert.equal(await mem.get("slots/ci-frac/slot.json"), null);
    assert.equal(await hasExpiredSlots(["ci-frac"]), false);

    // Cold-start id-only slot invalidation (empty slotRegistry)
    globalThis[Symbol.for("dinou.slot.registry")]?.clear?.();
    await mem.set("slots/ci-cold-id/slot.json", JSON.stringify("OLD"), {
      tags: [],
      slotId: "ci-cold-id",
      generatedAt: Date.now() - 1000,
    });
    await mem.set(
      "slots/ci-cold-id/slot.metadata.json",
      JSON.stringify({ tags: [], slotId: "ci-cold-id", generatedAt: Date.now() - 1000 })
    );
    await revalidateTag("ci-cold-id");
    assert.equal(await mem.get("slots/ci-cold-id/slot.json"), null);
    assert.equal(await mem.get("slots/ci-cold-id/slot.metadata.json"), null);

    // Minimal non-keys() adapter marks tag invalidated & removes disk slot dir
    let marked = null;
    class MinimalAdapter extends StorageAdapter {
      async get() { return null; }
      async set() {}
      async has() { return false; }
      async delete() {}
      async markTagInvalidatedAsync(t) {
        marked = t;
        super.markTagInvalidated(t);
      }
    }
    setStorageAdapter(new MinimalAdapter());
    const diskTmp = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-ci-ref3-disk-"));
    const prevCwd = process.cwd();
    try {
      const slotDir = path.join(diskTmp, ".dinou", "dist2", "slots", "ci-disk-id");
      fs.mkdirSync(slotDir, { recursive: true });
      fs.writeFileSync(
        path.join(slotDir, "slot.metadata.json"),
        JSON.stringify({ tags: [], slotId: "ci-disk-id", generatedAt: Date.now() - 1000 })
      );
      fs.writeFileSync(path.join(slotDir, "slot.json"), JSON.stringify("OLD"));
      process.chdir(diskTmp);
      await revalidateTag("ci-disk-id");
      assert.equal(marked, "ci-disk-id");
      assert.equal(fs.existsSync(slotDir), false);

      // readDist2Fallback rejects invalidated id-only slot
      const slotDir2 = path.join(diskTmp, ".dinou", "dist2", "slots", "ci-disk-fb");
      fs.mkdirSync(slotDir2, { recursive: true });
      fs.writeFileSync(
        path.join(slotDir2, "slot.metadata.json"),
        JSON.stringify({ tags: [], slotId: "ci-disk-fb", generatedAt: Date.now() - 1000 })
      );
      fs.writeFileSync(path.join(slotDir2, "slot.json"), JSON.stringify("OLD"));
      const memHydrate = new MemoryStorage({ hydrateFromDisk: true });
      memHydrate.markTagInvalidated("ci-disk-fb");
      assert.equal(await readDist2Fallback(memHydrate, "slots/ci-disk-fb/slot.json"), null);
    } finally {
      process.chdir(prevCwd);
      removeDirSafe(diskTmp);
    }
  }
  console.log("   ✅ Section 3 passed!");

  // =========================================================================
  // 4️⃣ Tri-Bundler (Esbuild, Rollup, Webpack) Cold revalidatePath() & Cold-Pod revalidateTag()
  // =========================================================================
  console.log(
    "4️⃣ Verifying tri-bundler (esbuild, rollup, webpack) cold revalidatePath() segment layout & cold-pod revalidateTag()..."
  );
  {
    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      const appDir = path.join(tmpBase, `cache-ref3-${bundler}`);
      fs.mkdirSync(path.join(appDir, "src", "store"), { recursive: true });
      fs.mkdirSync(path.join(appDir, "src", "leaf"), { recursive: true });
      fs.mkdirSync(path.join(appDir, "src", "slot-demo"), { recursive: true });

      fs.writeFileSync(
        path.join(appDir, "package.json"),
        JSON.stringify(
          { name: `ci-ref3-${bundler}`, type: "module", private: true },
          null,
          2
        )
      );
      writeDinouShim(appDir);

      fs.writeFileSync(
        path.join(appDir, "src", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "page.tsx"),
        `export default function Home() { return <main>Home</main>; }\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "store", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function StoreLayout({ children }: { children: ReactNode }) {
  const n = ((globalThis as any).__STORE_LAY__ = ((globalThis as any).__STORE_LAY__ || 0) + 1);
  return <section><header>StoreLayout:{n}</header>{children}</section>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "store", "page.tsx"),
        `export default function StorePage() {
  const n = ((globalThis as any).__STORE_PG__ = ((globalThis as any).__STORE_PG__ || 0) + 1);
  return <main>StorePage:{n}</main>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "leaf", "page.tsx"),
        `export default function LeafPage() { return <main>LeafOnly</main>; }\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "slot-demo", "page.tsx"),
        `import { DinouCacheSlot } from "dinou/server";

function IdOnlyWidget() {
  return <span>IdSlot:{(globalThis as any).__ID_VAL__ || "v1"}</span>;
}

function ComboWidget() {
  return <span>ComboSlot:{(globalThis as any).__COMBO_VAL__ || "c1"}</span>;
}

export default function SlotDemoPage() {
  return (
    <main>
      <DinouCacheSlot id="only-id-slot" revalidate={false}>
        <IdOnlyWidget />
      </DinouCacheSlot>
      <DinouCacheSlot id="combo-tag-slot" tag="alpha" tags={["beta"]} revalidate={false}>
        <ComboWidget />
      </DinouCacheSlot>
    </main>
  );
}
`
      );

      const buildRes = spawnSync(
        process.execPath,
        [CLI_PATH, `build:node:${bundler}`],
        { cwd: appDir, encoding: "utf8" }
      );
      assert.equal(
        buildRes.status,
        0,
        `[${bundler}] build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
      );
      assert.doesNotMatch(
        `${buildRes.stdout}\n${buildRes.stderr}`,
        /Error building page/,
        `[${bundler}] build must not log 'Error building page'`
      );

      const probePath = path.join(appDir, "probe.mjs");
      const storageModUrl = pathToFileURL(
        path.join(DINOU_ROOT, "core", "storage-adapter.js")
      ).href;
      const revalModUrl = pathToFileURL(
        path.join(DINOU_ROOT, "core", "cache-revalidate.js")
      ).href;

      fs.writeFileSync(
        probePath,
        `import assert from "node:assert/strict";
import { handleRequest } from "./.dinou/node/rsc-engine.mjs";
import { renderHtml } from "./.dinou/node/ssr-engine.mjs";
import { MemoryStorage, setStorageAdapter } from ${JSON.stringify(storageModUrl)};
import { revalidatePath, revalidateTag } from ${JSON.stringify(revalModUrl)};

globalThis.__DINOU_RUNTIME__ = "node-bundle";
globalThis.__DINOU_RENDER_HTML_STREAM__ = renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: renderHtml };

const coldStorage = new MemoryStorage({ hydrateFromDisk: false });
setStorageAdapter(coldStorage);

await revalidatePath("/store");
const layoutItem = await coldStorage.get("store/layout.rsc");
const pageItem = await coldStorage.get("store/index.html");
assert.ok(layoutItem && layoutItem.content);
assert.ok(pageItem && pageItem.content.includes("StoreLayout:") && pageItem.content.includes("StorePage:"));

await revalidatePath("/leaf");
assert.equal(await coldStorage.get("leaf/layout.rsc"), null);
assert.ok((await coldStorage.get("leaf/index.html"))?.content.includes("LeafOnly"));

const demoStorage = new MemoryStorage({ hydrateFromDisk: false });
setStorageAdapter(demoStorage);
globalThis.__ID_VAL__ = "v1";
globalThis.__COMBO_VAL__ = "c1";

const r1 = await handleRequest(new Request("http://localhost:3000/slot-demo"), opts);
const html1 = await r1.text();
assert.match(html1, /IdSlot:(?:<!-- -->)?v1/);
assert.match(html1, /ComboSlot:(?:<!-- -->)?c1/);

globalThis.__ID_VAL__ = "v2";
globalThis.__COMBO_VAL__ = "c2";
globalThis[Symbol.for("dinou.slot.registry")]?.clear?.();

await revalidateTag("only-id-slot");
const r2 = await handleRequest(new Request("http://localhost:3000/slot-demo"), opts);
const html2 = await r2.text();
assert.match(html2, /IdSlot:(?:<!-- -->)?v2/);
assert.match(html2, /ComboSlot:(?:<!-- -->)?c1/);

await revalidateTag("alpha");
const r3 = await handleRequest(new Request("http://localhost:3000/slot-demo"), opts);
const html3 = await r3.text();
assert.match(html3, /IdSlot:(?:<!-- -->)?v2/);
assert.match(html3, /ComboSlot:(?:<!-- -->)?c2/);

console.log("PROBE_OK_${bundler}");
`,
        "utf8"
      );

      const probeRes = spawnSync(process.execPath, [probePath], {
        cwd: appDir,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "" },
      });
      assert.equal(
        probeRes.status,
        0,
        `[${bundler}] probe failed:\n${probeRes.stdout}\n${probeRes.stderr}`
      );
      assert.ok(probeRes.stdout.includes(`PROBE_OK_${bundler}`));
    }
  }
  console.log("   ✅ Section 4 passed!");
} finally {
  setStorageAdapter(prevStorageGlobal);
  removeDirSafe(tmpBase);
  try {
    if (
      fs.existsSync(fixturesParent) &&
      fs.readdirSync(fixturesParent).length === 0
    ) {
      fs.rmdirSync(fixturesParent);
    }
  } catch {}
}

for (const [rel, beforeContent] of manifestSnapshotBefore.entries()) {
  const abs = path.join(projectRoot, rel);
  const afterContent = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  assert.equal(
    afterContent,
    beforeContent,
    `verify-api-reference-fixes-3-ci.mjs must not mutate host workspace ${rel}`
  );
}

console.log(
  "\n🎉 All 4 Dinou v9.4.0 API Reference Batch 3 Storage Adapters, <DinouCacheSlot> & Cold-Pod Revalidation verification suites PASSED!"
);
