// scripts/verify-sf-fixes-ci.mjs
// Verifies the three Server Functions engine fixes:
// 1. transformServerFunctions AST handling for all `export default` variants (named/anonymous/arrow function-level & module-level "use server", post-declaration default export, and non-action Server Component page default export)
// 2. Exact filesystem path casing preservation in Webpack & Rollup serverFiles / server-functions-manifest.json on Windows & POSIX
// 3. Full Dual-Engine compilation, SSR HTML rendering with default-exported Server Functions, recursive `callServer` inside streamed JSX for both ESM & Webpack proxies, and case-insensitive manifest lookup fallback

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const projectRoot = process.cwd();

function resolveDinouInternalPath(relFromDinou) {
  const candidates = [
    path.resolve(projectRoot, "dinou", relFromDinou),
    path.resolve(projectRoot, "node_modules/dinou/dinou", relFromDinou),
    path.resolve(projectRoot, "node_modules/dinou", relFromDinou),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

function resolveDinouInternalUrl(relFromDinou) {
  return pathToFileURL(resolveDinouInternalPath(relFromDinou)).href;
}

function resolveFromProjectOrDinou(pkgName) {
  const reqCandidates = [
    path.resolve(projectRoot, "package.json"),
    path.resolve(projectRoot, "dinou/package.json"),
    path.resolve(projectRoot, "node_modules/dinou/package.json"),
  ];
  for (const pkgJson of reqCandidates) {
    if (!fs.existsSync(pkgJson)) continue;
    try {
      const req = createRequire(pathToFileURL(pkgJson).href);
      return req(pkgName);
    } catch (_) {}
  }
  throw new Error(`Could not resolve package "${pkgName}"`);
}

const { transformServerFunctions } = await import(
  resolveDinouInternalUrl("core/transform-server-functions.js")
);
const { default: getWebpackEntries } = await import(
  resolveDinouInternalUrl("webpack/helpers/get-webpack-entries.js")
);
const { default: rollupServerFunctionsPlugin } = await import(
  resolveDinouInternalUrl(
    "rollup/rollup-plugins/rollup-plugin-server-functions.js"
  )
);
const { bundleDualEngine } = await import(
  resolveDinouInternalUrl("node/bundle-dual-engine.js")
);

console.log(
  "1️⃣ Unit-testing transformServerFunctions `export default` variants..."
);
{
  // 1a. Named export default with function-level "use server"
  const namedFn = transformServerFunctions(
    `export default async function submitForm(formData: FormData) {\n  "use server";\n  return { ok: true };\n}`,
    "action.ts"
  );
  assert.equal(namedFn.transformed, true);
  assert.deepEqual(namedFn.actions, ["default"]);
  assert.equal(namedFn.defaultExportIdentifier, "submitForm");
  assert.ok(!namedFn.code.includes('"use server"'));

  // 1b. Anonymous export default function with function-level "use server"
  const anonFn = transformServerFunctions(
    `export default async function (x: number) {\n  "use server";\n  return x + 1;\n}`,
    "anon.ts"
  );
  assert.deepEqual(anonFn.actions, ["default"]);
  assert.equal(anonFn.defaultExportIdentifier, "$$dinou_default_action");

  // 1c. Arrow export default with function-level "use server"
  const arrowFn = transformServerFunctions(
    `export default async (msg: string) => {\n  "use server";\n  return msg.toUpperCase();\n};`,
    "arrow.ts"
  );
  assert.deepEqual(arrowFn.actions, ["default"]);
  assert.equal(arrowFn.defaultExportIdentifier, "$$dinou_default_action");

  // 1d. Top-level function-level "use server" subsequently exported as default
  const postDefault = transformServerFunctions(
    `async function saveDraft(text: string) {\n  "use server";\n  return text;\n}\nexport default saveDraft;\n`,
    "draft.ts"
  );
  assert.ok(postDefault.actions.includes("default"));
  assert.equal(postDefault.defaultExportIdentifier, "saveDraft");

  // 1e. Server Component page with inline closure does NOT mark Page default export as an action
  const pageWithInline = transformServerFunctions(
    `export default async function ProfilePage({ params }: { params: { userId: string } }) {\n  const uid = params.userId;\n  async function updateBio(fd: FormData) {\n    "use server";\n    return uid;\n  }\n  return <form action={updateBio} />;\n}`,
    "page.tsx"
  );
  assert.deepEqual(pageWithInline.actions, ["$$dinou_action_updateBio_0"]);
  assert.equal(pageWithInline.defaultExportIdentifier, null);

  // 1f. Module-level "use server" with named and anonymous default exports
  const modNamed = transformServerFunctions(
    `"use server";\nexport default async function createOrder(n: number) { return n * 2; }`,
    "orders.ts"
  );
  assert.equal(modNamed.isModuleLevel, true);
  assert.deepEqual(modNamed.actions, ["default"]);
  assert.equal(modNamed.defaultExportIdentifier, "createOrder");

  const modArrow = transformServerFunctions(
    `"use server";\nexport default async (n: number) => n * 3;`,
    "triple.ts"
  );
  assert.equal(modArrow.isModuleLevel, true);
  assert.equal(modArrow.transformed, true);
  assert.deepEqual(modArrow.actions, ["default"]);
  assert.equal(modArrow.defaultExportIdentifier, "$$dinou_default_action");
}

console.log(
  "2️⃣ Integration-testing Webpack/Rollup path casing, Dual-Engine default exports & nested callServer..."
);
const tmpRoot = path.resolve(
  projectRoot,
  `.dinou/_tmp_sf_fixes_verify_${process.pid}_${Math.random()
    .toString(36)
    .slice(2, 7)}`
);
fs.rmSync(tmpRoot, { recursive: true, force: true });

try {
  fs.mkdirSync(path.join(tmpRoot, "src/actions"), { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, "src/profile/[userId]"), { recursive: true });

  fs.writeFileSync(
    path.join(tmpRoot, "package.json"),
    JSON.stringify({ name: "sf-fixes-verify", type: "module" }, null, 2)
  );
  fs.writeFileSync(
    path.join(tmpRoot, "src/layout.tsx"),
    `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html><head><title>SF Verify</title></head><body>{children}</body></html>;
}
`
  );
  fs.writeFileSync(
    path.join(tmpRoot, "src/actions/defaultModuleAction.ts"),
    `"use server";\nexport default async function multiplyAction(n: number) { return { doubled: n * 2 }; }\n`
  );
  fs.writeFileSync(
    path.join(tmpRoot, "src/actions/defaultFnAction.ts"),
    `export default async (msg: string) => {\n  "use server";\n  return { echoed: msg.toUpperCase() };\n};\n`
  );
  fs.writeFileSync(
    path.join(tmpRoot, "src/actions/streamWidget.tsx"),
    `"use server";
export async function confirmDelete(itemId: string) {
  return { deletedItem: itemId, confirmed: true };
}
export async function loadInteractiveWidget(itemId: string) {
  return (
    <div data-item={itemId}>
      <button formAction={confirmDelete.bind(null, itemId)}>Confirm Delete</button>
    </div>
  );
}
`
  );
  fs.writeFileSync(
    path.join(tmpRoot, "src/profile/[userId]/page.tsx"),
    `import multiplyAction from "../../actions/defaultModuleAction";
import echoAction from "../../actions/defaultFnAction";
import { loadInteractiveWidget } from "../../actions/streamWidget";

export default async function ProfilePage({ params }: { params: { userId: string } }) {
  const userId = params.userId;
  async function updateBio(note: string) {
    "use server";
    return { userId, note };
  }
  void loadInteractiveWidget;
  return (
    <section data-user={userId}>
      <button formAction={updateBio.bind(null, "bio-ok")}>Bio</button>
      <button formAction={multiplyAction.bind(null, 21)}>Multiply</button>
      <button formAction={echoAction.bind(null, "dinou")}>Echo</button>
    </section>
  );
}
`
  );

  process.chdir(tmpRoot);

  // Verify Webpack serverFiles discovery preserves exact mixed casing
  const [, , serverFilesWebpack] = await getWebpackEntries({
    srcDir: path.resolve(tmpRoot, "src"),
  });
  const relPaths = Array.from(serverFilesWebpack).map((p) =>
    path.relative(tmpRoot, p).replace(/\\/g, "/")
  );
  assert.ok(
    relPaths.includes("src/profile/[userId]/page.tsx"),
    `Expected exact casing src/profile/[userId]/page.tsx in ${JSON.stringify(relPaths)}`
  );
  assert.ok(relPaths.includes("src/actions/defaultModuleAction.ts"));
  assert.ok(relPaths.includes("src/actions/defaultFnAction.ts"));
  assert.ok(relPaths.includes("src/actions/streamWidget.tsx"));

  // Verify Rollup server-functions plugin preserves exact mixed casing & default action keys
  const rollupPlugin = rollupServerFunctionsPlugin({
    serverFiles: new Set(serverFilesWebpack),
  });
  await rollupPlugin.generateBundle({}, {});
  const manifest = globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__;
  assert.deepEqual(manifest["src/profile/[userId]/page.tsx"], [
    "$$dinou_action_updateBio_0",
  ]);
  assert.deepEqual(manifest["src/actions/defaultModuleAction.ts"], ["default"]);
  assert.deepEqual(manifest["src/actions/defaultFnAction.ts"], ["default"]);
  assert.ok(
    manifest["src/actions/streamWidget.tsx"].includes("loadInteractiveWidget")
  );
  assert.ok(
    manifest["src/actions/streamWidget.tsx"].includes("confirmDelete")
  );

  fs.mkdirSync(path.join(tmpRoot, ".dinou/react_client_manifest"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(tmpRoot, ".dinou/react_client_manifest/react-client-manifest.json"),
    "{}"
  );
  fs.mkdirSync(path.join(tmpRoot, ".dinou/server_functions_manifest"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(
      tmpRoot,
      ".dinou/server_functions_manifest/server-functions-manifest.json"
    ),
    JSON.stringify(manifest, null, 2)
  );

  process.env.NODE_ENV = "production";
  delete process.env.DINOU_DEV;

  const buildResult = await bundleDualEngine({
    projectRoot: tmpRoot,
    isDev: false,
    outDir: ".dinou/node",
  });
  const ssrEngine = await import(pathToFileURL(buildResult.ssrEnginePath).href);
  const rscEngine = await import(pathToFileURL(buildResult.rscEnginePath).href);
  const platformContext = {
    runtime: "node-bundle",
    renderHtmlStream: ssrEngine.renderHtml,
  };

  // Pre-seed root layout so HTML SSR composition runs end-to-end
  await rscEngine.buildStaticPages();
  const htmlRes = await rscEngine.handleRequest(
    new Request("http://localhost/profile/user_42", {
      headers: { Accept: "text/html" },
    }),
    platformContext
  );
  assert.equal(htmlRes.status, 200);
  const htmlText = await htmlRes.text();
  assert.ok(htmlText.includes('data-user="user_42"'));

  // Bundle both ESM & Webpack client server-function proxies and verify nested callServer + default actions
  globalThis.__webpack_require__ = Object.assign(() => ({}), {
    u: (c) => c + ".js",
  });
  globalThis.__webpack_chunk_load__ = () => Promise.resolve();
  const esbuild = resolveFromProjectOrDinou("esbuild");

  const proxyEsmOut = path.join(tmpRoot, ".dinou/proxy-esm.mjs");
  const proxyWebpackOut = path.join(tmpRoot, ".dinou/proxy-webpack.mjs");

  await esbuild.build({
    entryPoints: [resolveDinouInternalPath("core/server-function-proxy.js")],
    outfile: proxyEsmOut,
    bundle: true,
    format: "esm",
    platform: "browser",
    conditions: ["browser"],
  });
  await esbuild.build({
    entryPoints: [
      resolveDinouInternalPath("core/server-function-proxy-webpack.js"),
    ],
    outfile: proxyWebpackOut,
    bundle: true,
    format: "esm",
    platform: "browser",
    conditions: ["browser"],
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, init) =>
    rscEngine.handleRequest(
      new Request("http://localhost" + url, {
        ...init,
        headers: {
          host: "localhost",
          origin: "http://localhost",
          ...(init?.headers || {}),
        },
      }),
      platformContext
    );

  try {
    for (const [label, proxyFile] of [
      ["ESM proxy", proxyEsmOut],
      ["Webpack proxy", proxyWebpackOut],
    ]) {
      const { createServerFunctionProxy } = await import(
        pathToFileURL(proxyFile).href
      );

      // Default module-level action
      const modDefaultProxy = createServerFunctionProxy(
        "file:///src/actions/defaultModuleAction.ts#default"
      );
      assert.deepEqual(
        await modDefaultProxy(21),
        { doubled: 42 },
        `${label}: module-level export default failed`
      );

      // Default function-level action
      const fnDefaultProxy = createServerFunctionProxy(
        "file:///src/actions/defaultFnAction.ts#default"
      );
      assert.deepEqual(
        await fnDefaultProxy("dinou"),
        { echoed: "DINOU" },
        `${label}: function-level export default failed`
      );

      // Streamed JSX with nested Server Reference invoked via callServer
      const streamProxy = createServerFunctionProxy(
        "file:///src/actions/streamWidget.tsx#loadInteractiveWidget"
      );
      const streamedEl = await streamProxy("item_77");
      const nestedResult = await streamedEl.props.children.props.formAction();
      assert.deepEqual(
        nestedResult,
        { deletedItem: "item_77", confirmed: true },
        `${label}: nested callServer inside streamed JSX failed`
      );

      // Defense-in-depth case-insensitive manifest lookup fallback (lowercased [userid])
      const lowerCaseProxy = createServerFunctionProxy(
        "file:///src/profile/[userid]/page.tsx#$$dinou_action_updateBio_0"
      );
      assert.deepEqual(
        await lowerCaseProxy("user_99", "fallback-ok"),
        { userId: "user_99", note: "fallback-ok" },
        `${label}: case-insensitive manifest fallback failed`
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
} finally {
  process.chdir(projectRoot);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(
  "✅ RESULT: All Server Functions fixes verification checks PASSED!"
);

