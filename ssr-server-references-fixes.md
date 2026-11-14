# Pass B SSR Server Reference Isolation, Server Function Error Propagation & Rollup `#default` Client Manifest Fixes — Architecture, Diffs & Verification Guide

This document details the root causes, exact framework changes implemented across `dinou`, ready-to-paste `CHANGELOG.md` entries, and **100% complete, copy-pasteable** unit + Playwright E2E verification test suites for fixing **three upstream issues in Dinou's Dual-Engine SSR compiler, Flight RPC client proxy, and Rollup client manifest** uncovered while auditing `/docs/pattern` (*"The Dinou Pattern"*) prior to publishing `dinou@9.4.0`:

1. **Bug #1 — Pass B (`ssr-engine`) Bundled `"use server"` Implementations & Server-Only Imports Into the Browser-Conditioned Client SSR Bundle Across All 5 Dual-Engine Compilers** (`dinou/core/transform-server-functions.js`, `dinou/node/dev.js`, `dinou/node/bundle-dual-engine.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`, `dinou/deno/build.js`).
2. **Bug #2 — Client Server Function Proxies Discarded Server Error Messages & `digest` Metadata on Failed Mutations (`!res.ok`)** (`dinou/core/server-function-proxy.js`, `dinou/core/server-function-proxy-webpack.js`, `dinou/core/handler.js`).
3. **Bug #3 — Rollup Client Manifest Omitted `${fileUrl}#default` Keys for Default-Exported `"use client"` Components** (`dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js`).

---

## 1. Problem Statement & Root Causes

### 1.1. Bug #1: Pass B (`ssr-engine`) Leaked `"use server"` Implementations & Imports Into the Browser-Conditioned SSR Bundle

#### Intended Behavior
Dinou's Dual-Engine architecture compiles every server target in two isolated `esbuild` passes:
- **Pass A (`rsc-engine`)**: Bundled with `"react-server"` conditions. Owns all Server Components, `page_functions.ts`, `requestStorage` (`getContext()`), database drivers, secrets, `import "server-only"` guards, and **all `"use server"` Server Function implementations** (`POST /____server_function____`).
- **Pass B (`ssr-engine`)**: Bundled with `"browser"` conditions (without `"react-server"`). Runs `react-dom/server.edge` to reconstruct the RSC Flight stream and render `"use client"` components into streaming HTML. Pass B is the **server-side mirror of the browser bundle**—it must **never** bundle or execute `"use server"` function bodies or import server-only modules.
  - When a `"use client"` component renders `<form action={myServerAction}>` during SSR, `myServerAction` in Pass B must be a pure `registerServerReference` stub carrying the canonical project-relative ID (`file:///src/...#myServerAction`) matching the browser bundle.
  - When a `"use client"` component invokes a Server Function inside `useState(() => fetchPatternTasks())` + `React.use(tasksPromise)` wrapped in `<Suspense fallback={...}>` (as demonstrated in **The Dinou Pattern** and Strategy 13 of `/docs/data-fetching`), Pass B must **defer** that client RPC to browser mount by rendering the `<Suspense fallback={...}>` shell cleanly without `onError` noise, without hanging SSG (`await htmlStream.allReady`), and without hydration mismatch warnings.

#### Root Causes
Across all **5 Dual-Engine compilers** (`dinou/node/dev.js`, `dinou/node/bundle-dual-engine.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`, `dinou/deno/build.js`):
1. **`ssr-client-manifest` imported every server function source file from disk**:
   ```js
   // ❌ Previous behavior in all 5 compilers
   serverFunctionFiles.forEach((relPath, index) => {
     const absPath = path.resolve(projectRoot, relPath).replace(/\\/g, "/");
     ssrManifestCode += `import * as sf_${index} from ${JSON.stringify(absPath)};\n`;
   });
   ```
   This forced Pass B (`conditions: [..., "browser"]`) to bundle every file listed in `server-functions-manifest.json`—including Server Component `page.tsx` files that defined inline `"use server"` closures!
2. **`serverReferencesPluginSsr` preserved `sfResult.code` verbatim**:
   ```js
   // ❌ Previous behavior in serverReferencesPluginSsr across all 5 compilers
   const transformedCode = sfResult.code;
   let transformed = transformedCode + "\n\n";
   transformed += `import { registerServerReference } from "react-server-dom-webpack/client.edge";\n`;
   for (const name of exports) {
     const localIdent = name === "default" ? sfResult.defaultExportIdentifier : name;
     if (localIdent) {
       transformed += `registerServerReference(${localIdent}, ${JSON.stringify(relativeFileUrl + "#" + name)});\n`;
       transformed += `registerServerReference(${localIdent}, ${JSON.stringify(pathToFileURL(absPath).href + "#" + name)});\n`;
     }
   }
   ```
   This caused **five concrete failures**:
   - **Crash on `import "server-only"` or RSC-only packages**: Because Pass B resolves with `"browser"` conditions (no `"react-server"`), `import "server-only"` inside any `"use server"` file (or any Server Component `page.tsx` containing an inline `"use server"` action) resolved to its throwing browser entry and crashed `ssr-engine` immediately at startup/build.
   - **Split-brain module state (`tasksDb` desynchronization in `/docs/pattern`)**: Mutations via `POST /____server_function____` (`addPatternTask`) executed in **Pass A (`rsc-engine`)**, mutating Pass A's module state (`tasksDb`), whereas `useState(() => fetchPatternTasks())` during SSR executed a **second, isolated copy** of `fetchPatternTasks()` compiled into **Pass B (`ssr-engine`)** whose `tasksDb` remained stale (`[]`).
   - **Broken `getContext()` & async RSC crashes during SSR**: Calling a `"use server"` function directly inside `ssr-engine` bypassed `rsc-engine`'s `requestStorage` (`getContext()` lacked `req` headers/cookies) and fed returned JSX directly to `react-dom/server.edge`, crashing whenever the returned JSX contained an async Server Component.
   - **Unintended DB execution during SSG (`dinou build`)**: Static `"use client"` pages using `useState(() => fetchServerFn())` inside `<Suspense fallback={...}>` executed the live server query at build time inside `generate-static-page.js` (`waitForAll: true`), baking build-time results into static HTML instead of emitting the `<Suspense fallback>` shell for client-mount Flight RPC.
   - **Overwritten canonical `registerServerReference` ID & leaked machine paths in `<form action>`**: Calling `registerServerReference(localIdent, relativeId)` followed immediately by `registerServerReference(localIdent, absFileUrlId)` on the same function overwrote `knownServerReferences` (`WeakMap`) in `react-server-dom-webpack/client.edge` with `file:///C:/Users/...#action`—leaking local machine filesystem paths into `<input type="hidden" name="$ACTION_ID_file:///C:/Users/..."/>` in SSR HTML instead of the canonical `file:///src/...#action` ID!

