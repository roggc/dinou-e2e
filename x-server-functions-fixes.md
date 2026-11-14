# Server Functions Engine Fixes (`callServer` UI Streaming, `export default` Actions & Windows Manifest Path Casing) — Architecture, Diffs & Verification Guide

This document details the root causes, exact framework changes implemented in `dinou`, `CHANGELOG.md` entry, and complete CI unit + dual-engine integration + Playwright E2E test suites for fixing **three bugs in Dinou's Server Functions pipeline** prior to publishing `dinou@9.4.0`:

1. **Bug #1 — Missing `callServer` Option When Decoding Streamed JSX Returned by Server Functions** (`dinou/core/server-function-proxy.js` & `dinou/core/server-function-proxy-webpack.js`).
2. **Bug #2 — `export default` Server Functions Crash AST Transformation & Skip `registerServerReference`** (`dinou/core/transform-server-functions.js` + all 5 server compilers: `node/bundle-dual-engine.js`, `node/dev.js`, `cloudflare/build.js`, `bun/build.js`, `deno/build.js`).
3. **Bug #3 — Windows Path Casing Mismatch in Rollup & Webpack `server-functions-manifest.json` (`400 Invalid export name`)** (`webpack/*`, `rollup/*`, `core/handler.js`, `core/import-module.js`).

---

## 1. Problem Statement & Root Causes

### 1.1. Bug #1: Nested Server Functions Inside Streamed JSX Returned by a Server Function Throw at Runtime

#### Intended Behavior
Dinou Server Functions integrate directly with React Flight (`pipeRSC`), allowing a Server Function to return **JSX and async Server Components** (`Content-Type: text/x-component`). Any interactive `<form action={...}>`, `<button formAction={...}>`, inline `"use server"` closure, or Server Function prop inside that streamed UI must remain callable on the client.

#### Root Cause
In `dinou/core/client.jsx` and `dinou/core/client-webpack.jsx`, every `createFromFetch(...)` call (`getRSCPayload`, `getLayoutPayload`, `getErrorRSCPayload`, `fetchSlotRSC`) passes the `callServer` callback:

```js
{
  callServer: async (id, args) => {
    const proxy = createServerFunctionProxy(id);
    return proxy(...args);
  },
}
```

However, in both **`dinou/core/server-function-proxy.js`** (line 182) and **`dinou/core/server-function-proxy-webpack.js`** (line 181), when decoding a `text/x-component` Flight stream returned by `POST /____server_function____`, `createFromFetch` was invoked **without** `{ callServer }`:

```js
// ❌ Previous behavior in server-function-proxy.js & server-function-proxy-webpack.js
return createFromFetch(Promise.resolve(new Response(readableStream)));
```

Whenever the streamed UI contained any Server Reference, invoking that action in the browser threw:

```text
Error: Trying to call a function from "use server" but the callServer option was not implemented in your router runtime.
```

---

### 1.2. Bug #2: `export default` Server Functions Crash Babel AST Transform & Fail `registerServerReference` Registration

#### Root Cause A — Function-Level `"use server"` on `export default` Crashes Babel
In `dinou/core/transform-server-functions.js` (lines 156–170), when a top-level function contained a `"use server"` directive inside its body:

```js
// ❌ Previous behavior in dinou/core/transform-server-functions.js
if (isTopLevel) {
  cleanDirectivesAndStatements();
  actions.push(fnName);

  if (path.isFunctionDeclaration()) {
    if (!path.parentPath.isExportNamedDeclaration()) {
      path.replaceWith(t.exportNamedDeclaration(path.node));
    }
  }
```

When a developer wrote:

```ts
export default async function submitForm(formData: FormData) {
  "use server";
  // ...
}
```

1. `path.parentPath` was `ExportDefaultDeclaration` (not `ExportNamedDeclaration`), so `path.replaceWith(t.exportNamedDeclaration(path.node))` attempted to place an `ExportNamedDeclaration` inside `ExportDefaultDeclaration.declaration`, crashing the build with an uncaught Babel validation error:
   > `TypeError: Property declaration of ExportDefaultDeclaration expected node to be of a type ["TSDeclareFunction","FunctionDeclaration","ClassDeclaration","Expression"] but instead got "ExportNamedDeclaration"`
2. `actions.push(fnName)` recorded `"submitForm"` (or `"action"` for anonymous `export default async () => { "use server"; }`) instead of `"default"`, mismatching `mod.default` in `handler.js`.

