// scripts/verify-cache-slot-bailout-ci.mjs
// Verifies <Suspense> + <DinouCacheSlot> on Non-PPR ISG Routes & Bailout Proxy Unwrapping:
// 1. Unit invariants:
//    - Clean ISG (ppr=false, revalidate=60) element & async-function children -> 0 bailouts + slot persisted
//    - Unread query (?utm_source=newsletter) -> 0 bailout poisoning via DinouCacheSlot
//    - revalidate={0} inside <Suspense> on ppr=false -> triggers Automatic Static Bailout
//    - PPR route (ppr=true) -> registers Dynamic PPR Hole without full-route bailout
//    - normalizeRevalidatePath relative URL resolution -> unwraps req.headers bailout proxy cleanly
// 2. Strict TypeScript check of DinouCacheSlotProps & DinouCacheSlot in dinou/server.d.ts
// 3. Full compiled Dual-Engine SSG, ISG (unread query -> clean cache -> cached hits), and Micro-ISR slot refresh

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React, { Suspense } from "react";
import ts from "typescript";

process.env.NODE_ENV = "production";
delete process.env.DINOU_DEV;

const projectRoot = process.cwd();

function resolveDinouInternal(relFromDinou) {
  const candidates = [
    path.resolve(projectRoot, "dinou", relFromDinou),
    path.resolve(projectRoot, "node_modules/dinou/dinou", relFromDinou),
    path.resolve(projectRoot, "node_modules/dinou", relFromDinou),
  ];
  const found = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
  return pathToFileURL(found).href;
}

const { DinouCacheSlot } = await import(
  resolveDinouInternal("core/cache-slot.js")
);
const { createBailoutProxy } = await import(
  resolveDinouInternal("core/bailout-proxy.js")
);
const { requestStorage } = await import(
  resolveDinouInternal("core/request-context.js")
);
const { asyncRenderJSXToClientJSX } = await import(
  resolveDinouInternal("core/render-jsx-to-client-jsx.js")
);
const {
  markPageRootElement,
  runWithPprContext,
  resetPprHoles,
  getRegisteredHoles,
} = await import(resolveDinouInternal("core/ppr-context.js"));
const {
  MemoryStorage,
  FileSystemStorage,
  setStorageAdapter,
} = await import(resolveDinouInternal("core/storage-adapter.js"));
const { revalidatePage } = await import(
  resolveDinouInternal("core/cache-revalidate.js")
);
const { bundleDualEngine } = await import(
  resolveDinouInternal("node/bundle-dual-engine.js")
);

function makeContext({
  pathStr = "/products/99/",
  query = {},
  headers = {},
  isSSG = false,
} = {}) {
  const dynamicState = { value: false };
  const markDynamic = () => {
    dynamicState.value = true;
  };
  return {
    dynamicState,
    ctx: {
      req: {
        path: pathStr,
        method: "GET",
        query: createBailoutProxy(query, "Query", markDynamic),
        cookies: createBailoutProxy({}, "Cookies", markDynamic),
        headers: createBailoutProxy(headers, "Headers", markDynamic),
      },
      res: {},
      platformContext: { isSSG },
      _dynamicState: dynamicState,
      _markDynamic: markDynamic,
    },
  };
}

