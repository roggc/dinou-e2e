// Automated Core AST & TTFB test suite for src/t-promise
// Verifies Strategy 9 (RSC Promise -> Client use()), Strategy 9 + PPR, and Strategy 12 (getProps Promise -> Client use())

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import esbuild from "esbuild";

const dinouCoreDir = fs.existsSync(path.resolve(process.cwd(), "dinou/core"))
  ? path.resolve(process.cwd(), "dinou/core")
  : path.resolve(process.cwd(), "node_modules/dinou/core");

const { default: getJSX } = await import(
  pathToFileURL(path.join(dinouCoreDir, "get-jsx.js")).href
);
const { asyncRenderJSXToClientJSX } = await import(
  pathToFileURL(path.join(dinouCoreDir, "render-jsx-to-client-jsx.js")).href
);
const { runWithPprContext, resetPprHoles, getRegisteredHoles } = await import(
  pathToFileURL(path.join(dinouCoreDir, "ppr-context.js")).href
);
const { registerRouteModules } = await import(
  pathToFileURL(path.join(dinouCoreDir, "import-module.js")).href
);

const CLIENT_REFERENCE = Symbol.for("react.client.reference");

function compileTsxModule(relPath, { asClientRef = false } = {}) {
  const absPath = path.resolve(process.cwd(), relPath);
  const source = fs.readFileSync(absPath, "utf8");
  const { code } = esbuild.transformSync(source, {
    loader: relPath.endsWith(".tsx") ? "tsx" : "ts",
    format: "cjs",
    jsx: "transform",
  });

  const mod = { exports: {} };
  const fn = new Function("exports", "require", "module", "React", code);
  const customRequire = (id) => {
    if (id === "react") return React;
    if (id.endsWith("client-consumer")) return clientConsumerRscExports;
    throw new Error(`Unexpected require: ${id}`);
  };
  fn(mod.exports, customRequire, mod, React);

  if (asClientRef) {
    const refExports = {};
    for (const [k, v] of Object.entries(mod.exports)) {
      if (typeof v === "function") {
        const refFn = function ClientRefStub() {};
        Object.defineProperty(refFn, "$$typeof", { value: CLIENT_REFERENCE });
        Object.defineProperty(refFn, "$$id", { value: `${relPath}#${k}` });
        Object.defineProperty(refFn, "_realImpl", { value: v });
        refExports[k] = refFn;
      } else {
        refExports[k] = v;
      }
    }
    return { rscExports: refExports, realExports: mod.exports };
  }

  return { rscExports: mod.exports, realExports: mod.exports };
}

const { rscExports: clientConsumerRscExports } = compileTsxModule(
  "src/t-promise/client-consumer.tsx",
  {
    asClientRef: true,
  }
);

const rscPage = compileTsxModule("src/t-promise/page.tsx");
const rscPageFns = compileTsxModule("src/t-promise/page_functions.ts");
const pprPage = compileTsxModule("src/t-promise/ppr/page.tsx");
const pprPageFns = compileTsxModule("src/t-promise/ppr/page_functions.ts");
const getPropsPage = compileTsxModule("src/t-promise/getprops/page.tsx", {
  asClientRef: true,
});
const getPropsPageFns = compileTsxModule(
  "src/t-promise/getprops/page_functions.ts"
);

// Stub root layout so getJSX only tests the target route tree cleanly
const passthroughLayout = {
  default: function RootLayout({ children }) {
    return React.createElement(
      "div",
      { "data-testid": "root-layout" },
      children
    );
  },
};

registerRouteModules({
  "src/layout.tsx": () => passthroughLayout,
  "src/t-promise/client-consumer.tsx": () => clientConsumerRscExports,
  "src/t-promise/page.tsx": () => rscPage.rscExports,
  "src/t-promise/page_functions.ts": () => rscPageFns.rscExports,
  "src/t-promise/ppr/page.tsx": () => pprPage.rscExports,
  "src/t-promise/ppr/page_functions.ts": () => pprPageFns.rscExports,
  "src/t-promise/getprops/page.tsx": () => getPropsPage.rscExports,
  "src/t-promise/getprops/page_functions.ts": () => getPropsPageFns.rscExports,
});

function findElementByType(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findElementByType(item, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(node)) return node;
  if (node.props && typeof node.props === "object") {
    for (const val of Object.values(node.props)) {
      if (val && typeof val === "object" && !(val instanceof Promise)) {
        const found = findElementByType(val, predicate);
        if (found) return found;
      }
    }
  }
  return null;
}

/**
 * Simulates React 19's client `use(usable)` hook behavior:
 * throws a TypeError if `usable` is not a thenable (Promise) or Context,
 * otherwise awaits/unwraps the Promise.
 */
async function simulateReact19ClientUse(usable) {
  if (
    !usable ||
    (typeof usable !== "object" && typeof usable !== "function") ||
    typeof usable.then !== "function"
  ) {
    throw new TypeError(
      `An unsupported type was passed to use(): ${Object.prototype.toString.call(usable)}`
    );
  }
  return await usable;
}

let failures = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    failures++;
    console.error(`❌ FAIL: ${name}`);
    console.error(`   -> ${err.message}`);
  }
}