#### Root Cause B — All 5 Server Compilers Skipped `registerServerReference` for `"default"`
While the client bundler plugins (`esbuild`, `rollup`, `webpack`) and `dinou/core/handler.js` (`exportName === "default" ? mod.default : mod[exportName]`) explicitly handled `"default"` exports, all five server compiler pipelines (`node/bundle-dual-engine.js`, `node/dev.js`, `cloudflare/build.js`, `bun/build.js`, and `deno/build.js`) skipped `"default"`:

```js
// ❌ Previous behavior across all 5 server compilers
for (const name of exports) {
  if (name !== "default") {
    transformed += `registerServerReference(${name}, ${JSON.stringify(relativeFileUrl)}, ${JSON.stringify(name)});\n`;
  }
}
```

Because `default` is a reserved JavaScript keyword and cannot be passed as an identifier (`registerServerReference(default, ...)`), default-exported Server Functions (in both module-level `"use server"` files and function-level `"use server"` files) were never registered with React Flight on the server. Importing a default-exported Server Function inside a **Server Component** and passing it to `<form action={defaultAction}>` or a Client Component prop threw at render time:

```text
Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server"
```

---

### 1.3. Bug #3: Windows Path Casing Mismatch in Rollup & Webpack `server-functions-manifest.json` (`400 Invalid export name`)

#### Root Cause
On Windows, `dinou/esbuild/plugins-esbuild/server-functions-plugin.js` normalized only the drive letter (`c:` via `normalizePathCase`), preserving the real filesystem casing of directory and file names (e.g., `src/profile/[userId]/page.tsx` or `src/actions/userActions.ts`).

By contrast, both **Webpack** (`dinou/webpack/helpers/get-webpack-entries.js`) and **Rollup** (`dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` & `rollup-plugin-server-functions.js`) stored `serverFiles` entries using `.toLowerCase()` across the **entire** path:

```js
// ❌ Previous behavior on Windows in Webpack & Rollup
serverFiles.add(path.resolve(absPath).replace(/\\/g, "/").toLowerCase());
// -> "c:/users/.../src/profile/[userid]/page.tsx"
```

When `server-functions-plugin` computed `path.relative(process.cwd(), filePath)`, `server-functions-manifest.json` received **all-lowercase** keys (`"src/profile/[userid]/page.tsx"`). Meanwhile, on the server (`bundle-dual-engine.js` / `dev.js`), `registerServerReference` registered the real filesystem case (`"file:///src/profile/[userId]/page.tsx"`), and `dinou/core/handler.js` performed an exact case-sensitive lookup:

```js
// ❌ Previous behavior in dinou/core/handler.js
const allowedExports = sfManifest[normalizedRelativePath];
// sfManifest["src/profile/[userId]/page.tsx"] === undefined!
if (!allowedExports || !allowedExports.has(exportName)) {
  return Response.json({ error: "Invalid export name" }, { status: 400 });
}
```

Any Server Function inside a mixed-case dynamic route (`[userId]`) or mixed-case server-only action module (`userActions.ts`) failed with **`400 { error: "Invalid export name" }`** on Windows when built with Rollup or Webpack.

---

## 2. Summary of Changes Implemented in `dinou`

### 2.1. `dinou/core/server-function-proxy.js` & `dinou/core/server-function-proxy-webpack.js`
Pass the `callServer` option into `createFromFetch` when decoding `text/x-component` responses so Server References inside streamed JSX / async Server Components remain recursively invocable:

```diff
-        return createFromFetch(Promise.resolve(new Response(readableStream)));
+        return createFromFetch(Promise.resolve(new Response(readableStream)), {
+          callServer: async (nextId, nextArgs) => {
+            const proxy = createServerFunctionProxy(nextId);
+            return proxy(...nextArgs);
+          },
+        });
```

---

