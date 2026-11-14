// scripts/verify-streaming-suspense-ci.mjs
// Verifies Production Progressive <Suspense> Streaming & Direct Promise<ReactNode> Children:
// 1. Production Dynamic SSR (_dynamicState.value === true & Server Function RPC context) progressive <Suspense> streaming via DinouSuspenseHoleBoundary + silent rejection handling
// 2. Production ?query progressive streaming via unwrapBailoutProxy without BailoutProxy poisoning vs. eager <Suspense> settlement on clean ISG, SSG, PPR resume, background revalidation & <DinouCacheSlot>
// 3. Direct Promise<ReactNode> JSX children across PPR shell build, spliceDynamicHolesIntoShell, SSG, and <DinouCacheSlot> (zero "{}" serialization corruption + scoped useId())
// 4. Client Component Flight Promise props (direct, array, nested object, forwardRef & memo client refs) remain un-awaited while nested Server JSX elements resolve on the server
// 5. Full compiled Dual-Engine integration: real HTTP chunk-by-chunk progressive streaming on Dynamic SSR, PPR resume, and ?query ISG + eager static settlement on clean ISG

import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";
import React, { Suspense } from "react";

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

const {
  DinouCacheSlot,
  serializeJSX,
  deserializeJSX,
} = await import(resolveDinouInternal("core/cache-slot.js"));
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
const {
  spliceDynamicHolesIntoShell,
  streamDynamicHoles,
} = await import(resolveDinouInternal("core/ppr-runtime.js"));
const { generateStatic } = await import(
  resolveDinouInternal("core/generate-static.js")
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createMockRequestContext({
  dynamic = false,
  query = {},
  cookies = {},
  headers = {},
  isSSG = false,
  pathStr = "/dashboard/",
  method = "GET",
  extra = {},
} = {}) {
  const dynamicState = { value: dynamic };
  const markDynamic = () => {
    dynamicState.value = true;
  };
  return {
    req: {
      query: createBailoutProxy(query, "Query", markDynamic),
      cookies: createBailoutProxy(cookies, "Cookies", markDynamic),
      headers: createBailoutProxy(headers, "Headers", markDynamic),
      path: pathStr,
      method,
    },
    res: {},
    platformContext: { isSSG },
    _markDynamic: markDynamic,
    _dynamicState: dynamicState,
    ...extra,
  };
}

async function readStreamChunksUntilMarker(res, markerText) {
  assert.equal(res.status, 200);
  assert.ok(res.body, "Expected readable HTTP response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const t0 = Date.now();
  let firstChunkHtml = "";
  let firstChunkTime = -1;
  let fullHtml = "";
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      fullHtml += decoder.decode();
      break;
    }
    chunkCount++;
    const text = decoder.decode(value, { stream: true });
    fullHtml += text;
    if (firstChunkTime < 0 && fullHtml.includes(markerText)) {
      firstChunkTime = Date.now() - t0;
      firstChunkHtml = fullHtml;
    }
  }
  const totalTime = Date.now() - t0;
  return { firstChunkHtml, firstChunkTime, fullHtml, totalTime, chunkCount };
}

