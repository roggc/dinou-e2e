// scripts/verify-bailout-ci.mjs
// Verifies Client useSearchParams() vs. Server Automatic Static Bailout:
// 1. createBailoutProxy & Symbol.for("dinou.bailout.raw") / unwrapBailoutProxy invariants
// 2. Client Component Fizz SSR (Static/ISG/ISR empty + 0 bailouts vs. Live SSR/dev live query + 0 bailouts)
// 3. Server Component useSearchParams() (Standard Automatic Static Bailout + PPR <Suspense> Dynamic Hole)
// 4. Full compiled Dual-Engine (rsc-engine + ssr-engine) SSG, ISG (query -> clean -> cached query), and Background ISR

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToReadableStream } from "react-dom/server.edge";

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

const {
  BAILOUT_RAW_TARGET,
  unwrapBailoutProxy,
  createBailoutProxy,
} = await import(resolveDinouInternal("core/bailout-proxy.js"));
const { requestStorage } = await import(
  resolveDinouInternal("core/request-context.js")
);
const { useSearchParams } = await import(
  resolveDinouInternal("core/navigation.js")
);
const { asyncRenderJSXToClientJSX } = await import(
  resolveDinouInternal("core/render-jsx-to-client-jsx.js")
);
const {
  runWithPprContext,
  resetPprHoles,
  getRegisteredHoles,
} = await import(resolveDinouInternal("core/ppr-context.js"));
const { bundleDualEngine } = await import(
  resolveDinouInternal("node/bundle-dual-engine.js")
);
const {
  FileSystemStorage,
  setStorageAdapter,
} = await import(resolveDinouInternal("core/storage-adapter.js"));

console.log("1️⃣ Unit-testing createBailoutProxy & BAILOUT_RAW_TARGET...");
{
  let bailoutCount = 0;
  const rawQuery = { q: "dinou", tag: ["rsc", "isg"] };
  const proxy = createBailoutProxy(rawQuery, "Query", () => {
    bailoutCount++;
  });

  assert.equal(proxy[Symbol.for("dinou.bailout.raw")], rawQuery);
  assert.equal(unwrapBailoutProxy(proxy), rawQuery);
  assert.equal(BAILOUT_RAW_TARGET, Symbol.for("dinou.bailout.raw"));
  assert.equal(bailoutCount, 0, "Unwrapping raw target must NOT trigger bailout");

  assert.equal(proxy.q, "dinou");
  assert.equal(bailoutCount, 1, "Direct property read MUST trigger bailout");
}

function ClientSearchProbe() {
  const sp = useSearchParams();
  return React.createElement(
    "span",
    { "data-q": sp.toString() },
    sp.get("q") || "EMPTY"
  );
}

console.log("2️⃣ Unit-testing Client Component Fizz SSR (Static/ISG/ISR, PPR & Live SSR)...");
{
  // 2a. Static / ISG / ISR HTML render -> empty output + 0 bailouts
  let staticBailouts = 0;
  const staticCtx = {
    req: {
      query: createBailoutProxy({ q: "do-not-leak" }, "Query", () => staticBailouts++),
      path: "/products/42",
      method: "GET",
    },
    _isStaticHtmlRender: true,
  };
  const staticHtml = await requestStorage.run(staticCtx, async () => {
    const stream = await renderToReadableStream(React.createElement(ClientSearchProbe));
    return await new Response(stream).text();
  });
  assert.equal(staticBailouts, 0);
  assert.match(staticHtml, />EMPTY<\/span>/);

  // 2b. PPR runtime resume -> empty output + 0 bailouts
  let pprResumeBailouts = 0;
  const pprResumeCtx = {
    req: {
      query: createBailoutProxy({ q: "ppr-no-leak" }, "Query", () => pprResumeBailouts++),
      path: "/ppr/42",
      method: "GET",
    },
    _isPprRuntimeResume: true,
  };
  const pprResumeHtml = await requestStorage.run(pprResumeCtx, async () => {
    const stream = await renderToReadableStream(React.createElement(ClientSearchProbe));
    return await new Response(stream).text();
  });
  assert.equal(pprResumeBailouts, 0);
  assert.match(pprResumeHtml, />EMPTY<\/span>/);

  // 2c. Live Dynamic SSR / dev -> live query output + 0 bailouts
  let liveBailouts = 0;
  const liveCtx = {
    req: {
      query: createBailoutProxy(
        { q: "react19", tag: ["a", "b"] },
        "Query",
        () => liveBailouts++
      ),
      path: "/search",
      method: "GET",
    },
    _isStaticHtmlRender: false,
  };
  const liveHtml = await requestStorage.run(liveCtx, async () => {
    const stream = await renderToReadableStream(React.createElement(ClientSearchProbe));
    return await new Response(stream).text();
  });
  assert.equal(liveBailouts, 0);
  assert.match(liveHtml, /data-q="q=react19&amp;tag=a&amp;tag=b">react19<\/span>/);
}

