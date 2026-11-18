# Upstream Handoff Specification: `dinou eject` & `dinou uneject` Sovereignty Lifecycle (`v9.4.0`)

## 1. Executive Summary

During the deep architectural audit of `/docs/eject` (`src/docs/eject/page.tsx`), we identified and resolved six structural improvements across Dinou's Eject / Uneject lifecycle, tri-bundler module resolution, and vendor compilation pipeline:

1. **Selective `package.json` Script Rewriting on Eject (`<pkgRoot>/eject.js` + `dinou/core/uneject.js`)**:
   - Previously, `eject.js` overwrote/injected all ~150 Dinou CLI script entries into `package.json` even when the user's `package.json` only defined `dev`, `build`, `start`, and `eject`.
   - `rewritePackageJsonForEject(pkg)` now compares `DINOU_CLI_COMMANDS` against the scripts that **already exist** in the user's `package.json` (if only `dev`/`build`/`start` existed, only those are rewritten; if all 148 existed, all 148 are rewritten), also rewrites custom scripts invoking standalone `dinou` without ever corrupting `.dinou` paths or unrelated scripts (`lint`, `test`, `clean`), removes `"eject"`, adds `"build:vendors": "node dinou/cli.js build:vendors"` and `"uneject": "node dinou/cli.js uneject"`, removes any duplicate `devDependencies.dinou`, and sets `dependencies.dinou = "file:./dinou"`.
2. **Keeping `<pkgRoot>/eject.js` at Package Root + Friendly Already-Ejected Guard in `dinou/cli.js`**:
   - `<pkgRoot>/eject.js` intentionally remains at the upstream package root (outside `./dinou/`), while sharing pure helpers from `./dinou/core/uneject.js`. Keeping `eject.js` outside `./dinou/` prevents self-copy hazards (`ERR_FS_CP_EINVAL`) and `node_modules/dinou` junction replacement conflicts during `<pm> install`, and naturally prevents accidental overwrites of an already-ejected `./dinou/`.
   - `dinou/cli.js` now guards `dinou eject` with an explicit path/existence check (supporting `-f, --force` and `--skip-install` when run from `node_modules/dinou`) plus a `try/catch` around `await import("../eject.js")`, exiting cleanly (`0`) with a clear informational message instead of crashing with an unhandled `ERR_MODULE_NOT_FOUND` stack trace.
3. **New Transactional `dinou uneject [version]` Command & `"uneject"` Script (`dinou/core/uneject.js` + `dinou/cli.js`)**:
   - Reverts an ejected project back to `node_modules/dinou` in a single command (`npm run uneject`, `node dinou/cli.js uneject 9.4.0`, or `node dinou/cli.js uneject file:../dinou.tgz`).
   - Prompts interactively before making any destructive change (`⚠️  Are you sure you want to uneject? This will permanently delete your local ./dinou directory. (y/N): `, defaulting safely to `N`; pass `-y` / `--yes` in CI or scripts to skip the prompt).
   - Restores `node dinou/cli.js <cmd>` scripts back to `dinou <cmd>`, removes `uneject` and `build:vendors`, restores `"eject": "dinou eject"`, installs `dinou` via the detected package manager (`npm`, `pnpm`, `yarn`, or `bun`) without Node.js v24 `DEP0190` shell-argument deprecation warnings, **automatically rolls back `package.json` and preserves `./dinou` if package installation fails**, and deletes `./dinou` cleanly on success (including on Windows when invoked via `node dinou/cli.js uneject`).
4. **Live `./dinou` Resolution Across `pnpm` / `yarn` / `npm` / `bun` + Webpack `"dinou/config"` Alias Fix**:
   - Under `pnpm` and `yarn` Classic, `"dinou": "file:./dinou"` copies a static snapshot into `node_modules/dinou` rather than creating a directory symlink, so client edits inside `./dinou/` did not take effect in Esbuild or Rollup without reinstalling. Meanwhile, Webpack's prefix alias `{ dinou: localDinouPath }` broke `import { defineConfig } from "dinou/config"` because `./config` maps to `./core/config.js`, not `./config.js`.
   - `resolveEjectedDinouSpecifier(specifier, projectRoot)` in `dinou/core/resolve-contextual-dinou.js` (wired into `esbuildContextualDinouPlugin`, `rollupContextualDinouPlugin`, and `webpackContextualDinouPlugin`) and explicit `"dinou/config"` / `"dinou/server"` aliases in `dinou/webpack/webpack.config.js` now resolve all public `"dinou*"` imports directly to `<projectRoot>/dinou/...` across all three bundlers.
5. **Pre-Bundled Vendor Exclusion in Webpack, Rollup & Esbuild React Compiler Bridge**:
   - Excluded `/[\\/]dinou[\\/]compiled[\\/]/` from Babel/SWC transforms in `dinou/webpack/webpack.config.js` and `dinou/rollup/rollup.config.js`, and added `relFromRoot.startsWith("dinou/")` in `dinou/esbuild/plugins-esbuild/babel-react-compiler-plugin.js` so ejected framework internals are never double-compiled.
6. **Multi-Root Module Resolution in `dinou/scripts/build-vendors.js`**:
   - Resolves vendor entrypoints and `postProcess` runtime assets (`css-loader`, `mini-css-extract-plugin`) across `[PROJECT_ROOT, DINOU_ROOT, node_modules/dinou]` and passes `nodePaths` to `esbuild.build`, allowing ejected users to upgrade toolchain packages in their root `package.json` and run `npm run build:vendors` cleanly under isolated `pnpm` as well as `npm`, `yarn`, and `bun`.

---

## 2. File-by-File Upstream Changes

### 2.1 `<pkgRoot>/eject.js` (Thin Wrapper at Upstream `dinou` Repo Root — Not Needed in `dinou-e2e`)

> **Workflow Note (`dinou-docs` -> `dinou-e2e` -> `dinou`):**
> All `eject` and `uneject` logic (`runEject`, `uneject`, `rewritePackageJsonForEject`, `rewritePackageJsonForUneject`, `promptConfirmation`) lives inside `dinou/core/uneject.js` so it travels automatically whenever `./dinou/` is copied to `dinou-e2e` and later to `dinou`. `dinou-e2e` does **not** need a root `eject.js` file — only apply this 13-line `<pkgRoot>/eject.js` wrapper in the final upstream `dinou` repository root.

```js
import path from "node:path";
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
```

---

### 2.2 `dinou/core/uneject.js` (New File)

