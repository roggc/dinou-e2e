// scripts/verify-eject-ci.mjs
// Verifies Dinou v9.4.0 Eject & Uneject Sovereignty Lifecycle (x-eject-fixes.md):
// 1. Selective rewritePackageJsonForEject & round-trip rewritePackageJsonForUneject (minimal starter vs all 148 CLI commands, custom scripts, .dinou path safety, devDependencies.dinou cleanup, tarball/protocol specs)
// 2. detectPackageManager (npm_config_user_agent precedence + pnpm/yarn/bun/npm lockfile fallback) & dinou/cli.js eject/uneject CLI options
// 3. Full eject -> already-ejected guard -> --force overwrite -> interactive (y/N) cancel -> --keep-dinou -> transactional rollback on failed install -> self-deleting CLI uneject lifecycle
// 4. resolveEjectedDinouSpecifier & Tri-Bundler (esbuild, rollup, webpack) live ./dinou sovereignty over stale node_modules/dinou snapshot + "dinou/config" resolution
// 5. Pre-bundled vendor exclusion (/dinou/compiled/ in Webpack & Rollup; relFromRoot.startsWith("dinou/") in Esbuild babelReactCompilerPlugin)
// 6. Multi-root module resolution in dinou/scripts/build-vendors.js ([PROJECT_ROOT, DINOU_ROOT, nmDinouDir, realNmDinouDir] & nodePaths)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
const SOURCE_DINOU_DIR =
  dinouRootCandidates.find((dir) => fs.existsSync(path.join(dir, "cli.js"))) ??
  dinouRootCandidates[0];
const CLI_PATH = path.join(SOURCE_DINOU_DIR, "cli.js");

const importDinou = (relPath) =>
  import(pathToFileURL(path.join(SOURCE_DINOU_DIR, relPath)).href);

const {
  DINOU_CLI_COMMANDS,
  detectPackageManager,
  rewritePackageJsonForEject,
  rewritePackageJsonForUneject,
  runEject,
  uneject,
} = await importDinou("core/uneject.js");

const { resolveEjectedDinouSpecifier } = await importDinou(
  "core/resolve-contextual-dinou.js"
);

const EJECT_WRAPPER_SOURCE = `import path from "node:path";
import { fileURLToPath } from "node:url";
import { runEject } from "./dinou/core/uneject.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function eject(options = {}) {
  return runEject({
    ...options,
    sourceDinouDir: path.resolve(__dirname, "dinou"),
  });
}

export default eject;
`;

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

