// scripts/verify-revalidation-fixes-ci.mjs
// Comprehensive CI verification suite for Dinou's Revalidation & Distributed Storage Fixes:
// 1. Relative path resolution in revalidateLayout("./", "..", "../billing") via x-dinou-current-path,
//    Referer fallback, and /____server_function____ guard.
// 2. RedisStorage full parity across all 5 client shapes (scanIterator v5 arrays & v4 strings,
//    scanStream, keys(), cursor scan() tuple & object), options object { prefix, hydrateFromDisk },
//    slash/backslash normalization, route <-> route/index.html mirroring, companion deletion,
//    and Redis-backed multi-pod cluster tombstones (__tombstone__: & __tag_inv__:).
// 3. DinouConfig.storage runtime binding, SSG build isolation, cold .dinou/dist2 lazy hydration
//    (readDist2Fallback), MemoryStorage unit isolation (hydrateFromDisk = false default), and
//    multi-pod invalidation preventing sibling stale resurrection.
// 4. Standalone Node / Vitest / Queue Worker revalidation (DINOU_RUNTIME unset, zero ReferenceError).
// 5. Strict TypeScript (tsc --noEmit) check of DinouConfig.storage, RedisStorage, MemoryStorage,
//    StorageAdapter async tombstone methods, and revalidateLayout return type.
// 6. Full Dual-Bundle + generateStatic() + dinou.config.ts RedisStorage + 3D layout/page slot
//    splicing (onlyRefreshSlots: true) + pageGeneratedAt / layoutGeneratedAt ISR TTL preservation.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

process.env.NODE_ENV = "production";
delete process.env.DINOU_DEV;

const projectRoot = process.cwd();

