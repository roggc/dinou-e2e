import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });
const commandToRun =
  process.env.TEST_CMD || "npm run build:esbuild && npm run start:esbuild";
const port = 3000;

/**
 * 2. 🧠 LÓGICA DINÁMICA PARA LA URL DE ESPERA
 * Decidimos qué recurso esperar basándonos en si el comando incluye "webpack", "esbuild", etc.
 */
let resourceToWaitFor = "";

if (commandToRun.includes("dev:webpack")) {
  // Si estamos en Webpack (dev o prod), esperamos al manifest
  // ⚠️ Asegúrate de que este archivo realmente se sirve en Webpack Dev
  // Si tu archivo real se llama 'react-client-manifest.json', pon eso.
  resourceToWaitFor = "manifest.json";
} else if (commandToRun.includes("dev:")) {
  // Para Rollup, Esbuild (y fallback) esperamos al bundle principal
  resourceToWaitFor = "main.js";
}

const urlToWaitFor = resourceToWaitFor
  ? `http://localhost:${port}/${resourceToWaitFor}`
  : `http://localhost:${port}/`;

console.log(
  `[Playwright Config] Waiting for: ${urlToWaitFor} (Command: ${commandToRun})`
);
/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: `http://localhost:${port}`,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],
  timeout: 60000,
  /* Run your local dev server before starting the tests */
  webServer: {
    command: commandToRun,
    url: urlToWaitFor,

    // Timeout generoso para Webpack
    timeout: 240 * 1000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
