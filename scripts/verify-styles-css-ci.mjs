// scripts/verify-styles-css-ci.mjs
// Verifies Dinou Unified Styles, CSS Modules (RSC + SSR + Client), JSONC tsconfig, CSS url(...) Assets, Font Loaders & Dev HMR Parity:
// 1. createScopedName cross-platform normalization (Windows drive-letter casing & path separators) + font extensions in asset-extensions.js & assets.d.ts
// 2. JSONC tsconfig.json parser (comments, trailing commas, string literal safety) + CSS @import alias & bare node_modules stylesheet resolvers
// 3. Server CSS Modules plugin (compileCssModuleMap + didCssModuleExportsChange) & PostCSS url(...) asset pipeline (/public, data:, #fragment, @import, @/* aliases)
// 4. createPostCSSExtractPlugin incremental stylesheet preservation & deleted-file pruning
// 5. Incremental Esbuild dev CSS HMR: live Tailwind v4 utility refresh on Server Component .tsx edits + globals.css preservation on .module.css edits
// 6. Full 3-bundler (Esbuild, Rollup, Webpack) + 4-runtime (Node, Cloudflare, Bun, Deno) + export-static CSS, minification, assets & CSS Modules parity
// 7. public/styles.css coexistence (zero src/ CSS) & collision protection (compiled src/ CSS wins with warning & preserves nested public/*/styles.css)

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const origCwd = projectRoot;
const origNodeEnv = process.env.NODE_ENV;
const origWriteToDisk = process.env.DINOU_WRITE_TO_DISK;

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
const esbuild = dinouRequire("esbuild");

const importDinou = (relPath) =>
  import(pathToFileURL(path.join(dinouRoot, relPath)).href);

console.log(
  "1️⃣ Verifying createScopedName cross-platform normalization & font asset extensions..."
);
{
  const { default: createScopedName } = await importDinou(
    "core/createScopedName.js"
  );
  const {
    extensions: assetExtensions,
    regex: assetRegex,
    globPattern: assetGlobPattern,
  } = await importDinou("core/asset-extensions.js");

  const sampleRel = path.join("src", "components", "card.module.css");
  const absNative = path.resolve(projectRoot, sampleRel);
  const absPosix = absNative.replace(/\\/g, "/");

  const hashNative = createScopedName("card", absNative);
  const hashPosix = createScopedName("card", absPosix);
  const hashRel = createScopedName("card", sampleRel);
  assert.equal(hashNative, hashPosix);
  assert.equal(hashNative, hashRel);

  if (process.platform === "win32" && /^[a-zA-Z]:/.test(absNative)) {
    const upperDrive = absNative[0].toUpperCase() + absNative.slice(1);
    const lowerDrive = absNative[0].toLowerCase() + absNative.slice(1);
    assert.equal(
      createScopedName("card", upperDrive),
      createScopedName("card", lowerDrive),
      "Windows drive-letter casing must produce identical scoped CSS class names"
    );
    assert.equal(
      createScopedName("card", upperDrive.replace(/\\/g, "/")),
      createScopedName("card", lowerDrive)
    );
  }

  const assetsDts = fs.readFileSync(path.join(dinouRoot, "assets.d.ts"), "utf8");
  for (const fontExt of ["woff", "woff2", "ttf", "otf", "eot"]) {
    assert.ok(
      assetExtensions.includes(fontExt),
      `Expected asset-extensions.js to include .${fontExt}`
    );
    assert.ok(
      assetRegex.test(`font-file.${fontExt}`),
      `Expected assetRegex to match font-file.${fontExt}`
    );
    assert.ok(
      assetGlobPattern.includes(fontExt),
      `Expected assetGlobPattern to include ${fontExt}`
    );
    assert.ok(
      assetsDts.includes(`declare module "*.${fontExt}"`),
      `Expected dinou/assets.d.ts to declare *.${fontExt}`
    );
  }
}

