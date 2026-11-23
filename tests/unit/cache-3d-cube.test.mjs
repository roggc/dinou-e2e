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
  shiftPprHoleIdsInTree,
  shiftPprHoleEntry,
  composeLayoutChainFromOwnFragments,
} = await importDinou("core/layout-composition.js");

const {
  FileSystemStorage,
  MemoryStorage,
  RedisStorage,
  getStorageAdapter,
  setStorageAdapter,
  readDist2Fallback,
} = await importDinou("core/storage-adapter.js");

const {
  serializeJSX,
  deserializeJSX,
  refreshNestedSlotsInTree,
} = await importDinou("core/cache-slot.js");
const {
  createLayoutChildrenPlaceholder,
  runInLayoutSegment,
} = await importDinou("core/ppr-context.js");
const { asyncRenderJSXToClientJSX } = await importDinou(
  "core/render-jsx-to-client-jsx.js"
);
const { handlePprResume, readShellJsonFromStorage } = await importDinou(
  "core/ppr-runtime.js"
);
const { shouldExportDist2File } = await importDinou("core/static-assets.js");

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
        version: "10.0.2",
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
    `export * from ${JSON.stringify(relTo("index.js"))};\n`
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

function createMockRedisClient() {
  const map = new Map();
  return {
    map,
    async get(k) {
      return map.has(k) ? map.get(k) : null;
    },
    async set(k, v) {
      map.set(k, String(v));
      return "OK";
    },
    async del(k) {
      if (Array.isArray(k)) {
        let count = 0;
        for (const item of k) {
          if (map.delete(item)) count++;
        }
        return count;
      }
      return map.delete(k) ? 1 : 0;
    },
    async exists(k) {
      return map.has(k) ? 1 : 0;
    },
    async keys(pattern) {
      const prefix = String(pattern || "*").replace(/\*$/, "");
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

test("1. Syntax check on all 9 Dinou core modules from commit e6bc964", () => {
  for (const rel of [
    "core/layout-composition.js",
    "core/handler.js",
    "core/cache-revalidate.js",
    "core/ppr-runtime.js",
    "core/generate-static.js",
    "core/storage-adapter.js",
    "core/render-jsx-to-client-jsx.js",
    "core/get-jsx.js",
    "core/navigation.js",
    "core/cache-slot.js",
    "core/slot.js",
  ]) {
    const abs = path.join(DINOU_ROOT, rel);
    const check = spawnSync(process.execPath, ["--check", abs], {
      encoding: "utf8",
    });
    assert.equal(
      check.status,
      0,
      `node --check failed for ${rel}:\n${check.stderr}`
    );
  }
  assert.equal(typeof readShellJsonFromStorage, "function");
});

test("2. RouterContext globalThis.__DINOU_ROUTER_CONTEXT__ singleton across duplicate module instances (Bug 3)", async () => {
  const navUrl = pathToFileURL(path.join(DINOU_ROOT, "core", "navigation.js")).href;
  const modA = await import(`${navUrl}?dup=ejected-chunk-a`);
  const modB = await import(`${navUrl}?dup=ejected-chunk-b`);

  assert.ok(modA.RouterContext, "RouterContext must be exported");
  assert.equal(
    modA.RouterContext,
    modB.RouterContext,
    "Duplicate bundle instances of navigation.js must share the exact same RouterContext singleton"
  );
  assert.equal(
    globalThis.__DINOU_ROUTER_CONTEXT__,
    modA.RouterContext,
    "RouterContext must be registered on globalThis.__DINOU_ROUTER_CONTEXT__"
  );
});

test("3. shiftPprHoleIdsInTree & shiftPprHoleEntry preserve placeholders, refs & promises while shifting hole IDs", () => {
  assert.equal(shiftPprHoleEntry("ppr-hole-1", 3), "ppr-hole-4");
  assert.deepEqual(shiftPprHoleEntry({ id: "ppr-hole-2", tag: "cookie" }, 5), {
    id: "ppr-hole-7",
    tag: "cookie",
  });
  assert.equal(shiftPprHoleEntry("custom-id", 5), "custom-id");

  const placeholder = createLayoutChildrenPlaceholder();
  const clientRef = { $$typeof: Symbol.for("react.client.reference"), $$id: "client#Btn" };
  const serverRef = { $$typeof: Symbol.for("react.server.reference"), $$id: "server#Act" };
  const pendingPromise = Promise.resolve("ok");

  const tree = React.createElement(
    "div",
    { key: "root-key", "data-ppr-static-parent": "ppr-hole-1" },
    React.createElement("span", { "data-ppr-hole": "ppr-hole-2" }, "hole"),
    { nestedClient: clientRef, nestedServer: serverRef, p: pendingPromise },
    placeholder
  );

  // Offset 0 returns exact same reference
  assert.equal(shiftPprHoleIdsInTree(tree, 0), tree);

  const shifted = shiftPprHoleIdsInTree(tree, 4);
  assert.equal(shifted.key, "root-key");
  assert.equal(shifted.props["data-ppr-static-parent"], "ppr-hole-5");
  assert.equal(shifted.props.children[0].props["data-ppr-hole"], "ppr-hole-6");
  assert.equal(shifted.props.children[1].nestedClient, clientRef);
  assert.equal(shifted.props.children[1].nestedServer, serverRef);
  assert.equal(shifted.props.children[1].p, pendingPromise);
  assert.equal(shifted.props.children[2], placeholder);
});

test("4. Scoped useServerId() generates collision-free per-layout-level IDs across independent renders", async () => {
  function IdProbe({ label }) {
    const id1 = React.useId();
    const id2 = React.useId();
    return React.createElement("div", { "data-label": label, "data-id1": id1, "data-id2": id2 });
  }

  const l1Store = { active: true, idCount: 0, scopePrefix: "cube_l1" };
  const l2Store = { active: true, idCount: 0, scopePrefix: "cube_l1_l2" };

  const resL1 = await runInLayoutSegment(
    () => asyncRenderJSXToClientJSX(React.createElement(IdProbe, { label: "L1" })),
    l1Store
  );
  const resL2 = await runInLayoutSegment(
    () => asyncRenderJSXToClientJSX(React.createElement(IdProbe, { label: "L2" })),
    l2Store
  );

  assert.equal(resL1.props["data-id1"], "_layout_cube_l1_dS_1_");
  assert.equal(resL1.props["data-id2"], "_layout_cube_l1_dS_2_");
  assert.equal(resL2.props["data-id1"], "_layout_cube_l1_l2_dS_1_");
  assert.equal(resL2.props["data-id2"], "_layout_cube_l1_l2_dS_2_");
  assert.notEqual(resL1.props["data-id1"], resL2.props["data-id1"]);
});

test("5. Storage adapters & shouldExportDist2File handle shell.layout.own.json, _old.json & ownGeneratedAt tag checks", async () => {
  // 5a. Static export must NEVER leak any new internal JSON/RSC artifacts
  for (const internalArtifact of [
    "shell.layout.own.json",
    "shell.layout._old.json",
    "shell.page._old.json",
    "layout._old.rsc",
    "page._old.rsc",
    "nested/shell.layout.own.json",
    "nested/shell.layout._old.json",
    "nested/shell.page._old.json",
    "nested/layout.metadata.json",
    "nested/metadata.json",
  ]) {
    assert.equal(
      shouldExportDist2File(internalArtifact),
      false,
      `shouldExportDist2File must reject internal artifact ${internalArtifact}`
    );
  }
  assert.equal(shouldExportDist2File("nested/index.html"), true);
  assert.equal(shouldExportDist2File("nested/page.rsc"), true);
  assert.equal(shouldExportDist2File("nested/layout.rsc"), true);

  // 5b. FileSystemStorage routes shell.layout.own.json / shell.layout._old.json / layout._old.rsc
  // to layout.metadata.json and shell.page._old.json to metadata.json
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-3d-fs-"));
  try {
    const fsStorage = new FileSystemStorage(tmpDir);
    await fsStorage.set("sec/l2/layout.rsc", "0:\"L2\"\n", {
      generatedAt: 2000,
      layoutGeneratedAt: 2000,
      ownGeneratedAt: 1000,
      tags: ["tag-l2"],
    });
    await fsStorage.set("sec/l2/shell.layout.own.json", '{"own":true}');
    await fsStorage.set("sec/l2/shell.layout._old.json", '{"oldLayout":true}');
    await fsStorage.set("sec/l2/layout._old.rsc", "0:\"OLD\"\n");
    await fsStorage.set("sec/l2/page.rsc", "0:\"PAGE\"\n", {
      generatedAt: 3000,
      pageGeneratedAt: 3000,
      tags: ["tag-page"],
    });
    await fsStorage.set("sec/l2/shell.page._old.json", '{"oldPage":true}');

    const ownItem = await fsStorage.get("sec/l2/shell.layout.own.json");
    assert.equal(ownItem.content, '{"own":true}');
    assert.equal(ownItem.metadata?.ownGeneratedAt, 1000);
    assert.deepEqual(ownItem.metadata?.tags, ["tag-l2"]);

    const oldLayoutItem = await fsStorage.get("sec/l2/shell.layout._old.json");
    assert.equal(oldLayoutItem.metadata?.ownGeneratedAt, 1000);

    const oldPageItem = await fsStorage.get("sec/l2/shell.page._old.json");
    assert.equal(oldPageItem.metadata?.pageGeneratedAt, 3000);
    assert.deepEqual(oldPageItem.metadata?.tags, ["tag-page"]);

    // 5c. readDist2Fallback compares ownGeneratedAt (not recomposed generatedAt!) against tag invalidation
    const prevDist2 = globalThis.__DINOU_DIST2_DIR__;
    const prevCwd = process.cwd();
    const fakeProject = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-3d-dist2-"));
    try {
      const dist2Dir = path.join(fakeProject, ".dinou", "dist2");
      fs.mkdirSync(path.join(dist2Dir, "sec", "l2"), { recursive: true });
      const now = Date.now();
      fs.writeFileSync(
        path.join(dist2Dir, "sec", "l2", "layout.metadata.json"),
        JSON.stringify({
          generatedAt: now + 5000, // advanced by ancestor recomposeOnly (strictly after invalidation)
          layoutGeneratedAt: now + 5000,
          ownGeneratedAt: now - 5000, // own render happened BEFORE invalidation
          tags: ["l2-own-tag"],
        })
      );
      fs.writeFileSync(
        path.join(dist2Dir, "sec", "l2", "shell.layout.own.json"),
        '{"own":"stale"}'
      );
      fs.writeFileSync(
        path.join(dist2Dir, "sec", "l2", "shell.layout.json"),
        '{"composed":"fresh-recompose"}'
      );

      process.chdir(fakeProject);
      const mem = new MemoryStorage({ hydrateFromDisk: true });
      // Tag invalidated at Date.now() (AFTER ownGeneratedAt=now-5000, BEFORE recomposed layoutGeneratedAt=now+5000)
      mem.markTagInvalidated("l2-own-tag");

      const ownFallback = await readDist2Fallback(mem, "sec/l2/shell.layout.own.json");
      assert.equal(
        ownFallback,
        null,
        "readDist2Fallback must reject stale shell.layout.own.json when tag invalidation > ownGeneratedAt"
      );
      const composedFallback = await readDist2Fallback(mem, "sec/l2/shell.layout.json");
      assert.ok(
        composedFallback && composedFallback.content === '{"composed":"fresh-recompose"}',
        "shell.layout.json uses layoutGeneratedAt (now+5000 > invAt) and remains readable"
      );
    } finally {
      process.chdir(prevCwd);
      if (prevDist2 !== undefined) globalThis.__DINOU_DIST2_DIR__ = prevDist2;
      removeDirSafe(fakeProject);
    }
  } finally {
    removeDirSafe(tmpDir);
  }
});

test("6. composeLayoutChainFromOwnFragments across 3 levels (Root -> L1 -> L2) on FileSystemStorage, MemoryStorage & RedisStorage", async () => {
  const tmpFs = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-3d-compose-"));
  try {
    const storages = [
      ["FileSystemStorage", new FileSystemStorage(tmpFs)],
      ["MemoryStorage", new MemoryStorage()],
      ["RedisStorage", new RedisStorage(createMockRedisClient(), { prefix: "cube:" })],
    ];

    const rootTree = React.createElement(
      "html",
      null,
      React.createElement("body", null, createLayoutChildrenPlaceholder())
    );
    const l1Tree = React.createElement(
      "section",
      { id: "l1" },
      React.createElement("div", { "data-ppr-hole": "ppr-hole-1" }, "l1-hole"),
      createLayoutChildrenPlaceholder()
    );
    const l2Tree = React.createElement(
      "div",
      { id: "l2" },
      React.createElement("div", { "data-ppr-hole": "ppr-hole-1" }, "l2-hole-1"),
      React.createElement("div", { "data-ppr-hole": "ppr-hole-2" }, "l2-hole-2"),
      createLayoutChildrenPlaceholder()
    );

    const activeChain = [
      { cleanLayoutKey: "sec/l2", layoutRoutePath: "/sec/l2", effectivePpr: true },
      { cleanLayoutKey: "sec", layoutRoutePath: "/sec", effectivePpr: true },
      { cleanLayoutKey: "", layoutRoutePath: "/", effectivePpr: false },
    ];

    for (const [label, storage] of storages) {
      await storage.set("shell.layout.own.json", serializeJSX(rootTree));
      await storage.set(
        "layout.metadata.json",
        JSON.stringify({
          generatedAt: 1000,
          layoutGeneratedAt: 1000,
          ownGeneratedAt: 1000,
          ownPpr: false,
          ownHoles: [],
          ownSuspenseCount: 0,
          ownSlotTags: ["root-slot"],
        })
      );

      await storage.set("sec/shell.layout.own.json", serializeJSX(l1Tree));
      await storage.set(
        "sec/layout.metadata.json",
        JSON.stringify({
          generatedAt: 1000,
          layoutGeneratedAt: 1000,
          ownGeneratedAt: 1000,
          ownPpr: true,
          ownHoles: ["ppr-hole-1"],
          ownSuspenseCount: 2, // 1 static Suspense + 1 dynamic hole -> offset +2 for L2
          ownSlotTags: ["l1-slot"],
        })
      );

      await storage.set("sec/l2/shell.layout.own.json", serializeJSX(l2Tree));
      await storage.set(
        "sec/l2/layout.metadata.json",
        JSON.stringify({
          generatedAt: 1000,
          layoutGeneratedAt: 1000,
          ownGeneratedAt: 1000,
          ownPpr: true,
          ownHoles: ["ppr-hole-1", "ppr-hole-2"],
          ownSuspenseCount: 2,
          ownSlotTags: ["l2-slot"],
        })
      );

      const composed = await composeLayoutChainFromOwnFragments(
        activeChain,
        storage,
        { currentPath: "/sec/l2" }
      );
      assert.ok(composed, `[${label}] expected composed result`);
      assert.equal(composed.anyLayoutPpr, true, `[${label}] anyLayoutPpr`);
      assert.equal(composed.suspenseCount, 4, `[${label}] shifted suspenseCount`);
      assert.deepEqual(
        composed.holes,
        ["ppr-hole-1", "ppr-hole-3", "ppr-hole-4"],
        `[${label}] L2 holes must be shifted by L1 ownSuspenseCount (+2)`
      );
      assert.deepEqual(
        composed.slotTags.sort(),
        ["l1-slot", "l2-slot", "root-slot"],
        `[${label}] slotTags must be union of all 3 levels`
      );

      // Verify L2 DOM elements inside composed tree actually got shifted hole props
      const l1El = composed.layoutOnlyTree.props.children.props.children;
      const l2El = l1El.props.children[1];
      assert.equal(l1El.props.children[0].props["data-ppr-hole"], "ppr-hole-1");
      assert.equal(l2El.props.children[0].props["data-ppr-hole"], "ppr-hole-3");
      assert.equal(l2El.props.children[1].props["data-ppr-hole"], "ppr-hole-4");

      // If an ancestor is marked dynamic:true (with no override), composition must return null
      await storage.set(
        "sec/layout.metadata.json",
        JSON.stringify({ generatedAt: 1000, dynamic: true })
      );
      const bailNull = await composeLayoutChainFromOwnFragments(
        activeChain,
        storage,
        { currentPath: "/sec/l2" }
      );
      assert.equal(
        bailNull,
        null,
        `[${label}] must return null when an un-overridden ancestor is dynamic`
      );
    }
  } finally {
    removeDirSafe(tmpFs);
  }
});

test("7. handlePprResume uses preloaded causal shell JSON snapshots even when storage mutates concurrently (Bug 1 guard)", async () => {
  const storage = new MemoryStorage({ hydrateFromDisk: false });
  const stalePageJson = serializeJSX(React.createElement("div", null, "STALE_SHELL_100"));
  const staleLayoutJson = serializeJSX(React.createElement("section", null, "STALE_LAYOUT_100"));
  const newerPageJson = serializeJSX(React.createElement("div", null, "RACED_SHELL_538"));
  const newerLayoutJson = serializeJSX(React.createElement("section", null, "RACED_LAYOUT_553"));

  // Use a real layout-bearing route path ("/t-3d-cube/hs") so getActiveLayoutChain detects active layouts
  await storage.set("t-3d-cube/hs/shell.page.json", newerPageJson);
  await storage.set("t-3d-cube/hs/shell.layout.json", newerLayoutJson);

  const shellHtml =
    `<!DOCTYPE html><html><head><title>PPR</title></head><body>` +
    `<div id="shell">STALE_SHELL_100</div>` +
    `</body></html>`;

  const prevStorage = getStorageAdapter();
  const prevEdgeRenderer = globalThis.__DINOU_EDGE_RENDERER__;
  setStorageAdapter(storage);
  globalThis.__DINOU_EDGE_RENDERER__ = {
    renderToReadableStream(model) {
      const text = `0:${JSON.stringify(model)}\n`;
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
    },
  };

  try {
    const baseOpts = {
      reqPath: "/t-3d-cube/hs",
      queryObj: {},
      simReq: {
        url: "/t-3d-cube/hs",
        path: "/t-3d-cube/hs",
        query: {},
        headers: { host: "localhost:3000" },
        cookies: {},
      },
      bridge: {
        headers: {},
        cookies: [],
        _explicitStatusSet: false,
        statusCode: 200,
      },
      platformContext: {},
      rootContext: {},
      cachedItem: {
        content: shellHtml,
        metadata: { ppr: true, holes: [], status: 200, generatedAt: 1000 },
      },
      metadata: { ppr: true, holes: [], status: 200, generatedAt: 1000 },
      isDevelopment: false,
      getDiscoveredLayouts: () => ({}),
      createRequestContext: () => ({
        req: { query: {}, headers: {}, cookies: {}, path: "/t-3d-cube/hs", method: "GET" },
        res: {},
        _dynamicState: { value: true },
        _markDynamic: () => {},
      }),
      copyCustomContextProperties: () => {},
    };

    // 7a. With preloaded causal snapshots: MUST emit 100 inline RSC scripts despite storage having 538/553
    const response = await handlePprResume({
      ...baseOpts,
      preloadedPageShellJson: stalePageJson,
      preloadedLayoutShellJson: staleLayoutJson,
    });

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes("window.__DINOU_INLINE_RSC__=true"), "must emit inline RSC scripts");
    assert.ok(html.includes("STALE_SHELL_100"), "inline page RSC must match preloaded stale 100");
    assert.ok(html.includes("STALE_LAYOUT_100"), "inline layout RSC must match preloaded stale 100");
    assert.ok(
      !html.includes("RACED_SHELL_538") && !html.includes("RACED_LAYOUT_553"),
      "Inline Flight scripts MUST NOT leak concurrently overwritten 538/553 shell JSON into a stale 100 HTML response (would cause React #418)"
    );

    // 7b. Control check without preloaded snapshots: reads current storage (538/553), proving 7a genuinely bypassed mutated storage
    const controlRes = await handlePprResume(baseOpts);
    assert.equal(controlRes.status, 200);
    const controlHtml = await controlRes.text();
    assert.ok(controlHtml.includes("RACED_SHELL_538"), "control without preload reads storage page JSON");
    assert.ok(controlHtml.includes("RACED_LAYOUT_553"), "control without preload reads storage layout JSON");
  } finally {
    setStorageAdapter(prevStorage);
    if (prevEdgeRenderer === undefined) {
      delete globalThis.__DINOU_EDGE_RENDERER__;
    } else {
      globalThis.__DINOU_EDGE_RENDERER__ = prevEdgeRenderer;
    }
  }
});

test("8. Full compiled Node AOT integration: 3-level cascade (L1->L2->L3), ownGeneratedAt TTL invariant, L1 slot persistence across L2 reval, asymmetric dynamic L2, _old.json snapshots & reset_layout", async () => {
  const tmpApp = createFixtureDir("tmp-3d-cube-int-");
  try {
    for (const relDir of [
      "src/cascade/l2/l3",
      "src/cascade/reset-branch",
      "src/asym/dyn",
      "src/asym/dyn-isg/[slug]",
    ]) {
      fs.mkdirSync(path.join(tmpApp, relDir), { recursive: true });
    }

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify(
        { name: "cube-3d-int-fixture", private: true, type: "module" },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
          },
        },
        null,
        2
      )
    );
    writeDinouShim(tmpApp);

    // Mutable JSON state stored outside .dinou/dist2
    fs.writeFileSync(
      path.join(tmpApp, "src", "state.ts"),
      `import fs from "node:fs";
import path from "node:path";
const FILE = path.resolve(process.cwd(), ".dinou/int-state.json");
const DEF = {
  l1: 100, l1Slot: 100, l2: 100, l2Hole: 100, l3: 100, l3Page: 100,
  resetL: 100, resetP: 100,
  asymL1: 100, asymDynL2: 100, asymPage: 100, asymSlug: 100,
};
export function readSt() {
  try {
    if (fs.existsSync(FILE)) return { ...DEF, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {}
  return { ...DEF };
}
export function writeSt(patch: Partial<typeof DEF>) {
  const next = { ...readSt(), ...patch };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next), "utf8");
  return next;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><head><meta charSet="UTF-8" /></head><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `export default function Home() { return <main>Home</main>; }\n`
    );

    // 3-Level Cascade: L1 (3600s + DinouCacheSlot + useId) -> L2 (ppr=true, 3600s + hole + useId) -> L3 (3600s) -> Page (3600s)
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "layout_functions.ts"),
      `export const revalidate = 3600;\nexport const ppr = false;\nexport const tags = ["int-l1-tag"];\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "layout.tsx"),
      `import React, { type ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readSt } from "../state";
export default function L1Layout({ children }: { children: ReactNode }) {
  const st = readSt();
  const uid = React.useId();
  return (
    <section data-l1-uid={uid}>
      <span id="l1-seq">{st.l1}</span>
      <DinouCacheSlot id="int-l1-slot" tag="int-l1-slot-tag" revalidate={3600}>
        {async () => <span id="l1-slot-seq">{readSt().l1Slot}</span>}
      </DinouCacheSlot>
      {children}
    </section>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "page.tsx"),
      `export default function CascadeIndex() { return <div id="cascade-idx">idx</div>; }\n`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "l2", "layout_functions.ts"),
      `export const revalidate = 3600;\nexport const ppr = true;\nexport const tags = ["int-l2-tag"];\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "l2", "layout.tsx"),
      `import React, { Suspense, type ReactNode } from "react";
import { getContext } from "dinou/server";
import { readSt } from "../../state";
async function L2Hole() {
  const { req } = getContext();
  await new Promise((r) => setTimeout(r, 10));
  return <span id="l2-hole">{readSt().l2Hole}:{String(req.query.u || "anon")}</span>;
}
export default function L2Layout({ children }: { children: ReactNode }) {
  const st = readSt();
  const uid = React.useId();
  return (
    <div data-l2-uid={uid}>
      <span id="l2-seq">{st.l2}</span>
      <Suspense fallback={<span>l2-fb</span>}><L2Hole /></Suspense>
      {children}
    </div>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "l2", "page_functions.ts"),
      `export const revalidate = 3600;\nexport const ppr = false;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "l2", "page.tsx"),
      `export default function L2Page() { return <div id="l2-page">l2p</div>; }\n`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "l2", "l3", "layout_functions.ts"),
      `export const revalidate = 3600;\nexport const ppr = false;\nexport const tags = ["int-l3-tag"];\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "l2", "l3", "layout.tsx"),
      `import type { ReactNode } from "react";
