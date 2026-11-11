// scripts/verify-escaped-ci.mjs
// Verifies Dinou's `_`-prefixed directory escaping (`A + B Radical` from `escape.md`):
// 1. Piece A: `generateRouteTypes` route exclusion from `.dinou/types/routes.d.ts`,
//    fallback `.dinou/routes/_t-escaped/**/dinou.{js,d.ts}` shims (`ROUTE: string`,
//    local `@slot` prop inference, dynamic `[slug]` param inference), non-route `_`
//    directory exclusion (`_non-route-scratch`), and live folder escape/un-escape pruning.
// 2. Piece A: Strict TypeScript (`tsc --noEmit` programmatic check via `tsconfig.json` `rootDirs`)
//    covering `src/_t-escaped/**`, `src/_non-route-scratch/**`, and `src/t-escaped-probe/**`
//    (including dead-link `@ts-expect-error` assertions and `_allowed-file-helper.ts`).
// 3. Piece B2: Didactic compile-time bundler guard across REAL `esbuild`, `rollup`, and `webpack`
//    compilers in an isolated temp workspace (testing relative, parent-relative, `@/`, `~/`,
//    `src/`, and `.dinou/swc/src/...` importers, while allowing `_`-prefixed files).
// 4. Piece B1: Core scanner exclusion (`route-generator.js`, `vfs.js`, `get-esbuild-entries.js`,
//    `get-webpack-entries.js`) confirming `_t-escaped` (including `broken-draft.tsx`,
//    `ClientWidget.tsx`, `secret-actions.ts`, and `parked.css`) is 100% ignored.
// 5. Piece B1: Active `.dinou/` manifest, bundle & SWC disk-cache artifact inspection
//    (plus optional `--full-build` mode for standalone full Node builds across all 3 bundlers).

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import * as esbuild from "esbuild";
import { rollup } from "rollup";
import webpack from "webpack";

const root = process.cwd();
const runFullBuild = process.argv.includes("--full-build");
const readonlyRoot = process.argv.includes("--readonly-root");

function resolveDinouInternal(relFromDinou) {
  const candidates = [
    path.resolve(root, "dinou", relFromDinou),
    path.resolve(root, "node_modules/dinou/dinou", relFromDinou),
    path.resolve(root, "node_modules/dinou", relFromDinou),
  ];
  const found = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
  return pathToFileURL(found).href;
}

function collectFilesRecursive(dir, filterFn = null) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(full, filterFn));
    } else if (!filterFn || filterFn(full)) {
      results.push(full);
    }
  }
  return results;
}

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  });
}

function runWebpackCompile(config) {
  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (err) return reject(err);
      resolve(stats);
    });
  });
}

