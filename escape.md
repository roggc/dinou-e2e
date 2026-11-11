# Underscore (`_folder`) Route & Bundler Escaping — Architecture & E2E Verification Guide

This document explains everything implemented in Dinou for **`_`-prefixed directory escaping (`A + B Radical`)** and provides **copy-paste-ready CI scripts and Playwright E2E tests** for the **`dev/dinou-e2e`** agent to verify the feature across **TypeScript (`tsc`)**, **Development (`dev:esbuild`, `dev:rollup`, `dev:webpack`)**, and **Production Builds (`esbuild`, `rollup`, `webpack`, plus `bun` / `deno` / `cloudflare`)**.

---

## 1. Design Philosophy & Architecture (`A + B Radical`)

Unlike Next.js (where `_folder` only opts out of URL routing so developers colocate active `_components` or `_actions`), Dinou routes **only** directories containing a `page.{tsx,ts,jsx,js}` file — meaning active `src/components/`, `src/blog/components/`, or `src/actions/` folders are already non-routable without any prefix.

In Dinou, prefixing a directory inside `src/` with an underscore (`_`, e.g. `src/_legacy-checkout/` or `src/docs/_draft-v2/`) means **complete exclusion ("parking / archiving")**: the entire directory subtree behaves as if it does not exist for routing, client/server manifests, CSS/asset extraction, VFS bundling, or Server Function execution, while keeping `"./dinou"` imports valid in the IDE and preventing accidental active imports with a clear compile-time error.

The implementation consists of **three coordinated pieces**:

### Piece A — Fallback Contextual `"./dinou"` Shims & Route Type Exclusion
- **Excluded from Active Route Types**: Any `_`-prefixed directory subtree inside `src/` is **100% excluded** from `.dinou/types/routes.d.ts` (`DinouRouteMap`, `DinouPageSegments`, `DinouLayoutMap`, `DinouSlotMap`, `DinouErrorSegments`). If an active page still links to `<Link href="/t-escaped">` or `<Link href="/_t-escaped">`, `npx tsc --noEmit` immediately flags the dead link!
- **Fallback `.dinou/routes/_.../dinou.{js,d.ts}` Shims**: Whenever an escaped `_` directory subtree contains Dinou route files (`page.*`, `layout.*`, `@slot/page.*`, `error.*`, `not_found.*`, `page_functions.*`, `layout_functions.*`), `dinou typegen` generates fallback contextual modules under `.dinou/routes/_.../`:
  - `ROUTE` is widened to `export declare const ROUTE: string;` (so `ContextualLink` and `ContextualRouter` fall back to permissive `LinkProps` without strict relative-target failures while parked).
  - `PageProps`, `SlotProps`, `LayoutProps`, and `PageFunctions` preserve dynamic parameter inference (`[slug]` → `{ slug: string }`, `[...slug]` → `{ slug: string[] }`, `[[...slug]]` → `{ slug?: string[] }`) via `LookupSingleSegmentParams` / `FallbackRouteParams`.
  - `LayoutProps` infers local sibling `@slot` directories inline (`{ sidebar?: ReactNode }`) even though the escaped layout is absent from `DinouLayoutMap`.
- **Non-Route `_` Folders Stay Clean**: Escaped `_` directories that do **not** contain route files (e.g. `src/_scratch-notes/`) receive **no** `dinou.{js,d.ts}` shims.
- **Automatic Un-Escape Cleanup**: Renaming `_folder` back to `folder` automatically prunes `.dinou/routes/_folder` and restores strict narrow `ROUTE` literal types under `.dinou/routes/folder`.
- **Note on `tsconfig.json`**: Parked routes using `"./dinou"` pass `npx tsc --noEmit` with **zero changes** to `tsconfig.json`. (If a user wants to park files with broken TypeScript syntax or global `"dinou"` links to disabled routes without `tsc` reporting errors, they can optionally add `"exclude": ["src/_*", "src/**/_*"]` to `tsconfig.json`.)