import { readSt } from "../../../state";
export default function L3Layout({ children }: { children: ReactNode }) {
  return <div><span id="l3-seq">{readSt().l3}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "l2", "l3", "page_functions.ts"),
      `export const revalidate = 3600;\nexport const ppr = false;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "l2", "l3", "page.tsx"),
      `import { readSt } from "../../../state";
export default function L3Page() { return <span id="l3-page-seq">{readSt().l3Page}</span>; }
`
    );

    // reset_layout branch inside /cascade
    fs.writeFileSync(path.join(tmpApp, "src", "cascade", "reset-branch", "reset_layout"), "");
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "reset-branch", "layout_functions.ts"),
      `export const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "reset-branch", "layout.tsx"),
      `import type { ReactNode } from "react";
import { readSt } from "../../state";
export default function ResetLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><span id="reset-l">{readSt().resetL}</span>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "reset-branch", "page_functions.ts"),
      `export const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "cascade", "reset-branch", "page.tsx"),
      `import { readSt } from "../../state";
export default function ResetPage() { return <span id="reset-p">{readSt().resetP}</span>; }
`
    );

    // Asymmetric dynamic L2 under static L1 + static page + cold ISG dynamic slug
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "layout_functions.ts"),
      `export const revalidate = 3600;\nexport const tags = ["int-asym-l1"];\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "layout.tsx"),
      `import type { ReactNode } from "react";
import { readSt } from "../state";
export default function AsymL1({ children }: { children: ReactNode }) {
  return <div><span id="asym-l1">{readSt().asymL1}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "page.tsx"),
      `export default function AsymIdx() { return <div>asym</div>; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "dyn", "layout_functions.ts"),
      `export const revalidate = 0;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "dyn", "layout.tsx"),
      `import type { ReactNode } from "react";
import { readSt } from "../../state";
export default function AsymDynL2({ children }: { children: ReactNode }) {
  return <div><span id="asym-dyn-l2">{readSt().asymDynL2}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "dyn", "page_functions.ts"),
      `export const revalidate = 3600;\nexport const tags = ["int-asym-page"];\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "dyn", "page.tsx"),
      `import { readSt } from "../../state";
export default function AsymStaticPage() {
  return <span id="asym-page">{readSt().asymPage}</span>;
}
`
    );

    // Cold ISG dynamic slug under dynamic layout
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "dyn-isg", "layout_functions.ts"),
      `export const revalidate = 0;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "dyn-isg", "layout.tsx"),
      `import type { ReactNode } from "react";
import { readSt } from "../../state";
export default function AsymDynIsgL2({ children }: { children: ReactNode }) {
  return <div><span id="asym-isg-l2">{readSt().asymDynL2}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "dyn-isg", "[slug]", "page_functions.ts"),
      `export const revalidate = 3600;\nexport const allowISG = true;\nexport function getStaticPaths() { return []; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "asym", "dyn-isg", "[slug]", "page.tsx"),
      `import { readSt } from "../../../state";
export default function AsymSlugPage({ params }: { params: { slug: string } }) {
  return <span id="asym-slug">{\`\${params.slug}:\${readSt().asymSlug}\`}</span>;
}
`
    );

    // Server Action exposing revalidate helpers for the runner script
    fs.writeFileSync(
      path.join(tmpApp, "src", "actions.ts"),
      `"use server";
import { revalidateLayout, revalidatePage, revalidateTag } from "dinou/server";
import { writeSt } from "./state";
export async function runOp(op: string, arg: any) {
  if (op === "write") return writeSt(arg);
  if (op === "revalLayout") return { ok: await revalidateLayout(arg) };
  if (op === "revalPage") return { ok: await revalidatePage(arg) };
  if (op === "revalTag") { await revalidateTag(arg); return { ok: true }; }
  return null;
}
`
    );
    // Reference actions from home so it's in server-functions-manifest
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import { runOp } from "./actions";
export default function Home() {
  void runOp;
  return <main>Home</main>;
}
`
    );

    const nodePathEntries = [
      path.join(tmpApp, "node_modules"),
      path.join(REPO_ROOT, "node_modules"),
      path.join(DINOU_ROOT, "node_modules"),
    ].filter((p) => fs.existsSync(p));

    const buildRes = spawnSync(process.execPath, [CLI_PATH, "build:node:esbuild"], {
      cwd: tmpApp,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_PATH: nodePathEntries.join(path.delimiter),
      },
      timeout: 180_000,
    });
    assert.equal(
      buildRes.status,
      0,
      `build:node:esbuild failed:\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
    );

    // Verify build-time per-level artifacts & unconditional shell.page.json
    for (const expectedArtifact of [
      ".dinou/dist2/shell.layout.own.json",
      ".dinou/dist2/cascade/shell.layout.own.json",
      ".dinou/dist2/cascade/l2/shell.layout.own.json",
      ".dinou/dist2/cascade/l2/l3/shell.layout.own.json",
      ".dinou/dist2/asym/shell.layout.own.json",
      ".dinou/dist2/asym/dyn/shell.page.json", // unconditional shell.page.json on plain static page!
      ".dinou/dist2/cascade/l2/l3/shell.page.json",
    ]) {
      assert.equal(
        fs.existsSync(path.join(tmpApp, expectedArtifact)),
        true,
        `Expected build artifact ${expectedArtifact}`
      );
    }
    const l2MetaBefore = JSON.parse(
      fs.readFileSync(
        path.join(tmpApp, ".dinou/dist2/cascade/l2/layout.metadata.json"),
        "utf8"
      )
    );
    const l3MetaBefore = JSON.parse(
      fs.readFileSync(
        path.join(tmpApp, ".dinou/dist2/cascade/l2/l3/layout.metadata.json"),
        "utf8"
      )
    );
    assert.ok(l2MetaBefore.ownGeneratedAt > 0, "L2 must have ownGeneratedAt");
    assert.equal(l2MetaBefore.ownPpr, true, "L2 must have ownPpr=true");
    assert.equal(l3MetaBefore.ownPpr, false, "L3 must have ownPpr=false");
    assert.ok(l3MetaBefore.ownGeneratedAt > 0, "L3 must have ownGeneratedAt");

    // Run live in-process verification script against built .dinou/node/server.mjs
    const verifyScript = path.join(tmpApp, "verify-live.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fetch as nodeFetch } from "./.dinou/node/server.mjs";

async function callOp(op, arg) {
  const res = await nodeFetch(
    new Request("http://127.0.0.1:3000/____server_function____", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-server-function-call": "1",
        origin: "http://127.0.0.1:3000",
        host: "127.0.0.1:3000",
      },
      body: JSON.stringify({ id: "file:///src/actions.ts#runOp", args: [op, arg] }),
    })
  );
  assert.equal(res.status, 200, "Server function failed: " + op);
  return await res.text();
}

async function getHtml(url) {
  const res = await nodeFetch(new Request("http://127.0.0.1:3000" + url));
  assert.equal(res.status, 200, "GET " + url + " status " + res.status);
  return await res.text();
}

const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
};

// A. Baseline check + distinct scoped useId() across L1 and L2
const baseL3 = await getHtml("/cascade/l2/l3?u=init");
assert.equal(textById(baseL3, "l1-seq"), "100");
assert.equal(textById(baseL3, "l1-slot-seq"), "100");
assert.equal(textById(baseL3, "l2-seq"), "100");
assert.equal(textById(baseL3, "l3-seq"), "100");
assert.equal(textById(baseL3, "l3-page-seq"), "100");
const l1Uid = baseL3.match(/data-l1-uid="([^"]+)"/)?.[1];
const l2Uid = baseL3.match(/data-l2-uid="([^"]+)"/)?.[1];
assert.ok(l1Uid && l2Uid && l1Uid !== l2Uid, "Scoped L1 & L2 useId() must be distinct: " + l1Uid + " vs " + l2Uid);

// B. 3-Level Cascade (L1 -> L2 -> L3): revalidate L1 with L2, L3, l3Page & reset_branch poisoned to 999
const l2MetaBefore = JSON.parse(fs.readFileSync(".dinou/dist2/cascade/l2/layout.metadata.json", "utf8"));
const l3MetaBefore = JSON.parse(fs.readFileSync(".dinou/dist2/cascade/l2/l3/layout.metadata.json", "utf8"));

await callOp("write", { l1: 201, l1Slot: 999, l2: 999, l2Hole: 202, l3: 999, l3Page: 999, resetL: 999, resetP: 999 });
await callOp("revalLayout", "/cascade");

const afterL1Reval = await getHtml("/cascade/l2/l3?u=neo");
assert.equal(textById(afterL1Reval, "l1-seq"), "201", "L1 must update to 201");
assert.equal(textById(afterL1Reval, "l1-slot-seq"), "100", "L1 slot stays cached 100");
assert.equal(textById(afterL1Reval, "l2-seq"), "100", "L2 MUST NOT re-execute on L1 reval");
assert.equal(textById(afterL1Reval, "l3-seq"), "100", "L3 MUST NOT re-execute on L1 reval");
assert.equal(textById(afterL1Reval, "l3-page-seq"), "100", "L3 page MUST NOT re-execute on L1 reval");
assert.ok(afterL1Reval.includes("202") && afterL1Reval.includes("neo"), "L2 PPR dynamic hole must still stream fresh");

// Verify L2 & L3 ownGeneratedAt were STRICTLY PRESERVED while layoutGeneratedAt advanced!
const l2MetaAfter = JSON.parse(fs.readFileSync(".dinou/dist2/cascade/l2/layout.metadata.json", "utf8"));
const l3MetaAfter = JSON.parse(fs.readFileSync(".dinou/dist2/cascade/l2/l3/layout.metadata.json", "utf8"));
assert.equal(l2MetaAfter.ownGeneratedAt, l2MetaBefore.ownGeneratedAt, "L2 ownGeneratedAt must be preserved on recomposeOnly");
assert.equal(l3MetaAfter.ownGeneratedAt, l3MetaBefore.ownGeneratedAt, "L3 ownGeneratedAt must be preserved on recomposeOnly");
assert.ok(l3MetaAfter.layoutGeneratedAt > l3MetaBefore.layoutGeneratedAt, "L3 layoutGeneratedAt must advance after cascade recomposeOnly");

