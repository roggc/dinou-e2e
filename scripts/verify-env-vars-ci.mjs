// scripts/verify-env-vars-ci.mjs
// Verifies Dinou v9.4.0 Environment Variables, .env* Hierarchy, DINOU_PUBLIC_*, Unified getContext().env & Anti-Bot Shield:
// 1. parseDotEnv (UTF-8 BOM, comments, inline #, export, single/double/backtick quotes, multiline PEM, escapes), getEnvFileHierarchy (dev/prod/test), loadEnvFiles precedence (shell > .env.<mode>.local > .env.local > .env.<mode> > .env) & { reload: true } key cleanup
// 2. collectDeclaredEnvKeys & generateRouteTypes emitting .env* + .env.example variable names (never values, skipping NODE_ENV/TZ) to .dinou/types/routes.d.ts + dinou/env.d.ts / index.d.ts / server.d.ts declarations
// 3. createUnifiedEnv & syncEdgeEnvToProcessEnv preserving private #field class receivers on live Cloudflare KV/D1/ASSETS bindings, fallback to process.env, non-nullable getContext().env fallback & AsyncLocalStorage concurrency isolation
// 4. isBotEnvProbePath Anti-Bot Shield (blocking /.env*, nested /api/.env*, /backup.env, single/double URL-encoded /%2eenv & /%252eenv while allowing /docs/env, /t-env-vars, /.well-known/*) & copyStaticDirectoriesToOutdir / static-assets physical public/.env* exclusion
// 5. Dev server (.env PORT startup before resolveDevPorts + live .env.local hot-reload updating DINOU_PUBLIC_* in both SSR Pass B & Client bundle + server process.env without restart)
// 6. Full 3-bundler (esbuild, rollup, webpack) x multi-runtime (Node AOT HTTP + Anti-Bot 404 + zero [slug] ISG poisoning, export-static, Cloudflare, Bun, Deno) matrix with recursive zero-secret-leak audit across dist3, dist2, cloudflare/assets & out/

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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

function createFixtureApp(prefix) {
  const fixturesBase = path.join(projectRoot, ".dinou", "tmp-env-fixtures");
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
      { name: "dinou-env-fixture", version: "1.0.0", type: "module" },
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

function cleanupUnusedHelpers() {}

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

function assertZeroSubstringInDir(dir, forbiddenList, label) {
  const files = collectFilesRecursive(dir);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const secret of forbiddenList) {
      assert(
        !text.includes(secret),
        `[${label}] Forbidden secret "${secret}" leaked into ${path.relative(dir, file)}`
      );
    }
  }
}

const {
  DINOU_PUBLIC_PREFIX,
  isDotEnvFileName,
  isBotEnvProbePath,
  syncEdgeEnvToProcessEnv,
  createUnifiedEnv,
} = await importDinou("core/runtime-env.js");

const {
  parseDotEnv,
  getEnvFileHierarchy,
  readEnvFilesMap,
  loadEnvFiles,
  collectDeclaredEnvKeys,
  getPublicEnvObject,
  getEsbuildPublicEnvDefines,
  getRollupPublicEnvReplacements,
  getWebpackPublicEnvDefines,
  isWatchedDotEnvFile,
} = await importDinou("core/env.js");

const { requestStorage, getContext } = await importDinou(
  "core/request-context.js"
);
const { generateRouteTypes } = await importDinou(
  "core/generate-route-types.js"
);
const { isInternalDinouAssetPath, shouldExportDist3Entry } = await importDinou(
  "core/static-assets.js"
);
const { copyStaticDirectoriesToOutdir } = await importDinou(
  "core/copy-static-dirs.js"
);

