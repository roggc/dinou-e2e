import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveSourceDinouDir() {
  const candidates = [
    path.resolve(process.cwd(), "dinou"),
    path.resolve(__dirname, "../../dinou"),
    path.resolve(process.cwd(), "node_modules/dinou/dinou"),
    path.resolve(__dirname, "../../node_modules/dinou/dinou"),
  ];
  for (const dinouDir of candidates) {
    if (fs.existsSync(path.join(dinouDir, "cli.js"))) {
      return dinouDir;
    }
  }
  throw new Error(
    "Unable to locate Dinou source directory containing cli.js (checked ./dinou and node_modules/dinou/dinou)."
  );
}

const SOURCE_DINOU_DIR = resolveSourceDinouDir();

const {
  DINOU_CLI_COMMANDS,
  detectPackageManager,
  rewritePackageJsonForEject,
  rewritePackageJsonForUneject,
  runEject,
  uneject,
} = await import(
  pathToFileURL(path.join(SOURCE_DINOU_DIR, "core/uneject.js")).href
);
const { resolveEjectedDinouSpecifier } = await import(
  pathToFileURL(
    path.join(SOURCE_DINOU_DIR, "core/resolve-contextual-dinou.js")
  ).href
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

const createdTmpDirs = [];

function createTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdTmpDirs.push(dir);
  return dir;
}

test.after(() => {
  for (const dir of createdTmpDirs) {
    try {
      fs.rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      });
    } catch {}
  }
});

