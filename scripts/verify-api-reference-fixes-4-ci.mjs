// scripts/verify-api-reference-fixes-4-ci.mjs
// Verifies Dinou v9.4.0 API Reference Batch 4 Fixes (x-api-reference-fixes-4.md):
// 1. JS syntax check & source contracts in handler.js, layout-functions.js & build-static-pages.js
// 2. Tri-bundler (esbuild, rollup, webpack) integration:
//    - allowISG: false normalization for numeric ({ id: 1 }, { numTenant: 42 }) & catch-all array ({ slug: ["docs", "intro"] }) getStaticPaths objects
//    - Authoritative cached HTML + cached RSC (/____rsc_page____, /____rsc_page_static____, /____rsc_layout____) validateParams veto
//    - Strict root-to-child layout-before-page perimeter short-circuit
//    - Build-time SSG layout_functions.ts getStaticPaths expansion across [[param]], [...slug], and [[...slug]]

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
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
const DINOU_ROOT =
  dinouRootCandidates.find((dir) => fs.existsSync(path.join(dir, "cli.js"))) ??
  dinouRootCandidates[0];
const CLI_PATH = path.join(DINOU_ROOT, "cli.js");

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

function writeDinouShim(appDir) {
  const dinouShimDir = path.join(appDir, "node_modules", "dinou");
  fs.mkdirSync(dinouShimDir, { recursive: true });
  const dinouIndexPath = path.join(DINOU_ROOT, "index.js").replace(/\\/g, "/");
  const dinouServerPath = path.join(DINOU_ROOT, "server.js").replace(/\\/g, "/");
  const dinouConfigPath = path
    .join(DINOU_ROOT, "core", "config.js")
    .replace(/\\/g, "/");

  fs.writeFileSync(
    path.join(dinouShimDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "9.4.0",
        type: "module",
        exports: {
          ".": "./index.js",
          "./server": "./server.js",
          "./config": "./config.js",
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "index.js"),
    `export * from ${JSON.stringify(dinouIndexPath)};\nexport { default } from ${JSON.stringify(dinouIndexPath)};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "server.js"),
    `export * from ${JSON.stringify(dinouServerPath)};\n`
  );
  fs.writeFileSync(
    path.join(dinouShimDir, "config.js"),
    `export * from ${JSON.stringify(dinouConfigPath)};\nexport { default } from ${JSON.stringify(dinouConfigPath)};\n`
  );
}

const fixturesParent = path.join(
  projectRoot,
  ".dinou",
  "tmp-api-ref-4-ci-fixtures"
);
fs.mkdirSync(fixturesParent, { recursive: true });
const tmpBase = fs.mkdtempSync(path.join(fixturesParent, "run-"));

try {
  // =========================================================================
  // 1️⃣ Syntax Check & Source Contracts
  // =========================================================================
  console.log(
    "1️⃣ Verifying JS syntax & source contracts in handler.js, layout-functions.js & build-static-pages.js..."
  );
  {
    for (const rel of [
      "core/handler.js",
      "core/layout-functions.js",
      "core/build-static-pages.js",
    ]) {
      const abs = path.join(DINOU_ROOT, rel);
      const checkRes = spawnSync(process.execPath, ["--check", abs], {
        encoding: "utf8",
      });
      assert.equal(
        checkRes.status,
        0,
        `node --check failed for ${rel}:\n${checkRes.stderr}`
      );
    }

    const handlerSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core", "handler.js"),
      "utf8"
    );
    assert.match(handlerSrc, /for \(let i = perimeterLayoutChain\.length - 1; i >= 0; i--\)/);
    assert.match(handlerSrc, /for \(let i = activeLayoutsForRoute\.length - 1; i >= 0; i--\)/);
    assert.match(handlerSrc, /if \(isPathBlocked\) \{\s*return new Response\("Not Found", \{ status: 404 \}\);/);
    assert.match(handlerSrc, /if \(Array\.isArray\(pathObj\)\) \{\s*return pathObj\.join\(",\"\);/);

    const layoutFnSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core", "layout-functions.js"),
      "utf8"
    );
    assert.match(layoutFnSrc, /if \(Array\.isArray\(p\)\) \{\s*return p\.join\(",\"\);/);

    const buildStaticSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core", "build-static-pages.js"),
      "utf8"
    );
    const hasLocalLayoutMatches =
      buildStaticSrc.match(/if \(\(isLocalPage \|\| hasLocalLayout\) && !\(await isDynamicRoute\(revalidate\)\)\)/g) || [];
    assert.ok(
      hasLocalLayoutMatches.length >= 4,
      `Expected all 4 dynamic bracket branches in build-static-pages.js to check hasLocalLayout, found ${hasLocalLayoutMatches.length}`
    );
  }
  console.log("   ✅ Section 1 passed!");

  // =========================================================================
  // 2️⃣ Tri-Bundler (Esbuild, Rollup, Webpack) Route Contracts & Perimeter Veto Integration
  // =========================================================================
  console.log(
    "2️⃣ Verifying tri-bundler (esbuild, rollup, webpack) allowISG normalization, cached HTML+RSC validateParams veto, root-to-child short-circuit & dynamic layout getStaticPaths..."
  );
  {
    const storageModUrl = pathToFileURL(
      path.join(DINOU_ROOT, "core", "storage-adapter.js")
    ).href;

    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      const appDir = path.join(tmpBase, `contracts-ref4-${bundler}`);
      fs.mkdirSync(path.join(appDir, "src", "num", "[id]"), { recursive: true });
      fs.mkdirSync(path.join(appDir, "src", "num-layout", "[numTenant]", "info"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(appDir, "src", "catch", "[...slug]"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(appDir, "src", "org", "[tenant]", "item", "[id]"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(appDir, "src", "opt", "[[locale]]", "about"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(appDir, "src", "ca", "[...section]", "view"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(appDir, "src", "oca", "[[...seg]]", "doc"), {
        recursive: true,
      });

      fs.writeFileSync(
        path.join(appDir, "package.json"),
        JSON.stringify(
          { name: `ci-ref4-${bundler}`, type: "module", private: true },
          null,
          2
        )
      );
      writeDinouShim(appDir);

      fs.writeFileSync(
        path.join(appDir, "src", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "page.tsx"),
        `export default function Home() { return <main>Home</main>; }\n`
      );

      fs.writeFileSync(
        path.join(appDir, "src", "num", "[id]", "page_functions.ts"),
        `export const getStaticPaths = [{ id: 1 }, { id: 2 }];\nexport const allowISG = false;\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "num", "[id]", "page.tsx"),
        `export default function NumPage({ params }: { params: { id: string } }) { return <main>Num:{params.id}</main>; }\n`
      );

      fs.writeFileSync(
        path.join(appDir, "src", "num-layout", "[numTenant]", "layout_functions.ts"),
        `export const getStaticPaths = [{ numTenant: 42 }];\nexport const allowISG = false;\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "num-layout", "[numTenant]", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function NumLayout({ children, params }: { children: ReactNode; params: { numTenant: string } }) {
  return <section data-nt={params.numTenant}>{children}</section>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "num-layout", "[numTenant]", "info", "page.tsx"),
        `export default function NumInfo({ params }: { params: { numTenant: string } }) { return <main>Info:{params.numTenant}</main>; }\n`
      );

      fs.writeFileSync(
        path.join(appDir, "src", "catch", "[...slug]", "page_functions.ts"),
        `export const getStaticPaths = [{ slug: ["docs", "intro"] }];\nexport const allowISG = false;\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "catch", "[...slug]", "page.tsx"),
        `export default function CatchPage({ params }: { params: { slug: string[] } }) { return <main>Catch:{params.slug.join("/")}</main>; }\n`
      );

      fs.writeFileSync(
        path.join(appDir, "src", "org", "[tenant]", "layout_functions.ts"),
        `export const getStaticPaths = [{ tenant: "acme" }];
export function validateParams(params: { tenant: string }) {
  const log = ((globalThis as any).__VAL_ORD__ = (globalThis as any).__VAL_ORD__ || []);
  log.push("layout:" + params.tenant);
  if ((globalThis as any).__T_ACT__ === false) return false;
  return params.tenant === "acme";
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "org", "[tenant]", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function OrgLayout({ children, params }: { children: ReactNode; params: { tenant: string } }) {
  return <section data-tenant={params.tenant}>{children}</section>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "org", "[tenant]", "item", "[id]", "page_functions.ts"),
        `export const getStaticPaths = [{ tenant: "acme", id: "1" }];
export function validateParams(params: { tenant: string; id: string }) {
  const log = ((globalThis as any).__VAL_ORD__ = (globalThis as any).__VAL_ORD__ || []);
  log.push("page:" + params.id);
  if ((globalThis as any).__I_ACT__ === false) return false;
  return /^[0-9]+$/.test(params.id);
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "org", "[tenant]", "item", "[id]", "page.tsx"),
        `export default function OrgItem({ params }: { params: { tenant: string; id: string } }) { return <main>Item:{params.tenant}:{params.id}</main>; }\n`
      );

      fs.writeFileSync(
        path.join(appDir, "src", "opt", "[[locale]]", "layout_functions.ts"),
        `export const getStaticPaths = [undefined, "en", "es"];\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "opt", "[[locale]]", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function OptLay({ children, params }: { children: ReactNode; params: { locale?: string } }) {
  return <div data-locale={params.locale || "default"}>{children}</div>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "opt", "[[locale]]", "about", "page.tsx"),
        `export default function OptAbout({ params }: { params: { locale?: string } }) { return <main>Opt:{params.locale || "default"}</main>; }\n`
      );

      fs.writeFileSync(
        path.join(appDir, "src", "ca", "[...section]", "layout_functions.ts"),
        `export const getStaticPaths = [["guides", "auth"]];\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "ca", "[...section]", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function CaLay({ children, params }: { children: ReactNode; params: { section: string[] } }) {
  return <div data-sec={params.section.join("/")}>{children}</div>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "ca", "[...section]", "view", "page.tsx"),
        `export default function CaView({ params }: { params: { section: string[] } }) { return <main>Ca:{params.section.join("/")}</main>; }\n`
      );

      fs.writeFileSync(
        path.join(appDir, "src", "oca", "[[...seg]]", "layout_functions.ts"),
        `export const getStaticPaths = [undefined, ["v1", "api"]];\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "oca", "[[...seg]]", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function OcaLay({ children, params }: { children: ReactNode; params: { seg?: string[] } }) {
  return <div data-seg={params.seg ? params.seg.join("/") : "root"}>{children}</div>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "oca", "[[...seg]]", "doc", "page.tsx"),
        `export default function OcaDoc({ params }: { params: { seg?: string[] } }) { return <main>Oca:{params.seg ? params.seg.join("/") : "root"}</main>; }\n`
      );

      const buildRes = spawnSync(
        process.execPath,
        [CLI_PATH, `build:node:${bundler}`],
        { cwd: appDir, encoding: "utf8" }
      );
      assert.equal(
        buildRes.status,
        0,
        `[${bundler}] build failed:\n${buildRes.stdout}\n${buildRes.stderr}`
      );
      assert.doesNotMatch(
        `${buildRes.stdout}\n${buildRes.stderr}`,
        /Error loading|Error building page/,
        `[${bundler}] build must not log 'Error loading' or 'Error building page'`
      );

      for (const expectedRel of [
        "num/1/index.html",
        "num/2/index.html",
        "num-layout/42/info/index.html",
        "catch/docs/intro/index.html",
        "opt/about/index.html",
        "opt/en/about/index.html",
        "opt/es/about/index.html",
        "ca/guides/auth/view/index.html",
        "oca/doc/index.html",
        "oca/v1/api/doc/index.html",
      ]) {
        assert.ok(
          fs.existsSync(path.join(appDir, ".dinou", "dist2", expectedRel)),
          `[${bundler}] Missing SSG artifact .dinou/dist2/${expectedRel}`
        );
      }

      const probePath = path.join(appDir, "probe.mjs");
      fs.writeFileSync(
        probePath,
        `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { handleRequest } from "./.dinou/node/rsc-engine.mjs";
import { renderHtml } from "./.dinou/node/ssr-engine.mjs";
import { FileSystemStorage, setStorageAdapter } from ${JSON.stringify(storageModUrl)};

globalThis.__DINOU_RUNTIME__ = "node-bundle";
setStorageAdapter(new FileSystemStorage(path.join(process.cwd(), ".dinou", "dist2")));
const opts = { runtime: "node-bundle", renderHtmlStream: renderHtml };

fs.rmSync(path.join(process.cwd(), ".dinou", "dist2", "num"), { recursive: true, force: true });
fs.rmSync(path.join(process.cwd(), ".dinou", "dist2", "num-layout"), { recursive: true, force: true });
fs.rmSync(path.join(process.cwd(), ".dinou", "dist2", "catch"), { recursive: true, force: true });

assert.equal((await handleRequest(new Request("http://localhost:3000/num/1"), opts)).status, 200);
assert.equal((await handleRequest(new Request("http://localhost:3000/____rsc_page____/num/1"), opts)).status, 200);
assert.equal((await handleRequest(new Request("http://localhost:3000/num/999"), opts)).status, 404);
assert.equal((await handleRequest(new Request("http://localhost:3000/____rsc_page____/num/999"), opts)).status, 404);

assert.equal((await handleRequest(new Request("http://localhost:3000/num-layout/42/info"), opts)).status, 200);
assert.equal((await handleRequest(new Request("http://localhost:3000/____rsc_layout____/num-layout/42"), opts)).status, 200);
assert.equal((await handleRequest(new Request("http://localhost:3000/num-layout/99/info"), opts)).status, 404);
assert.equal((await handleRequest(new Request("http://localhost:3000/____rsc_layout____/num-layout/99"), opts)).status, 404);

assert.equal((await handleRequest(new Request("http://localhost:3000/catch/docs/intro"), opts)).status, 200);
assert.equal((await handleRequest(new Request("http://localhost:3000/____rsc_page____/catch/docs/intro"), opts)).status, 200);
assert.equal((await handleRequest(new Request("http://localhost:3000/catch/docs/unknown"), opts)).status, 404);
assert.equal((await handleRequest(new Request("http://localhost:3000/____rsc_page____/catch/docs/unknown"), opts)).status, 404);

globalThis.__T_ACT__ = true;
globalThis.__I_ACT__ = true;
globalThis.__VAL_ORD__ = [];
assert.equal((await handleRequest(new Request("http://localhost:3000/org/acme/item/1"), opts)).status, 200);
assert.deepEqual(globalThis.__VAL_ORD__, ["layout:acme", "page:1"]);

globalThis.__I_ACT__ = false;
assert.equal((await handleRequest(new Request("http://localhost:3000/org/acme/item/1"), opts)).status, 404);
assert.equal((await handleRequest(new Request("http://localhost:3000/____rsc_page____/org/acme/item/1"), opts)).status, 404);
assert.equal((await handleRequest(new Request("http://localhost:3000/____rsc_page_static____/org/acme/item/1"), opts)).status, 404);

globalThis.__T_ACT__ = false;
globalThis.__I_ACT__ = true;
globalThis.__VAL_ORD__ = [];
assert.equal((await handleRequest(new Request("http://localhost:3000/org/acme/item/1"), opts)).status, 404);
assert.deepEqual(globalThis.__VAL_ORD__, ["layout:acme"]);

globalThis.__VAL_ORD__ = [];
assert.equal((await handleRequest(new Request("http://localhost:3000/____rsc_layout____/org/acme"), opts)).status, 404);
assert.deepEqual(globalThis.__VAL_ORD__, ["layout:acme"]);

globalThis.__VAL_ORD__ = [];
assert.equal((await handleRequest(new Request("http://localhost:3000/____rsc_page____/org/acme/item/1"), opts)).status, 404);
assert.deepEqual(globalThis.__VAL_ORD__, ["layout:acme"]);

console.log("PROBE_OK_${bundler}");
`,
        "utf8"
      );

      const probeRes = spawnSync(process.execPath, [probePath], {
        cwd: appDir,
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "" },
      });
      assert.equal(
        probeRes.status,
        0,
        `[${bundler}] probe failed:\n${probeRes.stdout}\n${probeRes.stderr}`
      );
      assert.ok(probeRes.stdout.includes(`PROBE_OK_${bundler}`));
    }
  }
  console.log("   ✅ Section 2 passed!");
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
    `verify-api-reference-fixes-4-ci.mjs must not mutate host workspace ${rel}`
  );
}

console.log(
  "\n🎉 All 2 Dinou v9.4.0 API Reference Batch 4 Route Contracts, Perimeter Veto & Static Path Parity verification suites PASSED!"
);