console.log(
  "2️⃣ Verifying JSONC tsconfig.json parser, CSS @import aliases & bare node_modules stylesheet resolution..."
);
{
  const {
    stripJsonCommentsAndTrailingCommas,
    getAbsPathWithExt,
    resolveCssImportSpecifier,
    resolveStyleImportFromCode,
  } = await importDinou("core/get-abs-path-with-ext.js");

  const rawJsonc = `{
    // Single-line comment before compilerOptions
    "compilerOptions": {
      "baseUrl": ".",
      /* Multi-line block comment mentioning @/* and https://example.com */
      "paths": {
        "@/*": ["./src/*"],
        "~styles/*": ["./src/styles/*"],
      },
    },
    "include": [
      "src", // trailing comma in array
    ],
  }`;
  const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(rawJsonc));
  assert.deepEqual(parsed.compilerOptions.paths["@/*"], ["./src/*"]);
  assert.deepEqual(parsed.compilerOptions.paths["~styles/*"], [
    "./src/styles/*",
  ]);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-css-resolve-"));
  try {
    fs.mkdirSync(path.join(tmpDir, "src", "styles"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "node_modules", "mock-katex", "dist"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpDir, "node_modules", "mock-ui", "dist"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpDir, "node_modules", "mock-legacy-style"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpDir, "node_modules", "@mock-org", "styles"), {
      recursive: true,
    });

    fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), rawJsonc, "utf8");
    const tokensFile = path.join(tmpDir, "src", "styles", "tokens.css");
    fs.writeFileSync(tokensFile, ":root { --accent: #7c3aed; }\n", "utf8");

    const katexCss = path.join(
      tmpDir,
      "node_modules",
      "mock-katex",
      "dist",
      "katex.min.css"
    );
    fs.writeFileSync(katexCss, ".katex { font-size: 1.1em; }\n", "utf8");
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "mock-katex", "package.json"),
      JSON.stringify({ name: "mock-katex", version: "1.0.0" }),
      "utf8"
    );

    const mockUiCss = path.join(
      tmpDir,
      "node_modules",
      "mock-ui",
      "dist",
      "theme.css"
    );
    fs.writeFileSync(
      mockUiCss,
      ".mock-ui-btn { display: inline-flex; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "mock-ui", "package.json"),
      JSON.stringify({
        name: "mock-ui",
        version: "1.0.0",
        exports: {
          "./styles": {
            style: "./dist/theme.css",
          },
        },
      }),
      "utf8"
    );

    const legacyCss = path.join(
      tmpDir,
      "node_modules",
      "mock-legacy-style",
      "index.css"
    );
    fs.writeFileSync(legacyCss, ".legacy-box { padding: 4px; }\n", "utf8");
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "mock-legacy-style", "package.json"),
      JSON.stringify({
        name: "mock-legacy-style",
        version: "1.0.0",
        style: "./index.css",
      }),
      "utf8"
    );

    const scopedOrgStyleCss = path.join(
      tmpDir,
      "node_modules",
      "@mock-org",
      "styles",
      "index.css"
    );
    fs.writeFileSync(scopedOrgStyleCss, ".org-box { padding: 4px; }\n", "utf8");
    fs.writeFileSync(
      path.join(tmpDir, "node_modules", "@mock-org", "styles", "package.json"),
      JSON.stringify({
        name: "@mock-org/styles",
        version: "1.0.0",
        style: "./index.css",
      }),
      "utf8"
    );

    const pageFile = path.join(tmpDir, "src", "page.tsx");
    fs.writeFileSync(
      pageFile,
      "export default function Page() { return null; }\n",
      "utf8"
    );

    process.chdir(tmpDir);

    assert.equal(
      path.resolve(getAbsPathWithExt("@/styles/tokens.css")),
      path.resolve(tokensFile)
    );
    assert.equal(
      path.resolve(
        resolveCssImportSpecifier("~styles/tokens.css", path.join(tmpDir, "src"))
      ),
      path.resolve(tokensFile)
    );
    assert.equal(
      path.resolve(
        resolveCssImportSpecifier("mock-legacy-style", path.join(tmpDir, "src"))
      ),
      path.resolve(legacyCss)
    );
    assert.equal(
      path.resolve(
        resolveStyleImportFromCode("mock-katex/dist/katex.min.css", pageFile)
      ),
      path.resolve(katexCss)
    );
    assert.equal(
      path.resolve(resolveStyleImportFromCode("mock-ui/styles", pageFile)),
      path.resolve(mockUiCss)
    );
    assert.equal(
      path.resolve(resolveStyleImportFromCode("@mock-org/styles", pageFile)),
      path.resolve(scopedOrgStyleCss)
    );
    assert.equal(resolveStyleImportFromCode("react", pageFile), null);
  } finally {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log(
  "3️⃣ Verifying server-css-modules-plugin.js, postcss-pipeline.js url(...) rewriting & runtime/HMR wiring..."
);
{
  const { default: createScopedName } = await importDinou(
    "core/createScopedName.js"
  );
  const {
    createServerCssModulesPlugin,
    compileCssModuleMap,
    didCssModuleExportsChange,
  } = await importDinou("core/server-css-modules-plugin.js");
  const {
    postcss,
    postcssImport,
    createPostCssUrlAssetsPlugin,
    getRegisteredCssUrlAssets,
    isTailwindStylesheetSource,
  } = await importDinou("core/postcss-pipeline.js");
  const { resolveCssImportSpecifier } = await importDinou(
    "core/get-abs-path-with-ext.js"
  );

  assert.equal(typeof createServerCssModulesPlugin, "function");
  assert.equal(isTailwindStylesheetSource('@import "tailwindcss";'), true);
  assert.equal(
    isTailwindStylesheetSource("@import 'tailwindcss/utilities';"),
    true
  );
  assert.equal(isTailwindStylesheetSource("@tailwind utilities;"), true);
  assert.equal(isTailwindStylesheetSource(".plain { color: red; }"), false);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-server-cssmod-"));
  try {
    fs.mkdirSync(path.join(tmpDir, "src", "styles"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "src", "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
      }),
      "utf8"
    );

    const spritePath = path.join(tmpDir, "src", "assets", "sprite.svg");
    const subTilePath = path.join(tmpDir, "src", "assets", "sub-tile.svg");
    fs.writeFileSync(spritePath, '<svg><g id="icon"/></svg>', "utf8");
    fs.writeFileSync(subTilePath, "<svg/>", "utf8");

    fs.writeFileSync(
      path.join(tmpDir, "src", "styles", "tokens.css"),
      `:root { --gap: 8px; }\n.from-import { background-image: url("../assets/sub-tile.svg"); }\n`,
      "utf8"
    );

    const modFile = path.join(tmpDir, "src", "widget.module.css");
    fs.writeFileSync(
      modFile,
      `@reference "tailwindcss";\n@import "@/styles/tokens.css";\n.card { @apply p-4; gap: var(--gap); }\n`,
      "utf8"
    );

    process.chdir(tmpDir);

    const first = await compileCssModuleMap(modFile);
    assert.equal(first.map.card, createScopedName("card", modFile));

    await new Promise((r) => setTimeout(r, 25));
    fs.writeFileSync(
      modFile,
      `@reference "tailwindcss";\n@import "@/styles/tokens.css";\n.card { @apply p-6; color: red; }\n`,
      "utf8"
    );
    assert.equal(
      await didCssModuleExportsChange(modFile),
      false,
      "Pure property edits must NOT report CSS Module export changes"
    );

    await new Promise((r) => setTimeout(r, 25));
    fs.writeFileSync(
      modFile,
      `@reference "tailwindcss";\n@import "@/styles/tokens.css";\n.card { color: red; }\n.badge { font-weight: 700; }\n`,
      "utf8"
    );
    assert.equal(
      await didCssModuleExportsChange(modFile),
      true,
      "Adding a new class selector MUST report CSS Module export changes"
    );
    const updated = await compileCssModuleMap(modFile);
    assert.equal(updated.map.badge, createScopedName("badge", modFile));

    // Verify PostCSS url(...) plugin preserves public/data/http/#fragment and rewrites relative/@import/@/* URLs
    const observedAssets = [];
    const entryCssFile = path.join(tmpDir, "src", "entry.css");
    const rawCss = [
      '@import "@/styles/tokens.css";',
      '.u-public { background: url("/public-hero.svg"); }',
      '.u-data { background: url("data:image/svg+xml,%3Csvg/%3E"); }',
      '.u-http { background: url("https://example.com/bg.png"); }',
      ".u-frag { clip-path: url(#myClip); }",
      '.u-alias { mask-image: url("@/assets/sprite.svg#icon"); }',
    ].join("\n");
    fs.writeFileSync(entryCssFile, rawCss, "utf8");

    const processed = await postcss([
      postcssImport({
        resolve: (id, basedir) => resolveCssImportSpecifier(id, basedir),
      }),
      createPostCssUrlAssetsPlugin({
        onAsset(absPath, assetName) {
          observedAssets.push([absPath, assetName]);
        },
      }),
    ]).process(rawCss, { from: entryCssFile });

    const expectedSpriteAsset = `assets/${createScopedName("sprite", spritePath)}.svg`;
    const expectedSubTileAsset = `assets/${createScopedName("sub-tile", subTilePath)}.svg`;

    assert.ok(processed.css.includes('url("/public-hero.svg")'));
    assert.ok(processed.css.includes('url("data:image/svg+xml,%3Csvg/%3E")'));
    assert.ok(processed.css.includes('url("https://example.com/bg.png")'));
    assert.ok(processed.css.includes("url(#myClip)"));
    assert.ok(processed.css.includes(`url("/${expectedSpriteAsset}#icon")`));
    assert.ok(processed.css.includes(`url("/${expectedSubTileAsset}")`));
    assert.equal(observedAssets.length, 2);
    assert.equal(
      path.resolve(getRegisteredCssUrlAssets().get(expectedSpriteAsset)),
      path.resolve(spritePath)
    );
  } finally {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Verify runtime builders & Webpack HMR client wiring
  for (const runtimeRel of [
    "node/dev.js",
    "node/bundle-dual-engine.js",
    "cloudflare/build.js",
    "bun/build.js",
    "deno/build.js",
  ]) {
    const code = fs.readFileSync(path.join(dinouRoot, runtimeRel), "utf8");
    assert.ok(
      code.includes("createServerCssModulesPlugin"),
      `Expected ${runtimeRel} to wire createServerCssModulesPlugin`
    );
    assert.ok(
      code.includes('"style"'),
      `Expected ${runtimeRel} to include "style" package condition`
    );
  }
  const clientWebpackCode = fs.readFileSync(
    path.join(dinouRoot, "core/client-webpack.jsx"),
    "utf8"
  );
  assert.ok(clientWebpackCode.includes("dinou-hmr"));
  assert.ok(clientWebpackCode.includes("style-update"));
  assert.ok(clientWebpackCode.includes("rsc-update"));
}

console.log(
  "4️⃣ Verifying createPostCSSExtractPlugin incremental preservation & deleted-file pruning..."
);
{
  const { createPostCSSExtractPlugin } = await importDinou(
    "esbuild/plugins-postcss/postcss-extract-plugin.js"
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-extract-inc-"));
  process.env.NODE_ENV = "development";
  process.env.DINOU_WRITE_TO_DISK = "false";
  try {
    const globalsPath = path.join(tmpDir, "globals.css");
    const modulePath = path.join(tmpDir, "card.module.css");
    const extraPath = path.join(tmpDir, "temp-extra.css");
    fs.writeFileSync(globalsPath, ".global-reset { margin: 0; }\n", "utf8");
    fs.writeFileSync(modulePath, ".card_hash { color: red; }\n", "utf8");
    fs.writeFileSync(extraPath, ".temp-extra { opacity: 0.5; }\n", "utf8");

    const outCss = path.join(tmpDir, "styles.css");
    const extractor = createPostCSSExtractPlugin({ outputFile: outCss });

    extractor.setExtractedCss(globalsPath, ".global-reset { margin: 0; }");
    extractor.setExtractedCss(modulePath, ".card_hash { color: red; }");
    extractor.setExtractedCss(extraPath, ".temp-extra { opacity: 0.5; }");
    assert.equal(
      extractor.finalize(),
      false,
      "Initial finalize must return false (lastFinalizedCSS === null) so cold boot does not emit style-update"
    );
    assert.equal(
      extractor.finalize(),
      false,
      "Re-finalizing identical CSS must report changed=false"
    );

    const initialMem = globalThis.__DINOU_MEM_FILES__
      .get("/styles.css")
      .toString("utf8");
    assert.match(initialMem, /\.global-reset/);
    assert.match(initialMem, /color: red/);
    assert.match(initialMem, /\.temp-extra/);

    // Simulate incremental rebuild of ONLY card.module.css and deletion of temp-extra.css
    fs.unlinkSync(extraPath);
    extractor.setExtractedCss(modulePath, ".card_hash { color: blue; }");
    assert.equal(extractor.finalize(), true);

    const afterIncMem = globalThis.__DINOU_MEM_FILES__
      .get("/styles.css")
      .toString("utf8");
    assert.match(
      afterIncMem,
      /\.global-reset/,
      "globals.css must NOT be wiped on incremental CSS Module rebuild"
    );
    assert.match(afterIncMem, /color: blue/);
    assert.doesNotMatch(afterIncMem, /color: red/);
    assert.doesNotMatch(
      afterIncMem,
      /\.temp-extra/,
      "Deleted CSS files must be pruned from extractedByFile"
    );
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log(
  "5️⃣ Verifying Esbuild dev CSS HMR: live Tailwind v4 .tsx utility refresh & globals.css preservation..."
);
{
  const { default: cssProcessorPlugin } = await importDinou(
    "esbuild/plugins-esbuild/css-processor-plugin.js"
  );
  const { default: esmHmrPlugin } = await importDinou(
    "esbuild/react-refresh/esm-hmr-plugin.js"
  );
  const fixturesBase = path.join(projectRoot, ".dinou", "tmp-styles-fixtures");
  fs.mkdirSync(fixturesBase, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(fixturesBase, "dinou-dev-hmr-"));
  process.env.NODE_ENV = "development";
  process.env.DINOU_WRITE_TO_DISK = "false";

  let ctx = null;
  try {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    const globalsCss = path.join(tmpDir, "src", "globals.css");
    const cardModuleCss = path.join(tmpDir, "src", "card.module.css");
    const pageTsx = path.join(tmpDir, "src", "page.tsx");

    fs.writeFileSync(
      globalsCss,
      `@import "tailwindcss";\n.base-marker { display: grid; }\n`,
      "utf8"
    );
    fs.writeFileSync(cardModuleCss, `.box { color: crimson; }\n`, "utf8");
    fs.writeFileSync(
      pageTsx,
      `import "./globals.css";\nimport styles from "./card.module.css";\nexport default function Page() { return <div className={"bg-amber-600 " + styles.box}>Hi</div>; }\n`,
      "utf8"
    );

    process.chdir(tmpDir);

    const normKey = (p) => {
      let s = path.resolve(p).replace(/\\/g, "/");
      if (process.platform === "win32") {
        s = s.replace(/^([a-zA-Z]):/, (_, d) => d.toLowerCase() + ":");
      }
      return s;
    };

    const changedIds = new Set();
    const cssModuleClassChanges = new Set();
    const cssRefreshRef = { refresh: null };
    const broadcasts = [];
    const hmrEntries = new Map();
    const hmrEngine = {
      value: {
        setEntry(id, imports) {
          if (!hmrEntries.has(id)) {
            hmrEntries.set(id, { id, imports, isHmrAccepted: false });
          }
        },
        getEntry(id) {
          return hmrEntries.get(id);
        },
        broadcastMessage(msg) {
          broadcasts.push(msg);
        },
      },
    };

    ctx = await esbuild.context({
      absWorkingDir: tmpDir,
      entryPoints: {
        page: pageTsx,
        cardCss: cardModuleCss,
      },
      outdir: ".dinou/public",
      bundle: true,
      splitting: true,
      treeShaking: false,
      metafile: true,
      format: "esm",
      jsx: "automatic",
      write: false,
      plugins: [
        cssProcessorPlugin({
          outdir: path.join(tmpDir, ".dinou", "public"),
          hmrEngine,
          changedIds,
          cssRefreshRef,
          cssModuleClassChanges,
        }),
        esmHmrPlugin({
          entryNames: [],
          changedIds,
          cssModuleClassChanges,
          hmrEngine,
        }),
      ],
    });

    await ctx.rebuild();
    let cssText = globalThis.__DINOU_MEM_FILES__
      .get("/styles.css")
      .toString("utf8");
    assert.match(cssText, /\.bg-amber-600\b/);
    assert.match(cssText, /\.base-marker\b/);
    assert.match(cssText, /color:\s*crimson/);
    assert.doesNotMatch(cssText, /\.text-fuchsia-500\b/);

    broadcasts.length = 0;
    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(
      pageTsx,
      `import "./globals.css";\nimport styles from "./card.module.css";\nexport default function Page() { return <div className={"bg-amber-600 text-fuchsia-500 " + styles.box}>Hi</div>; }\n`,
      "utf8"
    );
    changedIds.clear();
    changedIds.add(pageTsx);
    assert.equal(typeof cssRefreshRef.refresh, "function");
    await cssRefreshRef.refresh();

    cssText = globalThis.__DINOU_MEM_FILES__.get("/styles.css").toString("utf8");
    assert.match(cssText, /\.text-fuchsia-500\b/);
    assert.match(cssText, /color:\s*crimson/);
    assert.ok(
      broadcasts.some(
        (m) => m.type === "style-update" && m.url === "/styles.css"
      )
    );

    broadcasts.length = 0;
    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(cardModuleCss, `.box { color: seagreen; }\n`, "utf8");
    changedIds.clear();
    changedIds.add(normKey(cardModuleCss));
    await ctx.rebuild();

    cssText = globalThis.__DINOU_MEM_FILES__.get("/styles.css").toString("utf8");
    assert.match(cssText, /\.base-marker\b/);
    assert.match(cssText, /\.text-fuchsia-500\b/);
    assert.match(cssText, /color:\s*seagreen/);
    assert.doesNotMatch(cssText, /color:\s*crimson/);
    assert.ok(
      broadcasts.some(
        (m) => m.type === "style-update" && m.url === "/styles.css"
      )
    );
    assert.ok(
      !broadcasts.some((m) => m.type === "reload"),
      "Pure CSS Module property edits must NOT trigger a full browser reload"
    );

    // Adding a new class selector to a standalone CSS Module entry MUST notify JS reload
    broadcasts.length = 0;
    await new Promise((r) => setTimeout(r, 30));
    fs.writeFileSync(
      cardModuleCss,
      `.box { color: seagreen; }\n.extraBadge { font-weight: 700; }\n`,
      "utf8"
    );
    changedIds.clear();
    changedIds.add(normKey(cardModuleCss));
    await ctx.rebuild();
    assert.ok(
      broadcasts.some((m) => m.type === "reload"),
      "Adding a new class key to a standalone CSS Module entry must trigger JS reload"
    );
  } finally {
    if (ctx) await ctx.dispose();
    process.chdir(origCwd);
    process.env.NODE_ENV = origNodeEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    try {
      if (
        fs.existsSync(fixturesBase) &&
        fs.readdirSync(fixturesBase).length === 0
      ) {
        fs.rmdirSync(fixturesBase);
      }
    } catch {}
  }
}

console.log(
  "6️⃣ Verifying full 3-bundler (Esbuild, Rollup, Webpack) + 4-runtime + export-static CSS, minification & CSS Modules parity..."
);
{
  const { default: createScopedName } = await importDinou(
    "core/createScopedName.js"
  );
  const fixturesBase = path.join(projectRoot, ".dinou", "tmp-styles-fixtures");
  fs.mkdirSync(fixturesBase, { recursive: true });
  const tmpApp = fs.mkdtempSync(path.join(fixturesBase, "dinou-styles-"));

  try {
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
        { name: "dinou-styles-fixture", version: "1.0.0", type: "module" },
        null,
        2
      ),
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      `{
        // JSONC comment in tsconfig
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@/*": ["./src/*"],
          },
        },
      }`,
      "utf8"
    );

    fs.mkdirSync(path.join(tmpApp, "public"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "public", "hero-public.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
      "utf8"
    );

    fs.mkdirSync(path.join(tmpApp, "src", "assets"), { recursive: true });
    const patternSvgPath = path.join(tmpApp, "src", "assets", "pattern.svg");
    const fontWoff2Path = path.join(
      tmpApp,
      "src",
      "assets",
      "local-font.woff2"
    );
    fs.writeFileSync(
      patternSvgPath,
      '<svg xmlns="http://www.w3.org/2000/svg"><g id="grid"/></svg>',
      "utf8"
    );
    fs.writeFileSync(fontWoff2Path, Buffer.from("wOF2mockfontbytes"));

    const nestedVendorDir = path.join(
      tmpApp,
      "src",
      "node_modules",
      "mock-third-party-css",
      "dist"
    );
    fs.mkdirSync(path.join(nestedVendorDir, "fonts"), { recursive: true });
    const thirdPartyFontPath = path.join(
      nestedVendorDir,
      "fonts",
      "third-party.woff2"
    );
    fs.writeFileSync(thirdPartyFontPath, Buffer.from("wOF2thirdparty"));
    fs.writeFileSync(
      path.join(
        tmpApp,
        "src",
        "node_modules",
        "mock-third-party-css",
        "package.json"
      ),
      JSON.stringify({
        name: "mock-third-party-css",
        version: "1.0.0",
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(nestedVendorDir, "styles.min.css"),
      `@font-face { font-family: "MockMath"; src: url(fonts/third-party.woff2) format("woff2"); }\n.mock-third-party-widget { letter-spacing: 0.05em; }\n`,
      "utf8"
    );

    fs.mkdirSync(path.join(tmpApp, "src", "styles"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpApp, "src", "styles", "tokens.css"),
      `:root { --brand-token: #7c3aed; }\n.tokens-bg-check { background-image: url("../assets/pattern.svg#grid"); }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "styles", "unimported.css"),
      `.should-never-be-bundled { color: hotpink; }\n`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "globals.css"),
      `/* unminified-comment-must-be-stripped */\n@import "tailwindcss";\n@import "@/styles/tokens.css";\n.hero-banner { background-image: url("/hero-public.svg"), url("@/assets/pattern.svg#grid"); }\n@font-face { font-family: "LocalFont"; src: url("./assets/local-font.woff2") format("woff2"); }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "second-global.css"),
      `.second-global-marker { border-color: var(--brand-token); }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "error-only.css"),
      `.error-only-marker { outline: 2px solid crimson; }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "src", "not-found-only.css"),
      `.not-found-only-marker { outline: 2px dotted teal; }\n`,
      "utf8"
    );

    const cardModulePath = path.join(tmpApp, "src", "card.module.css");
    fs.writeFileSync(
      cardModulePath,
      `@reference "tailwindcss";\n@import "@/styles/tokens.css";\n.serverCard { @apply rounded-xl; color: var(--brand-token); }\n.clientBadge { font-weight: 600; }\n`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "layout.tsx"),
      `import "./globals.css";
import "./second-global.css";

export default function Layout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <title>Styles Parity</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body className="bg-emerald-700">{children}</body>
    </html>
  );
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "error.tsx"),
      `import "./error-only.css";
export default function ErrorPage() {
  return <div className="error-only-marker">Error</div>;
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "not_found.tsx"),
      `import "./not-found-only.css";
export default function NotFoundPage() {
  return <div className="not-found-only-marker">Not Found</div>;
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "ClientBadge.tsx"),
      `"use client";
import styles from "./card.module.css";

export function ClientBadge() {
  return <span data-testid="client-badge" className={styles.clientBadge}>Client Badge</span>;
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(tmpApp, "src", "page.tsx"),
      `import "mock-third-party-css/dist/styles.min.css";
import styles from "./card.module.css";
import fontUrl from "./assets/local-font.woff2";
import { ClientBadge } from "./ClientBadge";

export default function Page() {
  return (
    <main data-testid="server-card" className={styles.serverCard} data-font={fontUrl}>
      <h1>Server Styled Card</h1>
      <ClientBadge />
    </main>
  );
}
`,
      "utf8"
    );

    process.chdir(tmpApp);
    const expectedServerHash = createScopedName("serverCard", cardModulePath);
    const expectedClientHash = createScopedName("clientBadge", cardModulePath);
    const expectedPatternAsset = `assets/${createScopedName("pattern", patternSvgPath)}.svg`;
    const expectedLocalFontAsset = `assets/${createScopedName("local-font", fontWoff2Path)}.woff2`;
    const expectedThirdPartyFontAsset = `assets/${createScopedName("third-party", thirdPartyFontPath)}.woff2`;

    const cliPath = path.join(dinouRoot, "cli.js");
    const cleanBuildEnv = { ...process.env, NODE_ENV: "production" };
    delete cleanBuildEnv.DINOU_WRITE_TO_DISK;

    for (const buildCmd of [
      "build:node:esbuild",
      "build:node:rollup",
      "build:node:webpack",
    ]) {
      execFileSync(process.execPath, [cliPath, buildCmd], {
        cwd: tmpApp,
        stdio: "pipe",
        env: cleanBuildEnv,
      });

      const stylesPath = path.join(tmpApp, ".dinou", "dist3", "styles.css");
      assert.ok(
        fs.existsSync(stylesPath),
        `[${buildCmd}] .dinou/dist3/styles.css must exist`
      );
      const css = fs.readFileSync(stylesPath, "utf8");

      assert.ok(
        !css.includes("unminified-comment-must-be-stripped"),
        `[${buildCmd}] Production /styles.css must be minified (strip comments)`
      );
      assert.match(css, /--brand-token:\s*#7c3aed/i);
      assert.match(css, /\.bg-emerald-700\b/);
      assert.match(css, /\.second-global-marker\b/);
      assert.match(css, /\.error-only-marker\b/);
      assert.match(css, /\.not-found-only-marker\b/);
      assert.match(css, /\.mock-third-party-widget\b/);
      assert.ok(css.includes(`.${expectedServerHash}`));
      assert.ok(css.includes(`.${expectedClientHash}`));
      assert.ok(css.includes("/hero-public.svg"));
      assert.ok(css.includes(`/${expectedPatternAsset}#grid`));
      assert.ok(css.includes(`/${expectedLocalFontAsset}`));
      assert.ok(css.includes(`/${expectedThirdPartyFontAsset}`));
      assert.ok(
        !css.includes("../assets/"),
        `[${buildCmd}] @import-inlined relative url(...) inside Tailwind/@reference stylesheets must be rewritten before LightningCSS flattens source origins`
      );
      assert.ok(!css.includes("should-never-be-bundled"));

      for (const relAsset of [
        expectedPatternAsset,
        expectedLocalFontAsset,
        expectedThirdPartyFontAsset,
      ]) {
        assert.ok(
          fs.existsSync(path.join(tmpApp, ".dinou", "dist3", relAsset)),
          `[${buildCmd}] Missing emitted CSS url(...) asset .dinou/dist3/${relAsset}`
        );
      }

      const ssgHtml = fs.readFileSync(
        path.join(tmpApp, ".dinou", "dist2", "index.html"),
        "utf8"
      );
      assert.ok(
        ssgHtml.includes(`class="${expectedServerHash}"`),
        `[${buildCmd}] SSG HTML must include Server Component CSS Module class ${expectedServerHash}`
      );
      assert.ok(
        ssgHtml.includes(`class="${expectedClientHash}"`),
        `[${buildCmd}] SSG HTML must include Client Component CSS Module class ${expectedClientHash}`
      );
    }

    for (const [runtimeScript, extraEnv] of [
      ["cloudflare/build.js", { DINOU_BUILD_TOOL: "webpack" }],
      ["bun/build.js", { DINOU_BUILD_TOOL: "webpack" }],
      ["deno/build.js", { DINOU_BUILD_TOOL: "webpack" }],
    ]) {
      execFileSync(process.execPath, [path.join(dinouRoot, runtimeScript)], {
        cwd: tmpApp,
        stdio: "pipe",
        env: { ...cleanBuildEnv, ...extraEnv },
      });
    }

    const cfWorkerCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "cloudflare", "worker.js"),
      "utf8"
    );
    const bunServerCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "bun", "server.js"),
      "utf8"
    );
    const denoMainCode = fs.readFileSync(
      path.join(tmpApp, ".dinou", "deno", "main.js"),
      "utf8"
    );
    for (const [runtimeLabel, bundleCode] of [
      ["cloudflare", cfWorkerCode],
      ["bun", bunServerCode],
      ["deno", denoMainCode],
    ]) {
      assert.ok(
        bundleCode.includes(expectedServerHash) &&
          bundleCode.includes(expectedClientHash),
        `[${runtimeLabel}] Runtime bundle must embed scoped CSS Module classes`
      );
    }
    assert.ok(
      fs.existsSync(
        path.join(tmpApp, ".dinou", "cloudflare", "assets", "styles.css")
      )
    );
    assert.ok(
      fs.existsSync(
        path.join(tmpApp, ".dinou", "cloudflare", "assets", expectedPatternAsset)
      )
    );

    execFileSync(process.execPath, [cliPath, "export-static"], {
      cwd: tmpApp,
      stdio: "pipe",
      env: cleanBuildEnv,
    });
    assert.ok(fs.existsSync(path.join(tmpApp, "out", "styles.css")));
    assert.ok(fs.existsSync(path.join(tmpApp, "out", expectedPatternAsset)));
    assert.ok(fs.existsSync(path.join(tmpApp, "out", expectedLocalFontAsset)));
    assert.ok(
      fs.existsSync(path.join(tmpApp, "out", expectedThirdPartyFontAsset))
    );
    const exportedHtml = fs.readFileSync(
      path.join(tmpApp, "out", "index.html"),
      "utf8"
    );
    assert.ok(exportedHtml.includes(`class="${expectedServerHash}"`));
    assert.ok(exportedHtml.includes(`class="${expectedClientHash}"`));
  } finally {
    process.chdir(origCwd);
    fs.rmSync(tmpApp, { recursive: true, force: true });
    try {
      if (
        fs.existsSync(fixturesBase) &&
        fs.readdirSync(fixturesBase).length === 0
      ) {
        fs.rmdirSync(fixturesBase);
      }
    } catch {}
  }
}

