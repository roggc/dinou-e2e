// scripts/verify-assets-ci.mjs
// Verifies Dinou v9.4.0 Static Media, Fonts, Custom `assetExtensions` & RFC 9110 HTTP Byte-Range Pipeline:
// 1. Path + content SHA-256 fingerprinting (`/assets/[name]-[8hex].[ext]`): folder scoping, special-char sanitization, OS-case normalization & immutable cache busting on edit
// 2. `dinou.config.*` `assetExtensions` merging + `generateRouteTypes` ambient `declare module "*.<ext>"` emission + `DinouConfig` TypeScript signature
// 3. Video/audio/3D MIME types (`.avi`, `.mkv`, `.mjpeg`, `.mjpg`, `.opus`, `.glb`, `.gltf`, `.hdr`), `PUBLIC_STATIC_EXT_REGEX` & RFC 9110 `parseHttpByteRange` (`206` / `416`)
// 4. `resolveAssetImport` across custom `tsconfig.json`/`jsconfig.json` aliases (`@media/*`, `@/*`, `~/*`), `.dinou/swc` mirror importers, query/hash suffixes & bare `node_modules` assets
// 5. Esbuild dev (`startEsbuildDev`) `"use client"` SWC mirror relative/aliased assets + live edit stale-hash eviction & Rollup incremental (`!isInitial`) `knownServerAssets` persistence
// 6. Full 3-bundler (`esbuild`, `rollup`, `webpack`, incl. `DINOU_DEV=true` leak immunity) + 4-runtime (`Node`, `Cloudflare`, `Bun`, `Deno`) + `export-static` parity & HTTP `206`/`416` Range serving

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const origCwd = repoRoot;

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
    const abs = path.join(repoRoot, rel);
    return [rel, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null];
  })
);

const dinouRootCandidates = [
  path.resolve(repoRoot, "dinou"),
  path.resolve(repoRoot, "node_modules/dinou/dinou"),
  path.resolve(repoRoot, "node_modules/dinou"),
];
const dinouRoot =
  dinouRootCandidates.find((dir) => fs.existsSync(path.join(dir, "cli.js"))) ??
  dinouRootCandidates[0];
const dinouPkgJson =
  [
    path.join(dinouRoot, "package.json"),
    path.resolve(repoRoot, "node_modules/dinou/package.json"),
    path.resolve(repoRoot, "package.json"),
  ].find((p) => fs.existsSync(p)) ?? path.join(dinouRoot, "package.json");

const cliPath = path.join(dinouRoot, "cli.js");
const importDinou = (relPath) =>
  import(pathToFileURL(path.join(dinouRoot, relPath)).href);