### Piece B1 — Radical Exclusion Across Bundlers, Manifests, VFS, Watchers & Server Functions
Every directory segment starting with `_` inside `src/` (`_*/**` and `**/_*/**`) is completely skipped by:
1. **Server Route Scanner**: `dinou/core/route-generator.js` (`collectSourceFiles` skips `entry.name.startsWith("_")`, keeping escaped files out of `routeModules`).
2. **Esbuild Entry & Asset Scanners**: `dinou/esbuild/helpers-esbuild/get-esbuild-entries.js` (`ignore: ["_*/**", "**/_*/**"]` on JS/TS, CSS, and static asset `fast-glob` scans) and `dinou/esbuild/helpers-esbuild/swc-disk-cache.js` (`syncAllSwcFiles` never compiles `_*` into `.dinou/swc/`).
3. **Rollup Manifest & Entry Plugin**: `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` (`ignore: ["_*/**", "**/_*/**"]` on both client/server scans + early `isUnderscoreEscapedSrcPath` bailout in `watchChange(id)`).
4. **Webpack Entry Scanner**: `dinou/webpack/helpers/get-webpack-entries.js` (`ignore: ["_*/**", "**/_*/**"]`).
5. **Virtual File System (VFS)**: `dinou/core/vfs.js` (`buildVfs` skips `_`-prefixed directories).
6. **Node / Bun / Deno / Cloudflare Dual-Engine Builders**: `dinou/node/bundle-dual-engine.js`, `dinou/bun/build.js`, `dinou/deno/build.js`, and `dinou/cloudflare/build.js` skip `_`-prefixed directories in both `findClientComponents` and `walkVfs`.
7. **Live Dev Watcher (`dinou/node/dev.js`)**: Skips `_*` in `findClientComponents`, ignores file edits inside `_*` for `pendingSrcChanges` (while still refreshing `generateRouteTypes`), and handles `unlinkDir` prefix pruning so live directory renames (`t-route` ↔ `_t-route`) cleanly add/remove client & server entries on Windows, macOS, and Linux.
8. **Defense-in-Depth Server Function Gate (`dinou/core/handler.js`)**: `POST /____server_function____` explicitly rejects any target path containing a `_`-prefixed directory segment inside `src/` with **`403 { error: "Forbidden access" }`** — even if `sfManifest` is `null` and `importModule` would otherwise fall back to disk.

### Piece B2 — Didactic Compile-Time Bundler Guard (`checkForbiddenUnderscoreImport`)
To prevent silent confusion for developers coming from Next.js who create `src/_components/Button.tsx` and import it from an active page, `dinou/core/resolve-contextual-dinou.js` exports `checkForbiddenUnderscoreImport`, wired into:
- `esbuildContextualDinouPlugin` (`build.onResolve`)
- `rollupContextualDinouPlugin` (`resolveId`)
- `webpackContextualDinouPlugin` (`nmf.hooks.beforeResolve`)

Whenever an **active** module in `src/` (outside `_*` directories) imports from a `_`-prefixed directory inside `src/` — whether via relative specifier (`./_components/Card`, `../_hooks/useAuth`), path alias (`@/_lib/db`, `~/blog/_actions/save`), or root-relative `src/_utils/math` — the bundler fails immediately with:

```text
Cannot import "./_components/Card" from "src/page.tsx": directories prefixed with "_" ("src/_components") are ignored by Dinou's router and bundlers. For active components, hooks, or actions, remove the leading "_" from the folder name.
```

> **Important distinction:** Escaping applies strictly to `_`-prefixed **directories**, not `_`-prefixed **files** inside active directories (e.g. importing `./_helper` resolved to `src/blog/_helper.ts` remains completely valid). Imports originating from *inside* an already-escaped `_` directory are also not flagged because escaped trees are never bundled.

---

## 2. Summary of Modified Framework Files