```js
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

export const DINOU_CLI_COMMANDS = [
  "dev",
  "build",
  "start",
  "dev:esbuild",
  "dev:rollup",
  "dev:webpack",
  "build:node",
  "build:node:esbuild",
  "build:node:rollup",
  "build:node:webpack",
  "build:node:compile",
  "build:node:compile:esbuild",
  "build:node:compile:rollup",
  "build:node:compile:webpack",
  "build:node:compile:linux",
  "build:node:compile:linux:esbuild",
  "build:node:compile:linux:rollup",
  "build:node:compile:linux:webpack",
  "build:node:compile:linux_arm",
  "build:node:compile:linux_arm:esbuild",
  "build:node:compile:linux_arm:rollup",
  "build:node:compile:linux_arm:webpack",
  "build:node:compile:mac",
  "build:node:compile:mac:esbuild",
  "build:node:compile:mac:rollup",
  "build:node:compile:mac:webpack",
  "build:node:compile:win",
  "build:node:compile:win:esbuild",
  "build:node:compile:win:rollup",
  "build:node:compile:win:webpack",
  "build:node:pure",
  "build:node:pure:esbuild",
  "build:node:pure:rollup",
  "build:node:pure:webpack",
  "build:node:pure:compile",
  "build:node:pure:compile:esbuild",
  "build:node:pure:compile:rollup",
  "build:node:pure:compile:webpack",
  "build:node:pure:compile:linux",
  "build:node:pure:compile:linux:esbuild",
  "build:node:pure:compile:linux:rollup",
  "build:node:pure:compile:linux:webpack",
  "build:node:pure:compile:linux_arm",
  "build:node:pure:compile:linux_arm:esbuild",
  "build:node:pure:compile:linux_arm:rollup",
  "build:node:pure:compile:linux_arm:webpack",
  "build:node:pure:compile:mac",
  "build:node:pure:compile:mac:esbuild",
  "build:node:pure:compile:mac:rollup",
  "build:node:pure:compile:mac:webpack",
  "build:node:pure:compile:win",
  "build:node:pure:compile:win:esbuild",
  "build:node:pure:compile:win:rollup",
  "build:node:pure:compile:win:webpack",
  "start:node",
  "start:node:esbuild",
  "start:node:rollup",
  "start:node:webpack",
  "build:netlify",
  "build:netlify:esbuild",
  "build:netlify:rollup",
  "build:netlify:webpack",
  "build:cloudflare",
  "build:cloudflare:esbuild",
  "build:cloudflare:rollup",
  "build:cloudflare:webpack",
  "build:deno",
  "build:deno:esbuild",
  "build:deno:rollup",
  "build:deno:webpack",
  "build:deno:compile",
  "build:deno:compile:esbuild",
  "build:deno:compile:rollup",
  "build:deno:compile:webpack",
  "build:deno:compile:linux",
  "build:deno:compile:linux:esbuild",
  "build:deno:compile:linux:rollup",
  "build:deno:compile:linux:webpack",
  "build:deno:compile:linux_arm",
  "build:deno:compile:linux_arm:esbuild",
  "build:deno:compile:linux_arm:rollup",
  "build:deno:compile:linux_arm:webpack",
  "build:deno:compile:mac",
  "build:deno:compile:mac:esbuild",
  "build:deno:compile:mac:rollup",
  "build:deno:compile:mac:webpack",
  "build:deno:compile:win",
  "build:deno:compile:win:esbuild",
  "build:deno:compile:win:rollup",
  "build:deno:compile:win:webpack",
  "start:deno",
  "build:bun",
  "build:bun:esbuild",
  "build:bun:rollup",
  "build:bun:webpack",
  "build:bun:compile",
  "build:bun:compile:esbuild",
  "build:bun:compile:rollup",
  "build:bun:compile:webpack",
  "build:bun:compile:linux",
  "build:bun:compile:linux:esbuild",
  "build:bun:compile:linux:rollup",
  "build:bun:compile:linux:webpack",
  "build:bun:compile:linux_arm",
  "build:bun:compile:linux_arm:esbuild",
  "build:bun:compile:linux_arm:rollup",
  "build:bun:compile:linux_arm:webpack",
  "build:bun:compile:mac",
  "build:bun:compile:mac:esbuild",
  "build:bun:compile:mac:rollup",
  "build:bun:compile:mac:webpack",
  "build:bun:compile:win",
  "build:bun:compile:win:esbuild",
  "build:bun:compile:win:rollup",
  "build:bun:compile:win:webpack",
  "build:bun:pure",
  "build:bun:pure:esbuild",
  "build:bun:pure:rollup",
  "build:bun:pure:webpack",
  "build:bun:pure:compile",
  "build:bun:pure:compile:esbuild",
  "build:bun:pure:compile:rollup",
  "build:bun:pure:compile:webpack",
  "build:bun:pure:compile:linux",
  "build:bun:pure:compile:linux:esbuild",
  "build:bun:pure:compile:linux:rollup",
  "build:bun:pure:compile:linux:webpack",
  "build:bun:pure:compile:linux_arm",
  "build:bun:pure:compile:linux_arm:esbuild",
  "build:bun:pure:compile:linux_arm:rollup",
  "build:bun:pure:compile:linux_arm:webpack",
  "build:bun:pure:compile:mac",
  "build:bun:pure:compile:mac:esbuild",
  "build:bun:pure:compile:mac:rollup",
  "build:bun:pure:compile:mac:webpack",
  "build:bun:pure:compile:win",
  "build:bun:pure:compile:win:esbuild",
  "build:bun:pure:compile:win:rollup",
  "build:bun:pure:compile:win:webpack",
  "start:bun",
  "start:bun:esbuild",
  "start:bun:rollup",
  "start:bun:webpack",
  "export-static",
  "export-static:esbuild",
  "export-static:rollup",
  "export-static:webpack",
  "typegen",
];

const DINOU_CLI_COMMANDS_SET = new Set(DINOU_CLI_COMMANDS);
const STANDALONE_DINOU_BIN_RE = /(?<![./\\@-])\b(?:npx\s+)?dinou\b(?![/\\.-])/g;
const EJECTED_DINOU_CLI_RE = /\bnode\s+(?:\.[\\/])?dinou[\\/]cli\.js\b/g;

export function detectPackageManager(projectRoot = process.cwd()) {
  const userAgent = process.env.npm_config_user_agent;
  if (userAgent) {
    if (userAgent.startsWith("yarn")) return "yarn";
    if (userAgent.startsWith("pnpm")) return "pnpm";
    if (userAgent.startsWith("bun")) return "bun";
    if (userAgent.startsWith("npm")) return "npm";
  }

  if (fs.existsSync(path.join(projectRoot, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (
    fs.existsSync(path.join(projectRoot, "bun.lockb")) ||
    fs.existsSync(path.join(projectRoot, "bun.lock"))
  ) {
    return "bun";
  }
  if (fs.existsSync(path.join(projectRoot, "package-lock.json"))) return "npm";

  return "npm";
}

function quoteShellArg(arg) {
  const str = String(arg);
  if (!/[\s"&|<>^()]/.test(str)) return str;
  return `"${str.replace(/"/g, '\\"')}"`;
}

export function runPackageManager(pm, args, cwd) {
  let result = spawnSync(pm, args, {
    stdio: "inherit",
    cwd,
    env: process.env,
  });

  if (
    result.error &&
    process.platform === "win32" &&
    (result.error.code === "ENOENT" || result.error.code === "EINVAL")
  ) {
    const cmdLine = [pm, ...args.map(quoteShellArg)].join(" ");
    result = spawnSync(cmdLine, {
      stdio: "inherit",
      cwd,
      env: process.env,
      shell: true,
    });
  }

  return result;
}

function isProtocolOrTarballSpec(spec) {
  if (!spec || typeof spec !== "string") return false;
  return (
    spec.startsWith("file:") ||
    spec.startsWith("link:") ||
    spec.startsWith("workspace:") ||
    spec.startsWith("http:") ||
    spec.startsWith("https:") ||
    spec.startsWith("git+") ||
    spec.startsWith("github:") ||
    spec.endsWith(".tgz")
  );
}