console.log("3️⃣ Unit-testing Server Component useSearchParams() (Standard Bailout & PPR Hole)...");
{
  let serverBailouts = 0;
  function ServerSearchComp() {
    const sp = useSearchParams();
    return React.createElement("h1", null, `Server:${sp.get("q") || "none"}`);
  }
  const serverCtx = {
    req: {
      query: createBailoutProxy({ q: "rsc-query" }, "Query", () => serverBailouts++),
      path: "/server-q",
      method: "GET",
    },
  };
  const el = await requestStorage.run(serverCtx, () =>
    asyncRenderJSXToClientJSX(React.createElement(ServerSearchComp))
  );
  assert.equal(serverBailouts > 0, true, "Server Component MUST trigger bailout");
  assert.equal(el.props.children, "Server:rsc-query");

  // PPR inside <Suspense> -> registers 1 dynamic hole, 0 full-route bailouts
  let pprOuterBailouts = 0;
  const pprCtx = {
    req: {
      query: createBailoutProxy({}, "Query", () => pprOuterBailouts++),
      path: "/ppr-q",
      method: "GET",
    },
  };
  let holes = [];
  await requestStorage.run(pprCtx, () =>
    runWithPprContext({ isPpr: true }, async () => {
      resetPprHoles();
      await asyncRenderJSXToClientJSX(
        React.createElement(
          "main",
          null,
          React.createElement(
            React.Suspense,
            { fallback: React.createElement("span", null, "Loading") },
            React.createElement(ServerSearchComp)
          )
        )
      );
      holes = getRegisteredHoles();
    })
  );
  assert.equal(pprOuterBailouts, 0);
  assert.equal(holes.length, 1);
}

console.log("4️⃣ Integration-testing Dual-Engine SSG, ISG & Background ISR...");
const miniRoot = path.resolve(
  projectRoot,
  `.dinou/_tmp_bailout_verify_${process.pid}`
);
fs.rmSync(miniRoot, { recursive: true, force: true });

