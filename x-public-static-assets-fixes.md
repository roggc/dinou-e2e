# Upstream Handoff: `public/` Static Assets Security, Multi-Bundler Parity & Multi-Runtime Delivery Fixes

## 1. Executive Summary

While auditing `/docs/public` (`public/` static asset delivery) in `dinou-docs` against `dinou@9.4.0`, three upstream issues were uncovered and fixed across Dinou's bundlers (`esbuild`, `rollup`, `webpack`), runtime servers (`node` dev & prod, `bun`, `deno`, `cloudflare`), and static exporter (`dinou export`):

1. **Critical Security & Export Leak — Internal `.dinou/dist3/server/*` Bundles, Source Maps & Build Manifests Exposed Over Public HTTP & `dinou export`, Plus Missing URL Decoding & Path-Traversal Confinement**:
   - All three bundlers emit server bundles (`handler.js`, `handler.js.map`, `netlify.js`, `netlify.js.map`, `package.json`) inside `.dinou/dist3/server/`, and emit `manifest.json` (plus `react-client-manifest.json` and `server-functions-manifest.json` in Webpack) inside `.dinou/dist3/`.
   - Previously, `node/build.js`, `bun/build.js`, `deno/build.js`, and `cloudflare/build.js` served any file inside `.dinou/dist3` matching `url.pathname` (`GET /server/handler.js`, `GET /server/handler.js.map`, `GET /server-functions-manifest.json`), publicly leaking compiled server code, source maps, and absolute developer filesystem paths.
   - `core/export-static.js` (`dinou export`) recursively copied all of `.dinou/dist3` into `out/`, publishing `out/server/handler.js` and internal manifests to static hosts (GitHub Pages, Surge, Cloudflare Pages).
   - Static path resolution in `node/dev.js`, `node/build.js`, `bun/build.js`, and `deno/build.js` passed raw `url.pathname` to `path.join(dist3Dir, pathname)` without `decodeURIComponent` (breaking filenames with spaces/UTF-8 like `/docs/brochure%202026.pdf`) and without strict directory-containment checks (`resolved.startsWith(rootDir + path.sep)`) or hidden dotfile filtering.
2. **Critical Multi-Bundler Parity Bug — Rollup Flattened Nested Subdirectories (`flatten: true`) & Dropped `public/.well-known/*` Dotfiles (+ Removal of Legacy v5 `favicons/` Fallback)**:
   - In `dinou/rollup/rollup.config.js`, `rollup-plugin-copy` was configured with `{ src: "public/*", dest: outputDirectory }` and `flatten: true`. This stripped subdirectory structure (flattening `public/images/og-image.png` into `.dinou/dist3/og-image.png`) and skipped dot-directories such as `public/.well-known/assetlinks.json` and `public/.well-known/apple-app-site-association` (`globby` defaults to `dot: false`).
   - Removed legacy pre-v6 `favicons/` directory fallback across Esbuild, Rollup, and Webpack so `public/` is the single, unambiguous source of truth for unbundled static files.
3. **High Multi-Runtime Delivery Bug — Cloudflare Workers 404s on `/sitemap.xml`, `/.well-known/*`, Verification `.html`, PDFs & Media + Incomplete MIME Types + Incorrect `immutable` `Cache-Control` on Unhashed `public/` Files**:
   - In `dinou/cloudflare/build.js` and `dinou/adapters/cloudflare.js`, `staticExtRegex` lacked `.xml`, `.pdf`, `.json`, standalone verification `.html` files (e.g. `/google1a2b3c4d5e6f.html`), media/archive extensions, and `/.well-known/*` paths (including extensionless `/.well-known/apple-app-site-association`), causing them to fall through to `handleRequest` and return `404`.
   - In `dinou/node/dev.js`, `dinou/node/build.js`, and `dinou/deno/build.js`, common web/SEO/media types (`.xml`, `.webmanifest`, `.html`, extensionless `apple-app-site-association` requiring `application/json`, `.pdf`, `.avif`, `.gif`, `.ttf`, `.otf`, `.wasm`, `.mp4`, `.webm`, `.mp3`) fell back to `application/octet-stream` (or omitted `content-type` in Deno).
   - `dinou/node/build.js` stamped `Cache-Control: public, max-age=31536000, immutable` on **all** files in `.dinou/dist3`, including unhashed `public/` files (`/robots.txt`, `/sitemap.xml`, `/favicon.ico`, `/images/og-image.png`) and unhashed `/styles.css`.

---

## 2. Files Created & Modified in `dinou/`

### New Core Modules
1. **`dinou/core/static-assets.js`** *(Universal runtime-safe module — zero `node:fs` dependency; works in Node.js, Bun, Deno, and Cloudflare Workers `workerd`)*:
   - `STATIC_MIME_TYPES` & `getStaticContentType(pathnameOrFilePath)`: 41 standard Web/SEO/Font/Image/Document/Media MIME types + automatic `application/json; charset=utf-8` for extensionless `apple-app-site-association`.
   - `isInternalDinouAssetPath(relPosixPath)`: Blocks `server/*`, `_slots/*`, `manifest.json`, `react-client-manifest.json`, `server-functions-manifest.json`, `status-manifest.json`, `index.html`, `shell.html`, `metadata.json`, `layout.metadata.json`, `shell.layout.json`, `*.rsc`, and `*._old.*`.
   - `normalizePublicRequestPath(pathname)`: Safely `decodeURIComponent`s URL paths (catching `URIError`), rejects null bytes, backslash separators, `.` / `..` traversal segments, hidden dotfiles/dot-directories (except RFC 8615 `/.well-known/<file>`), and internal Dinou artifacts.
   - `resolveConfinedStaticFile(baseDir, relPosixPath)`: Resolves and verifies `resolved.startsWith(rootDir + path.sep)`.
   - `isImmutableAssetPath(relPosixPath)` & `getStaticCacheControl(relPosixPath)`: Returns `public, max-age=31536000, immutable` strictly for `/assets/*` and content-hashed bundler chunks (`main-ZGBKXIUF.js`, `main-a1b2c3d4e5f6a7b8c9d0.js`, `chunk-B3f9_kL2.js`), and `public, max-age=0, must-revalidate` for unhashed `public/` files and unhashed stylesheets.
   - `isPublicStaticAssetRequest(pathname)`: Edge static routing classifier for Cloudflare Workers `env.ASSETS`.
   - `shouldExportDist3Entry(relPosixPath)`: Filter predicate for `dinou export` (`core/export-static.js`).
2. **`dinou/core/copy-static-dirs.js`** *(Node build-time helper)*:
   - `copyStaticDirectoriesToOutdir(projectRoot, outdir)`: Recursively copies `public/` (if present) into `outdir`, preserving nested subdirectories and dotfiles (`.well-known/*`, `.nojekyll`) while ignoring OS junk files (`.DS_Store`, `Thumbs.db`).

### Modified Bundler, Runtime & Exporter Files
3. `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`
4. `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`
5. `dinou/rollup/rollup.config.js`
6. `dinou/webpack/webpack.config.js`
7. `dinou/node/dev.js`
8. `dinou/node/build.js`
9. `dinou/bun/build.js`
10. `dinou/deno/build.js`
11. `dinou/cloudflare/build.js`
12. `dinou/adapters/cloudflare.js`
13. `dinou/core/export-static.js`

---

## 3. Full Source of New Modules & Unified Diffs

### 3.1 `dinou/core/static-assets.js` (New File)

