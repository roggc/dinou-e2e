// scripts/verify-bundlers-ci.mjs
// Verifies Multi-Bundler CLI Execution, Pure Bun Compatibility, Vendor Catalog & -u Unvendorized Mode Fixes (x-bundlers-fixes.md):
// 1. 31-package active vendor catalog in dinou/package.json & dinou/compiled/vendors-manifest.json, removal of 7 obsolete vendors, declared @babel/generator + @babel/types + fast-glob + resolve dependencies, css-loader/runtime & mini-css-extract-plugin/hmr CommonJS runtime assets, and Vendorized vs Unvendorized (-u) #subpath resolution on Node & Bun
// 2. ensure-vendor-mode.js: hasUnvendorizedInArgs, isUnvendorizedRequested (-u, --unvendorized, DINOU_UNVENDORIZED=true, .env DINOU_UNVENDORIZED=true), isUnvendorizedConditionActive (Node NODE_OPTIONS/execArgv vs Bun execArgv), and process.execArgv preservation on respawn
// 3. Strict non-hoisted isolated app (os.tmpdir() with zero build-tool hoisting) across Esbuild, Rollup (-u), and Webpack: DINOU_BUILD_TOOL propagation, dead react-refresh entrypoint omission in Esbuild prod, CSS Modules (#css-loader + runtime/api.js), and live SSR HTML fetch
// 4. 100% Pure Bun mode (build:node:pure:esbuild|rollup|webpack & build:bun:pure:rollup -u) with Node stripped from PATH (verifying zero npx/cross-env/node dependency & loadReactServerWebpackPlugin() scoped CJS evaluator under Bun)
// 5. Cloudflare (build:cloudflare:rollup), Static Export (export-static:webpack), typegen -u, and dinou/node/dev.js DINOU_BUILD_DEV_ONLY=true + require.resolve non-hoisted resolution

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();

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
    const abs = path.join(REPO_ROOT, rel);
    return [rel, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null];
  })
);

function resolveDinouLayout() {
  const ejectedDir = path.resolve(REPO_ROOT, "dinou");
  if (fs.existsSync(path.join(ejectedDir, "cli.js"))) {
    return {
      dinouDir: ejectedDir,
      dinouPkgDir: ejectedDir,
      dinouPkgJsonPath: path.join(ejectedDir, "package.json"),
    };
  }
  const nestedDir = path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou");
  const flatPkgDir = path.resolve(REPO_ROOT, "node_modules", "dinou");
  if (fs.existsSync(path.join(nestedDir, "cli.js"))) {
    return {
      dinouDir: nestedDir,
      dinouPkgDir: flatPkgDir,
      dinouPkgJsonPath: fs.existsSync(path.join(nestedDir, "package.json"))
        ? path.join(nestedDir, "package.json")
        : path.join(flatPkgDir, "package.json"),
    };
  }
  if (fs.existsSync(path.join(flatPkgDir, "cli.js"))) {
    return {
      dinouDir: flatPkgDir,
      dinouPkgDir: flatPkgDir,
      dinouPkgJsonPath: path.join(flatPkgDir, "package.json"),
    };
  }
  throw new Error("Could not locate dinou/cli.js from " + REPO_ROOT);
}

const {
  dinouDir: DINOU_DIR,
  dinouPkgDir: DINOU_PKG_DIR,
  dinouPkgJsonPath: DINOU_PKG_JSON_PATH,
} = resolveDinouLayout();
const CLI_PATH = path.join(DINOU_DIR, "cli.js");

function hasRuntimeBinary(bin) {
  const res = spawnSync(bin, ["--version"], { encoding: "utf8" });
  return !res.error && res.status === 0;
}

function buildCleanBaseEnv(extra = {}) {
  const cleanedNodeOptions = (process.env.NODE_OPTIONS || "")
    .replace(/(?:^|\s)(?:--conditions[=\s]|-C[=\s])[^\s]*unvendorized[^\s]*/g, "")
    .trim();
  const env = { ...process.env };
  delete env.DINOU_DEV;
  delete env.DINOU_BUILD_TOOL;
  delete env.DINOU_UNVENDORIZED;
  delete env.PORT;
  delete env.HMR_PORT;
  if (cleanedNodeOptions) {
    env.NODE_OPTIONS = cleanedNodeOptions;
  } else {
    delete env.NODE_OPTIONS;
  }
  return { ...env, ...extra };
}

