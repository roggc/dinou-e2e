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
  getStorageAdapter,
  setStorageAdapter,
  readDist2Fallback,
} = storageMod;
const { DinouCacheSlot, getSlotJSX, hasExpiredSlots } = cacheSlotMod;
const { revalidateTag, revalidatePath } = cacheRevalMod;

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

test("1. CloudflareKVStorage paginates keys() past page limit and supports folder fallback in has()", async () => {
  const kvMap = new Map();
  kvMap.set("blog/index.html", {
    value: "<h1>Blog</h1>",
    metadata: { tags: ["blog"] },
  });
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
  assert.ok(
    listCallCount >= 3,
    `Expected paginated kv.list() calls, got ${listCallCount}`
  );
  assert.ok(allKeys.includes("items/24/metadata.json"));

  const itemsOnly = await storage.keys("items/");
  assert.equal(itemsOnly.length, 25);

  // Simple mock omitting list_complete must still terminate after 1 call
  let simpleCalls = 0;
  const simpleStorage = new CloudflareKVStorage({
    async get() {
      return null;
    },
    async list() {
      simpleCalls += 1;
      return { keys: [{ name: "a/metadata.json" }] };
    },
  });
  assert.deepEqual(await simpleStorage.keys(), ["a/metadata.json"]);
  assert.equal(simpleCalls, 1);
});

