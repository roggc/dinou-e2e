import { getContext } from "./dinou";

const EXPECTED_SECRET = "dinou_e2e_server_private_token_940";
const EXPECTED_MULTILINE =
  "-----BEGIN DINOU E2E-----\nLINE_TWO_PAYLOAD\n-----END DINOU E2E-----";

export async function getProps() {
  // Non-nullable RequestContextStore (zero optional chaining required in strict TypeScript)
  const { env, req } = getContext();

  // Verify .env.example declared key is typed on NodeJS.ProcessEnv without runtime injection
  const declaredOnlyKey: string | undefined =
    process.env.E2E_EXAMPLE_DECLARED_ONLY;

  return {
    pageFnSecretOk:
      env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET &&
      req.env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET &&
      process.env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET,
    pageFnExportedOk:
      env.E2E_ENV_EXPORTED_FLAG === "exported_single_quote_ok" &&
      process.env.E2E_ENV_EXPORTED_FLAG === "exported_single_quote_ok",
    pageFnMultilineOk: env.E2E_ENV_MULTILINE_CERT === EXPECTED_MULTILINE,
    pageFnHierarchyMode: env.E2E_ENV_HIERARCHY_MODE ?? "missing",
    pageFnDeclaredExampleUnset: declaredOnlyKey === undefined,
  };
}

