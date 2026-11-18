import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();

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
    )
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "index.js"),
    `export * from ${JSON.stringify(relToDinou("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(relToDinou("server.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(relToDinou("core/config.js"))};\nexport { default } from ${JSON.stringify(relToDinou("core/config.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "adapters", "node.js"),
    `export * from ${JSON.stringify(relFromAdapters("adapters/node.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "adapters", "netlify.js"),
    `export * from ${JSON.stringify(relFromAdapters("adapters/netlify.js"))};\nexport { default } from ${JSON.stringify(relFromAdapters("adapters/netlify.js"))};\n`
  );
}

let FIXTURE_DIR = "";

function setupFixtureApp() {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  fs.mkdirSync(inRepoTmpBase, { recursive: true });
  FIXTURE_DIR = fs.mkdtempSync(path.join(inRepoTmpBase, "tmp-bundlers-unit-"));
  fs.mkdirSync(path.join(FIXTURE_DIR, "src"), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_DIR, "public"), { recursive: true });

  writeDinouShim(FIXTURE_DIR);

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "package.json"),
    JSON.stringify(
      {
        name: "dinou-bundlers-unit-fixture",
        private: true,
        type: "module",
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "tsconfig.json"),
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
    )
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "public", "robots.txt"),
    "User-agent: *\nAllow: /\n"
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "src", "badge.module.css"),
    ".pill { color: rgb(16, 185, 129); font-weight: 600; }\n"
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "src", "actions.ts"),
    `"use server";
export async function pingAction(label: string) {
  return \`pong:\${label}\`;
}
`
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "src", "counter.tsx"),
    `"use client";
import { useState } from "react";
import styles from "@/badge.module.css";
import { pingAction } from "@/actions";

export default function Counter({ initial = 1 }: { initial?: number }) {
  const [count, setCount] = useState(initial);
  const doubled = count * 2;
  return (
    <button
      className={styles.pill}
      data-doubled={doubled}
      onClick={async () => {
        await pingAction(String(count));
        setCount((c) => c + 1);
      }}
    >
      Count: {count}
    </button>
  );
}
`
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "src", "layout.tsx"),
    `import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
`
  );

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "src", "page.tsx"),
    `import Counter from "@/counter";

export default function HomePage() {
  return (
    <main>
      <h1 data-build-tool={process.env.DINOU_BUILD_TOOL}>Tri-Bundler Matrix OK</h1>
      <Counter initial={5} />
    </main>
  );
}
`
  );
}

test.before(() => {
  setupFixtureApp();
});

test.after(() => {
  if (FIXTURE_DIR && fs.existsSync(FIXTURE_DIR)) {
    try {
      fs.rmSync(FIXTURE_DIR, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 60,
      });
    } catch {}
  }
});