/**
 * Rewrites `package.json` in place for Ejected Mode:
 * - Only rewrites Dinou scripts that already existed in `pkg.scripts`
 *   (comparing against `DINOU_CLI_COMMANDS` as well as custom scripts invoking `dinou`),
 *   preserving all non-Dinou scripts (`lint`, `test`, `clean`, etc.) untouched.
 * - Removes `"eject"` and adds `"build:vendors"` + `"uneject"`.
 * - Removes `devDependencies.dinou` if present and sets `dependencies.dinou = "file:./dinou"`.
 */
export function rewritePackageJsonForEject(pkg) {
  pkg.scripts = pkg.scripts || {};
  delete pkg.scripts.eject;

  for (const [name, value] of Object.entries(pkg.scripts)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();

    if (DINOU_CLI_COMMANDS_SET.has(name)) {
      if (
        trimmed === `dinou ${name}` ||
        trimmed === `npx dinou ${name}` ||
        trimmed === `node dinou/cli.js ${name}` ||
        trimmed === `node ./dinou/cli.js ${name}` ||
        (name === "dev" && (trimmed === "dinou" || trimmed === "npx dinou"))
      ) {
        pkg.scripts[name] = `node dinou/cli.js ${name}`;
      } else if (STANDALONE_DINOU_BIN_RE.test(value)) {
        STANDALONE_DINOU_BIN_RE.lastIndex = 0;
        pkg.scripts[name] = value.replace(
          STANDALONE_DINOU_BIN_RE,
          "node dinou/cli.js"
        );
      }
      STANDALONE_DINOU_BIN_RE.lastIndex = 0;
      continue;
    }

    if (STANDALONE_DINOU_BIN_RE.test(value)) {
      STANDALONE_DINOU_BIN_RE.lastIndex = 0;
      pkg.scripts[name] = value.replace(
        STANDALONE_DINOU_BIN_RE,
        "node dinou/cli.js"
      );
    }
    STANDALONE_DINOU_BIN_RE.lastIndex = 0;
  }

  pkg.scripts["build:vendors"] = "node dinou/cli.js build:vendors";
  pkg.scripts.uneject = "node dinou/cli.js uneject";

  pkg.dependencies = pkg.dependencies || {};
  if (pkg.devDependencies && "dinou" in pkg.devDependencies) {
    delete pkg.devDependencies.dinou;
    if (Object.keys(pkg.devDependencies).length === 0) {
      delete pkg.devDependencies;
    }
  }
  pkg.dependencies.dinou = "file:./dinou";

  return pkg;
}

/**
 * Core implementation of `dinou eject`, parameterized by `sourceDinouDir` so:
 * 1. Upstream `<pkgRoot>/eject.js` is a thin wrapper passing `path.resolve(__dirname, "dinou")`.
 * 2. Ejected test workspaces (such as `dinou-e2e`, which contain `./dinou` without a root `eject.js`)
 *    can test 100% of the eject implementation directly from `./dinou/core/uneject.js`.
 */
export function runEject(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const sourceDinouDir = path.resolve(
    options.sourceDinouDir ||
      path.resolve(projectRoot, "node_modules", "dinou", "dinou")
  );
  const targetDinouDir = path.resolve(projectRoot, "dinou");
  const pkgPath = path.resolve(projectRoot, "package.json");
  const force = Boolean(options.force);
  const skipInstall =
    Boolean(options.skipInstall) || process.env.DINOU_SKIP_INSTALL === "true";

  if (!fs.existsSync(sourceDinouDir)) {
    throw new Error(
      `[Dinou Eject] Source framework directory not found at ${sourceDinouDir}`
    );
  }

  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      `[Dinou Eject] package.json not found in project root (${projectRoot})`
    );
  }

  const normSource = sourceDinouDir.replace(/\\/g, "/").toLowerCase();
  const normTarget = targetDinouDir.replace(/\\/g, "/").toLowerCase();
  if (normSource === normTarget) {
    console.log(
      "ℹ️  [Dinou Eject] Project is already running from ./dinou. Skipping to protect local customizations."
    );
    return { skipped: true };
  }

  if (fs.existsSync(targetDinouDir) && !force) {
    console.log(
      'ℹ️  [Dinou Eject] Directory ./dinou already exists. Skipping to prevent overwriting local customizations (pass --force to overwrite, or run "npm run uneject" first).'
    );
    return { skipped: true };
  }

  console.log("🚀 Starting Dinou eject process...");

  if (fs.existsSync(targetDinouDir) && force) {
    fs.rmSync(targetDinouDir, { recursive: true, force: true });
  }

  fs.cpSync(sourceDinouDir, targetDinouDir, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== "node_modules" && base !== ".DS_Store";
    },
  });

  const cliDest = path.join(targetDinouDir, "cli.js");
  if (fs.existsSync(cliDest)) {
    try {
      fs.chmodSync(cliDest, 0o755);
    } catch {}
  }
  console.log("📁 Copied Dinou framework source into ./dinou");

  const originalPkgContent = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(originalPkgContent);
  rewritePackageJsonForEject(pkg);

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(
    '✅ Updated package.json scripts (preserved custom scripts + added "build:vendors" and "uneject")'
  );

  if (!skipInstall) {
    const pm = detectPackageManager(projectRoot);
    console.log(`📦 Package manager detected: ${pm}`);
    console.log(`🔄 Executing '${pm} install' to link ./dinou dependencies...`);

    const res = runPackageManager(pm, ["install"], projectRoot);
    if (res.error || res.status !== 0) {
      const msg = res.error
        ? res.error.message
        : `exited with code ${res.status ?? 1}`;
      console.warn(
        `⚠️  [Dinou Eject] '${pm} install' did not complete cleanly (${msg}). Run '${pm} install' manually to finish linking ./dinou.`
      );
      return { skipped: false, installFailed: true };
    }
  }

  console.log(
    '🎉 Eject completed successfully! Edit ./dinou freely, or run "npm run uneject" anytime to revert.'
  );
  return { skipped: false, installFailed: false };
}

/**
 * Rewrites `package.json` in place for Uneject Mode (reverting back to `node_modules/dinou`).
 */
export function rewritePackageJsonForUneject(pkg, options = {}) {
  const rawSpec =
    typeof options.spec === "string" && options.spec.trim()
      ? options.spec.trim()
      : "latest";
  const skipInstall = Boolean(options.skipInstall);

  pkg.scripts = pkg.scripts || {};

  delete pkg.scripts.uneject;
  if (
    !options.hadBuildVendors &&
    (pkg.scripts["build:vendors"] === "node dinou/cli.js build:vendors" ||
      pkg.scripts["build:vendors"] === "node ./dinou/cli.js build:vendors" ||
      pkg.scripts["build:vendors"] === "dinou build:vendors")
  ) {
    delete pkg.scripts["build:vendors"];
  }

  for (const [key, val] of Object.entries(pkg.scripts)) {
    if (typeof val === "string") {
      pkg.scripts[key] = val.replace(EJECTED_DINOU_CLI_RE, "dinou");
    }
  }

  pkg.scripts.eject = "dinou eject";

  pkg.dependencies = pkg.dependencies || {};
  if (pkg.devDependencies && "dinou" in pkg.devDependencies) {
    delete pkg.devDependencies.dinou;
    if (Object.keys(pkg.devDependencies).length === 0) {
      delete pkg.devDependencies;
    }
  }

  const directSpec = isProtocolOrTarballSpec(rawSpec);
  const normalizedSpec =
    directSpec && rawSpec.endsWith(".tgz") && !rawSpec.includes(":")
      ? `file:${rawSpec}`
      : rawSpec;

  if (directSpec || skipInstall) {
    pkg.dependencies.dinou = normalizedSpec;
  } else {
    delete pkg.dependencies.dinou;
  }

  return { pkg, directSpec, normalizedSpec };
}

