# Upstream Handoff: `public/` Static Assets Parity, Hardening & `.dinou/dist1` Physical Isolation (`dinou@9.4.0`)

## 1. Executive Summary & Root-Cause Analysis

During the `v9.4.0` audit of `/docs/public`, seven interconnected architectural, security, caching, static-export, and multi-bundler/multi-runtime parity issues were identified and resolved across `dinou`:

1. **Root Architectural Mixing of Server Bundles & Internal Manifests Inside `.dinou/dist3` (Fixed via `.dinou/dist1` Physical Isolation)**:
   - **Root Cause**: All three bundlers (`esbuild`, `rollup`, `webpack`) previously emitted pre-bundled server runtime code (`.dinou/dist3/server/handler.js`, `.dinou/dist3/server/netlify.js`, `.map` source maps, `package.json`) and internal chunk asset manifests (`.dinou/dist3/manifest.json` — plus `react-client-manifest.json`, `react-ssr-manifest.json`, and `server-functions-manifest.json` in Webpack) directly into `.dinou/dist3`, the exact same directory used as the public static webroot!
   - **Consequences**:
     1. Static CDNs configured with `publish = ".dinou/dist3"` (such as Netlify) or `dinou export` (`out/`) had internal server bundles and build manifests sitting inside the published static directory.
     2. Users could not place a standard Progressive Web App `public/manifest.json` inside `public/` without colliding with (or being overwritten by) the bundler's internal chunk asset `manifest.json`.
     3. Webpack wrote its RSC manifests to `.dinou/dist3` / `.dinou/public` whereas Esbuild and Rollup wrote theirs to `.dinou/react_client_manifest` and `.dinou/server_functions_manifest`, forcing `isWebpack` branching across `core/` and all runtime builders.
   - **Architectural Fix**:
     - Consolidated **all** production internal build artifacts and manifests directly into **`.dinou/dist1`** (eliminating the legacy `.dinou/react_client_manifest/` and `.dinou/server_functions_manifest/` directories completely):
       - `.dinou/dist1/server/` holds `handler.js`, `netlify.js`, source maps, and `package.json` across Esbuild, Rollup, and Webpack (`netlify.toml` `[functions] directory = ".dinou/dist1/server"`).
       - `.dinou/dist1/manifest.json` holds the bundler's internal chunk asset map across Esbuild, Rollup, and Webpack.
       - `.dinou/dist1/react-client-manifest.json` and `.dinou/dist1/server-functions-manifest.json` hold the RSC Client Reference and Server Functions manifests across Esbuild, Rollup, and Webpack (plus `.dinou/dist1/react-ssr-manifest.json` for Webpack).
       - In development mode when `DINOU_WRITE_TO_DISK=true` (rare; default dev mode is 100% in-memory via `globalThis.__DINOU_RAW_*__`), disk fallback manifests are written to **`.dinou/node-dev/`** so `dinou dev` and `dinou build` never overwrite or pollute each other's artifacts.
     - **Result**: `.dinou/dist3` is now a **100% pure public static webroot** containing exclusively client JS/CSS bundles, `/assets/*`, and copied `public/*` files—and users can freely place `public/manifest.json` in `public/` and serve it at `/manifest.json` with zero collisions!

2. **Removal of Legacy `favicons/` Directory Support**:
   - **Root Cause**: Legacy code in Esbuild, Rollup, Webpack, and `dinou/node/dev.js` still checked or watched a root `favicons/` folder alongside `public/`, creating ambiguity and inconsistent flatten vs. recursive behavior.
   - **Fix**: Removed `favicons/` support completely across all bundlers and the dev server. `public/` is now the sole static directory in Dinou.

3. **Broken Rollup `public/` Copy (`flatten: true` & Missing `public/.well-known/*`)**:
   - **Root Cause**: `dinou/rollup/rollup.config.js` used `rollup-plugin-copy` with `targets: [{ src: "public/**/*", dest: outputDirectory }]` where `flatten` defaults to `true` (destroying all nested subdirectories such as `public/images/og-image.png` into root `og-image.png`!) and `globby` defaults to `dot: false` (silently dropping `public/.well-known/*` and `public/.nojekyll`). Webpack's `CopyWebpackPlugin` also lacked `globOptions: { dot: true }`.
   - **Fix**: Created `dinou/core/copy-static-dirs.js` (`copyStaticDirectoriesToOutdir` using `fs.cpSync` with `recursive: true`, preserving nested directories and `.well-known/*` while filtering `.DS_Store` and `Thumbs.db`), wired it into Esbuild (dev disk mode & prod) and Rollup, and configured `CopyWebpackPlugin` with `globOptions: { dot: true, ignore: ["**/.DS_Store", "**/Thumbs.db"] }`.

4. **Incomplete Cloudflare Workers Static Asset Routing & `.dinou/dist3` Pollution (`env.ASSETS`)**:
   - **Root Cause**:
     1. `dinou/cloudflare/build.js` previously copied `.dinou/dist2` directly into the root of `.dinou/dist3`, polluting `.dinou/dist3` with internal SSG/ISR/PPR/Slot cache files and creating root naming collisions with user files in `public/` (e.g., `public/metadata.json` or `public/slots/*`).
     2. `dinou/cloudflare/build.js` and `dinou/adapters/cloudflare.js` matched static assets using a narrow 14-extension regex (`/\.([a-z0-9]+)$/i`), causing requests for `/.well-known/apple-app-site-association` (extensionless), `/.well-known/assetlinks.json`, `/sitemap.xml`, `/site.webmanifest`, `/google12345.html`, `/brochure.pdf`, `/video.mp4`, `/font.ttf`, `/hero.avif`, or `/module.wasm` to bypass `env.ASSETS` and 404 inside RSC route resolution.
   - **Fix**:
     1. `dinou/cloudflare/build.js` now leaves `.dinou/dist3` **100% untouched** and assembles a dedicated `.dinou/cloudflare/assets/` directory (`[assets] directory = ".dinou/cloudflare/assets"` in `wrangler.toml`): public static files from `.dinou/dist3` sit at `.dinou/cloudflare/assets/*`, while internal `.dinou/dist2` SSG/ISR/PPR/Slot cache files are isolated under `.dinou/cloudflare/assets/__dinou_dist2/*`.
     2. External HTTP requests targeting `/__dinou_dist2/*` (including URL-encoded variants) are rejected with `404` at the Worker edge (`isReservedCloudflareDist2RequestPath`), while internal readers (`handler.js`, `ppr-runtime.js`, `cache-slot.js`, `cache-revalidate.js`) fetch pre-rendered cache artifacts via `fetchCloudflareDist2Asset(assets, key, baseUrl)` (including automatic Cloudflare `index.html` canonicalization handling).
     3. Centralized `isPublicStaticAssetRequest(pathname)` and `getStaticContentType(pathname)` in universal `dinou/core/static-assets.js` (zero `node:fs` dependency; safe in Node, Bun, Deno, and Cloudflare `workerd`), including automatic `application/json; charset=utf-8` normalization for extensionless `/.well-known/apple-app-site-association`.

5. **Aggressive `immutable` Caching on Unhashed `public/*` Files**:
   - **Root Cause**: Production servers (`node/build.js`, `bun/build.js`, `deno/build.js`) previously stamped `Cache-Control: public, max-age=31536000, immutable` on *every* file in `.dinou/dist3`, pinning mutable unhashed files like `/robots.txt`, `/sitemap.xml`, `/manifest.json`, `/favicon.ico`, and `/styles.css` in browser/CDN caches for 1 year.
   - **Fix**: `getStaticCacheControl(relPosixPath)` in `dinou/core/static-assets.js` reserves `public, max-age=31536000, immutable` strictly for `/assets/*` and content-hashed bundler chunks (`main-<hash>.js`), returning `public, max-age=0, must-revalidate` for all unhashed `public/*` files and unhashed stylesheets.

6. **URL Percent-Decoding, Path Traversal & Hidden Dotfile Hardening**:
   - **Root Cause**: Runtime servers resolved raw `url.pathname` without `decodeURIComponent` (breaking filenames with spaces like `/docs/brochure%202026.pdf`), lacked uniform `.` / `..` / backslash / null-byte / hidden-dotfile (`/.env`, `/.git/*`) filtering while needing to allow RFC 8615 `/.well-known/*`, and needed defense-in-depth containment (`resolveConfinedStaticFile`) plus internal SSG/ISR/PPR artifact blocking (`index.html`, `shell.html`, `metadata.json`, `*.rsc`, `slots/*`, `status-manifest.json`).
   - **Fix**: Implemented `normalizePublicRequestPath`, `isInternalDinouAssetPath`, `resolveConfinedStaticFile`, and `shouldExportDist3Entry` in `dinou/core/static-assets.js` and applied them across `node/dev.js`, `node/build.js`, `bun/build.js`, `deno/build.js`, `cloudflare/build.js`, `adapters/cloudflare.js`, and `core/export-static.js`.

7. **Standalone Static Export (`dinou export-static`) `.dinou/dist2` Leakage & Broken Client-Side RSC Hydration/Navigation**:
   - **Root Cause**:
     1. Step 3 of `dinou/core/export-static.js` called `copyRecursive(dist2Dir, outDir)` **unfiltered**, dumping every internal `.dinou/dist2` engine file (`metadata.json`, `layout.metadata.json`, `shell.html`, `shell.layout.json`, `shell.page.json`, `shell.rsc`, `rsc.rsc`, `slots/*`, `status-manifest.json`, `*._old.*`) into `out/`.
     2. Even worse, `dinou/core/client.jsx` and `dinou/core/client-webpack.jsx` always fetched server-only virtual endpoints (`/____rsc_page_static____/...`, `/____rsc_page____/...`, `/____rsc_layout_static____/...`, `/____rsc_layout____/...`) during initial hydration and `<Link>` navigation. On pure static hosts (`Surge.sh`, `GitHub Pages`, `Cloudflare Pages` static, `S3`, `Nginx`), no Dinou server exists to answer `/____rsc_*`, so the exported `page.rsc` and `layout.rsc` files sat unused in `out/` while initial hydration and `<Link>` SPA navigation failed with `404` / `Application Error`!
   - **Fix**:
     1. Added `shouldExportDist2File(relPosixPath)` and `injectStaticExportFlag(html)` in `dinou/core/static-assets.js` and wired them into `dinou/core/export-static.js` so Step 3 strictly allowlists `index.html` (injecting `<script>window.__DINOU_STATIC_EXPORT__=true;</script>` before `</head>` without mutating `.dinou/dist2`), `page.rsc`, and `layout.rsc`, creating zero empty `slots/` folders and zero internal metadata JSON files in `out/`.
     2. Updated `dinou/core/client.jsx` and `dinou/core/client-webpack.jsx` so when `window.__DINOU_STATIC_EXPORT__` is `true`, `getPagePayload` and `getLayoutPayload` fetch `/<route>/page.rsc` (or `/page.rsc` at `/`) and `/<layout>/layout.rsc` (or `/layout.rsc` at `/`) directly with cache-busting `?____build_id____=<id>`, gracefully falling back to `window.location.replace(url)` if a target path has no `.rsc` (or hits an HTML SPA fallback), and skipping server-only `POST /____rsc_payload_error____` calls.
     3. Passed `DINOU_BUILD_TOOL=rollup` and `DINOU_BUILD_TOOL=webpack` to `export-static.js` in `dinou/cli.js` (`export-static:rollup` and `export-static:webpack`).

---

## 2. Updated `.dinou/` Directory Topology

```text
.dinou/
├── dist1/                              # ALL production internal build & server artifacts (NEVER served publicly)
│   ├── manifest.json                   # Bundler chunk asset map ({"main.js": "main-<hash>.js", ...})
│   ├── react-client-manifest.json      # RSC client reference manifest (Esbuild, Rollup & Webpack)
│   ├── server-functions-manifest.json  # Server Functions manifest (Esbuild, Rollup & Webpack)
│   ├── react-ssr-manifest.json         # Webpack SSR module loading manifest (Webpack builds only)
│   └── server/                         # Pre-bundled server entrypoints (Node / Netlify Functions v2)
│       ├── handler.js
│       ├── handler.js.map
│       ├── netlify.js
│       ├── netlify.js.map
│       └── package.json
├── dist2/                              # Pre-rendered SSG / ISR / PPR HTML, RSC & slot cache store
├── dist3/                              # 100% PURE public static webroot (client chunks, /assets/*, public/*)
├── cloudflare/                         # Cloudflare Workers build output (when running dinou build:cloudflare)
│   ├── worker.js                       # Compiled workerd Dual-Bundle orchestrator
│   └── assets/                         # Wrangler [assets] directory = ".dinou/cloudflare/assets"
│       ├── <public & client chunks>    # Clean copy of .dinou/dist3 (served publicly via env.ASSETS)
│       └── __dinou_dist2/              # Isolated copy of .dinou/dist2 (internal Worker-only cache; 404 externally)
└── node-dev/                           # Dev-only workspace & optional DINOU_WRITE_TO_DISK=true manifests
```

*(Note: Legacy `.dinou/react_client_manifest/` and `.dinou/server_functions_manifest/` directories have been completely eliminated.)*

---

## 3. Files Added & Modified in `dinou/`

### New Files (2)
1. `dinou/core/static-assets.js`
2. `dinou/core/copy-static-dirs.js`

### Modified Files (34)
3. `dinou/esbuild/build.js`
4. `dinou/esbuild/dev.js`
5. `dinou/esbuild/helpers-esbuild/get-config-esbuild.js`
6. `dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js`
7. `dinou/esbuild/plugins-esbuild/manifest-generator-plugin.js`
8. `dinou/esbuild/plugins-esbuild/react-client-manifest-plugin.js`
9. `dinou/esbuild/plugins-esbuild/server-functions-plugin.js`
10. `dinou/rollup/rollup.config.js`
11. `dinou/rollup/rollup-plugins/manifest-generator-plugin.js`
12. `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js`
13. `dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js`
14. `dinou/webpack/webpack.config.js`
15. `dinou/webpack/plugins/manifest-generator-plugin.js`
16. `dinou/webpack/plugins/server-functions-plugin.js`
17. `dinou/webpack/plugins/webpack-memory-plugin.js`
18. `dinou/core/get-asset-from-manifest.js`
19. `dinou/core/manifest-provider.js`
20. `dinou/core/generate-static-rsc.js`
21. `dinou/core/dinou-paths.js`
22. `dinou/core/export-static.js`
23. `dinou/core/client.jsx`
24. `dinou/core/client-webpack.jsx`
25. `dinou/core/handler.js`
26. `dinou/core/ppr-runtime.js`
27. `dinou/core/cache-slot.js`
28. `dinou/core/cache-revalidate.js`
29. `dinou/cli.js`
30. `dinou/node/dev.js`
31. `dinou/node/build.js`
32. `dinou/node/bundle-dual-engine.js`
33. `dinou/bun/build.js`
34. `dinou/deno/build.js`
35. `dinou/cloudflare/build.js`
36. `dinou/adapters/cloudflare.js`

---

## 4. Complete Source Code & Diffs

### 4.1. NEW FILE: `dinou/core/static-assets.js`

```javascript
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

// Reserved internal subdirectory inside `.dinou/cloudflare/assets/` where
// `dinou build:cloudflare` places pre-rendered `.dinou/dist2` SSG/ISR/PPR/Slot
// cache files so `.dinou/dist3` stays 100% pure and never collides with `public/`.
export const CLOUDFLARE_DIST2_NAMESPACE = "__dinou_dist2";

const DIST2_EXPORTABLE_BASENAMES = new Set([
  "index.html",
  "page.rsc",
  "layout.rsc",
]);

export const STATIC_EXPORT_SCRIPT =
  "<script>window.__DINOU_STATIC_EXPORT__=true;</script>";

/**
 * Resolves the HTTP Content-Type header for a static file path or URL pathname.
 * Handles extensionless RFC / Universal Links files such as `apple-app-site-association`.
 */
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

/**
 * Returns true when an incoming URL pathname targets the reserved internal
 * `/__dinou_dist2/*` namespace inside Cloudflare's `env.ASSETS` directory.
 */