async function main() {
  const { generateRouteTypes } = await import(
    resolveDinouInternal("core/generate-route-types.js")
  );
  const { generateRouteModulesCode } = await import(
    resolveDinouInternal("core/route-generator.js")
  );
  await import(resolveDinouInternal("webpack/helpers/patch-webpack-internals.js"));
  const { default: ReactServerWebpackPlugin } = await import(
    "react-server-dom-webpack/plugin"
  );
  const {
    createWebpackUnderscoreDirExclude,
    filterEscapedClientManifest,
    esbuildContextualDinouPlugin,
    rollupContextualDinouPlugin,
    webpackContextualDinouPlugin,
  } = await import(resolveDinouInternal("core/resolve-contextual-dinou.js"));
  const { buildVfs, getVfs } = await import(
    resolveDinouInternal("core/vfs.js")
  );
  const { default: getEsbuildEntries } = await import(
    resolveDinouInternal("esbuild/helpers-esbuild/get-esbuild-entries.js")
  );
  const { getCSSEntries: getWebpackEntries } = await import(
    resolveDinouInternal("webpack/helpers/get-webpack-entries.js")
  );

  // =========================================================================
  // 1. Piece A: Typegen, Route Exclusion, Fallback Shims & Un-Escape Pruning
  // =========================================================================
  if (!readonlyRoot || !fs.existsSync(path.join(root, ".dinou/types/routes.d.ts"))) {
    generateRouteTypes(root);
  }

  const routesDtsPath = path.join(root, ".dinou/types/routes.d.ts");
  assert(fs.existsSync(routesDtsPath), "Expected .dinou/types/routes.d.ts to exist");
  const routesDts = fs.readFileSync(routesDtsPath, "utf8");
  assert(
    !routesDts.includes('"/t-escaped"') && !routesDts.includes("t-escaped/"),
    "Expected `t-escaped` to be excluded from .dinou/types/routes.d.ts"
  );
  assert(
    !routesDts.includes("_t-escaped"),
    "Expected `_t-escaped` to be excluded from .dinou/types/routes.d.ts"
  );
  assert(
    !routesDts.includes("_non-route-scratch"),
    "Expected `_non-route-scratch` to be excluded from .dinou/types/routes.d.ts"
  );
  assert(
    routesDts.includes('"/t-escaped-probe":'),
    "Expected active `/t-escaped-probe` in .dinou/types/routes.d.ts"
  );

  const expectedEscapedShimDirs = [
    "_t-escaped",
    "_t-escaped/@banner",
    "_t-escaped/[slug]",
    "_t-escaped/[slug]/@sidebar",
    "_t-escaped/[slug]/contact",
  ];
  for (const rel of expectedEscapedShimDirs) {
    assert(
      fs.existsSync(path.join(root, ".dinou/routes", rel, "dinou.d.ts")),
      `Expected fallback dinou.d.ts for escaped route dir: ${rel}`
    );
    assert(
      fs.existsSync(path.join(root, ".dinou/routes", rel, "dinou.js")),
      `Expected fallback dinou.js for escaped route dir: ${rel}`
    );
  }

  const escapedRootDts = fs.readFileSync(
    path.join(root, ".dinou/routes/_t-escaped/dinou.d.ts"),
    "utf8"
  );
  assert(
    escapedRootDts.includes("export declare const ROUTE: string;"),
    "Expected widened `ROUTE: string` in .dinou/routes/_t-escaped/dinou.d.ts"
  );
  assert(
    escapedRootDts.includes("banner?: ReactNode"),
    "Expected local @banner slot prop inference on escaped root LayoutProps"
  );

  const escapedSlugDts = fs.readFileSync(
    path.join(root, ".dinou/routes/_t-escaped/[slug]/dinou.d.ts"),
    "utf8"
  );
  assert(
    escapedSlugDts.includes("export declare const ROUTE: string;"),
    "Expected widened `ROUTE: string` in .dinou/routes/_t-escaped/[slug]/dinou.d.ts"
  );
  assert(
    escapedSlugDts.includes("sidebar?: ReactNode"),
    "Expected local @sidebar slot prop inference on escaped [slug] LayoutProps"
  );

  // Non-route escaped folder MUST NOT receive shims
  assert(
    !fs.existsSync(path.join(root, ".dinou/routes/_non-route-scratch/dinou.d.ts")),
    "Expected NO dinou.d.ts for non-route escaped folder src/_non-route-scratch"
  );
  assert(
    !fs.existsSync(path.join(root, ".dinou/routes/_non-route-scratch/dinou.js")),
    "Expected NO dinou.js for non-route escaped folder src/_non-route-scratch"
  );

  // Verify live folder escape/un-escape pruning in isolated temp workspace
  const tmpPruneWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-escape-prune-"));
  try {
    const activeFeature = path.join(tmpPruneWorkspace, "src/feature");
    const escapedFeature = path.join(tmpPruneWorkspace, "src/_feature");
    fs.mkdirSync(activeFeature, { recursive: true });
    fs.writeFileSync(
      path.join(tmpPruneWorkspace, "src/page.tsx"),
      "export default function Home() { return null; }\n"
    );
    fs.writeFileSync(
      path.join(activeFeature, "page.tsx"),
      "export default function Feature() { return null; }\n"
    );

    generateRouteTypes(tmpPruneWorkspace);
    assert(
      fs.existsSync(path.join(tmpPruneWorkspace, ".dinou/routes/feature/dinou.d.ts")),
      "Expected active .dinou/routes/feature/dinou.d.ts"
    );
    assert(
      fs
        .readFileSync(path.join(tmpPruneWorkspace, ".dinou/routes/feature/dinou.d.ts"), "utf8")
        .includes('export declare const ROUTE = "/feature";'),
      "Expected narrow ROUTE literal on active route"
    );

    // Escape: feature -> _feature
    fs.renameSync(activeFeature, escapedFeature);
    generateRouteTypes(tmpPruneWorkspace);
    assert(
      !fs.existsSync(path.join(tmpPruneWorkspace, ".dinou/routes/feature/dinou.d.ts")),
      "Expected stale .dinou/routes/feature/dinou.d.ts to be pruned after escaping"
    );
    assert(
      fs.existsSync(path.join(tmpPruneWorkspace, ".dinou/routes/_feature/dinou.d.ts")),
      "Expected fallback .dinou/routes/_feature/dinou.d.ts after escaping"
    );
    assert(
      fs
        .readFileSync(path.join(tmpPruneWorkspace, ".dinou/routes/_feature/dinou.d.ts"), "utf8")
        .includes("export declare const ROUTE: string;"),
      "Expected widened ROUTE: string after escaping"
    );

    // Un-escape: _feature -> feature
    fs.renameSync(escapedFeature, activeFeature);
    generateRouteTypes(tmpPruneWorkspace);
    assert(
      !fs.existsSync(path.join(tmpPruneWorkspace, ".dinou/routes/_feature/dinou.d.ts")),
      "Expected .dinou/routes/_feature/dinou.d.ts to be pruned after un-escaping"
    );
    assert(
      fs
        .readFileSync(path.join(tmpPruneWorkspace, ".dinou/routes/feature/dinou.d.ts"), "utf8")
        .includes('export declare const ROUTE = "/feature";'),
      "Expected narrow ROUTE literal restored after un-escaping"
    );
  } finally {
    fs.rmSync(tmpPruneWorkspace, { recursive: true, force: true });
  }
  console.log("✅ [1/5] Piece A: Typegen exclusion, fallback shims & un-escape pruning PASSED");

  // =========================================================================
  // 2. Piece A: Strict TypeScript (`tsc --noEmit`) on Escaped & Probe Fixtures
  // =========================================================================
  const tsconfigPath = path.join(root, "tsconfig.json");
  const readRes = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  assert(!readRes.error, `Failed to read tsconfig.json: ${readRes.error?.messageText}`);
  const parsed = ts.parseJsonConfigFileContent(readRes.config, ts.sys, root);
  assert(
    Array.isArray(parsed.options.rootDirs) && parsed.options.rootDirs.length >= 2,
    'Expected compilerOptions.rootDirs: ["src", ".dinou/routes"] in tsconfig.json'
  );

  const isTsFile = (f) => /\.(ts|tsx)$/.test(f);
  const tsTargetFiles = [
    ...collectFilesRecursive(path.join(root, "src/_t-escaped"), isTsFile),
    ...collectFilesRecursive(path.join(root, "src/_non-route-scratch"), isTsFile),
    ...collectFilesRecursive(path.join(root, "src/t-escaped-probe"), isTsFile),
  ];
  assert(tsTargetFiles.length >= 11, `Expected >= 11 escaped/probe TS files, got ${tsTargetFiles.length}`);

  const program = ts.createProgram({
    rootNames: [
      ...tsTargetFiles,
      path.join(root, "dinou-env.d.ts"),
      routesDtsPath,
    ],
    options: parsed.options,
  });

  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(
      `Strict TypeScript check failed on escaped/probe fixtures with ${diagnostics.length} diagnostic(s):\n` +
        formatDiagnostics(diagnostics)
    );
  }
  console.log(
    `✅ [2/5] Piece A: Strict tsc check (${tsTargetFiles.length} files + @ts-expect-error dead-link assertions) PASSED`
  );

  // =========================================================================
  // 3. Piece B2: Didactic Bundler Guard Across Real Esbuild, Rollup & Webpack
  // =========================================================================
  const tmpGuardRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-escape-guard-"));
  try {
    const mkdirWrite = (relPath, content) => {
      const full = path.join(tmpGuardRoot, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
      return full;
    };

    mkdirWrite("src/_temp-hidden/Box.js", "export const Box = 1;\n");
    mkdirWrite("src/_t-escaped/ClientWidget.js", "export default function W() { return 1; }\n");
    mkdirWrite("src/_hooks/useAuth.js", "export const useAuth = () => true;\n");
    mkdirWrite("src/blog/_actions/save.js", "export const save = () => true;\n");
    mkdirWrite("src/_utils/math.js", "export const add = (a, b) => a + b;\n");
    mkdirWrite("src/_allowed-file-helper.js", "export const OK_VAL = 'ok';\n");

    const forbiddenCases = [
      { importerRel: "src/page.js", badSpec: "./_temp-hidden/Box" },
      { importerRel: "src/blog/post/page.js", badSpec: "../../_hooks/useAuth" },
      { importerRel: "src/page.js", badSpec: "@/_t-escaped/ClientWidget" },
      { importerRel: "src/page.js", badSpec: "~/blog/_actions/save" },
      { importerRel: "src/page.js", badSpec: "src/_utils/math" },
    ];

    const assertDidacticMsg = (msg, bundlerName, spec) => {
      assert(
        msg.includes('directories prefixed with "_"') &&
          msg.includes("are ignored by Dinou's router and bundlers"),
        `Expected ${bundlerName} to fail with didactic '_' folder message for "${spec}", got:\n${msg}`
      );
    };

    for (const { importerRel, badSpec } of forbiddenCases) {
      const entryFile = mkdirWrite(importerRel, `import "${badSpec}";\nexport default 1;\n`);

      // 3a. Real Esbuild
      let esbuildMsg = "";
      try {
        await esbuild.build({
          entryPoints: [entryFile],
          bundle: true,
          write: false,
          logLevel: "silent",
          plugins: [esbuildContextualDinouPlugin({ projectRoot: tmpGuardRoot })],
        });
      } catch (err) {
        esbuildMsg = String(err?.message || err);
      }
      assertDidacticMsg(esbuildMsg, "esbuild", badSpec);

      // 3b. Real Rollup
      let rollupMsg = "";
      try {
        const bundle = await rollup({
          input: entryFile,
          onwarn: () => {},
          plugins: [rollupContextualDinouPlugin({ projectRoot: tmpGuardRoot })],
        });
        await bundle.close();
      } catch (err) {
        rollupMsg = String(err?.message || err);
      }
      assertDidacticMsg(rollupMsg, "rollup", badSpec);

      // 3c. Real Webpack
      const wpStats = await runWebpackCompile({
        mode: "production",
        context: tmpGuardRoot,
        entry: entryFile,
        output: {
          path: path.join(tmpGuardRoot, "dist-wp"),
          filename: "out.js",
        },
        plugins: [webpackContextualDinouPlugin({ projectRoot: tmpGuardRoot })],
      });
      assert(wpStats.hasErrors(), `Expected webpack compilation error for "${badSpec}"`);
      const wpErrors = wpStats
        .toJson({ all: false, errors: true })
        .errors.map((e) => e.message)
        .join("\n");
      assertDidacticMsg(wpErrors, "webpack", badSpec);
    }

    // 3d. Verify `.dinou/swc/src/...` dev disk-cache importer mapping in Esbuild
    const swcEntry = mkdirWrite(
      ".dinou/swc/src/page.js",
      'import "./_temp-hidden/Box.js";\nexport default 1;\n'
    );
    let swcMsg = "";
    try {
      await esbuild.build({
        entryPoints: [swcEntry],
        bundle: true,
        write: false,
        logLevel: "silent",
        plugins: [esbuildContextualDinouPlugin({ projectRoot: tmpGuardRoot })],
      });
    } catch (err) {
      swcMsg = String(err?.message || err);
    }
    assertDidacticMsg(swcMsg, "esbuild (.dinou/swc importer)", "./_temp-hidden/Box.js");

    // 3e. Verify `_`-prefixed FILE (`./_allowed-file-helper.js`) succeeds in ALL 3 bundlers!
    const validEntry = mkdirWrite(
      "src/valid-page.js",
      'import { OK_VAL } from "./_allowed-file-helper.js";\nexport default OK_VAL;\n'
    );
    await esbuild.build({
      entryPoints: [validEntry],
      bundle: true,
      write: false,
      logLevel: "silent",
      plugins: [esbuildContextualDinouPlugin({ projectRoot: tmpGuardRoot })],
    });
    const okRollup = await rollup({
      input: validEntry,
      onwarn: () => {},
      plugins: [rollupContextualDinouPlugin({ projectRoot: tmpGuardRoot })],
    });
    await okRollup.close();
    const okWpStats = await runWebpackCompile({
      mode: "production",
      context: tmpGuardRoot,
      entry: validEntry,
      output: {
        path: path.join(tmpGuardRoot, "dist-wp-ok"),
        filename: "ok.js",
      },
      plugins: [webpackContextualDinouPlugin({ projectRoot: tmpGuardRoot })],
    });
    assert(!okWpStats.hasErrors(), "Expected webpack to allow `_`-prefixed file in active folder");
  } finally {
    fs.rmSync(tmpGuardRoot, { recursive: true, force: true });
  }
  console.log(
    "✅ [3/5] Piece B2: Didactic bundler guard across esbuild, rollup & webpack (+ _file.js allowed) PASSED"
  );

  // =========================================================================
  // 4. Piece B1: Core Scanners (`route-generator`, `vfs`, `esbuild`, `webpack`)
  // =========================================================================
  const routeModulesCode = generateRouteModulesCode(root, "../..");
  assert(
    !routeModulesCode.includes("_t-escaped") &&
      !routeModulesCode.includes("_non-route-scratch"),
    "Expected generateRouteModulesCode to exclude `_`-prefixed directories"
  );
  assert(
    routeModulesCode.includes("src/t-escaped-probe/page.tsx") &&
      routeModulesCode.includes("src/t-escaped-probe/_allowed-file-helper.ts"),
    "Expected generateRouteModulesCode to include active `t-escaped-probe` and `_allowed-file-helper.ts`"
  );

  const prevGlobalVfs = globalThis.__DINOU_VFS__;
  const isolatedVfs = {};
  globalThis.__DINOU_VFS__ = isolatedVfs;
  try {
    const srcRoot = path.join(root, "src");
    buildVfs(srcRoot, srcRoot);
    const vfsKeys = Object.keys(getVfs());
    assert(
      !vfsKeys.some((k) => k.includes("_t-escaped") || k.includes("_non-route-scratch")),
      "Expected buildVfs to exclude `_`-prefixed directories"
    );
    assert(
      vfsKeys.includes("src/t-escaped-probe/page.tsx") &&
        vfsKeys.includes("src/t-escaped-probe/_allowed-file-helper.ts"),
      "Expected buildVfs to include `src/t-escaped-probe/page.tsx` and `_allowed-file-helper.ts`"
    );
  } finally {
    globalThis.__DINOU_VFS__ = prevGlobalVfs;
  }

  const [esbClientSet, esbCssSet, esbAssetSet, esbServerFns] = await getEsbuildEntries({
    srcDir: path.join(root, "src"),
  });
  assert(esbClientSet.size > 0, "Expected getEsbuildEntries to discover active client entries");
  const esbuildSerialized = JSON.stringify({
    client: Array.from(esbClientSet),
    css: Array.from(esbCssSet),
    assets: Array.from(esbAssetSet),
    serverFunctions: esbServerFns,
  });
  assert(
    !esbuildSerialized.includes("_t-escaped") &&
      !esbuildSerialized.includes("dangerousParkedAction") &&
      !esbuildSerialized.includes("parked.css") &&
      !esbuildSerialized.includes("ClientWidget"),
    "Expected getEsbuildEntries to exclude `_t-escaped` client, CSS, and server function entries"
  );

  const [wpCssSet, wpClientSet, wpServerSet] = await getWebpackEntries({
    srcDir: path.join(root, "src"),
  });
  assert(wpClientSet.size > 0, "Expected getWebpackEntries to discover active client entries");
  const wpSerialized = JSON.stringify({
    css: Array.from(wpCssSet),
    client: Array.from(wpClientSet),
    server: Array.from(wpServerSet),
  });
  assert(
    !wpSerialized.includes("_t-escaped") &&
      !wpSerialized.includes("dangerousParkedAction") &&
      !wpSerialized.includes("parked.css") &&
      !wpSerialized.includes("ClientWidget"),
    "Expected getWebpackEntries to exclude `_t-escaped` client, CSS, and server function entries"
  );

  // 4b. Verify ReactServerWebpackPlugin clientReferences[].exclude & manifest filter
  //     (Regression test for production Webpack leaking `src/_t-escaped/ClientWidget.tsx`
  //      into `.dinou/dist3/react-client-manifest.json`, including when ancestor dirs above
  //      `src/` contain leading underscores).
  const tmpWpRscParent = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-wp-rsc-"));
  const tmpWpRscRoot = path.join(tmpWpRscParent, "_ancestor_with_underscore");
  try {
    const wpExcludeRe = createWebpackUnderscoreDirExclude(tmpWpRscRoot);
    assert(
      wpExcludeRe instanceof RegExp,
      "Expected createWebpackUnderscoreDirExclude to return a native RegExp"
    );
    assert(
      wpExcludeRe.test(path.join(tmpWpRscRoot, "src/_t-escaped")),
      "Expected exclude RegExp to match top-level escaped directory immediately"
    );
    assert(
      wpExcludeRe.test(path.join(tmpWpRscRoot, "src/_t-escaped/ClientWidget.tsx")),
      "Expected exclude RegExp to match file inside top-level escaped directory"
    );
    assert(
      wpExcludeRe.test(path.join(tmpWpRscRoot, "src/blog/_nested")),
      "Expected exclude RegExp to match nested escaped directory immediately"
    );
    assert(
      wpExcludeRe.test(path.join(tmpWpRscRoot, "src/_draft.tsx/ClientWidget.tsx")),
      "Expected exclude RegExp to match files inside escaped directory even if folder ends in .tsx"
    );
    assert(
      !wpExcludeRe.test(path.join(tmpWpRscRoot, "src/_AllowedRootClient.tsx")),
      "Expected exclude RegExp to allow `_`-prefixed client file in src/ root"
    );
    assert(
      !wpExcludeRe.test(path.join(tmpWpRscRoot, "src/active/_AllowedClient.tsx")),
      "Expected exclude RegExp to allow `_`-prefixed client file in active subfolder"
    );
    assert(
      !wpExcludeRe.test(path.join(tmpWpRscRoot, "src/my_feature/Button.tsx")),
      "Expected exclude RegExp to allow non-leading underscores in active folder names"
    );

    const sampleManifest = {
      [pathToFileURL(path.join(tmpWpRscRoot, "src/_t-escaped/ClientWidget.tsx")).href]: {
        id: "leaked",
      },
      [pathToFileURL(path.join(tmpWpRscRoot, "src/active/_AllowedClient.tsx")).href]: {
        id: "allowed",
      },
    };
    const filteredManifest = filterEscapedClientManifest(sampleManifest, tmpWpRscRoot);
    assert.equal(
      Object.keys(filteredManifest).length,
      1,
      "Expected filterEscapedClientManifest to strip escaped entry and keep active entry"
    );
    assert(
      Object.keys(filteredManifest)[0].includes("_AllowedClient.tsx"),
      "Expected filterEscapedClientManifest to preserve _AllowedClient.tsx"
    );

    const writeRscFixture = (rel, code) => {
      const full = path.join(tmpWpRscRoot, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, code, "utf8");
      return full;
    };
    writeRscFixture(
      "src/entry.js",
      'import "react-server-dom-webpack/client.browser";\nexport default 1;\n'
    );
    writeRscFixture(
      "src/_t-escaped/ClientWidget.js",
      '"use client";\nexport default function EscapedWidget() { return "escaped"; }\n'
    );
    writeRscFixture(
      "src/blog/_nested/HiddenClient.js",
      '"use client";\nexport default function HiddenClient() { return "hidden"; }\n'
    );
    writeRscFixture(
      "src/active/_AllowedClient.js",
      '"use client";\nexport default function AllowedClient() { return "allowed"; }\n'
    );

    const wpOutDir = path.join(tmpWpRscRoot, "dist3");
    const rscWpStats = await runWebpackCompile({
      mode: "production",
      context: tmpWpRscRoot,
      entry: path.join(tmpWpRscRoot, "src/entry.js"),
      output: {
        path: wpOutDir,
        filename: "[name].js",
      },
      resolve: {
        modules: [path.join(root, "node_modules"), "node_modules"],
      },
      plugins: [
        webpackContextualDinouPlugin({ projectRoot: tmpWpRscRoot }),
        new ReactServerWebpackPlugin({
          isServer: false,
          clientReferences: [
            {
              directory: "./src",
              recursive: true,
              include: /\.(js|ts|jsx|tsx)$/,
              exclude: wpExcludeRe,
            },
          ],
        }),
      ],
    });
    assert(
      !rscWpStats.hasErrors(),
      "Expected ReactServerWebpackPlugin compilation to succeed: " +
        rscWpStats
          .toJson({ all: false, errors: true })
          .errors.map((e) => e.message)
          .join("\n")
    );
    const emittedManifestRaw = fs.readFileSync(
      path.join(wpOutDir, "react-client-manifest.json"),
      "utf8"
    );
    assert(
      !emittedManifestRaw.includes("_t-escaped") &&
        !emittedManifestRaw.includes("_nested"),
      `Expected ReactServerWebpackPlugin react-client-manifest.json to exclude _t-escaped and _nested, got:\n${emittedManifestRaw}`
    );
    assert(
      emittedManifestRaw.includes("_AllowedClient.js"),
      `Expected ReactServerWebpackPlugin react-client-manifest.json to include active _AllowedClient.js, got:\n${emittedManifestRaw}`
    );
  } finally {
    fs.rmSync(tmpWpRscParent, { recursive: true, force: true });
  }

  console.log(
    "✅ [4/5] Piece B1: Core scanners (routeModules, VFS, esbuild, webpack & ReactServerWebpackPlugin) PASSED"
  );

  // =========================================================================
  // 5. Piece B1: Manifests, Emitted Bundles (`.dinou/dist3`, `.dinou/public`) & SWC Cache
  // =========================================================================
  const inspectEmittedArtifacts = (label) => {
    const clientManifestCandidates = [
      path.join(root, ".dinou/react_client_manifest/react-client-manifest.json"),
      path.join(root, ".dinou/dist3/react-client-manifest.json"),
      path.join(root, ".dinou/public/react-client-manifest.json"),
    ];
    for (const cPath of clientManifestCandidates) {
      if (fs.existsSync(cPath)) {
        const raw = fs.readFileSync(cPath, "utf8");
        assert(
          !raw.includes("_t-escaped"),
          `[${label}] Leaked _t-escaped ClientWidget into ${cPath}!`
        );
      }
    }

    const sfManifestCandidates = [
      path.join(root, ".dinou/server_functions_manifest/server-functions-manifest.json"),
      path.join(root, ".dinou/dist3/server-functions-manifest.json"),
      path.join(root, ".dinou/public/server-functions-manifest.json"),
    ];
    for (const sfPath of sfManifestCandidates) {
      if (fs.existsSync(sfPath)) {
        const raw = fs.readFileSync(sfPath, "utf8");
        assert(
          !raw.includes("_t-escaped") && !raw.includes("dangerousParkedAction"),
          `[${label}] Leaked _t-escaped Server Function into ${sfPath}!`
        );
      }
    }

    for (const outDirName of [".dinou/dist3", ".dinou/public"]) {
      const outDir = path.join(root, outDirName);
      for (const builtFile of collectFilesRecursive(outDir, (f) =>
        /\.(js|mjs|cjs|css)$/.test(f)
      )) {
        const content = fs.readFileSync(builtFile, "utf8");
        assert(
          !content.includes("parked-escaped-sentinel-selector-do-not-bundle"),
          `[${label}] Leaked parked.css into ${builtFile}!`
        );
        assert(
          !content.includes("SECURITY_BREACH_ESCAPED_SERVER_ACTION_EXECUTED"),
          `[${label}] Leaked secret-actions.ts into ${builtFile}!`
        );
      }
    }

    assert(
      !fs.existsSync(path.join(root, ".dinou/swc/src/_t-escaped")),
      `[${label}] Expected .dinou/swc/src/_t-escaped to NOT exist!`
    );
  };

  if (runFullBuild) {
    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      execSync(`npm run build:node:${bundler}`, { stdio: "inherit", cwd: root });
      inspectEmittedArtifacts(`full-build:${bundler}`);
    }
  } else {
    inspectEmittedArtifacts("current-workspace");
  }

  console.log("✅ [5/5] Piece B1: Zero manifest, CSS, server-action & SWC cache leaks PASSED");
  console.log("RESULT: All 5 escaped `_folder` (A + B Radical) verification checks PASSED");
}

main().catch((err) => {
  console.error("❌ [verify-escaped-ci.mjs] FAILED:", err);
  process.exit(1);
});
