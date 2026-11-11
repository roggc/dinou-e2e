# End-to-End Playwright & GitHub Actions Verification Guide for Contextual `"./dinou"` Routing

This document provides a complete, copy-paste-ready specification for the **`dev/dinou-e2e`** agent to verify Dinou's **Route-Contextual `"./dinou"` Module & Type-Safe Routing** across **TypeScript (`tsc`)**, **Development Servers (`dev:esbuild`, `dev:rollup`, `dev:webpack`)**, and **Production Builds (`build:node:esbuild`, `build:node:rollup`, `build:node:webpack`, plus `bun` / `deno` / `cloudflare`)** in **GitHub Actions** with **Playwright**.

---

## 1. Architecture Overview: What Must Be Verified in CI

Dinou's `"./dinou"` feature spans **two distinct layers** that should both run in GitHub Actions:

| Layer | Tool in GitHub Actions | What It Verifies |
| :--- | :--- | :--- |
| **1. Compile-Time Type Safety** | `npm run typegen && npx tsc --noEmit` (+ tiny negative boundary check script) | - `tsconfig.json` `"rootDirs": ["src", ".dinou/routes"]` maps `.dinou/routes/<dir>/dinou.d.ts` onto `src/<dir>/` with zero files created inside `src/`.<br>- Zero-boilerplate `PageProps`, `LayoutProps` (with auto-inferred `@slot` props), `SlotProps`, `PageFunctions`, `Link`, and `useRouter` compile cleanly.<br>- Inline `@ts-expect-error` assertions guarantee invalid relative paths (`"./subs"`, `"subs"`, non-page parent `".."`) and missing `params` **fail compilation** (if TypeScript ever stops rejecting them, `tsc --noEmit` fails with `TS2578: Unused '@ts-expect-error' directive`).<br>- Importing `"./dinou"` from a non-route folder (`src/components/`) fails with `TS2307`. |
| **2. Bundler & Runtime Behavior (Dev + Prod)** | **Playwright** (`tests/type-safe-contextual.spec.ts`) across `esbuild`, `rollup`, and `webpack` in both `dev` and `build + start` | - `esbuildContextualDinouPlugin` (including `.dinou/swc/src/...` dev disk-cache redirection in `dev:esbuild`), `rollupContextualDinouPlugin`, and `webpackContextualDinouPlugin` resolve `"./dinou"` and `"../dinou"` (from colocated `_components/`) in `"use client"` bundles.<br>- Dual-Engine Pass A (`react-server` RSC) and Pass B (SSR) resolve `"./dinou"` and `"../dinou"` in Server and Client Components.<br>- `run-ssg.js` static pre-rendering (`getStaticPaths`) succeeds during `npm run build`.<br>- Pre-bound `<Link>` and `useRouter()` inject `from = ROUTE` at runtime, slicing deeper browser URLs inside persistent layouts/`@slots` while preserving standalone `?query` and `#hash` links. |

---

## 2. Prerequisites in `dinou-e2e`

### 2.1. `tsconfig.json`

Ensure the root `tsconfig.json` in `dinou-e2e` includes `"rootDirs": ["src", ".dinou/routes"]` inside `"compilerOptions"` and `.dinou/types/**/*.d.ts` inside `"include"`:

```json
{
  "compilerOptions": {
    "rootDirs": [
      "src",
      ".dinou/routes"
    ],
    "paths": {
      "@/*": [
        "./src/*"
      ]
    },
    "allowJs": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "module": "ESNext",
    "moduleResolution": "bundler"
  },
  "include": [
    "src",
    "dinou-env.d.ts",
    ".dinou/types/**/*.d.ts"
  ]
}
```

> **Important:** Keep `.dinou/routes` in `rootDirs` only — do **not** add `.dinou/routes/**/*.d.ts` to `include`. That ensures TypeScript loads each route folder's `dinou.d.ts` on demand without suggesting cross-route `../../other-route/dinou` auto-imports.

### 2.2. `package.json` Script

Ensure `package.json` exposes `typegen` (if not already present):

```json
{
  "scripts": {
    "typegen": "dinou typegen"
  }
}
```
*(Or `"node dinou/cli.js typegen"` if `dinou-e2e` runs in ejected mode.)*

---

## 3. Route Fixture: `src/t-type-safe-contextual/`