```js
import path from "node:path";

export const STATIC_MIME_TYPES = Object.freeze({
  // Scripts, WASM & Source Maps
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".cjs": "application/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",

  // Styles, Documents, SEO & Web Manifests
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".rss": "application/rss+xml; charset=utf-8",
  ".atom": "application/atom+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",

  // Images & Icons
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".apng": "image/apng",

  // Fonts
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",

  // Documents & Archives
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",

  // Video & Audio
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
});

export const PUBLIC_STATIC_EXT_REGEX =
  /\.(?:js|mjs|cjs|css|map|wasm|png|jpg|jpeg|gif|svg|ico|webp|avif|bmp|apng|woff|woff2|ttf|eot|otf|txt|xml|rss|atom|json|webmanifest|html|htm|pdf|csv|md|ics|vtt|mp4|webm|ogv|mov|mp3|wav|ogg|m4a|aac|flac|zip|gz)$/i;

const IMMUTABLE_CHUNK_REGEX =
  /^[^/]+-(?:[A-Z0-9]{8}|[a-f0-9]{16,32}|(?=[A-Za-z0-9_-]{8}\.)(?=[A-Za-z0-9_-]*[A-Z0-9])[A-Za-z0-9_-]{8})\.(?:js|mjs|cjs|css)(?:\.map)?$/;

const ROOT_INTERNAL_MANIFESTS = new Set([
  "manifest.json",
  "react-client-manifest.json",
  "server-functions-manifest.json",
  "status-manifest.json",
]);

const ROUTE_INTERNAL_BASENAMES = new Set([
  "index.html",
  "shell.html",
  "metadata.json",
  "layout.metadata.json",
  "shell.layout.json",
]);

export function getStaticContentType(pathnameOrFilePath) {
  if (!pathnameOrFilePath || typeof pathnameOrFilePath !== "string") {
    return "application/octet-stream";
  }
  const normalized = pathnameOrFilePath.replace(/\\/g, "/");
  const baseLower = (normalized.split("/").pop() || "").toLowerCase();
  if (baseLower === "apple-app-site-association") {
    return "application/json; charset=utf-8";
  }
  const dotIdx = baseLower.lastIndexOf(".");
  if (dotIdx === -1) {
    return "application/octet-stream";
  }
  const ext = baseLower.slice(dotIdx);
  return STATIC_MIME_TYPES[ext] || "application/octet-stream";
}

export function isInternalDinouAssetPath(relPosixPath) {
  if (!relPosixPath || typeof relPosixPath !== "string") return true;
  const clean = relPosixPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean) return true;

  const segments = clean.split("/").filter(Boolean);
  if (segments.length === 0) return true;

  const firstLower = segments[0].toLowerCase();
  if (firstLower === "server" || firstLower === "_slots") {
    return true;
  }

  const relLower = segments.join("/").toLowerCase();
  if (ROOT_INTERNAL_MANIFESTS.has(relLower)) {
    return true;
  }

  const baseLower = segments[segments.length - 1].toLowerCase();
  if (ROUTE_INTERNAL_BASENAMES.has(baseLower)) {
    return true;
  }
  if (baseLower.endsWith(".rsc") || baseLower.includes("._old.")) {
    return true;
  }

  return false;
}

export function normalizePublicRequestPath(pathname) {
  if (
    !pathname ||
    typeof pathname !== "string" ||
    !pathname.startsWith("/") ||
    pathname === "/" ||
    pathname.includes("\0")
  ) {
    return null;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes("\0") || decoded.includes("\\")) {
    return null;
  }

  const rawSegments = decoded.split("/");
  if (rawSegments.some((seg) => seg === "." || seg === "..")) {
    return null;
  }

  const segments = rawSegments.filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  const hasDotSegment = segments.some((seg) => seg.startsWith("."));
  if (hasDotSegment) {
    const isValidWellKnown =
      segments[0] === ".well-known" &&
      segments.length >= 2 &&
      segments.slice(1).every((seg) => !seg.startsWith("."));
    if (!isValidWellKnown) {
      return null;
    }
  }

  const relPosixPath = segments.join("/");
  if (isInternalDinouAssetPath(relPosixPath)) {
    return null;
  }

  return relPosixPath;
}

export function resolveConfinedStaticFile(baseDir, relPosixPath) {
  if (
    !baseDir ||
    !relPosixPath ||
    typeof relPosixPath !== "string" ||
    relPosixPath.includes("\0") ||
    relPosixPath.includes("\\")
  ) {
    return null;
  }
  const segments = relPosixPath.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((seg) => seg === "." || seg === "..")) {
    return null;
  }

  const rootDir = path.resolve(baseDir);
  const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  const resolved = path.resolve(rootDir, ...segments);
  if (!resolved.startsWith(rootPrefix)) {
    return null;
  }
  return resolved;
}

export function isImmutableAssetPath(relPosixPath) {
  if (!relPosixPath || typeof relPosixPath !== "string") return false;
  const clean = relPosixPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean) return false;
  return clean.startsWith("assets/") || IMMUTABLE_CHUNK_REGEX.test(clean);
}

export function getStaticCacheControl(relPosixPath) {
  return isImmutableAssetPath(relPosixPath)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, must-revalidate";
}

export function isPublicStaticAssetRequest(pathname) {
  const relPath = normalizePublicRequestPath(pathname);
  if (!relPath) return false;

  return (
    relPath.startsWith("assets/") ||
    relPath.startsWith("_dinou/") ||
    relPath.startsWith(".well-known/") ||
    PUBLIC_STATIC_EXT_REGEX.test(relPath)
  );
}

export function shouldExportDist3Entry(relPosixPath) {
  if (!relPosixPath || typeof relPosixPath !== "string") return false;
  const clean = relPosixPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean) return false;

  const segments = clean.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  const firstLower = segments[0].toLowerCase();
  if (firstLower === "server" || firstLower === "_slots") {
    return false;
  }

  const relLower = segments.join("/").toLowerCase();
  if (ROOT_INTERNAL_MANIFESTS.has(relLower) || relLower === ".assetsignore") {
    return false;
  }

  const baseLower = segments[segments.length - 1].toLowerCase();
  if (baseLower === ".ds_store" || baseLower === "thumbs.db") {
    return false;
  }
  if (
    baseLower === "shell.html" ||
    baseLower === "metadata.json" ||
    baseLower === "layout.metadata.json" ||
    baseLower === "shell.layout.json" ||
    baseLower.endsWith(".rsc") ||
    baseLower.includes("._old.")
  ) {
    return false;
  }

  return true;
}
```

### 3.2 `dinou/core/copy-static-dirs.js` (New File)

```js
import fs from "node:fs";
import path from "node:path";

const IGNORED_OS_BASENAMES = new Set([".ds_store", "thumbs.db"]);

function shouldCopyStaticEntry(srcPath) {
  const baseLower = path.basename(srcPath).toLowerCase();
  return !IGNORED_OS_BASENAMES.has(baseLower);
}

export function copyStaticDirectoriesToOutdir(projectRoot, outdir) {
  const rootDir = path.resolve(projectRoot || process.cwd());
  const srcDir = path.resolve(rootDir, "public");
  if (!fs.existsSync(srcDir)) return false;

  try {
    if (!fs.statSync(srcDir).isDirectory()) return false;
    const destDir = path.resolve(rootDir, outdir);
    fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(srcDir, destDir, {
      recursive: true,
      force: true,
      dereference: true,
      preserveTimestamps: true,
      filter: shouldCopyStaticEntry,
    });
    return true;
  } catch (e) {
    return false;
  }
}

export default copyStaticDirectoriesToOutdir;
```

### 3.3 Unified Diffs for Modified Files

#### `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`
```diff
--- a/dinou/esbuild/helpers-esbuild/get-config-esbuild.js
+++ b/dinou/esbuild/helpers-esbuild/get-config-esbuild.js
@@ -7,6 +7,7 @@ import skipMissingEntryPointsPlugin from "../plugins-esbuild/skip-missing-entry-
 import { swcRedirectPlugin } from "./swc-disk-cache.js";
 import { esbuildContextualDinouPlugin } from "../../core/resolve-contextual-dinou.js";
+import { copyStaticDirectoriesToOutdir } from "../../core/copy-static-dirs.js";
 import fs from "node:fs";
 import path from "node:path";
 
@@ -67,19 +68,16 @@ export default function getConfigEsbuild({
   ];
 
   const shouldWriteToDisk = process.env.DINOU_WRITE_TO_DISK === "true";
-  const staticDir = fs.existsSync("public") ? "public" : (fs.existsSync("favicons") ? "favicons" : null);
-  if (staticDir && shouldWriteToDisk) {
+  if (fs.existsSync("public") && shouldWriteToDisk) {
     let staticCopied = false;
     plugins = [
       {
         name: "copy-static-files-once",
         setup(build) {
           build.onEnd(() => {
             if (staticCopied) return;
             staticCopied = true;
-            try {
-              fs.cpSync(staticDir, outdir, { recursive: true, force: true });
-            } catch (e) {}
+            copyStaticDirectoriesToOutdir(process.cwd(), outdir);
           });
         },
       },
```