console.log(
  "1️⃣ Verifying parseDotEnv, getEnvFileHierarchy, loadEnvFiles precedence & { reload: true }..."
);
{
  assert.equal(DINOU_PUBLIC_PREFIX, "DINOU_PUBLIC_");

  const rawEnv = [
    "\uFEFF# Leading UTF-8 BOM comment",
    "SIMPLE_VAL=alpha_123 # inline comment stripped",
    "HASH_NO_SPACE=v1#v2",
    "export EXPORTED_KEY = 'literal # single quoted \\n stays raw'",
    'DOUBLE_ESCAPED="line1\\nline2\\t\\"quoted\\"\\\\end"',
    "`BACKTICK_KEY`=`invalid_key_ignored`",
    "BACKTICK_VAL=`backtick # preserved`",
    "EMPTY_KEY=",
    'MULTILINE_PEM="-----BEGIN TEST KEY-----',
    "PAYLOAD_ROW_A",
    "PAYLOAD_ROW_B",
    '-----END TEST KEY-----"',
  ].join("\r\n");

  const parsed = parseDotEnv(rawEnv);
  assert.equal(parsed.SIMPLE_VAL, "alpha_123");
  assert.equal(parsed.HASH_NO_SPACE, "v1#v2");
  assert.equal(parsed.EXPORTED_KEY, "literal # single quoted \\n stays raw");
  assert.equal(parsed.DOUBLE_ESCAPED, 'line1\nline2\t"quoted"\\end');
  assert.equal(parsed.BACKTICK_VAL, "backtick # preserved");
  assert.equal(parsed.EMPTY_KEY, "");
  assert.equal(
    parsed.MULTILINE_PEM,
    "-----BEGIN TEST KEY-----\nPAYLOAD_ROW_A\nPAYLOAD_ROW_B\n-----END TEST KEY-----"
  );
  assert(!("`BACKTICK_KEY`" in parsed));

  assert.deepEqual(getEnvFileHierarchy("development"), [
    ".env.development.local",
    ".env.local",
    ".env.development",
    ".env",
  ]);
  assert.deepEqual(getEnvFileHierarchy("production"), [
    ".env.production.local",
    ".env.local",
    ".env.production",
    ".env",
  ]);
  // Mode "test" intentionally skips .env.local for reproducible tests
  assert.deepEqual(getEnvFileHierarchy("test"), [
    ".env.test.local",
    ".env.test",
    ".env",
  ]);

  const tmpHierarchyDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "dinou-env-hierarchy-")
  );
  const testKeys = [
    "CI_TEST_SHELL_WIN",
    "CI_TEST_PRIORITY",
    "CI_TEST_LOCAL_ONLY",
    "CI_TEST_MODE_ONLY",
    "CI_TEST_BASE_ONLY",
    "CI_TEST_REMOVABLE",
    "DINOU_PUBLIC_CI_UNIT_FLAG",
  ];
  const savedEnv = new Map(testKeys.map((k) => [k, process.env[k]]));
  try {
    for (const k of testKeys) delete process.env[k];
    process.env.CI_TEST_SHELL_WIN = "from_real_shell";

    fs.writeFileSync(
      path.join(tmpHierarchyDir, ".env"),
      [
        "CI_TEST_SHELL_WIN=from_base",
        "CI_TEST_PRIORITY=from_base",
        "CI_TEST_BASE_ONLY=base_ok",
        "CI_TEST_REMOVABLE=temp_injected",
        "DINOU_PUBLIC_CI_UNIT_FLAG=pub_v1",
      ].join("\n")
    );
    fs.writeFileSync(
      path.join(tmpHierarchyDir, ".env.development"),
      ["CI_TEST_PRIORITY=from_dev", "CI_TEST_MODE_ONLY=dev_ok"].join("\n")
    );
    fs.writeFileSync(
      path.join(tmpHierarchyDir, ".env.local"),
      ["CI_TEST_PRIORITY=from_local", "CI_TEST_LOCAL_ONLY=local_ok"].join("\n")
    );
    fs.writeFileSync(
      path.join(tmpHierarchyDir, ".env.development.local"),
      "CI_TEST_PRIORITY=from_dev_local\n"
    );

    // In "test" mode, .env.local must NOT be loaded
    const testModeRead = readEnvFilesMap(tmpHierarchyDir, { mode: "test" });
    assert.equal(testModeRead.values.CI_TEST_LOCAL_ONLY, undefined);
    assert.equal(testModeRead.values.CI_TEST_BASE_ONLY, "base_ok");

    // Load in "development" mode
    const firstLoad = loadEnvFiles(tmpHierarchyDir, { mode: "development" });
    assert.equal(process.env.CI_TEST_SHELL_WIN, "from_real_shell");
    assert.equal(process.env.CI_TEST_PRIORITY, "from_dev_local");
    assert.equal(process.env.CI_TEST_LOCAL_ONLY, "local_ok");
    assert.equal(process.env.CI_TEST_MODE_ONLY, "dev_ok");
    assert.equal(process.env.CI_TEST_BASE_ONLY, "base_ok");
    assert.equal(process.env.CI_TEST_REMOVABLE, "temp_injected");
    assert.equal(process.env.DINOU_PUBLIC_CI_UNIT_FLAG, "pub_v1");
    assert.equal(firstLoad.changed, true);

    // Cached repeat call without reload: false changed flags
    const cachedLoad = loadEnvFiles(tmpHierarchyDir, { mode: "development" });
    assert.equal(cachedLoad.changed, false);
    assert.equal(cachedLoad.publicEnvChanged, false);

    // Verify bundler replacement helpers never expose private keys
    const pubObj = getPublicEnvObject({ mode: "production" });
    assert.equal(pubObj.NODE_ENV, "production");
    assert.equal(pubObj.DINOU_PUBLIC_CI_UNIT_FLAG, "pub_v1");
    assert.equal(pubObj.CI_TEST_BASE_ONLY, undefined);

    const esbuildDefs = getEsbuildPublicEnvDefines({ mode: "production" });
    assert.equal(esbuildDefs["process.env.DINOU_PUBLIC_CI_UNIT_FLAG"], '"pub_v1"');
    assert(esbuildDefs["process.env"].includes('"DINOU_PUBLIC_CI_UNIT_FLAG":"pub_v1"'));
    assert(!esbuildDefs["process.env"].includes("CI_TEST_BASE_ONLY"));

    const esbuildServerDefs = getEsbuildPublicEnvDefines({
      mode: "production",
      defineProcessEnvObject: false,
    });
    assert.equal(esbuildServerDefs["process.env"], undefined);
    assert.equal(
      esbuildServerDefs["process.env.DINOU_PUBLIC_CI_UNIT_FLAG"],
      '"pub_v1"'
    );

    const rollupReps = getRollupPublicEnvReplacements({ mode: "production" });
    assert.equal(
      rollupReps.exactValues["process.env.DINOU_PUBLIC_CI_UNIT_FLAG"],
      '"pub_v1"'
    );
    assert(rollupReps.objectValues["process.env"].startsWith("({"));
    assert(!rollupReps.objectValues["process.env"].includes("CI_TEST_BASE_ONLY"));

    const webpackDefs = getWebpackPublicEnvDefines({ mode: "production" });
    assert.equal(webpackDefs["process.env"], esbuildDefs["process.env"]);

    // Edit .env (remove CI_TEST_REMOVABLE & rotate DINOU_PUBLIC_CI_UNIT_FLAG) and reload
    fs.writeFileSync(
      path.join(tmpHierarchyDir, ".env"),
      [
        "CI_TEST_SHELL_WIN=from_base",
        "CI_TEST_PRIORITY=from_base",
        "CI_TEST_BASE_ONLY=base_ok_v2",
        "DINOU_PUBLIC_CI_UNIT_FLAG=pub_v2",
      ].join("\n")
    );
    const reloaded = loadEnvFiles(tmpHierarchyDir, {
      mode: "development",
      reload: true,
    });
    assert.equal(reloaded.changed, true);
    assert.equal(reloaded.publicEnvChanged, true);
    assert.equal(process.env.CI_TEST_SHELL_WIN, "from_real_shell");
    assert.equal(process.env.CI_TEST_REMOVABLE, undefined);
    assert.equal(process.env.CI_TEST_BASE_ONLY, "base_ok_v2");
    assert.equal(process.env.DINOU_PUBLIC_CI_UNIT_FLAG, "pub_v2");

    assert.equal(
      isWatchedDotEnvFile(path.join(tmpHierarchyDir, ".env.local"), tmpHierarchyDir),
      true
    );
    assert.equal(
      isWatchedDotEnvFile(
        path.join(tmpHierarchyDir, "public", ".env"),
        tmpHierarchyDir
      ),
      false
    );
  } finally {
    for (const [k, v] of savedEnv.entries()) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    removeDirSafe(tmpHierarchyDir);
  }
}
console.log("   ✅ Section 1 passed!");