console.log(
  "1️⃣ Unit-testing <Suspense> + <DinouCacheSlot> bailout invariants..."
);
{
  const storage = new MemoryStorage();
  setStorageAdapter(storage);

  async function LiveStockCounter() {
    return React.createElement("span", null, "In stock: 42");
  }
  function ProductPage() {
    return React.createElement(
      "main",
      null,
      React.createElement(
        Suspense,
        { fallback: React.createElement("span", null, "Loading...") },
        React.createElement(
          DinouCacheSlot,
          { id: "unit-stock-99", revalidate: 60 },
          React.createElement(LiveStockCounter, null)
        )
      )
    );
  }

  // 1a. Clean ISG request (ppr = false, revalidate = 60) -> NO bailout, slot persisted
  const { ctx, dynamicState } = makeContext({
    pathStr: "/products/99/",
    query: {},
  });
  await requestStorage.run(ctx, async () => {
    const pageEl = markPageRootElement(
      React.createElement(ProductPage, null),
      false
    );
    await asyncRenderJSXToClientJSX(pageEl);
  });

  assert.equal(
    dynamicState.value,
    false,
    "ISG <Suspense> + <DinouCacheSlot revalidate={60}> must NOT bail out"
  );
  const storedSlot = await storage.get("slots/unit-stock-99/slot.json");
  assert.ok(storedSlot?.content, "Slot must be persisted in storage");
  assert.equal(storedSlot.metadata?.inStaticShell, true);

  // 1b. Async function-children ISG request (ppr = false, revalidate = 60) -> NO bailout, slot persisted
  const { ctx: fnCtx, dynamicState: fnDyn } = makeContext({
    pathStr: "/products/99/",
    query: {},
  });
  await requestStorage.run(fnCtx, async () => {
    const pageEl = markPageRootElement(
      React.createElement(
        Suspense,
        { fallback: null },
        React.createElement(
          DinouCacheSlot,
          { id: "unit-fn-99", revalidate: 60 },
          async () => React.createElement("span", null, "Fn payload")
        )
      ),
      false
    );
    await asyncRenderJSXToClientJSX(pageEl);
  });
  assert.equal(
    fnDyn.value,
    false,
    "Async function-children <DinouCacheSlot> must NOT bail out"
  );
  assert.ok(
    (await storage.get("slots/unit-fn-99/slot.json"))?.content,
    "Function-children slot must be persisted in storage"
  );

  // 1c. Unread query param (?utm_source=newsletter) -> NO bailout poisoning
  const { ctx: qCtx, dynamicState: qDyn } = makeContext({
    pathStr: "/products/100/",
    query: { utm_source: "newsletter" },
  });
  let rendered;
  await requestStorage.run(qCtx, async () => {
    const pageEl = markPageRootElement(
      React.createElement(ProductPage, null),
      false
    );
    rendered = await asyncRenderJSXToClientJSX(pageEl);
  });
  assert.equal(
    qDyn.value,
    false,
    "Unread query param must NOT poison dynamicState via DinouCacheSlot"
  );
  if (rendered?.props?.children?.props?.children?.props?.promise) {
    await rendered.props.children.props.children.props.promise;
  }

  // 1d. revalidate={0} on ppr=false -> MUST trigger bailout
  const { ctx: zeroCtx, dynamicState: zeroDyn } = makeContext({
    pathStr: "/live/",
    query: {},
  });
  await requestStorage.run(zeroCtx, async () => {
    const pageEl = markPageRootElement(
      React.createElement(
        Suspense,
        { fallback: null },
        React.createElement(
          DinouCacheSlot,
          { id: "unit-zero", revalidate: 0 },
          React.createElement("span", null, "Live")
        )
      ),
      false
    );
    await asyncRenderJSXToClientJSX(pageEl);
  });
  assert.equal(
    zeroDyn.value,
    true,
    "revalidate={0} on ppr=false MUST trigger bailout"
  );

  // 1e. PPR route (ppr=true) -> registers Dynamic PPR Hole without full-route bailout
  const { ctx: pprCtx, dynamicState: pprDyn } = makeContext({
    pathStr: "/telemetry/",
    isSSG: true,
  });
  let holes = [];
  await requestStorage.run(pprCtx, async () => {
    await runWithPprContext({ isPpr: true }, async () => {
      resetPprHoles(0);
      const pageEl = markPageRootElement(
        React.createElement(ProductPage, null),
        true
      );
      await asyncRenderJSXToClientJSX(pageEl);
      holes = getRegisteredHoles();
    });
  });
  assert.equal(pprDyn.value, false);
  assert.deepEqual(holes, ["ppr-hole-1"]);

  // 1f. normalizeRevalidatePath relative URL resolution -> does NOT trip headers bailout proxy
  const { ctx: revHeaderCtx, dynamicState: revHeaderDyn } = makeContext({
    pathStr: "/__verify_nonexistent_reval_base__/",
    headers: {
      "x-dinou-current-path": "/__verify_nonexistent_reval_base__",
    },
  });
  await requestStorage.run(revHeaderCtx, async () => {
    try {
      await revalidatePage("./__verify_nonexistent_reval_sub__");
    } catch (_) {}
  });
  assert.equal(
    revHeaderDyn.value,
    false,
    "normalizeRevalidatePath must unwrap headers proxy (x-dinou-current-path)"
  );

  const { ctx: revRefCtx, dynamicState: revRefDyn } = makeContext({
    pathStr: "/__verify_nonexistent_reval_base__/",
    headers: {
      referer: "http://localhost/__verify_nonexistent_reval_base__/nested",
    },
  });
  await requestStorage.run(revRefCtx, async () => {
    try {
      await revalidatePage("./__verify_nonexistent_reval_sub__");
    } catch (_) {}
  });
  assert.equal(
    revRefDyn.value,
    false,
    "normalizeRevalidatePath must unwrap headers proxy (referer)"
  );
}