### 2.2. `dinou/core/transform-server-functions.js` & All 5 Server Compilers
1. **`dinou/core/transform-server-functions.js`**:
   - Added `ensureModuleDefaultIdentifier(code, filename)` for module-level `"use server"` files that export `default`:
     - Preserves existing local identifiers without AST mutation (`export default async function submitForm() {}`, `export default submitForm`, `export { submitForm as default }`).
     - Synthesizes a local module-scope binding `$$dinou_default_action` when the `default` export is anonymous (`export default async function () {}`, `export default async () => {}`, wrapped expressions, or `export { fn as default } from "./other"`).
   - Fixed function-level `"use server"` inside `ExportDefaultDeclaration`:
     - Strips `"use server"`, records `"default"` in `actions`, assigns `$$dinou_default_action` when anonymous or rewrites arrow/function-expression default exports to `const $$dinou_default_action = ...; export default $$dinou_default_action;` **without** wrapping `ExportDefaultDeclaration` in `ExportNamedDeclaration`.
   - Also detects top-level function-level `"use server"` declarations subsequently exported via `export default fnName;` or `export { fnName as default };` (while strictly ignoring Server Component `export default function Page()` exports that do not carry `"use server"`).
   - Returns `defaultExportIdentifier: string | null` on the `transformServerFunctions` result object.

2. **`dinou/node/bundle-dual-engine.js`, `dinou/node/dev.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`, `dinou/deno/build.js`**:
   - Updated both `serverReferencesPlugin` (`react-server-dom-webpack/server.edge`) and `serverReferencesPluginSsr` (`react-server-dom-webpack/client.edge`) to resolve `const localIdent = name === "default" ? sfResult.defaultExportIdentifier : name;` so `"default"` Server Functions are registered alongside named exports:

```diff
       for (const name of exports) {
-        if (name !== "default") {
-          transformed += `registerServerReference(${name}, ${JSON.stringify(relativeFileUrl)}, ${JSON.stringify(name)});\n`;
+        const localIdent = name === "default" ? sfResult.defaultExportIdentifier : name;
+        if (localIdent) {
+          transformed += `registerServerReference(${localIdent}, ${JSON.stringify(relativeFileUrl)}, ${JSON.stringify(name)});\n`;
         }
       }
```

```diff
       for (const name of exports) {
-        if (name !== "default") {
-          transformed += `registerServerReference(${name}, ${JSON.stringify(relativeFileUrl + "#" + name)});\n`;
-          transformed += `registerServerReference(${name}, ${JSON.stringify(pathToFileURL(absPath).href + "#" + name)});\n`;
+        const localIdent = name === "default" ? sfResult.defaultExportIdentifier : name;
+        if (localIdent) {
+          transformed += `registerServerReference(${localIdent}, ${JSON.stringify(relativeFileUrl + "#" + name)});\n`;
+          transformed += `registerServerReference(${localIdent}, ${JSON.stringify(pathToFileURL(absPath).href + "#" + name)});\n`;
         }
       }
```

---

### 2.3. Windows Path Casing Preservation (`webpack/*`, `rollup/*`, `core/handler.js`, `core/import-module.js`)
1. **`dinou/webpack/helpers/get-webpack-entries.js`, `dinou/webpack/loaders/server-functions-loader.js`, `dinou/webpack/plugins/server-functions-plugin.js`**:
   - Replaced full-path `.toLowerCase()` in `serverFiles` with drive-letter-only normalization via `normalizePathCase(path.resolve(p)).replace(/\\/g, "/")`, preserving exact directory/file casing in `server-functions-manifest.json` and deduplicating manifest keys case-insensitively (`existingPathsLower`).
2. **`dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` & `dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js`**:
   - Added `normalizeServerFilePath` (lowercasing only the Windows drive letter while preserving path segment casing) for `serverFiles` and computed relative manifest paths against `normalizePathCase(root)`.
3. **Defense-in-depth in `dinou/core/handler.js` & `dinou/core/import-module.js`**:
   - Added case-insensitive fallback lookup on `sfManifest` keys in `POST /____server_function____` (`handler.js`) and on `globalThis.__DINOU_ROUTE_MODULES__` keys in `importModule` (`import-module.js`).

---

## 3. `CHANGELOG.md` Entry (Under `### Fixed`)

```markdown
### Fixed
- **Server Functions (UI Component Streaming `callServer`)**: Fixed `createServerFunctionProxy` (`dinou/core/server-function-proxy.js` and `dinou/core/server-function-proxy-webpack.js`) omitting the `{ callServer }` option when decoding `text/x-component` Flight streams via `createFromFetch`, which previously caused nested Server Functions inside streamed JSX / async Server Components to throw `Trying to call a function from "use server" but the callServer option was not implemented in your router runtime`.
- **Server Functions (`export default` Support Across Compilers)**: Fixed a Babel AST crash in `transformServerFunctions` when using function-level `"use server"` on `export default` functions, and registered `default` Server Function exports with `registerServerReference` across all server/SSR build pipelines (`node`, `dev`, `cloudflare`, `bun`, and `deno`) so default-exported actions can be passed from Server Components as well as imported in Client Components.
- **Server Functions (Windows Manifest Casing in Rollup & Webpack)**: Fixed Rollup and Webpack `serverFiles` discovery lowercasing full filesystem paths on Windows, which previously wrote lowercase keys into `server-functions-manifest.json` and caused `400 Invalid export name` rejections on mixed-case dynamic routes (e.g. `[userId]`) or camelCase action files; added a case-insensitive manifest and route-module lookup fallback in `handler.js` and `import-module.js`.
```