console.log(
  "2️⃣ Verifying TypeScript .env* & .env.example key generation & declaration contracts..."
);
{
  const tmpTsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-env-ts-"));
  try {
    fs.mkdirSync(path.join(tmpTsDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpTsDir, "src/page.tsx"),
      "export default function Page() { return null; }\n"
    );
    fs.writeFileSync(
      path.join(tmpTsDir, ".env"),
      [
        'DB_PRIVATE_TOKEN="dinou_never_emit_secret_value_111"',
        "NODE_ENV=development",
        "TZ=UTC",
        "INVALID.DOT.KEY=skip_me",
      ].join("\n")
    );
    fs.writeFileSync(
      path.join(tmpTsDir, ".env.example"),
      [
        'TEMPLATE_ONLY_KEY="placeholder_secret_222"',
        'DINOU_PUBLIC_SITE_NAME="Acme"',
      ].join("\n")
    );

    const keys = collectDeclaredEnvKeys(tmpTsDir);
    assert.deepEqual(keys, [
      "DB_PRIVATE_TOKEN",
      "DINOU_PUBLIC_SITE_NAME",
      "TEMPLATE_ONLY_KEY",
    ]);

    generateRouteTypes(tmpTsDir);
    const dts = fs.readFileSync(
      path.join(tmpTsDir, ".dinou/types/routes.d.ts"),
      "utf8"
    );
    assert(dts.includes("interface ProcessEnv {"));
    assert(dts.includes("DB_PRIVATE_TOKEN?: string;"));
    assert(dts.includes("DINOU_PUBLIC_SITE_NAME?: string;"));
    assert(dts.includes("TEMPLATE_ONLY_KEY?: string;"));
    assert(!dts.includes("NODE_ENV?: string;"));
    assert(!dts.includes("TZ?: string;"));
    assert(!dts.includes("INVALID.DOT.KEY"));
    assert(!dts.includes("dinou_never_emit_secret_value_111"));
    assert(!dts.includes("placeholder_secret_222"));

    const envDts = fs.readFileSync(path.join(dinouRoot, "env.d.ts"), "utf8");
    assert(envDts.includes("[key: `DINOU_PUBLIC_${string}`]: string | undefined;"));
    assert(envDts.includes("var process: NodeJS.Process;"));

    const indexDts = fs.readFileSync(path.join(dinouRoot, "index.d.ts"), "utf8");
    assert(indexDts.includes("export interface DinouEnv"));
    assert(
      indexDts.includes("export declare function getContext(): RequestContextStore;")
    );

    const serverDts = fs.readFileSync(
      path.join(dinouRoot, "server.d.ts"),
      "utf8"
    );
    assert(
      serverDts.includes("export declare function getContext(): RequestContextStore;")
    );
  } finally {
    removeDirSafe(tmpTsDir);
  }
}
console.log("   ✅ Section 2 passed!");

