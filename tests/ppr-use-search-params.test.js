import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import React, { Suspense } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

const dinouCoreBase = fs.existsSync(new URL("../dinou/core/handler.js", import.meta.url))
  ? "../dinou/core"
  : fs.existsSync(new URL("../node_modules/dinou/dinou/core/handler.js", import.meta.url))
    ? "../node_modules/dinou/dinou/core"
    : "../node_modules/dinou/core";

const { useSearchParams } = await import(`${dinouCoreBase}/navigation.js`);
const { noDynamic } = await import(`${dinouCoreBase}/no-dynamic.js`);
const { createBailoutProxy } = await import(`${dinouCoreBase}/bailout-proxy.js`);
const { requestStorage } = await import(`${dinouCoreBase}/request-context.js`);
const {
  runWithPprContext,
  getRegisteredHoles,
  resetPprHoles,
} = await import(`${dinouCoreBase}/ppr-context.js`);
const { asyncRenderJSXToClientJSX } = await import(`${dinouCoreBase}/render-jsx-to-client-jsx.js`);

function createMockContext(query = {}, extra = {}) {
  let isStatic = true;
  const markAsDynamic = () => {
    isStatic = false;
  };
  const queryProxy = createBailoutProxy(query, "Query", markAsDynamic);
  const cookiesProxy = createBailoutProxy({}, "Cookies", markAsDynamic);
  const headersProxy = createBailoutProxy({}, "Headers", markAsDynamic);
  const context = {
    req: {
      query: queryProxy,
      cookies: cookiesProxy,
      headers: headersProxy,
      path: "/test",
      method: "GET",
    },
    res: {
      status() {},
      setHeader() {},
      cookie() {},
      clearCookie() {},
      redirect() {},
    },
    _markDynamic: markAsDynamic,
    ...extra,
  };
  return { context, getIsStatic: () => isStatic };
}

test("PPR + useSearchParams: synchronous Server Component inside <Suspense> registers dynamic PPR hole", async () => {
  function SyncSearchComp() {
    const sp = useSearchParams();
    return React.createElement("div", null, sp.get("q") || "empty");
  }

  const { context, getIsStatic } = createMockContext({});
  let holes = [];
  let rendered;

  await requestStorage.run(context, async () => {
    await runWithPprContext({ isPpr: true }, async () => {
      resetPprHoles();
      const tree = React.createElement(
        Suspense,
        { fallback: React.createElement("span", null, "Loading...") },
        React.createElement(SyncSearchComp, null)
      );
      rendered = await asyncRenderJSXToClientJSX(tree);
      holes = getRegisteredHoles();
    });
  });

  assert.strictEqual(getIsStatic(), true, "Route shell should remain static when wrapped in <Suspense>");
  assert.deepStrictEqual(holes, ["ppr-hole-1"], "Synchronous RSC with useSearchParams inside <Suspense> must register ppr-hole-1");
  assert.strictEqual(rendered.props["data-ppr-hole"], "ppr-hole-1");
});

test("PPR + useSearchParams: async Server Component with noDynamic() + useSearchParams() inside <Suspense> still registers dynamic PPR hole", async () => {
  async function NoDynamicPlusSearchComp() {
    noDynamic();
    await new Promise((r) => setTimeout(r, 5));
    const sp = useSearchParams();
    return React.createElement("div", null, sp.get("q") || "empty");
  }

  const { context, getIsStatic } = createMockContext({});
  let holes = [];

  await requestStorage.run(context, async () => {
    await runWithPprContext({ isPpr: true }, async () => {
      resetPprHoles();
      const tree = React.createElement(
        Suspense,
        { fallback: React.createElement("span", null, "Loading...") },
        React.createElement(NoDynamicPlusSearchComp, null)
      );
      await asyncRenderJSXToClientJSX(tree);
      holes = getRegisteredHoles();
    });
  });

  assert.strictEqual(getIsStatic(), true);
  assert.deepStrictEqual(holes, ["ppr-hole-1"], "useSearchParams() must override noDynamic() and register ppr-hole-1");
});

test("PPR + useSearchParams: synchronous Server Component outside <Suspense> triggers Full-Route Dynamic Bailout", async () => {
  function UnwrappedSearchComp() {
    const sp = useSearchParams();
    return React.createElement("div", null, sp.get("q") || "empty");
  }

  const { context, getIsStatic } = createMockContext({});

  await requestStorage.run(context, async () => {
    await runWithPprContext({ isPpr: true }, async () => {
      resetPprHoles();
      await asyncRenderJSXToClientJSX(React.createElement(UnwrappedSearchComp, null));
    });
  });

  assert.strictEqual(getIsStatic(), false, "Unwrapped useSearchParams() must trigger full-route dynamic bailout");
});

test("PPR runtime resume (unbundled Node): async RSC after await reads live query while Pass B SSR Client Component renders empty URLSearchParams", async () => {
  async function AsyncHoleRsc() {
    await new Promise((r) => setTimeout(r, 5));
    const sp = useSearchParams();
    return React.createElement("div", null, `rsc:${sp.get("q") || "none"}`);
  }

  function ClientHoleWidget() {
    const sp = useSearchParams();
    return React.createElement("span", null, `client:${sp.get("q") || "none"}`);
  }

  const { context: resumeCtx } = createMockContext(
    { q: "after-await" },
    { _isPprRuntimeResume: true }
  );

  // 1. Pass A (RSC evaluation inside hole, even unbundled after await): must read real query
  const resolvedRsc = await requestStorage.run(resumeCtx, () =>
    asyncRenderJSXToClientJSX(React.createElement(AsyncHoleRsc, null))
  );
  assert.strictEqual(resolvedRsc.props.children, "rsc:after-await");

  // 2. Pass B (SSR HTML stream during PPR resume): must render empty URLSearchParams to match __DINOU_PPR_RESUME__ client hydration
  const resumeHtml = await requestStorage.run(resumeCtx, async () => {
    const s = await renderToReadableStream(React.createElement(ClientHoleWidget, null));
    return await new Response(s).text();
  });
  assert.ok(resumeHtml.includes("client:none"), `Expected client:none during PPR resume Pass B, got: ${resumeHtml}`);

  // 3. Live SSR (dev / bailout / non-resume): Pass B must render real query directly
  const { context: liveCtx } = createMockContext({ q: "live-ssr" });
  const liveHtml = await requestStorage.run(liveCtx, async () => {
    const s = await renderToReadableStream(React.createElement(ClientHoleWidget, null));
    return await new Response(s).text();
  });
  assert.ok(liveHtml.includes("client:live-ssr"), `Expected client:live-ssr during live SSR, got: ${liveHtml}`);
});
