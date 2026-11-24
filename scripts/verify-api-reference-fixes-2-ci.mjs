// scripts/verify-api-reference-fixes-2-ci.mjs
// Verifies Dinou v9.4.0 API Reference Batch 2 Fixes (x-api-reference-fixes-2.md):
// 1. Syntax check & source contracts in generate-route-types.js, handler.js & request-context.js
// 2. Contextual .dinou/routes/**/dinou.js useRouter() memoization (client + react-server safe) & dinou.d.ts 7-type re-export parity
// 3. getContext() fallback parity (server & browser) exposing req.path="/", req.rawPath="/", req.isRscRequest=false
// 4. Tri-bundler (esbuild, rollup, webpack) integration: plugin state propagates while rawPath & isRscRequest stay isolated across SSR, RSC & Server Functions

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

const esbuild = await import(
  pathToFileURL(
    path.resolve(projectRoot, "node_modules", "esbuild", "lib", "main.js")
  ).href
);

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
  "tmp-api-ref-2-ci-fixtures"
);
fs.mkdirSync(fixturesParent, { recursive: true });
const tmpBase = fs.mkdtempSync(path.join(fixturesParent, "run-"));

try {
  // =========================================================================
  // 1️⃣ Syntax Check & Source Contracts
  // =========================================================================
  console.log(
    "1️⃣ Verifying JS syntax & source contracts in generate-route-types.js, handler.js & request-context.js..."
  );
  {
    for (const rel of [
      "core/generate-route-types.js",
      "core/handler.js",
      "core/request-context.js",
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

    const genTypesSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core", "generate-route-types.js"),
      "utf8"
    );
    assert.match(genTypesSrc, /import React, \{ createElement \} from "react";/);
    assert.match(
      genTypesSrc,
      /const useMemo = React\.useMemo \|\| \(\(fn\) => fn\(\)\);/
    );
    for (const exportedType of [
      "DinouEnv",
      "DinouNavigableRoutePatternMap",
      "DinouNavigableRouteKey",
      "DinouDynamicRoutePattern",
      "DinouDynamicRouteWithSuffix",
      "DinouEffectiveRoutePattern",
      "ScopedLinkTargetForFrom",
    ]) {
      assert.match(
        genTypesSrc,
        new RegExp(`\\b${exportedType}\\b`),
        `generate-route-types.js must re-export ${exportedType} in contextual dinou.d.ts`
      );
    }

    const handlerSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core", "handler.js"),
      "utf8"
    );
    const reqCtxSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core", "request-context.js"),
      "utf8"
    );
    assert.match(
      reqCtxSrc,
      /"path",\s*"rawPath",\s*"isRscRequest",/,
      "copyCustomContextProperties() must exclude rawPath and isRscRequest"
    );
    assert.match(
      handlerSrc,
      /rawPath:\s*simReq\.rawPath \|\| simReq\.path,\s*isRscRequest:\s*false,/,
      "createServerFunctionContext() must populate rawPath and isRscRequest: false"
    );
    assert.ok(
      (reqCtxSrc.match(/rawPath:\s*"\/"/g) || []).length >= 2,
      "request-context.js must populate rawPath: '/' in both server and browser fallbacks"
    );
    assert.ok(
      (reqCtxSrc.match(/isRscRequest:\s*false/g) || []).length >= 2,
      "request-context.js must populate isRscRequest: false in both server and browser fallbacks"
    );
  }
  console.log("   ✅ Section 1 passed!");

  // =========================================================================
  // 2️⃣ Contextual dinou.js useRouter() Memoization (Client & react-server Safe) + dinou.d.ts Parity
  // =========================================================================
  console.log(
    "2️⃣ Verifying contextual dinou.js useRouter() memoization (client + react-server safe) & dinou.d.ts re-exports..."
  );
  {
    const { generateRouteTypes } = await import(
      pathToFileURL(path.join(DINOU_ROOT, "core", "generate-route-types.js"))
        .href
    );
    const unitTmp = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-ci-ref2-"));
    try {
      fs.mkdirSync(path.join(unitTmp, "src", "blog", "[slug]"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(unitTmp, "src", "page.tsx"),
        "export default function Home() { return null; }\n"
      );
      fs.writeFileSync(
        path.join(unitTmp, "src", "blog", "[slug]", "page.tsx"),
        "export default function Post() { return null; }\n"
      );

      generateRouteTypes(unitTmp);

      const ctxJsPath = path.join(
        unitTmp,
        ".dinou",
        "routes",
        "blog",
        "[slug]",
        "dinou.js"
      );
      const ctxDtsPath = path.join(
        unitTmp,
        ".dinou",
        "routes",
        "blog",
        "[slug]",
        "dinou.d.ts"
      );
      assert.ok(fs.existsSync(ctxJsPath));
      assert.ok(fs.existsSync(ctxDtsPath));

      const ctxDts = fs.readFileSync(ctxDtsPath, "utf8");
      for (const expectedType of [
        "DinouEnv",
        "DinouNavigableRoutePatternMap",
        "DinouNavigableRouteKey",
        "DinouDynamicRoutePattern",
        "DinouDynamicRouteWithSuffix",
        "DinouEffectiveRoutePattern",
        "ScopedLinkTargetForFrom",
      ]) {
        assert.match(ctxDts, new RegExp(`\\b${expectedType}\\b`));
      }

      const entryPath = path.join(unitTmp, "entry.js");
      fs.writeFileSync(
        entryPath,
        `import { __setBaseRouter } from "dinou";
export { useRouter, ROUTE } from ${JSON.stringify(ctxJsPath)};
export { __setBaseRouter };
`,
        "utf8"
      );

      // 2A. Client bundle with React.useMemo
      const clientBundle = await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        format: "esm",
        platform: "neutral",
        write: false,
        plugins: [
          {
            name: "mock-client-deps",
            setup(build) {
              build.onResolve({ filter: /^react$/ }, () => ({
                path: "mock-react",
                namespace: "mock",
              }));
              build.onResolve({ filter: /^dinou$/ }, () => ({
                path: "mock-dinou",
                namespace: "mock",
              }));
              build.onLoad({ filter: /^mock-react$/, namespace: "mock" }, () => ({
                contents: `
                  let memoCache = null;
                  let memoDeps = null;
                  export function createElement(type, props) { return { type, props }; }
                  export default {
                    createElement,
                    useMemo(fn, deps) {
                      const same = memoDeps && deps && memoDeps.length === deps.length && deps.every((d, i) => Object.is(d, memoDeps[i]));
                      if (same) return memoCache;
                      memoDeps = deps;
                      memoCache = fn();
                      return memoCache;
                    },
                  };
                `,
                loader: "js",
              }));
              build.onLoad({ filter: /^mock-dinou$/, namespace: "mock" }, () => ({
                contents: `
                  let currentBase = null;
                  export function __setBaseRouter(r) { currentBase = r; }
                  export function useRouter() { return currentBase; }
                  export const Link = () => null;
                  export const defineConfig = (c) => c;
                  export const getContext = () => ({});
                  export const noDynamic = () => {};
                  export const usePathname = () => "/";
                  export const useSearchParams = () => new URLSearchParams();
                  export const refreshSlot = () => Promise.resolve();
                  export const useNavigationLoading = () => false;
                  export const redirect = () => null;
                  export const ClientRedirect = () => null;
                `,
                loader: "js",
              }));
            },
          },
        ],
      });
      const clientOut = path.join(unitTmp, "client.mjs");
      fs.writeFileSync(clientOut, clientBundle.outputFiles[0].text, "utf8");
      const clientMod = await import(pathToFileURL(clientOut).href);

      const navCalls = [];
      const base1 = {
        push: (href, opts) => navCalls.push({ m: "push", href, opts }),
        replace: (href, opts) => navCalls.push({ m: "replace", href, opts }),
        back: () => {},
        forward: () => {},
        refresh: () => {},
        refreshSlot: () => Promise.resolve(),
      };
      clientMod.__setBaseRouter(base1);
      const r1 = clientMod.useRouter();
      const r2 = clientMod.useRouter();
      assert.strictEqual(r1, r2);
      r1.push("comments");
      r1.replace("comments", { fresh: true });
      r1.push("other", { from: "/override" });
      assert.deepEqual(navCalls, [
        { m: "push", href: "comments", opts: { from: "/blog/[slug]" } },
        {
          m: "replace",
          href: "comments",
          opts: { fresh: true, from: "/blog/[slug]" },
        },
        { m: "push", href: "other", opts: { from: "/override" } },
      ]);

      clientMod.__setBaseRouter({ ...base1 });
      const r3 = clientMod.useRouter();
      assert.notStrictEqual(r1, r3);

      // 2B. react-server bundle where React.useMemo is undefined
      const rscBundle = await esbuild.build({
        entryPoints: [entryPath],
        bundle: true,
        format: "esm",
        platform: "neutral",
        write: false,
        plugins: [
          {
            name: "mock-rsc-deps",
            setup(build) {
              build.onResolve({ filter: /^react$/ }, () => ({
                path: "mock-rsc-react",
                namespace: "mock",
              }));
              build.onResolve({ filter: /^dinou$/ }, () => ({
                path: "mock-dinou",
                namespace: "mock",
              }));
              build.onLoad(
                { filter: /^mock-rsc-react$/, namespace: "mock" },
                () => ({
                  contents: `
                    export function createElement(type, props) { return { type, props }; }
                    export default { createElement };
                  `,
                  loader: "js",
                })
              );
              build.onLoad({ filter: /^mock-dinou$/, namespace: "mock" }, () => ({
                contents: `
                  let currentBase = { push: () => {}, replace: () => {} };
                  export function __setBaseRouter(r) { currentBase = r; }
                  export function useRouter() { return currentBase; }
                  export const Link = () => null;
                  export const defineConfig = (c) => c;
                  export const getContext = () => ({});
                  export const noDynamic = () => {};
                  export const usePathname = () => "/";
                  export const useSearchParams = () => new URLSearchParams();
                  export const refreshSlot = () => Promise.resolve();
                  export const useNavigationLoading = () => false;
                  export const redirect = () => null;
                  export const ClientRedirect = () => null;
                `,
                loader: "js",
              }));
            },
          },
        ],
      });
      const rscOut = path.join(unitTmp, "rsc.mjs");
      fs.writeFileSync(rscOut, rscBundle.outputFiles[0].text, "utf8");
      const rscMod = await import(pathToFileURL(rscOut).href);
      assert.equal(rscMod.ROUTE, "/blog/[slug]");
      assert.equal(typeof rscMod.useRouter().push, "function");
    } finally {
      removeDirSafe(unitTmp);
    }
  }
  console.log("   ✅ Section 2 passed!");

  // =========================================================================
  // 3️⃣ getContext() Server & Browser Fallback Parity
  // =========================================================================
  console.log(
    "3️⃣ Verifying getContext() server & browser fallbacks populate rawPath='/' & isRscRequest=false..."
  );
  {
    const { getContext } = await import(
      pathToFileURL(path.join(DINOU_ROOT, "core", "request-context.js")).href
    );

    const serverCtx = getContext();
    assert.equal(serverCtx.req.path, "/");
    assert.equal(serverCtx.req.rawPath, "/");
    assert.equal(serverCtx.req.isRscRequest, false);

    const prevWindow = globalThis.window;
    const prevConsoleError = console.error;
    const errors = [];
    globalThis.window = {};
    console.error = (...args) => errors.push(args.join(" "));
    try {
      const browserCtx = getContext();
      assert.equal(browserCtx.req.path, "/");
      assert.equal(browserCtx.req.rawPath, "/");
      assert.equal(browserCtx.req.isRscRequest, false);
      assert.ok(errors.some((e) => e.includes("getContext()")));
    } finally {
      console.error = prevConsoleError;
      if (prevWindow === undefined) delete globalThis.window;
      else globalThis.window = prevWindow;
    }
  }
  console.log("   ✅ Section 3 passed!");

  // =========================================================================
  // 4️⃣ Tri-Bundler (Esbuild, Rollup, Webpack) Integration: SSR, RSC & Server Functions
  // =========================================================================
  console.log(
    "4️⃣ Verifying tri-bundler (esbuild, rollup, webpack) plugin context propagation & rawPath/isRscRequest isolation across SSR, RSC & Server Functions..."
  );
  {
    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      const appDir = path.join(tmpBase, `ctx-ref2-${bundler}`);
      fs.mkdirSync(path.join(appDir, "src", "inspect"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "package.json"),
        JSON.stringify(
          { name: `ci-ref2-${bundler}`, type: "module", private: true },
          null,
          2
        )
      );
      writeDinouShim(appDir);

      fs.writeFileSync(
        path.join(appDir, "dinou.config.ts"),
        `import { defineConfig } from "dinou/config";
export default defineConfig({
  plugins: [
    {
      name: "tenant-context",
      onRequest(_req, ctx) {
        ctx.tenant = "acme-corp";
        ctx.req.customFlag = "plugin-req-ok";
      },
    },
  ],
});
`
      );
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
        path.join(appDir, "src", "inspect", "actions.ts"),
        `"use server";
import { getContext } from "dinou/server";

export async function inspectSfContext() {
  const ctx = getContext();
  return {
    tenant: ctx.tenant,
    customFlag: ctx.req.customFlag,
    path: ctx.req.path,
    rawPath: ctx.req.rawPath,
    isRscRequest: ctx.req.isRscRequest,
  };
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "inspect", "client-trigger.tsx"),
        `"use client";
import { inspectSfContext } from "./actions";
export function ClientTrigger() {
  return <button type="button" onClick={() => inspectSfContext()}>Run</button>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "inspect", "page_functions.ts"),
        `export const revalidate = 0;\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "inspect", "page.tsx"),
        `import { getContext } from "./dinou";
import { ClientTrigger } from "./client-trigger";
export default function InspectPage() {
  const ctx = getContext();
  return (
    <main>
      <div id="ctx-info">
        {\`tenant=\${ctx.tenant}|flag=\${ctx.req.customFlag}|path=\${ctx.req.path}|raw=\${ctx.req.rawPath}|rsc=\${String(ctx.req.isRscRequest)}\`}
      </div>
      <ClientTrigger />
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
      assert.equal(
        fs.existsSync(
          path.join(appDir, ".dinou", "dist2", "inspect", "index.html")
        ),
        false,
        `[${bundler}] revalidate=0 /inspect must not be emitted into .dinou/dist2`
      );

      const probePath = path.join(appDir, "probe.mjs");
      fs.writeFileSync(
        probePath,
        `import assert from "node:assert/strict";
import { handleRequest } from "./.dinou/node/rsc-engine.mjs";
import { renderHtml } from "./.dinou/node/ssr-engine.mjs";

const opts = { runtime: "node-bundle", renderHtmlStream: renderHtml };

const ssrRes = await handleRequest(new Request("http://localhost:3000/inspect"), opts);
assert.equal(ssrRes.status, 200);
const ssrHtml = await ssrRes.text();
assert.match(ssrHtml, /tenant=acme-corp\\|flag=plugin-req-ok\\|path=\\/inspect\\/?\\|raw=\\/inspect\\|rsc=false/);

const rscRes = await handleRequest(new Request("http://localhost:3000/____rsc_page____/inspect"), opts);
assert.equal(rscRes.status, 200);
const rscText = await rscRes.text();
assert.match(rscText, /tenant=acme-corp\\|flag=plugin-req-ok\\|path=\\/inspect\\/?\\|raw=\\/____rsc_page____\\/inspect\\|rsc=true/);

const sfRes = await handleRequest(
  new Request("http://localhost:3000/____server_function____", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-server-function-call": "1",
      host: "localhost:3000",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({
      id: "file:///src/inspect/actions.ts#inspectSfContext",
      args: [],
    }),
  }),
  opts
);
assert.equal(sfRes.status, 200);
const sfText = await sfRes.text();
assert.match(sfText, /"tenant":"acme-corp"/);
assert.match(sfText, /"customFlag":"plugin-req-ok"/);
assert.match(sfText, /"path":"\\/____server_function____"/);
assert.match(sfText, /"rawPath":"\\/____server_function____"/);
assert.match(sfText, /"isRscRequest":false/);

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
    `verify-api-reference-fixes-2-ci.mjs must not mutate host workspace ${rel}`
  );
}

console.log(
  "\n🎉 All 4 Dinou v9.4.0 API Reference Batch 2 Contextual ./dinou useRouter(), Type Re-Export & getContext() Isolation verification suites PASSED!"
);