// Verify reset_layout branch was completely unaffected by outer L1 revalidation
const resetHtml = await getHtml("/cascade/reset-branch");
assert.equal(textById(resetHtml, "reset-l"), "100");
assert.equal(textById(resetHtml, "reset-p"), "100");

// C. L1 Slot Persistence Across Descendant L2 Revalidation (Section 6.4 #5!)
await callOp("write", { l1: 999, l1Slot: 581, l2: 999, l3: 999 });
await callOp("revalTag", "int-l1-slot-tag");
const afterSlot = await getHtml("/cascade/l2/l3?u=slot");
assert.equal(textById(afterSlot, "l1-seq"), "201", "L1 host untouched on slot reval");
assert.equal(textById(afterSlot, "l1-slot-seq"), "581", "L1 slot refreshed to 581");

// Now poison L1 & L1Slot to 999 and revalidate L2 to 600 -> L1 slot MUST stay 581 (NOT revert to 100!)
await callOp("write", { l1: 999, l1Slot: 999, l2: 600, l3: 999, l3Page: 999 });
await callOp("revalLayout", "/cascade/l2");
const afterL2Reval = await getHtml("/cascade/l2/l3?u=l2");
assert.equal(textById(afterL2Reval, "l1-seq"), "201", "Ancestor L1 MUST NOT re-execute on L2 reval");
assert.equal(textById(afterL2Reval, "l1-slot-seq"), "581", "L1 refreshed slot (581) MUST persist across descendant L2 revalidation");
assert.equal(textById(afterL2Reval, "l2-seq"), "600", "L2 must update to 600");
assert.equal(textById(afterL2Reval, "l3-seq"), "100", "Child L3 MUST NOT re-execute on L2 reval");
assert.equal(fs.existsSync(".dinou/dist2/cascade/l2/shell.layout._old.json"), true, "shell.layout._old.json snapshot must be written on revalidateLayout");

// D. Asymmetric Dynamic Layout (L1 3600s -> DynL2 revalidate=0 -> StaticPage 3600s)
await callOp("write", { asymL1: 999, asymDynL2: 510, asymPage: 999 });
const asym1 = await getHtml("/asym/dyn");
assert.equal(textById(asym1, "asym-l1"), "100", "Static L1 reused under dynamic L2");
assert.equal(textById(asym1, "asym-dyn-l2"), "510", "Dynamic L2 executed fresh");
assert.equal(textById(asym1, "asym-page"), "100", "Static page reused under dynamic L2");

// Calling revalidateLayout on dynamic L2 must return false and NEVER freeze L2 into cache
const dynRevalResp = await callOp("revalLayout", "/asym/dyn");
assert.ok(dynRevalResp.includes("false"), "revalidateLayout on revalidate=0 layout must return false");
assert.equal(fs.existsSync(".dinou/dist2/asym/dyn/layout.rsc"), false, "Dynamic L2 must never create layout.rsc");
assert.equal(fs.existsSync(".dinou/dist2/asym/dyn/shell.layout.own.json"), false, "Dynamic L2 must never create shell.layout.own.json");

// Revalidate static page under dynamic L2 -> updates page & saves shell.page._old.json without touching L1 or freezing L2
await callOp("write", { asymL1: 999, asymDynL2: 512, asymPage: 511 });
await callOp("revalPage", "/asym/dyn");
assert.equal(fs.existsSync(".dinou/dist2/asym/dyn/shell.page._old.json"), true, "shell.page._old.json snapshot must be saved on revalidatePage");
const asym2 = await getHtml("/asym/dyn");
assert.equal(textById(asym2, "asym-l1"), "100", "L1 stays 100 after revalidatePage under dynamic L2");
assert.equal(textById(asym2, "asym-dyn-l2"), "512", "Dynamic L2 executes fresh 512");
assert.equal(textById(asym2, "asym-page"), "511", "Static page updates to 511");

// E. Cold ISG dynamic slug under dynamic L2 -> first hit caches page only, second hit reuses page & L1 while executing L2 fresh
await callOp("write", { asymL1: 999, asymDynL2: 520, asymSlug: 301 });
const slug1 = await getHtml("/asym/dyn-isg/alpha");
assert.equal(textById(slug1, "asym-l1"), "100");
assert.equal(textById(slug1, "asym-isg-l2"), "520");
assert.equal(textById(slug1, "asym-slug"), "alpha:301");

await callOp("write", { asymL1: 999, asymDynL2: 521, asymSlug: 999 });
const slug2 = await getHtml("/asym/dyn-isg/alpha");
assert.equal(textById(slug2, "asym-l1"), "100", "L1 stays 100 on cached ISG hit");
assert.equal(textById(slug2, "asym-isg-l2"), "521", "Dynamic L2 executes fresh 521");
assert.equal(textById(slug2, "asym-slug"), "alpha:301", "Cold-populated ISG page stays cached 301");

// F. Dynamic /____rsc_layout____ soft-navigation endpoint reuses static L1 while executing dynamic L2 fresh
await callOp("write", { asymL1: 999, asymDynL2: 525, asymPage: 999 });
const dynLayoutRsc = await getHtml("/____rsc_layout____/asym/dyn");
assert.ok(dynLayoutRsc.includes("525"), "Dynamic /____rsc_layout____ must execute L2 fresh (525)");
assert.ok(dynLayoutRsc.includes("100") && !dynLayoutRsc.includes("999"), "Dynamic /____rsc_layout____ must reuse static L1 (100) without 999 leak");

console.log("CUBE_3D_INT_OK");
`
    );

    const liveRes = spawnSync(process.execPath, [verifyScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: "" },
      timeout: 60_000,
    });
    assert.equal(
      liveRes.status,
      0,
      `Live 3D Cube integration failed:\nSTDOUT:\n${liveRes.stdout}\nSTDERR:\n${liveRes.stderr}`
    );
    assert.ok(liveRes.stdout.includes("CUBE_3D_INT_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("9. refreshNestedSlotsInTree does NOT propagate fresh:true into valid cached nested slots (Check #42 isolation fix)", async () => {
  const storage = new MemoryStorage({ hydrateFromDisk: false });
  const prevStorage = getStorageAdapter();
  setStorageAdapter(storage);

  const slotRegistry = globalThis[Symbol.for("dinou.slot.registry")];
  let innerRenderCalls = 0;
  const innerSlotId = "unit-nested-inner-iso";
  const outerSlotId = "unit-nested-outer-iso";

  try {
    await storage.set(
      `slots/${innerSlotId}/slot.json`,
      serializeJSX(React.createElement("span", { id: "inner" }, "CACHED_INNER_100")),
      {
        tags: [innerSlotId],
        revalidate: 3600,
        generatedAt: Date.now(),
        slotId: innerSlotId,
      }
    );

    slotRegistry.set(innerSlotId, {
      render: async () => {
        innerRenderCalls++;
        return React.createElement("span", { id: "inner" }, "POISON_INNER_999");
      },
      tags: [innerSlotId],
      revalidate: 3600,
      routeKeys: new Set(["test-iso"]),
    });

    const outerTree = React.createElement(
      "div",
      { id: "outer" },
      React.createElement("span", null, "FRESH_OUTER_561"),
      React.createElement(
        "div",
        { __dinou_slot__: innerSlotId, tags: [innerSlotId] },
        React.createElement("span", { id: "inner" }, "CACHED_INNER_100")
      )
    );

    // Passing fresh:true (as refreshSlot("outer", { fresh: true }) does) MUST NOT re-execute cached inner!
    const refreshed = await refreshNestedSlotsInTree(outerTree, outerSlotId, {
      fresh: true,
      currentPath: "/test-iso",
    });

    assert.equal(innerRenderCalls, 0, "valid cached nested slot must NOT re-execute when outer has fresh:true");
    const serialized = JSON.stringify(refreshed);
    assert.ok(serialized.includes("CACHED_INNER_100"), "must preserve cached inner value");
    assert.ok(!serialized.includes("POISON_INNER_999"), "must not leak poisoned re-render");

    // Conversely, once inner IS deleted/invalidated, refreshNestedSlotsInTree MUST regenerate it cleanly
    await storage.delete(`slots/${innerSlotId}/slot.json`);
    const refreshedAfterInv = await refreshNestedSlotsInTree(outerTree, outerSlotId, {
      fresh: true,
      currentPath: "/test-iso",
    });
    assert.equal(innerRenderCalls, 1, "invalidated nested slot must regenerate");
    assert.ok(JSON.stringify(refreshedAfterInv).includes("POISON_INNER_999"));
  } finally {
    slotRegistry.delete(innerSlotId);
    setStorageAdapter(prevStorage);
  }
});

test("10. Stage 1 Axis X compiled Node AOT integration: S->D->S->S/D alternation, S->S->D static layout reuse, implicit dynamic layout bailout & /____rsc_page____ isolation", async () => {
  const tmpApp = createFixtureDir("tmp-3d-stage1-");
  try {
    for (const relDir of [
      "src/alt/dyn-l2/static-l3/dyn-page",
      "src/sdp/l2/dyn-page",
      "src/imp/cookie-l2",
    ]) {
      fs.mkdirSync(path.join(tmpApp, relDir), { recursive: true });
    }

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "cube-3d-stage1-fixture", private: true, type: "module" }, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
          },
        },
        null,
        2
      )
    );
    writeDinouShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "src", "state.ts"),
      `import fs from "node:fs";