Create the following self-contained route subtree under `src/t-type-safe-contextual/`. Every file in this subtree intentionally exercises a distinct bundler/runtime/type-system edge case:

```text
src/t-type-safe-contextual/
├── page.tsx                                  # 1. Root hub (Server Component, "./dinou", dynamic relative Link + params)
├── (marketing)/
│   └── pricing/
│       └── page.tsx                          # 2. Route group unwrapping ((marketing) -> ROUTE="/t-type-safe-contextual/pricing")
└── [slug]/                                   #    Intermediate dynamic segment (NO sibling page.tsx!)
    ├── layout.tsx                            # 3. Intermediate layout ("./dinou" LayoutProps auto-infers `sidebar` @slot + `params.slug`)
    ├── @sidebar/
    │   └── page.tsx                          # 4. Parallel @slot ("./dinou" SlotProps + ROUTE="/t-type-safe-contextual/[slug]" depth slicing)
    └── contact/
        ├── page_functions.ts                 # 5. Typed PageFunctions + getStaticPaths for production SSG build coverage
        ├── page.tsx                          # 6. Server Component page ("./dinou" relative, absolute, dynamic + explicit `from` override)
        ├── client-actions.tsx                # 7. "use client" Component ("./dinou" Link + useRouter() in esbuild/swc, Rollup, Webpack)
        ├── _components/
        │   ├── colocated-card.tsx            # 8. "use client" colocated helper importing "../dinou"
        │   └── typecheck-assertions.tsx      # 9. Compile-time @ts-expect-error assertions verified by `tsc --noEmit`
        └── sub/
            ├── page_functions.ts             # 10. getStaticPaths for leaf subpage SSG build coverage
            └── page.tsx                      # 11. Leaf subpage ("./dinou" `<Link to="..">` and `<Link to="../../..">`)
```

### 3.1. `src/t-type-safe-contextual/page.tsx`

```tsx
import { Link, ROUTE, type PageProps } from "./dinou";

export default function ContextualHubPage(_props: PageProps) {
  return (
    <main id="ctx-hub-page" data-route={ROUTE}>
      <h1>Contextual Dinou Hub</h1>
      <p data-testid="hub-route">{ROUTE}</p>

      <nav style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {/* Relative dynamic navigation from /t-type-safe-contextual -> /t-type-safe-contextual/acme/contact */}
        <Link
          data-testid="hub-to-acme-contact"
          to="[slug]/contact"
          params={{ slug: "acme" }}
        >
          Go to Acme Contact
        </Link>

        {/* Relative navigation into unwrapped (marketing)/pricing route group */}
        <Link data-testid="hub-to-pricing" to="pricing">
          Go to Pricing (Group)
        </Link>
      </nav>
    </main>
  );
}
```

### 3.2. `src/t-type-safe-contextual/(marketing)/pricing/page.tsx`

```tsx
import { Link, ROUTE, type PageProps } from "./dinou";

export default function ContextualPricingPage(_props: PageProps) {
  return (
    <main id="ctx-pricing-page" data-route={ROUTE}>
      <h1>Contextual Pricing</h1>
      <p data-testid="pricing-route">{ROUTE}</p>
      {/* ".." from /t-type-safe-contextual/pricing resolves to /t-type-safe-contextual */}
      <Link data-testid="pricing-back-hub" to="..">
        Back to Hub
      </Link>
    </main>
  );
}
```

### 3.3. `src/t-type-safe-contextual/[slug]/layout.tsx`

> **Note:** Without a `reset_layout` file, Dinou nests this layout inside your root `src/layout.tsx`, so returning a `<div>` wrapper is exact. (If `dinou-e2e` isolates `t-*` test folders with a `reset_layout` marker file, place `reset_layout` + a top-level `<html><body>{children}</body></html>` layout at `src/t-type-safe-contextual/layout.tsx`.)

```tsx
import { ROUTE, type LayoutProps } from "./dinou";

// Notice: NO route string generic needed!
// `LayoutProps` from "./dinou" automatically infers:
// - params: { slug: string }
// - sidebar?: ReactNode (from sibling @sidebar/page.tsx)
export default function ContextualSlugLayout({
  children,
  params,
  sidebar,
}: LayoutProps) {
  return (
    <div
      id="ctx-slug-layout"
      data-layout-route={ROUTE}
      data-layout-slug={params.slug}
      style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "16px" }}
    >
      <aside id="ctx-sidebar-container">{sidebar}</aside>
      <section id="ctx-main-container">{children}</section>
    </div>
  );
}
```

