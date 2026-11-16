// dinou.config.mjs
// Configuration and Plugins for Dinou v7
import { defineConfig } from "dinou/config";
import { getContext } from "dinou/server";

export default defineConfig({
  assetExtensions: ["glb", ".gltf", "HDR"],
  plugins: [
    {
      name: "e2e-auth-and-webhook-plugin",
      async onRequest(request, context) {
        const url = new URL(request.url);

        if (url.pathname.startsWith("/t-env-vars")) {
          const alsCtx = getContext();
          context.envPluginProbe = {
            hasContextEnv: Boolean(context?.env),
            hasAlsEnv: Boolean(alsCtx?.env),
            alsMatchesPluginEnv: Boolean(
              context?.env?.E2E_ENV_PRIVATE_SECRET &&
                alsCtx?.env?.E2E_ENV_PRIVATE_SECRET ===
                  context.env.E2E_ENV_PRIVATE_SECRET
            ),
            hierarchyFromPlugin:
              context?.env?.E2E_ENV_HIERARCHY_MODE ?? "missing",
          };
        }

        // 1. Webhook endpoint: Intercepts request and responds directly without React/RSC
        if (url.pathname === "/api/webhook") {
          return Response.json({
            status: "success",
            source: "dinou-plugin-webhook",
            method: request.method,
            timestamp: 123456789,
          });
        }

        // 2. Protected middleware route: Returns 401 if missing valid token
        if (url.pathname === "/api/protected") {
          const auth = request.headers.get("authorization");
          if (auth !== "Bearer dinou-secret-token") {
            return Response.json(
              { error: "Unauthorized by Dinou Plugin" },
              { status: 401 }
            );
          }
          return Response.json({
            status: "authorized",
            user: "admin",
          });
        }

        // 3. Context enrichment: Attaches user authentication data to context
        // Accessible across Server Components and Server Functions via getContext()
        const customUserName = request.headers.get("x-test-user");
        if (customUserName) {
          context.user = {
            name: customUserName,
            role: "tester",
            authenticated: true,
          };
        } else {
          context.user = {
            name: "Dinou Guest",
            role: "visitor",
            authenticated: false,
          };
        }
      },
    },
  ],
});