/**
 * Prompts the user on stdin/stdout to confirm a destructive action (`(y/N)`).
 * Defaults to `false` on Enter, `"n"`, EOF, or `Ctrl+C` / `Ctrl+D`.
 */
export function promptConfirmation(question) {
  return new Promise((resolve) => {
    if (process.stdin.destroyed || process.stdin.readableEnded) {
      process.stdout.write(question + "\n");
      return resolve(false);
    }

    let answered = false;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      const normalized = String(answer || "").trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });

    rl.on("close", () => {
      if (!answered) {
        process.stdout.write("\n");
        resolve(false);
      }
    });
  });
}

/**
 * Reverts an ejected Dinou project back to using the `dinou` package from `node_modules`.
 *
 * @param {object} [options]
 * @param {string} [options.spec="latest"] Version tag, semver range, or `file:...` tarball path.
 * @param {boolean} [options.yes=false] Skip interactive `(y/N)` confirmation prompt.
 * @param {boolean} [options.skipInstall=false] Update `package.json` & remove `./dinou` without running package manager install.
 * @param {boolean} [options.keepDinouDir=false] Keep `./dinou` directory on disk instead of deleting it.
 * @param {string} [options.projectRoot=process.cwd()] Target project root directory.
 * @param {boolean} [options.hadBuildVendors=false] Preserve `build:vendors` if explicitly requested.
 * @param {boolean} [options.throwOnError=false] Throw an Error instead of calling `process.exit(1)` on install failure.
 */
export async function uneject(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const skipConfirm =
    Boolean(options.yes) || process.env.DINOU_YES === "true";
  const skipInstall =
    Boolean(options.skipInstall) || process.env.DINOU_SKIP_INSTALL === "true";
  const keepDinouDir = Boolean(options.keepDinouDir);

  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`[Dinou Uneject] package.json not found in ${projectRoot}`);
  }

  const localDinouDir = path.join(projectRoot, "dinou");

  if (!skipConfirm) {
    const promptMsg =
      !keepDinouDir && fs.existsSync(localDinouDir)
        ? "⚠️  Are you sure you want to uneject? This will permanently delete your local ./dinou directory. (y/N): "
        : "⚠️  Are you sure you want to uneject and restore package.json scripts? (y/N): ";
    const confirmed = await promptConfirmation(promptMsg);
    if (!confirmed) {
      console.log(
        "🚫 Uneject cancelled. Your local ./dinou directory was not modified."
      );
      return { cancelled: true };
    }
  }

  const originalPkgContent = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(originalPkgContent);

  console.log("🔄 Starting Dinou uneject process...");

  const { directSpec, normalizedSpec } = rewritePackageJsonForUneject(pkg, {
    ...options,
    skipInstall,
  });

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("✅ Restored package.json scripts to standard Dinou CLI commands");

  if (!skipInstall) {
    const pm = detectPackageManager(projectRoot);
    console.log(`📦 Package manager detected: ${pm}`);

    const pmArgs = directSpec
      ? ["install"]
      : pm === "npm"
        ? ["install", `dinou@${normalizedSpec}`]
        : ["add", `dinou@${normalizedSpec}`];

    console.log(`🔄 Executing '${pm} ${pmArgs.join(" ")}'...`);
    const res = runPackageManager(pm, pmArgs, projectRoot);

    if (res.error || res.status !== 0) {
      fs.writeFileSync(pkgPath, originalPkgContent, "utf8");
      const msg = res.error
        ? res.error.message
        : `exited with code ${res.status ?? 1}`;
      console.error(
        `❌ [Dinou Uneject] Package installation failed (${msg}). Rolled back package.json and kept ./dinou intact.`
      );
      if (options.throwOnError) {
        throw new Error(`[Dinou Uneject] Package installation failed: ${msg}`);
      }
      process.exit(1);
    }
    console.log("✅ Installed dinou package in node_modules");
  }

  if (!keepDinouDir && fs.existsSync(localDinouDir)) {
    fs.rmSync(localDinouDir, { recursive: true, force: true });
    console.log("🗑️  Removed local ./dinou directory");
  }

  console.log(
    "🎉 Uneject completed successfully! Dinou is now running from node_modules/dinou."
  );
  return { cancelled: false };
}

export default uneject;
```

---

### 2.3 `dinou/cli.js`

1. Normalize line endings of `dinou/cli.js` to pure LF (`\n`) so `#!/usr/bin/env node` on line 1 never mixes with CRLF, and import `fs` from `"node:fs"`:

```diff
 import { program } from "#commander";
 import { spawnSync } from "node:child_process";
+import fs from "node:fs";
 import { createRequire } from "node:module";
```

2. Replace the `eject` command block at the bottom of `dinou/cli.js` with hardened `eject` + `uneject [version]`:

```diff
-// --- EJECT ---
-
-program
-  .command("eject")
-  .description("Copy the framework to the root of the project")
-  .action(async () => {
-    console.log("Executing eject...");
-    const { eject } = await import("../eject.js");
-    eject();
-  });
+// --- EJECT / UNEJECT ---
+
+program
+  .command("eject")
+  .description("Copy the framework into ./dinou at the root of the project")
+  .option(
+    "-f, --force",
+    "Overwrite an existing ./dinou directory when running from node_modules"
+  )
+  .option(
+    "--skip-install",
+    "Skip running package manager install after updating package.json"
+  )
+  .action(async (opts) => {
+    const localDinouDir = path.resolve(projectRoot, "dinou");
+    const normCurrent = path
+      .resolve(dinouPath)
+      .replace(/\\/g, "/")
+      .toLowerCase();
+    const normTarget = localDinouDir.replace(/\\/g, "/").toLowerCase();
+
+    if (normCurrent === normTarget) {
+      console.log(
+        'ℹ️  [Dinou Eject] This project is already ejected in ./dinou. Skipping to prevent overwriting your local framework customizations. (Run "npm run uneject" to revert to node_modules/dinou.)'
+      );
+      return;
+    }
+
+    if (fs.existsSync(localDinouDir) && !opts.force) {
+      console.log(
+        'ℹ️  [Dinou Eject] Directory ./dinou already exists. Skipping to prevent overwriting local changes (pass --force from node_modules/dinou to overwrite, or run "npm run uneject" first).'
+      );
+      return;
+    }
+
+    let ejectMod;
+    try {
+      ejectMod = await import("../eject.js");
+    } catch (err) {
+      if (
+        err &&
+        (err.code === "ERR_MODULE_NOT_FOUND" ||
+          err.code === "MODULE_NOT_FOUND")
+      ) {
+        console.log(
+          'ℹ️  [Dinou Eject] This project is already running in Ejected Mode (./dinou). Skipping eject to protect local changes. (Run "npm run uneject" to revert to node_modules/dinou.)'
+        );
+        return;
+      }
+      throw err;
+    }
+
+    console.log("Executing eject...");
+    ejectMod.eject({
+      force: Boolean(opts.force),
+      skipInstall: Boolean(opts.skipInstall),
+      projectRoot,
+    });
+  });
+
+program
+  .command("uneject [version]")
+  .description(
+    "Revert an ejected ./dinou directory back to the node_modules dinou package"
+  )
+  .option("-y, --yes", "Skip interactive confirmation prompt")
+  .option(
+    "--skip-install",
+    "Update package.json and remove ./dinou without running package manager install"
+  )
+  .option(
+    "--keep-dinou",
+    "Keep the local ./dinou directory on disk instead of deleting it"
+  )
+  .action(async (version, opts) => {
+    const { uneject } = await import("./core/uneject.js");
+    await uneject({
+      spec: version || "latest",
+      yes: Boolean(opts.yes),
+      skipInstall: Boolean(opts.skipInstall),
+      keepDinouDir: Boolean(opts.keepDinou),
+      projectRoot,
+    });
+  });
```