import path from "node:path";
const FILE = path.resolve(process.cwd(), "s1-state.json");
const DEF = {
  altL1: 100, altL2: 100, altL3: 100, altPageS: 100, altPageD: 100,
  sdpL1: 100, sdpL2: 100, sdpPageD: 100,
  impL1: 100, impL2: 100, impPageS: 100,
};
export function readS() {
  try { if (fs.existsSync(FILE)) return { ...DEF, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
  return { ...DEF };
}
export function writeS(patch: Partial<typeof DEF>) {
  const next = { ...readS(), ...patch };
  fs.writeFileSync(FILE, JSON.stringify(next), "utf8");
  return next;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import type { ReactNode } from "react";
export default function Root({ children }: { children: ReactNode }) {
  return <html><head><title>S1</title></head><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `export default function Home() { return <main>home</main>; }\n`
    );

    // 1. S -> D -> S -> S & S -> D -> S -> D
    fs.writeFileSync(path.join(tmpApp, "src/alt/layout_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/alt/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../state";
export default function L1({ children }: { children: ReactNode }) {
  return <section><span id="alt-l1">{readS().altL1}</span>{children}</section>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/alt/dyn-l2/layout_functions.ts"), `export const revalidate = 0;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/alt/dyn-l2/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function L2({ children }: { children: ReactNode }) {
  return <div><span id="alt-l2">{readS().altL2}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/alt/dyn-l2/static-l3/layout_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/alt/dyn-l2/static-l3/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../../../state";
export default function L3({ children }: { children: ReactNode }) {
  return <div><span id="alt-l3">{readS().altL3}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/alt/dyn-l2/static-l3/page_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/alt/dyn-l2/static-l3/page.tsx"),
      `import { readS } from "../../../state";
export default function PageS() { return <main><span id="alt-ps">{readS().altPageS}</span></main>; }
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/alt/dyn-l2/static-l3/dyn-page/page_functions.ts"), `export const revalidate = 0;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/alt/dyn-l2/static-l3/dyn-page/page.tsx"),
      `import { readS } from "../../../../state";
export default function PageD() { return <main><span id="alt-pd">{readS().altPageD}</span></main>; }
`
    );

    // 2. S -> S -> D (static L1 & L2 + dynamic page)
    fs.writeFileSync(path.join(tmpApp, "src/sdp/layout_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/sdp/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../state";
export default function SdpL1({ children }: { children: ReactNode }) {
  return <section><span id="sdp-l1">{readS().sdpL1}</span>{children}</section>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/sdp/l2/layout_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/sdp/l2/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function SdpL2({ children }: { children: ReactNode }) {
  return <div><span id="sdp-l2">{readS().sdpL2}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/sdp/l2/dyn-page/page_functions.ts"), `export const revalidate = 0;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/sdp/l2/dyn-page/page.tsx"),
      `import { readS } from "../../../state";
export default function SdpPageD() { return <main><span id="sdp-pd">{readS().sdpPageD}</span></main>; }
`
    );

    // 3. Implicit dynamic bailout layout + static page
    fs.writeFileSync(path.join(tmpApp, "src/imp/layout_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/imp/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../state";
export default function ImpL1({ children }: { children: ReactNode }) {
  return <section><span id="imp-l1">{readS().impL1}</span>{children}</section>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/imp/cookie-l2/layout.tsx"),
      `import type { ReactNode } from "react";
import { getContext } from "dinou";
import { readS } from "../../state";
export default function ImpL2({ children }: { children: ReactNode }) {
  const user = String(getContext()?.req?.cookies?.u || "anon");
  return <div><span id="imp-l2">{readS().impL2}</span><span id="imp-u">{user}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/imp/cookie-l2/page_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/imp/cookie-l2/page.tsx"),
      `import { readS } from "../../state";
export default function ImpPageS() { return <main><span id="imp-ps">{readS().impPageS}</span></main>; }
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
      `Stage 1 fixture build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    // Static L3 underneath dynamic L2 MUST have shell.layout.own.json and dynamic !== true
    assert.equal(
      fs.existsSync(path.join(tmpApp, ".dinou/dist2/alt/dyn-l2/static-l3/shell.layout.own.json")),
      true,
      "Static L3 underneath dynamic L2 must persist shell.layout.own.json"
    );
    const l3Meta = JSON.parse(
      fs.readFileSync(path.join(tmpApp, ".dinou/dist2/alt/dyn-l2/static-l3/layout.metadata.json"), "utf8")
    );
    assert.equal(l3Meta.hasDynamicAncestor, true);
    assert.notEqual(l3Meta.dynamic, true);

    const verifyScript = path.join(tmpApp, "verify-stage1.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const { revalidateLayout } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/cache-revalidate.js")).href
      )});
setStorageAdapter(new FileSystemStorage(path.resolve(".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
};
const writeS = (patch) => {
  const f = path.resolve("s1-state.json");
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const get = async (u, headers = {}) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u, { headers }), opts);
  assert.equal(r.status, 200, "Expected 200 for " + u);
  return await r.text();
};

// A. S->D->S->S: poison L1, L3, PageS; bump L2
writeS({ altL1: 999, altL2: 501, altL3: 999, altPageS: 999 });
const altS = await get("/alt/dyn-l2/static-l3");
assert.equal(textById(altS, "alt-l1"), "100");
assert.equal(textById(altS, "alt-l2"), "501");
assert.equal(textById(altS, "alt-l3"), "100");
assert.equal(textById(altS, "alt-ps"), "100");

// Soft-nav /____rsc_page____ for PageS must NOT be poisoned by dynamic L2!
const altPageRsc = await get("/____rsc_page____/alt/dyn-l2/static-l3");
assert.ok(altPageRsc.includes("100") && !altPageRsc.includes("999"), "page.rsc must stay cached 100");

// Revalidate L3 under dynamic L2 -> updates ONLY L3 without freezing L2 or touching L1
writeS({ altL1: 999, altL2: 502, altL3: 603, altPageS: 999 });
await revalidateLayout("/alt/dyn-l2/static-l3");
const altS2 = await get("/alt/dyn-l2/static-l3");
assert.equal(textById(altS2, "alt-l1"), "100");
assert.equal(textById(altS2, "alt-l2"), "502");
assert.equal(textById(altS2, "alt-l3"), "603");
assert.equal(textById(altS2, "alt-ps"), "100");

// S->D->S->D: dynamic page under alternating layouts
writeS({ altL1: 999, altL2: 503, altL3: 999, altPageD: 701 });
const altD = await get("/alt/dyn-l2/static-l3/dyn-page");
assert.equal(textById(altD, "alt-l1"), "100");
assert.equal(textById(altD, "alt-l2"), "503");
assert.equal(textById(altD, "alt-l3"), "603");
assert.equal(textById(altD, "alt-pd"), "701");

// B. S->S->D: static L1 & L2 never re-execute when serving dynamic page
writeS({ sdpL1: 999, sdpL2: 999, sdpPageD: 801 });
const sdp1 = await get("/sdp/l2/dyn-page");
assert.equal(textById(sdp1, "sdp-l1"), "100");
assert.equal(textById(sdp1, "sdp-l2"), "100");
assert.equal(textById(sdp1, "sdp-pd"), "801");

// C. Implicit dynamic bailout layout + static page
writeS({ impL1: 100, impL2: 100, impPageS: 100 });
await get("/imp/cookie-l2", { cookie: "u=nova" });
writeS({ impL1: 999, impL2: 901, impPageS: 999 });
const imp2 = await get("/imp/cookie-l2", { cookie: "u=orion" });
assert.equal(textById(imp2, "imp-l1"), "100");
assert.equal(textById(imp2, "imp-l2"), "901");
assert.equal(textById(imp2, "imp-u"), "orion");
assert.equal(textById(imp2, "imp-ps"), "100");

console.log("STAGE1_AXIS_X_OK");
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
      `Stage 1 compiled integration failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("STAGE1_AXIS_X_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("11. Stage 2 Axis Y compiled Node AOT integration: 3-level nested slots, cross-route shared slot propagation & error resilience", async () => {
  const tmpApp = createFixtureDir("tmp-3d-stage2-");
  try {
    for (const relDir of [
      "src/deep",
      "src/shared-a",
      "src/shared-b",
      "src/err",
    ]) {
      fs.mkdirSync(path.join(tmpApp, relDir), { recursive: true });
    }

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "cube-3d-stage2-fixture", private: true, type: "module" }, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
          },
        },
        null,
        2
      )
    );
    writeDinouShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "src", "state.ts"),
      `import fs from "node:fs";
import path from "node:path";
const FILE = path.resolve(process.cwd(), "s2-state.json");
const DEF = {
  deepHost: 100, deepOuter: 100, deepMid: 100, deepInner: 100,
  sharedHostA: 100, sharedHostB: 100, sharedSlot: 100,
  errHost: 100, errFragile: 100, errHealthy: 100, errThrow: false,
};
export function readS() {
  try { if (fs.existsSync(FILE)) return { ...DEF, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
  return { ...DEF };
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import type { ReactNode } from "react";
export default function Root({ children }: { children: ReactNode }) {
  return <html><head><title>S2</title></head><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `export default function Home() { return <main>home</main>; }\n`
    );

    // 1. 3-level nested slots
    fs.writeFileSync(path.join(tmpApp, "src/deep/page_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/deep/page.tsx"),
      `import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function DeepPage() {
  return (
    <main>
      <span id="d-host">{readS().deepHost}</span>
      <DinouCacheSlot id="s2-outer" tag="s2-tag-outer" revalidate={3600}>
        {async () => (
          <div>
            <span id="d-outer">{readS().deepOuter}</span>
            <DinouCacheSlot id="s2-mid" tag="s2-tag-mid" revalidate={3600}>
              {async () => (
                <div>
                  <span id="d-mid">{readS().deepMid}</span>
                  <DinouCacheSlot id="s2-inner" tag="s2-tag-inner" revalidate={3600}>
                    {async () => <span id="d-inner">{readS().deepInner}</span>}
                  </DinouCacheSlot>
                </div>
              )}
            </DinouCacheSlot>
          </div>
        )}
      </DinouCacheSlot>
    </main>
  );
}
`
    );

    // 2. Shared slot across route-a and route-b
    fs.writeFileSync(path.join(tmpApp, "src/shared-a/page_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/shared-a/page.tsx"),
      `import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function SharedA() {
  return (
    <main>
      <span id="sa-host">{readS().sharedHostA}</span>
      <DinouCacheSlot id="s2-shared" tags={["s2-shared-tag"]} revalidate={3600}>
        {async () => <span id="s-val">{readS().sharedSlot}</span>}
      </DinouCacheSlot>
    </main>
  );
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/shared-b/page_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/shared-b/page.tsx"),
      `import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function SharedB() {
  return (
    <main>
      <span id="sb-host">{readS().sharedHostB}</span>
      <DinouCacheSlot id="s2-shared" tags={["s2-shared-tag"]} revalidate={3600}>
        {async () => <span id="s-val">{readS().sharedSlot}</span>}
      </DinouCacheSlot>
    </main>
  );
}
`
    );

    // 3. Fragile error-resilience slot
    fs.writeFileSync(path.join(tmpApp, "src/err/page_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/err/page.tsx"),
      `import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function ErrPage() {
  return (
    <main>
      <span id="e-host">{readS().errHost}</span>
      <DinouCacheSlot id="s2-fragile" tag="s2-fragile-tag" revalidate={3600}>
        {async () => {
          const s = readS();
          if (s.errThrow) throw new Error("boom-fragile");
          return <span id="e-fragile">{s.errFragile}</span>;
        }}
      </DinouCacheSlot>
      <DinouCacheSlot id="s2-healthy" tag="s2-healthy-tag" revalidate={3600}>
        {async () => <span id="e-healthy">{readS().errHealthy}</span>}
      </DinouCacheSlot>
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
      `Stage 2 fixture build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    const verifyScript = path.join(tmpApp, "verify-stage2.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const { revalidateTag } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/cache-revalidate.js")).href
      )});
setStorageAdapter(new FileSystemStorage(path.resolve(".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
};
const writeS = (patch) => {
  const f = path.resolve("s2-state.json");
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const get = async (u, headers = {}) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u, { headers }), opts);
  assert.equal(r.status, 200, "Expected 200 for " + u);
  return await r.text();
};

// 1. 3-level nested slots: refresh middle via /____rsc_slot____ -> only middle updates
writeS({ deepHost: 999, deepOuter: 999, deepMid: 501, deepInner: 999 });
await get("/____rsc_slot____/s2-mid?fresh=1", { "x-dinou-current-path": "/deep" });
const deepHtml1 = await get("/deep");
assert.equal(textById(deepHtml1, "d-host"), "100");
assert.equal(textById(deepHtml1, "d-outer"), "100");
assert.equal(textById(deepHtml1, "d-mid"), "501");
assert.equal(textById(deepHtml1, "d-inner"), "100");

// Refresh outer via /____rsc_slot____ -> middle & inner stay frozen
writeS({ deepHost: 999, deepOuter: 502, deepMid: 999, deepInner: 999 });
await get("/____rsc_slot____/s2-outer?fresh=1", { "x-dinou-current-path": "/deep" });
const deepHtml2 = await get("/deep");
assert.equal(textById(deepHtml2, "d-host"), "100");
assert.equal(textById(deepHtml2, "d-outer"), "502");
assert.equal(textById(deepHtml2, "d-mid"), "501");
assert.equal(textById(deepHtml2, "d-inner"), "100");

// 2. Shared slot across route-a and route-b: refreshSlot triggered on route-a MUST propagate to route-b (SSR AND soft-nav page.rsc)!
writeS({ sharedHostA: 999, sharedHostB: 999, sharedSlot: 601 });
await get("/____rsc_slot____/s2-shared?fresh=1", { "x-dinou-current-path": "/shared-a" });
const htmlA = await get("/shared-a");
const rscB = await get("/____rsc_page____/shared-b");
assert.ok(rscB.includes("601") && !rscB.includes("999"), "soft-nav /____rsc_page____/shared-b MUST reflect refreshed shared slot without re-executing shared-b host!");
const htmlB = await get("/shared-b");
assert.equal(textById(htmlA, "sa-host"), "100", "shared-a host stays frozen");
assert.equal(textById(htmlA, "s-val"), "601", "shared-a shows refreshed shared slot");
assert.equal(textById(htmlB, "sb-host"), "100", "shared-b host stays frozen");
assert.equal(textById(htmlB, "s-val"), "601", "shared-b MUST reflect shared slot refreshed from route-a!");

// 3. Fragile slot error resilience on refreshSlot AND revalidateTag + clean recovery
writeS({ errHost: 999, errHealthy: 999, errFragile: 701, errThrow: true });
await get("/____rsc_slot____/s2-fragile?fresh=1", { "x-dinou-current-path": "/err" });
const errHtml1 = await get("/err");
assert.equal(textById(errHtml1, "e-host"), "100");
assert.equal(textById(errHtml1, "e-fragile"), "100", "refreshSlot error must fall back to cached 100");
assert.equal(textById(errHtml1, "e-healthy"), "100");

writeS({ errHost: 999, errHealthy: 999, errFragile: 702, errThrow: true });
await revalidateTag("s2-fragile-tag");
const errHtml2 = await get("/err");
assert.equal(textById(errHtml2, "e-host"), "100");
assert.equal(textById(errHtml2, "e-fragile"), "100", "revalidateTag error must keep last-known-good 100");
assert.equal(textById(errHtml2, "e-healthy"), "100");

// Subsequent refreshSlot while STILL throwing must STILL return 200 fallback (backup restored!) instead of 404
const stillThrowingSlotRsc = await get("/____rsc_slot____/s2-fragile?fresh=1", { "x-dinou-current-path": "/err" });
assert.ok(stillThrowingSlotRsc.includes("100"), "slot backup must survive failed revalidateTag so subsequent refreshSlot still falls back to 100");

writeS({ errHost: 999, errHealthy: 999, errFragile: 703, errThrow: false });
await get("/____rsc_slot____/s2-fragile?fresh=1", { "x-dinou-current-path": "/err" });
const errHtml3 = await get("/err");
assert.equal(textById(errHtml3, "e-host"), "100");
assert.equal(textById(errHtml3, "e-fragile"), "703", "recovered fragile slot must persist");
assert.equal(textById(errHtml3, "e-healthy"), "100");

console.log("STAGE2_AXIS_Y_OK");
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
      `Stage 2 compiled integration failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("STAGE2_AXIS_Y_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("12. Stage 3 Axis Z compiled Node AOT integration: 12-way PPR 1s shell TTL stampede causal snapshot, hole error isolation & hole redirect()", async () => {
  const tmpApp = createFixtureDir("tmp-3d-stage3-");
  try {
    for (const relDir of [
      "src/stampede",
      "src/edge-hole",
      "src/target",
    ]) {
      fs.mkdirSync(path.join(tmpApp, relDir), { recursive: true });
    }

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "cube-3d-stage3-fixture", private: true, type: "module" }, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
          },
        },
        null,
        2
      )
    );
    writeDinouShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "src", "state.ts"),
      `import fs from "node:fs";
import path from "node:path";
const FILE = path.resolve(process.cwd(), "s3-state.json");
const DEF = { stampShell: 100, stampHole: 100, edgeShell: 100, edgeHoleA: 100 };
export function readS() {
  try { if (fs.existsSync(FILE)) return { ...DEF, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
  return { ...DEF };
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export function incStampExec() {
  const k = Symbol.for("s3.stamp.exec");
  (globalThis as any)[k] = Number((globalThis as any)[k] || 0) + 1;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import type { ReactNode } from "react";
export default function Root({ children }: { children: ReactNode }) {
  return <html><head><title>S3</title></head><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `export default function Home() { return <main>home</main>; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/target/page.tsx"),
      `export default function Target() { return <main id="redir-target">landed</main>; }\n`
    );

    // 1. 1s PPR shell TTL stampede route
    fs.writeFileSync(
      path.join(tmpApp, "src/stampede/page_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 1;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/stampede/page.tsx"),
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { readS, sleep, incStampExec } from "../state";

async function Hole() {
  await sleep(25);
  return <span id="st-hole">{readS().stampHole}</span>;
}

export default async function StampedePage() {
  const ctx = getContext() as any;
  const isBuild = Boolean(ctx?._isStaticHtmlRender || ctx?.platformContext?.isSSG) && !ctx?._isPprRuntimeResume;
  if (isBuild) {
    incStampExec();
    await sleep(40);
  }
  return (
    <main>
      <span id="st-shell">{readS().stampShell}</span>
      <Suspense fallback={<span>fb</span>}>
        <Hole />
      </Suspense>
    </main>
  );
}
`
    );

    // 2. PPR hole error + redirect route
    fs.writeFileSync(
      path.join(tmpApp, "src/edge-hole/page_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/edge-hole/page.tsx"),
      `import { Suspense } from "react";
import { getContext, redirect } from "dinou";
import { readS, sleep } from "../state";

async function HoleA() {
  const ok = String(getContext()?.req?.query?.ok || "def");
  await sleep(15);
  return <span id="eh-a">{\`\${ok}-\${readS().edgeHoleA}\`}</span>;
}

async function HoleB() {
  const ctx = getContext();
  const q = ctx?.req?.query || {};
  await sleep(15);
  if (q.fail === "1") throw new Error("boom-ppr-hole");
  if (q.redir === "1") return redirect("/target");
  if (q.impRedir === "1") {
    ctx?.res?.redirect?.("/target");
    return null;
  }
  return <span id="eh-b">ok-b</span>;
}

export default function EdgeHolePage() {
  return (
    <main>
      <span id="eh-shell">{readS().edgeShell}</span>
      <Suspense fallback={<span>fa</span>}><HoleA /></Suspense>
      <Suspense fallback={<span>fb</span>}><HoleB /></Suspense>
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
      `Stage 3 fixture build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    const verifyScript = path.join(tmpApp, "verify-stage3.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
setStorageAdapter(new FileSystemStorage(path.resolve(".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const writeS = (patch) => {
  const f = path.resolve("s3-state.json");
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const get = async (u) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u), opts);
  assert.equal(r.status, 200, "Expected 200 for " + u);
  return await r.text();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. 12-way concurrent stampede during 1s PPR shell TTL expiry
globalThis[Symbol.for("s3.stamp.exec")] = 0;
writeS({ stampShell: 741, stampHole: 742 });
await sleep(1250);

const bodies = await Promise.all(
  Array.from({ length: 12 }, () => get("/stampede"))
);
for (let i = 0; i < bodies.length; i++) {
  const html = bodies[i];
  const m = html.match(/id="st-shell"[^>]*>(\\d+)</);
  assert.ok(m, "Missing st-shell in resp " + i);
  const ssrVal = m[1];
  assert.ok(ssrVal === "100" || ssrVal === "741", "Unexpected SSR val " + ssrVal);
  assert.ok(html.includes('id="st-hole">742<'), "Missing live hole 742 in resp " + i);
  const pushes = [...html.matchAll(/__DINOU_RSC_P__\\|\\|\\[\\]\\)\\.push\\((.+?)\\);/g)].map((x) => x[1]).join("\\n");
  assert.ok(pushes.length > 0, "Missing inline __DINOU_RSC_P__ in resp " + i);
  if (ssrVal === "100") {
    assert.ok(pushes.includes("100") && !pushes.includes("741"), "Causal mismatch on stale resp " + i);
  } else {
    assert.ok(pushes.includes("741") && !pushes.includes("100"), "Causal mismatch on fresh resp " + i);
  }
}

await sleep(400);
assert.equal(globalThis[Symbol.for("s3.stamp.exec")], 1, "Stampede dedup must run shell regen exactly once!");
const postHtml = await get("/stampede");
assert.ok(postHtml.includes('id="st-shell">741<'), "Post-SWR shell must be 741");

// 2. Hole B error isolation + inline RSC preservation + recovery
writeS({ edgeShell: 999, edgeHoleA: 801 });
const errHtml = await get("/edge-hole?ok=healthy&fail=1");
assert.ok(errHtml.includes('id="eh-shell">100<'), "Static shell stays frozen 100");
assert.ok(errHtml.includes('id="eh-a">healthy-801<'), "Healthy sibling Hole A still streams");
assert.ok(errHtml.includes("[PPR Error:"), "Hole B error isolated into error markup");
assert.ok(errHtml.includes("__DINOU_RSC_P__"), "Inline RSC must STILL be emitted when one hole errors so healthy shell/siblings hydrate with 0 #418!");

const recHtml = await get("/edge-hole?ok=recovered");
assert.ok(recHtml.includes('id="eh-shell">100<'), "Shell intact after error");
assert.ok(recHtml.includes('id="eh-a">recovered-801<'));
assert.ok(recHtml.includes('id="eh-b">ok-b<'));

// 3. Declarative redirect() and imperative ctx.res.redirect() inside PPR dynamic hole
const redirHtml = await get("/edge-hole?redir=1");
assert.ok(
  redirHtml.includes("/target") && (redirHtml.includes("ClientRedirect") || redirHtml.includes("window.location")),
  "Declarative return redirect() in PPR hole must emit redirect payload"
);

const impRedirHtml = await get("/edge-hole?impRedir=1");
assert.ok(
  impRedirHtml.includes("window.location") && impRedirHtml.includes("/target"),
  "Imperative ctx.res.redirect() inside PPR hole MUST emit client redirect script after shellPrelude flushed!"
);

console.log("STAGE3_AXIS_Z_OK");
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
      `Stage 3 compiled integration failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("STAGE3_AXIS_Z_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("13. Stage 4 Pairwise (X+Y, X+Z, Y+Z) compiled Node AOT integration: slot inside dynamic L2, L1 PPR -> L2 Dynamic -> Page PPR, 1s PPR L1 TTL & nested slots inside PPR hole", async () => {
  const tmpApp = createFixtureDir("tmp-3d-stage4-");
  try {
    for (const relDir of [
      "src/xy/dyn-l2",
      "src/xz/dyn-l2",
      "src/xz-ttl/l2",
      "src/yz",
    ]) {
      fs.mkdirSync(path.join(tmpApp, relDir), { recursive: true });
    }

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "cube-3d-stage4-fixture", private: true, type: "module" }, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
          },
        },
        null,
        2
      )
    );
    writeDinouShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "src", "state.ts"),
      `import fs from "node:fs";
import path from "node:path";
const FILE = path.resolve(process.cwd(), "s4-state.json");
const DEF = {
  xyL1: 100, xyL2: 100, xyL2Slot: 100, xyPage: 100,
  xzL1Shell: 100, xzL1Hole: 100, xzDynL2: 100, xzPageShell: 100, xzPageStatic: 100, xzPageHole: 100,
  xztL1Shell: 100, xztL1Hole: 100, xztL2Shell: 100, xztL2Hole: 100, xztPageShell: 100, xztPageHole: 100,
  yzShell: 100, yzHoleHost: 100, yzOuter: 100, yzInner: 100, yzInnerTtl: 100,
};
export function readS() {
  try { if (fs.existsSync(FILE)) return { ...DEF, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
  return { ...DEF };
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import type { ReactNode } from "react";
export default function Root({ children }: { children: ReactNode }) {
  return <html><head><title>S4</title></head><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `export default function Home() { return <main>home</main>; }\n`
    );

    // 1. Check #56 (X+Y Asymmetric)
    fs.writeFileSync(path.join(tmpApp, "src/xy/layout_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/xy/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../state";
export default function XyL1({ children }: { children: ReactNode }) {
  return <section><span id="xy-l1">{readS().xyL1}</span>{children}</section>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/xy/dyn-l2/layout_functions.ts"), `export const revalidate = 0;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/xy/dyn-l2/layout.tsx"),
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../../state";
export default function XyDynL2({ children }: { children: ReactNode }) {
  return (
    <div>
      <span id="xy-l2">{readS().xyL2}</span>
      <DinouCacheSlot id="s4-xy-l2-slot" revalidate={3600}>
        {async () => <span id="xy-l2-slot">{readS().xyL2Slot}</span>}
      </DinouCacheSlot>
      {children}
    </div>
  );
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/xy/dyn-l2/page_functions.ts"), `export const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/xy/dyn-l2/page.tsx"),
      `import { readS } from "../../state";
export default function XyPage() { return <main><span id="xy-page">{readS().xyPage}</span></main>; }
`
    );

    // 2. Check #57 (X+Z Asymmetric: L1 PPR -> L2 Dynamic -> Page PPR)
    fs.writeFileSync(path.join(tmpApp, "src/xz/layout_functions.ts"), `export const ppr = true;\nexport const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/xz/layout.tsx"),
      `import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { readS, sleep } from "../state";
async function L1Hole() {
  const u = String(getContext()?.req?.cookies?.u || "anon");
  await sleep(10);
  return <span id="xz-l1-h">{\`\${u}-\${readS().xzL1Hole}\`}</span>;
}
export default function XzL1({ children }: { children: ReactNode }) {
  return <section><span id="xz-l1-s">{readS().xzL1Shell}</span><Suspense fallback={<span>f1</span>}><L1Hole /></Suspense>{children}</section>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/xz/dyn-l2/layout_functions.ts"), `export const revalidate = 0;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/xz/dyn-l2/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function XzDynL2({ children }: { children: ReactNode }) {
  return <div><span id="xz-l2">{readS().xzDynL2}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/xz/dyn-l2/page_functions.ts"), `export const ppr = true;\nexport const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/xz/dyn-l2/page.tsx"),
      `import { Suspense } from "react";
import { getContext, noDynamic } from "dinou";
import { readS, sleep } from "../../state";
async function StaticSusp() {
  noDynamic();
  await sleep(5);
  return <span id="xz-p-st">{readS().xzPageStatic}</span>;
}
async function PageHole() {
  const m = String(getContext()?.req?.query?.m || "std");
  await sleep(10);
  return <span id="xz-p-h">{\`\${m}-\${readS().xzPageHole}\`}</span>;
}
export default function XzPage() {
  return (
    <main>
      <span id="xz-p-s">{readS().xzPageShell}</span>
      <Suspense fallback={<span>fs</span>}><StaticSusp /></Suspense>
      <Suspense fallback={<span>fp</span>}><PageHole /></Suspense>
    </main>
  );
}
`
    );

    // 3. Check #58 (X+Z Per-Level TTL: L1 PPR 1s -> L2 PPR 3600s -> Page PPR 3600s)
    fs.writeFileSync(path.join(tmpApp, "src/xz-ttl/layout_functions.ts"), `export const ppr = true;\nexport const revalidate = 1;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/xz-ttl/layout.tsx"),
      `import { Suspense, type ReactNode } from "react";
import { readS, sleep } from "../state";
async function H1() { await sleep(10); return <span id="xzt-l1-h">{readS().xztL1Hole}</span>; }
export default function XztL1({ children }: { children: ReactNode }) {
  return <section><span id="xzt-l1-s">{readS().xztL1Shell}</span><Suspense fallback={<span>f</span>}><H1 /></Suspense>{children}</section>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/xz-ttl/l2/layout_functions.ts"), `export const ppr = true;\nexport const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/xz-ttl/l2/layout.tsx"),
      `import { Suspense, type ReactNode } from "react";
import { readS, sleep } from "../../state";
async function H2() { await sleep(10); return <span id="xzt-l2-h">{readS().xztL2Hole}</span>; }
export default function XztL2({ children }: { children: ReactNode }) {
  return <div><span id="xzt-l2-s">{readS().xztL2Shell}</span><Suspense fallback={<span>f</span>}><H2 /></Suspense>{children}</div>;
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/xz-ttl/l2/page_functions.ts"), `export const ppr = true;\nexport const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/xz-ttl/l2/page.tsx"),
      `import { Suspense } from "react";
import { readS, sleep } from "../../state";
async function HP() { await sleep(10); return <span id="xzt-p-h">{readS().xztPageHole}</span>; }
export default function XztPage() {
  return <main><span id="xzt-p-s">{readS().xztPageShell}</span><Suspense fallback={<span>f</span>}><HP /></Suspense></main>;
}
`
    );

    // 4. Check #59 (Y+Z Nested <DinouCacheSlot> inside PPR dynamic hole)
    fs.writeFileSync(path.join(tmpApp, "src/yz/page_functions.ts"), `export const ppr = true;\nexport const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/yz/page.tsx"),
      `import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../state";
async function HoleSlots() {
  await sleep(10);
  return (
    <div>
      <span id="yz-hh">{readS().yzHoleHost}</span>
      <DinouCacheSlot id="s4-yz-outer" revalidate={3600}>
        {async () => (
          <div>
            <span id="yz-o">{readS().yzOuter}</span>
            <DinouCacheSlot id="s4-yz-inner" revalidate={3600}>
              {async () => <span id="yz-i">{readS().yzInner}</span>}
            </DinouCacheSlot>
            <DinouCacheSlot id="s4-yz-inner-ttl" revalidate={1}>
              {async () => <span id="yz-it">{readS().yzInnerTtl}</span>}
            </DinouCacheSlot>
          </div>
        )}
      </DinouCacheSlot>
    </div>
  );
}
export default function YzPage() {
  return <main><span id="yz-s">{readS().yzShell}</span><Suspense fallback={<span>f</span>}><HoleSlots /></Suspense></main>;
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
      `Stage 4 fixture build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    const verifyScript = path.join(tmpApp, "verify-stage4.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const { revalidatePage, revalidateLayout } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/cache-revalidate.js")).href
      )});
setStorageAdapter(new FileSystemStorage(path.resolve(".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
};
const writeS = (patch) => {
  const f = path.resolve("s4-state.json");
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const get = async (u, headers = {}) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u, { headers }), opts);
  assert.equal(r.status, 200, "Expected 200 for " + u);
  return await r.text();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Check #56 (X+Y Asymmetric): L2 slot stays cached while L2 host executes live
writeS({ xyL1: 999, xyL2: 501, xyL2Slot: 999, xyPage: 999 });
const xy1 = await get("/xy/dyn-l2");
assert.equal(textById(xy1, "xy-l1"), "100");
assert.equal(textById(xy1, "xy-l2"), "501");
assert.equal(textById(xy1, "xy-l2-slot"), "100");
assert.equal(textById(xy1, "xy-page"), "100");

writeS({ xyL1: 999, xyL2: 502, xyL2Slot: 601, xyPage: 999 });
await get("/____rsc_slot____/s4-xy-l2-slot?fresh=1", { "x-dinou-current-path": "/xy/dyn-l2" });
const xy2 = await get("/xy/dyn-l2");
assert.equal(textById(xy2, "xy-l2"), "502");
assert.equal(textById(xy2, "xy-l2-slot"), "601");
assert.equal(textById(xy2, "xy-l1"), "100");
assert.equal(textById(xy2, "xy-page"), "100");

// 2. Check #57 (X+Z Asymmetric): L1 PPR -> L2 Dynamic -> Page PPR
// SSG must have persisted shell.page.json for Page PPR without caching L2!
assert.equal(
  fs.existsSync(path.resolve(".dinou/dist2/xz/dyn-l2/shell.page.json")),
  true,
  "PPR Page under dynamic L2 MUST persist shell.page.json at SSG"
);
assert.equal(
  fs.existsSync(path.resolve(".dinou/dist2/xz/dyn-l2/layout.rsc")),
  false,
  "Dynamic L2 must NEVER freeze layout.rsc"
);

writeS({ xzL1Shell: 999, xzPageShell: 999, xzPageStatic: 999, xzL1Hole: 701, xzDynL2: 702, xzPageHole: 703 });
const xz1 = await get("/xz/dyn-l2?m=omega", { cookie: "u=vega" });
assert.equal(textById(xz1, "xz-l1-s"), "100", "L1 PPR static shell MUST stay frozen 100");
assert.equal(textById(xz1, "xz-l1-h"), "vega-701", "L1 PPR hole streams live");
assert.equal(textById(xz1, "xz-l2"), "702", "Dynamic L2 executes live");
assert.equal(textById(xz1, "xz-p-s"), "100", "Page PPR static shell MUST stay frozen 100");
assert.equal(textById(xz1, "xz-p-st"), "100", "Page noDynamic() static Suspense MUST stay frozen 100");
assert.equal(textById(xz1, "xz-p-h"), "omega-703", "Page PPR hole streams live");

// revalidatePage updates ONLY Page shell without caching L2 or re-executing L1 shell
writeS({ xzL1Shell: 999, xzPageShell: 704, xzPageStatic: 705, xzDynL2: 706 });
await revalidatePage("/xz/dyn-l2");
const xz2 = await get("/xz/dyn-l2?m=omega", { cookie: "u=vega" });
assert.equal(textById(xz2, "xz-l1-s"), "100");
assert.equal(textById(xz2, "xz-l2"), "706");
assert.equal(textById(xz2, "xz-p-s"), "704");
assert.equal(textById(xz2, "xz-p-st"), "705");

// revalidateLayout(L1) updates ONLY L1 shell while Page shell stays frozen & L2 dynamic
writeS({ xzL1Shell: 707, xzPageShell: 999, xzPageStatic: 999, xzDynL2: 708 });
await revalidateLayout("/xz");
const xz3 = await get("/xz/dyn-l2?m=omega", { cookie: "u=vega" });
assert.equal(textById(xz3, "xz-l1-s"), "707");
assert.equal(textById(xz3, "xz-l2"), "708");
assert.equal(textById(xz3, "xz-p-s"), "704");
assert.equal(textById(xz3, "xz-p-st"), "705");

// 3. Check #58 (X+Z Per-Level TTL): 1s PPR L1 expires without re-executing L2 or Page shells
writeS({ xztL1Shell: 801, xztL2Shell: 999, xztPageShell: 999, xztL1Hole: 802, xztL2Hole: 803, xztPageHole: 804 });
await sleep(1250);
const xzt1 = await get("/xz-ttl/l2");
assert.equal(textById(xzt1, "xzt-l2-s"), "100");
assert.equal(textById(xzt1, "xzt-p-s"), "100");
await sleep(300);
const xzt2 = await get("/xz-ttl/l2");
assert.equal(textById(xzt2, "xzt-l1-s"), "801", "L1 PPR 1s shell updated");
assert.equal(textById(xzt2, "xzt-l2-s"), "100", "L2 PPR 3600s shell stayed frozen");
assert.equal(textById(xzt2, "xzt-p-s"), "100", "Page PPR 3600s shell stayed frozen");
assert.equal(textById(xzt2, "xzt-l1-h"), "802");
assert.equal(textById(xzt2, "xzt-l2-h"), "803");
assert.equal(textById(xzt2, "xzt-p-h"), "804");

// 4. Check #59 (Y+Z Nested <DinouCacheSlot> inside PPR dynamic hole + 1s nested TTL across repeated cycles!)
await get("/yz"); // warm hole slots
writeS({ yzShell: 999, yzHoleHost: 901, yzOuter: 902, yzInner: 999, yzInnerTtl: 903 });
await sleep(1150);
// Refresh outer via /____rsc_slot____ after inner-ttl expired -> MUST NOT poison inStaticShell:true onto inner-ttl!
await get("/____rsc_slot____/s4-yz-outer?fresh=1", { "x-dinou-current-path": "/yz" });
const yz2 = await get("/yz");
assert.equal(textById(yz2, "yz-s"), "100");
assert.equal(textById(yz2, "yz-hh"), "901");
assert.equal(textById(yz2, "yz-o"), "902");
assert.equal(textById(yz2, "yz-i"), "100", "Nested inner slot inside PPR hole stays frozen on outer refresh!");

// Now mutate inner-ttl again and wait past 1s TTL -> MUST update on second cycle (Firefox CI regression guard!)
writeS({ yzShell: 999, yzOuter: 999, yzInner: 999, yzInnerTtl: 904 });
await sleep(1150);
const yz3 = await get("/yz");
assert.equal(textById(yz3, "yz-s"), "100");
assert.equal(textById(yz3, "yz-o"), "902");
assert.equal(textById(yz3, "yz-i"), "100");
assert.equal(textById(yz3, "yz-it"), "904", "1s nested TTL slot inside PPR dynamic hole must NEVER get stuck stale after /____rsc_slot____!");

console.log("STAGE4_PAIRWISE_OK");
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
      `Stage 4 compiled integration failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("STAGE4_PAIRWISE_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("14. Stage 5 Triple Synergy (X+Y+Z) compiled Node AOT integration: L1 PPR+Slot -> L2 Dyn+Slot -> L3 PPR+Slot -> Page PPR+Hole+Slot & shared multi-layer tag ordering", async () => {
  const tmpApp = createFixtureDir("tmp-3d-stage5-");
  try {
    for (const relDir of [
      "src/ta/dyn-l2/l3",
      "src/st/sibling",
      "src/ts-cascade",
    ]) {
      fs.mkdirSync(path.join(tmpApp, relDir), { recursive: true });
    }

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "cube-3d-stage5-fixture", private: true, type: "module" }, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
          },
        },
        null,
        2
      )
    );
    writeDinouShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "src", "state.ts"),
      `import fs from "node:fs";
import path from "node:path";
const FILE = path.resolve(process.cwd(), "s5-state.json");
const DEF = {
  taL1S: 100, taL1Slot: 100, taL1H: 100,
  taL2H: 100, taL2Slot: 100,
  taL3S: 100, taL3Slot: 100, taL3H: 100,
  taPS: 100, taPSlot: 100, taPH: 100, taHSlot: 100,
  stL1: 100, stSlot: 100, stUnrel: 100, stPage: 100, stHole: 100, stSib: 100,
};
export function readS() {
  try { if (fs.existsSync(FILE)) return { ...DEF, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
  return { ...DEF };
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import type { ReactNode } from "react";
export default function Root({ children }: { children: ReactNode }) {
  return <html><head><title>S5</title></head><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `export default function Home() { return <main>home</main>; }\n`
    );

    // 1. Check #60: L1 PPR+Slot -> L2 Dyn+Slot -> L3 PPR+Slot -> Page PPR+Hole+Slot
    fs.writeFileSync(path.join(tmpApp, "src/ta/layout_functions.ts"), `export const ppr = true;\nexport const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/ta/layout.tsx"),
      `import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../state";
async function L1H() {
  const u = String(getContext()?.req?.cookies?.u || "anon");
  await sleep(10);
  return <span id="ta-l1-h">{\`\${u}-\${readS().taL1H}\`}</span>;
}
export default function TaL1({ children }: { children: ReactNode }) {
  return (
    <section>
      <span id="ta-l1-s">{readS().taL1S}</span>
      <DinouCacheSlot id="s5-l1-slot" revalidate={3600}>{async () => <span id="ta-l1-sl">{readS().taL1Slot}</span>}</DinouCacheSlot>
      <Suspense fallback={<span>f1</span>}><L1H /></Suspense>
      {children}
    </section>
  );
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/ta/dyn-l2/layout_functions.ts"), `export const revalidate = 0;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/ta/dyn-l2/layout.tsx"),
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../../state";
export default function TaL2({ children }: { children: ReactNode }) {
  return (
    <div>
      <span id="ta-l2-h">{readS().taL2H}</span>
      <DinouCacheSlot id="s5-l2-slot" revalidate={3600}>{async () => <span id="ta-l2-sl">{readS().taL2Slot}</span>}</DinouCacheSlot>
      {children}
    </div>
  );
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/ta/dyn-l2/l3/layout_functions.ts"), `export const ppr = true;\nexport const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/ta/dyn-l2/l3/layout.tsx"),
      `import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../../../state";
async function L3H() {
  const q = String(getContext()?.req?.query?.q3 || "std");
  await sleep(10);
  return <span id="ta-l3-h">{\`\${q}-\${readS().taL3H}\`}</span>;
}
export default function TaL3({ children }: { children: ReactNode }) {
  return (
    <div>
      <span id="ta-l3-s">{readS().taL3S}</span>
      <DinouCacheSlot id="s5-l3-slot" revalidate={3600}>{async () => <span id="ta-l3-sl">{readS().taL3Slot}</span>}</DinouCacheSlot>
      <Suspense fallback={<span>f3</span>}><L3H /></Suspense>
      {children}
    </div>
  );
}
`
    );
    fs.writeFileSync(path.join(tmpApp, "src/ta/dyn-l2/l3/page_functions.ts"), `export const ppr = true;\nexport const revalidate = 3600;\n`);
    fs.writeFileSync(
      path.join(tmpApp, "src/ta/dyn-l2/l3/page.tsx"),
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../../../state";
async function PH() {
  const pm = String(getContext()?.req?.query?.pm || "base");
  await sleep(10);
  return (
    <div>
      <span id="ta-p-h">{\`\${pm}-\${readS().taPH}\`}</span>
      <DinouCacheSlot id="s5-h-slot" revalidate={3600}>{async () => <span id="ta-h-sl">{readS().taHSlot}</span>}</DinouCacheSlot>
    </div>
  );
}
export default function TaPage() {
  return (
    <main>
      <span id="ta-p-s">{readS().taPS}</span>
      <DinouCacheSlot id="s5-p-slot" revalidate={3600}>{async () => <span id="ta-p-sl">{readS().taPSlot}</span>}</DinouCacheSlot>
      <Suspense fallback={<span>fp</span>}><PH /></Suspense>
    </main>
  );
}
`
    );

    // 2. Check #61: Shared multi-layer tag across Layout + Page + Slot
    fs.writeFileSync(
      path.join(tmpApp, "src/st/layout_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\nexport function getCacheTags() { return ["s5-all", "s5-l1"]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/st/layout.tsx"),
      `import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../state";
export default function StL1({ children }: { children: ReactNode }) {
  return (
    <section>
      <span id="st-l1">{readS().stL1}</span>
      <DinouCacheSlot id="s5-st-slot" tags={["s5-all", "s5-slot-only"]} revalidate={3600}>{async () => <span id="st-sl">{readS().stSlot}</span>}</DinouCacheSlot>
      <DinouCacheSlot id="s5-st-unrel" tags={["s5-unrel"]} revalidate={3600}>{async () => <span id="st-un">{readS().stUnrel}</span>}</DinouCacheSlot>
      {children}
    </section>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/st/page_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\nexport function getCacheTags() { return ["s5-all", "s5-page"]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/st/page.tsx"),
      `import { Suspense } from "react";
import { readS, sleep } from "../state";
async function StH() { await sleep(10); return <span id="st-h">{readS().stHole}</span>; }
export default function StPage() {
  return <main><span id="st-p">{readS().stPage}</span><Suspense fallback={<span>f</span>}><StH /></Suspense></main>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/st/sibling/page_functions.ts"),
      `export const ppr = false;\nexport const revalidate = 3600;\nexport function getCacheTags() { return ["s5-sib"]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/st/sibling/page.tsx"),
      `import { readS } from "../../state";
export default function StSib() { return <main><span id="st-sib">{readS().stSib}</span></main>; }
`
    );

    // 3. Same-millisecond revalidatePath (Bun/Linux CI #418 regression guard)
    fs.writeFileSync(
      path.join(tmpApp, "src/ts-cascade/layout_functions.ts"),
      `export const revalidate = 1000000;\nexport function getCacheTags() { return ["ts-lay"]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/ts-cascade/layout.tsx"),
      `import type { ReactNode } from "react";
export default function TsCascadeLayout({ children }: { children: ReactNode }) {
  return <div id="ts-wrap"><span id="ts-l">{new Date().toISOString()}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/ts-cascade/page_functions.ts"),
      `export const revalidate = 1000000;\nexport function getCacheTags() { return ["ts-pg"]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/ts-cascade/page.tsx"),
      `export default function TsCascadePage() {
  return <main><span id="ts-p">{new Date().toISOString()}</span></main>;
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
      `Stage 5 fixture build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    const verifyScript = path.join(tmpApp, "verify-stage5.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const { revalidateLayout, revalidateTag, revalidatePath } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/cache-revalidate.js")).href
      )});
setStorageAdapter(new FileSystemStorage(path.resolve(".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([^<]*)<'));
  return m ? m[1] : null;
};
const writeS = (patch) => {
  const f = path.resolve("s5-state.json");
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const get = async (u, headers = {}) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u, { headers }), opts);
  assert.equal(r.status, 200, "Expected 200 for " + u);
  return await r.text();
};

// 1. Check #60: Ultimate Asymmetric Triple Synergy
await get("/ta/dyn-l2/l3?q3=init&pm=init", { cookie: "u=init" }); // warm hole slot
writeS({
  taL1S: 999, taL1Slot: 999, taL1H: 501,
  taL2H: 502, taL2Slot: 999,
  taL3S: 999, taL3Slot: 999, taL3H: 503,
  taPS: 999, taPSlot: 999, taPH: 504, taHSlot: 999,
});
const ta1 = await get("/ta/dyn-l2/l3?q3=apex&pm=quasar", { cookie: "u=altair" });
assert.equal(textById(ta1, "ta-l1-s"), "100");
assert.equal(textById(ta1, "ta-l1-sl"), "100");
assert.equal(textById(ta1, "ta-l1-h"), "altair-501");
assert.equal(textById(ta1, "ta-l2-h"), "502");
assert.equal(textById(ta1, "ta-l2-sl"), "100");
assert.equal(textById(ta1, "ta-l3-s"), "100");
assert.equal(textById(ta1, "ta-l3-sl"), "100");
assert.equal(textById(ta1, "ta-l3-h"), "apex-503");
assert.equal(textById(ta1, "ta-p-s"), "100");
assert.equal(textById(ta1, "ta-p-sl"), "100");
assert.equal(textById(ta1, "ta-p-h"), "quasar-504");
assert.equal(textById(ta1, "ta-h-sl"), "100");

// Refresh ALL 5 slots (including L3 slot under dynamic L2!) while keeping ALL 3 static shells poisoned 999!
writeS({
  taL1S: 999, taL1Slot: 601,
  taL2H: 602, taL2Slot: 603,
  taL3S: 999, taL3Slot: 604,
  taPS: 999, taPSlot: 605, taHSlot: 606,
});
for (const sid of ["s5-l1-slot", "s5-l2-slot", "s5-l3-slot", "s5-p-slot", "s5-h-slot"]) {
  await get("/____rsc_slot____/" + sid + "?fresh=1", { "x-dinou-current-path": "/ta/dyn-l2/l3" });
}
const ta2 = await get("/ta/dyn-l2/l3?q3=apex&pm=quasar", { cookie: "u=altair" });
assert.equal(textById(ta2, "ta-l1-s"), "100", "L1 shell stayed frozen during 5-slot refresh");
assert.equal(textById(ta2, "ta-l1-sl"), "601");
assert.equal(textById(ta2, "ta-l2-h"), "602");
assert.equal(textById(ta2, "ta-l2-sl"), "603");
assert.equal(textById(ta2, "ta-l3-s"), "100", "L3 shell under dynamic L2 MUST stay frozen when refreshing L3 slot!");
assert.equal(textById(ta2, "ta-l3-sl"), "604");
assert.equal(textById(ta2, "ta-p-s"), "100");
assert.equal(textById(ta2, "ta-p-sl"), "605");
assert.equal(textById(ta2, "ta-h-sl"), "606");

// Surgical revalidateLayout(L3) updates ONLY L3 shell while preserving L1/Page shells & all 5 slots
writeS({
  taL1S: 999, taL1Slot: 999, taL2H: 702, taL2Slot: 999,
  taL3S: 703, taL3Slot: 999, taPS: 999, taPSlot: 999, taHSlot: 999,
});
await revalidateLayout("/ta/dyn-l2/l3");
const ta3 = await get("/ta/dyn-l2/l3?q3=apex&pm=quasar", { cookie: "u=altair" });
assert.equal(textById(ta3, "ta-l1-s"), "100");
assert.equal(textById(ta3, "ta-l1-sl"), "601");
assert.equal(textById(ta3, "ta-l2-h"), "702");
assert.equal(textById(ta3, "ta-l2-sl"), "603");
assert.equal(textById(ta3, "ta-l3-s"), "703");
assert.equal(textById(ta3, "ta-l3-sl"), "604");
assert.equal(textById(ta3, "ta-p-s"), "100");
assert.equal(textById(ta3, "ta-p-sl"), "605");
assert.equal(textById(ta3, "ta-h-sl"), "606");

// 2. Check #61: Shared multi-layer tag across Layout + Page + Slot
writeS({ stL1: 801, stSlot: 802, stUnrel: 999, stPage: 803, stHole: 804, stSib: 999 });
await revalidateTag("s5-all");
const st1 = await get("/st");
assert.equal(textById(st1, "st-l1"), "801");
assert.equal(textById(st1, "st-sl"), "802", "Shared slot MUST update BEFORE layout/page in revalidateTag!");
assert.equal(textById(st1, "st-un"), "100", "Unrelated slot stays frozen");
assert.equal(textById(st1, "st-p"), "803");
assert.equal(textById(st1, "st-h"), "804");

const sib1 = await get("/st/sibling");
assert.equal(textById(sib1, "st-l1"), "801");
assert.equal(textById(sib1, "st-sl"), "802");
assert.equal(textById(sib1, "st-un"), "100");
assert.equal(textById(sib1, "st-sib"), "100", "Unrelated sibling page stays frozen");

// 3. Same-millisecond revalidatePath (revalidateLayout + revalidatePage in same ms -> zero #418 mismatch!)
const origNow = Date.now;
const frozenMs = origNow() + 10000;
Date.now = () => frozenMs;
try {
  await revalidatePath("/ts-cascade");
} finally {
  Date.now = origNow;
}
const tsHtml = await get("/ts-cascade");
const tsLayoutRsc = fs.readFileSync(path.resolve(".dinou/dist2/ts-cascade/layout.rsc"), "utf8");
const tsPageRsc = fs.readFileSync(path.resolve(".dinou/dist2/ts-cascade/page.rsc"), "utf8");
const htmlLayoutTs = textById(tsHtml, "ts-l");
const htmlPageTs = textById(tsHtml, "ts-p");
const rscLayoutTs = (tsLayoutRsc.match(/\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z/) || [])[0];
const rscPageTs = (tsPageRsc.match(/\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z/) || [])[0];
assert.ok(htmlLayoutTs && rscLayoutTs, "Expected ISO timestamps in layout HTML & layout.rsc");
assert.ok(htmlPageTs && rscPageTs, "Expected ISO timestamps in page HTML & page.rsc");
assert.equal(
  htmlLayoutTs,
  rscLayoutTs,
  "Same-ms revalidatePage MUST NOT overwrite layout ISO timestamp in index.html (causes React #418)!"
);
assert.equal(
  htmlPageTs,
  rscPageTs,
  "Same-ms revalidatePage HTML page timestamp MUST match page.rsc!"
);

console.log("STAGE5_TRIPLE_SYNERGY_OK");
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
      `Stage 5 compiled integration failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("STAGE5_TRIPLE_SYNERGY_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("15. Phase 3 Stage 1 (Check #62) compiled Node AOT integration: Dynamic [id] on-demand ISG under 3D Triple Synergy", async () => {
  const tmpApp = createFixtureDir("tmp-3d-p3-s1-");
  try {
    fs.mkdirSync(path.join(tmpApp, "src/isg/[id]"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify(
        {
          name: "tmp-3d-p3-s1",
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
const FILE = path.resolve(process.cwd(), "p3s1-state.json");
const DEF = {
  l1S: 100, l1Sl: 100, l1H: 100,
  aL2S: 100, aL2Sl: 100, aL2H: 100, aPS: 100, aPSl: 100, aPH: 100,
  bL2S: 100, bL2Sl: 100, bL2H: 100, bPS: 100, bPSl: 100, bPH: 100,
};
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
  return <html><head><title>P3S1</title></head><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/page.tsx"),
      `export default function Home() { return <main>home</main>; }\n`
    );

    // L1: PPR + Slot + Hole
    fs.writeFileSync(
      path.join(tmpApp, "src/isg/layout_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\nexport function getCacheTags() { return ["p3-l1"]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/isg/layout.tsx"),
      `import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../state";

async function L1H() {
  const u = String(getContext()?.req?.cookies?.u || "anon");
  await sleep(10);
  return <span id="l1-h">{\`\${u}-\${readS().l1H}\`}</span>;
}

export default function L1({ children }: { children: ReactNode }) {
  return (
    <section>
      <span id="l1-s">{readS().l1S}</span>
      <DinouCacheSlot id="p3-l1-slot" tag="p3-l1-slot-tag" revalidate={3600}>
        {async () => <span id="l1-sl">{readS().l1Sl}</span>}
      </DinouCacheSlot>
      <Suspense fallback={<span>f1</span>}><L1H /></Suspense>
      {children}
    </section>
  );
}
`
    );

    // L2 ([id]): PPR + Slot + Hole
    fs.writeFileSync(
      path.join(tmpApp, "src/isg/[id]/layout_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\nexport function getCacheTags({ id }: { id: string }) { return [\`p3-l2-\${id}\`]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/isg/[id]/layout.tsx"),
      `import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../../state";

async function L2H({ id }: { id: string }) {
  const v = String(getContext()?.req?.query?.v || "base");
  await sleep(10);
  const st = readS();
  const seq = id === "beta" ? st.bL2H : st.aL2H;
  return <span id="l2-h">{\`\${id}-\${v}-\${seq}\`}</span>;
}

export default function L2({ children, params }: { children: ReactNode; params: { id: string } }) {
  const id = String(params?.id || "unknown");
  const st = readS();
  const shellSeq = id === "beta" ? st.bL2S : st.aL2S;
  return (
    <section>
      <span id="l2-id">{id}</span>
      <span id="l2-s">{shellSeq}</span>
      <DinouCacheSlot id={\`p3-l2-slot-\${id}\`} tag={\`p3-l2-slot-tag-\${id}\`} revalidate={3600}>
        {async () => <span id="l2-sl">{id === "beta" ? readS().bL2Sl : readS().aL2Sl}</span>}
      </DinouCacheSlot>
      <Suspense fallback={<span>f2</span>}><L2H id={id} /></Suspense>
      {children}
    </section>
  );
}
`
    );

    // Page ([id]): PPR + Slot + Hole + allowISG = true + getStaticPaths = []
    fs.writeFileSync(
      path.join(tmpApp, "src/isg/[id]/page_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\nexport const allowISG = true;\nexport function getStaticPaths() { return []; }\nexport function getCacheTags({ id }: { id: string }) { return [\`p3-page-\${id}\`]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/isg/[id]/page.tsx"),
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../../state";

async function PH({ id }: { id: string }) {
  const p = String(getContext()?.req?.query?.p || "base");
  await sleep(10);
  const st = readS();
  const seq = id === "beta" ? st.bPH : st.aPH;
  return <span id="p-h">{\`\${id}-\${p}-\${seq}\`}</span>;
}

export default function Page({ params }: { params: { id: string } }) {
  const id = String(params?.id || "unknown");
  const st = readS();
  const shellSeq = id === "beta" ? st.bPS : st.aPS;
  return (
    <main>
      <span id="p-id">{id}</span>
      <span id="p-s">{shellSeq}</span>
      <DinouCacheSlot id={\`p3-p-slot-\${id}\`} tag={\`p3-p-slot-tag-\${id}\`} revalidate={3600}>
        {async () => <span id="p-sl">{id === "beta" ? readS().bPSl : readS().aPSl}</span>}
      </DinouCacheSlot>
      <Suspense fallback={<span>fp</span>}><PH id={id} /></Suspense>
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
      `Phase 3 Stage 1 fixture build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    // Confirm neither /isg/alpha nor /isg/beta was pre-rendered at SSG time
    assert.equal(fs.existsSync(path.join(tmpApp, ".dinou/dist2/isg/alpha/index.html")), false);
    assert.equal(fs.existsSync(path.join(tmpApp, ".dinou/dist2/isg/beta/index.html")), false);

    const verifyScript = path.join(tmpApp, "verify-p3s1.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
setStorageAdapter(new FileSystemStorage(path.resolve(".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
const { revalidateLayout } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/cache-revalidate.js")).href
      )});
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const writeS = (patch) => {
  const f = path.resolve("p3s1-state.json");
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const get = async (u, headers = {}) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u, { headers }), opts);
  assert.equal(r.status, 200, "Expected 200 for " + u);
  return await r.text();
};
const textById = (html, id) => {
  const m = html.match(new RegExp(\`id="\${id}"[^>]*>([^<]+)<\`));
  return m ? m[1] : null;
};

// 1. Cold on-demand ISG creation for /isg/alpha?v=1&p=p1 and /isg/beta?v=2&p=p2
const a1 = await get("/isg/alpha?v=1&p=p1", { cookie: "u=vega" });
assert.equal(textById(a1, "l1-s"), "100");
assert.equal(textById(a1, "l1-sl"), "100");
assert.equal(textById(a1, "l1-h"), "vega-100");
assert.equal(textById(a1, "l2-id"), "alpha");
assert.equal(textById(a1, "l2-s"), "100");
assert.equal(textById(a1, "l2-sl"), "100");
assert.equal(textById(a1, "l2-h"), "alpha-1-100");
assert.equal(textById(a1, "p-id"), "alpha");
assert.equal(textById(a1, "p-s"), "100");
assert.equal(textById(a1, "p-sl"), "100");
assert.equal(textById(a1, "p-h"), "alpha-p1-100");

const b1 = await get("/isg/beta?v=2&p=p2", { cookie: "u=vega" });
assert.equal(textById(b1, "l2-id"), "beta");
assert.equal(textById(b1, "l2-s"), "100");
assert.equal(textById(b1, "l2-h"), "beta-2-100");
assert.equal(textById(b1, "p-id"), "beta");
assert.equal(textById(b1, "p-s"), "100");
assert.equal(textById(b1, "p-h"), "beta-p2-100");

// Verify on-demand ISG persisted per-instance layout & page shell artifacts
assert.ok(fs.existsSync(path.resolve(".dinou/dist2/isg/alpha/shell.page.json")), "alpha shell.page.json must persist on cold ISG");
assert.ok(fs.existsSync(path.resolve(".dinou/dist2/isg/alpha/shell.layout.own.json")), "alpha shell.layout.own.json must persist on cold ISG");
assert.ok(fs.existsSync(path.resolve(".dinou/dist2/isg/beta/shell.page.json")), "beta shell.page.json must persist on cold ISG");
assert.ok(fs.existsSync(path.resolve(".dinou/dist2/isg/beta/shell.layout.own.json")), "beta shell.layout.own.json must persist on cold ISG");

// 2. Poison ALL shells & slots; bump ONLY holes -> shells & slots stay frozen across both alpha & beta!
writeS({
  l1S: 999, l1Sl: 999, l1H: 201,
  aL2S: 999, aL2Sl: 999, aL2H: 202, aPS: 999, aPSl: 999, aPH: 203,
  bL2S: 999, bL2Sl: 999, bL2H: 204, bPS: 999, bPSl: 999, bPH: 205,
});
const a2 = await get("/isg/alpha?v=3&p=p3", { cookie: "u=rigel" });
assert.equal(textById(a2, "l1-s"), "100");
assert.equal(textById(a2, "l1-sl"), "100");
assert.equal(textById(a2, "l1-h"), "rigel-201");
assert.equal(textById(a2, "l2-s"), "100");
assert.equal(textById(a2, "l2-sl"), "100");
assert.equal(textById(a2, "l2-h"), "alpha-3-202");
assert.equal(textById(a2, "p-s"), "100");
assert.equal(textById(a2, "p-sl"), "100");
assert.equal(textById(a2, "p-h"), "alpha-p3-203");

const b2 = await get("/isg/beta?v=4&p=p4", { cookie: "u=rigel" });
assert.equal(textById(b2, "l1-s"), "100");
assert.equal(textById(b2, "l2-s"), "100");
assert.equal(textById(b2, "l2-sl"), "100");
assert.equal(textById(b2, "l2-h"), "beta-4-204");
assert.equal(textById(b2, "p-s"), "100");
assert.equal(textById(b2, "p-sl"), "100");
assert.equal(textById(b2, "p-h"), "beta-p4-205");

// 3. Live /____rsc_slot____ refresh on alpha L2 & Page slots -> persists on alpha, leaves beta untouched!
writeS({ aL2Sl: 301, aPSl: 302 });
await get("/____rsc_slot____/p3-l2-slot-alpha?fresh=1", { "x-dinou-current-path": "/isg/alpha" });
await get("/____rsc_slot____/p3-p-slot-alpha?fresh=1", { "x-dinou-current-path": "/isg/alpha" });
const a3 = await get("/isg/alpha?v=3&p=p3", { cookie: "u=rigel" });
assert.equal(textById(a3, "l2-s"), "100");
assert.equal(textById(a3, "l2-sl"), "301");
assert.equal(textById(a3, "p-s"), "100");
assert.equal(textById(a3, "p-sl"), "302");
const b3 = await get("/isg/beta?v=4&p=p4", { cookie: "u=rigel" });
assert.equal(textById(b3, "l2-sl"), "100");
assert.equal(textById(b3, "p-sl"), "100");

// 4. Surgical revalidateLayout("/isg/alpha") updates ONLY alpha L2 shell while preserving L1, alpha Page, and beta!
writeS({ l1S: 888, l1Sl: 888, aL2S: 401, aL2Sl: 888, aPS: 888, aPSl: 888, bL2S: 888, bL2Sl: 888, bPS: 888, bPSl: 888 });
await revalidateLayout("/isg/alpha");
const a4 = await get("/isg/alpha?v=3&p=p3", { cookie: "u=rigel" });
assert.equal(textById(a4, "l1-s"), "100");
assert.equal(textById(a4, "l1-sl"), "100");
assert.equal(textById(a4, "l2-s"), "401");
assert.equal(textById(a4, "l2-sl"), "301");
assert.equal(textById(a4, "p-s"), "100");
assert.equal(textById(a4, "p-sl"), "302");
const b4 = await get("/isg/beta?v=5&p=p5", { cookie: "u=rigel" });
assert.equal(textById(b4, "l2-s"), "100");
assert.equal(textById(b4, "l2-sl"), "100");
assert.equal(textById(b4, "p-s"), "100");
assert.equal(textById(b4, "p-sl"), "100");

console.log("PHASE3_STAGE1_ISG_PARAM_OK");
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
      `Phase 3 Stage 1 compiled integration failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("PHASE3_STAGE1_ISG_PARAM_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("16. Phase 3 Stage 3 (Check #64) compiled Node AOT integration: Parallel routes (@sidebar / @panel) in asymmetric S->D->S chains with PPR, <DinouCacheSlot>, soft-nav RSC & @slot error isolation", async () => {
  const tmpApp = createFixtureDir("tmp-3d-p3-s3-parallel-");
  try {
    fs.mkdirSync(path.join(tmpApp, "src/pa/@sidebar"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/pa/dyn-l2/@panel"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/pa/alt-l2/@panel"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/pa-err/@sidebar"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "src/pa-err/dyn"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify(
        {
          name: "tmp-3d-p3-s3-parallel",
          private: true,
          type: "module",
          dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
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
const FILE = path.resolve(process.cwd(), "p3s3-state.json");
const DEF = {
  l1S: 100, l1Sl: 100, l1H: 100,
  sbS: 100, sbSl: 100, sbH: 100,
  dL2H: 100, dPanH: 100, dPanSl: 100,
  dPS: 100, dPSl: 100, dPH: 100,
  aL2S: 100, aPanS: 100, aPanSl: 100, aPanH: 100,
  aPS: 100, aPH: 100,
  errL1S: 100, errL1H: 100, errDynL2: 100, errPS: 100,
};
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
  return <html><head><title>P3S3</title></head><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/page.tsx"),
      `export default function Home() { return <main>home</main>; }\n`
    );

    // L1 Static PPR + @sidebar(Slot + PPR Hole)
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/layout_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\nexport function getCacheTags() { return ["p3s3-l1-tag"]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/layout.tsx"),
      `import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../state";

async function L1Hole() {
  const u = String(getContext()?.req?.cookies?.u || "anon");
  await sleep(10);
  return <span id="l1-h">{\`\${u}-\${readS().l1H}\`}</span>;
}

export default function PaL1({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  return (
    <section id="pa-l1">
      <span id="l1-s">{readS().l1S}</span>
      <DinouCacheSlot id="p3s3-l1-slot" tag="p3s3-l1-slot-tag" revalidate={3600}>
        {async () => <span id="l1-sl">{readS().l1Sl}</span>}
      </DinouCacheSlot>
      <Suspense fallback={<span>l1-fb</span>}><L1Hole /></Suspense>
      {sidebar}
      <main>{children}</main>
    </section>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/@sidebar/page.tsx"),
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../../state";

async function SbHole() {
  const sb = String(getContext()?.req?.cookies?.sb || "sb0");
  await sleep(10);
  return <span id="sb-h">{\`\${sb}-\${readS().sbH}\`}</span>;
}

export default function PaSidebar() {
  return (
    <aside id="pa-sb">
      <span id="sb-s">{readS().sbS}</span>
      <DinouCacheSlot id="p3s3-sb-slot" tag="p3s3-sb-slot-tag" revalidate={3600}>
        {async () => <span id="sb-sl">{readS().sbSl}</span>}
      </DinouCacheSlot>
      <Suspense fallback={<span>sb-fb</span>}><SbHole /></Suspense>
    </aside>
  );
}
`
    );

    // Branch A: Dynamic L2 + @panel(Live + Slot) + Static PPR Page(Slot + Hole)
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/dyn-l2/layout_functions.ts"),
      `export const revalidate = 0;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/dyn-l2/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function DynL2({ children, panel }: { children: ReactNode; panel?: ReactNode }) {
  return (
    <div id="dyn-l2">
      <span id="dl2-h">{readS().dL2H}</span>
      {panel}
      {children}
    </div>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/dyn-l2/@panel/page.tsx"),
      `import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS } from "../../../state";
export default function DynPanel() {
  const u = String(getContext()?.req?.cookies?.u || "anon");
  return (
    <aside id="dyn-pan">
      <span id="dpan-h">{\`\${u}-\${readS().dPanH}\`}</span>
      <DinouCacheSlot id="p3s3-dpan-slot" tag="p3s3-dpan-slot-tag" revalidate={3600}>
        {async () => <span id="dpan-sl">{readS().dPanSl}</span>}
      </DinouCacheSlot>
    </aside>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/dyn-l2/page_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/dyn-l2/page.tsx"),
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../../state";

async function DynPageHole() {
  const p = String(getContext()?.req?.query?.p || "p0");
  await sleep(10);
  return <span id="dp-h">{\`\${p}-\${readS().dPH}\`}</span>;
}

export default function DynPage() {
  return (
    <article id="dyn-p">
      <span id="dp-s">{readS().dPS}</span>
      <DinouCacheSlot id="p3s3-dp-slot" tag="p3s3-dp-slot-tag" revalidate={3600}>
        {async () => <span id="dp-sl">{readS().dPSl}</span>}
      </DinouCacheSlot>
      <Suspense fallback={<span>dp-fb</span>}><DynPageHole /></Suspense>
    </article>
  );
}
`
    );

    // Branch B: Static PPR Alt L2 + @panel(Slot + PPR Hole) + Static PPR Page
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/alt-l2/layout_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/alt-l2/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function AltL2({ children, panel }: { children: ReactNode; panel?: ReactNode }) {
  return (
    <div id="alt-l2">
      <span id="al2-s">{readS().aL2S}</span>
      {panel}
      {children}
    </div>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/alt-l2/@panel/page.tsx"),
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../../../state";

async function AltPanHole() {
  const u = String(getContext()?.req?.cookies?.u || "anon");
  await sleep(10);
  return <span id="apan-h">{\`\${u}-\${readS().aPanH}\`}</span>;
}

export default function AltPanel() {
  return (
    <aside id="alt-pan">
      <span id="apan-s">{readS().aPanS}</span>
      <DinouCacheSlot id="p3s3-apan-slot" tag="p3s3-apan-slot-tag" revalidate={3600}>
        {async () => <span id="apan-sl">{readS().aPanSl}</span>}
      </DinouCacheSlot>
      <Suspense fallback={<span>apan-fb</span>}><AltPanHole /></Suspense>
    </aside>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/alt-l2/page_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa/alt-l2/page.tsx"),
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { readS, sleep } from "../../state";

async function AltPageHole() {
  const p = String(getContext()?.req?.query?.p || "p0");
  await sleep(10);
  return <span id="ap-h">{\`\${p}-\${readS().aPH}\`}</span>;
}

export default function AltPage() {
  return (
    <article id="alt-p">
      <span id="ap-s">{readS().aPS}</span>
      <Suspense fallback={<span>ap-fb</span>}><AltPageHole /></Suspense>
    </article>
  );
}
`
    );

    // Branch C: Asymmetric PPR L1 with throwing @sidebar + @sidebar/error.tsx -> Dynamic L2 -> Static Page
    fs.writeFileSync(
      path.join(tmpApp, "src/pa-err/layout_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa-err/layout.tsx"),
      `import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { readS, sleep } from "../state";

async function ErrL1Hole() {
  const u = String(getContext()?.req?.cookies?.u || "anon");
  await sleep(10);
  return <span id="el1-h">{\`\${u}-\${readS().errL1H}\`}</span>;
}

export default function PaErrL1({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  return (
    <section id="pa-err-l1">
      <span id="el1-s">{readS().errL1S}</span>
      {sidebar}
      <Suspense fallback={<span>el1-fb</span>}><ErrL1Hole /></Suspense>
      <main>{children}</main>
    </section>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa-err/@sidebar/page.tsx"),
      `export default function BrokenSidebar() {
  throw new Error("sidebar-boom");
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa-err/@sidebar/error.tsx"),
      `export default function SidebarError({ error }: { error: { message: string } }) {
  return <aside id="sb-err-fb">{\`isolated:\${error?.message}\`}</aside>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa-err/dyn/layout_functions.ts"),
      `export const revalidate = 0;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa-err/dyn/layout.tsx"),
      `import type { ReactNode } from "react";
import { readS } from "../../state";
export default function ErrDynL2({ children }: { children: ReactNode }) {
  return <div id="edyn-l2"><span id="edyn-h">{readS().errDynL2}</span>{children}</div>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa-err/dyn/page_functions.ts"),
      `export const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pa-err/dyn/page.tsx"),
      `import { readS } from "../../state";
export default function ErrDynPage() {
  return <article id="ep"><span id="ep-s">{readS().errPS}</span></article>;
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
      `Phase 3 Stage 3 build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    const verifyScript = path.join(tmpApp, "verify-p3-stage3.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
const { revalidateTag } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/cache-revalidate.js")).href
      )});
setStorageAdapter(new FileSystemStorage(path.resolve(".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const writeS = (patch) => {
  const f = path.resolve("p3s3-state.json");
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const get = async (u, headers = {}) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u, { headers }), opts);
  assert.equal(r.status, 200, "Expected 200 for " + u + " got " + r.status);
  return await r.text();
};
const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([\\\\s\\\\S]*?)<\\\\/'));
  assert.ok(m, "Missing #" + id + " in HTML");
  return m[1].replace(/<!--\\s*\\/?\\s*-->/g, "");
};

// 1. Poison ALL static shells & slots; bump ONLY dynamic L2 / @panel host / PPR holes!
writeS({
  l1S: 999, l1Sl: 999, l1H: 201,
  sbS: 999, sbSl: 999, sbH: 202,
  dL2H: 203, dPanH: 204, dPanSl: 999,
  dPS: 999, dPSl: 999, dPH: 205,
  aL2S: 999, aPanS: 999, aPanSl: 999, aPanH: 206,
  aPS: 999, aPH: 207,
  errL1S: 999, errL1H: 208, errDynL2: 209, errPS: 999,
});

const dynHtml = await get("/pa/dyn-l2?p=d1", { cookie: "u=vega; sb=sbA" });
assert.equal(textById(dynHtml, "l1-s"), "100", "L1 shell must stay frozen");
assert.equal(textById(dynHtml, "l1-sl"), "100", "L1 slot must stay frozen");
assert.equal(textById(dynHtml, "l1-h"), "vega-201", "L1 PPR hole must stream live");
assert.equal(textById(dynHtml, "sb-s"), "100", "@sidebar shell must stay frozen");
assert.equal(textById(dynHtml, "sb-sl"), "100", "@sidebar slot must stay frozen");
assert.equal(textById(dynHtml, "sb-h"), "sbA-202", "@sidebar PPR hole must stream live");
assert.equal(textById(dynHtml, "dl2-h"), "203", "Dynamic L2 must execute live");
assert.equal(textById(dynHtml, "dpan-h"), "vega-204", "Dynamic L2 @panel host must execute live");
assert.equal(textById(dynHtml, "dpan-sl"), "100", "Dynamic L2 @panel cached slot must stay frozen");
assert.equal(textById(dynHtml, "dp-s"), "100", "Page shell must stay frozen");
assert.equal(textById(dynHtml, "dp-sl"), "100", "Page slot must stay frozen");
assert.equal(textById(dynHtml, "dp-h"), "d1-205", "Page PPR hole must stream live");

// 2. Sibling static PPR branch (alt-l2 with its own PPR @panel)
const altHtml = await get("/pa/alt-l2?p=a1", { cookie: "u=vega; sb=sbA" });
assert.equal(textById(altHtml, "l1-s"), "100");
assert.equal(textById(altHtml, "sb-s"), "100");
assert.equal(textById(altHtml, "sb-h"), "sbA-202");
assert.equal(textById(altHtml, "al2-s"), "100", "Alt L2 shell must stay frozen");
assert.equal(textById(altHtml, "apan-s"), "100", "Alt @panel shell must stay frozen");
assert.equal(textById(altHtml, "apan-sl"), "100", "Alt @panel slot must stay frozen");
assert.equal(textById(altHtml, "apan-h"), "vega-206", "Alt @panel PPR hole must stream live");
assert.equal(textById(altHtml, "ap-s"), "100", "Alt Page shell must stay frozen");
assert.equal(textById(altHtml, "ap-h"), "a1-207", "Alt Page PPR hole must stream live");

// 3. Live /____rsc_slot____ refresh on @sidebar slot & dyn-l2 @panel slot -> persists on reload!
writeS({ sbSl: 301, dPanSl: 302 });
await get("/____rsc_slot____/p3s3-sb-slot?fresh=1", { "x-dinou-current-path": "/pa/dyn-l2" });
await get("/____rsc_slot____/p3s3-dpan-slot?fresh=1", { "x-dinou-current-path": "/pa/dyn-l2" });
const dynAfterSlot = await get("/pa/dyn-l2?p=d2", { cookie: "u=rigel; sb=sbB" });
assert.equal(textById(dynAfterSlot, "l1-s"), "100");
assert.equal(textById(dynAfterSlot, "sb-s"), "100");
assert.equal(textById(dynAfterSlot, "sb-sl"), "301", "@sidebar refreshed slot must persist");
assert.equal(textById(dynAfterSlot, "sb-h"), "sbB-202");
assert.equal(textById(dynAfterSlot, "dpan-sl"), "302", "dyn @panel refreshed slot must persist");
assert.equal(textById(dynAfterSlot, "dpan-h"), "rigel-204");
assert.equal(textById(dynAfterSlot, "dp-s"), "100");

// 4. Surgical revalidateTag on @sidebar slot -> MUST reflect in BOTH /____rsc_layout____/pa/dyn-l2 AND /____rsc_layout____/pa/alt-l2 while L1 & @sidebar shells stay frozen!
writeS({ l1S: 888, sbS: 888, sbSl: 401, dL2H: 402, dPanH: 403 });
await revalidateTag("p3s3-sb-slot-tag");

const dynLayoutRsc = await get("/____rsc_layout____/pa/dyn-l2", { cookie: "u=nova; sb=sbC" });
assert.ok(dynLayoutRsc.includes('"id":"sb-sl","children":401') || dynLayoutRsc.includes('401'), "Soft-nav /____rsc_layout____/pa/dyn-l2 MUST reflect fresh @sidebar slot 401 after revalidateTag!");
assert.ok(!dynLayoutRsc.includes("888"), "Soft-nav /____rsc_layout____/pa/dyn-l2 MUST NOT re-execute poisoned L1/@sidebar shells 888!");
assert.ok(dynLayoutRsc.includes("402") && dynLayoutRsc.includes("403"), "Soft-nav /____rsc_layout____/pa/dyn-l2 must include fresh dynamic L2 & @panel");
assert.ok(dynLayoutRsc.includes("sbC-202"), "Soft-nav /____rsc_layout____/pa/dyn-l2 must splice live @sidebar PPR hole");

const altLayoutRsc = await get("/____rsc_layout____/pa/alt-l2", { cookie: "u=nova; sb=sbC" });
assert.ok(altLayoutRsc.includes("401"), "Soft-nav /____rsc_layout____/pa/alt-l2 MUST reflect fresh @sidebar slot 401!");
assert.ok(!altLayoutRsc.includes("888"), "Soft-nav /____rsc_layout____/pa/alt-l2 MUST NOT re-execute poisoned L1/@sidebar shells 888!");
assert.ok(altLayoutRsc.includes("nova-206"), "Soft-nav /____rsc_layout____/pa/alt-l2 must splice live alt @panel PPR hole");

// 5. @sidebar/error.tsx error isolation inside asymmetric PPR L1 -> Dynamic L2 -> Static Page
const errHtml = await get("/pa-err/dyn", { cookie: "u=lyra" });
assert.equal(textById(errHtml, "el1-s"), "100", "L1 shell must stay frozen even when @sidebar threw & fell back to error.tsx");
assert.equal(textById(errHtml, "el1-h"), "lyra-208", "L1 PPR hole must STILL stream cleanly when @sidebar failed to error.tsx!");
assert.equal(textById(errHtml, "sb-err-fb"), "isolated:sidebar-boom", "@sidebar/error.tsx fallback must render cleanly");
assert.equal(textById(errHtml, "edyn-h"), "209", "Dynamic L2 underneath erroring @sidebar must still execute live");
assert.equal(textById(errHtml, "ep-s"), "100", "Static Page underneath must stay frozen");

const errLayoutRsc = await get("/____rsc_layout____/pa-err/dyn", { cookie: "u=lyra" });
assert.ok(errLayoutRsc.includes("isolated:sidebar-boom"), "Soft-nav /____rsc_layout____/pa-err/dyn must preserve @sidebar/error.tsx fallback");
assert.ok(errLayoutRsc.includes("lyra-208"), "Soft-nav /____rsc_layout____/pa-err/dyn must still splice L1 PPR hole without crashing on throwing @sidebar!");
assert.ok(!errLayoutRsc.includes("999"), "Soft-nav /____rsc_layout____/pa-err/dyn must NOT re-execute poisoned L1 shell");

console.log("PHASE3_STAGE3_PARALLEL_ASYM_OK");
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
      `Phase 3 Stage 3 compiled integration failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("PHASE3_STAGE3_PARALLEL_ASYM_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});

test("17. Phase 3 Stage 4 (Check #65) unit guard: slot.js prevents unmounted & mid-transition pushState slots from leaking into refreshSlot('*')", async () => {
  const slotPathUrl = pathToFileURL(path.join(DINOU_ROOT, "core/slot.js")).href;
  const probeScript = `
    import assert from "node:assert/strict";
    const listeners = new Map();
    const fetched = [];
    globalThis.window = {
      location: { pathname: "/route-a" },
      addEventListener(name, fn) {
        const list = listeners.get(name) || [];
        list.push(fn);
        listeners.set(name, list);
      },
      dispatchEvent(ev) {
        const list = listeners.get(ev.type) || [];
        for (const fn of list) fn(ev);
      },
      __DINOU_FETCH_SLOT__(id, opts) {
        fetched.push({ id, currentPath: opts?.currentPath || window.location.pathname });
        return Promise.resolve({ ok: id });
      },
    };
    const slotMod = await import(${JSON.stringify(slotPathUrl)});
    const known = globalThis.__DINOU_KNOWN_CLIENT_SLOTS__;
    assert.ok(known instanceof Map, "Expected __DINOU_KNOWN_CLIENT_SLOTS__ Map");

    // Simulate mounted slot on /route-a, then pushState to /no-layout mid-transition, then unmount!
    known.set("slot-a", {
      id: "slot-a",
      tags: ["tag-a"],
      baseChildren: { v: 1 },
      routePath: "/route-a",
      unmounted: false,
      subscribers: new Set([{ apply() {}, getBase: () => ({ v: 1 }) }]),
    });
    // Simulate pushState changing pathname BEFORE unmount, plus unmount on commit
    window.location.pathname = "/no-layout";
    const entryA = known.get("slot-a");
    entryA.subscribers.clear();
    entryA.unmounted = true;

    // Even a conditionally unmounted slot on the SAME pathname (/no-layout) must be skipped by wildcard "*"!
    known.set("slot-same-path-unmounted", {
      id: "slot-same-path-unmounted",
      tags: [],
      baseChildren: { v: 1 },
      routePath: "/no-layout",
      unmounted: true,
      subscribers: new Set(),
    });
    // Mounted slot on /no-layout
    known.set("slot-nl", {
      id: "slot-nl",
      tags: ["tag-nl"],
      baseChildren: { v: 1 },
      routePath: "/no-layout",
      unmounted: false,
      subscribers: new Set([{ apply() {}, getBase: () => ({ v: 1 }) }]),
    });

    const promises = [];
    window.dispatchEvent({
      type: "dinou:refresh-slot",
      detail: { id: "*", options: { fresh: true }, promises },
    });
    await Promise.all(promises);
    assert.deepEqual(
      fetched.map((x) => x.id),
      ["slot-nl"],
      "Wildcard refreshSlot('*') must ONLY fetch mounted slots, never unmounted or previous-route slots"
    );

    // Explicit refreshSlot("slot-a") must still send original routePath "/route-a"
    fetched.length = 0;
    const explicitPromises = [];
    window.dispatchEvent({
      type: "dinou:refresh-slot",
      detail: { id: "slot-a", options: { fresh: true }, promises: explicitPromises },
    });
    await Promise.all(explicitPromises);
    assert.deepEqual(fetched, [{ id: "slot-a", currentPath: "/route-a" }]);

    // Verify source code never overwrites entry.routePath during render in ensureKnownSlotEntry
    const fs = await import("node:fs");
    const src = fs.readFileSync(${JSON.stringify(path.join(DINOU_ROOT, "core/slot.js"))}, "utf8");
    const ensureBlock = src.slice(src.indexOf("function ensureKnownSlotEntry"), src.indexOf("function getSlotOverrideForChildren"));
    assert.ok(
      !ensureBlock.includes("entry.routePath = window.location.pathname"),
      "ensureKnownSlotEntry must not overwrite entry.routePath mid-render (during pushState transition)"
    );
    assert.ok(src.includes("entry.unmounted = true;"), "useEffect cleanup must mark entry.unmounted = true");
    assert.ok(src.includes("entry.unmounted = false;"), "useEffect mount must reset entry.unmounted = false");
    console.log("PHASE3_STAGE4_SLOT_LIFECYCLE_OK");
  `;
  const runRes = spawnSync(process.execPath, ["--input-type=module", "-e", probeScript], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
    timeout: 15_000,
  });
  assert.equal(
    runRes.status,
    0,
    `Phase 3 Stage 4 slot lifecycle unit test failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
  );
  assert.ok(runRes.stdout.includes("PHASE3_STAGE4_SLOT_LIFECYCLE_OK"));
});

test("18. Phase 3 Stage 5 (Check #66) compiled Node AOT integration: res.status(404) + res.cookie() inside PPR dynamic hole & not_found.tsx under cached Static PPR L1 layout", async () => {
  const tmpApp = createFixtureDir("tmp-3d-p3-s5-ppr-nf-");
  try {
    fs.mkdirSync(path.join(tmpApp, "src/pnf"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify(
        {
          name: "tmp-3d-p3-s5-ppr-nf",
          private: true,
          type: "module",
          dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
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
const FILE = path.resolve(process.cwd(), "p3s5-state.json");
const DEF = { l1S: 100, l1Sl: 100, l1H: 100, pS: 100, hA: 100, hB: 100 };
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
  return <html><head><title>P3S5</title></head><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/page.tsx"),
      `export default function Home() { return <main>home</main>; }\n`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/pnf/layout_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pnf/layout.tsx"),
      `import { Suspense, type ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readS, sleep } from "../state";

async function L1Hole() {
  await sleep(10);
  return <span id="l1-h">{readS().l1H}</span>;
}

export default function PnfLayout({ children }: { children: ReactNode }) {
  return (
    <section id="pnf-l1">
      <span id="l1-s">{readS().l1S}</span>
      <DinouCacheSlot id="p3s5-l1-slot" revalidate={3600}>
        {async () => <span id="l1-sl">{readS().l1Sl}</span>}
      </DinouCacheSlot>
      <Suspense fallback={<span>l1-fb</span>}><L1Hole /></Suspense>
      <main>{children}</main>
    </section>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pnf/page_functions.ts"),
      `export const ppr = true;\nexport const revalidate = 3600;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pnf/page.tsx"),
      `import { Suspense } from "react";
import { getContext } from "dinou";
import { readS, sleep } from "../state";

async function HoleA() {
  const ok = String(getContext()?.req?.query?.ok || "base");
  await sleep(10);
  return <span id="h-a">{\`\${ok}-\${readS().hA}\`}</span>;
}

async function HoleB() {
  const ctx = getContext();
  const q = ctx?.req?.query || {};
  await sleep(10);
  if (q.setCookie === "1") {
    ctx?.res?.cookie?.("p3s5_ck", "applied", { path: "/" });
  }
  if (q.missing === "1") {
    ctx?.res?.status?.(404);
    return <div id="h-missing">not-found-in-hole</div>;
  }
  return <span id="h-b">{readS().hB}</span>;
}

export default function PnfPage() {
  return (
    <article id="pnf-p">
      <span id="p-s">{readS().pS}</span>
      <Suspense fallback={<span>a-fb</span>}><HoleA /></Suspense>
      <Suspense fallback={<span>b-fb</span>}><HoleB /></Suspense>
    </article>
  );
}
`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/pnf/not_found.tsx"),
      `import { getContext } from "dinou";
export default function PnfNotFound() {
  const reason = String(getContext()?.req?.query?.reason || "none");
  return <div id="nf-boundary">{\`404:\${reason}\`}</div>;
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
      `Phase 3 Stage 5 build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
    );

    const verifyScript = path.join(tmpApp, "verify-p3-stage5.mjs");
    fs.writeFileSync(
      verifyScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { FileSystemStorage, setStorageAdapter } = await import(${JSON.stringify(
        pathToFileURL(path.join(DINOU_ROOT, "core/storage-adapter.js")).href
      )});
setStorageAdapter(new FileSystemStorage(path.resolve(".dinou/dist2")));
globalThis.__DINOU_RUNTIME__ = "node-bundle";

const rscMod = await import(pathToFileURL(path.resolve(".dinou/node/rsc-engine.mjs")).href);
const ssrMod = await import(pathToFileURL(path.resolve(".dinou/node/ssr-engine.mjs")).href);
globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

const writeS = (patch) => {
  const f = path.resolve("p3s5-state.json");
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  fs.writeFileSync(f, JSON.stringify({ ...cur, ...patch }), "utf8");
};
const fetchRaw = async (u) => {
  const r = await rscMod.handleRequest(new Request("http://localhost" + u), opts);
  return { status: r.status, text: await r.text() };
};
const textById = (html, id) => {
  const m = html.match(new RegExp('id="' + id + '"[^>]*>([\\\\s\\\\S]*?)<\\\\/'));
  assert.ok(m, "Missing #" + id + " in HTML");
  return m[1].replace(/<!--\\s*\\/?\\s*-->/g, "");
};

// Poison ALL static shells & slots; bump ONLY dynamic holes!
writeS({ l1S: 999, l1Sl: 999, l1H: 201, pS: 999, hA: 202, hB: 203 });

// 1. PPR dynamic hole calling res.status(404) + res.cookie() after HTTP 200 shell prelude flush
const hole404 = await fetchRaw("/pnf?missing=1&setCookie=1&ok=alive");
assert.equal(hole404.status, 200, "PPR shell prelude already flushed HTTP 200");
assert.equal(textById(hole404.text, "l1-s"), "100", "L1 static shell stays frozen");
assert.equal(textById(hole404.text, "l1-sl"), "100", "L1 slot stays frozen");
assert.equal(textById(hole404.text, "l1-h"), "201", "L1 PPR hole streams live");
assert.equal(textById(hole404.text, "p-s"), "100", "Page static shell stays frozen");
assert.equal(textById(hole404.text, "h-a"), "alive-202", "Healthy sibling Hole A streams live");
assert.equal(textById(hole404.text, "h-missing"), "not-found-in-hole", "Hole B 404 fallback streams cleanly");
assert.ok(hole404.text.includes("__DINOU_RSC_P__"), "Inline RSC must still be emitted for zero #418");
assert.ok(
  hole404.text.includes("document.cookie") && hole404.text.includes("p3s5_ck=applied"),
  "Non-HttpOnly res.cookie() set inside PPR dynamic hole MUST flush script to client!"
);

// 2. Subsequent healthy request confirms cached static shell was NOT poisoned or evicted
const healthy = await fetchRaw("/pnf?missing=0&ok=recovered");
assert.equal(healthy.status, 200);
assert.equal(textById(healthy.text, "l1-s"), "100");
assert.equal(textById(healthy.text, "p-s"), "100");
assert.equal(textById(healthy.text, "h-a"), "recovered-202");
assert.equal(textById(healthy.text, "h-b"), "203");

// 3. Real 404 route (not_found.tsx) underneath cached Static PPR L1 layout:
//    HTTP 404 + not_found.tsx rendered + L1 static shell & slot STAY FROZEN (100, NOT poisoned 999!) + never cached!
const route404 = await fetchRaw("/pnf/does-not-exist?reason=gone");
assert.equal(route404.status, 404, "Missing child route must return HTTP 404");
assert.equal(textById(route404.text, "nf-boundary"), "404:gone", "Custom not_found.tsx must render");
assert.equal(textById(route404.text, "l1-s"), "100", "Cached L1 static shell MUST be reused on 404 route instead of re-executing poisoned 999!");
assert.equal(textById(route404.text, "l1-sl"), "100", "Cached L1 slot MUST stay frozen on 404 route");
assert.equal(textById(route404.text, "l1-h"), "201", "L1 PPR hole MUST stream live on 404 route");
assert.equal(
  fs.existsSync(path.resolve(".dinou/dist2/pnf/does-not-exist/index.html")),
  false,
  "404 route must NEVER be cached to .dinou/dist2"
);

// 4. Soft-nav /____rsc_page____ for missing route returns 404 + not_found.tsx RSC payload
const rsc404 = await fetchRaw("/____rsc_page____/pnf/does-not-exist?reason=soft");
assert.equal(rsc404.status, 404);
assert.ok(rsc404.text.includes("404:soft"));

console.log("PHASE3_STAGE5_PPR_NOT_FOUND_OK");
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
      `Phase 3 Stage 5 compiled integration failed:\nSTDOUT:\n${runRes.stdout}\nSTDERR:\n${runRes.stderr}`
    );
    assert.ok(runRes.stdout.includes("PHASE3_STAGE5_PPR_NOT_FOUND_OK"));
  } finally {
    removeDirSafe(tmpApp);
  }
});
