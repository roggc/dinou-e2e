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

const esbuild = await import(
  pathToFileURL(
    path.resolve(REPO_ROOT, "node_modules", "esbuild", "lib", "main.js")
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

function createFixtureDir(prefix) {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

test("1. Contextual dinou.js memoizes useRouter() (client & react-server safe) & dinou.d.ts re-exports DinouEnv and route helpers", async () => {
  const { generateRouteTypes } = await import(
    pathToFileURL(path.join(DINOU_ROOT, "core", "generate-route-types.js")).href
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-ctx-types-"));
  try {
    fs.mkdirSync(path.join(tmpDir, "src", "blog", "[slug]"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "src", "page.tsx"),
      "export default function Home() { return null; }\n"
    );
    fs.writeFileSync(
      path.join(tmpDir, "src", "blog", "[slug]", "page.tsx"),
      "export default function Post() { return null; }\n"
    );

    generateRouteTypes(tmpDir);

    const ctxJsPath = path.join(
      tmpDir,
      ".dinou",
      "routes",
      "blog",
      "[slug]",
      "dinou.js"
    );
    const ctxDtsPath = path.join(
      tmpDir,
      ".dinou",
      "routes",
      "blog",
      "[slug]",
      "dinou.d.ts"
    );
    assert.ok(fs.existsSync(ctxJsPath), "Expected contextual dinou.js");
    assert.ok(fs.existsSync(ctxDtsPath), "Expected contextual dinou.d.ts");

    const ctxJs = fs.readFileSync(ctxJsPath, "utf8");
    assert.match(ctxJs, /import React, \{ createElement \} from "react";/);
    assert.match(ctxJs, /const useMemo = React\.useMemo \|\| \(\(fn\) => fn\(\)\);/);

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
      assert.match(
        ctxDts,
        new RegExp(`\\b${expectedType}\\b`),
        `Expected ${expectedType} in contextual dinou.d.ts`
      );
    }

    const wrapperEntry = path.join(tmpDir, "test-entry.js");
    fs.writeFileSync(
      wrapperEntry,
      `import { __setBaseRouter } from "dinou";
export { useRouter, ROUTE } from ${JSON.stringify(ctxJsPath)};
export { __setBaseRouter };
`,
      "utf8"
    );

    // 1A. Client mock with real memoization
    const bundled = await esbuild.build({
      entryPoints: [wrapperEntry],
      bundle: true,
      format: "esm",
      platform: "neutral",
      write: false,
      plugins: [
        {
          name: "mock-react-dinou",
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
    const outBundle = path.join(tmpDir, "ctx-bundle.mjs");
    fs.writeFileSync(outBundle, bundled.outputFiles[0].text, "utf8");
    const mod = await import(pathToFileURL(outBundle).href);

    const calls = [];
    const base1 = {
      push: (href, opts) => calls.push({ m: "push", href, opts }),
      replace: (href, opts) => calls.push({ m: "replace", href, opts }),
      back: () => {},
      forward: () => {},
      refresh: () => {},
      refreshSlot: () => Promise.resolve(),
    };
    mod.__setBaseRouter(base1);
    const r1 = mod.useRouter();
    const r2 = mod.useRouter();
    assert.strictEqual(
      r1,
      r2,
      "Contextual useRouter() must return a referentially stable object when base router is unchanged"
    );
    r1.push("comments");
    r1.replace("comments", { fresh: true });
    r1.push("other", { from: "/custom" });
    assert.deepEqual(calls[0], {
      m: "push",
      href: "comments",
      opts: { from: "/blog/[slug]" },
    });
    assert.deepEqual(calls[1], {
      m: "replace",
      href: "comments",
      opts: { fresh: true, from: "/blog/[slug]" },
    });
    assert.deepEqual(calls[2], {
      m: "push",
      href: "other",
      opts: { from: "/custom" },
    });

    const base2 = { ...base1 };
    mod.__setBaseRouter(base2);
    const r3 = mod.useRouter();
    assert.notStrictEqual(
      r1,
      r3,
      "Contextual useRouter() must recompute when base router changes"
    );

    // 1B. react-server safe check: React without useMemo must NOT throw on import or call
    const rscBundled = await esbuild.build({
      entryPoints: [wrapperEntry],
      bundle: true,
      format: "esm",
      platform: "neutral",
      write: false,
      plugins: [
        {
          name: "mock-rsc-react-dinou",
          setup(build) {
            build.onResolve({ filter: /^react$/ }, () => ({
              path: "mock-rsc-react",
              namespace: "mock",
            }));
            build.onResolve({ filter: /^dinou$/ }, () => ({
              path: "mock-dinou",
              namespace: "mock",
            }));
            build.onLoad({ filter: /^mock-rsc-react$/, namespace: "mock" }, () => ({
              contents: `
                export function createElement(type, props) { return { type, props }; }
                export default { createElement };
              `,
              loader: "js",
            }));
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
    const outRscBundle = path.join(tmpDir, "ctx-rsc-bundle.mjs");
    fs.writeFileSync(outRscBundle, rscBundled.outputFiles[0].text, "utf8");
    const rscMod = await import(pathToFileURL(outRscBundle).href);
    assert.equal(rscMod.ROUTE, "/blog/[slug]");
    assert.equal(typeof rscMod.useRouter().push, "function");
  } finally {
    removeDirSafe(tmpDir);
  }
});

test("2. getContext() fallbacks (server & browser) provide rawPath & isRscRequest and handler.js isolates sub-contexts", async () => {
  const { getContext } = await import(
    pathToFileURL(path.join(DINOU_ROOT, "core", "request-context.js")).href
  );

  // Server fallback outside HTTP request
  const serverCtx = getContext();
  assert.ok(serverCtx && typeof serverCtx === "object");
  assert.equal(serverCtx.req.path, "/");
  assert.equal(serverCtx.req.rawPath, "/");
  assert.equal(serverCtx.req.isRscRequest, false);
  assert.ok(serverCtx.env && typeof serverCtx.env === "object");

  // Browser fallback (simulated client invocation)
  const prevWindow = globalThis.window;
  const prevConsoleError = console.error;
  const capturedErrors = [];
  globalThis.window = {};
  console.error = (...args) => capturedErrors.push(args.join(" "));
  try {
    const clientCtx = getContext();
    assert.equal(clientCtx.req.path, "/");
    assert.equal(clientCtx.req.rawPath, "/");
    assert.equal(clientCtx.req.isRscRequest, false);
    assert.ok(
      capturedErrors.some((msg) => msg.includes("getContext()")),
      "Expected browser warning from getContext()"
    );
  } finally {
    console.error = prevConsoleError;
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
  }

  // Source contract verification in handler.js
  const handlerSrc = fs.readFileSync(
    path.join(DINOU_ROOT, "core", "handler.js"),
    "utf8"
  );
  assert.match(
    handlerSrc,
    /"path",\s*"rawPath",\s*"isRscRequest",/,
    "copyCustomContextProperties() must exclude rawPath & isRscRequest"
  );
  assert.match(
    handlerSrc,
    /rawPath:\s*simReq\.rawPath \|\| simReq\.path,\s*isRscRequest:\s*false,/,
    "createServerFunctionContext() must populate rawPath & isRscRequest: false"
  );
});

test("3. Multi-bundler (Esbuild, Rollup, Webpack) integration: plugin state propagates while rawPath/isRscRequest stay isolated across SSR, RSC & Server Functions", async () => {
  const bundlers = ["esbuild", "rollup", "webpack"];
  for (const bundler of bundlers) {
    const tmpApp = createFixtureDir(`tmp-ctx-ref2-${bundler}-`);
    try {
      fs.writeFileSync(
        path.join(tmpApp, "package.json"),
        JSON.stringify(
          { name: `ctx-ref2-${bundler}`, type: "module", private: true },
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

      fs.writeFileSync(
        path.join(tmpApp, "dinou.config.ts"),
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

      fs.mkdirSync(path.join(tmpApp, "src", "inspect"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpApp, "src", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html><head><title>Ctx Test</title></head><body>{children}</body></html>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "page.tsx"),
        `export default function Home() { return <main>Home</main>; }\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "inspect", "actions.ts"),
        `"use server";
import { getContext } from "dinou/server";

export async function inspectSfContext() {
  const ctx = getContext() as any;
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
        path.join(tmpApp, "src", "inspect", "client-trigger.tsx"),
        `"use client";
import { inspectSfContext } from "./actions";
export function ClientTrigger() {
  return <button type="button" onClick={() => inspectSfContext()}>Run</button>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "inspect", "page_functions.ts"),
        `export const revalidate = 0;\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "inspect", "page.tsx"),
        `import { getContext } from "./dinou";
import { ClientTrigger } from "./client-trigger";
export default function InspectPage() {
  const ctx = getContext() as any;
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
        [path.join(DINOU_ROOT, "cli.js"), `build:node:${bundler}`],
        { cwd: tmpApp, encoding: "utf8" }
      );
      assert.equal(
        buildRes.status,
        0,
        `Build failed for ${bundler}:\n${buildRes.stdout}\n${buildRes.stderr}`
      );

      const prevCwd = process.cwd();
      process.chdir(tmpApp);
      try {
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

        // 3A. SSR HTML request
        const ssrRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/inspect"),
          { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
        );
        const ssrHtml = await ssrRes.text();
        assert.match(
          ssrHtml,
          /tenant=acme-corp\|flag=plugin-req-ok\|path=\/inspect\/?\|raw=\/inspect\|rsc=false/,
          `[${bundler}] SSR context mismatch:\n${ssrHtml}`
        );

        // 3B. RSC wire request
        const rscRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/____rsc_page____/inspect"),
          { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
        );
        const rscText = await rscRes.text();
        assert.match(
          rscText,
          /tenant=acme-corp\|flag=plugin-req-ok\|path=\/inspect\/?\|raw=\/____rsc_page____\/inspect\|rsc=true/,
          `[${bundler}] RSC wire context mismatch:\n${rscText}`
        );

        // 3C. Server Function RPC request (createServerFunctionContext populates rawPath & isRscRequest=false while preserving plugin ctx/req fields)
        const sfRes = await rscMod.handleRequest(
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
          { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml }
        );
        assert.equal(sfRes.status, 200, `[${bundler}] SF RPC should return 200`);
        const sfText = await sfRes.text();
        assert.match(sfText, /"tenant":"acme-corp"/, `[${bundler}] SF missing tenant:\n${sfText}`);
        assert.match(sfText, /"customFlag":"plugin-req-ok"/, `[${bundler}] SF missing customFlag:\n${sfText}`);
        assert.match(sfText, /"path":"\/____server_function____"/, `[${bundler}] SF path mismatch:\n${sfText}`);
        assert.match(sfText, /"rawPath":"\/____server_function____"/, `[${bundler}] SF rawPath mismatch:\n${sfText}`);
        assert.match(sfText, /"isRscRequest":false/, `[${bundler}] SF isRscRequest mismatch:\n${sfText}`);
      } finally {
        process.chdir(prevCwd);
      }
    } finally {
      removeDirSafe(tmpApp);
    }
  }
});
