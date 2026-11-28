import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function resolveDinouBase() {
  return fs.existsSync(new URL("../dinou/core/handler.js", import.meta.url))
    ? "../dinou"
    : fs.existsSync(new URL("../node_modules/dinou/dinou/core/handler.js", import.meta.url))
      ? "../node_modules/dinou/dinou"
      : "../node_modules/dinou";
}

async function ensureServerFunctionsManifest(dist1Manifest, nodeDevManifest) {
  if (fs.existsSync(dist1Manifest) || fs.existsSync(nodeDevManifest)) {
    return;
  }
  const dinouBase = resolveDinouBase();
  const dinouAbs = path.resolve(__dirname, dinouBase);
  const prevNodeEnv = process.env.NODE_ENV;
  const prevDinouDev = process.env.DINOU_DEV;
  const prevWriteToDisk = process.env.DINOU_WRITE_TO_DISK;
  process.env.NODE_ENV = "production";
  delete process.env.DINOU_DEV;
  process.env.DINOU_WRITE_TO_DISK = "true";

  try {
    const { default: esbuild } = await import("esbuild");
    const { default: getEsbuildEntries } = await import(
      `${dinouBase}/esbuild/helpers-esbuild/get-esbuild-entries.js`
    );
    const { default: getConfigEsbuildProd } = await import(
      `${dinouBase}/esbuild/helpers-esbuild/get-config-esbuild-prod.js`
    );
    const { getDinouConfig } = await import(`${dinouBase}/core/load-dinou-config.js`);

    const dinouConfig = await getDinouConfig();
    const manifest = {};
    const [esbuildEntries, detectedCSSEntries, detectedAssetEntries, serverFiles] =
      await getEsbuildEntries({ manifest, dinouConfig });

    const entryPoints = {
      main: path.resolve(dinouAbs, "core/client.jsx"),
      serverFunctionProxy: path.resolve(dinouAbs, "core/server-function-proxy.js"),
      dinouClientRedirect: path.resolve(dinouAbs, "core/client-redirect.jsx"),
      dinouLink: path.resolve(dinouAbs, "core/link.jsx"),
      dinouSlot: path.resolve(dinouAbs, "core/slot.js"),
      ...[...esbuildEntries].reduce((acc, e) => ({ ...acc, [e.outfileName]: e.absPath }), {}),
      ...[...detectedCSSEntries].reduce((acc, e) => ({ ...acc, [e.outfileName]: e.absPath }), {}),
    };

    await esbuild.build(
      getConfigEsbuildProd({
        entryPoints,
        manifest,
        outdir: ".dinou/dist3",
        serverFiles,
        serverAssetPaths: [...detectedAssetEntries].map((a) => a.absPath),
        dinouConfig,
        reactCompiler: false,
      })
    );
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevDinouDev === undefined) delete process.env.DINOU_DEV;
    else process.env.DINOU_DEV = prevDinouDev;
    if (prevWriteToDisk === undefined) delete process.env.DINOU_WRITE_TO_DISK;
    else process.env.DINOU_WRITE_TO_DISK = prevWriteToDisk;
  }
}