console.log(
  "3️⃣ Verifying createUnifiedEnv, private #field Cloudflare bindings, syncEdgeEnvToProcessEnv & AsyncLocalStorage isolation..."
);
{
  class MockCloudflareKV {
    #store = new Map([["session:1", "edge_kv_payload_ok"]]);
    async get(key) {
      return this.#store.get(key) ?? null;
    }
  }

  const kvBinding = new MockCloudflareKV();
  const mockPlatformEnv = {
    MY_KV: kvBinding,
    EDGE_PLAIN_SECRET: "edge_plain_secret_value",
  };

  const prevFallback = process.env.CI_FALLBACK_PROC_SECRET;
  const prevEdgePlain = process.env.EDGE_PLAIN_SECRET;
  try {
    process.env.CI_FALLBACK_PROC_SECRET = "from_process_env_fallback";
    delete process.env.EDGE_PLAIN_SECRET;

    const unified = createUnifiedEnv(mockPlatformEnv);
    assert.equal(unified, createUnifiedEnv(mockPlatformEnv), "Expected WeakMap proxy cache hit");
    assert.equal(unified.MY_KV, kvBinding);
    assert.equal(await unified.MY_KV.get("session:1"), "edge_kv_payload_ok");
    assert.equal(unified.EDGE_PLAIN_SECRET, "edge_plain_secret_value");
    assert.equal(unified.CI_FALLBACK_PROC_SECRET, "from_process_env_fallback");
    assert("MY_KV" in unified);
    assert("CI_FALLBACK_PROC_SECRET" in unified);
    assert(!("DEFINITELY_MISSING_ENV_KEY_XYZ" in unified));
    assert(Object.keys(unified).includes("MY_KV"));
    assert(Object.keys(unified).includes("CI_FALLBACK_PROC_SECRET"));

    syncEdgeEnvToProcessEnv(mockPlatformEnv);
    assert.equal(process.env.EDGE_PLAIN_SECRET, "edge_plain_secret_value");
    assert.equal(process.env.MY_KV, undefined, "Object bindings must not be stringified onto process.env");

    // Outside-request fallback check
    const fallbackCtx = getContext();
    assert(fallbackCtx && typeof fallbackCtx === "object");
    assert.equal(
      fallbackCtx.env.CI_FALLBACK_PROC_SECRET,
      "from_process_env_fallback"
    );
    assert.equal(
      fallbackCtx.req.env.CI_FALLBACK_PROC_SECRET,
      "from_process_env_fallback"
    );

    // Concurrent AsyncLocalStorage isolation check
    const [resA, resB] = await Promise.all([
      requestStorage.run(
        {
          req: { path: "/a", query: {}, cookies: {}, headers: {}, method: "GET" },
          res: {},
          env: createUnifiedEnv({ TENANT_SECRET: "tenant_alpha" }),
        },
        async () => {
          await new Promise((r) => setTimeout(r, 25));
          return getContext().env.TENANT_SECRET;
        }
      ),
      requestStorage.run(
        {
          req: { path: "/b", query: {}, cookies: {}, headers: {}, method: "GET" },
          res: {},
          env: createUnifiedEnv({ TENANT_SECRET: "tenant_beta" }),
        },
        async () => {
          await new Promise((r) => setTimeout(r, 5));
          return getContext().env.TENANT_SECRET;
        }
      ),
    ]);
    assert.equal(resA, "tenant_alpha");
    assert.equal(resB, "tenant_beta");
  } finally {
    if (prevFallback === undefined) delete process.env.CI_FALLBACK_PROC_SECRET;
    else process.env.CI_FALLBACK_PROC_SECRET = prevFallback;
    if (prevEdgePlain === undefined) delete process.env.EDGE_PLAIN_SECRET;
    else process.env.EDGE_PLAIN_SECRET = prevEdgePlain;
  }
}
console.log("   ✅ Section 3 passed!");