---

### 2.4 `dinou/core/resolve-contextual-dinou.js`

Add `resolveEjectedDinouSpecifier` and wire it into `esbuildContextualDinouPlugin`, `rollupContextualDinouPlugin`, and `webpackContextualDinouPlugin`:

```diff
 const CONTEXTUAL_DINOU_FILTER = /^\.\.?[\\/](?:.*[\\/])?dinou(?:\.js)?(?:[?#].*)?$/;
 const UNDERSCORE_SEGMENT_HINT_RE = /(?:^|[\\/])_[^\\/]+(?:[\\/]|$)/;
 const ESBUILD_FORBIDDEN_IMPORT_FILTER = /^[^.\/\\]|(?:^|[\\/])_[^\\/]+(?:[\\/]|$)/;
+
+const EJECTED_DINOU_SUBPATHS = {
+  dinou: "index.js",
+  "dinou/server": "server.js",
+  "dinou/config": "core/config.js",
+  "dinou/adapters/node": "adapters/node.js",
+  "dinou/adapters/bun": "adapters/bun.js",
+  "dinou/adapters/deno": "adapters/deno.js",
+  "dinou/adapters/cloudflare": "adapters/cloudflare.js",
+  "dinou/adapters/netlify": "adapters/netlify.js",
+};
+
+export function resolveEjectedDinouSpecifier(
+  specifier,
+  projectRoot = process.cwd()
+) {
+  if (!specifier || typeof specifier !== "string") return null;
+  const cleanSpec = specifier.split("?")[0].split("#")[0];
+  const relTarget = EJECTED_DINOU_SUBPATHS[cleanSpec];
+  if (!relTarget) return null;
+
+  const ejectedRoot = path.resolve(projectRoot, "dinou");
+  if (!fs.existsSync(path.join(ejectedRoot, "index.js"))) {
+    return null;
+  }
+
+  const candidate = path.join(ejectedRoot, relTarget);
+  return fs.existsSync(candidate) ? candidate : null;
+}
```

And inside the three bundler plugins + default export:

```diff
         if (forbidden) {
           return { errors: [{ text: forbidden }] };
         }
+        const ejectedResolved = resolveEjectedDinouSpecifier(
+          args.path,
+          projectRoot
+        );
+        if (ejectedResolved) {
+          return { path: ejectedResolved };
+        }
         return null;
       });
```

```diff
     resolveId(source, importer) {
-      if (!importer || importer.startsWith("\0")) return null;
-      const cleanImporter = importer.split("?")[0].split("#")[0];
-      const forbidden = checkForbiddenUnderscoreImport(
-        source,
-        cleanImporter,
-        projectRoot,
-        { importerIsFile: true }
-      );
-      if (forbidden) {
-        this.error(forbidden);
-      }
-      if (!CONTEXTUAL_DINOU_FILTER.test(source)) return null;
-      const resolved = resolveContextualDinouImport(
-        source,
-        path.dirname(cleanImporter),
-        projectRoot
-      );
-      return resolved || null;
+      if (!source || source.startsWith("\0")) return null;
+      if (importer && !importer.startsWith("\0")) {
+        const cleanImporter = importer.split("?")[0].split("#")[0];
+        const forbidden = checkForbiddenUnderscoreImport(
+          source,
+          cleanImporter,
+          projectRoot,
+          { importerIsFile: true }
+        );
+        if (forbidden) {
+          this.error(forbidden);
+        }
+        if (CONTEXTUAL_DINOU_FILTER.test(source)) {
+          const resolved = resolveContextualDinouImport(
+            source,
+            path.dirname(cleanImporter),
+            projectRoot
+          );
+          if (resolved) return resolved;
+        }
+      }
+      const ejectedResolved = resolveEjectedDinouSpecifier(source, projectRoot);
+      if (ejectedResolved) {
+        return ejectedResolved;
+      }
+      return null;
     },
```

```diff
               if (forbidden) {
                 return callback(new Error(forbidden));
               }
+              const ejectedResolved = resolveEjectedDinouSpecifier(
+                resolveData.request,
+                projectRoot
+              );
+              if (ejectedResolved) {
+                resolveData.request = ejectedResolved;
+                return callback();
+              }
               if (CONTEXTUAL_DINOU_FILTER.test(resolveData.request)) {
```

```diff
 export default {
   UNDERSCORE_GLOB_IGNORE,
   isUnderscoreEscapedSrcPath,
   createWebpackUnderscoreDirExclude,
   filterEscapedClientManifest,
   checkForbiddenUnderscoreImport,
+  resolveEjectedDinouSpecifier,
   resolveContextualDinouImport,
   esbuildContextualDinouPlugin,
   rollupContextualDinouPlugin,
   webpackContextualDinouPlugin,
 };
```

---

### 2.5 `dinou/webpack/webpack.config.js`, `dinou/rollup/rollup.config.js` & `dinou/esbuild/plugins-esbuild/babel-react-compiler-plugin.js`

#### `dinou/webpack/webpack.config.js`:

```diff
         {
           test: /\.[jt]sx?$/,
           type: "javascript/auto",
-          exclude: [/[\\/]node_modules[\\/](?!dinou)/, ...outputDirs],
+          exclude: [
+            /[\\/]node_modules[\\/](?!dinou)/,
+            /[\\/]dinou[\\/]compiled[\\/]/,
+            ...outputDirs,
+          ],
           use: [
```

```diff
       alias: {
-        ...(isEjected ? { dinou: localDinouPath } : {}),
+        ...(isEjected
+          ? {
+              "dinou/config": path.join(localDinouPath, "core/config.js"),
+              "dinou/server": path.join(localDinouPath, "server.js"),
+              dinou: localDinouPath,
+            }
+          : {}),
       },
```

#### `dinou/rollup/rollup.config.js`:

```diff
-            exclude: /node_modules[\\/](?!dinou|react-refresh)/,
+            exclude: [
+              /node_modules[\\/](?!dinou|react-refresh)/,
+              /[\\/]dinou[\\/]compiled[\\/]/,
+            ],
```

#### `dinou/esbuild/plugins-esbuild/babel-react-compiler-plugin.js`:

