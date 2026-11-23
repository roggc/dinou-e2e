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