#### `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`
```diff
--- a/dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js
+++ b/dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js
@@ -3,11 +3,11 @@ import reactClientManifestPlugin from "../plugins-esbuild/react-client-manifest-
 import serverFunctionsPlugin from "../plugins-esbuild/server-functions-plugin.js";
 import cssProcessorPlugin from "../plugins-esbuild/css-processor-plugin.js";
 import assetsPlugin from "../plugins-esbuild/assets-plugin.js";
-import copyStaticFiles from "#esbuild-copy-static-files";
 import manifestGeneratorPlugin from "../plugins-esbuild/manifest-generator-plugin.js";
 import writePlugin from "../plugins-esbuild/write-plugin.js";
 import babelReactCompilerPlugin from "../plugins-esbuild/babel-react-compiler-plugin.js";
 import { esbuildContextualDinouPlugin } from "../../core/resolve-contextual-dinou.js";
+import { copyStaticDirectoriesToOutdir } from "../../core/copy-static-dirs.js";
 import { existsSync } from "node:fs";
 
 export default function getConfigEsbuildProd({
@@ -33,15 +33,17 @@ export default function getConfigEsbuildProd({
     writePlugin(),
   ].filter(Boolean);
 
-  const staticDir = existsSync("public") ? "public" : (existsSync("favicons") ? "favicons" : null);
-  if (staticDir) {
+  if (existsSync("public")) {
     plugins = [
-      copyStaticFiles({
-        src: staticDir,
-        dest: outdir,
-      }),
       ...plugins,
+      {
+        name: "copy-static-files",
+        setup(build) {
+          build.onEnd(() => {
+            copyStaticDirectoriesToOutdir(process.cwd(), outdir);
+          });
+        },
+      },
     ];
   }
```

#### `dinou/rollup/rollup.config.js`
```diff
--- a/dinou/rollup/rollup.config.js
+++ b/dinou/rollup/rollup.config.js
@@ -6,7 +6,7 @@ import postcss from "#rollup-plugin-postcss";
 import babelModule from "#rollup/plugin-babel";
 import resolveModule from "#rollup/plugin-node-resolve";
 import commonjs from "#rollup/plugin-commonjs";
-import copy from "#rollup-plugin-copy";
+import { copyStaticDirectoriesToOutdir } from "../core/copy-static-dirs.js";
 import reactClientManifest from "./rollup-plugins/rollup-plugin-react-client-manifest.js";
 import createScopedName from "../core/createScopedName.js";
 import replace from "#rollup/plugin-replace";
@@ -201,20 +201,12 @@ export default async function () {
           path: path.resolve(__dirname, "postcss.config.js"),
         },
       }),
-      shouldWriteToDisk &&
-        copy({
-          targets: [
-            fs.existsSync("public") && {
-              src: "public/*",
-              dest: outputDirectory,
-            },
-            fs.existsSync("favicons") && {
-              src: "favicons/*",
-              dest: outputDirectory,
-            },
-          ].filter(Boolean),
-          flatten: true,
-        }),
+      shouldWriteToDisk && {
+        name: "dinou-copy-static",
+        writeBundle() {
+          copyStaticDirectoriesToOutdir(process.cwd(), outputDirectory);
+        },
+      },
       reactClientManifest({
```

#### `dinou/webpack/webpack.config.js`
```diff
--- a/dinou/webpack/webpack.config.js
+++ b/dinou/webpack/webpack.config.js
@@ -346,15 +346,14 @@ export default async function getWebpackConfig() {
       new CopyWebpackPlugin({
         patterns: [
           {
             from: "public",
             to: ".",
             noErrorOnMissing: true,
+            globOptions: {
+              dot: true,
+              ignore: ["**/.DS_Store", "**/Thumbs.db"],
+            },
           },
-          {
-            from: "favicons",
-            to: ".",
-            noErrorOnMissing: true,
-          },
         ],
       }),
```

#### `dinou/node/dev.js`
```diff
--- a/dinou/node/dev.js
+++ b/dinou/node/dev.js
@@ -35,6 +35,11 @@ import { resolveSetupFiles } from "../core/resolve-setup-files.js";
 import { generateRouteModulesCode, generateRouteTypes } from "../core/route-generator.js";
 import { discoverLayoutsFromFs } from "../core/discover-layouts.js";
 import { esbuildContextualDinouPlugin, isUnderscoreEscapedSrcPath } from "../core/resolve-contextual-dinou.js";
+import {
+  getStaticContentType,
+  normalizePublicRequestPath,
+  resolveConfinedStaticFile,
+} from "../core/static-assets.js";
 import parseExports from "../core/parse-exports.js";
 
@@ -2188,26 +2193,9 @@ if (!fs.existsSync(dotDinouDir)) {
   fs.mkdirSync(dotDinouDir, { recursive: true });
 }
 
-const MIME_TYPES = {
-  ".js": "application/javascript; charset=utf-8",
-  ".mjs": "application/javascript; charset=utf-8",
-  ".css": "text/css; charset=utf-8",
-  ".json": "application/json",
-  ".svg": "image/svg+xml",
-  ".png": "image/png",
-  ".jpg": "image/jpeg",
-  ".jpeg": "image/jpeg",
-  ".webp": "image/webp",
-  ".ico": "image/x-icon",
-  ".txt": "text/plain; charset=utf-8",
-  ".woff": "font/woff",
-  ".woff2": "font/woff2",
-};
-
 const candidateStaticDirs = [
+  path.resolve(projectRoot, "public"),
   path.resolve(projectRoot, ".dinou/public"),
-  path.resolve(projectRoot, "public"),
 ];
 
@@ -2632,12 +2620,18 @@ const server = http.createServer(async (req, res) => {
       return;
     }
 
-    // 2. Static files delivery from memory, .dinou/public, or public/
-    if (pathname !== "/") {
-      const cleanPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
-      const mappedPath = (parsedAssetManifest && parsedAssetManifest[cleanPath]) || cleanPath;
-      const ext = path.extname(cleanPath).toLowerCase();
+    // 2. Static files delivery from memory, public/, or .dinou/public
+    const cleanPath =
+      req.method === "GET" || req.method === "HEAD"
+        ? normalizePublicRequestPath(pathname)
+        : null;
+    if (cleanPath) {
+      const rawMapped = (parsedAssetManifest && parsedAssetManifest[cleanPath]) || cleanPath;
+      const mappedPath =
+        rawMapped === cleanPath
+          ? cleanPath
+          : normalizePublicRequestPath("/" + String(rawMapped).replace(/^\/+/, "")) || cleanPath;
 
       // 2.a In-memory fast path for client bundles and assets generated in dev
@@ -2657,12 +2652,11 @@ const server = http.createServer(async (req, res) => {
         }
 
         if (memBuf) {
-          const fileExt = path.extname(cleanPath).toLowerCase();
-          const contentType = MIME_TYPES[fileExt] || "application/octet-stream";
+          const contentType = getStaticContentType(cleanPath);
           res.statusCode = 200;
           res.setHeader("content-type", contentType);
           res.setHeader("content-length", String(memBuf.length));
           res.setHeader("cache-control", "no-store, no-cache, must-revalidate");
-          res.end(memBuf);
+          res.end(req.method === "HEAD" ? undefined : memBuf);
           return;
         }
       }
@@ -2670,8 +2664,8 @@ const server = http.createServer(async (req, res) => {
       let foundFilePath = null;
       for (const baseDir of candidateStaticDirs) {
         for (const targetName of [mappedPath, cleanPath]) {
-          const filePath = path.join(baseDir, targetName);
-          if (fs.existsSync(filePath)) {
+          const filePath = resolveConfinedStaticFile(baseDir, targetName);
+          if (filePath && fs.existsSync(filePath)) {
             try {
               if (fs.statSync(filePath).isFile()) {
                 foundFilePath = filePath;
@@ -2697,8 +2691,8 @@ const server = http.createServer(async (req, res) => {
           await new Promise((r) => setTimeout(r, 25));
           for (const baseDir of candidateStaticDirs) {
             for (const targetName of [mappedPath, cleanPath]) {
-              const filePath = path.join(baseDir, targetName);
-              if (fs.existsSync(filePath)) {
+              const filePath = resolveConfinedStaticFile(baseDir, targetName);
+              if (filePath && fs.existsSync(filePath)) {
                 try {
                   if (fs.statSync(filePath).isFile()) {
                     foundFilePath = filePath;
@@ -2723,7 +2717,7 @@ const server = http.createServer(async (req, res) => {
       if (foundFilePath) {
         try {
           const fileExt = path.extname(foundFilePath).toLowerCase();
-          const contentType = MIME_TYPES[fileExt] || "application/octet-stream";
+          const contentType = getStaticContentType(foundFilePath);
 
           // Safely read buffer into memory, retrying briefly if the bundler currently has it truncated or locked
@@ -2744,7 +2738,7 @@ const server = http.createServer(async (req, res) => {
             res.setHeader("content-type", contentType);
             res.setHeader("content-length", String(buf.length));
             res.setHeader("cache-control", "no-store, no-cache, must-revalidate");
-            res.end(buf);
+            res.end(req.method === "HEAD" ? undefined : buf);
             return;
           }
         } catch (e) {}
```