### 3.4. `src/t-type-safe-contextual/[slug]/@sidebar/page.tsx`

```tsx
import { Link, ROUTE, type SlotProps } from "./dinou";

// Inside @sidebar, "./dinou" sets:
// - SlotProps -> { params: { slug: string } }
// - ROUTE     -> "/t-type-safe-contextual/[slug]" (the URL segment, NOT /@sidebar!)
export default function ContextualSidebarSlot({ params }: SlotProps) {
  return (
    <nav data-testid="ctx-sidebar" data-slot-route={ROUTE}>
      <p data-testid="sidebar-slug">{params.slug}</p>
      <p data-testid="sidebar-route">{ROUTE}</p>
      <ul>
        <li>
          {/* Even when the browser is deep on /t-type-safe-contextual/acme/contact/sub,
              clicking this link MUST slice back to /t-type-safe-contextual/acme/contact */}
          <Link data-testid="sidebar-link-contact" to="contact">
            Sidebar Contact
          </Link>
        </li>
        <li>
          <Link data-testid="sidebar-link-sub" to="contact/sub">
            Sidebar Sub
          </Link>
        </li>
        <li>
          {/* ".." from /t-type-safe-contextual/[slug] resolves to /t-type-safe-contextual */}
          <Link data-testid="sidebar-link-hub" to="..">
            Sidebar Hub
          </Link>
        </li>
        <li>
          {/* Standalone query/hash links inside a scoped @slot must preserve the active deeper pathname */}
          <Link data-testid="sidebar-link-query" to="?panel=open">
            Open Panel Query
          </Link>
        </li>
        <li>
          <Link data-testid="sidebar-link-hash" to="#details-anchor">
            Jump Hash
          </Link>
        </li>
      </ul>
    </nav>
  );
}
```

### 3.5. `src/t-type-safe-contextual/[slug]/contact/page_functions.ts`

```ts
import type { PageFunctions } from "./dinou";

export interface ContactExtraProps {
  greeting: string;
}

export const getStaticPaths: PageFunctions["getStaticPaths"] = () => [
  { slug: "acme" },
  { slug: "beta" },
];

export const getProps: PageFunctions<ContactExtraProps>["getProps"] = async (
  params
) => {
  return {
    greeting: `Hello ${params?.slug ?? "unknown"}`,
  };
};
```

### 3.6. `src/t-type-safe-contextual/[slug]/contact/page.tsx`

```tsx
import { Link, ROUTE, type PageProps } from "./dinou";
import type { ContactExtraProps } from "./page_functions";
import { ClientActions } from "./client-actions";
import { ColocatedCard } from "./_components/colocated-card";

export default function ContextualContactPage({
  params,
  greeting,
}: PageProps<ContactExtraProps>) {
  return (
    <article id="ctx-contact-page" data-route={ROUTE}>
      <h1 data-testid="contact-heading">Contact: {params.slug}</h1>
      <p data-testid="contact-greeting">{greeting}</p>
      <p data-testid="contact-route">{ROUTE}</p>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {/* 1. Bare relative link (no `from` prop!) */}
        <Link data-testid="rsc-link-sub-bare" to="sub">
          RSC Sub (bare)
        </Link>

        {/* 2. Dot-slash relative link (no `from` prop!) */}
        <Link data-testid="rsc-link-sub-dot" to="./sub">
          RSC Sub (dot)
        </Link>

        {/* 3. Multi-level parent relative link (".." has no page.tsx, "../.." is /t-type-safe-contextual) */}
        <Link data-testid="rsc-link-hub" to="../..">
          RSC Back to Hub
        </Link>

        {/* 4. Absolute dynamic pattern + required typed `params` on the same contextual <Link> */}
        <Link
          data-testid="rsc-link-beta-sub"
          to="/t-type-safe-contextual/[slug]/contact/sub"
          params={{ slug: "beta" }}
        >
          RSC Switch to Beta Sub
        </Link>

        {/* 5. Explicit `from` override on contextual <Link> */}
        <Link
          data-testid="rsc-link-override-pricing"
          from="/t-type-safe-contextual"
          to="pricing"
        >
          RSC Override to Pricing
        </Link>
      </div>

      <ClientActions />
      <ColocatedCard />
    </article>
  );
}
```