| File | Responsibility |
| :--- | :--- |
| `dinou/core/generate-route-types.js` | Scans `_` directories in `isEscaped` mode: excludes them from `.dinou/types/routes.d.ts`, emits fallback `.dinou/routes/_.../dinou.{js,d.ts}` only when route files exist in the subtree, and prunes stale shims on rename. |
| `dinou/core/resolve-contextual-dinou.js` | Defines `UNDERSCORE_GLOB_IGNORE`, `isUnderscoreEscapedSrcPath`, and `checkForbiddenUnderscoreImport`, enforcing the didactic bundler guard across Esbuild, Rollup, and Webpack. |
| `dinou/core/route-generator.js` | Skips `_`-prefixed directories when generating server `routeModules`. |
| `dinou/core/vfs.js` | Skips `_`-prefixed directories when building the VFS snapshot. |
| `dinou/core/handler.js` | Blocks `POST /____server_function____` calls targeting `_`-prefixed directories inside `src/` with `403 { error: "Forbidden access" }`. |
| `dinou/esbuild/helpers-esbuild/get-esbuild-entries.js` | Ignores `_*/**` and `**/_*/**` across JS/TS, CSS, and static asset entry globs. |
| `dinou/esbuild/helpers-esbuild/swc-disk-cache.js` | Ignores `_*/**` and `**/_*/**` when syncing SWC dev disk cache (`.dinou/swc/`). |
| `dinou/rollup/rollup-plugins/rollup-plugin-react-client-manifest.js` | Ignores `_*/**` and `**/_*/**` in Rollup client/server globs and skips `watchChange` events inside escaped `src/` folders. |
| `dinou/webpack/helpers/get-webpack-entries.js` | Ignores `_*/**` and `**/_*/**` in Webpack entry scanning. |
| `dinou/node/dev.js` | Skips `_*` in `findClientComponents`, ignores `_*` edits in `pendingSrcChanges`, and prunes `knownClientFiles`/`knownServerFiles` on `unlinkDir` renames. |
| `dinou/node/bundle-dual-engine.js` | Skips `_*` in `findClientComponents` and `walkVfs` during Node production builds. |
| `dinou/bun/build.js` | Skips `_*` in `findClientComponents` and `walkVfs` during Bun builds. |
| `dinou/deno/build.js` | Skips `_*` in `findClientComponents` and `walkVfs` during Deno builds. |
| `dinou/cloudflare/build.js` | Skips `_*` in `findClientComponents` and `walkVfs` during Cloudflare builds. |

---

## 3. Permanent Test Fixtures to Add in `dinou-e2e`

Ensure `tsconfig.json` in `dinou-e2e` already has `"rootDirs": ["src", ".dinou/routes"]` in `compilerOptions` and `".dinou/types/**/*.d.ts"` in `include` (as configured in `playwright-how-to.md`), and **do NOT** add `src/_*` to `tsconfig.json`'s `"exclude"` so `tsc --noEmit` actively verifies Piece A on `src/_t-escaped/**`!

Create the following fixture tree in `dinou-e2e/src/`:

```text
src/
├── _t-escaped/                               # Escaped route subtree (Piece A + Piece B1)
│   ├── layout.tsx                            # Fallback LayoutProps + local @sidebar inference
│   ├── page.tsx                              # Fallback PageProps + Link + ROUTE: string
│   ├── ClientWidget.tsx                      # "use client" + useRouter from "./dinou" (0 client chunks!)
│   ├── secret-actions.ts                     # "use server" (0 manifest entries + 403 HTTP guard!)
│   ├── parked.css                            # Ignored CSS file (0 CSS bundle leak!)
│   ├── broken-draft.tsx                      # Uninstalled package import (proves bundlers NEVER scan _t-escaped!)
│   └── [slug]/
│       ├── @sidebar/
│       │   └── page.tsx                      # Fallback SlotProps with inferred { slug: string }
│       └── contact/
│           └── page.tsx                      # Fallback PageProps with inferred { slug: string } + relative Link
├── _non-route-scratch/                       # Escaped NON-route folder (NO dinou.d.ts should be emitted)
│   └── notes.ts
└── t-escaped-probe/                          # Active route verifying dead-link @ts-expect-error + _file.ts validity
    ├── _allowed-file-helper.ts               # _-prefixed FILE inside active folder (MUST remain valid!)
    └── page.tsx
```

### 3.1. `src/_t-escaped/layout.tsx`
```tsx
import type { LayoutProps } from "./dinou";

export default function ParkedLayout({ children, sidebar }: LayoutProps) {
  return (
    <div data-testid="parked-layout">
      <aside>{sidebar}</aside>
      <main>{children}</main>
    </div>
  );
}
```

### 3.2. `src/_t-escaped/page.tsx`
```tsx
import { Link, ROUTE, type PageProps } from "./dinou";
import ClientWidget from "./ClientWidget";
import "./parked.css";

export default function ParkedIndexPage({ query }: PageProps) {
  // ROUTE is widened to `string` in escaped routes
  const checkWideString: string = ROUTE;
  return (
    <section>
      <h1>Parked Route ({checkWideString})</h1>
      <p>{query.tab ?? "none"}</p>
      <Link to="./acme/contact">Parked Contact</Link>
      <ClientWidget />
    </section>
  );
}
```