test("1. Vendor catalog (31 active vendors) & declared dependencies resolve in Vendorized and Unvendorized (-u) modes", () => {
  const pkg = JSON.parse(fs.readFileSync(DINOU_PKG_JSON_PATH, "utf8"));
  const importKeys = Object.keys(pkg.imports || {});
  assert.equal(
    importKeys.length,
    31,
    `Expected 31 active vendor #subpath imports, got ${importKeys.length}`
  );

  for (const obsolete of [
    "#dotenv",
    "#cross-env",
    "#rollup-plugin-copy",
    "#esbuild-copy-static-files",
    "#esbuild-plugins/tsconfig-paths",
    "#rollup-plugin-tsconfig-paths",
    "#tsconfig-paths-webpack-plugin",
  ]) {
    assert.ok(!pkg.imports[obsolete], `Obsolete ${obsolete} must be removed`);
  }

  for (const requiredSubpath of [
    "#fast-glob",
    "#resolve",
    "#chokidar",
    "#css-loader",
    "#babel-loader",
  ]) {
    assert.ok(pkg.imports[requiredSubpath], `Missing ${requiredSubpath}`);
  }

  for (const requiredDep of [
    "@babel/generator",
    "@babel/types",
    "fast-glob",
    "resolve",
  ]) {
    assert.ok(
      pkg.dependencies[requiredDep],
      `Missing declared direct dependency ${requiredDep}`
    );
  }

  assert.ok(
    fs.existsSync(
      path.join(DINOU_DIR, "compiled", "css-loader", "runtime", "api.js")
    ),
    "Missing dinou/compiled/css-loader/runtime/api.js"
  );
  assert.ok(
    fs.existsSync(
      path.join(
        DINOU_DIR,
        "compiled",
        "mini-css-extract-plugin",
        "hmr",
        "hotModuleReplacement.js"
      )
    ),
    "Missing dinou/compiled/mini-css-extract-plugin/hmr/hotModuleReplacement.js"
  );

  const checkScript = `
    import { createRequire } from "node:module";
    import fs from "node:fs";
    const dinouPkgPath = ${JSON.stringify(DINOU_PKG_JSON_PATH)};
    const pkg = JSON.parse(fs.readFileSync(dinouPkgPath, "utf8"));
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
      `Node vendorized ${k} should resolve to compiled/, got ${resolved}`
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
      `Node unvendorized ${k} should resolve to node_modules, got ${resolved}`
    );
  }
});

test("2. Standard Node builds across Esbuild, Rollup, and Webpack propagate DINOU_BUILD_TOOL, omit dead react-refresh chunks in Esbuild prod, and serve SSR HTML", async () => {
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
      `Expected banner "Dinou (Node.js • ${bundler})" in stdout`
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

    const serverMjsPath = path.join(FIXTURE_DIR, ".dinou", "node", "server.mjs");
    const rscEnginePath = path.join(
      FIXTURE_DIR,
      ".dinou",
      "node",
      "rsc-engine.mjs"
    );
    assert.ok(fs.existsSync(serverMjsPath), "Missing .dinou/node/server.mjs");
    assert.ok(fs.existsSync(rscEnginePath), "Missing .dinou/node/rsc-engine.mjs");

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
        env: buildCleanBaseEnv({ NODE_ENV: "production" }),
      }
    );
    assert.equal(probeRes.status, 0, probeRes.stderr);
    const { status: probeStatus, html } = JSON.parse(
      probeRes.stdout.trim().split(/\r?\n/).pop()
    );
    assert.equal(probeStatus, 200, probeRes.stderr);
    assert.ok(
      html.includes("Tri-Bundler Matrix OK") &&
        html.includes(`data-build-tool="${bundler}"`)
    );
    assert.ok(html.includes("Count:") && html.includes("5"));
  }
});

test("3. Pure Bun mode executes Esbuild, Rollup, and Webpack natively under Bun (including -u unvendorized)", (t) => {
  if (!hasRuntimeBinary("bun")) {
    t.skip("Bun binary not installed in test environment");
    return;
  }

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

  for (const bundler of ["esbuild", "rollup", "webpack"]) {
    const res = spawnSync("bun", [CLI_PATH, `build:node:pure:${bundler}`], {
      cwd: FIXTURE_DIR,
      encoding: "utf8",
      env: {
        ...baseEnv,
        [pathKey]: filteredPath,
        Path: filteredPath,
        PATH: filteredPath,
      },
    });
    assert.equal(
      res.status,
      0,
      `build:node:pure:${bundler} failed under Bun:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
    );
    assert.ok(res.stdout.includes(`Dinou (Node.js • ${bundler})`));
  }

  const bunPureRes = spawnSync(
    "bun",
    [CLI_PATH, "build:bun:pure:rollup", "-u"],
    {
      cwd: FIXTURE_DIR,
      encoding: "utf8",
      env: {
        ...baseEnv,
        [pathKey]: filteredPath,
        Path: filteredPath,
        PATH: filteredPath,
      },
    }
  );
  assert.equal(bunPureRes.status, 0, bunPureRes.stderr);
  assert.ok(bunPureRes.stdout.includes("Dinou (Bun • rollup)"));
  assert.ok(
    fs.existsSync(path.join(FIXTURE_DIR, ".dinou", "bun", "server.js"))
  );
});

test("4. Cloudflare, Static Export, and typegen -u propagate DINOU_BUILD_TOOL cleanly", () => {
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
});
