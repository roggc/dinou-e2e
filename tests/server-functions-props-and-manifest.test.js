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
});
