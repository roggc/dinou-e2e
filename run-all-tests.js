const { execSync } = require("child_process");
const fs = require("fs"); // 1. Importamos FileSystem
const path = require("path"); // 2. Importamos Path

// Asegurar que Bun esté en PATH en Windows/Linux si está instalado en ~/.bun/bin
const bunBinDir = path.join(process.env.USERPROFILE || process.env.HOME || "", ".bun", "bin");
if (fs.existsSync(bunBinDir) && !process.env.PATH.includes(bunBinDir)) {
  process.env.PATH = `${bunBinDir}${path.delimiter}${process.env.PATH}`;
}

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
  {
    name: "Bun JIT (Esbuild)",
    cmd: "npm run build:bun:esbuild && npm run start:bun:esbuild",
  },
  {
    name: "Bun JIT (Rollup)",
    cmd: "npm run build:bun:rollup && npm run start:bun:rollup",
  },
  {
    name: "Bun JIT (Webpack)",
    cmd: "npm run build:bun:webpack && npm run start:bun:webpack",
  },
  {
    name: "Bun Bundle (Esbuild)",
    cmd: "npm run build:bun:bundle:esbuild && npm run start:bun:bundle:esbuild",
  },
  {
    name: "Bun Bundle (Rollup)",
    cmd: "npm run build:bun:bundle:rollup && npm run start:bun:bundle:rollup",
  },
  {
    name: "Bun Bundle (Webpack)",
    cmd: "npm run build:bun:bundle:webpack && npm run start:bun:bundle:webpack",
  },
];

// Soporte para filtrar escenarios (--scenario=bun) y pasar flags a Playwright (--project=chromium, -g, etc.)
const rawArgs = process.argv.slice(2);
const scenarioFilterArg = rawArgs.find((a) => a.startsWith("--scenario="));
const scenarioFilter = scenarioFilterArg ? scenarioFilterArg.split("=")[1].toLowerCase() : null;
const playwrightArgs = rawArgs.filter((a) => !a.startsWith("--scenario=")).join(" ");
const playwrightCmd = playwrightArgs ? `npx playwright test ${playwrightArgs}` : `npx playwright test`;

const targetScenarios = scenarioFilter
  ? scenarios.filter((s) => s.name.toLowerCase().includes(scenarioFilter))
  : scenarios;

for (const scenario of targetScenarios) {
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
    execSync(`npx cross-env TEST_CMD="${scenario.cmd}" ${playwrightCmd}`, {
      stdio: "inherit",
      env: process.env,
    });
    console.log(`✅ ${scenario.name} PASSED`);
  } catch (err) {
    console.error(`❌ ${scenario.name} FAILED`);
    process.exit(1); // Detener si falla uno
  }
}
