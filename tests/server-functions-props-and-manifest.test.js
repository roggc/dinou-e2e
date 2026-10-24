import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

test("Server Functions: reachable modules are registered and unimported modules are excluded", async () => {
  const manifestPath = path.join(projectRoot, ".dinou", "server_functions_manifest", "server-functions-manifest.json");
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

    // 1. Rollup Plugin
    const { default: rollupPluginFn } = await import("../dinou/rollup/rollup-plugins/rollup-plugin-server-functions.js");
    const { default: manifestGeneratorPlugin } = await import("../dinou/rollup/rollup-plugins/manifest-generator-plugin.js");
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
  const { default: esbuildPluginFn } = await import("../dinou/esbuild/plugins-esbuild/server-functions-plugin.js");
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
  const { default: WebpackPluginClass } = await import("../dinou/webpack/plugins/server-functions-plugin.js");
  const { default: webpackManifestGenerator } = await import("../dinou/webpack/plugins/manifest-generator-plugin.js");
  webpackManifestGenerator.manifestData = { "serverFunctionProxy.js": "serverFunctionProxy.js" };
  const webpackPlugin = new WebpackPluginClass({ serverFiles: new Set([pagePath]) });
  let processAssetsCb;
  let emittedManifest = null;
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
            emitAsset: (filename, rawSource) => {
              if (filename === "server-functions-manifest.json") {
                emittedManifest = JSON.parse(rawSource.source);
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
  assert.ok(emittedManifest, "Webpack must emit server-functions-manifest.json");
  const webpackPageKey = Object.keys(emittedManifest).find((k) => k.replace(/\\/g, "/").includes("t-sf-props/page"));
  assert.ok(webpackPageKey, "Webpack must register page with body-level server functions when client bundle has 0 module-level actions");
  assert.ok(emittedManifest[webpackPageKey].includes("unexportedModuleAction"));
  assert.ok(emittedManifest[webpackPageKey].some((fn) => fn.startsWith("$$dinou_action_inlineAction_")));
  } finally {
    process.env.DINOU_WRITE_TO_DISK = originalWriteToDisk;
    process.env.NODE_ENV = originalNodeEnv;
  }
});