function createFixtureApp(prefix) {
  const fixturesBase = path.join(repoRoot, ".dinou", "tmp-assets-fixtures");
  fs.mkdirSync(fixturesBase, { recursive: true });
  const tmpApp = fs.mkdtempSync(path.join(fixturesBase, prefix));

  const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouRootUrl = pathToFileURL(dinouRoot).href;

  fs.writeFileSync(
    path.join(dinouShimDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "9.4.0",
        type: "module",
        main: "./index.js",
        exports: {
          ".": "./index.js",
          "./server": "./server.js",
          "./config": "./config.js",
        },
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "index.js"),
    `export * from ${JSON.stringify(`${dinouRootUrl}/index.js`)};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(`${dinouRootUrl}/server.js`)};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(`${dinouRootUrl}/core/config.js`)};\nexport { default } from ${JSON.stringify(`${dinouRootUrl}/core/config.js`)};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(tmpApp, "package.json"),
    JSON.stringify(
      { name: "dinou-assets-fixture", version: "1.0.0", type: "module" },
      null,
      2
    ),
    "utf8"
  );
  return { fixturesBase, tmpApp };
}

function cleanupFixtureApp(fixturesBase, tmpApp) {
  fs.rmSync(tmpApp, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
  try {
    if (
      fs.existsSync(fixturesBase) &&
      fs.readdirSync(fixturesBase).length === 0
    ) {
      fs.rmdirSync(fixturesBase);
    }
  } catch {}
}

console.log(
  "1️⃣ Verifying path + content SHA-256 fingerprinting, folder collision safety, filename sanitization & immutable cache busting..."
);
{
  const { getAssetInfo, getAssetFileName, getAssetPublicUrl } =
    await importDinou("core/asset-extensions.js");
  const { fixturesBase, tmpApp } = createFixtureApp("assets-hash-");

  try {
    const dirA = path.join(tmpApp, "src", "header");
    const dirB = path.join(tmpApp, "src", "footer");
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });

    const fileA = path.join(dirA, "logo.png");
    const fileB = path.join(dirB, "logo.png");
    const specialFile = path.join(dirA, "Hero Banner (2x).PNG");

    const bytesV1 = Buffer.from("PNG_V1_PAYLOAD_BYTES");
    fs.writeFileSync(fileA, bytesV1);
    fs.writeFileSync(fileB, bytesV1);
    fs.writeFileSync(specialFile, bytesV1);

    const infoA1 = getAssetInfo(fileA, tmpApp);
    const infoB1 = getAssetInfo(fileB, tmpApp);
    const infoSpecial = getAssetInfo(specialFile, tmpApp);

    assert.match(infoA1.publicUrl, /^\/assets\/logo-[a-f0-9]{8}\.png$/);
    assert.match(infoB1.publicUrl, /^\/assets\/logo-[a-f0-9]{8}\.png$/);
    assert.equal(getAssetFileName(fileA, tmpApp), infoA1.fileName);
    assert.equal(getAssetPublicUrl(fileA, tmpApp), infoA1.publicUrl);
    assert.notEqual(
      infoA1.publicUrl,
      infoB1.publicUrl,
      "Same-named files with identical bytes in different folders must not collide"
    );
    assert.match(
      infoSpecial.publicUrl,
      /^\/assets\/Hero-Banner-2x-[a-f0-9]{8}\.png$/,
      "Special characters and uppercase extensions must normalize cleanly"
    );

    if (process.platform === "win32" && /^[a-zA-Z]:/.test(fileA)) {
      const upperDrive = fileA[0].toUpperCase() + fileA.slice(1);
      const lowerDrive = fileA[0].toLowerCase() + fileA.slice(1);
      assert.equal(
        getAssetPublicUrl(upperDrive, tmpApp),
        getAssetPublicUrl(lowerDrive, tmpApp),
        "Windows drive-letter casing must produce identical asset URLs"
      );
    }

    const bytesV2 = Buffer.from("PNG_V2_UPDATED_DESIGN_PAYLOAD_BYTES");
    fs.writeFileSync(fileA, bytesV2);
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(fileA, future, future);

    const infoA2 = getAssetInfo(fileA, tmpApp);
    assert.notEqual(
      infoA2.publicUrl,
      infoA1.publicUrl,
      "Updating file bytes at the same path must produce a new immutable content hash"
    );
  } finally {
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}

console.log(
  "2️⃣ Verifying dinou.config.* assetExtensions merging & generateRouteTypes ambient TypeScript declarations..."
);
{
  const { getAssetExtensionsInfo } = await importDinou(
    "core/asset-extensions.js"
  );
  const { generateRouteTypes } = await importDinou(
    "core/generate-route-types.js"
  );
  const { fixturesBase, tmpApp } = createFixtureApp("assets-custom-cfg-");

  try {
    fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      "export default function Page() { return <div>Home</div>; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "dinou.config.ts"),
      `import { defineConfig } from "dinou";\nexport default defineConfig({\n  assetExtensions: ["glb", ".gltf", "HDR", "png"],\n});\n`,
      "utf8"
    );

    const info = getAssetExtensionsInfo(null, tmpApp);
    assert.deepEqual(info.customExtensions, ["glb", "gltf", "hdr"]);
    assert.equal(info.regex.test("scene.glb"), true);
    assert.equal(info.regex.test("model.gltf"), true);
    assert.equal(info.regex.test("skybox.hdr"), true);
    assert.equal(info.resolveFilterRegex.test("scene.glb?v=2#mesh"), true);

    generateRouteTypes(tmpApp);
    const routesDts = fs.readFileSync(
      path.join(tmpApp, ".dinou", "types", "routes.d.ts"),
      "utf8"
    );
    assert.match(routesDts, /declare module "\*\.glb"/);
    assert.match(routesDts, /declare module "\*\.gltf"/);
    assert.match(routesDts, /declare module "\*\.hdr"/);
    assert.equal(
      routesDts.includes('declare module "*.png"'),
      false,
      "Built-in extensions from dinou/assets.d.ts must not be re-declared in routes.d.ts"
    );

    const indexDtsPath = path.join(dinouRoot, "index.d.ts");
    if (fs.existsSync(indexDtsPath)) {
      const indexDts = fs.readFileSync(indexDtsPath, "utf8");
      assert.match(indexDts, /assetExtensions\?:\s*string\[\]/);
    }
  } finally {
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}

console.log(
  "3️⃣ Verifying media & 3D MIME types, PUBLIC_STATIC_EXT_REGEX & RFC 9110 parseHttpByteRange..."
);
{
  const {
    getStaticContentType,
    isPublicStaticAssetRequest,
    parseHttpByteRange,
  } = await importDinou("core/static-assets.js");

  assert.equal(
    getStaticContentType("/assets/clip-12345678.avi"),
    "video/x-msvideo"
  );
  assert.equal(
    getStaticContentType("/assets/clip-12345678.mkv"),
    "video/x-matroska"
  );
  assert.equal(
    getStaticContentType("/assets/cam-12345678.mjpeg"),
    "video/x-motion-jpeg"
  );
  assert.equal(
    getStaticContentType("/assets/cam-12345678.mjpg"),
    "video/x-motion-jpeg"
  );
  assert.equal(
    getStaticContentType("/assets/voice-12345678.opus"),
    "audio/opus"
  );
  assert.equal(
    getStaticContentType("/assets/scene-12345678.glb"),
    "model/gltf-binary"
  );
  assert.equal(
    getStaticContentType("/assets/scene-12345678.gltf"),
    "model/gltf+json"
  );
  assert.equal(
    getStaticContentType("/assets/env-12345678.hdr"),
    "image/vnd.radiance"
  );

  assert.equal(isPublicStaticAssetRequest("/assets/custom-12345678.xyz"), true);
  assert.equal(isPublicStaticAssetRequest("/demo.mkv"), true);
  assert.equal(isPublicStaticAssetRequest("/scene.glb"), true);
  assert.equal(isPublicStaticAssetRequest("/env.hdr"), true);

  assert.deepEqual(parseHttpByteRange("bytes=0-1", 100), {
    unsatisfiable: false,
    start: 0,
    end: 1,
    length: 2,
    contentRange: "bytes 0-1/100",
  });
  assert.deepEqual(parseHttpByteRange("bytes=40-", 100), {
    unsatisfiable: false,
    start: 40,
    end: 99,
    length: 60,
    contentRange: "bytes 40-99/100",
  });
  assert.deepEqual(parseHttpByteRange("bytes=-15", 100), {
    unsatisfiable: false,
    start: 85,
    end: 99,
    length: 15,
    contentRange: "bytes 85-99/100",
  });
  assert.deepEqual(parseHttpByteRange("bytes=90-999", 100), {
    unsatisfiable: false,
    start: 90,
    end: 99,
    length: 10,
    contentRange: "bytes 90-99/100",
  });
  assert.deepEqual(parseHttpByteRange("bytes=500-600", 100), {
    unsatisfiable: true,
    contentRange: "bytes */100",
  });
  assert.deepEqual(parseHttpByteRange("bytes=0-0", 0), {
    unsatisfiable: true,
    contentRange: "bytes */0",
  });
  assert.equal(parseHttpByteRange("bytes=0-1, 4-5", 100), null);
  assert.equal(parseHttpByteRange("items=0-5", 100), null);
}

console.log(
  "4️⃣ Verifying resolveAssetImport across custom tsconfig aliases, .dinou/swc mirror importers & bare node_modules assets..."
);
{
  const { resolveAssetImport, getAssetExtensionsInfo } = await importDinou(
    "core/asset-extensions.js"
  );
  const { fixturesBase, tmpApp } = createFixtureApp("assets-resolve-");

  try {
    fs.mkdirSync(path.join(tmpApp, "src", "components"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, ".dinou", "swc", "src", "components"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpApp, "custom-media"), { recursive: true });
    const pkgFontDir = path.join(
      tmpApp,
      "node_modules",
      "@mock-fonts",
      "inter",
      "files"
    );
    fs.mkdirSync(pkgFontDir, { recursive: true });

    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      `{
        // JSONC comments & trailing commas supported
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["./src/*"],
            "@media/*": ["./custom-media/*"],
          },
        },
      }`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "dinou.config.mjs"),
      `export default { assetExtensions: ["glb"] };\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "node_modules", "@mock-fonts", "inter", "package.json"),
      JSON.stringify({ name: "@mock-fonts/inter", version: "1.0.0" }),
      "utf8"
    );

    const relWebp = path.join(tmpApp, "src", "components", "badge.webp");
    const aliasGlb = path.join(tmpApp, "custom-media", "robot.glb");
    const pkgWoff2 = path.join(pkgFontDir, "inter-latin.woff2");
    fs.writeFileSync(relWebp, "WEBP");
    fs.writeFileSync(aliasGlb, "GLB");
    fs.writeFileSync(pkgWoff2, "WOFF2");

    const extInfo = getAssetExtensionsInfo(null, tmpApp);
    const swcMirrorImporter = path.join(
      tmpApp,
      ".dinou",
      "swc",
      "src",
      "components",
      "Card.js"
    );

    assert.equal(
      path.resolve(
        resolveAssetImport("./badge.webp?v=1#sprite", {
          importer: swcMirrorImporter,
          projectRoot: tmpApp,
          assetRegex: extInfo.regex,
        })
      ),
      path.resolve(relWebp),
      "Relative asset import from .dinou/swc mirror importer must map back to src/"
    );
    assert.equal(
      path.resolve(
        resolveAssetImport("@media/robot.glb", {
          importer: swcMirrorImporter,
          projectRoot: tmpApp,
          assetRegex: extInfo.regex,
        })
      ),
      path.resolve(aliasGlb),
      "Custom tsconfig @media/* alias must resolve custom .glb asset"
    );
    assert.equal(
      path.resolve(
        resolveAssetImport("@mock-fonts/inter/files/inter-latin.woff2", {
          importer: path.join(tmpApp, "src", "page.tsx"),
          projectRoot: tmpApp,
          assetRegex: extInfo.regex,
        })
      ),
      path.resolve(pkgWoff2),
      "Bare node_modules asset specifier must resolve cleanly"
    );
  } finally {
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}

