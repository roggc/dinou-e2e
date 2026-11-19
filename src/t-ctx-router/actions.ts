"use server";

import { getContext } from "dinou/server";

export async function inspectServerFunctionContextAction() {
  const ctx = getContext();
  return {
    path: ctx.req.path,
    rawPath: ctx.req.rawPath ?? "missing",
    isRscRequest: Boolean(ctx.req.isRscRequest),
    pluginUser: ctx.user?.name ?? "missing",
  };
}
