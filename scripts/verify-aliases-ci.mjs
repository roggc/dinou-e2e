// scripts/verify-aliases-ci.mjs
// Verifies Dinou v9.4.0 Unified tsconfig.json & jsconfig.json Path Aliases Engine:
// 1. Canonical builtin-asset-extensions.js identity + full TypeScript paths spec (longest-prefix/suffix specificity, exact match, ~*, multi-target fallback arrays, UTF-8 BOM + JSONC comments w/ URLs + trailing commas, .js/.jsx/.mjs/.cjs -> .ts/.tsx/.mts/.cts ESM substitution, directory package.json & index.*, preferStyles)
// 2. Recursive extends chains (monorepo parent baseUrl, TS 5.0+ extends arrays, node_modules @acme/tsconfig preset, TS 5.5+ ${configDir}), jsconfig.json fallback, zero-config @/* & ~/*, baseUrl bare-specifier fallback (excluding react & node:*), getSanitizedEsbuildTsconfigRaw, and automatic mtimeMs cache invalidation
// 3. _folder escape guard parity across custom aliases (@docs/_private/*, "@secret/*": ["./src/docs/_private/*"], baseUrl _private/*) + dinou.config.ts aliased imports via getDinouConfig()
// 4. Dev server Esbuild SWC mirror + baseUrl parity (startEsbuildDev + live refreshAliases / restart on tsconfig.paths.json change without touching src/)
// 5. Full 3-bundler (esbuild, rollup, webpack) x multi-runtime (Node AOT HTTP + Server Action, export-static, Cloudflare, Bun, Deno) matrix with aliased global CSS (@import + url()), CSS Modules, SVG assets, external shared fallback, and baseUrl bare imports
// 6. Dual-Engine jsconfig.json + .mjs + CSS Modules dynamic Pass A + Pass B parity

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

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
const cliPath = path.join(dinouRoot, "cli.js");

const importDinou = (relPath) =>
  import(pathToFileURL(path.join(dinouRoot, relPath)).href);

function removeDirSafe(dirPath) {
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  } catch {}
}