function resolveDinouInternalPath(relFromDinou) {
  const candidates = [
    path.resolve(projectRoot, "dinou", relFromDinou),
    path.resolve(projectRoot, "node_modules/dinou/dinou", relFromDinou),
    path.resolve(projectRoot, "node_modules/dinou", relFromDinou),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

function resolveDinouInternalUrl(relFromDinou) {
  return pathToFileURL(resolveDinouInternalPath(relFromDinou)).href;
}

const {
  revalidateLayout,
  revalidatePage,
  revalidatePath,
  revalidateTag,
} = await import(resolveDinouInternalUrl("core/cache-revalidate.js"));

const {
  FileSystemStorage,
  MemoryStorage,
  RedisStorage,
  getStorageAdapter,
  hasExplicitStorageAdapter,
  readDist2Fallback,
  setStorageAdapter,
} = await import(resolveDinouInternalUrl("core/storage-adapter.js"));

const { requestStorage } = await import(
  resolveDinouInternalUrl("core/request-context.js")
);

function createMockRedis({
  mode = "scanIteratorBatch",
  initialStore = new Map(),
} = {}) {
  const store = initialStore;

  const matchingKeys = (pattern = "*") => {
    const prefix = String(pattern || "*").replace(/\*$/, "");
    return [...store.keys()].filter((k) => k.startsWith(prefix));
  };

  const base = {
    store,
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async set(k, v) {
      store.set(k, String(v));
      return "OK";
    },
    async del(k) {
      if (Array.isArray(k)) {
        let count = 0;
        for (const item of k) {
          if (store.delete(item)) count++;
        }
        return count;
      }
      return store.delete(k) ? 1 : 0;
    },
    async exists(k) {
      return store.has(k) ? 1 : 0;
    },
  };

  if (mode === "scanIteratorBatch") {
    base.scanIterator = async function* ({ MATCH } = {}) {
      const all = matchingKeys(MATCH);
      for (let i = 0; i < all.length; i += 2) {
        yield all.slice(i, i + 2);
      }
    };
  } else if (mode === "scanIteratorSingle") {
    base.scanIterator = async function* ({ MATCH } = {}) {
      for (const k of matchingKeys(MATCH)) {
        yield k;
      }
    };
  } else if (mode === "scanStream") {
    base.scanStream = ({ match } = {}) => ({
      async *[Symbol.asyncIterator]() {
        const all = matchingKeys(match);
        for (let i = 0; i < all.length; i += 2) {
          yield all.slice(i, i + 2);
        }
      },
    });
  } else if (mode === "keys") {
    base.keys = async (pattern) => matchingKeys(pattern);
  } else if (mode === "scanTuple") {
    base.scan = async (cursor, _matchLit, pattern) => {
      const idx = Number(cursor || 0);
      const all = matchingKeys(pattern);
      const slice = all.slice(idx, idx + 2);
      const next = idx + 2 >= all.length ? "0" : String(idx + 2);
      return [next, slice];
    };
  } else if (mode === "scanObject") {
    base.scan = async (cursor, opts = {}) => {
      const idx = Number(cursor || 0);
      const all = matchingKeys(opts.MATCH || "*");
      const slice = all.slice(idx, idx + 2);
      const next = idx + 2 >= all.length ? 0 : idx + 2;
      return { cursor: next, keys: slice };
    };
  }

  return base;
}

// ============================================================================
// 1. revalidateLayout relative path resolution & /____server_function____ guard
// ============================================================================
console.log(
  "1️⃣ Verifying revalidateLayout relative path resolution & Server Function guard..."
);
{
  delete globalThis.__DINOU_RUNTIME__;
  delete process.env.DINOU_RUNTIME;

  let mem = new MemoryStorage();
  setStorageAdapter(mem);

  const seed = async () => {
    mem = new MemoryStorage();
    setStorageAdapter(mem);
    await mem.set("layout.rsc", '0:["$","div",null,{"id":"root"}]\n', {
      generatedAt: 1000,
    });
    await mem.set(
      "layout.metadata.json",
      JSON.stringify({ generatedAt: 1000 })
    );
    await mem.set("dashboard/layout.rsc", '0:["$","div",null,{"id":"dash"}]\n', {
      generatedAt: 1000,
    });
    await mem.set(
      "dashboard/layout.metadata.json",
      JSON.stringify({ generatedAt: 1000 })
    );
    await mem.set(
      "dashboard/settings/layout.rsc",
      '0:["$","div",null,{"id":"settings"}]\n',
      { generatedAt: 1000 }
    );
    await mem.set(
      "dashboard/settings/layout.metadata.json",
      JSON.stringify({ generatedAt: 1000 })
    );
    await mem.set(
      "dashboard/billing/layout.rsc",
      '0:["$","div",null,{"id":"billing"}]\n',
      { generatedAt: 1000 }
    );
    await mem.set(
      "dashboard/billing/layout.metadata.json",
      JSON.stringify({ generatedAt: 1000 })
    );
    await mem.set(
      "dashboard/settings/index.html",
      "<html>Settings</html>",
      { generatedAt: 1000 }
    );
    await mem.set(
      "dashboard/settings/page.rsc",
      '0:["$","main",null,{}]\n',
      { generatedAt: 1000 }
    );
  };

  // 1a. "./" resolved against x-dinou-current-path
  await seed();
  await requestStorage.run(
    {
      req: {
        path: "/____server_function____",
        headers: { "x-dinou-current-path": "/dashboard/settings?tab=general" },
      },
    },
    async () => {
      const ok = await revalidateLayout("./");
      assert.equal(ok, true);
    }
  );
  assert.equal(await mem.get("dashboard/settings/layout.rsc"), null);
  assert.notEqual(
    await mem.get("dashboard/layout.rsc"),
    null,
    "Parent layout must remain cached on revalidateLayout('./')"
  );
  assert.notEqual(
    await mem.get("dashboard/billing/layout.rsc"),
    null,
    "Sibling layout must remain cached on revalidateLayout('./')"
  );
  assert.notEqual(
    await mem.get("dashboard/settings/page.rsc"),
    null,
    "Child page.rsc must remain cached on revalidateLayout('./')"
  );

  // 1b. ".." resolved against Referer fallback
  await seed();
  await requestStorage.run(
    {
      req: {
        path: "/____server_function____",
        headers: { referer: "https://example.com/dashboard/settings?x=1" },
      },
    },
    async () => {
      const ok = await revalidateLayout("..");
      assert.equal(ok, true);
    }
  );
  assert.equal(await mem.get("dashboard/layout.rsc"), null);
  assert.notEqual(await mem.get("dashboard/settings/layout.rsc"), null);
  assert.notEqual(await mem.get("dashboard/settings/page.rsc"), null);

  // 1c. "../billing" sibling layout resolved via x-dinou-current-path
  await seed();
  await requestStorage.run(
    {
      req: {
        path: "/____server_function____",
        headers: { "x-dinou-current-path": "/dashboard/settings" },
      },
    },
    async () => {
      const ok = await revalidateLayout("../billing");
      assert.equal(ok, true);
    }
  );
  assert.equal(await mem.get("dashboard/billing/layout.rsc"), null);
  assert.notEqual(await mem.get("dashboard/settings/layout.rsc"), null);

  // 1d. Guard against /____server_function____ fallback when headers are absent
  await seed();
  await requestStorage.run(
    {
      req: {
        path: "/____server_function____",
        headers: {},
      },
    },
    async () => {
      const ok = await revalidateLayout("./");
      assert.equal(ok, true);
    }
  );
  assert.equal(
    await mem.get("layout.rsc"),
    null,
    "Without current-path or referer on /____server_function____, './' must resolve safely to '/' rather than '/____server_function____'"
  );
}

// ============================================================================
// 2. RedisStorage full parity across all client shapes & multi-pod tombstones
// ============================================================================
console.log(
  "2️⃣ Verifying RedisStorage across all 5 Redis client shapes & multi-pod tombstones..."
);
{
  const modes = [
    "scanIteratorBatch",
    "scanIteratorSingle",
    "scanStream",
    "keys",
    "scanTuple",
    "scanObject",
  ];

  for (const mode of modes) {
    const client = createMockRedis({ mode });
    const redis = new RedisStorage(client, "test:");

    await redis.set("/blog/post-1/index.html", "<html>Post 1</html>", {
      generatedAt: 5000,
      tags: ["blog", "post-1"],
    });
    await redis.set(
      "/blog/post-1/metadata.json",
      JSON.stringify({ generatedAt: 5000, tags: ["blog", "post-1"] })
    );
    await redis.set("slots/s1/slot.json", '{"jsx":"ok"}');
    await redis.set(
      "slots/s1/slot.metadata.json",
      JSON.stringify({ tags: ["slot-s1"] })
    );
    await redis.set("/about/index.html", "<html>About</html>", {
      generatedAt: 5000,
    });
    await redis.set("/index.html", "<html>Home</html>", { generatedAt: 5000 });

    assert.equal(
      (await redis.get("blog/post-1"))?.content,
      "<html>Post 1</html>",
      `[${mode}] setting '/blog/post-1/index.html' must mirror to 'blog/post-1'`
    );
    assert.equal(
      (await redis.get("\\blog\\post-1\\"))?.content,
      "<html>Post 1</html>",
      `[${mode}] backslash paths must normalize cleanly`
    );
    assert.equal(
      (await redis.get("/about"))?.content,
      "<html>About</html>",
      `[${mode}] setting '/about/index.html' must resolve via '/about'`
    );
    assert.equal(
      (await redis.get("/"))?.content,
      "<html>Home</html>",
      `[${mode}] '/index.html' must mirror to '/'`
    );
    assert.equal(await redis.has("/blog/post-1"), true);

    const blogKeys = (await redis.keys("/blog/")).sort();
    assert.deepEqual(blogKeys, [
      "blog/post-1",
      "blog/post-1/index.html",
      "blog/post-1/metadata.json",
    ]);

    await redis.delete("/blog/post-1/");
    assert.equal(await redis.get("blog/post-1"), null);
    assert.equal(await redis.get("blog/post-1/index.html"), null);
    assert.equal(await redis.isKeyDeleted("blog/post-1/index.html"), true);

    await redis.delete("slots/s1/slot.json");
    assert.equal(await redis.get("slots/s1/slot.json"), null);
    assert.equal(
      await redis.get("slots/s1/slot.metadata.json"),
      null,
      `[${mode}] deleting slot.json must evict companion slot.metadata.json`
    );

    // Internal __tombstone__: and __tag_inv__: keys must never leak in .keys()
    await redis.markTagInvalidatedAsync("blog");
    const allKeys = await redis.keys();
    assert.equal(
      allKeys.some(
        (k) => k.startsWith("__tombstone__:") || k.startsWith("__tag_inv__:")
      ),
      false,
      `[${mode}] internal tombstone/tag keys must be filtered out of keys()`
    );
  }

  // Options object constructor + multi-pod shared tombstones & tag timestamps
  const optClient = createMockRedis({ mode: "keys" });
  const optRedis = new RedisStorage(optClient, {
    prefix: "opt:",
    hydrateFromDisk: false,
  });
  assert.equal(optRedis.prefix, "opt:");
  assert.equal(optRedis.hydrateFromDisk, false);

  const sharedBackingMap = new Map();
  const podA = new RedisStorage(
    createMockRedis({ mode: "keys", initialStore: sharedBackingMap }),
    "cluster:"
  );
  const podB = new RedisStorage(
    createMockRedis({ mode: "keys", initialStore: sharedBackingMap }),
    "cluster:"
  );

  await podA.set("shared/page/index.html", "<html>v1</html>", {
    generatedAt: 1000,
    tags: ["shared-tag"],
  });
  await podA.delete("shared/page/index.html");
  const t0 = Date.now();
  await podA.markTagInvalidatedAsync("shared-tag");

  assert.equal(await podB.isKeyDeleted("shared/page/index.html"), true);
  assert.ok((await podB.getTagInvalidatedAtAsync("shared-tag")) >= t0);

  await podA.set("shared/page/index.html", "<html>v2</html>", {
    generatedAt: Date.now(),
  });
  assert.equal(
    await podB.isKeyDeleted("shared/page/index.html"),
    false,
    "Re-setting a key on Pod A must clear the cluster tombstone for Pod B"
  );
}

// ============================================================================
// 3. SSG Isolation, Cold .dinou/dist2 Hydration & MemoryStorage Unit Isolation
// ============================================================================
console.log(
  "3️⃣ Verifying SSG storage isolation, cold .dinou/dist2 hydration & multi-pod safety..."
);
{
  const tmpDistProj = path.resolve(
    projectRoot,
    `.dinou/_tmp_reval_dist2_${process.pid}_${Math.random()
      .toString(36)
      .slice(2, 7)}`
  );
  const dist2Dir = path.join(tmpDistProj, ".dinou/dist2");
  fs.mkdirSync(dist2Dir, { recursive: true });

  const prevCwd = process.cwd();
  try {
    process.chdir(tmpDistProj);

    const diskFs = new FileSystemStorage(dist2Dir);
    const buildTime = Date.now() - 10_000;
    await diskFs.set(
      "pricing/index.html",
      "<html><body>Pricing v1</body></html>",
      {
        status: 200,
        generatedAt: buildTime,
        tags: ["pricing-tag"],
      }
    );
    await diskFs.set(
      "pricing/page.rsc",
      '0:["$","h1",null,{"children":"Pricing v1"}]\n'
    );

    // 3a. MemoryStorage defaults to hydrateFromDisk = false (unit test isolation)
    const isolatedMem = new MemoryStorage();
    assert.equal(isolatedMem.hydrateFromDisk, false);
    assert.equal(await readDist2Fallback(isolatedMem, "pricing/index.html"), null);

    const hydratedMem = new MemoryStorage({ hydrateFromDisk: true });
    assert.equal(hydratedMem.hydrateFromDisk, true);
    assert.equal(
      (await readDist2Fallback(hydratedMem, "pricing/index.html"))?.content,
      "<html><body>Pricing v1</body></html>"
    );

    // 3b. Cold RedisStorage pod hydrates from .dinou/dist2 and populates Redis
    const sharedClient = createMockRedis({ mode: "scanIteratorBatch" });
    const pod1 = new RedisStorage(sharedClient, "prod:");
    const hydrated = await readDist2Fallback(pod1, "pricing/index.html");
    assert.equal(hydrated?.content, "<html><body>Pricing v1</body></html>");
    assert.equal(hydrated?.metadata?.generatedAt, buildTime);
    assert.equal(sharedClient.store.has("prod:pricing/index.html"), true);

    // 3c. Pod 1 invalidates pricing -> brand-new cold Pod 2 must NOT resurrect stale .dinou/dist2 HTML,
    //     while non-deleted metadata.json remains discoverable for cold-pod tag scans!
    await pod1.markTagInvalidatedAsync("pricing-tag");
    await pod1.delete("pricing/index.html");
    const pod2 = new RedisStorage(sharedClient, "prod:");
    assert.equal(
      await readDist2Fallback(pod2, "pricing/index.html"),
      null,
      "Sibling cold Pod 2 must NOT resurrect invalidated .dinou/dist2 HTML"
    );

    // Test cold pod where ONLY tag invalidation occurred (metadata.json not deleted yet)
    const tagOnlyClient = createMockRedis({ mode: "keys" });
    const coldTagPod = new RedisStorage(tagOnlyClient, "tagpod:");
    await coldTagPod.markTagInvalidatedAsync("pricing-tag");
    assert.equal(
      await readDist2Fallback(coldTagPod, "pricing/index.html"),
      null,
      "Tag-invalidated HTML on disk must be rejected by readDist2Fallback"
    );
    const diskMeta = await readDist2Fallback(
      coldTagPod,
      "pricing/metadata.json"
    );
    assert.notEqual(
      diskMeta,
      null,
      "Non-deleted metadata.json on disk must remain readable so cold pods discover tagged routes"
    );

    // 3d. hasExplicitStorageAdapter() reflects whether Symbol.for("dinou.storage.adapter") is bound
    delete globalThis[Symbol.for("dinou.storage.adapter")];
    assert.equal(hasExplicitStorageAdapter(), false);
    setStorageAdapter(pod1);
    assert.equal(hasExplicitStorageAdapter(), true);
  } finally {
    delete globalThis.__DINOU_IS_SSG_BUILD__;
    delete globalThis.__DINOU_CONFIG__;
    process.chdir(prevCwd);
    fs.rmSync(tmpDistProj, { recursive: true, force: true });
  }
}

// ============================================================================
// 4. Standalone Node / Vitest / Queue Worker execution (DINOU_RUNTIME unset)
// ============================================================================
console.log(
  "4️⃣ Verifying standalone worker revalidation (DINOU_RUNTIME unset, zero ReferenceError)..."
);
{
  delete globalThis.__DINOU_RUNTIME__;
  delete process.env.DINOU_RUNTIME;

  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    const mem = new MemoryStorage();
    setStorageAdapter(mem);

    await mem.set("products/1/index.html", "<h1>Old Product 1</h1>", {
      generatedAt: 1000,
      tags: ["product-1"],
    });
    await mem.set(
      "products/1/metadata.json",
      JSON.stringify({ generatedAt: 1000, tags: ["product-1"] })
    );
    await mem.set("products/2/index.html", "<h1>Keep Product 2</h1>", {
      generatedAt: 1000,
      tags: ["product-2"],
    });
    await mem.set(
      "products/2/metadata.json",
      JSON.stringify({ generatedAt: 1000, tags: ["product-2"] })
    );
    await mem.set("shop/layout.rsc", '0:["$","nav",null,{}]\n', {
      generatedAt: 1000,
    });
    await mem.set(
      "shop/layout.metadata.json",
      JSON.stringify({ generatedAt: 1000 })
    );
    await mem.set("shop/index.html", "<h1>Shop</h1>", { generatedAt: 1000 });

    await revalidateTag("product-1");
    assert.equal(await mem.get("products/1/index.html"), null);
    assert.equal(
      (await mem.get("products/2/index.html"))?.content,
      "<h1>Keep Product 2</h1>"
    );

    await revalidatePath("/shop");
    assert.equal(await mem.get("shop/layout.rsc"), null);
    assert.equal(await mem.get("shop/index.html"), null);

    await revalidatePage("/products/2");
    assert.equal(await mem.get("products/2/index.html"), null);

    assert.equal(
      warnings.some((w) => w.includes("is not defined")),
      false,
      `Standalone worker revalidation must not emit ReferenceError warnings, got: ${warnings.join(
        " | "
      )}`
    );
  } finally {
    console.warn = origWarn;
  }
}

// ============================================================================
// 5. Strict TypeScript check of DinouConfig.storage & StorageAdapter types
// ============================================================================
console.log(
  "5️⃣ Type-checking DinouConfig.storage, RedisStorage, MemoryStorage & revalidateLayout (strict: true)..."
);
{
  const virtualFile = path.resolve(
    projectRoot,
    "src/_verify_revalidation_fixes_dts.ts"
  );
  const code = `
import { defineConfig, type DinouConfig } from "dinou";
import {
  MemoryStorage,
  RedisStorage,
  StorageAdapter,
  getStorageAdapter,
  setStorageAdapter,
  revalidateLayout,
  revalidatePage,
  revalidatePath,
  revalidateTag,
} from "dinou/server";

const mockClient = {
  async get(_k: string) { return null; },
  async set(_k: string, _v: string) { return "OK"; },
  async del(_k: string) { return 1; },
  async keys(_p: string) { return [] as string[]; },
};

const redisWithOpts = new RedisStorage(mockClient, {
  prefix: "app:",
  hydrateFromDisk: true,
});
const redisWithString = new RedisStorage(mockClient, "legacy:");
const memWithOpts = new MemoryStorage({ hydrateFromDisk: false });

export const validConfig: DinouConfig = defineConfig({
  storage: redisWithOpts,
});

export async function verifyAdapterContracts() {
  const adapter: StorageAdapter = getStorageAdapter();
  setStorageAdapter(redisWithString);
  setStorageAdapter(memWithOpts);

  const rKeys: string[] = await redisWithOpts.keys("blog/");
  const mKeys: string[] = memWithOpts.keys("blog/");
  const isDel: boolean = await adapter.isKeyDeleted("blog/index.html");
  await adapter.markTagInvalidatedAsync("blog");
  const invAt: number = await adapter.getTagInvalidatedAtAsync("blog");

  const layoutRevalidated: boolean = await revalidateLayout("./");
  await revalidatePage("../billing");
  await revalidatePath("./");
  await revalidateTag("blog");

  return { rKeys, mKeys, isDel, invAt, layoutRevalidated };
}
`;

  const configPath = ts.findConfigFile(
    projectRoot,
    ts.sys.fileExists,
    "tsconfig.json"
  );
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    projectRoot
  );
  const baseHost = ts.createCompilerHost(parsed.options);
  const origGetSourceFile = baseHost.getSourceFile.bind(baseHost);
  baseHost.getSourceFile = (fileName, languageVersion, ...rest) => {
    if (path.resolve(fileName) === virtualFile) {
      return ts.createSourceFile(
        fileName,
        code,
        languageVersion,
        true,
        ts.ScriptKind.TS
      );
    }
    return origGetSourceFile(fileName, languageVersion, ...rest);
  };
  baseHost.fileExists = (fileName) =>
    path.resolve(fileName) === virtualFile || ts.sys.fileExists(fileName);
  baseHost.readFile = (fileName) =>
    path.resolve(fileName) === virtualFile ? code : ts.sys.readFile(fileName);

  const program = ts.createProgram(
    [virtualFile],
    { ...parsed.options, noEmit: true },
    baseHost
  );
  const diagnostics = ts.getPreEmitDiagnostics(
    program,
    program.getSourceFile(virtualFile)
  );
  assert.equal(
    diagnostics.length,
    0,
    `Expected 0 TS errors in DinouConfig.storage / RedisStorage types, got: ${diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("; ")}`
  );
}