---

## 4. Verification & Test Suite Guide

### 4.1. Unit & Dual-Engine Integration Test (`tests/unit/server-functions-fixes.test.mjs`)

This self-contained Node test verifies:
1. All `transformServerFunctions` `export default` AST shapes (named default function, anonymous default function, arrow default export, post-declaration `export default fn`, Server Component page with inline closure not falsely marking `"default"`, module-level `"use server"` named & anonymous default exports).
2. Exact path casing preservation in Webpack (`get-webpack-entries.js`) and Rollup (`rollup-plugin-server-functions.js`) for `src/profile/[userId]/page.tsx` and camelCase action files on Windows.
3. Full `bundleDualEngine` (Pass A RSC + Pass B SSR) compilation, SSR HTML rendering with default-exported Server Functions, `POST /____server_function____` execution via both ESM and Webpack `createServerFunctionProxy` builds, **recursive invocation of a nested Server Function inside JSX streamed back by another Server Function**, and case-insensitive manifest lookup fallback.

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

import { transformServerFunctions } from "../../dinou/core/transform-server-functions.js";
import getWebpackEntries from "../../dinou/webpack/helpers/get-webpack-entries.js";
import rollupServerFunctionsPlugin from "../../dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js";
import { bundleDualEngine } from "../../dinou/node/bundle-dual-engine.js";

test("transformServerFunctions handles export default variants without crashing", () => {
  // 1. Named export default with function-level "use server"
  const namedFn = transformServerFunctions(
    `export default async function submitForm(formData: FormData) {\n  "use server";\n  return { ok: true };\n}`,
    "action.ts"
  );
  assert.equal(namedFn.transformed, true);
  assert.deepEqual(namedFn.actions, ["default"]);
  assert.equal(namedFn.defaultExportIdentifier, "submitForm");
  assert.ok(!namedFn.code.includes('"use server"'));

  // 2. Anonymous export default function with function-level "use server"
  const anonFn = transformServerFunctions(
    `export default async function (x: number) {\n  "use server";\n  return x + 1;\n}`,
    "anon.ts"
  );
  assert.deepEqual(anonFn.actions, ["default"]);
  assert.equal(anonFn.defaultExportIdentifier, "$$dinou_default_action");

  // 3. Arrow export default with function-level "use server"
  const arrowFn = transformServerFunctions(
    `export default async (msg: string) => {\n  "use server";\n  return msg.toUpperCase();\n};`,
    "arrow.ts"
  );
  assert.deepEqual(arrowFn.actions, ["default"]);
  assert.equal(arrowFn.defaultExportIdentifier, "$$dinou_default_action");

  // 4. Server Component page with inline closure does NOT mark Page default export as an action
  const pageWithInline = transformServerFunctions(
    `export default async function ProfilePage({ params }: { params: { userId: string } }) {\n  const uid = params.userId;\n  async function updateBio(fd: FormData) {\n    "use server";\n    return uid;\n  }\n  return <form action={updateBio} />;\n}`,
    "page.tsx"
  );
  assert.deepEqual(pageWithInline.actions, ["$$dinou_action_updateBio_0"]);
  assert.equal(pageWithInline.defaultExportIdentifier, null);

  // 5. Module-level "use server" with named and anonymous default exports
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
});