#### `dinou/node/build.js`
```diff
--- a/dinou/node/build.js
+++ b/dinou/node/build.js
@@ -48,6 +48,12 @@ import {
   nodeToWebRequest,
   sendWebResponseToNode,
 } from "${dinouDirSlash}/core/http-adapter.js";
+import {
+  getStaticContentType,
+  getStaticCacheControl,
+  normalizePublicRequestPath,
+  resolveConfinedStaticFile,
+} from "${dinouDirSlash}/core/static-assets.js";
 
@@ -70,23 +76,6 @@ function initStorage() {
   }
 }
 
-const MIME_TYPES = {
-  ".js": "application/javascript; charset=utf-8",
-  ".mjs": "application/javascript; charset=utf-8",
-  ".css": "text/css; charset=utf-8",
-  ".json": "application/json",
-  ".svg": "image/svg+xml",
-  ".png": "image/png",
-  ".jpg": "image/jpeg",
-  ".jpeg": "image/jpeg",
-  ".webp": "image/webp",
-  ".ico": "image/x-icon",
-  ".txt": "text/plain; charset=utf-8",
-  ".woff": "font/woff",
-  ".woff2": "font/woff2",
-};
-
 const cwd = typeof process !== "undefined" && typeof process.cwd === "function" ? process.cwd() : ".";
 const dist3Dir = path.resolve(cwd, ".dinou/dist3");
 
@@ -96,25 +85,28 @@ export async function fetch(req) {
   const pathname = url.pathname;
 
   // Static assets delivery (Zero-copy with Node streams)
-  if (pathname !== "/") {
-    const filePath = path.join(dist3Dir, pathname);
-    if (fs.existsSync(filePath)) {
-      try {
-        const stat = fs.statSync(filePath);
-        if (stat.isFile()) {
-          const nodeStream = fs.createReadStream(filePath);
-          const webStream = Readable.toWeb(nodeStream);
-          const ext = path.extname(filePath).toLowerCase();
-          const contentType = MIME_TYPES[ext] || "application/octet-stream";
-          return new Response(webStream, {
-            headers: {
-              "content-type": contentType,
-              "content-length": String(stat.size),
-              "cache-control": "public, max-age=31536000, immutable",
-            },
-          });
-        }
-      } catch (e) {}
+  if (req.method === "GET" || req.method === "HEAD") {
+    const cleanPath = normalizePublicRequestPath(pathname);
+    if (cleanPath) {
+      const filePath = resolveConfinedStaticFile(dist3Dir, cleanPath);
+      if (filePath && fs.existsSync(filePath)) {
+        try {
+          const stat = fs.statSync(filePath);
+          if (stat.isFile()) {
+            const body =
+              req.method === "HEAD"
+                ? null
+                : Readable.toWeb(fs.createReadStream(filePath));
+            return new Response(body, {
+              headers: {
+                "content-type": getStaticContentType(cleanPath),
+                "content-length": String(stat.size),
+                "cache-control": getStaticCacheControl(cleanPath),
+              },
+            });
+          }
+        } catch (e) {}
+      }
     }
   }
```

#### `dinou/bun/build.js`
```diff
--- a/dinou/bun/build.js
+++ b/dinou/bun/build.js
@@ -752,6 +752,12 @@ import {
   FileSystemStorage,
   MemoryStorage,
 } from "${dinouDirSlash}/core/storage-adapter.js";
+import {
+  getStaticContentType,
+  getStaticCacheControl,
+  normalizePublicRequestPath,
+  resolveConfinedStaticFile,
+} from "${dinouDirSlash}/core/static-assets.js";
 import * as path from "node:path";
 import * as fs from "node:fs";
 
@@ -788,12 +794,26 @@ export async function fetch(req) {
   const pathname = url.pathname;
 
   // Static assets delivery (Zero-copy with Bun.file)
-  if (pathname !== "/") {
-    const filePath = path.join(dist3Dir, pathname);
-    const file = Bun.file(filePath);
-    if (await file.exists()) {
-      return new Response(file);
+  if (req.method === "GET" || req.method === "HEAD") {
+    const cleanPath = normalizePublicRequestPath(pathname);
+    if (cleanPath) {
+      const filePath = resolveConfinedStaticFile(dist3Dir, cleanPath);
+      if (filePath && fs.existsSync(filePath)) {
+        try {
+          const stat = fs.statSync(filePath);
+          if (stat.isFile()) {
+            const file = Bun.file(filePath);
+            return new Response(req.method === "HEAD" ? null : file, {
+              headers: {
+                "content-type": getStaticContentType(cleanPath),
+                "content-length": String(stat.size),
+                "cache-control": getStaticCacheControl(cleanPath),
+              },
+            });
+          }
+        } catch (e) {}
+      }
     }
   }
```