// ============================================================================
// 6. Full Dual-Bundle + SSG + dinou.config.ts RedisStorage + 3D Slot Splicing
// ============================================================================
console.log(
  "6️⃣ Integration-testing Dual-Bundle + generateStatic() + dinou.config.ts RedisStorage + 3D ISR TTL preservation..."
);
{
  process.env.DINOU_RUNTIME = "node-bundle";

  const tmpApp = path.resolve(
    projectRoot,
    `.dinou/_tmp_reval_bundle_${process.pid}_${Math.random()
      .toString(36)
      .slice(2, 7)}`
  );
  const prevCwd = process.cwd();

  fs.rmSync(tmpApp, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmpApp, "src/dashboard/settings"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(tmpApp, "src/dashboard/billing"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(tmpApp, "src/posts/[slug]"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(tmpApp, "src/dynamic-probe"), {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(tmpApp, "package.json"),
    JSON.stringify({ name: "tmp-reval-bundle", type: "module" }, null, 2)
  );

  globalThis.__TEST_REVAL_COUNTERS__ = {
    dashLayoutVersion: 1,
    dashSlotVersion: 1,
    settingsLayoutVersion: 1,
    billingLayoutVersion: 1,
    pageVersion: 1,
    quotaSlotVersion: 1,
    redisWritesDuringSsg: 0,
    ssgActive: true,
  };

  globalThis.__TEST_REVAL_REDIS_MAP__ = new Map();
  globalThis.__TEST_REVAL_REDIS_CLIENT__ = {
    async get(k) {
      return globalThis.__TEST_REVAL_REDIS_MAP__.has(k)
        ? globalThis.__TEST_REVAL_REDIS_MAP__.get(k)
        : null;
    },
    async set(k, v) {
      if (globalThis.__TEST_REVAL_COUNTERS__.ssgActive) {
        globalThis.__TEST_REVAL_COUNTERS__.redisWritesDuringSsg++;
      }
      globalThis.__TEST_REVAL_REDIS_MAP__.set(k, String(v));
      return "OK";
    },
    async del(k) {
      return globalThis.__TEST_REVAL_REDIS_MAP__.delete(k) ? 1 : 0;
    },
    async exists(k) {
      return globalThis.__TEST_REVAL_REDIS_MAP__.has(k) ? 1 : 0;
    },
    async keys(pattern) {
      const prefix = String(pattern || "").replace(/\*$/, "");
      // Intentionally return keys in reverse order (child paths before parent paths,
      // mimicking ext4 htree hash ordering on Linux) to verify ancestor-first sorting.
      return [...globalThis.__TEST_REVAL_REDIS_MAP__.keys()]
        .filter((k) => k.startsWith(prefix))
        .reverse();
    },
  };

  fs.writeFileSync(
    path.join(tmpApp, "dinou.config.ts"),
    `import { defineConfig } from "dinou";
import { RedisStorage } from "dinou/server";

export default defineConfig({
  storage: new RedisStorage((globalThis as any).__TEST_REVAL_REDIS_CLIENT__, "cluster:"),
});
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <head><title>Reval Bundle Test</title></head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/page.tsx"),
    `export default function HomePage() {
  return <h1>Home</h1>;
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dashboard/layout.tsx"),
    `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const dlv = (globalThis as any).__TEST_REVAL_COUNTERS__.dashLayoutVersion;
  return (
    <div data-dash-layout={dlv}>
      <nav>{\`DashLayout-v\${dlv}\`}</nav>
      <DinouCacheSlot id="dash-banner-slot" tags={["dash-banner-tag"]}>
        {async () => {
          const dsv = (globalThis as any).__TEST_REVAL_COUNTERS__.dashSlotVersion;
          return <aside>{\`DashBannerSlot-v\${dsv}\`}</aside>;
        }}
      </DinouCacheSlot>
      {children}
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dashboard/layout_functions.ts"),
    `export const revalidate = 120;
export function getCacheTags() {
  return ["dash-layout-tag"];
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dashboard/page.tsx"),
    `export default function DashboardOverviewPage() {
  const pv = (globalThis as any).__TEST_REVAL_COUNTERS__.pageVersion;
  return <main><h1>{\`DashOverviewPage-v\${pv}\`}</h1></main>;
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dashboard/settings/layout.tsx"),
    `import type { ReactNode } from "react";
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const slv = (globalThis as any).__TEST_REVAL_COUNTERS__.settingsLayoutVersion;
  return (
    <div data-settings-layout={slv}>
      <header>{\`SettingsLayout-v\${slv}\`}</header>
      {children}
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dashboard/settings/layout_functions.ts"),
    `export function getCacheTags() {
  return ["settings-layout-tag"];
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dashboard/settings/page.tsx"),
    `import { DinouCacheSlot } from "dinou/server";

export default async function SettingsPage() {
  const pv = (globalThis as any).__TEST_REVAL_COUNTERS__.pageVersion;
  return (
    <section>
      <h1>{\`SettingsPage-v\${pv}\`}</h1>
      <DinouCacheSlot id="quota-slot" tags={["quota-tag"]}>
        {async () => {
          const sv = (globalThis as any).__TEST_REVAL_COUNTERS__.quotaSlotVersion;
          return <span>{\`QuotaSlot-v\${sv}\`}</span>;
        }}
      </DinouCacheSlot>
    </section>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dashboard/settings/page_functions.ts"),
    `export const revalidate = 60;
export function getCacheTags() {
  return ["settings-page-tag"];
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dashboard/billing/layout.tsx"),
    `import type { ReactNode } from "react";
export default function BillingLayout({ children }: { children: ReactNode }) {
  const blv = (globalThis as any).__TEST_REVAL_COUNTERS__.billingLayoutVersion;
  return (
    <div data-billing-layout={blv}>
      <header>{\`BillingLayout-v\${blv}\`}</header>
      {children}
    </div>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dashboard/billing/layout_functions.ts"),
    `export function getCacheTags() {
  return ["billing-layout-tag"];
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dashboard/billing/page.tsx"),
    `export default function BillingPage() {
  const pv = (globalThis as any).__TEST_REVAL_COUNTERS__.pageVersion;
  return <section><h1>{\`BillingPage-v\${pv}\`}</h1></section>;
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/posts/[slug]/page.tsx"),
    `export default function PostPage({ params }: { params: { slug: string } }) {
  const pv = (globalThis as any).__TEST_REVAL_COUNTERS__.pageVersion;
  return <article><h1>{\`Post-\${params.slug}-v\${pv}\`}</h1></article>;
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/posts/[slug]/page_functions.ts"),
    `export const getStaticPaths = ["alpha", "beta"];
export function getCacheTags(params: { slug: string }) {
  return [\`post-tag-\${params.slug}\`];
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dynamic-probe/page.tsx"),
    `import { DinouCacheSlot, getContext } from "dinou/server";

export default async function DynamicProbePage() {
  return (
    <main>
      <DinouCacheSlot id="dynamic-probe-slot" revalidate={0}>
        {async () => {
          const ctx = getContext();
          const ua = ctx?.req?.headers?.["user-agent"] ?? "";
          const ck = Object.keys(ctx?.req?.cookies ?? {}).length;
          const qk = Object.keys(ctx?.req?.query ?? {}).length;
          ctx?.res?.setHeader?.("x-probe-slot", "1");
          return <div>{\`Probe:\${ua}:\${ck}:\${qk}\`}</div>;
        }}
      </DinouCacheSlot>
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(tmpApp, "src/dynamic-probe/page_functions.ts"),
    `export function dynamic() {
  return true;
}
`
  );

  try {
    process.chdir(tmpApp);

    const { generateStatic } = await import(
      resolveDinouInternalUrl("core/generate-static.js")
    );

    // 6.1 Run SSG build with RedisStorage configured in dinou.config.ts -> zero Redis writes
    await generateStatic();
    assert.equal(
      globalThis.__TEST_REVAL_COUNTERS__.redisWritesDuringSsg,
      0,
      "SSG build must write to .dinou/dist2 and NEVER touch RedisStorage at build time"
    );
    assert.ok(
      fs.existsSync(
        path.join(tmpApp, ".dinou/dist2/dashboard/settings/index.html")
      ),
      ".dinou/dist2/dashboard/settings/index.html must exist on disk after SSG"
    );
    assert.ok(
      fs.existsSync(
        path.join(tmpApp, ".dinou/dist2/dashboard/settings/shell.page.json")
      ),
      ".dinou/dist2/dashboard/settings/shell.page.json must exist on disk after SSG"
    );
    assert.ok(
      fs.existsSync(
        path.join(tmpApp, ".dinou/dist2/dashboard/shell.layout.json")
      ),
      ".dinou/dist2/dashboard/shell.layout.json must exist on disk after SSG"
    );
    assert.equal(
      globalThis.__TEST_REVAL_REDIS_MAP__.size,
      0,
      "Redis must remain completely empty after SSG build"
    );

    // 6.2 Boot compiled Dual-Bundle runtime against cold RedisStorage & cold slotRegistry
    //     (simulating a fresh production server process after `dinou build`)
    globalThis.__TEST_REVAL_COUNTERS__.ssgActive = false;
    globalThis[Symbol.for("dinou.slot.registry")]?.clear();
    const rscMod = await import(
      pathToFileURL(path.join(tmpApp, ".dinou/node/rsc-engine.mjs")).href
    );
    const ssrMod = await import(
      pathToFileURL(path.join(tmpApp, ".dinou/node/ssr-engine.mjs")).href
    );

    // Hit an unrelated dynamic route whose <DinouCacheSlot> reads req.headers, req.cookies,
    // req.query, and calls res.setHeader, populating slotRegistry BEFORE any static route's
    // slots are registered in memory (plus an unscoped entry to test discovery isolation).
    const resProbe = await rscMod.handleRequest(
      new Request("http://localhost/dynamic-probe?probe=1", {
        headers: { "user-agent": "RevalProbeAgent", cookie: "sid=abc" },
      }),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const htmlProbe = await resProbe.text();
    assert.ok(htmlProbe.includes("Probe:RevalProbeAgent:1:1"), htmlProbe);
    const activeSlotRegistry = globalThis[Symbol.for("dinou.slot.registry")];
    assert.equal(activeSlotRegistry?.has("dynamic-probe-slot"), true);
    assert.equal(activeSlotRegistry?.has("quota-slot"), false);
    const probeEntry = activeSlotRegistry.get("dynamic-probe-slot");
    activeSlotRegistry.set("unscoped-dynamic-probe-slot", {
      ...probeEntry,
      routeKeys: new Set(),
    });

    // Bump all versions to v2 BEFORE first request to prove cold RedisStorage hydrates v1 from .dinou/dist2
    globalThis.__TEST_REVAL_COUNTERS__.dashLayoutVersion = 2;
    globalThis.__TEST_REVAL_COUNTERS__.dashSlotVersion = 2;
    globalThis.__TEST_REVAL_COUNTERS__.settingsLayoutVersion = 2;
    globalThis.__TEST_REVAL_COUNTERS__.billingLayoutVersion = 2;
    globalThis.__TEST_REVAL_COUNTERS__.pageVersion = 2;
    globalThis.__TEST_REVAL_COUNTERS__.quotaSlotVersion = 2;

    const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, "");

    const resDash1 = await rscMod.handleRequest(
      new Request("http://localhost/dashboard"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const htmlDash1 = stripComments(await resDash1.text());
    assert.ok(htmlDash1.includes("DashLayout-v1"), htmlDash1);
    assert.ok(htmlDash1.includes("DashBannerSlot-v1"), htmlDash1);
    assert.ok(htmlDash1.includes("DashOverviewPage-v1"), htmlDash1);

    const resBilling1 = await rscMod.handleRequest(
      new Request("http://localhost/dashboard/billing"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const htmlBilling1 = stripComments(await resBilling1.text());
    assert.ok(htmlBilling1.includes("DashLayout-v1"), htmlBilling1);
    assert.ok(htmlBilling1.includes("DashBannerSlot-v1"), htmlBilling1);
    assert.ok(htmlBilling1.includes("BillingLayout-v1"), htmlBilling1);
    assert.ok(htmlBilling1.includes("BillingPage-v1"), htmlBilling1);

    const res1 = await rscMod.handleRequest(
      new Request("http://localhost/dashboard/settings"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const html1 = stripComments(await res1.text());
    assert.ok(html1.includes("DashLayout-v1"), html1);
    assert.ok(html1.includes("DashBannerSlot-v1"), html1);
    assert.ok(html1.includes("SettingsLayout-v1"), html1);
    assert.ok(html1.includes("SettingsPage-v1"), html1);
    assert.ok(html1.includes("QuotaSlot-v1"), html1);
    assert.ok(globalThis.__TEST_REVAL_REDIS_MAP__.size > 0);

    // 6.3 revalidateLayout("./") inside simulated Server Function -> updates /dashboard/settings layout shell
    //     while keeping SettingsPage-v1, QuotaSlot-v1, DashBannerSlot-v1, and parent /dashboard layout untouched!
    await requestStorage.run(
      {
        req: {
          path: "/____server_function____",
          headers: { "x-dinou-current-path": "/dashboard/settings" },
        },
      },
      async () => {
        const ok = await revalidateLayout("./");
        assert.equal(ok, true);
      }
    );

    const res2 = await rscMod.handleRequest(
      new Request("http://localhost/dashboard/settings"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const html2 = stripComments(await res2.text());
    assert.ok(html2.includes("SettingsLayout-v2"), html2);
    assert.ok(html2.includes("DashBannerSlot-v1"), html2);
    assert.ok(html2.includes("SettingsPage-v1"), html2);
    assert.ok(html2.includes("QuotaSlot-v1"), html2);

    const resDashStillV1 = await rscMod.handleRequest(
      new Request("http://localhost/dashboard"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const htmlDashStillV1 = stripComments(await resDashStillV1.text());
    assert.ok(
      htmlDashStillV1.includes("DashLayout-v1"),
      `Parent /dashboard layout must remain v1 after revalidateLayout('./') on /dashboard/settings, got: ${htmlDashStillV1}`
    );
    assert.ok(htmlDashStillV1.includes("DashOverviewPage-v1"), htmlDashStillV1);

    // 6.4 revalidateTag("quota-tag") on RedisStorage -> splices QuotaSlot-v2 from shell.page.json,
    //     keeps SettingsPage-v1 AND preserves metadata.pageGeneratedAt!
    const metaBeforeSlotRefresh = JSON.parse(
      JSON.parse(
        globalThis.__TEST_REVAL_REDIS_MAP__.get(
          "cluster:dashboard/settings/metadata.json"
        )
      ).content
    );
    await revalidateTag("quota-tag");
    const metaAfterSlotRefresh = JSON.parse(
      JSON.parse(
        globalThis.__TEST_REVAL_REDIS_MAP__.get(
          "cluster:dashboard/settings/metadata.json"
        )
      ).content
    );
    assert.equal(
      metaAfterSlotRefresh.pageGeneratedAt,
      metaBeforeSlotRefresh.pageGeneratedAt,
      "Slot-only page refresh must preserve host pageGeneratedAt so page ISR TTL is never starved"
    );
    assert.ok(
      metaAfterSlotRefresh.generatedAt > metaBeforeSlotRefresh.generatedAt,
      "Slot-only page refresh must advance overall artifact generatedAt"
    );

    const res3 = await rscMod.handleRequest(
      new Request("http://localhost/dashboard/settings"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const html3 = stripComments(await res3.text());
    assert.ok(html3.includes("QuotaSlot-v2"), html3);
    assert.ok(html3.includes("SettingsPage-v1"), html3);

    // 6.5 revalidateTag("dash-banner-tag") on parent layout slot -> splices DashBannerSlot-v2 from shell.layout.json,
    //     keeps DashLayout-v1 on /dashboard, keeps child SettingsLayout-v2 & BillingLayout-v1 frozen (even when
    //     storage keys arrive child-before-parent like Ubuntu ext4 or alphabetical "billing" < "layout.metadata.json"),
    //     AND preserves layout.metadata.json's layoutGeneratedAt!
    globalThis.__TEST_REVAL_COUNTERS__.settingsLayoutVersion = 3;
    const dashLayoutMetaDisk = JSON.parse(
      fs.readFileSync(
        path.join(tmpApp, ".dinou/dist2/dashboard/layout.metadata.json"),
        "utf8"
      )
    );
    const expectedLayoutGenAt =
      dashLayoutMetaDisk.layoutGeneratedAt || dashLayoutMetaDisk.generatedAt;

    await revalidateTag("dash-banner-tag");
    const dashLayoutMetaAfter = JSON.parse(
      JSON.parse(
        globalThis.__TEST_REVAL_REDIS_MAP__.get(
          "cluster:dashboard/layout.metadata.json"
        )
      ).content
    );
    assert.equal(
      dashLayoutMetaAfter.layoutGeneratedAt,
      expectedLayoutGenAt,
      "Slot-only layout refresh must preserve host layoutGeneratedAt so layout ISR TTL is never starved"
    );
    assert.ok(dashLayoutMetaAfter.generatedAt > expectedLayoutGenAt);

    const resDashAfterSlot = await rscMod.handleRequest(
      new Request("http://localhost/dashboard"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const htmlDashAfterSlot = stripComments(await resDashAfterSlot.text());
    assert.ok(htmlDashAfterSlot.includes("DashBannerSlot-v2"), htmlDashAfterSlot);
    assert.ok(htmlDashAfterSlot.includes("DashLayout-v1"), htmlDashAfterSlot);
    assert.ok(htmlDashAfterSlot.includes("DashOverviewPage-v1"), htmlDashAfterSlot);

    const resSettingsAfterParentSlot = await rscMod.handleRequest(
      new Request("http://localhost/dashboard/settings"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const htmlSettingsAfterParentSlot = stripComments(
      await resSettingsAfterParentSlot.text()
    );
    assert.ok(
      htmlSettingsAfterParentSlot.includes("DashBannerSlot-v2"),
      htmlSettingsAfterParentSlot
    );
    assert.ok(
      htmlSettingsAfterParentSlot.includes("SettingsLayout-v2"),
      `Child SettingsLayout must remain v2 (not re-execute to v3) after parent layout slot tag invalidation, got: ${htmlSettingsAfterParentSlot}`
    );
    assert.ok(
      htmlSettingsAfterParentSlot.includes("SettingsPage-v1"),
      htmlSettingsAfterParentSlot
    );

    const resBillingAfterParentSlot = await rscMod.handleRequest(
      new Request("http://localhost/dashboard/billing"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const htmlBillingAfterParentSlot = stripComments(
      await resBillingAfterParentSlot.text()
    );
    assert.ok(
      htmlBillingAfterParentSlot.includes("DashBannerSlot-v2"),
      htmlBillingAfterParentSlot
    );
    assert.ok(
      htmlBillingAfterParentSlot.includes("BillingLayout-v1"),
      `Child BillingLayout must remain v1 (not re-execute to v2) after parent layout slot tag invalidation, got: ${htmlBillingAfterParentSlot}`
    );
    assert.ok(
      htmlBillingAfterParentSlot.includes("BillingPage-v1"),
      htmlBillingAfterParentSlot
    );

    // 6.5b Parent-only slot refresh (simulating parent layout slot TTL expiry where ONLY /dashboard
    //      runs revalidateLayout("/dashboard", { onlyRefreshSlots: true }) so parent.generatedAt > child.generatedAt
    //      while parent.layoutGeneratedAt <= child.layoutGeneratedAt): child layouts must splice slots WITHOUT re-executing!
    globalThis.__TEST_REVAL_COUNTERS__.dashSlotVersion = 3;
    const activeStorage = getStorageAdapter();
    await activeStorage.delete("slots/dash-banner-slot/slot.json");
    await activeStorage.delete("slots/dash-banner-slot/slot.metadata.json");
    await activeStorage.delete("slots/dash-banner-slot");
    await revalidateLayout("/dashboard", { onlyRefreshSlots: true });

    const resSettingsAfterParentOnlySlot = await rscMod.handleRequest(
      new Request("http://localhost/dashboard/settings"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const htmlSettingsAfterParentOnlySlot = stripComments(
      await resSettingsAfterParentOnlySlot.text()
    );
    assert.ok(
      htmlSettingsAfterParentOnlySlot.includes("DashBannerSlot-v3"),
      htmlSettingsAfterParentOnlySlot
    );
    assert.ok(
      htmlSettingsAfterParentOnlySlot.includes("SettingsLayout-v2"),
      `Child SettingsLayout must remain v2 on parent-only slot refresh, got: ${htmlSettingsAfterParentOnlySlot}`
    );
    assert.ok(
      htmlSettingsAfterParentOnlySlot.includes("SettingsPage-v1"),
      htmlSettingsAfterParentOnlySlot
    );

    // 6.5c Full parent layout revalidation (revalidateLayout("/dashboard")) MUST still propagate
    //      ancestor layout re-execution to child layouts while keeping child pages cached!
    await revalidateLayout("/dashboard");
    const resSettingsAfterFullParent = await rscMod.handleRequest(
      new Request("http://localhost/dashboard/settings"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const htmlSettingsAfterFullParent = stripComments(
      await resSettingsAfterFullParent.text()
    );
    assert.ok(
      htmlSettingsAfterFullParent.includes("DashLayout-v2"),
      htmlSettingsAfterFullParent
    );
    assert.ok(
      htmlSettingsAfterFullParent.includes("SettingsLayout-v3"),
      htmlSettingsAfterFullParent
    );
    assert.ok(
      htmlSettingsAfterFullParent.includes("SettingsPage-v1"),
      htmlSettingsAfterFullParent
    );

    // 6.6 revalidateTag("settings-page-tag") -> advances SettingsPage to v2 while DashOverviewPage stays v1
    await revalidateTag("settings-page-tag");
    const res5 = await rscMod.handleRequest(
      new Request("http://localhost/dashboard/settings"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const html5 = stripComments(await res5.text());
    assert.ok(html5.includes("SettingsPage-v2"), html5);

    // 6.6b Dynamic [slug] getCacheTags(params) per-param isolation: revalidateTag("post-tag-beta")
    //      updates ONLY /posts/beta while /posts/alpha remains cached at v1!
    await revalidateTag("post-tag-beta");
    const resAlpha = await rscMod.handleRequest(
      new Request("http://localhost/posts/alpha"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const resBeta = await rscMod.handleRequest(
      new Request("http://localhost/posts/beta"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    assert.ok(stripComments(await resAlpha.text()).includes("Post-alpha-v1"));
    assert.ok(stripComments(await resBeta.text()).includes("Post-beta-v2"));

    // 6.7 Simulate completely cold Redis pod receiving revalidateTag BEFORE any HTTP request
    globalThis.__TEST_REVAL_REDIS_MAP__.clear();
    globalThis.__TEST_REVAL_COUNTERS__.pageVersion = 3;
    globalThis.__TEST_REVAL_COUNTERS__.quotaSlotVersion = 3;
    await revalidateTag("settings-page-tag");
    const res6 = await rscMod.handleRequest(
      new Request("http://localhost/dashboard/settings"),
      { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
    );
    const html6 = stripComments(await res6.text());
    assert.ok(
      html6.includes("SettingsPage-v3") && html6.includes("QuotaSlot-v3"),
      `Cold Redis pod after revalidateTag must serve v3 and never resurrect disk v1, got: ${html6}`
    );
  } finally {
    process.chdir(prevCwd);
    delete globalThis.__TEST_REVAL_COUNTERS__;
    delete globalThis.__TEST_REVAL_REDIS_MAP__;
    delete globalThis.__TEST_REVAL_REDIS_CLIENT__;
    delete globalThis.__DINOU_CONFIG__;
    delete globalThis.__DINOU_RUNTIME__;
    delete process.env.DINOU_RUNTIME;
    try {
      fs.rmSync(tmpApp, { recursive: true, force: true });
    } catch {}
  }
}

console.log(
  "RESULT: All Revalidation & Distributed Storage fixes verification checks PASSED"
);