console.log(
  "4️⃣ Verifying Anti-Bot .env* Shield & physical public/.env* exclusion..."
);
{
  for (const name of [".env", ".ENV", ".env.local", ".env.production", "sub/.env.test"]) {
    assert.equal(isDotEnvFileName(name), true, `Expected isDotEnvFileName(${name}) === true`);
  }
  for (const name of ["env", "env.js", ".envrc", ".nojekyll", "robots.txt"]) {
    assert.equal(isDotEnvFileName(name), false, `Expected isDotEnvFileName(${name}) === false`);
  }

  const blockedBotPaths = [
    "/.env",
    "/.ENV",
    "/.env.local",
    "/.env.production",
    "/.env.development.local",
    "/api/.env",
    "/api/.env.staging",
    "/nested/deep/.env.backup",
    "/backup.env",
    "/config/secrets.env",
    "/%2eenv",
    "/%2EENV",
    "/.%65nv",
    "/%2eenv.local",
    "/%252eenv",
    "/api/%252eenv.production",
  ];
  for (const p of blockedBotPaths) {
    assert.equal(
      isBotEnvProbePath(p),
      true,
      `Expected isBotEnvProbePath("${p}") === true`
    );
  }

  const allowedAppPaths = [
    "/",
    "/env",
    "/docs/env",
    "/docs/env-vars",
    "/t-env-vars",
    "/t-env-vars/ssg-prebuilt",
    "/environment",
    "/assets/env-banner-1234abcd.svg",
    "/.well-known/apple-app-site-association",
    "/.nojekyll",
  ];
  for (const p of allowedAppPaths) {
    assert.equal(
      isBotEnvProbePath(p),
      false,
      `Expected isBotEnvProbePath("${p}") === false`
    );
  }

  assert.equal(isInternalDinouAssetPath(".env"), true);
  assert.equal(isInternalDinouAssetPath(".env.production"), true);
  assert.equal(isInternalDinouAssetPath("nested/.env.local"), true);
  assert.equal(shouldExportDist3Entry(".env"), false);
  assert.equal(shouldExportDist3Entry(".env.local"), false);

  const tmpStaticDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "dinou-public-dotenv-")
  );
  try {
    const pubDir = path.join(tmpStaticDir, "public");
    const outDir = path.join(tmpStaticDir, "dist3");
    fs.mkdirSync(path.join(pubDir, ".well-known"), { recursive: true });
    fs.mkdirSync(path.join(pubDir, "nested"), { recursive: true });
    fs.writeFileSync(path.join(pubDir, "robots.txt"), "User-agent: *\n");
    fs.writeFileSync(path.join(pubDir, ".nojekyll"), "");
    fs.writeFileSync(
      path.join(pubDir, ".well-known/assetlinks.json"),
      "[]"
    );
    fs.writeFileSync(path.join(pubDir, ".env"), "SECRET=1\n");
    fs.writeFileSync(path.join(pubDir, ".env.production"), "SECRET=2\n");
    fs.writeFileSync(path.join(pubDir, "nested/.env.local"), "SECRET=3\n");

    copyStaticDirectoriesToOutdir(tmpStaticDir, outDir);

    assert(fs.existsSync(path.join(outDir, "robots.txt")));
    assert(fs.existsSync(path.join(outDir, ".nojekyll")));
    assert(fs.existsSync(path.join(outDir, ".well-known/assetlinks.json")));
    assert(!fs.existsSync(path.join(outDir, ".env")));
    assert(!fs.existsSync(path.join(outDir, ".env.production")));
    assert(!fs.existsSync(path.join(outDir, "nested/.env.local")));
  } finally {
    removeDirSafe(tmpStaticDir);
  }
}
console.log("   ✅ Section 4 passed!");