#### `dinou/deno/build.js`
```diff
--- a/dinou/deno/build.js
+++ b/dinou/deno/build.js
@@ -779,6 +779,12 @@ import {
   DenoKVStorage,
   MemoryStorage,
 } from "${dinouDirSlash}/core/storage-adapter.js";
+import {
+  getStaticContentType,
+  getStaticCacheControl,
+  normalizePublicRequestPath,
+  resolveConfinedStaticFile,
+} from "${dinouDirSlash}/core/static-assets.js";
 import * as path from "node:path";
 import * as fs from "node:fs";
 
@@ -819,25 +825,34 @@ export async function fetch(req) {
   const pathname = url.pathname;
 
   // Static assets delivery (if running with local disk access)
-  if (pathname !== "/" && typeof Deno !== "undefined" && typeof Deno.readFile === "function") {
-    try {
-      const cwd = typeof Deno.cwd === "function" ? Deno.cwd() : process.cwd();
-      const dist3Dir = path.resolve(cwd, ".dinou/dist3");
-      const filePath = path.join(dist3Dir, pathname);
-      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
-        const content = await Deno.readFile(filePath);
-        const ext = path.extname(filePath).toLowerCase();
-        const headers = {};
-        if (ext === ".js" || ext === ".mjs") headers["content-type"] = "application/javascript; charset=utf-8";
-        else if (ext === ".css") headers["content-type"] = "text/css; charset=utf-8";
-        else if (ext === ".json") headers["content-type"] = "application/json";
-        else if (ext === ".svg") headers["content-type"] = "image/svg+xml";
-        else if (ext === ".png") headers["content-type"] = "image/png";
-        else if (ext === ".ico") headers["content-type"] = "image/x-icon";
-        return new Response(content, { headers });
+  if (
+    (req.method === "GET" || req.method === "HEAD") &&
+    typeof Deno !== "undefined" &&
+    typeof Deno.readFile === "function"
+  ) {
+    const cleanPath = normalizePublicRequestPath(pathname);
+    if (cleanPath) {
+      try {
+        const cwd = typeof Deno.cwd === "function" ? Deno.cwd() : process.cwd();
+        const dist3Dir = path.resolve(cwd, ".dinou/dist3");
+        const filePath = resolveConfinedStaticFile(dist3Dir, cleanPath);
+        if (filePath && fs.existsSync(filePath)) {
+          const stat = fs.statSync(filePath);
+          if (stat.isFile()) {
+            const content =
+              req.method === "HEAD" ? null : await Deno.readFile(filePath);
+            return new Response(content, {
+              headers: {
+                "content-type": getStaticContentType(cleanPath),
+                "content-length": String(stat.size),
+                "cache-control": getStaticCacheControl(cleanPath),
+              },
+            });
+          }
+        }
+      } catch (e) {
+        // Fallback to Dinou handler
       }
-    } catch (e) {
-      // Fallback to Dinou handler
     }
   }
```

#### `dinou/cloudflare/build.js` & `dinou/adapters/cloudflare.js`
```diff
--- a/dinou/cloudflare/build.js
+++ b/dinou/cloudflare/build.js
@@ -103,6 +103,36 @@ if (fs.existsSync(dist2Dir)) {
   const copiedCount = copyRecursive(dist2Dir, dist3Dir);
   console.log(`  📄 Synchronized ${copiedCount} pre-rendered static route(s) to .dinou/dist3`);
 }
+if (fs.existsSync(dist3Dir)) {
+  const assetsIgnorePath = path.join(dist3Dir, ".assetsignore");
+  const requiredIgnores = [
+    "/server",
+    "/manifest.json",
+    "/react-client-manifest.json",
+    "/server-functions-manifest.json",
+  ];
+  let existingIgnore = "";
+  if (fs.existsSync(assetsIgnorePath)) {
+    try {
+      existingIgnore = fs.readFileSync(assetsIgnorePath, "utf8");
+    } catch (e) {}
+  }
+  const existingLines = new Set(
+    existingIgnore
+      .split(/\r?\n/)
+      .map((line) => line.trim())
+      .filter(Boolean)
+  );
+  const missingLines = requiredIgnores.filter((entry) => !existingLines.has(entry));
+  if (missingLines.length > 0) {
+    const prefix = existingIgnore && !existingIgnore.endsWith("\n") ? "\n" : "";
+    fs.writeFileSync(
+      assetsIgnorePath,
+      existingIgnore + prefix + missingLines.join("\n") + "\n",
+      "utf8"
+    );
+  }
+}
...
+import {
+  getStaticContentType,
+  isPublicStaticAssetRequest,
+} from "${dinouDirSlash}/core/static-assets.js";
...
-    const staticExtRegex = /\\.(js|mjs|cjs|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|wasm|map|txt|webmanifest)$/i;
-    const isStaticAsset =
-      staticExtRegex.test(url.pathname) ||
-      url.pathname.startsWith("/assets/") ||
-      url.pathname.startsWith("/_dinou/");
+    const isStaticAsset = isPublicStaticAssetRequest(url.pathname);
 
     if (!isRSCPayload && !isServerFunction && isStaticAsset && env && env.ASSETS && (request.method === "GET" || request.method === "HEAD")) {
       try {
         const assetRes = await env.ASSETS.fetch(request.clone ? request.clone() : request);
         if (assetRes && assetRes.status < 400) {
+          if (
+            url.pathname.toLowerCase().endsWith("/apple-app-site-association") &&
+            !(assetRes.headers.get("content-type") || "").toLowerCase().includes("json")
+          ) {
+            const headers = new Headers(assetRes.headers);
+            headers.set("content-type", getStaticContentType(url.pathname));
+            return new Response(assetRes.body, {
+              status: assetRes.status,
+              statusText: assetRes.statusText,
+              headers,
+            });
+          }
           return assetRes;
         }
       } catch (e) {}
     }
```
*(Identical `isPublicStaticAssetRequest` + `apple-app-site-association` `content-type` handling applied in `dinou/adapters/cloudflare.js`.)*

#### `dinou/core/export-static.js`
```diff
--- a/dinou/core/export-static.js
+++ b/dinou/core/export-static.js
@@ -4,6 +4,7 @@
 
 import fs from "node:fs";
 import path from "node:path";
+import { shouldExportDist3Entry } from "./static-assets.js";
 
 const projectRoot = process.cwd();
 const outDir = path.resolve(projectRoot, "out");
@@ -19,27 +20,31 @@ if (fs.existsSync(outDir)) {
 }
 fs.mkdirSync(outDir, { recursive: true });
 
-function copyRecursive(src, dest) {
+function copyRecursive(src, dest, filterRelPath = null, relPrefix = "") {
   if (!fs.existsSync(src)) return 0;
   let count = 0;
   const entries = fs.readdirSync(src, { withFileTypes: true });
   for (const entry of entries) {
+    const relPosix = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
+    if (filterRelPath && !filterRelPath(relPosix)) {
+      continue;
+    }
     const srcPath = path.join(src, entry.name);
     const destPath = path.join(dest, entry.name);
     if (entry.isDirectory()) {
       fs.mkdirSync(destPath, { recursive: true });
-      count += copyRecursive(srcPath, destPath);
+      count += copyRecursive(srcPath, destPath, filterRelPath, relPosix);
     } else {
       fs.mkdirSync(path.dirname(destPath), { recursive: true });
       fs.copyFileSync(srcPath, destPath);
       count++;
     }
   }
   return count;
 }
 
-// 2. Copy production assets from .dinou/dist3 (JS bundles, CSS, favicons)
+// 2. Copy production assets from .dinou/dist3 (JS bundles, CSS, public/)
 let assetCount = 0;
 if (fs.existsSync(dist3Dir)) {
-  assetCount = copyRecursive(dist3Dir, outDir);
+  assetCount = copyRecursive(dist3Dir, outDir, shouldExportDist3Entry);
   console.log(`  📦 Copied ${assetCount} production asset(s) from .dinou/dist3`);
 } else {
```

---

## 4. `CHANGELOG.md` Entry

