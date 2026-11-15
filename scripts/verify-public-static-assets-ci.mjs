// scripts/verify-public-static-assets-ci.mjs
// Verifies Dinou public/ Static Assets Security, Multi-Bundler Copy Parity, Cloudflare Adapter & Static Export Isolation:
// 1. normalizePublicRequestPath, isInternalDinouAssetPath & resolveConfinedStaticFile block internal bundles/manifests, traversal, backslashes, null bytes & dotfiles while allowing RFC 8615 /.well-known/<file> and URL-encoded spaces/UTF-8
// 2. STATIC_MIME_TYPES, PUBLIC_STATIC_EXT_REGEX, getStaticContentType, isImmutableAssetPath & getStaticCacheControl resolve exact MIME types (including extensionless apple-app-site-association) and differentiate immutable hashed chunks vs must-revalidate public/ assets
// 3. copyStaticDirectoriesToOutdir recursively copies nested subdirectories, spaces, UTF-8 filenames & dotfiles (.well-known/*, .nojekyll) while filtering .DS_Store and Thumbs.db
// 4. Cloudflare Workers adapter (dinou/adapters/cloudflare.js) & isPublicStaticAssetRequest serve SEO/.well-known/PDF assets (GET & HEAD), rewrite apple-app-site-association Content-Type to application/json, and block /server/* & internal manifests without hitting env.ASSETS
// 5. Esbuild (prod + dev DINOU_WRITE_TO_DISK), Rollup (dinou-copy-static) & Webpack (CopyWebpackPlugin dot:true) copy public/ with 100% parity and ignore legacy pre-v6 favicons/
// 6. dinou/core/export-static.js & shouldExportDist3Entry export SSG HTML, client chunks, public/ & .nojekyll/.well-known/* while excluding server/*, _slots/*, .assetsignore & internal manifests/payloads

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const origCwd = projectRoot;
const origNodeEnv = process.env.NODE_ENV;
const origWriteToDisk = process.env.DINOU_WRITE_TO_DISK;
process.env.DINOU_WRITE_TO_DISK = "false";

const rootClientManifestPath = path.join(
  projectRoot,
  ".dinou/react_client_manifest/react-client-manifest.json"
);
const rootSfManifestPath = path.join(
  projectRoot,
  ".dinou/server_functions_manifest/server-functions-manifest.json"
);
const rootClientManifestBefore = fs.existsSync(rootClientManifestPath)
  ? fs.readFileSync(rootClientManifestPath, "utf8")
  : null;
const rootSfManifestBefore = fs.existsSync(rootSfManifestPath)
  ? fs.readFileSync(rootSfManifestPath, "utf8")
  : null;

const dinouRootCandidates = [
  path.resolve(projectRoot, "dinou"),
  path.resolve(projectRoot, "node_modules/dinou/dinou"),
  path.resolve(projectRoot, "node_modules/dinou"),
];
const dinouRoot =
  dinouRootCandidates.find((dir) => fs.existsSync(path.join(dir, "core"))) ??
  dinouRootCandidates[0];
const dinouPkgJson =
  [
    path.join(dinouRoot, "package.json"),
    path.resolve(projectRoot, "node_modules/dinou/package.json"),
    path.resolve(projectRoot, "package.json"),
  ].find((p) => fs.existsSync(p)) ?? path.join(dinouRoot, "package.json");

const dinouRequire = createRequire(dinouPkgJson);

const importDinou = (relPath) =>
  import(pathToFileURL(path.join(dinouRoot, relPath)).href);

const {
  STATIC_MIME_TYPES,
  PUBLIC_STATIC_EXT_REGEX,
  getStaticContentType,
  isInternalDinouAssetPath,
  normalizePublicRequestPath,
  resolveConfinedStaticFile,
  isImmutableAssetPath,
  getStaticCacheControl,
  isPublicStaticAssetRequest,
  shouldExportDist3Entry,
} = await importDinou("core/static-assets.js");

const { copyStaticDirectoriesToOutdir } = await importDinou(
  "core/copy-static-dirs.js"
);