console.log(
  "7️⃣ Verifying public/styles.css coexistence (zero src/ CSS) & collision protection (compiled src/ CSS wins with warning)..."
);
{
  const { createPostCSSExtractPlugin } = await importDinou(
    "esbuild/plugins-postcss/postcss-extract-plugin.js"
  );
  const cliPath = path.join(dinouRoot, "cli.js");
  const fixturesBase = path.join(projectRoot, ".dinou", "tmp-styles-fixtures");
  fs.mkdirSync(fixturesBase, { recursive: true });

  const createPublicStylesFixtureApp = (prefix) => {
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
        { name: "dinou-public-styles-fixture", version: "1.0.0", type: "module" },
        null,
        2
      ),
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpApp, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["./src/*"] },
          },
        },
        null,
        2
      ),
      "utf8"
    );
    return tmpApp;
  };

  const cleanBuildEnv = { ...process.env, NODE_ENV: "production" };
  delete cleanBuildEnv.DINOU_WRITE_TO_DISK;

  // 7A: Zero CSS imported in src/ -> public/styles.css & public/nested/styles.css served unminified with zero warnings
  const tmpAppNoSrcCss = createPublicStylesFixtureApp("dinou-pub-styles-only-");
  try {
    fs.mkdirSync(path.join(tmpAppNoSrcCss, "public", "nested"), { recursive: true });
    fs.mkdirSync(path.join(tmpAppNoSrcCss, "src"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpAppNoSrcCss, "public", "styles.css"),
      "/* raw public stylesheet */\nbody { background: papayawhip; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpAppNoSrcCss, "public", "nested", "styles.css"),
      ".nested-public { color: rebeccapurple; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpAppNoSrcCss, "src", "layout.tsx"),
      `export default function Layout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head><link rel="stylesheet" href="/styles.css" /></head>
      <body>{children}</body>
    </html>
  );
}
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpAppNoSrcCss, "src", "page.tsx"),
      `export default function Page() { return <main>Hello Public Styles</main>; }\n`,
      "utf8"
    );

    process.chdir(tmpAppNoSrcCss);
    process.env.NODE_ENV = "development";
    globalThis.__DINOU_MEM_FILES__ = new Map([
      ["styles.css", Buffer.from("stale")],
      ["/styles.css", Buffer.from("stale")],
    ]);
    const extractor = createPostCSSExtractPlugin({
      outputFile: path.join(tmpAppNoSrcCss, ".dinou", "public", "styles.css"),
    });
    extractor.finalize();
    assert.equal(globalThis.__DINOU_HAS_COMPILED_STYLES__, false);
    assert.equal(globalThis.__DINOU_MEM_FILES__.has("styles.css"), false);
    assert.equal(globalThis.__DINOU_MEM_FILES__.has("/styles.css"), false);

    for (const buildCmd of [
      "build:node:esbuild",
      "build:node:rollup",
      "build:node:webpack",
    ]) {
      const res = spawnSync(process.execPath, [cliPath, buildCmd], {
        cwd: tmpAppNoSrcCss,
        encoding: "utf8",
        env: cleanBuildEnv,
      });
      assert.equal(
        res.status,
        0,
        `[7A ${buildCmd}] failed:\n${res.stdout}\n${res.stderr}`
      );
      assert.doesNotMatch(
        `${res.stdout}\n${res.stderr}`,
        /Detected "public\/styles\.css"/,
        `[7A ${buildCmd}] Must NOT warn when zero CSS is imported in src/`
      );

      const distStyles = fs.readFileSync(
        path.join(tmpAppNoSrcCss, ".dinou", "dist3", "styles.css"),
        "utf8"
      );
      assert.match(distStyles, /papayawhip/);
      assert.match(
        distStyles,
        /\/\* raw public stylesheet \*\//,
        `[7A ${buildCmd}] Raw public/styles.css comment must be preserved unminified`
      );

      const nestedStyles = fs.readFileSync(
        path.join(tmpAppNoSrcCss, ".dinou", "dist3", "nested", "styles.css"),
        "utf8"
      );
      assert.match(nestedStyles, /\.nested-public\b/);
    }

    const expRes = spawnSync(process.execPath, [cliPath, "export-static"], {
      cwd: tmpAppNoSrcCss,
      encoding: "utf8",
      env: cleanBuildEnv,
    });
    assert.equal(expRes.status, 0, `[7A export-static] failed:\n${expRes.stderr}`);
    assert.match(
      fs.readFileSync(path.join(tmpAppNoSrcCss, "out", "styles.css"), "utf8"),
      /papayawhip/
    );
  } finally {
    process.chdir(origCwd);
    process.env.NODE_ENV = origNodeEnv;
    fs.rmSync(tmpAppNoSrcCss, { recursive: true, force: true });
  }

  // 7B: CSS imported in src/ + public/styles.css -> compiled src/ CSS wins, warning emitted, public/nested/styles.css preserved
  const tmpAppCollision = createPublicStylesFixtureApp("dinou-pub-styles-col-");
  try {
    fs.mkdirSync(path.join(tmpAppCollision, "public", "nested"), { recursive: true });
    fs.mkdirSync(path.join(tmpAppCollision, "src"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpAppCollision, "public", "styles.css"),
      ".from-public-should-be-ignored { color: orange; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpAppCollision, "public", "nested", "styles.css"),
      ".nested-public-preserved { color: purple; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpAppCollision, "src", "globals.css"),
      ".compiled-from-src { color: teal; }\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpAppCollision, "src", "layout.tsx"),
      `import "./globals.css";
export default function Layout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head><link rel="stylesheet" href="/styles.css" /></head>
      <body>{children}</body>
    </html>
  );
}
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpAppCollision, "src", "page.tsx"),
      `export default function Page() { return <main className="compiled-from-src">Hi</main>; }\n`,
      "utf8"
    );

    for (const buildCmd of [
      "build:node:esbuild",
      "build:node:rollup",
      "build:node:webpack",
    ]) {
      const res = spawnSync(process.execPath, [cliPath, buildCmd], {
        cwd: tmpAppCollision,
        encoding: "utf8",
        env: cleanBuildEnv,
      });
      assert.equal(
        res.status,
        0,
        `[7B ${buildCmd}] failed:\n${res.stdout}\n${res.stderr}`
      );

      const combinedLogs = `${res.stdout}\n${res.stderr}`;
      assert.match(
        combinedLogs,
        /Detected "public\/styles\.css" alongside CSS imported in "src\/"/,
        `[7B ${buildCmd}] Expected collision warning in build output`
      );

      const distStyles = fs.readFileSync(
        path.join(tmpAppCollision, ".dinou", "dist3", "styles.css"),
        "utf8"
      );
      assert.match(distStyles, /\.compiled-from-src\b/);
      assert.doesNotMatch(distStyles, /from-public-should-be-ignored/);

      const nestedStyles = fs.readFileSync(
        path.join(tmpAppCollision, ".dinou", "dist3", "nested", "styles.css"),
        "utf8"
      );
      assert.match(nestedStyles, /\.nested-public-preserved\b/);
    }

    const expRes = spawnSync(process.execPath, [cliPath, "export-static"], {
      cwd: tmpAppCollision,
      encoding: "utf8",
      env: cleanBuildEnv,
    });
    assert.equal(expRes.status, 0, `[7B export-static] failed:\n${expRes.stderr}`);
    const outStyles = fs.readFileSync(
      path.join(tmpAppCollision, "out", "styles.css"),
      "utf8"
    );
    assert.match(outStyles, /\.compiled-from-src\b/);
    assert.doesNotMatch(outStyles, /from-public-should-be-ignored/);
    assert.match(
      fs.readFileSync(path.join(tmpAppCollision, "out", "nested", "styles.css"), "utf8"),
      /\.nested-public-preserved\b/
    );
  } finally {
    process.chdir(origCwd);
    fs.rmSync(tmpAppCollision, { recursive: true, force: true });
    try {
      if (
        fs.existsSync(fixturesBase) &&
        fs.readdirSync(fixturesBase).length === 0
      ) {
        fs.rmdirSync(fixturesBase);
      }
    } catch {}
  }
}

if (origNodeEnv === undefined) {
  delete process.env.NODE_ENV;
} else {
  process.env.NODE_ENV = origNodeEnv;
}
if (origWriteToDisk === undefined) {
  delete process.env.DINOU_WRITE_TO_DISK;
} else {
  process.env.DINOU_WRITE_TO_DISK = origWriteToDisk;
}

for (const [rel, beforeContent] of manifestSnapshotBefore.entries()) {
  const abs = path.join(projectRoot, rel);
  const afterContent = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  assert.equal(
    afterContent,
    beforeContent,
    `verify-styles-css-ci.mjs must not mutate host workspace ${rel}`
  );
}

console.log(
  "RESULT: All unified styles, CSS Modules (RSC + SSR + Client), JSONC tsconfig, CSS url(...) assets, dev HMR & 3-bundler/4-runtime parity checks PASSED"
);