console.log(
  "5️⃣ Verifying Esbuild dev ('use client' SWC mirror + live edit stale-hash eviction) & Rollup incremental knownServerAssets..."
);
{
  const { fixturesBase, tmpApp } = createFixtureApp("assets-dev-watch-");

  try {
    fs.mkdirSync(path.join(tmpApp, "src", "components"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "custom-media"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
            "@media/*": ["./custom-media/*"],
          },
        },
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "dinou.config.mjs"),
      `export default { assetExtensions: ["glb"] };\n`,
      "utf8"
    );

    const relBadgePath = path.join(tmpApp, "src", "components", "badge.webp");
    const glbPath = path.join(tmpApp, "custom-media", "cube.glb");
    const serverAvifPath = path.join(tmpApp, "src", "hero.avif");

    fs.writeFileSync(relBadgePath, Buffer.from("WEBP_V1_DATA"));
    fs.writeFileSync(glbPath, Buffer.from("GLB_BINARY_DATA"));
    fs.writeFileSync(serverAvifPath, Buffer.from("AVIF_SERVER_DATA"));

    fs.writeFileSync(
      path.join(tmpApp, "src", "components", "viewer.tsx"),
      `"use client";
import badgeUrl from "./badge.webp";
import modelUrl from "@media/cube.glb";
export default function Viewer() {
  return <div data-badge={badgeUrl} data-model={modelUrl} />;
}
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import heroUrl from "./hero.avif";
import Viewer from "./components/viewer";
export default function Page() {
  return <main data-hero={heroUrl}><Viewer /></main>;
}
`,
      "utf8"
    );

    const devChildScript = path.join(tmpApp, "run-dev-watch-check.mjs");
    fs.writeFileSync(
      devChildScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const dinouRoot = ${JSON.stringify(dinouRoot)};
const dinouPkgJson = ${JSON.stringify(dinouPkgJson)};
const tmpApp = process.cwd();
const dinouRequire = createRequire(dinouPkgJson);
const { rollup } = dinouRequire("rollup");
const importDinou = (rel) => import(pathToFileURL(path.join(dinouRoot, rel)).href);

const { startEsbuildDev } = await importDinou("esbuild/dev.js");
const { getAssetInfo, getAssetExtensionsInfo } = await importDinou("core/asset-extensions.js");
const { default: dinouAssetPlugin } = await importDinou("rollup/rollup-plugins/dinou-asset-plugin.js");
const { default: reactClientManifest } = await importDinou("rollup/rollup-plugins/rollup-plugin-react-client-manifest.js");
const { default: rollupSwcPlugin } = await importDinou("rollup/rollup-plugins/rollup-plugin-swc.js");

const relBadgePath = path.join(tmpApp, "src", "components", "badge.webp");
const glbPath = path.join(tmpApp, "custom-media", "cube.glb");
const serverAvifPath = path.join(tmpApp, "src", "hero.avif");

const v1Info = getAssetInfo(relBadgePath, tmpApp);
const glbInfo = getAssetInfo(glbPath, tmpApp);
const avifInfo = getAssetInfo(serverAvifPath, tmpApp);

const handle = await startEsbuildDev({ hmrPort: 0 });
try {
  const mem = globalThis.__DINOU_MEM_FILES__;
  assert.ok(mem, "__DINOU_MEM_FILES__ should be populated");
  assert.deepEqual(mem.get(v1Info.fileName), Buffer.from("WEBP_V1_DATA"));
  assert.deepEqual(mem.get(glbInfo.fileName), Buffer.from("GLB_BINARY_DATA"));
  assert.deepEqual(mem.get(avifInfo.fileName), Buffer.from("AVIF_SERVER_DATA"));

  fs.writeFileSync(relBadgePath, Buffer.from("WEBP_V2_UPDATED_CONTENT"));
  const future = new Date(Date.now() + 2000);
  fs.utimesSync(relBadgePath, future, future);

  const v2Info = getAssetInfo(relBadgePath, tmpApp);
  assert.notEqual(v2Info.fileName, v1Info.fileName);

  await handle.notifyFileChanged(relBadgePath);
  assert.equal(
    mem.has(v1Info.fileName),
    false,
    "Stale asset hash should be purged from dev memory"
  );
  assert.deepEqual(
    mem.get(v2Info.fileName),
    Buffer.from("WEBP_V2_UPDATED_CONTENT")
  );
} finally {
  if (handle?.close) await handle.close();
}

// Verify Rollup incremental (!isInitial) build re-emits Server-Component-only assets via knownServerAssets
const extInfo = getAssetExtensionsInfo({ assetExtensions: ["glb"] }, tmpApp);
const rcmPlugin = reactClientManifest({
  srcDir: path.join(tmpApp, "src"),
  manifestPath: path.join(tmpApp, ".dinou", "node-dev", "react-client-manifest.json"),
  assetInclude: extInfo.regex,
  dinouConfig: { assetExtensions: ["glb"] },
  serverFiles: new Set(),
});
const assetPlug = dinouAssetPlugin({
  include: extInfo.regex,
  dinouConfig: { assetExtensions: ["glb"] },
  projectRoot: tmpApp,
});
const dummyEntry = path.join(tmpApp, "rollup-dummy-entry.js");
fs.writeFileSync(dummyEntry, "export const ok = 1;\\n", "utf8");

for (const pass of [1, 2]) {
  if (pass === 2 && typeof rcmPlugin.watchChange === "function") {
    rcmPlugin.watchChange.call(
      { addWatchFile() {} },
      path.join(tmpApp, "src", "components", "viewer.tsx")
    );
  }
  const b = await rollup({
    input: dummyEntry,
    external: (id) => id === "react" || id.startsWith("react/"),
    plugins: [assetPlug, rollupSwcPlugin(), rcmPlugin],
  });
  const { output } = await b.generate({ format: "esm", dir: ".dinou/public" });
  await b.close();
  const emittedAvif = output.find(
    (item) => item.type === "asset" && item.fileName === avifInfo.fileName
  );
  assert.ok(
    emittedAvif,
    \`[Rollup pass \${pass}] Server-Component-only hero.avif must be emitted (including !isInitial watch rebuilds)\`
  );
}
process.exit(0);
`,
      "utf8"
    );

    const devRes = spawnSync(process.execPath, [devChildScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "development",
        DINOU_WRITE_TO_DISK: "false",
      },
    });
    assert.equal(
      devRes.status,
      0,
      `[Section 5] Esbuild dev + Rollup incremental watch check failed:\nSTDOUT:\n${devRes.stdout}\nSTDERR:\n${devRes.stderr}`
    );
  } finally {
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}

