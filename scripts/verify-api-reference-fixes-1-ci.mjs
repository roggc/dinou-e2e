// scripts/verify-api-reference-fixes-1-ci.mjs
// Verifies Dinou v9.4.0 API Reference Batch 1 Fixes (x-api-reference-fixes-1.md):
// 1. JSX syntax check + handler.js/_hasRedirected/get-jsx.js short-circuit & HTTP 302 JSDoc parity
// 2. <Link> target="_blank"/"_self"/custom, download (bool/string/false), fresh, external URLs & e.button !== 0
// 3. useRouter() referential stability (useMemo on RouterContext + optional guards) & useSearchParams() __DINOU_STATIC_EXPORT__ hydration guard
// 4. client.jsx & client-webpack.jsx parity (external URL window.location, #hash stripping from pageCache/route/prefetch, global anchor listener)
// 5. Tri-bundler (esbuild, rollup, webpack) integration: getProps(), res.redirect(), Page body, @slot & layout_functions.ts redirect short-circuits (SSR + RSC)
// 6. dinou export-static verification for SSG & ppr=true zero-hole pages using useSearchParams()

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
const DINOU_ROOT =
  dinouRootCandidates.find((dir) => fs.existsSync(path.join(dir, "cli.js"))) ??
  dinouRootCandidates[0];
const CLI_PATH = path.join(DINOU_ROOT, "cli.js");

const esbuild = await import(
  pathToFileURL(
    path.resolve(projectRoot, "node_modules", "esbuild", "lib", "main.js")
  ).href
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
  "tmp-api-ref-1-ci-fixtures"
);
fs.mkdirSync(fixturesParent, { recursive: true });
const tmpBase = fs.mkdtempSync(path.join(fixturesParent, "run-"));

