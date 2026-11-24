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

const esbuild = await import(
  pathToFileURL(path.resolve(REPO_ROOT, "node_modules", "esbuild", "lib", "main.js")).href
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

test("1. All modified JSX files parse cleanly with esbuild", async () => {
  const jsxFiles = [
    "core/link.jsx",
    "core/client.jsx",
    "core/client-webpack.jsx",
    "core/redirect.jsx",
  ];
  for (const rel of jsxFiles) {
    const abs = path.join(DINOU_ROOT, rel);
    const code = fs.readFileSync(abs, "utf8");
    const result = await esbuild.transform(code, {
      loader: "jsx",
      jsx: "automatic",
      format: "esm",
      sourcefile: abs,
    });
    assert.ok(result.code.length > 0, `Expected transformed output for ${rel}`);
  }
});

test("2. <Link> respects target='_blank', target='custom', target='_self', download (bool/string/false), fresh, external URLs, and e.button !== 0", async () => {
  const linkAbs = path.join(DINOU_ROOT, "core", "link.jsx");
  const navUtilsAbs = path.join(DINOU_ROOT, "core", "navigation-utils.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-link-unit-"));
  try {
    const wrapperEntry = path.join(tmpDir, "entry.js");
    fs.writeFileSync(
      wrapperEntry,
      `export { Link } from ${JSON.stringify(linkAbs)};
       export { pushCalls } from "./navigation.js";`,
      "utf8"
    );
    const bundled = await esbuild.build({
      entryPoints: [wrapperEntry],
      bundle: true,
      format: "esm",
      platform: "neutral",
      jsx: "automatic",
      write: false,
      plugins: [
        {
          name: "mock-deps",
          setup(build) {
            build.onResolve({ filter: /^\.\/navigation\.js$/ }, () => ({
              path: "mock-navigation",
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
                export function useRouter() {
                  return { push: (href, opts) => pushCalls.push({ href, opts }) };
                }
                export function usePathname() {
                  return "/dashboard";
                }
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

    const outPath = path.join(tmpDir, "link-bundle.mjs");
    fs.writeFileSync(outPath, bundled.outputFiles[0].text, "utf8");
    const { Link, pushCalls } = await import(pathToFileURL(outPath).href);

    const prefetchCalls = [];
    const prevWindow = globalThis.window;
    globalThis.window = {
      location: { origin: "http://localhost:3000", pathname: "/dashboard" },
      __DINOU_PREFETCH__: (href) => prefetchCalls.push(href),
    };

    try {
      const makeEvent = (overrides = {}) => ({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...overrides,
      });

      // target="_blank"
      const blankEl = Link({ href: "/report", target: "_blank", children: "Report" });
      assert.equal(blankEl.props.href, "/report");
      assert.equal(blankEl.props.target, "_blank");
      blankEl.props.onMouseEnter();
      assert.equal(prefetchCalls.length, 0, "target=_blank should not prefetch");
      const blankEv = makeEvent();
      blankEl.props.onClick(blankEv);
      assert.equal(blankEv.defaultPrevented, false, "target=_blank must not preventDefault");
      assert.equal(pushCalls.length, 0);

      // target="custom-frame"
      const customFrameEl = Link({ href: "/frame-view", target: "custom-frame", children: "Frame" });
      customFrameEl.props.onMouseEnter();
      assert.equal(prefetchCalls.length, 0, "custom target should not prefetch");
      const customFrameEv = makeEvent();
      customFrameEl.props.onClick(customFrameEv);
      assert.equal(customFrameEv.defaultPrevented, false, "custom target must not preventDefault");

      // download={true}, download="report.csv", download=""
      for (const dlVal of [true, "report.csv", ""]) {
        const dlEl = Link({ href: "/export.csv", download: dlVal, children: "Export" });
        dlEl.props.onMouseEnter();
        assert.equal(prefetchCalls.length, 0, `download=${JSON.stringify(dlVal)} should not prefetch`);
        const dlEv = makeEvent();
        dlEl.props.onClick(dlEv);
        assert.equal(
          dlEv.defaultPrevented,
          false,
          `download=${JSON.stringify(dlVal)} must not preventDefault`
        );
      }

      // download={false} MUST still SPA-navigate & prefetch
      const dlFalseEl = Link({ href: "/not-a-download", download: false, children: "Normal" });
      dlFalseEl.props.onMouseEnter();
      assert.deepEqual(prefetchCalls, ["/not-a-download"]);
      const dlFalseEv = makeEvent();
      dlFalseEl.props.onClick(dlFalseEv);
      assert.equal(dlFalseEv.defaultPrevented, true, "download={false} must SPA-navigate");
      assert.deepEqual(pushCalls.pop(), { href: "/not-a-download", opts: { fresh: false } });
      prefetchCalls.length = 0;

      // Non-primary mouse clicks (middle button=1, right button=2)
      for (const btn of [1, 2]) {
        const el = Link({ href: "/settings", children: "Settings" });
        const ev = makeEvent({ button: btn });
        el.props.onClick(ev);
        assert.equal(ev.defaultPrevented, false, `button=${btn} must not preventDefault`);
        assert.equal(pushCalls.length, 0);
      }

      // target="_self" MUST prefetch & SPA-navigate
      const selfEl = Link({ href: "/profile", target: "_self", children: "Profile" });
      selfEl.props.onMouseEnter();
      assert.deepEqual(prefetchCalls, ["/profile"]);
      const selfEv = makeEvent();
      selfEl.props.onClick(selfEv);
      assert.equal(selfEv.defaultPrevented, true, "target=_self should SPA-navigate");
      assert.deepEqual(pushCalls.pop(), { href: "/profile", opts: { fresh: false } });
      prefetchCalls.length = 0;

      // fresh={true} skips hover prefetch and passes { fresh: true } to push
      const freshEl = Link({ href: "/blog#comments", fresh: true, children: "Fresh Blog" });
      freshEl.props.onMouseEnter();
      assert.equal(prefetchCalls.length, 0, "fresh link should not prefetch");
      const freshEv = makeEvent();
      freshEl.props.onClick(freshEv);
      assert.equal(freshEv.defaultPrevented, true);
      assert.deepEqual(pushCalls.pop(), { href: "/blog#comments", opts: { fresh: true } });

      // External URLs skip prefetch and SPA interception
      for (const ext of ["https://example.com/docs", "mailto:hi@dinou.dev", "tel:+15551234"]) {
        const extEl = Link({ href: ext, children: "External" });
        extEl.props.onMouseEnter();
        assert.equal(prefetchCalls.length, 0, `external ${ext} must not prefetch`);
        const extEv = makeEvent();
        extEl.props.onClick(extEv);
        assert.equal(extEv.defaultPrevented, false, `external ${ext} must not preventDefault`);
      }
    } finally {
      if (prevWindow === undefined) delete globalThis.window;
      else globalThis.window = prevWindow;
    }
  } finally {
    removeDirSafe(tmpDir);
  }
});

test("3. useRouter() memoizes object reference, guards optional methods & useSearchParams() guards __DINOU_STATIC_EXPORT__", async () => {
  const navAbs = path.join(DINOU_ROOT, "core", "navigation.js");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinou-nav-unit-"));
  try {
    const wrapperEntry = path.join(tmpDir, "entry.js");
    fs.writeFileSync(
      wrapperEntry,
      `import React, { __setMockState } from "react";
       export { useRouter, useSearchParams } from ${JSON.stringify(navAbs)};
       export { __setMockState };`,
      "utf8"
    );

    const bundled = await esbuild.build({
      entryPoints: [wrapperEntry],
      bundle: true,
      format: "esm",
      platform: "neutral",
      write: false,
      plugins: [
        {
          name: "mock-react-hooks",
          setup(build) {
            build.onResolve({ filter: /^react$/ }, () => ({
              path: "mock-react",
              namespace: "mock",
            }));
            build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
              contents: `
                let memoCache = null;
                let memoDeps = null;
                let currentCtxValue = null;
                let hydratingFlag = false;
                export function __setMockState({ ctxValue, hydrating, resetMemo }) {
                  if (ctxValue !== undefined) currentCtxValue = ctxValue;
                  if (hydrating !== undefined) hydratingFlag = hydrating;
                  if (resetMemo) { memoCache = null; memoDeps = null; }
                }
                export default {
                  createContext: (def) => ({ _currentValue: def }),
                  useContext: () => currentCtxValue,
                  useState: (init) => [typeof init === "function" ? init() : init, () => {}],
                  useEffect: () => {},
                  useMemo: (fn, deps) => {
                    const same = memoDeps && deps && memoDeps.length === deps.length && deps.every((d, i) => Object.is(d, memoDeps[i]));
                    if (same) return memoCache;
                    memoDeps = deps;
                    memoCache = fn();
                    return memoCache;
                  },
                  useSyncExternalStore: (_sub, getSnap, getServerSnap) => hydratingFlag ? getServerSnap() : getSnap(),
                };
              `,
              loader: "js",
            }));
          },
        },
      ],
    });

    const outPath = path.join(tmpDir, "nav-bundle.mjs");
    fs.writeFileSync(outPath, bundled.outputFiles[0].text, "utf8");
    const mod = await import(pathToFileURL(outPath).href);

    // Null SSR context guard & stability
    mod.__setMockState({ ctxValue: null, resetMemo: true });
    const ssrR1 = mod.useRouter();
    const ssrR2 = mod.useRouter();
    assert.strictEqual(ssrR1, ssrR2, "useRouter() with null context must remain memoized");
    assert.doesNotThrow(() => {
      ssrR1.push("/x");
      ssrR1.replace("/x");
      ssrR1.back();
      ssrR1.forward();
      ssrR1.refresh();
    });
    await ssrR1.refreshSlot("slot-1");

    // Same RouterContext -> identical reference
    const ctx1 = {
      url: "/a",
      navigate: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      isPending: false,
    };
    mod.__setMockState({ ctxValue: ctx1, resetMemo: true });
    const r1 = mod.useRouter();
    const r2 = mod.useRouter();
    assert.strictEqual(
      r1,
      r2,
      "useRouter() must return stable reference across renders with identical RouterContext"
    );

    // Updated RouterContext -> fresh reference
    const ctx2 = { ...ctx1, url: "/b" };
    mod.__setMockState({ ctxValue: ctx2 });
    const r3 = mod.useRouter();
    assert.notStrictEqual(
      r1,
      r3,
      "useRouter() must update reference when RouterContext changes"
    );

    // Partial context missing optional back/forward/refresh must not throw
    const partialCtx = { url: "/c", navigate: () => {}, isPending: false };
    mod.__setMockState({ ctxValue: partialCtx });
    const rPartial = mod.useRouter();
    assert.doesNotThrow(() => {
      rPartial.back();
      rPartial.forward();
      rPartial.refresh({ layout: true });
    });

    // useSearchParams() static-export hydration guard
    const prevWindow = globalThis.window;
    globalThis.window = {
      __DINOU_STATIC_EXPORT__: true,
      __DINOU_USE_STATIC__: false,
      __DINOU_PPR_RESUME__: false,
      location: { search: "?q=dinou&page=2" },
    };
    try {
      mod.__setMockState({ ctxValue: { url: "/search?q=dinou&page=2" }, hydrating: true });
      const duringHydration = mod.useSearchParams();
      assert.equal(
        duringHydration.toString(),
        "",
        "During static-export hydration, useSearchParams() must return empty URLSearchParams"
      );

      mod.__setMockState({ hydrating: false });
      const afterHydration = mod.useSearchParams();
      assert.equal(afterHydration.get("q"), "dinou");
      assert.equal(afterHydration.get("page"), "2");
    } finally {
      if (prevWindow === undefined) delete globalThis.window;
      else globalThis.window = prevWindow;
    }
  } finally {
    removeDirSafe(tmpDir);
  }
});

test("4. client.jsx & client-webpack.jsx parity, handler/get-jsx redirect guards & HTTP 302 JSDoc parity", () => {
  for (const rel of ["core/client.jsx", "core/client-webpack.jsx"]) {
    const src = fs.readFileSync(path.join(DINOU_ROOT, rel), "utf8");
    assert.match(
      src,
      /const url = route\.split\("::"\)\[0\]\.split\("#"\)\[0\] \|\| "\/";/,
      `${rel}: getPagePayload must strip #hash`
    );
    assert.match(
      src,
      /if \(isExternalUrl\(finalPath\)\) \{[\s\S]*?window\.location\.replace\(finalPath\)[\s\S]*?window\.location\.assign\(finalPath\)/,
      `${rel}: navigate must handle external URLs via window.location`
    );
    assert.match(
      src,
      /const routeWithoutHash = finalPath\.split\("#"\)\[0\] \|\| "\/";[\s\S]*?pageCache\.delete\(routeWithoutHash\);/,
      `${rel}: navigate must delete hashless cache key on fresh`
    );
    assert.match(
      src,
      /setRoute\(routeWithoutHash\);/,
      `${rel}: navigate must store hashless route state`
    );
    assert.match(
      src,
      /const cleanUrl = String\(url \|\| "\/"\)\.split\("#"\)\[0\] \|\| "\/";[\s\S]*?getLayoutKey\(cleanUrl\)[\s\S]*?getPagePayload\(cleanUrl, true\)/,
      `${rel}: __DINOU_PREFETCH__ must strip #hash before caching`
    );
    assert.match(
      src,
      /\(anchor\.target && anchor\.target !== "_self"\)/,
      `${rel}: global click listener must allow _self and skip _blank`
    );
    assert.match(
      src,
      /anchor\.hasAttribute\("download"\)/,
      `${rel}: global click listener must skip download links`
    );
    assert.match(
      src,
      /e\.button !== 0/,
      `${rel}: global click listener must skip non-primary clicks`
    );
  }

  const handlerSrc = fs.readFileSync(path.join(DINOU_ROOT, "core/handler.js"), "utf8");
  const reqCtxSrc = fs.readFileSync(path.join(DINOU_ROOT, "core/request-context.js"), "utf8");
  assert.match(reqCtxSrc, /"_hasRedirected"/, "request-context.js must exclude _hasRedirected from copyCustomContextProperties");
  assert.match(handlerSrc, /copyCustomContextProperties\b/, "handler.js must import and use copyCustomContextProperties");
  assert.match(handlerSrc, /_hasRedirected:\s*false/, "handler.js must initialize _hasRedirected: false on context");
  assert.match(
    handlerSrc,
    /if \(context\) context\._hasRedirected = true;/,
    "handler.js must flip context._hasRedirected on redirect"
  );
  assert.match(
    handlerSrc,
    /catch \(err\) \{\s*if \(bridge\.headers\.has\("x-rsc-redirect"\) \|\| bridge\.headers\.has\("Location"\)\) \{\s*return;\s*\}/,
    "handler.js RSC catch block must guard against redirect responses"
  );

  const getJsxSrc = fs.readFileSync(path.join(DINOU_ROOT, "core/get-jsx.js"), "utf8");
  const redirectShortCircuits = getJsxSrc.match(/_hasRedirected/g) || [];
  assert.ok(
    redirectShortCircuits.length >= 7,
    `Expected at least 7 _hasRedirected short-circuit checks in get-jsx.js, found ${redirectShortCircuits.length}`
  );

  const buildStaticSrc = fs.readFileSync(
    path.join(DINOU_ROOT, "core/build-static-pages.js"),
    "utf8"
  );
  assert.doesNotMatch(
    buildStaticSrc,
    /\.revalidate\s*\|\|/,
    "build-static-pages.js must use nullish coalescing (??) for revalidate so revalidate = 0 is not treated as falsy"
  );
  assert.match(
    buildStaticSrc,
    /if \(mockRes\._redirectUrl \|\| mockContext\._hasRedirected\)/,
    "build-static-pages.js must short-circuit SSG probing immediately after redirect()"
  );

  const genStaticRscSrc = fs.readFileSync(
    path.join(DINOU_ROOT, "core/generate-static-rsc.js"),
    "utf8"
  );
  assert.match(
    genStaticRscSrc,
    /if \(mockContext\) mockContext\._hasRedirected = true;/,
    "generate-static-rsc.js must expose and flip _hasRedirected on mockContext"
  );

  const bunBuildSrc = fs.readFileSync(
    path.join(DINOU_ROOT, "bun/build.js"),
    "utf8"
  );
  assert.ok(
    (bunBuildSrc.match(/"content-disposition":\s*"inline"/g) || []).length >= 2,
    "bun/build.js must set content-disposition: inline on Bun.file responses so Bun does not auto-inject filename= overriding HTML <a download>"
  );

  const redirectSrc = fs.readFileSync(path.join(DINOU_ROOT, "core/redirect.jsx"), "utf8");
  assert.match(redirectSrc, /Status 302/, "redirect.jsx comment must specify Status 302");
  assert.doesNotMatch(redirectSrc, /Status 307/, "redirect.jsx comment must not specify Status 307");

  const dts = fs.readFileSync(path.join(DINOU_ROOT, "index.d.ts"), "utf8");
  assert.match(dts, /HTTP 302 redirect/, "index.d.ts redirect JSDoc must specify HTTP 302");
  assert.doesNotMatch(dts, /HTTP 307 redirect/, "index.d.ts redirect JSDoc must not say HTTP 307");
});

test("5. Integration across Esbuild, Rollup & Webpack: getProps(), Page, @slot & layout_functions redirect short-circuits cleanly (SSR + RSC)", async () => {
  const bundlers = ["esbuild", "rollup", "webpack"];
  for (const bundler of bundlers) {
    const tmpApp = createFixtureDir(`tmp-redirect-${bundler}-`);
    try {
      fs.writeFileSync(
        path.join(tmpApp, "package.json"),
        JSON.stringify(
          {
            name: `redirect-test-${bundler}`,
            type: "module",
            private: true,
          },
          null,
          2
        )
      );

      const dinouShimDir = path.join(tmpApp, "node_modules", "dinou");
      fs.mkdirSync(dinouShimDir, { recursive: true });
      const dinouIndexPath = path.join(DINOU_ROOT, "index.js").replace(/\\/g, "/");
      const dinouServerPath = path.join(DINOU_ROOT, "server.js").replace(/\\/g, "/");
      const dinouConfigPath = path.join(DINOU_ROOT, "core", "config.js").replace(/\\/g, "/");
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

      fs.mkdirSync(path.join(tmpApp, "src", "login"), { recursive: true });
      fs.mkdirSync(path.join(tmpApp, "src", "guarded", "@sidebar"), { recursive: true });
      fs.mkdirSync(path.join(tmpApp, "src", "ssg-probe-guarded"), { recursive: true });
      fs.mkdirSync(path.join(tmpApp, "src", "res-redirect-guarded"), { recursive: true });
      fs.mkdirSync(path.join(tmpApp, "src", "page-body-guarded", "@sidebar"), { recursive: true });
      fs.mkdirSync(path.join(tmpApp, "src", "slot-guarded", "@sidebar"), { recursive: true });
      fs.mkdirSync(path.join(tmpApp, "src", "layout-guarded"), { recursive: true });

      fs.writeFileSync(
        path.join(tmpApp, "src", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><title>Redirect Test</title></head>
      <body>{children}</body>
    </html>
  );
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "page.tsx"),
        `export default function Home() { return <main>Home</main>; }\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "login", "page.tsx"),
        `export default function Login() { return <main>Login Screen</main>; }\n`
      );

      // Case A: page_functions.ts getProps() calls return redirect(...)
      fs.writeFileSync(
        path.join(tmpApp, "src", "guarded", "page_functions.ts"),
        `import { redirect, getContext } from "dinou";
export const revalidate = 0;
export async function getProps() {
  const { req } = getContext();
  if (req.cookies.session !== "valid") {
    return redirect("/login?from=/guarded");
  }
  return { profile: { name: "Alice" } };
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "guarded", "page.tsx"),
        `export default function GuardedPage({ profile }: { profile: { name: string } }) {
  (globalThis as any).__GUARDED_PAGE_RENDER_COUNT__ = ((globalThis as any).__GUARDED_PAGE_RENDER_COUNT__ || 0) + 1;
  return <main id="guarded-ok">Hello {profile.name}</main>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "guarded", "layout_functions.ts"),
        `export const revalidate = 0;\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "guarded", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function GuardedLayout({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  (globalThis as any).__GUARDED_LAYOUT_RENDER_COUNT__ = ((globalThis as any).__GUARDED_LAYOUT_RENDER_COUNT__ || 0) + 1;
  return <div id="guarded-layout">{sidebar}{children}</div>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "guarded", "@sidebar", "page.tsx"),
        `export default function SidebarSlot() {
  (globalThis as any).__GUARDED_SLOT_RENDER_COUNT__ = ((globalThis as any).__GUARDED_SLOT_RENDER_COUNT__ || 0) + 1;
  return <aside>Sidebar</aside>;
}
`
      );

      // Case A2: NO explicit revalidate = 0 (probed during SSG build, reads cookies & redirects)
      fs.writeFileSync(
        path.join(tmpApp, "src", "ssg-probe-guarded", "page_functions.ts"),
        `import { redirect, getContext } from "dinou";
export async function getProps() {
  const { req } = getContext();
  if (req.cookies.session !== "valid") {
    return redirect("/login?from=ssg-probe");
  }
  return { secret: { label: "TopSecret" } };
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "ssg-probe-guarded", "page.tsx"),
        `export default function SsgProbeGuardedPage({ secret }: { secret: { label: string } }) {
  return <main>{secret.label}</main>;
}
`
      );

      // Case B: page_functions.ts getProps() calls res.redirect(301, ...)
      fs.writeFileSync(
        path.join(tmpApp, "src", "res-redirect-guarded", "page_functions.ts"),
        `import { getContext } from "dinou";
export const revalidate = 0;
export async function getProps() {
  const { res } = getContext();
  res.redirect(301, "/login?from=res-redirect");
  return {};
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "res-redirect-guarded", "page.tsx"),
        `export default function ResRedirectPage({ requiredProp }: { requiredProp: { id: string } }) {
  (globalThis as any).__RES_REDIRECT_PAGE_COUNT__ = ((globalThis as any).__RES_REDIRECT_PAGE_COUNT__ || 0) + 1;
  return <main>{requiredProp.id}</main>;
}
`
      );

      // Case C: Server Component page.tsx itself calls return redirect(...)
      fs.writeFileSync(
        path.join(tmpApp, "src", "page-body-guarded", "page_functions.ts"),
        `export const revalidate = 0;\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "page-body-guarded", "page.tsx"),
        `import { redirect } from "dinou";
export default function PageBodyGuarded() {
  return redirect("/login?from=page-body");
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "page-body-guarded", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function PageBodyLayout({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  (globalThis as any).__PAGE_BODY_LAYOUT_COUNT__ = ((globalThis as any).__PAGE_BODY_LAYOUT_COUNT__ || 0) + 1;
  return <div>{sidebar}{children}</div>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "page-body-guarded", "@sidebar", "page.tsx"),
        `export default function PageBodySidebar() {
  (globalThis as any).__PAGE_BODY_SLOT_COUNT__ = ((globalThis as any).__PAGE_BODY_SLOT_COUNT__ || 0) + 1;
  return <aside>Body Sidebar</aside>;
}
`
      );

      // Case D: @sidebar slot calls return redirect(...)
      fs.writeFileSync(
        path.join(tmpApp, "src", "slot-guarded", "page_functions.ts"),
        `export const revalidate = 0;\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "slot-guarded", "page.tsx"),
        `export default function SlotGuardedPage() { return <main>Slot Host</main>; }\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "slot-guarded", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function SlotGuardedLayout({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  (globalThis as any).__SLOT_GUARDED_LAYOUT_COUNT__ = ((globalThis as any).__SLOT_GUARDED_LAYOUT_COUNT__ || 0) + 1;
  return <div>{sidebar}{children}</div>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "slot-guarded", "@sidebar", "page.tsx"),
        `import { redirect } from "dinou";
export default function RedirectingSidebarSlot() {
  return redirect("/login?from=slot");
}
`
      );

      // Case E: layout_functions.ts getProps() calls return redirect(...)
      fs.writeFileSync(
        path.join(tmpApp, "src", "layout-guarded", "layout_functions.ts"),
        `import { redirect, getContext } from "dinou";
export const revalidate = 0;
export async function getProps() {
  const { req } = getContext();
  if (req.cookies.tenant !== "acme") {
    return redirect("/login?from=layout");
  }
  return { tenant: { title: "Acme Corp" } };
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "layout-guarded", "layout.tsx"),
        `import type { ReactNode } from "react";
export default function TenantLayout({ children, tenant }: { children: ReactNode; tenant: { title: string } }) {
  (globalThis as any).__TENANT_LAYOUT_RENDER_COUNT__ = ((globalThis as any).__TENANT_LAYOUT_RENDER_COUNT__ || 0) + 1;
  return <section data-tenant={tenant.title}>{children}</section>;
}
`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "layout-guarded", "page.tsx"),
        `export default function TenantPage() { return <main>Tenant Dashboard</main>; }\n`
      );
      fs.writeFileSync(
        path.join(tmpApp, "src", "layout-guarded", "page_functions.ts"),
        `export const revalidate = 0;\n`
      );

      const buildRes = spawnSync(
        process.execPath,
        [path.join(DINOU_ROOT, "cli.js"), `build:node:${bundler}`],
        { cwd: tmpApp, encoding: "utf8" }
      );
      assert.equal(
        buildRes.status,
        0,
        `Build failed for ${bundler}:\nSTDOUT:\n${buildRes.stdout}\nSTDERR:\n${buildRes.stderr}`
      );
      const combinedBuildLogs = `${buildRes.stdout}\n${buildRes.stderr}`;
      assert.doesNotMatch(
        combinedBuildLogs,
        /Error building page/,
        `[${bundler}] Build must NOT log 'Error building page' for revalidate=0 or SSG-probed redirecting routes:\n${combinedBuildLogs}`
      );
      assert.equal(
        fs.existsSync(path.join(tmpApp, ".dinou", "dist2", "guarded", "index.html")),
        false,
        `[${bundler}] revalidate=0 route /guarded must not be pre-rendered to .dinou/dist2`
      );
      assert.equal(
        fs.existsSync(path.join(tmpApp, ".dinou", "dist2", "ssg-probe-guarded", "index.html")),
        false,
        `[${bundler}] dynamic-cookie redirecting route /ssg-probe-guarded must not be pre-rendered to .dinou/dist2`
      );

      const prevCwd = process.cwd();
      process.chdir(tmpApp);
      try {
        const rscMod = await import(
          pathToFileURL(path.join(tmpApp, ".dinou", "node", "rsc-engine.mjs")).href +
            `?b=${bundler}&t=${Date.now()}`
        );
        const ssrMod = await import(
          pathToFileURL(path.join(tmpApp, ".dinou", "node", "ssr-engine.mjs")).href +
            `?b=${bundler}&t=${Date.now()}`
        );
        const ctxOpts = { runtime: "node-bundle", renderHtmlStream: ssrMod.renderHtml };

        // Reset counters
        globalThis.__GUARDED_PAGE_RENDER_COUNT__ = 0;
        globalThis.__GUARDED_LAYOUT_RENDER_COUNT__ = 0;
        globalThis.__GUARDED_SLOT_RENDER_COUNT__ = 0;
        globalThis.__RES_REDIRECT_PAGE_COUNT__ = 0;
        globalThis.__PAGE_BODY_LAYOUT_COUNT__ = 0;
        globalThis.__PAGE_BODY_SLOT_COUNT__ = 0;
        globalThis.__SLOT_GUARDED_LAYOUT_COUNT__ = 0;
        globalThis.__TENANT_LAYOUT_RENDER_COUNT__ = 0;

        // A1: SSR /guarded redirect
        const ssrRedirectRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/guarded"),
          ctxOpts
        );
        assert.equal(ssrRedirectRes.status, 302, `[${bundler}] SSR /guarded should return 302`);
        assert.equal(ssrRedirectRes.headers.get("location"), "/login?from=/guarded");
        assert.equal(globalThis.__GUARDED_PAGE_RENDER_COUNT__, 0, `[${bundler}] Page must not execute after getProps redirect`);
        assert.equal(globalThis.__GUARDED_LAYOUT_RENDER_COUNT__, 0, `[${bundler}] Layout must not execute after getProps redirect`);
        assert.equal(globalThis.__GUARDED_SLOT_RENDER_COUNT__, 0, `[${bundler}] @slot must not execute after getProps redirect`);

        // A2: RSC /____rsc_page____/guarded redirect
        const rscRedirectRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/____rsc_page____/guarded"),
          ctxOpts
        );
        assert.equal(rscRedirectRes.status, 200, `[${bundler}] RSC /guarded redirect should return 200`);
        assert.equal(rscRedirectRes.headers.get("x-rsc-redirect"), "/login?from=/guarded");
        assert.equal(globalThis.__GUARDED_PAGE_RENDER_COUNT__, 0, `[${bundler}] Page must not execute on RSC redirect`);

        // A3: Authenticated SSR /guarded renders Page, Layout & @sidebar
        const ssrOkRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/guarded", {
            headers: { cookie: "session=valid" },
          }),
          ctxOpts
        );
        assert.equal(ssrOkRes.status, 200, `[${bundler}] Authenticated /guarded should return 200`);
        const okHtml = await ssrOkRes.text();
        assert.match(okHtml, /Hello.*Alice/);
        assert.match(okHtml, /Sidebar/);
        assert.ok(globalThis.__GUARDED_PAGE_RENDER_COUNT__ >= 1);
        assert.ok(globalThis.__GUARDED_LAYOUT_RENDER_COUNT__ >= 1);
        assert.ok(globalThis.__GUARDED_SLOT_RENDER_COUNT__ >= 1);

        // B: res.redirect(301, ...) inside getProps()
        const resRedirSsr = await rscMod.handleRequest(
          new Request("http://localhost:3000/res-redirect-guarded"),
          ctxOpts
        );
        assert.equal(resRedirSsr.status, 301, `[${bundler}] res.redirect(301, ...) should return 301`);
        assert.equal(resRedirSsr.headers.get("location"), "/login?from=res-redirect");
        assert.equal(globalThis.__RES_REDIRECT_PAGE_COUNT__, 0, `[${bundler}] Page must not execute after res.redirect()`);

        const resRedirRsc = await rscMod.handleRequest(
          new Request("http://localhost:3000/____rsc_page____/res-redirect-guarded"),
          ctxOpts
        );
        assert.equal(resRedirRsc.status, 200);
        assert.equal(resRedirRsc.headers.get("x-rsc-redirect"), "/login?from=res-redirect");
        assert.equal(globalThis.__RES_REDIRECT_PAGE_COUNT__, 0);

        // C: Page body redirect short-circuits parent Layout & @sidebar
        const pageBodySsr = await rscMod.handleRequest(
          new Request("http://localhost:3000/page-body-guarded"),
          ctxOpts
        );
        assert.equal(pageBodySsr.status, 302, `[${bundler}] SSR /page-body-guarded should return 302`);
        assert.equal(pageBodySsr.headers.get("location"), "/login?from=page-body");
        assert.equal(globalThis.__PAGE_BODY_LAYOUT_COUNT__, 0, `[${bundler}] Layout must not run after page redirect`);
        assert.equal(globalThis.__PAGE_BODY_SLOT_COUNT__, 0, `[${bundler}] @slot must not run after page redirect`);

        const pageBodyRsc = await rscMod.handleRequest(
          new Request("http://localhost:3000/____rsc_page____/page-body-guarded"),
          ctxOpts
        );
        assert.equal(pageBodyRsc.status, 200);
        assert.equal(pageBodyRsc.headers.get("x-rsc-redirect"), "/login?from=page-body");

        // D: @slot redirect short-circuits enclosing Layout
        const slotRedirSsr = await rscMod.handleRequest(
          new Request("http://localhost:3000/slot-guarded"),
          ctxOpts
        );
        assert.equal(slotRedirSsr.status, 302, `[${bundler}] SSR /slot-guarded should return 302`);
        assert.equal(slotRedirSsr.headers.get("location"), "/login?from=slot");
        assert.equal(globalThis.__SLOT_GUARDED_LAYOUT_COUNT__, 0, `[${bundler}] Layout must not run after @slot redirect`);

        // E1: layout_functions.ts getProps() SSR redirect
        const layoutRedirectRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/layout-guarded"),
          ctxOpts
        );
        assert.equal(layoutRedirectRes.status, 302, `[${bundler}] SSR /layout-guarded should return 302`);
        assert.equal(layoutRedirectRes.headers.get("location"), "/login?from=layout");
        assert.equal(globalThis.__TENANT_LAYOUT_RENDER_COUNT__, 0, `[${bundler}] TenantLayout must not execute after layout getProps redirect`);

        // E2: layout_functions.ts getProps() RSC layout redirect
        const rscLayoutRedirectRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/____rsc_layout____/layout-guarded"),
          ctxOpts
        );
        assert.equal(rscLayoutRedirectRes.status, 200, `[${bundler}] RSC layout redirect should return 200`);
        assert.equal(rscLayoutRedirectRes.headers.get("x-rsc-redirect"), "/login?from=layout");
        assert.equal(globalThis.__TENANT_LAYOUT_RENDER_COUNT__, 0);

        // E3: Authenticated /layout-guarded renders TenantLayout
        const layoutOkRes = await rscMod.handleRequest(
          new Request("http://localhost:3000/layout-guarded", {
            headers: { cookie: "tenant=acme" },
          }),
          ctxOpts
        );
        assert.equal(layoutOkRes.status, 200);
        const layoutOkHtml = await layoutOkRes.text();
        assert.match(layoutOkHtml, /data-tenant="Acme Corp"/);
        assert.ok(globalThis.__TENANT_LAYOUT_RENDER_COUNT__ >= 1);
      } finally {
        process.chdir(prevCwd);
      }
    } finally {
      removeDirSafe(tmpApp);
    }
  }
});