test("2. DenoKVStorage normalizes trailing slashes identically across get(), has(), set(), and delete()", async () => {
  const kvStore = new Map();
  const keyStr = (parts) => JSON.stringify(parts);
  const mockDenoKv = {
    async get(parts) {
      const k = keyStr(parts);
      return kvStore.has(k)
        ? { key: parts, value: kvStore.get(k) }
        : { key: parts, value: null };
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
  assert.equal(await storage.has("blog/"), true);
  const fetched = await storage.get("/blog/");
  assert.ok(
    fetched,
    "Expected DenoKVStorage.get('/blog/') to hit cached blog/index.html"
  );
  assert.equal(fetched.content, "<h1>Blog</h1>");

  await storage.delete("/blog/");
  assert.equal(await storage.has("/blog"), false);
  assert.equal(await storage.has("/blog/"), false);
  assert.equal(await storage.has("blog/index.html"), false);
  assert.equal(await storage.get("blog/index.html"), null);
});

test("3. DinouCacheSlot merges tag + tags without dropping tag, treats revalidate < 1 consistently as no-cache & caches revalidate: false forever", async () => {
  const prevStorage = getStorageAdapter();
  const storage = new MemoryStorage({ hydrateFromDisk: false });
  setStorageAdapter(storage);
  const slotRegistry = globalThis[Symbol.for("dinou.slot.registry")];
  slotRegistry?.clear?.();

  try {
    await DinouCacheSlot({
      id: "combo-slot",
      tag: "primary-tag",
      tags: ["secondary-tag", "primary-tag"],
      revalidate: 120,
      children: () => "Combo Content",
    });
    const storedCombo = await storage.get("slots/combo-slot/slot.json");
    assert.ok(storedCombo, "Expected combo-slot to be cached");
    assert.deepEqual(storedCombo.metadata.tags, [
      "primary-tag",
      "secondary-tag",
    ]);
    assert.deepEqual(slotRegistry.get("combo-slot").tags, [
      "primary-tag",
      "secondary-tag",
    ]);

    // revalidate: false caches indefinitely
    let foreverCount = 0;
    await DinouCacheSlot({
      id: "forever-slot",
      revalidate: false,
      children: () => {
        foreverCount += 1;
        return `Forever-${foreverCount}`;
      },
    });
    await DinouCacheSlot({
      id: "forever-slot",
      revalidate: false,
      children: () => {
        foreverCount += 1;
        return `Forever-${foreverCount}`;
      },
    });
    assert.equal(foreverCount, 1);
    assert.ok(await storage.get("slots/forever-slot/slot.json"));
    assert.equal(await hasExpiredSlots(["forever-slot"]), false);

    // Fractional & negative revalidate (< 1) behave identically to revalidate: 0 (no-cache)
    for (const [id, rev] of [
      ["frac-nocache", 0.5],
      ["neg-nocache", -1],
    ]) {
      let renderCount = 0;
      await DinouCacheSlot({
        id,
        revalidate: rev,
        children: () => {
          renderCount += 1;
          return `Render-${renderCount}`;
        },
      });
      assert.equal(await storage.get(`slots/${id}/slot.json`), null);

      await getSlotJSX(id, { fresh: true });
      assert.equal(renderCount, 2);
      assert.equal(
        await storage.get(`slots/${id}/slot.json`),
        null,
        `getSlotJSX must not persist slot ${id} with revalidate=${rev}`
      );
      assert.equal(await hasExpiredSlots([id]), false);
    }
  } finally {
    setStorageAdapter(prevStorage);
  }
});

test("4. revalidateTag(slotId) invalidates id-only slots after cold restart (storage.keys(), non-keys() fallback, Cloudflare ASSETS & readDist2Fallback)", async () => {
  const prevStorage = getStorageAdapter();
  const prevDinouEnv = globalThis.__DINOU_ENV__;
  try {
    // 4A. Cold storage.keys() path
    const storage = new MemoryStorage({ hydrateFromDisk: false });
    setStorageAdapter(storage);
    globalThis[Symbol.for("dinou.slot.registry")]?.clear?.();
    await storage.set("slots/cold-ticker/slot.json", JSON.stringify("OLD"), {
      tags: [],
      slotId: "cold-ticker",
      generatedAt: Date.now() - 1000,
    });
    await storage.set(
      "slots/cold-ticker/slot.metadata.json",
      JSON.stringify({
        tags: [],
        slotId: "cold-ticker",
        generatedAt: Date.now() - 1000,
      })
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

    // 4B. Cold Cloudflare env.ASSETS fallback must NOT resurrect invalidated id-only slot
    const cfStorage = new MemoryStorage({ hydrateFromDisk: false });
    setStorageAdapter(cfStorage);
    globalThis[Symbol.for("dinou.slot.registry")]?.clear?.();
    const assetGenAt = Date.now() - 5000;
    const cfAssetsMap = new Map([
      [
        "/__dinou_dist2/slots/cf-cold-id/slot.json",
        {
          body: JSON.stringify("STALE_CF"),
          ct: "application/json",
        },
      ],
      [
        "/__dinou_dist2/slots/cf-cold-id/slot.metadata.json",
        {
          body: JSON.stringify({
            tags: [],
            slotId: "cf-cold-id",
            generatedAt: assetGenAt,
          }),
          ct: "application/json",
        },
      ],
    ]);
    globalThis.__DINOU_ENV__ = {
      ASSETS: {
        async fetch(req) {
          const u = new URL(typeof req === "string" ? req : req.url);
          const hit = cfAssetsMap.get(u.pathname);
          if (!hit) return new Response("Not Found", { status: 404 });
          return new Response(hit.body, {
            status: 200,
            headers: { "content-type": hit.ct },
          });
        },
      },
    };
    await revalidateTag("cf-cold-id");
    let cfRenders = 0;
    await DinouCacheSlot({
      id: "cf-cold-id",
      revalidate: false,
      children: () => {
        cfRenders += 1;
        return "FRESH_CF";
      },
    });
    assert.equal(
      cfRenders,
      1,
      "Expected Cloudflare ASSETS fallback to reject invalidated id-only slot and re-render"
    );
    const hydratedCf = await cfStorage.get("slots/cf-cold-id/slot.json");
    assert.ok(hydratedCf && hydratedCf.content.includes("FRESH_CF"));
    globalThis.__DINOU_ENV__ = prevDinouEnv;

    // 4C. Cold readDist2Fallback must reject invalidated id-only slot on disk
    const tmpDistCwd = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-dist2-id-"));
    const prevCwdDist = process.cwd();
    try {
      const slotDiskDir = path.join(
        tmpDistCwd,
        ".dinou",
        "dist2",
        "slots",
        "disk-fallback-id"
      );
      fs.mkdirSync(slotDiskDir, { recursive: true });
      fs.writeFileSync(
        path.join(slotDiskDir, "slot.metadata.json"),
        JSON.stringify({
          tags: [],
          slotId: "disk-fallback-id",
          generatedAt: Date.now() - 5000,
        })
      );
      fs.writeFileSync(
        path.join(slotDiskDir, "slot.json"),
        JSON.stringify("STALE_DISK")
      );
      process.chdir(tmpDistCwd);
      const memWithDisk = new MemoryStorage({ hydrateFromDisk: true });
      memWithDisk.markTagInvalidated("disk-fallback-id");
      const fallbackRes = await readDist2Fallback(
        memWithDisk,
        "slots/disk-fallback-id/slot.json"
      );
      assert.equal(
        fallbackRes,
        null,
        "Expected readDist2Fallback to reject invalidated id-only slot"
      );
    } finally {
      process.chdir(prevCwdDist);
      removeDirSafe(tmpDistCwd);
    }

    // 4D. Minimal non-keys() custom adapter fallback calls markTagInvalidatedAsync & deletes disk slot dir
    let markedTag = null;
    class MinimalAdapter extends StorageAdapter {
      async get() {
        return null;
      }
      async set() {}
      async has() {
        return false;
      }
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
      const slotDir = path.join(
        tmpCwd,
        ".dinou",
        "dist2",
        "slots",
        "disk-only-slot"
      );
      fs.mkdirSync(slotDir, { recursive: true });
      fs.writeFileSync(
        path.join(slotDir, "slot.metadata.json"),
        JSON.stringify({
          tags: [],
          slotId: "disk-only-slot",
          generatedAt: Date.now() - 1000,
        })
      );
      fs.writeFileSync(path.join(slotDir, "slot.json"), JSON.stringify("OLD"));
      process.chdir(tmpCwd);
      await revalidateTag("disk-only-slot");
      assert.equal(markedTag, "disk-only-slot");
      assert.equal(
        fs.existsSync(slotDir),
        false,
        "Expected disk-only id slot directory to be removed"
      );
    } finally {
      process.chdir(prevCwd);
      removeDirSafe(tmpCwd);
    }
  } finally {
    globalThis.__DINOU_ENV__ = prevDinouEnv;
    setStorageAdapter(prevStorage);
  }
});

test("5. Multi-bundler (Esbuild, Rollup, Webpack) integration: cold revalidatePath() segment layout detection & cold-pod revalidateTag() on id-only + tag+tags slots", async () => {
  const prevStorage = getStorageAdapter();
  const bundlers = ["esbuild", "rollup", "webpack"];
  try {
    for (const bundler of bundlers) {
      const tmpApp = createFixtureDir(`tmp-cache-ref3-${bundler}-`);
      try {
        fs.writeFileSync(
          path.join(tmpApp, "package.json"),
          JSON.stringify(
            { name: `cache-ref3-${bundler}`, type: "module", private: true },
            null,
            2
          )
        );

        const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
        fs.mkdirSync(dinouShimDir, { recursive: true });
        const dinouIndexPath = path
          .join(DINOU_ROOT, "index.js")
          .replace(/\\/g, "/");
        const dinouServerPath = path
          .join(DINOU_ROOT, "server.js")
          .replace(/\\/g, "/");
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

        fs.mkdirSync(path.join(tmpApp, "src", "store"), { recursive: true });
        fs.mkdirSync(path.join(tmpApp, "src", "leaf"), { recursive: true });
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
          path.join(tmpApp, "src", "leaf", "page.tsx"),
          `export default function LeafPage() {
  return <main>LeafOnly</main>;
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
        const prevRenderHtml = globalThis.__DINOU_RENDER_HTML_STREAM__;
        process.chdir(tmpApp);
        try {
          globalThis.__DINOU_RUNTIME__ = "node-bundle";
          globalThis.__STORE_LAYOUT_RUNS__ = 0;
          globalThis.__STORE_PAGE_RUNS__ = 0;
          globalThis.__ID_SLOT_VALUE__ = "v1";
          globalThis.__COMBO_SLOT_VALUE__ = "c1";

          const rscMod = await import(
            pathToFileURL(
              path.join(tmpApp, ".dinou", "node", "rsc-engine.mjs")
            ).href + `?b=${bundler}&t=${Date.now()}`
          );
          const ssrMod = await import(
            pathToFileURL(
              path.join(tmpApp, ".dinou", "node", "ssr-engine.mjs")
            ).href + `?b=${bundler}&t=${Date.now()}`
          );
          globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;

          // 5A. Cold revalidatePath('/store') detects own src/store/layout.tsx & builds store/layout.rsc
          //     while revalidatePath('/leaf') (no own layout) does NOT falsely emit leaf/layout.rsc
          const coldStorage = new MemoryStorage({ hydrateFromDisk: false });
          setStorageAdapter(coldStorage);

          await revalidatePath("/store");
          const layoutItem = await coldStorage.get("store/layout.rsc");
          const pageItem = await coldStorage.get("store/index.html");
          assert.ok(
            layoutItem && layoutItem.content,
            `[${bundler}] Expected cold revalidatePath('/store') to build store/layout.rsc`
          );
          assert.ok(
            pageItem && pageItem.content.includes("StoreLayout:"),
            `[${bundler}] Expected store/index.html to contain StoreLayout`
          );
          assert.ok(
            pageItem.content.includes("StorePage:"),
            `[${bundler}] Expected store/index.html to contain StorePage`
          );

          await revalidatePath("/leaf");
          assert.equal(
            await coldStorage.get("leaf/layout.rsc"),
            null,
            `[${bundler}] Layout-less /leaf must NOT emit leaf/layout.rsc`
          );
          const leafItem = await coldStorage.get("leaf/index.html");
          assert.ok(leafItem && leafItem.content.includes("LeafOnly"));

          // 5B. Cold-pod revalidateTag() on id-only slot + combined tag/tags slot
          const demoStorage = new MemoryStorage({ hydrateFromDisk: false });
          setStorageAdapter(demoStorage);

          const r1 = await rscMod.handleRequest(
            new Request("http://localhost:3000/slot-demo"),
            {
              runtime: "node-bundle",
              renderHtmlStream: ssrMod.renderHtml,
            }
          );
          const html1 = await r1.text();
          assert.match(
            html1,
            /IdSlot:(?:<!-- -->)?v1/,
            `[${bundler}] Initial IdSlot expected v1:\n${html1}`
          );
          assert.match(
            html1,
            /ComboSlot:(?:<!-- -->)?c1/,
            `[${bundler}] Initial ComboSlot expected c1:\n${html1}`
          );

          globalThis.__ID_SLOT_VALUE__ = "v2";
          globalThis.__COMBO_SLOT_VALUE__ = "c2";
          globalThis[Symbol.for("dinou.slot.registry")]?.clear?.();

          await revalidateTag("only-id-slot");
          const r2 = await rscMod.handleRequest(
            new Request("http://localhost:3000/slot-demo"),
            {
              runtime: "node-bundle",
              renderHtmlStream: ssrMod.renderHtml,
            }
          );
          const html2 = await r2.text();
          assert.match(
            html2,
            /IdSlot:(?:<!-- -->)?v2/,
            `[${bundler}] Revalidated IdSlot expected v2:\n${html2}`
          );
          assert.match(
            html2,
            /ComboSlot:(?:<!-- -->)?c1/,
            `[${bundler}] Sibling ComboSlot must remain cached c1:\n${html2}`
          );

          await revalidateTag("alpha");
          const r3 = await rscMod.handleRequest(
            new Request("http://localhost:3000/slot-demo"),
            {
              runtime: "node-bundle",
              renderHtmlStream: ssrMod.renderHtml,
            }
          );
          const html3 = await r3.text();
          assert.match(
            html3,
            /IdSlot:(?:<!-- -->)?v2/,
            `[${bundler}] IdSlot expected v2:\n${html3}`
          );
          assert.match(
            html3,
            /ComboSlot:(?:<!-- -->)?c2/,
            `[${bundler}] Revalidated ComboSlot expected c2:\n${html3}`
          );
        } finally {
          globalThis.__DINOU_RUNTIME__ = prevRuntime;
          globalThis.__DINOU_RENDER_HTML_STREAM__ = prevRenderHtml;
          process.chdir(prevCwd);
        }
      } finally {
        removeDirSafe(tmpApp);
      }
    }
  } finally {
    setStorageAdapter(prevStorage);
  }
});