#### Solution Implemented
1. Added two shared helpers in `dinou/core/transform-server-functions.js`:
   - **`buildSsrServerReferenceModule(code, filename, relativeFileUrl)`**: Skips `"use client"` modules (preventing false positives when `"use server"` appears inside string literals/code blocks), extracts action names via `extractServerFunctions`, strips **all** server-side imports and implementation bodies, and emits pure JS exports backed by `__dinouCreateSsrServerStub(canonicalId)`.
   - **`generateSsrServerManifestStubs(parsedServerFunctionsManifest)`**: Synthesizes `const sf_0 = Object.defineProperty({ ... }, "__esModule", { value: true })` inline inside `ssr-client-manifest` directly from `parsedServerFunctionsManifest`—eliminating all `import * as sf_X` disk imports of server files into Pass B.
2. Each SSR Server Reference stub registers **only** the canonical project-relative ID (`file:///src/...#name`) via `registerServerReference(stub, id)` (preserving `.bind()` support and clean `$ACTION_ID_file:///src/...` hidden form inputs) and, if invoked during SSR (`useState(() => fetchPatternTasks())`), returns a pre-caught rejected `Promise` carrying an `Error` marked with React 19's built-in `Symbol.for("react.recoverable") = true`:
   - `react-dom/server.edge` recognizes `isRecoverableError(err) === true`, does **not** invoke `onError` (`onErrorCalled === false`), resolves `await htmlStream.allReady` immediately during SSG, and emits `<Suspense fallback={...}>` HTML with `data-dgst=""` (`REACT_RECOVERABLE_DIGEST`).
   - On the client, `hydrateRoot` sees `fallbackChildren === REACT_RECOVERABLE_DIGEST` (`""`), skips `queueHydrationError` with **zero hydration warnings** in both development and production, and mounts the client `<Suspense>` boundary to execute the live `POST /____server_function____` Flight RPC.

---

### 1.2. Bug #2: Client Server Function Proxies Discarded `err.message` & `err.digest` on `!res.ok`

#### Root Cause
When a Server Function threw an error on the server (e.g., `throw new Error("Task must be at least 3 characters long.")`), `dinou/core/handler.js` (line 1637) returned:
```js
return Response.json({ error: err.message || "Internal Server Error" }, { status: 500 });
```
However, both `dinou/core/server-function-proxy.js` (line 71, used by `esbuild` and `rollup`) and `dinou/core/server-function-proxy-webpack.js` (line 71, used by `webpack`) unconditionally executed:
```js
// ❌ Previous behavior
if (!res.ok) throw new Error("Server function failed");
```
discarding the JSON payload completely so client `.catch((err) => ...)` blocks always received `"Server function failed"` and lost any `err.digest`.

#### Solution Implemented
- Updated `dinou/core/handler.js` to include `digest: err.digest` in the JSON error response whenever `typeof err.digest === "string"`.
- Updated both `dinou/core/server-function-proxy.js` and `dinou/core/server-function-proxy-webpack.js` on `!res.ok` to inspect `content-type: application/json`, extract `{ error, digest }`, attach `err.digest` when present, and gracefully fall back to `"Server function failed"` when the error response is non-JSON (e.g., `502 Bad Gateway` from an upstream proxy).

---

### 1.3. Bug #3: Rollup Client Manifest Omitted `${fileUrl}#default` for Default-Exported Client Components

#### Root Cause
Both `esbuild` (`dinou/esbuild/helpers-esbuild/update-manifest-for-module.js`, lines 32–38) and `webpack` (`ReactServerWebpackPlugin`) emit **both** `manifest[fileUrl]` and `manifest[`${fileUrl}#default`]` when a `"use client"` module has `export default` (such as `export default function PatternTaskUpdater` and `export default function PatternTasksList` in `/docs/pattern`). In `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` (`setManifestEntry`, line 141), Rollup only wrote `[fileUrl]` (and `[altUrl]` on Windows), omitting `${fileUrl}#default` and `${altUrl}#default`.

#### Solution Implemented
Updated `setManifestEntry` in `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` to register `[fileUrl, `${fileUrl}#default`]` (plus `[altUrl, `${altUrl}#default`]` on Windows) when `expName === "default"`, keeping `urlToManifestKeys` synchronized so `generateBundle` updates chunk IDs across all keys identically across `esbuild`, `rollup`, and `webpack`.

---

## 2. Summary of Framework Changes Implemented in `dinou/`

