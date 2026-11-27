// tests/unit/typegen-strict.test.mjs
// Series Z — Phase 1 — Stage 4 (Check #Z4 — Part B):
// Strict `dinou typegen` (`generateRouteTypes`) verification under `tsc --noEmit --strict`
// across complex route topologies, hyphenated params, nested groups inside @parallel slots,
// optional catch-all [[...opt]], optional single [[opt]], custom asset extensions, .env keys,
// contextual "./dinou" modules, physical shadow warnings, and `@ts-expect-error` negative checks.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const REPO_ROOT = process.cwd();
const DINOU_ROOT = fs.existsSync(path.resolve(REPO_ROOT, "dinou", "cli.js"))
  ? path.resolve(REPO_ROOT, "dinou")
  : fs.existsSync(
        path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou", "cli.js")
      )
    ? path.resolve(REPO_ROOT, "node_modules", "dinou", "dinou")
    : path.resolve(REPO_ROOT, "node_modules", "dinou");

function removeDirSafe(dirPath) {
  try {
    fs.rmSync(dirPath, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 60,
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

function writeDinouTypesShim(tmpApp) {
  const dinouDir = path.join(tmpApp, "node_modules", "dinou");
  fs.mkdirSync(dinouDir, { recursive: true });
  const relTo = (relPath) => {
    const rel = path
      .relative(dinouDir, path.join(DINOU_ROOT, relPath))
      .replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  };
  fs.writeFileSync(
    path.join(dinouDir, "package.json"),
    JSON.stringify(
      {
        name: "dinou",
        version: "10.0.7",
        type: "module",
        types: "./index.d.ts",
        exports: {
          ".": {
            types: "./index.d.ts",
            default: "./index.js",
          },
          "./server": {
            types: "./server.d.ts",
            default: "./server.js",
          },
          "./env": {
            types: "./env.d.ts",
          },
        },
      },
      null,
      2
    )
  );
  for (const dts of ["index.d.ts", "server.d.ts", "env.d.ts", "assets.d.ts", "css.d.ts"]) {
    const srcDts = path.join(DINOU_ROOT, dts);
    if (fs.existsSync(srcDts)) {
      fs.copyFileSync(srcDts, path.join(dinouDir, dts));
    }
  }
  fs.writeFileSync(
    path.join(dinouDir, "index.js"),
    `export * from ${JSON.stringify(relTo("index.js"))};\nexport { default } from ${JSON.stringify(relTo("index.js"))};\n`
  );
  fs.writeFileSync(
    path.join(dinouDir, "server.js"),
    `export * from ${JSON.stringify(relTo("server.js"))};\n`
  );
}

function formatDiagnostics(diagnostics, baseDir) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => baseDir,
    getNewLine: () => "\n",
  });
}