```markdown
### Security & Fixed (`public/` Static Assets)
- **Block Public Exposure of Internal `.dinou/dist3/server/*` Bundles & Build Manifests**: Prevented standalone production servers (`node`, `bun`, `deno`), Cloudflare Workers (`env.ASSETS` + `.assetsignore`), and `dinou export` (`out/`) from publicly serving or exporting internal server bundles (`handler.js`, `handler.js.map`, `netlify.js`) and internal bundler/RSC manifests (`manifest.json`, `react-client-manifest.json`, `server-functions-manifest.json`).
- **Safe URL Decoding, Dotfile Protection & Path-Traversal Confinement**: Added `decodeURIComponent` handling (supporting spaces and UTF-8 characters in `public/` filenames), strict directory-containment checks (`resolved.startsWith(rootDir + path.sep)`), and hidden dotfile blocking while preserving RFC 8615 `/.well-known/*` routes.
- **Rollup, Esbuild & Webpack `public/` Copy Parity**: Fixed `rollup.config.js` where `rollup-plugin-copy` (`flatten: true`, `dot: false`) flattened nested subdirectories (`public/images/...`) and skipped `public/.well-known/*` files. Unified recursive static copying exclusively from `public/` across Esbuild, Rollup, and Webpack (removing the legacy pre-v6 `favicons/` directory fallback).
- **Cloudflare Workers Static Routing, Complete MIME Types & Smart `Cache-Control`**: Enabled Edge `env.ASSETS` delivery for `/sitemap.xml`, `/.well-known/*` (including extensionless `apple-app-site-association` served as `application/json; charset=utf-8`), standalone domain verification `.html` files, PDFs, and media; unified MIME types across Node, Bun, and Deno; and reserved `Cache-Control: public, max-age=31536000, immutable` strictly for content-hashed chunks and `/assets/*` while serving unhashed `public/` files with `public, max-age=0, must-revalidate`.
```

---

## 5. Complete Copy-Pasteable Test Suites

### 5.1 Unit Test Suite (`tests/unit/public-static-assets.test.mjs`)

Run with:
```bash
node --conditions=react-server --test tests/unit/public-static-assets.test.mjs
```

```js
// tests/unit/public-static-assets.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const dinouRoot = fs.existsSync(path.join(repoRoot, "dinou/core/static-assets.js"))
  ? path.join(repoRoot, "dinou")
  : repoRoot;
const repoRequire = createRequire(path.join(repoRoot, "package.json"));

const {
  getStaticContentType,
  getStaticCacheControl,
  isImmutableAssetPath,
  isPublicStaticAssetRequest,
  normalizePublicRequestPath,
  resolveConfinedStaticFile,
  shouldExportDist3Entry,
} = await import(pathToFileURL(path.join(dinouRoot, "core/static-assets.js")).href);

test("normalizePublicRequestPath & resolveConfinedStaticFile enforce security, decoding, and internal artifact isolation", () => {
  const blockedUrls = [
    "/",
    "/server/handler.js",
    "/server/handler.js.map",
    "/server/netlify.js",
    "/server/package.json",
    "/_slots/home-hero.rsc",
    "/manifest.json",
    "/react-client-manifest.json",
    "/server-functions-manifest.json",
    "/status-manifest.json",
    "/index.html",
    "/docs/public/index.html",
    "/docs/public/shell.html",
    "/docs/public/metadata.json",
    "/docs/public/layout.metadata.json",
    "/shell.layout.json",
    "/docs/public/page.rsc",
    "/docs/public/rsc.rsc",
    "/docs/public/index._old.html",
    "/%2e%2e/package.json",
    "/images/%2e%2e/%2e%2e/package.json",
    "/%2e%2e%5cpackage.json",
    "/images%5cog.png",
    "/.env",
    "/.env.local",
    "/.git/config",
    "/.DS_Store",
    "/.assetsignore",
    "/.well-known",
    "/.well-known/",
    "/.well-known/.hidden",
    "/%E0%A4%A",
  ];

  for (const urlPath of blockedUrls) {
    assert.equal(
      normalizePublicRequestPath(urlPath),
      null,
      `Expected ${urlPath} to be rejected`
    );
  }

  assert.equal(normalizePublicRequestPath("/robots.txt"), "robots.txt");
  assert.equal(normalizePublicRequestPath("/sitemap.xml"), "sitemap.xml");
  assert.equal(normalizePublicRequestPath("/site.webmanifest"), "site.webmanifest");
  assert.equal(
    normalizePublicRequestPath("/google1a2b3c4d5e6f.html"),
    "google1a2b3c4d5e6f.html"
  );
  assert.equal(
    normalizePublicRequestPath("/.well-known/assetlinks.json"),
    ".well-known/assetlinks.json"
  );
  assert.equal(
    normalizePublicRequestPath("/.well-known/apple-app-site-association"),
    ".well-known/apple-app-site-association"
  );
  assert.equal(
    normalizePublicRequestPath("/docs/brochure%202026.pdf"),
    "docs/brochure 2026.pdf"
  );
  assert.equal(
    normalizePublicRequestPath("/images/og-image.png"),
    "images/og-image.png"
  );

  const baseDir = path.resolve(repoRoot, ".dinou/dist3");
  assert.equal(
    resolveConfinedStaticFile(baseDir, "docs/brochure 2026.pdf"),
    path.join(baseDir, "docs", "brochure 2026.pdf")
  );
  assert.equal(resolveConfinedStaticFile(baseDir, "../package.json"), null);
  assert.equal(resolveConfinedStaticFile(baseDir, "..\\package.json"), null);
});

test("getStaticContentType & getStaticCacheControl return accurate MIME types and cache policies", () => {
  assert.equal(getStaticContentType("sitemap.xml"), "application/xml; charset=utf-8");
  assert.equal(
    getStaticContentType("site.webmanifest"),
    "application/manifest+json; charset=utf-8"
  );
  assert.equal(getStaticContentType("google123.html"), "text/html; charset=utf-8");
  assert.equal(
    getStaticContentType(".well-known/apple-app-site-association"),
    "application/json; charset=utf-8"
  );
  assert.equal(getStaticContentType("docs/brochure 2026.pdf"), "application/pdf");
  assert.equal(getStaticContentType("hero.avif"), "image/avif");
  assert.equal(getStaticContentType("font.woff2"), "font/woff2");
  assert.equal(getStaticContentType("module.wasm"), "application/wasm");
  assert.equal(getStaticContentType("demo.mp4"), "video/mp4");
  assert.equal(getStaticContentType("robots.txt"), "text/plain; charset=utf-8");

  for (const immutable of [
    "assets/hero_8fK2.webp",
    "main-ZGBKXIUF.js",
    "button-5bbf0f56-ZGBKXIUF.js",
    "main-a1b2c3d4e5f6a7b8c9d0.js",
    "chunk-B3f9_kL2.js",
  ]) {
    assert.equal(isImmutableAssetPath(immutable), true, immutable);
    assert.equal(
      getStaticCacheControl(immutable),
      "public, max-age=31536000, immutable"
    );
  }

  for (const unhashed of [
    "robots.txt",
    "sitemap.xml",
    "favicon.ico",
    "site.webmanifest",
    "styles.css",
    "images/og-image.png",
    "android-chrome-192x192.png",
    "service-worker.js",
    "my-analytics.js",
    "google-analytics-v4.js",
  ]) {
    assert.equal(isImmutableAssetPath(unhashed), false, unhashed);
    assert.equal(
      getStaticCacheControl(unhashed),
      "public, max-age=0, must-revalidate"
    );
  }
});

test("Cloudflare Workers adapter serves SEO/.well-known/PDF static assets and blocks /server/*", async () => {
  assert.equal(isPublicStaticAssetRequest("/sitemap.xml"), true);
  assert.equal(isPublicStaticAssetRequest("/.well-known/assetlinks.json"), true);
  assert.equal(
    isPublicStaticAssetRequest("/.well-known/apple-app-site-association"),
    true
  );
  assert.equal(isPublicStaticAssetRequest("/google1a2b3c4d5e6f.html"), true);
  assert.equal(isPublicStaticAssetRequest("/docs/brochure%202026.pdf"), true);

  assert.equal(isPublicStaticAssetRequest("/about"), false);
  assert.equal(isPublicStaticAssetRequest("/about/index.html"), false);
  assert.equal(isPublicStaticAssetRequest("/about/metadata.json"), false);
  assert.equal(isPublicStaticAssetRequest("/server/handler.js"), false);

  const cfAdapterMod = await import(
    pathToFileURL(path.join(dinouRoot, "adapters/cloudflare.js")).href
  );
  const cfWorker = cfAdapterMod.default;

  const assetHits = [];
  const mockEnv = {
    ASSETS: {
      async fetch(req) {
        const u = new URL(req.url);
        assetHits.push(u.pathname);
        if (u.pathname === "/.well-known/apple-app-site-association") {
          return new Response('{"applinks":{}}', {
            status: 200,
            headers: { "content-type": "application/octet-stream" },
          });
        }
        if (u.pathname === "/sitemap.xml") {
          return new Response("<urlset></urlset>", {
            status: 200,
            headers: { "content-type": "application/xml" },
          });
        }
        return new Response("Not Found", { status: 404 });
      },
    },
  };

  const aasaRes = await cfWorker.fetch(
    new Request("https://example.com/.well-known/apple-app-site-association"),
    mockEnv,
    {}
  );
  assert.equal(aasaRes.status, 200);
  assert.equal(aasaRes.headers.get("content-type"), "application/json; charset=utf-8");

  const sitemapRes = await cfWorker.fetch(
    new Request("https://example.com/sitemap.xml"),
    mockEnv,
    {}
  );
  assert.equal(sitemapRes.status, 200);
  assert.ok(assetHits.includes("/sitemap.xml"));

  assetHits.length = 0;
  const leakRes = await cfWorker.fetch(
    new Request("https://example.com/server/handler.js"),
    mockEnv,
    {}
  );
  assert.equal(assetHits.includes("/server/handler.js"), false);
  assert.equal(leakRes.status, 404);
});

test("Esbuild, Rollup & Webpack copy nested public/ subdirectories and .well-known/* identically", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-public-bundlers-"));
  const prevCwd = process.cwd();
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "tmp-public-bundlers", type: "module" }, null, 2)
    );
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src/entry.js"), "export const ok = 1;\n");

    fs.mkdirSync(path.join(tmpDir, "favicons"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "favicons/legacy-only.png"), "legacy-png");

    fs.mkdirSync(path.join(tmpDir, "public/images/nested"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "public/docs"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "public/.well-known"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "public/favicon.ico"), "modern-public-favicon");
    fs.writeFileSync(path.join(tmpDir, "public/images/nested/og-image.png"), "og-bytes");
    fs.writeFileSync(path.join(tmpDir, "public/docs/brochure 2026.pdf"), "pdf-bytes");
    fs.writeFileSync(
      path.join(tmpDir, "public/.well-known/assetlinks.json"),
      '[{"relation":["delegate_permission/common.handle_all_urls"]}]'
    );
    fs.writeFileSync(
      path.join(tmpDir, "public/.well-known/apple-app-site-association"),
      '{"applinks":{"apps":[]}}'
    );
    fs.writeFileSync(path.join(tmpDir, "public/.DS_Store"), "junk");

    function assertStaticOutput(outDir, label) {
      assert.equal(
        fs.readFileSync(path.join(outDir, "favicon.ico"), "utf8"),
        "modern-public-favicon",
        `[${label}] public/favicon.ico must be copied`
      );
      assert.equal(
        fs.existsSync(path.join(outDir, "legacy-only.png")),
        false,
        `[${label}] legacy favicons/ directory must be ignored`
      );
      assert.equal(
        fs.readFileSync(path.join(outDir, "images/nested/og-image.png"), "utf8"),
        "og-bytes",
        `[${label}] nested folders must be preserved`
      );
      assert.equal(
        fs.readFileSync(path.join(outDir, "docs/brochure 2026.pdf"), "utf8"),
        "pdf-bytes",
        `[${label}] spaces in filenames must be preserved`
      );
      assert.ok(fs.existsSync(path.join(outDir, ".well-known/assetlinks.json")));
      assert.ok(
        fs.existsSync(path.join(outDir, ".well-known/apple-app-site-association"))
      );
      assert.equal(fs.existsSync(path.join(outDir, ".DS_Store")), false);
    }

    process.chdir(tmpDir);

    // 1. Esbuild
    const esbuild = repoRequire("esbuild");
    const getConfigEsbuildProd = (
      await import(
        pathToFileURL(
          path.join(dinouRoot, "esbuild/helpers-esbuild/get-config-esbuild-prod.js")
        ).href
      )
    ).default;
    const outEsbuild = path.join(tmpDir, "out-esbuild");
    await esbuild.build(
      getConfigEsbuildProd({
        entryPoints: [path.join(tmpDir, "src/entry.js")],
        outdir: outEsbuild,
        manifest: {},
        serverFiles: new Set(),
        reactCompiler: false,
      })
    );
    assertStaticOutput(outEsbuild, "esbuild");

    // 2. Rollup
    const { rollup } = repoRequire("rollup");
    const getRollupConfig = (
      await import(pathToFileURL(path.join(dinouRoot, "rollup/rollup.config.js")).href)
    ).default;
    const rollupConfigs = await getRollupConfig();
    const rollupClientCfg = Array.isArray(rollupConfigs) ? rollupConfigs[0] : rollupConfigs;
    const copyPlugin = rollupClientCfg.plugins.find(
      (p) => p && p.name === "dinou-copy-static"
    );
    assert.ok(copyPlugin);
    const outRollup = path.join(tmpDir, ".dinou/dist3");
    const bundle = await rollup({
      input: path.join(tmpDir, "src/entry.js"),
      plugins: [copyPlugin],
    });
    await bundle.write({ dir: outRollup, format: "esm" });
    await bundle.close();
    assertStaticOutput(outRollup, "rollup");

    // 3. Webpack
    const webpack = repoRequire("webpack");
    const getWebpackConfig = (
      await import(
        pathToFileURL(path.join(dinouRoot, "webpack/webpack.config.js")).href
      )
    ).default;
    const wpConfigs = await getWebpackConfig();
    const wpClientCfg = Array.isArray(wpConfigs) ? wpConfigs[0] : wpConfigs;
    const copyWpPlugin = wpClientCfg.plugins.find(
      (p) => p && Array.isArray(p.patterns)
    );
    assert.ok(copyWpPlugin);
    const outWebpack = path.join(tmpDir, "out-webpack");
    await new Promise((resolve, reject) => {
      const compiler = webpack(
        {
          mode: "production",
          context: tmpDir,
          entry: path.join(tmpDir, "src/entry.js"),
          output: { path: outWebpack, filename: "entry.js", clean: true },
          plugins: [copyWpPlugin],
        },
        (err, stats) => {
          compiler.close(() => {
            if (err) return reject(err);
            if (stats.hasErrors()) {
              return reject(new Error(stats.toString({ errors: true })));
            }
            resolve();
          });
        }
      );
    });
    assertStaticOutput(outWebpack, "webpack");
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    process.chdir(prevCwd);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {}
  }
});

test("export-static.js excludes .dinou/dist3/server/* and internal manifests from out/", () => {
  const tmpExport = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-export-clean-"));
  try {
    fs.mkdirSync(path.join(tmpExport, ".dinou/dist3/server"), { recursive: true });
    fs.mkdirSync(path.join(tmpExport, ".dinou/dist3/.well-known"), { recursive: true });
    fs.mkdirSync(path.join(tmpExport, ".dinou/dist2/about"), { recursive: true });

    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/server/handler.js"), "SERVER");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/server/handler.js.map"), "MAP");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/manifest.json"), "{}");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/react-client-manifest.json"), "{}");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/server-functions-manifest.json"), "{}");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/.assetsignore"), "/server\n");

    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/main-ZGBKXIUF.js"), "console.log(1)");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/robots.txt"), "User-agent: *");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/.nojekyll"), "");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/.well-known/assetlinks.json"), "[]");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/index.html"), "<html>Home</html>");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/about/index.html"), "<html>About</html>");

    assert.equal(shouldExportDist3Entry("server"), false);
    assert.equal(shouldExportDist3Entry("server/handler.js"), false);
    assert.equal(shouldExportDist3Entry("manifest.json"), false);
    assert.equal(shouldExportDist3Entry("server-functions-manifest.json"), false);

    execFileSync(process.execPath, [path.join(dinouRoot, "core/export-static.js")], {
      cwd: tmpExport,
      stdio: "pipe",
    });

    const outDir = path.join(tmpExport, "out");
    assert.equal(fs.existsSync(path.join(outDir, "server")), false);
    assert.equal(fs.existsSync(path.join(outDir, "manifest.json")), false);
    assert.equal(fs.existsSync(path.join(outDir, "react-client-manifest.json")), false);
    assert.equal(fs.existsSync(path.join(outDir, "server-functions-manifest.json")), false);
    assert.equal(fs.existsSync(path.join(outDir, ".assetsignore")), false);

    assert.ok(fs.existsSync(path.join(outDir, "main-ZGBKXIUF.js")));
    assert.ok(fs.existsSync(path.join(outDir, "robots.txt")));
    assert.ok(fs.existsSync(path.join(outDir, ".nojekyll")));
    assert.ok(fs.existsSync(path.join(outDir, ".well-known/assetlinks.json")));
    assert.ok(fs.existsSync(path.join(outDir, "index.html")));
    assert.ok(fs.existsSync(path.join(outDir, "about/index.html")));
  } finally {
    try {
      fs.rmSync(tmpExport, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {}
  }
});
```

---

### 5.2 Playwright E2E Test Suite (`tests/e2e/public-static-assets.spec.ts`)

This complete Playwright E2E suite boots a real production Dinou fixture containing nested `public/images/og-image.png`, `public/docs/brochure 2026.pdf`, `public/sitemap.xml`, `public/site.webmanifest`, `public/google1a2b3c4d5e6f.html`, `public/.well-known/assetlinks.json`, and `public/.well-known/apple-app-site-association`, and verifies HTTP status codes, MIME headers, `Cache-Control` differentiation (`must-revalidate` vs `immutable`), URL-encoded `%20` resolution, and strict `404` blocking of `/server/handler.js`, `/manifest.json`, and path-traversal attempts.

```ts
// tests/e2e/public-static-assets.spec.ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(url: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for server at ${url}`);
}

test.describe("Dinou public/ Static Assets E2E", () => {
  let appDir = "";
  let serverProc: ChildProcess | null = null;
  let baseUrl = "";

  test.beforeAll(async () => {
    const repoRoot = process.cwd();
    const cliPath = fs.existsSync(path.join(repoRoot, "dinou/cli.js"))
      ? path.join(repoRoot, "dinou/cli.js")
      : path.join(repoRoot, "cli.js");

    appDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-e2e-public-"));

    // Symlink node_modules from repoRoot so the fixture builds cleanly in isolation
    fs.symlinkSync(
      path.join(repoRoot, "node_modules"),
      path.join(appDir, "node_modules"),
      process.platform === "win32" ? "junction" : "dir"
    );

    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "e2e-public-fixture", private: true, type: "module" }, null, 2)
    );

    // Source routes
    fs.mkdirSync(path.join(appDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "src/layout.tsx"),
      `export default function RootLayout({ children }: { children: any }) {
        return (
          <html lang="en">
            <head>
              <title>Public Assets E2E</title>
              <link rel="icon" href="/favicon.ico" />
              <link rel="manifest" href="/site.webmanifest" />
            </head>
            <body>{children}</body>
          </html>
        );
      }\n`
    );
    fs.writeFileSync(
      path.join(appDir, "src/page.tsx"),
      `export default function HomePage() {
        return (
          <main>
            <h1>Public Directory E2E</h1>
            <img id="og-preview" src="/images/og-image.png" alt="OG Preview" />
          </main>
        );
      }\n`
    );

    // Public directory fixtures
    fs.mkdirSync(path.join(appDir, "public/images"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "public/docs"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "public/.well-known"), { recursive: true });

    // Minimal valid 1x1 PNG
    const png1x1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    fs.writeFileSync(path.join(appDir, "public/favicon.ico"), png1x1);
    fs.writeFileSync(path.join(appDir, "public/images/og-image.png"), png1x1);
    fs.writeFileSync(path.join(appDir, "public/docs/brochure 2026.pdf"), "%PDF-1.4\n%EOF\n");
    fs.writeFileSync(path.join(appDir, "public/robots.txt"), "User-agent: *\nAllow: /\n");
    fs.writeFileSync(
      path.join(appDir, "public/sitemap.xml"),
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
    );
    fs.writeFileSync(
      path.join(appDir, "public/site.webmanifest"),
      JSON.stringify({ name: "Dinou E2E", start_url: "/" })
    );
    fs.writeFileSync(
      path.join(appDir, "public/google1a2b3c4d5e6f.html"),
      "google-site-verification: google1a2b3c4d5e6f.html"
    );
    fs.writeFileSync(
      path.join(appDir, "public/.well-known/assetlinks.json"),
      JSON.stringify([{ relation: ["delegate_permission/common.handle_all_urls"] }])
    );
    fs.writeFileSync(
      path.join(appDir, "public/.well-known/apple-app-site-association"),
      JSON.stringify({ applinks: { apps: [], details: [] } })
    );
    fs.writeFileSync(path.join(appDir, "public/.env"), "SHOULD_NEVER_BE_SERVED=1");

    // Build production app
    execFileSync(process.execPath, [cliPath, "build"], {
      cwd: appDir,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });

    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProc = spawn(process.execPath, [cliPath, "start"], {
      cwd: appDir,
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
    });

    await waitForServer(baseUrl);
  });

  test.afterAll(async () => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill("SIGTERM");
    }
    if (appDir) {
      try {
        fs.rmSync(appDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  });

  test("serves nested images, SEO files, .well-known, verification HTML & URL-encoded filenames with exact MIME and Cache-Control", async ({
    request,
    page,
  }) => {
    // 1. Visual image loads in real browser DOM
    await page.goto(baseUrl);
    const naturalWidth = await page
      .locator("#og-preview")
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth);
    expect(naturalWidth).toBe(1);

    // 2. robots.txt & sitemap.xml & site.webmanifest
    const robots = await request.get(`${baseUrl}/robots.txt`);
    expect(robots.status()).toBe(200);
    expect(robots.headers()["content-type"]).toContain("text/plain");
    expect(robots.headers()["cache-control"]).toBe("public, max-age=0, must-revalidate");

    const sitemap = await request.get(`${baseUrl}/sitemap.xml`);
    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()["content-type"]).toContain("application/xml");
    expect(sitemap.headers()["cache-control"]).toBe("public, max-age=0, must-revalidate");

    const manifest = await request.get(`${baseUrl}/site.webmanifest`);
    expect(manifest.status()).toBe(200);
    expect(manifest.headers()["content-type"]).toContain("application/manifest+json");

    // 3. Domain verification .html (allowed while /index.html goes through router)
    const verifyHtml = await request.get(`${baseUrl}/google1a2b3c4d5e6f.html`);
    expect(verifyHtml.status()).toBe(200);
    expect(verifyHtml.headers()["content-type"]).toContain("text/html");
    expect(await verifyHtml.text()).toContain("google-site-verification");

    // 4. .well-known Universal Links & App Links
    const assetLinks = await request.get(`${baseUrl}/.well-known/assetlinks.json`);
    expect(assetLinks.status()).toBe(200);
    expect(assetLinks.headers()["content-type"]).toContain("application/json");

    const aasa = await request.get(`${baseUrl}/.well-known/apple-app-site-association`);
    expect(aasa.status()).toBe(200);
    expect(aasa.headers()["content-type"]).toContain("application/json");

    // 5. URL-encoded space in filename (%20)
    const pdf = await request.get(`${baseUrl}/docs/brochure%202026.pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");

    // 6. Content-hashed client chunk receives immutable Cache-Control
    const dist3Entries = fs.readdirSync(path.join(appDir, ".dinou/dist3"));
    const mainChunk = dist3Entries.find((f) => /^main-[A-Za-z0-9_-]+\.js$/.test(f));
    expect(mainChunk).toBeTruthy();
    const chunkRes = await request.get(`${baseUrl}/${mainChunk}`);
    expect(chunkRes.status()).toBe(200);
    expect(chunkRes.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  test("blocks internal server bundles, build manifests, hidden dotfiles, and /public/ prefix", async ({
    request,
  }) => {
    for (const forbidden of [
      "/server/handler.js",
      "/server/handler.js.map",
      "/server/netlify.js",
      "/manifest.json",
      "/.env",
      "/%2e%2e/package.json",
      "/public/favicon.ico",
    ]) {
      const res = await request.get(`${baseUrl}${forbidden}`);
      expect(res.status(), `Expected ${forbidden} to return 404`).toBe(404);
    }
  });
});
```