try {
  // =========================================================================
  // 1️⃣ JSX Parse Verification, Redirect Short-Circuit Contracts & HTTP 302 JSDoc
  // =========================================================================
  console.log(
    "1️⃣ Verifying JSX syntax, handler.js/_hasRedirected/get-jsx.js short-circuits & HTTP 302 JSDoc parity..."
  );
  {
    for (const rel of [
      "core/link.jsx",
      "core/client.jsx",
      "core/client-webpack.jsx",
      "core/redirect.jsx",
    ]) {
      const abs = path.join(DINOU_ROOT, rel);
      const code = fs.readFileSync(abs, "utf8");
      const res = await esbuild.transform(code, {
        loader: "jsx",
        jsx: "automatic",
        format: "esm",
        sourcefile: abs,
      });
      assert.ok(res.code.length > 0, `Expected esbuild output for ${rel}`);
    }

    const handlerSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core/handler.js"),
      "utf8"
    );
    assert.match(handlerSrc, /"_hasRedirected"/);
    assert.match(handlerSrc, /_hasRedirected:\s*false/);
    assert.match(handlerSrc, /if \(context\) context\._hasRedirected = true;/);
    assert.match(
      handlerSrc,
      /catch \(err\) \{\s*if \(bridge\.headers\.has\("x-rsc-redirect"\) \|\| bridge\.headers\.has\("Location"\)\) \{\s*return;\s*\}/
    );

    const getJsxSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core/get-jsx.js"),
      "utf8"
    );
    assert.ok((getJsxSrc.match(/_hasRedirected/g) || []).length >= 7);

    const buildStaticSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core/build-static-pages.js"),
      "utf8"
    );
    assert.doesNotMatch(buildStaticSrc, /\.revalidate\s*\|\|/);
    assert.match(
      buildStaticSrc,
      /if \(mockRes\._redirectUrl \|\| mockContext\._hasRedirected\)/
    );

    const genStaticRscSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core/generate-static-rsc.js"),
      "utf8"
    );
    assert.match(
      genStaticRscSrc,
      /if \(mockContext\) mockContext\._hasRedirected = true;/
    );

    const bunBuildSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "bun/build.js"),
      "utf8"
    );
    assert.ok(
      (bunBuildSrc.match(/"content-disposition":\s*"inline"/g) || []).length >= 2,
      "bun/build.js must set content-disposition: inline on Bun.file responses"
    );

    const redirectSrc = fs.readFileSync(
      path.join(DINOU_ROOT, "core/redirect.jsx"),
      "utf8"
    );
    assert.match(redirectSrc, /Status 302/);
    assert.doesNotMatch(redirectSrc, /Status 307/);

    const dts = fs.readFileSync(path.join(DINOU_ROOT, "index.d.ts"), "utf8");
    assert.match(dts, /HTTP 302 redirect/);
    assert.doesNotMatch(dts, /HTTP 307 redirect/);
  }
  console.log("   ✅ Section 1 passed!");

  // =========================================================================
  // 2️⃣ <Link> Native Yielding (target, download, e.button !== 0, fresh, external)
  // =========================================================================
  console.log(
    "2️⃣ Verifying <Link> target, download, non-primary clicks, fresh & external URLs..."
  );
  {
    const linkAbs = path.join(DINOU_ROOT, "core", "link.jsx");
    const navUtilsAbs = path.join(DINOU_ROOT, "core", "navigation-utils.js");
    const unitTmp = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-ci-link-"));
    try {
      const entry = path.join(unitTmp, "entry.js");
      fs.writeFileSync(
        entry,
        `export { Link } from ${JSON.stringify(linkAbs)};\nexport { pushCalls } from "./navigation.js";`,
        "utf8"
      );
      const bundled = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        format: "esm",
        platform: "neutral",
        jsx: "automatic",
        write: false,
        plugins: [
          {
            name: "mock-link-deps",
            setup(build) {
              build.onResolve({ filter: /^\.\/navigation\.js$/ }, () => ({
                path: "mock-nav",
                namespace: "mock",
              }));
              build.onResolve({ filter: /^\.\/navigation-utils\.js$/ }, () => ({
                path: navUtilsAbs,
              }));
              build.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, (args) => ({
                path: args.path,
                namespace: "mock-react",
              }));
              build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
                contents: `
                  export const pushCalls = [];
                  export function useRouter() { return { push: (href, opts) => pushCalls.push({ href, opts }) }; }
                  export function usePathname() { return "/dashboard"; }
                `,
                loader: "js",
              }));
              build.onLoad({ filter: /.*/, namespace: "mock-react" }, () => ({
                contents: `
                  export function jsx(type, props) { return { type, props }; }
                  export const jsxs = jsx;
                  export default { createElement: (type, props) => ({ type, props }) };
                `,
                loader: "js",
              }));
            },
          },
        ],
      });
      const outPath = path.join(unitTmp, "link.mjs");
      fs.writeFileSync(outPath, bundled.outputFiles[0].text, "utf8");
      const { Link, pushCalls } = await import(pathToFileURL(outPath).href);

      const prefetchCalls = [];
      const prevWindow = globalThis.window;
      globalThis.window = {
        location: { origin: "http://localhost:3000", pathname: "/dashboard" },
        __DINOU_PREFETCH__: (h) => prefetchCalls.push(h),
      };
      try {
        const makeEv = (ov = {}) => ({
          button: 0,
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          defaultPrevented: false,
          preventDefault() {
            this.defaultPrevented = true;
          },
          ...ov,
        });

        const blankEl = Link({ href: "/report", target: "_blank", children: "R" });
        blankEl.props.onMouseEnter();
        assert.equal(prefetchCalls.length, 0);
        const ev1 = makeEv();
        blankEl.props.onClick(ev1);
        assert.equal(ev1.defaultPrevented, false);

        const dlEl = Link({ href: "/export.csv", download: "a.csv", children: "D" });
        dlEl.props.onMouseEnter();
        assert.equal(prefetchCalls.length, 0);
        const ev2 = makeEv();
        dlEl.props.onClick(ev2);
        assert.equal(ev2.defaultPrevented, false);

        const dlFalseEl = Link({ href: "/ok", download: false, children: "N" });
        dlFalseEl.props.onMouseEnter();
        assert.deepEqual(prefetchCalls, ["/ok"]);
        const ev3 = makeEv();
        dlFalseEl.props.onClick(ev3);
        assert.equal(ev3.defaultPrevented, true);
        assert.deepEqual(pushCalls.pop(), { href: "/ok", opts: { fresh: false } });
        prefetchCalls.length = 0;

        const midEl = Link({ href: "/mid", children: "M" });
        const ev4 = makeEv({ button: 1 });
        midEl.props.onClick(ev4);
        assert.equal(ev4.defaultPrevented, false);

        const selfEl = Link({ href: "/self", target: "_self", children: "S" });
        selfEl.props.onMouseEnter();
        assert.deepEqual(prefetchCalls, ["/self"]);
        const ev5 = makeEv();
        selfEl.props.onClick(ev5);
        assert.equal(ev5.defaultPrevented, true);
        assert.deepEqual(pushCalls.pop(), { href: "/self", opts: { fresh: false } });
      } finally {
        if (prevWindow === undefined) delete globalThis.window;
        else globalThis.window = prevWindow;
      }
    } finally {
      removeDirSafe(unitTmp);
    }
  }
  console.log("   ✅ Section 2 passed!");

  // =========================================================================
  // 3️⃣ useRouter() Referential Stability & useSearchParams() Static-Export Guard
  // =========================================================================
  console.log(
    "3️⃣ Verifying useRouter() referential stability & useSearchParams() __DINOU_STATIC_EXPORT__ guard..."
  );
  {
    const navAbs = path.join(DINOU_ROOT, "core", "navigation.js");
    const unitTmp = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-ci-nav-"));
    try {
      const entry = path.join(unitTmp, "entry.js");
      fs.writeFileSync(
        entry,
        `import React, { __setMockState } from "react";
         export { useRouter, useSearchParams } from ${JSON.stringify(navAbs)};
         export { __setMockState };`,
        "utf8"
      );
      const bundled = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        format: "esm",
        platform: "neutral",
        write: false,
        plugins: [
          {
            name: "mock-react",
            setup(build) {
              build.onResolve({ filter: /^react$/ }, () => ({
                path: "mock-react",
                namespace: "mock",
              }));
              build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
                contents: `
                  let memoCache = null;
                  let memoDeps = null;
                  let ctxVal = null;
                  let hydrating = false;
                  export function __setMockState({ ctxValue, isHydrating, resetMemo }) {
                    if (ctxValue !== undefined) ctxVal = ctxValue;
                    if (isHydrating !== undefined) hydrating = isHydrating;
                    if (resetMemo) { memoCache = null; memoDeps = null; }
                  }
                  export default {
                    createContext: (def) => ({ _currentValue: def }),
                    useContext: () => ctxVal,
                    useState: (init) => [typeof init === "function" ? init() : init, () => {}],
                    useEffect: () => {},
                    useMemo: (fn, deps) => {
                      const same = memoDeps && deps && memoDeps.length === deps.length && deps.every((d, i) => Object.is(d, memoDeps[i]));
                      if (same) return memoCache;
                      memoDeps = deps;
                      memoCache = fn();
                      return memoCache;
                    },
                    useSyncExternalStore: (_s, getSnap, getServerSnap) => hydrating ? getServerSnap() : getSnap(),
                  };
                `,
                loader: "js",
              }));
            },
          },
        ],
      });
      const outPath = path.join(unitTmp, "nav.mjs");
      fs.writeFileSync(outPath, bundled.outputFiles[0].text, "utf8");
      const mod = await import(pathToFileURL(outPath).href);

      const ctx1 = { url: "/a", navigate: () => {}, isPending: false };
      mod.__setMockState({ ctxValue: ctx1, resetMemo: true });
      const r1 = mod.useRouter();
      const r2 = mod.useRouter();
      assert.strictEqual(r1, r2);
      assert.doesNotThrow(() => {
        r1.back();
        r1.forward();
        r1.refresh();
      });

      const ctx2 = { ...ctx1, url: "/b" };
      mod.__setMockState({ ctxValue: ctx2 });
      const r3 = mod.useRouter();
      assert.notStrictEqual(r1, r3);

      const prevWindow = globalThis.window;
      globalThis.window = {
        __DINOU_STATIC_EXPORT__: true,
        __DINOU_USE_STATIC__: false,
        __DINOU_PPR_RESUME__: false,
        location: { search: "?q=ci&page=3" },
      };
      try {
        mod.__setMockState({ ctxValue: { url: "/s?q=ci&page=3" }, isHydrating: true });
        assert.equal(mod.useSearchParams().toString(), "");
        mod.__setMockState({ isHydrating: false });
        assert.equal(mod.useSearchParams().get("q"), "ci");
        assert.equal(mod.useSearchParams().get("page"), "3");
      } finally {
        if (prevWindow === undefined) delete globalThis.window;
        else globalThis.window = prevWindow;
      }
    } finally {
      removeDirSafe(unitTmp);
    }
  }
  console.log("   ✅ Section 3 passed!");

  // =========================================================================
  // 4️⃣ client.jsx & client-webpack.jsx Parity Verification
  // =========================================================================
  console.log(
    "4️⃣ Verifying client.jsx & client-webpack.jsx parity (external URL, #hash stripping, anchor listener)..."
  );
  {
    for (const rel of ["core/client.jsx", "core/client-webpack.jsx"]) {
      const src = fs.readFileSync(path.join(DINOU_ROOT, rel), "utf8");
      assert.match(
        src,
        /const url = route\.split\("::"\)\[0\]\.split\("#"\)\[0\] \|\| "\/";/
      );
      assert.match(
        src,
        /if \(isExternalUrl\(finalPath\)\) \{[\s\S]*?window\.location\.replace\(finalPath\)[\s\S]*?window\.location\.assign\(finalPath\)/
      );
      assert.match(
        src,
        /const routeWithoutHash = finalPath\.split\("#"\)\[0\] \|\| "\/";[\s\S]*?pageCache\.delete\(routeWithoutHash\);/
      );
      assert.match(src, /setRoute\(routeWithoutHash\);/);
      assert.match(
        src,
        /const cleanUrl = String\(url \|\| "\/"\)\.split\("#"\)\[0\] \|\| "\/";/
      );
      assert.match(src, /\(anchor\.target && anchor\.target !== "_self"\)/);
      assert.match(src, /anchor\.hasAttribute\("download"\)/);
      assert.match(src, /e\.button !== 0/);
    }
  }
  console.log("   ✅ Section 4 passed!");

  // =========================================================================
  // 5️⃣ Tri-Bundler (Esbuild, Rollup, Webpack) Redirect Short-Circuit Integration
  // =========================================================================
  console.log(
    "5️⃣ Verifying tri-bundler (esbuild, rollup, webpack) redirect short-circuit across getProps(), res.redirect(), Page body, @slot & layout_functions..."
  );
  {
    for (const bundler of ["esbuild", "rollup", "webpack"]) {
      const appDir = path.join(tmpBase, `redirect-${bundler}`);
      fs.mkdirSync(path.join(appDir, "src", "login"), { recursive: true });
      fs.mkdirSync(path.join(appDir, "src", "guarded", "@sidebar"), { recursive: true });
      fs.mkdirSync(path.join(appDir, "src", "layout-guarded"), { recursive: true });
      fs.mkdirSync(path.join(appDir, "src", "slot-guarded", "@sidebar"), { recursive: true });

      fs.writeFileSync(
        path.join(appDir, "package.json"),
        JSON.stringify({ name: `ci-redir-${bundler}`, type: "module", private: true }, null, 2)
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
        path.join(appDir, "src", "login", "page.tsx"),
        `export default function Login() { return <main>Login</main>; }\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "guarded", "page_functions.ts"),
        `import { redirect, getContext } from "dinou";
export const revalidate = 0;
export async function getProps() {
  const { req } = getContext();
  if (req.cookies.session !== "ok") return redirect("/login?from=guarded");
  return { profile: { name: "Ada" } };
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "guarded", "page.tsx"),
        `export default function Guarded({ profile }: { profile: { name: string } }) {
  (globalThis as any).__CI_PAGE_CNT__ = ((globalThis as any).__CI_PAGE_CNT__ || 0) + 1;
  return <main>Hello {profile.name}</main>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "guarded", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function GuardedLayout({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  (globalThis as any).__CI_LAY_CNT__ = ((globalThis as any).__CI_LAY_CNT__ || 0) + 1;
  return <div>{sidebar}{children}</div>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "guarded", "@sidebar", "page.tsx"),
        `export default function Sidebar() {
  (globalThis as any).__CI_SLOT_CNT__ = ((globalThis as any).__CI_SLOT_CNT__ || 0) + 1;
  return <aside>Side</aside>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "layout-guarded", "layout_functions.ts"),
        `import { redirect, getContext } from "dinou";
export const revalidate = 0;
export async function getProps() {
  const { req } = getContext();
  if (req.cookies.tenant !== "acme") return redirect("/login?from=layout");
  return { tenant: { title: "Acme" } };
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "layout-guarded", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function TenantLayout({ children, tenant }: { children: ReactNode; tenant: { title: string } }) {
  (globalThis as any).__CI_TENANT_CNT__ = ((globalThis as any).__CI_TENANT_CNT__ || 0) + 1;
  return <section data-tenant={tenant.title}>{children}</section>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "layout-guarded", "page_functions.ts"),
        `export const revalidate = 0;\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "layout-guarded", "page.tsx"),
        `export default function TenantPage() { return <main>Tenant</main>; }\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "slot-guarded", "page_functions.ts"),
        `export const revalidate = 0;\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "slot-guarded", "page.tsx"),
        `export default function SlotHost() { return <main>Host</main>; }\n`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "slot-guarded", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function SlotLayout({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  (globalThis as any).__CI_SLOT_LAY_CNT__ = ((globalThis as any).__CI_SLOT_LAY_CNT__ || 0) + 1;
  return <div>{sidebar}{children}</div>;
}
`
      );
      fs.writeFileSync(
        path.join(appDir, "src", "slot-guarded", "@sidebar", "page.tsx"),
        `import { redirect } from "dinou";
export default function RedirectSlot() { return redirect("/login?from=slot"); }
`
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
        /Error building page/,
        `[${bundler}] build must not log 'Error building page' on guarded redirecting routes`
      );
      assert.equal(
        fs.existsSync(path.join(appDir, ".dinou", "dist2", "guarded", "index.html")),
        false,
        `[${bundler}] revalidate=0 /guarded must not be written to .dinou/dist2`
      );

      const probePath = path.join(appDir, "probe.mjs");
      fs.writeFileSync(
        probePath,
        `import assert from "node:assert/strict";
import { handleRequest } from "./.dinou/node/rsc-engine.mjs";
import { renderHtml } from "./.dinou/node/ssr-engine.mjs";

const opts = { runtime: "node-bundle", renderHtmlStream: renderHtml };
globalThis.__CI_PAGE_CNT__ = 0;
globalThis.__CI_LAY_CNT__ = 0;
globalThis.__CI_SLOT_CNT__ = 0;
globalThis.__CI_TENANT_CNT__ = 0;
globalThis.__CI_SLOT_LAY_CNT__ = 0;

const r1 = await handleRequest(new Request("http://127.0.0.1:3000/guarded"), opts);
assert.equal(r1.status, 302);
assert.equal(r1.headers.get("location"), "/login?from=guarded");
assert.equal(globalThis.__CI_PAGE_CNT__, 0);
assert.equal(globalThis.__CI_LAY_CNT__, 0);
assert.equal(globalThis.__CI_SLOT_CNT__, 0);

const r2 = await handleRequest(new Request("http://127.0.0.1:3000/____rsc_page____/guarded"), opts);
assert.equal(r2.status, 200);
assert.equal(r2.headers.get("x-rsc-redirect"), "/login?from=guarded");
assert.equal(globalThis.__CI_PAGE_CNT__, 0);

const r3 = await handleRequest(new Request("http://127.0.0.1:3000/guarded", { headers: { cookie: "session=ok" } }), opts);
assert.equal(r3.status, 200);
assert.match(await r3.text(), /Hello.*Ada/);

const r4 = await handleRequest(new Request("http://127.0.0.1:3000/layout-guarded"), opts);
assert.equal(r4.status, 302);
assert.equal(r4.headers.get("location"), "/login?from=layout");
assert.equal(globalThis.__CI_TENANT_CNT__, 0);

const r5 = await handleRequest(new Request("http://127.0.0.1:3000/____rsc_layout____/layout-guarded"), opts);
assert.equal(r5.status, 200);
assert.equal(r5.headers.get("x-rsc-redirect"), "/login?from=layout");

const r6 = await handleRequest(new Request("http://127.0.0.1:3000/slot-guarded"), opts);
assert.equal(r6.status, 302);
assert.equal(r6.headers.get("location"), "/login?from=slot");
assert.equal(globalThis.__CI_SLOT_LAY_CNT__, 0);

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
  console.log("   ✅ Section 5 passed!");

  // =========================================================================
  // 6️⃣ dinou export-static Output Verification (SSG & ppr=true Zero-Hole useSearchParams)
  // =========================================================================
  console.log(
    "6️⃣ Verifying dinou export-static output for SSG & ppr=true zero-hole pages using useSearchParams()..."
  );
  {
    const exportDir = path.join(tmpBase, "export-static-search");
    fs.mkdirSync(path.join(exportDir, "src", "ppr-zero"), { recursive: true });
    fs.writeFileSync(
      path.join(exportDir, "package.json"),
      JSON.stringify({ name: "ci-export-search", type: "module", private: true }, null, 2)
    );
    writeDinouShim(exportDir);
    fs.writeFileSync(
      path.join(exportDir, "src", "layout.tsx"),
      `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`
    );
    fs.writeFileSync(
      path.join(exportDir, "src", "search-box.tsx"),
      `"use client";
import { useSearchParams } from "dinou";
export function SearchBox() {
  const sp = useSearchParams();
  return <div id="sp">{sp.get("q") || "empty"}</div>;
}
`
    );
    fs.writeFileSync(
      path.join(exportDir, "src", "page.tsx"),
      `import { SearchBox } from "./search-box";
export default function Home() { return <main><SearchBox /></main>; }
`
    );
    fs.writeFileSync(
      path.join(exportDir, "src", "ppr-zero", "page_functions.ts"),
      `export const ppr = true;\n`
    );
    fs.writeFileSync(
      path.join(exportDir, "src", "ppr-zero", "page.tsx"),
      `import { SearchBox } from "../search-box";
export default function PprZero() { return <main><SearchBox /></main>; }
`
    );

    const expRes = spawnSync(process.execPath, [CLI_PATH, "export-static"], {
      cwd: exportDir,
      encoding: "utf8",
    });
    assert.equal(
      expRes.status,
      0,
      `export-static failed:\n${expRes.stdout}\n${expRes.stderr}`
    );

    const outHomeHtml = fs.readFileSync(
      path.join(exportDir, "out", "index.html"),
      "utf8"
    );
    const outPprHtml = fs.readFileSync(
      path.join(exportDir, "out", "ppr-zero", "index.html"),
      "utf8"
    );
    assert.ok(outHomeHtml.includes("window.__DINOU_STATIC_EXPORT__=true;"));
    assert.ok(outHomeHtml.includes('<div id="sp">empty</div>'));
    assert.ok(outPprHtml.includes("window.__DINOU_STATIC_EXPORT__=true;"));
    assert.ok(outPprHtml.includes('<div id="sp">empty</div>'));
    assert.ok(fs.existsSync(path.join(exportDir, "out", "ppr-zero", "page.rsc")));
  }
  console.log("   ✅ Section 6 passed!");
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
    `verify-api-reference-fixes-1-ci.mjs must not mutate host workspace ${rel}`
  );
}

console.log(
  "\n🎉 All 6 Dinou v9.4.0 API Reference Batch 1 Navigation, <Link>, redirect(), useRouter() & useSearchParams() verification suites PASSED!"
);