### 3.7. `src/t-type-safe-contextual/[slug]/contact/client-actions.tsx`

```tsx
"use client";

import { Link, useRouter, usePathname, useSearchParams, ROUTE } from "./dinou";

export function ClientActions() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div data-testid="ctx-client-actions" data-client-route={ROUTE}>
      <p data-testid="client-pathname">{pathname}</p>
      <p data-testid="client-panel-param">{searchParams.get("panel") ?? "none"}</p>

      {/* Client-bundled contextual <Link> */}
      <Link data-testid="client-link-sub" to="sub">
        Client Link Sub
      </Link>

      {/* Client-bundled contextual useRouter().push() WITHOUT { from } */}
      <button
        type="button"
        data-testid="client-btn-push-sub"
        onClick={() => router.push("sub")}
      >
        Client Push Sub
      </button>

      <button
        type="button"
        data-testid="client-btn-push-hub"
        onClick={() => router.push("../..")}
      >
        Client Push Hub
      </button>

      <button
        type="button"
        data-testid="client-btn-push-beta-sub"
        onClick={() =>
          router.push("/t-type-safe-contextual/[slug]/contact/sub", {
            params: { slug: "beta" },
          })
        }
      >
        Client Push Beta Sub
      </button>
    </div>
  );
}
```

### 3.8. `src/t-type-safe-contextual/[slug]/contact/_components/colocated-card.tsx`

```tsx
"use client";

// Exercises parent relative "../dinou" resolution inside private `_components/`
// across esbuild (+ .dinou/swc/), Rollup, Webpack, and Dual-Engine SSR!
import { Link, ROUTE } from "../dinou";

export function ColocatedCard() {
  return (
    <div data-testid="ctx-colocated-card" data-colocated-route={ROUTE}>
      <Link data-testid="colocated-link-sub" to="./sub">
        Colocated Link to Sub
      </Link>
    </div>
  );
}
```

### 3.9. `src/t-type-safe-contextual/[slug]/contact/_components/typecheck-assertions.tsx`

> This file is never rendered at runtime, so it adds zero DOM noise, yet `npx tsc --noEmit` in GitHub Actions compiles it strictly. If any invalid route ever stops failing TypeScript, `tsc --noEmit` will fail with `TS2578: Unused '@ts-expect-error' directive`!

```tsx
import { Link, useRouter, ROUTE, type PageProps } from "../dinou";

export function _CompileTimeAssertions({ params }: PageProps) {
  const exactRoute: "/t-type-safe-contextual/[slug]/contact" = ROUTE;
  const slug: string = params.slug;
  void exactRoute;

  const router = useRouter();

  // Valid calls
  router.push("sub");
  router.push("./sub");
  router.push("../..");
  router.push("/t-type-safe-contextual/[slug]/contact/sub", { params: { slug } });

  // Invalid calls that MUST be rejected by TypeScript
  // @ts-expect-error typo in dot-slash relative path
  router.push("./subs");
  // @ts-expect-error typo in bare relative path
  router.push("subs");
  // @ts-expect-error parent /t-type-safe-contextual/[slug] has NO page.tsx
  router.push("..");
  // @ts-expect-error dynamic bracket pattern requires { params }
  router.push("/t-type-safe-contextual/[slug]/contact/sub");

  return (
    <div>
      {/* @ts-expect-error typo in dot-slash relative path */}
      <Link to="./subs">Invalid</Link>
      {/* @ts-expect-error typo in bare relative path */}
      <Link to="subs">Invalid</Link>
      {/* @ts-expect-error parent /t-type-safe-contextual/[slug] has NO page.tsx */}
      <Link to="..">Invalid</Link>
      {/* @ts-expect-error missing required params prop */}
      <Link to="/t-type-safe-contextual/[slug]/contact/sub">Invalid</Link>
      {/* @ts-expect-error wrong param key */}
      <Link to="/t-type-safe-contextual/[slug]/contact/sub" params={{ wrong: "x" }}>
        Invalid
      </Link>
      {/* @ts-expect-error explicit from="/t-type-safe-contextual" invalidates "sub" */}
      <Link from="/t-type-safe-contextual" to="sub">
        Invalid
      </Link>
    </div>
  );
}
```

### 3.10. `src/t-type-safe-contextual/[slug]/contact/sub/page_functions.ts` & `page.tsx`