function writeDinouShim(fixtureDir) {
  const dinouShimDir = path.join(fixtureDir, "node_modules", "dinou");
  fs.mkdirSync(path.join(dinouShimDir, "adapters"), { recursive: true });
  const relToDinou = (sub) => {
    const target = path.join(DINOU_DIR, sub);
    const rel = path.relative(dinouShimDir, target).replace(/\\/g, "/");
    if (rel && !path.isAbsolute(rel)) {
      return rel.startsWith(".") ? rel : `./${rel}`;
    }
    return pathToFileURL(target).href;
  };
  const relFromAdapters = (sub) => {
    const target = path.join(DINOU_DIR, sub);
    const rel = path
      .relative(path.join(dinouShimDir, "adapters"), target)
      .replace(/\\/g, "/");
    if (rel && !path.isAbsolute(rel)) {
      return rel.startsWith(".") ? rel : `./${rel}`;
    }
    return pathToFileURL(target).href;
  };

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
          "./adapters/node": "./adapters/node.js",
          "./adapters/netlify": "./adapters/netlify.js",
        },
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "index.js"),
    `export * from ${JSON.stringify(relToDinou("index.js"))};\n`,
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
    path.join(dinouShimDir, "adapters", "node.js"),
    `export * from ${JSON.stringify(relFromAdapters("adapters/node.js"))};\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "adapters", "netlify.js"),
    `export * from ${JSON.stringify(relFromAdapters("adapters/netlify.js"))};\nexport { default } from ${JSON.stringify(relFromAdapters("adapters/netlify.js"))};\n`,
    "utf8"
  );
}

function removeDirSafe(dirPath) {
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 60,
    });
  } catch {}
}

function createBundlersFixture() {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou", "tmp-bundlers-fixtures");
  fs.mkdirSync(inRepoTmpBase, { recursive: true });
  const fixtureDir = fs.mkdtempSync(path.join(inRepoTmpBase, "app-"));
  fs.mkdirSync(path.join(fixtureDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(fixtureDir, "public"), { recursive: true });

  writeDinouShim(fixtureDir);

  fs.writeFileSync(
    path.join(fixtureDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou-bundlers-isolated-fixture",
        private: true,
        type: "module",
      },
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    path.join(fixtureDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          paths: {
            "@/*": ["./src/*"],
          },
        },
      },
      null,
      2
    ),
    "utf8"
  );

  fs.writeFileSync(
    path.join(fixtureDir, "public", "robots.txt"),
    "User-agent: *\nAllow: /\n",
    "utf8"
  );

  fs.writeFileSync(
    path.join(fixtureDir, "src", "badge.module.css"),
    ".pill { color: rgb(16, 185, 129); font-weight: 600; }\n",
    "utf8"
  );

  fs.writeFileSync(
    path.join(fixtureDir, "src", "actions.ts"),
    [
      '"use server";',
      "export async function pingAction(label: string) {",
      "  return `pong:${label}:${process.env.DINOU_BUILD_TOOL || 'unset'}`;",
      "}",
      "",
    ].join("\n"),
    "utf8"
  );

  fs.writeFileSync(
    path.join(fixtureDir, "src", "counter.tsx"),
    [
      '"use client";',
      'import { useState } from "react";',
      'import styles from "@/badge.module.css";',
      'import { pingAction } from "@/actions";',
      "",
      "export default function Counter({ initial = 1 }: { initial?: number }) {",
      "  const [count, setCount] = useState(initial);",
      "  const doubled = count * 2;",
      "  return (",
      "    <button",
      "      className={styles.pill}",
      "      data-doubled={doubled}",
      "      onClick={async () => {",
      "        await pingAction(String(count));",
      "        setCount((c) => c + 1);",
      "      }}",
      "    >",
      "      Count: {count}",
      "    </button>",
      "  );",
      "}",
      "",
    ].join("\n"),
    "utf8"
  );

  fs.writeFileSync(
    path.join(fixtureDir, "src", "layout.tsx"),
    [
      'import type { ReactNode } from "react";',
      "",
      "export default function RootLayout({ children }: { children: ReactNode }) {",
      "  return (",
      '    <html lang="en">',
      "      <head>",
      '        <meta charSet="utf-8" />',
      '        <link rel="stylesheet" href="/styles.css" />',
      "      </head>",
      "      <body>{children}</body>",
      "    </html>",
      "  );",
      "}",
      "",
    ].join("\n"),
    "utf8"
  );

  fs.writeFileSync(
    path.join(fixtureDir, "src", "page.tsx"),
    [
      'import Counter from "@/counter";',
      "",
      "export default function HomePage() {",
      "  return (",
      "    <main>",
      '      <h1 data-build-tool={process.env.DINOU_BUILD_TOOL}>Tri-Bundler Matrix OK</h1>',
      "      <Counter initial={5} />",
      "    </main>",
      "  );",
      "}",
      "",
    ].join("\n"),
    "utf8"
  );

  return fixtureDir;
}

console.log(
  "1️⃣ Verifying 31-package vendor catalog, declared dependencies, runtime CJS assets & Vendorized vs Unvendorized (-u) resolution..."
);
{
  const pkg = JSON.parse(fs.readFileSync(DINOU_PKG_JSON_PATH, "utf8"));
  const importKeys = Object.keys(pkg.imports || {});
  assert.equal(
    importKeys.length,
    31,
    `Expected 31 active vendor #subpath imports in dinou/package.json, got ${importKeys.length}`
  );

  const vendorsManifestPath = path.join(
    DINOU_DIR,
    "compiled",
    "vendors-manifest.json"
  );
  assert.ok(
    fs.existsSync(vendorsManifestPath),
    "Missing dinou/compiled/vendors-manifest.json"
  );
  const vendorsManifest = JSON.parse(
    fs.readFileSync(vendorsManifestPath, "utf8")
  );
  assert.equal(
    Object.keys(vendorsManifest).length,
    31,
    `Expected 31 compiled vendors in vendors-manifest.json, got ${Object.keys(vendorsManifest).length}`
  );

  for (const obsoleteImport of [
    "#dotenv",
    "#cross-env",
    "#rollup-plugin-copy",
    "#esbuild-copy-static-files",
    "#esbuild-plugins/tsconfig-paths",
    "#rollup-plugin-tsconfig-paths",
    "#tsconfig-paths-webpack-plugin",
  ]) {
    assert.ok(
      !pkg.imports[obsoleteImport],
      `Obsolete subpath ${obsoleteImport} must be removed`
    );
  }

  for (const obsoleteDir of [
    "dotenv",
    "cross-env",
    "rollup-plugin-copy",
    "esbuild-copy-static-files",
    "esbuild-tsconfig-paths",
    "rollup-plugin-tsconfig-paths",
    "tsconfig-paths-webpack-plugin",
  ]) {
    assert.ok(
      !fs.existsSync(path.join(DINOU_DIR, "compiled", obsoleteDir)),
      `Obsolete compiled directory dinou/compiled/${obsoleteDir} must be pruned`
    );
  }

  for (const obsoleteDep of [
    "dotenv",
    "cross-env",
    "rollup-plugin-copy",
    "esbuild-copy-static-files",
    "@esbuild-plugins/tsconfig-paths",
    "rollup-plugin-tsconfig-paths",
    "tsconfig-paths-webpack-plugin",
  ]) {
    assert.ok(
      !pkg.dependencies?.[obsoleteDep],
      `Obsolete dependency ${obsoleteDep} must be removed from dinou/package.json`
    );
  }

  for (const requiredSubpath of [
    "#fast-glob",
    "#resolve",
    "#chokidar",
    "#css-loader",
    "#babel-loader",
  ]) {
    assert.ok(
      pkg.imports[requiredSubpath],
      `Missing ${requiredSubpath} in dinou/package.json#imports`
    );
  }

  for (const requiredDep of [
    "@babel/generator",
    "@babel/types",
    "fast-glob",
    "resolve",
  ]) {
    assert.ok(
      pkg.dependencies?.[requiredDep],
      `Missing declared direct dependency ${requiredDep} in dinou/package.json`
    );
  }

  const cssRuntimeApi = path.join(
    DINOU_DIR,
    "compiled",
    "css-loader",
    "runtime",
    "api.js"
  );
  const cssRuntimePkg = path.join(
    DINOU_DIR,
    "compiled",
    "css-loader",
    "runtime",
    "package.json"
  );
  assert.ok(fs.existsSync(cssRuntimeApi), "Missing css-loader/runtime/api.js");
  assert.deepEqual(JSON.parse(fs.readFileSync(cssRuntimePkg, "utf8")), {
    type: "commonjs",
  });

  const mcepHmrFile = path.join(
    DINOU_DIR,
    "compiled",
    "mini-css-extract-plugin",
    "hmr",
    "hotModuleReplacement.js"
  );
  const mcepHmrPkg = path.join(
    DINOU_DIR,
    "compiled",
    "mini-css-extract-plugin",
    "hmr",
    "package.json"
  );
  assert.ok(
    fs.existsSync(mcepHmrFile),
    "Missing mini-css-extract-plugin/hmr/hotModuleReplacement.js"
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(mcepHmrPkg, "utf8")), {
    type: "commonjs",
  });

  const checkScript = `
    import { createRequire } from "node:module";
    import fs from "node:fs";
    const pkg = JSON.parse(fs.readFileSync(${JSON.stringify(DINOU_PKG_JSON_PATH)}, "utf8"));
    const req = createRequire(${JSON.stringify(CLI_PATH)});
    const results = {};
    for (const k of Object.keys(pkg.imports)) {
      results[k] = req.resolve(k).replace(/\\\\/g, "/");
    }
    console.log(JSON.stringify(results));
  `;

  const nodeVend = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", checkScript],
    { cwd: REPO_ROOT, encoding: "utf8", env: buildCleanBaseEnv() }
  );
  assert.equal(nodeVend.status, 0, nodeVend.stderr);
  const nodeVendMap = JSON.parse(nodeVend.stdout.trim());
  for (const [k, resolved] of Object.entries(nodeVendMap)) {
    assert.ok(
      resolved.includes("/compiled/"),
      `Node vendorized ${k} should resolve to /compiled/, got ${resolved}`
    );
  }

  const nodeUnvend = spawnSync(
    process.execPath,
    ["--conditions=unvendorized", "--input-type=module", "-e", checkScript],
    { cwd: REPO_ROOT, encoding: "utf8", env: buildCleanBaseEnv() }
  );
  assert.equal(nodeUnvend.status, 0, nodeUnvend.stderr);
  const nodeUnvendMap = JSON.parse(nodeUnvend.stdout.trim());
  for (const [k, resolved] of Object.entries(nodeUnvendMap)) {
    assert.ok(
      resolved.includes("/node_modules/") && !resolved.includes("/compiled/"),
      `Node unvendorized ${k} should resolve to /node_modules/, got ${resolved}`
    );
  }

  if (hasRuntimeBinary("bun")) {
    const bunUnvend = spawnSync(
      "bun",
      ["--conditions=unvendorized", "-e", checkScript],
      { cwd: REPO_ROOT, encoding: "utf8", env: buildCleanBaseEnv() }
    );
    assert.equal(bunUnvend.status, 0, bunUnvend.stderr);
    const bunUnvendMap = JSON.parse(bunUnvend.stdout.trim());
    for (const [k, resolved] of Object.entries(bunUnvendMap)) {
      assert.ok(
        !resolved.includes("/compiled/") &&
          (resolved.includes("/node_modules/") || k === "#ws"),
        `Bun unvendorized ${k} should resolve outside /compiled/ (node_modules or native builtin), got ${resolved}`
      );
    }
  }
}
console.log("   ✅ Section 1 passed!");