export function isReservedCloudflareDist2RequestPath(pathname) {
  if (!pathname || typeof pathname !== "string") return false;
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {}
  const firstSeg =
    decoded.replace(/\\/g, "/").replace(/^\/+/, "").split("/")[0] || "";
  return firstSeg.toLowerCase() === CLOUDFLARE_DIST2_NAMESPACE;
}

/**
 * Returns true when a normalized POSIX path refers to an OS metadata file or
 * Dinou's reserved internal `/__dinou_dist2/*` Cloudflare asset namespace,
 * ensuring it is never served publicly.
 */
export function isInternalDinouAssetPath(relPosixPath) {
  if (!relPosixPath || typeof relPosixPath !== "string") return true;
  const clean = relPosixPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean) return true;

  const segments = clean.split("/").filter(Boolean);
  if (segments.length === 0) return true;

  if (segments[0].toLowerCase() === CLOUDFLARE_DIST2_NAMESPACE) {
    return true;
  }

  const baseLower = segments[segments.length - 1].toLowerCase();
  if (baseLower === ".ds_store" || baseLower === "thumbs.db") {
    return true;
  }

  return false;
}

/**
 * Safely URL-decodes and validates an incoming HTTP URL `pathname` for public static
 * asset lookup. Rejects malformed `%` encodings, null bytes, backslash separators,
 * `.` / `..` traversal segments, hidden dotfiles (except RFC 8615 `/.well-known/*`),
 * and internal Dinou engine artifacts.
 *
 * @returns {string | null} Clean relative POSIX path (without leading `/`), or `null` if disallowed.
 */
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

  // Block hidden dotfiles & dot-directories except RFC 8615 /.well-known/<file>
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

/**
 * Resolves a validated relative POSIX path inside `baseDir` and verifies strict
 * filesystem containment so no path can escape `baseDir`.
 *
 * @returns {string | null} Absolute filesystem path inside `baseDir`, or `null` if unsafe.
 */
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

/**
 * Determines whether a relative asset path in `.dinou/dist3` is content-hashed
 * (safe for 1-year `immutable` caching) vs unhashed (`public/` files, `styles.css`).
 */
export function isImmutableAssetPath(relPosixPath) {
  if (!relPosixPath || typeof relPosixPath !== "string") return false;
  const clean = relPosixPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean) return false;
  return clean.startsWith("assets/") || IMMUTABLE_CHUNK_REGEX.test(clean);
}

/**
 * Returns the production `Cache-Control` header value for a static asset.
 * Content-hashed bundler chunks and `/assets/*` receive `immutable`, whereas
 * unhashed `public/` files (`/robots.txt`, `/sitemap.xml`, `/favicon.ico`, etc.)
 * and unhashed stylesheets receive `public, max-age=0, must-revalidate`.
 */
export function getStaticCacheControl(relPosixPath) {
  return isImmutableAssetPath(relPosixPath)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, must-revalidate";
}

/**
 * Determines whether an incoming Edge/Cloudflare Worker request URL `pathname`
 * should be served from the static `env.ASSETS` binding before invoking Dinou's
 * RSC/SSR `handleRequest` pipeline.
 */
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

/**
 * Filter predicate when copying public static assets from `.dinou/dist3` into
 * `out/` (`dinou export-static`) or `.dinou/cloudflare/assets/` (`dinou build:cloudflare`).
 * Excludes OS metadata junk and the reserved `__dinou_dist2` namespace while
 * preserving all `public/` files (including `.well-known/*` and `.nojekyll`) and client chunks.
 */
export function shouldExportDist3Entry(relPosixPath) {
  if (!relPosixPath || typeof relPosixPath !== "string") return false;
  const clean = relPosixPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean) return false;

  const segments = clean.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  if (segments[0].toLowerCase() === CLOUDFLARE_DIST2_NAMESPACE) {
    return false;
  }

  const baseLower = segments[segments.length - 1].toLowerCase();
  if (baseLower === ".ds_store" || baseLower === "thumbs.db") {
    return false;
  }

  return true;
}

/**
 * Filter predicate for `dinou export-static` (`export-static.js`) when copying
 * pre-rendered SSG files from `.dinou/dist2` into `out/`.
 * Strictly allowlists `index.html`, `page.rsc`, and `layout.rsc` (outside the
 * internal `slots/` cache namespace) so internal ISR/PPR/Slot metadata JSONs,
 * `shell.*` templates, `rsc.rsc`, `status-manifest.json`, and `._old.` files
 * are never published to static hosts.
 */
export function shouldExportDist2File(relPosixPath) {
  if (!relPosixPath || typeof relPosixPath !== "string") return false;
  const clean = relPosixPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean) return false;

  const segments = clean.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  if (segments[0].toLowerCase() === "slots") {
    return false;
  }

  const baseLower = segments[segments.length - 1].toLowerCase();
  return DIST2_EXPORTABLE_BASENAMES.has(baseLower);
}

/**
 * Reads an internal `.dinou/dist2` SSG/ISR/PPR/Slot artifact from Cloudflare's
 * `env.ASSETS` binding under the isolated `/__dinou_dist2/<key>` namespace.
 * Handles Cloudflare Static Assets HTML canonicalization for `index.html` keys.
 */
export async function fetchCloudflareDist2Asset(
  assetsBinding,
  key,
  baseUrl = "http://localhost"
) {
  if (!assetsBinding || typeof assetsBinding.fetch !== "function" || !key) {
    return null;
  }
  const cleanKey = String(key).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleanKey) return null;

  const namespacedKey = `${CLOUDFLARE_DIST2_NAMESPACE}/${cleanKey}`;
  const lowerKey = cleanKey.toLowerCase();
  const isIndexHtml =
    lowerKey === "index.html" || lowerKey.endsWith("/index.html");

  if (!isIndexHtml) {
    const res = await assetsBinding.fetch(
      new Request(new URL(`/${namespacedKey}`, baseUrl))
    );
    return res && res.status === 200 ? res : null;
  }

  const dirRel = cleanKey.slice(0, -"index.html".length).replace(/\/+$/, "");
  const dirNamespace = dirRel
    ? `/${CLOUDFLARE_DIST2_NAMESPACE}/${dirRel}`
    : `/${CLOUDFLARE_DIST2_NAMESPACE}`;
  const candidates = [`${dirNamespace}/`, `/${namespacedKey}`, dirNamespace];

  for (const candidatePath of candidates) {
    const res = await assetsBinding.fetch(
      new Request(new URL(candidatePath, baseUrl))
    );
    if (res && res.status === 200) {
      return res;
    }
  }
  return null;
}

/**
 * Injects `<script>window.__DINOU_STATIC_EXPORT__=true;</script>` into exported
 * `index.html` documents so Dinou's client router resolves `/<route>/page.rsc`
 * and `/<layout>/layout.rsc` directly from static hosting instead of hitting
 * server-only `/____rsc_*` endpoints.
 */
export function injectStaticExportFlag(html) {
  if (typeof html !== "string" || html.includes("__DINOU_STATIC_EXPORT__")) {
    return html;
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, (match) => `${STATIC_EXPORT_SCRIPT}${match}`);
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, (match) => `${STATIC_EXPORT_SCRIPT}${match}`);
  }
  return `${STATIC_EXPORT_SCRIPT}${html}`;
}
```

---

### 4.2. NEW FILE: `dinou/core/copy-static-dirs.js`

```javascript
import fs from "node:fs";
import path from "node:path";

const IGNORED_OS_BASENAMES = new Set([".ds_store", "thumbs.db"]);

function shouldCopyStaticEntry(srcPath) {
  const baseLower = path.basename(srcPath).toLowerCase();
  return !IGNORED_OS_BASENAMES.has(baseLower);
}

/**
 * Recursively copies the project's `public/` directory into `outdir`, preserving
 * nested subdirectories and dotfiles (such as `public/.well-known/*` or `public/.nojekyll`).
 */
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

---

### 4.3. Esbuild Changes (`build.js`, `dev.js`, `get-config-esbuild.js`, `get-config-esbuild-prod.js`, `manifest-generator-plugin.js`, `react-client-manifest-plugin.js`, `server-functions-plugin.js`)

```diff
--- a/dinou/esbuild/build.js
+++ b/dinou/esbuild/build.js
@@ -18,8 +18,7 @@
 
 const outdir = ".dinou/dist3";
 await fs.rm(outdir, { recursive: true, force: true });
-await fs.rm(".dinou/react_client_manifest", { recursive: true, force: true });
-await fs.rm(".dinou/server_functions_manifest", { recursive: true, force: true });
+await fs.rm(".dinou/dist1", { recursive: true, force: true });
 
@@ -129,7 +128,7 @@
     target: "node20",
     format: "esm",
     conditions: ["react-server", "node", "import"],
-    outdir: ".dinou/dist3/server",
+    outdir: ".dinou/dist1/server",
     external: [
       "express",
       "chokidar",
@@ -146,7 +145,7 @@
     sourcemap: true,
   });
   await fs.writeFile(
-    path.resolve(process.cwd(), ".dinou/dist3/server/package.json"),
+    path.resolve(process.cwd(), ".dinou/dist1/server/package.json"),
     JSON.stringify({ type: "module" }, null, 2)
   );
```

```diff
--- a/dinou/esbuild/dev.js
+++ b/dinou/esbuild/dev.js
@@ -34,8 +34,13 @@
     delete globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__;
   }
   await fs.rm(outdir, { recursive: true, force: true });
-  await fs.rm(".dinou/react_client_manifest", { recursive: true, force: true });
-  await fs.rm(".dinou/server_functions_manifest", { recursive: true, force: true });
+  for (const stale of [
+    "react-client-manifest.json",
+    "server-functions-manifest.json",
+    "manifest.json",
+  ]) {
+    await fs.rm(path.join(".dinou/node-dev", stale), { force: true });
+  }
```

```diff
--- a/dinou/esbuild/helpers-esbuild/get-config-esbuild.js
+++ b/dinou/esbuild/helpers-esbuild/get-config-esbuild.js
@@ -1,4 +1,3 @@
-import copy from "#esbuild-plugin-copy";
 import reactClientManifestPlugin from "../plugins-esbuild/react-client-manifest-plugin.js";
 import serverFunctionsPlugin from "../plugins-esbuild/server-functions-plugin.js";
 import cssProcessorPlugin from "../plugins-esbuild/css-processor-plugin.js";
@@ -8,6 +7,7 @@
 import skipMissingEntryPointsPlugin from "../plugins-esbuild/skip-missing-entry-points-plugin.js";
 import { swcRedirectPlugin } from "./swc-disk-cache.js";
 import { esbuildContextualDinouPlugin } from "../../core/resolve-contextual-dinou.js";
+import { copyStaticDirectoriesToOutdir } from "../../core/copy-static-dirs.js";
 import fs from "node:fs";
 import path from "node:path";
 
@@ -49,7 +49,7 @@
     serverFunctionsPlugin({ serverFiles }),
     reactClientManifestPlugin({
       manifest,
-      manifestPath: ".dinou/react_client_manifest/react-client-manifest.json",
+      manifestPath: ".dinou/node-dev/react-client-manifest.json",
       onManifestUpdated,
     }),
     assetsPlugin({ changedIds }),
@@ -71,38 +71,20 @@
       : []),
   ];
 
   const shouldWriteToDisk = process.env.DINOU_WRITE_TO_DISK === "true";
-  const hasFavicons = fs.existsSync("favicons");
-  const hasPublic = fs.existsSync("public");
-  if ((hasFavicons || hasPublic) && shouldWriteToDisk) {
-    const copyPlugin = copy({
-      resolveFrom: "cwd",
-      assets: [
-        ...(hasFavicons
-          ? [
-              {
-                from: ["./favicons/**/*"],
-                to: [outdir],
-              },
-            ]
-          : []),
-        ...(hasPublic
-          ? [
-              {
-                from: ["./public/**/*"],
-                to: [outdir],
-              },
-            ]
-          : []),
-      ],
-      watch: false,
-    });
+  if (fs.existsSync("public") && shouldWriteToDisk) {
     let staticCopied = false;
     plugins = [
       {
         name: "copy-static-files-once",
         setup(build) {
-          const subBuild = {
-            ...build,
-            onEnd(cb) {
-              build.onEnd(async (res) => {
-                if (staticCopied) return;
-                staticCopied = true;
-                await cb(res);
-              });
-            },
-          };
-          copyPlugin.setup(subBuild);
+          build.onEnd(() => {
+            if (staticCopied) return;
+            staticCopied = true;
+            copyStaticDirectoriesToOutdir(process.cwd(), outdir);
+          });
         },
       },
       ...plugins,
     ];
   }
```

