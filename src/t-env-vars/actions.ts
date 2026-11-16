"use server";

import { getContext } from "dinou/server";

const EXPECTED_SECRET = "dinou_e2e_server_private_token_940";

export async function inspectServerEnvRpc(tag: string) {
  const { env, req } = getContext();

  return {
    tag,
    secretMatchesExpected: env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET,
    reqEnvMatches: req.env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET,
    processEnvSynced: process.env.E2E_ENV_PRIVATE_SECRET === EXPECTED_SECRET,
    hierarchyMode: String(env.E2E_ENV_HIERARCHY_MODE ?? "missing"),
    liveHmrTag: String(
      env.E2E_ENV_LIVE_HMR_TAG ?? process.env.E2E_ENV_LIVE_HMR_TAG ?? "none"
    ),
    publicTitleOnServer: String(
      process.env.DINOU_PUBLIC_E2E_APP_TITLE ?? "missing"
    ),
    hasEdgeAssetsBinding: Boolean(env.ASSETS),
    edgeBindingTag: String(env.E2E_EDGE_ONLY_BINDING_TAG ?? "none"),
  };
}

