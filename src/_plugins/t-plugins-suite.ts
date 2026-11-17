import type { DinouPlugin } from "dinou";

export function createE2ETPluginsSuite(versionTag = "v1"): DinouPlugin[] {
  const upstreamPlugin: DinouPlugin = {
    name: "e2e-t-plugins-upstream",
    async onRequest(_request, context) {
      if (!context.req.path.startsWith("/t-plugins")) {
        return;
      }
      context.res.setHeader("x-t-plugins-upstream", `upstream-${versionTag}`);
      context.res.cookie("t_plugins_upstream", versionTag, {
        path: "/t-plugins",
      });
    },
  };

  const mainGuardPlugin: DinouPlugin = {
    name: "e2e-t-plugins-guard",
    setupFiles: ["@/_plugins/plugin-setup"],
    configureServer({ use }) {
      // 1. Callback-async Connect/Express-style middleware (tests non-Promise next() & next(err))
      use((req, res, next) => {
        const rawUrl = req.url || "";
        if (rawUrl.startsWith("/t-plugins-node-healthz")) {
          res.writeHead(200, {
            "content-type": "text/plain; charset=utf-8",
            "x-node-mw-mode": "direct",
          });
          res.end(`NODE_HEALTH_OK_${versionTag}`);
          return;
        }
        if (rawUrl.startsWith("/t-plugins-node-next-err")) {
          setTimeout(() => {
            next(new Error(`node-mw-next-error-${versionTag}`));
          }, 2);
          return;
        }
        if (
          rawUrl.startsWith("/t-plugins") ||
          rawUrl.includes("/t-plugins")
        ) {
          setTimeout(() => {
            res.setHeader("x-node-callback-async", `cb-${versionTag}`);
            next();
          }, 2);
          return;
        }
        next();
      });

      // 2. Async Promise middleware
      use(async (req, res, next) => {
        const rawUrl = req.url || "";
        if (
          rawUrl.startsWith("/t-plugins") ||
          rawUrl.includes("/t-plugins")
        ) {
          await Promise.resolve();
          res.setHeader("x-node-promise-async", `prom-${versionTag}`);
        }
        next();
      });
    },
    async onRequest(request, context) {
      const g = globalThis as Record<string, unknown>;
      if (context.platformContext?.isSSG) {
        g.__E2E_PLUGINS_SSG_INVOKED__ = true;
      }

      // Attach setup telemetry for Server Actions invoked from /t-plugins
      context.pluginsSuiteVersion = versionTag;

      if (!context.req.path.startsWith("/t-plugins")) {
        return;
      }

      context.res.setHeader("x-t-plugins-version", versionTag);

      if (context.req.path === "/t-plugins/api/ping") {
        context.res.cookie("t_plugins_ping", "pong", {
          path: "/t-plugins",
          httpOnly: true,
        });
        return Response.json({
          ok: true,
          version: versionTag,
          logicalPath: context.req.path,
          rawPath: context.req.rawPath || context.req.path,
          isRscRequest: Boolean(context.req.isRscRequest),
          setupLog: Array.isArray(g.__E2E_PLUGINS_SETUP_LOG__)
            ? g.__E2E_PLUGINS_SETUP_LOG__
            : [],
          userSetupTag: String(g.__E2E_USER_SETUP_TAG__ || "missing"),
          ssgHookInvoked: Boolean(g.__E2E_PLUGINS_SSG_INVOKED__),
        });
      }

      if (context.req.path === "/t-plugins/res-redirect") {
        context.res.cookie("t_plugins_res_redir", "1", {
          path: "/t-plugins",
        });
        context.res.redirect("/t-plugins/login?via=res-redirect");
        return;
      }

      if (context.req.path === "/t-plugins/teapot") {
        context.res.status(418);
        context.res.setHeader("Cache-Control", "private, max-age=77");
        context.res.cookie("t_plugins_teapot", "brewed", {
          path: "/t-plugins",
        });
        return;
      }

      if (context.req.path === "/t-plugins/ppr-probe") {
        context.res.status(202);
        context.res.setHeader("Cache-Control", "private, max-age=33");
        context.res.cookie("t_plugins_ppr", "streamed", {
          path: "/t-plugins",
        });
        context.pprPluginTag = `ppr-ctx-${versionTag}`;
        return;
      }

      if (context.req.path.startsWith("/t-plugins/dashboard")) {
        if (context.req.cookies.t_plugins_auth !== "granted") {
          context.res.cookie("t_plugins_flash", "auth-required", {
            path: "/t-plugins",
          });
          return Response.redirect(
            new URL(
              `/t-plugins/login?from=${encodeURIComponent(context.req.path)}`,
              request.url
            ),
            302
          );
        }
        context.pluginAuthUser = {
          id: "ada-940",
          name: "Ada Lovelace",
          version: versionTag,
          logicalPath: context.req.path,
          isRscRequest: Boolean(context.req.isRscRequest),
        };
      }
    },
  };

  return [upstreamPlugin, mainGuardPlugin];
}

