const { execSync } = require("child_process");
const fs = require("fs"); // 1. Importamos FileSystem
const path = require("path"); // 2. Importamos Path

const publicDir = path.join(__dirname, "public");

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
];

for (const scenario of scenarios) {
  console.log(`\n🔵 TESTING SCENARIO: ${scenario.name}`);
  try {
    if (fs.existsSync(publicDir) && scenario.name.includes("DEV")) {
      console.log(`   🧹 Limpiando carpeta public antigua...`);
      // { recursive: true, force: true } es el equivalente a rm -rf
      fs.rmSync(publicDir, { recursive: true, force: true });
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