test("Server Functions: reachable modules are registered and unimported modules are excluded", async () => {
  const dist1Manifest = path.join(projectRoot, ".dinou", "dist1", "server-functions-manifest.json");
  const nodeDevManifest = path.join(projectRoot, ".dinou", "node-dev", "server-functions-manifest.json");
  await ensureServerFunctionsManifest(dist1Manifest, nodeDevManifest);
  const manifestPath = fs.existsSync(dist1Manifest) ? dist1Manifest : nodeDevManifest;
  assert.ok(fs.existsSync(manifestPath), `Manifest must exist at ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const keys = Object.keys(manifest).map((k) => k.replace(/\\/g, "/"));

  // 1. Module imported by Server Component and passed as props must be in manifest
  const hasPropsActions = keys.some((k) => k.includes("t-sf-props/actions"));
  assert.strictEqual(hasPropsActions, true, "t-sf-props/actions.ts must be in the manifest");

  const propsActionsKey = Object.keys(manifest).find((k) => k.replace(/\\/g, "/").includes("t-sf-props/actions"));
  const exportedFns = manifest[propsActionsKey];
  assert.deepStrictEqual(exportedFns.sort(), ["boundAction", "echoAction", "formAction"].sort(), "All 3 actions must be registered");

  // 2. Unimported module with 'use server' must NOT be in manifest
  const hasOrphan = keys.some((k) => k.includes("orphan-action"));
  assert.strictEqual(hasOrphan, false, "orphan-action.ts must NOT be in the manifest");

  // 3. Module imported by Client Component must be in manifest
  const hasCacheSlotActions = keys.some((k) => k.includes("t-cache-slot/actions"));
  assert.strictEqual(hasCacheSlotActions, true, "t-cache-slot/actions.ts imported by Client Component must be in manifest");

  // 4. Page declaring inline and unexported server functions with "use server" in body must be in manifest
  const pageKey = Object.keys(manifest).find((k) => k.replace(/\\/g, "/").includes("t-sf-props/page"));
  assert.ok(pageKey, "t-sf-props/page.tsx must be in the manifest");
  const pageFns = manifest[pageKey];
  assert.ok(pageFns.includes("unexportedModuleAction"), "unexportedModuleAction must be registered in page");
  assert.ok(pageFns.some((fn) => fn.startsWith("$$dinou_action_inlineAction_")), "inlineAction must be registered in page");
});

test("Server Functions: Rollup, esbuild and Webpack plugins process serverFiles before manifest generation when only body 'use server' exists", async () => {
  const originalWriteToDisk = process.env.DINOU_WRITE_TO_DISK;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.DINOU_WRITE_TO_DISK = "false";
  process.env.NODE_ENV = "production";

  try {
    const pagePath = path.resolve(projectRoot, "src/t-sf-props/page.tsx");
    const dinouBase = fs.existsSync(new URL("../dinou/core/handler.js", import.meta.url))
      ? "../dinou"
      : fs.existsSync(new URL("../node_modules/dinou/dinou/core/handler.js", import.meta.url))
        ? "../node_modules/dinou/dinou"
        : "../node_modules/dinou";

    // 1. Rollup Plugin
    const { default: rollupPluginFn } = await import(`${dinouBase}/rollup/rollup-plugins/rollup-plugin-server-functions.js`);
    const { default: manifestGeneratorPlugin } = await import(`${dinouBase}/rollup/rollup-plugins/manifest-generator-plugin.js`);
    manifestGeneratorPlugin.manifestData = { "serverFunctionProxy.js": "serverFunctionProxy.js" };
    const rollupPlugin = rollupPluginFn({ serverFiles: new Set([pagePath]) });
    // Notice: no transform() called, so serverFunctions Map starts empty (size === 0)
    await rollupPlugin.generateBundle({}, {});
  const rollupManifest = globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__ || {};
  const rollupPageKey = Object.keys(rollupManifest).find((k) => k.replace(/\\/g, "/").includes("t-sf-props/page"));
  assert.ok(rollupPageKey, "Rollup must register page with body-level server functions when client bundle has 0 module-level actions");
  assert.ok(rollupManifest[rollupPageKey].includes("unexportedModuleAction"));
  assert.ok(rollupManifest[rollupPageKey].some((fn) => fn.startsWith("$$dinou_action_inlineAction_")));

  // 2. esbuild Plugin
  const { default: esbuildPluginFn } = await import(`${dinouBase}/esbuild/plugins-esbuild/server-functions-plugin.js`);
  const esbuildPlugin = esbuildPluginFn({
    serverFiles: new Set([pagePath]),
    manifestData: { "serverFunctionProxy.js": "serverFunctionProxy.js" }
  });
  let onEndCb;
  const mockEsbuild = {
    onStart: () => {},
    onLoad: () => {},
    onEnd: (cb) => { onEndCb = cb; }
  };
  esbuildPlugin.setup(mockEsbuild);
  // Notice: onLoad was never invoked, serverFunctions Map starts empty (size === 0)
  await onEndCb({ outputFiles: [] });
  const esbuildManifest = globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__ || {};
  const esbuildPageKey = Object.keys(esbuildManifest).find((k) => k.replace(/\\/g, "/").includes("t-sf-props/page"));
  assert.ok(esbuildPageKey, "esbuild must register page with body-level server functions when client bundle has 0 module-level actions");
  assert.ok(esbuildManifest[esbuildPageKey].includes("unexportedModuleAction"));
  assert.ok(esbuildManifest[esbuildPageKey].some((fn) => fn.startsWith("$$dinou_action_inlineAction_")));

  // 3. Webpack Plugin
  const { default: WebpackPluginClass } = await import(`${dinouBase}/webpack/plugins/server-functions-plugin.js`);
  const { default: webpackManifestGenerator } = await import(`${dinouBase}/webpack/plugins/manifest-generator-plugin.js`);
  webpackManifestGenerator.manifestData = { "serverFunctionProxy.js": "serverFunctionProxy.js" };
  delete globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__;
  const webpackPlugin = new WebpackPluginClass({ serverFiles: new Set([pagePath]) });
  let processAssetsCb;
  let leakedPublicManifestAsset = false;
  const mockCompiler = {
    webpack: {
      Compilation: { PROCESS_ASSETS_STAGE_REPORT: "report" },
      sources: { RawSource: class { constructor(source) { this.source = source; } } }
    },
    hooks: {
      thisCompilation: {
        tap: (name, fn) => {
          const compilation = {
            chunks: [],
            emitAsset: (filename) => {
              if (filename === "server-functions-manifest.json") {
                leakedPublicManifestAsset = true;
              }
            },
            hooks: {
              processAssets: {
                tap: (opts, cb) => { processAssetsCb = cb; }
              }
            }
          };
          fn(compilation);
        }
      }
    }
  };
  webpackPlugin.apply(mockCompiler);
  // Notice: loader never outputted any temporary JSON files into assets
  processAssetsCb({});
  assert.strictEqual(leakedPublicManifestAsset, false, "Webpack must NOT emit server-functions-manifest.json into public dist3 compilation assets");
  const emittedManifest = globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__;
  assert.ok(emittedManifest, "Webpack must populate globalThis.__DINOU_RAW_SERVER_FUNCTIONS_MANIFEST__");
  const webpackPageKey = Object.keys(emittedManifest).find((k) => k.replace(/\\/g, "/").includes("t-sf-props/page"));
  assert.ok(webpackPageKey, "Webpack must register page with body-level server functions when client bundle has 0 module-level actions");
  assert.ok(emittedManifest[webpackPageKey].includes("unexportedModuleAction"));
  assert.ok(emittedManifest[webpackPageKey].some((fn) => fn.startsWith("$$dinou_action_inlineAction_")));
  } finally {
    process.env.DINOU_WRITE_TO_DISK = originalWriteToDisk;
    process.env.NODE_ENV = originalNodeEnv;
  }
});