function writeFiles(baseDir, filesObj) {
  for (const [rel, content] of Object.entries(filesObj)) {
    const abs = path.join(baseDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
}

function createFixtureApp(prefix) {
  const fixturesBase = path.join(projectRoot, ".dinou", "tmp-alias-fixtures");
  fs.mkdirSync(fixturesBase, { recursive: true });
  const tmpApp = fs.mkdtempSync(path.join(fixturesBase, prefix));

  const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const relToDinou = (sub) =>
    path.relative(dinouShimDir, path.join(dinouRoot, sub)).replace(/\\/g, "/");

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
    `export * from ${JSON.stringify(relToDinou("index.js"))};\nexport { default } from ${JSON.stringify(relToDinou("index.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(relToDinou("server.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(relToDinou("core/config.js"))};\nexport { default } from ${JSON.stringify(relToDinou("core/config.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(tmpApp, "package.json"),
    JSON.stringify(
      { name: "dinou-alias-fixture", version: "1.0.0", type: "module" },
      null,
      2
    ),
    "utf8"
  );
  return { fixturesBase, tmpApp };
}

function cleanupFixtureApp(fixturesBase, tmpApp) {
  removeDirSafe(tmpApp);
  try {
    if (
      fs.existsSync(fixturesBase) &&
      fs.readdirSync(fixturesBase).length === 0
    ) {
      fs.rmdirSync(fixturesBase);
    }
  } catch {}
}

const {
  BUILTIN_ASSET_EXTENSIONS: CANONICAL_ASSET_EXTENSIONS,
  BUILTIN_ASSET_REGEX: CANONICAL_ASSET_REGEX,
} = await importDinou("core/builtin-asset-extensions.js");
const {
  extensions: BUILTIN_ASSET_EXTENSIONS,
  regex: DEFAULT_ASSET_REGEX,
} = await importDinou("core/asset-extensions.js");
const {
  loadTsconfigAliasInfo,
  resolveTsconfigAlias,
  matchesExplicitUserAlias,
  getSanitizedEsbuildTsconfigRaw,
  clearTsconfigAliasCache,
  rollupTsconfigAliasesPlugin,
} = await importDinou("core/tsconfig-aliases.js");
const { checkForbiddenUnderscoreImport } = await importDinou(
  "core/resolve-contextual-dinou.js"
);
const { getDinouConfig } = await importDinou("core/load-dinou-config.js");

console.log(
  "1️⃣ Verifying canonical builtin-asset-extensions.js & full TypeScript paths spec (specificity, exact, suffix, ~*, multi-target fallback, BOM/JSONC, .js->.ts, preferStyles)..."
);
{
  assert.equal(CANONICAL_ASSET_EXTENSIONS, BUILTIN_ASSET_EXTENSIONS);
  assert.equal(CANONICAL_ASSET_REGEX, DEFAULT_ASSET_REGEX);
  assert.ok(BUILTIN_ASSET_EXTENSIONS.includes("mov"));
  assert.ok(BUILTIN_ASSET_EXTENSIONS.includes("mkv"));
  assert.ok(DEFAULT_ASSET_REGEX.test("/media/video.mov"));
  assert.ok(DEFAULT_ASSET_REGEX.test("/media/video.mkv"));

  const { fixturesBase, tmpApp } = createFixtureApp("alias-spec-");
  try {
    const bomJsoncConfig =
      "\uFEFF{\n" +
      '  // Line comment with URL https://www.typescriptlang.org/tsconfig#paths and "quotes"\n' +
      "  /* Block comment\n" +
      "     spanning multiple lines */\n" +
      '  "compilerOptions": {\n' +
      '    "baseUrl": ".",\n' +
      '    "paths": {\n' +
      "      // Deliberately put LESS specific @ui/* BEFORE @ui/icons/*!\n" +
      '      "@ui/*": ["./src/ui/*"],\n' +
      '      "@ui/icons/*": ["./src/icons/*"],\n' +
      '      "@config": ["./src/config/app-settings.ts"],\n' +
      '      "@icons/*.svg": ["./src/svg-icons/*.svg"],\n' +
      '      "~*": ["./src/tilde/*"],\n' +
      '      "@shared/*": ["./src/local-override/*", "./shared-lib/*"],\n' +
      '      "@assets/*": ["./src/assets/*"],\n' +
      "    },\n" +
      "  },\n" +
      "}\n";

    writeFiles(tmpApp, {
      "tsconfig.json": bomJsoncConfig,
      "src/ui/Card.tsx": "export const Card = () => 'ui-card';\n",
      "src/ui/icons/Star.tsx": "export const Star = () => 'WRONG-FALLBACK';\n",
      "src/icons/Star.tsx": "export const Star = () => 'specific-icon';\n",
      "src/config/app-settings.ts": "export const CFG = 42;\n",
      "src/svg-icons/arrow.svg": "<svg></svg>\n",
      "src/tilde/helpers/math.ts": "export const add = (a, b) => a + b;\n",
      "src/local-override/button.tsx": "export const Btn = 'local';\n",
      "shared-lib/button.tsx": "export const Btn = 'shared';\n",
      "shared-lib/only-in-shared.ts": "export const SHARED = true;\n",
      "src/ui/esm-mod.ts": "export const esm = 1;\n",
      "src/ui/esm-view.tsx": "export const View = () => null;\n",
      "src/ui/esm-esm.mts": "export const mts = true;\n",
      "src/ui/esm-cjs.cts": "export const cts = true;\n",
      "src/ui/pkg-comp/package.json": JSON.stringify({
        module: "./esm/entry.tsx",
        style: "./theme.css",
      }),
      "src/ui/pkg-comp/esm/entry.tsx": "export const PkgComp = 1;\n",
      "src/ui/pkg-comp/theme.css": ".pkg { color: green; }\n",
      "src/ui/dir-comp/index.tsx": "export const DirComp = 2;\n",
      "src/ui/Widget.tsx": "export const Widget = () => null;\n",
      "src/ui/Widget.css": ".widget { color: red; }\n",
      "src/assets/clip.mov": "MOVDATA",
    });

    // Ensure Rollup alias plugin yields .mov/.mkv to dinouAssetPlugin via canonical DEFAULT_ASSET_REGEX
    // even when @assets/clip.mov exists on disk and matches @assets/*
    assert.equal(
      resolveTsconfigAlias("@assets/clip.mov", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/assets/clip.mov")
    );
    const rollupAliasPlug = rollupTsconfigAliasesPlugin({ projectRoot: tmpApp });
    assert.equal(rollupAliasPlug.resolveId("@assets/clip.mov"), null);

    // Specificity: @ui/icons/* MUST beat @ui/* despite declaration order
    assert.equal(
      resolveTsconfigAlias("@ui/icons/Star", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/icons/Star.tsx")
    );
    assert.equal(
      resolveTsconfigAlias("@ui/Card", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/ui/Card.tsx")
    );

    // Exact match (no wildcard)
    assert.equal(
      resolveTsconfigAlias("@config", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/config/app-settings.ts")
    );
    assert.equal(
      resolveTsconfigAlias("@config/extra", { projectRoot: tmpApp }),
      null
    );

    // Suffix wildcard
    assert.equal(
      resolveTsconfigAlias("@icons/arrow.svg", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/svg-icons/arrow.svg")
    );

    // Prefix without slash (~*)
    assert.equal(
      resolveTsconfigAlias("~helpers/math", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/tilde/helpers/math.ts")
    );

    // Multi-target fallback array
    assert.equal(
      resolveTsconfigAlias("@shared/button", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/local-override/button.tsx")
    );
    assert.equal(
      resolveTsconfigAlias("@shared/only-in-shared", { projectRoot: tmpApp }),
      path.join(tmpApp, "shared-lib/only-in-shared.ts")
    );

    // TypeScript ESM .js/.jsx/.mjs/.cjs -> .ts/.tsx/.mts/.cts substitution
    assert.equal(
      resolveTsconfigAlias("@ui/esm-mod.js", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/ui/esm-mod.ts")
    );
    assert.equal(
      resolveTsconfigAlias("@ui/esm-view.jsx", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/ui/esm-view.tsx")
    );
    assert.equal(
      resolveTsconfigAlias("@ui/esm-esm.mjs", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/ui/esm-esm.mts")
    );
    assert.equal(
      resolveTsconfigAlias("@ui/esm-cjs.cjs", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/ui/esm-cjs.cts")
    );

    // Directory package.json & index.tsx resolution
    assert.equal(
      resolveTsconfigAlias("@ui/pkg-comp", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/ui/pkg-comp/esm/entry.tsx")
    );
    assert.equal(
      resolveTsconfigAlias("@ui/pkg-comp", {
        projectRoot: tmpApp,
        preferStyles: true,
      }),
      path.join(tmpApp, "src/ui/pkg-comp/theme.css")
    );
    assert.equal(
      resolveTsconfigAlias("@ui/dir-comp", { projectRoot: tmpApp }),
      path.join(tmpApp, "src/ui/dir-comp/index.tsx")
    );

    // Context-aware preferStyles: sibling Widget.tsx vs Widget.css
    assert.equal(
      resolveTsconfigAlias("@ui/Widget", {
        projectRoot: tmpApp,
        preferStyles: false,
      }),
      path.join(tmpApp, "src/ui/Widget.tsx")
    );
    assert.equal(
      resolveTsconfigAlias("@ui/Widget", {
        projectRoot: tmpApp,
        preferStyles: true,
      }),
      path.join(tmpApp, "src/ui/Widget.css")
    );
  } finally {
    clearTsconfigAliasCache(tmpApp);
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}
console.log("   ✅ Section 1 passed!");

console.log(
  "2️⃣ Verifying recursive extends chains (monorepo baseUrl, TS 5.0+ arrays, node_modules preset, TS 5.5+ ${configDir}), jsconfig.json, zero-config @/* & ~/*, baseUrl fallback & mtimeMs invalidation..."
);
{
  const { fixturesBase, tmpApp } = createFixtureApp("alias-extends-");
  try {
    // A. Monorepo parent tsconfig.base.json with its own baseUrl + paths
    const monoRoot = path.join(tmpApp, "monorepo");
    const webApp = path.join(monoRoot, "apps/web");
    writeFiles(monoRoot, {
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@mono/*": ["packages/shared/src/*"],
          },
        },
      }),
      "packages/shared/src/logger.ts": "export const log = () => 'ok';\n",
      "apps/web/tsconfig.json": JSON.stringify({
        extends: "../../tsconfig.base",
        compilerOptions: { jsx: "react-jsx" },
      }),
      "apps/web/src/local.ts": "export const local = 1;\n",
    });

    assert.equal(
      resolveTsconfigAlias("@mono/logger", { projectRoot: webApp }),
      path.join(monoRoot, "packages/shared/src/logger.ts")
    );
    // Fallback @/* still works in child app even when parent defined custom @mono/*
    assert.equal(
      resolveTsconfigAlias("@/local", { projectRoot: webApp }),
      path.join(webApp, "src/local.ts")
    );

    // B. TS 5.0+ extends array + node_modules preset + TS 5.5+ ${configDir}
    const arrApp = path.join(tmpApp, "arr-app");
    writeFiles(arrApp, {
      "node_modules/@acme/tsconfig/package.json": JSON.stringify({
        name: "@acme/tsconfig",
        tsconfig: "./preset.json",
      }),
      "node_modules/@acme/tsconfig/preset.json": JSON.stringify({
        compilerOptions: {
          paths: {
            "@preset/*": ["${configDir}/../../../preset-lib/*"],
          },
        },
      }),
      "preset-lib/tool.ts": "export const tool = 1;\n",
      "tsconfig.a.json": JSON.stringify({
        extends: "@acme/tsconfig",
      }),
      "tsconfig.b.json": JSON.stringify({
        compilerOptions: {
          paths: {
            "@custom/*": ["${configDir}/src/custom/*"],
          },
        },
      }),
      "tsconfig.json": JSON.stringify({
        extends: ["./tsconfig.a.json", "./tsconfig.b.json"],
      }),
      "src/custom/feat.ts": "export const feat = 2;\n",
    });

    // Later entry in extends array wins for compilerOptions.paths
    assert.equal(
      resolveTsconfigAlias("@custom/feat", { projectRoot: arrApp }),
      path.join(arrApp, "src/custom/feat.ts")
    );
    const infoArr = loadTsconfigAliasInfo(arrApp);
    assert.ok(infoArr.configFiles.length >= 4);

    // C. jsconfig.json project (no tsconfig.json)
    const jsApp = path.join(tmpApp, "js-app");
    writeFiles(jsApp, {
      "jsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: "./src",
          paths: {
            "@js/*": ["modules/*"],
          },
        },
      }),
      "src/modules/helper.js": "export const h = 1;\n",
      "src/plain.jsx": "export default () => null;\n",
    });
    assert.equal(
      resolveTsconfigAlias("@js/helper", { projectRoot: jsApp }),
      path.join(jsApp, "src/modules/helper.js")
    );
    assert.equal(
      resolveTsconfigAlias("~/plain", { projectRoot: jsApp }),
      path.join(jsApp, "src/plain.jsx")
    );

    // D. Zero-config project (neither tsconfig.json nor jsconfig.json)
    const zeroApp = path.join(tmpApp, "zero-app");
    writeFiles(zeroApp, {
      "src/hello.tsx": "export const H = 1;\n",
    });
    assert.equal(
      resolveTsconfigAlias("@/hello", { projectRoot: zeroApp }),
      path.join(zeroApp, "src/hello.tsx")
    );
    assert.equal(
      resolveTsconfigAlias("~/hello", { projectRoot: zeroApp }),
      path.join(zeroApp, "src/hello.tsx")
    );

    // E. baseUrl bare-specifier fallback (e.g. "utils/date" with baseUrl: "./src")
    const baseApp = path.join(tmpApp, "base-app");
    writeFiles(baseApp, {
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: "./src",
          jsx: "react-jsx",
          target: "ES2022",
        },
      }),
      "src/utils/date.ts": "export const now = () => 0;\n",
    });
    assert.equal(
      resolveTsconfigAlias("utils/date", { projectRoot: baseApp }),
      path.join(baseApp, "src/utils/date.ts")
    );
    assert.equal(matchesExplicitUserAlias("utils/date", baseApp), false);
    assert.equal(matchesExplicitUserAlias("@/utils/date", baseApp), true);
    assert.equal(resolveTsconfigAlias("react", { projectRoot: baseApp }), null);
    assert.equal(
      resolveTsconfigAlias("node:fs", { projectRoot: baseApp }),
      null
    );

    const rawSanitized = getSanitizedEsbuildTsconfigRaw(baseApp);
    const sanitized =
      typeof rawSanitized === "string"
        ? JSON.parse(rawSanitized)
        : rawSanitized;
    assert.equal(sanitized.compilerOptions.paths, undefined);
    assert.equal(sanitized.compilerOptions.baseUrl, undefined);
    assert.equal(sanitized.compilerOptions.target, "ES2022");

    // F. Automatic mtimeMs cache invalidation when tsconfig.json is edited
    const hotApp = path.join(tmpApp, "hot-app");
    writeFiles(hotApp, {
      "tsconfig.json": JSON.stringify({
        compilerOptions: { paths: { "@target/*": ["./src/v1/*"] } },
      }),
      "src/v1/mod.ts": "export const V = 1;\n",
      "src/v2/mod.ts": "export const V = 2;\n",
    });
    assert.equal(
      resolveTsconfigAlias("@target/mod", { projectRoot: hotApp }),
      path.join(hotApp, "src/v1/mod.ts")
    );
    const futureTime = new Date(Date.now() + 5000);
    fs.writeFileSync(
      path.join(hotApp, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { paths: { "@target/*": ["./src/v2/*"] } },
      }),
      "utf8"
    );
    fs.utimesSync(path.join(hotApp, "tsconfig.json"), futureTime, futureTime);
    assert.equal(
      resolveTsconfigAlias("@target/mod", { projectRoot: hotApp }),
      path.join(hotApp, "src/v2/mod.ts")
    );
  } finally {
    clearTsconfigAliasCache();
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}
console.log("   ✅ Section 2 passed!");

console.log(
  "3️⃣ Verifying _folder escape guard parity across custom aliases & baseUrl + dinou.config.ts aliased imports..."
);
{
  const { fixturesBase, tmpApp } = createFixtureApp("alias-guard-");
  try {
    writeFiles(tmpApp, {
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: "./src",
          paths: {
            "@docs/*": ["docs/*"],
            "@secret/*": ["docs/_private/*"],
            "@cfg-helpers/*": ["config-helpers/*"],
          },
        },
      }),
      "src/page.tsx": "export default function Page() { return null; }\n",
      "src/docs/_private/Hidden.tsx": "export const H = 1;\n",
      "src/docs/public/Visible.tsx": "export const V = 1;\n",
      "src/_private-root/Leak.ts": "export const L = 1;\n",
      "src/config-helpers/plugins.ts":
        "export const customExts = ['glb', 'hdr'];\n",
      "src/plain.ts": "export const reactCompilerFlag = false;\n",
      "dinou.config.ts": [
        'import { customExts } from "@cfg-helpers/plugins";',
        'import { reactCompilerFlag } from "./src/plain";',
        "export default {",
        "  assetExtensions: customExts,",
        "  reactCompiler: reactCompilerFlag,",
        "};",
      ].join("\n"),
    });

    const importerFile = path.join(tmpApp, "src/page.tsx");

    const errWildcardUnderscore = checkForbiddenUnderscoreImport(
      "@docs/_private/Hidden",
      importerFile,
      tmpApp,
      { importerIsFile: true }
    );
    assert.equal(typeof errWildcardUnderscore, "string");
    assert.match(errWildcardUnderscore, /directories prefixed with "_"/);

    const errTargetUnderscore = checkForbiddenUnderscoreImport(
      "@secret/Hidden",
      importerFile,
      tmpApp,
      { importerIsFile: true }
    );
    assert.equal(typeof errTargetUnderscore, "string");
    assert.match(errTargetUnderscore, /directories prefixed with "_"/);

    const errBaseUrlUnderscore = checkForbiddenUnderscoreImport(
      "_private-root/Leak",
      importerFile,
      tmpApp,
      { importerIsFile: true }
    );
    assert.equal(typeof errBaseUrlUnderscore, "string");
    assert.match(errBaseUrlUnderscore, /directories prefixed with "_"/);

    const okPublic = checkForbiddenUnderscoreImport(
      "@docs/public/Visible",
      importerFile,
      tmpApp,
      { importerIsFile: true }
    );
    assert.equal(okPublic, null);

    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const cfg = await getDinouConfig(tmpApp);
      assert.deepEqual(cfg.assetExtensions, ["glb", "hdr"]);
      assert.equal(cfg.reactCompiler, false);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  } finally {
    clearTsconfigAliasCache(tmpApp);
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}
console.log("   ✅ Section 3 passed!");

console.log(
  "4️⃣ Verifying Dev Server SWC mirror + baseUrl parity & live tsconfig.paths.json refreshAliases()..."
);
{
  const { fixturesBase, tmpApp } = createFixtureApp("alias-dev-");
  try {
    writeFiles(tmpApp, {
      "tsconfig.paths.json":
        "// Base paths config with comments & trailing commas\n" +
        "{\n" +
        '  "compilerOptions": {\n' +
        '    "baseUrl": "./src",\n' +
        '    "paths": {\n' +
        '      "@styles/*": ["styles/*"],\n' +
        '      "@assets/*": ["assets/*"],\n' +
        '      "@hot/*": ["hot-v1/*"],\n' +
        "    },\n" +
        "  },\n" +
        "}\n",
      "tsconfig.json": JSON.stringify(
        {
          extends: "./tsconfig.paths.json",
          compilerOptions: {
            target: "ES2022",
            jsx: "react-jsx",
            module: "ESNext",
            moduleResolution: "bundler",
          },
        },
        null,
        2
      ),
      "src/assets/dot.svg": '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>\n',
      "src/styles/tokens.css": ":root { --dev-alias-c: rgb(12, 34, 56); }\n",
      "src/styles/theme.css":
        '@import "@styles/tokens.css";\n.dev-shell { color: var(--dev-alias-c); background-image: url("@assets/dot.svg"); }\n',
      "src/lib/bare-util.ts":
        'export const BARE_BASEURL_TAG = "BASEURL_SWC_MIRROR_OK";\n',
      "src/hot-v1/Banner.tsx":
        'export const HOT_VAL = "DEV_ALIAS_HOT_V1";\n',
      "src/hot-v2/Banner.tsx":
        'export const HOT_VAL = "DEV_ALIAS_HOT_V2";\n',
      "src/ClientBox.tsx": [
        '"use client";',
        'import { BARE_BASEURL_TAG } from "lib/bare-util";',
        'import { HOT_VAL } from "@hot/Banner";',
        "export function ClientBox() {",
        "  return <div>{BARE_BASEURL_TAG}:{HOT_VAL}</div>;",
        "}",
      ].join("\n"),
      "src/layout.tsx": [
        'import "@styles/theme.css";',
        "export default function Layout({ children }: { children: any }) {",
        "  return <html><body>{children}</body></html>;",
        "}",
      ].join("\n"),
      "src/page.tsx": [
        'import { ClientBox } from "./ClientBox";',
        "export default function Page() {",
        "  return <main><ClientBox /></main>;",
        "}",
      ].join("\n"),
    });

    const devChildScript = path.join(tmpApp, "run-dev-alias-probe.mjs");
    const esbuildDevUrl = pathToFileURL(
      path.join(dinouRoot, "esbuild/dev.js")
    ).href;
    fs.writeFileSync(
      devChildScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startEsbuildDev } from ${JSON.stringify(esbuildDevUrl)};

const handle = await startEsbuildDev({ hmrPort: 0 });
try {
  const mem = globalThis.__DINOU_MEM_FILES__;
  assert.ok(mem, "__DINOU_MEM_FILES__ must be populated");
  const cssTxt = Array.from(mem.entries())
    .filter(([k]) => k.endsWith(".css"))
    .map(([, buf]) => buf.toString("utf8"))
    .join("\\n");
  assert.ok(cssTxt.includes("--dev-alias-c"), "Expected @import @styles/tokens.css resolved");
  assert.ok(!cssTxt.includes("@assets/dot.svg"), "Expected url(@assets/dot.svg) rewritten");

  const jsV1 = Array.from(mem.entries())
    .filter(([k]) => k.endsWith(".js") && !/^\\/?chunk-[A-Z0-9]+\\.js$/.test(k))
    .map(([, buf]) => buf.toString("utf8"))
    .join("\\n");
  assert.ok(jsV1.includes("BASEURL_SWC_MIRROR_OK"), "Expected baseUrl bare import resolved via SWC mirror");
  assert.ok(jsV1.includes("DEV_ALIAS_HOT_V1"), "Expected initial V1 alias target");

  // Swap @hot/* in tsconfig.paths.json from hot-v1/* to hot-v2/* without touching src/
  const pathsFile = path.resolve("tsconfig.paths.json");
  const updated = fs.readFileSync(pathsFile, "utf8").replace("hot-v1/*", "hot-v2/*");
  const future = new Date(Date.now() + 5000);
  fs.writeFileSync(pathsFile, updated, "utf8");
  fs.utimesSync(pathsFile, future, future);

  await (handle.refreshAliases ? handle.refreshAliases() : handle.restart());

  const jsV2 = Array.from(mem.entries())
    .filter(([k]) => k.endsWith(".js") && !/^\\/?chunk-[A-Z0-9]+\\.js$/.test(k))
    .map(([, buf]) => buf.toString("utf8"))
    .join("\\n");
  assert.ok(jsV2.includes("DEV_ALIAS_HOT_V2"), "Expected V2 alias target after refreshAliases()");
  assert.ok(!jsV2.includes("DEV_ALIAS_HOT_V1"), "Expected V1 alias target replaced in active chunks");
} finally {
  if (handle?.close) await handle.close();
}
process.exit(0);
`,
      "utf8"
    );

    const cleanDevEnv = { ...process.env, DINOU_WRITE_TO_DISK: "false" };
    delete cleanDevEnv.PORT;
    delete cleanDevEnv.HMR_PORT;
    delete cleanDevEnv.NODE_ENV;

    const devRes = spawnSync(process.execPath, [devChildScript], {
      cwd: tmpApp,
      encoding: "utf8",
      env: cleanDevEnv,
    });
    assert.equal(
      devRes.status,
      0,
      `Dev alias probe failed:\nSTDOUT:\n${devRes.stdout}\nSTDERR:\n${devRes.stderr}`
    );
  } finally {
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}
console.log("   ✅ Section 4 passed!");

console.log(
  "5️⃣ Verifying 3-bundler (esbuild, rollup, webpack) + 4-runtime (Node AOT, Cloudflare, Bun, Deno) + export-static alias matrix..."
);
{
  const { fixturesBase, tmpApp } = createFixtureApp("alias-matrix-");
  try {
    writeFiles(tmpApp, {
      "tsconfig.paths.json":
        "{\n" +
        '  "compilerOptions": {\n' +
        '    "baseUrl": "./src",\n' +
        '    "paths": {\n' +
        '      "@ui/*": ["ui/*"],\n' +
        '      "@ui/icons/*": ["icons/*"],\n' +
        '      "@components/*": ["components/*"],\n' +
        '      "@server/*": ["server-functions/*"],\n' +
        '      "@styles/*": ["styles/*"],\n' +
        '      "@assets/*": ["assets/*"],\n' +
        '      "@shared/*": ["../external-shared/*"],\n' +
        "    },\n" +
        "  },\n" +
        "}\n",
      "tsconfig.json": JSON.stringify(
        {
          extends: "./tsconfig.paths.json",
          compilerOptions: {
            target: "ES2022",
            jsx: "react-jsx",
            module: "ESNext",
            moduleResolution: "bundler",
          },
        },
        null,
        2
      ),
      "external-shared/info.ts":
        'export const SHARED_TAG = "EXTERNAL_SHARED_OK";\n',
      "src/assets/logo-mark.svg":
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>\n',
      "src/assets/bg-dot.svg":
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>\n',
      "src/styles/tokens.css": ":root { --alias-brand: #123456; }\n",
      "src/styles/theme.css": [
        '@import "@styles/tokens.css";',
        ".alias-theme-shell {",
        "  color: var(--alias-brand);",
        '  background-image: url("@assets/bg-dot.svg");',
        "}",
      ].join("\n"),
      "src/styles/box.module.css": [
        '@import "@styles/tokens.css";',
        ".wrapper { border: 2px solid var(--alias-brand); padding: 8px; }",
      ].join("\n"),
      "src/lib/utils.ts":
        "export function formatLabel(x: string): string { return `FMT:${x}`; }\n",
      "src/ui/Panel.tsx":
        'export function Panel({ children }: { children: any }) { return <section data-panel="ui-panel">{children}</section>; }\n',
      "src/ui/icons/Badge.tsx":
        'export function Badge() { return <span data-badge="WRONG_UI_FALLBACK">WRONG</span>; }\n',
      "src/icons/Badge.tsx":
        'export function Badge() { return <span data-badge="SPECIFIC_ICONS_OK">ICON_OK</span>; }\n',
      "src/server-functions/greet.ts": [
        '"use server";',
        'import { formatLabel } from "lib/utils";',
        "export async function greetServer(name: string) {",
        "  return formatLabel(`HELLO_${name}`);",
        "}",
      ].join("\n"),
      "src/components/AliasClientBox.tsx": [
        '"use client";',
        'import styles from "@styles/box.module.css";',
        'import logoUrl from "@assets/logo-mark.svg";',
        'import { Badge } from "@ui/icons/Badge";',
        'import { greetServer } from "@server/greet";',
        'import { SHARED_TAG } from "@shared/info";',
        "export function AliasClientBox() {",
        "  return (",
        '    <div className={styles.wrapper} data-logo={logoUrl} data-shared={SHARED_TAG} data-action={typeof greetServer}>',
        "      <Badge />",
        "    </div>",
        "  );",
        "}",
      ].join("\n"),
      "src/layout.tsx": [
        'import "@styles/theme.css";',
        "export default function RootLayout({ children }: { children: any }) {",
        '  return <html lang="en"><head><title>Alias Matrix</title></head><body className="alias-theme-shell">{children}</body></html>;',
        "}",
      ].join("\n"),
      "src/page.tsx": [
        'import { Panel } from "@ui/Panel";',
        'import { AliasClientBox } from "@components/AliasClientBox";',
        'import { formatLabel } from "lib/utils";',
        'import { SHARED_TAG } from "@shared/info";',
        "export default function HomePage() {",
        "  return (",
        "    <Panel>",
        "      <h1>{formatLabel(SHARED_TAG)}</h1>",
        "      <AliasClientBox />",
        "    </Panel>",
        "  );",
        "}",
      ].join("\n"),
    });

    const runCli = (subcmd) => {
      execFileSync(process.execPath, [cliPath, subcmd], {
        cwd: tmpApp,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "pipe",
      });
    };

    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      runCli(`build:node:${bundler}`);

      const stylesPath = path.join(tmpApp, ".dinou/dist3/styles.css");
      assert.ok(fs.existsSync(stylesPath), `Missing styles.css for ${bundler}`);
      const cssOut = fs.readFileSync(stylesPath, "utf8");
      assert.ok(
        cssOut.includes("--alias-brand"),
        `Expected @import @styles/tokens.css inlined for ${bundler}`
      );
      assert.ok(
        cssOut.includes("/assets/bg-dot-") || cssOut.includes("assets/bg-dot-"),
        `Expected url(@assets/bg-dot.svg) rewritten to hashed asset for ${bundler}`
      );
      assert.ok(
        /border:\s*2px solid var\(--alias-brand\)/.test(cssOut),
        `Expected @styles/box.module.css rule emitted for ${bundler}`
      );

      const ssgHtml = fs.readFileSync(
        path.join(tmpApp, ".dinou/dist2/index.html"),
        "utf8"
      );
      assert.ok(
        ssgHtml.includes("FMT:EXTERNAL_SHARED_OK"),
        `Expected RSC baseUrl + external @shared/* in SSG HTML (${bundler})`
      );
      assert.ok(
        ssgHtml.includes("SPECIFIC_ICONS_OK") &&
          !ssgHtml.includes("WRONG_UI_FALLBACK"),
        `Expected @ui/icons/Badge specificity over @ui/* in SSG HTML (${bundler})`
      );
      assert.ok(
        ssgHtml.includes("/assets/logo-mark-"),
        `Expected hashed @assets/logo-mark.svg in SSG HTML (${bundler})`
      );
    }

    // Probe .dinou/node/server.mjs in child process
    const prodProbe = path.join(tmpApp, "probe-alias-server.mjs");
    fs.writeFileSync(
      prodProbe,
      `import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const serverMod = await import(pathToFileURL(path.resolve(".dinou/node/server.mjs")).href);
const res = await serverMod.fetch(new Request("http://localhost/", { headers: { Accept: "text/html" } }));
assert.equal(res.status, 200);
const html = await res.text();
assert.ok(html.includes("FMT:EXTERNAL_SHARED_OK"));
assert.ok(html.includes("SPECIFIC_ICONS_OK"));
assert.ok(html.includes("/assets/logo-mark-"));
process.exit(0);
`,
      "utf8"
    );
    const prodProbeRes = spawnSync(process.execPath, [prodProbe], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    });
    assert.equal(
      prodProbeRes.status,
      0,
      `Node server.mjs alias probe failed:\n${prodProbeRes.stdout}\n${prodProbeRes.stderr}`
    );

    // Static export verification
    runCli("export-static:esbuild");
    const exportedHtml = fs.readFileSync(
      path.join(tmpApp, "out/index.html"),
      "utf8"
    );
    assert.ok(exportedHtml.includes("FMT:EXTERNAL_SHARED_OK"));
    assert.ok(exportedHtml.includes("SPECIFIC_ICONS_OK"));
    assert.ok(fs.existsSync(path.join(tmpApp, "out/styles.css")));

    // Cloudflare, Bun & Deno build verification via Node builder scripts directly
    const cleanAdapterBuildEnv = {
      ...process.env,
      NODE_ENV: "production",
      DINOU_BUILD_TOOL: "esbuild",
    };
    delete cleanAdapterBuildEnv.DINOU_DEV;
    delete cleanAdapterBuildEnv.DINOU_WRITE_TO_DISK;

    for (const [relScript, expectedOut] of [
      ["cloudflare/build.js", ".dinou/cloudflare/worker.js"],
      ["bun/build.js", ".dinou/bun/server.js"],
      ["deno/build.js", ".dinou/deno/main.js"],
    ]) {
      const res = spawnSync(
        process.execPath,
        [path.join(dinouRoot, relScript)],
        {
          cwd: tmpApp,
          encoding: "utf8",
          env: cleanAdapterBuildEnv,
        }
      );
      assert.equal(
        res.status,
        0,
        `${relScript} failed:\n${res.stdout}\n${res.stderr}`
      );
      assert.ok(
        fs.existsSync(path.join(tmpApp, expectedOut)),
        `Expected ${expectedOut} after ${relScript}`
      );
    }
  } finally {
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}
console.log("   ✅ Section 5 passed!");

