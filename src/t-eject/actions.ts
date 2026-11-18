"use server";

import { getContext } from "dinou/server";

export async function probeEjectStatusAction(tag: string) {
  const { env } = getContext();
  return {
    tag: tag.toUpperCase(),
    buildTool: process.env.DINOU_BUILD_TOOL || "dev",
    runtime: String(
      (globalThis as { __DINOU_RUNTIME__?: string }).__DINOU_RUNTIME__ || "dev"
    ),
    hasSecret: Boolean(env.E2E_ENV_PRIVATE_SECRET),
  };
}