console.log(
  "1️⃣ Checking production Dynamic SSR & Server Function RPC <Suspense> streaming..."
);
{
  function ServerIdBadge({ text }) {
    const uid = React.useId();
    return React.createElement("span", { "data-uid": uid }, text);
  }

  let componentSettled = false;
  async function SlowHeavyMetrics() {
    await sleep(250);
    componentSettled = true;
    return React.createElement(
      "div",
      { id: "metrics" },
      React.createElement(ServerIdBadge, { text: "Revenue: $42k" })
    );
  }

  let directPromiseSettled = false;
  async function getDirectPromisePanel() {
    await sleep(250);
    directPromiseSettled = true;
    return React.createElement(
      "section",
      { id: "direct-panel" },
      React.createElement(ServerIdBadge, { text: "Orders: 128" })
    );
  }

  const pageJsx = markPageRootElement(
    React.createElement(
      "main",
      null,
      React.createElement("h1", null, "Executive Overview"),
      React.createElement(
        Suspense,
        { fallback: React.createElement("div", { id: "skeleton-1" }, "Loading 1...") },
        React.createElement(SlowHeavyMetrics)
      ),
      React.createElement(
        Suspense,
        { fallback: React.createElement("div", { id: "skeleton-2" }, "Loading 2...") },
        getDirectPromisePanel()
      )
    ),
    false
  );

  const dynCtx = createMockRequestContext({ dynamic: true });
  const t0 = Date.now();
  const rendered = await requestStorage.run(dynCtx, () =>
    asyncRenderJSXToClientJSX(pageJsx)
  );
  const elapsed = Date.now() - t0;

  assert.ok(
    elapsed < 80,
    `Expected non-blocking shell (<80ms), got ${elapsed}ms`
  );
  assert.equal(componentSettled, false);
  assert.equal(directPromiseSettled, false);

  const suspenseNode1 = rendered.props.children[1];
  const suspenseNode2 = rendered.props.children[2];
  assert.equal(suspenseNode1.type, Symbol.for("react.suspense"));
  assert.equal(
    suspenseNode1.props.children.type.$$dinouDeferredSuspenseStream,
    true
  );
  assert.equal(suspenseNode2.type, Symbol.for("react.suspense"));
  assert.equal(
    suspenseNode2.props.children.type.$$dinouDeferredSuspenseStream,
    true
  );

  const [resolvedHole1, resolvedHole2] = await requestStorage.run(dynCtx, () =>
    Promise.all([
      suspenseNode1.props.children.type(suspenseNode1.props.children.props),
      suspenseNode2.props.children.type(suspenseNode2.props.children.props),
    ])
  );
  assert.equal(componentSettled, true);
  assert.equal(directPromiseSettled, true);
  assert.equal(resolvedHole1.props.id, "metrics");
  assert.match(
    resolvedHole1.props.children.props["data-uid"],
    /^_hole_ppr-hole-1_dS_/
  );
  assert.equal(resolvedHole2.props.id, "direct-panel");
  assert.match(
    resolvedHole2.props.children.props["data-uid"],
    /^_hole_ppr-hole-2_dS_/
  );

  // Deferred rejected Promise<ReactNode> inside <Suspense> must NOT trigger unhandledRejection
  let unhandledFired = false;
  const onUnhandled = () => {
    unhandledFired = true;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    const failingPromise = sleep(25).then(() => {
      throw new Error("ExpectedDeferredFailure");
    });
    const rejectedTree = await requestStorage.run(dynCtx, () =>
      asyncRenderJSXToClientJSX(
        React.createElement(
          Suspense,
          { fallback: React.createElement("span", null, "Fallback") },
          failingPromise
        )
      )
    );
    await sleep(60);
    assert.equal(unhandledFired, false);
    await assert.rejects(
      () =>
        requestStorage.run(dynCtx, () =>
          rejectedTree.props.children.type(rejectedTree.props.children.props)
        ),
      /ExpectedDeferredFailure/
    );
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }

  // Verify handler.js createServerFunctionContext sets _dynamicState: { value: true }
  const handlerSource = fs.readFileSync(
    path.resolve(projectRoot, "dinou/core/handler.js"),
    "utf8"
  );
  assert.match(
    handlerSource,
    /function createServerFunctionContext[\s\S]*?_dynamicState:\s*\{\s*value:\s*true\s*\}/,
    "Expected createServerFunctionContext in dinou/core/handler.js to initialize _dynamicState: { value: true }"
  );
}