`src/t-type-safe-contextual/[slug]/contact/sub/page_functions.ts`:
```ts
import type { PageFunctions } from "./dinou";

export const getStaticPaths: PageFunctions["getStaticPaths"] = () => [
  { slug: "acme" },
  { slug: "beta" },
];
```

`src/t-type-safe-contextual/[slug]/contact/sub/page.tsx`:
```tsx
"use client";

import { Link, useSearchParams, ROUTE, type PageProps } from "./dinou";

export default function ContextualSubPage({ params }: PageProps) {
  const searchParams = useSearchParams();

  return (
    <article id="ctx-sub-page" data-route={ROUTE}>
      <h1 data-testid="sub-heading">Subpage: {params.slug}</h1>
      <p data-testid="sub-route">{ROUTE}</p>
      <p data-testid="sub-panel-param">{searchParams.get("panel") ?? "none"}</p>
      <div id="details-anchor" data-testid="sub-anchor">
        Details Section
      </div>

      {/* ".." from /t-type-safe-contextual/[slug]/contact/sub -> /t-type-safe-contextual/[slug]/contact */}
      <Link data-testid="sub-back-contact" to="..">
        Back to Contact
      </Link>

      {/* "../../.." -> /t-type-safe-contextual */}
      <Link data-testid="sub-back-hub" to="../../..">
        Back to Hub
      </Link>
    </article>
  );
}
```

---

## 4. Playwright Test Suite (`tests/type-safe-contextual.spec.ts`)

Add the following Playwright spec to `dinou-e2e`. It works identically against **all 3 bundlers (`esbuild`, `rollup`, `webpack`)** and in **both `dev` and `production` (`build + start`) modes**:

```ts
import { test, expect } from "@playwright/test";

test.describe("Contextual './dinou' Module (Bundlers, RSC/SSR, Relative & @slot Navigation)", () => {
  test("resolves './dinou' and '../dinou' across RSC, SSR, Client Components, @slots, and route groups", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // 1. Cold SSR load on Hub (/t-type-safe-contextual)
    await page.goto("/t-type-safe-contextual");
    await expect(page.getByTestId("hub-route")).toHaveText(
      "/t-type-safe-contextual"
    );

    // 2. Dynamic relative <Link to="[slug]/contact" params={{ slug: "acme" }}>
    await page.getByTestId("hub-to-acme-contact").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/acme\/contact$/);
    await expect(page.getByTestId("contact-heading")).toHaveText("Contact: acme");
    await expect(page.getByTestId("contact-greeting")).toHaveText("Hello acme");
    await expect(page.getByTestId("contact-route")).toHaveText(
      "/t-type-safe-contextual/[slug]/contact"
    );

    // 3. Verify intermediate layout & parallel @sidebar slot received params.slug & URL-scoped ROUTE
    await expect(page.getByTestId("sidebar-slug")).toHaveText("acme");
    await expect(page.getByTestId("sidebar-route")).toHaveText(
      "/t-type-safe-contextual/[slug]"
    );

    // 4. Verify colocated `_components/colocated-card.tsx` resolved `../dinou` in client bundle
    await expect(page.getByTestId("ctx-colocated-card")).toHaveAttribute(
      "data-colocated-route",
      "/t-type-safe-contextual/[slug]/contact"
    );

    // 5. Server Component <Link to="sub"> (pre-bound from="./dinou", no explicit `from` prop)
    await page.getByTestId("rsc-link-sub-bare").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/acme\/contact\/sub$/);
    await expect(page.getByTestId("sub-heading")).toHaveText("Subpage: acme");
    await expect(page.getByTestId("sub-route")).toHaveText(
      "/t-type-safe-contextual/[slug]/contact/sub"
    );

    // 6. CRITICAL: Standalone ?query and #hash links inside @sidebar (scoped to /t-type-safe-contextual/[slug])
    //    must preserve the active deeper pathname (/t-type-safe-contextual/acme/contact/sub)!
    await page.getByTestId("sidebar-link-query").click();
    await expect(page).toHaveURL(
      /\/t-type-safe-contextual\/acme\/contact\/sub\?panel=open$/
    );
    await expect(page.getByTestId("sub-panel-param")).toHaveText("open");

    // 7. CRITICAL: Relative link <Link to="contact"> inside @sidebar while browser is deep on .../contact/sub
    //    must slice base pathname back to /t-type-safe-contextual/acme -> /t-type-safe-contextual/acme/contact!
    await page.getByTestId("sidebar-link-contact").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/acme\/contact$/);
    await expect(page.getByTestId("contact-heading")).toHaveText("Contact: acme");

    // 8. Client Component `useRouter().push("sub")` imported from "./dinou" (no `{ from }` option!)
    await page.getByTestId("client-btn-push-sub").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/acme\/contact\/sub$/);

    // 9. Navigate back one level via <Link to=".."> on subpage -> /t-type-safe-contextual/acme/contact
    await page.getByTestId("sub-back-contact").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/acme\/contact$/);

    // 10. Colocated `_components/colocated-card.tsx` <Link to="./sub"> (from "../dinou")
    await page.getByTestId("colocated-link-sub").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/acme\/contact\/sub$/);
    await page.getByTestId("sub-back-contact").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/acme\/contact$/);

    // 11. Client `router.push("/t-type-safe-contextual/[slug]/contact/sub", { params: { slug: "beta" } })`
    await page.getByTestId("client-btn-push-beta-sub").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/beta\/contact\/sub$/);
    await expect(page.getByTestId("sub-heading")).toHaveText("Subpage: beta");
    await expect(page.getByTestId("sidebar-slug")).toHaveText("beta");

    // 12. Navigate back to contact, then test explicit `from="/t-type-safe-contextual"` override -> unwrapped (marketing)/pricing
    await page.getByTestId("sub-back-contact").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/beta\/contact$/);
    await page.getByTestId("rsc-link-override-pricing").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/pricing$/);
    await expect(page.getByTestId("pricing-route")).toHaveText(
      "/t-type-safe-contextual/pricing"
    );

    // 13. From (marketing)/pricing, <Link to=".."> returns to /t-type-safe-contextual
    await page.getByTestId("pricing-back-hub").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual$/);

    expect(errors).toEqual([]);
  });

  test("cold SSR / SSG direct entry on deep dynamic route hydrates cleanly", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/t-type-safe-contextual/acme/contact/sub");
    await expect(page.getByTestId("sub-heading")).toHaveText("Subpage: acme");
    await expect(page.getByTestId("sidebar-slug")).toHaveText("acme");

    // Verify client hydration works immediately after direct load
    await page.getByTestId("sidebar-link-contact").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual\/acme\/contact$/);
    await page.getByTestId("client-btn-push-hub").click();
    await expect(page).toHaveURL(/\/t-type-safe-contextual$/);

    expect(errors).toEqual([]);
  });
});
```

