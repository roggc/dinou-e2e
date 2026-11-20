// tests/compile-and-export-smoke.mjs
// Smoke test verifying (in both ejected and non-ejected Dinou modes):
// 1. Static site export (`npm run export-static` -> `out/`)
// 2. Standalone Node.js AOT compiled executable (`npm run build:node:compile` -> `dist/server`)
// 3. Standalone Bun compiled executable (`npm run build:bun:compile` -> `dist/server`)
// 4. Standalone Deno compiled executable (`npm run build:deno:compile` -> `dist/deno-server`)

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const isWin = process.platform === "win32";
const ext = isWin ? ".exe" : "";

function run(cmd) {
  console.log(`\n▶ [Smoke] Running: ${cmd}`);
  execSync(cmd, {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
}

async function probeBinary(binaryPath, port, label) {
  console.log(`\n🚀 [Smoke] Spawning ${label} binary (${binaryPath}) on port ${port}...`);
  const child = spawn(binaryPath, [], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOST: "127.0.0.1" },
    stdio: "inherit",
  });

  try {
    let ok = false;
    let lastError = null;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`, {
          headers: { Accept: "text/html" },
        });
        if (res.status === 200) {
          const html = await res.text();
          if (html && html.includes("<html")) {
            console.log(`✅ [Smoke] ${label} responded 200 OK on / (${html.length} bytes)`);
            ok = true;
            break;
          }
        } else {
          lastError = new Error(`Unexpected status ${res.status}`);
        }
      } catch (err) {
        lastError = err;
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    if (!ok) {
      throw new Error(
        `[Smoke] ${label} failed to respond 200 OK on port ${port}: ${lastError?.message || lastError}`
      );
    }

    // Also probe /t-env-vars (DINOU_PUBLIC_* + server secret isolation) and Anti-Bot Shield (/.env -> 404)
    const envVarsRes = await fetch(`http://127.0.0.1:${port}/t-env-vars`, {
      headers: { Accept: "text/html" },
    });
    if (envVarsRes.status !== 200) {
      throw new Error(
        `[Smoke] ${label} returned ${envVarsRes.status} on /t-env-vars (expected 200)`
      );
    }
    const envVarsHtml = await envVarsRes.text();
    if (
      !envVarsHtml.includes("DinouPublicProd") ||
      !envVarsHtml.includes('data-rsc-secret-ok="true"') ||
      envVarsHtml.includes("dinou_e2e_server_private_token_940")
    ) {
      throw new Error(
        `[Smoke] ${label} /t-env-vars failed DINOU_PUBLIC_* or secret-isolation check`
      );
    }
    const botProbeRes = await fetch(`http://127.0.0.1:${port}/.env`);
    if (botProbeRes.status !== 404) {
      throw new Error(
        `[Smoke] ${label} returned ${botProbeRes.status} on /.env (expected 404 Anti-Bot Shield)`
      );
    }
    console.log(
      `✅ [Smoke] ${label} verified /t-env-vars (DINOU_PUBLIC_* + secret isolation) & /.env -> 404`
    );

    // Also probe /t-aliases (Unified tsconfig.json / tsconfig.aliases.json Path Aliases Engine)
    const aliasesRes = await fetch(`http://127.0.0.1:${port}/t-aliases`, {
      headers: { Accept: "text/html" },
    });
    if (aliasesRes.status !== 200) {
      throw new Error(
        `[Smoke] ${label} returned ${aliasesRes.status} on /t-aliases (expected 200)`
      );
    }
    const aliasesHtml = await aliasesRes.text();
    if (
      !aliasesHtml.includes("SPECIFIC_ICONS_OVERRIDE_OK") ||
      !aliasesHtml.includes("EXACT_ALIAS_OK") ||
      !aliasesHtml.includes("EXTERNAL_SHARED_FALLBACK_OK") ||
      !aliasesHtml.includes("ESM_JS_TO_TS_SUBSTITUTION_OK")
    ) {
      throw new Error(
        `[Smoke] ${label} /t-aliases failed path alias resolution markers check`
      );
    }
    console.log(
      `✅ [Smoke] ${label} verified /t-aliases (specificity, exact, external fallback & .js->.ts substitution)`
    );

    // Also probe /t-plugins (AOT dinou.config.mjs + setupFiles + SPA x-rsc-redirect + status 418 + Node configureServer)
    const pluginPingRes = await fetch(`http://127.0.0.1:${port}/t-plugins/api/ping`);
    if (pluginPingRes.status !== 200) {
      throw new Error(
        `[Smoke] ${label} returned ${pluginPingRes.status} on /t-plugins/api/ping (expected 200)`
      );
    }
    const pluginPingJson = await pluginPingRes.json();
    if (
      JSON.stringify(pluginPingJson.setupLog) !==
        JSON.stringify(["plugin-setup", "user-setup"]) ||
      pluginPingJson.ssgHookInvoked !== false ||
      pluginPingRes.headers.get("x-t-plugins-upstream") !== "upstream-v1"
    ) {
      throw new Error(
        `[Smoke] ${label} /t-plugins/api/ping failed AOT plugin/setupFiles check: ${JSON.stringify(pluginPingJson)}`
      );
    }
    const pluginHardGuard = await fetch(
      `http://127.0.0.1:${port}/t-plugins/dashboard`,
      { redirect: "manual" }
    );
    if (pluginHardGuard.status !== 302) {
      throw new Error(
        `[Smoke] ${label} expected 302 on unauthenticated /t-plugins/dashboard, got ${pluginHardGuard.status}`
      );
    }
    const pluginSpaGuard = await fetch(
      `http://127.0.0.1:${port}/____rsc_page____/t-plugins/dashboard`
    );
    if (
      pluginSpaGuard.status !== 200 ||
      !(pluginSpaGuard.headers.get("x-rsc-redirect") || "").includes(
        "/t-plugins/login"
      )
    ) {
      throw new Error(
        `[Smoke] ${label} expected 200 x-rsc-redirect on /____rsc_page____/t-plugins/dashboard`
      );
    }
    const pluginTeapot = await fetch(`http://127.0.0.1:${port}/t-plugins/teapot`);
    if (
      pluginTeapot.status !== 418 ||
      pluginTeapot.headers.get("cache-control") !== "private, max-age=77"
    ) {
      throw new Error(
        `[Smoke] ${label} /t-plugins/teapot expected 418 + custom Cache-Control, got ${pluginTeapot.status} (${pluginTeapot.headers.get("cache-control")})`
      );
    }
    if (label.includes("Node")) {
      const nodeHealthRes = await fetch(
        `http://127.0.0.1:${port}/t-plugins-node-healthz`
      );
      const nodeHealthTxt = await nodeHealthRes.text();
      if (nodeHealthRes.status !== 200 || nodeHealthTxt !== "NODE_HEALTH_OK_v1") {
        throw new Error(
          `[Smoke] ${label} /t-plugins-node-healthz failed AOT configureServer check: ${nodeHealthRes.status} ${nodeHealthTxt}`
        );
      }
    }
    console.log(
      `✅ [Smoke] ${label} verified /t-plugins (AOT plugins, single-exec setupFiles, 302/x-rsc-redirect & 418 Cache-Control)`
    );

    // Also probe /t-bundlers (DINOU_BUILD_TOOL="esbuild" propagation across SSG & live SSR)
    const bundlersRes = await fetch(`http://127.0.0.1:${port}/t-bundlers`, {
      headers: { Accept: "text/html" },
    });
    const bundlersHtml = await bundlersRes.text();
    if (
      bundlersRes.status !== 200 ||
      !bundlersHtml.includes("Bundler Parity E2E") ||
      !bundlersHtml.includes('data-build-tool="esbuild"')
    ) {
      throw new Error(
        `[Smoke] ${label} /t-bundlers failed DINOU_BUILD_TOOL="esbuild" check (${bundlersRes.status})`
      );
    }
    const bundlersLiveRes = await fetch(
      `http://127.0.0.1:${port}/t-bundlers/live`,
      { headers: { Accept: "text/html" } }
    );
    const bundlersLiveHtml = await bundlersLiveRes.text();
    if (
      bundlersLiveRes.status !== 200 ||
      !bundlersLiveHtml.includes('data-live-build-tool="esbuild"')
    ) {
      throw new Error(
        `[Smoke] ${label} /t-bundlers/live failed live DINOU_BUILD_TOOL="esbuild" check (${bundlersLiveRes.status})`
      );
    }
    console.log(
      `✅ [Smoke] ${label} verified /t-bundlers & /t-bundlers/live (DINOU_BUILD_TOOL="esbuild")`
    );

    // Also probe /t-deployment (SSG, live Dynamic SSR with secret isolation, and on-demand ISG)
    const deploySsgRes = await fetch(`http://127.0.0.1:${port}/t-deployment`, {
      headers: { Accept: "text/html" },
    });
    const deploySsgHtml = await deploySsgRes.text();
    if (
      deploySsgRes.status !== 200 ||
      !deploySsgHtml.includes("Deployment Targets Parity") ||
      !deploySsgHtml.includes('data-build-tool="esbuild"')
    ) {
      throw new Error(
        `[Smoke] ${label} /t-deployment failed SSG check (${deploySsgRes.status})`
      );
    }
    const deployDynRes = await fetch(
      `http://127.0.0.1:${port}/t-deployment/dynamic?probe=smoke`,
      { headers: { Accept: "text/html" } }
    );
    const deployDynHtml = await deployDynRes.text();
    if (
      deployDynRes.status !== 200 ||
      !deployDynHtml.includes('data-probe="smoke"') ||
      !deployDynHtml.includes('data-secret-ok="true"')
    ) {
      throw new Error(
        `[Smoke] ${label} /t-deployment/dynamic failed Dynamic SSR check (${deployDynRes.status})`
      );
    }
    const deployIsgRes = await fetch(
      `http://127.0.0.1:${port}/t-deployment/isg/smoke-slug`,
      { headers: { Accept: "text/html" } }
    );
    const deployIsgHtml = await deployIsgRes.text();
    if (
      deployIsgRes.status !== 200 ||
      !deployIsgHtml.includes('data-isg-slug="smoke-slug"')
    ) {
      throw new Error(
        `[Smoke] ${label} /t-deployment/isg/smoke-slug failed On-Demand ISG check (${deployIsgRes.status})`
      );
    }
    console.log(
      `✅ [Smoke] ${label} verified /t-deployment (SSG + Dynamic SSR + On-Demand ISG)`
    );

    // Also probe /t-eject (Ejected Mode "dinou/config" RSC + live Dynamic SSR)
    const ejectSsgRes = await fetch(`http://127.0.0.1:${port}/t-eject`, {
      headers: { Accept: "text/html" },
    });
    const ejectSsgHtml = await ejectSsgRes.text();
    if (
      ejectSsgRes.status !== 200 ||
      !ejectSsgHtml.includes("Dinou Eject &amp; Uneject Sovereignty") ||
      !ejectSsgHtml.includes('data-config-strict="true"')
    ) {
      throw new Error(
        `[Smoke] ${label} /t-eject failed SSG check (${ejectSsgRes.status})`
      );
    }
    const ejectLiveRes = await fetch(
      `http://127.0.0.1:${port}/t-eject/live?mode=smoke`,
      { headers: { Accept: "text/html" } }
    );
    const ejectLiveHtml = await ejectLiveRes.text();
    if (
      ejectLiveRes.status !== 200 ||
      !ejectLiveHtml.includes('data-mode="smoke"') ||
      !ejectLiveHtml.includes('data-secret-ok="true"')
    ) {
      throw new Error(
        `[Smoke] ${label} /t-eject/live failed Dynamic SSR check (${ejectLiveRes.status})`
      );
    }
    console.log(
      `✅ [Smoke] ${label} verified /t-eject & /t-eject/live (Ejected Mode sovereignty)`
    );

    // Also probe /t-api-ref-nav (SSG + getProps/layout_functions redirect short-circuit on SSR & RSC)
    const apiNavHubRes = await fetch(`http://127.0.0.1:${port}/t-api-ref-nav`, {
      headers: { Accept: "text/html" },
    });
    const apiNavHubHtml = await apiNavHubRes.text();
    if (
      apiNavHubRes.status !== 200 ||
      !apiNavHubHtml.includes("API Reference Navigation Hub")
    ) {
      throw new Error(
        `[Smoke] ${label} /t-api-ref-nav failed SSG check (${apiNavHubRes.status})`
      );
    }
    const apiNavGuardedRes = await fetch(
      `http://127.0.0.1:${port}/t-api-ref-nav/guarded`,
      { headers: { Accept: "text/html" }, redirect: "manual" }
    );
    if (
      apiNavGuardedRes.status !== 302 ||
      apiNavGuardedRes.headers.get("location") !==
        "/t-api-ref-nav/login?from=guarded"
    ) {
      throw new Error(
        `[Smoke] ${label} /t-api-ref-nav/guarded expected 302 -> /t-api-ref-nav/login?from=guarded, got ${apiNavGuardedRes.status} (${apiNavGuardedRes.headers.get("location")})`
      );
    }
    const apiNavGuardedRscRes = await fetch(
      `http://127.0.0.1:${port}/____rsc_page____/t-api-ref-nav/guarded`
    );
    if (
      apiNavGuardedRscRes.status !== 200 ||
      apiNavGuardedRscRes.headers.get("x-rsc-redirect") !==
        "/t-api-ref-nav/login?from=guarded"
    ) {
      throw new Error(
        `[Smoke] ${label} RSC /t-api-ref-nav/guarded expected 200 + x-rsc-redirect, got ${apiNavGuardedRscRes.status} (${apiNavGuardedRscRes.headers.get("x-rsc-redirect")})`
      );
    }
    const apiNavLayoutGuardedRes = await fetch(
      `http://127.0.0.1:${port}/t-api-ref-nav/layout-guarded`,
      { headers: { Accept: "text/html" }, redirect: "manual" }
    );
    if (
      apiNavLayoutGuardedRes.status !== 302 ||
      apiNavLayoutGuardedRes.headers.get("location") !==
        "/t-api-ref-nav/login?from=layout"
    ) {
      throw new Error(
        `[Smoke] ${label} /t-api-ref-nav/layout-guarded expected 302 -> /t-api-ref-nav/login?from=layout, got ${apiNavLayoutGuardedRes.status} (${apiNavLayoutGuardedRes.headers.get("location")})`
      );
    }
    console.log(
      `✅ [Smoke] ${label} verified /t-api-ref-nav (SSG + getProps/layout_functions SSR & RSC redirect short-circuit)`
    );

    // Also probe /t-ctx-router (SSG) & /t-ctx-router/child (SSR + RSC rawPath/isRscRequest isolation)
    const ctxRouterSsgRes = await fetch(`http://127.0.0.1:${port}/t-ctx-router`, {
      headers: { Accept: "text/html" },
    });
    const ctxRouterSsgHtml = await ctxRouterSsgRes.text();
    if (
      ctxRouterSsgRes.status !== 200 ||
      !ctxRouterSsgHtml.includes("Contextual Router Probe")
    ) {
      throw new Error(
        `[Smoke] ${label} /t-ctx-router failed SSG check (${ctxRouterSsgRes.status})`
      );
    }
    const ctxRouterChildSsrRes = await fetch(
      `http://127.0.0.1:${port}/t-ctx-router/child`,
      { headers: { Accept: "text/html" } }
    );
    const ctxRouterChildSsrHtml = await ctxRouterChildSsrRes.text();
    if (
      ctxRouterChildSsrRes.status !== 200 ||
      !ctxRouterChildSsrHtml.includes('data-testid="ctx-is-rsc">false<') ||
      !ctxRouterChildSsrHtml.includes(
        'data-testid="ctx-raw-path">/t-ctx-router/child<'
      ) ||
      !ctxRouterChildSsrHtml.includes(
        'data-testid="ctx-plugin-user">Dinou Guest<'
      )
    ) {
      throw new Error(
        `[Smoke] ${label} /t-ctx-router/child failed SSR getContext() rawPath/isRscRequest check (${ctxRouterChildSsrRes.status})`
      );
    }
    const ctxRouterChildRscRes = await fetch(
      `http://127.0.0.1:${port}/____rsc_page____/t-ctx-router/child`
    );
    const ctxRouterChildRscText = await ctxRouterChildRscRes.text();
    if (
      ctxRouterChildRscRes.status !== 200 ||
      !ctxRouterChildRscText.includes("/____rsc_page____/t-ctx-router/child") ||
      !/data-testid":"ctx-is-rsc"[^}]*"children":"true"/.test(
        ctxRouterChildRscText
      )
    ) {
      throw new Error(
        `[Smoke] ${label} RSC /t-ctx-router/child failed getContext() RSC wire rawPath/isRscRequest check (${ctxRouterChildRscRes.status})`
      );
    }
    console.log(
      `✅ [Smoke] ${label} verified /t-ctx-router & /t-ctx-router/child (contextual ./dinou + SSR/RSC rawPath & isRscRequest isolation)`
    );

    // Also probe /t-slot-combo (SSG with <DinouCacheSlot id-only & tag+tags revalidate={false}>)
    const slotComboRes = await fetch(`http://127.0.0.1:${port}/t-slot-combo`, {
      headers: { Accept: "text/html" },
    });
    const slotComboHtml = await slotComboRes.text();
    if (
      slotComboRes.status !== 200 ||
      !slotComboHtml.includes('data-testid="id-only-slot-value">id-v1<') ||
      !slotComboHtml.includes('data-testid="combo-slot-value">combo-v1<')
    ) {
      throw new Error(
        `[Smoke] ${label} /t-slot-combo failed SSG DinouCacheSlot check (${slotComboRes.status})`
      );
    }
    console.log(
      `✅ [Smoke] ${label} verified /t-slot-combo (SSG id-only & tag+tags DinouCacheSlot)`
    );

    // Also probe /t-contract-veto (numeric & catch-all allowISG=false + optional [[locale]] layout_functions getStaticPaths)
    const contractOkRes = await fetch(
      `http://127.0.0.1:${port}/t-contract-veto/acme/items/1`,
      { headers: { Accept: "text/html" } }
    );
    const contractOkHtml = await contractOkRes.text();
    if (
      contractOkRes.status !== 200 ||
      !contractOkHtml.includes("Tenant:acme:Item:1")
    ) {
      throw new Error(
        `[Smoke] ${label} /t-contract-veto/acme/items/1 failed numeric allowISG=false check (${contractOkRes.status})`
      );
    }
    const contractUnlistedRes = await fetch(
      `http://127.0.0.1:${port}/t-contract-veto/acme/items/999`
    );
    const contractUnlistedRscRes = await fetch(
      `http://127.0.0.1:${port}/____rsc_page____/t-contract-veto/acme/items/999`
    );
    if (
      contractUnlistedRes.status !== 404 ||
      contractUnlistedRscRes.status !== 404
    ) {
      throw new Error(
        `[Smoke] ${label} /t-contract-veto/acme/items/999 expected 404 HTML & RSC, got ${contractUnlistedRes.status}/${contractUnlistedRscRes.status}`
      );
    }
    const contractCatchOk = await fetch(
      `http://127.0.0.1:${port}/t-contract-veto/catch/docs/intro`,
      { headers: { Accept: "text/html" } }
    );
    const contractCatchBad = await fetch(
      `http://127.0.0.1:${port}/t-contract-veto/catch/docs/unknown`
    );
    if (contractCatchOk.status !== 200 || contractCatchBad.status !== 404) {
      throw new Error(
        `[Smoke] ${label} /t-contract-veto/catch allowISG=false check failed (${contractCatchOk.status}/${contractCatchBad.status})`
      );
    }
    for (const [optUrl, expectedText] of [
      ["/t-contract-veto/opt", "OptIndex:default"],
      ["/t-contract-veto/opt/en/about", "OptAbout:en"],
      ["/t-contract-veto/opt/es/about", "OptAbout:es"],
    ]) {
      const optRes = await fetch(`http://127.0.0.1:${port}${optUrl}`, {
        headers: { Accept: "text/html" },
      });
      const optHtml = await optRes.text();
      if (optRes.status !== 200 || !optHtml.includes(expectedText)) {
        throw new Error(
          `[Smoke] ${label} ${optUrl} failed optional [[locale]] layout_functions SSG check (${optRes.status})`
        );
      }
    }
    console.log(
      `✅ [Smoke] ${label} verified /t-contract-veto (numeric & catch-all allowISG=false + optional [[locale]] layout getStaticPaths)`
    );

    // Also probe a secondary route / RSC endpoint if available
    const candidateRoutes = ["/t-rigurous-hs", "/horizontal-segmentation-test", "/about"];
    for (const route of candidateRoutes) {
      const routeDir = path.join(projectRoot, "src", route.slice(1));
      if (fs.existsSync(routeDir)) {
        const subRes = await fetch(`http://127.0.0.1:${port}${route}`, {
          headers: { Accept: "text/html" },
        });
        if (subRes.status !== 200) {
          throw new Error(
            `[Smoke] ${label} returned ${subRes.status} on ${route} (expected 200)`
          );
        }
        console.log(`✅ [Smoke] ${label} responded 200 OK on ${route}`);
        break;
      }
    }
  } finally {
    try {
      child.kill("SIGTERM");
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 300));
    try {
      child.kill("SIGKILL");
    } catch (e) {}
  }
}