console.log(
  "2️⃣ Checking ?query streaming vs. clean ISG/SSG/revalidation eager settlement & BailoutProxy non-poisoning..."
);
{
  async function SlowResults() {
    await sleep(200);
    return React.createElement("div", { id: "results" }, "Found 10 items");
  }

  const makeTree = () =>
    React.createElement(
      Suspense,
      { fallback: React.createElement("span", null, "Searching...") },
      React.createElement(SlowResults)
    );

  // 2a. URL with ?query params streams progressively WITHOUT mutating _dynamicState via BailoutProxy
  const queryCtx = createMockRequestContext({
    dynamic: false,
    query: { q: "dinou" },
  });
  const t0 = Date.now();
  const streamed = await requestStorage.run(queryCtx, () =>
    asyncRenderJSXToClientJSX(makeTree())
  );
  assert.ok(Date.now() - t0 < 80);
  assert.equal(
    queryCtx._dynamicState.value,
    false,
    "unwrapBailoutProxy(req.query) must not trip BailoutProxy"
  );
  assert.equal(streamed.props.children.type.$$dinouDeferredSuspenseStream, true);

  // 2b. Clean ISG candidate (query = {}, _dynamicState = false) settles eagerly into static DOM
  const cleanCtx = createMockRequestContext({ dynamic: false, query: {} });
  const t1 = Date.now();
  const settledClean = await requestStorage.run(cleanCtx, () =>
    asyncRenderJSXToClientJSX(makeTree())
  );
  assert.ok(Date.now() - t1 >= 160);
  assert.equal(cleanCtx._dynamicState.value, false);
  assert.equal(settledClean.props.children.type, "div");
  assert.equal(settledClean.props.children.props.children, "Found 10 items");

  // 2c. SSG, _isStaticHtmlRender, _isPprRuntimeResume, and background revalidation all force eager settlement
  for (const mode of [
    { name: "isSSG", opts: { dynamic: true, query: { q: "x" }, isSSG: true } },
    {
      name: "_isStaticHtmlRender",
      opts: {
        dynamic: true,
        query: { q: "x" },
        extra: { _isStaticHtmlRender: true },
      },
    },
    {
      name: "_isPprRuntimeResume",
      opts: {
        dynamic: true,
        query: { q: "x" },
        extra: { _isPprRuntimeResume: true },
      },
    },
  ]) {
    const ctx = createMockRequestContext(mode.opts);
    const res = await requestStorage.run(ctx, () =>
      asyncRenderJSXToClientJSX(makeTree())
    );
    assert.equal(
      res.props.children.type,
      "div",
      `Expected eager <Suspense> settlement when ${mode.name} is active`
    );
  }

  const revalStorageKey = Symbol.for("dinou.reval.queue.storage");
  const prevRevalStorage = globalThis[revalStorageKey];
  const mockRevalAls = prevRevalStorage || new AsyncLocalStorage();
  globalThis[revalStorageKey] = mockRevalAls;
  try {
    const dynRevalCtx = createMockRequestContext({
      dynamic: true,
      query: { q: "reval" },
    });
    const revalSettled = await mockRevalAls.run(new Map(), () =>
      requestStorage.run(dynRevalCtx, () =>
        asyncRenderJSXToClientJSX(makeTree())
      )
    );
    assert.equal(
      revalSettled.props.children.type,
      "div",
      "Expected eager <Suspense> settlement during background ISR/tag revalidation"
    );
  } finally {
    if (!prevRevalStorage) {
      delete globalThis[revalStorageKey];
    }
  }

  // 2d. Outer <Suspense> wrapping <DinouCacheSlot> settles eagerly even on dynamic routes
  const slotStorage = new MemoryStorage({ hydrateFromDisk: false });
  setStorageAdapter(slotStorage);
  const dynSlotCtx = createMockRequestContext({ dynamic: true });
  const slotWrapped = await requestStorage.run(dynSlotCtx, () =>
    asyncRenderJSXToClientJSX(
      React.createElement(
        Suspense,
        { fallback: React.createElement("span", null, "Slot loading...") },
        React.createElement(
          DinouCacheSlot,
          { id: "eager-outer-slot", revalidate: 60 },
          React.createElement("em", null, "CachedSlotBody")
        )
      )
    )
  );
  assert.notEqual(
    slotWrapped.props.children?.type?.name,
    "DinouSuspenseHoleBoundary",
    "Outer <Suspense> containing <DinouCacheSlot> must evaluate DinouCacheSlot in caller context instead of deferring via DinouSuspenseHoleBoundary"
  );
  assert.equal(
    slotWrapped.props.children?.type?.name,
    "DinouDeferredSlotStream"
  );
  assert.deepEqual(Array.from(dynSlotCtx._slotTags || []), [
    "eager-outer-slot",
  ]);
}