---

## 5. Standalone CI Typecheck & Boundary Script (`scripts/verify-typegen-ci.mjs`)

In addition to `npm run typegen && npx tsc --noEmit` (which already checks all positive files and `@ts-expect-error` negative lines inside `typecheck-assertions.tsx`), add this lightweight 40-line script in `dinou-e2e` to assert:
1. `.dinou/routes/t-type-safe-contextual/...` was generated,
2. Non-route directories like `src/components/` did **not** get a `dinou.d.ts` / `dinou.js`, and
3. Importing `"./dinou"` inside `src/components/` is rejected with `TS2307`.

```js
// scripts/verify-typegen-ci.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();

// 1. Run standalone typegen
execSync("npm run typegen", { stdio: "inherit", cwd: root });

// 2. Assert contextual modules exist for route dirs & do NOT exist for non-route dirs
assert(
  fs.existsSync(
    path.join(root, ".dinou/routes/t-type-safe-contextual/[slug]/contact/dinou.d.ts")
  ),
  "Expected contextual dinou.d.ts for route folder"
);
assert(
  !fs.existsSync(path.join(root, ".dinou/routes/components/dinou.d.ts")),
  "Expected NO contextual dinou.d.ts for non-route src/components"
);

// 3. Run full strict tsc --noEmit (verifies all routes + @ts-expect-error assertions)
execSync("npx tsc --noEmit", { stdio: "inherit", cwd: root });

// 4. Verify accidental "./dinou" import in src/components fails with TS2307
const componentsDir = path.join(root, "src/components");
fs.mkdirSync(componentsDir, { recursive: true });
const probeFile = path.join(componentsDir, "__ci_bad_contextual_probe__.tsx");
try {
  fs.writeFileSync(
    probeFile,
    'import { Link } from "./dinou";\nexport const Bad = () => <Link to="/">Home</Link>;\n'
  );
  let failedWith2307 = false;
  try {
    execSync("npx tsc --noEmit", { stdio: "pipe", cwd: root });
  } catch (err) {
    const out = String(err.stdout || "") + String(err.stderr || "");
    failedWith2307 = out.includes("TS2307");
  }
  assert(failedWith2307, 'Expected TS2307 when importing "./dinou" from src/components/');
} finally {
  fs.rmSync(probeFile, { force: true });
}

console.log("✅ Type-safe routing & contextual './dinou' CI checks passed!");
```

