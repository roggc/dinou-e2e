import { cache } from "react";
import { getContext } from "dinou/server";

const EXEC_COUNTER_KEY = Symbol.for("dinou.e2e.er.react.cache.counter");

function nextInvocationId(): number {
  const next = Number((globalThis as any)[EXEC_COUNTER_KEY] || 0) + 1;
  (globalThis as any)[EXEC_COUNTER_KEY] = next;
  return next;
}

export const getRequestScopedViewer = cache(async (scopeKey: string) => {
  const ctx = getContext();
  const qTenant = ctx?.req?.query?.tenant;
  const hTenant = ctx?.req?.headers?.["x-tenant"];
  const tenant = String(
    Array.isArray(qTenant) ? qTenant[0] : qTenant || hTenant || "anon"
  );
  const invocationId = nextInvocationId();
  await new Promise((r) => setTimeout(r, 15));
  return {
    scopeKey,
    tenant,
    invocationId,
    token: `${tenant}:${invocationId}`,
  };
});