### 3.3. `src/_t-escaped/ClientWidget.tsx`
```tsx
"use client";

import { useRouter } from "./dinou";

export default function ClientWidget() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.push("/")}>
      Parked Client Widget
    </button>
  );
}
```

### 3.4. `src/_t-escaped/secret-actions.ts`
```ts
"use server";

export async function dangerousParkedAction() {
  return "SECURITY_BREACH_ESCAPED_SERVER_ACTION_EXECUTED";
}
```

### 3.5. `src/_t-escaped/parked.css`
```css
.parked-escaped-sentinel-selector-do-not-bundle {
  color: rgb(255, 0, 128);
}
```

### 3.6. `src/_t-escaped/broken-draft.tsx`
> **Why this file is a powerhouse test:** `@ts-expect-error` keeps `npx tsc --noEmit` happy (and ensures TypeScript still checks the file), while `import "__non_existent_parked_pkg_dinou_e2e__"` guarantees that if **any** bundler (`esbuild`, `rollup`, `webpack`), SWC cache sync, or manifest scanner ever touches `src/_t-escaped/`, the dev server or production build will immediately crash!

```tsx
// @ts-expect-error Intentional non-existent package to prove bundlers never scan `src/_t-escaped/`
import bogus from "__non_existent_parked_pkg_dinou_e2e__";

export function BrokenDraft() {
  return <div>{String(bogus)}</div>;
}
```

### 3.7. `src/_t-escaped/[slug]/@sidebar/page.tsx`
```tsx
import { Link, type SlotProps } from "./dinou";

export default function ParkedSidebarSlot({ params }: SlotProps) {
  const slug: string = params.slug;
  return (
    <nav>
      <span>Sidebar for {slug}</span>
      <Link to="./contact">Contact</Link>
    </nav>
  );
}
```

### 3.8. `src/_t-escaped/[slug]/contact/page.tsx`
```tsx
import { Link, type PageProps } from "./dinou";

export default function ParkedContactPage({ params }: PageProps) {
  const slug: string = params.slug;
  return (
    <div>
      <h2>Contact {slug}</h2>
      <Link to="../..">Back to Parked Root</Link>
    </div>
  );
}
```

### 3.9. `src/_non-route-scratch/notes.ts`
```ts
export const SCRATCH_NOTE = "No route files live in this escaped folder";
```

### 3.10. `src/t-escaped-probe/_allowed-file-helper.ts`
```ts
// Escaping applies to `_`-prefixed DIRECTORIES, NOT `_`-prefixed FILES in active directories!
export const ALLOWED_UNDERSCORE_FILE_VALUE = "underscore-file-ok";
```

### 3.11. `src/t-escaped-probe/page.tsx`
```tsx
import { Link } from "dinou";
import { ALLOWED_UNDERSCORE_FILE_VALUE } from "./_allowed-file-helper";

export default function EscapedProbePage() {
  // Compile-time dead-link verification (never rendered at runtime):
  if (false as boolean) {
    return (
      <div>
        {/* @ts-expect-error Escaped route `/t-escaped` must NOT exist in DinouRouteMap */}
        <Link href="/t-escaped">Dead Link Unprefixed</Link>
        {/* @ts-expect-error Escaped route `/_t-escaped` must NOT exist in DinouRouteMap */}
        <Link href="/_t-escaped">Dead Link Prefixed</Link>
      </div>
    );
  }

  return (
    <main>
      <h1 data-testid="probe-heading">Escaped Probe Active</h1>
      <p data-testid="probe-underscore-file">{ALLOWED_UNDERSCORE_FILE_VALUE}</p>
    </main>
  );
}
```

---

## 4. Standalone CI Script (`scripts/verify-escaped-ci.mjs`)