console.log(
  "3️⃣ Checking direct Promise<ReactNode> children across PPR Build, spliceDynamicHolesIntoShell, SSG & <DinouCacheSlot>..."
);
{
  function ServerIdBadge({ text }) {
    const id = React.useId();
    return React.createElement("span", { "data-uid": id }, text);
  }

  async function getMetricsTable(delay = 80, label = "Live") {
    await sleep(delay);
    return React.createElement(
      "section",
      { id: "promise-metrics" },
      React.createElement(ServerIdBadge, { text: label })
    );
  }

  async function getStaticBanner() {
    await sleep(15);
    return React.createElement("p", { id: "static-promise-banner" }, "BannerOK");
  }

  // 3a. PPR Build registers ppr-hole-1 & ppr-hole-2 (single & array Promise<ReactNode> children), keeps static Promise outside <Suspense> in shell, and never emits "{}"
  const pprBuildCtx = createMockRequestContext({ isSSG: true });
  let shellTree;
  let registeredHoles = [];
  await requestStorage.run(pprBuildCtx, async () => {
    await runWithPprContext({ isPpr: true }, async () => {
      resetPprHoles(0);
      const page = React.createElement(
        "main",
        null,
        React.createElement("h1", null, "Title"),
        getStaticBanner(),
        React.createElement(
          Suspense,
          {
            fallback: React.createElement(
              "div",
              { className: "skel-1" },
              "Loading 1..."
            ),
          },
          getMetricsTable(90, "HoleOne")
        ),
        React.createElement(
          Suspense,
          {
            fallback: React.createElement(
              "div",
              { className: "skel-2" },
              "Loading 2..."
            ),
          },
          [getMetricsTable(60, "HoleTwoA"), getMetricsTable(60, "HoleTwoB")]
        )
      );
      shellTree = await asyncRenderJSXToClientJSX(page);
      registeredHoles = getRegisteredHoles();
    });
  });

  assert.deepEqual(registeredHoles, ["ppr-hole-1", "ppr-hole-2"]);
  const shellJson = serializeJSX(shellTree);
  assert.ok(shellJson.includes("StaticBanner") || shellJson.includes("BannerOK"));
  assert.ok(shellJson.includes("ppr-hole-1"));
  assert.ok(shellJson.includes("ppr-hole-2"));
  assert.ok(!shellJson.includes("{}"), "shell.page.json must not contain empty '{}' Promise artifacts");

  // 3b. PPR Runtime spliceDynamicHolesIntoShell traverses sibling Promise<ReactNode> + resolves dynamic hole useId()
  const runtimeCtx = createMockRequestContext({ dynamic: true });
  const spliced = await requestStorage.run(runtimeCtx, () =>
    spliceDynamicHolesIntoShell(
      deserializeJSX(shellJson),
      () =>
        React.createElement(
          "main",
          null,
          Promise.resolve(React.createElement("h1", null, "Title")),
          getStaticBanner(),
          React.createElement(
            Suspense,
            {
              fallback: React.createElement(
                "div",
                { className: "skel-1" },
                "Loading 1..."
              ),
            },
            getMetricsTable(35, "HoleOneFresh")
          ),
          React.createElement(
            Suspense,
            {
              fallback: React.createElement(
                "div",
                { className: "skel-2" },
                "Loading 2..."
              ),
            },
            [
              getMetricsTable(35, "HoleTwoFreshA"),
              getMetricsTable(35, "HoleTwoFreshB"),
            ]
          )
        ),
      0
    )
  );

  const holeBoundary1 = spliced.props.children[2].props.children;
  const resolvedHole1 = await requestStorage.run(runtimeCtx, () =>
    holeBoundary1.type(holeBoundary1.props)
  );
  assert.equal(resolvedHole1.props.id, "promise-metrics");
  assert.equal(resolvedHole1.props.children.props.children, "HoleOneFresh");
  assert.match(
    resolvedHole1.props.children.props["data-uid"],
    /^_hole_ppr-hole-1_dS_/
  );

  const holeBoundary2 = spliced.props.children[3].props.children;
  const resolvedHole2 = await requestStorage.run(runtimeCtx, () =>
    holeBoundary2.type(holeBoundary2.props)
  );
  assert.equal(Array.isArray(resolvedHole2), true);
  assert.equal(resolvedHole2[0].props.children.props.children, "HoleTwoFreshA");
  assert.match(
    resolvedHole2[0].props.children.props["data-uid"],
    /^_hole_ppr-hole-2_dS_/
  );

  // 3c. <DinouCacheSlot>{getMetricsTable()}</DinouCacheSlot> persists resolved DOM tree & slot-scoped useId()
  const storage = new MemoryStorage({ hydrateFromDisk: false });
  setStorageAdapter(storage);
  const slotCtx = createMockRequestContext({ isSSG: true });
  await requestStorage.run(slotCtx, () =>
    asyncRenderJSXToClientJSX(
      React.createElement(
        DinouCacheSlot,
        { id: "direct-promise-slot", revalidate: 60 },
        getMetricsTable(30, "SlotLive")
      )
    )
  );
  const cachedSlot = await storage.get("slots/direct-promise-slot/slot.json");
  assert.ok(cachedSlot?.content);
  assert.notEqual(cachedSlot.content, "{}");
  assert.ok(cachedSlot.content.includes("promise-metrics"));
  assert.ok(cachedSlot.content.includes("SlotLive"));
  assert.ok(cachedSlot.content.includes("_slot_direct-promise-slot_dS_"));
}

