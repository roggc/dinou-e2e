import { test, expect, APIRequestContext } from "@playwright/test";

async function pollUntilReady(request: APIRequestContext, maxRetries = 100) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await request.get("http://localhost:3000/__DINOU_STATUS_PLAYWRIGHT__");
      const json = await response.json();
      if (json.isReady === true) {
        return;
      }
    } catch (e) {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

test.describe("Dinou Config & Universal Plugins (onRequest & context)", () => {
  test.beforeAll(async ({ request }) => {
    await pollUntilReady(request);
  });

  test("1. Webhook Endpoint: Intercepts request and responds directly without React/RSC", async ({ request }) => {
    // GET request
    const getRes = await request.get("/api/webhook");
    expect(getRes.status()).toBe(200);
    const getJson = await getRes.json();
    expect(getJson).toEqual({
      status: "success",
      source: "dinou-plugin-webhook",
      method: "GET",
      timestamp: 123456789,
    });

    // POST request
    const postRes = await request.post("/api/webhook", {
      data: { event: "payment.succeeded" },
    });
    expect(postRes.status()).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.status).toBe("success");
    expect(postJson.method).toBe("POST");
  });

  test("2. Middleware Auth Guard: Intercepts /api/protected and denies without token", async ({ request }) => {
    // Missing token -> 401
    const deniedRes = await request.get("/api/protected");
    expect(deniedRes.status()).toBe(401);
    const deniedJson = await deniedRes.json();
    expect(deniedJson.error).toBe("Unauthorized by Dinou Plugin");

    // With invalid token -> 401
    const invalidRes = await request.get("/api/protected", {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(invalidRes.status()).toBe(401);

    // With valid token -> 200
    const allowedRes = await request.get("/api/protected", {
      headers: { authorization: "Bearer dinou-secret-token" },
    });
    expect(allowedRes.status()).toBe(200);
    const allowedJson = await allowedRes.json();
    expect(allowedJson).toEqual({
      status: "authorized",
      user: "admin",
    });
  });

  test("3. Context Enrichment (SSR): Injects default user into getContext()", async ({ page }) => {
    await page.goto("/t-plugin-context", { waitUntil: "commit" });
    await expect(page.locator("#plugin-test-page")).toBeVisible();
    await expect(page.locator("#ssr-user-name")).toHaveText("Dinou Guest");
    await expect(page.locator("#ssr-user-role")).toHaveText("visitor");
    await expect(page.locator("#ssr-user-authenticated")).toHaveText("false");
  });

  test("4. Context Enrichment (SSR): Injects customized user from headers into getContext()", async ({ request }) => {
    // Direct HTTP GET with custom header
    const res = await request.get("/t-plugin-context", {
      headers: { "x-test-user": "Carlos" },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="ssr-user-name">Carlos<');
    expect(html).toContain('id="ssr-user-role">tester<');
    expect(html).toContain('id="ssr-user-authenticated">true<');
  });

  test("5. Context Preservation (Server Function): getContext() preserves user in Server Function RPC", async ({ page }) => {
    await page.goto("/t-plugin-context", { waitUntil: "commit" });
    await expect(page.locator("#plugin-test-page")).toBeVisible();

    // Click button to invoke Server Function getPluginUser()
    const btn = page.locator("#btn-fetch-sf-user");
    await btn.click();

    // Verify Server Function returned the user from context
    await expect(page.locator("#sf-user-result")).toBeVisible();
    await expect(page.locator("#sf-user-name")).toHaveText("Dinou Guest");
    await expect(page.locator("#sf-user-role")).toHaveText("visitor");
  });
});