Create `scripts/verify-escaped-ci.mjs` in `dinou-e2e` to test:
1. **Piece A (`dinou typegen` + `tsc --noEmit`)**: Route exclusion from `.dinou/types/routes.d.ts`, fallback `.dinou/routes/_t-escaped/**/dinou.{js,d.ts}` generation, absence of `.dinou/routes/_non-route-scratch/`, live rename/un-escape pruning, and `0` TypeScript errors.
2. **Piece B1 (Build Artifact Inspection)**: Zero `_t-escaped` entries in `react-client-manifest.json`, zero `dangerousParkedAction` entries in `server-functions-manifest.json`, and zero `parked-escaped-sentinel-selector-do-not-bundle` CSS leaks in `.dinou/dist3/`.
3. **Piece B2 (Didactic Bundler Guard across Esbuild, Rollup & Webpack)**: Injects temporary active imports (`./_temp-hidden/Box` and `@/_t-escaped/ClientWidget`), runs `build:node:esbuild`, `build:node:rollup`, and `build:node:webpack`, and asserts every bundler fails with the exact didactic `"directories prefixed with \"_\""` message!

```js
// scripts/verify-escaped-ci.mjs
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();

function collectFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFilesRecursive(full));
    else results.push(full);
  }
  return results;
}

console.log("1️⃣ Running typegen & verifying Piece A (Escaped Fallback Shims & Route Exclusion)...");
execSync("npm run typegen", { stdio: "inherit", cwd: root });

const routesDts = fs.readFileSync(path.join(root, ".dinou/types/routes.d.ts"), "utf8");
assert(!routesDts.includes("t-escaped:"), "Expected `t-escaped` to be excluded from routes.d.ts");
assert(!routesDts.includes("_t-escaped"), "Expected `_t-escaped` to be excluded from routes.d.ts");
assert(routesDts.includes('"/t-escaped-probe":'), "Expected active `/t-escaped-probe` in routes.d.ts");

// Escaped route folder MUST receive fallback shims with widened `ROUTE: string`
const escapedRootDtsPath = path.join(root, ".dinou/routes/_t-escaped/dinou.d.ts");
const escapedSlotDtsPath = path.join(root, ".dinou/routes/_t-escaped/[slug]/@sidebar/dinou.d.ts");
const escapedContactDtsPath = path.join(root, ".dinou/routes/_t-escaped/[slug]/contact/dinou.d.ts");

assert(fs.existsSync(escapedRootDtsPath), "Expected fallback dinou.d.ts for src/_t-escaped");
assert(fs.existsSync(escapedSlotDtsPath), "Expected fallback dinou.d.ts for src/_t-escaped/[slug]/@sidebar");
assert(fs.existsSync(escapedContactDtsPath), "Expected fallback dinou.d.ts for src/_t-escaped/[slug]/contact");

const escapedRootDts = fs.readFileSync(escapedRootDtsPath, "utf8");
assert(
  escapedRootDts.includes("export declare const ROUTE: string;"),
  "Expected widened `ROUTE: string` in escaped dinou.d.ts"
);
assert(
  escapedRootDts.includes("sidebar?: ReactNode"),
  "Expected local @sidebar slot prop inference on escaped LayoutProps"
);

// Escaped NON-route folder MUST NOT receive shims
assert(
  !fs.existsSync(path.join(root, ".dinou/routes/_non-route-scratch/dinou.d.ts")),
  "Expected NO dinou.d.ts for non-route escaped folder src/_non-route-scratch"
);

console.log("2️⃣ Running strict `npx tsc --noEmit`...");
execSync("npx tsc --noEmit", { stdio: "inherit", cwd: root });

console.log("3️⃣ Verifying Piece B2 (Didactic Bundler Guard across esbuild, rollup, webpack)...");
const tempHiddenDir = path.join(root, "src/t-escaped-probe/_temp-hidden");
const tempHiddenFile = path.join(tempHiddenDir, "Box.tsx");
const probePagePath = path.join(root, "src/t-escaped-probe/page.tsx");
const originalProbePage = fs.readFileSync(probePagePath, "utf8");

const bundlersToTest = ["esbuild", "rollup", "webpack"];

try {
  fs.mkdirSync(tempHiddenDir, { recursive: true });
  fs.writeFileSync(tempHiddenFile, 'export const Box = () => <div>Hidden</div>;\n', "utf8");

  // Test both relative (`./_temp-hidden/Box`) and alias (`@/_t-escaped/ClientWidget`) imports
  for (const badImport of ["./_temp-hidden/Box", "@/_t-escaped/ClientWidget"]) {
    fs.writeFileSync(
      probePagePath,
      `import "${badImport}";\n` + originalProbePage,
      "utf8"
    );

    for (const bundler of bundlersToTest) {
      let failedWithDidacticMsg = false;
      try {
        execSync(`npm run build:node:${bundler}`, { stdio: "pipe", cwd: root });
      } catch (err) {
        const output = String(err.stdout || "") + String(err.stderr || "");
        failedWithDidacticMsg =
          output.includes('directories prefixed with "_"') &&
          output.includes("are ignored by Dinou's router and bundlers");
        if (!failedWithDidacticMsg) {
          console.error(`Unexpected build error output for ${bundler} (${badImport}):\n`, output);
        }
      }
      assert(
        failedWithDidacticMsg,
        `Expected ${bundler} build to fail with didactic '_' folder error when importing "${badImport}"`
      );
    }
  }
} finally {
  fs.writeFileSync(probePagePath, originalProbePage, "utf8");
  fs.rmSync(tempHiddenDir, { recursive: true, force: true });
}

console.log("4️⃣ Verifying Piece B1 (Clean Production Build & Zero Manifest / CSS Leaks)...");
for (const bundler of bundlersToTest) {
  execSync(`npm run build:node:${bundler}`, { stdio: "inherit", cwd: root });

  // 4a. Check React Client Manifest has zero `_t-escaped` entries
  const clientManifestPath = path.join(
    root,
    ".dinou/react_client_manifest/react-client-manifest.json"
  );
  if (fs.existsSync(clientManifestPath)) {
    const clientManifestRaw = fs.readFileSync(clientManifestPath, "utf8");
    assert(
      !clientManifestRaw.includes("_t-escaped"),
      `[${bundler}] Leaked _t-escaped ClientWidget into react-client-manifest.json!`
    );
  }

  // 4b. Check Server Functions Manifest has zero `_t-escaped` / `dangerousParkedAction` entries
  const sfManifestPath = path.join(
    root,
    ".dinou/server_functions_manifest/server-functions-manifest.json"
  );
  if (fs.existsSync(sfManifestPath)) {
    const sfManifestRaw = fs.readFileSync(sfManifestPath, "utf8");
    assert(
      !sfManifestRaw.includes("_t-escaped") &&
        !sfManifestRaw.includes("dangerousParkedAction"),
      `[${bundler}] Leaked _t-escaped Server Function into server-functions-manifest.json!`
    );
  }

  // 4c. Check emitted `.dinou/dist3` assets have zero CSS/JS leaks from `_t-escaped`
  for (const builtFile of collectFilesRecursive(path.join(root, ".dinou/dist3"))) {
    if (/\.(js|mjs|cjs|css)$/.test(builtFile)) {
      const content = fs.readFileSync(builtFile, "utf8");
      assert(
        !content.includes("parked-escaped-sentinel-selector-do-not-bundle"),
        `[${bundler}] Leaked parked.css into ${builtFile}!`
      );
      assert(
        !content.includes("SECURITY_BREACH_ESCAPED_SERVER_ACTION_EXECUTED"),
        `[${bundler}] Leaked secret-actions.ts into ${builtFile}!`
      );
    }
  }
}

console.log("✅ All escaped `_folder` (A + B Radical) static, guard & manifest checks passed!");
```