---

## 6. Running Across All Bundlers in GitHub Actions

Because `dinou-e2e` tests Dinou across bundlers and modes, plug both the **static typecheck job** and the **Playwright matrix** into `.github/workflows/e2e.yml`:

### 6.1. Bundler Commands Covered

| Mode | Esbuild | Rollup | Webpack |
| :--- | :--- | :--- | :--- |
| **Dev Server** | `npm run dev:esbuild` *(tests `.dinou/swc/` mirror redirect + `esbuildContextualDinouPlugin`)* | `npm run dev:rollup` *(tests `rollupContextualDinouPlugin` + `ctxA`/`ctxB`)* | `npm run dev:webpack` *(tests `webpackContextualDinouPlugin` + `watchOptions.ignored`)* |
| **Prod Build + Start (Node)** | `npm run build:node:esbuild && npm run start:node:esbuild` | `npm run build:node:rollup && npm run start:node:rollup` | `npm run build:node:webpack && npm run start:node:webpack` |
| **Edge / Alt Runtimes** *(if in matrix)* | `npm run build:bun` / `build:deno` / `build:cloudflare` | `npm run build:bun:rollup` / `build:deno:rollup` / `build:cloudflare:rollup` | `npm run build:bun:webpack` / `build:deno:webpack` / `build:cloudflare:webpack` |

### 6.2. Example GitHub Actions Workflow Snippet

```yaml
jobs:
  typecheck-contextual-dinou:
    name: Typegen & Strict TSC Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: node scripts/verify-typegen-ci.mjs

  e2e-bundlers:
    name: Playwright (${{ matrix.mode }} - ${{ matrix.bundler }})
    needs: typecheck-contextual-dinou
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        mode: [dev, prod]
        bundler: [esbuild, rollup, webpack]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx playwright install --with-deps chromium

      - name: Build Production App (${{ matrix.bundler }})
        if: matrix.mode == 'prod'
        run: npm run build:node:${{ matrix.bundler }}

      - name: Run Playwright Suite (${{ matrix.mode }} - ${{ matrix.bundler }})
        env:
          E2E_SERVER_CMD: ${{ matrix.mode == 'dev' && format('npm run dev:{0}', matrix.bundler) || format('npm run start:node:{0}', matrix.bundler) }}
        run: npx playwright test tests/type-safe-contextual.spec.ts
```

*(If `dinou-e2e`'s existing `playwright.config.ts` already runs all `tests/*.spec.ts` files across its configured dev/prod bundler matrix, simply adding `src/t-type-safe-contextual/`, updating `tsconfig.json` with `"rootDirs": ["src", ".dinou/routes"]`, adding `tests/type-safe-contextual.spec.ts`, and adding `node scripts/verify-typegen-ci.mjs` before Playwright will automatically cover every bundler and runtime in the existing pipeline!)*

---

## 7. Optional Bonus: Hot Route Watcher Test in `dev` Mode

If `dinou-e2e` includes a dev-only watcher spec, you can also verify on-the-fly generation and pruning of `.dinou/routes/` without restarting the dev server:

1. While `npm run dev:esbuild` is running, write `src/t-type-safe-contextual/hot-added/page.tsx` importing `{ ROUTE } from "./dinou"` and rendering `<p data-testid="hot-route">{ROUTE}</p>`.
2. Poll (`expect.poll`) until `.dinou/routes/t-type-safe-contextual/hot-added/dinou.js` exists (`< 100ms`), then `await page.goto("/t-type-safe-contextual/hot-added")` and assert `hot-route` equals `"/t-type-safe-contextual/hot-added"`.
3. Delete `src/t-type-safe-contextual/hot-added/` (`fs.rmSync(..., { recursive: true, force: true })`) and `expect.poll` that `.dinou/routes/t-type-safe-contextual/hot-added` is automatically pruned!