async function main() {
  const outDir = path.join(projectRoot, "out");
  const distDir = path.join(projectRoot, "dist");

  // 1. Verify Static Export (`npm run export-static`)
  run("npm run export-static");
  const outIndex = path.join(outDir, "index.html");
  const outStylesCss = path.join(outDir, "styles.css");
  const outPageRsc = path.join(outDir, "page.rsc");
  const outLayoutRsc = path.join(outDir, "layout.rsc");
  const outPublicAssetsIndex = path.join(outDir, "t-public-assets", "index.html");
  const outPublicAssetsPageRsc = path.join(outDir, "t-public-assets", "page.rsc");
  const outPublicAssetsLayoutRsc = path.join(outDir, "t-public-assets", "layout.rsc");
  const outStylesCssIndex = path.join(outDir, "t-styles-css", "index.html");
  const outStylesCssPageRsc = path.join(outDir, "t-styles-css", "page.rsc");
  const outAssetsIndex = path.join(outDir, "t-assets", "index.html");
  const outAssetsPageRsc = path.join(outDir, "t-assets", "page.rsc");
  const outEnvVarsIndex = path.join(outDir, "t-env-vars", "index.html");
  const outEnvVarsPageRsc = path.join(outDir, "t-env-vars", "page.rsc");
  const outEnvVarsSsgSlugIndex = path.join(
    outDir,
    "t-env-vars",
    "ssg-prebuilt",
    "index.html"
  );
  const outEnvVarsSsgSlugPageRsc = path.join(
    outDir,
    "t-env-vars",
    "ssg-prebuilt",
    "page.rsc"
  );
  const outAliasesIndex = path.join(outDir, "t-aliases", "index.html");
  const outAliasesPageRsc = path.join(outDir, "t-aliases", "page.rsc");
  const outAliasesSsgSlugIndex = path.join(
    outDir,
    "t-aliases",
    "ssg-prebuilt",
    "index.html"
  );
  const outAliasesSsgSlugPageRsc = path.join(
    outDir,
    "t-aliases",
    "ssg-prebuilt",
    "page.rsc"
  );
  const outPluginsIndex = path.join(outDir, "t-plugins", "index.html");
  const outPluginsDashboardIndex = path.join(
    outDir,
    "t-plugins",
    "dashboard",
    "index.html"
  );
  const outPluginsLoginIndex = path.join(
    outDir,
    "t-plugins",
    "login",
    "index.html"
  );
  const outPluginsTeapotIndex = path.join(
    outDir,
    "t-plugins",
    "teapot",
    "index.html"
  );
  const outPublicAssetsAboutIndex = path.join(
    outDir,
    "t-public-assets",
    "about",
    "index.html"
  );
  const outPublicAssetsAboutPageRsc = path.join(
    outDir,
    "t-public-assets",
    "about",
    "page.rsc"
  );
  const outFavicon = path.join(outDir, "favicon.ico");
  const outPwaManifest = path.join(outDir, "manifest.json");
  const outRobots = path.join(outDir, "robots.txt");
  const outWellKnown = path.join(outDir, ".well-known", "assetlinks.json");
  const outAasa = path.join(outDir, ".well-known", "apple-app-site-association");
  const outNoJekyll = path.join(outDir, ".nojekyll");
  if (!fs.existsSync(outIndex) || fs.statSync(outIndex).size === 0) {
    throw new Error("[Smoke] export-static failed: out/index.html is missing or empty");
  }
  const outIndexHtml = fs.readFileSync(outIndex, "utf8");
  if (!outIndexHtml.includes("window.__DINOU_STATIC_EXPORT__=true;")) {
    throw new Error(
      "[Smoke] export-static failed: out/index.html is missing window.__DINOU_STATIC_EXPORT__=true; flag"
    );
  }
  const dist2Index = path.join(projectRoot, ".dinou", "dist2", "index.html");
  if (
    fs.existsSync(dist2Index) &&
    fs.readFileSync(dist2Index, "utf8").includes("__DINOU_STATIC_EXPORT__")
  ) {
    throw new Error(
      "[Smoke] export-static must NOT mutate source .dinou/dist2/index.html"
    );
  }
  for (const requiredExportFile of [
    outStylesCss,
    outPageRsc,
    outLayoutRsc,
    outPublicAssetsIndex,
    outPublicAssetsPageRsc,
    outPublicAssetsLayoutRsc,
    outPublicAssetsAboutIndex,
    outPublicAssetsAboutPageRsc,
    outStylesCssIndex,
    outStylesCssPageRsc,
    outAssetsIndex,
    outAssetsPageRsc,
    outEnvVarsIndex,
    outEnvVarsPageRsc,
    outEnvVarsSsgSlugIndex,
    outEnvVarsSsgSlugPageRsc,
    outAliasesIndex,
    outAliasesPageRsc,
    outAliasesSsgSlugIndex,
    outAliasesSsgSlugPageRsc,
    outPluginsIndex,
    outPluginsDashboardIndex,
    outPluginsLoginIndex,
    outPluginsTeapotIndex,
  ]) {
    if (!fs.existsSync(requiredExportFile) || fs.statSync(requiredExportFile).size === 0) {
      throw new Error(
        `[Smoke] export-static failed: missing or empty ${path.relative(projectRoot, requiredExportFile)}`
      );
    }
  }
  if (!fs.existsSync(outFavicon)) {
    throw new Error("[Smoke] export-static failed: out/favicon.ico is missing");
  }
  if (!fs.existsSync(outPwaManifest)) {
    throw new Error("[Smoke] export-static failed: user PWA out/manifest.json is missing");
  }
  const exportedPwa = JSON.parse(fs.readFileSync(outPwaManifest, "utf8"));
  if (exportedPwa.name !== "Dinou E2E PWA") {
    throw new Error(
      `[Smoke] export-static out/manifest.json was overwritten or invalid: ${JSON.stringify(exportedPwa)}`
    );
  }
  if (
    !fs.existsSync(outRobots) ||
    !fs.existsSync(outWellKnown) ||
    !fs.existsSync(outAasa) ||
    !fs.existsSync(outNoJekyll)
  ) {
    throw new Error("[Smoke] export-static failed: public/ SEO or dotfile assets missing in out/");
  }
  for (const forbidden of [
    "__dinou_dist2",
    "react-client-manifest.json",
    "react-ssr-manifest.json",
    "server-functions-manifest.json",
    "status-manifest.json",
    "metadata.json",
    "layout.metadata.json",
    "slot.metadata.json",
    "shell.html",
    "shell.layout.json",
    "shell.page.json",
    "rsc.rsc",
    "shell.rsc",
    ".assetsignore",
    "server",
    "slots",
    "_slots",
    "t-public-assets/metadata.json",
    "t-public-assets/layout.metadata.json",
    "t-public-assets/rsc.rsc",
    "t-public-assets/about/metadata.json",
    "t-public-assets/about/rsc.rsc",
    ".env",
    ".env.production",
    ".env.e2e-ignored",
  ]) {
    if (fs.existsSync(path.join(outDir, forbidden))) {
      throw new Error(`[Smoke] export-static leaked internal artifact into out/${forbidden}`);
    }
  }
  const outEnvVarsHtml = fs.readFileSync(outEnvVarsIndex, "utf8");
  if (
    !outEnvVarsHtml.includes("DinouPublicProd") ||
    !outEnvVarsHtml.includes('data-rsc-secret-ok="true"') ||
    outEnvVarsHtml.includes("dinou_e2e_server_private_token_940") ||
    outEnvVarsHtml.includes("dinou_public_dir_dotenv_must_never_be_copied_or_served_940")
  ) {
    throw new Error(
      "[Smoke] export-static out/t-env-vars/index.html failed DINOU_PUBLIC_* or secret-isolation check"
    );
  }
  const outAliasesHtml = fs.readFileSync(outAliasesIndex, "utf8");
  if (
    !outAliasesHtml.includes("SPECIFIC_ICONS_OVERRIDE_OK") ||
    !outAliasesHtml.includes("EXACT_ALIAS_OK") ||
    !outAliasesHtml.includes("EXTERNAL_SHARED_FALLBACK_OK") ||
    !outAliasesHtml.includes("ESM_JS_TO_TS_SUBSTITUTION_OK")
  ) {
    throw new Error(
      "[Smoke] export-static out/t-aliases/index.html failed path alias resolution check"
    );
  }
  const outBundlersHtmlPath = path.join(outDir, "t-bundlers", "index.html");
  if (!fs.existsSync(outBundlersHtmlPath)) {
    throw new Error("[Smoke] export-static missing out/t-bundlers/index.html");
  }
  const outBundlersHtml = fs.readFileSync(outBundlersHtmlPath, "utf8");
  if (
    !outBundlersHtml.includes("Bundler Parity E2E") ||
    !outBundlersHtml.includes('data-build-tool="esbuild"')
  ) {
    throw new Error(
      "[Smoke] export-static out/t-bundlers/index.html failed DINOU_BUILD_TOOL check"
    );
  }
  const outDeployHtmlPath = path.join(outDir, "t-deployment", "index.html");
  const outDeployPageRscPath = path.join(outDir, "t-deployment", "page.rsc");
  if (!fs.existsSync(outDeployHtmlPath) || !fs.existsSync(outDeployPageRscPath)) {
    throw new Error(
      "[Smoke] export-static missing out/t-deployment/index.html or page.rsc"
    );
  }
  const outDeployHtml = fs.readFileSync(outDeployHtmlPath, "utf8");
  if (
    !outDeployHtml.includes("Deployment Targets Parity") ||
    !outDeployHtml.includes("window.__DINOU_STATIC_EXPORT__=true;")
  ) {
    throw new Error(
      "[Smoke] export-static out/t-deployment/index.html failed content check"
    );
  }
  const outEjectHtmlPath = path.join(outDir, "t-eject", "index.html");
  const outEjectPageRscPath = path.join(outDir, "t-eject", "page.rsc");
  if (!fs.existsSync(outEjectHtmlPath) || !fs.existsSync(outEjectPageRscPath)) {
    throw new Error(
      "[Smoke] export-static missing out/t-eject/index.html or page.rsc"
    );
  }
  const outEjectHtml = fs.readFileSync(outEjectHtmlPath, "utf8");
  if (
    !outEjectHtml.includes("Dinou Eject &amp; Uneject Sovereignty") ||
    !outEjectHtml.includes('data-config-strict="true"')
  ) {
    throw new Error(
      "[Smoke] export-static out/t-eject/index.html failed content check"
    );
  }
  const outApiNavHtmlPath = path.join(outDir, "t-api-ref-nav", "index.html");
  const outApiNavPageRscPath = path.join(outDir, "t-api-ref-nav", "page.rsc");
  const outApiNavPprHtmlPath = path.join(
    outDir,
    "t-api-ref-nav",
    "ppr-search",
    "index.html"
  );
  const outApiNavPprPageRscPath = path.join(
    outDir,
    "t-api-ref-nav",
    "ppr-search",
    "page.rsc"
  );
  if (
    !fs.existsSync(outApiNavHtmlPath) ||
    !fs.existsSync(outApiNavPageRscPath) ||
    !fs.existsSync(outApiNavPprHtmlPath) ||
    !fs.existsSync(outApiNavPprPageRscPath)
  ) {
    throw new Error(
      "[Smoke] export-static missing out/t-api-ref-nav or out/t-api-ref-nav/ppr-search index.html/page.rsc"
    );
  }
  const outApiNavHtml = fs.readFileSync(outApiNavHtmlPath, "utf8");
  const outApiNavPprHtml = fs.readFileSync(outApiNavPprHtmlPath, "utf8");
  if (
    !outApiNavHtml.includes("API Reference Navigation Hub") ||
    !outApiNavHtml.includes("window.__DINOU_STATIC_EXPORT__=true;") ||
    !outApiNavPprHtml.includes("API Ref Nav PPR Zero-Hole Search") ||
    !outApiNavPprHtml.includes("window.__DINOU_STATIC_EXPORT__=true;")
  ) {
    throw new Error(
      "[Smoke] export-static out/t-api-ref-nav/index.html or ppr-search/index.html failed content check"
    );
  }
  const outCtxRouterHtmlPath = path.join(outDir, "t-ctx-router", "index.html");
  const outCtxRouterPageRscPath = path.join(outDir, "t-ctx-router", "page.rsc");
  const outCtxRouterChildHtmlPath = path.join(
    outDir,
    "t-ctx-router",
    "child",
    "index.html"
  );
  if (
    !fs.existsSync(outCtxRouterHtmlPath) ||
    !fs.existsSync(outCtxRouterPageRscPath)
  ) {
    throw new Error(
      "[Smoke] export-static missing out/t-ctx-router/index.html or page.rsc"
    );
  }
  if (fs.existsSync(outCtxRouterChildHtmlPath)) {
    throw new Error(
      "[Smoke] export-static must NOT statically export dynamic revalidate=0 route out/t-ctx-router/child/index.html"
    );
  }
  const outCtxRouterHtml = fs.readFileSync(outCtxRouterHtmlPath, "utf8");
  if (
    !outCtxRouterHtml.includes("Contextual Router Probe") ||
    !outCtxRouterHtml.includes("window.__DINOU_STATIC_EXPORT__=true;")
  ) {
    throw new Error(
      "[Smoke] export-static out/t-ctx-router/index.html failed content check"
    );
  }
  const outSlotComboHtmlPath = path.join(outDir, "t-slot-combo", "index.html");
  const outSlotComboPageRscPath = path.join(outDir, "t-slot-combo", "page.rsc");
  if (
    !fs.existsSync(outSlotComboHtmlPath) ||
    !fs.existsSync(outSlotComboPageRscPath)
  ) {
    throw new Error(
      "[Smoke] export-static missing out/t-slot-combo/index.html or page.rsc"
    );
  }
  const outSlotComboHtml = fs.readFileSync(outSlotComboHtmlPath, "utf8");
  if (
    !outSlotComboHtml.includes('data-testid="id-only-slot-value">id-v1<') ||
    !outSlotComboHtml.includes('data-testid="combo-slot-value">combo-v1<') ||
    !outSlotComboHtml.includes("window.__DINOU_STATIC_EXPORT__=true;")
  ) {
    throw new Error(
      "[Smoke] export-static out/t-slot-combo/index.html failed content check"
    );
  }
  for (const [relExportPath, expectedMarker] of [
    ["t-contract-veto/acme/items/1/index.html", "Tenant:acme:Item:1"],
    ["t-contract-veto/catch/docs/intro/index.html", "Catch:docs/intro"],
    ["t-contract-veto/opt/index.html", "OptIndex:default"],
    ["t-contract-veto/opt/en/about/index.html", "OptAbout:en"],
    ["t-contract-veto/opt/es/about/index.html", "OptAbout:es"],
  ]) {
    const absExport = path.join(outDir, relExportPath);
    if (!fs.existsSync(absExport)) {
      throw new Error(`[Smoke] export-static missing out/${relExportPath}`);
    }
    const content = fs.readFileSync(absExport, "utf8");
    if (
      !content.includes(expectedMarker) ||
      !content.includes("window.__DINOU_STATIC_EXPORT__=true;")
    ) {
      throw new Error(
        `[Smoke] export-static out/${relExportPath} failed content check`
      );
    }
  }
  for (const netlifyArtifact of [
    ".dinou/netlify/functions/ssr.mjs",
    ".dinou/netlify/functions/package.json",
    ".dinou/dist1/server/handler.js",
    ".dinou/dist1/server/netlify.js",
  ]) {
    if (!fs.existsSync(path.join(projectRoot, netlifyArtifact))) {
      throw new Error(
        `[Smoke] Expected Dual-Bundle server/Netlify artifact at ${netlifyArtifact}`
      );
    }
  }
  const outRootFiles = fs.readdirSync(outDir);
  if (
    outRootFiles.some(
      (f) => f.startsWith("runtime-") || f.startsWith("react-refresh-entry-")
    )
  ) {
    throw new Error(
      "[Smoke] export-static out/ must not contain dead dev react-refresh chunks"
    );
  }
  console.log("✅ [Smoke] export-static verified (SSG HTML with __DINOU_STATIC_EXPORT__, segmented page.rsc/layout.rsc, public/ PWA manifest.json & dotfiles exported; dist2 metadata/slots & server/* excluded)");

  // 2. Verify Standalone Node.js Compiled Binary (`npm run build:node:compile`)
  try {
    fs.rmSync(distDir, { recursive: true, force: true });
  } catch (e) {}
  run("npm run build:node:compile");
  const nodeBin = path.join(distDir, `server${ext}`);
  if (!fs.existsSync(nodeBin)) {
    throw new Error(`[Smoke] Node compiled binary missing at ${nodeBin}`);
  }
  await probeBinary(nodeBin, 3101, "Node Compiled Binary");

  // 3. Verify Standalone Bun Compiled Binary (`npm run build:bun:compile`)
  try {
    fs.rmSync(distDir, { recursive: true, force: true });
  } catch (e) {}
  run("npm run build:bun:compile");
  const bunBin = path.join(distDir, `server${ext}`);
  if (!fs.existsSync(bunBin)) {
    throw new Error(`[Smoke] Bun compiled binary missing at ${bunBin}`);
  }
  await probeBinary(bunBin, 3102, "Bun Compiled Binary");

  // 4. Verify Standalone Deno Compiled Binary (`npm run build:deno:compile`)
  try {
    fs.rmSync(distDir, { recursive: true, force: true });
  } catch (e) {}
  run("npm run build:deno:compile");
  const denoBin = path.join(distDir, `deno-server${ext}`);
  if (!fs.existsSync(denoBin)) {
    throw new Error(`[Smoke] Deno compiled binary missing at ${denoBin}`);
  }
  await probeBinary(denoBin, 3103, "Deno Compiled Binary");

  // Clean up
  try {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(distDir, { recursive: true, force: true });
  } catch (e) {}

  console.log("\n🎉 [Smoke] All compiled binaries (Node, Bun, Deno) and export-static passed!");
}

main().catch((err) => {
  console.error("\n❌ [Smoke] Test failed:", err);
  process.exit(1);
});
