// tests/hmr-websocket.test.mjs
// Fast automated WebSocket HMR test for Dinou.
// Validates that editing Server Components (even with 'use server' in text)
// sends { type: "rsc-update" } and NEVER { type: "reload" },
// and editing Client Components sends { type: "update" } without full reloads.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const serverPagePath = path.resolve(projectRoot, "src/t-hmr-test/page.tsx");
const clientComponentPath = path.resolve(projectRoot, "src/t-hmr-test/counter.tsx");

const port = Number(process.env.PORT || 3000);
const hmrPort = Number(process.env.HMR_PORT || port + 1);

async function checkPortOpen(checkPort = port) {
  try {
    const res = await fetch(`http://localhost:${checkPort}/`, { method: "HEAD" });
    return res.status < 500;
  } catch (e) {
    return false;
  }
}

async function connectWebSocket(url = `ws://localhost:${hmrPort}`, protocol = "esm-hmr", timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ws = new WebSocket(url, protocol);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error("WS connection timeout"));
        }, 2000);

        ws.onopen = () => {
          clearTimeout(timer);
          resolve(ws);
        };
        ws.onerror = (err) => {
          clearTimeout(timer);
          reject(err);
        };
      });
      return ws;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw new Error(`Failed to connect to ${url} within ${timeoutMs}ms`);
}

function waitForMessage(ws, predicate, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for WebSocket message`));
    }, timeoutMs);

    const onMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (predicate(data)) {
          cleanup();
          resolve(data);
        }
      } catch (e) {}
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
    };

    ws.addEventListener("message", onMessage);
  });
}

async function runHmrTests() {
  console.log("⚡ [HMR WS Test] Starting automated Fast Refresh & HMR verification...");

  let devServerProcess = null;
  const wasAlreadyRunning = await checkPortOpen(port);

  if (!wasAlreadyRunning) {
    console.log(`  🚀 Dev server not running on port ${port}. Launching 'npm run dev:esbuild'...`);
    devServerProcess = spawn("npm", ["run", "dev:esbuild"], {
      cwd: projectRoot,
      stdio: "pipe",
      shell: true,
      env: { ...process.env, PORT: String(port), HMR_PORT: String(hmrPort) },
    });

    devServerProcess.stdout.resume();
    devServerProcess.stderr.resume();

    devServerProcess.on("error", (err) => {
      console.error("❌ Failed to start dev server:", err);
    });
  } else {
    console.log(`  🔌 Using existing dev server running on port ${port}.`);
  }

  const originalServerCode = fs.readFileSync(serverPagePath, "utf8");
  const originalClientCode = fs.readFileSync(clientComponentPath, "utf8");

  try {
    console.log(`  ⏳ Connecting to Dinou HMR WebSocket (ws://localhost:${hmrPort}, protocol: 'esm-hmr')...`);
    const ws = await connectWebSocket(`ws://localhost:${hmrPort}`, "esm-hmr");
    console.log("  ✅ Connected to HMR WebSocket successfully!");

    // Set up a trap for illegal "reload" messages
    let illegalReloadReceived = false;
    ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "reload") {
          illegalReloadReceived = true;
        }
      } catch (e) {}
    });

    // -------------------------------------------------------------
    // Test 1: Server Component Edit (with "use server" in text)
    // -------------------------------------------------------------
    console.log("\n🧪 [Test 1] Editing Server Component (src/t-hmr-test/page.tsx)...");
    illegalReloadReceived = false;

    const modifiedServerCode = originalServerCode.replace(
      "Initial Server Title",
      "HMR Verified Server Title " + Date.now()
    );

    const serverMsgPromise = waitForMessage(
      ws,
      (msg) => msg.type === "rsc-update" || msg.type === "reload"
    );

    fs.writeFileSync(serverPagePath, modifiedServerCode, "utf8");
    const serverMsg = await serverMsgPromise;

    console.log("  📩 Received WS response:", JSON.stringify(serverMsg));

    if (serverMsg.type === "reload" || illegalReloadReceived) {
      throw new Error(
        "❌ Test 1 FAILED: Server Component edit caused full page { type: 'reload' }! Expected { type: 'rsc-update' }."
      );
    }
    if (serverMsg.type !== "rsc-update") {
      throw new Error(`❌ Test 1 FAILED: Expected { type: 'rsc-update' }, got: ${JSON.stringify(serverMsg)}`);
    }
    console.log("  ✅ Test 1 PASSED: Server Component edit emitted { type: 'rsc-update' } without full reload!");

    // Restore Server Component
    fs.writeFileSync(serverPagePath, originalServerCode, "utf8");
    await new Promise((r) => setTimeout(r, 800));

    // -------------------------------------------------------------
    // Test 2: Client Component Edit (Fast Refresh)
    // -------------------------------------------------------------
    console.log("\n🧪 [Test 2] Editing Client Component (src/t-hmr-test/counter.tsx)...");
    illegalReloadReceived = false;

    const modifiedClientCode = originalClientCode.replace(
      "Client Counter Component",
      "Fast Refresh Title " + Date.now()
    );

    const clientMsgPromise = waitForMessage(
      ws,
      (msg) => msg.type === "update" || msg.type === "reload"
    );

    fs.writeFileSync(clientComponentPath, modifiedClientCode, "utf8");
    const clientMsg = await clientMsgPromise;

    console.log("  📩 Received WS response:", JSON.stringify(clientMsg));

    if (clientMsg.type === "reload" || illegalReloadReceived) {
      throw new Error(
        "❌ Test 2 FAILED: Client Component edit caused full page { type: 'reload' }! Expected { type: 'update' }."
      );
    }
    if (clientMsg.type !== "update") {
      throw new Error(`❌ Test 2 FAILED: Expected { type: 'update' }, got: ${JSON.stringify(clientMsg)}`);
    }
    console.log("  ✅ Test 2 PASSED: Client Component edit emitted { type: 'update' } without full reload!");

    ws.close();
    console.log("\n🎉 ALL AUTOMATED HMR WEBSOCKET TESTS PASSED!");
  } finally {
    // Always restore original files
    fs.writeFileSync(serverPagePath, originalServerCode, "utf8");
    fs.writeFileSync(clientComponentPath, originalClientCode, "utf8");

    if (devServerProcess) {
      console.log("  🛑 Shutting down spawned dev server...");
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", devServerProcess.pid.toString(), "/f", "/t"]);
        } else {
          devServerProcess.kill("SIGTERM");
        }
      } catch (e) {}
    }
  }
}

runHmrTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n💥 HMR Test Suite Error:", err.message);
    process.exit(1);
  });