console.log(
  "4️⃣ Checking Client Component Flight Promise props vs. nested Server JSX elements..."
);
{
  function ClientResults() {}
  Object.defineProperties(ClientResults, {
    $$typeof: { value: Symbol.for("react.client.reference") },
    $$id: { value: "file:///src/search/client-results.tsx#ClientResults" },
  });

  const ServerForwardWrap = React.forwardRef(function ServerForwardWrap(
    props,
    _ref
  ) {
    return React.createElement(ClientResults, { promise: props.promise });
  });

  const ServerMemoWrap = React.memo(function ServerMemoWrap(props) {
    return React.createElement(ClientResults, { promise: props.promise });
  });

  let settled = false;
  const flightPromise = sleep(450).then(() => {
    settled = true;
    return [{ id: "p1", title: "Pro Plan" }];
  });

  const dynCtx = createMockRequestContext({ dynamic: true });
  const t0 = Date.now();
  const rendered = await requestStorage.run(dynCtx, () =>
    asyncRenderJSXToClientJSX(
      React.createElement(
        "div",
        null,
        React.createElement(
          ClientResults,
          {
            promise: flightPromise,
            list: [flightPromise],
            nested: { itemsPromise: [flightPromise] },
          },
          React.createElement(
            "div",
            { id: "server-slot-in-client" },
            Promise.resolve("Server Child Resolved")
          )
        ),
        React.createElement(ServerForwardWrap, { promise: flightPromise }),
        React.createElement(ServerMemoWrap, { promise: flightPromise })
      )
    )
  );
  const elapsed = Date.now() - t0;

  assert.ok(
    elapsed < 60,
    `Expected non-blocking client prop traversal (<60ms), got ${elapsed}ms`
  );
  assert.equal(settled, false);
  const clientNode = rendered.props.children[0];
  assert.equal(clientNode.props.promise, flightPromise);
  assert.equal(clientNode.props.list[0], flightPromise);
  assert.equal(clientNode.props.nested.itemsPromise[0], flightPromise);
  assert.equal(
    clientNode.props.children.props.children,
    "Server Child Resolved"
  );
  assert.equal(rendered.props.children[1].props.promise, flightPromise);
  assert.equal(rendered.props.children[2].props.promise, flightPromise);

  // streamDynamicHoles skips awaiting Client Component prop promises while streaming real holes
  const writtenChunks = [];
  const writer = {
    write: async (bytes) =>
      writtenChunks.push(new TextDecoder().decode(bytes)),
  };
  const tStream = Date.now();
  await requestStorage.run(dynCtx, () =>
    streamDynamicHoles(
      React.createElement(
        "div",
        null,
        React.createElement(ClientResults, {
          promise: flightPromise,
          nested: { p: flightPromise },
        }),
        React.createElement(
          Suspense,
          { fallback: React.createElement("span", null, "Loading") },
          Promise.resolve(React.createElement("p", null, "Streamed Hole"))
        )
      ),
      ["ppr-hole-1"],
      writer,
      new TextEncoder(),
      null,
      false
    )
  );
  assert.ok(Date.now() - tStream < 80);
  assert.equal(settled, false);
  assert.equal(writtenChunks.length, 1);
  assert.ok(writtenChunks[0].includes("ppr-content-ppr-hole-1"));

  // PPR Build inside <Suspense> registers ppr-hole-1 on Client Component Flight Promise prop
  const pprCtx = createMockRequestContext({ isSSG: true });
  let holes = [];
  await requestStorage.run(pprCtx, async () => {
    await runWithPprContext({ isPpr: true }, async () => {
      resetPprHoles(0);
      await asyncRenderJSXToClientJSX(
        React.createElement(
          Suspense,
          { fallback: React.createElement("div", null, "Searching...") },
          React.createElement(ClientResults, { promise: flightPromise })
        )
      );
      holes = getRegisteredHoles();
    });
  });
  assert.deepEqual(holes, ["ppr-hole-1"]);
}