test("rewritePackageJsonForEject only rewrites existing Dinou scripts while preserving custom scripts and .dinou paths", () => {
  const original = {
    name: "starter-app",
    version: "1.0.0",
    type: "module",
    scripts: {
      dev: "dinou dev",
      build: "dinou build",
      start: "dinou start",
      eject: "dinou eject",
      preview: "PORT=4100 dinou start --unvendorized",
      lint: "eslint src",
      clean: "rm -rf .dinou dist",
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

  const ejected = rewritePackageJsonForEject(structuredClone(original));

  assert.deepEqual(Object.keys(ejected.scripts).sort(), [
    "build",
    "build:vendors",
    "clean",
    "dev",
    "lint",
    "preview",
    "start",
    "uneject",
  ]);
  assert.equal(ejected.scripts.dev, "node dinou/cli.js dev");
  assert.equal(ejected.scripts.build, "node dinou/cli.js build");
  assert.equal(ejected.scripts.start, "node dinou/cli.js start");
  assert.equal(
    ejected.scripts.preview,
    "PORT=4100 node dinou/cli.js start --unvendorized"
  );
  assert.equal(ejected.scripts.lint, "eslint src");
  assert.equal(ejected.scripts.clean, "rm -rf .dinou dist");
  assert.equal(
    ejected.scripts["build:vendors"],
    "node dinou/cli.js build:vendors"
  );
  assert.equal(ejected.scripts.uneject, "node dinou/cli.js uneject");
  assert.equal("eject" in ejected.scripts, false);
  assert.equal(ejected.dependencies.dinou, "file:./dinou");
  assert.equal("dinou" in ejected.devDependencies, false);
  assert.equal(ejected.devDependencies.eslint, "^9.0.0");

  const { pkg: restored } = rewritePackageJsonForUneject(
    structuredClone(ejected),
    { spec: "^9.4.0", skipInstall: true }
  );
  assert.deepEqual(restored.scripts, original.scripts);
  assert.equal(restored.dependencies.dinou, "^9.4.0");
});

test("rewritePackageJsonForEject rewrites all 148 CLI commands when all existed in package.json", () => {
  const scripts = {};
  for (const cmd of DINOU_CLI_COMMANDS) {
    scripts[cmd] = `dinou ${cmd}`;
  }
  scripts.eject = "dinou eject";

  const pkg = {
    name: "full-scripts-app",
    scripts: { ...scripts },
    dependencies: { dinou: "^9.4.0" },
  };

  const ejected = rewritePackageJsonForEject(structuredClone(pkg));
  assert.equal(
    Object.keys(ejected.scripts).length,
    DINOU_CLI_COMMANDS.length + 2
  );
  for (const cmd of DINOU_CLI_COMMANDS) {
    assert.equal(ejected.scripts[cmd], `node dinou/cli.js ${cmd}`);
  }
  assert.equal(
    ejected.scripts["build:vendors"],
    "node dinou/cli.js build:vendors"
  );
  assert.equal(ejected.scripts.uneject, "node dinou/cli.js uneject");

  const { pkg: restored } = rewritePackageJsonForUneject(
    structuredClone(ejected),
    { spec: "^9.4.0", skipInstall: true }
  );
  assert.deepEqual(restored.scripts, scripts);
});

test("detectPackageManager honors lockfiles when npm_config_user_agent is unset", () => {
  const prevUa = process.env.npm_config_user_agent;
  delete process.env.npm_config_user_agent;
  try {
    const pnpmDir = createTempDir("dinou-pm-pnpm-");
    fs.writeFileSync(
      path.join(pnpmDir, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n"
    );
    assert.equal(detectPackageManager(pnpmDir), "pnpm");

    const bunDir = createTempDir("dinou-pm-bun-");
    fs.writeFileSync(path.join(bunDir, "bun.lock"), "{}\n");
    assert.equal(detectPackageManager(bunDir), "bun");

    const yarnDir = createTempDir("dinou-pm-yarn-");
    fs.writeFileSync(path.join(yarnDir, "yarn.lock"), "# yarn lockfile v1\n");
    assert.equal(detectPackageManager(yarnDir), "yarn");
  } finally {
    if (prevUa !== undefined) {
      process.env.npm_config_user_agent = prevUa;
    }
  }
});

test("Full eject -> already-ejected guard -> interactive (y/N) prompt -> transactional rollback -> CLI uneject lifecycle", async () => {
  const projectDir = createTempDir("dinou-eject-lifecycle-");
  const pkgPath = path.join(projectDir, "package.json");

  fs.writeFileSync(
    pkgPath,
    JSON.stringify(
      {
        name: "lifecycle-test-app",
        version: "1.0.0",
        type: "module",
        scripts: {
          dev: "dinou dev",
          build: "dinou build",
          start: "dinou start",
          eject: "dinou eject",
        },
        dependencies: {
          dinou: "^9.4.0",
        },
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  const simPkgDir = createTempDir("dinou-sim-pkg-");
  fs.writeFileSync(
    path.join(simPkgDir, "package.json"),
    JSON.stringify({ name: "dinou", version: "9.4.0", type: "module" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(simPkgDir, "eject.js"), EJECT_WRAPPER_SOURCE, "utf8");
  fs.cpSync(SOURCE_DINOU_DIR, path.join(simPkgDir, "dinou"), { recursive: true });

  const firstEject = spawnSync(
    process.execPath,
    [path.join(simPkgDir, "dinou", "cli.js"), "eject", "--skip-install"],
    { cwd: projectDir, encoding: "utf8" }
  );
  assert.equal(firstEject.status, 0, firstEject.stderr);
  const ejectedDir = path.join(projectDir, "dinou");
  assert.equal(fs.existsSync(path.join(ejectedDir, "cli.js")), true);

  const customFile = path.join(ejectedDir, "CUSTOM_MOD.txt");
  fs.writeFileSync(customFile, "USER_OWNED_CODE", "utf8");

  const secondEject = spawnSync(
    process.execPath,
    [path.join(ejectedDir, "cli.js"), "eject"],
    { cwd: projectDir, encoding: "utf8" }
  );
  assert.equal(secondEject.status, 0, secondEject.stderr);
  assert.match(secondEject.stdout, /already ejected in \.\/dinou/i);
  assert.equal(fs.readFileSync(customFile, "utf8"), "USER_OWNED_CODE");

  // Also ensure direct programmatic runEject protects already-ejected dir without force
  const directGuard = runEject({
    projectRoot: projectDir,
    sourceDinouDir: SOURCE_DINOU_DIR,
    skipInstall: true,
  });
  assert.equal(directGuard.skipped, true);
  assert.equal(fs.readFileSync(customFile, "utf8"), "USER_OWNED_CODE");

  const pkgSnapshotBeforeFail = fs.readFileSync(pkgPath, "utf8");
  for (const input of ["n\n", "\n"]) {
    const cancelRes = spawnSync(
      process.execPath,
      [path.join(ejectedDir, "cli.js"), "uneject", "--skip-install"],
      { cwd: projectDir, input, encoding: "utf8" }
    );
    assert.equal(cancelRes.status, 0, cancelRes.stderr);
    assert.match(
      cancelRes.stdout,
      /Are you sure you want to uneject\? This will permanently delete your local \.\/dinou directory\. \(y\/N\):/
    );
    assert.match(cancelRes.stdout, /Uneject cancelled/i);
    assert.equal(fs.readFileSync(pkgPath, "utf8"), pkgSnapshotBeforeFail);
    assert.equal(fs.existsSync(ejectedDir), true);
  }

  await assert.rejects(
    async () => {
      await uneject({
        projectRoot: projectDir,
        spec: "file:./non-existent-dinou-999.tgz",
        yes: true,
        skipInstall: false,
        throwOnError: true,
      });
    },
    /Package installation failed/
  );
  assert.equal(fs.readFileSync(pkgPath, "utf8"), pkgSnapshotBeforeFail);
  assert.equal(fs.existsSync(ejectedDir), true);
  assert.equal(fs.readFileSync(customFile, "utf8"), "USER_OWNED_CODE");

  const unejectRes = spawnSync(
    process.execPath,
    [path.join(ejectedDir, "cli.js"), "uneject", "^9.4.0", "--skip-install"],
    { cwd: projectDir, input: "y\n", encoding: "utf8" }
  );
  assert.equal(unejectRes.status, 0, unejectRes.stderr);
  assert.equal(fs.existsSync(ejectedDir), false);

  const restoredPkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  assert.deepEqual(restoredPkg.scripts, {
    dev: "dinou dev",
    build: "dinou build",
    start: "dinou start",
    eject: "dinou eject",
  });
  assert.equal(restoredPkg.dependencies.dinou, "^9.4.0");
});

test("resolveEjectedDinouSpecifier maps all public Dinou subpaths when ./dinou/index.js exists", () => {
  const projectDir = createTempDir("dinou-specifier-");
  assert.equal(resolveEjectedDinouSpecifier("dinou", projectDir), null);

  const localDinou = path.join(projectDir, "dinou");
  fs.cpSync(SOURCE_DINOU_DIR, localDinou, { recursive: true });

  assert.equal(
    resolveEjectedDinouSpecifier("dinou", projectDir),
    path.join(localDinou, "index.js")
  );
  assert.equal(
    resolveEjectedDinouSpecifier("dinou/server", projectDir),
    path.join(localDinou, "server.js")
  );
  assert.equal(
    resolveEjectedDinouSpecifier("dinou/config", projectDir),
    path.join(localDinou, "core", "config.js")
  );
  assert.equal(
    resolveEjectedDinouSpecifier("dinou/adapters/netlify", projectDir),
    path.join(localDinou, "adapters", "netlify.js")
  );
  assert.equal(
    resolveEjectedDinouSpecifier("dinou/adapters/cloudflare", projectDir),
    path.join(localDinou, "adapters", "cloudflare.js")
  );
  assert.equal(resolveEjectedDinouSpecifier("react", projectDir), null);
});