| File | Summary of Changes |
| :--- | :--- |
| `dinou/core/transform-server-functions.js` | Imported `useClientRegex` and added `buildSsrServerReferenceModule` + `generateSsrServerManifestStubs` using React 19 `Symbol.for("react.recoverable")` SSR stubs registered with canonical `file:///src/...#name` IDs. |
| `dinou/node/dev.js` | Replaced `import * as sf_X` disk imports in `ssr-client-manifest.mjs` with `generateSsrServerManifestStubs(parsedServerFunctionsManifest)` and updated `serverReferencesPluginSsr` to emit `buildSsrServerReferenceModule(...)`. |
| `dinou/node/bundle-dual-engine.js` | Replaced `import * as sf_X` disk imports in `ssr-client-manifest.mjs` with `generateSsrServerManifestStubs(parsedServerFunctionsManifest)` and updated `serverReferencesPluginSsr` to emit `buildSsrServerReferenceModule(...)`. |
| `dinou/cloudflare/build.js` | Replaced `import * as sf_X` disk imports in `ssr-client-manifest.js` with `generateSsrServerManifestStubs(parsedServerFunctionsManifest)` and updated `serverReferencesPluginSsr` to emit `buildSsrServerReferenceModule(...)`. |
| `dinou/bun/build.js` | Replaced `import * as sf_X` disk imports in `ssr-client-manifest.js` with `generateSsrServerManifestStubs(parsedServerFunctionsManifest)` and updated `serverReferencesPluginSsr` to emit `buildSsrServerReferenceModule(...)`. |
| `dinou/deno/build.js` | Replaced `import * as sf_X` disk imports in `ssr-client-manifest.js` with `generateSsrServerManifestStubs(parsedServerFunctionsManifest)` and updated `serverReferencesPluginSsr` to emit `buildSsrServerReferenceModule(...)`. |
| `dinou/core/handler.js` | Included optional `err.digest` alongside `err.message` in `POST /____server_function____` `500` JSON error payloads. |
| `dinou/core/server-function-proxy.js` | Parsed JSON `{ error, digest }` on `!res.ok` responses, preserving `err.message` and `err.digest` with fallback to `"Server function failed"`. |
| `dinou/core/server-function-proxy-webpack.js` | Parsed JSON `{ error, digest }` on `!res.ok` responses, preserving `err.message` and `err.digest` with fallback to `"Server function failed"`. |
| `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` | Updated `setManifestEntry` to emit both `fileUrl` and `${fileUrl}#default` (plus Windows drive-case variants) for default-exported `"use client"` modules. |

---

## 3. Exact Unified Diffs

### 3.1. `dinou/core/transform-server-functions.js`

