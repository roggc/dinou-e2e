// scripts/verify-public-static-assets-ci.mjs
// Verifies Dinou public/ Static Assets Parity, Security Hardening, .dinou/dist1 Physical Isolation & Static Export SPA (v9.4.0):
// 1. normalizePublicRequestPath, isInternalDinouAssetPath & resolveConfinedStaticFile allow PWA /manifest.json, /server/diagram.png, spaces & RFC 8615 /.well-known/* while blocking /slots/*, /status-manifest.json, dist2 route HTML/metadata/RSC artifacts, traversal, backslashes, null bytes & dotfiles
// 2. STATIC_MIME_TYPES, PUBLIC_STATIC_EXT_REGEX, getStaticContentType, isImmutableAssetPath & getStaticCacheControl resolve exact MIME types (including extensionless apple-app-site-association & /manifest.json) and differentiate immutable hashed chunks vs must-revalidate public/ assets
// 3. copyStaticDirectoriesToOutdir recursively copies nested subdirectories, spaces, UTF-8 filenames & dotfiles (.well-known/*, .nojekyll) while filtering .DS_Store and Thumbs.db
// 4. Cloudflare Workers adapter (dinou/adapters/cloudflare.js) & isPublicStaticAssetRequest serve PWA /manifest.json, SEO, .well-known & PDF assets (GET & HEAD), rewrite apple-app-site-association Content-Type to application/json, and block /slots/* & dist2 cache artifacts without hitting env.ASSETS
// 5. Esbuild, Rollup & Webpack consolidate server/* and ALL internal manifests in .dinou/dist1 (and .dinou/node-dev in dev disk mode), keep .dinou/dist3 100% pure (including deno/build.js), preserve user public/manifest.json, ignore legacy favicons/, and wire static-export RSC routing across client.jsx, client-webpack.jsx & cli.js
// 6. dinou/core/export-static.js, shouldExportDist3Entry, shouldExportDist2File & injectStaticExportFlag export index.html (with __DINOU_STATIC_EXPORT__ without mutating .dinou/dist2), page.rsc, layout.rsc, client chunks, user PWA manifest.json & .nojekyll/.well-known/* while excluding slots/*, status-manifest.json & internal dist2 metadata

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
  STATIC_EXPORT_SCRIPT,
  getStaticContentType,
  isInternalDinouAssetPath,
  normalizePublicRequestPath,
  resolveConfinedStaticFile,
  isImmutableAssetPath,
  getStaticCacheControl,
  isPublicStaticAssetRequest,
  shouldExportDist3Entry,
  shouldExportDist2File,
  injectStaticExportFlag,
} = await importDinou("core/static-assets.js");

const { copyStaticDirectoriesToOutdir } = await importDinou(
  "core/copy-static-dirs.js"
);