console.log(
  "2️⃣ Verifying ensure-vendor-mode.js (-u, --unvendorized, DINOU_UNVENDORIZED, .env, Bun execArgv & process.execArgv preservation)..."
);
{
  const {
    hasUnvendorizedInArgs,
    isUnvendorizedRequested,
    isUnvendorizedConditionActive,
  } = await import(
    pathToFileURL(path.join(DINOU_DIR, "core", "ensure-vendor-mode.js")).href
  );

  assert.equal(hasUnvendorizedInArgs(["--conditions=unvendorized"]), true);
  assert.equal(
    hasUnvendorizedInArgs(["--conditions=react-server,unvendorized"]),
    true
  );
  assert.equal(hasUnvendorizedInArgs(["-C=unvendorized"]), true);
  assert.equal(hasUnvendorizedInArgs(["--conditions", "unvendorized"]), true);
  assert.equal(hasUnvendorizedInArgs(["-C", "react-server,unvendorized"]), true);
  assert.equal(hasUnvendorizedInArgs(["--conditions=react-server"]), false);

  const tmpEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-u-env-"));
  try {
    assert.equal(isUnvendorizedRequested(tmpEnvDir, ["node", "cli.js"]), false);
    assert.equal(
      isUnvendorizedRequested(tmpEnvDir, ["node", "cli.js", "-u"]),
      true
    );
    assert.equal(
      isUnvendorizedRequested(tmpEnvDir, ["node", "cli.js", "--unvendorized"]),
      true
    );

    fs.writeFileSync(
      path.join(tmpEnvDir, ".env"),
      "DINOU_UNVENDORIZED=true\n",
      "utf8"
    );
    assert.equal(isUnvendorizedRequested(tmpEnvDir, ["node", "cli.js"]), true);

    // Verify ensureVendorMode() respawn preserves existing process.execArgv (e.g. --conditions=react-server)
    const probeScript = path.join(tmpEnvDir, "probe-respawn.mjs");
    const ensureUrl = pathToFileURL(
      path.join(DINOU_DIR, "core", "ensure-vendor-mode.js")
    ).href;
    fs.writeFileSync(
      probeScript,
      [
        `import { createRequire } from "node:module";`,
        `import ensureVendorMode, { isUnvendorizedConditionActive } from ${JSON.stringify(ensureUrl)};`,
        "if (!ensureVendorMode()) { await new Promise(() => {}); }",
        `const reqFromRepo = createRequire(${JSON.stringify(path.join(REPO_ROOT, "package.json"))});`,
        'const React = reqFromRepo("react");',
        "console.log(JSON.stringify({ active: isUnvendorizedConditionActive(), hasUseState: typeof React.useState === 'function', execArgv: process.execArgv }));",
      ].join("\n"),
      "utf8"
    );

    const respawnNode = spawnSync(
      process.execPath,
      ["--conditions=react-server", probeScript, "-u"],
      { cwd: REPO_ROOT, encoding: "utf8", env: buildCleanBaseEnv() }
    );
    assert.equal(respawnNode.status, 0, respawnNode.stderr);
    const parsedNode = JSON.parse(respawnNode.stdout.trim());
    assert.equal(parsedNode.active, true);
    assert.equal(
      parsedNode.hasUseState,
      false,
      "Expected --conditions=react-server to be preserved across ensureVendorMode() respawn"
    );
  } finally {
    removeDirSafe(tmpEnvDir);
  }
  void isUnvendorizedConditionActive;
}
console.log("   ✅ Section 2 passed!");

