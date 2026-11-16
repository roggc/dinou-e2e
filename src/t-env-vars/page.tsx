import { getContext, type PageProps } from "./dinou";
import { ClientEnvInspector } from "./ClientEnvInspector";
import type { getProps } from "./page_functions";

const EXPECTED_SECRET = "dinou_e2e_server_private_token_940";
const EXPECTED_MULTILINE =
  "-----BEGIN DINOU E2E-----\nLINE_TWO_PAYLOAD\n-----END DINOU E2E-----";

export default function EnvVarsSsgPage(
  props: PageProps & Partial<Awaited<ReturnType<typeof getProps>>>
) {
  const { env, req } = getContext();
  const rscSecretOk =
    env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET &&
    req.env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET &&
    process.env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET;
  const rscExportedOk =
    env.E2E_ENV_EXPORTED_FLAG === "exported_single_quote_ok";
  const rscMultilineOk = env.E2E_ENV_MULTILINE_CERT === EXPECTED_MULTILINE;
  const rscHierarchyMode = String(env.E2E_ENV_HIERARCHY_MODE ?? "missing");
  const rscPublicTitle = String(
    process.env.DINOU_PUBLIC_E2E_APP_TITLE ?? "missing"
  );

  return (
    <main
      data-testid="t-env-vars-ssg-page"
      data-rsc-secret-ok={String(rscSecretOk)}
      data-rsc-exported-ok={String(rscExportedOk)}
      data-rsc-multiline-ok={String(rscMultilineOk)}
      data-rsc-hierarchy-mode={rscHierarchyMode}
      data-rsc-public-title={rscPublicTitle}
      data-pagefn-secret-ok={String(Boolean(props.pageFnSecretOk))}
      data-pagefn-exported-ok={String(Boolean(props.pageFnExportedOk))}
      data-pagefn-multiline-ok={String(Boolean(props.pageFnMultilineOk))}
      data-pagefn-hierarchy-mode={String(props.pageFnHierarchyMode ?? "missing")}
      data-pagefn-example-unset={String(Boolean(props.pageFnDeclaredExampleUnset))}
    >
      <h1>Dinou v9.4.0 Environment Variables SSG</h1>
      <ClientEnvInspector idPrefix="ssg" />
    </main>
  );
}