console.log(
  "1️⃣ Verifying normalizePublicRequestPath, isInternalDinouAssetPath & resolveConfinedStaticFile (allowing PWA /manifest.json & /server/* public assets while blocking dist2 cache artifacts & traversal)..."
);
{
  const blockedUrls = [
    "",
    "/",
    "favicon.ico",
    "/slots/home-hero/slot.json",
    "/slots/home-hero/slot.metadata.json",
    "/SLOTS/sidebar/slot.json",
    "/status-manifest.json",
    "/STATUS-MANIFEST.JSON",
    "/index.html",
    "/about/index.html",
    "/about/shell.html",
    "/about/metadata.json",
    "/about/layout.metadata.json",
    "/about/slot.metadata.json",
    "/about/shell.layout.json",
    "/about/shell.page.json",
    "/about/slot.json",
    "/about/page.rsc",
    "/about/layout.rsc",
    "/about/rsc.rsc",
    "/main._old.js",
    "/about/index._old.html",
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
    "/.DS_Store",
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

  // Standard PWA /manifest.json and /server/* user assets are allowed (server bundles live in .dinou/dist1)
  assert.equal(normalizePublicRequestPath("/manifest.json"), "manifest.json");
  assert.equal(
    normalizePublicRequestPath("/server/diagram.png"),
    "server/diagram.png"
  );
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
  assert.equal(isInternalDinouAssetPath("slots/main"), true);
  assert.equal(isInternalDinouAssetPath("slots/hero/slot.json"), true);
  assert.equal(isInternalDinouAssetPath("slots/hero/slot.metadata.json"), true);
  assert.equal(isInternalDinouAssetPath("status-manifest.json"), true);
  assert.equal(isInternalDinouAssetPath("index.html"), true);
  assert.equal(isInternalDinouAssetPath("about/shell.page.json"), true);
  assert.equal(isInternalDinouAssetPath("about/slot.json"), true);
  assert.equal(isInternalDinouAssetPath("about/slot.metadata.json"), true);
  assert.equal(isInternalDinouAssetPath("about/page.rsc"), true);
  assert.equal(isInternalDinouAssetPath("main._old.js"), true);
  assert.equal(isInternalDinouAssetPath("manifest.json"), false);
  assert.equal(isInternalDinouAssetPath("pwa/manifest.json"), false);
  assert.equal(isInternalDinouAssetPath("server/diagram.png"), false);
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
    getStaticContentType("/manifest.json"),
    "application/json; charset=utf-8"
  );
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
    "button-5bbf0f56-ZGBKXIUF.js",
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

  // Unhashed public/ assets (including PWA manifest.json) & unhashed CSS/JS must revalidate
  const revalidatePaths = [
    "manifest.json",
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
    assert.equal(copyStaticDirectoriesToOutdir(tmpCopy, "out-missing"), false);

    fs.mkdirSync(path.join(tmpCopy, "public/images/deep"), { recursive: true });
    fs.mkdirSync(path.join(tmpCopy, "public/.well-known"), { recursive: true });
    fs.writeFileSync(path.join(tmpCopy, "public/.nojekyll"), "");
    fs.writeFileSync(
      path.join(tmpCopy, "public/manifest.json"),
      '{"name":"PWA"}'
    );
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
      fs.readFileSync(path.join(dest, "manifest.json"), "utf8"),
      '{"name":"PWA"}'
    );
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
  "4️⃣ Verifying Cloudflare Workers adapter & isPublicStaticAssetRequest (PWA /manifest.json, GET/HEAD, apple-app-site-association JSON rewrite & dist2 cache blocking)..."
);
{
  assert.equal(isPublicStaticAssetRequest("/manifest.json"), true);
  assert.equal(isPublicStaticAssetRequest("/server/diagram.png"), true);
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
  assert.equal(isPublicStaticAssetRequest("/media/intro.mp4"), true);
  assert.equal(isPublicStaticAssetRequest("/assets/chunk.png"), true);

  assert.equal(isPublicStaticAssetRequest("/"), false);
  assert.equal(isPublicStaticAssetRequest("/about"), false);
  assert.equal(isPublicStaticAssetRequest("/about/index.html"), false);
  assert.equal(isPublicStaticAssetRequest("/about/shell.html"), false);
  assert.equal(isPublicStaticAssetRequest("/about/metadata.json"), false);
  assert.equal(isPublicStaticAssetRequest("/about/layout.metadata.json"), false);
  assert.equal(isPublicStaticAssetRequest("/about/shell.page.json"), false);
  assert.equal(isPublicStaticAssetRequest("/about/slot.json"), false);
  assert.equal(isPublicStaticAssetRequest("/about/page.rsc"), false);
  assert.equal(isPublicStaticAssetRequest("/slots/hero/slot.json"), false);
  assert.equal(
    isPublicStaticAssetRequest("/slots/hero/slot.metadata.json"),
    false
  );
  assert.equal(isPublicStaticAssetRequest("/status-manifest.json"), false);
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
          if (u.pathname === "/manifest.json") {
            return new Response(
              req.method === "HEAD" ? null : '{"name":"Dinou PWA"}',
              {
                status: 200,
                headers: { "content-type": "application/json; charset=utf-8" },
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

    const pwaGet = await cfWorker.fetch(
      new Request("https://example.com/manifest.json"),
      mockEnv,
      {}
    );
    assert.equal(pwaGet.status, 200);
    assert.deepEqual(await pwaGet.json(), { name: "Dinou PWA" });
    assert.ok(assetHits.includes("GET:/manifest.json"));

    const sitemapGet = await cfWorker.fetch(
      new Request("https://example.com/sitemap.xml"),
      mockEnv,
      {}
    );
    assert.equal(sitemapGet.status, 200);
    assert.ok(assetHits.includes("GET:/sitemap.xml"));

    assetHits.length = 0;
    for (const blocked of [
      "/slots/hero/slot.json",
      "/slots/hero/slot.metadata.json",
      "/status-manifest.json",
      "/about/index.html",
      "/about/metadata.json",
      "/about/layout.metadata.json",
      "/about/shell.page.json",
      "/about/page.rsc",
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
      "Expected Cloudflare adapter never to forward dist2 cache or dotfile paths to env.ASSETS"
    );
  } finally {
    process.chdir(origCwd);
    fs.rmSync(tmpCfDir, { recursive: true, force: true });
  }
}

console.log(
  "5️⃣ Verifying .dinou/dist1 physical isolation, pure .dinou/dist3, PWA public/manifest.json preservation & dev .dinou/node-dev isolation across Esbuild, Rollup & Webpack..."
);
{
  const tmpBundlers = fs.mkdtempSync(
    path.join(os.tmpdir(), "dinou-dist1-parity-")
  );
  try {
    fs.writeFileSync(
      path.join(tmpBundlers, "package.json"),
      JSON.stringify({ name: "tmp-dist1-parity", type: "module" }, null, 2)
    );
    fs.mkdirSync(path.join(tmpBundlers, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpBundlers, "src/actions.js"),
      '"use server";\nexport async function ping() { return "pong"; }\n'
    );
    fs.writeFileSync(
      path.join(tmpBundlers, "src/main.js"),
      'import { ping } from "./actions.js";\nexport const ok = ping;\n'
    );

    // Legacy pre-v6 favicons/ directory (must be completely ignored by all bundlers)
    fs.mkdirSync(path.join(tmpBundlers, "favicons"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpBundlers, "favicons/legacy-only.png"),
      "legacy-png"
    );

    // Standard PWA public/manifest.json + nested subdirectories + spaces + .well-known/* + .nojekyll + OS junk
    const pwaManifestContent = JSON.stringify(
      { name: "My Dinou PWA", short_name: "Dinou", display: "standalone" },
      null,
      2
    );
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
      path.join(tmpBundlers, "public/manifest.json"),
      pwaManifestContent
    );
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

    function assertPureDist3AndDist1Manifests(outDir, label) {
      // 1. User PWA public/manifest.json survives untouched in .dinou/dist3
      assert.equal(
        fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
        pwaManifestContent,
        `[${label}] user public/manifest.json must be preserved in .dinou/dist3`
      );

      // 2. Internal bundler chunk manifest & RSC/SF manifests live in .dinou/dist1
      const dist1ManifestPath = path.join(
        tmpBundlers,
        ".dinou/dist1/manifest.json"
      );
      assert.ok(
        fs.existsSync(dist1ManifestPath),
        `[${label}] bundler chunk manifest must be written to .dinou/dist1/manifest.json`
      );
      const bundlerManifest = JSON.parse(
        fs.readFileSync(dist1ManifestPath, "utf8")
      );
      assert.ok(
        typeof bundlerManifest["main.js"] === "string" &&
          bundlerManifest["main.js"].startsWith("main-"),
        `[${label}] .dinou/dist1/manifest.json must map main.js -> main-<hash>.js`
      );
      assert.ok(
        fs.existsSync(
          path.join(tmpBundlers, ".dinou/dist1/react-client-manifest.json")
        ),
        `[${label}] react-client-manifest.json must be written to .dinou/dist1/`
      );
      assert.ok(
        fs.existsSync(
          path.join(tmpBundlers, ".dinou/dist1/server-functions-manifest.json")
        ),
        `[${label}] server-functions-manifest.json must be written to .dinou/dist1/`
      );

      // 3. Legacy manifest folders and polluted dist3 internal files MUST NOT exist
      assert.equal(
        fs.existsSync(path.join(tmpBundlers, ".dinou/react_client_manifest")),
        false,
        `[${label}] legacy .dinou/react_client_manifest must NOT exist`
      );
      assert.equal(
        fs.existsSync(
          path.join(tmpBundlers, ".dinou/server_functions_manifest")
        ),
        false,
        `[${label}] legacy .dinou/server_functions_manifest must NOT exist`
      );
      assert.equal(fs.existsSync(path.join(outDir, "server")), false);
      assert.equal(
        fs.existsSync(path.join(outDir, "react-client-manifest.json")),
        false
      );
      assert.equal(
        fs.existsSync(path.join(outDir, "react-ssr-manifest.json")),
        false
      );
      assert.equal(
        fs.existsSync(path.join(outDir, "server-functions-manifest.json")),
        false
      );

      // 4. Nested folders, spaces, dotfiles & OS junk filtering
      assert.equal(
        fs.readFileSync(path.join(outDir, "favicon.ico"), "utf8"),
        "modern-public-favicon"
      );
      assert.equal(fs.existsSync(path.join(outDir, "legacy-only.png")), false);
      assert.equal(
        fs.readFileSync(
          path.join(outDir, "images/nested/og-image.png"),
          "utf8"
        ),
        "og-bytes"
      );
      assert.equal(
        fs.readFileSync(
          path.join(outDir, "downloads/brochure 2026.pdf"),
          "utf8"
        ),
        "pdf-bytes"
      );
      assert.ok(fs.existsSync(path.join(outDir, ".well-known/assetlinks.json")));
      assert.ok(
        fs.existsSync(
          path.join(outDir, ".well-known/apple-app-site-association")
        )
      );
      assert.ok(fs.existsSync(path.join(outDir, ".nojekyll")));
      assert.equal(fs.existsSync(path.join(outDir, ".DS_Store")), false);
      assert.equal(fs.existsSync(path.join(outDir, "Thumbs.db")), false);
    }

    // Switch cwd and NODE_ENV BEFORE importing Rollup & Webpack configs
    process.chdir(tmpBundlers);
    process.env.NODE_ENV = "production";
    delete process.env.DINOU_WRITE_TO_DISK;

    const serverFilesSet = new Set([path.join(tmpBundlers, "src/actions.js")]);

    // 5A. Esbuild Production -> .dinou/dist1 & pure .dinou/dist3
    const esbuild = dinouRequire("esbuild");
    const { default: getConfigEsbuildProd } = await importDinou(
      "esbuild/helpers-esbuild/get-config-esbuild-prod.js"
    );
    fs.rmSync(path.join(tmpBundlers, ".dinou"), { recursive: true, force: true });
    const outEsbuildProd = path.join(tmpBundlers, ".dinou/dist3");
    await esbuild.build(
      getConfigEsbuildProd({
        entryPoints: {
          main: path.join(tmpBundlers, "src/main.js"),
          serverFunctionProxy: path.join(tmpBundlers, "src/main.js"),
        },
        outdir: outEsbuildProd,
        manifest: {},
        serverFiles: serverFilesSet,
        reactCompiler: false,
      })
    );
    assertPureDist3AndDist1Manifests(outEsbuildProd, "esbuild-prod");

    // 5B. Rollup Production -> server output .dinou/dist1/server, manifests in .dinou/dist1, pure .dinou/dist3
    const { rollup } = dinouRequire("rollup");
    const { default: getRollupConfig } = await importDinou(
      "rollup/rollup.config.js"
    );
    fs.rmSync(path.join(tmpBundlers, ".dinou"), { recursive: true, force: true });
    const [rollupClientCfg, rollupServerCfg] = await getRollupConfig();
    assert.equal(
      path.resolve(rollupServerCfg.output.dir),
      path.resolve(tmpBundlers, ".dinou/dist1/server"),
      "Rollup server bundle output must target .dinou/dist1/server"
    );
    const copyRollupPlugin = rollupClientCfg.plugins.find(
      (p) => p && p.name === "dinou-copy-static"
    );
    const rollupManifestPlugin = rollupClientCfg.plugins.find(
      (p) => p && p.name === "manifest-generator"
    );
    const rollupRcmPlugin = rollupClientCfg.plugins.find(
      (p) => p && p.name === "react-client-manifest"
    );
    const rollupSfPlugin = rollupClientCfg.plugins.find(
      (p) => p && p.name === "server-functions-proxy"
    );
    assert.ok(copyRollupPlugin && rollupManifestPlugin && rollupRcmPlugin && rollupSfPlugin);

    const outRollup = path.join(tmpBundlers, ".dinou/dist3");
    const bundle = await rollup({
      input: {
        main: path.join(tmpBundlers, "src/main.js"),
        serverFunctionProxy: path.join(tmpBundlers, "src/actions.js"),
      },
      external: ["/__SERVER_FUNCTION_PROXY__"],
      plugins: [
        copyRollupPlugin,
        rollupRcmPlugin,
        rollupManifestPlugin,
        rollupSfPlugin,
      ],
    });
    await bundle.write({
      dir: outRollup,
      format: "esm",
      entryFileNames: "[name]-[hash].js",
    });
    await bundle.close();
    assertPureDist3AndDist1Manifests(outRollup, "rollup");

    // 5C. Webpack Production -> server output .dinou/dist1/server, DinouRelocateRscManifestsPlugin -> .dinou/dist1, pure .dinou/dist3
    const webpack = dinouRequire("webpack");
    const { default: getWebpackConfig } = await importDinou(
      "webpack/webpack.config.js"
    );
    const wpServerFunctionsMod = await importDinou(
      "webpack/plugins/server-functions-plugin.js"
    );
    const wpManifestMod = await importDinou(
      "webpack/plugins/manifest-generator-plugin.js"
    );
    fs.rmSync(path.join(tmpBundlers, ".dinou"), { recursive: true, force: true });
    const [wpClientCfg, wpServerCfg] = await getWebpackConfig();
    assert.equal(
      path.resolve(wpServerCfg.output.path),
      path.resolve(tmpBundlers, ".dinou/dist1/server"),
      "Webpack server bundle output must target .dinou/dist1/server"
    );
    const copyWpPlugin = wpClientCfg.plugins.find(
      (p) => p && Array.isArray(p.patterns)
    );
    const relocatePlugin = wpClientCfg.plugins.find(
      (p) =>
        p &&
        typeof p.apply === "function" &&
        p.apply.toString().includes("DinouRelocateRscManifestsPlugin")
    );
    assert.ok(copyWpPlugin && relocatePlugin);
    assert.equal(copyWpPlugin.patterns.length, 1);
    assert.equal(copyWpPlugin.patterns[0].from, "public");
    assert.equal(copyWpPlugin.patterns[0].globOptions?.dot, true);

    const outWebpack = path.join(tmpBundlers, ".dinou/dist3");
    await new Promise((resolve, reject) => {
      const compiler = webpack(
        {
          mode: "production",
          context: tmpBundlers,
          entry: {
            main: path.join(tmpBundlers, "src/main.js"),
            serverFunctionProxy: path.join(tmpBundlers, "src/actions.js"),
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
                comp.hooks.thisCompilation.tap(
                  "MockReactServerPlugin",
                  (compilation) => {
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
                          new sources.RawSource(
                            '{"moduleLoading":{"prefix":"/"}}'
                          )
                        );
                      }
                    );
                  }
                );
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
            if (stats.hasErrors()) {
              return reject(new Error(stats.toString({ errors: true })));
            }
            resolve();
          });
        }
      );
    });
    assertPureDist3AndDist1Manifests(outWebpack, "webpack");
    assert.ok(
      fs.existsSync(
        path.join(tmpBundlers, ".dinou/dist1/react-ssr-manifest.json")
      ),
      "Webpack react-ssr-manifest.json must be relocated to .dinou/dist1/"
    );

    // 5D. Dev Mode Disk Isolation (DINOU_WRITE_TO_DISK=true -> .dinou/node-dev, never .dinou/dist1)
    fs.rmSync(path.join(tmpBundlers, ".dinou"), { recursive: true, force: true });
    process.env.NODE_ENV = "development";
    process.env.DINOU_WRITE_TO_DISK = "true";
    const { default: getConfigEsbuild } = await importDinou(
      "esbuild/helpers-esbuild/get-config-esbuild.js"
    );
    const outEsbuildDev = path.join(tmpBundlers, ".dinou/public");
    const devCfg = getConfigEsbuild({
      entryPoints: { main: path.join(tmpBundlers, "src/main.js") },
      outdir: outEsbuildDev,
      manifest: {},
      changedIds: new Set(),
      serverFiles: serverFilesSet,
    });
    const copyOncePlugin = devCfg.plugins.find(
      (p) => p && p.name === "copy-static-files-once"
    );
    const devRcmPlugin = devCfg.plugins.find(
      (p) => p && p.name === "react-client-manifest"
    );
    const devSfPlugin = devCfg.plugins.find(
      (p) => p && p.name === "server-functions-proxy"
    );
    assert.ok(copyOncePlugin && devRcmPlugin && devSfPlugin);
    await esbuild.build({
      entryPoints: [path.join(tmpBundlers, "src/main.js")],
      outdir: outEsbuildDev,
      bundle: true,
      format: "esm",
      external: ["/__SERVER_FUNCTION_PROXY__"],
      plugins: [copyOncePlugin, devRcmPlugin, devSfPlugin],
    });
    assert.ok(
      fs.existsSync(
        path.join(tmpBundlers, ".dinou/node-dev/server-functions-manifest.json")
      ),
      "Dev DINOU_WRITE_TO_DISK=true must write server-functions-manifest.json to .dinou/node-dev/"
    );
    assert.equal(
      fs.existsSync(path.join(tmpBundlers, ".dinou/dist1")),
      false,
      "Dev mode must NEVER create or overwrite .dinou/dist1"
    );
    assert.equal(
      fs.readFileSync(path.join(outEsbuildDev, "manifest.json"), "utf8"),
      pwaManifestContent
    );

    // 5E. Verify deno/build.js dist3 purity, cli.js DINOU_BUILD_TOOL propagation & client.jsx / client-webpack.jsx static-export RSC parity
    const denoBuildSrc = fs.readFileSync(
      path.join(dinouRoot, "deno/build.js"),
      "utf8"
    );
    assert.equal(
      denoBuildSrc.includes("copyRecursive(dist2Dir, dist3Dir)"),
      false,
      "deno/build.js must NOT copy .dinou/dist2 into .dinou/dist3"
    );

    const cliSrc = fs.readFileSync(path.join(dinouRoot, "cli.js"), "utf8");
    assert.ok(
      cliSrc.includes("DINOU_BUILD_TOOL=rollup") &&
        cliSrc.includes("DINOU_BUILD_TOOL=webpack"),
      "dinou/cli.js must pass DINOU_BUILD_TOOL=rollup and DINOU_BUILD_TOOL=webpack to export-static.js"
    );

    for (const clientRel of ["core/client.jsx", "core/client-webpack.jsx"]) {
      const clientSrc = fs.readFileSync(path.join(dinouRoot, clientRel), "utf8");
      assert.ok(
        clientSrc.includes("__DINOU_STATIC_EXPORT__") &&
          clientSrc.includes("buildStaticExportRscUrl") &&
          clientSrc.includes('"page.rsc"') &&
          clientSrc.includes('"layout.rsc"') &&
          clientSrc.includes("window.location.replace(url)"),
        `Expected ${clientRel} to implement static-export page.rsc / layout.rsc resolution and non-RSC fallback`
      );
    }
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
  "6️⃣ Verifying export-static.js, shouldExportDist3Entry, shouldExportDist2File & injectStaticExportFlag..."
);
{
  assert.equal(shouldExportDist3Entry(""), false);
  assert.equal(shouldExportDist3Entry("slots"), false);
  assert.equal(shouldExportDist3Entry("slots/hero/slot.json"), false);
  assert.equal(shouldExportDist3Entry("slots/hero/slot.metadata.json"), false);
  assert.equal(shouldExportDist3Entry("status-manifest.json"), false);
  assert.equal(shouldExportDist3Entry(".DS_Store"), false);
  assert.equal(shouldExportDist3Entry("images/Thumbs.db"), false);
  assert.equal(shouldExportDist3Entry("about/shell.html"), false);
  assert.equal(shouldExportDist3Entry("about/metadata.json"), false);
  assert.equal(shouldExportDist3Entry("about/layout.metadata.json"), false);
  assert.equal(shouldExportDist3Entry("about/slot.metadata.json"), false);
  assert.equal(shouldExportDist3Entry("about/shell.layout.json"), false);
  assert.equal(shouldExportDist3Entry("about/shell.page.json"), false);
  assert.equal(shouldExportDist3Entry("about/slot.json"), false);
  assert.equal(shouldExportDist3Entry("about/page.rsc"), false);
  assert.equal(shouldExportDist3Entry("about/rsc.rsc"), false);
  assert.equal(shouldExportDist3Entry("main._old.js"), false);

  // User PWA manifest.json, /server/* public assets & dotfiles ARE exported from dist3!
  assert.equal(shouldExportDist3Entry("manifest.json"), true);
  assert.equal(shouldExportDist3Entry("pwa/manifest.json"), true);
  assert.equal(shouldExportDist3Entry("server/diagram.png"), true);
  assert.equal(shouldExportDist3Entry("main-ZGBKXIUF.js"), true);
  assert.equal(shouldExportDist3Entry("robots.txt"), true);
  assert.equal(shouldExportDist3Entry(".nojekyll"), true);
  assert.equal(shouldExportDist3Entry(".well-known/assetlinks.json"), true);

  // shouldExportDist2File strictly allowlists index.html, page.rsc & layout.rsc outside slots/
  assert.equal(shouldExportDist2File(""), false);
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
  assert.equal(shouldExportDist2File("slot.metadata.json"), false);
  assert.equal(shouldExportDist2File("shell.layout.json"), false);
  assert.equal(shouldExportDist2File("about/shell.page.json"), false);
  assert.equal(shouldExportDist2File("about/shell.html"), false);
  assert.equal(shouldExportDist2File("status-manifest.json"), false);
  assert.equal(shouldExportDist2File("slots/hero/slot.json"), false);
  assert.equal(shouldExportDist2File("slots/hero/slot.metadata.json"), false);
  assert.equal(shouldExportDist2File("slots/hero/index.html"), false);
  assert.equal(shouldExportDist2File("slots/hero/page.rsc"), false);

  // injectStaticExportFlag injects before </head>, falls back to </body> / prepend, and is idempotent
  assert.equal(
    STATIC_EXPORT_SCRIPT,
    "<script>window.__DINOU_STATIC_EXPORT__=true;</script>"
  );
  const injectedHead = injectStaticExportFlag(
    "<html><head><title>X</title></head><body></body></html>"
  );
  assert.ok(injectedHead.includes(`${STATIC_EXPORT_SCRIPT}</head>`));
  assert.equal(injectStaticExportFlag(injectedHead), injectedHead);

  const injectedBody = injectStaticExportFlag("<html><body>Hello</body></html>");
  assert.ok(injectedBody.includes(`${STATIC_EXPORT_SCRIPT}</body>`));

  const injectedFragment = injectStaticExportFlag("<div>Fragment</div>");
  assert.equal(injectedFragment, `${STATIC_EXPORT_SCRIPT}<div>Fragment</div>`);

  const tmpExport = fs.mkdtempSync(
    path.join(os.tmpdir(), "dinou-export-clean-")
  );
  try {
    fs.mkdirSync(path.join(tmpExport, ".dinou/dist3/slots/hero"), {
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
    fs.mkdirSync(path.join(tmpExport, ".dinou/dist2/slots/hero"), {
      recursive: true,
    });

    // Simulate dist2 cache artifacts synchronized into .dinou/dist3 (as after build:cloudflare) + OS junk
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/slots/hero/slot.json"),
      "{}"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/slots/hero/slot.metadata.json"),
      "{}"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/status-manifest.json"),
      "{}"
    );
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/rsc.rsc"), "RSC");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/shell.html"), "SHELL");
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/metadata.json"),
      "{}"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/layout.metadata.json"),
      "{}"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/slot.metadata.json"),
      "{}"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/shell.layout.json"),
      "[]"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/shell.page.json"),
      "[]"
    );
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/main._old.js"), "OLD");
    fs.writeFileSync(path.join(tmpExport, ".dinou/dist3/.DS_Store"), "MAC");
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/images/Thumbs.db"),
      "WIN"
    );

    // Legitimate client & public assets in .dinou/dist3 (including PWA manifest.json)
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/manifest.json"),
      '{"name":"PWA"}'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/main-ZGBKXIUF.js"),
      "console.log(1)"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist3/styles.css"),
      "body{}"
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

    // Populate .dinou/dist2 with BOTH exportable SSG files AND internal ISR/PPR/Slot artifacts
    const rawDist2HomeHtml =
      "<!DOCTYPE html><html><head><title>Home</title></head><body>Home</body></html>";
    const rawDist2AboutHtml =
      "<!DOCTYPE html><html><head><title>About</title></head><body>About</body></html>";
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/index.html"),
      rawDist2HomeHtml
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/page.rsc"),
      '0:"home-page"\n'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/layout.rsc"),
      '0:"root-layout"\n'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/rsc.rsc"),
      '0:"legacy-combined"\n'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/metadata.json"),
      '{"status":200}'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/layout.metadata.json"),
      '{"status":200}'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/shell.layout.json"),
      "[]"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/status-manifest.json"),
      '{"/":{"status":200}}'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/slots/hero/slot.json"),
      '{"jsx":null}'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/slots/hero/slot.metadata.json"),
      '{"tags":[]}'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/slots/hero/index.html"),
      "<html>Slot</html>"
    );

    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/about/index.html"),
      rawDist2AboutHtml
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/about/page.rsc"),
      '0:"about-page"\n'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/about/layout.rsc"),
      '0:"about-layout"\n'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/about/page._old.rsc"),
      '0:"old"\n'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/about/rsc.rsc"),
      '0:"legacy"\n'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/about/shell.rsc"),
      '0:"shell"\n'
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/about/shell.html"),
      "<html>Shell</html>"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/about/shell.page.json"),
      "[]"
    );
    fs.writeFileSync(
      path.join(tmpExport, ".dinou/dist2/about/metadata.json"),
      '{"status":200}'
    );

    const exportOutLog = execFileSync(
      process.execPath,
      [path.join(dinouRoot, "core/export-static.js")],
      {
        cwd: tmpExport,
        env: { ...process.env, DINOU_BUILD_TOOL: "rollup" },
        encoding: "utf8",
      }
    );
    assert.ok(
      exportOutLog.includes("Static Export • rollup"),
      `Expected export-static.js to log active DINOU_BUILD_TOOL, got: ${exportOutLog}`
    );

    const outDir = path.join(tmpExport, "out");
    assert.equal(
      fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"),
      '{"name":"PWA"}'
    );

    // Source .dinou/dist2/index.html must NEVER be mutated in place
    assert.equal(
      fs.readFileSync(path.join(tmpExport, ".dinou/dist2/index.html"), "utf8"),
      rawDist2HomeHtml
    );

    // Exported index.html files must include window.__DINOU_STATIC_EXPORT__=true;
    const outHomeHtml = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
    const outAboutHtml = fs.readFileSync(
      path.join(outDir, "about/index.html"),
      "utf8"
    );
    assert.ok(outHomeHtml.includes(`${STATIC_EXPORT_SCRIPT}</head>`));
    assert.ok(outAboutHtml.includes(`${STATIC_EXPORT_SCRIPT}</head>`));
    assert.equal(
      fs.readFileSync(path.join(outDir, "page.rsc"), "utf8"),
      '0:"home-page"\n'
    );
    assert.equal(
      fs.readFileSync(path.join(outDir, "layout.rsc"), "utf8"),
      '0:"root-layout"\n'
    );
    assert.equal(
      fs.readFileSync(path.join(outDir, "about/page.rsc"), "utf8"),
      '0:"about-page"\n'
    );
    assert.equal(
      fs.readFileSync(path.join(outDir, "about/layout.rsc"), "utf8"),
      '0:"about-layout"\n'
    );

    for (const excluded of [
      "slots",
      "status-manifest.json",
      "rsc.rsc",
      "shell.html",
      "metadata.json",
      "layout.metadata.json",
      "slot.metadata.json",
      "shell.layout.json",
      "shell.page.json",
      "main._old.js",
      ".DS_Store",
      "images/Thumbs.db",
      "about/metadata.json",
      "about/rsc.rsc",
      "about/shell.rsc",
      "about/shell.html",
      "about/shell.page.json",
      "about/page._old.rsc",
    ]) {
      assert.equal(
        fs.existsSync(path.join(outDir, excluded)),
        false,
        `Expected out/${excluded} to be excluded from static export`
      );
    }

    for (const included of [
      "manifest.json",
      "main-ZGBKXIUF.js",
      "styles.css",
      "robots.txt",
      ".nojekyll",
      ".well-known/assetlinks.json",
      "images/nested/badge.svg",
      "index.html",
      "page.rsc",
      "layout.rsc",
      "about/index.html",
      "about/page.rsc",
      "about/layout.rsc",
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

// Guard: verify projectRoot/.dinou/dist1 and .dinou/node-dev manifests were never mutated
for (const [rel, before] of manifestSnapshotBefore.entries()) {
  const abs = path.join(projectRoot, rel);
  const after = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  assert.equal(
    after,
    before,
    `Standalone verification script must never mutate projectRoot/${rel}`
  );
}

if (origWriteToDisk === undefined) delete process.env.DINOU_WRITE_TO_DISK;
else process.env.DINOU_WRITE_TO_DISK = origWriteToDisk;

console.log(
  "RESULT: All public/ static assets security, .dinou/dist1 physical isolation, multi-bundler parity, Cloudflare adapter & export-static checks PASSED"
);
