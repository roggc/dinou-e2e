// tests/type-safe-contextual.test.mjs
// Verifies Dinou's Route-Contextual "./dinou" modules & Horizontal Type-Safe Routing:
// 1. Standalone `generateRouteTypes` topology & `.dinou/routes/**/{dinou.js,dinou.d.ts}` generation
// 2. Non-route (`src/components`) & private (`_components`) directory exclusion
// 3. Strict TypeScript (`tsc --noEmit` programmatic check via `tsconfig.json` `rootDirs`)
//    covering all positive files + `@ts-expect-error` negative assertions (TS2578 guard)
// 4. In-memory virtual `src/components/__ci_bad_contextual_probe__.tsx` check asserting TS2307
//    (zero files written/deleted inside `src/`, safe alongside running dev/prod servers)
// 5. Isolated temp-workspace check for hot route addition, automatic pruning, and shadow warnings

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();

function collectTsFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(fullPath, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  });
}

function resolveDinouCoreUrl(fileName) {
  const candidates = [
    path.resolve(root, "dinou/core", fileName),
    path.resolve(root, "node_modules/dinou/dinou/core", fileName),
    path.resolve(root, "node_modules/dinou/core", fileName),
  ];
  const found = candidates.find((c) => fs.existsSync(c)) ?? candidates[0];
  return pathToFileURL(found).href;
}