console.log(
  "1️⃣ Verifying normalizePublicRequestPath, isInternalDinouAssetPath & resolveConfinedStaticFile security confinement..."
);
{
  const blockedUrls = [
    "",
    "/",
    "favicon.ico",
    "/server/handler.js",
    "/server/handler.js.map",
    "/server/netlify.js",
    "/server/package.json",
    "/SERVER/HANDLER.JS",
    "/_slots/header.html",
    "/_SLOTS/sidebar.rsc",
    "/manifest.json",
    "/MANIFEST.JSON",
    "/react-client-manifest.json",
    "/server-functions-manifest.json",
    "/status-manifest.json",
    "/index.html",
    "/about/index.html",
    "/about/shell.html",
    "/about/metadata.json",
    "/about/layout.metadata.json",
    "/about/shell.layout.json",
    "/about/rsc.rsc",
    "/main._old.js",
    "/../package.json",
    "/%2e%2e/package.json",
    "/%2E%2E/%2E%2E/etc/passwd",
    "/images/%2e%2e/%2e%2e/secret.txt",
    "/./robots.txt",
    "/%2e/robots.txt",
    "/images%5c..%5csecret.txt",
    "/images\\badge.svg",
    "/bad%00.png",
    "/bad\0.png",
    "/%E0%A4%A",
    "/.env",
    "/.env.local",
    "/.git/config",
    "/.nojekyll",
    "/.assetsignore",
    "/images/.DS_Store",
    "/.well-known",
    "/.well-known/",
    "/.well-known/.hidden",
    "/.well-known/sub/.secret",
  ];

  for (const url of blockedUrls) {
    assert.equal(
      normalizePublicRequestPath(url),
      null,
      `Expected normalizePublicRequestPath(${JSON.stringify(url)}) to return null`
    );
  }

  assert.equal(normalizePublicRequestPath("/favicon.ico"), "favicon.ico");
  assert.equal(normalizePublicRequestPath("/robots.txt"), "robots.txt");
  assert.equal(normalizePublicRequestPath("/sitemap.xml"), "sitemap.xml");
  assert.equal(
    normalizePublicRequestPath("/site.webmanifest"),
    "site.webmanifest"
  );
  assert.equal(
    normalizePublicRequestPath("/google1a2b3c4d5e6f.html"),
    "google1a2b3c4d5e6f.html"
  );
  assert.equal(
    normalizePublicRequestPath("/images/og-image.png"),
    "images/og-image.png"
  );
  assert.equal(
    normalizePublicRequestPath("/images/nested/badge.svg"),
    "images/nested/badge.svg"
  );
  assert.equal(
    normalizePublicRequestPath("/downloads/brochure%202026.pdf"),
    "downloads/brochure 2026.pdf"
  );
  assert.equal(
    normalizePublicRequestPath("/docs/gu%C3%ADa%20t%C3%A9cnica.pdf"),
    "docs/guía técnica.pdf"
  );
  // Non-root manifest.json inside a subfolder (e.g. /pwa/manifest.json) is NOT a root internal manifest
  assert.equal(
    normalizePublicRequestPath("/pwa/manifest.json"),
    "pwa/manifest.json"
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
    normalizePublicRequestPath("/.well-known/oauth-authorization-server"),
    ".well-known/oauth-authorization-server"
  );

  assert.equal(isInternalDinouAssetPath(""), true);
  assert.equal(isInternalDinouAssetPath("server/handler.js"), true);
  assert.equal(isInternalDinouAssetPath("_slots/main"), true);
  assert.equal(isInternalDinouAssetPath("manifest.json"), true);
  assert.equal(isInternalDinouAssetPath("pwa/manifest.json"), false);
  assert.equal(isInternalDinouAssetPath("robots.txt"), false);

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-confine-"));
  try {
    assert.equal(resolveConfinedStaticFile(tmpBase, "../outside.txt"), null);
    assert.equal(resolveConfinedStaticFile(tmpBase, "a/../../outside.txt"), null);
    assert.equal(resolveConfinedStaticFile(tmpBase, "a\\b.txt"), null);
    assert.equal(resolveConfinedStaticFile(tmpBase, "a\0b.txt"), null);
    assert.equal(resolveConfinedStaticFile(tmpBase, ""), null);

    const safeResolved = resolveConfinedStaticFile(
      tmpBase,
      "images/nested/badge.svg"
    );
    assert.equal(
      safeResolved,
      path.join(tmpBase, "images", "nested", "badge.svg")
    );
    assert.ok(safeResolved.startsWith(path.resolve(tmpBase) + path.sep));
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

console.log(
  "2️⃣ Verifying STATIC_MIME_TYPES, PUBLIC_STATIC_EXT_REGEX, getStaticContentType & getStaticCacheControl..."
);
{
  const mimeKeys = Object.keys(STATIC_MIME_TYPES);
  assert.ok(
    mimeKeys.length >= 41,
    `Expected at least 41 extensions in STATIC_MIME_TYPES, got ${mimeKeys.length}`
  );
  for (const ext of mimeKeys) {
    assert.equal(
      PUBLIC_STATIC_EXT_REGEX.test(`sample${ext}`),
      true,
      `Expected PUBLIC_STATIC_EXT_REGEX to match sample${ext}`
    );
    assert.equal(
      PUBLIC_STATIC_EXT_REGEX.test(`SAMPLE${ext.toUpperCase()}`),
      true,
      `Expected PUBLIC_STATIC_EXT_REGEX to match uppercase SAMPLE${ext.toUpperCase()}`
    );
  }

  assert.equal(
    getStaticContentType("/robots.txt"),
    "text/plain; charset=utf-8"
  );
  assert.equal(
    getStaticContentType("/sitemap.xml"),
    "application/xml; charset=utf-8"
  );
  assert.equal(
    getStaticContentType("/feed.rss"),
    "application/rss+xml; charset=utf-8"
  );
  assert.equal(
    getStaticContentType("/feed.atom"),
    "application/atom+xml; charset=utf-8"
  );
  assert.equal(
    getStaticContentType("/site.webmanifest"),
    "application/manifest+json; charset=utf-8"
  );
  assert.equal(
    getStaticContentType("/.well-known/assetlinks.json"),
    "application/json; charset=utf-8"
  );
  assert.equal(
    getStaticContentType("/.well-known/apple-app-site-association"),
    "application/json; charset=utf-8"
  );
  assert.equal(
    getStaticContentType("public\\.well-known\\apple-app-site-association"),
    "application/json; charset=utf-8"
  );
  assert.equal(
    getStaticContentType("/downloads/brochure 2026.pdf"),
    "application/pdf"
  );
  assert.equal(getStaticContentType("/images/og-image.png"), "image/png");
  assert.equal(getStaticContentType("/images/nested/badge.svg"), "image/svg+xml");
  assert.equal(getStaticContentType("/images/hero.avif"), "image/avif");
  assert.equal(getStaticContentType("/fonts/inter.woff2"), "font/woff2");
  assert.equal(getStaticContentType("/wasm/engine.wasm"), "application/wasm");
  assert.equal(getStaticContentType("/media/intro.mp4"), "video/mp4");
  assert.equal(getStaticContentType("/media/podcast.mp3"), "audio/mpeg");
  assert.equal(getStaticContentType("/calendar/invite.ics"), "text/calendar; charset=utf-8");
  assert.equal(getStaticContentType("/captions/en.vtt"), "text/vtt; charset=utf-8");
  assert.equal(getStaticContentType("/archive/release.zip"), "application/zip");
  assert.equal(getStaticContentType("/extensionless-binary"), "application/octet-stream");
  assert.equal(getStaticContentType(""), "application/octet-stream");

  // Content-hashed immutable chunks across Esbuild, Webpack & Rollup + /assets/*
  const immutablePaths = [
    "main-ZGBKXIUF.js",
    "chunk-A1B2C3D4.mjs",
    "main-4f8a9c1203e4b5d6.js",
    "styles-4f8a9c1203e4b5d6a1b2c3d4.css",
    "chunk-B9x_2kL1.js",
    "chunk-Ab12Cd34.js.map",
    "assets/logo-hash.png",
    "/assets/hero.webp",
  ];
  for (const p of immutablePaths) {
    assert.equal(
      isImmutableAssetPath(p),
      true,
      `Expected isImmutableAssetPath(${p}) === true`
    );
    assert.equal(
      getStaticCacheControl(p),
      "public, max-age=31536000, immutable",
      `Expected immutable Cache-Control for ${p}`
    );
  }

  // Unhashed public/ assets & unhashed CSS/JS must revalidate
  const revalidatePaths = [
    "robots.txt",
    "sitemap.xml",
    "favicon.ico",
    "site.webmanifest",
    "styles.css",
    "main.js",
    "service-worker.js",
    "analytics-widget.js",
    "images/og-image.png",
    ".well-known/assetlinks.json",
    ".well-known/apple-app-site-association",
  ];
  for (const p of revalidatePaths) {
    assert.equal(
      isImmutableAssetPath(p),
      false,
      `Expected isImmutableAssetPath(${p}) === false`
    );
    assert.equal(
      getStaticCacheControl(p),
      "public, max-age=0, must-revalidate",
      `Expected must-revalidate Cache-Control for ${p}`
    );
  }
}

console.log(
  "3️⃣ Verifying copyStaticDirectoriesToOutdir recursive structure, dotfiles & OS junk filtering..."
);
{
  const tmpCopy = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-copy-unit-"));
  try {
    // Returns false cleanly when public/ does not exist
    assert.equal(copyStaticDirectoriesToOutdir(tmpCopy, "out-missing"), false);

    fs.mkdirSync(path.join(tmpCopy, "public/images/deep"), { recursive: true });
    fs.mkdirSync(path.join(tmpCopy, "public/.well-known"), { recursive: true });
    fs.writeFileSync(path.join(tmpCopy, "public/.nojekyll"), "");
    fs.writeFileSync(
      path.join(tmpCopy, "public/.well-known/assetlinks.json"),
      "[]"
    );
    fs.writeFileSync(
      path.join(tmpCopy, "public/images/deep/guía 2026.txt"),
      "utf8-ok"
    );
    fs.writeFileSync(path.join(tmpCopy, "public/.DS_Store"), "mac-junk");
    fs.writeFileSync(path.join(tmpCopy, "public/Thumbs.db"), "win-junk");
    fs.writeFileSync(
      path.join(tmpCopy, "public/images/deep/.DS_Store"),
      "nested-mac-junk"
    );
    fs.writeFileSync(
      path.join(tmpCopy, "public/images/deep/Thumbs.db"),
      "nested-win-junk"
    );

    assert.equal(copyStaticDirectoriesToOutdir(tmpCopy, "out-copied"), true);
    const dest = path.join(tmpCopy, "out-copied");
    assert.equal(fs.existsSync(path.join(dest, ".nojekyll")), true);
    assert.equal(
      fs.readFileSync(path.join(dest, ".well-known/assetlinks.json"), "utf8"),
      "[]"
    );
    assert.equal(
      fs.readFileSync(path.join(dest, "images/deep/guía 2026.txt"), "utf8"),
      "utf8-ok"
    );
    assert.equal(fs.existsSync(path.join(dest, ".DS_Store")), false);
    assert.equal(fs.existsSync(path.join(dest, "Thumbs.db")), false);
    assert.equal(
      fs.existsSync(path.join(dest, "images/deep/.DS_Store")),
      false
    );
    assert.equal(
      fs.existsSync(path.join(dest, "images/deep/Thumbs.db")),
      false
    );
  } finally {
    fs.rmSync(tmpCopy, { recursive: true, force: true });
  }
}

console.log(
  "4️⃣ Verifying Cloudflare Workers adapter & isPublicStaticAssetRequest (GET/HEAD, apple-app-site-association JSON rewrite & /server/* blocking)..."
);
{
  assert.equal(isPublicStaticAssetRequest("/sitemap.xml"), true);
  assert.equal(isPublicStaticAssetRequest("/robots.txt"), true);
  assert.equal(isPublicStaticAssetRequest("/site.webmanifest"), true);
  assert.equal(isPublicStaticAssetRequest("/.well-known/assetlinks.json"), true);
  assert.equal(
    isPublicStaticAssetRequest("/.well-known/apple-app-site-association"),
    true
  );
  assert.equal(isPublicStaticAssetRequest("/google1a2b3c4d5e6f.html"), true);
  assert.equal(
    isPublicStaticAssetRequest("/downloads/brochure%202026.pdf"),
    true
  );
  assert.equal(isPublicStaticAssetRequest("/assets/chunk.png"), true);

  assert.equal(isPublicStaticAssetRequest("/"), false);
  assert.equal(isPublicStaticAssetRequest("/about"), false);
  assert.equal(isPublicStaticAssetRequest("/about/index.html"), false);
  assert.equal(isPublicStaticAssetRequest("/about/metadata.json"), false);
  assert.equal(isPublicStaticAssetRequest("/server/handler.js"), false);
  assert.equal(isPublicStaticAssetRequest("/manifest.json"), false);
  assert.equal(isPublicStaticAssetRequest("/.nojekyll"), false);
  assert.equal(isPublicStaticAssetRequest("/.env"), false);

  const tmpCfDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-cf-adapter-"));
  try {
    fs.mkdirSync(path.join(tmpCfDir, "src"), { recursive: true });
    process.chdir(tmpCfDir);

    const { default: cfWorker } = await importDinou("adapters/cloudflare.js");
    const assetHits = [];
    const mockEnv = {
      ASSETS: {
        async fetch(req) {
          const u = new URL(req.url);
          assetHits.push(`${req.method}:${u.pathname}`);
          if (u.pathname === "/.well-known/apple-app-site-association") {
            return new Response(
              req.method === "HEAD" ? null : '{"applinks":{"apps":[]}}',
              {
                status: 200,
                headers: { "content-type": "application/octet-stream" },
              }
            );
          }
          if (u.pathname === "/sitemap.xml") {
            return new Response(
              req.method === "HEAD" ? null : "<urlset></urlset>",
              {
                status: 200,
                headers: { "content-type": "application/xml; charset=utf-8" },
              }
            );
          }
          return new Response("Not Found", { status: 404 });
        },
      },
    };

    const aasaGet = await cfWorker.fetch(
      new Request("https://example.com/.well-known/apple-app-site-association"),
      mockEnv,
      {}
    );
    assert.equal(aasaGet.status, 200);
    assert.equal(
      aasaGet.headers.get("content-type"),
      "application/json; charset=utf-8"
    );
    assert.deepEqual(await aasaGet.json(), { applinks: { apps: [] } });

    const aasaHead = await cfWorker.fetch(
      new Request(
        "https://example.com/.well-known/apple-app-site-association",
        { method: "HEAD" }
      ),
      mockEnv,
      {}
    );
    assert.equal(aasaHead.status, 200);
    assert.equal(
      aasaHead.headers.get("content-type"),
      "application/json; charset=utf-8"
    );
    assert.equal((await aasaHead.arrayBuffer()).byteLength, 0);

    const sitemapGet = await cfWorker.fetch(
      new Request("https://example.com/sitemap.xml"),
      mockEnv,
      {}
    );
    assert.equal(sitemapGet.status, 200);
    assert.ok(assetHits.includes("GET:/sitemap.xml"));

    assetHits.length = 0;
    for (const blocked of [
      "/server/handler.js",
      "/server/handler.js.map",
      "/manifest.json",
      "/react-client-manifest.json",
      "/server-functions-manifest.json",
      "/about/index.html",
      "/about/metadata.json",
      "/.env",
      "/.well-known/.hidden.json",
    ]) {
      const res = await cfWorker.fetch(
        new Request(`https://example.com${blocked}`),
        mockEnv,
        {}
      );
      assert.equal(
        res.status,
        404,
        `Expected Cloudflare adapter to return 404 for ${blocked}`
      );
    }
    assert.deepEqual(
      assetHits,
      [],
      "Expected Cloudflare adapter never to forward internal/dotfile paths to env.ASSETS"
    );
  } finally {
    process.chdir(origCwd);
    fs.rmSync(tmpCfDir, { recursive: true, force: true });
  }
}

console.log(
  "5️⃣ Verifying Esbuild (prod + dev), Rollup & Webpack public/ copy parity and legacy favicons/ removal..."
);
{
  const tmpBundlers = fs.mkdtempSync(
    path.join(os.tmpdir(), "dinou-public-bundlers-")
  );
  try {
    fs.writeFileSync(
      path.join(tmpBundlers, "package.json"),
      JSON.stringify({ name: "tmp-public-bundlers", type: "module" }, null, 2)
    );
    fs.mkdirSync(path.join(tmpBundlers, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpBundlers, "src/entry.js"),
      "export const ok = 1;\n"
    );

    // Legacy pre-v6 favicons/ directory (must be completely ignored by all bundlers)
    fs.mkdirSync(path.join(tmpBundlers, "favicons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpBundlers, "favicons/legacy-only.png"),
      "legacy-png"
    );

    // Modern public/ directory with nested subfolders, spaces, UTF-8, dotfiles & OS junk
    fs.mkdirSync(path.join(tmpBundlers, "public/images/nested"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpBundlers, "public/downloads"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpBundlers, "public/.well-known"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpBundlers, "public/favicon.ico"),
      "modern-public-favicon"
    );
    fs.writeFileSync(
      path.join(tmpBundlers, "public/images/nested/og-image.png"),
      "og-bytes"
    );
    fs.writeFileSync(
      path.join(tmpBundlers, "public/downloads/brochure 2026.pdf"),
      "pdf-bytes"
    );
    fs.writeFileSync(
      path.join(tmpBundlers, "public/.well-known/assetlinks.json"),
      '[{"relation":["delegate_permission/common.handle_all_urls"]}]'
    );
    fs.writeFileSync(
      path.join(tmpBundlers, "public/.well-known/apple-app-site-association"),
      '{"applinks":{"apps":[]}}'
    );
    fs.writeFileSync(path.join(tmpBundlers, "public/.nojekyll"), "");
    fs.writeFileSync(path.join(tmpBundlers, "public/.DS_Store"), "mac-junk");
    fs.writeFileSync(path.join(tmpBundlers, "public/Thumbs.db"), "win-junk");

    function assertBundlerStaticCopy(outDir, label) {
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
        fs.readFileSync(
          path.join(outDir, "images/nested/og-image.png"),
          "utf8"
        ),
        "og-bytes",
        `[${label}] nested folders must be preserved without flattening`
      );
      assert.equal(
        fs.readFileSync(
          path.join(outDir, "downloads/brochure 2026.pdf"),
          "utf8"
        ),
        "pdf-bytes",
        `[${label}] spaces in filenames must be preserved`
      );
      assert.ok(
        fs.existsSync(path.join(outDir, ".well-known/assetlinks.json")),
        `[${label}] .well-known/assetlinks.json must be copied`
      );
      assert.ok(
        fs.existsSync(
          path.join(outDir, ".well-known/apple-app-site-association")
        ),
        `[${label}] .well-known/apple-app-site-association must be copied`
      );
      assert.ok(
        fs.existsSync(path.join(outDir, ".nojekyll")),
        `[${label}] .nojekyll must be copied`
      );
      assert.equal(
        fs.existsSync(path.join(outDir, ".DS_Store")),
        false,
        `[${label}] .DS_Store must be excluded`
      );
      assert.equal(
        fs.existsSync(path.join(outDir, "Thumbs.db")),
        false,
        `[${label}] Thumbs.db must be excluded`
      );
    }

    // Switch cwd and NODE_ENV BEFORE importing Rollup & Webpack configs
    process.chdir(tmpBundlers);
    process.env.NODE_ENV = "production";

    // 5A. Esbuild Production (getConfigEsbuildProd)
    const esbuild = dinouRequire("esbuild");
    const { default: getConfigEsbuildProd } = await importDinou(
      "esbuild/helpers-esbuild/get-config-esbuild-prod.js"
    );
    const outEsbuildProd = path.join(tmpBundlers, "out-esbuild-prod");
    await esbuild.build(
      getConfigEsbuildProd({
        entryPoints: [path.join(tmpBundlers, "src/entry.js")],
        outdir: outEsbuildProd,
        manifest: {},
        serverFiles: new Set(),
        reactCompiler: false,
      })
    );
    assertBundlerStaticCopy(outEsbuildProd, "esbuild-prod");

    // 5B. Esbuild Dev with DINOU_WRITE_TO_DISK=true (getConfigEsbuild)
    process.env.DINOU_WRITE_TO_DISK = "true";
    const { default: getConfigEsbuild } = await importDinou(
      "esbuild/helpers-esbuild/get-config-esbuild.js"
    );
    const outEsbuildDev = path.join(tmpBundlers, "out-esbuild-dev");
    const devCfg = getConfigEsbuild({
      entryPoints: { entry: path.join(tmpBundlers, "src/entry.js") },
      outdir: outEsbuildDev,
      manifest: {},
      changedIds: new Set(),
      serverFiles: new Set(),
    });
    const copyOncePlugin = devCfg.plugins.find(
      (p) => p && p.name === "copy-static-files-once"
    );
    assert.ok(
      copyOncePlugin,
      "Expected getConfigEsbuild with DINOU_WRITE_TO_DISK=true to register copy-static-files-once"
    );
    await esbuild.build({
      entryPoints: [path.join(tmpBundlers, "src/entry.js")],
      outdir: outEsbuildDev,
      bundle: true,
      format: "esm",
      plugins: [copyOncePlugin],
    });
    assertBundlerStaticCopy(outEsbuildDev, "esbuild-dev");
    process.env.DINOU_WRITE_TO_DISK = "false";

    // 5C. Rollup (dinou-copy-static plugin)
    const { rollup } = dinouRequire("rollup");
    const { default: getRollupConfig } = await importDinou(
      "rollup/rollup.config.js"
    );
    const rollupConfigs = await getRollupConfig();
    const rollupClientCfg = Array.isArray(rollupConfigs)
      ? rollupConfigs[0]
      : rollupConfigs;
    const copyRollupPlugin = rollupClientCfg.plugins.find(
      (p) => p && p.name === "dinou-copy-static"
    );
    assert.ok(
      copyRollupPlugin,
      "Expected Rollup client config to include dinou-copy-static plugin"
    );
    const outRollup = path.join(tmpBundlers, ".dinou/dist3");
    const bundle = await rollup({
      input: path.join(tmpBundlers, "src/entry.js"),
      plugins: [copyRollupPlugin],
    });
    await bundle.write({ dir: outRollup, format: "esm" });
    await bundle.close();
    assertBundlerStaticCopy(outRollup, "rollup");

    // 5D. Webpack (CopyWebpackPlugin with dot: true & ignore .DS_Store/Thumbs.db)
    const webpack = dinouRequire("webpack");
    const { default: getWebpackConfig } = await importDinou(
      "webpack/webpack.config.js"
    );
    const wpConfigs = await getWebpackConfig();
    const wpClientCfg = Array.isArray(wpConfigs) ? wpConfigs[0] : wpConfigs;
    const copyWpPlugin = wpClientCfg.plugins.find(
      (p) => p && Array.isArray(p.patterns)
    );
    assert.ok(
      copyWpPlugin,
      "Expected Webpack client config to include CopyWebpackPlugin"
    );
    assert.equal(
      copyWpPlugin.patterns.length,
      1,
      "Expected CopyWebpackPlugin to only copy public/ (legacy favicons/ removed)"
    );
    assert.equal(copyWpPlugin.patterns[0].from, "public");
    assert.equal(copyWpPlugin.patterns[0].globOptions?.dot, true);

    const outWebpack = path.join(tmpBundlers, "out-webpack");
    await new Promise((resolve, reject) => {
      const compiler = webpack(
        {
          mode: "production",
          context: tmpBundlers,
          entry: path.join(tmpBundlers, "src/entry.js"),
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
    assertBundlerStaticCopy(outWebpack, "webpack");
  } finally {
    process.chdir(origCwd);
    process.env.DINOU_WRITE_TO_DISK = "false";
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    try {
      fs.rmSync(tmpBundlers, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      });
    } catch {}
  }
}

console.log(
  "6️⃣ Verifying export-static.js & shouldExportDist3Entry exclude server/*, _slots/* & internal manifests from out/..."
);
{
  assert.equal(shouldExportDist3Entry(""), false);
  assert.equal(shouldExportDist3Entry("server"), false);
  assert.equal(shouldExportDist3Entry("server/handler.js"), false);
  assert.equal(shouldExportDist3Entry("_slots"), false);
  assert.equal(shouldExportDist3Entry("_slots/sidebar.rsc"), false);
  assert.equal(shouldExportDist3Entry("manifest.json"), false);
  assert.equal(shouldExportDist3Entry("react-client-manifest.json"), false);
  assert.equal(shouldExportDist3Entry("server-functions-manifest.json"), false);
  assert.equal(shouldExportDist3Entry("status-manifest.json"), false);
  assert.equal(shouldExportDist3Entry(".assetsignore"), false);
  assert.equal(shouldExportDist3Entry(".DS_Store"), false);
  assert.equal(shouldExportDist3Entry("images/Thumbs.db"), false);
  assert.equal(shouldExportDist3Entry("about/shell.html"), false);
  assert.equal(shouldExportDist3Entry("about/metadata.json"), false);
  assert.equal(shouldExportDist3Entry("about/layout.metadata.json"), false);
  assert.equal(shouldExportDist3Entry("about/shell.layout.json"), false);
  assert.equal(shouldExportDist3Entry("about/rsc.rsc"), false);
  assert.equal(shouldExportDist3Entry("main._old.js"), false);

  assert.equal(shouldExportDist3Entry("main-ZGBKXIUF.js"), true);
  assert.equal(shouldExportDist3Entry("robots.txt"), true);
  assert.equal(shouldExportDist3Entry(".nojekyll"), true);
  assert.equal(shouldExportDist3Entry(".well-known/assetlinks.json"), true);
  assert.equal(shouldExportDist3Entry("pwa/manifest.json"), true);

  const tmpExport = fs.mkdtempSync(
    path.join(os.tmpdir(), "dinou-export-clean-")
  );
  try {
    fs.mkdirSync(path.join(tmpExport, ".dinou/dist3/server"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpExport, ".dinou/dist3/_slots"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpExport, ".dinou/dist3/.well-known"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpExport, ".dinou/dist3/images/nested"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpExport, ".dinou/dist2/about"), {
      recursive: true,
    });

    // Internal artifacts in .dinou/dist3 that MUST NOT leak to out/
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/server/handler.js"),
      "SERVER_SECRET"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/server/handler.js.map"),
      "MAP"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/server/netlify.js"),
      "NETLIFY"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/_slots/nav.rsc"),
      "SLOT"
    );
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/manifest.json"), "{}");
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/react-client-manifest.json"),
      "{}"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/server-functions-manifest.json"),
      "{}"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/status-manifest.json"),
      "{}"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/.assetsignore"),
      "/server\n"
    );
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/rsc.rsc"), "RSC");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/shell.html"), "SHELL");
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/metadata.json"),
      "{}"
    );
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/main._old.js"), "OLD");

    // Legitimate client & public assets in .dinou/dist3 + SSG HTML in .dinou/dist2
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/main-ZGBKXIUF.js"),
      "console.log(1)"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/robots.txt"),
      "User-agent: *"
    );
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/.nojekyll"), "");
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/.well-known/assetlinks.json"),
      "[]"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/images/nested/badge.svg"),
      "<svg/>"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/index.html"),
      "<html>Home</html>"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/about/index.html"),
      "<html>About</html>"
    );

    execFileSync(
      process.execPath,
      [path.join(dinouRoot, "core/export-static.js")],
      {
        cwd: tmpExport,
        stdio: "pipe",
      }
    );

    const outDir = path.join(tmpExport, "out");
    for (const excluded of [
      "server",
      "_slots",
      "manifest.json",
      "react-client-manifest.json",
      "server-functions-manifest.json",
      "status-manifest.json",
      ".assetsignore",
      "rsc.rsc",
      "shell.html",
      "metadata.json",
      "main._old.js",
    ]) {
      assert.equal(
        fs.existsSync(path.join(outDir, excluded)),
        false,
        `Expected out/${excluded} to be excluded from static export`
      );
    }

    for (const included of [
      "main-ZGBKXIUF.js",
      "robots.txt",
      ".nojekyll",
      ".well-known/assetlinks.json",
      "images/nested/badge.svg",
      "index.html",
      "about/index.html",
    ]) {
      assert.equal(
        fs.existsSync(path.join(outDir, included)),
        true,
        `Expected out/${included} to be exported`
      );
    }
  } finally {
    try {
      fs.rmSync(tmpExport, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      });
    } catch {}
  }
}

// Guard: verify projectRoot/.dinou manifests were never mutated
const rootClientManifestAfter = fs.existsSync(rootClientManifestPath)
  ? fs.readFileSync(rootClientManifestPath, "utf8")
  : null;
const rootSfManifestAfter = fs.existsSync(rootSfManifestPath)
  ? fs.readFileSync(rootSfManifestPath, "utf8")
  : null;
assert.equal(
  rootClientManifestAfter,
  rootClientManifestBefore,
  "Standalone verification script must never mutate projectRoot/.dinou/react_client_manifest"
);
assert.equal(
  rootSfManifestAfter,
  rootSfManifestBefore,
  "Standalone verification script must never mutate projectRoot/.dinou/server_functions_manifest"
);

if (origWriteToDisk === undefined) delete process.env.DINOU_WRITE_TO_DISK;
else process.env.DINOU_WRITE_TO_DISK = origWriteToDisk;

console.log(
  "RESULT: All public/ static assets security, multi-bundler copy parity, Cloudflare adapter & export-static checks PASSED"
);
