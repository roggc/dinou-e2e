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
const { resolveLayoutFunctionsConfig } = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core", "layout-functions.js")).href
);
const { revalidatePath } = await import(
  pathToFileURL(path.join(DINOU_ROOT, "core", "cache-revalidate.js")).href
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

test("1. Syntax check & named-over-default precedence contracts in handler.js, layout-functions.js & cache-revalidate.js", () => {
  for (const rel of [
    "core/handler.js",
    "core/layout-functions.js",
    "core/cache-revalidate.js",
  ]) {
    const abs = path.join(DINOU_ROOT, rel);
    const check = spawnSync(process.execPath, ["--check", abs], {
      encoding: "utf8",
    });
    assert.equal(check.status, 0, `node --check failed for ${rel}:\n${check.stderr}`);
  }

  const handlerSrc = fs.readFileSync(
    path.join(DINOU_ROOT, "core", "handler.js"),
    "utf8"
  );
  assert.match(handlerSrc, /pageFunctionsModule\.allowISG !== undefined/);
  assert.match(handlerSrc, /pageFunctionsModule\.revalidate !== undefined/);

  const layoutSrc = fs.readFileSync(
    path.join(DINOU_ROOT, "core", "layout-functions.js"),
    "utf8"
  );
  assert.match(layoutSrc, /mod\.allowISG !== undefined/);
  assert.match(layoutSrc, /mod\.revalidate !== undefined/);

  const revalSrc = fs.readFileSync(
    path.join(DINOU_ROOT, "core", "cache-revalidate.js"),
    "utf8"
  );
  assert.match(revalSrc, /pfMod\.revalidate !== undefined/);
});

test("2. resolveLayoutFunctionsConfig() unit verification across all 5 hybrid named-over-default scenarios", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-lf-prec-"));
  const prevDev = process.env.DINOU_DEV;
  process.env.DINOU_DEV = "true";
  globalThis.__PF_PREC_UNIT_CALLS__ = {};

  try {
    const cases = [
      {
        dir: "case1-dyn",
        code: `
          export default {
            revalidate: async () => {
              globalThis.__PF_PREC_UNIT_CALLS__.c1 = (globalThis.__PF_PREC_UNIT_CALLS__.c1 || 0) + 1;
              return 3600;
            },
          };
          export const revalidate = 0;
        `,
        assertFn(cfg) {
          assert.equal(cfg.revalidate, 0);
          assert.equal(cfg.isDynamic, true);
          assert.equal(globalThis.__PF_PREC_UNIT_CALLS__.c1 || 0, 0);
        },
      },
      {
        dir: "case2-static",
        code: `
          export default {
            revalidate: () => {
              globalThis.__PF_PREC_UNIT_CALLS__.c2 = (globalThis.__PF_PREC_UNIT_CALLS__.c2 || 0) + 1;
              return 60;
            },
          };
          export const revalidate = false;
        `,
        assertFn(cfg) {
          assert.equal(cfg.revalidate, false);
          assert.equal(cfg.isDynamic, false);
          assert.equal(globalThis.__PF_PREC_UNIT_CALLS__.c2 || 0, 0);
        },
      },
      {
        dir: "case3-isg-false",
        code: `
          export default {
            allowISG: async () => {
              globalThis.__PF_PREC_UNIT_CALLS__.c3 = (globalThis.__PF_PREC_UNIT_CALLS__.c3 || 0) + 1;
              return true;
            },
          };
          export const allowISG = false;
        `,
        assertFn(cfg) {
          assert.equal(cfg.allowISG, false);
          assert.equal(globalThis.__PF_PREC_UNIT_CALLS__.c3 || 0, 0);
        },
      },
      {
        dir: "case4-isg-true",
        code: `
          export default {
            allowISG: () => {
              globalThis.__PF_PREC_UNIT_CALLS__.c4 = (globalThis.__PF_PREC_UNIT_CALLS__.c4 || 0) + 1;
              return false;
            },
          };
          export const allowISG = true;
        `,
        assertFn(cfg) {
          assert.equal(cfg.allowISG, true);
          assert.equal(globalThis.__PF_PREC_UNIT_CALLS__.c4 || 0, 0);
        },
      },
      {
        dir: "case5-default-only",
        code: `
          export default {
            revalidate: () => {
              globalThis.__PF_PREC_UNIT_CALLS__.c5Rev = (globalThis.__PF_PREC_UNIT_CALLS__.c5Rev || 0) + 1;
              return 120;
            },
            allowISG: () => {
              globalThis.__PF_PREC_UNIT_CALLS__.c5Isg = (globalThis.__PF_PREC_UNIT_CALLS__.c5Isg || 0) + 1;
              return false;
            },
          };
        `,
        assertFn(cfg) {
          assert.equal(cfg.revalidate, 120);
          assert.equal(cfg.isDynamic, false);
          assert.equal(cfg.allowISG, false);
          assert.equal(globalThis.__PF_PREC_UNIT_CALLS__.c5Rev, 1);
          assert.equal(globalThis.__PF_PREC_UNIT_CALLS__.c5Isg, 1);
        },
      },
    ];

    for (const tc of cases) {
      const caseDir = path.join(tmpDir, tc.dir);
      fs.mkdirSync(caseDir, { recursive: true });
      const layoutPath = path.join(caseDir, "layout.js");
      fs.writeFileSync(layoutPath, "export default function L({ children }) { return children; }\n");
      fs.writeFileSync(path.join(caseDir, "layout_functions.js"), tc.code);
      const cfg = await resolveLayoutFunctionsConfig(layoutPath, {});
      tc.assertFn(cfg);
    }
  } finally {
    if (prevDev === undefined) delete process.env.DINOU_DEV;
    else process.env.DINOU_DEV = prevDev;
    delete globalThis.__PF_PREC_UNIT_CALLS__;
    removeDirSafe(tmpDir);
  }
});