```diff
--- a/dinou/core/transform-server-functions.js
+++ b/dinou/core/transform-server-functions.js
@@ -2,7 +2,7 @@ import parser from "#babel/parser";
 import traverseModule from "#babel/traverse";
 import generateModule from "#babel/generator";
 import * as tModule from "#babel/types";
-import { useServerRegex } from "../constants.js";
+import { useClientRegex, useServerRegex } from "../constants.js";
 import parseExports from "./parse-exports.js";
 
 const traverse = traverseModule?.default || traverseModule;
@@ -440,9 +440,101 @@ export function extractServerFunctions(code, filename = "file.tsx") {
   return result.actions || [];
 }
 
+const SSR_SERVER_STUB_PREAMBLE = `import { registerServerReference as __dinouRegisterServerReference } from "react-server-dom-webpack/client.edge";
+function __dinouCreateSsrServerStub(id) {
+  const stub = () => {
+    const err = new Error(
+      \`[Dinou] Server Function "\${id}" deferred from SSR to client <Suspense> mount.\`
+    );
+    Object.defineProperty(err, Symbol.for("react.recoverable"), { value: true });
+    const rejected = Promise.reject(err);
+    rejected.catch(() => {});
+    return rejected;
+  };
+  __dinouRegisterServerReference(stub, id);
+  return stub;
+}
+`;
+
+/**
+ * Generates a pure SSR Server Reference stub module for Pass B (`ssr-engine`),
+ * stripping all server-side implementation bodies and server-only imports while
+ * preserving exact ESM export signatures (`export const ...` and `export default ...`).
+ *
+ * @param {string} code
+ * @param {string} [filename="file.tsx"]
+ * @param {string} [relativeFileUrl="file:///src/action.ts"]
+ * @returns {string | null}
+ */
+export function buildSsrServerReferenceModule(
+  code,
+  filename = "file.tsx",
+  relativeFileUrl = "file:///src/action.ts"
+) {
+  if (typeof code !== "string" || useClientRegex.test(code.trim())) {
+    return null;
+  }
+  if (!hasServerFunctions(code)) {
+    return null;
+  }
+  const actions = extractServerFunctions(code, filename);
+  if (!actions || actions.length === 0) {
+    return null;
+  }
+
+  const uniqueActions = Array.from(new Set(actions));
+  let out = SSR_SERVER_STUB_PREAMBLE;
+  for (const name of uniqueActions) {
+    const fullId = `${relativeFileUrl}#${name}`;
+    if (name === "default") {
+      out += `const __dinou_default_stub = __dinouCreateSsrServerStub(${JSON.stringify(fullId)});\n`;
+      out += `export default __dinou_default_stub;\n`;
+    } else {
+      out += `export const ${name} = __dinouCreateSsrServerStub(${JSON.stringify(fullId)});\n`;
+    }
+  }
+  return out;
+}
+
+/**
+ * Synthesizes `sf_0`, `sf_1`, ... module namespace stub objects directly inside
+ * `ssr-client-manifest` from `server-functions-manifest.json` without importing
+ * server source files into the browser-conditioned SSR engine (Pass B).
+ *
+ * @param {Record<string, string[] | Set<string>>} parsedServerFunctionsManifest
+ * @returns {string}
+ */
+export function generateSsrServerManifestStubs(parsedServerFunctionsManifest) {
+  const serverFunctionFiles = Object.keys(parsedServerFunctionsManifest || {});
+  if (serverFunctionFiles.length === 0) {
+    return "";
+  }
+
+  let code = `\n${SSR_SERVER_STUB_PREAMBLE}`;
+  serverFunctionFiles.forEach((relPath, index) => {
+    const normRel = relPath.replace(/\\/g, "/");
+    const relFileUrl = "file:///" + normRel;
+    const rawFns = parsedServerFunctionsManifest[relPath] || [];
+    const fns = Array.from(
+      new Set(Array.isArray(rawFns) ? rawFns : Array.from(rawFns))
+    );
+    const entries = fns
+      .map(
+        (fn) =>
+          `    ${JSON.stringify(fn)}: __dinouCreateSsrServerStub(${JSON.stringify(`${relFileUrl}#${fn}`)})`
+      )
+      .join(",\n");
+    const objLiteral = entries ? `{\n${entries}\n  }` : `{}`;
+    code += `const sf_${index} = Object.defineProperty(${objLiteral}, "__esModule", { value: true });\n`;
+  });
+  return code;
+}
+
 export default {
   hasServerFunctions,
   isModuleLevelUseServer,
   transformServerFunctions,
   extractServerFunctions,
+  buildSsrServerReferenceModule,
+  generateSsrServerManifestStubs,
 };
```

### 3.2. `dinou/node/dev.js`, `dinou/node/bundle-dual-engine.js`, `dinou/cloudflare/build.js`, `dinou/bun/build.js`, and `dinou/deno/build.js`

Across all 5 Dual-Engine compilers:

```diff
-import { transformServerFunctions, hasServerFunctions } from "../core/transform-server-functions.js";
+import {
+  transformServerFunctions,
+  hasServerFunctions,
+  buildSsrServerReferenceModule,
+  generateSsrServerManifestStubs,
+} from "../core/transform-server-functions.js";
```

In `ssr-client-manifest` generation:

```diff
   const serverFunctionFiles = Object.keys(parsedServerFunctionsManifest);
-  serverFunctionFiles.forEach((relPath, index) => {
-    const absPath = path.resolve(projectRoot, relPath).replace(/\\/g, "/");
-    ssrManifestCode += `import * as sf_${index} from ${JSON.stringify(absPath)};\n`;
-  });
+  ssrManifestCode += generateSsrServerManifestStubs(parsedServerFunctionsManifest);
```

In `serverReferencesPluginSsr`:

```diff
-        const sfResult = transformServerFunctions(code, args.path);
-        if (!sfResult.actions || sfResult.actions.length === 0) return null;
-
-        const transformedCode = sfResult.code;
-        const exports = sfResult.actions;
         const absPath = path.resolve(args.path);
         const relPath = path.relative(projectRoot, absPath).replace(/\\/g, "/");
         const relativeFileUrl = "file:///" + relPath;
-
-        let transformed = transformedCode + "\n\n";
-        transformed += `import { registerServerReference } from "react-server-dom-webpack/client.edge";\n`;
-        for (const name of exports) {
-          const localIdent = name === "default" ? sfResult.defaultExportIdentifier : name;
-          if (localIdent) {
-            transformed += `registerServerReference(${localIdent}, ${JSON.stringify(relativeFileUrl + "#" + name)});\n`;
-            transformed += `registerServerReference(${localIdent}, ${JSON.stringify(pathToFileURL(absPath).href + "#" + name)});\n`;
-          }
-        }
-        const ext = path.extname(args.path);
-        return { contents: transformed, loader: ext === ".ts" ? "ts" : ext === ".tsx" ? "tsx" : ext === ".jsx" ? "jsx" : "js" };
+        const stubModule = buildSsrServerReferenceModule(code, args.path, relativeFileUrl);
+        if (!stubModule) return null;
+
+        return { contents: stubModule, loader: "js" };
```

### 3.3. `dinou/core/handler.js`, `dinou/core/server-function-proxy.js`, and `dinou/core/server-function-proxy-webpack.js`

```diff
--- a/dinou/core/handler.js
+++ b/dinou/core/handler.js
@@ -1634,7 +1634,11 @@ export async function handleRequest(request, platformContext = {}) {
       return bridge.toResponse();
     } catch (err) {
       console.error("[Dinou] Error executing server function:", err);
-      return Response.json({ error: err.message || "Internal Server Error" }, { status: 500 });
+      const errorPayload = { error: err?.message || "Internal Server Error" };
+      if (err && typeof err.digest === "string") {
+        errorPayload.digest = err.digest;
+      }
+      return Response.json(errorPayload, { status: 500 });
     }
   }
```

```diff
--- a/dinou/core/server-function-proxy.js
+++ b/dinou/core/server-function-proxy.js
@@ -68,7 +68,27 @@ export function createServerFunctionProxy(id) {
         body,
       });
 
-      if (!res.ok) throw new Error("Server function failed");
+      if (!res.ok) {
+        let errorMessage = "Server function failed";
+        let errorDigest;
+        try {
+          const errContentType = res.headers.get("content-type") || "";
+          if (errContentType.includes("application/json")) {
+            const errData = await res.json();
+            if (errData && typeof errData.error === "string" && errData.error) {
+              errorMessage = errData.error;
+            }
+            if (errData && typeof errData.digest === "string") {
+              errorDigest = errData.digest;
+            }
+          }
+        } catch (_) {}
+        const err = new Error(errorMessage);
+        if (errorDigest !== undefined) {
+          err.digest = errorDigest;
+        }
+        throw err;
+      }
```

*(Identical diff applied to `dinou/core/server-function-proxy-webpack.js`.)*

### 3.4. `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js`

```diff
--- a/dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js
+++ b/dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js
@@ -138,14 +138,21 @@ function normalizeFileUrl(p) {
 }
 
 function setManifestEntry(fileUrl, expName, entry) {
-  const keys = [expName === "default" ? fileUrl : `${fileUrl}#${expName}`];
+  const keys =
+    expName === "default"
+      ? [fileUrl, `${fileUrl}#default`]
+      : [`${fileUrl}#${expName}`];
   if (process.platform === "win32") {
     const winMatch = fileUrl.match(/^file:\/\/\/([a-zA-Z]):(\/.*)$/);
     if (winMatch) {
       const drive = winMatch[1];
       const altDrive = drive === drive.toLowerCase() ? drive.toUpperCase() : drive.toLowerCase();
       const altUrl = `file:///${altDrive}:${winMatch[2]}`;
-      keys.push(expName === "default" ? altUrl : `${altUrl}#${expName}`);
+      if (expName === "default") {
+        keys.push(altUrl, `${altUrl}#default`);
+      } else {
+        keys.push(`${altUrl}#${expName}`);
+      }
     }
   }
```

---

## 4. `CHANGELOG.md` Entry (for `dinou@9.4.0`)

```markdown
### Fixed
- **Pass B (`ssr-engine`) Server Reference Isolation Across All Runtimes**: Fixed `serverReferencesPluginSsr` and `ssr-client-manifest` across `node/dev.js`, `node/bundle-dual-engine.js`, `cloudflare/build.js`, `bun/build.js`, and `deno/build.js` so `"use server"` implementations, server-only imports (`import "server-only"`), and server module state are never bundled into or executed inside the browser-conditioned Client SSR engine. SSR server references now emit pure canonical `registerServerReference` stubs (`file:///src/...#action`) that defer in-render client RPC calls (`useState(() => fetchServerFn())` + `use()`) cleanly to client `<Suspense>` mount via React 19's `Symbol.for("react.recoverable")` digest without server `onError` noise, SSG hangs, hydration warnings, or leaked filesystem paths in `<form action>` hidden inputs.
- **Server Function Error Message & `digest` Propagation**: Fixed `dinou/core/server-function-proxy.js`, `dinou/core/server-function-proxy-webpack.js`, and `dinou/core/handler.js` so errors thrown inside `"use server"` functions preserve their `error.message` and optional `error.digest` on rejected client Promises instead of always throwing `"Server function failed"`.
- **Rollup Client Manifest `#default` Parity**: Updated `rollup-plugin-react-client-manifest.js` (`setManifestEntry`) to register both `fileUrl` and `${fileUrl}#default` (plus Windows drive-letter variants) for default-exported `"use client"` components, matching `esbuild` and `webpack`.
```

---

## 5. Complete Verification Test Suites

### 5.1. Unit Test Suite (`tests/unit/ssr-server-references.test.mjs`)

Run directly with `node --test tests/unit/ssr-server-references.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";
import React from "react";
import { renderToReadableStream } from "react-dom/server.edge";

import {
  buildSsrServerReferenceModule,
  generateSsrServerManifestStubs,
  hasServerFunctions,
} from "../../dinou/core/transform-server-functions.js";
import { createServerFunctionProxy as createWebpackProxy } from "../../dinou/core/server-function-proxy-webpack.js";
import { reactClientManifestPlugin } from "../../dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js";

test("1. buildSsrServerReferenceModule strips 'server-only' imports, DB secrets, and bodies for module-level 'use server'", () => {
  const serverCode = `"use server";
import "server-only";
import { queryDb } from "./internal-db";

const SECRET_KEY = "sk_live_NEVER_LEAK_TO_SSR_CLIENT_ENGINE";

export async function addPatternTask(text: string) {
  return queryDb(SECRET_KEY, text);
}

export async function fetchPatternTasks() {
  return queryDb(SECRET_KEY, "SELECT * FROM tasks");
}

export default async function defaultAction() {
  return SECRET_KEY;
}
`;

  const out = buildSsrServerReferenceModule(
    serverCode,
    "src/server-functions/pattern-demo.tsx",
    "file:///src/server-functions/pattern-demo.tsx"
  );

  assert.ok(out, "Expected SSR stub module output");
  assert.ok(!out.includes("server-only"), "Must strip import 'server-only'");
  assert.ok(!out.includes("SECRET_KEY"), "Must strip server secrets and implementation");
  assert.ok(!out.includes("internal-db"), "Must strip server DB imports");
  assert.ok(out.includes("export const addPatternTask ="));
  assert.ok(out.includes("export const fetchPatternTasks ="));
  assert.ok(out.includes("export default __dinou_default_stub;"));
});

test("2. buildSsrServerReferenceModule strips Server Component JSX & 'server-only' for inline 'use server' files", () => {
  const inlineServerComp = `import "server-only";
import { db } from "./secret-db";

export default async function ProductPage({ params }: { params: { id: string } }) {
  async function purchaseProduct(token: string) {
    "use server";
    return await db.orders.create({ id: params.id, token });
  }
  return <form action={purchaseProduct}><button>Buy</button></form>;
}
`;

  const out = buildSsrServerReferenceModule(
    inlineServerComp,
    "src/product/page.tsx",
    "file:///src/product/page.tsx"
  );

  assert.ok(out, "Expected hoisted inline action stub");
  assert.ok(!out.includes("server-only"), "Must not retain server-only import");
  assert.ok(!out.includes("secret-db"), "Must not retain DB import");
  assert.ok(out.includes("export const $$dinou_action_purchaseProduct_0 ="));
});

test("3. buildSsrServerReferenceModule ignores 'use client' files mentioning 'use server' in code snippets", () => {
  const clientCode = `"use client";
export default function DocsViewer() {
  const snippet = \`"use server"; export async function save() {}\`;
  return <pre>{snippet}</pre>;
}
`;
  const out = buildSsrServerReferenceModule(
    clientCode,
    "src/components/docs-viewer.tsx",
    "file:///src/components/docs-viewer.tsx"
  );
  assert.equal(out, null);
});

test("4. Pass B browser-conditioned bundle + React 19 Edge SSR handles 'server-only' + useState(() => fetchFn()) + <form action> cleanly", async () => {
  const baseTmp = path.resolve(process.cwd(), ".dinou");
  fs.mkdirSync(baseTmp, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(baseTmp, "ssr-ref-unit-"));
  try {
    const sfPath = path.join(tmpDir, "pattern-demo.tsx");
    const pagePath = path.join(tmpDir, "page.tsx");
    const outPath = path.join(tmpDir, "ssr-bundle.mjs");

    fs.writeFileSync(
      sfPath,
      `"use server";
import "server-only";
const DB_SECRET = "TOP_SECRET_12345";
let tasks = ["leaked-if-executed"];
export async function addPatternTask(formData: FormData) {
  return DB_SECRET + String(formData);
}
export async function fetchPatternTasks() {
  return tasks.join(",");
}
`,
      "utf8"
    );

    fs.writeFileSync(
      pagePath,
      `"use client";
import React, { Suspense, use, useState } from "react";
import { addPatternTask, fetchPatternTasks } from "./pattern-demo";

function TasksStream({ promise }: { promise: Promise<React.ReactNode> }) {
  const content = use(promise);
  return <div data-testid="tasks">{content}</div>;
}

export default function Page() {
  const [tasksPromise] = useState(() => fetchPatternTasks());
  const boundAction = addPatternTask.bind(null);
  return (
    <div>
      <form action={addPatternTask}>
        <button type="submit">Add</button>
      </form>
      <form action={boundAction}>
        <button type="submit">Bound Add</button>
      </form>
      <Suspense fallback={<div data-testid="fallback">Streaming tasks...</div>}>
        <TasksStream promise={tasksPromise} />
      </Suspense>
    </div>
  );
}
`,
      "utf8"
    );

    const serverReferencesPluginSsr = {
      name: "dinou-server-references-ssr-unit",
      setup(build) {
        build.onLoad({ filter: /\.[jt]sx?$/ }, (args) => {
          if (args.path.includes("node_modules")) return null;
          const code = fs.readFileSync(args.path, "utf8");
          if (!hasServerFunctions(code)) return null;
          const relPath = "src/" + path.basename(args.path);
          const stub = buildSsrServerReferenceModule(code, args.path, "file:///" + relPath);
          if (!stub) return null;
          return { contents: stub, loader: "js" };
        });
      },
    };

    await esbuild.build({
      entryPoints: [pagePath],
      outfile: outPath,
      bundle: true,
      format: "esm",
      platform: "node",
      conditions: ["node", "worker", "browser"],
      external: ["react", "react-dom", "react-server-dom-webpack/client.edge"],
      plugins: [serverReferencesPluginSsr],
    });

    const bundledSource = fs.readFileSync(outPath, "utf8");
    assert.ok(!bundledSource.includes("TOP_SECRET_12345"), "Bundle must not contain server secret");
    assert.ok(!bundledSource.includes("leaked-if-executed"), "Bundle must not contain server state");

    const mod = await import(pathToFileURL(outPath).href);
    let onErrorCalled = false;
    const stream = await renderToReadableStream(React.createElement(mod.default), {
      onError() {
        onErrorCalled = true;
      },
    });
    await stream.allReady;
    const html = await new Response(stream).text();

    assert.equal(onErrorCalled, false, "Recoverable SSR stub must NOT trigger server onError");
    assert.ok(
      html.includes('<div data-testid="fallback">Streaming tasks...</div>'),
      "Must render <Suspense> fallback cleanly during SSR/SSG"
    );
    assert.ok(
      html.includes('name="$ACTION_ID_file:///src/pattern-demo.tsx#addPatternTask"'),
      "Form action must carry canonical project-relative server reference ID without machine path"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("5. generateSsrServerManifestStubs emits inline sf_N objects without disk imports", () => {
  const code = generateSsrServerManifestStubs({
    "src/server-functions/pattern-demo.tsx": ["addPatternTask", "fetchPatternTasks", "default"],
    "src/product/page.tsx": ["$$dinou_action_purchase_0"],
  });
  assert.ok(!code.includes("import * as sf_"), "Must not emit disk imports into Pass B");
  assert.ok(code.includes("const sf_0 = Object.defineProperty("));
  assert.ok(code.includes("const sf_1 = Object.defineProperty("));
  assert.ok(code.includes('"file:///src/server-functions/pattern-demo.tsx#addPatternTask"'));
  assert.ok(code.includes('"file:///src/server-functions/pattern-demo.tsx#default"'));
  assert.ok(code.includes('"file:///src/product/page.tsx#$$dinou_action_purchase_0"'));
});

test("6. createServerFunctionProxy (ESM & Webpack) preserves server error message and digest", async () => {
  const baseTmp = path.resolve(process.cwd(), ".dinou");
  fs.mkdirSync(baseTmp, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(baseTmp, "proxy-unit-"));
  const origFetch = globalThis.fetch;
  try {
    const esmProxyOut = path.join(tmpDir, "esm-proxy.mjs");
    await esbuild.build({
      entryPoints: [path.resolve(process.cwd(), "dinou/core/server-function-proxy.js")],
      outfile: esmProxyOut,
      bundle: true,
      format: "esm",
      platform: "browser",
      plugins: [
        {
          name: "stub-esm-client",
          setup(b) {
            b.onResolve({ filter: /^@roggc\/react-server-dom-esm\/client$/ }, () => ({
              path: "stub",
              namespace: "stub-esm",
            }));
            b.onLoad({ filter: /.*/, namespace: "stub-esm" }, () => ({
              contents: "export function createFromFetch(p) { return p; }",
              loader: "js",
            }));
          },
        },
      ],
    });
    const { createServerFunctionProxy } = await import(pathToFileURL(esmProxyOut).href);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: "Task must be at least 3 characters long.",
          digest: "VALIDATION_ERR_01",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );

    const esmFn = createServerFunctionProxy("file:///src/actions.ts#addPatternTask");
    await assert.rejects(
      () => esmFn("hi"),
      (err) => {
        assert.equal(err.message, "Task must be at least 3 characters long.");
        assert.equal(err.digest, "VALIDATION_ERR_01");
        return true;
      }
    );

    const wpFn = createWebpackProxy("file:///src/actions.ts#addPatternTask");
    await assert.rejects(
      () => wpFn("hi"),
      (err) => {
        assert.equal(err.message, "Task must be at least 3 characters long.");
        assert.equal(err.digest, "VALIDATION_ERR_01");
        return true;
      }
    );

    // Non-JSON 502 fallback
    globalThis.fetch = async () =>
      new Response("Bad Gateway", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });

    await assert.rejects(
      () => esmFn("hi"),
      (err) => {
        assert.equal(err.message, "Server function failed");
        return true;
      }
    );
  } finally {
    globalThis.fetch = origFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("7. Rollup reactClientManifestPlugin registers both fileUrl and fileUrl#default", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-rollup-manifest-"));
  const origWriteEnv = process.env.DINOU_WRITE_TO_DISK;
  try {
    process.env.DINOU_WRITE_TO_DISK = "true";
    const manifestPath = path.join(tmpDir, "react-client-manifest.json");
    const compPath = path.join(tmpDir, "pattern-updater.tsx");
    const compCode = `"use client";\nexport default function PatternTaskUpdater() { return null; }\nexport const EXTRA = 1;\n`;
    fs.writeFileSync(compPath, compCode, "utf8");

    const plugin = reactClientManifestPlugin({ manifestPath });
    await plugin.transform.call({ addWatchFile() {}, emitFile() {} }, compCode, compPath);
    plugin.generateBundle(
      {},
      {
        "pattern-updater.js": {
          type: "chunk",
          facadeModuleId: compPath,
          exports: ["default", "EXTRA"],
          code: "export default function PatternTaskUpdater() { return null; }\nexport const EXTRA = 1;",
          modules: { [compPath]: {} },
        },
      }
    );

    const written = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const normComp =
      compPath.length > 1 && compPath[1] === ":"
        ? compPath[0].toUpperCase() + compPath.slice(1)
        : compPath;
    const fileUrl = pathToFileURL(normComp).href;

    assert.ok(written[fileUrl], "Expected base fileUrl key for default export");
    assert.ok(written[`${fileUrl}#default`], "Expected explicit #default key in Rollup manifest");
    assert.equal(written[`${fileUrl}#default`].id, "/pattern-updater.js");
    assert.ok(written[`${fileUrl}#EXTRA`], "Expected named export #EXTRA key");
  } finally {
    process.env.DINOU_WRITE_TO_DISK = origWriteEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

---

### 5.2. Complete Playwright E2E Fixture & Spec (`The Dinou Pattern` + `server-only` + Error Propagation)

#### Fixture Files (place inside the E2E test app `src/e2e-pattern/`)

1. **`src/e2e-pattern/_store/native-task-store.ts`**
   ```ts
   import { useSyncExternalStore } from "react";

   let tasksKey = 0;
   const listeners = new Set<() => void>();

   export const nativeTaskStore = {
     getSnapshot: () => tasksKey,
     invalidateTasks: () => {
       tasksKey += 1;
       listeners.forEach((listener) => listener());
     },
     subscribe: (listener: () => void) => {
       listeners.add(listener);
       return () => listeners.delete(listener);
     },
   };

   export function useNativeTasksKey(): number {
     return useSyncExternalStore(
       nativeTaskStore.subscribe,
       nativeTaskStore.getSnapshot,
       nativeTaskStore.getSnapshot
     );
   }
   ```

2. **`src/e2e-pattern/_components/pattern-updater.tsx`**
   ```tsx
   "use client";
   import { useEffect } from "react";
   import { nativeTaskStore } from "../_store/native-task-store";

   export default function PatternTaskUpdater({ id }: { id: string }) {
     useEffect(() => {
       nativeTaskStore.invalidateTasks();
     }, [id]);

     return null;
   }
   ```

3. **`src/e2e-pattern/_components/pattern-tasks-list.tsx`**
   ```tsx
   "use client";

   export interface PatternTaskItem {
     id: string;
     text: string;
   }

   export default function PatternTasksList({ tasks }: { tasks: PatternTaskItem[] }) {
     if (tasks.length === 0) {
       return <p data-testid="empty-tasks">No tasks yet.</p>;
     }
     return (
       <ul data-testid="tasks-list">
         {tasks.map((t) => (
           <li key={t.id} data-testid="task-item">
             {t.text}
           </li>
         ))}
       </ul>
     );
   }
   ```

4. **`src/e2e-pattern/_actions/pattern-actions.tsx`**
   ```tsx
   "use server";
   import "server-only";
   import type { ReactNode } from "react";
   import PatternTaskUpdater from "../_components/pattern-updater";
   import PatternTasksList, { type PatternTaskItem } from "../_components/pattern-tasks-list";

   const tasksDb: PatternTaskItem[] = [];

   export async function addPatternTask(text: string): Promise<ReactNode> {
     const clean = text.trim();
     if (clean.length < 3) {
       const err = new Error("Task must be at least 3 characters long.");
       (err as Error & { digest?: string }).digest = "TASK_TOO_SHORT";
       throw err;
     }
     const id = `task-${tasksDb.length + 1}-${Date.now()}`;
     tasksDb.unshift({ id, text: clean });
     return <PatternTaskUpdater key={id} id={id} />;
   }

   export async function fetchPatternTasks(): Promise<ReactNode> {
     return <PatternTasksList tasks={[...tasksDb]} />;
   }

   export async function resetPatternTasks(): Promise<void> {
     tasksDb.length = 0;
   }
   ```

5. **`src/e2e-pattern/page.tsx`**
   ```tsx
   "use client";
   import React, { Suspense, use, useEffect, useState, type ReactNode } from "react";
   import {
     addPatternTask,
     fetchPatternTasks,
     resetPatternTasks,
   } from "./_actions/pattern-actions";
   import { useNativeTasksKey } from "./_store/native-task-store";

   function StreamSlot({ promise }: { promise: Promise<ReactNode> }) {
     const content = use(promise);
     return <>{content}</>;
   }

   export default function PatternE2EPage() {
     const tasksKey = useNativeTasksKey();
     const [text, setText] = useState("");
     const [uncontrolledNote, setUncontrolledNote] = useState("");
     const [isMutating, setIsMutating] = useState(false);
     const [errorMsg, setErrorMsg] = useState<string | null>(null);
     const [mutationKey, setMutationKey] = useState(0);
     const [mutationPromise, setMutationPromise] = useState<Promise<ReactNode> | null>(null);
     const [tasksPromise, setTasksPromise] = useState<Promise<ReactNode>>(() =>
       fetchPatternTasks()
     );

     useEffect(() => {
       if (tasksKey > 0) {
         setTasksPromise(fetchPatternTasks());
       }
     }, [tasksKey]);

     const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
       e.preventDefault();
       if (!text.trim() || isMutating) return;

       setIsMutating(true);
       setErrorMsg(null);
       setMutationKey((k) => k + 1);

       const rawPromise = addPatternTask(text);
       setMutationPromise(rawPromise.catch(() => null));

       rawPromise
         .then(() => {
           setText("");
         })
         .catch((err: Error) => {
           setErrorMsg(err.message || "Failed to add task");
         })
         .finally(() => {
           setIsMutating(false);
         });
     };

     const handleReset = async () => {
       await resetPatternTasks();
       setTasksPromise(fetchPatternTasks());
     };

     return (
       <main>
         <h1>Dinou Pattern E2E</h1>

         <input
           data-testid="unrelated-input"
           value={uncontrolledNote}
           onChange={(e) => setUncontrolledNote(e.target.value)}
           placeholder="Unrelated local state"
         />

         <form onSubmit={handleSubmit}>
           <input
             data-testid="task-input"
             value={text}
             onChange={(e) => setText(e.target.value)}
             placeholder="New task..."
           />
           <button data-testid="submit-task" type="submit" disabled={isMutating}>
             Add Task
           </button>
         </form>

         <button data-testid="reset-tasks" type="button" onClick={handleReset}>
           Reset
         </button>

         {errorMsg && <p data-testid="mutation-error">{errorMsg}</p>}

         {mutationPromise && (
           <Suspense key={`mutation-${mutationKey}`} fallback={null}>
             <StreamSlot promise={mutationPromise} />
           </Suspense>
         )}

         <Suspense
           key={`tasks-${tasksKey}`}
           fallback={<p data-testid="tasks-fallback">Loading tasks...</p>}
         >
           <StreamSlot promise={tasksPromise} />
         </Suspense>
       </main>
     );
   }
   ```

#### Playwright Spec (`tests/e2e/dinou-pattern-ssr-rpc.spec.ts`)

```ts
import { test, expect } from "@playwright/test";

test.describe("The Dinou Pattern — Pass B 'server-only' Isolation, Surgical Store Sync & Error Propagation", () => {
  test("hydrates cleanly with 'server-only' in 'use server' actions, preserves unrelated input focus/state, and propagates thrown server error messages", async ({
    page,
  }) => {
    const hydrationAndPageErrors: string[] = [];
    page.on("pageerror", (err) => hydrationAndPageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error" && /hydrat/i.test(msg.text())) {
        hydrationAndPageErrors.push(msg.text());
      }
    });

    await page.goto("/e2e-pattern");
    await page.getByTestId("reset-tasks").click();
    await expect(page.getByTestId("empty-tasks")).toHaveText("No tasks yet.");

    // Type into an unrelated input to verify zero route reload / zero state loss
    await page.getByTestId("unrelated-input").fill("Keep my draft intact");

    // 1. Trigger a server validation error (< 3 chars):
    //    - Must preserve exact server error message ("Task must be at least 3 characters long.")
    //    - Must NOT clear the user's typed task input ("ab")
    //    - Must NOT crash the React tree or mount PatternTaskUpdater
    await page.getByTestId("task-input").fill("ab");
    await page.getByTestId("submit-task").click();

    await expect(page.getByTestId("mutation-error")).toHaveText(
      "Task must be at least 3 characters long."
    );
    await expect(page.getByTestId("task-input")).toHaveValue("ab");
    await expect(page.getByTestId("empty-tasks")).toHaveText("No tasks yet.");

    // 2. Submit two consecutive valid tasks via Flight Headless Updater:
    await page.getByTestId("task-input").fill("Ship Dinou v9.4.0");
    await page.getByTestId("submit-task").click();

    await expect(page.getByTestId("mutation-error")).toHaveCount(0);
    await expect(page.getByTestId("task-input")).toHaveValue("");
    await expect(page.getByTestId("task-item")).toHaveText(["Ship Dinou v9.4.0"]);

    await page.getByTestId("task-input").fill("Verify multi-runtime SSR");
    await page.getByTestId("submit-task").click();

    await expect(page.getByTestId("task-item")).toHaveText([
      "Verify multi-runtime SSR",
      "Ship Dinou v9.4.0",
    ]);

    // Unrelated local state remained 100% intact across mutations
    await expect(page.getByTestId("unrelated-input")).toHaveValue("Keep my draft intact");

    // 3. Reload the page (full SSR + client mount) and verify no split-brain state or hydration errors
    await page.reload();
    await expect(page.getByTestId("task-item")).toHaveText([
      "Verify multi-runtime SSR",
      "Ship Dinou v9.4.0",
    ]);
    expect(hydrationAndPageErrors).toEqual([]);
  });
});
```