```diff
         const absNorm = normalizeNormPath(args.path);
         // Skip Dinou's internal framework runtime (both in library and ejected mode)
-        if (absNorm.startsWith(dinouRootPrefix)) {
+        if (absNorm.startsWith(dinouRootPrefix) || relFromRoot.startsWith("dinou/")) {
           return null;
         }
```

---

### 2.6 `dinou/scripts/build-vendors.js` (Complete Replacement — Multi-Root Module Resolution)

```js
import esbuild from "esbuild";
import path from "node:path";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DINOU_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = process.cwd();
const COMPILED_DIR = path.join(DINOU_ROOT, "compiled");

const nmDinouDir = path.resolve(PROJECT_ROOT, "node_modules", "dinou");
let realNmDinouDir = null;
if (fsSync.existsSync(nmDinouDir)) {
  try {
    realNmDinouDir = fsSync.realpathSync(nmDinouDir);
  } catch {}
}

const CANDIDATE_ROOTS = Array.from(
  new Set(
    [
      PROJECT_ROOT,
      DINOU_ROOT,
      nmDinouDir,
      realNmDinouDir,
      path.resolve(DINOU_ROOT, ".."),
    ].filter(Boolean)
  )
);

const NODE_PATHS = Array.from(
  new Set(
    [
      ...CANDIDATE_ROOTS.map((r) => path.join(r, "node_modules")),
      realNmDinouDir &&
      path.basename(path.dirname(realNmDinouDir)) === "node_modules"
        ? path.dirname(realNmDinouDir)
        : null,
    ].filter((dir) => dir && fsSync.existsSync(dir))
  )
);

const candidateRequires = CANDIDATE_ROOTS.map((rootDir) => {
  const pkgJson = path.join(rootDir, "package.json");
  if (fsSync.existsSync(pkgJson)) {
    return createRequire(pkgJson);
  }
  return null;
}).filter(Boolean);
candidateRequires.push(createRequire(import.meta.url));

function resolveVendorModule(specifier) {
  for (const req of candidateRequires) {
    try {
      return req.resolve(specifier);
    } catch {}
  }
  throw new Error(
    `Unable to resolve "${specifier}" from project root (${PROJECT_ROOT}) or Dinou root (${DINOU_ROOT}). Install it first (e.g. npm install -D ${specifier}).`
  );
}

const BANNER_JS = `
import { createRequire as __dinou_createRequire } from "node:module";
import { fileURLToPath as __dinou_fileURLToPath } from "node:url";
import __dinou_path from "node:path";
const require = __dinou_createRequire(import.meta.url);
const __filename = __dinou_fileURLToPath(import.meta.url);
const __dirname = __dinou_path.dirname(__filename);
`.trim();

const VENDORS = [
  // --- Babel Ecosystem ---
  { name: "babel-parser", entry: "@babel/parser" },
  { name: "babel-traverse", entry: "@babel/traverse" },
  { name: "babel-core", entry: "@babel/core" },
  { name: "babel-generator", entry: "@babel/generator" },
  { name: "babel-types", entry: "@babel/types" },
  { name: "babel-preset-react", entry: "@babel/preset-react" },
  { name: "babel-preset-typescript", entry: "@babel/preset-typescript" },
  { name: "babel-plugin-syntax-import-meta", entry: "@babel/plugin-syntax-import-meta" },
  { name: "babel-plugin-react-compiler", entry: "babel-plugin-react-compiler" },

  // --- PostCSS & CSS Ecosystem ---
  { name: "postcss", entry: "postcss" },
  { name: "postcss-import", entry: "postcss-import" },
  { name: "postcss-modules", entry: "postcss-modules" },
  { name: "autoprefixer", entry: "autoprefixer" },
  { name: "generic-names", entry: "generic-names" },
  {
    name: "tailwindcss-postcss",
    entry: "@tailwindcss/postcss",
    external: ["@tailwindcss/oxide*", "lightningcss*", "*.node"]
  },

  // --- Rollup Plugins ---
  { name: "rollup-plugin-babel", entry: "@rollup/plugin-babel" },
  { name: "rollup-plugin-commonjs", entry: "@rollup/plugin-commonjs" },
  { name: "rollup-plugin-json", entry: "@rollup/plugin-json" },
  { name: "rollup-plugin-node-resolve", entry: "@rollup/plugin-node-resolve" },
  { name: "rollup-plugin-replace", entry: "@rollup/plugin-replace" },
  { name: "rollup-plugin-delete", entry: "rollup-plugin-delete" },
  { name: "rollup-plugin-postcss", entry: "rollup-plugin-postcss" },

  // --- Webpack Loaders & Plugins ---
  { name: "babel-loader", entry: "babel-loader" },
  {
    name: "css-loader",
    entry: "css-loader",
    postProcess: async (vendorOutdir) => {
      const indexFile = path.join(vendorOutdir, "index.js");
      let indexContent = await fs.readFile(indexFile, "utf8");
      indexContent = indexContent.replaceAll(
        '"../runtime/getUrl.js"',
        '"./runtime/getUrl.js"'
      );
      await fs.writeFile(indexFile, indexContent, "utf8");

      const cssLoaderEntry = resolveVendorModule("css-loader");
      const srcRuntimeDir = path.join(path.dirname(cssLoaderEntry), "runtime");
      const destRuntimeDir = path.join(vendorOutdir, "runtime");
      await fs.cp(srcRuntimeDir, destRuntimeDir, { recursive: true });
      await fs.writeFile(
        path.join(destRuntimeDir, "package.json"),
        JSON.stringify({ type: "commonjs" }, null, 2),
        "utf8"
      );
    }
  },
  {
    name: "mini-css-extract-plugin",
    entries: {
      index: "mini-css-extract-plugin",
      loader: "mini-css-extract-plugin/dist/loader.js"
    },
    splitting: true,
    postProcess: async (vendorOutdir) => {
      const loaderFile = path.join(vendorOutdir, "loader.js");
      let content = await fs.readFile(loaderFile, "utf8");
      content = content.replace(
        "export default require_loader();",
        "const _loader = require_loader();\nexport default _loader;\nexport const pitch = _loader.pitch;\nexport const hotLoader = _loader.hotLoader;\n"
      );
      await fs.writeFile(loaderFile, content, "utf8");

      const mcepEntry = resolveVendorModule("mini-css-extract-plugin");
      const srcHmrDir = path.join(path.dirname(mcepEntry), "hmr");
      const destHmrDir = path.join(vendorOutdir, "hmr");
      await fs.cp(srcHmrDir, destHmrDir, { recursive: true });
      await fs.writeFile(
        path.join(destHmrDir, "package.json"),
        JSON.stringify({ type: "commonjs" }, null, 2),
        "utf8"
      );
    },
    external: ["webpack", "schema-utils"]
  },
  { name: "copy-webpack-plugin", entry: "copy-webpack-plugin" },

  // --- CLI & Core Utilities ---
  { name: "commander", entry: "commander" },
  { name: "ws", entry: "ws" },
  { name: "chokidar", entry: "chokidar" },
  { name: "fast-glob", entry: "fast-glob" },
  { name: "resolve", entry: "resolve" }
];

const GLOBAL_EXTERNALS = [
  "webpack",
  "rollup",
  "esbuild",
  "@swc/core",
  "react",
  "react-dom"
];

async function buildVendors() {
  console.log("🦖 [Dinou v9] Compiling vendor dependencies with esbuild...\n");
  const startTime = Date.now();
  await fs.mkdir(COMPILED_DIR, { recursive: true });

  const activeVendorNames = new Set(VENDORS.map((v) => v.name));
  const existingEntries = await fs.readdir(COMPILED_DIR, { withFileTypes: true });
  for (const entry of existingEntries) {
    if (entry.isDirectory() && !activeVendorNames.has(entry.name)) {
      await fs.rm(path.join(COMPILED_DIR, entry.name), {
        recursive: true,
        force: true,
      });
      console.log(`  🧹 Removed obsolete vendor directory: ${entry.name}`);
    }
  }

  const manifest = {};
  let successCount = 0;
  let failCount = 0;

  for (const vendor of VENDORS) {
    const t0 = Date.now();
    const vendorOutdir = path.join(COMPILED_DIR, vendor.name);
    await fs.rm(vendorOutdir, { recursive: true, force: true });
    await fs.mkdir(vendorOutdir, { recursive: true });

    const externals = Array.from(
      new Set([...GLOBAL_EXTERNALS, ...(vendor.external || [])])
    );

    try {
      if (vendor.wrapper) {
        await esbuild.build({
          absWorkingDir: PROJECT_ROOT,
          nodePaths: NODE_PATHS,
          stdin: {
            contents: vendor.wrapper,
            resolveDir: PROJECT_ROOT,
            sourcefile: `${vendor.name}-wrapper.js`
          },
          bundle: true,
          platform: "node",
          target: "node18",
          format: "esm",
          outfile: path.join(vendorOutdir, "index.js"),
          banner: { js: BANNER_JS },
          external: externals
        });
      } else if (vendor.entries) {
        const resolvedEntries = Object.fromEntries(
          Object.entries(vendor.entries).map(([key, spec]) => [
            key,
            resolveVendorModule(spec),
          ])
        );
        await esbuild.build({
          absWorkingDir: PROJECT_ROOT,
          nodePaths: NODE_PATHS,
          entryPoints: resolvedEntries,
          bundle: true,
          platform: "node",
          target: "node18",
          format: "esm",
          outdir: vendorOutdir,
          banner: { js: BANNER_JS },
          external: externals,
          splitting: Boolean(vendor.splitting)
        });
        if (vendor.postProcess) {
          await vendor.postProcess(vendorOutdir);
        }
      } else {
        const resolvedEntry = resolveVendorModule(vendor.entry);
        await esbuild.build({
          absWorkingDir: PROJECT_ROOT,
          nodePaths: NODE_PATHS,
          entryPoints: [resolvedEntry],
          bundle: true,
          platform: "node",
          target: "node18",
          format: "esm",
          outfile: path.join(vendorOutdir, "index.js"),
          banner: { js: BANNER_JS },
          external: externals
        });
        if (vendor.postProcess) {
          await vendor.postProcess(vendorOutdir);
        }
      }

      const elapsed = Date.now() - t0;
      const indexStat = await fs.stat(path.join(vendorOutdir, "index.js"));
      const sizeKb = (indexStat.size / 1024).toFixed(1);

      console.log(`  ✓ ${vendor.name.padEnd(32)} ${elapsed.toString().padStart(4)}ms  (${sizeKb.padStart(6)} KB)`);
      manifest[vendor.name] = {
        entry: vendor.entry || vendor.entries,
        sizeKb: parseFloat(sizeKb),
        builtAt: new Date().toISOString()
      };
      successCount++;
    } catch (err) {
      console.error(`  ✗ ${vendor.name} FAILED:`, err.message);
      failCount++;
    }
  }

  await fs.writeFile(
    path.join(COMPILED_DIR, "vendors-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✨ Finished compiling ${successCount} vendors in ${totalTime}s (failed: ${failCount})`);
  console.log(`📁 Artifacts generated in: ${COMPILED_DIR}\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

buildVendors().catch((err) => {
  console.error("Fatal error compiling vendors:", err);
  process.exit(1);
});
```

---

## 3. Suggested `CHANGELOG.md` Entry (`v9.4.0`)

```markdown
### Added
- **Transactional `dinou uneject [version]` Command & `"uneject"` Script**: Ejected projects can now revert back to `node_modules/dinou` in a single command (`npm run uneject` or `node dinou/cli.js uneject [version]`), automatically restoring `package.json` scripts, reinstalling `dinou` via the detected package manager (`npm`, `pnpm`, `yarn`, or `bun`) with automatic rollback if installation fails, and removing `./dinou`.

### Changed
- **Selective `package.json` Script Rewriting on `dinou eject`**: `dinou eject` now only rewrites Dinou scripts that already existed in the user's `package.json` (plus adding `"build:vendors"` and `"uneject"` and removing `"eject"`), preserving custom scripts and concise `package.json` files without injecting ~150 unused script entries.
- **Friendly Already-Ejected Guard on `dinou eject`**: Running `dinou eject` inside an already-ejected workspace now exits cleanly with an informational message instead of throwing `ERR_MODULE_NOT_FOUND` or overwriting custom edits inside `./dinou`.
- **Multi-Root `build:vendors` Resolution**: `dinou/scripts/build-vendors.js` now resolves toolchain packages across `[projectRoot, dinouRoot, node_modules/dinou]`, allowing ejected projects to override dependencies in their root `package.json` and recompile `./dinou/compiled/` cleanly under `pnpm`, `npm`, `yarn`, and `bun`.

### Fixed
- **Live Ejected Module Resolution Across `pnpm` / `yarn` & Webpack `"dinou/config"`**: Esbuild, Rollup, and Webpack now resolve `"dinou"`, `"dinou/server"`, `"dinou/config"`, and `"dinou/adapters/*"` directly to `<projectRoot>/dinou/...` whenever `./dinou` exists, ensuring live framework edits take effect immediately even when package managers copy a static snapshot into `node_modules/dinou`, and fixing `import { defineConfig } from "dinou/config"` in Webpack Ejected Mode.
```

---

## 4. Automated Test Suites

### 4.1 Unit & Integration Test Suite (`tests/unit/eject.test.mjs`)

```js
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
    fs.rmSync(dir, { recursive: true, force: true });
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
    fs.writeFileSync(path.join(pnpmDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
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

  // 1. Build a simulated installed package (<simPkg>/eject.js + <simPkg>/dinou)
  //    so this test exercises the real `cli.js eject` -> `../eject.js` -> `runEject` flow
  //    even when running inside an ejected workspace like `dinou-e2e` (which has no root eject.js).
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

  // Write a custom marker inside ./dinou to verify guards never overwrite or delete it accidentally
  const customFile = path.join(ejectedDir, "CUSTOM_MOD.txt");
  fs.writeFileSync(customFile, "USER_OWNED_CODE", "utf8");

  // 2. Running `node dinou/cli.js eject` when already ejected exits 0 and preserves CUSTOM_MOD.txt
  const secondEject = spawnSync(
    process.execPath,
    [path.join(ejectedDir, "cli.js"), "eject"],
    { cwd: projectDir, encoding: "utf8" }
  );
  assert.equal(secondEject.status, 0, secondEject.stderr);
  assert.match(secondEject.stdout, /already ejected in \.\/dinou/i);
  assert.equal(fs.readFileSync(customFile, "utf8"), "USER_OWNED_CODE");

  // 3. Answering "n" (or pressing Enter) to interactive uneject prompt safely cancels
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

  // 4. Transactional rollback when package manager fails during uneject
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

  // 5. Confirming with "y" on CLI uneject (`node dinou/cli.js uneject ^9.4.0 --skip-install`)
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
```

---

### 4.2 End-to-End Playwright Test Suite (`tests/e2e/eject.spec.ts`)

```ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

function resolveSourceDinouDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "dinou"),
    path.resolve(WORKSPACE_ROOT, "dinou"),
    path.resolve(process.cwd(), "node_modules/dinou/dinou"),
    path.resolve(WORKSPACE_ROOT, "node_modules/dinou/dinou"),
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

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Unable to allocate free port")));
      }
    });
    srv.on("error", reject);
  });
}

async function waitForHttpReady(url: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

test.describe("Dinou Eject & Uneject E2E Sovereignty Flow", () => {
  const fixtureRoot = path.join(WORKSPACE_ROOT, ".dinou-e2e-eject-fixture");
  let serverProc: ChildProcess | null = null;

  test.afterEach(() => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill("SIGTERM");
      serverProc = null;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test("ejects framework, reflects live ./dinou edits in SSR + hydrated client even over stale node_modules/dinou, and unejects cleanly", async ({
    page,
  }) => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.mkdirSync(path.join(fixtureRoot, "src"), { recursive: true });

    const pkgPath = path.join(fixtureRoot, "package.json");
    fs.writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: "e2e-eject-app",
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
            react: "^19.3.1",
            "react-dom": "^19.3.1",
          },
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    // 1. Stage a simulated npm package layout (<simPkg>/eject.js + <simPkg>/dinou)
    //    inside fixtureRoot/.sim-pkg so `cli.js eject` works identically in ejected `dinou-e2e`
    //    (where no root eject.js exists) and in non-ejected repos.
    const simPkgDir = path.join(fixtureRoot, ".sim-dinou-pkg");
    fs.mkdirSync(simPkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(simPkgDir, "package.json"),
      JSON.stringify({ name: "dinou", version: "9.4.0", type: "module" }, null, 2),
      "utf8"
    );
    fs.writeFileSync(path.join(simPkgDir, "eject.js"), EJECT_WRAPPER_SOURCE, "utf8");
    fs.cpSync(SOURCE_DINOU_DIR, path.join(simPkgDir, "dinou"), { recursive: true });

    const ejectRun = spawnSync(
      process.execPath,
      [path.join(simPkgDir, "dinou", "cli.js"), "eject", "--skip-install"],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(ejectRun.status).toBe(0);
    fs.rmSync(simPkgDir, { recursive: true, force: true });

    const ejectedPkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    expect(ejectedPkg.scripts.dev).toBe("node dinou/cli.js dev");
    expect(ejectedPkg.scripts.uneject).toBe("node dinou/cli.js uneject");
    expect(ejectedPkg.scripts["build:vendors"]).toBe(
      "node dinou/cli.js build:vendors"
    );
    expect(ejectedPkg.scripts.eject).toBeUndefined();

    // 2. Place a stale snapshot in fixtureRoot/node_modules/dinou (simulating pnpm/yarn static copy)
    const staleDir = path.join(fixtureRoot, "node_modules", "dinou");
    fs.mkdirSync(path.join(staleDir, "core"), { recursive: true });
    fs.copyFileSync(
      path.join(SOURCE_DINOU_DIR, "package.json"),
      path.join(staleDir, "package.json")
    );
    fs.writeFileSync(
      path.join(staleDir, "index.js"),
      'export const EJECTED_BANNER = "STALE_NODE_MODULES";\n',
      "utf8"
    );

    // 3. Apply live customizations inside ./dinou/index.js and ./dinou/core/handler.js
    const localIndex = path.join(fixtureRoot, "dinou", "index.js");
    fs.writeFileSync(
      localIndex,
      fs.readFileSync(localIndex, "utf8") +
        '\nexport const EJECTED_BANNER = "LIVE_EJECTED_SOVEREIGNTY";\n',
      "utf8"
    );

    fs.writeFileSync(
      path.join(fixtureRoot, "dinou.config.ts"),
      `import { defineConfig } from "dinou/config";
export default defineConfig({
  plugins: [
    {
      name: "ejected-header-plugin",
      onRequest(ctx) {
        ctx.res.headers.set("x-dinou-mode", "ejected");
      },
    },
  ],
});
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(fixtureRoot, "src", "counter.tsx"),
      `"use client";
import { useState } from "react";
import { EJECTED_BANNER } from "dinou";

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button
      id="eject-btn"
      type="button"
      onClick={() => setCount((c) => c + 1)}
    >
      {EJECTED_BANNER}:{count}
    </button>
  );
}
`,
      "utf8"
    );

    fs.writeFileSync(
      path.join(fixtureRoot, "src", "page.tsx"),
      `import Counter from "./counter";
import { EJECTED_BANNER } from "dinou";

export default function Page() {
  return (
    <html>
      <head>
        <title>Ejected E2E</title>
      </head>
      <body>
        <h1 id="ssr-banner">{EJECTED_BANNER}</h1>
        <Counter />
      </body>
    </html>
  );
}
`,
      "utf8"
    );

    // 4. Build production bundle using ejected CLI
    const buildRun = spawnSync(
      process.execPath,
      [path.join(fixtureRoot, "dinou", "cli.js"), "build"],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(buildRun.status).toBe(0);

    // 5. Boot production server and verify SSR + client hydration in Playwright
    const port = await getFreePort();
    serverProc = spawn(
      process.execPath,
      [path.join(fixtureRoot, "dinou", "cli.js"), "start"],
      {
        cwd: fixtureRoot,
        env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
        stdio: "ignore",
      }
    );

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHttpReady(baseUrl);

    const response = await page.goto(baseUrl);
    expect(response?.headers()["x-dinou-mode"]).toBe("ejected");

    await expect(page.locator("#ssr-banner")).toHaveText(
      "LIVE_EJECTED_SOVEREIGNTY"
    );
    const btn = page.locator("#eject-btn");
    await expect(btn).toHaveText("LIVE_EJECTED_SOVEREIGNTY:0");
    await btn.click();
    await expect(btn).toHaveText("LIVE_EJECTED_SOVEREIGNTY:1");

    serverProc.kill("SIGTERM");
    serverProc = null;

    // 6. Run `node dinou/cli.js uneject ^9.4.0 -y --skip-install` and verify clean reversal
    const unejectRun = spawnSync(
      process.execPath,
      [
        path.join(fixtureRoot, "dinou", "cli.js"),
        "uneject",
        "^9.4.0",
        "-y",
        "--skip-install",
      ],
      { cwd: fixtureRoot, encoding: "utf8" }
    );
    expect(unejectRun.status).toBe(0);
    expect(fs.existsSync(path.join(fixtureRoot, "dinou"))).toBe(false);

    const restoredPkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    expect(restoredPkg.scripts).toEqual({
      dev: "dinou dev",
      build: "dinou build",
      start: "dinou start",
      eject: "dinou eject",
    });
    expect(restoredPkg.dependencies.dinou).toBe("^9.4.0");
  });
});
```

