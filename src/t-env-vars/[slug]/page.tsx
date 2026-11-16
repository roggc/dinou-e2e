import { getContext, type PageProps } from "./dinou";
import { ClientEnvInspector } from "../ClientEnvInspector";
import type { getProps } from "./page_functions";

const EXPECTED_SECRET = "dinou_e2e_server_private_token_940";
const EXPECTED_MULTILINE =
  "-----BEGIN DINOU E2E-----\nLINE_TWO_PAYLOAD\n-----END DINOU E2E-----";

export default function EnvVarsDynamicSlugPage(
  props: PageProps & Partial<Awaited<ReturnType<typeof getProps>>>
) {
  const ctx = getContext();
  const { env, req } = ctx;
  const pluginProbe = ctx.envPluginProbe as
    | {
        hasContextEnv?: boolean;
        hasAlsEnv?: boolean;
        alsMatchesPluginEnv?: boolean;
        hierarchyFromPlugin?: string;
      }
    | undefined;

  const dynRscSecretOk =
    env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET &&
    req.env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET &&
    process.env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET;
  const dynRscMultilineOk = env.E2E_ENV_MULTILINE_CERT === EXPECTED_MULTILINE;
  const dynRscHierarchyMode = String(env.E2E_ENV_HIERARCHY_MODE ?? "missing");
  const dynRscPublicTitle = String(
    process.env.DINOU_PUBLIC_E2E_APP_TITLE ?? "missing"
  );
  const liveHmrTag = String(
    env.E2E_ENV_LIVE_HMR_TAG ?? process.env.E2E_ENV_LIVE_HMR_TAG ?? "none"
  );

  return (
    <main
      data-testid="t-env-vars-slug-page"
      data-slug={props.params.slug}
      data-rsc-secret-ok={String(dynRscSecretOk)}
      data-rsc-multiline-ok={String(dynRscMultilineOk)}
      data-rsc-hierarchy-mode={dynRscHierarchyMode}
      data-rsc-public-title={dynRscPublicTitle}
      data-rsc-live-hmr-tag={liveHmrTag}
      data-pagefn-secret-ok={String(Boolean(props.dynPageFnSecretOk))}
      data-pagefn-hierarchy-mode={String(
        props.dynPageFnHierarchyMode ?? "missing"
      )}
      data-plugin-als-ok={String(Boolean(pluginProbe?.alsMatchesPluginEnv))}
      data-plugin-hierarchy={String(pluginProbe?.hierarchyFromPlugin ?? "ssg")}
      data-has-edge-assets={String(Boolean(env.ASSETS))}
    >
      <h1>Dinou v9.4.0 Dynamic Env Slug: {props.params.slug}</h1>
      <ClientEnvInspector idPrefix="dyn" />
    </main>
  );
}