console.log(
  "5️⃣ Compiling isolated Dual-Engine mini-app & verifying real HTTP chunk streaming across Dynamic SSR, PPR & ?query ISG..."
);
const miniRoot = path.join(
  projectRoot,
  `.dinou/_tmp_streaming_suspense_${process.pid}_${Date.now()}`
);
try {
  fs.mkdirSync(path.join(miniRoot, "src/streaming-ssr"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/ppr-promise"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/isg-catalog/[slug]"), {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(miniRoot, "package.json"),
    JSON.stringify({ name: "tmp-streaming-suspense", type: "module" }, null, 2)
  );

  fs.writeFileSync(
    path.join(miniRoot, "src/layout.tsx"),
    `import type { ReactNode } from "react";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Mini Stream App</title></head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(miniRoot, "src/streaming-ssr/page_functions.ts"),
    `export const revalidate = 0;\n`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/streaming-ssr/page.tsx"),
    `import { Suspense } from "react";

async function getDelayedMetrics() {
  await new Promise((r) => setTimeout(r, 380));
  return <div data-testid="streamed-metrics">Live Revenue: $128,400</div>;
}

export default function StreamingSsrPage() {
  return (
    <main>
      <h1 data-testid="instant-header">Executive Dashboard</h1>
      <Suspense fallback={<div data-testid="metrics-skeleton">Loading metrics...</div>}>
        {getDelayedMetrics()}
      </Suspense>
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(miniRoot, "src/ppr-promise/page_functions.ts"),
    `export const ppr = true;\n`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/ppr-promise/page.tsx"),
    `import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";

async function getSlotBadge() {
  await new Promise((r) => setTimeout(r, 20));
  return <div data-testid="mini-slot-badge">MiniSlotOK</div>;
}

async function fetchLiveOrderStatus() {
  await new Promise((r) => setTimeout(r, 320));
  return <p data-testid="ppr-promise-resolved">Order #9042: Shipped</p>;
}

export default function PprDirectPromisePage() {
  return (
    <main>
      <h1 data-testid="ppr-shell-heading">Order Tracker</h1>
      <DinouCacheSlot id="mini-ppr-promise-slot" revalidate={3600}>
        {getSlotBadge()}
      </DinouCacheSlot>
      <Suspense fallback={<p data-testid="ppr-promise-fallback">Fetching live status...</p>}>
        {fetchLiveOrderStatus()}
      </Suspense>
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(miniRoot, "src/isg-catalog/[slug]/page_functions.ts"),
    `export function getStaticPaths() {
  return ["alpha"];
}
export const revalidate = 3600;
`
  );
  fs.writeFileSync(
    path.join(miniRoot, "src/isg-catalog/[slug]/page.tsx"),
    `import { Suspense } from "react";

const rendersBySlug = new Map<string, number>();

async function getCatalog(slug: string) {
  const delay = slug === "alpha" ? 20 : 340;
  await new Promise((r) => setTimeout(r, delay));
  return <div data-testid="catalog-resolved">{\`CatalogDetails:\${slug}\`}</div>;
}

export default function IsgCatalogPage({ params }: { params: { slug: string } }) {
  const count = (rendersBySlug.get(params.slug) ?? 0) + 1;
  rendersBySlug.set(params.slug, count);
  return (
    <main>
      <h1>{\`IsgCatalog:\${params.slug}:\${count}\`}</h1>
      <Suspense fallback={<div data-testid="catalog-skeleton">Loading catalog...</div>}>
        {getCatalog(params.slug)}
      </Suspense>
    </main>
  );
}
`
  );

  process.chdir(miniRoot);
  await generateStatic();

  const dist2 = path.join(miniRoot, ".dinou/dist2");
  const fsStorage = new FileSystemStorage(dist2);
  setStorageAdapter(fsStorage);

  const rscModule = await import(
    pathToFileURL(path.join(miniRoot, ".dinou/node/rsc-engine.mjs")).href
  );
  const ssrModule = await import(
    pathToFileURL(path.join(miniRoot, ".dinou/node/ssr-engine.mjs")).href
  );
  if (typeof rscModule.setStorageAdapter === "function") {
    rscModule.setStorageAdapter(fsStorage);
  }

  // 5a. Verify PPR artifacts & <DinouCacheSlot> direct Promise persistence
  const pprShellJson = await fsStorage.get("ppr-promise/shell.page.json");
  assert.ok(pprShellJson?.content, "Expected ppr-promise/shell.page.json");
  assert.ok(pprShellJson.content.includes("ppr-hole-1"));
  assert.ok(!pprShellJson.content.includes("{}"));

  const miniSlotJson = await fsStorage.get(
    "slots/mini-ppr-promise-slot/slot.json"
  );
  assert.ok(miniSlotJson?.content, "Expected slots/mini-ppr-promise-slot/slot.json");
  assert.notEqual(miniSlotJson.content.trim(), "{}");
  assert.ok(miniSlotJson.content.includes("MiniSlotOK"));

  // 5b. Verify SSG route settled <Suspense> eagerly without skeleton DOM or suspended boundary marker
  const alphaStatic = await fsStorage.get("isg-catalog/alpha/index.html");
  assert.ok(alphaStatic?.content);
  assert.ok(alphaStatic.content.includes('<div data-testid="catalog-resolved">'));
  assert.ok(alphaStatic.content.includes("CatalogDetails:alpha"));
  assert.ok(!alphaStatic.content.includes('<div data-testid="catalog-skeleton">'));
  assert.ok(!alphaStatic.content.includes("<!--$?-->"));

  // 5c. Verify Dynamic SSR progressive HTTP chunk streaming
  const dynStreamRes = await rscModule.handleRequest(
    new Request("http://localhost/streaming-ssr"),
    { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
  );
  const dynChunks = await readStreamChunksUntilMarker(
    dynStreamRes,
    "Executive Dashboard"
  );
  assert.ok(dynChunks.firstChunkHtml.includes("Executive Dashboard"));
  assert.ok(dynChunks.firstChunkHtml.includes("Loading metrics..."));
  assert.ok(
    !dynChunks.firstChunkHtml.includes("Live Revenue: $128,400"),
    "Dynamic SSR Chunk 1 must flush shell + fallback BEFORE 380ms Suspense child resolves"
  );
  assert.ok(dynChunks.fullHtml.includes("Live Revenue: $128,400"));
  assert.ok(
    dynChunks.totalTime - dynChunks.firstChunkTime >= 220,
    `Expected >=220ms streaming gap between Chunk 1 (${dynChunks.firstChunkTime}ms) and completion (${dynChunks.totalTime}ms)`
  );

  // 5d. Verify PPR Runtime Resume progressive HTTP chunk streaming with direct Promise<ReactNode> hole
  const pprStreamRes = await rscModule.handleRequest(
    new Request("http://localhost/ppr-promise"),
    { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
  );
  const pprChunks = await readStreamChunksUntilMarker(
    pprStreamRes,
    "Order Tracker"
  );
  assert.ok(pprChunks.firstChunkHtml.includes("Order Tracker"));
  assert.ok(pprChunks.firstChunkHtml.includes("MiniSlotOK"));
  assert.ok(pprChunks.firstChunkHtml.includes("Fetching live status..."));
  assert.ok(
    !pprChunks.firstChunkHtml.includes("Order #9042: Shipped"),
    "PPR Chunk 1 must flush static shell + slot + hole fallback immediately"
  );
  assert.ok(pprChunks.fullHtml.includes("Order #9042: Shipped"));
  assert.ok(pprChunks.totalTime - pprChunks.firstChunkTime >= 180);

  // 5e. Verify ?query on uncached ISG route streams progressively WITHOUT poisoning subsequent clean ISG static settlement
  const queryIsgRes = await rscModule.handleRequest(
    new Request("http://localhost/isg-catalog/beta?utm_source=stream"),
    { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
  );
  const queryIsgChunks = await readStreamChunksUntilMarker(
    queryIsgRes,
    "IsgCatalog:beta:1"
  );
  assert.ok(
    queryIsgChunks.firstChunkHtml.includes(
      '<div data-testid="catalog-skeleton">Loading catalog...</div>'
    )
  );
  assert.ok(queryIsgChunks.firstChunkHtml.includes("<!--$?-->"));
  assert.ok(!queryIsgChunks.firstChunkHtml.includes("CatalogDetails:beta"));
  assert.ok(queryIsgChunks.fullHtml.includes("CatalogDetails:beta"));
  assert.ok(queryIsgChunks.totalTime - queryIsgChunks.firstChunkTime >= 180);
  assert.equal(await fsStorage.get("isg-catalog/beta/index.html"), null);

  // Clean ISG request settles <Suspense> eagerly into final HTML and persists to disk
  const cleanIsgHtml = await (
    await rscModule.handleRequest(
      new Request("http://localhost/isg-catalog/beta"),
      { runtime: "node-bundle", renderHtmlStream: ssrModule.renderHtml }
    )
  ).text();
  assert.match(cleanIsgHtml, /IsgCatalog:beta:2/);
  assert.ok(cleanIsgHtml.includes('<div data-testid="catalog-resolved">'));
  assert.ok(cleanIsgHtml.includes("CatalogDetails:beta"));
  assert.ok(
    !cleanIsgHtml.includes('<div data-testid="catalog-skeleton">'),
    "Clean ISG render must settle <Suspense> eagerly without skeleton DOM flash"
  );
  assert.ok(
    !cleanIsgHtml.includes("<!--$?-->"),
    "Clean ISG render must not emit suspended <!--$?--> boundary markers"
  );
  assert.match(cleanIsgHtml, /window\.__DINOU_USE_STATIC__\s*=\s*true;/);
  assert.ok(await fsStorage.get("isg-catalog/beta/index.html"));
} finally {
  process.chdir(projectRoot);
  try {
    await esbuild.stop();
  } catch {}
  try {
    fs.rmSync(miniRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 80,
    });
  } catch {}
}

console.log(
  "✅ RESULT: All Streaming <Suspense> & Direct Promise<ReactNode> verification checks PASSED"
);