---

## 5. Playwright E2E Test Suite (`tests/escaped-underscore.spec.ts`)

Create `tests/escaped-underscore.spec.ts` in `dinou-e2e`. Run this spec against **every bundler (`esbuild`, `rollup`, `webpack`)** in both **`dev`** and **`prod` (`build + start`)** modes:

```ts
// tests/escaped-underscore.spec.ts
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe("Escaped `_folder` Routes, Bundler Exclusion & Security", () => {
  test("1. Active app boots cleanly alongside broken/contextual files in `src/_t-escaped/` and allows `_file.ts`", async ({
    page,
  }) => {
    const response = await page.goto("/t-escaped-probe");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("probe-heading")).toHaveText("Escaped Probe Active");
    await expect(page.getByTestId("probe-underscore-file")).toHaveText(
      "underscore-file-ok"
    );
  });

  test("2. Escaped routes return 404 under both `/_t-escaped` and `/t-escaped` URLs", async ({
    request,
  }) => {
    const candidatePaths = [
      "/_t-escaped",
      "/t-escaped",
      "/_t-escaped/acme/contact",
      "/t-escaped/acme/contact",
    ];

    for (const urlPath of candidatePaths) {
      const res = await request.get(urlPath);
      expect(res.status(), `Expected 404 for escaped route ${urlPath}`).toBe(404);
    }
  });

  test("3. Crafted POST to `/____server_function____` targeting an escaped `_` directory is blocked with 403", async ({
    request,
  }) => {
    const res = await request.post("/____server_function____", {
      headers: {
        "x-server-function-call": "1",
        "content-type": "application/json",
      },
      data: {
        id: "file:///src/_t-escaped/secret-actions.ts#dangerousParkedAction",
        args: [],
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "Forbidden access" });
  });
});

// Optional dev-only live watcher test (runs when E2E_MODE === "dev")
test.describe("Live Dev Watcher: Escape & Un-Escape Directory Rename", () => {
  test.skip(process.env.E2E_MODE !== "dev", "Live directory rename watcher applies to dev mode");

  const activeDir = path.join(process.cwd(), "src/t-live-escape");
  const escapedDir = path.join(process.cwd(), "src/_t-live-escape");

  test.afterEach(() => {
    fs.rmSync(activeDir, { recursive: true, force: true });
    fs.rmSync(escapedDir, { recursive: true, force: true });
  });

  test("4. Renaming `t-live-escape` -> `_t-live-escape` -> `t-live-escape` toggles 200 -> 404 -> 200 and updates `.dinou/routes`", async ({
    request,
  }) => {
    // Step A: Create active route importing `./dinou`
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(
      path.join(activeDir, "page.tsx"),
      `import { ROUTE } from "./dinou";\nexport default function LivePage() { return <div>Live:{ROUTE}</div>; }\n`,
      "utf8"
    );

    await expect
      .poll(async () => (await request.get("/t-live-escape")).status(), {
        timeout: 15_000,
      })
      .toBe(200);

    expect(
      fs.existsSync(path.join(process.cwd(), ".dinou/routes/t-live-escape/dinou.d.ts"))
    ).toBe(true);

    // Step B: Escape route by renaming `t-live-escape` -> `_t-live-escape`
    fs.renameSync(activeDir, escapedDir);

    await expect
      .poll(async () => (await request.get("/t-live-escape")).status(), {
        timeout: 15_000,
      })
      .toBe(404);

    await expect
      .poll(() =>
        fs.existsSync(path.join(process.cwd(), ".dinou/routes/_t-live-escape/dinou.d.ts"))
      )
      .toBe(true);
    expect(
      fs.existsSync(path.join(process.cwd(), ".dinou/routes/t-live-escape/dinou.d.ts"))
    ).toBe(false);

    // Step C: Un-escape route by renaming `_t-live-escape` -> `t-live-escape`
    fs.renameSync(escapedDir, activeDir);

    await expect
      .poll(async () => (await request.get("/t-live-escape")).status(), {
        timeout: 15_000,
      })
      .toBe(200);

    expect(
      fs.existsSync(path.join(process.cwd(), ".dinou/routes/_t-live-escape/dinou.d.ts"))
    ).toBe(false);
  });
});
```