async function main() {
  const { generateRouteTypes } = await import(
    resolveDinouCoreUrl("generate-route-types.js")
  );

  // 1. Ensure route types & contextual "./dinou" modules are up to date (writeFileIfChanged is idempotent)
  generateRouteTypes(root);

  const routesDtsPath = path.join(root, ".dinou/types/routes.d.ts");
  assert(fs.existsSync(routesDtsPath), "Expected .dinou/types/routes.d.ts to exist");
  const routesDtsContent = fs.readFileSync(routesDtsPath, "utf8");
  assert(
    routesDtsContent.includes('"/t-type-safe-contextual/[slug]": { sidebar?: ReactNode }'),
    "Expected DinouLayoutSlotsMap to auto-infer sidebar?: ReactNode for /t-type-safe-contextual/[slug]"
  );
  assert(
    routesDtsContent.includes('"/t-type-safe-contextual/[slug]/@sidebar": { slug: string }'),
    "Expected DinouSlotParamsMap to include /t-type-safe-contextual/[slug]/@sidebar"
  );

  // 2. Assert contextual modules exist for route dirs & do NOT exist for non-route / _private dirs
  const expectedRouteDirs = [
    "t-type-safe-contextual",
    "t-type-safe-contextual/(marketing)",
    "t-type-safe-contextual/(marketing)/pricing",
    "t-type-safe-contextual/[slug]",
    "t-type-safe-contextual/[slug]/@sidebar",
    "t-type-safe-contextual/[slug]/contact",
    "t-type-safe-contextual/[slug]/contact/sub",
  ];
  for (const rel of expectedRouteDirs) {
    assert(
      fs.existsSync(path.join(root, ".dinou/routes", rel, "dinou.d.ts")),
      `Expected contextual dinou.d.ts for route dir: ${rel}`
    );
    assert(
      fs.existsSync(path.join(root, ".dinou/routes", rel, "dinou.js")),
      `Expected contextual dinou.js for route dir: ${rel}`
    );
  }

  const forbiddenDirs = [
    "components",
    "demo/components",
    "t-type-safe-contextual/[slug]/contact/components",
  ];
  for (const rel of forbiddenDirs) {
    assert(
      !fs.existsSync(path.join(root, ".dinou/routes", rel, "dinou.d.ts")),
      `Expected NO contextual dinou.d.ts for non-route/private dir: ${rel}`
    );
    assert(
      !fs.existsSync(path.join(root, ".dinou/routes", rel, "dinou.js")),
      `Expected NO contextual dinou.js for non-route/private dir: ${rel}`
    );
  }
  console.log("✅ [1/5] Topology & .dinou/routes boundary generation PASSED");

  // 3. Parse root tsconfig.json (verifying rootDirs) and run strict TypeScript check
  const tsconfigPath = path.join(root, "tsconfig.json");
  const readRes = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  assert(!readRes.error, `Failed to read tsconfig.json: ${readRes.error?.messageText}`);
  const parsed = ts.parseJsonConfigFileContent(readRes.config, ts.sys, root);
  assert(
    Array.isArray(parsed.options.rootDirs) && parsed.options.rootDirs.length >= 2,
    'Expected compilerOptions.rootDirs: ["src", ".dinou/routes"] in tsconfig.json'
  );

  const fixtureFiles = collectTsFiles(path.join(root, "src/t-type-safe-contextual"));
  const rootNames = [
    ...fixtureFiles,
    path.join(root, "dinou-env.d.ts"),
    routesDtsPath,
  ];

  const program = ts.createProgram({
    rootNames,
    options: parsed.options,
  });

  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(
      `Strict TypeScript check failed with ${diagnostics.length} diagnostic(s):\n` +
        formatDiagnostics(diagnostics)
    );
  }
  console.log(
    `✅ [2/5] Strict tsc check (${fixtureFiles.length} contextual files + @ts-expect-error assertions) PASSED`
  );

  // 4. In-memory virtual probe: importing "./dinou" inside src/components/ MUST fail with TS2307
  const virtualProbePath = path
    .resolve(root, "src/components/__ci_bad_contextual_probe__.tsx")
    .replace(/\\/g, "/");
  const virtualProbeCode =
    'import { Link } from "./dinou";\nexport const Bad = () => <Link to="/">Home</Link>;\n';

  const baseHost = ts.createCompilerHost(parsed.options);
  const origFileExists = baseHost.fileExists.bind(baseHost);
  const origReadFile = baseHost.readFile.bind(baseHost);
  const origGetSourceFile = baseHost.getSourceFile.bind(baseHost);

  const isVirtualProbe = (fileName) =>
    path.resolve(fileName).replace(/\\/g, "/") === virtualProbePath;

  baseHost.fileExists = (fileName) =>
    isVirtualProbe(fileName) ? true : origFileExists(fileName);
  baseHost.readFile = (fileName) =>
    isVirtualProbe(fileName) ? virtualProbeCode : origReadFile(fileName);
  baseHost.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (isVirtualProbe(fileName)) {
      return ts.createSourceFile(fileName, virtualProbeCode, languageVersion, true, ts.ScriptKind.TSX);
    }
    return origGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const badProgram = ts.createProgram({
    rootNames: [...rootNames, virtualProbePath],
    options: parsed.options,
    host: baseHost,
    oldProgram: program,
  });
  const probeSourceFile = badProgram.getSourceFile(virtualProbePath);
  assert(probeSourceFile, "Expected virtual probe source file in program");
  const probeDiagnostics = ts.getPreEmitDiagnostics(badProgram, probeSourceFile);
  const hasTS2307 = probeDiagnostics.some((d) => d.code === 2307);
  assert(
    hasTS2307,
    `Expected TS2307 when importing "./dinou" from src/components/, got: ${formatDiagnostics(
      probeDiagnostics
    )}`
  );
  console.log('✅ [3/5] Non-route src/components "./dinou" TS2307 rejection PASSED');

  // 5. Isolated temp-workspace check: hot route addition, pruning & physical shadow warning
  const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-ctx-prune-"));
  try {
    fs.mkdirSync(path.join(tmpWorkspace, "src/hot-added"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpWorkspace, "src/page.tsx"),
      "export default function Home() { return null; }\n"
    );
    fs.writeFileSync(
      path.join(tmpWorkspace, "src/hot-added/page.tsx"),
      "export default function Hot() { return null; }\n"
    );
    generateRouteTypes(tmpWorkspace);
    assert(
      fs.existsSync(path.join(tmpWorkspace, ".dinou/routes/hot-added/dinou.js")),
      "Expected .dinou/routes/hot-added/dinou.js after adding route"
    );

    // Delete src/hot-added and verify automatic pruning
    fs.rmSync(path.join(tmpWorkspace, "src/hot-added"), { recursive: true, force: true });
    generateRouteTypes(tmpWorkspace);
    assert(
      !fs.existsSync(path.join(tmpWorkspace, ".dinou/routes/hot-added")),
      "Expected .dinou/routes/hot-added to be pruned after deleting route folder"
    );

    // Physical shadow warning check
    fs.writeFileSync(path.join(tmpWorkspace, "src/dinou.ts"), "export const x = 1;\n");
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      generateRouteTypes(tmpWorkspace);
    } finally {
      console.warn = origWarn;
    }
    assert(
      warnings.some((w) => w.includes('shadows the generated route-contextual "./dinou" module')),
      "Expected warning when physical src/dinou.ts shadows contextual './dinou'"
    );
  } finally {
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  }
  console.log("✅ [4/5] Hot route generation, pruning & shadow warning PASSED");

  // 6. Router specificity & Linux ext4 directory-order regression check:
  //    Even when VFS lists `[slug]` BEFORE `(marketing)` (as on Linux ext4 under Bun),
  //    `/t-type-safe-contextual/pricing` MUST resolve to `(marketing)/pricing/page.tsx`
  //    AND its layouts MUST NOT include sibling `[slug]/layout.tsx`.
  const { getFilePathAndDynamicParams } = await import(
    resolveDinouCoreUrl("get-file-path-and-dynamic-params.js")
  );
  const { buildVfs } = await import(resolveDinouCoreUrl("vfs.js"));
  const { discoverLayoutsFromFs } = await import(
    resolveDinouCoreUrl("discover-layouts.js")
  );

  const srcDir = path.resolve(root, "src");
  const prevVfs = globalThis.__DINOU_VFS__;
  try {
    globalThis.__DINOU_VFS__ = {};
    buildVfs(srcDir, srcDir);

    // Force reversed Linux ext4 htree directory order (`[slug]` BEFORE `(marketing)`) on all VFS keys for `src/t-type-safe-contextual`
    for (const [k, entry] of Object.entries(globalThis.__DINOU_VFS__)) {
      if (
        entry?.type === "directory" &&
        Array.isArray(entry.children) &&
        k.endsWith("t-type-safe-contextual")
      ) {
        entry.children = [
          { name: "[slug]", isDirectory: true },
          { name: "page.tsx", isDirectory: false },
          { name: "(marketing)", isDirectory: true },
        ];
      }
    }

    const [pricingPage, pricingParams] = getFilePathAndDynamicParams(
      ["t-type-safe-contextual", "pricing"],
      {},
      srcDir
    );
    assert(
      pricingPage &&
        pricingPage.replace(/\\/g, "/").endsWith("src/t-type-safe-contextual/(marketing)/pricing/page.tsx"),
      `Expected /t-type-safe-contextual/pricing to resolve to (marketing)/pricing/page.tsx even when [slug] precedes (marketing), got: ${pricingPage}`
    );
    assert.deepEqual(pricingParams, {});

    const pricingLayouts = getFilePathAndDynamicParams(
      ["t-type-safe-contextual", "pricing"],
      {},
      srcDir,
      "layout",
      true,
      false,
      undefined,
      0,
      {},
      true
    );
    const pricingLayoutPaths = pricingLayouts.map(([p]) => p.replace(/\\/g, "/"));
    assert(
      !pricingLayoutPaths.some((p) => p.includes("[slug]/layout.tsx")),
      `Expected [slug]/layout.tsx NOT to leak onto (marketing)/pricing, got: ${JSON.stringify(
        pricingLayoutPaths
      )}`
    );

    // Backtracking check: /t-type-safe-contextual/pricing/contact has no subroute inside (marketing)/pricing,
    // so it MUST backtrack to [slug]/contact/page.tsx with { slug: "pricing" } and include [slug]/layout.tsx!
    const [pricingContactPage, pricingContactParams] = getFilePathAndDynamicParams(
      ["t-type-safe-contextual", "pricing", "contact"],
      {},
      srcDir
    );
    assert(
      pricingContactPage &&
        pricingContactPage
          .replace(/\\/g, "/")
          .endsWith("src/t-type-safe-contextual/[slug]/contact/page.tsx"),
      `Expected /t-type-safe-contextual/pricing/contact to backtrack to [slug]/contact/page.tsx, got: ${pricingContactPage}`
    );
    assert.deepEqual(pricingContactParams, { slug: "pricing" });

    // Standalone layout & 404 under [slug] must still resolve [slug]/layout.tsx and [slug]/not_found.tsx
    const acmeLayouts = getFilePathAndDynamicParams(
      ["t-type-safe-contextual", "acme"],
      {},
      srcDir,
      "layout",
      true,
      false,
      undefined,
      0,
      {},
      true
    );
    assert(
      acmeLayouts.some(([p]) => p.replace(/\\/g, "/").endsWith("[slug]/layout.tsx")),
      "Expected standalone /t-type-safe-contextual/acme layout lookup to include [slug]/layout.tsx"
    );

    const [acmeNotFound, acmeNotFoundParams] = getFilePathAndDynamicParams(
      ["t-type-safe-contextual", "acme", "unknown-subroute"],
      {},
      srcDir,
      "not_found",
      true,
      false
    );
    assert(
      acmeNotFound &&
        acmeNotFound.replace(/\\/g, "/").endsWith("[slug]/not_found.tsx"),
      `Expected 404 under /t-type-safe-contextual/acme/unknown-subroute to resolve [slug]/not_found.tsx, got: ${acmeNotFound}`
    );
    assert.deepEqual(acmeNotFoundParams, { slug: "acme" });

    // Client layout discovery rule check
    const discovered = discoverLayoutsFromFs(srcDir, fs);
    assert(
      discovered.includes("=t-type-safe-contextual/pricing:0"),
      `Expected discoverLayoutsFromFs to emit '=t-type-safe-contextual/pricing:0', got: ${JSON.stringify(
        discovered.filter((x) => x.includes("t-type-safe-contextual"))
      )}`
    );
  } finally {
    if (prevVfs === undefined) {
      delete globalThis.__DINOU_VFS__;
    } else {
      globalThis.__DINOU_VFS__ = prevVfs;
    }
  }
  console.log(
    "✅ [5/5] Router specificity, backtracking, sibling layout isolation & Linux ext4 VFS order PASSED"
  );
  console.log("RESULT: All 5 contextual './dinou' & router tests PASSED");
}

main().catch((err) => {
  console.error("❌ [type-safe-contextual.test.mjs] FAILED:", err);
  process.exit(1);
});