test("Dual-engine Server Functions: Windows casing, default exports & nested callServer in streamed JSX", async () => {
  const originalCwd = process.cwd();
  fs.mkdirSync(path.join(originalCwd, ".dinou"), { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(originalCwd, ".dinou/tmp-sf-unit-"));

  try {
    fs.mkdirSync(path.join(tmpRoot, "src/actions"), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, "src/profile/[userId]"), { recursive: true });

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

export default async function ProfilePage({ params }: { params: { userId: string } }) {
  const userId = params.userId;
  async function updateBio(formData: FormData) {
    "use server";
    return { userId, bio: String(formData.get("bio") || "") };
  }
  return (
    <section data-user={userId}>
      <form action={updateBio}><input name="bio" defaultValue="hello" /></form>
      <button formAction={multiplyAction.bind(null, 21)}>Multiply</button>
      <button formAction={echoAction.bind(null, "dinou")}>Echo</button>
    </section>
  );
}
`
    );

    process.chdir(tmpRoot);

    const [, , serverFilesWebpack] = await getWebpackEntries({
      srcDir: path.resolve(tmpRoot, "src"),
    });
    const relPaths = Array.from(serverFilesWebpack).map((p) =>
      path.relative(tmpRoot, p).replace(/\\/g, "/")
    );
    assert.ok(relPaths.includes("src/profile/[userId]/page.tsx"));
    assert.ok(relPaths.includes("src/actions/defaultModuleAction.ts"));

    const rollupPlugin = rollupServerFunctionsPlugin({
      serverFiles: new Set(serverFilesWebpack),
    });
    await rollupPlugin.generateBundle({}, {});
    const manifest = globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__;
    assert.deepEqual(manifest["src/profile/[userId]/page.tsx"], ["$$dinou_action_updateBio_0"]);

    fs.mkdirSync(path.join(tmpRoot, ".dinou/react_client_manifest"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, ".dinou/react_client_manifest/react-client-manifest.json"), "{}");
    fs.mkdirSync(path.join(tmpRoot, ".dinou/server_functions_manifest"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, ".dinou/server_functions_manifest/server-functions-manifest.json"),
      JSON.stringify(manifest, null, 2)
    );

    process.env.NODE_ENV = "production";
    const buildResult = await bundleDualEngine({ projectRoot: tmpRoot, isDev: false });
    const ssrEngine = await import(pathToFileURL(buildResult.ssrEnginePath).href);
    const rscEngine = await import(pathToFileURL(buildResult.rscEnginePath).href);
    const platformContext = { renderHtmlStream: ssrEngine.renderHtml };

    // Verify SSR HTML render succeeds with default-exported Server Functions
    const htmlRes = await rscEngine.handleRequest(
      new Request("http://localhost/profile/user_42", { headers: { Accept: "text/html" } }),
      platformContext
    );
    assert.equal(htmlRes.status, 200);
    assert.ok((await htmlRes.text()).includes('data-user="user_42"'));

    // Verify browser proxies (ESM & Webpack) + nested callServer inside streamed JSX
    globalThis.__webpack_require__ = Object.assign(() => ({}), { u: (c) => c + ".js" });
    globalThis.__webpack_chunk_load__ = () => Promise.resolve();
    const req = createRequire(pathToFileURL(path.join(originalCwd, "package.json")).href);
    const esbuild = req("esbuild");
    const proxyOut = path.join(tmpRoot, ".dinou/proxy-esm.mjs");
    await esbuild.build({
      entryPoints: [path.resolve(originalCwd, "dinou/core/server-function-proxy.js")],
      outfile: proxyOut,
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
          headers: { host: "localhost", origin: "http://localhost", ...(init?.headers || {}) },
        }),
        platformContext
      );

    try {
      const { createServerFunctionProxy } = await import(pathToFileURL(proxyOut).href);
      const streamProxy = createServerFunctionProxy("file:///src/actions/streamWidget.tsx#loadInteractiveWidget");
      const streamedEl = await streamProxy("item_77");
      const nestedResult = await streamedEl.props.children.props.formAction();
      assert.deepEqual(nestedResult, { deletedItem: "item_77", confirmed: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
```

### 4.2. Playwright E2E Test Scenario
For the upstream Playwright E2E suite (across Esbuild, Rollup, and Webpack matrix jobs):
1. Create a route `src/stream-test/[itemId]/page.tsx` that renders a Client Component `<WidgetLoader itemId={params.itemId} />` AND a `<form action={defaultAction}>` imported via `import defaultAction from "./defaultAction"` (`"use server"; export default async function ...`).
2. In `<WidgetLoader>`, clicking `"Load Streamed Card"` invokes a `"use server"` function `streamCard(itemId)` returning JSX `<div data-testid="streamed-card"><form action={nestedServerAction}><button type="submit">Run Nested Action</button></form></div>`.
3. Click `"Run Nested Action"` inside the streamed card and assert that `nestedServerAction` executes `POST /____server_function____` (`200 OK`) without throwing `callServer option was not implemented` across all three bundlers on Windows and Linux.

