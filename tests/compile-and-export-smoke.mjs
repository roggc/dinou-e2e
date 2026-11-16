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