console.log(
  "5️⃣ Verifying Dev Bundler + Dual-Engine .env* loading, DINOU_PUBLIC_* inlining, secret isolation & refreshPublicEnv() hot-reload..."
);
{
  // Verify dinou/node/dev.js loads .env* BEFORE resolveDevPorts() and wires atomic activeEnvReloadPromise
  const devJsSource = fs.readFileSync(
    path.join(dinouRoot, "node/dev.js"),
    "utf8"
  );
  const loadEnvIdx = devJsSource.indexOf(
    'loadEnvFiles(process.cwd(), { mode: "development" })'
  );
  const resolvePortsIdx = devJsSource.indexOf("await resolveDevPorts(");
  assert(
    loadEnvIdx !== -1 && resolvePortsIdx !== -1 && loadEnvIdx < resolvePortsIdx,
    "Expected dinou/node/dev.js to call loadEnvFiles(process.cwd(), { mode: 'development' }) BEFORE await resolveDevPorts(...)"
  );
  assert(
    devJsSource.includes("activeEnvReloadPromise") &&
      devJsSource.includes("refreshPublicEnv"),
    "Expected dinou/node/dev.js envWatcher to coordinate activeEnvReloadPromise and refreshPublicEnv()"
  );

  const { fixturesBase: devFixturesBase, tmpApp: tmpDevApp } =
    createFixtureApp("env-dev-");
  try {
    fs.mkdirSync(path.join(tmpDevApp, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDevApp, ".env"),
      [
        "PORT=4321",
        "HMR_PORT=4322",
        'PRIVATE_DEV_SECRET="dinou_dev_private_never_leak_555"',
        'DINOU_PUBLIC_DEV_BANNER="DevBannerInitialV1"',
      ].join("\n"),
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpDevApp, "src/layout.tsx"),
      `export default function Layout({ children }: { children: any }) {
        return <html><body>{children}</body></html>;
      }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpDevApp, "src/ClientBox.tsx"),
      `"use client";
      export function ClientBox() {
        const { DINOU_PUBLIC_DEV_BANNER, PRIVATE_DEV_SECRET } = process.env;
        return (
          <div
            id="dev-client-box"
            data-banner={process.env.DINOU_PUBLIC_DEV_BANNER ?? "missing"}
            data-destructured={DINOU_PUBLIC_DEV_BANNER ?? "missing"}
            data-leak={String(process.env.PRIVATE_DEV_SECRET)}
            data-leak-destructured={String(PRIVATE_DEV_SECRET)}
          >
            {process.env.DINOU_PUBLIC_DEV_BANNER}
          </div>
        );
      }\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmpDevApp, "src/page.tsx"),
      `import { getContext } from "dinou";
      import { ClientBox } from "./ClientBox";
      export default function Page() {
        const { env } = getContext();
        return (
          <main
            data-secret-ok={String(env.PRIVATE_DEV_SECRET === "dinou_dev_private_never_leak_555")}
            data-live-flag={String(env.LIVE_HOT_SERVER_VAR ?? "unset")}
          >
            <ClientBox />
          </main>
        );
      }\n`,
      "utf8"
    );

    const devChildScript = path.join(tmpDevApp, "probe-dev-env.mjs");
    fs.writeFileSync(
      devChildScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dinouRoot = ${JSON.stringify(dinouRoot)};
const tmpApp = process.cwd();
const importDinou = (rel) => import(pathToFileURL(path.join(dinouRoot, rel)).href);

const { loadEnvFiles } = await importDinou("core/env.js");
const { startEsbuildDev } = await importDinou("esbuild/dev.js");

// Ensure PORT & HMR_PORT come purely from .env when omitted from CLI shell
const loaded = loadEnvFiles(tmpApp, { mode: "development" });
assert.equal(process.env.PORT, "4321");
assert.equal(process.env.HMR_PORT, "4322");
assert.equal(loaded.publicEnv.DINOU_PUBLIC_DEV_BANNER, "DevBannerInitialV1");

const handle = await startEsbuildDev({ hmrPort: 0 });
try {
  const mem = globalThis.__DINOU_MEM_FILES__;
  assert.ok(mem, "__DINOU_MEM_FILES__ must be populated");
  const allJsV1 = Array.from(mem.entries())
    .filter(([k]) => k.endsWith(".js"))
    .map(([, buf]) => buf.toString("utf8"))
    .join("\\n");
  assert.ok(allJsV1.includes("DevBannerInitialV1"), "Expected V1 DINOU_PUBLIC_DEV_BANNER in dev memory bundle");
  assert.ok(!allJsV1.includes("dinou_dev_private_never_leak_555"), "Dev memory bundle must NEVER contain private secret");

  // Hot-reload via .env.local + refreshPublicEnv() without restarting server
  fs.writeFileSync(
    path.join(tmpApp, ".env.local"),
    'DINOU_PUBLIC_DEV_BANNER="DevBannerHotReloadedV2"\\nLIVE_HOT_SERVER_VAR="hot_reloaded_server_ok"\\n',
    "utf8"
  );
  const reloadRes = loadEnvFiles(tmpApp, { mode: "development", reload: true });
  assert.equal(reloadRes.changed, true);
  assert.equal(reloadRes.publicEnvChanged, true);
  assert.equal(process.env.LIVE_HOT_SERVER_VAR, "hot_reloaded_server_ok");

  await (handle.refreshPublicEnv ? handle.refreshPublicEnv() : handle.restart());
  const activeJsV2 = Array.from(mem.entries())
    .filter(([k]) => k.endsWith(".js") && !/^\\/?chunk-[A-Z0-9]+\\.js$/.test(k))
    .map(([, buf]) => buf.toString("utf8"))
    .join("\\n");
  assert.ok(activeJsV2.includes("DevBannerHotReloadedV2"), "Expected V2 DINOU_PUBLIC_DEV_BANNER after restart()");
  assert.ok(!activeJsV2.includes("DevBannerInitialV1"), "Stale V1 DINOU_PUBLIC_DEV_BANNER must be replaced in active chunks");
  assert.ok(!activeJsV2.includes("dinou_dev_private_never_leak_555"), "Private secret must stay excluded after restart()");
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

    const devProbeRes = spawnSync(process.execPath, [devChildScript], {
      cwd: tmpDevApp,
      encoding: "utf8",
      env: cleanDevEnv,
    });
    assert.equal(
      devProbeRes.status,
      0,
      `Dev env probe failed:\nSTDOUT:\n${devProbeRes.stdout}\nSTDERR:\n${devProbeRes.stderr}`
    );

    // Also run dinou/node/dev.js in DINOU_BUILD_DEV_ONLY=true mode to verify Pass B ssr-engine.mjs inlines DINOU_PUBLIC_* and strips secrets
    const devEngineRes = spawnSync(
      process.execPath,
      [path.join(dinouRoot, "node/dev.js")],
      {
        cwd: tmpDevApp,
        encoding: "utf8",
        env: {
          ...cleanDevEnv,
          DINOU_BUILD_DEV_ONLY: "true",
        },
      }
    );
    assert.equal(
      devEngineRes.status,
      0,
      `dinou/node/dev.js DINOU_BUILD_DEV_ONLY failed:\n${devEngineRes.stdout}\n${devEngineRes.stderr}`
    );
    const devSsrEngineTxt = collectFilesRecursive(
      path.join(tmpDevApp, ".dinou/node-dev")
    )
      .filter((f) => f.endsWith(".mjs") && !f.includes("rsc"))
      .map((f) => fs.readFileSync(f, "utf8"))
      .join("\n");
    assert(
      devSsrEngineTxt.includes("DevBannerHotReloadedV2"),
      "Expected dev ssr-engine.mjs to inline DINOU_PUBLIC_DEV_BANNER from .env.local"
    );
    assert(
      !devSsrEngineTxt.includes("dinou_dev_private_never_leak_555"),
      "Dev ssr-engine.mjs must NEVER inline PRIVATE_DEV_SECRET"
    );
  } finally {
    cleanupFixtureApp(devFixturesBase, tmpDevApp);
  }
}
console.log("   ✅ Section 5 passed!");