test("1. [#Z4 Part B] Strict dinou typegen under tsc --noEmit --strict: complex topologies, hyphenated [user-id], nested (group) inside @modal, [[...opt]] / [[opt]], custom assets, .env keys & @ts-expect-error negative checks", async () => {
  const { generateRouteTypes } = await import(
    pathToFileURL(path.join(DINOU_ROOT, "core/generate-route-types.js")).href
  );

  const tmpApp = createFixtureDir("tmp-z4-typegen-");
  try {
    writeDinouTypesShim(tmpApp);

    fs.writeFileSync(
      path.join(tmpApp, "package.json"),
      JSON.stringify({ name: "z4-typegen-strict", type: "module" }, null, 2)
    );

    // Custom asset extensions in dinou.config.mjs (built-in .svg/.webp come from dinou/env, custom .glb/.wasm come from routes.d.ts)
    fs.writeFileSync(
      path.join(tmpApp, "dinou.config.mjs"),
      `export default {\n  assetExtensions: ["glb", "wasm"],\n};\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "dinou-env.d.ts"),
      `/// <reference types="dinou/env" />\n/// <reference path="./.dinou/types/routes.d.ts" />\n`
    );

    // .env and .env.example with secret values (keys must be typed, values must NEVER appear in routes.d.ts)
    fs.writeFileSync(
      path.join(tmpApp, ".env"),
      `Z4_STRICT_SECRET_KEY=super_secret_never_leak_991\nDINOU_PUBLIC_Z4_TITLE=Z4PublicValueNeverLeak\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, ".env.example"),
      `Z4_EXAMPLE_ONLY_KEY=example_placeholder_never_leak\n`
    );

    // Create comprehensive route topology:
    // - src/layout.tsx + src/page.tsx
    // - src/(alpha)/(inner)/promo/page.tsx (nested route groups)
    // - src/(beta)/pricing/page.tsx (sibling route group)
    // - src/items/[id]/page.tsx + page_functions.ts
    // - src/org/[user-id]/page.tsx + layout.tsx (hyphenated param!)
    // - src/docs/[...slug]/page.tsx (required catch-all)
    // - src/opt/[[...opt]]/page.tsx (optional catch-all)
    // - src/lang/[[locale]]/page.tsx (optional single)
    // - src/dash/layout.tsx + src/dash/page.tsx
    //   - src/dash/@modal/(dialog)/page.tsx (nested group inside @parallel slot!)
    //   - src/dash/@modal/(dialog)/error.tsx
    //   - src/dash/@sidebar/[[sub]]/page.tsx (optional segment inside @parallel slot!)
    // - src/shadow/page.tsx + src/shadow/dinou.ts (physical shadow dir!)
    // - src/utils/helper.ts (non-route dir -> MUST NOT get contextual ./dinou!)
    const dirs = [
      "src/(alpha)/(inner)/promo",
      "src/(beta)/pricing",
      "src/items/[id]",
      "src/org/[user-id]",
      "src/docs/[...slug]",
      "src/opt/[[...opt]]",
      "src/lang/[[locale]]",
      "src/dash/@modal/(dialog)",
      "src/dash/@sidebar/[[sub]]",
      "src/shadow",
      "src/utils",
    ];
    for (const d of dirs) {
      fs.mkdirSync(path.join(tmpApp, d), { recursive: true });
    }

    fs.writeFileSync(
      path.join(tmpApp, "src/layout.tsx"),
      `import type { LayoutProps } from "./dinou";
export default function RootLayout({ children }: LayoutProps) {
  return <html><body>{children}</body></html>;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/page.tsx"),
      `import { Link, useRouter, refreshSlot, type PageProps } from "./dinou";
import logoUrl from "./logo.webp";
import modelUrl from "./scene.glb";
import iconUrl from "./icon.svg";

export default function HomePage(_props: PageProps) {
  const router = useRouter();
  const apiKey: string | undefined = process.env.Z4_STRICT_SECRET_KEY;
  const pubTitle: string | undefined = process.env.DINOU_PUBLIC_Z4_TITLE;
  const exampleKey: string | undefined = process.env.Z4_EXAMPLE_ONLY_KEY;
  const assets: string[] = [logoUrl, modelUrl, iconUrl];

  const triggerNav = () => {
    router.push("/items/[id]", { params: { id: "42" } });
    router.push("/org/[user-id]", { params: { "user-id": "alice-9" } });
    router.push("/docs/[...slug]", { params: { slug: ["a", "b"] } });
    router.push("/opt/[[...opt]]");
    router.push("/opt/[[...opt]]", { params: { opt: ["x", "y"] } });
    router.push("/lang/[[locale]]");
    router.push("/lang/[[locale]]", { params: { locale: "es" } });
    router.push("/promo");
    router.push("/pricing");
    router.push("/dash");
    refreshSlot("z4-slot", { fresh: true });
  };

  return (
    <main data-key={apiKey} data-title={pubTitle} data-ex={exampleKey} data-assets={assets.join(",")}>
      <button type="button" onClick={triggerNav}>Nav</button>
      <Link href="/items/[id]" params={{ id: "10" }}>Item 10</Link>
      <Link href="/items/10">Item 10 Concrete</Link>
      <Link href="/org/[user-id]" params={{ "user-id": "u-1" }}>Org User</Link>
      <Link href="/docs/[...slug]" params={{ slug: ["guide", "intro"] }}>Docs</Link>
      <Link href="/opt/[[...opt]]">Opt Root</Link>
      <Link href="/opt/[[...opt]]" params={{ opt: ["nested"] }}>Opt Nested</Link>
      <Link href="/lang/[[locale]]">Lang Default</Link>
      <Link href="/lang/[[locale]]" params={{ locale: "en" }}>Lang EN</Link>
      <Link href="/promo">Promo (Nested Group)</Link>
      <Link href="/pricing">Pricing (Group)</Link>
      <Link href="/dash">Dash</Link>
    </main>
  );
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/(alpha)/(inner)/promo/page.tsx"),
      `import type { PageProps } from "./dinou";
export default function PromoPage(_props: PageProps) { return <div>Promo</div>; }
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/(beta)/pricing/page.tsx"),
      `import type { PageProps } from "./dinou";
export default function PricingPage(_props: PageProps) { return <div>Pricing</div>; }
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/items/[id]/page_functions.ts"),
      `import type { PageFunctions } from "./dinou";
export const getStaticPaths: PageFunctions["getStaticPaths"] = () => ["1", "2"];
export const getProps: PageFunctions<{ label: string }>["getProps"] = (params) => ({
  label: \`item-\${params?.id ?? ""}\`,
});
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/items/[id]/page.tsx"),
      `import type { PageProps } from "./dinou";
export default function ItemPage({ params, label }: PageProps<{ label: string }>) {
  const id: string = params.id;
  return <div>{id}:{label}</div>;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/org/[user-id]/layout.tsx"),
      `import type { LayoutProps } from "./dinou";
export default function OrgLayout({ children, params }: LayoutProps) {
  const userId: string = params["user-id"];
  return <section data-user={userId}>{children}</section>;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/org/[user-id]/page.tsx"),
      `import type { PageProps } from "./dinou";
export default function OrgUserPage({ params }: PageProps) {
  const userId: string = params["user-id"];
  return <div>{userId}</div>;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/docs/[...slug]/page.tsx"),
      `import type { PageProps } from "./dinou";
export default function DocsPage({ params }: PageProps) {
  const parts: string[] = params.slug;
  return <div>{parts.join("/")}</div>;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/opt/[[...opt]]/page.tsx"),
      `import type { PageProps } from "./dinou";
export default function OptCatchAllPage({ params }: PageProps) {
  // Runtime component props normalize [[...opt]] to string[] (always array, [] when omitted)
  const segments: string[] = params.opt;
  return <div>{segments.join("/")}</div>;
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/lang/[[locale]]/page.tsx"),
      `import type { PageProps } from "./dinou";
export default function LangPage({ params }: PageProps) {
  const locale: string | undefined = params.locale;
  return <div>{locale ?? "default"}</div>;
}
`
    );

    // Dashboard layout with BOTH @modal (hosting nested (dialog) group!) and @sidebar (hosting [[sub]] optional segment!)
    fs.writeFileSync(
      path.join(tmpApp, "src/dash/layout.tsx"),
      `import type { LayoutProps } from "./dinou";
export default function DashLayout({ children, modal, sidebar }: LayoutProps) {
  return (
    <div>
      <aside>{sidebar}</aside>
      <main>{children}</main>
      <div>{modal}</div>
    </div>
  );
}
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/dash/page.tsx"),
      `import type { PageProps } from "./dinou";
export default function DashPage(_props: PageProps) { return <div>Dash</div>; }
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/dash/@modal/(dialog)/page.tsx"),
      `import type { SlotProps } from "./dinou";
export default function ModalDialogSlot(_props: SlotProps) { return <div>Dialog</div>; }
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/dash/@modal/(dialog)/error.tsx"),
      `import type { ErrorProps } from "./dinou";
export default function ModalDialogError({ error }: ErrorProps) { return <div>{error.message}</div>; }
`
    );

    fs.writeFileSync(
      path.join(tmpApp, "src/dash/@sidebar/[[sub]]/page.tsx"),
      `import type { SlotProps } from "./dinou";
export default function SidebarSlot({ params }: SlotProps) {
  const sub: string | undefined = params.sub;
  return <div>{sub ?? "root"}</div>;
}
`
    );

    // Physical shadow file in src/shadow/dinou.ts
    fs.writeFileSync(
      path.join(tmpApp, "src/shadow/dinou.ts"),
      `export const customShadow = true;\n`
    );
    fs.writeFileSync(
      path.join(tmpApp, "src/shadow/page.tsx"),
      `export default function ShadowPage() { return <div>Shadow</div>; }\n`
    );

    // Non-route utility dir
    fs.writeFileSync(
      path.join(tmpApp, "src/utils/helper.ts"),
      `export const add = (a: number, b: number) => a + b;\n`
    );

    // Negative @ts-expect-error probe file! EVERY SINGLE @ts-expect-error MUST be triggered
    // (otherwise strict tsc fails with TS2578: Unused '@ts-expect-error' directive!)
    fs.writeFileSync(
      path.join(tmpApp, "src/dash/__z4_negative_probes__.tsx"),
      `import { Link as GlobalLink, useRouter as useGlobalRouter } from "dinou";
import type { LayoutProps, PageProps } from "./dinou";

export function NegativeLinkAndRouterProbes() {
  const router = useGlobalRouter();

  // 1. Invalid static route string
  // @ts-expect-error invalid route must be rejected
  const bad1 = <GlobalLink href="/this-route-does-not-exist">Bad</GlobalLink>;

  // 2. Missing required [id] param on /items/[id]
  // @ts-expect-error required params missing for /items/[id]
  const bad2 = <GlobalLink href="/items/[id]">Missing ID</GlobalLink>;

  // 3. Wrong catch-all param type (string instead of string[])
  // @ts-expect-error catch-all slug must be string[], not string
  const bad3 = <GlobalLink href="/docs/[...slug]" params={{ slug: "not-an-array" }}>Bad Catch-All</GlobalLink>;

  // 4. Wrong param key on hyphenated /org/[user-id]
  // @ts-expect-error hyphenated param must be "user-id", not userId
  const bad4 = <GlobalLink href="/org/[user-id]" params={{ userId: "u-1" }}>Bad Hyphen</GlobalLink>;

  // 5. Wrong param key in router.push
  // @ts-expect-error wrong param key in router.push
  router.push("/items/[id]", { params: { wrongKey: "1" } });

  // 6. Invalid route string in router.push
  // @ts-expect-error unknown route in router.push
  router.push("/nonexistent-z4-route");

  return (
    <div>
      {bad1}
      {bad2}
      {bad3}
      {bad4}
    </div>
  );
}

export function NegativeLayoutAndPagePropProbes(
  layoutProps: LayoutProps,
  pageProps: PageProps
) {
  // 7. Unknown @nonexistent parallel slot prop on Dash LayoutProps (only modal & sidebar exist!)
  // @ts-expect-error unknown parallel slot prop must be rejected
  const badSlot = layoutProps.nonexistentSlot;

  // 8. Unknown param on static /dash PageProps
  // @ts-expect-error unknown route param must be rejected
  const badParam = pageProps.params.nonexistentParam;

  return { badSlot, badParam };
}
`
    );

    // 1. Run generateRouteTypes and capture physical shadow warning
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    let genStats;
    try {
      genStats = generateRouteTypes(tmpApp);
    } finally {
      console.warn = origWarn;
    }

    assert.ok(genStats.totalRoutes >= 10, `Expected >= 10 discovered routes, got ${genStats.totalRoutes}`);
    assert.ok(
      warnings.some((w) => w.includes('src/shadow/dinou') && w.includes('shadows')),
      `Expected physical shadow warning for src/shadow/dinou, got: ${JSON.stringify(warnings)}`
    );

    // Verify routes.d.ts content: hyphenated param, nested slot group, custom assets, env keys (and ZERO leaked env values!)
    const routesDtsPath = path.join(tmpApp, ".dinou/types/routes.d.ts");
    assert.equal(fs.existsSync(routesDtsPath), true, "Expected .dinou/types/routes.d.ts");
    const routesDts = fs.readFileSync(routesDtsPath, "utf8");

    assert.ok(routesDts.includes('"/org/[user-id]": { "user-id": string }'), "Must quote hyphenated [user-id] param");
    assert.ok(routesDts.includes('"/dash": { modal?: ReactNode; sidebar?: ReactNode }'), "Must infer BOTH modal (nested group) and sidebar ([[sub]]) slots on /dash layout");
    assert.ok(routesDts.includes('"/opt/[[...opt]]": { opt?: string[] }'), "Navigable map must keep [[...opt]] optional");
    assert.ok(routesDts.includes('"/opt/[[...opt]]": { opt: string[] }'), "Component RouteParams map must normalize [[...opt]] to string[]");
    const assetsDtsPath = path.join(tmpApp, ".dinou/types/assets.d.ts");
    assert.ok(routesDts.includes('/// <reference path="./assets.d.ts" />'), "routes.d.ts must reference ambient assets.d.ts");
    assert.equal(fs.existsSync(assetsDtsPath), true, "Expected ambient .dinou/types/assets.d.ts");
    const assetsDts = fs.readFileSync(assetsDtsPath, "utf8");
    assert.ok(assetsDts.includes('declare module "*.glb"'), "Custom .glb asset module declaration missing");
    assert.ok(assetsDts.includes('declare module "*.wasm"'), "Custom .wasm asset module declaration missing");
    assert.ok(routesDts.includes("Z4_STRICT_SECRET_KEY?: string;"), ".env key missing from ProcessEnv");
    assert.ok(routesDts.includes("DINOU_PUBLIC_Z4_TITLE?: string;"), "Public .env key missing from ProcessEnv");
    assert.ok(routesDts.includes("Z4_EXAMPLE_ONLY_KEY?: string;"), ".env.example key missing from ProcessEnv");
    assert.equal(routesDts.includes("super_secret_never_leak_991"), false, "NEVER leak .env secret value!");
    assert.equal(routesDts.includes("Z4PublicValueNeverLeak"), false, "NEVER leak .env public value!");
    assert.equal(routesDts.includes("example_placeholder_never_leak"), false, "NEVER leak .env.example value!");

    // Non-route src/utils MUST NOT get a contextual module
    assert.equal(
      fs.existsSync(path.join(tmpApp, ".dinou/routes/utils/dinou.d.ts")),
      false,
      "Non-route dir src/utils must NOT get contextual dinou.d.ts"
    );

    // 2. Write strict tsconfig.json and run real TypeScript compiler (`strict: true`, `noEmit: true`)
    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        rootDirs: ["src", ".dinou/routes"],
      },
      include: ["dinou-env.d.ts", "src/**/*", ".dinou/types/**/*.d.ts"],
    };
    const tsconfigPath = path.join(tmpApp, "tsconfig.json");
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

    const readRes = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    assert.equal(readRes.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(readRes.config, ts.sys, tmpApp);
    assert.equal(parsed.errors.length, 0, `tsconfig parse errors: ${formatDiagnostics(parsed.errors, tmpApp)}`);

    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(
      diagnostics.length,
      0,
      `Strict tsc --noEmit --strict failed with ${diagnostics.length} diagnostic(s):\n${formatDiagnostics(diagnostics, tmpApp)}`
    );
  } finally {
    removeDirSafe(tmpApp);
  }
});
