// scripts/verify-ssr-server-references-ci.mjs
// Verifies:
// 1. Bug #1 — buildSsrServerReferenceModule strips server-only imports, DB clients & secrets from module-level "use server" files (named + default exports), emits canonical project-relative IDs, and marks SSR RPC rejections with Symbol.for("react.recoverable") = true
// 2. Bug #1 — buildSsrServerReferenceModule strips Server Component JSX & "server-only" imports from files with inline "use server" closures ($$dinou_action_N)
// 3. Bug #1 — buildSsrServerReferenceModule returns null for "use client" components that mention "use server" inside string/template literals
// 4. Bug #1 — Browser-conditioned Pass B esbuild bundle + renderToReadableStream handles real node_modules/server-only + useState(() => fetchServerFn()) + React.use() + <form action={fn}> + .bind() with zero onError, zero SSG hang, and zero machine path leaks
// 5. Bug #1 — generateSsrServerManifestStubs + static verification across all 5 compiler pipelines (node/dev, node/bundle-dual-engine, cloudflare/build, bun/build, deno/build): zero disk imports into Pass B
// 6. Bug #2 — Both server-function-proxy.js (ESM) and server-function-proxy-webpack.js (Webpack) preserve thrown err.message & optional err.digest on !res.ok, with clean fallback on non-JSON 502 responses
// 7. Bug #3 — Rollup reactClientManifestPlugin registers both fileUrl and ${fileUrl}#default (plus Windows drive-case variants) and updates chunk IDs across all keys in generateBundle
// 8. Full Dual-Engine + SSG integration with real import "server-only" in both module-level "use server" and inline "use server" Server Component page.tsx, plus live POST /____server_function____ error + digest & Flight execution

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

process.env.NODE_ENV = "production";
delete process.env.DINOU_DEV;
delete process.env.DINOU_BUILD_TOOL;

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
  transformServerFunctions,
  buildSsrServerReferenceModule,
  generateSsrServerManifestStubs,
} = await import(resolveDinouInternal("core/transform-server-functions.js"));
const {
  reactClientManifestPlugin,
} = await import(
  resolveDinouInternal(
    "rollup/rollup-plugins/rollup-plugin-react-client-manifest.js"
  )
);
const {
  FileSystemStorage,
  setStorageAdapter,
} = await import(resolveDinouInternal("core/storage-adapter.js"));
const { generateStatic } = await import(
  resolveDinouInternal("core/generate-static.js")
);

