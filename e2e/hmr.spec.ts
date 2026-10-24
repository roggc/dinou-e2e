import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const isDev = (process.env.TEST_CMD || "").includes("dev");

test.describe("HMR & Fast Refresh automated verification", () => {
  // Run tests in serial mode so they do not collide on the same files on disk
  test.describe.configure({ mode: "serial" });

  // Only runs when the active webServer is running in DEV mode
  test.skip(!isDev, "HMR tests only run against DEV server (TEST_CMD includes 'dev')");

  const projectRoot = process.cwd();
  const clientComponentPath = path.resolve(projectRoot, "src/t-hmr-test/counter.tsx");
  const serverPagePath = path.resolve(projectRoot, "src/t-hmr-test/page.tsx");

  test("Client Fast Refresh: updates component code while preserving React state and without page reload", async ({
    page,
  }) => {
    const originalClientCode = fs.readFileSync(clientComponentPath, "utf8");

    try {
      await page.goto("/t-hmr-test");

      // 1. Initial assertions
      await expect(page.locator("#hmr-client-title")).toHaveText("Client Counter Component");
      await expect(page.locator("#hmr-count-display")).toHaveText("Count: 0");

      // 2. Increment counter to prove state persistence across HMR
      await page.locator("#hmr-increment-btn").click();
      await page.locator("#hmr-increment-btn").click();
      await page.locator("#hmr-increment-btn").click();
      await expect(page.locator("#hmr-count-display")).toHaveText("Count: 3");

      // 3. Mark the window in memory (a full page reload will reset window.__dinou_hmr_did_not_reload to undefined)
      await page.evaluate(() => {
        (window as any).__dinou_hmr_did_not_reload = true;
      });

      // 4. Modify client component file on disk
      const modifiedClientCode = originalClientCode.replace(
        "Client Counter Component",
        "UPDATED Fast Refresh Title"
      );
      fs.writeFileSync(clientComponentPath, modifiedClientCode, "utf8");

      // 5. Verify the DOM updates to reflect new code
      await expect(page.locator("#hmr-client-title")).toHaveText("UPDATED Fast Refresh Title", {
        timeout: 10000,
      });

      // 6. Assert that React component state was preserved (Count: 3)
      await expect(page.locator("#hmr-count-display")).toHaveText("Count: 3");

      // 7. Assert that NO full browser page reload occurred
      const didNotReload = await page.evaluate(() => (window as any).__dinou_hmr_did_not_reload);
      expect(didNotReload).toBe(true);
    } finally {
      // Always restore original file content
      fs.writeFileSync(clientComponentPath, originalClientCode, "utf8");
    }
  });

  test("Server Component HMR: streaming RSC update without reload, even with 'use server' in documentation text", async ({
    page,
  }) => {
    const originalServerCode = fs.readFileSync(serverPagePath, "utf8");

    try {
      await page.goto("/t-hmr-test");

      // 1. Mutate client counter to verify RSC updates do not blow away client state
      await page.locator("#hmr-increment-btn").click();
      await page.locator("#hmr-increment-btn").click();
      await expect(page.locator("#hmr-count-display")).toHaveText("Count: 2");

      // 2. Mark window
      await page.evaluate(() => {
        (window as any).__dinou_hmr_server_did_not_reload = true;
      });

      // 3. Modify Server Component page on disk (preserves 'use server' in text)
      const modifiedServerCode = originalServerCode.replace(
        "Initial Server Title",
        "UPDATED Server Component Title"
      );
      fs.writeFileSync(serverPagePath, modifiedServerCode, "utf8");

      // 4. Verify Server Component heading updates via RSC streaming
      await expect(page.locator("#hmr-server-title")).toHaveText("UPDATED Server Component Title", {
        timeout: 10000,
      });

      // 5. Verify NO browser window reload occurred
      const didNotReload = await page.evaluate(() => (window as any).__dinou_hmr_server_did_not_reload);
      expect(didNotReload).toBe(true);

      // 6. Verify client component state was completely preserved
      await expect(page.locator("#hmr-count-display")).toHaveText("Count: 2");
    } finally {
      // Always restore original file content
      fs.writeFileSync(serverPagePath, originalServerCode, "utf8");
    }
  });
});
