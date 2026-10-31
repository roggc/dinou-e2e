// tests/compile-and-export-smoke.mjs
// Smoke test verifying:
// 1. Static site export (`dinou/core/export-static.js` -> `out/`)
// 2. Standalone Node.js AOT compiled executable (`bun build --compile .dinou/node/server.mjs`)
// 3. Standalone Bun compiled executable (`bun build --compile .dinou/bun/server.js`)
// 4. Standalone Deno compiled executable (`deno compile --unstable-kv ... .dinou/deno/main.js`)

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
  // 0. Ensure base Esbuild SSG + Client build exists (.dinou/dist2 and .dinou/dist3)
  const dist2Dir = path.join(projectRoot, ".dinou/dist2");
  const dist3Dir = path.join(projectRoot, ".dinou/dist3");
  if (!fs.existsSync(dist2Dir) || !fs.existsSync(dist3Dir)) {
    run("node dinou/esbuild/build.js");
  }

  // 1. Verify Static Export (`export-static`)
  run("node dinou/core/export-static.js");
  const outDir = path.join(projectRoot, "out");
  const outIndex = path.join(outDir, "index.html");
  const outManifest = path.join(outDir, "manifest.json");
  if (!fs.existsSync(outIndex) || fs.statSync(outIndex).size === 0) {
    throw new Error("[Smoke] export-static failed: out/index.html is missing or empty");
  }
  if (!fs.existsSync(outManifest)) {
    throw new Error("[Smoke] export-static failed: out/manifest.json is missing");
  }
  console.log("✅ [Smoke] export-static verified (out/index.html & out/manifest.json present)");

  // 2. Verify Standalone Node.js Compiled Binary (`build:node:compile`)
  run("node dinou/node/build.js");
  const nodeBin = path.join(projectRoot, "dist", `server-node-smoke${ext}`);
  run(`bun build --compile .dinou/node/server.mjs --outfile ${nodeBin}`);
  if (!fs.existsSync(nodeBin)) {
    throw new Error(`[Smoke] Node compiled binary missing at ${nodeBin}`);
  }
  await probeBinary(nodeBin, 3101, "Node Compiled Binary");

  // 3. Verify Standalone Bun Compiled Binary (`build:bun:compile`)
  run("node dinou/bun/build.js");
  const bunBin = path.join(projectRoot, "dist", `server-bun-smoke${ext}`);
  run(`bun build --compile .dinou/bun/server.js --outfile ${bunBin}`);
  if (!fs.existsSync(bunBin)) {
    throw new Error(`[Smoke] Bun compiled binary missing at ${bunBin}`);
  }
  await probeBinary(bunBin, 3102, "Bun Compiled Binary");

  // 4. Verify Standalone Deno Compiled Binary (`build:deno:compile`)
  run("node dinou/deno/build.js");
  run(
    "deno run --unstable-kv --allow-net --allow-read --allow-write --allow-env dinou/deno/seed-kv.js"
  );
  const denoBin = path.join(projectRoot, "dist", `server-deno-smoke${ext}`);
  run(
    `deno compile --unstable-kv --no-check --no-config --allow-net --allow-read --allow-write --allow-env --allow-sys --output ${denoBin} .dinou/deno/main.js`
  );
  if (!fs.existsSync(denoBin)) {
    throw new Error(`[Smoke] Deno compiled binary missing at ${denoBin}`);
  }
  await probeBinary(denoBin, 3103, "Deno Compiled Binary");

  // Clean up
  try {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(path.join(projectRoot, "dist"), { recursive: true, force: true });
  } catch (e) {}

  console.log("\n🎉 [Smoke] All compiled binaries (Node, Bun, Deno) and export-static passed!");
}

main().catch((err) => {
  console.error("\n❌ [Smoke] Test failed:", err);
  process.exit(1);
});