const FIXTURE_DIR = createBundlersFixture();
try {
  console.log(
    "3️⃣ Verifying Multi-Bundler builds across Esbuild, Rollup (-u), and Webpack (DINOU_BUILD_TOOL, dead react-refresh removal & SSR HTML)..."
  );
  for (const bundler of ["esbuild", "rollup", "webpack"]) {
    const extraFlags = bundler === "rollup" ? ["-u"] : [];
    const res = spawnSync(
      process.execPath,
      [CLI_PATH, `build:node:${bundler}`, ...extraFlags],
      { cwd: FIXTURE_DIR, encoding: "utf8", env: buildCleanBaseEnv() }
    );
    assert.equal(
      res.status,
      0,
      `build:node:${bundler} failed:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
    );
    assert.ok(
      res.stdout.includes(`Dinou (Node.js • ${bundler})`),
      `Expected banner "Dinou (Node.js • ${bundler})" in stdout, got:\n${res.stdout}`
    );

    const dist3Files = fs.readdirSync(path.join(FIXTURE_DIR, ".dinou", "dist3"));
    if (bundler === "esbuild") {
      assert.ok(
        !dist3Files.some(
          (f) =>
            f.startsWith("runtime-") || f.startsWith("react-refresh-entry-")
        ),
        `Esbuild prod dist3 must not contain dead react-refresh files, found: ${dist3Files.join(", ")}`
      );
    }
    assert.ok(
      fs.existsSync(path.join(FIXTURE_DIR, ".dinou", "dist3", "styles.css")),
      `Expected compiled styles.css in .dinou/dist3 for ${bundler}`
    );
    const stylesTxt = fs.readFileSync(
      path.join(FIXTURE_DIR, ".dinou", "dist3", "styles.css"),
      "utf8"
    );
    assert.ok(
      stylesTxt.includes("16, 185, 129") || stylesTxt.includes("#10b981"),
      `Expected badge.module.css rule in styles.css for ${bundler}`
    );

    const serverMjsPath = path.join(FIXTURE_DIR, ".dinou", "node", "server.mjs");
    assert.ok(fs.existsSync(serverMjsPath), "Missing .dinou/node/server.mjs");

    const probeCode = `
      import { pathToFileURL } from "node:url";
      const mod = await import(${JSON.stringify(pathToFileURL(serverMjsPath).href)});
      const res = await mod.fetch(new Request("http://localhost/"));
      const html = await res.text();
      console.log(JSON.stringify({ status: res.status, html }));
    `;
    const probeRes = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", probeCode],
      {
        cwd: FIXTURE_DIR,
        encoding: "utf8",
        env: buildCleanBaseEnv({ NODE_ENV: "production", DINOU_DEBUG: "true" }),
      }
    );
    assert.equal(
      probeRes.status,
      0,
      `server.mjs probe crashed for ${bundler}:\n${probeRes.stderr}`
    );
    const { status: probeStatus, html } = JSON.parse(
      probeRes.stdout.trim().split(/\r?\n/).pop()
    );
    assert.equal(
      probeStatus,
      200,
      `Expected 200 for ${bundler}, got ${probeStatus}:\nBUILD OUT:\n${res.stdout}\nBUILD ERR:\n${res.stderr}\nHTML:\n${html}\nSTDERR:\n${probeRes.stderr}`
    );
    assert.ok(
      html.includes("Tri-Bundler Matrix OK") &&
        html.includes(`data-build-tool="${bundler}"`),
      `Expected Tri-Bundler Matrix OK & data-build-tool="${bundler}" in HTML`
    );
    assert.ok(html.includes("Count:") && html.includes("5"));
  }
  console.log("   ✅ Section 3 passed!");

  console.log(
    "4️⃣ Verifying 100% Pure Bun mode across Esbuild, Rollup, and Webpack (Node stripped from PATH + -u unvendorized)..."
  );
  if (hasRuntimeBinary("bun")) {
    const baseEnv = buildCleanBaseEnv();
    const pathKey =
      Object.keys(baseEnv).find((k) => k.toLowerCase() === "path") || "PATH";
    const nodeExeDir = path.dirname(process.execPath).toLowerCase();
    const filteredPath = (baseEnv[pathKey] || "")
      .split(path.delimiter)
      .filter((entry) => {
        const lower = entry.toLowerCase();
        return !lower.includes("nodejs") && lower !== nodeExeDir;
      })
      .join(path.delimiter);
    const pureBunEnv = {
      ...baseEnv,
      [pathKey]: filteredPath,
      Path: filteredPath,
      PATH: filteredPath,
    };

    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      const res = spawnSync(
        "bun",
        [CLI_PATH, `build:node:pure:${bundler}`],
        {
          cwd: FIXTURE_DIR,
          encoding: "utf8",
          env: pureBunEnv,
        }
      );
      assert.equal(
        res.status,
        0,
        `build:node:pure:${bundler} failed under Bun:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
      );
      assert.ok(
        res.stdout.includes(`Dinou (Node.js • ${bundler})`),
        `Expected "Dinou (Node.js • ${bundler})" in Pure Bun output`
      );
    }

    const bunPureRes = spawnSync(
      "bun",
      [CLI_PATH, "build:bun:pure:rollup", "-u"],
      {
        cwd: FIXTURE_DIR,
        encoding: "utf8",
        env: pureBunEnv,
      }
    );
    assert.equal(
      bunPureRes.status,
      0,
      `build:bun:pure:rollup -u failed:\nSTDOUT:\n${bunPureRes.stdout}\nSTDERR:\n${bunPureRes.stderr}`
    );
    assert.ok(bunPureRes.stdout.includes("Dinou (Bun • rollup)"));
    assert.ok(
      fs.existsSync(path.join(FIXTURE_DIR, ".dinou", "bun", "server.js"))
    );
    console.log("   ✅ Section 4 passed!");
  } else {
    console.log("   ℹ️ Bun binary not installed; skipping Section 4 Pure Bun execution.");
  }

  console.log(
    "5️⃣ Verifying Cloudflare (rollup), Static Export (webpack), typegen -u & dev.js non-hoisted boot..."
  );
  {
    const cfRes = spawnSync(
      process.execPath,
      [CLI_PATH, "build:cloudflare:rollup"],
      { cwd: FIXTURE_DIR, encoding: "utf8", env: buildCleanBaseEnv() }
    );
    assert.equal(cfRes.status, 0, cfRes.stderr);
    assert.ok(cfRes.stdout.includes("Dinou (Cloudflare Workers • rollup)"));
    const workerCode = fs.readFileSync(
      path.join(FIXTURE_DIR, ".dinou", "cloudflare", "worker.js"),
      "utf8"
    );
    assert.ok(workerCode.includes('"rollup"'));

    const expRes = spawnSync(
      process.execPath,
      [CLI_PATH, "export-static:webpack"],
      { cwd: FIXTURE_DIR, encoding: "utf8", env: buildCleanBaseEnv() }
    );
    assert.equal(expRes.status, 0, expRes.stderr);
    assert.ok(expRes.stdout.includes("Dinou (Static Export • webpack)"));
    const exportedHtml = fs.readFileSync(
      path.join(FIXTURE_DIR, "out", "index.html"),
      "utf8"
    );
    assert.ok(exportedHtml.includes("window.__DINOU_STATIC_EXPORT__=true"));

    const typegenRes = spawnSync(
      process.execPath,
      [CLI_PATH, "typegen", "-u"],
      { cwd: FIXTURE_DIR, encoding: "utf8", env: buildCleanBaseEnv() }
    );
    assert.equal(typegenRes.status, 0, typegenRes.stderr);
    assert.ok(
      fs.existsSync(path.join(FIXTURE_DIR, ".dinou", "types", "routes.d.ts"))
    );

    const devBootRes = spawnSync(
      process.execPath,
      [path.join(DINOU_DIR, "node", "dev.js")],
      {
        cwd: FIXTURE_DIR,
        encoding: "utf8",
        env: buildCleanBaseEnv({
          DINOU_BUILD_DEV_ONLY: "true",
          DINOU_BUILD_TOOL: "esbuild",
          PORT: "48940",
          HMR_PORT: "48941",
        }),
      }
    );
    assert.equal(
      devBootRes.status,
      0,
      `dinou/node/dev.js non-hoisted boot failed:\nSTDOUT:\n${devBootRes.stdout}\nSTDERR:\n${devBootRes.stderr}`
    );
  }
  console.log("   ✅ Section 5 passed!");
} finally {
  removeDirSafe(FIXTURE_DIR);
  removeDirSafe(path.join(REPO_ROOT, ".dinou", "tmp-bundlers-fixtures"));
}

for (const [rel, expectedContent] of manifestSnapshotBefore.entries()) {
  const abs = path.join(REPO_ROOT, rel);
  const currentContent = fs.existsSync(abs)
    ? fs.readFileSync(abs, "utf8")
    : null;
  assert.equal(
    currentContent,
    expectedContent,
    `Root app manifest ${rel} was mutated by verify-bundlers-ci.mjs!`
  );
}

console.log(
  "\n🎉 All 5 Dinou v9.4.0 Multi-Bundler, Pure Bun & Dual-Mode Vendoring verification suites PASSED!"
);
process.exit(0);