try {
  fs.mkdirSync(path.join(miniRoot, "src/components"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/isg/[id]"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/isr-blog"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/server-search"), { recursive: true });

  fs.writeFileSync(
    path.join(miniRoot, "package.json"),
    JSON.stringify({ name: "bailout-verify", type: "module" }, null, 2)
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/components/client-search.tsx"),
    `"use client";
import { useSearchParams } from "dinou";
export function ClientSearch() {
  const sp = useSearchParams();
  const tags = sp.getAll("tag").join(",");
  return (
    <div>
      <div data-testid="client-q">{\`ClientQ:\${sp.get("q") ?? "EMPTY"}\`}</div>
      <div data-testid="client-tags">{\`ClientTags:\${tags || "NONE"}:Empty:\${sp.has("empty")}\`}</div>
    </div>
  );
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/layout.tsx"),
    `export default function RootLayout({ children }: { children: any }) {
  return <html><head><title>Verify</title></head><body>{children}</body></html>;
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/isg/[id]/page_functions.ts"),
    `export const getStaticPaths = ["1"];\n`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/isg/[id]/page.tsx"),
    `import { ClientSearch } from "@/components/client-search";
let count = 0;
export default function IsgPage({ params }: { params: { id: string } }) {
  count++;
  return <main><h1>{\`Product:\${params.id}:Render:\${count}\`}</h1><ClientSearch /></main>;
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/isr-blog/page_functions.ts"),
    `export const revalidate = 1;\n`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/isr-blog/page.tsx"),
    `import { ClientSearch } from "@/components/client-search";
let count = 0;
export default function IsrPage() {
  count++;
  return <main><h1>{\`ISRCount:\${count}\`}</h1><ClientSearch /></main>;
}
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/server-search/page.tsx"),
    `import { useSearchParams } from "dinou";
export default function ServerSearchPage() {
  const sp = useSearchParams();
  return <h1>{\`ServerSearch:\${sp.get("q") ?? "NONE"}\`}</h1>;
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
  assert(staticPaths.includes("/isg/1/"));
  assert(staticPaths.includes("/isr-blog/"));
  assert(!staticPaths.includes("/server-search/"));

  // Pre-render root layout & ISR route
  const layoutRes = await rscModule.handleRequest(
    new Request("http://localhost/____rsc_layout____/"),
    { runtime: "node-bundle", isSSG: true }
  );
  await storage.set("layout.rsc", await layoutRes.text(), {
    status: 200,
    generatedAt: Date.now(),
  });

  await (
    await rscModule.handleRequest(new Request("http://localhost/isr-blog"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
      isSSG: true,
    })
  ).text();

  // ISG: query visit (including repeated + empty-string params) followed by clean visit MUST cache and serve subsequent requests from KV
  const qVisit = await rscModule.handleRequest(
    new Request("http://localhost/isg/99?q=boots&tag=rsc&tag=isg&empty="),
    { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
  );
  const qVisitHtml = await qVisit.text();
  assert.match(qVisitHtml, /ClientQ:boots/);
  assert.match(qVisitHtml, /ClientTags:rsc,isg:Empty:true/);
  assert.equal(await storage.get("isg/99/index.html"), null);

  const cleanVisit = await rscModule.handleRequest(
    new Request("http://localhost/isg/99"),
    { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
  );
  const cleanHtml = await cleanVisit.text();
  assert.match(cleanHtml, /Product:99:Render:3/);
  assert(
    await storage.get("isg/99/index.html"),
    "Expected /isg/99 to cache in storage!"
  );

  const cachedVisit = await rscModule.handleRequest(
    new Request("http://localhost/isg/99?q=sneakers"),
    { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
  );
  assert.match(await cachedVisit.text(), /Product:99:Render:3/);

  // ISR: expire TTL -> trigger background regeneration -> assert refreshed cache stays static ISR
  await new Promise((r) => setTimeout(r, 1150));
  await (
    await rscModule.handleRequest(
      new Request("http://localhost/isr-blog?q=trigger"),
      { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
    )
  ).text();
  await new Promise((r) => setTimeout(r, 500));

  const isrHit1 = await (
    await rscModule.handleRequest(new Request("http://localhost/isr-blog"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();
  const isrHit2 = await (
    await rscModule.handleRequest(new Request("http://localhost/isr-blog"), {
      runtime: "node-bundle",
      renderHtmlStream: ssrModule.renderHtml,
    })
  ).text();
  assert.match(isrHit1, /ISRCount:3/);
  assert.match(
    isrHit2,
    /ISRCount:3/,
    "Expected /isr-blog to remain cached ISR, not Dynamic SSR!"
  );
} finally {
  process.chdir(projectRoot);
  fs.rmSync(miniRoot, { recursive: true, force: true });
}

console.log("✅ RESULT: All 4 bailout & useSearchParams verification checks PASSED!");
