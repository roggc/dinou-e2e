import { getContext } from "./dinou";

const EXPECTED_SECRET = "dinou_e2e_server_private_token_940";

export function getStaticPaths() {
  return ["ssg-prebuilt"];
}

export async function validateParams(params: { slug: string }) {
  const { env } = getContext();
  if (params.slug === "blocked-by-env-validator") {
    return false;
  }
  return env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET;
}

export async function getProps(params: { slug: string }) {
  const { env, req } = getContext();
  return {
    slugFromPageFn: params.slug,
    dynPageFnSecretOk:
      env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET &&
      req.env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET,
    dynPageFnHierarchyMode: String(env.E2E_ENV_HIERARCHY_MODE ?? "missing"),
  };
}