console.log(
  "\n=== Running Dinou Promise Streaming Core Test Suite (src/t-promise) ===\n"
);

// TEST 1: Strategy 9 — RSC Promise + Array of Promises -> Client use()
await runTest(
  "Test 1 (Strategy 9): RSC passes un-awaited Promise & Promise[] to Client Component without blocking TTFB or unwrapping on server",
  async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const start = Date.now();
      const tree = await getJSX("/t-promise", {}, null, false, false, {
        segment: "page",
      });
      const elapsed = Date.now() - start;

      const singleConsumerEl = findElementByType(
        tree,
        (n) => n?.props?.testId === "rsc-resolved"
      );
      assert.ok(singleConsumerEl, "Expected to find <ClientPromiseConsumer>");

      // 1. Must remain an instance of Promise (not unwrapped to a plain object!)
      assert.equal(
        singleConsumerEl.props.promise instanceof Promise,
        true,
        `Expected props.promise to be a Promise, but got ${typeof singleConsumerEl.props.promise}: ${JSON.stringify(singleConsumerEl.props.promise)}`
      );

      // 2. Must not have blocked getJSX waiting for the 150ms timer
      assert.ok(
        elapsed < 100,
        `Expected getJSX to return immediately without blocking TTFB (<100ms), but took ${elapsed}ms`
      );

      // 3. Array of Promises prop must also preserve Promise instances
      const arrayConsumerEl = findElementByType(
        tree,
        (n) => n?.props?.testId === "rsc-array-resolved"
      );
      assert.ok(
        arrayConsumerEl,
        "Expected to find <ClientPromiseArrayConsumer>"
      );
      assert.equal(
        Array.isArray(arrayConsumerEl.props.promises) &&
          arrayConsumerEl.props.promises.every((p) => p instanceof Promise),
        true,
        `Expected props.promises elements to be Promises, but got: ${JSON.stringify(arrayConsumerEl.props.promises)}`
      );

      // 4. Simulated React 19 client use(promise) must succeed and resolve to expected data
      const resolvedSingle = await simulateReact19ClientUse(
        singleConsumerEl.props.promise
      );
      assert.deepEqual(resolvedSingle, { label: "RSC-Promise-OK", value: 42 });

      const resolvedArray = await Promise.all(
        arrayConsumerEl.props.promises.map((p) => simulateReact19ClientUse(p))
      );
      assert.deepEqual(resolvedArray, ["Alpha", "Beta"]);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  }
);

// TEST 2: Strategy 9 + PPR — RSC with <Suspense> + Client Component receiving Promise prop registers PPR Hole
await runTest(
  "Test 2 (Strategy 9 + PPR): Client Component with Promise prop inside <Suspense> registers a PPR Dynamic Hole (ppr-hole-1)",
  async () => {
    await runWithPprContext({ isPpr: true }, async () => {
      resetPprHoles();
      const rawTree = await getJSX("/t-promise/ppr", {}, null, false, false, {
        segment: "page",
      });
      const pprShellTree = await asyncRenderJSXToClientJSX(rawTree);
      const holes = getRegisteredHoles();

      assert.deepEqual(
        holes,
        ["ppr-hole-1"],
        `Expected PPR build to register ['ppr-hole-1'], but got ${JSON.stringify(holes)}`
      );

      const holeEl = findElementByType(
        pprShellTree,
        (n) => n?.props?.["data-ppr-hole"] === "ppr-hole-1"
      );
      assert.ok(
        holeEl,
        "Expected static PPR shell to contain data-ppr-hole='ppr-hole-1' fallback wrapper"
      );
    });
  }
);

// TEST 3: Strategy 12 — Client-First getProps Promise -> "use client" Page use()
await runTest(
  "Test 3 (Strategy 12): getProps returns un-awaited Promise to 'use client' Page without blocking TTFB or unwrapping on server",
  async () => {
    const start = Date.now();
    const tree = await getJSX("/t-promise/getprops", {}, null, false, false, {
      segment: "page",
    });
    const elapsed = Date.now() - start;

    assert.ok(tree, "Expected root page element from getJSX");

    // 1. docPromise prop on the Client Page must remain a Promise
    assert.equal(
      tree.props.docPromise instanceof Promise,
      true,
      `Expected tree.props.docPromise to be a Promise, but got ${typeof tree.props.docPromise}: ${JSON.stringify(tree.props.docPromise)}`
    );

    // 2. Must not have blocked TTFB waiting for the 150ms docPromise
    assert.ok(
      elapsed < 100,
      `Expected getJSX with getProps Promise to return immediately (<100ms), but took ${elapsed}ms`
    );

    // 3. Simulated React 19 client use(docPromise) must succeed
    const resolvedDoc = await simulateReact19ClientUse(tree.props.docPromise);
    assert.deepEqual(resolvedDoc, { label: "GetProps-Promise-OK", value: 99 });
  }
);

console.log(
  "\n====================================================================="
);
if (failures > 0) {
  console.error(`RESULT: ${failures} test(s) FAILED ❌`);
  process.exit(1);
} else {
  console.log("RESULT: All 3 tests PASSED ✅");
  process.exit(0);
}

