import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const DINOU_ROOT = fs.existsSync(path.resolve(REPO_ROOT, "dinou", "cli.js"))
  ? path.resolve(REPO_ROOT, "dinou")
  : path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou");

const { FileSystemStorage, getStorageAdapter, setStorageAdapter } = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core", "storage-adapter.js")).href
);

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

function createFixtureDir(prefix) {
  const inRepoTmpBase = path.join(REPO_ROOT, ".dinou");
  try {
    fs.mkdirSync(inRepoTmpBase, { recursive: true });
    return fs.mkdtempSync(path.join(inRepoTmpBase, prefix));
  } catch {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
}

test("Multi-bundler (Esbuild, Rollup, Webpack): allowISG object normalization (page + layout), authoritative cached HTML+RSC validateParams veto, root-to-child short-circuit & dynamic layout getStaticPaths ([[param]], [...slug], [[...slug]])", async () => {
  const prevStorage = getStorageAdapter();
  const bundlers = ["esbuild", "rollup", "webpack"];

  try {
    for (const bundler of bundlers) {
      const tmpApp = createFixtureDir(`tmp-contracts-ref4-${bundler}-`);
      try {
        fs.writeFileSync(
          path.join(tmpApp, "package.json"),
          JSON.stringify(
            { name: `contracts-ref4-${bundler}`, type: "module", private: true },
            null,
            2
          )
        );

        const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
        fs.mkdirSync(dinouShimDir, { recursive: true });
        const dinouIndexPath = path
          .join(DINOU_ROOT, "index.js")
          .replace(/\\/g, "/");
        const dinouServerPath = path
          .join(DINOU_ROOT, "server.js")
          .replace(/\\/g, "/");
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

        fs.mkdirSync(path.join(tmpApp, "src"), { recursive: true });
        fs.writeFileSync(
          path.join(tmpApp, "src", "layout.tsx"),
          `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html><head><title>Ref4</title></head><body>{children}</body></html>;
}
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "page.tsx"),
          `export default function Home() { return <main>Home</main>; }\n`
        );

        // 1. Numeric parameter objects with allowISG = false on page_functions.ts
        fs.mkdirSync(path.join(tmpApp, "src", "num", "[id]"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(tmpApp, "src", "num", "[id]", "page_functions.ts"),
          `export const getStaticPaths = [{ id: 1 }, { id: 2 }];
export const allowISG = false;
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "num", "[id]", "page.tsx"),
          `export default function NumPage({ params }: { params: { id: string } }) {
  return <main>Num:{params.id}</main>;
}
`
        );

        // 2. Numeric parameter objects with allowISG = false on layout_functions.ts
        fs.mkdirSync(
          path.join(tmpApp, "src", "num-layout", "[numTenant]", "info"),
          { recursive: true }
        );
        fs.writeFileSync(
          path.join(
            tmpApp,
            "src",
            "num-layout",
            "[numTenant]",
            "layout_functions.ts"
          ),
          `export const getStaticPaths = [{ numTenant: 42 }];
export const allowISG = false;
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "num-layout", "[numTenant]", "layout.tsx"),
          `import type { ReactNode } from "react";
export default function NumTenantLayout({ children, params }: { children: ReactNode; params: { numTenant: string } }) {
  return <section data-num-tenant={params.numTenant}>{children}</section>;
}
`
        );
        fs.writeFileSync(
          path.join(
            tmpApp,
            "src",
            "num-layout",
            "[numTenant]",
            "info",
            "page.tsx"
          ),
          `export default function NumTenantInfo({ params }: { params: { numTenant: string } }) {
  return <main>NumTenantInfo:{params.numTenant}</main>;
}
`
        );

        // 3. Catch-all array parameter objects with allowISG = false
        fs.mkdirSync(path.join(tmpApp, "src", "catch", "[...slug]"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(tmpApp, "src", "catch", "[...slug]", "page_functions.ts"),
          `export const getStaticPaths = [{ slug: ["docs", "intro"] }];
export const allowISG = false;
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "catch", "[...slug]", "page.tsx"),
          `export default function CatchPage({ params }: { params: { slug: string[] } }) {
  return <main>Catch:{params.slug.join("/")}</main>;
}
`
        );

        // 4. Authoritative cached HTML + RSC validateParams veto & root-to-child short-circuit
        fs.mkdirSync(path.join(tmpApp, "src", "org", "[tenant]", "item", "[id]"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(tmpApp, "src", "org", "[tenant]", "layout_functions.ts"),
          `export const getStaticPaths = [{ tenant: "acme" }];
export function validateParams(params: { tenant: string }) {
  const log = ((globalThis as any).__VALIDATION_ORDER__ = (globalThis as any).__VALIDATION_ORDER__ || []);
  log.push("layout:" + params.tenant);
  if ((globalThis as any).__TENANT_ACTIVE__ === false) return false;
  return params.tenant === "acme";
}
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "org", "[tenant]", "layout.tsx"),
          `import type { ReactNode } from "react";
export default function OrgLayout({ children, params }: { children: ReactNode; params: { tenant: string } }) {
  return <section data-tenant={params.tenant}><h2>Org:{params.tenant}</h2>{children}</section>;
}
`
        );
        fs.writeFileSync(
          path.join(
            tmpApp,
            "src",
            "org",
            "[tenant]",
            "item",
            "[id]",
            "page_functions.ts"
          ),
          `export const getStaticPaths = [{ tenant: "acme", id: "1" }];
export function validateParams(params: { tenant: string; id: string }) {
  const log = ((globalThis as any).__VALIDATION_ORDER__ = (globalThis as any).__VALIDATION_ORDER__ || []);
  log.push("page:" + params.id);
  if ((globalThis as any).__ITEM_ACTIVE__ === false) return false;
  return /^[0-9]+$/.test(params.id);
}
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "org", "[tenant]", "item", "[id]", "page.tsx"),
          `export default function OrgItemPage({ params }: { params: { tenant: string; id: string } }) {
  return <main>Item:{params.tenant}:{params.id}</main>;
}
`
        );

        // 5A. Optional [[locale]] layout_functions.ts getStaticPaths
        fs.mkdirSync(path.join(tmpApp, "src", "opt", "[[locale]]", "about"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(tmpApp, "src", "opt", "[[locale]]", "layout_functions.ts"),
          `export const getStaticPaths = [undefined, "en", "es"];\n`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "opt", "[[locale]]", "layout.tsx"),
          `import type { ReactNode } from "react";
export default function LocaleLayout({ children, params }: { children: ReactNode; params: { locale?: string } }) {
  return <div data-locale={params.locale || "default"}>{children}</div>;
}
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "opt", "[[locale]]", "about", "page.tsx"),
          `export default function AboutPage({ params }: { params: { locale?: string } }) {
  return <main>About:{params.locale || "default"}</main>;
}
`
        );

        // 5B. Catch-all [...section] layout_functions.ts getStaticPaths
        fs.mkdirSync(path.join(tmpApp, "src", "ca", "[...section]", "view"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(tmpApp, "src", "ca", "[...section]", "layout_functions.ts"),
          `export const getStaticPaths = [["guides", "auth"]];\n`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "ca", "[...section]", "layout.tsx"),
          `import type { ReactNode } from "react";
export default function CaLayout({ children, params }: { children: ReactNode; params: { section: string[] } }) {
  return <div data-section={params.section.join("/")}>{children}</div>;
}
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "ca", "[...section]", "view", "page.tsx"),
          `export default function CaViewPage({ params }: { params: { section: string[] } }) {
  return <main>CaView:{params.section.join("/")}</main>;
}
`
        );

        // 5C. Optional catch-all [[...seg]] layout_functions.ts getStaticPaths
        fs.mkdirSync(path.join(tmpApp, "src", "oca", "[[...seg]]", "doc"), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(tmpApp, "src", "oca", "[[...seg]]", "layout_functions.ts"),
          `export const getStaticPaths = [undefined, ["v1", "api"]];\n`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "oca", "[[...seg]]", "layout.tsx"),
          `import type { ReactNode } from "react";
export default function OcaLayout({ children, params }: { children: ReactNode; params: { seg?: string[] } }) {
  return <div data-seg={params.seg ? params.seg.join("/") : "root"}>{children}</div>;
}
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "oca", "[[...seg]]", "doc", "page.tsx"),
          `export default function OcaDocPage({ params }: { params: { seg?: string[] } }) {
  return <main>OcaDoc:{params.seg ? params.seg.join("/") : "root"}</main>;
}
`
        );

        const buildRes = spawnSync(
          process.execPath,
          [path.join(DINOU_ROOT, "cli.js"), `build:node:${bundler}`],
          { cwd: tmpApp, encoding: "utf8" }
        );
        assert.equal(
          buildRes.status,
          0,
          `Build failed for ${bundler}:\n${buildRes.stdout}\n${buildRes.stderr}`
        );
        assert.doesNotMatch(
          `${buildRes.stdout}\n${buildRes.stderr}`,
          /Error loading|Error building page/,
          `[${bundler}] Build must not swallow Error loading / Error building page on numeric getStaticPaths:\n${buildRes.stdout}\n${buildRes.stderr}`
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
            fs.existsSync(path.join(tmpApp, ".dinou", "dist2", expectedRel)),
            `[${bundler}] Expected SSG artifact .dinou/dist2/${expectedRel}`
          );
        }

        const prevCwd = process.cwd();
        const prevRuntime = globalThis.__DINOU_RUNTIME__;
        process.chdir(tmpApp);
        try {
          globalThis.__DINOU_RUNTIME__ = "node-bundle";
          setStorageAdapter(
            new FileSystemStorage(path.join(tmpApp, ".dinou", "dist2"))
          );

          const rscMod = await import(
            pathToFileURL(
              path.join(tmpApp, ".dinou", "node", "rsc-engine.mjs")
            ).href + `?b=${bundler}&t=${Date.now()}`
          );
          const ssrMod = await import(
            pathToFileURL(
              path.join(tmpApp, ".dinou", "node", "ssr-engine.mjs")
            ).href + `?b=${bundler}&t=${Date.now()}`
          );

          const reqOpts = {
            runtime: "node-bundle",
            renderHtmlStream: ssrMod.renderHtml,
          };

          // Simulate cold storage / dev where static artifacts aren't pre-populated
          removeDirSafe(path.join(tmpApp, ".dinou", "dist2", "num"));
          removeDirSafe(path.join(tmpApp, ".dinou", "dist2", "num-layout"));
          removeDirSafe(path.join(tmpApp, ".dinou", "dist2", "catch"));

          // Numeric page allowISG=false
          const numOkHtml = await rscMod.handleRequest(
            new Request("http://localhost:3000/num/1"),
            reqOpts
          );
          assert.equal(numOkHtml.status, 200, `[${bundler}] Expected /num/1 -> 200`);
          const numOkRsc = await rscMod.handleRequest(
            new Request("http://localhost:3000/____rsc_page____/num/1"),
            reqOpts
          );
          assert.equal(numOkRsc.status, 200, `[${bundler}] Expected RSC /num/1 -> 200`);

          const numBlockedHtml = await rscMod.handleRequest(
            new Request("http://localhost:3000/num/999"),
            reqOpts
          );
          assert.equal(numBlockedHtml.status, 404, `[${bundler}] Expected /num/999 -> 404`);
          const numBlockedRsc = await rscMod.handleRequest(
            new Request("http://localhost:3000/____rsc_page____/num/999"),
            reqOpts
          );
          assert.equal(numBlockedRsc.status, 404, `[${bundler}] Expected RSC /num/999 -> 404`);

          // Numeric layout allowISG=false
          const numLayOkHtml = await rscMod.handleRequest(
            new Request("http://localhost:3000/num-layout/42/info"),
            reqOpts
          );
          assert.equal(
            numLayOkHtml.status,
            200,
            `[${bundler}] Expected /num-layout/42/info -> 200`
          );
          const numLayOkRsc = await rscMod.handleRequest(
            new Request("http://localhost:3000/____rsc_layout____/num-layout/42"),
            reqOpts
          );
          assert.equal(
            numLayOkRsc.status,
            200,
            `[${bundler}] Expected layout RSC /num-layout/42 -> 200`
          );
          const numLayBlockedHtml = await rscMod.handleRequest(
            new Request("http://localhost:3000/num-layout/99/info"),
            reqOpts
          );
          assert.equal(
            numLayBlockedHtml.status,
            404,
            `[${bundler}] Expected /num-layout/99/info -> 404`
          );
          const numLayBlockedRsc = await rscMod.handleRequest(
            new Request("http://localhost:3000/____rsc_layout____/num-layout/99"),
            reqOpts
          );
          assert.equal(
            numLayBlockedRsc.status,
            404,
            `[${bundler}] Expected layout RSC /num-layout/99 -> 404`
          );

          // Catch-all array page allowISG=false
          const catchOkHtml = await rscMod.handleRequest(
            new Request("http://localhost:3000/catch/docs/intro"),
            reqOpts
          );
          assert.equal(
            catchOkHtml.status,
            200,
            `[${bundler}] Expected /catch/docs/intro -> 200`
          );
          const catchOkRsc = await rscMod.handleRequest(
            new Request("http://localhost:3000/____rsc_page____/catch/docs/intro"),
            reqOpts
          );
          assert.equal(
            catchOkRsc.status,
            200,
            `[${bundler}] Expected RSC /catch/docs/intro -> 200`
          );
          const catchBlockedHtml = await rscMod.handleRequest(
            new Request("http://localhost:3000/catch/docs/unknown"),
            reqOpts
          );
          assert.equal(
            catchBlockedHtml.status,
            404,
            `[${bundler}] Expected /catch/docs/unknown -> 404`
          );
          const catchBlockedRsc = await rscMod.handleRequest(
            new Request(
              "http://localhost:3000/____rsc_page____/catch/docs/unknown"
            ),
            reqOpts
          );
          assert.equal(
            catchBlockedRsc.status,
            404,
            `[${bundler}] Expected RSC /catch/docs/unknown -> 404`
          );

          // Authoritative cached HTML + RSC validateParams veto & root-to-child short-circuit
          globalThis.__TENANT_ACTIVE__ = true;
          globalThis.__ITEM_ACTIVE__ = true;
          globalThis.__VALIDATION_ORDER__ = [];

          const orgOkHtml = await rscMod.handleRequest(
            new Request("http://localhost:3000/org/acme/item/1"),
            reqOpts
          );
          assert.equal(
            orgOkHtml.status,
            200,
            `[${bundler}] Expected cached /org/acme/item/1 HTML -> 200`
          );
          assert.deepEqual(
            globalThis.__VALIDATION_ORDER__,
            ["layout:acme", "page:1"],
            `[${bundler}] Expected root-to-child validation order on HTML`
          );

          const orgOkLayoutRsc = await rscMod.handleRequest(
            new Request("http://localhost:3000/____rsc_layout____/org/acme"),
            reqOpts
          );
          assert.equal(orgOkLayoutRsc.status, 200);
          const orgOkPageRsc = await rscMod.handleRequest(
            new Request("http://localhost:3000/____rsc_page____/org/acme/item/1"),
            reqOpts
          );
          assert.equal(orgOkPageRsc.status, 200);

          // Item veto on cached HTML + cached page RSC (+ static RSC wire variant)
          globalThis.__ITEM_ACTIVE__ = false;
          const itemVetoHtml = await rscMod.handleRequest(
            new Request("http://localhost:3000/org/acme/item/1"),
            reqOpts
          );
          assert.equal(itemVetoHtml.status, 404);
          const itemVetoRsc = await rscMod.handleRequest(
            new Request("http://localhost:3000/____rsc_page____/org/acme/item/1"),
            reqOpts
          );
          assert.equal(itemVetoRsc.status, 404);
          const itemVetoStaticRsc = await rscMod.handleRequest(
            new Request(
              "http://localhost:3000/____rsc_page_static____/org/acme/item/1"
            ),
            reqOpts
          );
          assert.equal(itemVetoStaticRsc.status, 404);

          // Parent layout veto MUST short-circuit before child page validateParams on HTML & RSC
          globalThis.__TENANT_ACTIVE__ = false;
          globalThis.__ITEM_ACTIVE__ = true;

          globalThis.__VALIDATION_ORDER__ = [];
          const tenantVetoHtml = await rscMod.handleRequest(
            new Request("http://localhost:3000/org/acme/item/1"),
            reqOpts
          );
          assert.equal(tenantVetoHtml.status, 404);
          assert.deepEqual(
            globalThis.__VALIDATION_ORDER__,
            ["layout:acme"],
            `[${bundler}] Parent layout veto MUST short-circuit before child page validateParams on HTML`
          );

          globalThis.__VALIDATION_ORDER__ = [];
          const tenantVetoLayoutRsc = await rscMod.handleRequest(
            new Request("http://localhost:3000/____rsc_layout____/org/acme"),
            reqOpts
          );
          assert.equal(tenantVetoLayoutRsc.status, 404);
          assert.deepEqual(globalThis.__VALIDATION_ORDER__, ["layout:acme"]);

          globalThis.__VALIDATION_ORDER__ = [];
          const tenantVetoPageRsc = await rscMod.handleRequest(
            new Request("http://localhost:3000/____rsc_page____/org/acme/item/1"),
            reqOpts
          );
          assert.equal(tenantVetoPageRsc.status, 404);
          assert.deepEqual(
            globalThis.__VALIDATION_ORDER__,
            ["layout:acme"],
            `[${bundler}] Parent layout veto MUST short-circuit before child page validateParams on RSC`
          );
        } finally {
          globalThis.__DINOU_RUNTIME__ = prevRuntime;
          delete globalThis.__TENANT_ACTIVE__;
          delete globalThis.__ITEM_ACTIVE__;
          delete globalThis.__VALIDATION_ORDER__;
          process.chdir(prevCwd);
        }
      } finally {
        removeDirSafe(tmpApp);
      }
    }
  } finally {
    setStorageAdapter(prevStorage);
  }
});