test("3. Multi-bundler (Esbuild, Rollup, Webpack) integration: named constants override default functions in page_functions.ts, layout_functions.ts & revalidatePath()", async () => {
  const prevStorage = getStorageAdapter();
  const bundlers = ["esbuild", "rollup", "webpack"];

  try {
    for (const bundler of bundlers) {
      const tmpApp = createFixtureDir(`tmp-pf-prec-${bundler}-`);
      try {
        fs.writeFileSync(
          path.join(tmpApp, "package.json"),
          JSON.stringify(
            { name: `pf-prec-${bundler}`, type: "module", private: true },
            null,
            2
          )
        );

        const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
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

        for (const relDir of [
          "src/pf-dyn",
          "src/pf-static",
          "src/pf-no-isg/[slug]",
          "src/pf-yes-isg/[slug]",
          "src/pf-default/[slug]",
          "src/lf-dyn/child",
          "src/lf-no-isg/[seg]/view",
          "src/lf-yes-isg/[seg]/view",
        ]) {
          fs.mkdirSync(path.join(tmpApp, relDir), { recursive: true });
        }

        fs.writeFileSync(
          path.join(tmpApp, "src", "layout.tsx"),
          `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html><head><title>PF Prec</title></head><body>{children}</body></html>;
}
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "page.tsx"),
          `export default function Home() { return <main>Home</main>; }\n`
        );

        // Scenario 1 (page): default revalidate: async () => 3600 + named revalidate = 0
        fs.writeFileSync(
          path.join(tmpApp, "src", "pf-dyn", "page_functions.ts"),
          `export default {
  revalidate: async () => {
    (globalThis as any).__SPY_PF_DYN_DEF__ = ((globalThis as any).__SPY_PF_DYN_DEF__ || 0) + 1;
    return 3600;
  },
};
export const revalidate = 0;
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "pf-dyn", "page.tsx"),
          `export default function PfDyn() {
  const n = ((globalThis as any).__PF_DYN_HITS__ = ((globalThis as any).__PF_DYN_HITS__ || 0) + 1);
  return <main>{\`PfDyn:\${n}\`}</main>;
}
`
        );

        // Scenario 2 (page): default revalidate: () => 60 + named revalidate = false
        fs.writeFileSync(
          path.join(tmpApp, "src", "pf-static", "page_functions.ts"),
          `export default {
  revalidate: () => {
    (globalThis as any).__SPY_PF_STATIC_DEF__ = ((globalThis as any).__SPY_PF_STATIC_DEF__ || 0) + 1;
    return 60;
  },
};
export const revalidate = false;
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "pf-static", "page.tsx"),
          `export default function PfStatic() {
  const n = ((globalThis as any).__PF_STATIC_HITS__ = ((globalThis as any).__PF_STATIC_HITS__ || 0) + 1);
  return <main>{\`PfStatic:\${n}\`}</main>;
}
`
        );

        // Scenario 3 (page): default allowISG: async () => true + named allowISG = false
        fs.writeFileSync(
          path.join(tmpApp, "src", "pf-no-isg", "[slug]", "page_functions.ts"),
          `export const getStaticPaths = ["allowed"];
export default {
  allowISG: async () => {
    (globalThis as any).__SPY_PF_NO_ISG_DEF__ = ((globalThis as any).__SPY_PF_NO_ISG_DEF__ || 0) + 1;
    return true;
  },
};
export const allowISG = false;
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "pf-no-isg", "[slug]", "page.tsx"),
          `export default function PfNoIsg({ params }: { params: { slug: string } }) {
  return <main>{\`PfNoIsg:\${params.slug}\`}</main>;
}
`
        );

        // Scenario 4 (page): default allowISG: () => false + named allowISG = true
        fs.writeFileSync(
          path.join(tmpApp, "src", "pf-yes-isg", "[slug]", "page_functions.ts"),
          `export const getStaticPaths = ["allowed"];
export default {
  allowISG: () => {
    (globalThis as any).__SPY_PF_YES_ISG_DEF__ = ((globalThis as any).__SPY_PF_YES_ISG_DEF__ || 0) + 1;
    return false;
  },
};
export const allowISG = true;
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "pf-yes-isg", "[slug]", "page.tsx"),
          `export default function PfYesIsg({ params }: { params: { slug: string } }) {
  return <main>{\`PfYesIsg:\${params.slug}\`}</main>;
}
`
        );

        // Scenario 5 (page): default-only functions (no named exports) still execute
        fs.writeFileSync(
          path.join(tmpApp, "src", "pf-default", "[slug]", "page_functions.ts"),
          `export const getStaticPaths = ["ok"];
export default {
  revalidate: () => {
    (globalThis as any).__SPY_PF_DEF_REV__ = ((globalThis as any).__SPY_PF_DEF_REV__ || 0) + 1;
    return 120;
  },
  allowISG: () => {
    (globalThis as any).__SPY_PF_DEF_ISG__ = ((globalThis as any).__SPY_PF_DEF_ISG__ || 0) + 1;
    return false;
  },
};
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "pf-default", "[slug]", "page.tsx"),
          `export default function PfDefault({ params }: { params: { slug: string } }) {
  return <main>{\`PfDefault:\${params.slug}\`}</main>;
}
`
        );

        // Scenario 1 (layout): default revalidate: async () => 3600 + named revalidate = 0
        fs.writeFileSync(
          path.join(tmpApp, "src", "lf-dyn", "layout_functions.ts"),
          `export default {
  revalidate: async () => {
    (globalThis as any).__SPY_LF_DYN_DEF__ = ((globalThis as any).__SPY_LF_DYN_DEF__ || 0) + 1;
    return 3600;
  },
};
export const revalidate = 0;
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "lf-dyn", "layout.tsx"),
          `import type { ReactNode } from "react";
export default function LfDynLayout({ children }: { children: ReactNode }) {
  const n = ((globalThis as any).__LF_DYN_HITS__ = ((globalThis as any).__LF_DYN_HITS__ || 0) + 1);
  return <section data-lf-hits={n}>{children}</section>;
}
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "lf-dyn", "child", "page.tsx"),
          `export default function LfDynChild() {
  const n = ((globalThis as any).__LF_DYN_PAGE_HITS__ = ((globalThis as any).__LF_DYN_PAGE_HITS__ || 0) + 1);
  return <main>{\`LfDynChild:\${n}\`}</main>;
}
`
        );

        // Scenario 3 (layout): default allowISG: async () => true + named allowISG = false
        fs.writeFileSync(
          path.join(tmpApp, "src", "lf-no-isg", "[seg]", "layout_functions.ts"),
          `export const getStaticPaths = ["valid"];
export default {
  allowISG: async () => {
    (globalThis as any).__SPY_LF_NO_ISG_DEF__ = ((globalThis as any).__SPY_LF_NO_ISG_DEF__ || 0) + 1;
    return true;
  },
};
export const allowISG = false;
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "lf-no-isg", "[seg]", "layout.tsx"),
          `import type { ReactNode } from "react";
export default function LfNoIsgLayout({ children, params }: { children: ReactNode; params: { seg: string } }) {
  return <section data-seg={params.seg}>{children}</section>;
}
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "lf-no-isg", "[seg]", "view", "page.tsx"),
          `export default function LfNoIsgView({ params }: { params: { seg: string } }) {
  return <main>{\`LfNoIsg:\${params.seg}\`}</main>;
}
`
        );

        // Scenario 4 (layout): default allowISG: () => false + named allowISG = true
        fs.writeFileSync(
          path.join(tmpApp, "src", "lf-yes-isg", "[seg]", "layout_functions.ts"),
          `export const getStaticPaths = ["valid"];
export default {
  allowISG: () => {
    (globalThis as any).__SPY_LF_YES_ISG_DEF__ = ((globalThis as any).__SPY_LF_YES_ISG_DEF__ || 0) + 1;
    return false;
  },
};
export const allowISG = true;
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "lf-yes-isg", "[seg]", "layout.tsx"),
          `import type { ReactNode } from "react";
export default function LfYesIsgLayout({ children, params }: { children: ReactNode; params: { seg: string } }) {
  return <section data-seg={params.seg}>{children}</section>;
}
`
        );
        fs.writeFileSync(
          path.join(tmpApp, "src", "lf-yes-isg", "[seg]", "view", "page.tsx"),
          `export default function LfYesIsgView({ params }: { params: { seg: string } }) {
  return <main>{\`LfYesIsg:\${params.seg}\`}</main>;
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
          `[${bundler}] Build logged errors:\n${buildRes.stdout}\n${buildRes.stderr}`
        );

        // Build-time SSG checks:
        assert.equal(
          fs.existsSync(path.join(tmpApp, ".dinou", "dist2", "pf-dyn", "index.html")),
          false,
          `[${bundler}] pf-dyn (named revalidate=0 over default fn) must NOT be pre-rendered`
        );
        assert.equal(
          fs.existsSync(path.join(tmpApp, ".dinou", "dist2", "pf-static", "index.html")),
          true,
          `[${bundler}] pf-static (named revalidate=false over default fn) MUST be pre-rendered`
        );

        const prevCwd = process.cwd();
        const prevRuntime = globalThis.__DINOU_RUNTIME__;
        const prevRenderHtml = globalThis.__DINOU_RENDER_HTML_STREAM__;
        process.chdir(tmpApp);
        try {
          globalThis.__DINOU_RUNTIME__ = "node-bundle";
          const fsStorage = new FileSystemStorage(path.join(tmpApp, ".dinou", "dist2"));
          setStorageAdapter(fsStorage);

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
          globalThis.__DINOU_RENDER_HTML_STREAM__ = ssrMod.renderHtml;
          const opts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

          globalThis.__SPY_PF_DYN_DEF__ = 0;
          globalThis.__SPY_PF_STATIC_DEF__ = 0;
          globalThis.__SPY_PF_NO_ISG_DEF__ = 0;
          globalThis.__SPY_PF_YES_ISG_DEF__ = 0;
          globalThis.__SPY_PF_DEF_REV__ = 0;
          globalThis.__SPY_PF_DEF_ISG__ = 0;
          globalThis.__SPY_LF_DYN_DEF__ = 0;
          globalThis.__SPY_LF_NO_ISG_DEF__ = 0;
          globalThis.__SPY_LF_YES_ISG_DEF__ = 0;
          globalThis.__PF_DYN_HITS__ = 0;
          globalThis.__PF_STATIC_HITS__ = 0;
          globalThis.__LF_DYN_HITS__ = 0;
          globalThis.__LF_DYN_PAGE_HITS__ = 0;

          // 3.1. pf-dyn: dynamic on every request, default.revalidate spy never invoked
          const dyn1 = await (await rscMod.handleRequest(new Request("http://localhost:3000/pf-dyn"), opts)).text();
          const dyn2 = await (await rscMod.handleRequest(new Request("http://localhost:3000/pf-dyn"), opts)).text();
          assert.ok(dyn1.includes("PfDyn:1") && dyn2.includes("PfDyn:2"), `[${bundler}] pf-dyn expected fresh hits`);
          assert.equal(globalThis.__SPY_PF_DYN_DEF__, 0);

          // 3.2. pf-static: revalidate=false overrides default () => 60 in handler AND cache-revalidate.js
          await revalidatePath("/pf-static");
          const staticMetaRaw = fs.readFileSync(
            path.join(tmpApp, ".dinou", "dist2", "pf-static", "metadata.json"),
            "utf8"
          );
          const staticMeta = JSON.parse(staticMetaRaw);
          assert.notEqual(
            staticMeta.revalidate,
            60,
            `[${bundler}] cache-revalidate.js must NOT fall back to default revalidate: () => 60 when named revalidate=false`
          );
          assert.equal(globalThis.__SPY_PF_STATIC_DEF__, 0);

          // 3.3. pf-no-isg: named allowISG=false overrides default async () => true
          removeDirSafe(path.join(tmpApp, ".dinou", "dist2", "pf-no-isg"));
          const noIsgOk = await rscMod.handleRequest(new Request("http://localhost:3000/pf-no-isg/allowed"), opts);
          assert.equal(noIsgOk.status, 200);
          const noIsgBadHtml = await rscMod.handleRequest(new Request("http://localhost:3000/pf-no-isg/unlisted"), opts);
          assert.equal(noIsgBadHtml.status, 404);
          const noIsgBadRsc = await rscMod.handleRequest(new Request("http://localhost:3000/____rsc_page____/pf-no-isg/unlisted"), opts);
          assert.equal(noIsgBadRsc.status, 404);
          assert.equal(globalThis.__SPY_PF_NO_ISG_DEF__, 0);

          // 3.4. pf-yes-isg: named allowISG=true overrides default () => false
          const yesIsgRes = await rscMod.handleRequest(new Request("http://localhost:3000/pf-yes-isg/ondemand-slug"), opts);
          assert.equal(yesIsgRes.status, 200);
          assert.ok((await yesIsgRes.text()).includes("PfYesIsg:ondemand-slug"));
          assert.equal(globalThis.__SPY_PF_YES_ISG_DEF__, 0);

          // 3.5. pf-default: default-only functions still run (allowISG=false -> 404, revalidate=120 in metadata)
          const defOk = await rscMod.handleRequest(new Request("http://localhost:3000/pf-default/ok"), opts);
          assert.equal(defOk.status, 200);
          const defBad = await rscMod.handleRequest(new Request("http://localhost:3000/pf-default/nope"), opts);
          assert.equal(defBad.status, 404);
          await revalidatePath("/pf-default/ok");
          const defMeta = JSON.parse(
            fs.readFileSync(
              path.join(tmpApp, ".dinou", "dist2", "pf-default", "ok", "metadata.json"),
              "utf8"
            )
          );
          assert.equal(defMeta.revalidate, 120);
          assert.ok(globalThis.__SPY_PF_DEF_REV__ >= 1);
          assert.ok(globalThis.__SPY_PF_DEF_ISG__ >= 1);

          // 3.6. lf-dyn: layout named revalidate=0 overrides default async () => 3600
          const lfDyn1 = await (await rscMod.handleRequest(new Request("http://localhost:3000/lf-dyn/child"), opts)).text();
          const lfDyn2 = await (await rscMod.handleRequest(new Request("http://localhost:3000/lf-dyn/child"), opts)).text();
          assert.ok(lfDyn1.includes("LfDynChild:1") && lfDyn2.includes("LfDynChild:2"));
          assert.equal(globalThis.__SPY_LF_DYN_DEF__, 0);

          // 3.7. lf-no-isg: layout named allowISG=false overrides default async () => true
          removeDirSafe(path.join(tmpApp, ".dinou", "dist2", "lf-no-isg"));
          const lfNoOk = await rscMod.handleRequest(new Request("http://localhost:3000/lf-no-isg/valid/view"), opts);
          assert.equal(lfNoOk.status, 200);
          const lfNoBad = await rscMod.handleRequest(new Request("http://localhost:3000/lf-no-isg/bad/view"), opts);
          assert.equal(lfNoBad.status, 404);
          const lfNoBadRsc = await rscMod.handleRequest(new Request("http://localhost:3000/____rsc_layout____/lf-no-isg/bad"), opts);
          assert.equal(lfNoBadRsc.status, 404);
          assert.equal(globalThis.__SPY_LF_NO_ISG_DEF__, 0);

          // 3.8. lf-yes-isg: layout named allowISG=true overrides default () => false
          const lfYesRes = await rscMod.handleRequest(new Request("http://localhost:3000/lf-yes-isg/ondemand/view"), opts);
          assert.equal(lfYesRes.status, 200);
          assert.ok((await lfYesRes.text()).includes("LfYesIsg:ondemand"));
          assert.equal(globalThis.__SPY_LF_YES_ISG_DEF__, 0);
        } finally {
          globalThis.__DINOU_RUNTIME__ = prevRuntime;
          globalThis.__DINOU_RENDER_HTML_STREAM__ = prevRenderHtml;
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
