// dinou.config.js
// Configuration and Plugins for Dinou v7
const { defineConfig } = require("dinou");

const config = defineConfig({
  plugins: [
    {
      name: "e2e-auth-and-webhook-plugin",
      async onRequest(request, context) {
        const url = new URL(request.url);

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

module.exports = config;
module.exports.default = config;