console.log(
  "6️⃣ Verifying Dual-Engine jsconfig.json + .mjs + CSS Modules dynamic Pass A + Pass B parity..."
);
{
  const { fixturesBase, tmpApp } = createFixtureApp("alias-jsconfig-");
  try {
    writeFiles(tmpApp, {
      "jsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@lib/*": ["./src/lib/*"],
              "@styles/*": ["./src/styles/*"],
            },
          },
        },
        null,
        2
      ),
      "src/lib/calc.mjs": "export const double = (n) => n * 2;\n",
      "src/styles/card.module.css": ".card { display: flex; }\n",
      "src/layout.jsx":
        "export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n",
      "src/[id]/page.jsx": [
        'import { double } from "@lib/calc";',
        'import s from "@styles/card.module.css";',
        "export default function DynamicPage({ params }) {",
        '  return <main className={s.card} data-out={double(Number(params.id))}>VAL:{double(Number(params.id))}</main>;',
        "}",
      ].join("\n"),
    });

    const jsconfigProbe = path.join(tmpApp, "probe-jsconfig-dual.mjs");
    const esbuildBuildUrl = pathToFileURL(
      path.join(dinouRoot, "esbuild/build.js")
    ).href;
    const bundleDualUrl = pathToFileURL(
      path.join(dinouRoot, "node/bundle-dual-engine.js")
    ).href;
    fs.writeFileSync(
      jsconfigProbe,
      `import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.NODE_ENV = "production";
await import(${JSON.stringify(esbuildBuildUrl)});
const { bundleDualEngine } = await import(${JSON.stringify(bundleDualUrl)});
const { rscEnginePath, ssrEnginePath } = await bundleDualEngine({
  isDev: false,
  projectRoot: process.cwd(),
  outDir: ".dinou/node-jscfg",
});
const rscMod = await import(pathToFileURL(rscEnginePath).href);
const ssrMod = await import(pathToFileURL(ssrEnginePath).href);
const res = await rscMod.handleRequest(
  new Request("http://localhost/21", { headers: { Accept: "text/html" } }),
  { renderHtmlStream: ssrMod.renderHtml }
);
assert.equal(res.status, 200);
const html = await res.text();
assert.ok(html.includes("VAL:42") || html.includes("VAL:<!-- -->42"));
assert.match(html, /<main class="[^"]+" data-out="42">/);
process.exit(0);
`,
      "utf8"
    );

    const probeRes = spawnSync(process.execPath, [jsconfigProbe], {
      cwd: tmpApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    });
    assert.equal(
      probeRes.status,
      0,
      `jsconfig Dual-Engine probe failed:\n${probeRes.stdout}\n${probeRes.stderr}`
    );
  } finally {
    cleanupFixtureApp(fixturesBase, tmpApp);
  }
}
console.log("   ✅ Section 6 passed!");

// Verify host workspace manifests were never mutated
for (const [rel, before] of manifestSnapshotBefore.entries()) {
  const abs = path.join(projectRoot, rel);
  const after = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  assert.equal(
    after,
    before,
    `Host workspace manifest ${rel} was unexpectedly mutated during verify-aliases-ci.mjs`
  );
}

console.log(
  "\n🎉 All 6 Dinou v9.4.0 Unified tsconfig.json & jsconfig.json Path Aliases verification suites PASSED!"
);