function writeMockServerOnlyPackage(targetRoot) {
  const pkgDir = path.join(targetRoot, "node_modules/server-only");
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify(
      {
        name: "server-only",
        version: "0.0.1",
        exports: {
          "react-server": "./empty.js",
          default: "./index.js",
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(pkgDir, "empty.js"), "export {};\n");
  fs.writeFileSync(
    path.join(pkgDir, "index.js"),
    'throw new Error("This module cannot be imported from a Client Component module.");\n'
  );
}

console.log(
  "1️⃣ Verifying buildSsrServerReferenceModule on module-level 'use server' (named + default exports, zero server leaks)..."
);
{
  const serverSource = `
"use server";
import "server-only";
import { db } from "./secret-db";

const SECRET_TOKEN = "sk_live_SUPER_SECRET_123";
const tasksDb = [];

export async function addTask(text) {
  tasksDb.push({ text, secret: SECRET_TOKEN });
  return db.insert(text);
}

export const resetTasks = async () => {
  tasksDb.length = 0;
};

export default async function defaultPing(tag) {
  return \`\${tag}:\${SECRET_TOKEN}\`;
}
`;

  const stubCode = buildSsrServerReferenceModule(
    serverSource,
    "C:/repo/src/actions/tasks.tsx",
    "file:///src/actions/tasks.tsx"
  );

  assert.ok(stubCode !== null, "Expected non-null SSR server reference module");
  assert.ok(!stubCode.includes("server-only"), "Must strip import 'server-only'");
  assert.ok(!stubCode.includes("secret-db"), "Must strip server DB imports");
  assert.ok(!stubCode.includes("sk_live_SUPER_SECRET_123"), "Must strip server secrets");
  assert.ok(!stubCode.includes("tasksDb"), "Must strip module-level server state");
  assert.match(stubCode, /export const addTask\s*=/);
  assert.match(stubCode, /export const resetTasks\s*=/);
  assert.match(stubCode, /__dinouCreateSsrServerStub\("file:\/\/\/src\/actions\/tasks\.tsx#default"\)/);
  assert.match(stubCode, /export default __dinou_default_stub;/);
  assert.ok(stubCode.includes('"file:///src/actions/tasks.tsx#addTask"'));
  assert.ok(!stubCode.includes("C:/repo"), "Must never embed local OS paths");
  assert.ok(stubCode.includes('Symbol.for("react.recoverable")'));
  assert.ok(stubCode.includes("registerServerReference"));
}

console.log(
  "2️⃣ Verifying buildSsrServerReferenceModule on Server Components with inline 'use server' closures..."
);
{
  const scWithInlineAction = `
import "server-only";

const INLINE_SECRET = "sk_live_INLINE_SC_999";

export default function InlineServerPage({ params }) {
  async function saveInline(note) {
    "use server";
    return \`\${params.id}:\${note}:\${INLINE_SECRET}\`;
  }

  return <main data-secret={INLINE_SECRET}><button onClick={saveInline}>Save</button></main>;
}
`;

  const transformedSc = transformServerFunctions(
    scWithInlineAction,
    "C:/repo/src/inline/page.tsx"
  );
  assert.equal(transformedSc.transformed, true);
  assert.deepEqual(transformedSc.actions, ["$$dinou_action_saveInline_0"]);

  const stubSc = buildSsrServerReferenceModule(
    scWithInlineAction,
    "C:/repo/src/inline/page.tsx",
    "file:///src/inline/page.tsx"
  );
  assert.ok(stubSc !== null, "Expected non-null stub for inline 'use server' SC");
  assert.ok(!stubSc.includes("server-only"), "Must strip server-only from inline SC stub");
  assert.ok(!stubSc.includes("sk_live_INLINE_SC_999"), "Must strip SC secrets from stub");
  assert.match(stubSc, /export const \$\$dinou_action_saveInline_0\s*=/);
}

console.log(
  "3️⃣ Verifying buildSsrServerReferenceModule ignores 'use client' files mentioning 'use server' in literals..."
);
{
  const clientCodeWithUseServerString = `
"use client";
import { useState } from "react";

export default function DocsSnippetViewer() {
  const [open] = useState(true);
  const example = \`"use server";
import "server-only";
export async function demoAction() {}\`;
  return open ? <pre>{example}</pre> : null;
}
`;

  const stubResult = buildSsrServerReferenceModule(
    clientCodeWithUseServerString,
    "C:/repo/src/components/DocsSnippetViewer.tsx",
    "file:///src/components/DocsSnippetViewer.tsx"
  );
  assert.equal(
    stubResult,
    null,
    "'use client' component containing 'use server' literal must return null"
  );

  const plainModuleResult = buildSsrServerReferenceModule(
    `export const answer = 42;\n`,
    "C:/repo/src/utils/math.ts",
    "file:///src/utils/math.ts"
  );
  assert.equal(plainModuleResult, null);
}

console.log(
  "4️⃣ Verifying Pass B browser-conditioned esbuild + renderToReadableStream with real node_modules/server-only, React.use() & <form action>..."
);
const unitTmpDir = path.join(
  projectRoot,
  `.dinou/_tmp_ssr_refs_unit_${process.pid}_${Date.now()}`
);
try {
  fs.mkdirSync(path.join(unitTmpDir, "src"), { recursive: true });
  writeMockServerOnlyPackage(unitTmpDir);

  const actionsPath = path.join(unitTmpDir, "src/actions.tsx");
  const pagePath = path.join(unitTmpDir, "src/page.tsx");
  const entryPath = path.join(unitTmpDir, "ssr-entry.jsx");
  const outPath = path.join(unitTmpDir, "ssr-out.mjs");

  fs.writeFileSync(
    actionsPath,
    `"use server";
import "server-only";

const UNIT_SECRET = "sk_live_UNIT_SECRET_777";

export async function fetchPatternTasks() {
  return <div data-secret={UNIT_SECRET}>Loaded on server</div>;
}

export async function addPatternTask(formData) {
  return String(formData?.get?.("task") ?? "") + UNIT_SECRET;
}

export async function boundPatternAction(preset, formData) {
  return preset + String(formData?.get?.("task") ?? "") + UNIT_SECRET;
}
`
  );

  fs.writeFileSync(
    pagePath,
    `"use client";
import React, { Suspense, use, useState } from "react";
import {
  fetchPatternTasks,
  addPatternTask,
  boundPatternAction,
} from "./actions";

function TasksSlot({ promise }) {
  return <>{use(promise)}</>;
}

export default function PatternPage() {
  const [tasksPromise] = useState(() => fetchPatternTasks());
  const boundAction = boundPatternAction.bind(null, "preset-scope");

  return (
    <div>
      <form data-testid="direct-form" action={addPatternTask}>
        <input name="task" defaultValue="alpha" />
        <button type="submit">Add</button>
      </form>
      <form data-testid="bound-form" action={boundAction}>
        <input name="task" defaultValue="beta" />
        <button type="submit">Add Bound</button>
      </form>
      <Suspense fallback={<p data-testid="fallback">Loading tasks...</p>}>
        <TasksSlot promise={tasksPromise} />
      </Suspense>
    </div>
  );
}
`
  );

  fs.writeFileSync(
    entryPath,
    `import React from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import Page from "./src/page.tsx";

export async function renderTest() {
  let onErrorCalled = false;
  const stream = await renderToReadableStream(<Page />, {
    onError() {
      onErrorCalled = true;
    },
  });
  await stream.allReady;
  const html = await new Response(stream).text();
  return { html, onErrorCalled };
}
`
  );

  await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: "esm",
    platform: "neutral",
    conditions: ["browser"],
    mainFields: ["browser", "module", "main"],
    nodePaths: [path.resolve(projectRoot, "node_modules")],
    outfile: outPath,
    jsx: "automatic",
    plugins: [
      {
        name: "pass-b-server-ref-isolation-test",
        setup(build) {
          build.onLoad({ filter: /\.[jt]sx?$/ }, (args) => {
            if (args.path.includes("node_modules")) return null;
            const code = fs.readFileSync(args.path, "utf8");
            const rel = path.relative(unitTmpDir, args.path).replace(/\\/g, "/");
            const stub = buildSsrServerReferenceModule(
              code,
              args.path,
              `file:///${rel}`
            );
            if (stub !== null) {
              return { contents: stub, loader: "js" };
            }
            return null;
          });
        },
      },
    ],
  });

  const bundledPassBCode = fs.readFileSync(outPath, "utf8");
  assert.ok(
    !bundledPassBCode.includes("sk_live_UNIT_SECRET_777"),
    "Pass B bundle must not contain server secrets"
  );
  assert.ok(
    !bundledPassBCode.includes("This module cannot be imported from a Client Component"),
    "Pass B bundle must not pull in node_modules/server-only"
  );

  const { renderTest } = await import(pathToFileURL(outPath).href);
  const { html, onErrorCalled } = await renderTest();

  assert.equal(
    onErrorCalled,
    false,
    "Symbol.for('react.recoverable') = true must suppress React SSR onError"
  );
  assert.ok(
    html.includes('<p data-testid="fallback">Loading tasks...</p>'),
    "SSR must emit clean <Suspense> fallback HTML"
  );
  assert.ok(
    html.includes('name="$ACTION_ID_file:///src/actions.tsx#addPatternTask"'),
    `Direct <form action> must emit canonical project-relative $ACTION_ID_, got: ${html}`
  );
  assert.ok(
    html.includes("$ACTION_REF_") &&
      html.includes("file:///src/actions.tsx#boundPatternAction"),
    `Bound <form action> must encode canonical project-relative action ID, got: ${html}`
  );
  const leakedPrefix = unitTmpDir.replace(/\\/g, "/").slice(0, 12);
  assert.ok(
    !html.includes(leakedPrefix),
    "SSR HTML must never leak local filesystem directory paths"
  );
} finally {
  try {
    fs.rmSync(unitTmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {}
}

console.log(
  "5️⃣ Verifying generateSsrServerManifestStubs & all 5 compiler pipelines (node/dev, bundle-dual-engine, cloudflare, bun, deno)..."
);
{
  const manifestStubsCode = generateSsrServerManifestStubs({
    "src/actions/tasks.tsx": ["addTask", "default"],
    "src/inline/page.tsx": ["$$dinou_action_0"],
  });

  assert.ok(
    !manifestStubsCode.includes("import * as sf_"),
    "generateSsrServerManifestStubs must never emit disk import * as sf_ statements"
  );
  assert.ok(
    !manifestStubsCode.includes("C:/Users/dev"),
    "generateSsrServerManifestStubs must never emit machine-specific file paths"
  );
  assert.match(manifestStubsCode, /const sf_0 = Object\.defineProperty\(/);
  assert.match(manifestStubsCode, /const sf_1 = Object\.defineProperty\(/);
  assert.ok(
    manifestStubsCode.includes('"file:///src/actions/tasks.tsx#addTask"')
  );
  assert.ok(
    manifestStubsCode.includes('"file:///src/actions/tasks.tsx#default"')
  );
  assert.ok(
    manifestStubsCode.includes('"file:///src/inline/page.tsx#$$dinou_action_0"')
  );

  const compilerFiles = [
    "node/dev.js",
    "node/bundle-dual-engine.js",
    "cloudflare/build.js",
    "bun/build.js",
    "deno/build.js",
  ];
  for (const relCompiler of compilerFiles) {
    const absCompiler = path.resolve(projectRoot, "dinou", relCompiler);
    const src = fs.readFileSync(absCompiler, "utf8");
    assert.ok(
      src.includes("buildSsrServerReferenceModule"),
      `${relCompiler} must wire buildSsrServerReferenceModule in Pass B`
    );
    assert.ok(
      src.includes("generateSsrServerManifestStubs"),
      `${relCompiler} must wire generateSsrServerManifestStubs in Pass B ssr-client-manifest`
    );
  }
}

console.log(
  "6️⃣ Verifying client server-function proxies (ESM & Webpack) preserve err.message and err.digest..."
);
const proxyTmpDir = path.join(
  projectRoot,
  `.dinou/_tmp_ssr_refs_proxy_${process.pid}_${Date.now()}`
);
try {
  fs.mkdirSync(proxyTmpDir, { recursive: true });

  const esmProxySrc = path.resolve(
    projectRoot,
    "dinou/core/server-function-proxy.js"
  );
  const webpackProxySrc = path.resolve(
    projectRoot,
    "dinou/core/server-function-proxy-webpack.js"
  );
  const esmProxyOut = path.join(proxyTmpDir, "esm-proxy.mjs");
  const webpackProxyOut = path.join(proxyTmpDir, "webpack-proxy.mjs");

  const mockRsdPlugin = {
    name: "mock-rsd-client",
    setup(build) {
      build.onResolve(
        {
          filter:
            /^(@roggc\/react-server-dom-esm\/client|react-server-dom-webpack\/client)$/,
        },
        (args) => ({ path: args.path, namespace: "mock-rsd" })
      );
      build.onLoad({ filter: /.*/, namespace: "mock-rsd" }, () => ({
        contents: `export function createFromFetch(p) { return p; }\n`,
        loader: "js",
      }));
    },
  };

  await esbuild.build({
    entryPoints: [esmProxySrc],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: esmProxyOut,
    plugins: [mockRsdPlugin],
  });

  await esbuild.build({
    entryPoints: [webpackProxySrc],
    bundle: true,
    format: "esm",
    platform: "neutral",
    outfile: webpackProxyOut,
    plugins: [mockRsdPlugin],
  });

  const esmMod = await import(pathToFileURL(esmProxyOut).href);
  const webpackMod = await import(pathToFileURL(webpackProxyOut).href);

  const originalFetch = globalThis.fetch;
  try {
    for (const [label, createProxy] of [
      ["ESM proxy", esmMod.createServerFunctionProxy],
      ["Webpack proxy", webpackMod.createServerFunctionProxy],
    ]) {
      const fn = createProxy("file:///src/actions.tsx#addTask");

      // Case A: JSON 500 with custom error + digest
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: "Task must be at least 3 characters long.",
            digest: "TASK_TOO_SHORT",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }
        );

      await assert.rejects(
        () => fn("ab"),
        (err) => {
          assert.equal(
            err.message,
            "Task must be at least 3 characters long.",
            `${label} must preserve err.message`
          );
          assert.equal(
            err.digest,
            "TASK_TOO_SHORT",
            `${label} must attach err.digest`
          );
          return true;
        }
      );

      // Case B: JSON 500 with custom error and NO digest
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "Database quota exceeded" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });

      await assert.rejects(
        () => fn("valid"),
        (err) => {
          assert.equal(err.message, "Database quota exceeded");
          assert.equal("digest" in err, false);
          return true;
        }
      );

      // Case C: Non-JSON 502 Bad Gateway text/plain fallback
      globalThis.fetch = async () =>
        new Response("Bad Gateway", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        });

      await assert.rejects(
        () => fn("valid"),
        (err) => {
          assert.equal(
            err.message,
            "Server function failed",
            `${label} must fall back cleanly on non-JSON 502`
          );
          assert.equal("digest" in err, false);
          return true;
        }
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
} finally {
  try {
    fs.rmSync(proxyTmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {}
}

console.log(
  "7️⃣ Verifying Rollup reactClientManifestPlugin #default parity & generateBundle chunk updates..."
);
const rollupTmpDir = path.join(
  projectRoot,
  `.dinou/_tmp_ssr_refs_rollup_${process.pid}_${Date.now()}`
);
try {
  fs.mkdirSync(path.join(rollupTmpDir, "src/components"), { recursive: true });
  const defaultAndNamedFile = path.join(
    rollupTmpDir,
    "src/components/PatternTaskUpdater.tsx"
  );
  const namedOnlyFile = path.join(
    rollupTmpDir,
    "src/components/NamedOnlyBadge.tsx"
  );
  const snippetClientFile = path.join(
    rollupTmpDir,
    "src/components/SnippetClient.tsx"
  );

  const defaultAndNamedCode = `"use client";
export default function PatternTaskUpdater() {
  return null;
}
export function NamedHelper() {
  return null;
}
`;
  const namedOnlyCode = `"use client";
export function NamedOnlyBadge() {
  return null;
}
`;
  const snippetClientCode = `"use client";
const demo = '"use server"; export async function nope() {}';
export default function SnippetClient() {
  return demo;
}
`;

  fs.writeFileSync(defaultAndNamedFile, defaultAndNamedCode);
  fs.writeFileSync(namedOnlyFile, namedOnlyCode);
  fs.writeFileSync(snippetClientFile, snippetClientCode);

  process.chdir(rollupTmpDir);
  const plugin = reactClientManifestPlugin();
  const mockRollupCtx = {
    addWatchFile() {},
    emitFile() {},
    async resolve() {
      return null;
    },
  };
  await plugin.buildStart.call(mockRollupCtx, { input: [] });

  const mockBundle = {
    "PatternTaskUpdater-chunk.js": {
      type: "chunk",
      fileName: "PatternTaskUpdater-chunk.js",
      facadeModuleId: defaultAndNamedFile,
      exports: ["default", "NamedHelper"],
      modules: { [defaultAndNamedFile]: {} },
    },
    "NamedOnlyBadge-chunk.js": {
      type: "chunk",
      fileName: "NamedOnlyBadge-chunk.js",
      facadeModuleId: namedOnlyFile,
      exports: ["NamedOnlyBadge"],
      modules: { [namedOnlyFile]: {} },
    },
    "SnippetClient-chunk.js": {
      type: "chunk",
      fileName: "SnippetClient-chunk.js",
      facadeModuleId: snippetClientFile,
      exports: ["default"],
      modules: { [snippetClientFile]: {} },
    },
  };

  await plugin.generateBundle.call(mockRollupCtx, {}, mockBundle);

  const emittedManifestPath = path.join(
    rollupTmpDir,
    ".dinou/dist1/react-client-manifest.json"
  );
  assert.ok(
    fs.existsSync(emittedManifestPath),
    "Expected react-client-manifest.json written to disk"
  );
  const emittedManifestJson = JSON.parse(
    fs.readFileSync(emittedManifestPath, "utf8")
  );

  const updaterUrl = pathToFileURL(defaultAndNamedFile).href;
  assert.ok(
    emittedManifestJson[updaterUrl],
    "Rollup manifest must contain bare fileUrl key for default export"
  );
  assert.ok(
    emittedManifestJson[`${updaterUrl}#default`],
    "Rollup manifest must ALSO contain ${fileUrl}#default key for Flight module#default lookups"
  );
  assert.equal(emittedManifestJson[`${updaterUrl}#default`].name, "default");
  assert.equal(
    emittedManifestJson[`${updaterUrl}#default`].id,
    "/PatternTaskUpdater-chunk.js"
  );
  assert.equal(
    emittedManifestJson[updaterUrl].id,
    "/PatternTaskUpdater-chunk.js"
  );
  assert.ok(emittedManifestJson[`${updaterUrl}#NamedHelper`]);
  assert.equal(
    emittedManifestJson[`${updaterUrl}#NamedHelper`].id,
    "/PatternTaskUpdater-chunk.js"
  );

  if (/^file:\/\/\/[a-zA-Z]:/.test(updaterUrl)) {
    const altUrl = updaterUrl.replace(/^file:\/\/\/([a-zA-Z]):/, (_, d) =>
      d === d.toLowerCase()
        ? `file:///${d.toUpperCase()}:`
        : `file:///${d.toLowerCase()}:`
    );
    assert.ok(
      emittedManifestJson[`${altUrl}#default`],
      "Windows drive-case variant ${altUrl}#default must also be registered and updated"
    );
    assert.equal(
      emittedManifestJson[`${altUrl}#default`].id,
      "/PatternTaskUpdater-chunk.js"
    );
  }

  const namedOnlyUrl = pathToFileURL(namedOnlyFile).href;
  assert.ok(emittedManifestJson[`${namedOnlyUrl}#NamedOnlyBadge`]);
  assert.equal(
    emittedManifestJson[`${namedOnlyUrl}#NamedOnlyBadge`].id,
    "/NamedOnlyBadge-chunk.js"
  );

  const snippetUrl = pathToFileURL(snippetClientFile).href;
  assert.ok(
    emittedManifestJson[`${snippetUrl}#default`],
    "'use client' component containing 'use server' string literal must still be registered in Rollup manifest"
  );
  assert.equal(
    emittedManifestJson[`${snippetUrl}#default`].id,
    "/SnippetClient-chunk.js"
  );
} finally {
  process.chdir(projectRoot);
  try {
    fs.rmSync(rollupTmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {}
}

console.log(
  "8️⃣ Compiling isolated Dual-Engine mini-app with real import 'server-only' & verifying SSG + live /____server_function____..."
);
const miniRoot = path.join(
  projectRoot,
  `.dinou/_tmp_ssr_refs_dual_${process.pid}_${Date.now()}`
);
try {
  fs.mkdirSync(path.join(miniRoot, "src/actions"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/components"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/pattern"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, "src/inline-sc/[id]"), { recursive: true });
  fs.mkdirSync(path.join(miniRoot, ".dinou/dist1"), {
    recursive: true,
  });

  writeMockServerOnlyPackage(miniRoot);

  fs.writeFileSync(
    path.join(miniRoot, "package.json"),
    JSON.stringify({ name: "tmp-ssr-server-refs", type: "module" }, null, 2)
  );

  fs.writeFileSync(
    path.join(miniRoot, "src/layout.tsx"),
    `import type { ReactNode } from "react";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Mini SSR Refs</title></head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(miniRoot, "src/components/TaskUpdater.tsx"),
    `"use client";
export default function TaskUpdater({ id }: { id: string }) {
  return <span hidden data-task-id={id} />;
}
`
  );

  fs.writeFileSync(
    path.join(miniRoot, "src/actions/pattern-actions.tsx"),
    `"use server";
import "server-only";
import TaskUpdater from "../components/TaskUpdater";

const DUAL_SECRET = "sk_live_DUAL_ENGINE_SECRET_888";
let passAFetchCalls = 0;
const tasks: string[] = [];

export async function fetchPatternTasks() {
  passAFetchCalls += 1;
  return (
    <ul data-testid="mini-tasks" data-calls={passAFetchCalls}>
      {tasks.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

export async function getPassAFetchCalls() {
  return passAFetchCalls;
}

export async function addPatternTask(text: string) {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < 3) {
    const err = new Error("Task must be at least 3 characters long.") as Error & {
      digest?: string;
    };
    err.digest = "TASK_TOO_SHORT";
    throw err;
  }
  tasks.push(\`\${trimmed}:\${DUAL_SECRET.slice(0, 7)}\`);
  return <TaskUpdater id={\`task-\${tasks.length}\`} />;
}

export async function formStampAction(formData: FormData): Promise<void> {
  void formData.get("tag");
}
`
  );

  fs.writeFileSync(
    path.join(miniRoot, "src/pattern/page.tsx"),
    `"use client";
import { Suspense, use, useState, type ReactNode } from "react";
import { fetchPatternTasks, formStampAction } from "../actions/pattern-actions";

function TasksSlot({ promise }: { promise: Promise<ReactNode> }) {
  return <>{use(promise)}</>;
}

export default function MiniPatternPage() {
  const [tasksPromise] = useState<Promise<ReactNode>>(() => fetchPatternTasks());
  return (
    <main>
      <h1>Mini Dinou Pattern</h1>
      <form action={formStampAction}>
        <input name="tag" defaultValue="stamp" />
      </form>
      <Suspense fallback={<p data-testid="mini-fallback">Loading tasks...</p>}>
        <TasksSlot promise={tasksPromise} />
      </Suspense>
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(miniRoot, "src/inline-sc/[id]/page_functions.ts"),
    `export function getStaticPaths() {
  return ["alpha"];
}
`
  );

  fs.writeFileSync(
    path.join(miniRoot, "src/inline-sc/[id]/page.tsx"),
    `import "server-only";

const INLINE_SC_SECRET = "sk_live_INLINE_DUAL_555";

export default function InlineScPage({ params }: { params: { id: string } }) {
  const itemId = params.id;
  async function inlineAction(note: string) {
    "use server";
    return \`InlineDual:\${itemId}:\${note}:\${INLINE_SC_SECRET.length}\`;
  }
  void inlineAction;
  return (
    <main>
      <h1 data-testid="inline-sc-title">{\`InlineSC:\${itemId}\`}</h1>
    </main>
  );
}
`
  );

  fs.writeFileSync(
    path.join(
      miniRoot,
      ".dinou/dist1/server-functions-manifest.json"
    ),
    JSON.stringify(
      {
        "src/actions/pattern-actions.tsx": [
          "fetchPatternTasks",
          "getPassAFetchCalls",
          "addPatternTask",
          "formStampAction",
        ],
        "src/inline-sc/[id]/page.tsx": ["$$dinou_action_inlineAction_0"],
      },
      null,
      2
    )
  );

  process.chdir(miniRoot);
  await generateStatic();

  const ssrEngineCode = fs.readFileSync(
    path.join(miniRoot, ".dinou/node/ssr-engine.mjs"),
    "utf8"
  );
  assert.ok(
    !ssrEngineCode.includes("sk_live_DUAL_ENGINE_SECRET_888"),
    "Pass B ssr-engine.mjs must never contain 'use server' module secrets"
  );
  assert.ok(
    !ssrEngineCode.includes("sk_live_INLINE_DUAL_555"),
    "Pass B ssr-engine.mjs must never import inline 'use server' Server Component secrets"
  );
  assert.ok(
    !ssrEngineCode.includes(
      "This module cannot be imported from a Client Component module"
    ),
    "Pass B ssr-engine.mjs must never pull in node_modules/server-only"
  );

  const dist2 = path.join(miniRoot, ".dinou/dist2");
  const fsStorage = new FileSystemStorage(dist2);
  setStorageAdapter(fsStorage);

  const patternHtmlPath = path.join(dist2, "pattern/index.html");
  assert.ok(
    fs.existsSync(patternHtmlPath),
    "Expected pre-rendered SSG pattern/index.html"
  );
  const patternHtml = fs.readFileSync(patternHtmlPath, "utf8");
  assert.ok(
    patternHtml.includes('<p data-testid="mini-fallback">Loading tasks...</p>'),
    "SSG HTML must render <Suspense> fallback cleanly without hanging"
  );
  assert.ok(
    patternHtml.includes(
      'name="$ACTION_ID_file:///src/actions/pattern-actions.tsx#formStampAction"'
    ),
    `SSG HTML must emit canonical $ACTION_ID_, got: ${patternHtml}`
  );
  assert.ok(
    !patternHtml.includes("_tmp_ssr_refs_dual_"),
    "SSG HTML must never leak local filesystem directory paths"
  );

  const inlineHtmlPath = path.join(dist2, "inline-sc/alpha/index.html");
  assert.ok(
    fs.existsSync(inlineHtmlPath),
    "Expected pre-rendered SSG inline-sc/alpha/index.html"
  );
  const inlineHtml = fs.readFileSync(inlineHtmlPath, "utf8");
  assert.ok(inlineHtml.includes("InlineSC:alpha"));

  const rscModule = await import(
    pathToFileURL(path.join(miniRoot, ".dinou/node/rsc-engine.mjs")).href
  );

  // Verify Pass A fetchPatternTasks was NEVER invoked during SSG!
  const callsRes = await rscModule.handleRequest(
    new Request("http://localhost/____server_function____", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-server-function-call": "1",
      },
      body: JSON.stringify({
        id: "file:///src/actions/pattern-actions.tsx#getPassAFetchCalls",
        args: [],
      }),
    }),
    { runtime: "node-bundle" }
  );
  assert.equal(callsRes.status, 200);
  const callsFlightText = await callsRes.text();
  assert.match(
    callsFlightText,
    /:0\b/,
    `Expected 0 Pass A fetchPatternTasks calls during SSG, got Flight: ${callsFlightText}`
  );

  // Verify validation error returns HTTP 500 JSON { error, digest }
  const shortTaskRes = await rscModule.handleRequest(
    new Request("http://localhost/____server_function____", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-server-function-call": "1",
      },
      body: JSON.stringify({
        id: "file:///src/actions/pattern-actions.tsx#addPatternTask",
        args: ["ab"],
      }),
    }),
    { runtime: "node-bundle" }
  );
  assert.equal(shortTaskRes.status, 500);
  const shortTaskErrJson = await shortTaskRes.json();
  assert.deepEqual(shortTaskErrJson, {
    error: "Task must be at least 3 characters long.",
    digest: "TASK_TOO_SHORT",
  });

  // Verify valid mutation + subsequent Pass A fetchPatternTasks read
  const validTaskRes = await rscModule.handleRequest(
    new Request("http://localhost/____server_function____", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-server-function-call": "1",
      },
      body: JSON.stringify({
        id: "file:///src/actions/pattern-actions.tsx#addPatternTask",
        args: ["Ship Pass B isolation"],
      }),
    }),
    { runtime: "node-bundle" }
  );
  assert.equal(validTaskRes.status, 200);
  const validTaskFlight = await validTaskRes.text();
  assert.ok(validTaskFlight.includes("task-1"));

  const readTasksRes = await rscModule.handleRequest(
    new Request("http://localhost/____server_function____", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-server-function-call": "1",
      },
      body: JSON.stringify({
        id: "file:///src/actions/pattern-actions.tsx#fetchPatternTasks",
        args: [],
      }),
    }),
    { runtime: "node-bundle" }
  );
  assert.equal(readTasksRes.status, 200);
  const readTasksFlight = await readTasksRes.text();
  assert.ok(readTasksFlight.includes("Ship Pass B isolation:sk_live"));
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
  "✅ RESULT: All Pass B SSR Server Reference Isolation, Error Propagation & Rollup #default checks PASSED"
);