console.log(
  "6️⃣ Verifying 3-bundler (esbuild, rollup, webpack) + 4-runtime + export-static matrix & zero-secret-leak audit..."
);
{
  const { fixturesBase: matrixFixturesBase, tmpApp: tmpMatrixApp } =
    createFixtureApp("env-matrix-");
  const PRIVATE_SECRET_A = "dinou_matrix_top_secret_alpha_940";
  const PRIVATE_SECRET_B = "dinou_matrix_public_dotenv_secret_940";
  try {
    fs.mkdirSync(path.join(tmpMatrixApp, "src/items/[slug]"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tmpMatrixApp, "public"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpMatrixApp, ".env"),
      [
        `MATRIX_PRIVATE_TOKEN="${PRIVATE_SECRET_A}"`,
        'DINOU_PUBLIC_MATRIX_TITLE="MatrixBaseTitle"',
        'DINOU_PUBLIC_MATRIX_SHARED="SharedFromBaseEnv"',
      ].join("\n")
    );
    fs.writeFileSync(
      path.join(tmpMatrixApp, ".env.production"),
      'DINOU_PUBLIC_MATRIX_TITLE="MatrixProdTitle"\n'
    );
    fs.writeFileSync(
      path.join(tmpMatrixApp, "public/.env"),
      `ACCIDENTAL_PUBLIC_SECRET="${PRIVATE_SECRET_B}"\n`
    );
    fs.writeFileSync(
      path.join(tmpMatrixApp, "public/.env.production"),
      `ACCIDENTAL_PUBLIC_PROD="${PRIVATE_SECRET_B}"\n`
    );
    fs.writeFileSync(
      path.join(tmpMatrixApp, "public/robots.txt"),
      "User-agent: *\nAllow: /\n"
    );

    fs.writeFileSync(
      path.join(tmpMatrixApp, "src/layout.tsx"),
      `export default function Layout({ children }: { children: any }) {
        return <html><body>{children}</body></html>;
      }\n`
    );
    fs.writeFileSync(
      path.join(tmpMatrixApp, "src/ClientProbe.tsx"),
      `"use client";
      export function ClientProbe() {
        const { DINOU_PUBLIC_MATRIX_SHARED, MATRIX_PRIVATE_TOKEN } = process.env;
        return (
          <div
            data-title={process.env.DINOU_PUBLIC_MATRIX_TITLE ?? "missing"}
            data-shared={DINOU_PUBLIC_MATRIX_SHARED ?? "missing"}
            data-direct-secret={String(process.env.MATRIX_PRIVATE_TOKEN)}
            data-destructured-secret={String(MATRIX_PRIVATE_TOKEN)}
          >
            {process.env.DINOU_PUBLIC_MATRIX_TITLE}
          </div>
        );
      }\n`
    );
    fs.writeFileSync(
      path.join(tmpMatrixApp, "src/page.tsx"),
      `import { getContext } from "dinou";
      import { ClientProbe } from "./ClientProbe";
      export default function HomePage() {
        const { env } = getContext();
        return (
          <main data-server-ok={String(env.MATRIX_PRIVATE_TOKEN === "${PRIVATE_SECRET_A}")}>
            <ClientProbe />
          </main>
        );
      }\n`
    );
    fs.writeFileSync(
      path.join(tmpMatrixApp, "src/items/[slug]/page_functions.ts"),
      `export function getStaticPaths() { return ["seed"]; }\n`
    );
    fs.writeFileSync(
      path.join(tmpMatrixApp, "src/items/[slug]/page.tsx"),
      `export default function ItemPage({ params }: { params: { slug: string } }) {
        return <div data-slug={params.slug}>{params.slug}</div>;
      }\n`
    );

    const runCli = (subcmd) => {
      execFileSync(process.execPath, [cliPath, subcmd], {
        cwd: tmpMatrixApp,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "pipe",
      });
    };

    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      runCli(`build:node:${bundler}`);

      assertZeroSubstringInDir(
        path.join(tmpMatrixApp, ".dinou/dist3"),
        [PRIVATE_SECRET_A, PRIVATE_SECRET_B],
        `dist3 (${bundler})`
      );
      assertZeroSubstringInDir(
        path.join(tmpMatrixApp, ".dinou/dist2"),
        [PRIVATE_SECRET_A, PRIVATE_SECRET_B],
        `dist2 (${bundler})`
      );
      assert(
        !fs.existsSync(path.join(tmpMatrixApp, ".dinou/dist3/.env")),
        `Expected public/.env excluded from dist3 (${bundler})`
      );
      assert(
        !fs.existsSync(path.join(tmpMatrixApp, ".dinou/dist3/.env.production")),
        `Expected public/.env.production excluded from dist3 (${bundler})`
      );
      assert(
        fs.existsSync(path.join(tmpMatrixApp, ".dinou/dist3/robots.txt")),
        `Expected public/robots.txt preserved in dist3 (${bundler})`
      );

      const ssgHtml = fs.readFileSync(
        path.join(tmpMatrixApp, ".dinou/dist2/index.html"),
        "utf8"
      );
      assert(
        ssgHtml.includes("MatrixProdTitle") &&
          ssgHtml.includes("SharedFromBaseEnv") &&
          ssgHtml.includes('data-server-ok="true"') &&
          ssgHtml.includes('data-direct-secret="undefined"') &&
          ssgHtml.includes('data-destructured-secret="undefined"'),
        `SSG HTML mismatch for bundler ${bundler}`
      );
    }

    // Probe .dinou/node/server.mjs in-process via serverMod.fetch() in a clean child process (zero TCP port needed!)
    const prodProbeScript = path.join(tmpMatrixApp, "probe-prod-server.mjs");
    fs.writeFileSync(
      prodProbeScript,
      `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const serverMod = await import(pathToFileURL(path.resolve(".dinou/node/server.mjs")).href);

const homeRes = await serverMod.fetch(new Request("http://localhost/", { headers: { Accept: "text/html" } }));
assert.equal(homeRes.status, 200);
const homeHtml = await homeRes.text();
assert.ok(homeHtml.includes("MatrixProdTitle"));
assert.ok(homeHtml.includes("SharedFromBaseEnv"));
assert.ok(homeHtml.includes('data-server-ok="true"'));
assert.ok(!homeHtml.includes(${JSON.stringify(PRIVATE_SECRET_A)}));
assert.ok(!homeHtml.includes(${JSON.stringify(PRIVATE_SECRET_B)}));

// Dynamic [slug] request verifying runtime .env loading on server.mjs
const dynRes = await serverMod.fetch(new Request("http://localhost/items/live-slug", { headers: { Accept: "text/html" } }));
assert.equal(dynRes.status, 200);

// Anti-Bot .env* 404 Shield & zero [slug] ISG cache poisoning
for (const botProbe of [
  "/.env",
  "/.env.production",
  "/%2eenv",
  "/%252eenv",
  "/items/.env.production",
]) {
  const res = await serverMod.fetch(new Request("http://localhost" + botProbe));
  assert.equal(
    res.status,
    404,
    \`Expected 404 for bot probe \${botProbe}, got \${res.status}\`
  );
}
assert.ok(
  !fs.existsSync(path.resolve(".dinou/dist2/items/.env.production")),
  "Expected Anti-Bot Shield NOT to poison [slug] ISG dist2 cache"
);

const robotsRes = await serverMod.fetch(new Request("http://localhost/robots.txt"));
assert.equal(robotsRes.status, 200);
process.exit(0);
`,
      "utf8"
    );

    const prodProbeRes = spawnSync(process.execPath, [prodProbeScript], {
      cwd: tmpMatrixApp,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "production" },
    });
    assert.equal(
      prodProbeRes.status,
      0,
      `Prod server.mjs fetch probe failed:\n${prodProbeRes.stdout}\n${prodProbeRes.stderr}`
    );

    // Static Export verification
    runCli("export-static:esbuild");
    assertZeroSubstringInDir(
      path.join(tmpMatrixApp, "out"),
      [PRIVATE_SECRET_A, PRIVATE_SECRET_B],
      "out (export-static)"
    );
    assert(!fs.existsSync(path.join(tmpMatrixApp, "out/.env")));
    assert(!fs.existsSync(path.join(tmpMatrixApp, "out/.env.production")));
    assert(fs.existsSync(path.join(tmpMatrixApp, "out/robots.txt")));

    // Cloudflare, Bun & Deno build verification
    runCli("build:cloudflare:esbuild");
    assertZeroSubstringInDir(
      path.join(tmpMatrixApp, ".dinou/cloudflare/assets"),
      [PRIVATE_SECRET_A, PRIVATE_SECRET_B],
      "cloudflare/assets"
    );
    assert(
      !fs.existsSync(path.join(tmpMatrixApp, ".dinou/cloudflare/assets/.env"))
    );
    const cfSsr = fs.readFileSync(
      path.join(tmpMatrixApp, ".dinou/cloudflare/ssr-engine.js"),
      "utf8"
    );
    assert(cfSsr.includes("MatrixProdTitle"));
    assert(!cfSsr.includes(PRIVATE_SECRET_A));

    runCli("build:bun:esbuild");
    const bunServer = fs.readFileSync(
      path.join(tmpMatrixApp, ".dinou/bun/server.js"),
      "utf8"
    );
    assert(bunServer.includes("loadEnvFiles"));

    runCli("build:deno:esbuild");
    const denoMain = fs.readFileSync(
      path.join(tmpMatrixApp, ".dinou/deno/main.js"),
      "utf8"
    );
    const denoSsr = fs.readFileSync(
      path.join(tmpMatrixApp, ".dinou/deno/ssr-engine.js"),
      "utf8"
    );
    assert(denoMain.includes("loadEnvFiles"));
    assert(denoSsr.includes("MatrixProdTitle"));
    assert(!denoSsr.includes(PRIVATE_SECRET_A));
  } finally {
    cleanupFixtureApp(matrixFixturesBase, tmpMatrixApp);
  }
}
console.log("   ✅ Section 6 passed!");

for (const [rel, before] of manifestSnapshotBefore.entries()) {
  const abs = path.join(projectRoot, rel);
  const after = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
  assert.equal(
    after,
    before,
    `Host manifest ${rel} was unexpectedly modified by verify-env-vars-ci.mjs`
  );
}

console.log(
  "\n🎉 All 6 Dinou v9.4.0 Environment Variables, DINOU_PUBLIC_* & Anti-Bot Shield verification suites PASSED!"
);