---

## 6. GitHub Actions Integration Summary

In `.github/workflows/e2e.yml` inside `dev/dinou-e2e`:

1. **Static & Bundler Guard Job** (runs once in ~15–25s before the Playwright matrix):
   ```yaml
   - name: Verify Escaped `_folder` Typegen, Guard & Manifests
     run: node scripts/verify-escaped-ci.mjs
   ```
2. **Playwright Matrix (`mode: [dev, prod]` × `bundler: [esbuild, rollup, webpack]`)**:
   ```yaml
   - name: Run Escaped `_folder` Playwright Suite (${{ matrix.mode }} - ${{ matrix.bundler }})
     env:
       E2E_MODE: ${{ matrix.mode }}
       E2E_SERVER_CMD: ${{ matrix.mode == 'dev' && format('npm run dev:{0}', matrix.bundler) || format('npm run start:node:{0}', matrix.bundler) }}
     run: npx playwright test tests/escaped-underscore.spec.ts
   ```
   *(If `dinou-e2e` already executes all `tests/*.spec.ts` files across its dev/prod bundler matrix, simply adding the `src/_t-escaped/`, `src/_non-route-scratch/`, and `src/t-escaped-probe/` fixtures plus `tests/escaped-underscore.spec.ts` and `scripts/verify-escaped-ci.mjs` will automatically test the entire matrix.)*

