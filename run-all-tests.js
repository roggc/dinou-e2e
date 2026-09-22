const { execSync } = require("child_process");
const fs = require("fs"); // 1. Importamos FileSystem
const path = require("path"); // 2. Importamos Path


const scenarios = [
  { name: "Webpack DEV", cmd: "npm run dev:webpack" },
  {
    name: "Webpack PROD",
    cmd: "npm run build:webpack && npm run start:webpack",
  },
  { name: "Rollup DEV", cmd: "npm run dev:rollup" },
  { name: "Rollup PROD", cmd: "npm run build:rollup && npm run start:rollup" },
  { name: "Esbuild DEV", cmd: "npm run dev:esbuild" },
  {
    name: "Esbuild PROD",
    cmd: "npm run build:esbuild && npm run start:esbuild",
  },
  {
    name: "Deno (Esbuild)",
    cmd: "npm run build:deno:esbuild && npm run start:deno",
  },
  {
    name: "Deno (Rollup)",
    cmd: "npm run build:deno:rollup && npm run start:deno",
  },
  {
    name: "Deno (Webpack)",
    cmd: "npm run build:deno:webpack && npm run start:deno",
  },
];

for (const scenario of scenarios) {
  console.log(`\n🔵 TESTING SCENARIO: ${scenario.name}`);
  try {
    if (scenario.name.includes("DEV")) {
      console.log(`   🧹 Limpiando artefactos antiguos de compilación...`);
      const dinouDir = path.join(__dirname, ".dinou");
      const dinouPublic = path.join(dinouDir, "public");
      const dinouManifest = path.join(dinouDir, "react_client_manifest");
      const dinouServerFuncs = path.join(dinouDir, "server_functions_manifest");
      if (fs.existsSync(dinouPublic)) fs.rmSync(dinouPublic, { recursive: true, force: true });
      if (fs.existsSync(dinouManifest)) fs.rmSync(dinouManifest, { recursive: true, force: true });
      if (fs.existsSync(dinouServerFuncs)) fs.rmSync(dinouServerFuncs, { recursive: true, force: true });
    }
    // Llamamos a Playwright pasándole el comando del servidor
    // cross-env es útil para compatibilidad Windows/Mac en la definición de variables
    execSync(`npx cross-env TEST_CMD="${scenario.cmd}" npx playwright test`, {
      stdio: "inherit",
    });
    console.log(`✅ ${scenario.name} PASSED`);
  } catch (err) {
    console.error(`❌ ${scenario.name} FAILED`);
    process.exit(1); // Detener si falla uno
  }
}