console.log(
  "6️⃣ Verifying full production parity across Esbuild, Rollup, Webpack + Node/Cloudflare/Bun/Deno + export-static + HTTP 206/416 Range serving..."
);
{
  const { getAssetInfo } = await importDinou("core/asset-extensions.js");
  const { fixturesBase, tmpApp } = createFixtureApp("assets-prod-parity-");

  try {
    fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmpApp, "custom-media"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
            "@media/*": ["./custom-media/*"],
          },
        },
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "dinou.config.ts"),
      `import { defineConfig } from "dinou";\nexport default defineConfig({ assetExtensions: ["glb"] });\n`,
      "utf8"
    );

    const serverHeroPath = path.join(tmpApp, "src", "server-hero.avif");
    const clientIconPath = path.join(tmpApp, "src", "client-icon.png");
    const sharedVideoPath = path.join(tmpApp, "src", "shared-clip.mp4");
    const customGlbPath = path.join(tmpApp, "custom-media", "robot.glb");
    const cssFontPath = path.join(tmpApp, "src", "inter.woff2");

    fs.writeFileSync(serverHeroPath, Buffer.from("AVIF_ONLY_SERVER_BYTES"));
    fs.writeFileSync(clientIconPath, Buffer.from("PNG_CLIENT_ICON_BYTES"));
    fs.writeFileSync(sharedVideoPath, Buffer.from("0123456789ABCDEF_MP4_STREAM"));
    fs.writeFileSync(customGlbPath, Buffer.from("GLTF_BINARY_3D_MODEL"));
    fs.writeFileSync(cssFontPath, Buffer.from("WOFF2_FONT_BINARY"));

    fs.writeFileSync(
      path.join(tmpApp, "src", "styles.css"),
      `@font-face { font-family: "InterTest"; src: url("./inter.woff2") format("woff2"); }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "player.tsx"),
      `"use client";
import iconUrl from "./client-icon.png";
import videoUrl from "./shared-clip.mp4";
import modelUrl from "@media/robot.glb";
export default function Player() {
  return (
    <div id="client-player" data-icon={iconUrl} data-video={videoUrl} data-model={modelUrl}>
      <img src={iconUrl} alt="icon" />
      <video src={videoUrl} />
    </div>
  );
}
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import "./styles.css";
import serverHeroUrl from "./server-hero.avif";
import videoUrl from "./shared-clip.mp4";
import modelUrl from "@media/robot.glb";
import Player from "./player";
export default function Page() {
  return (
    <html>
      <head>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <section id="rsc-media" data-hero={serverHeroUrl} data-video={videoUrl} data-model={modelUrl}>
          <img src={serverHeroUrl} alt="hero" />
        </section>
        <Player />
      </body>
    </html>
  );
}
`,
      "utf8"
    );

    const expected = {
      hero: getAssetInfo(serverHeroPath, tmpApp),
      icon: getAssetInfo(clientIconPath, tmpApp),
      video: getAssetInfo(sharedVideoPath, tmpApp),
      glb: getAssetInfo(customGlbPath, tmpApp),
      font: getAssetInfo(cssFontPath, tmpApp),
    };

    for (const cmd of [
      "build:node:esbuild",
      "build:node:rollup",
      "build:node:webpack",
    ]) {
      const buildEnv = {
        ...process.env,
        NODE_ENV: "production",
        // Deliberately inject DINOU_DEV=true on esbuild prod build to verify esbuild/build.js clears it!
        ...(cmd === "build:node:esbuild" ? { DINOU_DEV: "true" } : {}),
      };
      delete buildEnv.DINOU_WRITE_TO_DISK;

      const res = spawnSync(process.execPath, [cliPath, cmd], {
        cwd: tmpApp,
        encoding: "utf8",
        env: buildEnv,
      });
      assert.equal(
        res.status,
        0,
        `${cmd} failed:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
      );

      for (const [key, item] of Object.entries(expected)) {
        const diskPath = path.join(tmpApp, ".dinou", "dist3", item.fileName);
        assert.equal(
          fs.existsSync(diskPath),
          true,
          `[${cmd}] Missing ${key} at ${item.fileName}`
        );
      }

      const ssgHtml = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist2", "index.html"),
        "utf8"
      );
      assert.equal(
        ssgHtml.includes(expected.hero.publicUrl),
        true,
        `[${cmd}] SSG HTML missing RSC hero URL`
      );
      assert.equal(
        ssgHtml.includes(expected.icon.publicUrl),
        true,
        `[${cmd}] SSG HTML missing SSR client icon URL`
      );
      assert.equal(
        ssgHtml.includes(expected.video.publicUrl),
        true,
        `[${cmd}] SSG HTML missing shared video URL`
      );
      assert.equal(
        ssgHtml.includes(expected.glb.publicUrl),
        true,
        `[${cmd}] SSG HTML missing custom .glb URL`
      );
      assert.equal(
        ssgHtml.includes("data:image/"),
        false,
        `[${cmd}] SSG HTML must never inline data: URLs`
      );

      const cssOut = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist3", "styles.css"),
        "utf8"
      );
      assert.equal(
        cssOut.includes(expected.font.publicUrl),
        true,
        `[${cmd}] styles.css missing hashed font URL`
      );
    }

    // Verify Node server.mjs HTTP 206 Partial Content, open-ended/suffix ranges & 416 Range Not Satisfiable in isolated child process
    const rangeProbeScript = path.join(tmpApp, "probe-node-range.mjs");
    fs.writeFileSync(
      rangeProbeScript,
      `import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const videoPublicUrl = ${JSON.stringify(expected.video.publicUrl)};
const glbPublicUrl = ${JSON.stringify(expected.glb.publicUrl)};
const serverMod = await import(pathToFileURL(path.resolve(".dinou/node/server.mjs")).href);

const partialRes = await serverMod.fetch(
  new Request("http://localhost" + videoPublicUrl, {
    headers: { Range: "bytes=4-9" },
  })
);
assert.equal(partialRes.status, 206);
assert.equal(partialRes.headers.get("accept-ranges"), "bytes");
assert.equal(partialRes.headers.get("content-range"), "bytes 4-9/27");
assert.equal(partialRes.headers.get("content-length"), "6");
assert.equal(partialRes.headers.get("content-type"), "video/mp4");
assert.equal(partialRes.headers.get("cache-control"), "public, max-age=31536000, immutable");
assert.equal(await partialRes.text(), "456789");

const suffixRes = await serverMod.fetch(
  new Request("http://localhost" + videoPublicUrl, {
    headers: { Range: "bytes=-6" },
  })
);
assert.equal(suffixRes.status, 206);
assert.equal(suffixRes.headers.get("content-range"), "bytes 21-26/27");
assert.equal(await suffixRes.text(), "STREAM");

const invalidRangeRes = await serverMod.fetch(
  new Request("http://localhost" + videoPublicUrl, {
    headers: { Range: "bytes=999-1000" },
  })
);
assert.equal(invalidRangeRes.status, 416);
assert.equal(invalidRangeRes.headers.get("content-range"), "bytes */27");
assert.equal(invalidRangeRes.headers.get("accept-ranges"), "bytes");

const glbRes = await serverMod.fetch(new Request("http://localhost" + glbPublicUrl));
assert.equal(glbRes.status, 200);
assert.equal(glbRes.headers.get("content-type"), "model/gltf-binary");
assert.equal(glbRes.headers.get("accept-ranges"), "bytes");
assert.equal(await glbRes.text(), "GLTF_BINARY_3D_MODEL");
`,
      "utf8"
    );
    const rangeProbeRes = spawnSync(process.execPath, [rangeProbeScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    });
    assert.equal(
      rangeProbeRes.status,
      0,
      `Node server.mjs Range probe failed:\n${rangeProbeRes.stdout}\n${rangeProbeRes.stderr}`
    );

    const cleanProdEnv = {
      ...process.env,
      NODE_ENV: "production",
      DINOU_BUILD_TOOL: "webpack",
    };
    delete cleanProdEnv.DINOU_DEV;
    delete cleanProdEnv.DINOU_WRITE_TO_DISK;

    const cfRes = spawnSync(
      process.execPath,
      [path.join(dinouRoot, "cloudflare", "build.js")],
      { cwd: tmpApp, encoding: "utf8", env: cleanProdEnv }
    );
    assert.equal(
      cfRes.status,
      0,
      `Cloudflare build failed:\n${cfRes.stdout}\n${cfRes.stderr}`
    );
    const cfWorkerCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "cloudflare", "worker.js"),
      "utf8"
    );
    assert.equal(cfWorkerCode.includes("data:image/png;base64"), false);
    const cfSsrEngineCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "cloudflare", "ssr-engine.js"),
      "utf8"
    );
    assert.equal(cfSsrEngineCode.includes(expected.icon.publicUrl), true);
    assert.equal(cfSsrEngineCode.includes(expected.glb.publicUrl), true);
    assert.equal(
      fs.existsSync(
        path.join(tmpApp, ".dinou", "cloudflare", "assets", expected.hero.fileName)
      ),
      true
    );

    const bunRes = spawnSync(
      process.execPath,
      [path.join(dinouRoot, "bun", "build.js")],
      { cwd: tmpApp, encoding: "utf8", env: cleanProdEnv }
    );
    assert.equal(
      bunRes.status,
      0,
      `Bun build failed:\n${bunRes.stdout}\n${bunRes.stderr}`
    );
    const bunSsrCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "bun", "ssr-engine.js"),
      "utf8"
    );
    assert.equal(bunSsrCode.includes(expected.icon.publicUrl), true);
    assert.equal(bunSsrCode.includes(expected.glb.publicUrl), true);
    assert.equal(bunSsrCode.includes("data:image/png;base64"), false);
    const bunServerCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "bun", "server.js"),
      "utf8"
    );
    assert.equal(bunServerCode.includes("parseHttpByteRange"), true);

    const denoRes = spawnSync(
      process.execPath,
      [path.join(dinouRoot, "deno", "build.js")],
      { cwd: tmpApp, encoding: "utf8", env: cleanProdEnv }
    );
    assert.equal(
      denoRes.status,
      0,
      `Deno build failed:\n${denoRes.stdout}\n${denoRes.stderr}`
    );
    const denoSsrCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "deno", "ssr-engine.js"),
      "utf8"
    );
    assert.equal(denoSsrCode.includes(expected.icon.publicUrl), true);
    assert.equal(denoSsrCode.includes(expected.glb.publicUrl), true);
    assert.equal(denoSsrCode.includes("data:image/png;base64"), false);
    const denoMainCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "deno", "main.js"),
      "utf8"
    );
    assert.equal(denoMainCode.includes("parseHttpByteRange"), true);

    const expRes = spawnSync(process.execPath, [cliPath, "export-static"], {
      cwd: tmpApp,
      encoding: "utf8",
      env: cleanProdEnv,
    });
    assert.equal(
      expRes.status,
      0,
      `export-static failed:\n${expRes.stdout}\n${expRes.stderr}`
    );
    for (const [key, item] of Object.entries(expected)) {
      assert.equal(
        fs.existsSync(path.join(tmpApp, "out", item.fileName)),
        true,
        `[export-static] Missing exported ${key} at out/${item.fileName}`
      );
    }
  } finally {
    process.chdir(origCwd);
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}

for (const [rel, beforeContent] of manifestSnapshotBefore.entries()) {
  const abs = path.join(repoRoot, rel);
  const afterContent = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  assert.equal(
    afterContent,
    beforeContent,
    `verify-assets-ci.mjs must not mutate host workspace ${rel}`
  );
}

console.log(
  "RESULT: All static media, custom assetExtensions, path+content fingerprinting, RFC 9110 HTTP 206 Range & 3-bundler/4-runtime parity checks PASSED"
);