console.log(
  "2️⃣ Type-checking DinouCacheSlotProps in dinou/server.d.ts (strict: true)..."
);
{
  const virtualFile = path.resolve(projectRoot, "src/_verify_slot_dts.tsx");
  const code = `
import { DinouCacheSlot, type DinouCacheSlotProps } from "dinou/server";

async function AsyncWidget() {
  return <div>Async</div>;
}

export function ValidAndInvalidUsages() {
  const fnProps: DinouCacheSlotProps = {
    id: "fn-slot",
    revalidate: 30,
    children: async () => <AsyncWidget />,
  };
  const syncFnProps: DinouCacheSlotProps = {
    tag: "sync-fn-slot",
    tags: ["sync-fn-slot", "extra-tag"],
    children: () => <span>Sync</span>,
  };
  return (
    <div>
      <DinouCacheSlot id="1" revalidate={60}>
        <AsyncWidget />
      </DinouCacheSlot>
      <DinouCacheSlot {...fnProps} />
      <DinouCacheSlot {...syncFnProps} />
      {/* @ts-expect-error children is required */}
      <DinouCacheSlot id="missing-children" />
      {/* @ts-expect-error revalidate must be number */}
      <DinouCacheSlot id="bad-reval" revalidate="60">
        <span>Bad</span>
      </DinouCacheSlot>
    </div>
  );
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
        ts.ScriptKind.TSX
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
    `Expected 0 TS errors, got: ${diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("; ")}`
  );
}

console.log(
  "3️⃣ Integration-testing Dual-Engine ISG + Micro-ISR (<Suspense> + <DinouCacheSlot>)..."
);
const miniRoot = path.resolve(
  projectRoot,
  `.dinou/_tmp_slot_isg_verify_${process.pid}_${Math.random()
    .toString(36)
    .slice(2, 7)}`
);
fs.rmSync(miniRoot, { recursive: true, force: true });

try {
  fs.mkdirSync(path.join(miniRoot, "src/products/[slug]"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/live-zero"), { recursive: true });

  fs.writeFileSync(
    path.join(miniRoot, "package.json"),
    JSON.stringify({ name: "slot-isg-verify", type: "module" }, null, 2)
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html><head><title>Slot ISG</title></head><body>{children}</body></html>;
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/products/[slug]/page_functions.ts"),
    `export const getStaticPaths = ["1"];
export const revalidate = 3600;
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/products/[slug]/page.tsx"),
    `import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";

const pageCounts = new Map<string, number>();
const slotCounts = new Map<string, number>();

async function LiveStockCounter({ slug }: { slug: string }) {
  const next = (slotCounts.get(slug) ?? 0) + 1;
  slotCounts.set(slug, next);
  return <div data-testid="slot-stock">{\`Stock:\${slug}:SlotRender:\${next}\`}</div>;
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const nextPage = (pageCounts.get(params.slug) ?? 0) + 1;
  pageCounts.set(params.slug, nextPage);
  return (
    <main>
      <h1>{\`Product:\${params.slug}:PageRender:\${nextPage}\`}</h1>
      <Suspense fallback={<span>Loading stock...</span>}>
        <DinouCacheSlot id={\`stock-\${params.slug}\`} revalidate={1}>
          <LiveStockCounter slug={params.slug} />
        </DinouCacheSlot>
      </Suspense>
    </main>
  );
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/live-zero/page.tsx"),
    `import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";

let count = 0;
export default function LiveZeroPage() {
  count++;
  return (
    <main>
      <h1>{\`LiveZeroPage:\${count}\`}</h1>
      <Suspense fallback={<span>Loading...</span>}>
        <DinouCacheSlot id="zero-slot" revalidate={0}>
          <span>Live</span>
        </DinouCacheSlot>
      </Suspense>
    </main>
  );
}
`
  );

  process.chdir(miniRoot);
  const { rscEnginePath, ssrEnginePath } = await bundleDualEngine({
    isDev: false,
    projectRoot: miniRoot,
    outDir: ".dinou/node",
  });

  const dist2 = path.join(miniRoot, ".dinou/dist2");
  fs.mkdirSync(dist2, { recursive: true });
  const storage = new FileSystemStorage(dist2);
  setStorageAdapter(storage);

  const rscModule = await import(pathToFileURL(rscEnginePath).href);
  const ssrModule = await import(pathToFileURL(ssrEnginePath).href);
  if (typeof rscModule.setStorageAdapter === "function") {
    rscModule.setStorageAdapter(storage);
  }

  await rscModule.buildStaticPages();
  const staticPaths = rscModule.getStaticPaths();
  assert(staticPaths.includes("/products/1/"));
  assert(!staticPaths.includes("/live-zero/"));

  const layoutRes = await rscModule.handleRequest(
    new Request("http://localhost/____rsc_layout____/"),
    { runtime: "node-bundle", isSSG: true }
  );
  await storage.set("layout.rsc", await layoutRes.text(), {
    status: 200,
    generatedAt: Date.now(),
  });

  // Unread query visit does NOT cache clean route and does NOT poison isDynamic
  await (
    await rscModule.handleRequest(
      new Request("http://localhost/products/99?utm_source=ads"),
      { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
    )
  ).text();
  assert.equal(await storage.get("products/99/index.html"), null);

  // Clean ISG visit caches both page and slot
  const cleanHtml1 = await (
    await rscModule.handleRequest(new Request("http://localhost/products/99"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();
  assert.match(cleanHtml1, /Product:99:PageRender:2/);
  assert.match(cleanHtml1, /window\.__DINOU_USE_STATIC__ = true;/);
  assert(await storage.get("products/99/index.html"));
  assert(await storage.get("slots/stock-99/slot.json"));

  // Cached hit (both clean and with unread query) does not re-run page
  const cleanHtml2 = await (
    await rscModule.handleRequest(new Request("http://localhost/products/99"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();
  assert.match(cleanHtml2, /Product:99:PageRender:2/);

  const cachedQueryHtml = await (
    await rscModule.handleRequest(
      new Request("http://localhost/products/99?utm_source=repeat"),
      {
        runtime: "node-bundle",
        renderHtmlStream: ssrModule.renderHtml,
      }
    )
  ).text();
  assert.match(cachedQueryHtml, /Product:99:PageRender:2/);

  const initialSlotRender = Number(
    cleanHtml2.match(/Stock:99:SlotRender:(\d+)/)[1]
  );

  // Micro-ISR slot expiry refreshes ONLY the slot while keeping PageRender:2 intact
  await new Promise((r) => setTimeout(r, 1150));
  await (
    await rscModule.handleRequest(new Request("http://localhost/products/99"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();

  let afterSlotSwrHtml = "";
  let refreshedSlotRender = initialSlotRender;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 150));
    afterSlotSwrHtml = await (
      await rscModule.handleRequest(
        new Request("http://localhost/products/99"),
        {
          runtime: "node-bundle",
          renderHtmlStream: ssrModule.renderHtml,
        }
      )
    ).text();
    const m = afterSlotSwrHtml.match(/Stock:99:SlotRender:(\d+)/);
    if (m && Number(m[1]) > initialSlotRender) {
      refreshedSlotRender = Number(m[1]);
      break;
    }
  }

  assert.match(afterSlotSwrHtml, /Product:99:PageRender:2/);
  assert(
    refreshedSlotRender > initialSlotRender,
    `Expected slot render count to exceed ${initialSlotRender}, got ${refreshedSlotRender}`
  );
} finally {
  process.chdir(projectRoot);
  fs.rmSync(miniRoot, { recursive: true, force: true });
}

console.log(
  "✅ RESULT: All <Suspense> + <DinouCacheSlot> ISG bailout & type checks PASSED!"
);