function collectFilesRecursive(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

const fixturesParent = path.join(projectRoot, ".dinou", "tmp-eject-ci-fixtures");
fs.mkdirSync(fixturesParent, { recursive: true });
const tmpBase = fs.mkdtempSync(path.join(fixturesParent, "run-"));

try {
  // =========================================================================
  // 1️⃣ Selective rewritePackageJsonForEject & Round-Trip rewritePackageJsonForUneject
  // =========================================================================
  console.log(
    "1️⃣ Verifying selective rewritePackageJsonForEject & round-trip rewritePackageJsonForUneject (starter vs 148 CLI commands, custom scripts, .dinou safety & tarball specs)..."
  );
  {
    assert.equal(
      DINOU_CLI_COMMANDS.length,
      148,
      `Expected 148 DINOU_CLI_COMMANDS (including build:netlify*), got ${DINOU_CLI_COMMANDS.length}`
    );
    for (const netlifyCmd of [
      "build:netlify",
      "build:netlify:esbuild",
      "build:netlify:rollup",
      "build:netlify:webpack",
    ]) {
      assert.ok(DINOU_CLI_COMMANDS.includes(netlifyCmd));
    }

    const starter = {
      name: "starter-app",
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "dinou dev",
        build: "npx dinou build",
        start: "dinou start",
        eject: "dinou eject",
        preview: "PORT=4100 dinou start --unvendorized",
        lint: "eslint src",
        clean: "rm -rf .dinou dist dinou-temp.log @roggc/dinou-helper",
      },
      dependencies: {
        react: "^19.3.1",
        "react-dom": "^19.3.1",
      },
      devDependencies: {
        dinou: "^9.4.0",
        eslint: "^9.0.0",
      },
    };

    const ejectedStarter = rewritePackageJsonForEject(structuredClone(starter));
    assert.deepEqual(Object.keys(ejectedStarter.scripts).sort(), [
      "build",
      "build:vendors",
      "clean",
      "dev",
      "lint",
      "preview",
      "start",
      "uneject",
    ]);
    assert.equal(ejectedStarter.scripts.dev, "node dinou/cli.js dev");
    assert.equal(ejectedStarter.scripts.build, "node dinou/cli.js build");
    assert.equal(ejectedStarter.scripts.start, "node dinou/cli.js start");
    assert.equal(
      ejectedStarter.scripts.preview,
      "PORT=4100 node dinou/cli.js start --unvendorized"
    );
    assert.equal(ejectedStarter.scripts.lint, "eslint src");
    assert.equal(
      ejectedStarter.scripts.clean,
      "rm -rf .dinou dist dinou-temp.log @roggc/dinou-helper",
      "Must never corrupt .dinou, dinou-temp.log, or scoped @roggc/dinou-helper tokens"
    );
    assert.equal("eject" in ejectedStarter.scripts, false);
    assert.equal(ejectedStarter.dependencies.dinou, "file:./dinou");
    assert.equal("dinou" in ejectedStarter.devDependencies, false);
    assert.equal(ejectedStarter.devDependencies.eslint, "^9.0.0");

    const { pkg: restoredStarter } = rewritePackageJsonForUneject(
      structuredClone(ejectedStarter),
      { spec: "^9.4.0", skipInstall: true }
    );
    assert.equal(restoredStarter.scripts.dev, "dinou dev");
    assert.equal(restoredStarter.scripts.build, "dinou build");
    assert.equal(restoredStarter.scripts.start, "dinou start");
    assert.equal(restoredStarter.scripts.eject, "dinou eject");
    assert.equal("uneject" in restoredStarter.scripts, false);
    assert.equal("build:vendors" in restoredStarter.scripts, false);
    assert.equal(restoredStarter.dependencies.dinou, "^9.4.0");

    // Full 148-command package.json round-trip
    const allScripts = {};
    for (const cmd of DINOU_CLI_COMMANDS) {
      allScripts[cmd] = `dinou ${cmd}`;
    }
    allScripts.eject = "dinou eject";
    const fullEjected = rewritePackageJsonForEject({
      name: "full-app",
      scripts: { ...allScripts },
      dependencies: { dinou: "^9.4.0" },
    });
    assert.equal(
      Object.keys(fullEjected.scripts).length,
      DINOU_CLI_COMMANDS.length + 2
    );
    const { pkg: fullRestored } = rewritePackageJsonForUneject(fullEjected, {
      spec: "^9.4.0",
      skipInstall: true,
    });
    assert.deepEqual(fullRestored.scripts, allScripts);

    // Tarball & registry spec normalization
    const tgzRes = rewritePackageJsonForUneject(
      { scripts: {}, dependencies: { dinou: "file:./dinou" } },
      { spec: "../dinou-9.4.0.tgz", skipInstall: false }
    );
    assert.equal(tgzRes.directSpec, true);
    assert.equal(tgzRes.normalizedSpec, "file:../dinou-9.4.0.tgz");
    assert.equal(tgzRes.pkg.dependencies.dinou, "file:../dinou-9.4.0.tgz");

    const regRes = rewritePackageJsonForUneject(
      { scripts: {}, dependencies: { dinou: "file:./dinou" } },
      { spec: "latest", skipInstall: false }
    );
    assert.equal(regRes.directSpec, false);
    assert.equal("dinou" in regRes.pkg.dependencies, false);
  }
  console.log("   ✅ Section 1 passed!");

  // =========================================================================
  // 2️⃣ detectPackageManager & CLI Help / Flag Contract
  // =========================================================================
  console.log(
    "2️⃣ Verifying detectPackageManager precedence & dinou eject / uneject CLI flags..."
  );
  {
    const prevUa = process.env.npm_config_user_agent;
    try {
      const pmDir = path.join(tmpBase, "pm-detect");
      fs.mkdirSync(pmDir, { recursive: true });

      process.env.npm_config_user_agent = "pnpm/9.12.0 npm/? node/v22.0.0";
      assert.equal(detectPackageManager(pmDir), "pnpm");
      process.env.npm_config_user_agent = "yarn/1.22.22 npm/? node/v22.0.0";
      assert.equal(detectPackageManager(pmDir), "yarn");
      process.env.npm_config_user_agent = "bun/1.2.0";
      assert.equal(detectPackageManager(pmDir), "bun");
      process.env.npm_config_user_agent = "npm/10.9.0 node/v22.0.0";
      assert.equal(detectPackageManager(pmDir), "npm");

      delete process.env.npm_config_user_agent;
      assert.equal(detectPackageManager(pmDir), "npm");
      fs.writeFileSync(path.join(pmDir, "package-lock.json"), "{}");
      assert.equal(detectPackageManager(pmDir), "npm");
      fs.writeFileSync(path.join(pmDir, "bun.lockb"), "");
      assert.equal(detectPackageManager(pmDir), "bun");
      fs.writeFileSync(path.join(pmDir, "pnpm-lock.yaml"), "");
      assert.equal(detectPackageManager(pmDir), "pnpm");
      fs.writeFileSync(path.join(pmDir, "yarn.lock"), "");
      assert.equal(detectPackageManager(pmDir), "yarn");
    } finally {
      if (prevUa === undefined) delete process.env.npm_config_user_agent;
      else process.env.npm_config_user_agent = prevUa;
    }

    const ejectHelp = spawnSync(process.execPath, [CLI_PATH, "eject", "--help"], {
      cwd: projectRoot,
      encoding: "utf8",
    });
    assert.equal(ejectHelp.status, 0, ejectHelp.stderr);
    assert.ok(ejectHelp.stdout.includes("--force"));
    assert.ok(ejectHelp.stdout.includes("--skip-install"));

    const unejectHelp = spawnSync(
      process.execPath,
      [CLI_PATH, "uneject", "--help"],
      { cwd: projectRoot, encoding: "utf8" }
    );
    assert.equal(unejectHelp.status, 0, unejectHelp.stderr);
    assert.ok(unejectHelp.stdout.includes("--yes"));
    assert.ok(unejectHelp.stdout.includes("--skip-install"));
    assert.ok(unejectHelp.stdout.includes("--keep-dinou"));
  }
  console.log("   ✅ Section 2 passed!");

  // =========================================================================
  // 3️⃣ Full Eject -> Guards -> --force -> Prompt -> Rollback -> CLI Uneject Lifecycle
  // =========================================================================
  console.log(
    "3️⃣ Verifying full eject -> already-ejected guards -> --force -> interactive (y/N) cancel -> --keep-dinou -> transactional rollback -> CLI uneject lifecycle..."
  );
  {
    const lifeDir = path.join(tmpBase, "lifecycle-app");
    fs.mkdirSync(lifeDir, { recursive: true });
    const pkgPath = path.join(lifeDir, "package.json");
    fs.writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: "lifecycle-app",
          version: "1.0.0",
          type: "module",
          scripts: {
            dev: "dinou dev",
            build: "dinou build",
            start: "dinou start",
            eject: "dinou eject",
          },
          dependencies: { dinou: "^9.4.0" },
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const simPkgDir = path.join(tmpBase, "sim-dinou-pkg");
    fs.mkdirSync(simPkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(simPkgDir, "package.json"),
      JSON.stringify({ name: "dinou", version: "9.4.0", type: "module" }, null, 2),
      "utf8"
    );
    fs.writeFileSync(path.join(simPkgDir, "eject.js"), EJECT_WRAPPER_SOURCE, "utf8");
    fs.cpSync(SOURCE_DINOU_DIR, path.join(simPkgDir, "dinou"), {
      recursive: true,
    });

    const eject1 = spawnSync(
      process.execPath,
      [path.join(simPkgDir, "dinou", "cli.js"), "eject", "--skip-install"],
      { cwd: lifeDir, encoding: "utf8" }
    );
    assert.equal(eject1.status, 0, eject1.stderr);

    const ejectedDir = path.join(lifeDir, "dinou");
    const customMarker = path.join(ejectedDir, "CUSTOM_MOD.txt");
    fs.writeFileSync(customMarker, "KEEP_ME_SAFE", "utf8");

    // Guard A: running local `./dinou/cli.js eject` exits 0 and protects CUSTOM_MOD.txt
    const selfEject = spawnSync(
      process.execPath,
      [path.join(ejectedDir, "cli.js"), "eject"],
      { cwd: lifeDir, encoding: "utf8" }
    );
    assert.equal(selfEject.status, 0, selfEject.stderr);
    assert.match(selfEject.stdout, /already ejected in \.\/dinou/i);
    assert.equal(fs.readFileSync(customMarker, "utf8"), "KEEP_ME_SAFE");

    // Guard B: running external `<simPkg>/dinou/cli.js eject` without --force ALSO skips
    const extNoForce = spawnSync(
      process.execPath,
      [path.join(simPkgDir, "dinou", "cli.js"), "eject", "--skip-install"],
      { cwd: lifeDir, encoding: "utf8" }
    );
    assert.equal(extNoForce.status, 0, extNoForce.stderr);
    assert.match(extNoForce.stdout, /already exists/i);
    assert.equal(fs.readFileSync(customMarker, "utf8"), "KEEP_ME_SAFE");

    // --force from external package refreshes ./dinou
    const extForce = spawnSync(
      process.execPath,
      [
        path.join(simPkgDir, "dinou", "cli.js"),
        "eject",
        "--force",
        "--skip-install",
      ],
      { cwd: lifeDir, encoding: "utf8" }
    );
    assert.equal(extForce.status, 0, extForce.stderr);
    assert.equal(fs.existsSync(customMarker), false);
    fs.writeFileSync(customMarker, "KEEP_ME_SAFE_V2", "utf8");

    // Interactive prompt cancel ("n\n", "\n", EOF "")
    const pkgBeforeCancel = fs.readFileSync(pkgPath, "utf8");
    for (const input of ["n\n", "\n", ""]) {
      const cancelRun = spawnSync(
        process.execPath,
        [path.join(ejectedDir, "cli.js"), "uneject", "--skip-install"],
        { cwd: lifeDir, input, encoding: "utf8" }
      );
      assert.equal(cancelRun.status, 0, cancelRun.stderr);
      assert.match(cancelRun.stdout, /Uneject cancelled/i);
      assert.equal(fs.readFileSync(pkgPath, "utf8"), pkgBeforeCancel);
      assert.equal(fs.existsSync(ejectedDir), true);
    }

    // Transactional rollback on failed install
    await assert.rejects(
      () =>
        uneject({
          projectRoot: lifeDir,
          spec: "file:./missing-dinou-package-999.tgz",
          yes: true,
          skipInstall: false,
          throwOnError: true,
        }),
      /Package installation failed/
    );
    assert.equal(fs.readFileSync(pkgPath, "utf8"), pkgBeforeCancel);
    assert.equal(fs.existsSync(ejectedDir), true);
    assert.equal(fs.readFileSync(customMarker, "utf8"), "KEEP_ME_SAFE_V2");

    // --keep-dinou updates package.json while retaining ./dinou, then re-eject & full uneject deletes ./dinou
    const keepRun = spawnSync(
      process.execPath,
      [
        path.join(ejectedDir, "cli.js"),
        "uneject",
        "^9.4.0",
        "-y",
        "--skip-install",
        "--keep-dinou",
      ],
      { cwd: lifeDir, encoding: "utf8" }
    );
    assert.equal(keepRun.status, 0, keepRun.stderr);
    assert.equal(fs.existsSync(ejectedDir), true);
    assert.equal(
      JSON.parse(fs.readFileSync(pkgPath, "utf8")).dependencies.dinou,
      "^9.4.0"
    );

    // Restore ejected package.json and perform full self-deleting CLI uneject
    const rePkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    rewritePackageJsonForEject(rePkg);
    fs.writeFileSync(pkgPath, JSON.stringify(rePkg, null, 2) + "\n", "utf8");

    const fullUneject = spawnSync(
      process.execPath,
      [path.join(ejectedDir, "cli.js"), "uneject", "^9.4.0", "-y", "--skip-install"],
      { cwd: lifeDir, encoding: "utf8" }
    );
    assert.equal(fullUneject.status, 0, fullUneject.stderr);
    assert.equal(fs.existsSync(ejectedDir), false);
    const finalPkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    assert.deepEqual(finalPkg.scripts, {
      dev: "dinou dev",
      build: "dinou build",
      start: "dinou start",
      eject: "dinou eject",
    });
    assert.equal(finalPkg.dependencies.dinou, "^9.4.0");
  }
  console.log("   ✅ Section 3 passed!");

  // =========================================================================
  // 4️⃣ Tri-Bundler Live ./dinou Sovereignty Over Stale node_modules/dinou + "dinou/config"
  // =========================================================================
  console.log(
    "4️⃣ Verifying resolveEjectedDinouSpecifier & Tri-Bundler (esbuild, rollup, webpack) live ./dinou sovereignty over stale node_modules/dinou + \"dinou/config\"..."
  );
  {
    const nonEjectedDir = path.join(tmpBase, "non-ejected");
    fs.mkdirSync(nonEjectedDir, { recursive: true });
    assert.equal(resolveEjectedDinouSpecifier("dinou", nonEjectedDir), null);
    assert.equal(
      resolveEjectedDinouSpecifier("dinou/config", nonEjectedDir),
      null
    );

    const sovDir = path.join(tmpBase, "sovereignty-tri-bundler");
    fs.mkdirSync(path.join(sovDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(sovDir, "package.json"),
      JSON.stringify(
        { name: "sovereignty-tri-bundler", private: true, type: "module" },
        null,
        2
      ),
      "utf8"
    );

    fs.cpSync(SOURCE_DINOU_DIR, path.join(sovDir, "dinou"), { recursive: true });

    for (const [spec, expectedRel] of [
      ["dinou", "index.js"],
      ["dinou?v=1", "index.js"],
      ["dinou/server", "server.js"],
      ["dinou/config", "core/config.js"],
      ["dinou/adapters/node", "adapters/node.js"],
      ["dinou/adapters/bun", "adapters/bun.js"],
      ["dinou/adapters/deno", "adapters/deno.js"],
      ["dinou/adapters/cloudflare", "adapters/cloudflare.js"],
      ["dinou/adapters/netlify", "adapters/netlify.js"],
    ]) {
      assert.equal(
        resolveEjectedDinouSpecifier(spec, sovDir),
        path.join(sovDir, "dinou", expectedRel),
        `Expected ${spec} to resolve to local ejected ./dinou/${expectedRel}`
      );
    }
    assert.equal(resolveEjectedDinouSpecifier("react", sovDir), null);

    // Customize ./dinou/index.js with LIVE_EJECTED_SOVEREIGNTY
    const localIndex = path.join(sovDir, "dinou", "index.js");
    fs.writeFileSync(
      localIndex,
      fs.readFileSync(localIndex, "utf8") +
        '\nexport const EJECTED_BANNER = "LIVE_EJECTED_SOVEREIGNTY";\n',
      "utf8"
    );

    // Place a STALE snapshot in sovDir/node_modules/dinou (simulating pnpm/yarn static copy without core/config.js)
    const staleNmDinou = path.join(sovDir, "node_modules", "dinou");
    fs.mkdirSync(staleNmDinou, { recursive: true });
    fs.copyFileSync(
      path.join(SOURCE_DINOU_DIR, "package.json"),
      path.join(staleNmDinou, "package.json")
    );
    fs.writeFileSync(
      path.join(staleNmDinou, "index.js"),
      'export const EJECTED_BANNER = "STALE_NODE_MODULES_TRAP";\n',
      "utf8"
    );

    fs.writeFileSync(
      path.join(sovDir, "dinou.config.ts"),
      `import { defineConfig } from "dinou/config";
export default defineConfig({
  plugins: [
    {
      name: "ejected-tri-plugin",
      onRequest(_req, ctx) {
        ctx.res.setHeader("x-dinou-mode", "ejected-tri-ok");
      },
    },
  ],
});
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(sovDir, "src", "counter.tsx"),
      `"use client";
import { useState } from "react";
import { EJECTED_BANNER } from "dinou";
import { defineConfig } from "dinou/config";

const clientCfgProbe = defineConfig({ reactStrictMode: true });

export default function Counter() {
  const [n, setN] = useState(0);
  return (
    <button data-strict={String(Boolean(clientCfgProbe.reactStrictMode))} onClick={() => setN((x) => x + 1)}>
      {EJECTED_BANNER}:{n}
    </button>
  );
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(sovDir, "src", "page.tsx"),
      `import Counter from "./counter";
import { EJECTED_BANNER } from "dinou";
import { defineConfig } from "dinou/config";

const rscCfg = defineConfig({ reactStrictMode: true });

export default function Page() {
  return (
    <html>
      <head><title>Sovereignty</title></head>
      <body data-rsc-cfg={String(Boolean(rscCfg.reactStrictMode))}>
        <h1>{EJECTED_BANNER}</h1>
        <Counter />
      </body>
    </html>
  );
}
`,
      "utf8"
    );

    const nodePathEntries = [
      path.join(sovDir, "node_modules"),
      path.join(projectRoot, "node_modules"),
    ].filter((p) => fs.existsSync(p));

    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      const buildRes = spawnSync(
        process.execPath,
        [path.join(sovDir, "dinou", "cli.js"), `build:node:${bundler}`],
        {
          cwd: sovDir,
          encoding: "utf8",
          env: {
            ...process.env,
            NODE_OPTIONS: "",
            NODE_PATH: nodePathEntries.join(path.delimiter),
          },
        }
      );
      assert.equal(
        buildRes.status,
        0,
        `[${bundler}] Ejected build failed:\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
      );

      // Client bundle (.dinou/dist3/*.js) must embed LIVE_EJECTED_SOVEREIGNTY and NEVER STALE_NODE_MODULES_TRAP
      const dist3JsFiles = collectFilesRecursive(
        path.join(sovDir, ".dinou/dist3")
      ).filter((f) => f.endsWith(".js"));
      const combinedClientJs = dist3JsFiles
        .map((f) => fs.readFileSync(f, "utf8"))
        .join("\n");
      assert.equal(
        combinedClientJs.includes("LIVE_EJECTED_SOVEREIGNTY"),
        true,
        `[${bundler}] Client bundle did not pick up live ./dinou/index.js edit`
      );
      assert.equal(
        combinedClientJs.includes("STALE_NODE_MODULES_TRAP"),
        false,
        `[${bundler}] Client bundle mistakenly resolved stale node_modules/dinou snapshot`
      );

      // Runtime AOT server probe
      const probePath = path.join(sovDir, `probe-${bundler}.mjs`);
      fs.writeFileSync(
        probePath,
        `import assert from "node:assert/strict";
import { fetch as serverFetch } from "./.dinou/node/server.mjs";

const res = await serverFetch(new Request("http://127.0.0.1:3000/"));
assert.equal(res.status, 200);
assert.equal(res.headers.get("x-dinou-mode"), "ejected-tri-ok");
const html = await res.text();
assert.equal(html.includes("LIVE_EJECTED_SOVEREIGNTY"), true);
assert.equal(html.includes("STALE_NODE_MODULES_TRAP"), false);
console.log("SOVEREIGNTY_OK_${bundler}");
`,
        "utf8"
      );
      const probeRes = spawnSync(process.execPath, [probePath], {
        cwd: sovDir,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "" },
      });
      assert.equal(
        probeRes.status,
        0,
        `[${bundler}] Server probe failed:\n${probeRes.stdout}\n${probeRes.stderr}`
      );
      assert.ok(probeRes.stdout.includes(`SOVEREIGNTY_OK_${bundler}`));
    }
  }
  console.log("   ✅ Section 4 passed!");

  // =========================================================================
  // 5️⃣ Pre-Bundled Vendor Exclusion in Webpack, Rollup & Esbuild React Compiler
  // =========================================================================
  console.log(
    "5️⃣ Verifying /dinou/compiled/ exclusion in Webpack & Rollup and relFromRoot.startsWith(\"dinou/\") in Esbuild babelReactCompilerPlugin..."
  );
  {
    const wpSrc = fs.readFileSync(
      path.join(SOURCE_DINOU_DIR, "webpack/webpack.config.js"),
      "utf8"
    );
    const rollupSrc = fs.readFileSync(
      path.join(SOURCE_DINOU_DIR, "rollup/rollup.config.js"),
      "utf8"
    );
    const esbuildRcSrc = fs.readFileSync(
      path.join(
        SOURCE_DINOU_DIR,
        "esbuild/plugins-esbuild/babel-react-compiler-plugin.js"
      ),
      "utf8"
    );

    assert.match(
      wpSrc,
      /dinou\[\\\\\/\]compiled\[\\\\\/\]/,
      "Expected webpack.config.js to exclude /[\\\\/]dinou[\\\\/]compiled[\\\\/]/"
    );
    assert.ok(
      wpSrc.includes('"dinou/config": path.join(localDinouPath, "core/config.js")'),
      'Expected webpack.config.js to alias "dinou/config" -> core/config.js in ejected mode'
    );
    assert.match(
      rollupSrc,
      /dinou\[\\\\\/\]compiled\[\\\\\/\]/,
      "Expected rollup.config.js to exclude /[\\\\/]dinou[\\\\/]compiled[\\\\/]/"
    );
    assert.ok(
      esbuildRcSrc.includes('relFromRoot.startsWith("dinou/")'),
      'Expected babel-react-compiler-plugin.js to skip relFromRoot.startsWith("dinou/")'
    );
  }
  console.log("   ✅ Section 5 passed!");

  // =========================================================================
  // 6️⃣ Multi-Root Module Resolution in dinou/scripts/build-vendors.js
  // =========================================================================
  console.log(
    "6️⃣ Verifying Multi-Root module resolution & nodePaths in dinou/scripts/build-vendors.js..."
  );
  {
    const buildVendorsSrc = fs.readFileSync(
      path.join(SOURCE_DINOU_DIR, "scripts/build-vendors.js"),
      "utf8"
    );
    assert.ok(
      buildVendorsSrc.includes("CANDIDATE_ROOTS") &&
        buildVendorsSrc.includes("NODE_PATHS") &&
        buildVendorsSrc.includes("nodePaths: NODE_PATHS") &&
        buildVendorsSrc.includes("resolveVendorModule("),
      "Expected dinou/scripts/build-vendors.js to implement multi-root CANDIDATE_ROOTS, NODE_PATHS & resolveVendorModule"
    );
  }
  console.log("   ✅ Section 6 passed!");
} finally {
  removeDirSafe(tmpBase);
  try {
    if (
      fs.existsSync(fixturesParent) &&
      fs.readdirSync(fixturesParent).length === 0
    ) {
      fs.rmdirSync(fixturesParent);
    }
  } catch {}
}

for (const [rel, beforeContent] of manifestSnapshotBefore.entries()) {
  const abs = path.join(projectRoot, rel);
  const afterContent = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  assert.equal(
    afterContent,
    beforeContent,
    `verify-eject-ci.mjs must not mutate host workspace ${rel}`
  );
}

console.log(
  "\n🎉 All 6 Dinou v9.4.0 Eject & Uneject Sovereignty Lifecycle verification suites PASSED!"
);