```diff
--- a/dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js
+++ b/dinou/esbuild/helpers-esbuild/get-config-esbuild-prod.js
@@ -1,4 +1,3 @@
-import copy from "#esbuild-plugin-copy";
 import { TsconfigPathsPlugin } from "#esbuild-plugins/tsconfig-paths";
 import reactClientManifestPlugin from "../plugins-esbuild/react-client-manifest-plugin.js";
 import serverFunctionsPlugin from "../plugins-esbuild/server-functions-plugin.js";
@@ -8,6 +7,7 @@
 import writePlugin from "../plugins-esbuild/write-plugin.js";
 import babelReactCompilerPlugin from "../plugins-esbuild/babel-react-compiler-plugin.js";
 import { esbuildContextualDinouPlugin } from "../../core/resolve-contextual-dinou.js";
+import { copyStaticDirectoriesToOutdir } from "../../core/copy-static-dirs.js";
 import { existsSync } from "node:fs";
 
 export default function getConfigEsbuildProd({
@@ -25,7 +25,7 @@
     cssProcessorPlugin({ outdir }),
     reactClientManifestPlugin({
       manifest,
-      manifestPath: `.dinou/react_client_manifest/react-client-manifest.json`,
+      manifestPath: `.dinou/dist1/react-client-manifest.json`,
     }),
     assetsPlugin(),
     manifestGeneratorPlugin(manifestData),
@@ -33,31 +33,19 @@
     writePlugin(),
   ].filter(Boolean);
 
-  const hasFavicons = existsSync("favicons");
-  const hasPublic = existsSync("public");
-  if (hasFavicons || hasPublic) {
+  if (existsSync("public")) {
     plugins = [
       ...plugins,
-      copy({
-        resolveFrom: "cwd",
-        assets: [
-          ...(hasFavicons
-            ? [
-                {
-                  from: ["./favicons/**/*"],
-                  to: [outdir],
-                },
-              ]
-            : []),
-          ...(hasPublic
-            ? [
-                {
-                  from: ["./public/**/*"],
-                  to: [outdir],
-                },
-              ]
-            : []),
-        ],
-      }),
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

```diff
--- a/dinou/esbuild/plugins-esbuild/manifest-generator-plugin.js
+++ b/dinou/esbuild/plugins-esbuild/manifest-generator-plugin.js
@@ -7,8 +7,6 @@
   return {
     name: "manifest-generator",
     setup(build) {
-      const outdir = build.initialOptions.outdir || ".";
-
       build.onEnd(async (result) => {
         const meta = result.metafile;
         if (!meta) {
@@ -41,12 +39,12 @@
         }
 
         try {
-          const outDir = path.resolve(process.cwd(), outdir);
+          const dist1Dir = path.resolve(process.cwd(), ".dinou/dist1");
 
-          await fs.mkdir(outDir, { recursive: true });
+          await fs.mkdir(dist1Dir, { recursive: true });
 
           await fs.writeFile(
-            path.join(outDir, "manifest.json"),
+            path.join(dist1Dir, "manifest.json"),
             JSON.stringify(manifestData, null, 2),
             "utf8"
           );
```

```diff
--- a/dinou/esbuild/plugins-esbuild/react-client-manifest-plugin.js
+++ b/dinou/esbuild/plugins-esbuild/react-client-manifest-plugin.js
@@ -7,7 +7,7 @@
 import { useClientRegex } from "../../constants.js";
 
 export default function reactClientManifestPlugin({
-  manifestPath = ".dinou/react_client_manifest/react-client-manifest.json",
+  manifestPath = null,
   manifest = {},
   onManifestUpdated,
 } = {}) {
@@ -82,9 +82,15 @@
           }
 
           if (shouldWriteToDisk && manifestChanged) {
-            await fs.mkdir(path.dirname(manifestPath), { recursive: true });
+            const targetPath =
+              manifestPath ||
+              path.join(
+                isDev ? ".dinou/node-dev" : ".dinou/dist1",
+                "react-client-manifest.json"
+              );
+            await fs.mkdir(path.dirname(targetPath), { recursive: true });
             await fs.writeFile(
-              manifestPath,
+              targetPath,
               serialized,
               "utf8"
             );
```

```diff
--- a/dinou/esbuild/plugins-esbuild/server-functions-plugin.js
+++ b/dinou/esbuild/plugins-esbuild/server-functions-plugin.js
@@ -236,9 +236,9 @@
           if (shouldWriteToDisk) {
-            // Write the server functions manifest JSON file
+            // Write the server functions manifest JSON file outside public static webroot
             const manifestPath = path.join(
-              ".dinou/server_functions_manifest",
+              isDev ? ".dinou/node-dev" : ".dinou/dist1",
               "server-functions-manifest.json"
             );
             await fs.mkdir(path.dirname(manifestPath), { recursive: true });
             await fs.writeFile(manifestPath, JSON.stringify(manifestObj, null, 2));
           }
```

---

### 4.4. Rollup Changes (`rollup.config.js`, `manifest-generator-plugin.js`, `rollup-plugin-react-client-manifest.js`, `rollup-plugin-server-functions.js`)

```diff
--- a/dinou/rollup/rollup.config.js
+++ b/dinou/rollup/rollup.config.js
@@ -6,7 +6,7 @@
 import babelModule from "#rollup/plugin-babel";
 import resolveModule from "#rollup/plugin-node-resolve";
 import commonjs from "#rollup/plugin-commonjs";
-import copy from "#rollup-plugin-copy";
+import { copyStaticDirectoriesToOutdir } from "../core/copy-static-dirs.js";
 import reactClientManifest from "./rollup-plugins/rollup-plugin-react-client-manifest.js";
 import createScopedName from "../core/createScopedName.js";
 import replace from "#rollup/plugin-replace";
@@ -147,9 +147,14 @@
         del({
           targets: [
             `${outputDirectory}/*`,
-            ".dinou/react_client_manifest/*",
-            ".dinou/server_functions_manifest/*",
+            ...(isDevelopment
+              ? [
+                  ".dinou/node-dev/react-client-manifest.json",
+                  ".dinou/node-dev/server-functions-manifest.json",
+                  ".dinou/node-dev/manifest.json",
+                ]
+              : [".dinou/dist1/*"]),
           ],
@@ -201,18 +206,16 @@
           path: path.resolve(__dirname, "postcss.config.js"),
         },
       }),
-      shouldWriteToDisk &&
-        copy({
-          targets: [
-            { src: "favicons/*", dest: outputDirectory },
-            { src: "public/**/*", dest: outputDirectory },
-          ],
-          copyOnce: isDevelopment,
-        }),
+      shouldWriteToDisk && {
+        name: "dinou-copy-static",
+        writeBundle() {
+          copyStaticDirectoriesToOutdir(process.cwd(), outputDirectory);
+        },
+      },
       reactClientManifest({
         manifestPath: path.join(
-          ".dinou/react_client_manifest",
+          isDevelopment ? ".dinou/node-dev" : ".dinou/dist1",
           "react-client-manifest.json",
         ),
@@ -270,7 +273,7 @@
       netlify: path.resolve(__dirname, "../adapters/netlify.js"),
     },
     output: {
-      dir: path.resolve(outputDirectory, "server"),
+      dir: path.resolve(process.cwd(), ".dinou/dist1/server"),
       format: "esm",
       entryFileNames: "[name].js",
       chunkFileNames: "[name]-[hash].js",
@@ -304,8 +307,10 @@
       {
         name: "post-build-server",
         closeBundle() {
+          const serverDir = path.resolve(process.cwd(), ".dinou/dist1/server");
+          fs.mkdirSync(serverDir, { recursive: true });
           fs.writeFileSync(
-            path.resolve(process.cwd(), ".dinou/dist3/server/package.json"),
+            path.join(serverDir, "package.json"),
             JSON.stringify({ type: "module" }, null, 2)
           );
           execSync(`"${process.execPath}" --conditions=react-server "${path.resolve(__dirname, "../core/run-ssg.js")}"`, {
```

```javascript
// dinou/rollup/rollup-plugins/manifest-generator-plugin.js
import fs from "node:fs/promises";
import path from "node:path";

const manifestData = {};

function manifestGeneratorPlugin() {
  return {
    name: "manifest-generator",
    async generateBundle(options, bundle) {
      for (const key of Object.keys(manifestData)) {
        delete manifestData[key];
      }

      for (const [fileName, info] of Object.entries(bundle)) {
        if (info.type === "chunk" && info.name) {
          const cleanName = info.name + ".js";
          manifestData[cleanName] = fileName;
        }
      }

      const dist1Dir = path.resolve(process.cwd(), ".dinou/dist1");
      await fs.mkdir(dist1Dir, { recursive: true });
      await fs.writeFile(
        path.join(dist1Dir, "manifest.json"),
        JSON.stringify(manifestData, null, 2),
        "utf8"
      );
    },
  };
}

manifestGeneratorPlugin.manifestData = manifestData;

export { manifestGeneratorPlugin };
export default manifestGeneratorPlugin;
```

```diff
--- a/dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js
+++ b/dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js
@@ -76,10 +76,7 @@
 
 function reactClientManifestPlugin({
   srcDir = path.resolve("src"),
-  manifestPath = path.join(
-    ".dinou/react_client_manifest",
-    "react-client-manifest.json"
-  ),
+  manifestPath = null,
   assetInclude = regex,
   serverFiles = new Set(),
 } = {}) {
@@ -741,9 +738,15 @@
       const isDev = process.env.NODE_ENV !== "production" || process.env.DINOU_DEV === "true";
       const shouldWriteToDisk = process.env.DINOU_WRITE_TO_DISK === "true" || !isDev;
+      const resolvedManifestPath =
+        manifestPath ||
+        path.join(
+          isDev ? ".dinou/node-dev" : ".dinou/dist1",
+          "react-client-manifest.json"
+        );
 
       let existingManifest = null;
-      if (shouldWriteToDisk && existsSync(manifestPath)) {
+      if (shouldWriteToDisk && existsSync(resolvedManifestPath)) {
         try {
-          existingManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
+          existingManifest = JSON.parse(readFileSync(resolvedManifestPath, "utf8"));
         } catch (e) {}
       }
 
@@ -754,8 +757,8 @@
           for (const k of Object.keys(manifest).sort()) {
             sortedManifest[k] = manifest[k];
           }
-          mkdirSync(dirname(manifestPath), { recursive: true });
-          writeFileSync(manifestPath, JSON.stringify(sortedManifest, null, 2));
+          mkdirSync(dirname(resolvedManifestPath), { recursive: true });
+          writeFileSync(resolvedManifestPath, JSON.stringify(sortedManifest, null, 2));
         }
         manifestUpdatedCallback?.();
       }
```

```diff
--- a/dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js
+++ b/dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js
@@ -174,9 +174,9 @@
       if (shouldWriteToDisk) {
-        // Write the manifest to the root directory
+        // Write the manifest outside public static webroot
         const manifestPath = path.join(
-          ".dinou/server_functions_manifest",
+          isDev ? ".dinou/node-dev" : ".dinou/dist1",
           "server-functions-manifest.json"
         );
         try {
           await fs.mkdir(path.dirname(manifestPath), { recursive: true });
           await fs.writeFile(manifestPath, JSON.stringify(manifestObj, null, 2));
```

---

### 4.5. Webpack Changes (`webpack.config.js`, `manifest-generator-plugin.js`, `server-functions-plugin.js`, `webpack-memory-plugin.js`)

```diff
--- a/dinou/webpack/webpack.config.js
+++ b/dinou/webpack/webpack.config.js
@@ -62,6 +62,8 @@
 
 const outputDirs = [
   path.resolve(projectRoot, ".dinou/public"),
+  path.resolve(projectRoot, ".dinou/node-dev"),
+  path.resolve(projectRoot, ".dinou/dist1"),
   path.resolve(projectRoot, ".dinou/dist3"),
   path.resolve(projectRoot, "out"),
   path.resolve(projectRoot, "dist"),
@@ -95,6 +97,22 @@
   // 🔥 CLEAN HARD
   if (shouldWriteToDisk) {
     cleanDir(outputDir);
+    if (!isDevelopment) {
+      cleanDir(path.resolve(process.cwd(), ".dinou/dist1"));
+    } else {
+      const nodeDevDir = path.resolve(process.cwd(), ".dinou/node-dev");
+      for (const stale of [
+        "react-client-manifest.json",
+        "react-ssr-manifest.json",
+        "server-functions-manifest.json",
+        "manifest.json",
+      ]) {
+        try {
+          fs.rmSync(path.join(nodeDevDir, stale), { force: true });
+        } catch (e) {}
+      }
+    }
   }
   const [cssEntries, , serverFiles] = await getCSSEntries();
@@ -129,7 +147,7 @@
   function runPostBuild() {
     if (clientDone && serverDone && !ssgExecuted) {
       ssgExecuted = true;
-      const serverDir = path.resolve(process.cwd(), ".dinou/dist3/server");
+      const serverDir = path.resolve(process.cwd(), ".dinou/dist1/server");
       fs.mkdirSync(serverDir, { recursive: true });
       fs.writeFileSync(
         path.join(serverDir, "package.json"),
@@ -311,6 +329,68 @@
           ...Array.from(dependencyClientFiles),
         ],
       }),
+      {
+        apply(compiler) {
+          const pluginName = "DinouRelocateRscManifestsPlugin";
+          compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
+            const { Compilation } = compiler.webpack || webpack;
+            compilation.hooks.processAssets.tap(
+              {
+                name: pluginName,
+                stage: Compilation.PROCESS_ASSETS_STAGE_REPORT + 100,
+              },
+              () => {
+                const clientAsset = compilation.getAsset("react-client-manifest.json");
+                if (clientAsset) {
+                  const rawSource = clientAsset.source.source();
+                  const jsonText = Buffer.isBuffer(rawSource)
+                    ? rawSource.toString("utf8")
+                    : String(rawSource);
+                  if (typeof globalThis !== "undefined") {
+                    try {
+                      globalThis.__DINOU_RAW_CLIENT_MANIFEST__ = JSON.parse(jsonText);
+                    } catch (e) {}
+                  }
+                  if (shouldWriteToDisk) {
+                    const manifestDir = path.resolve(
+                      process.cwd(),
+                      isDevelopment ? ".dinou/node-dev" : ".dinou/dist1"
+                    );
+                    fs.mkdirSync(manifestDir, { recursive: true });
+                    fs.writeFileSync(
+                      path.join(manifestDir, "react-client-manifest.json"),
+                      jsonText,
+                      "utf8"
+                    );
+                  }
+                  compilation.deleteAsset("react-client-manifest.json");
+                }
+
+                const ssrAsset = compilation.getAsset("react-ssr-manifest.json");
+                if (ssrAsset) {
+                  if (shouldWriteToDisk) {
+                    const rawSsr = ssrAsset.source.source();
+                    const ssrText = Buffer.isBuffer(rawSsr)
+                      ? rawSsr.toString("utf8")
+                      : String(rawSsr);
+                    const manifestDir = path.resolve(
+                      process.cwd(),
+                      isDevelopment ? ".dinou/node-dev" : ".dinou/dist1"
+                    );
+                    fs.mkdirSync(manifestDir, { recursive: true });
+                    fs.writeFileSync(
+                      path.join(manifestDir, "react-ssr-manifest.json"),
+                      ssrText,
+                      "utf8"
+                    );
+                  }
+                  compilation.deleteAsset("react-ssr-manifest.json");
+                }
+              }
+            );
+          });
+        },
+      },
       isDevelopment && {
         apply(compiler) {
           compiler.hooks.thisCompilation.tap(
@@ -346,16 +426,15 @@
       new CopyWebpackPlugin({
         patterns: [
           {
-            from: "favicons",
-            to: ".",
-            noErrorOnMissing: true,
-          },
-          {
             from: "public",
             to: ".",
             noErrorOnMissing: true,
+            globOptions: {
+              dot: true,
+              ignore: ["**/.DS_Store", "**/Thumbs.db"],
+            },
           },
         ],
       }),
@@ -497,7 +576,7 @@
       netlify: path.resolve(__dirname, "../adapters/netlify.js"),
     },
     output: {
-      path: path.resolve(process.cwd(), outputDirectory, "server"),
+      path: path.resolve(process.cwd(), ".dinou/dist1/server"),
       filename: "[name].js",
       library: {
         type: "module",
```

```javascript
// dinou/webpack/plugins/manifest-generator-plugin.js
import fs from "node:fs";
import path from "node:path";

class ManifestGeneratorPlugin {
  constructor() {
    this.manifestData = {}; // same as in Rollup
  }

  apply(compiler) {
    const pluginName = "ManifestGeneratorPlugin";

    compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
      const { Compilation } = compiler.webpack;

      compilation.hooks.processAssets.tap(
        {
          name: pluginName,
          stage: Compilation.PROCESS_ASSETS_STAGE_ANALYSE,
        },
        () => {
          this.manifestData = {};
          for (const chunk of compilation.chunks) {
            if (!chunk.name) continue;

            for (const file of chunk.files) {
              if (file.endsWith(".js")) {
                const cleanName = chunk.name + ".js";
                this.manifestData[cleanName] = file;
              }
            }
          }

          if (typeof globalThis !== "undefined") {
            globalThis.__DINOU_RAW_ASSET_MANIFEST__ = { ...this.manifestData };
          }

          const isDev =
            process.env.NODE_ENV !== "production" ||
            process.env.DINOU_DEV === "true";
          const shouldWriteToDisk =
            process.env.DINOU_WRITE_TO_DISK === "false"
              ? false
              : process.env.DINOU_WRITE_TO_DISK === "true" || !isDev;

          if (shouldWriteToDisk) {
            const targetDir = path.resolve(
              process.cwd(),
              isDev ? ".dinou/node-dev" : ".dinou/dist1"
            );
            fs.mkdirSync(targetDir, { recursive: true });
            fs.writeFileSync(
              path.join(targetDir, "manifest.json"),
              JSON.stringify(this.manifestData, null, 2),
              "utf8"
            );
          }
        }
      );
    });
  }
}

const instance = new ManifestGeneratorPlugin();
export { ManifestGeneratorPlugin, instance };
export default instance;
```

```diff
--- a/dinou/webpack/plugins/server-functions-plugin.js
+++ b/dinou/webpack/plugins/server-functions-plugin.js
@@ -91,14 +91,31 @@
               }
             }
 
-            // 2. Generate final manifest
-            const manifestContent = JSON.stringify(
-              serverFunctionsManifest,
-              null,
-              2
-            );
-            compilation.emitAsset(
-              "server-functions-manifest.json",
-              new sources.RawSource(manifestContent)
-            );
+            // 2. Persist final server functions manifest outside public static webroot
+            if (typeof globalThis !== "undefined") {
+              globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__ = {
+                ...serverFunctionsManifest,
+              };
+            }
+
+            const isDev =
+              process.env.NODE_ENV !== "production" ||
+              process.env.DINOU_DEV === "true";
+            const shouldWriteToDisk =
+              process.env.DINOU_WRITE_TO_DISK === "false"
+                ? false
+                : process.env.DINOU_WRITE_TO_DISK === "true" || !isDev;
+
+            if (shouldWriteToDisk) {
+              const sfDir = path.resolve(
+                process.cwd(),
+                isDev ? ".dinou/node-dev" : ".dinou/dist1"
+              );
+              fs.mkdirSync(sfDir, { recursive: true });
+              fs.writeFileSync(
+                path.join(sfDir, "server-functions-manifest.json"),
+                JSON.stringify(serverFunctionsManifest, null, 2),
+                "utf8"
+              );
+            }
```

```diff
--- a/dinou/webpack/plugins/webpack-memory-plugin.js
+++ b/dinou/webpack/plugins/webpack-memory-plugin.js
@@ -37,26 +37,28 @@
           const raw = typeof asset.source === "function" ? asset.source() : asset;
           const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw || "");
 
+          if (cleanKey === "react-client-manifest.json") {
+            try {
+              globalThis.__DINOU_RAW_CLIENT_MANIFEST__ = JSON.parse(buf.toString("utf8"));
+            } catch (e) {}
+            continue;
+          }
+          if (cleanKey === "server-functions-manifest.json") {
+            try {
+              globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__ = JSON.parse(buf.toString("utf8"));
+            } catch (e) {}
+            continue;
+          }
+          if (cleanKey === "react-ssr-manifest.json") {
+            continue;
+          }
+
           if (typeof globalThis !== "undefined" && globalThis.__DINOU_MEM_FILES__) {
             globalThis.__DINOU_MEM_FILES__.set(cleanKey, buf);
             globalThis.__DINOU_MEM_FILES__.set("/" + cleanKey, buf);
             const base = path.basename(cleanKey);
             globalThis.__DINOU_MEM_FILES__.set(base, buf);
           }
-
-          if (cleanKey === "react-client-manifest.json") {
-            try {
-              globalThis.__DINOU_RAW_CLIENT_MANIFEST__ = JSON.parse(buf.toString("utf8"));
-            } catch (e) {}
-          } else if (cleanKey === "server-functions-manifest.json") {
-            try {
-              globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__ = JSON.parse(buf.toString("utf8"));
-            } catch (e) {}
-          } else if (cleanKey === "manifest.json") {
-            try {
-              globalThis.__DINOU_RAW_ASSET_MANIFEST__ = JSON.parse(buf.toString("utf8"));
-            } catch (e) {}
-          }
         }
       });
     });
```

---

### 4.6. Core Manifest Readers & Static Export (`get-asset-from-manifest.js`, `manifest-provider.js`, `generate-static-rsc.js`, `dinou-paths.js`, `export-static.js`)

```javascript
// dinou/core/get-asset-from-manifest.js
import fs from "node:fs";
import path from "node:path";

let manifest = {};
let read = false;
const isWebpack = process.env.DINOU_BUILD_TOOL === "webpack";

export function getAssetFromManifest(name) {
  if (typeof globalThis !== "undefined" && globalThis.__DINOU_ASSET_MANIFEST__) {
    return "/" + (globalThis.__DINOU_ASSET_MANIFEST__[name] || name);
  }
  const isDev =
    process.env.DINOU_DEV === "true" ||
    (typeof globalThis !== "undefined" && Boolean(globalThis.__DINOU_DEV__));
  if (process.env.NODE_ENV === "production" && !isDev && !read) {
    const manifestPath = path.resolve(process.cwd(), ".dinou/dist1/manifest.json");
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      read = true;
    }
  } else if (isWebpack && isDev) {
    if (typeof globalThis !== "undefined" && globalThis.__DINOU_RAW_ASSET_MANIFEST__) {
      return "/" + (globalThis.__DINOU_RAW_ASSET_MANIFEST__[name] || name);
    }
    const manifestPath = path.resolve(process.cwd(), ".dinou/node-dev/manifest.json");
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    }
  }
  return "/" + (manifest[name] || name);
}

export default getAssetFromManifest;
```

```diff
--- a/dinou/core/manifest-provider.js
+++ b/dinou/core/manifest-provider.js
@@ -17,31 +17,21 @@
   );
 }
 
 function getClientManifestPath() {
-  const isWebpack = process.env.DINOU_BUILD_TOOL === "webpack";
-  const isDevelopment = isDevMode();
-  if (isWebpack) {
-    return path.resolve(
-      process.cwd(),
-      isDevelopment ? ".dinou/public" : ".dinou/dist3",
-      "react-client-manifest.json"
-    );
-  }
   return path.resolve(
     process.cwd(),
-    ".dinou/react_client_manifest/react-client-manifest.json"
+    isDevMode() ? ".dinou/node-dev" : ".dinou/dist1",
+    "react-client-manifest.json"
   );
 }
 
 function getServerFunctionsManifestPath() {
-  const isWebpack = process.env.DINOU_BUILD_TOOL === "webpack";
-  const isDevelopment = isDevMode();
-  if (isWebpack) {
-    return path.resolve(
-      process.cwd(),
-      isDevelopment ? ".dinou/public" : ".dinou/dist3",
-      "server-functions-manifest.json"
-    );
-  }
   return path.resolve(
     process.cwd(),
-    ".dinou/server_functions_manifest/server-functions-manifest.json"
+    isDevMode() ? ".dinou/node-dev" : ".dinou/dist1",
+    "server-functions-manifest.json"
   );
 }
```

```diff
--- a/dinou/core/generate-static-rsc.js
+++ b/dinou/core/generate-static-rsc.js
@@ -93,14 +93,12 @@
   };
 
   try {
     const manifest = JSON.parse(
       fs.readFileSync(
-        path.resolve(
-          isWebpack ? ".dinou/dist3" : ".dinou/react_client_manifest",
-          "react-client-manifest.json"
-        ),
+        path.resolve(".dinou/dist1/react-client-manifest.json"),
         "utf8"
       )
     );
```

```diff
--- a/dinou/core/dinou-paths.js
+++ b/dinou/core/dinou-paths.js
@@ -33,7 +33,7 @@
     if (fs.existsSync && fs.existsSync(resolvedCore)) return resolvedCore;
   } catch (e) { }
 
-  // 4. Modo bundle de servidor (ej. corriendo desde .dinou/dist3/server/handler.js)
+  // 4. Modo bundle de servidor (ej. corriendo desde .dinou/dist1/server/handler.js)
   // La estructura del paquete instalado es node_modules/dinou/dinou/core
   try {
     const cwd = typeof process !== "undefined" && process.cwd ? process.cwd() : "";
```

```javascript
// dinou/core/export-static.js
// Exports a standalone static website from .dinou/dist3 (assets) and .dinou/dist2 (SSG HTML + segmented RSC)
// into an 'out/' directory, ready for Surge.sh, GitHub Pages, Cloudflare Pages (static), etc.

import fs from "node:fs";
import path from "node:path";
import {
  shouldExportDist3Entry,
  shouldExportDist2File,
  injectStaticExportFlag,
} from "./static-assets.js";

const projectRoot = process.cwd();
const outDir = path.resolve(projectRoot, "out");
const dist3Dir = path.resolve(projectRoot, ".dinou/dist3");
const dist2Dir = path.resolve(projectRoot, ".dinou/dist2");

const bundlerName = process.env.DINOU_BUILD_TOOL || "esbuild";
console.log(`\n🦖 Dinou (Static Export • ${bundlerName})`);

// 1. Clean output directory
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

function copyRecursive(src, dest, filterFile = null, transformFile = null, relPrefix = "") {
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const relPosix = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyRecursive(srcPath, destPath, filterFile, transformFile, relPosix);
    } else {
      if (filterFile && !filterFile(relPosix)) {
        continue;
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      if (transformFile) {
        const transformed = transformFile(srcPath, relPosix);
        if (typeof transformed === "string") {
          fs.writeFileSync(destPath, transformed, "utf8");
          count++;
          continue;
        }
      }
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

// 2. Copy production assets from .dinou/dist3 (JS bundles, CSS, public/)
let assetCount = 0;
if (fs.existsSync(dist3Dir)) {
  assetCount = copyRecursive(dist3Dir, outDir, shouldExportDist3Entry);
  console.log(`  📦 Copied ${assetCount} production asset(s) from .dinou/dist3`);
} else {
  console.warn("⚠️ [Dinou Export] Warning: .dinou/dist3 not found. Did you run a production build first?");
}

// 3. Copy pre-rendered SSG HTML pages + segmented RSC payloads (index.html, page.rsc, layout.rsc) from .dinou/dist2
let pageCount = 0;
if (fs.existsSync(dist2Dir)) {
  pageCount = copyRecursive(
    dist2Dir,
    outDir,
    shouldExportDist2File,
    (srcPath, relPosix) => {
      if (relPosix.toLowerCase().endsWith("index.html")) {
        return injectStaticExportFlag(fs.readFileSync(srcPath, "utf8"));
      }
      return null;
    }
  );
  console.log(`  📄 Copied ${pageCount} static page/payload file(s) from .dinou/dist2`);
} else {
  console.warn("⚠️ [Dinou Export] Warning: .dinou/dist2 not found. Ensure your app has static routes.");
}

const relOut = path.relative(projectRoot, outDir) || "out";
console.log(`\n✓ Standalone static site exported to: ${relOut}/`);
console.log("  👉 Deploy with:");
console.log("     • Surge.sh:       npx surge out <your-domain>.surge.sh");
console.log("     • GitHub Pages:   npx gh-pages -d out");
console.log("     • Cloudflare:     npx wrangler pages deploy out\n");
```

---

### 4.6b. Static Export SPA Client Router & CLI (`dinou/core/client.jsx`, `dinou/core/client-webpack.jsx`, `dinou/cli.js`)

Identical static-export RSC resolution applied to both `dinou/core/client.jsx` (Esbuild & Rollup) and `dinou/core/client-webpack.jsx` (Webpack):

```diff
--- a/dinou/core/client.jsx
+++ b/dinou/core/client.jsx
@@ -291,17 +291,29 @@
+const isStaticExportMode = () =>
+  typeof window !== "undefined" && Boolean(window.__DINOU_STATIC_EXPORT__);
+
+const buildStaticExportRscUrl = (rawRouteOrKey, fileName) => {
+  const withoutHash = String(rawRouteOrKey || "/").split("#")[0];
+  const qIdx = withoutHash.indexOf("?");
+  const rawPathname = qIdx === -1 ? withoutHash : withoutHash.slice(0, qIdx);
+  const existingQuery = qIdx === -1 ? "" : withoutHash.slice(qIdx + 1);
+  const cleanPathname = rawPathname.replace(/\/+$/, "");
+  const baseRscPath = cleanPathname ? `${cleanPathname}/${fileName}` : `/${fileName}`;
+  return existingQuery ? `${baseRscPath}?${existingQuery}` : baseRscPath;
+};
+
 const getPagePayload = (route, isPrefetch = false, version = 0) => {
   const url = route.split("::")[0];
   if (pageCache.has(url)) {
     return pageCache.get(url);
   }
 
+  const staticExport = isStaticExportMode();
   let payloadUrl;
-  if (window.__DINOU_USE_OLD_RSC__ || window.__DINOU_USE_STATIC__) {
+  if (staticExport) {
+    payloadUrl = buildStaticExportRscUrl(url, "page.rsc");
+  } else if (window.__DINOU_USE_OLD_RSC__ || window.__DINOU_USE_STATIC__) {
     payloadUrl = window.__DINOU_USE_OLD_RSC__
...
   const isInitialHydration =
     !isPrefetch &&
     typeof document !== "undefined" &&
     (!document.body || document.body.getAttribute("data-hydrated") !== "true");
-  const buildId = isInitialHydration ? window.__DINOU_BUILD_ID__ : undefined;
+  const buildId =
+    staticExport || isInitialHydration ? window.__DINOU_BUILD_ID__ : undefined;
...
   const inlineRes = isInitialHydration && !version ? consumeInlineRscResponse("P") : null;
   const fetchPromise = inlineRes
     ? Promise.resolve(inlineRes)
-    : fetch(payloadUrl, { cache: "no-store" }).then((res) => {
+    : fetch(payloadUrl, {
+        cache: staticExport && !version ? "default" : "no-store",
+      }).then((res) => {
         if (res.headers.has("x-rsc-redirect")) {
           ...
         }
+        if (
+          staticExport &&
+          (!res.ok ||
+            (res.headers.get("content-type") || "").toLowerCase().includes("text/html"))
+        ) {
+          pageCache.delete(url);
+          if (!isPrefetch && !isInitialHydration) {
+            window.location.replace(url);
+          }
+          return new Promise(() => {});
+        }
         return res;
       });
...
 const getLayoutPayload = (layoutKey, searchPart = "", version = 0) => {
   if (!layoutKey) return null;
-  const cacheKey = `${layoutKey}${searchPart}`;
+  const staticExport = isStaticExportMode();
+  const cacheKey = staticExport ? layoutKey : `${layoutKey}${searchPart}`;
   if (layoutCache.has(cacheKey)) {
     return layoutCache.get(cacheKey);
   }
 
   const isInitialHydration =
     typeof document !== "undefined" &&
     (!document.body || document.body.getAttribute("data-hydrated") !== "true");
-  const buildId = isInitialHydration ? window.__DINOU_BUILD_ID__ : undefined;
+  const buildId =
+    staticExport || isInitialHydration ? window.__DINOU_BUILD_ID__ : undefined;
   const cleanKey = layoutKey === "/" ? "" : layoutKey;
-  let layoutUrl =
-    (window.__DINOU_USE_STATIC__
-      ? "/____rsc_layout_static____"
-      : "/____rsc_layout____") + cleanKey + searchPart;
+  let layoutUrl = staticExport
+    ? buildStaticExportRscUrl((cleanKey || "/") + searchPart, "layout.rsc")
+    : (window.__DINOU_USE_STATIC__
+        ? "/____rsc_layout_static____"
+        : "/____rsc_layout____") + cleanKey + searchPart;
...
   const inlineRes = isInitialHydration && !version ? consumeInlineRscResponse("L") : null;
   const fetchPromise = inlineRes
     ? Promise.resolve(inlineRes)
-    : fetch(layoutUrl, { cache: "no-store" }).then((res) => {
+    : fetch(layoutUrl, {
+        cache: staticExport && !version ? "default" : "no-store",
+      }).then((res) => {
...
       <ErrorBoundary
         resetKey={`${route}::${navCount}`}
-        onError={setNavError}
+        onError={isStaticExportMode() ? undefined : setNavError}
       >
```

And in `dinou/cli.js`:
```diff
--- a/dinou/cli.js
+++ b/dinou/cli.js
@@ -270,7 +270,7 @@
 program
   .command("build:cloudflare:rollup")
   .description("Build the app for Cloudflare Workers with Rollup")
   .action(() => {
-    runCommand(`cross-env NODE_ENV=production npx rollup -c ${p("rollup/rollup.config.js")} && node ${p("cloudflare/build.js")}`);
+    runCommand(`cross-env NODE_ENV=production npx rollup -c ${p("rollup/rollup.config.js")} && cross-env DINOU_BUILD_TOOL=rollup node ${p("cloudflare/build.js")}`);
   });
@@ -498,13 +498,13 @@
 program
   .command("export-static:rollup")
   .description("Export standalone static website with Rollup")
   .action(() => {
-    runCommand(`cross-env NODE_ENV=production npx rollup -c ${p("rollup/rollup.config.js")} && node ${p("core/export-static.js")}`);
+    runCommand(`cross-env NODE_ENV=production npx rollup -c ${p("rollup/rollup.config.js")} && cross-env DINOU_BUILD_TOOL=rollup node ${p("core/export-static.js")}`);
   });
 
 program
   .command("export-static:webpack")
   .description("Export standalone static website with Webpack")
   .action(() => {
-    runCommand(`cross-env NODE_ENV=production npx webpack --config ${p("webpack/webpack.config.js")} && node ${p("core/export-static.js")}`);
+    runCommand(`cross-env NODE_ENV=production npx webpack --config ${p("webpack/webpack.config.js")} && cross-env DINOU_BUILD_TOOL=webpack node ${p("core/export-static.js")}`);
   });
```

---

### 4.7. Runtime Builders & Adapters (`node/dev.js`, `node/bundle-dual-engine.js`, `node/build.js`, `bun/build.js`, `deno/build.js`, `cloudflare/build.js`, `adapters/cloudflare.js`)

#### `dinou/node/dev.js`
- Imports `getStaticContentType`, `normalizePublicRequestPath`, and `resolveConfinedStaticFile` from `../core/static-assets.js`.
- Cleans any stale disk manifests (`react-client-manifest.json`, `react-ssr-manifest.json`, `server-functions-manifest.json`, `manifest.json`) inside `.dinou/node-dev` on startup (when `DINOU_STANDALONE_SERVER !== "true"`).
- Simplifies `findManifest(filename, folder)` to resolve `.dinou/<folder>/<filename>` directly, reading dev disk fallback manifests exclusively from `"node-dev"` (`react-client-manifest.json`, `server-functions-manifest.json`, and `manifest.json` when `isWebpackBuild` is true) — never touching `.dinou/dist1`.
- Removes legacy `favicons` from `watchTargets` and `candidateStaticDirs` (`candidateStaticDirs` is now `[path.resolve(projectRoot, "public"), path.resolve(projectRoot, ".dinou/public")]`).
- Replaces raw URL-slicing static delivery with `normalizePublicRequestPath(pathname)`, `resolveConfinedStaticFile(baseDir, targetName)`, and `getStaticContentType(...)` (supporting `GET` and `HEAD`, URL-decoded spaces, `/.well-known/*`, and PWA `/manifest.json`, while blocking traversal and hidden dotfiles).

```diff
--- a/dinou/node/dev.js
+++ b/dinou/node/dev.js
@@ -35,6 +35,11 @@
 import { generateRouteModulesCode, generateRouteTypes } from "../core/route-generator.js";
 import { discoverLayoutsFromFs } from "../core/discover-layouts.js";
 import { esbuildContextualDinouPlugin, isUnderscoreEscapedSrcPath } from "../core/resolve-contextual-dinou.js";
+import {
+  getStaticContentType,
+  normalizePublicRequestPath,
+  resolveConfinedStaticFile,
+} from "../core/static-assets.js";
 import parseExports from "../core/parse-exports.js";
@@ -101,6 +106,18 @@
 const isWebpackBuild = process.env.DINOU_BUILD_TOOL === "webpack";
 const devDir = path.resolve(projectRoot, ".dinou/node-dev");
 fs.mkdirSync(devDir, { recursive: true });
+if (process.env.DINOU_STANDALONE_SERVER !== "true") {
+  for (const stale of [
+    "react-client-manifest.json",
+    "react-ssr-manifest.json",
+    "server-functions-manifest.json",
+    "manifest.json",
+  ]) {
+    try {
+      fs.rmSync(path.join(devDir, stale), { force: true });
+    } catch (e) {}
+  }
+}
@@ -251,18 +268,10 @@
 // Manifest paths and helpers
-function findManifest(filename, standardFolder) {
-  const candidates = isWebpackBuild
-    ? [
-        path.resolve(projectRoot, ".dinou/public", filename),
-        path.resolve(projectRoot, ".dinou/dist3", filename),
-        path.resolve(projectRoot, ".dinou", standardFolder, filename),
-      ]
-    : [
-        path.resolve(projectRoot, ".dinou", standardFolder, filename),
-        path.resolve(projectRoot, ".dinou/public", filename),
-        path.resolve(projectRoot, ".dinou/dist3", filename),
-      ];
-  for (const c of candidates) {
-    if (fs.existsSync(c)) return c;
-  }
-  return null;
+function findManifest(filename, folder) {
+  const candidate = path.resolve(projectRoot, ".dinou", folder, filename);
+  return fs.existsSync(candidate) ? candidate : null;
 }
@@ -305,9 +314,9 @@
   const forceRescan = options.forceRescan || false;
-  const cPath = findManifest("react-client-manifest.json", "react_client_manifest");
-  const sfPath = findManifest("server-functions-manifest.json", "server_functions_manifest");
-  const aPath = findManifest("manifest.json", "public");
+  const cPath = findManifest("react-client-manifest.json", "node-dev");
+  const sfPath = findManifest("server-functions-manifest.json", "node-dev");
+  const aPath = isWebpackBuild ? findManifest("manifest.json", "node-dev") : null;
@@ -2094,11 +2103,11 @@
 function checkClientFilesPresent() {
   if (globalThis.__DINOU_MEM_FILES__ && globalThis.__DINOU_MEM_FILES__.has("main.js")) {
     return true;
   }
-  const cPath = findManifest("react-client-manifest.json", "react_client_manifest");
+  const cPath = findManifest("react-client-manifest.json", "node-dev");
   if (!globalThis.__DINOU_RAW_CLIENT_MANIFEST__ && !readJsonSafe(cPath)) return false;
   if (isWebpackBuild) {
     if (globalThis.__DINOU_RAW_ASSET_MANIFEST__) return true;
-    const mPath = path.resolve(projectRoot, ".dinou/public/manifest.json");
+    const mPath = path.resolve(projectRoot, ".dinou/node-dev/manifest.json");
     return fs.existsSync(mPath);
   }
@@ -2181,8 +2190,7 @@
 const candidateStaticDirs = [
   path.resolve(projectRoot, "public"),
-  path.resolve(projectRoot, "favicons"),
   path.resolve(projectRoot, ".dinou/public"),
 ];
```

#### `dinou/node/bundle-dual-engine.js`

```diff
--- a/dinou/node/bundle-dual-engine.js
+++ b/dinou/node/bundle-dual-engine.js
@@ -80,24 +80,14 @@
   // 2. Discover manifests
   const isWebpackBuild = process.env.DINOU_BUILD_TOOL === "webpack";
 
-  function findManifest(filename, standardFolder) {
-    const candidates = isWebpackBuild
-      ? [
-          path.resolve(projectRoot, ".dinou/dist3", filename),
-          path.resolve(projectRoot, ".dinou", standardFolder, filename),
-        ]
-      : [
-          path.resolve(projectRoot, ".dinou", standardFolder, filename),
-          path.resolve(projectRoot, ".dinou/dist3", filename),
-        ];
-    for (const c of candidates) {
-      if (fs.existsSync(c)) return c;
-    }
-    return null;
+  function findManifest(filename, folder) {
+    const candidate = path.resolve(projectRoot, ".dinou", folder, filename);
+    return fs.existsSync(candidate) ? candidate : null;
   }
 
-  const clientManifestPath = findManifest("react-client-manifest.json", "react_client_manifest");
-  const sfManifestPath = findManifest("server-functions-manifest.json", "server_functions_manifest");
+  const manifestFolder = isDev ? "node-dev" : "dist1";
+  const clientManifestPath = findManifest("react-client-manifest.json", manifestFolder);
+  const sfManifestPath = findManifest("server-functions-manifest.json", manifestFolder);
@@ -323,7 +313,7 @@
     manifestInlines += `\nglobalThis.__DINOU_SERVER_FUNCTIONS_MANIFEST__ = {};\n`;
   }
 
-  const assetManifestPath = findManifest("manifest.json", "dist3");
+  const assetManifestPath = findManifest("manifest.json", manifestFolder);
   if (assetManifestPath && fs.existsSync(assetManifestPath)) {
     const content = fs.readFileSync(assetManifestPath, "utf8");
     manifestInlines += `\nglobalThis.__DINOU_ASSET_MANIFEST__ = ${content};\n`;
```

#### `dinou/node/build.js`

```diff
--- a/dinou/node/build.js
+++ b/dinou/node/build.js
@@ -48,6 +48,12 @@
   nodeToWebRequest,
   sendWebResponseToNode,
 } from "${dinouDirSlash}/core/http-adapter.js";
+import {
+  getStaticContentType,
+  getStaticCacheControl,
+  normalizePublicRequestPath,
+  resolveConfinedStaticFile,
+} from "${dinouDirSlash}/core/static-assets.js";
 
 if (typeof globalThis !== "undefined") {
   globalThis.__DINOU_RUNTIME__ = "node-bundle";
@@ -71,44 +77,32 @@
   }
 }
 
-const MIME_TYPES = { ... };
 const cwd = typeof process !== "undefined" && typeof process.cwd === "function" ? process.cwd() : ".";
 const dist3Dir = path.resolve(cwd, ".dinou/dist3");
 
 export async function fetch(req) {
   initStorage();
 
   const url = new URL(req.url);
   const pathname = url.pathname;
 
   // Static assets delivery (Zero-copy with Node streams)
-  if ((req.method === "GET" || req.method === "HEAD") && pathname !== "/" && pathname.includes(".")) {
-    const cleanPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
-    if (!cleanPath.includes("..")) {
-      const filePath = path.join(dist3Dir, cleanPath);
+  if (req.method === "GET" || req.method === "HEAD") {
+    const cleanPath = normalizePublicRequestPath(pathname);
+    if (cleanPath) {
+      const filePath = resolveConfinedStaticFile(dist3Dir, cleanPath);
       if (filePath && fs.existsSync(filePath)) {
         try {
           const stat = fs.statSync(filePath);
           if (stat.isFile()) {
-            const ext = path.extname(filePath).toLowerCase();
-            const contentType = MIME_TYPES[ext] || "application/octet-stream";
-            const body = req.method === "HEAD" ? null : Readable.toWeb(fs.createReadStream(filePath));
+            const body =
+              req.method === "HEAD"
+                ? null
+                : Readable.toWeb(fs.createReadStream(filePath));
             return new Response(body, {
               headers: {
-                "content-type": contentType,
+                "content-type": getStaticContentType(cleanPath),
                 "content-length": String(stat.size),
-                "cache-control": "public, max-age=31536000, immutable",
+                "cache-control": getStaticCacheControl(cleanPath),
               },
             });
           }
         } catch (e) {}
       }
     }
   }
```

#### `dinou/bun/build.js` & `dinou/deno/build.js`
Both `dinou/bun/build.js` and `dinou/deno/build.js` received the following upgrades:
1. `findManifest(filename, folder)` resolves `.dinou/<folder>/<filename>` directly, reading **all three** manifests (`react-client-manifest.json`, `server-functions-manifest.json`, and `manifest.json`) from `"dist1"`.
2. Generated orchestrator `fetch(req)` imports `{ getStaticContentType, getStaticCacheControl, normalizePublicRequestPath, resolveConfinedStaticFile }` from `${dinouDirSlash}/core/static-assets.js` and serves `GET`/`HEAD` static files from `.dinou/dist3` (`Bun.file(filePath)` on Bun, `Deno.readFile(filePath)` on Deno) with confined paths, smart `Cache-Control`, and full MIME coverage (including extensionless `/.well-known/apple-app-site-association` and PWA `/manifest.json`).
3. Removed the redundant `copyRecursive(dist2Dir, dist3Dir)` step in `dinou/deno/build.js` (Deno already hydrates `.dinou/dist2` via `readDist2Fallback`, so only Cloudflare Workers needs `dist2` synchronized into `dist3` for `env.ASSETS`).

#### `dinou/cloudflare/build.js`, `dinou/adapters/cloudflare.js` & Internal `env.ASSETS` Readers (`handler.js`, `ppr-runtime.js`, `cache-slot.js`, `cache-revalidate.js`)

```diff
--- a/dinou/cloudflare/build.js
+++ b/dinou/cloudflare/build.js
@@ -35,6 +35,10 @@
 import { discoverLayoutsFromFs, sortEntriesByName } from "../core/discover-layouts.js";
+import {
+  CLOUDFLARE_DIST2_NAMESPACE,
+  shouldExportDist3Entry,
+} from "../core/static-assets.js";
@@ -77,31 +81,55 @@
-function copyRecursive(src, dest) { ... }
+function copyRecursive(src, dest, filterFile = null, relPrefix = "") {
+  if (!fs.existsSync(src)) return 0;
+  let count = 0;
+  const entries = fs.readdirSync(src, { withFileTypes: true });
+  for (const entry of entries) {
+    const relPosix = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
+    const srcPath = path.join(src, entry.name);
+    const destPath = path.join(dest, entry.name);
+    if (entry.isDirectory()) {
+      count += copyRecursive(srcPath, destPath, filterFile, relPosix);
+    } else {
+      if (filterFile && !filterFile(relPosix)) {
+        continue;
+      }
+      fs.mkdirSync(path.dirname(destPath), { recursive: true });
+      fs.copyFileSync(srcPath, destPath);
+      count++;
+    }
+  }
+  return count;
+}
 
 const dist2Dir = path.resolve(projectRoot, ".dinou/dist2");
 const dist3Dir = path.resolve(projectRoot, ".dinou/dist3");
+const cloudflareAssetsDir = path.join(cloudflareDir, "assets");
+const cloudflareDist2AssetsDir = path.join(
+  cloudflareAssetsDir,
+  CLOUDFLARE_DIST2_NAMESPACE
+);
+
 console.log(`\n🦖 Dinou (Cloudflare Workers • ${bundlerName})`);
-if (fs.existsSync(dist2Dir)) {
-  const copiedCount = copyRecursive(dist2Dir, dist3Dir);
-  console.log(`  📄 Synchronized ${copiedCount} pre-rendered static route(s) to .dinou/dist3`);
-}
-// Ensure Cloudflare Assets never exposes internal server bundles or raw RSC slot payloads publicly
-const assetsIgnorePath = path.join(dist3Dir, ".assetsignore");
-...
+fs.rmSync(cloudflareAssetsDir, { recursive: true, force: true });
+fs.mkdirSync(cloudflareAssetsDir, { recursive: true });
+
+if (fs.existsSync(dist3Dir)) {
+  const staticCount = copyRecursive(
+    dist3Dir,
+    cloudflareAssetsDir,
+    shouldExportDist3Entry
+  );
+  console.log(
+    `  📦 Synchronized ${staticCount} public static asset(s) to .dinou/cloudflare/assets`
+  );
+}
+if (fs.existsSync(dist2Dir)) {
+  const copiedCount = copyRecursive(dist2Dir, cloudflareDist2AssetsDir);
+  console.log(
+    `  📄 Synchronized ${copiedCount} internal SSG cache file(s) to .dinou/cloudflare/assets/${CLOUDFLARE_DIST2_NAMESPACE}`
+  );
+}
@@ -111,23 +135,12 @@
-function findManifest(filename, standardFolder) { ... }
+function findManifest(filename, folder) {
+  const candidate = path.resolve(projectRoot, ".dinou", folder, filename);
+  return fs.existsSync(candidate) ? candidate : null;
+}
+
+const clientManifestPath = findManifest("react-client-manifest.json", "dist1");
+const sfManifestPath = findManifest("server-functions-manifest.json", "dist1");
@@ -375,7 +375,7 @@
-const assetManifestPath = findManifest("manifest.json", "dist3");
+const assetManifestPath = findManifest("manifest.json", "dist1");
```

In both `dinou/cloudflare/build.js` (generated `worker-entry.js`) and `dinou/adapters/cloudflare.js`:

```javascript
import {
  getStaticContentType,
  isPublicStaticAssetRequest,
  isReservedCloudflareDist2RequestPath,
} from "../core/static-assets.js";

// Inside fetch(request, env, ctx):
const url = new URL(request.url);
if (
  url.pathname.startsWith("/cdn-cgi/") ||
  isReservedCloudflareDist2RequestPath(url.pathname)
) {
  return new Response(null, { status: 404 });
}

const isStaticAsset = isPublicStaticAssetRequest(url.pathname);

if (!isRSCPayload && !isServerFunction && isStaticAsset && env && env.ASSETS && (request.method === "GET" || request.method === "HEAD")) {
  try {
    const assetRes = await env.ASSETS.fetch(request.clone ? request.clone() : request);
    if (assetRes && assetRes.status < 400) {
      if (
        url.pathname.toLowerCase().endsWith("/apple-app-site-association") &&
        !(assetRes.headers.get("content-type") || "").toLowerCase().includes("json")
      ) {
        const headers = new Headers(assetRes.headers);
        headers.set("content-type", getStaticContentType(url.pathname));
        return new Response(assetRes.body, {
          status: assetRes.status,
          statusText: assetRes.statusText,
          headers,
        });
      }
      return assetRes;
    }
  } catch (e) {}
}
```

And all internal `env.ASSETS` cache readers (`dinou/core/handler.js`, `dinou/core/ppr-runtime.js`, `dinou/core/cache-slot.js`, and `dinou/core/cache-revalidate.js`) import `fetchCloudflareDist2Asset` (plus `isReservedCloudflareDist2RequestPath` in `handler.js`) from `./static-assets.js`:
- **`dinou/core/handler.js`**:
  - Guards `isReservedCloudflareDist2RequestPath(pathname)` at the top of `handleRequest` (`return new Response("Not Found", { status: 404 })`).
  - Replaces direct `platformContext.env.ASSETS.fetch(...)` calls in `readMetaFromStorage` (`metaKey`), `readRscFromStorage` (`rscKey`), segmented static RSC lookup (`rscKey`), and Edge SSG HTML/metadata hydration (`metaKey`, `htmlKey`, `layoutMetaKey`) with `fetchCloudflareDist2Asset(platformContext.env.ASSETS, key, requestUrl)`.
- **`dinou/core/ppr-runtime.js`**:
  - Replaces `platformContext.env.ASSETS.fetch(...)` in `readShellJsonFromStorage` with `fetchCloudflareDist2Asset(platformContext.env.ASSETS, key, reqUrl)`.
- **`dinou/core/cache-slot.js`**:
  - Replaces `assets.fetch(...)` in `readSlotFromStorageOrAssets` (`cleanKey` & `metaKey`) and `readMetaFromStorageOrAssets` (`cleanKey`) with `fetchCloudflareDist2Asset(assets, key)`.
- **`dinou/core/cache-revalidate.js`**:
  - Replaces `assets.fetch(...)` in `readFromStorageOrAssets` (`cleanKey`) with `fetchCloudflareDist2Asset(assets, cleanKey)`.

> **Note on Deployment Configs (`netlify.toml` & `wrangler.toml`)**:
> - **Netlify (`netlify.toml`)**: Because server bundles (`handler.js` + `netlify.js` + `package.json`) now output to `.dinou/dist1/server` instead of `.dinou/dist3/server`, set:
>   ```toml
>   [functions]
>     directory = ".dinou/dist1/server"
>     node_bundler = "none"
>   ```
> - **Cloudflare Workers (`wrangler.toml`)**: Because Cloudflare assets (`.dinou/dist3` public files + isolated `__dinou_dist2` SSG cache) are now assembled into `.dinou/cloudflare/assets` while keeping `.dinou/dist3` pure, set:
>   ```toml
>   [assets]
>   directory = ".dinou/cloudflare/assets"
>   binding = "ASSETS"
>   run_worker_first = true
>   ```
> Both `src/docs/deployment/page.tsx` and `src/components/landing/deploy-matrix.tsx` in `dinou-docs` have already been updated accordingly.

---

## 5. `CHANGELOG.md` Entry (`9.4.0`)

```markdown
### Changed
- **Physical Static Webroot Isolation (`.dinou/dist1`, `.dinou/dist3` & `.dinou/cloudflare/assets`)**:
  - Isolated `.dinou/dist3` exclusively for publicly servable static assets (`public/*`, imported `/assets/*`, hashed client JS chunks, and `styles.css`). Consolidated compiled server bundles (`.dinou/dist1/server/handler.js`, `netlify.js`, `package.json`) and **all** internal bundler/RSC manifests (`manifest.json`, `react-client-manifest.json`, `server-functions-manifest.json`, and Webpack `react-ssr-manifest.json`) directly into `.dinou/dist1` across Esbuild, Rollup, and Webpack (eliminating `.dinou/react_client_manifest` and `.dinou/server_functions_manifest`, and using `.dinou/node-dev` for optional disk manifests in dev mode). Note: Netlify deployments using `[functions]` in `netlify.toml` should point `directory = ".dinou/dist1/server"`.
  - Isolated Cloudflare Workers static assets inside `.dinou/cloudflare/assets` (`[assets] directory = ".dinou/cloudflare/assets"` in `wrangler.toml`), keeping `.dinou/dist3` 100% untouched: public static files sit at `.dinou/cloudflare/assets/*` while internal `.dinou/dist2` SSG/ISR/PPR/Slot cache artifacts are isolated inside `.dinou/cloudflare/assets/__dinou_dist2/*` (returning `404` on direct external HTTP requests while read internally via `fetchCloudflareDist2Asset`).
- **Unified `public/` Directory (Removed Legacy `favicons/`)**: Standardized on `public/` at the project root as the single directory for unhashed static files across dev and production builds, removing legacy `favicons/` directory copying and watching.

### Added
- **PWA `public/manifest.json` Support**: Moving Dinou's internal chunk manifest to `.dinou/dist1/manifest.json` frees `/manifest.json` at the domain root for standard Progressive Web App manifests (`public/manifest.json`) across all bundlers, runtimes, Cloudflare Workers `env.ASSETS`, and `dinou export-static`.
- **Standalone Static Export SPA Navigation (`dinou export-static`)**:
  - Added `shouldExportDist2File` and `injectStaticExportFlag` so `dinou export-static` exports strictly `index.html` (with `window.__DINOU_STATIC_EXPORT__ = true` injected), `page.rsc`, and `layout.rsc` from `.dinou/dist2` into `out/`, excluding all internal ISR/PPR/Slot metadata JSONs (`metadata.json`, `layout.metadata.json`, `shell.*`, `rsc.rsc`, `slots/*`, `status-manifest.json`, `*._old.*`).
  - Updated `dinou/core/client.jsx` and `dinou/core/client-webpack.jsx` so standalone static sites hydrate and perform full client-side `<Link>` SPA navigation & hover prefetching directly against `/<route>/page.rsc` and `/<layout>/layout.rsc` without requiring a Dinou server, falling back cleanly to native browser navigation if a target path has no `.rsc` payload.
- **Shared Static Asset Security, Caching & MIME Engine (`dinou/core/static-assets.js`)**:
  - Added safe `decodeURIComponent` normalization (supporting filenames with spaces such as `/docs/brochure%202026.pdf`), strict `path.resolve` confinement against directory traversal (`%2e%2e`, backslashes), and hidden dotfile blocking (`/.env`, `/.git/*`, `/.DS_Store`) while explicitly allowing `/.well-known/*` (including extensionless `/.well-known/apple-app-site-association` served as `application/json; charset=utf-8`).
  - Added smart `Cache-Control` differentiation: `public, max-age=31536000, immutable` for content-hashed bundler chunks and `/assets/*`, and `public, max-age=0, must-revalidate` for unhashed `public/*` assets (`favicon.ico`, `robots.txt`, `sitemap.xml`, `manifest.json`, `site.webmanifest`, `styles.css`, etc.).
  - Expanded static MIME dictionary across Node.js, Bun, Deno, and Cloudflare Workers (`application/xml`, `application/manifest+json`, `application/pdf`, `image/avif`, `image/gif`, `font/ttf`, `font/otf`, `application/wasm`, `video/mp4`, `video/webm`, `audio/mpeg`, `audio/ogg`, `audio/wav`, etc.).

### Fixed
- **Multi-Bundler `public/` Parity**: Replaced `rollup-plugin-copy` (which flattened nested subdirectories in `public/**/*`) with recursive `copyStaticDirectoriesToOutdir` and enabled `dot: true` in Webpack's `CopyWebpackPlugin` so nested directories, filenames with spaces, and `public/.well-known/*` behave identically across Esbuild, Rollup, and Webpack.
- **Cloudflare Workers `public/` Asset Routing**: Fixed `dinou/adapters/cloudflare.js` and `dinou/cloudflare/build.js` so `public/*` files of all extensions (`/sitemap.xml`, `/docs/*.pdf`, `/media/*.mp4`, `/google*.html`, `/.well-known/*`, `/manifest.json`) are served via `env.ASSETS` instead of falling through to the RSC router as `404`, and removed the obsolete `.assetsignore` hack that previously blocked user `/manifest.json` uploads.
- **Dev vs Build Manifest Isolation**: Guarded `dinou/core/get-asset-from-manifest.js`, `dinou/core/manifest-provider.js`, `dinou/node/bundle-dual-engine.js`, and `dinou/node/dev.js` so `dinou dev` reads disk fallback manifests strictly from `.dinou/node-dev` while `dinou build` writes and reads strictly from `.dinou/dist1`.
```

---

## 6. Automated Test Suites (100% Complete & Copy-Pasteable)

### 6.1. Unit & Multi-Bundler Integration Test Suite (`tests/unit/public-static-assets.test.mjs`)

Run directly with Node's built-in test runner:
```bash
node --test tests/unit/public-static-assets.test.mjs
```

```javascript
// tests/unit/public-static-assets.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const dinouRoot = fs.existsSync(path.join(repoRoot, "dinou/core/static-assets.js"))
  ? path.join(repoRoot, "dinou")
  : path.join(repoRoot, "node_modules/dinou/dinou");
const repoRequire = createRequire(path.join(repoRoot, "package.json"));

const staticAssetsMod = await import(
  pathToFileURL(path.join(dinouRoot, "core/static-assets.js")).href
);
const {
  CLOUDFLARE_DIST2_NAMESPACE,
  STATIC_EXPORT_SCRIPT,
  fetchCloudflareDist2Asset,
  getStaticContentType,
  getStaticCacheControl,
  injectStaticExportFlag,
  isImmutableAssetPath,
  isPublicStaticAssetRequest,
  isReservedCloudflareDist2RequestPath,
  normalizePublicRequestPath,
  resolveConfinedStaticFile,
  shouldExportDist2File,
  shouldExportDist3Entry,
} = staticAssetsMod;

describe("Public Static Assets & .dinou/dist1 Physical Isolation", () => {
  it("normalizes valid public URLs (including PWA /manifest.json, spaces, and /.well-known/*) and blocks traversal, dotfiles, and __dinou_dist2 internal paths", () => {
    const blockedUrls = [
      "/",
      "/__dinou_dist2",
      "/__dinou_dist2/",
      "/__dinou_dist2/index.html",
      "/__dinou_dist2/metadata.json",
      "/__dinou_dist2/slots/home-hero/slot.json",
      "/%5f%5fdinou_dist2/metadata.json",
      "/Thumbs.db",
      "/images/Thumbs.db",
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
        `Expected ${urlPath} to be rejected by normalizePublicRequestPath`
      );
    }

    assert.equal(isReservedCloudflareDist2RequestPath("/__dinou_dist2/metadata.json"), true);
    assert.equal(isReservedCloudflareDist2RequestPath("/%5f%5fdinou_dist2/page.rsc"), true);
    assert.equal(isReservedCloudflareDist2RequestPath("/robots.txt"), false);

    assert.equal(normalizePublicRequestPath("/robots.txt"), "robots.txt");
    assert.equal(normalizePublicRequestPath("/sitemap.xml"), "sitemap.xml");
    assert.equal(normalizePublicRequestPath("/manifest.json"), "manifest.json");
    assert.equal(normalizePublicRequestPath("/metadata.json"), "metadata.json");
    assert.equal(normalizePublicRequestPath("/slots/banner.svg"), "slots/banner.svg");
    assert.equal(normalizePublicRequestPath("/server/diagram.png"), "server/diagram.png");
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
    assert.equal(normalizePublicRequestPath("/images/og-image.png"), "images/og-image.png");
    assert.equal(normalizePublicRequestPath("/assets/logo_xY9.png"), "assets/logo_xY9.png");
    assert.equal(normalizePublicRequestPath("/main-ZGBKXIUF.js"), "main-ZGBKXIUF.js");

    const baseDir = path.resolve(repoRoot, ".dinou/dist3");
    assert.equal(
      resolveConfinedStaticFile(baseDir, "docs/brochure 2026.pdf"),
      path.join(baseDir, "docs", "brochure 2026.pdf")
    );
    assert.equal(resolveConfinedStaticFile(baseDir, "../package.json"), null);
    assert.equal(resolveConfinedStaticFile(baseDir, "..\\package.json"), null);
  });

  it("resolves accurate MIME types and differentiates immutable hashed chunks from mutable public/ files", () => {
    assert.equal(getStaticContentType("sitemap.xml"), "application/xml; charset=utf-8");
    assert.equal(getStaticContentType("manifest.json"), "application/json; charset=utf-8");
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
    assert.equal(getStaticContentType("anim.gif"), "image/gif");
    assert.equal(getStaticContentType("font.ttf"), "font/ttf");
    assert.equal(getStaticContentType("font.otf"), "font/otf");
    assert.equal(getStaticContentType("font.woff2"), "font/woff2");
    assert.equal(getStaticContentType("module.wasm"), "application/wasm");
    assert.equal(getStaticContentType("demo.mp4"), "video/mp4");
    assert.equal(getStaticContentType("clip.webm"), "video/webm");
    assert.equal(getStaticContentType("audio.mp3"), "audio/mpeg");
    assert.equal(getStaticContentType("robots.txt"), "text/plain; charset=utf-8");

    const immutablePaths = [
      "assets/hero_8fK2.webp",
      "main-ZGBKXIUF.js",
      "button-5bbf0f56-ZGBKXIUF.js",
      "main-a1b2c3d4e5f6a7b8c9d0.js",
      "chunk-B3f9_kL2.js",
    ];
    for (const p of immutablePaths) {
      assert.equal(isImmutableAssetPath(p), true, `Expected ${p} to be immutable`);
      assert.equal(getStaticCacheControl(p), "public, max-age=31536000, immutable");
    }

    const revalidatedPaths = [
      "robots.txt",
      "sitemap.xml",
      "manifest.json",
      "favicon.ico",
      "site.webmanifest",
      "styles.css",
      "images/og-image.png",
      "android-chrome-192x192.png",
      "apple-touch-icon.png",
      "service-worker.js",
      "my-analytics.js",
    ];
    for (const p of revalidatedPaths) {
      assert.equal(isImmutableAssetPath(p), false, `Expected ${p} NOT to be immutable`);
      assert.equal(getStaticCacheControl(p), "public, max-age=0, must-revalidate");
    }
  });

  it("routes public static assets through Cloudflare env.ASSETS, fixes apple-app-site-association Content-Type, and blocks internal paths", async () => {
    assert.equal(isPublicStaticAssetRequest("/sitemap.xml"), true);
    assert.equal(isPublicStaticAssetRequest("/manifest.json"), true);
    assert.equal(isPublicStaticAssetRequest("/.well-known/assetlinks.json"), true);
    assert.equal(isPublicStaticAssetRequest("/.well-known/apple-app-site-association"), true);
    assert.equal(isPublicStaticAssetRequest("/google1a2b3c4d5e6f.html"), true);
    assert.equal(isPublicStaticAssetRequest("/docs/brochure%202026.pdf"), true);
    assert.equal(isPublicStaticAssetRequest("/media/intro.mp4"), true);

    assert.equal(isPublicStaticAssetRequest("/about"), false);
    assert.equal(isPublicStaticAssetRequest("/__dinou_dist2/index.html"), false);
    assert.equal(isPublicStaticAssetRequest("/__dinou_dist2/about/metadata.json"), false);
    assert.equal(isPublicStaticAssetRequest("/__dinou_dist2/slots/hero/slot.json"), false);
    assert.equal(isPublicStaticAssetRequest("/%5f%5fdinou_dist2/status-manifest.json"), false);

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
          if (u.pathname === "/manifest.json") {
            return new Response('{"name":"Dinou PWA"}', {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          if (u.pathname === `/${CLOUDFLARE_DIST2_NAMESPACE}/about/metadata.json`) {
            return new Response('{"status":200,"generatedAt":123}', {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          if (u.pathname === `/${CLOUDFLARE_DIST2_NAMESPACE}/about/`) {
            return new Response("<html>About SSG</html>", {
              status: 200,
              headers: { "content-type": "text/html" },
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

    const pwaRes = await cfWorker.fetch(
      new Request("https://example.com/manifest.json"),
      mockEnv,
      {}
    );
    assert.equal(pwaRes.status, 200);
    assert.ok(assetHits.includes("/manifest.json"));

    assetHits.length = 0;
    const dist2BypassRes = await cfWorker.fetch(
      new Request("https://example.com/__dinou_dist2/about/metadata.json"),
      mockEnv,
      {}
    );
    assert.equal(
      assetHits.length,
      0,
      "Cloudflare adapter must block external /__dinou_dist2/* requests before hitting env.ASSETS"
    );
    assert.equal(dist2BypassRes.status, 404);

    const internalMetaRes = await fetchCloudflareDist2Asset(
      mockEnv.ASSETS,
      "about/metadata.json",
      "https://example.com"
    );
    assert.ok(internalMetaRes);
    assert.equal(await internalMetaRes.text(), '{"status":200,"generatedAt":123}');

    const internalHtmlRes = await fetchCloudflareDist2Asset(
      mockEnv.ASSETS,
      "about/index.html",
      "https://example.com"
    );
    assert.ok(internalHtmlRes);
    assert.equal(await internalHtmlRes.text(), "<html>About SSG</html>");
  });

  it("consolidates all internal manifests & server bundles in .dinou/dist1, keeps .dinou/dist3 pure, and preserves user public/manifest.json across Esbuild, Rollup, and Webpack", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-dist1-parity-"));
    try {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "tmp-dist1-test", type: "module" }, null, 2)
      );
      fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "src/actions.js"),
        '"use server";\nexport async function ping() { return "pong"; }\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, "src/main.js"),
        'import { ping } from "./actions.js";\nexport const ok = ping;\n'
      );

      // Legacy favicons/ directory must be ignored
      fs.mkdirSync(path.join(tmpDir, "favicons"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "favicons/legacy-only.png"), "legacy-png");

      // Standard PWA public/manifest.json must survive untouched in .dinou/dist3
      const pwaManifestContent = JSON.stringify(
        { name: "My Dinou PWA", short_name: "Dinou", display: "standalone" },
        null,
        2
      );
      fs.mkdirSync(path.join(tmpDir, "public/images/nested"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "public/docs"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "public/.well-known"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "public/manifest.json"), pwaManifestContent);
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

      function assertPureDist3AndDist1Manifest(outDir, label) {
        assert.equal(
          fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
          pwaManifestContent,
          `[${label}] user public/manifest.json must be preserved in dist3`
        );
        const dist1ManifestPath = path.join(tmpDir, ".dinou/dist1/manifest.json");
        assert.ok(
          fs.existsSync(dist1ManifestPath),
          `[${label}] bundler chunk manifest must be written to .dinou/dist1/manifest.json`
        );
        const bundlerManifest = JSON.parse(fs.readFileSync(dist1ManifestPath, "utf8"));
        assert.ok(
          typeof bundlerManifest["main.js"] === "string" &&
            bundlerManifest["main.js"].startsWith("main-"),
          `[${label}] .dinou/dist1/manifest.json must map main.js -> main-<hash>.js`
        );
        assert.ok(
          fs.existsSync(path.join(tmpDir, ".dinou/dist1/react-client-manifest.json")),
          `[${label}] react-client-manifest.json must be written to .dinou/dist1/`
        );
        assert.ok(
          fs.existsSync(path.join(tmpDir, ".dinou/dist1/server-functions-manifest.json")),
          `[${label}] server-functions-manifest.json must be written to .dinou/dist1/`
        );
        assert.equal(
          fs.existsSync(path.join(tmpDir, ".dinou/react_client_manifest")),
          false,
          `[${label}] legacy .dinou/react_client_manifest directory must NOT exist`
        );
        assert.equal(
          fs.existsSync(path.join(tmpDir, ".dinou/server_functions_manifest")),
          false,
          `[${label}] legacy .dinou/server_functions_manifest directory must NOT exist`
        );
        assert.equal(fs.existsSync(path.join(outDir, "server")), false);
        assert.equal(fs.existsSync(path.join(outDir, "react-client-manifest.json")), false);
        assert.equal(fs.existsSync(path.join(outDir, "react-ssr-manifest.json")), false);
        assert.equal(fs.existsSync(path.join(outDir, "server-functions-manifest.json")), false);
        assert.equal(fs.readFileSync(path.join(outDir, "favicon.ico"), "utf8"), "modern-public-favicon");
        assert.equal(fs.existsSync(path.join(outDir, "legacy-only.png")), false);
        assert.equal(
          fs.readFileSync(path.join(outDir, "images/nested/og-image.png"), "utf8"),
          "og-bytes"
        );
        assert.equal(
          fs.readFileSync(path.join(outDir, "docs/brochure 2026.pdf"), "utf8"),
          "pdf-bytes"
        );
        assert.ok(fs.existsSync(path.join(outDir, ".well-known/assetlinks.json")));
        assert.ok(fs.existsSync(path.join(outDir, ".well-known/apple-app-site-association")));
        assert.equal(fs.existsSync(path.join(outDir, ".DS_Store")), false);
      }

      const prevCwd = process.cwd();
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      process.chdir(tmpDir);
      try {
        const serverFilesSet = new Set([path.join(tmpDir, "src/actions.js")]);

        // 1. Esbuild
        const esbuild = repoRequire("esbuild");
        const getConfigEsbuildProd = (
          await import(
            pathToFileURL(
              path.join(dinouRoot, "esbuild/helpers-esbuild/get-config-esbuild-prod.js")
            ).href
          )
        ).default;
        fs.rmSync(path.join(tmpDir, ".dinou"), { recursive: true, force: true });
        const outEsbuild = path.join(tmpDir, ".dinou/dist3");
        await esbuild.build(
          getConfigEsbuildProd({
            entryPoints: {
              main: path.join(tmpDir, "src/main.js"),
              serverFunctionProxy: path.join(tmpDir, "src/main.js"),
            },
            outdir: outEsbuild,
            manifest: {},
            serverFiles: serverFilesSet,
            reactCompiler: false,
          })
        );
        assertPureDist3AndDist1Manifest(outEsbuild, "esbuild");

        // 2. Rollup
        const { rollup } = repoRequire("rollup");
        const getRollupConfig = (
          await import(pathToFileURL(path.join(dinouRoot, "rollup/rollup.config.js")).href)
        ).default;
        fs.rmSync(path.join(tmpDir, ".dinou"), { recursive: true, force: true });
        const [rollupClientCfg, rollupServerCfg] = await getRollupConfig();
        assert.equal(
          path.resolve(rollupServerCfg.output.dir),
          path.resolve(tmpDir, ".dinou/dist1/server")
        );
        const copyPlugin = rollupClientCfg.plugins.find((p) => p && p.name === "dinou-copy-static");
        const rollupManifestPlugin = rollupClientCfg.plugins.find(
          (p) => p && p.name === "manifest-generator"
        );
        const rollupRcmPlugin = rollupClientCfg.plugins.find(
          (p) => p && p.name === "react-client-manifest"
        );
        const rollupSfPlugin = rollupClientCfg.plugins.find(
          (p) => p && p.name === "server-functions-proxy"
        );
        const outRollup = path.join(tmpDir, ".dinou/dist3");
        const bundle = await rollup({
          input: {
            main: path.join(tmpDir, "src/main.js"),
            serverFunctionProxy: path.join(tmpDir, "src/actions.js"),
          },
          external: ["/__SERVER_FUNCTION_PROXY__"],
          plugins: [copyPlugin, rollupRcmPlugin, rollupManifestPlugin, rollupSfPlugin],
        });
        await bundle.write({
          dir: outRollup,
          format: "esm",
          entryFileNames: "[name]-[hash].js",
        });
        await bundle.close();
        assertPureDist3AndDist1Manifest(outRollup, "rollup");

        // 3. Webpack
        const webpack = repoRequire("webpack");
        const getWebpackConfig = (
          await import(pathToFileURL(path.join(dinouRoot, "webpack/webpack.config.js")).href)
        ).default;
        const wpServerFunctionsMod = await import(
          pathToFileURL(path.join(dinouRoot, "webpack/plugins/server-functions-plugin.js")).href
        );
        const wpManifestMod = await import(
          pathToFileURL(path.join(dinouRoot, "webpack/plugins/manifest-generator-plugin.js")).href
        );
        fs.rmSync(path.join(tmpDir, ".dinou"), { recursive: true, force: true });
        const [wpClientCfg, wpServerCfg] = await getWebpackConfig();
        assert.equal(
          path.resolve(wpServerCfg.output.path),
          path.resolve(tmpDir, ".dinou/dist1/server")
        );
        const copyWpPlugin = wpClientCfg.plugins.find((p) => p && Array.isArray(p.patterns));
        const relocatePlugin = wpClientCfg.plugins.find(
          (p) =>
            p &&
            typeof p.apply === "function" &&
            p.apply.toString().includes("DinouRelocateRscManifestsPlugin")
        );
        const outWebpack = path.join(tmpDir, ".dinou/dist3");
        await new Promise((resolve, reject) => {
          const compiler = webpack(
            {
              mode: "production",
              context: tmpDir,
              entry: {
                main: path.join(tmpDir, "src/main.js"),
                serverFunctionProxy: path.join(tmpDir, "src/actions.js"),
              },
              externalsType: "module",
              externals: ["/__SERVER_FUNCTION_PROXY__"],
              output: {
                path: outWebpack,
                filename: "[name]-[contenthash].js",
                clean: true,
              },
              plugins: [
                {
                  apply(comp) {
                    comp.hooks.thisCompilation.tap("MockReactServerPlugin", (compilation) => {
                      const { Compilation, sources } = comp.webpack;
                      compilation.hooks.processAssets.tap(
                        {
                          name: "MockReactServerPlugin",
                          stage: Compilation.PROCESS_ASSETS_STAGE_REPORT,
                        },
                        () => {
                          compilation.emitAsset(
                            "react-client-manifest.json",
                            new sources.RawSource(
                              '{"file:///client.tsx":{"id":"1","chunks":[],"name":"default"}}'
                            )
                          );
                          compilation.emitAsset(
                            "react-ssr-manifest.json",
                            new sources.RawSource('{"moduleLoading":{"prefix":"/"}}')
                          );
                        }
                      );
                    });
                  },
                },
                relocatePlugin,
                copyWpPlugin,
                wpManifestMod.default,
                new wpServerFunctionsMod.WebpackServerFunctionsPluginSimple({
                  manifest: wpManifestMod.default.manifestData,
                  serverFiles: serverFilesSet,
                }),
              ],
            },
            (err, stats) => {
              compiler.close(() => {
                if (err) return reject(err);
                if (stats.hasErrors()) return reject(new Error(stats.toString({ errors: true })));
                resolve();
              });
            }
          );
        });
        assertPureDist3AndDist1Manifest(outWebpack, "webpack");
        assert.ok(fs.existsSync(path.join(tmpDir, ".dinou/dist1/react-ssr-manifest.json")));
      } finally {
        if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prevNodeEnv;
        process.chdir(prevCwd);
      }
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {}
    }
  });

  it("exports user PWA manifest.json, .nojekyll, .well-known/*, index.html (with __DINOU_STATIC_EXPORT__), page.rsc, and layout.rsc in dinou export-static while excluding all internal dist2 metadata", () => {
    const tmpExport = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-export-test-"));
    try {
      fs.mkdirSync(path.join(tmpExport, ".dinou/dist3/.well-known"), { recursive: true });
      fs.mkdirSync(path.join(tmpExport, ".dinou/dist2/about"), { recursive: true });
      fs.mkdirSync(path.join(tmpExport, ".dinou/dist2/slots/hero"), { recursive: true });

      fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/manifest.json"), '{"name":"PWA"}');
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/.DS_Store"), "junk");
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/Thumbs.db"), "junk");

      fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/main-ZGBKXIUF.js"), "console.log(1)");
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/styles.css"), "body{}");
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/robots.txt"), "User-agent: *");
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/.nojekyll"), "");
      fs.writeFileSync(
        path.join(tmpExport, ".dinou/dist3/.well-known/assetlinks.json"),
        "[]"
      );

      // Populate .dinou/dist2 with BOTH exportable SSG files AND internal engine artifacts
      fs.writeFileSync(
        path.join(tmpExport, ".dinou/dist2/index.html"),
        "<!DOCTYPE html><html><head><title>Home</title></head><body>Home</body></html>"
      );
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/page.rsc"), '0:"home-page"\n');
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/layout.rsc"), '0:"root-layout"\n');
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/rsc.rsc"), '0:"legacy-combined"\n');
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/metadata.json"), '{"status":200}');
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/layout.metadata.json"), '{"status":200}');
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/shell.layout.json"), "[]");
      fs.writeFileSync(
        path.join(tmpExport, ".dinou/dist2/status-manifest.json"),
        '{"/":{"status":200}}'
      );
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/slots/hero/slot.json"), '{"jsx":null}');
      fs.writeFileSync(
        path.join(tmpExport, ".dinou/dist2/slots/hero/slot.metadata.json"),
        '{"tags":[]}'
      );

      fs.writeFileSync(
        path.join(tmpExport, ".dinou/dist2/about/index.html"),
        "<!DOCTYPE html><html><head><title>About</title></head><body>About</body></html>"
      );
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/about/page.rsc"), '0:"about-page"\n');
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/about/page._old.rsc"), '0:"old"\n');
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/about/rsc.rsc"), '0:"legacy"\n');
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/about/shell.rsc"), '0:"shell"\n');
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/about/shell.html"), "<html>Shell</html>");
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/about/shell.page.json"), "[]");
      fs.writeFileSync(path.join(tmpExport, ".dinou/dist2/about/metadata.json"), '{"status":200}');

      assert.equal(shouldExportDist3Entry(".DS_Store"), false);
      assert.equal(shouldExportDist3Entry("images/Thumbs.db"), false);
      assert.equal(shouldExportDist3Entry("__dinou_dist2/metadata.json"), false);
      assert.equal(shouldExportDist3Entry("manifest.json"), true);
      assert.equal(shouldExportDist3Entry("slots/banner.svg"), true);
      assert.equal(shouldExportDist3Entry(".nojekyll"), true);
      assert.equal(shouldExportDist3Entry(".well-known/assetlinks.json"), true);

      assert.equal(shouldExportDist2File("index.html"), true);
      assert.equal(shouldExportDist2File("page.rsc"), true);
      assert.equal(shouldExportDist2File("layout.rsc"), true);
      assert.equal(shouldExportDist2File("about/index.html"), true);
      assert.equal(shouldExportDist2File("about/page.rsc"), true);
      assert.equal(shouldExportDist2File("about/layout.rsc"), true);
      assert.equal(shouldExportDist2File("rsc.rsc"), false);
      assert.equal(shouldExportDist2File("about/rsc.rsc"), false);
      assert.equal(shouldExportDist2File("about/shell.rsc"), false);
      assert.equal(shouldExportDist2File("about/page._old.rsc"), false);
      assert.equal(shouldExportDist2File("metadata.json"), false);
      assert.equal(shouldExportDist2File("layout.metadata.json"), false);
      assert.equal(shouldExportDist2File("shell.layout.json"), false);
      assert.equal(shouldExportDist2File("about/shell.page.json"), false);
      assert.equal(shouldExportDist2File("about/shell.html"), false);
      assert.equal(shouldExportDist2File("status-manifest.json"), false);
      assert.equal(shouldExportDist2File("slots/hero/slot.json"), false);
      assert.equal(shouldExportDist2File("slots/hero/index.html"), false);

      const injectedOnce = injectStaticExportFlag(
        "<html><head><title>X</title></head><body></body></html>"
      );
      assert.ok(injectedOnce.includes(`${STATIC_EXPORT_SCRIPT}</head>`));
      assert.equal(injectStaticExportFlag(injectedOnce), injectedOnce);

      execFileSync(process.execPath, [path.join(dinouRoot, "core/export-static.js")], {
        cwd: tmpExport,
        stdio: "pipe",
      });

      const outDir = path.join(tmpExport, "out");
      assert.equal(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"), '{"name":"PWA"}');
      assert.equal(fs.existsSync(path.join(outDir, "status-manifest.json")), false);
      assert.equal(fs.existsSync(path.join(outDir, "slots")), false);
      assert.equal(fs.existsSync(path.join(outDir, "shell.html")), false);
      assert.equal(fs.existsSync(path.join(outDir, "metadata.json")), false);
      assert.equal(fs.existsSync(path.join(outDir, "layout.metadata.json")), false);
      assert.equal(fs.existsSync(path.join(outDir, "shell.layout.json")), false);
      assert.equal(fs.existsSync(path.join(outDir, "rsc.rsc")), false);
      assert.equal(fs.existsSync(path.join(outDir, "about/metadata.json")), false);
      assert.equal(fs.existsSync(path.join(outDir, "about/rsc.rsc")), false);
      assert.equal(fs.existsSync(path.join(outDir, "about/shell.rsc")), false);
      assert.equal(fs.existsSync(path.join(outDir, "about/shell.html")), false);
      assert.equal(fs.existsSync(path.join(outDir, "about/shell.page.json")), false);
      assert.equal(fs.existsSync(path.join(outDir, "about/page._old.rsc")), false);

      assert.ok(fs.existsSync(path.join(outDir, "main-ZGBKXIUF.js")));
      assert.ok(fs.existsSync(path.join(outDir, "styles.css")));
      assert.ok(fs.existsSync(path.join(outDir, "robots.txt")));
      assert.ok(fs.existsSync(path.join(outDir, ".nojekyll")));
      assert.ok(fs.existsSync(path.join(outDir, ".well-known/assetlinks.json")));

      const outHomeHtml = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      const outAboutHtml = fs.readFileSync(path.join(outDir, "about/index.html"), "utf8");
      assert.ok(outHomeHtml.includes("window.__DINOU_STATIC_EXPORT__=true;"));
      assert.ok(outAboutHtml.includes("window.__DINOU_STATIC_EXPORT__=true;"));
      assert.equal(fs.readFileSync(path.join(outDir, "page.rsc"), "utf8"), '0:"home-page"\n');
      assert.equal(fs.readFileSync(path.join(outDir, "layout.rsc"), "utf8"), '0:"root-layout"\n');
      assert.equal(
        fs.readFileSync(path.join(outDir, "about/page.rsc"), "utf8"),
        '0:"about-page"\n'
      );
    } finally {
      try {
        fs.rmSync(tmpExport, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {}
    }
  });
});
```

---

### 6.2. Playwright E2E Test Suite (`tests/e2e/public-static-assets.spec.ts`)

Verifies live HTTP `GET` and `HEAD` static file serving, `Cache-Control` differentiation, `/.well-known/*` & PWA `/manifest.json` support, URL-encoded space handling, path-traversal/dotfile rejection, `.dinou/dist1` physical isolation against a production Dinou server, and full serverless `dinou export-static` hydration + `<Link>` SPA navigation over a zero-Dinou static HTTP server.

```typescript
// tests/e2e/public-static-assets.spec.ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";

const PORT = 4194;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const STATIC_EXPORT_PORT = 4195;
const STATIC_EXPORT_URL = `http://127.0.0.1:${STATIC_EXPORT_PORT}`;

test.describe("Public Static Assets, .dinou/dist1 Isolation & Static Export SPA (E2E)", () => {
  let appDir = "";
  let dinouRoot = "";
  let serverProc: ChildProcess | null = null;

  test.beforeAll(async () => {
    const workspaceRoot = process.cwd();
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-e2e-public-"));

    if (fs.existsSync(path.join(workspaceRoot, "core/export-static.js"))) {
      dinouRoot = workspaceRoot;
    } else if (fs.existsSync(path.join(workspaceRoot, "dinou/core/export-static.js"))) {
      dinouRoot = path.join(workspaceRoot, "dinou");
    } else {
      dinouRoot = path.join(workspaceRoot, "node_modules/dinou");
    }

    // Link node_modules (and ensure "dinou" package is resolvable in both upstream & app repos)
    if (fs.existsSync(path.join(workspaceRoot, "node_modules/dinou"))) {
      fs.symlinkSync(
        path.join(workspaceRoot, "node_modules"),
        path.join(appDir, "node_modules"),
        process.platform === "win32" ? "junction" : "dir"
      );
    } else {
      fs.mkdirSync(path.join(appDir, "node_modules"), { recursive: true });
      for (const entry of fs.readdirSync(path.join(workspaceRoot, "node_modules"))) {
        fs.symlinkSync(
          path.join(workspaceRoot, "node_modules", entry),
          path.join(appDir, "node_modules", entry),
          process.platform === "win32" ? "junction" : "dir"
        );
      }
      fs.symlinkSync(
        dinouRoot,
        path.join(appDir, "node_modules/dinou"),
        process.platform === "win32" ? "junction" : "dir"
      );
    }

    if (fs.existsSync(path.join(workspaceRoot, "dinou"))) {
      fs.symlinkSync(
        path.join(workspaceRoot, "dinou"),
        path.join(appDir, "dinou"),
        process.platform === "win32" ? "junction" : "dir"
      );
    }

    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify(
        {
          name: "dinou-e2e-public-fixture",
          private: true,
          type: "module",
        },
        null,
        2
      )
    );

    // Create minimal 2-route Dinou app in src/ (with Layout, <Link>, Client Component & Server Function)
    fs.mkdirSync(path.join(appDir, "src/about"), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "src/actions.ts"),
      `"use server";\nexport async function pingAction() {\n  return "pong";\n}\n`
    );
    fs.writeFileSync(
      path.join(appDir, "src/client-badge.tsx"),
      `"use client";\nimport { pingAction } from "./actions";\nexport function ClientBadge() {\n  return <span data-action={typeof pingAction}>Client Ready</span>;\n}\n`
    );
    fs.writeFileSync(
      path.join(appDir, "src/layout.tsx"),
      `import type { ReactNode } from "react";
      export default function RootLayout({ children }: { children: ReactNode }) {
        return (
          <html lang="en">
            <head>
              <title>Public Assets E2E</title>
              <link rel="manifest" href="/manifest.json" />
            </head>
            <body>{children}</body>
          </html>
        );
      }\n`
    );
    fs.writeFileSync(
      path.join(appDir, "src/page.tsx"),
      `import { Link } from "./dinou";
      import { ClientBadge } from "./client-badge";
      export default function HomePage() {
        return (
          <main>
            <h1>Public Assets E2E Ready</h1>
            <ClientBadge />
            <Link href="/about">Go to About</Link>
          </main>
        );
      }\n`
    );
    fs.writeFileSync(
      path.join(appDir, "src/about/page.tsx"),
      `import { Link } from "./dinou";
      export default function AboutPage() {
        return (
          <main>
            <h1>About Static Export</h1>
            <Link href="/">Back Home</Link>
          </main>
        );
      }\n`
    );

    // Populate public/ with root files, PWA manifest.json, nested folders, spaces, and .well-known/
    fs.mkdirSync(path.join(appDir, "public/images/nested"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "public/docs"), { recursive: true });
    fs.mkdirSync(path.join(appDir, "public/.well-known"), { recursive: true });

    fs.writeFileSync(path.join(appDir, "public/robots.txt"), "User-agent: *\nAllow: /\n");
    fs.writeFileSync(
      path.join(appDir, "public/sitemap.xml"),
      '<?xml version="1.0" encoding="UTF-8"?><urlset></urlset>'
    );
    fs.writeFileSync(
      path.join(appDir, "public/manifest.json"),
      JSON.stringify({ name: "Dinou PWA Fixture", display: "standalone" })
    );
    fs.writeFileSync(
      path.join(appDir, "public/site.webmanifest"),
      JSON.stringify({ name: "Dinou Webmanifest" })
    );
    fs.writeFileSync(path.join(appDir, "public/images/nested/banner.svg"), "<svg></svg>");
    fs.writeFileSync(path.join(appDir, "public/docs/brochure 2026.pdf"), "%PDF-1.7 fixture");
    fs.writeFileSync(
      path.join(appDir, "public/.well-known/assetlinks.json"),
      '[{"relation":["delegate_permission/common.handle_all_urls"]}]'
    );
    fs.writeFileSync(
      path.join(appDir, "public/.well-known/apple-app-site-association"),
      '{"applinks":{"apps":[]}}'
    );
    // Dotfile in public/ that must NOT be served over HTTP
    fs.writeFileSync(path.join(appDir, "public/.env"), "SECRET_KEY=should_never_leak");

    const cliPath = path.join(dinouRoot, "cli.js");

    execFileSync(process.execPath, [cliPath, "build"], {
      cwd: appDir,
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production" },
    });

    serverProc = spawn(process.execPath, [path.join(appDir, ".dinou/node/server.mjs")], {
      cwd: appDir,
      env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
      stdio: "pipe",
    });

    // Wait for server readiness
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`${BASE_URL}/robots.txt`);
        if (res.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  test.afterAll(async () => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
    }
    if (appDir) {
      try {
        fs.rmSync(appDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {}
    }
  });

  test("consolidates server bundles & all internal manifests in .dinou/dist1 while keeping .dinou/dist3 pure", async () => {
    expect(fs.existsSync(path.join(appDir, ".dinou/dist1/server/handler.js"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, ".dinou/dist1/server/netlify.js"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, ".dinou/dist1/server/package.json"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, ".dinou/dist1/manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, ".dinou/dist1/react-client-manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, ".dinou/dist1/server-functions-manifest.json"))).toBe(
      true
    );

    expect(fs.existsSync(path.join(appDir, ".dinou/react_client_manifest"))).toBe(false);
    expect(fs.existsSync(path.join(appDir, ".dinou/server_functions_manifest"))).toBe(false);
    expect(fs.existsSync(path.join(appDir, ".dinou/dist3/server"))).toBe(false);
    expect(fs.existsSync(path.join(appDir, ".dinou/dist3/react-client-manifest.json"))).toBe(false);
    expect(fs.existsSync(path.join(appDir, ".dinou/dist3/server-functions-manifest.json"))).toBe(
      false
    );
  });

  test("serves root, nested, URL-encoded, PWA /manifest.json, and /.well-known/* files with accurate MIME & Cache-Control headers", async ({
    request,
  }) => {
    const pwaRes = await request.get(`${BASE_URL}/manifest.json`);
    expect(pwaRes.status()).toBe(200);
    expect(pwaRes.headers()["content-type"]).toBe("application/json; charset=utf-8");
    expect(pwaRes.headers()["cache-control"]).toBe("public, max-age=0, must-revalidate");
    expect(await pwaRes.json()).toEqual({
      name: "Dinou PWA Fixture",
      display: "standalone",
    });

    const webmanifestRes = await request.get(`${BASE_URL}/site.webmanifest`);
    expect(webmanifestRes.status()).toBe(200);
    expect(webmanifestRes.headers()["content-type"]).toBe(
      "application/manifest+json; charset=utf-8"
    );

    const sitemapRes = await request.get(`${BASE_URL}/sitemap.xml`);
    expect(sitemapRes.status()).toBe(200);
    expect(sitemapRes.headers()["content-type"]).toBe("application/xml; charset=utf-8");
    expect(sitemapRes.headers()["cache-control"]).toBe("public, max-age=0, must-revalidate");

    const pdfRes = await request.get(`${BASE_URL}/docs/brochure%202026.pdf`);
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()["content-type"]).toBe("application/pdf");
    expect(await pdfRes.text()).toBe("%PDF-1.7 fixture");

    const headRes = await request.head(`${BASE_URL}/images/nested/banner.svg`);
    expect(headRes.status()).toBe(200);
    expect(headRes.headers()["content-type"]).toBe("image/svg+xml");
    expect(Number(headRes.headers()["content-length"])).toBeGreaterThan(0);

    const aasaRes = await request.get(`${BASE_URL}/.well-known/apple-app-site-association`);
    expect(aasaRes.status()).toBe(200);
    expect(aasaRes.headers()["content-type"]).toBe("application/json; charset=utf-8");
    expect(await aasaRes.json()).toEqual({ applinks: { apps: [] } });

    // Hashed main-*.js chunk must receive immutable 1-year Cache-Control
    const bundlerManifest = JSON.parse(
      fs.readFileSync(path.join(appDir, ".dinou/dist1/manifest.json"), "utf8")
    );
    const mainChunk = bundlerManifest["main.js"];
    expect(mainChunk).toMatch(/^main-.*\.js$/);

    const chunkRes = await request.get(`${BASE_URL}/${mainChunk}`);
    expect(chunkRes.status()).toBe(200);
    expect(chunkRes.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  test("returns 404 for dotfiles, path traversal attempts, and internal server/manifest paths", async ({
    request,
  }) => {
    const forbiddenPaths = [
      "/.env",
      "/%2e%2e/package.json",
      "/server/handler.js",
      "/server/netlify.js",
      "/react-client-manifest.json",
      "/react-ssr-manifest.json",
      "/server-functions-manifest.json",
    ];

    for (const p of forbiddenPaths) {
      const res = await request.get(`${BASE_URL}${p}`);
      expect(res.status(), `Expected ${p} to return 404`).toBe(404);
    }
  });

  test("renders the page in Chromium with the hashed client bundle and links /manifest.json", async ({
    page,
  }) => {
    await page.goto(BASE_URL);
    await expect(page.locator("h1")).toHaveText("Public Assets E2E Ready");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.json");
  });

  test("exports a clean out/ static site and performs serverless SPA hydration & <Link> navigation via page.rsc and layout.rsc", async ({
    page,
  }) => {
    execFileSync(process.execPath, [path.join(dinouRoot, "core/export-static.js")], {
      cwd: appDir,
      stdio: "pipe",
    });

    const outDir = path.join(appDir, "out");
    expect(fs.existsSync(path.join(outDir, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "page.rsc"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "layout.rsc"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "about/index.html"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "about/page.rsc"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "manifest.json"))).toBe(true);

    // Internal .dinou/dist2 files must never leak into out/
    expect(fs.existsSync(path.join(outDir, "metadata.json"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "layout.metadata.json"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "rsc.rsc"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "about/metadata.json"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "about/rsc.rsc"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "status-manifest.json"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "slots"))).toBe(false);

    expect(fs.readFileSync(path.join(outDir, "index.html"), "utf8")).toContain(
      "window.__DINOU_STATIC_EXPORT__=true;"
    );
    expect(fs.readFileSync(path.join(outDir, "about/index.html"), "utf8")).toContain(
      "window.__DINOU_STATIC_EXPORT__=true;"
    );

    // Serve out/ over a pure zero-Dinou static file server (mimicking S3 / GitHub Pages / Cloudflare Pages)
    const mimeByExt: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".rsc": "application/octet-stream",
    };

    const staticServer = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || "/", STATIC_EXPORT_URL);
      const relPath = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, "");
      let target = path.resolve(outDir, relPath);

      if (!target.startsWith(path.resolve(outDir))) {
        res.writeHead(403).end("Forbidden");
        return;
      }

      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        target = path.join(target, "index.html");
      }

      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not Found");
        return;
      }

      const ext = path.extname(target).toLowerCase();
      res.writeHead(200, {
        "Content-Type": mimeByExt[ext] || "application/octet-stream",
      });
      res.end(fs.readFileSync(target));
    });

    await new Promise<void>((resolve) =>
      staticServer.listen(STATIC_EXPORT_PORT, "127.0.0.1", () => resolve())
    );

    const requestedPaths: string[] = [];
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (u.origin === STATIC_EXPORT_URL) {
        requestedPaths.push(u.pathname);
      }
    });

    try {
      await page.goto(STATIC_EXPORT_URL);
      await expect(page.locator("body")).toHaveAttribute("data-hydrated", "true");
      await expect(page.locator("h1")).toHaveText("Public Assets E2E Ready");

      // Mark window instance to prove subsequent <Link> click does NOT trigger a full browser reload
      await page.evaluate(() => {
        (window as unknown as { __SPA_SESSION_ALIVE__?: boolean }).__SPA_SESSION_ALIVE__ = true;
      });

      await page.getByRole("link", { name: "Go to About" }).click();
      await expect(page).toHaveURL(`${STATIC_EXPORT_URL}/about`);
      await expect(page.locator("h1")).toHaveText("About Static Export");

      const spaPreserved = await page.evaluate(
        () => (window as unknown as { __SPA_SESSION_ALIVE__?: boolean }).__SPA_SESSION_ALIVE__
      );
      expect(spaPreserved).toBe(true);

      // Verify static .rsc files were fetched and zero server-only /____rsc_* endpoints were hit
      expect(requestedPaths).toContain("/layout.rsc");
      expect(requestedPaths).toContain("/page.rsc");
      expect(requestedPaths).toContain("/about/page.rsc");
      expect(requestedPaths.some((p) => p.startsWith("/____rsc_"))).toBe(false);
    } finally {
      await new Promise<void>((resolve) => staticServer.close(() => resolve()));
    }
  });
});
```
